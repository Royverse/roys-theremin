// ============================================================================
// SECOND-ORDER KINEMATIC OBSERVER (VELOCITY, ACCELERATION, RUB & STRIKE)
// Mathematical foundation for friction idiophones and ballistic percussion
// ============================================================================

import * as THREE from 'three';
import { OneEuroFilter } from './oneEuroFilter';
import type { KinematicHandState } from '../types/atelier';

export class HandKinematicObserver {
  private vxFilter = new OneEuroFilter(2.0, 0.08);
  private vyFilter = new OneEuroFilter(2.0, 0.08);
  private vzFilter = new OneEuroFilter(2.0, 0.08);

  private lastTime = 0;
  private lastPos = new THREE.Vector3();
  private lastVelocity = new THREE.Vector3();
  private smoothedAcc = new THREE.Vector3();

  private rubEnergy = 0;
  private lastStrikeTime = 0;
  private readonly strikeCooldown = 0.095; // 95ms refractory period

  private state: KinematicHandState = {
    hasHand: false,
    rawPos: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    acceleration: new THREE.Vector3(),
    rubEnergy: 0,
    isStrike: false,
    strikeVelocity: 0,
    palmNormal: new THREE.Vector3(0, 1, 0),
    wristRoll: 0,
    palmTilt: 0,
    pinchAperture: 0,
  };

  public reset(): void {
    this.vxFilter.reset();
    this.vyFilter.reset();
    this.vzFilter.reset();
    this.lastTime = 0;
    this.rubEnergy = 0;
    this.lastStrikeTime = 0;
    this.lastPos.set(0, 0, 0);
    this.lastVelocity.set(0, 0, 0);
    this.smoothedAcc.set(0, 0, 0);
    this.state.hasHand = false;
    this.state.isStrike = false;
    this.state.rubEnergy = 0;
  }

  public update(
    time: number,
    hasHand: boolean,
    landmarks3D: THREE.Vector3[] | null,
    palmScale = 0.12
  ): KinematicHandState {
    this.state.isStrike = false;
    this.state.strikeVelocity = 0;

    if (!hasHand || !landmarks3D || landmarks3D.length < 21) {
      this.state.hasHand = false;
      this.rubEnergy *= 0.90;
      this.state.rubEnergy = this.rubEnergy;
      this.state.velocity.set(0, 0, 0);
      this.state.acceleration.set(0, 0, 0);
      return this.state;
    }

    this.state.hasHand = true;
    const p0 = landmarks3D[0];  // Wrist
    const p5 = landmarks3D[5];  // Index MCP
    const p8 = landmarks3D[8];  // Index tip
    const p4 = landmarks3D[4];  // Thumb tip
    const p17 = landmarks3D[17]; // Pinky MCP

    // Use Index tip as primary tracking locus
    const currentPos = p8;
    this.state.rawPos.copy(currentPos);

    if (this.lastTime === 0) {
      this.lastTime = time;
      this.lastPos.copy(currentPos);
      return this.state;
    }

    const dt = Math.max(0.004, Math.min(0.1, time - this.lastTime));
    this.lastTime = time;

    // 1. Raw Velocity & 1€ Adaptive Smoothing
    const rawVx = (currentPos.x - this.lastPos.x) / dt;
    const rawVy = (currentPos.y - this.lastPos.y) / dt;
    const rawVz = (currentPos.z - this.lastPos.z) / dt;
    this.lastPos.copy(currentPos);

    const vx = this.vxFilter.filter(rawVx, time);
    const vy = this.vyFilter.filter(rawVy, time);
    const vz = this.vzFilter.filter(rawVz, time);
    this.state.velocity.set(vx, vy, vz);

    // 2. Instantaneous Acceleration & Smoothing (alpha = 0.35)
    const prevVy = this.lastVelocity.y;
    const rawAx = (vx - this.lastVelocity.x) / dt;
    const rawAy = (vy - this.lastVelocity.y) / dt;
    const rawAz = (vz - this.lastVelocity.z) / dt;
    this.lastVelocity.set(vx, vy, vz);

    const alphaA = 0.35;
    this.smoothedAcc.x = alphaA * rawAx + (1 - alphaA) * this.smoothedAcc.x;
    this.smoothedAcc.y = alphaA * rawAy + (1 - alphaA) * this.smoothedAcc.y;
    this.smoothedAcc.z = alphaA * rawAz + (1 - alphaA) * this.smoothedAcc.z;
    this.state.acceleration.copy(this.smoothedAcc);

    // 3. Tangential Rubbing Energy (Friction Idiophones like Cristal Baschet)
    const speed = this.state.velocity.length();
    const eTarget = Math.max(0, Math.min(1, (speed - 0.03) / 0.65));
    if (eTarget > this.rubEnergy) {
      this.rubEnergy += (eTarget - this.rubEnergy) * Math.min(1, 18.0 * dt);
    } else {
      this.rubEnergy *= Math.exp(-6.5 * dt);
    }
    this.state.rubEnergy = Math.max(0, Math.min(1, this.rubEnergy));

    // 4. Ballistic Strike Detection (Handpan & Percussion)
    // Detects either a downward/forward finger-tap rebound or a brisk downward flick
    const downSpeed = Math.max(0, -Math.min(vy, rawVy, prevVy));
    const isReboundTap = prevVy < -0.075 && (rawAy > 0.65 || vy > prevVy + 0.02);
    const isBriskFlick = rawVy < -0.24 && rawAy > 0.35;
    const canStrike = (time - this.lastStrikeTime) > this.strikeCooldown;

    if (canStrike && (isReboundTap || isBriskFlick)) {
      this.state.isStrike = true;
      this.state.strikeVelocity = Math.max(0.32, Math.min(1.0, 0.32 + downSpeed / 0.85));
      this.lastStrikeTime = time;
    }

    // 5. 3D Palm Normal & Wrist Roll / Tilt
    const u = new THREE.Vector3().subVectors(p5, p0);
    const w = new THREE.Vector3().subVectors(p17, p0);
    const normal = new THREE.Vector3().crossVectors(u, w);
    const len = normal.length();
    if (len > 0.0001) {
      normal.divideScalar(len);
      this.state.palmNormal.copy(normal);
      this.state.wristRoll = Math.max(-1, Math.min(1, normal.x));
      this.state.palmTilt = Math.max(-1, Math.min(1, normal.y));
    }

    // 6. Thumb-Index Pinch Aperture
    const pinchDist = p4.distanceTo(p8);
    const normAperture = Math.max(0, Math.min(1, (pinchDist / (palmScale || 0.12) - 0.22) / 0.78));
    this.state.pinchAperture = normAperture;

    return this.state;
  }

  public triggerManualStrike(velocity = 0.8): void {
    this.state.isStrike = true;
    this.state.strikeVelocity = velocity;
  }

  public getState(): KinematicHandState {
    return this.state;
  }
}
