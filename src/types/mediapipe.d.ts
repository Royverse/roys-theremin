// ============================================================================
// TYPE DECLARATIONS FOR MEDIAPIPE HANDS CDN RUNTIME
// Provides strict type safety without relying on `any`
// ============================================================================

export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface HandednessClassification {
  index: number;
  score: number;
  label: 'Left' | 'Right';
  displayName?: string;
}

export interface MediaPipeHandsResults {
  image: HTMLVideoElement | HTMLCanvasElement | ImageBitmap;
  multiHandLandmarks?: NormalizedLandmark[][];
  multiHandWorldLandmarks?: NormalizedLandmark[][];
  multiHandedness?: HandednessClassification[];
}

export interface MediaPipeHandsOptions {
  maxNumHands?: number;
  modelComplexity?: 0 | 1;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
  selfieMode?: boolean;
}

export interface MediaPipeHandsConfig {
  locateFile?: (file: string, prefix?: string) => string;
}

export interface MediaPipeHandsInstance {
  setOptions(options: MediaPipeHandsOptions): void;
  onResults(callback: (results: MediaPipeHandsResults) => void): void;
  send(input: { image: HTMLVideoElement | HTMLCanvasElement }): Promise<void>;
  close(): Promise<void>;
}

export interface MediaPipeHandsConstructor {
  new (config?: MediaPipeHandsConfig): MediaPipeHandsInstance;
}

declare global {
  interface Window {
    Hands?: MediaPipeHandsConstructor;
    webkitAudioContext?: typeof AudioContext;
  }
}
