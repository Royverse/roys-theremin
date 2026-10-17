// ============================================================================
// 1€ FILTER (ONE-EURO ADAPTIVE VELOCITY LOW-PASS FILTER)
// Reference: Casiez, Roussel, Vogel (CHI 2012)
// Eliminates webcam landmark jitter at rest while preserving zero-lag motion
// ============================================================================

import type { NormalizedLandmark } from '../types/mediapipe';

class LowPassFilter {
  private y: number | null = null;
  private s: number | null = null;

  public filter(value: number, alpha: number): number {
    if (this.y === null || this.s === null) {
      this.s = value;
      this.y = value;
      return value;
    }
    this.s = alpha * value + (1.0 - alpha) * this.s;
    this.y = value;
    return this.s;
  }

  public hasLastRawValue(): boolean {
    return this.y !== null;
  }

  public lastRawValue(): number {
    return this.y ?? 0;
  }

  public lastFilteredValue(): number {
    return this.s ?? 0;
  }

  public reset(): void {
    this.y = null;
    this.s = null;
  }
}

export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xFilter = new LowPassFilter();
  private dxFilter = new LowPassFilter();
  private lastTime: number | null = null;

  /**
   * @param minCutoff Minimum cutoff frequency in Hz (lower = less jitter at rest, e.g., 1.2)
   * @param beta Speed coefficient (higher = less lag during fast movement, e.g., 0.04)
   * @param dCutoff Derivative cutoff frequency in Hz (default 1.0)
   */
  constructor(minCutoff = 1.4, beta = 0.045, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private computeAlpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  public filter(value: number, timestampSeconds: number): number {
    if (!Number.isFinite(value)) {
      return this.xFilter.lastFilteredValue();
    }

    if (this.lastTime === null) {
      this.lastTime = timestampSeconds;
      this.dxFilter.filter(0, 1.0);
      return this.xFilter.filter(value, 1.0);
    }

    const dt = Math.max(0.001, Math.min(0.25, timestampSeconds - this.lastTime));
    this.lastTime = timestampSeconds;

    const dx = this.xFilter.hasLastRawValue()
      ? (value - this.xFilter.lastFilteredValue()) / dt
      : 0.0;

    const edx = this.dxFilter.filter(dx, this.computeAlpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);

    return this.xFilter.filter(value, this.computeAlpha(cutoff, dt));
  }

  public reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }
}

export class OneEuroHandFilter {
  private landmarkFilters: Array<{
    x: OneEuroFilter;
    y: OneEuroFilter;
    z: OneEuroFilter;
  }> = [];

  constructor(numLandmarks = 21, minCutoff = 1.6, beta = 0.06) {
    for (let i = 0; i < numLandmarks; i++) {
      this.landmarkFilters.push({
        x: new OneEuroFilter(minCutoff, beta),
        y: new OneEuroFilter(minCutoff, beta),
        z: new OneEuroFilter(minCutoff * 0.8, beta * 0.8),
      });
    }
  }

  public filterLandmarks(
    landmarks: NormalizedLandmark[],
    timestampSeconds: number
  ): NormalizedLandmark[] {
    return landmarks.map((lm, i) => {
      const f = this.landmarkFilters[i];
      if (!f) return lm;
      return {
        x: f.x.filter(lm.x, timestampSeconds),
        y: f.y.filter(lm.y, timestampSeconds),
        z: f.z.filter(lm.z || 0, timestampSeconds),
      };
    });
  }

  public reset(): void {
    for (const f of this.landmarkFilters) {
      f.x.reset();
      f.y.reset();
      f.z.reset();
    }
  }
}
