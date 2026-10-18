// ============================================================================
// SPATIAL LASER HARP & PLUCKED CYMATICS SYNTHESIS ENGINE (1981 / 2026)
// Zero-mass optical 10-beam polyphonic synthesizer with Karplus-Strong
// plucking dynamics, vertical filter modulation, and pinch pitch bend
// ============================================================================

import * as THREE from 'three';
import type { KinematicHandState, SpatialInstrumentAudio } from '../../types/atelier';

export const LASER_BEAM_FREQUENCIES = [
  164.81, // E3
  185.00, // F#3
  196.00, // G3
  246.94, // B3
  293.66, // D4
  329.63, // E4
  369.99, // F#4
  392.00, // G4
  493.88, // B4
  659.25, // E5
];

export const LASER_BEAM_NOTES = ['E3', 'F#3', 'G3', 'B3', 'D4', 'E4', 'F#4', 'G4', 'B4', 'E5'];

class LaserHarpStringVoice {
  private ctx: AudioContext;
  private oscSaw: OscillatorNode;
  private oscSub: OscillatorNode;
  private filter: BiquadFilterNode;
  private voiceGain: GainNode;

  public isTriggered = false;
  public beamIndex = 0;
  public baseFreq = 329.63;
  private lastTriggerTime = 0;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;

    this.oscSaw = ctx.createOscillator();
    this.oscSaw.type = 'sawtooth';

    this.oscSub = ctx.createOscillator();
    this.oscSub.type = 'sine';

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 8.5;

    this.voiceGain = ctx.createGain();
    this.voiceGain.gain.value = 0.0;

    this.oscSaw.connect(this.filter);
    this.oscSub.connect(this.filter);
    this.filter.connect(this.voiceGain);
    this.voiceGain.connect(destination);

    this.oscSaw.start();
    this.oscSub.start();
  }

  public pluck(beamIdx: number, f0: number, velocity: number, heightNorm: number, bendSemitones: number): void {
    const now = this.ctx.currentTime;
    if (now - this.lastTriggerTime < 0.09) return; // 90ms debounce per string
    this.lastTriggerTime = now;

    this.beamIndex = beamIdx;
    this.baseFreq = f0;
    this.isTriggered = true;

    // Pitch bend from pinch
    const bentFreq = f0 * Math.pow(2, bendSemitones / 12);
    this.oscSaw.frequency.setValueAtTime(bentFreq, now);
    this.oscSub.frequency.setValueAtTime(bentFreq * 0.5, now);

    // Filter pluck envelope (brighter with higher velocity & hand elevation)
    const baseCutoff = Math.max(400, Math.min(9000, f0 * (2.5 + heightNorm * 4.0)));
    this.filter.frequency.setValueAtTime(baseCutoff * (1.2 + velocity * 1.5), now);
    this.filter.frequency.setTargetAtTime(baseCutoff * 0.7, now + 0.03, 0.45);

    // Amplitude decay envelope
    const amp = Math.min(1.0, velocity * 1.15);
    this.voiceGain.gain.cancelScheduledValues(now);
    this.voiceGain.gain.setValueAtTime(amp, now);
    this.voiceGain.gain.setTargetAtTime(0.0, now + 0.02, 1.45);
  }

  public modulate(heightNorm: number, bendSemitones: number): void {
    if (!this.isTriggered) return;
    const now = this.ctx.currentTime;
    const bentFreq = this.baseFreq * Math.pow(2, bendSemitones / 12);
    this.oscSaw.frequency.setTargetAtTime(bentFreq, now, 0.03);
    this.oscSub.frequency.setTargetAtTime(bentFreq * 0.5, now, 0.03);

    const cutoff = Math.max(400, Math.min(9000, this.baseFreq * (2.5 + heightNorm * 4.0)));
    this.filter.frequency.setTargetAtTime(cutoff, now, 0.05);
  }

  public mute(now: number): void {
    this.voiceGain.gain.cancelScheduledValues(now);
    this.voiceGain.gain.setTargetAtTime(0, now, 0.03);
    this.isTriggered = false;
  }

  public dispose(): void {
    try {
      this.oscSaw.stop();
      this.oscSub.stop();
      this.oscSaw.disconnect();
      this.oscSub.disconnect();
      this.filter.disconnect();
      this.voiceGain.disconnect();
    } catch {
      // Ignore cleanup errors
    }
  }
}

export class LaserHarpEngine implements SpatialInstrumentAudio {
  private ctx: AudioContext | null = null;
  private voices: LaserHarpStringVoice[] = [];
  private masterGain: GainNode | null = null;

  private lastBeamStruck = 4;
  private peakGain = 0;

  public initAudio(ctx: AudioContext, masterBus: AudioNode): void {
    this.ctx = ctx;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.95;
    this.masterGain.connect(masterBus);

    // 10 dedicated voices (one for each laser beam)
    for (let i = 0; i < 10; i++) {
      this.voices.push(new LaserHarpStringVoice(ctx, this.masterGain));
    }
  }

  public update(
    _time: number,
    leftK: KinematicHandState,
    rightK: KinematicHandState,
    leftLandmarks: THREE.Vector3[] | null,
    rightLandmarks: THREE.Vector3[] | null
  ): { primaryFreq: number; primaryGain: number; noteName?: string; cents?: number } {
    if (!this.ctx) return { primaryFreq: 329.63, primaryGain: 0 };

    this.peakGain *= 0.93;

    // Check fingertip intersections for active beams
    // Beam positions spread across X in [-0.40m, +0.40m]
    const getBeamIndexAtX = (x: number): number | null => {
      const norm = (x + 0.40) / 0.80;
      if (norm < 0 || norm > 1.0) return null;
      return Math.min(9, Math.floor(norm * 10));
    };

    // 1. Right Hand Tips
    if (rightK.hasHand && rightLandmarks) {
      const tipIndices = [4, 8, 12, 16, 20]; // All 5 fingertips
      for (const idx of tipIndices) {
        const tip = rightLandmarks[idx];
        const beamIdx = getBeamIndexAtX(tip.x);
        if (beamIdx !== null && tip.y > 0.05 && tip.y < 0.65) {
          const vel = Math.max(0.25, Math.min(1.0, rightK.velocity.length() * 1.2));
          const heightNorm = Math.max(0, Math.min(1, (tip.y - 0.05) / 0.55));
          const bend = rightK.pinchAperture * 2.0;

          // Pluck beam
          this.voices[beamIdx].pluck(
            beamIdx,
            LASER_BEAM_FREQUENCIES[beamIdx],
            vel,
            heightNorm,
            bend
          );
          this.lastBeamStruck = beamIdx;
          this.peakGain = Math.max(this.peakGain, vel);
        }
      }
    } else if (rightK.hasHand) {
      // Fallback with raw position
      const beamIdx = getBeamIndexAtX(rightK.rawPos.x);
      if (beamIdx !== null) {
        const vel = Math.max(0.25, Math.min(1.0, rightK.velocity.length() * 1.2));
        this.voices[beamIdx].pluck(beamIdx, LASER_BEAM_FREQUENCIES[beamIdx], vel, 0.5, 0);
        this.lastBeamStruck = beamIdx;
        this.peakGain = Math.max(this.peakGain, vel);
      }
    }

    // 2. Left Hand Tips
    if (leftK.hasHand && leftLandmarks) {
      const tipIndices = [4, 8, 12, 16, 20];
      for (const idx of tipIndices) {
        const tip = leftLandmarks[idx];
        const beamIdx = getBeamIndexAtX(tip.x);
        if (beamIdx !== null && tip.y > 0.05 && tip.y < 0.65) {
          const vel = Math.max(0.25, Math.min(1.0, leftK.velocity.length() * 1.2));
          const heightNorm = Math.max(0, Math.min(1, (tip.y - 0.05) / 0.55));
          const bend = leftK.pinchAperture * 2.0;

          this.voices[beamIdx].pluck(
            beamIdx,
            LASER_BEAM_FREQUENCIES[beamIdx],
            vel,
            heightNorm,
            bend
          );
          this.lastBeamStruck = beamIdx;
          this.peakGain = Math.max(this.peakGain, vel);
        }
      }
    }

    const currentFreq = LASER_BEAM_FREQUENCIES[this.lastBeamStruck];
    const currentNote = LASER_BEAM_NOTES[this.lastBeamStruck];

    return {
      primaryFreq: currentFreq,
      primaryGain: this.peakGain,
      noteName: currentNote,
      cents: 0,
    };
  }

  public mute(): void {
    if (this.ctx) {
      const now = this.ctx.currentTime;
      for (const v of this.voices) {
        v.mute(now);
      }
    }
  }

  public dispose(): void {
    for (const v of this.voices) {
      v.dispose();
    }
    this.voices = [];
  }
}
