// ============================================================================
// MEDIAPIPE HAND TRACKER, 1€ FILTERING & KINEMATIC GESTURE PIPELINE (v2)
// Tracks 21 3D landmarks with velocity-adaptive 1€ smoothing, palm-normalized
// scale invariance, and monotonic 1:1 3D world projection.
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
} from '../math/spatialProjection';

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

  // Dropout grace timestamps (ms)
  private lastPitchDetectedAt = 0;
  private lastVolumeDetectedAt = 0;
  private lastSingleHandRole: 'pitch' | 'volume' = 'pitch';

  // Mouse & Touch fallback state
  private mouseFallbackActive = true;
  private isMouseDown = false;
  private isSpaceMuted = false;
  private mouseVibratoWheel = 0;

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
        minDetectionConfidence: 0.62,
        minTrackingConfidence: 0.58,
      });

      this.mediaPipeHands.onResults((results: MediaPipeHandsResults) =>
        this.onMediaPipeResults(results)
      );
      this.isMediaPipeReady = true;
      return true;
    } catch (err) {
      console.error('Failed to initialize MediaPipe Hands:', err);
      return false;
    }
  }

  private async loadMediaPipeScripts(): Promise<void> {
    const loadScript = (src: string) =>
      new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.crossOrigin = 'anonymous';
        script.onload = () => resolve();
        script.onerror = (e) => reject(e);
        document.head.appendChild(script);
      });

    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
  }

  public async startCamera(): Promise<boolean> {
    try {
      if (!this.isMediaPipeReady) {
        const ok = await this.initMediaPipe();
        if (!ok) return false;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
          frameRate: { ideal: 60 },
        },
        audio: false,
      });

      this.cameraStream = stream;
      this.videoElement.srcObject = stream;
      await this.videoElement.play();

      this.isCameraActive = true;
      this.mouseFallbackActive = false;
      this.pitchHandFilter.reset();
      this.volumeHandFilter.reset();
      this.pitchPosFilter.reset();
      this.pitchSpanFilter.reset();
      this.volumeHeightFilter.reset();

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
  /**
   * Calibrates the pitch & volume spatial zones based on current hand positions
   * or resets to ergonomic defaults if hands are not currently raised.
   */
  public calibrateSpace(): { calibrated: boolean; message: string } {
    if (
      this.isCameraActive &&
      this.gestureState.hasPitchHand &&
      this.gestureState.pitchRawScreenPos
    ) {
      const currentX = this.gestureState.pitchRawScreenPos.x;
      // Set antenna slightly to the right of current comfortable reach
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
    const nowMs = performance.now();
    const nowSec = nowMs * 0.001;

    if (ctx) {
      ctx.clearRect(0, 0, width, height);
      this.drawAntennaGuides(ctx, width, height);
    }

    const rawHands = results.multiHandLandmarks ?? [];
    const handednessList = results.multiHandedness ?? [];

    interface CandidateHand {
      mirroredLandmarks: NormalizedLandmark[];
      palmCenterX: number;
      rawLabel: 'Left' | 'Right' | undefined;
    }

    const candidates: CandidateHand[] = rawHands.map((rawLm, idx) => {
      // Mirror X coordinate so screen Left (0.0) = user's physical Left,
      // and screen Right (1.0) = user's physical Right.
      const mirroredLandmarks = rawLm.map((lm) => ({
        x: 1.0 - lm.x,
        y: lm.y,
        z: lm.z,
      }));
      const wrist = mirroredLandmarks[0];
      const middleMcp = mirroredLandmarks[9];
      const palmCenterX = (wrist.x + middleMcp.x) * 0.5;
      const rawLabel = handednessList[idx]?.label;

      return { mirroredLandmarks, palmCenterX, rawLabel };
    });

    let pitchCandidate: CandidateHand | null = null;
    let volumeCandidate: CandidateHand | null = null;

    if (candidates.length >= 2) {
      // Sort by mirrored horizontal position: Left-most = Volume, Right-most = Pitch
      candidates.sort((a, b) => a.palmCenterX - b.palmCenterX);
      volumeCandidate = candidates[0];
      pitchCandidate = candidates[candidates.length - 1];
    } else if (candidates.length === 1) {
      const c = candidates[0];
      // Hysteresis + anatomical check in the central overlap zone [0.35, 0.46]
      // Note: In un-mirrored input image, MediaPipe 'Left' label corresponds to the user's physical Right hand.
      if (c.palmCenterX >= 0.45) {
        pitchCandidate = c;
        this.lastSingleHandRole = 'pitch';
      } else if (c.palmCenterX <= 0.34) {
        volumeCandidate = c;
        this.lastSingleHandRole = 'volume';
      } else if (c.rawLabel === 'Left') {
        pitchCandidate = c;
        this.lastSingleHandRole = 'pitch';
      } else if (c.rawLabel === 'Right') {
        volumeCandidate = c;
        this.lastSingleHandRole = 'volume';
      } else if (this.lastSingleHandRole === 'pitch') {
        pitchCandidate = c;
      } else {
        volumeCandidate = c;
      }
    }

    // 1. Process Pitch Hand (Right)
    if (pitchCandidate) {
      this.lastPitchDetectedAt = nowMs;
      const smoothedLm = this.pitchHandFilter.filterLandmarks(
        pitchCandidate.mirroredLandmarks,
        nowSec
      );
      const landmarks3D = projectHandLandmarksTo3D(smoothedLm);
      const kin = computePitchKinematics(smoothedLm, landmarks3D, this.calibration);

      this.gestureState.hasPitchHand = true;
      this.gestureState.pitchPos = this.pitchPosFilter.filter(kin.pitchPos, nowSec);
      this.gestureState.pitchSpan = this.pitchSpanFilter.filter(kin.pitchSpan, nowSec);
      this.gestureState.pitchWorldPos = kin.handWorldPos;
      this.gestureState.pitchAntennaPoint = kin.antennaClosestPoint;
      this.gestureState.pitchLandmarks3D = landmarks3D;
      this.gestureState.pitchRawScreenPos = kin.rawScreenPos;

      if (ctx) {
        this.drawHandSkeleton(ctx, smoothedLm, width, height, '#e2e8f0', '#38bdf8', 'PITCH', true);
      }
    } else if (nowMs - this.lastPitchDetectedAt > DROPOUT_GRACE_MS) {
      this.gestureState.hasPitchHand = false;
      this.gestureState.pitchLandmarks3D = null;
      this.pitchHandFilter.reset();
    }

    // 2. Process Volume Hand (Left)
    if (volumeCandidate) {
      this.lastVolumeDetectedAt = nowMs;
      const smoothedLm = this.volumeHandFilter.filterLandmarks(
        volumeCandidate.mirroredLandmarks,
        nowSec
      );
      const landmarks3D = projectHandLandmarksTo3D(smoothedLm);
      const kin = computeVolumeKinematics(smoothedLm, landmarks3D, this.calibration);

      this.gestureState.hasVolumeHand = true;
      this.gestureState.volumeHeight = this.volumeHeightFilter.filter(kin.volumeHeight, nowSec);
      this.gestureState.isFistMuted = kin.isFistMuted || this.isSpaceMuted;
      this.gestureState.volumeWorldPos = kin.handWorldPos;
      this.gestureState.volumeLoopPoint = kin.loopClosestPoint;
      this.gestureState.volumeLandmarks3D = landmarks3D;
      this.gestureState.volumeRawScreenPos = kin.rawScreenPos;

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
      // Single-Hand Expressive Assist:
      // If the user only raises their Right (Pitch) Hand, automatically derive a natural
      // expressive volume from the right hand's vertical elevation & openness so one-handed
      // playing works out of the box without silence!
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
      } else {
        this.gestureState.hasVolumeHand = false;
        this.gestureState.volumeHeight = 0.0;
        this.gestureState.volumeLandmarks3D = null;
        this.volumeHandFilter.reset();
      }
    }

    // Update active input mode telemetry
    if (pitchCandidate && volumeCandidate) {
      this.gestureState.inputMode = 'camera-dual';
    } else {
      this.gestureState.inputMode = 'camera-single';
    }
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
    ctx.setLineDash([2, 3]);

    // Right Pitch Rod guide line
    const rodX = this.calibration.pitchAntennaX * width;
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.28)';
    ctx.beginPath();
    ctx.moveTo(rodX, height * 0.12);
    ctx.lineTo(rodX, height * 0.85);
    ctx.stroke();

    // Left Volume Loop horizontal guide line
    const loopY = this.calibration.volumeLoopY * height;
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.28)';
    ctx.beginPath();
    ctx.moveTo(width * 0.06, loopY);
    ctx.lineTo(width * 0.42, loopY);
    ctx.stroke();

    ctx.restore();
  }

  private drawHandSkeleton(
    ctx: CanvasRenderingContext2D,
    landmarks: NormalizedLandmark[],
    width: number,
    height: number,
    primaryColor: string,
    secondaryColor: string,
    label: string,
    isPitch: boolean
  ): void {
    ctx.save();

    // 1. Whisper-thin skeletal bones
    ctx.lineWidth = 1.25;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 4;
    ctx.shadowColor = primaryColor;

    for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
      const p1 = landmarks[startIdx];
      const p2 = landmarks[endIdx];

      const grad = ctx.createLinearGradient(
        p1.x * width,
        p1.y * height,
        p2.x * width,
        p2.y * height
      );
      grad.addColorStop(0, primaryColor);
      grad.addColorStop(1, secondaryColor);
      ctx.strokeStyle = grad;

      ctx.beginPath();
      ctx.moveTo(p1.x * width, p1.y * height);
      ctx.lineTo(p2.x * width, p2.y * height);
      ctx.stroke();
    }

    // 2. Thumb-to-index aerial vibrato line for Pitch hand
    if (isPitch) {
      const thumb = landmarks[4];
      const index = landmarks[8];
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.beginPath();
      ctx.moveTo(thumb.x * width, thumb.y * height);
      ctx.lineTo(index.x * width, index.y * height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 3. Delicate micro-joint nodes
    ctx.shadowBlur = 0;
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      const px = lm.x * width;
      const py = lm.y * height;
      const isTip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
      const isKey = i === 0 || i === 4 || i === 8;

      ctx.beginPath();
      ctx.arc(px, py, isKey ? 3.2 : isTip ? 2.3 : 1.6, 0, Math.PI * 2);
      ctx.fillStyle = isTip ? '#ffffff' : primaryColor;
      ctx.fill();

      if (isKey) {
        ctx.beginPath();
        ctx.arc(px, py, 5.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
    }

    // 4. Micro label
    const wrist = landmarks[0];
    ctx.font = '600 8px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.fillText(label, wrist.x * width - 14, Math.min(height - 4, wrist.y * height + 14));

    ctx.restore();
  }

  // --------------------------------------------------------------------------
  // SIMULTANEOUS 2D MOUSE & TOUCH FALLBACK MODE (1:1 MONOTONIC)
  // --------------------------------------------------------------------------
  private updateFromPointer(clientX: number, clientY: number): void {
    if (!this.mouseFallbackActive) return;

    const normX = Math.max(0.0, Math.min(1.0, clientX / window.innerWidth));
    const normY = Math.max(0.0, Math.min(1.0, clientY / window.innerHeight));
    const nowSec = performance.now() * 0.001;

    this.gestureState.inputMode = 'mouse';
    this.gestureState.hasPitchHand = true;
    this.gestureState.hasVolumeHand = true;
    this.gestureState.pitchLandmarks3D = null;
    this.gestureState.volumeLandmarks3D = null;

    // 1. Pitch mapped monotonically from horizontal cursor position X:
    // Moving left (normX -> 0) lowers pitch and moves 3D probe left;
    // Moving right (normX -> 1) raises pitch and moves 3D probe right!
    const rawPitchPos = Math.max(0.0, Math.min(1.0, (normX - 0.12) / 0.76));
    this.gestureState.pitchPos = this.pitchPosFilter.filter(rawPitchPos, nowSec);
    this.gestureState.pitchSpan = this.pitchSpanFilter.filter(this.mouseVibratoWheel, nowSec);

    // 2. Volume mapped monotonically from vertical cursor position Y:
    // Moving up (normY -> 0.15) raises volume; moving down (normY -> 0.85) mutes.
    const rawVolHeight = Math.max(0.0, Math.min(1.0, (0.84 - normY) / 0.68));
    this.gestureState.volumeHeight = this.volumeHeightFilter.filter(rawVolHeight, nowSec);
    this.gestureState.isFistMuted = this.isMouseDown || this.isSpaceMuted;

    // 3. Strictly monotonic 3D World Coordinates for Pitch & Volume Probes
    // Pitch probe moves horizontally across the right playing field [-0.05m, +0.42m]
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

    // Volume probe moves vertically above the left volume loop
    const volWorldX = WORLD_SPACE.VOLUME_LOOP_X + (normX - 0.5) * 0.08;
    const volWorldY = WORLD_SPACE.VOLUME_LOOP_Y + this.gestureState.volumeHeight * 0.34;
    this.gestureState.volumeWorldPos = new THREE.Vector3(volWorldX, volWorldY, 0.05);
    this.gestureState.volumeLoopPoint = new THREE.Vector3(
      WORLD_SPACE.VOLUME_LOOP_X,
      WORLD_SPACE.VOLUME_LOOP_Y,
      0.0
    );
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
      // Ignore clicks on UI buttons
      if ((e.target as HTMLElement | null)?.closest('button, .sculptural-console, .modal-card')) {
        return;
      }
      this.isMouseDown = true;
      this.gestureState.isFistMuted = true;
    });

    window.addEventListener('mouseup', () => {
      if (!this.mouseFallbackActive) return;
      this.isMouseDown = false;
      this.gestureState.isFistMuted = this.isSpaceMuted;
    });

    // Mouse wheel adjusts aerial finger span vibrato in mouse mode
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

    // Spacebar staccato mute in any mode
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
