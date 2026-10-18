// ============================================================================
// ZERO-CLICK GESTURE NAVIGATOR & OVERHEAD CROWN PORTAL SWITCHER
// Allows hands-free instrument switching via overhead dwell and wrist gestures
// ============================================================================

import * as THREE from 'three';
import type { InstrumentId, PortalHoverState } from '../types/atelier';

const ORDERED_INSTRUMENTS: InstrumentId[] = [
  'theremin',
  'cristal',
  'handpan',
  'martenot',
  'laserharp',
];

export class GestureNavigator {
  private activeInstrument: InstrumentId = 'theremin';
  private onInstrumentChange?: (id: InstrumentId) => void;

  // Dwell state
  private hoveredIndex: number | null = null;
  private dwellTime = 0;
  private readonly targetDwellTime = 0.75; // 750ms dwell to switch

  // Wrist-cross state
  private wristCrossTime = 0;
  private readonly wristCrossThreshold = 0.12; // 12cm distance
  private readonly targetWristCrossTime = 0.65;
  private lastSwitchTime = 0;
  private readonly switchCooldown = 1.2; // 1.2s cooldown between switches

  // Swipe detection
  private lastSwipeTime = 0;

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

  public update(
    time: number,
    dt: number,
    hasLeft: boolean,
    hasRight: boolean,
    leftLandmarks: THREE.Vector3[] | null,
    rightLandmarks: THREE.Vector3[] | null,
    leftScreenPos: { x: number; y: number } | null,
    rightScreenPos: { x: number; y: number } | null,
    rightVelocity?: THREE.Vector3,
    leftVelocity?: THREE.Vector3
  ): PortalHoverState {
    // 1. Check Two-Hand Wrist-Cross Quick Cycle
    if (hasLeft && hasRight && leftLandmarks && rightLandmarks) {
      const leftWrist = leftLandmarks[0];
      const rightWrist = rightLandmarks[0];
      const dist = leftWrist.distanceTo(rightWrist);

      // Wrists close together in upper half of stage
      if (dist < this.wristCrossThreshold && (leftWrist.y > 0.10 || rightWrist.y > 0.10)) {
        this.wristCrossTime += dt;
        if (this.wristCrossTime >= this.targetWristCrossTime && (time - this.lastSwitchTime) > this.switchCooldown) {
          this.cycleNext();
          this.lastSwitchTime = time;
          this.wristCrossTime = 0;
        }
      } else {
        this.wristCrossTime = Math.max(0, this.wristCrossTime - dt * 2);
      }
    } else {
      this.wristCrossTime = 0;
    }

    // 2. Check Overhead Crown Portal Zone (y_norm < 0.18, x_norm in [0.15, 0.85])
    let portalCandidatePos: { x: number; y: number } | null = null;
    let candidateVelocity: THREE.Vector3 | undefined = undefined;

    if (rightScreenPos && rightScreenPos.y < 0.18 && rightScreenPos.x >= 0.15 && rightScreenPos.x <= 0.85) {
      portalCandidatePos = rightScreenPos;
      candidateVelocity = rightVelocity;
    } else if (leftScreenPos && leftScreenPos.y < 0.18 && leftScreenPos.x >= 0.15 && leftScreenPos.x <= 0.85) {
      portalCandidatePos = leftScreenPos;
      candidateVelocity = leftVelocity;
    }

    // 3. Horizontal Air-Swipe while in portal zone
    if (portalCandidatePos && candidateVelocity && (time - this.lastSwipeTime) > 0.8) {
      if (candidateVelocity.x > 0.58) {
        this.cycleNext();
        this.lastSwipeTime = time;
        this.lastSwitchTime = time;
      } else if (candidateVelocity.x < -0.58) {
        this.cyclePrev();
        this.lastSwipeTime = time;
        this.lastSwitchTime = time;
      }
    }

    // 4. Crown Portal Dwell Selection
    if (portalCandidatePos) {
      const normX = Math.max(0, Math.min(1, (portalCandidatePos.x - 0.15) / 0.70));
      const targetIndex = Math.min(4, Math.floor(normX * 5));
      const targetInst = ORDERED_INSTRUMENTS[targetIndex];

      if (this.hoveredIndex === targetIndex) {
        this.dwellTime += dt;
      } else {
        this.hoveredIndex = targetIndex;
        this.dwellTime = 0;
      }

      const progress = Math.min(1.0, this.dwellTime / this.targetDwellTime);

      this.portalState.isActive = true;
      this.portalState.targetInstrument = targetInst;
      this.portalState.progress = progress;
      this.portalState.screenX = portalCandidatePos.x;
      this.portalState.screenY = portalCandidatePos.y;

      if (progress >= 1.0 && (time - this.lastSwitchTime) > this.switchCooldown) {
        this.setInstrument(targetInst);
        this.lastSwitchTime = time;
        this.dwellTime = 0;
      }
    } else {
      this.hoveredIndex = null;
      this.dwellTime = Math.max(0, this.dwellTime - dt * 3);
      this.portalState.isActive = false;
      this.portalState.targetInstrument = null;
      this.portalState.progress = 0;
    }

    return this.portalState;
  }
}
