// ============================================================================
// ONDES MARTENOT SYNTHESIS ENGINE (1928)
// Lyrical ribbon-wire oscillator, Touche d’intensité expression key,
// and 12-string Palme sympathetic acoustic resonator
// ============================================================================

import type { KinematicHandState, SpatialInstrumentAudio } from '../../types/atelier';

export class MartenotEngine implements SpatialInstrumentAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Sound generator nodes
  private oscOnde: OscillatorNode | null = null;
  private oscTriangle: OscillatorNode | null = null;
  private oscGainOnde: GainNode | null = null;
  private oscGainTriangle: GainNode | null = null;
  private toucheGain: GainNode | null = null;
  private formantFilter: BiquadFilterNode | null = null;

  // Palme Sympathetic Resonator (Comb/Bandpass Filters)
  private palmeInput: GainNode | null = null;
  private palmeFilters: BiquadFilterNode[] = [];
  private palmeGain: GainNode | null = null;

  public currentFreq = 261.63;
  public currentGain = 0;

  public initAudio(ctx: AudioContext, masterBus: AudioNode): void {
    this.ctx = ctx;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.95;
    this.masterGain.connect(masterBus);

    // 1. Dual Ribbon Oscillators (Pure Onde Sine + Harmonic Triangle)
    this.oscOnde = ctx.createOscillator();
    this.oscOnde.type = 'sine';
    this.oscOnde.frequency.value = this.currentFreq;

    this.oscTriangle = ctx.createOscillator();
    this.oscTriangle.type = 'triangle';
    this.oscTriangle.frequency.value = this.currentFreq;

    this.oscGainOnde = ctx.createGain();
    this.oscGainOnde.gain.value = 0.75;

    this.oscGainTriangle = ctx.createGain();
    this.oscGainTriangle.gain.value = 0.35;

    // Touche d'intensité VCA
    this.toucheGain = ctx.createGain();
    this.toucheGain.gain.value = 0.0;

    // Resonant body filter
    this.formantFilter = ctx.createBiquadFilter();
    this.formantFilter.type = 'bandpass';
    this.formantFilter.frequency.value = 850;
    this.formantFilter.Q.value = 2.4;

    this.oscOnde.connect(this.oscGainOnde);
    this.oscTriangle.connect(this.oscGainTriangle);

    this.oscGainOnde.connect(this.toucheGain);
    this.oscGainTriangle.connect(this.toucheGain);

    this.toucheGain.connect(this.formantFilter);
    this.formantFilter.connect(this.masterGain);

    // 2. Palme Sympathetic Resonator (12 chord harmonics)
    const palmePitches = [
      130.81, 164.81, 196.00, 246.94, // C3, E3, G3, B3
      261.63, 329.63, 392.00, 493.88, // C4, E4, G4, B4
      523.25, 659.25, 783.99, 987.77, // C5, E5, G5, B5
    ];

    this.palmeInput = ctx.createGain();
    this.palmeInput.gain.value = 0.45;
    this.toucheGain.connect(this.palmeInput);

    this.palmeGain = ctx.createGain();
    this.palmeGain.gain.value = 0.25;

    for (const p of palmePitches) {
      const bf = ctx.createBiquadFilter();
      bf.type = 'bandpass';
      bf.frequency.value = p;
      bf.Q.value = 28; // High Q for long sympathetic acoustic string ring
      this.palmeInput.connect(bf);
      bf.connect(this.palmeGain);
      this.palmeFilters.push(bf);
    }

    this.palmeGain.connect(this.masterGain);

    this.oscOnde.start();
    this.oscTriangle.start();
  }

  public update(
    _time: number,
    leftK: KinematicHandState,
    rightK: KinematicHandState
  ): { primaryFreq: number; primaryGain: number; noteName?: string; cents?: number } {
    if (!this.ctx || !this.oscOnde || !this.oscTriangle || !this.toucheGain) {
      return { primaryFreq: 261.63, primaryGain: 0 };
    }

    const now = this.ctx.currentTime;

    // 1. Right Hand: Ribbon Wire Frequency Mapping [-0.38m, +0.38m] -> [C3 (130.81 Hz), C6 (1046.50 Hz)]
    if (rightK.hasHand) {
      const normX = Math.max(0, Math.min(1, (rightK.rawPos.x + 0.38) / 0.76));
      // Exponential musical pitch mapping (3 octaves)
      const targetFreq = 130.81 * Math.pow(8.0, normX);
      this.currentFreq = targetFreq;

      this.oscOnde.frequency.setTargetAtTime(targetFreq, now, 0.016);
      this.oscTriangle.frequency.setTargetAtTime(targetFreq, now, 0.016);

      if (this.formantFilter) {
        this.formantFilter.frequency.setTargetAtTime(Math.min(4200, targetFreq * 2.2), now, 0.03);
      }
    }

    // 2. Left Hand: Touche d'Intensité (Expression drawer & velocity)
    let targetGain = 0;
    if (leftK.hasHand) {
      const normY = Math.max(0, Math.min(1, (leftK.rawPos.y - 0.04) / 0.36));
      const velFactor = Math.min(1.0, leftK.velocity.length() * 0.8);
      targetGain = Math.min(1.0, normY * 0.85 + velFactor * 0.35);

      // Palme string blend modulated by left hand pinch aperture
      if (this.palmeGain) {
        this.palmeGain.gain.setTargetAtTime(leftK.pinchAperture * 0.55, now, 0.05);
      }
    } else if (rightK.hasHand) {
      // Single hand fallback: right hand vertical height sets volume
      const normY = Math.max(0, Math.min(1, (rightK.rawPos.y - 0.04) / 0.36));
      targetGain = Math.min(1.0, normY * 0.85);
    }

    this.currentGain = targetGain;
    this.toucheGain.gain.setTargetAtTime(targetGain, now, 0.018);

    // Musical note detection
    const noteInfo = this.detectNote(this.currentFreq);

    return {
      primaryFreq: this.currentFreq,
      primaryGain: this.currentGain,
      noteName: noteInfo.name,
      cents: noteInfo.cents,
    };
  }

  private detectNote(freq: number): { name: string; cents: number } {
    const semitonesFromA4 = 12 * (Math.log2(freq / 440));
    const midi = Math.round(69 + semitonesFromA4);
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const name = `${noteNames[midi % 12]}${Math.floor(midi / 12) - 1}`;
    const targetFreq = 440 * Math.pow(2, (midi - 69) / 12);
    const cents = Math.round(1200 * Math.log2(freq / targetFreq));
    return { name, cents };
  }

  public mute(): void {
    if (this.ctx && this.toucheGain) {
      this.toucheGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
    }
  }

  public dispose(): void {
    try {
      this.oscOnde?.stop();
      this.oscTriangle?.stop();
      this.oscOnde?.disconnect();
      this.oscTriangle?.disconnect();
      this.toucheGain?.disconnect();
    } catch {
      // Ignore cleanup errors
    }
  }
}
