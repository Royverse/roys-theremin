// ============================================================================
// MEDIAPIPE HAND TRACKER, 1€ FILTERING & KINEMATIC GESTURE PIPELINE (v3)
// Real-time 21-landmark tracking with second-order velocity/acceleration kinematics,
// palm normal vectors, and zero-click gesture navigation for all 5 instruments.
// ============================================================================

import * as THREE from 'three';
import type {
  NormalizedLandmark,
  MediaPipeHandsInstance,
  MediaPipeHandsResults,
} from '../types/mediapipe';
import { OneEuroFilter, OneEuroHandFilter } from '../math/oneEuroFilter';
import {
  type CalibrationBounds,
  DEFAULT_CALIBRATION,
  WORLD_SPACE,
  projectHandLandmarksTo3D,
  computePitchKinematics,
  computeVolumeKinematics,
  computePalmScale,
} from '../math/spatialProjection';
import { HandKinematicObserver } from '../math/kinematicObserver';
import { GestureNavigator, isPeaceSignGesture } from './gestureNavigator';
import type { KinematicHandState, PortalHoverState, InstrumentId } from '../types/atelier';

export type TrackingInputMode = 'camera-dual' | 'camera-single' | 'mouse';

export interface HandGestureResult {
  inputMode: TrackingInputMode;

  // Pitch (Right Hand)
  hasPitchHand: boolean;
  pitchPos: number;                    // 0.0 (low bass) to 1.0 (high soprano)
  pitchSpan: number;                   // -1.0 to +1.0 (Clara Rockmore aerial finger spread)
  pitchWorldPos: THREE.Vector3 | null; // 3D control point in Three.js world space
  pitchAntennaPoint: THREE.Vector3 | null; // Nearest 3D point on vertical pitch rod
  pitchLandmarks3D: THREE.Vector3[] | null;
  pitchRawScreenPos: { x: number; y: number } | null;

  // Volume (Left Hand)
  hasVolumeHand: boolean;
  volumeHeight: number;                // 0.0 (at loop / mute) to 1.0 (full crescendo)
  isFistMuted: boolean;                // Staccato mute flag
  volumeWorldPos: THREE.Vector3 | null;// 3D palm position in Three.js world space
  volumeLoopPoint: THREE.Vector3 | null;   // Corresponding 3D point on horizontal loop
  volumeLandmarks3D: THREE.Vector3[] | null;
  volumeRawScreenPos: { x: number; y: number } | null;

  // Multi-Instrument Kinematics (v3)
  leftKinematics: KinematicHandState;
  rightKinematics: KinematicHandState;

  // Zero-Click Overhead Portal & Wrist-Cross Navigation State (v3)
  portalState: PortalHoverState;
  activeInstrument: InstrumentId;
}

const HAND_CONNECTIONS: ReadonlyArray<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

const DROPOUT_GRACE_MS = 220;

export class HandTracker {
  private videoElement: HTMLVideoElement;
  private canvasElement: HTMLCanvasElement;
  private canvasCtx: CanvasRenderingContext2D | null = null;

  private isCameraActive = false;
  private isSendingFrame = false;
  private cameraStream: MediaStream | null = null;
  private mediaPipeHands: MediaPipeHandsInstance | null = null;
  private isMediaPipeReady = false;

  // Calibration bounds
  public calibration: CalibrationBounds = { ...DEFAULT_CALIBRATION };

  // 1€ Adaptive Filters for jitter-free, zero-lag tracking
  private pitchHandFilter = new OneEuroHandFilter(21, 1.5, 0.055);
  private volumeHandFilter = new OneEuroHandFilter(21, 1.5, 0.055);
  private pitchPosFilter = new OneEuroFilter(1.3, 0.04);
  private pitchSpanFilter = new OneEuroFilter(1.8, 0.05);
  private volumeHeightFilter = new OneEuroFilter(1.6, 0.05);

  // Second-Order Kinematic Observers (v3)
  private leftKinematicObserver = new HandKinematicObserver();
  private rightKinematicObserver = new HandKinematicObserver();

  // Zero-Click Gesture Navigator (v3)
  public navigator = new GestureNavigator('theremin');

  // Dropout grace timestamps (ms)
  private lastPitchDetectedAt = 0;
  private lastVolumeDetectedAt = 0;
  private lastSingleHandRole: 'pitch' | 'volume' = 'pitch';

  // Mouse & Touch fallback state
  private mouseFallbackActive = true;
  private isMouseDown = false;
  private isSpaceMuted = false;
  private mouseVibratoWheel = 0;
  private lastPointerPos = { x: 0.5, y: 0.5 };
  private lastPointerTime = 0;

  // Current gesture state
  private gestureState: HandGestureResult = {
    inputMode: 'mouse',
    hasPitchHand: false,
    pitchPos: 0.45,
    pitchSpan: 0.0,
    pitchWorldPos: null,
    pitchAntennaPoint: null,
    pitchLandmarks3D: null,
    pitchRawScreenPos: null,

    hasVolumeHand: false,
    volumeHeight: 0.0,
    isFistMuted: false,
    volumeWorldPos: null,
    volumeLoopPoint: null,
    volumeLandmarks3D: null,
    volumeRawScreenPos: null,

    leftKinematics: this.leftKinematicObserver.getState(),
    rightKinematics: this.rightKinematicObserver.getState(),
    portalState: this.navigator.getPortalState(),
    activeInstrument: 'theremin',
  };

  constructor(video: HTMLVideoElement, overlayCanvas: HTMLCanvasElement) {
    this.videoElement = video;
    this.canvasElement = overlayCanvas;
    this.canvasCtx = overlayCanvas.getContext('2d');

    this.setupMouseAndTouchFallback();
  }

  // --------------------------------------------------------------------------
  // CAMERA & MEDIAPIPE INITIALIZATION
  // --------------------------------------------------------------------------
  public async initMediaPipe(): Promise<boolean> {
    try {
      if (!window.Hands) {
        await this.loadMediaPipeScripts();
      }

      const HandsClass = window.Hands;
      if (!HandsClass) {
        throw new Error('MediaPipe Hands constructor unavailable.');
      }

      this.mediaPipeHands = new HandsClass({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });

      this.mediaPipeHands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.55,
        minTrackingConfidence: 0.55,
      });

      this.mediaPipeHands.onResults((results: MediaPipeHandsResults) => {
        this.onMediaPipeResults(results);
      });

      this.isMediaPipeReady = true;
      return true;
    } catch (err) {
      console.error('Failed to initialize MediaPipe Hands:', err);
      return false;
    }
  }

  private loadMediaPipeScripts(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.Hands) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js';
      script.crossOrigin = 'anonymous';
      script.onload = () => resolve();
      script.onerror = (e) => reject(new Error(`Failed to load MediaPipe: ${e}`));
      document.head.appendChild(script);
    });
  }

  public async startCamera(): Promise<boolean> {
    try {
      if (!this.isMediaPipeReady) {
        const ready = await this.initMediaPipe();
        if (!ready) return false;
      }

      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
          frameRate: { ideal: 60, min: 30 },
        },
        audio: false,
      };

      this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = this.cameraStream;
      await this.videoElement.play();

      this.isCameraActive = true;
      this.mouseFallbackActive = false;
      this.pitchHandFilter.reset();
      this.volumeHandFilter.reset();
      this.pitchPosFilter.reset();
      this.pitchSpanFilter.reset();
      this.volumeHeightFilter.reset();
      this.leftKinematicObserver.reset();
      this.rightKinematicObserver.reset();

      this.scheduleNextVideoFrame();
      return true;
    } catch (err) {
      console.error('Camera access error:', err);
      return false;
    }
  }

  public stopCamera(): void {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach((track) => track.stop());
      this.cameraStream = null;
    }
    this.isCameraActive = false;
    this.mouseFallbackActive = true;
    this.gestureState.inputMode = 'mouse';
    this.gestureState.pitchLandmarks3D = null;
    this.gestureState.volumeLandmarks3D = null;

    if (this.canvasCtx) {
      this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
    }
  }

  public async toggleCamera(): Promise<boolean> {
    if (this.isCameraActive) {
      this.stopCamera();
      return false;
    }
    return this.startCamera();
  }

  public getIsCameraActive(): boolean {
    return this.isCameraActive;
  }

  private scheduleNextVideoFrame(): void {
    if (!this.isCameraActive) return;
    requestAnimationFrame(() => void this.processVideoFrame());
  }

  private async processVideoFrame(): Promise<void> {
    if (!this.isCameraActive || !this.mediaPipeHands) return;

    if (!this.isSendingFrame && this.videoElement.readyState >= 2) {
      this.isSendingFrame = true;
      try {
        await this.mediaPipeHands.send({ image: this.videoElement });
      } catch (err) {
        console.warn('Frame processing warning:', err);
      } finally {
        this.isSendingFrame = false;
      }
    }

    this.scheduleNextVideoFrame();
  }

  // --------------------------------------------------------------------------
  // ERGONOMIC CALIBRATION
  // --------------------------------------------------------------------------
  public calibrateSpace(): { calibrated: boolean; message: string } {
    if (
      this.isCameraActive &&
      this.gestureState.hasPitchHand &&
      this.gestureState.pitchRawScreenPos
    ) {
      const currentX = this.gestureState.pitchRawScreenPos.x;
      const newAntennaX = Math.max(0.64, Math.min(0.88, currentX + 0.14));
      const newMinX = Math.max(0.32, newAntennaX - 0.34);
      this.calibration.pitchAntennaX = newAntennaX;
      this.calibration.pitchMinX = newMinX;

      if (this.gestureState.hasVolumeHand && this.gestureState.volumeRawScreenPos) {
        const currentY = this.gestureState.volumeRawScreenPos.y;
        this.calibration.volumeLoopY = Math.max(0.62, Math.min(0.86, currentY + 0.18));
        this.calibration.volumeMaxY = Math.max(0.14, this.calibration.volumeLoopY - 0.50);
      }

      return {
        calibrated: true,
        message: 'Field calibrated to your arm reach',
      };
    }

    this.calibration = { ...DEFAULT_CALIBRATION };
    return {
      calibrated: false,
      message: 'Reset to standard concert field calibration',
    };
  }

  // --------------------------------------------------------------------------
  // MEDIAPIPE RESULTS PROCESSING & ROLE ASSIGNMENT
  // --------------------------------------------------------------------------
  private onMediaPipeResults(results: MediaPipeHandsResults): void {
    const width = this.canvasElement.width;
    const height = this.canvasElement.height;
    const ctx = this.canvasCtx;

    if (ctx) {
      ctx.clearRect(0, 0, width, height);
      this.drawAntennaGuides(ctx, width, height);
    }

    const nowMs = performance.now();
    const nowSec = nowMs * 0.001;
    const dt = 0.016; // nominal frame step for UI navigator

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      if (nowMs - this.lastPitchDetectedAt > DROPOUT_GRACE_MS) {
        this.gestureState.hasPitchHand = false;
        this.gestureState.pitchLandmarks3D = null;
        this.pitchHandFilter.reset();
      }
      if (nowMs - this.lastVolumeDetectedAt > DROPOUT_GRACE_MS) {
        this.gestureState.hasVolumeHand = false;
        this.gestureState.volumeLandmarks3D = null;
        this.volumeHandFilter.reset();
      }

      this.gestureState.leftKinematics = this.leftKinematicObserver.update(nowSec, false, null);
      this.gestureState.rightKinematics = this.rightKinematicObserver.update(nowSec, false, null);
      this.gestureState.portalState = this.navigator.update(dt, null, null);
      this.gestureState.activeInstrument = this.navigator.getActiveInstrument();
      return;
    }

    // Process detected hands
    const detectedHands: Array<{
      mirroredLandmarks: NormalizedLandmark[];
      rawScreenX: number;
      rawScreenY: number;
      label: 'Left' | 'Right';
    }> = [];

    for (let h = 0; h < results.multiHandLandmarks.length; h++) {
      const rawLm = results.multiHandLandmarks[h];
      const handedness = results.multiHandedness?.[h]?.label ?? (h === 0 ? 'Right' : 'Left');

      const mirroredLandmarks: NormalizedLandmark[] = rawLm.map((lm) => ({
        x: 1.0 - lm.x,
        y: lm.y,
        z: lm.z,
      }));

      const palmX = (mirroredLandmarks[0].x + mirroredLandmarks[9].x) * 0.5;
      const palmY = (mirroredLandmarks[0].y + mirroredLandmarks[9].y) * 0.5;

      const physicalRole: 'Left' | 'Right' = handedness === 'Left' ? 'Right' : 'Left';

      detectedHands.push({
        mirroredLandmarks,
        rawScreenX: palmX,
        rawScreenY: palmY,
        label: physicalRole,
      });
    }

    // Assign roles with spatial hysteresis
    let pitchCandidate: (typeof detectedHands)[0] | null = null;
    let volumeCandidate: (typeof detectedHands)[0] | null = null;

    if (detectedHands.length === 1) {
      const single = detectedHands[0];
      const isClearlyPitch = single.rawScreenX > 0.44;
      const isClearlyVolume = single.rawScreenX < 0.36;

      if (isClearlyPitch) {
        this.lastSingleHandRole = 'pitch';
      } else if (isClearlyVolume) {
        this.lastSingleHandRole = 'volume';
      }

      if (this.lastSingleHandRole === 'pitch') {
        pitchCandidate = single;
      } else {
        volumeCandidate = single;
      }
    } else {
      detectedHands.sort((a, b) => a.rawScreenX - b.rawScreenX);
      volumeCandidate = detectedHands[0];
      pitchCandidate = detectedHands[1];
    }

    let smoothedPitchLm: NormalizedLandmark[] | null = null;
    let smoothedVolumeLm: NormalizedLandmark[] | null = null;

    // 1. Process Pitch Hand (Right)
    if (pitchCandidate) {
      this.lastPitchDetectedAt = nowMs;
      const smoothedLm = this.pitchHandFilter.filterLandmarks(
        pitchCandidate.mirroredLandmarks,
        nowSec
      );
      smoothedPitchLm = smoothedLm;
      const landmarks3D = projectHandLandmarksTo3D(smoothedLm);
      const kin = computePitchKinematics(smoothedLm, landmarks3D, this.calibration);

      this.gestureState.hasPitchHand = true;
      this.gestureState.pitchPos = this.pitchPosFilter.filter(kin.pitchPos, nowSec);
      this.gestureState.pitchSpan = this.pitchSpanFilter.filter(kin.pitchSpan, nowSec);
      this.gestureState.pitchWorldPos = kin.handWorldPos;
      this.gestureState.pitchAntennaPoint = kin.antennaClosestPoint;
      this.gestureState.pitchLandmarks3D = landmarks3D;
      this.gestureState.pitchRawScreenPos = kin.rawScreenPos;

      this.gestureState.rightKinematics = this.rightKinematicObserver.update(
        nowSec,
        true,
        landmarks3D,
        computePalmScale(smoothedLm)
      );

      if (ctx) {
        this.drawHandSkeleton(
          ctx,
          smoothedLm,
          width,
          height,
          '#dbeafe',
          '#38bdf8',
          'PITCH',
          true
        );
      }
    } else if (nowMs - this.lastPitchDetectedAt > DROPOUT_GRACE_MS) {
      this.gestureState.hasPitchHand = false;
      this.gestureState.pitchLandmarks3D = null;
      this.pitchHandFilter.reset();
      this.gestureState.rightKinematics = this.rightKinematicObserver.update(nowSec, false, null);
    }

    // 2. Process Volume Hand (Left)
    if (volumeCandidate) {
      this.lastVolumeDetectedAt = nowMs;
      const smoothedLm = this.volumeHandFilter.filterLandmarks(
        volumeCandidate.mirroredLandmarks,
        nowSec
      );
      smoothedVolumeLm = smoothedLm;
      const landmarks3D = projectHandLandmarksTo3D(smoothedLm);
      const kin = computeVolumeKinematics(smoothedLm, landmarks3D, this.calibration);

      this.gestureState.hasVolumeHand = true;
      this.gestureState.volumeHeight = this.volumeHeightFilter.filter(kin.volumeHeight, nowSec);
      this.gestureState.isFistMuted = kin.isFistMuted || this.isSpaceMuted;
      this.gestureState.volumeWorldPos = kin.handWorldPos;
      this.gestureState.volumeLoopPoint = kin.loopClosestPoint;
      this.gestureState.volumeLandmarks3D = landmarks3D;
      this.gestureState.volumeRawScreenPos = kin.rawScreenPos;

      this.gestureState.leftKinematics = this.leftKinematicObserver.update(
        nowSec,
        true,
        landmarks3D,
        computePalmScale(smoothedLm)
      );

      if (ctx) {
        this.drawHandSkeleton(
          ctx,
          smoothedLm,
          width,
          height,
          kin.isFistMuted ? '#ef4444' : '#f59e0b',
          '#d97706',
          kin.isFistMuted ? 'MUTE' : 'VOL',
          false
        );
      }
    } else if (nowMs - this.lastVolumeDetectedAt > DROPOUT_GRACE_MS) {
      // Single-Hand Expressive Assist
      if (this.gestureState.hasPitchHand && pitchCandidate) {
        const smoothedPitchLm = this.pitchHandFilter.filterLandmarks(
          pitchCandidate.mirroredLandmarks,
          nowSec
        );
        const singleKin = computeVolumeKinematics(
          smoothedPitchLm,
          this.gestureState.pitchLandmarks3D ?? [],
          this.calibration
        );
        this.gestureState.hasVolumeHand = true;
        this.gestureState.volumeHeight = this.volumeHeightFilter.filter(
          Math.max(0.15, singleKin.volumeHeight * 0.85),
          nowSec
        );
        this.gestureState.isFistMuted = singleKin.isFistMuted || this.isSpaceMuted;
        this.gestureState.volumeWorldPos = new THREE.Vector3(
          WORLD_SPACE.VOLUME_LOOP_X,
          WORLD_SPACE.VOLUME_LOOP_Y + this.gestureState.volumeHeight * 0.28,
          0.04
        );
        this.gestureState.volumeLoopPoint = new THREE.Vector3(
          WORLD_SPACE.VOLUME_LOOP_X,
          WORLD_SPACE.VOLUME_LOOP_Y,
          0
        );
        this.gestureState.volumeLandmarks3D = null;
        this.gestureState.leftKinematics = this.leftKinematicObserver.update(nowSec, false, null);
      } else {
        this.gestureState.hasVolumeHand = false;
        this.gestureState.volumeHeight = 0.0;
        this.gestureState.volumeLandmarks3D = null;
        this.volumeHandFilter.reset();
        this.gestureState.leftKinematics = this.leftKinematicObserver.update(nowSec, false, null);
      }
    }

    // Update active input mode telemetry
    if (pitchCandidate && volumeCandidate) {
      this.gestureState.inputMode = 'camera-dual';
    } else {
      this.gestureState.inputMode = 'camera-single';
    }

    // Update Zero-Click Gesture Navigation (Peace Sign ✌️)
    this.gestureState.portalState = this.navigator.update(
      dt,
      smoothedVolumeLm,
      smoothedPitchLm
    );
    this.gestureState.activeInstrument = this.navigator.getActiveInstrument();
  }

  // --------------------------------------------------------------------------
  // 2D CAMERA DOCK OVERLAY RENDERING
  // --------------------------------------------------------------------------
  private drawAntennaGuides(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {
    ctx.save();
    ctx.lineWidth = 1;

    // Volume Zone Guide (Left)
    const loopNormX = 0.18;
    const loopNormY = this.calibration.volumeLoopY;
    const lx = loopNormX * width;
    const ly = loopNormY * height;

    ctx.strokeStyle = 'rgba(245, 158, 11, 0.28)';
    ctx.fillStyle = 'rgba(245, 158, 11, 0.04)';
    ctx.beginPath();
    ctx.ellipse(lx, ly, width * 0.14, height * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Pitch Zone Guide (Right)
    const antX = this.calibration.pitchAntennaX * width;
    ctx.strokeStyle = 'rgba(219, 234, 254, 0.32)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(antX, height * 0.08);
    ctx.lineTo(antX, height * 0.92);
    ctx.stroke();

    ctx.restore();
  }

  private drawHandSkeleton(
    ctx: CanvasRenderingContext2D,
    landmarks: NormalizedLandmark[],
    width: number,
    height: number,
    jointColor: string,
    boneColor: string,
    label: string,
    isPitchHand: boolean
  ): void {
    ctx.save();

    // 1. Draw Bones
    ctx.strokeStyle = boneColor;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 4;
    ctx.shadowColor = boneColor;

    for (const [i, j] of HAND_CONNECTIONS) {
      const p1 = landmarks[i];
      const p2 = landmarks[j];
      ctx.beginPath();
      ctx.moveTo(p1.x * width, p1.y * height);
      ctx.lineTo(p2.x * width, p2.y * height);
      ctx.stroke();
    }

    // 2. Draw Joints
    ctx.shadowBlur = 0;
    for (let i = 0; i < landmarks.length; i++) {
      const p = landmarks[i];
      const isTip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
      const r = isTip ? 2.8 : (i === 0 ? 3.2 : 1.8);

      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, r, 0, Math.PI * 2);
      ctx.fillStyle = isTip ? '#ffffff' : jointColor;
      ctx.fill();
    }

    // 3. Clara Rockmore Vibrato Span Indicator (Pitch hand only)
    if (isPitchHand) {
      const thumb = landmarks[4];
      const index = landmarks[8];
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(thumb.x * width, thumb.y * height);
      ctx.lineTo(index.x * width, index.y * height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 4. Role Label Badge
    const isPeace = isPeaceSignGesture(landmarks);
    const displayLabel = isPeace ? '✌ NEXT' : label;
    const badgeColor = isPeace ? '#10b981' : jointColor;

    const wrist = landmarks[0];
    const badgeX = wrist.x * width;
    const badgeY = Math.min(height - 8, wrist.y * height + 14);

    ctx.font = '600 7.5px "JetBrains Mono", monospace';
    ctx.fillStyle = badgeColor;
    ctx.textAlign = 'center';
    ctx.fillText(displayLabel, badgeX, badgeY);

    ctx.restore();
  }

  // --------------------------------------------------------------------------
  // POINTER FALLBACK (MOUSE & TOUCH)
  // --------------------------------------------------------------------------
  private updateFromPointer(clientX: number, clientY: number): void {
    if (!this.mouseFallbackActive) return;

    const normX = Math.max(0.0, Math.min(1.0, clientX / window.innerWidth));
    const normY = Math.max(0.0, Math.min(1.0, clientY / window.innerHeight));

    const nowSec = performance.now() * 0.001;
    const dt = Math.max(0.004, Math.min(0.1, nowSec - (this.lastPointerTime || nowSec)));
    this.lastPointerTime = nowSec;

    this.gestureState.inputMode = 'mouse';
    this.gestureState.hasPitchHand = true;
    this.gestureState.hasVolumeHand = true;

    // 1. Pitch mapped monotonically from X
    const rawPitchPos = Math.max(0.0, Math.min(1.0, (normX - 0.12) / 0.76));
    this.gestureState.pitchPos = this.pitchPosFilter.filter(rawPitchPos, nowSec);
    this.gestureState.pitchSpan = this.pitchSpanFilter.filter(this.mouseVibratoWheel, nowSec);

    // 2. Volume mapped monotonically from Y
    const rawVolHeight = Math.max(0.0, Math.min(1.0, (0.84 - normY) / 0.68));
    this.gestureState.volumeHeight = this.volumeHeightFilter.filter(rawVolHeight, nowSec);
    this.gestureState.isFistMuted = this.isMouseDown || this.isSpaceMuted;

    // 3. Strictly monotonic 3D World Coordinates
    const pitchWorldX = -0.05 + normX * 0.46;
    const pitchWorldY =
      WORLD_SPACE.PITCH_ROD_Y_MIN +
      (1.0 - normY) * (WORLD_SPACE.PITCH_ROD_Y_MAX - WORLD_SPACE.PITCH_ROD_Y_MIN);
    this.gestureState.pitchWorldPos = new THREE.Vector3(pitchWorldX, pitchWorldY, 0.05);
    this.gestureState.pitchAntennaPoint = new THREE.Vector3(
      WORLD_SPACE.PITCH_ROD_X,
      pitchWorldY,
      0.0
    );

    const volWorldX = WORLD_SPACE.VOLUME_LOOP_X + (normX - 0.5) * 0.08;
    const volWorldY = WORLD_SPACE.VOLUME_LOOP_Y + this.gestureState.volumeHeight * 0.34;
    this.gestureState.volumeWorldPos = new THREE.Vector3(volWorldX, volWorldY, 0.05);
    this.gestureState.volumeLoopPoint = new THREE.Vector3(
      WORLD_SPACE.VOLUME_LOOP_X,
      WORLD_SPACE.VOLUME_LOOP_Y,
      0.0
    );

    // Compute pointer velocity for gesture navigator
    const pVx = (normX - this.lastPointerPos.x) / dt;
    const pVy = (normY - this.lastPointerPos.y) / dt;
    this.lastPointerPos = { x: normX, y: normY };

    // Update navigator
    this.gestureState.portalState = this.navigator.update(dt, null, null);
    this.gestureState.activeInstrument = this.navigator.getActiveInstrument();

    // Synthesize kinematic states for multi-instrument mouse testing
    const rightK = this.gestureState.rightKinematics;
    rightK.hasHand = true;
    rightK.rawPos.set(pitchWorldX, pitchWorldY, 0.05);
    rightK.velocity.set(pVx, pVy, 0);
    rightK.rubEnergy = Math.max(0, Math.min(1, Math.sqrt(pVx * pVx + pVy * pVy) * 0.8));
    rightK.pinchAperture = Math.max(0, Math.min(1, (this.mouseVibratoWheel + 1.0) * 0.5));

    const leftK = this.gestureState.leftKinematics;
    leftK.hasHand = true;
    leftK.rawPos.set(volWorldX, volWorldY, 0.05);
    leftK.velocity.set(pVx, pVy, 0);
    leftK.rubEnergy = rightK.rubEnergy;
    leftK.pinchAperture = rightK.pinchAperture;
  }

  private setupMouseAndTouchFallback(): void {
    window.addEventListener('mousemove', (e) => {
      this.updateFromPointer(e.clientX, e.clientY);
    });

    window.addEventListener(
      'touchmove',
      (e) => {
        if (!this.mouseFallbackActive || e.touches.length === 0) return;
        const t = e.touches[0];
        this.updateFromPointer(t.clientX, t.clientY);
      },
      { passive: true }
    );

    window.addEventListener('mousedown', (e) => {
      if (!this.mouseFallbackActive) return;
      if ((e.target as HTMLElement | null)?.closest('button, .sculptural-console, .modal-card')) {
        return;
      }
      this.isMouseDown = true;
      this.gestureState.isFistMuted = true;
      // In mouse mode, clicking acts as a percussive strike for Handpan
      this.rightKinematicObserver.triggerManualStrike(0.85);
      this.leftKinematicObserver.triggerManualStrike(0.85);
      this.gestureState.rightKinematics.isStrike = true;
      this.gestureState.rightKinematics.strikeVelocity = 0.85;
      this.gestureState.leftKinematics.isStrike = true;
      this.gestureState.leftKinematics.strikeVelocity = 0.85;
    });

    window.addEventListener('mouseup', () => {
      if (!this.mouseFallbackActive) return;
      this.isMouseDown = false;
      this.gestureState.isFistMuted = this.isSpaceMuted;
    });

    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.mouseFallbackActive) return;
        this.mouseVibratoWheel = Math.max(
          -1.0,
          Math.min(1.0, this.mouseVibratoWheel - Math.sign(e.deltaY) * 0.12)
        );
        this.gestureState.pitchSpan = this.mouseVibratoWheel;
      },
      { passive: true }
    );

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && document.activeElement?.tagName !== 'BUTTON') {
        e.preventDefault();
        this.isSpaceMuted = true;
        this.gestureState.isFistMuted = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.isSpaceMuted = false;
        this.gestureState.isFistMuted = this.isMouseDown;
      }
    });
  }

  // --------------------------------------------------------------------------
  // GETTERS & RESIZE
  // --------------------------------------------------------------------------
  public getGestures(): HandGestureResult {
    return this.gestureState;
  }

  public resize(width: number, height: number): void {
    this.canvasElement.width = width;
    this.canvasElement.height = height;
  }
}
