// ============================================================================
// SWISS HANDPAN (HANG) MODAL SYNTHESIS ENGINE (2000)
// Harmonic physical modeling of nitrided steel vessel (D Kurd 9)
// Exact PANArt overtone tuning ratios: 1.0 (fundamental), 2.0 (octave), 3.0 (compound 5th)
// ============================================================================

import type { KinematicHandState, SpatialInstrumentAudio } from '../../types/atelier';

export interface HandpanToneField {
  index: number;
  name: string;
  freq: number;
  angle: number; // Angle around center (0 for Ding)
  radius: number; // Distance from center in meters
}

export const HANDPAN_TONES: HandpanToneField[] = [
  { index: 0, name: 'D3 (Ding)', freq: 146.83, angle: 0, radius: 0.0 },
  { index: 1, name: 'A3', freq: 220.00, angle: (0 * Math.PI) / 4, radius: 0.17 },
  { index: 2, name: 'Bb3', freq: 233.08, angle: (1 * Math.PI) / 4, radius: 0.17 },
  { index: 3, name: 'C4', freq: 261.63, angle: (2 * Math.PI) / 4, radius: 0.17 },
  { index: 4, name: 'D4', freq: 293.66, angle: (3 * Math.PI) / 4, radius: 0.17 },
  { index: 5, name: 'E4', freq: 329.63, angle: (4 * Math.PI) / 4, radius: 0.17 },
  { index: 6, name: 'F4', freq: 349.23, angle: (5 * Math.PI) / 4, radius: 0.17 },
  { index: 7, name: 'G4', freq: 392.00, angle: (6 * Math.PI) / 4, radius: 0.17 },
  { index: 8, name: 'A4', freq: 440.00, angle: (7 * Math.PI) / 4, radius: 0.17 },
];

class HandpanVoice {
  private ctx: AudioContext;
  private osc1: OscillatorNode;
  private osc2: OscillatorNode;
  private osc3: OscillatorNode;
  private gain1: GainNode;
  private gain2: GainNode;
  private gain3: GainNode;
  private voiceGain: GainNode;

  public isBusy = false;
  public noteName = 'D3';
  public currentFreq = 146.83;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;

    this.osc1 = ctx.createOscillator(); // 1.0x Fundamental
    this.osc2 = ctx.createOscillator(); // 2.0x Octave
    this.osc3 = ctx.createOscillator(); // 2.998x Compound fifth

    this.osc1.type = 'sine';
    this.osc2.type = 'sine';
    this.osc3.type = 'sine';

    this.gain1 = ctx.createGain();
    this.gain2 = ctx.createGain();
    this.gain3 = ctx.createGain();

    this.gain1.gain.value = 0.8;
    this.gain2.gain.value = 0.42;
    this.gain3.gain.value = 0.25;

    this.voiceGain = ctx.createGain();
    this.voiceGain.gain.value = 0.0;

    this.osc1.connect(this.gain1);
    this.osc2.connect(this.gain2);
    this.osc3.connect(this.gain3);

    this.gain1.connect(this.voiceGain);
    this.gain2.connect(this.voiceGain);
    this.gain3.connect(this.voiceGain);

    this.voiceGain.connect(destination);

    this.osc1.start();
    this.osc2.start();
    this.osc3.start();
  }

  public strike(f0: number, velocity: number, rollBend: number, name: string): void {
    const now = this.ctx.currentTime;
    this.currentFreq = f0;
    this.noteName = name;
    this.isBusy = true;

    // Frequencies with subtle roll-induced harmonic spread
    const bend = 1.0 + rollBend * 0.015;
    this.osc1.frequency.setValueAtTime(f0, now);
    this.osc2.frequency.setValueAtTime(f0 * 2.0 * bend, now);
    this.osc3.frequency.setValueAtTime(f0 * 2.998 * bend, now);

    // Initial strike transient & exponential modal ring
    const amp = Math.min(1.0, velocity * 1.25);
    this.voiceGain.gain.cancelScheduledValues(now);
    this.voiceGain.gain.setValueAtTime(amp, now);
    this.voiceGain.gain.setTargetAtTime(0.0, now + 0.02, 1.85);

    // Auto-free voice
    setTimeout(() => {
      this.isBusy = false;
    }, 2800);
  }

  public damp(now: number): void {
    this.voiceGain.gain.cancelScheduledValues(now);
    this.voiceGain.gain.setTargetAtTime(0.0, now, 0.04);
    this.isBusy = false;
  }

  public dispose(): void {
    try {
      this.osc1.stop();
      this.osc2.stop();
      this.osc3.stop();
      this.osc1.disconnect();
      this.osc2.disconnect();
      this.osc3.disconnect();
      this.voiceGain.disconnect();
    } catch {
      // Ignore cleanup errors
    }
  }
}

export class HandpanEngine implements SpatialInstrumentAudio {
  private ctx: AudioContext | null = null;
  private voices: HandpanVoice[] = [];
  private masterGain: GainNode | null = null;
  private lastStruckNote = 'D3';
  private lastStruckFreq = 146.83;
  private peakGain = 0;

  public initAudio(ctx: AudioContext, masterBus: AudioNode): void {
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 1.0;
    this.masterGain.connect(masterBus);

    // Pool of 8 polyphonic voices
    for (let i = 0; i < 8; i++) {
      this.voices.push(new HandpanVoice(ctx, this.masterGain));
    }
  }

  private allocateVoice(): HandpanVoice {
    const freeVoice = this.voices.find((v) => !v.isBusy);
    if (freeVoice) return freeVoice;
    return this.voices[Math.floor(Math.random() * this.voices.length)];
  }

  public strikeTone(toneIndex: number, velocity: number, rollBend: number): void {
    if (!this.ctx || toneIndex < 0 || toneIndex >= HANDPAN_TONES.length) return;
    const tone = HANDPAN_TONES[toneIndex];
    const voice = this.allocateVoice();
    voice.strike(tone.freq, velocity, rollBend, tone.name);
    this.lastStruckNote = tone.name;
    this.lastStruckFreq = tone.freq;
    this.peakGain = velocity;
  }

  public update(
    _time: number,
    leftK: KinematicHandState,
    rightK: KinematicHandState
  ): { primaryFreq: number; primaryGain: number; noteName?: string; cents?: number } {
    if (!this.ctx) return { primaryFreq: 146.83, primaryGain: 0 };

    this.peakGain *= 0.94; // Decay visual meter

    // 1. Process Right Hand Strike
    if (rightK.isStrike) {
      const idx = this.mapHandToTone(rightK.rawPos.x, rightK.rawPos.y);
      this.strikeTone(idx, rightK.strikeVelocity, rightK.wristRoll);
    }

    // 2. Process Left Hand Strike
    if (leftK.isStrike) {
      const idx = this.mapHandToTone(leftK.rawPos.x, leftK.rawPos.y);
      this.strikeTone(idx, leftK.strikeVelocity, leftK.wristRoll);
    }

    return {
      primaryFreq: this.lastStruckFreq,
      primaryGain: this.peakGain,
      noteName: this.lastStruckNote,
      cents: 0,
    };
  }

  private mapHandToTone(worldX: number, worldY: number): number {
    // Dome center in Three.js coordinates is at (0, 0.10)
    const dx = worldX;
    const dy = worldY - 0.10;
    const r = Math.sqrt(dx * dx + dy * dy);

    // If within central ding radius
    if (r < 0.095) {
      return 0; // Ding (D3)
    }

    // Angle around center
    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += Math.PI * 2;

    // Map 8 tone sectors
    const sector = Math.floor((angle / (Math.PI * 2)) * 8);
    return 1 + (sector % 8);
  }

  public mute(): void {
    if (this.ctx) {
      const now = this.ctx.currentTime;
      for (const v of this.voices) {
        v.damp(now);
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
