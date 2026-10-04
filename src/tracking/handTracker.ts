// ============================================================================
// MEDIAPIPE HAND TRACKER & SKELETON OVERLAY RENDERER
// Tracks 21 3D hand landmarks and maps Clara Rockmore gestures to Theremin
// ============================================================================

import * as THREE from 'three';

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface HandGestureResult {
  // Pitch (Right Hand)
  hasPitchHand: boolean;
  pitchPos: number;         // 0.0 (far) to 1.0 (close)
  pitchSpan: number;        // -1.0 to 1.0 (Clara Rockmore finger spread / pinch vibrato)
  pitchWorldPos: THREE.Vector3 | null;
  pitchRawScreenPos: { x: number; y: number } | null;

  // Volume (Left Hand)
  hasVolumeHand: boolean;
  volumeHeight: number;     // 0.0 (at loop / mute) to 1.0 (raised high)
  isFistMuted: boolean;     // Staccato hard mute flag
  volumeWorldPos: THREE.Vector3 | null;
  volumeRawScreenPos: { x: number; y: number } | null;
}

// MediaPipe skeletal connections
const HAND_CONNECTIONS = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm arch
  [5, 9], [9, 13], [13, 17]
];

export class HandTracker {
  private videoElement: HTMLVideoElement;
  private canvasElement: HTMLCanvasElement;
  private canvasCtx: CanvasRenderingContext2D | null = null;

  private isCameraActive = false;
  private cameraStream: MediaStream | null = null;
  private mediaPipeHands: any = null;
  private isMediaPipeReady = false;

  // Current gesture state
  private gestureState: HandGestureResult = {
    hasPitchHand: false,
    pitchPos: 0.5,
    pitchSpan: 0.0,
    pitchWorldPos: null,
    pitchRawScreenPos: null,

    hasVolumeHand: false,
    volumeHeight: 0.5,
    isFistMuted: false,
    volumeWorldPos: null,
    volumeRawScreenPos: null,
  };

  // Calibration anchors in mirrored normalized screen space [0, 1]
  public pitchAntennaScreenX = 0.82; // Right antenna screen position
  public volumeLoopScreenY = 0.72;   // Left loop screen height position

  // Mouse fallback state
  private mouseFallbackActive = true;
  private isMouseDown = false;

  constructor(video: HTMLVideoElement, overlayCanvas: HTMLCanvasElement) {
    this.videoElement = video;
    this.canvasElement = overlayCanvas;
    this.canvasCtx = overlayCanvas.getContext('2d');

    this.setupMouseFallback();
  }

  // --------------------------------------------------------------------------
  // CAMERA & MEDIAPIPE INITIALIZATION
  // --------------------------------------------------------------------------
  public async initMediaPipe(): Promise<boolean> {
    try {
      // Check if MediaPipe script is loaded from window
      const mp = (window as any).Hands;
      if (!mp) {
        console.warn('MediaPipe Hands script not detected on window. Loading dynamically...');
        await this.loadMediaPipeScripts();
      }

      const HandsClass = (window as any).Hands;
      if (!HandsClass) {
        throw new Error('MediaPipe Hands library unavailable');
      }

      this.mediaPipeHands = new HandsClass({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });

      this.mediaPipeHands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.65,
        minTrackingConfidence: 0.60
      });

      this.mediaPipeHands.onResults((results: any) => this.onMediaPipeResults(results));
      this.isMediaPipeReady = true;
      return true;
    } catch (err) {
      console.error('Failed to initialize MediaPipe Hands:', err);
      return false;
    }
  }

  private async loadMediaPipeScripts(): Promise<void> {
    const loadScript = (src: string) => {
      return new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.crossOrigin = 'anonymous';
        s.onload = () => resolve();
        s.onerror = (e) => reject(e);
        document.head.appendChild(s);
      });
    };

    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
  }

  public async startCamera(): Promise<boolean> {
    try {
      if (!this.isMediaPipeReady) {
        await this.initMediaPipe();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: false
      });

      this.cameraStream = stream;
      this.videoElement.srcObject = stream;
      await this.videoElement.play();

      this.isCameraActive = true;
      this.mouseFallbackActive = false;

      // Start processing frames
      this.processVideoFrames();
      return true;
    } catch (err) {
      console.error('Camera access error:', err);
      return false;
    }
  }

  public stopCamera(): void {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(track => track.stop());
      this.cameraStream = null;
    }
    this.isCameraActive = false;
    this.mouseFallbackActive = true;
  }

  public toggleCamera(): Promise<boolean> {
    if (this.isCameraActive) {
      this.stopCamera();
      return Promise.resolve(false);
    } else {
      return this.startCamera();
    }
  }

  public getIsCameraActive(): boolean {
    return this.isCameraActive;
  }

  private async processVideoFrames(): Promise<void> {
    if (!this.isCameraActive || !this.mediaPipeHands) return;

    if (this.videoElement.readyState >= 2) {
      await this.mediaPipeHands.send({ image: this.videoElement });
    }

    if (this.isCameraActive) {
      requestAnimationFrame(() => this.processVideoFrames());
    }
  }

  // --------------------------------------------------------------------------
  // MEDIAPIPE RESULTS PROCESSING & GESTURE MAPPING
  // --------------------------------------------------------------------------
  private onMediaPipeResults(results: any): void {
    const width = this.canvasElement.width;
    const height = this.canvasElement.height;
    const ctx = this.canvasCtx;

    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      this.gestureState.hasPitchHand = false;
      this.gestureState.hasVolumeHand = false;
      return;
    }

    let detectedPitchHand = false;
    let detectedVolumeHand = false;

    for (let h = 0; h < results.multiHandLandmarks.length; h++) {
      const rawLandmarks: HandLandmark[] = results.multiHandLandmarks[h];
      
      // Mirror X coordinates for intuitive mirror proprioception
      const landmarks: HandLandmark[] = rawLandmarks.map(lm => ({
        x: 1.0 - lm.x, // Mirrored X
        y: lm.y,
        z: lm.z
      }));

      // In mirrored space: Screen Right (x > 0.5) is Pitch Hand; Screen Left (x <= 0.5) is Volume Hand
      const wrist = landmarks[0];
      const indexMcp = landmarks[5];
      const handCenterX = (wrist.x + indexMcp.x) * 0.5;

      const isPitchHand = handCenterX > 0.48;

      if (isPitchHand && !detectedPitchHand) {
        detectedPitchHand = true;
        this.processPitchGesture(landmarks, width, height);
        this.drawHandSkeleton(landmarks, '#e2e8f0', '#94a3b8', 'PITCH');
      } else if (!isPitchHand && !detectedVolumeHand) {
        detectedVolumeHand = true;
        this.processVolumeGesture(landmarks, width, height);
        this.drawHandSkeleton(landmarks, '#f59e0b', '#d97706', 'VOLUME');
      }
    }

    this.gestureState.hasPitchHand = detectedPitchHand;
    this.gestureState.hasVolumeHand = detectedVolumeHand;
  }

  private processPitchGesture(landmarks: HandLandmark[], width: number, height: number): void {
    const wrist = landmarks[0];
    const indexMcp = landmarks[5];
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const pinkyTip = landmarks[20];

    const handX = (wrist.x + indexMcp.x) * 0.5;
    const handY = (wrist.y + indexMcp.y) * 0.5;

    // 1. Coarse Pitch Distance: Hand distance to pitch antenna (X = pitchAntennaScreenX)
    const distToAntenna = Math.max(0.01, Math.abs(this.pitchAntennaScreenX - handX));
    // Range of effective interaction: within ~0.42 normalized screen width
    const pitchPos = Math.min(1.0, Math.max(0.0, 1.0 - distToAntenna / 0.42));

    // 2. Clara Rockmore Aerial Fingering (Pinch & Hand Aperture for fine vibrato)
    const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
    const spanDist = Math.hypot(thumbTip.x - pinkyTip.x, thumbTip.y - pinkyTip.y);
    
    // Baseline pinch is ~0.08, span is ~0.16
    const fineVibrato = Math.min(1.0, Math.max(-1.0, (pinchDist - 0.08) / 0.06 + (spanDist - 0.16) / 0.12));

    this.gestureState.pitchPos = pitchPos;
    this.gestureState.pitchSpan = fineVibrato;
    this.gestureState.pitchRawScreenPos = { x: handX * width, y: handY * height };

    // Approximate 3D World coordinates relative to theremin
    const worldX = 0.19 + (1.0 - pitchPos) * 0.30;
    const worldY = 0.065 + (1.0 - handY) * 0.45;
    const worldZ = (wrist.z || 0) * 0.5;
    this.gestureState.pitchWorldPos = new THREE.Vector3(worldX, worldY, worldZ);
  }

  private processVolumeGesture(landmarks: HandLandmark[], width: number, height: number): void {
    const wrist = landmarks[0];
    const middleMcp = landmarks[9];
    const palmX = (wrist.x + middleMcp.x) * 0.5;
    const palmY = (wrist.y + middleMcp.y) * 0.5;

    // 1. Height above loop: loop at volumeLoopScreenY (~0.72)
    // Raising hand (lower Y in screen coords) raises height
    const heightNorm = Math.min(1.0, Math.max(0.0, (this.volumeLoopScreenY - palmY) / 0.45));

    // 2. Fist / Staccato Mute Detection: Average distance of 4 fingertips to wrist
    const tipIndices = [8, 12, 16, 20];
    let avgTipDist = 0;
    for (const idx of tipIndices) {
      avgTipDist += Math.hypot(landmarks[idx].x - wrist.x, landmarks[idx].y - wrist.y);
    }
    avgTipDist /= 4;
    const isFistMuted = avgTipDist < 0.13;

    this.gestureState.volumeHeight = heightNorm;
    this.gestureState.isFistMuted = isFistMuted;
    this.gestureState.volumeRawScreenPos = { x: palmX * width, y: palmY * height };

    // Approximate 3D World coordinates relative to theremin
    const worldX = -0.36 + (palmX - 0.2) * 0.25;
    const worldY = 0.02 + heightNorm * 0.35;
    const worldZ = (wrist.z || 0) * 0.5;
    this.gestureState.volumeWorldPos = new THREE.Vector3(worldX, worldY, worldZ);
  }

  // --------------------------------------------------------------------------
  // SKELETON WIREFRAME CANVAS RENDERING
  // --------------------------------------------------------------------------
  private drawHandSkeleton(
    landmarks: HandLandmark[],
    primaryColor: string,
    secondaryColor: string,
    label: string
  ): void {
    const ctx = this.canvasCtx;
    if (!ctx) return;
    const width = this.canvasElement.width;
    const height = this.canvasElement.height;

    // 1. Draw refined, whisper-thin bones
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 4;
    ctx.shadowColor = primaryColor;

    for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
      const p1 = landmarks[startIdx];
      const p2 = landmarks[endIdx];

      const grad = ctx.createLinearGradient(
        p1.x * width, p1.y * height,
        p2.x * width, p2.y * height
      );
      grad.addColorStop(0, primaryColor);
      grad.addColorStop(1, secondaryColor);
      ctx.strokeStyle = grad;

      ctx.beginPath();
      ctx.moveTo(p1.x * width, p1.y * height);
      ctx.lineTo(p2.x * width, p2.y * height);
      ctx.stroke();
    }

    // 2. Draw delicate micro-joint nodes
    ctx.shadowBlur = 0;
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      const px = lm.x * width;
      const py = lm.y * height;
      const isTip = [4, 8, 12, 16, 20].includes(i);
      const isKey = [0, 4, 8].includes(i);

      ctx.beginPath();
      ctx.arc(px, py, isKey ? 3.5 : (isTip ? 2.5 : 1.8), 0, Math.PI * 2);
      ctx.fillStyle = isTip ? '#ffffff' : primaryColor;
      ctx.fill();

      // Delicate halo on key fingertips
      if (isKey) {
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // 3. Subtle micro typography
    const wrist = landmarks[0];
    ctx.font = '500 8px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.letterSpacing = '1px';
    ctx.fillText(label, wrist.x * width - 20, wrist.y * height + 16);
  }

  // --------------------------------------------------------------------------
  // MOUSE & TOUCH FALLBACK MODE
  // --------------------------------------------------------------------------
  private setupMouseFallback(): void {
    window.addEventListener('mousemove', (e) => {
      if (!this.mouseFallbackActive) return;
      const normX = e.clientX / window.innerWidth;
      const normY = e.clientY / window.innerHeight;

      // Screen Right = Pitch Hand
      if (normX > 0.45) {
        this.gestureState.hasPitchHand = true;
        const dist = Math.abs(this.pitchAntennaScreenX - normX);
        this.gestureState.pitchPos = Math.min(1.0, Math.max(0.0, 1.0 - dist / 0.42));
        this.gestureState.pitchSpan = (0.5 - normY) * 0.8; // Vertical motion = vibrato
        
        const worldX = 0.19 + (1.0 - this.gestureState.pitchPos) * 0.28;
        const worldY = 0.065 + (1.0 - normY) * 0.45;
        this.gestureState.pitchWorldPos = new THREE.Vector3(worldX, worldY, 0.05);
      } else {
        // Screen Left = Volume Hand
        this.gestureState.hasVolumeHand = true;
        this.gestureState.volumeHeight = Math.min(1.0, Math.max(0.0, (this.volumeLoopScreenY - normY) / 0.45));
        this.gestureState.isFistMuted = this.isMouseDown;

        const worldX = -0.36 + (normX - 0.2) * 0.25;
        const worldY = 0.02 + this.gestureState.volumeHeight * 0.35;
        this.gestureState.volumeWorldPos = new THREE.Vector3(worldX, worldY, 0.05);
      }
    });

    window.addEventListener('mousedown', () => {
      if (!this.mouseFallbackActive) return;
      this.isMouseDown = true;
      this.gestureState.isFistMuted = true;
    });

    window.addEventListener('mouseup', () => {
      if (!this.mouseFallbackActive) return;
      this.isMouseDown = false;
      this.gestureState.isFistMuted = false;
    });

    // Spacebar mute toggle
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        this.gestureState.isFistMuted = true;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.gestureState.isFistMuted = false;
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
