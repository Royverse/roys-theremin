// ============================================================================
// CRISTAL BASCHET SYNTHESIS ENGINE (1952)
// Friction idiophone physical modeling with stick-slip exciter,
// modal glass bar overtones, and flame resonator shimmer
// ============================================================================

import type { KinematicHandState, SpatialInstrumentAudio } from '../../types/atelier';

export const CRISTAL_ROD_FREQUENCIES = [
  130.81, // C3
  146.83, // D3
  164.81, // E3
  185.00, // F#3
  196.00, // G3
  220.00, // A3
  246.94, // B3
  261.63, // C4
  293.66, // D4
  329.63, // E4
  369.99, // F#4
  392.00, // G4
];

const ROD_NOTES = ['C3', 'D3', 'E3', 'F#3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F#4', 'G4'];

class CristalVoice {
  private oscFund: OscillatorNode;
  private oscOctave: OscillatorNode;
  private oscChladni: OscillatorNode; // 2.756x Chladni glass bar mode
  private gainFund: GainNode;
  private gainOctave: GainNode;
  private gainChladni: GainNode;
  private voiceGain: GainNode;
  private bandpass: BiquadFilterNode;

  public currentFreq = 261.63;
  public currentGain = 0;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.oscFund = ctx.createOscillator();
    this.oscFund.type = 'sine';
    this.oscFund.frequency.value = this.currentFreq;

    this.oscOctave = ctx.createOscillator();
    this.oscOctave.type = 'sine';
    this.oscOctave.frequency.value = this.currentFreq * 2;

    this.oscChladni = ctx.createOscillator();
    this.oscChladni.type = 'sine';
    this.oscChladni.frequency.value = this.currentFreq * 2.756;

    this.gainFund = ctx.createGain();
    this.gainFund.gain.value = 0.72;

    this.gainOctave = ctx.createGain();
    this.gainOctave.gain.value = 0.22;

    this.gainChladni = ctx.createGain();
    this.gainChladni.gain.value = 0.16;

    this.bandpass = ctx.createBiquadFilter();
    this.bandpass.type = 'bandpass';
    this.bandpass.frequency.value = this.currentFreq;
    this.bandpass.Q.value = 14;

    this.voiceGain = ctx.createGain();
    this.voiceGain.gain.value = 0.0;

    this.oscFund.connect(this.gainFund);
    this.oscOctave.connect(this.gainOctave);
    this.oscChladni.connect(this.gainChladni);

    this.gainFund.connect(this.bandpass);
    this.gainOctave.connect(this.bandpass);
    this.gainChladni.connect(this.bandpass);

    this.bandpass.connect(this.voiceGain);
    this.voiceGain.connect(destination);

    this.oscFund.start();
    this.oscOctave.start();
    this.oscChladni.start();
  }

  public setParameters(targetFreq: number, excitation: number, pinch: number, now: number): void {
    this.currentFreq = targetFreq;
    this.currentGain = excitation;

    this.oscFund.frequency.setTargetAtTime(targetFreq, now, 0.04);
    this.oscOctave.frequency.setTargetAtTime(targetFreq * 2.0, now, 0.04);
    this.oscChladni.frequency.setTargetAtTime(targetFreq * 2.756, now, 0.04);
    this.bandpass.frequency.setTargetAtTime(targetFreq, now, 0.04);

    // Pinch shapes Chladni brightness
    this.gainChladni.gain.setTargetAtTime(0.08 + pinch * 0.35, now, 0.06);

    // Friction amplitude envelope with smooth 55ms attack and 1.8s release
    const targetAmp = excitation > 0.02 ? Math.min(1.0, excitation * 1.35) : 0.0;
    const tau = targetAmp > this.voiceGain.gain.value ? 0.055 : 0.65;
    this.voiceGain.gain.setTargetAtTime(targetAmp, now, tau);
  }

  public mute(now: number): void {
    this.voiceGain.gain.setTargetAtTime(0, now, 0.03);
  }

  public dispose(): void {
    try {
      this.oscFund.stop();
      this.oscOctave.stop();
      this.oscChladni.stop();
      this.oscFund.disconnect();
      this.oscOctave.disconnect();
      this.oscChladni.disconnect();
      this.voiceGain.disconnect();
    } catch {
      // Ignore disconnect errors
    }
  }
}

export class CristalEngine implements SpatialInstrumentAudio {
  private ctx: AudioContext | null = null;
  private voiceLeft: CristalVoice | null = null;
  private voiceRight: CristalVoice | null = null;
  private masterGain: GainNode | null = null;

  public initAudio(ctx: AudioContext, masterBus: AudioNode): void {
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.95;
    this.masterGain.connect(masterBus);

    this.voiceLeft = new CristalVoice(ctx, this.masterGain);
    this.voiceRight = new CristalVoice(ctx, this.masterGain);
  }

  public update(
    _time: number,
    leftK: KinematicHandState,
    rightK: KinematicHandState
  ): { primaryFreq: number; primaryGain: number; noteName?: string; cents?: number } {
    if (!this.ctx || !this.voiceLeft || !this.voiceRight) {
      return { primaryFreq: 261.63, primaryGain: 0 };
    }

    const now = this.ctx.currentTime;

    // Helper: Map world X [-0.36, 0.36] to one of 12 glass rods
    const getRodIndex = (x: number): number => {
      const norm = Math.max(0, Math.min(1, (x + 0.36) / 0.72));
      return Math.min(11, Math.floor(norm * 12));
    };

    let dominantFreq = 261.63;
    let dominantGain = 0;
    let dominantNote = 'C4';

    // 1. Right Voice (Right Hand)
    if (rightK.hasHand && rightK.rubEnergy > 0.01) {
      const idxR = getRodIndex(rightK.rawPos.x);
      const freqR = CRISTAL_ROD_FREQUENCIES[idxR];
      this.voiceRight.setParameters(freqR, rightK.rubEnergy, rightK.pinchAperture, now);
      dominantFreq = freqR;
      dominantGain = rightK.rubEnergy;
      dominantNote = ROD_NOTES[idxR];
    } else {
      this.voiceRight.setParameters(this.voiceRight.currentFreq, 0, 0, now);
    }

    // 2. Left Voice (Left Hand)
    if (leftK.hasHand && leftK.rubEnergy > 0.01) {
      const idxL = getRodIndex(leftK.rawPos.x);
      const freqL = CRISTAL_ROD_FREQUENCIES[idxL];
      this.voiceLeft.setParameters(freqL, leftK.rubEnergy, leftK.pinchAperture, now);
      if (leftK.rubEnergy > dominantGain) {
        dominantFreq = freqL;
        dominantGain = leftK.rubEnergy;
        dominantNote = ROD_NOTES[idxL];
      }
    } else {
      this.voiceLeft.setParameters(this.voiceLeft.currentFreq, 0, 0, now);
    }

    return {
      primaryFreq: dominantFreq,
      primaryGain: dominantGain,
      noteName: dominantNote,
      cents: 0,
    };
  }

  public mute(): void {
    if (this.ctx && this.voiceLeft && this.voiceRight) {
      const now = this.ctx.currentTime;
      this.voiceLeft.mute(now);
      this.voiceRight.mute(now);
    }
  }

  public dispose(): void {
    this.voiceLeft?.dispose();
    this.voiceRight?.dispose();
    this.voiceLeft = null;
    this.voiceRight = null;
  }
}
