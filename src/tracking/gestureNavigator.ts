// ============================================================================
// ZERO-CLICK GESTURE NAVIGATOR — LATCHED PEACE SIGN (✌️) SWITCHER (v3.1)
// Scale-invariant 2D hand gesture recognition that cycles between instruments
// without false triggers or infinite looping.
// ============================================================================

import type { NormalizedLandmark } from '../types/mediapipe';
import type { InstrumentId, PortalHoverState } from '../types/atelier';

export const ORDERED_INSTRUMENTS: InstrumentId[] = [
  'theremin',
  'cristal',
  'handpan',
  'martenot',
  'laserharp',
];

/**
 * Scale-invariant Peace Sign (✌️ / V-Sign) classifier.
 * Checks that Index & Middle are extended with distinct separation,
 * while Ring & Pinky remain curled into the palm.
 */
export function isPeaceSignGesture(landmarks: NormalizedLandmark[] | null | undefined): boolean {
  if (!landmarks || landmarks.length < 21) return false;

  const p0 = landmarks[0];
  const p9 = landmarks[9];
  const palmScale = Math.max(0.035, Math.hypot(p9.x - p0.x, p9.y - p0.y));

  const normDist = (i: number, j: number): number =>
    Math.hypot(landmarks[i].x - landmarks[j].x, landmarks[i].y - landmarks[j].y) / palmScale;

  // Index extended & pointing higher than PIP
  const indexExtended =
    normDist(8, 0) > 1.52 && normDist(8, 5) > 0.68 && landmarks[8].y < landmarks[6].y;

  // Middle extended & pointing higher than PIP
  const middleExtended =
    normDist(12, 0) > 1.52 && normDist(12, 9) > 0.68 && landmarks[12].y < landmarks[10].y;

  // Ring & Pinky curled toward palm
  const ringCurled = normDist(16, 0) < 1.34 || normDist(16, 13) < 0.48;
  const pinkyCurled = normDist(20, 0) < 1.32 || normDist(20, 17) < 0.48;

  // Distinct V-spread between index and middle fingertips
  const vSpread = normDist(8, 12) > 0.24;

  return indexExtended && middleExtended && ringCurled && pinkyCurled && vSpread;
}

export class GestureNavigator {
  private activeInstrument: InstrumentId = 'theremin';
  private onInstrumentChange?: (id: InstrumentId) => void;

  // Latch State Machine (Prevents any looping)
  private holdDuration = 0;
  private releaseDuration = 0;
  private isLatched = false;
  private readonly HOLD_THRESHOLD = 0.55; // 550ms hold to trigger
  private readonly RELEASE_THRESHOLD = 0.30; // 300ms neutral hand to re-arm

  private portalState: PortalHoverState = {
    isActive: false,
    targetInstrument: null,
    progress: 0,
    screenX: 0.5,
    screenY: 0,
  };

  constructor(initialInstrument: InstrumentId = 'theremin', onChange?: (id: InstrumentId) => void) {
    this.activeInstrument = initialInstrument;
    this.onInstrumentChange = onChange;
  }

  public setOnInstrumentChange(callback: (id: InstrumentId) => void): void {
    this.onInstrumentChange = callback;
  }

  public getActiveInstrument(): InstrumentId {
    return this.activeInstrument;
  }

  public getPortalState(): PortalHoverState {
    return this.portalState;
  }

  public setInstrument(id: InstrumentId): void {
    if (this.activeInstrument !== id) {
      this.activeInstrument = id;
      if (this.onInstrumentChange) {
        this.onInstrumentChange(id);
      }
    }
  }

  public cycleNext(): void {
    const idx = ORDERED_INSTRUMENTS.indexOf(this.activeInstrument);
    const nextIdx = (idx + 1) % ORDERED_INSTRUMENTS.length;
    this.setInstrument(ORDERED_INSTRUMENTS[nextIdx]);
  }

  public cyclePrev(): void {
    const idx = ORDERED_INSTRUMENTS.indexOf(this.activeInstrument);
    const prevIdx = (idx - 1 + ORDERED_INSTRUMENTS.length) % ORDERED_INSTRUMENTS.length;
    this.setInstrument(ORDERED_INSTRUMENTS[prevIdx]);
  }

  public getNextInstrument(): InstrumentId {
    const idx = ORDERED_INSTRUMENTS.indexOf(this.activeInstrument);
    const nextIdx = (idx + 1) % ORDERED_INSTRUMENTS.length;
    return ORDERED_INSTRUMENTS[nextIdx];
  }

  public update(
    dt: number,
    leftLandmarks2D: NormalizedLandmark[] | null,
    rightLandmarks2D: NormalizedLandmark[] | null
  ): PortalHoverState {
    const leftPeace = isPeaceSignGesture(leftLandmarks2D);
    const rightPeace = isPeaceSignGesture(rightLandmarks2D);
    const peaceDetected = leftPeace || rightPeace;

    const nextTarget = this.getNextInstrument();

    if (peaceDetected) {
      this.releaseDuration = 0;

      // Extract screen coordinates of the active peace hand
      const activeLm = rightPeace ? rightLandmarks2D : leftLandmarks2D;
      const screenX = activeLm ? activeLm[8].x : 0.5;
      const screenY = activeLm ? activeLm[8].y : 0.2;

      if (!this.isLatched) {
        this.holdDuration += dt;
        const progress = Math.min(1.0, this.holdDuration / this.HOLD_THRESHOLD);

        this.portalState.isActive = true;
        this.portalState.targetInstrument = nextTarget;
        this.portalState.progress = progress;
        this.portalState.screenX = screenX;
        this.portalState.screenY = screenY;

        if (progress >= 1.0) {
          this.cycleNext();
          this.isLatched = true;
          this.holdDuration = 0;
          this.portalState.progress = 0;
          this.portalState.isActive = false;
        }
      } else {
        // Already switched on this hold — stay dormant until released
        this.portalState.isActive = false;
        this.portalState.progress = 0;
      }
    } else {
      // Peace sign released
      this.holdDuration = Math.max(0, this.holdDuration - dt * 3.0);
      this.releaseDuration += dt;

      if (this.releaseDuration >= this.RELEASE_THRESHOLD) {
        this.isLatched = false; // Re-arm switcher for next gesture
      }

      this.portalState.isActive = false;
      this.portalState.targetInstrument = null;
      this.portalState.progress = 0;
    }

    return this.portalState;
  }
}
