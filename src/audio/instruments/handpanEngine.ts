// ============================================================================
// SWISS HANDPAN (PANART HANG) MODAL & HELMHOLTZ SYNTHESIS ENGINE (2000)
// Authentic physical modeling of a nitrided steel D Kurd 9 vessel:
// - 1 : 2 : 3 compound harmonic tuning per tone field with coupled warmth twin
// - Nonlinear membrane tension pitch-bloom on impact (+8 cents -> 0 cents)
// - Soft fingertip flesh-pad exciter & velocity-dependent warm damping filter
// - Helmholtz "Gu" cavity resonator (D2 / A2 / D3 / F3 sympathetic halo)
// - Multi-modal play: 3D dome contact, glissando sweep, finger-tap, mouse & keys 1-9
// ============================================================================

import * as THREE from 'three';
import type { KinematicHandState, SpatialInstrumentAudio } from '../../types/atelier';

export const HANDPAN_DOME = {
  CENTER_X: 0.0,
  CENTER_Y: 0.16,
  CENTER_Z: 0.05,
  TILT_X: 0.58, // ~33.2 deg tilt towards the player/camera so the entire top dome faces viewer
  SHELL_RADIUS: 0.31,
  CHOR_RADIUS: 0.185,
};

export interface HandpanToneField {
  index: number;
  name: string;
  shortLabel: string;
  freq: number;
  angle: number; // Angle in local dome plane (radians)
  radius: number; // Radial distance from dome center in meters
  pan: number; // Stereo pan [-0.65, +0.65]
  localPos: THREE.Vector3; // Position in local Handpan group space
  worldPos: THREE.Vector3; // Exact 3D position in Three.js world space
}

/**
 * Computes both local and tilted world coordinates for a tone field on the convex dome.
 */
function createToneField(
  index: number,
  name: string,
  shortLabel: string,
  freq: number,
  angleDeg: number,
  radius: number
): HandpanToneField {
  const angle = (angleDeg * Math.PI) / 180;
  const xL = radius === 0 ? 0 : Math.cos(angle) * radius;
  const zL = radius === 0 ? 0 : Math.sin(angle) * radius;
  // Follow the oblate spheroid dome curvature
  const yL = radius === 0 ? 0.138 : 0.092;

  const localPos = new THREE.Vector3(xL, yL, zL);

  // Rotate around +X by HANDPAN_DOME.TILT_X and translate by HANDPAN_DOME.CENTER
  const cosT = Math.cos(HANDPAN_DOME.TILT_X);
  const sinT = Math.sin(HANDPAN_DOME.TILT_X);
  const xW = HANDPAN_DOME.CENTER_X + xL;
  const yW = HANDPAN_DOME.CENTER_Y + (yL * cosT - zL * sinT);
  const zW = HANDPAN_DOME.CENTER_Z + (yL * sinT + zL * cosT);

  const worldPos = new THREE.Vector3(xW, yW, zW);
  const pan = Math.max(-0.65, Math.min(0.65, xW / 0.24));

  return {
    index,
    name,
    shortLabel,
    freq,
    angle,
    radius,
    pan,
    localPos,
    worldPos,
  };
}

/**
 * Authentic D Kurd 9 (D Minor) Swiss Handpan Layout:
 * - Center Ding: D3 (146.83 Hz)
 * - Alternating left/right ascending scale from bottom (6 o'clock) to top (12 o'clock)
 */
export const HANDPAN_TONES: HandpanToneField[] = [
  createToneField(0, 'D3 (Ding)', 'D3', 146.83, 0, 0.0),
  createToneField(1, 'A3', 'A3', 220.00, 90, HANDPAN_DOME.CHOR_RADIUS),    // 6:00 Bottom Center
  createToneField(2, 'Bb3', 'Bb3', 233.08, 45, HANDPAN_DOME.CHOR_RADIUS),  // 4:30 Lower Right
  createToneField(3, 'C4', 'C4', 261.63, 135, HANDPAN_DOME.CHOR_RADIUS),   // 7:30 Lower Left
  createToneField(4, 'D4', 'D4', 293.66, 0, HANDPAN_DOME.CHOR_RADIUS),     // 3:00 Mid Right
  createToneField(5, 'E4', 'E4', 329.63, 180, HANDPAN_DOME.CHOR_RADIUS),   // 9:00 Mid Left
  createToneField(6, 'F4', 'F4', 349.23, -45, HANDPAN_DOME.CHOR_RADIUS),   // 1:30 Upper Right
  createToneField(7, 'G4', 'G4', 392.00, -135, HANDPAN_DOME.CHOR_RADIUS),  // 10:30 Upper Left
  createToneField(8, 'A4', 'A4', 440.00, -90, HANDPAN_DOME.CHOR_RADIUS),   // 12:00 Top Center
];

export interface HandpanRippleEvent {
  toneIndex: number;
  velocity: number;
}

/**
 * Shared visual telemetry between HandpanEngine and HandpanModel for 1:1 3D feedback.
 */
export const handpanVisualState = {
  dimpleGlows: new Float32Array(9),
  dimpleDeflections: new Float32Array(9),
  dimpleHovered: new Array<boolean>(9).fill(false),
  pendingRipples: [] as HandpanRippleEvent[],
  cavityResonance: 0,
  leftHandDomePos: null as THREE.Vector3 | null,
  rightHandDomePos: null as THREE.Vector3 | null,
};

/**
 * Single polyphonic modal voice modeling a hand-hammered nitrided steel tone field.
 * Uses 1:2:3 harmonic modes + coupled warmth twin + transient steel shimmer + flesh pad exciter.
 */
class HandpanVoice {
  private ctx: AudioContext;
  private oscFund: OscillatorNode;
  private oscWarmth: OscillatorNode;
  private oscOctave: OscillatorNode;
  private oscFifth: OscillatorNode;
  private oscShimmer: OscillatorNode;

  private gainFund: GainNode;
  private gainWarmth: GainNode;
  private gainOctave: GainNode;
  private gainFifth: GainNode;
  private gainShimmer: GainNode;

  private bodyFilter: BiquadFilterNode;
  private panner: StereoPannerNode;
  private voiceOut: GainNode;
  private noiseBuffer: AudioBuffer;

  public toneIndex = -1;
  public lastTriggeredAt = 0;

  constructor(ctx: AudioContext, destination: AudioNode, noiseBuffer: AudioBuffer) {
    this.ctx = ctx;
    this.noiseBuffer = noiseBuffer;

    this.oscFund = ctx.createOscillator();
    this.oscWarmth = ctx.createOscillator();
    this.oscOctave = ctx.createOscillator();
    this.oscFifth = ctx.createOscillator();
    this.oscShimmer = ctx.createOscillator();

    this.oscFund.type = 'sine';
    this.oscWarmth.type = 'sine';
    this.oscOctave.type = 'sine';
    this.oscFifth.type = 'sine';
    this.oscShimmer.type = 'triangle';

    this.gainFund = ctx.createGain();
    this.gainWarmth = ctx.createGain();
    this.gainOctave = ctx.createGain();
    this.gainFifth = ctx.createGain();
    this.gainShimmer = ctx.createGain();

    this.gainFund.gain.value = 0.0;
    this.gainWarmth.gain.value = 0.0;
    this.gainOctave.gain.value = 0.0;
    this.gainFifth.gain.value = 0.0;
    this.gainShimmer.gain.value = 0.0;

    // Warm acoustic steel damping filter (higher partials mellow out into pure fundamental tail)
    this.bodyFilter = ctx.createBiquadFilter();
    this.bodyFilter.type = 'lowpass';
    this.bodyFilter.frequency.value = 1800;
    this.bodyFilter.Q.value = 0.85;

    this.panner = ctx.createStereoPanner();
    this.voiceOut = ctx.createGain();
    this.voiceOut.gain.value = 0.9;

    this.oscFund.connect(this.gainFund);
    this.oscWarmth.connect(this.gainWarmth);
    this.oscOctave.connect(this.gainOctave);
    this.oscFifth.connect(this.gainFifth);
    this.oscShimmer.connect(this.gainShimmer);

    this.gainFund.connect(this.bodyFilter);
    this.gainWarmth.connect(this.bodyFilter);
    this.gainOctave.connect(this.bodyFilter);
    this.gainFifth.connect(this.bodyFilter);
    this.gainShimmer.connect(this.bodyFilter);

    this.bodyFilter.connect(this.panner);
    this.panner.connect(this.voiceOut);
    this.voiceOut.connect(destination);

    this.oscFund.start();
    this.oscWarmth.start();
    this.oscOctave.start();
    this.oscFifth.start();
    this.oscShimmer.start();
  }

  public strike(tone: HandpanToneField, velocity: number, rollBend: number): void {
    const now = this.ctx.currentTime;
    this.toneIndex = tone.index;
    this.lastTriggeredAt = now;

    const f0 = tone.freq;
    const isDing = tone.index === 0;
    const vel = Math.max(0.2, Math.min(1.0, velocity));

    // Stereo position matching physical tone field location on the pan
    this.panner.pan.setTargetAtTime(tone.pan, now, 0.015);

    // Nonlinear membrane tension pitch-bloom (+8 cents at impact -> relaxes to 0 cents in 18ms)
    const bloomRatio = 1.0 + 0.0046 * vel;
    const harmonicSpread = 1.0 + rollBend * 0.0025;

    // 1.0x Fundamental
    this.oscFund.frequency.cancelScheduledValues(now);
    this.oscFund.frequency.setValueAtTime(f0 * bloomRatio, now);
    this.oscFund.frequency.setTargetAtTime(f0, now + 0.004, 0.016);

    // 1.00085x Coupled Warmth Twin (~0.6 Hz - 1.1 Hz meditative acoustic beating)
    const fWarmth = f0 * 1.00085;
    this.oscWarmth.frequency.cancelScheduledValues(now);
    this.oscWarmth.frequency.setValueAtTime(fWarmth * bloomRatio, now);
    this.oscWarmth.frequency.setTargetAtTime(fWarmth, now + 0.004, 0.016);

    // 2.0x Longitudinal Octave Mode
    const fOct = f0 * 2.0 * harmonicSpread;
    this.oscOctave.frequency.cancelScheduledValues(now);
    this.oscOctave.frequency.setValueAtTime(fOct * bloomRatio, now);
    this.oscOctave.frequency.setTargetAtTime(fOct, now + 0.004, 0.014);

    // 2.9985x Transverse Compound Fifth (Twelfth) Mode
    const fFifth = f0 * 2.9985 * harmonicSpread;
    this.oscFifth.frequency.cancelScheduledValues(now);
    this.oscFifth.frequency.setValueAtTime(fFifth * bloomRatio, now);
    this.oscFifth.frequency.setTargetAtTime(fFifth, now + 0.004, 0.012);

    // 4.015x Nitrided Steel Transient Shimmer Mode
    const fShim = f0 * 4.015;
    this.oscShimmer.frequency.cancelScheduledValues(now);
    this.oscShimmer.frequency.setValueAtTime(fShim * bloomRatio, now);
    this.oscShimmer.frequency.setTargetAtTime(fShim, now + 0.003, 0.010);

    // Modal amplitudes & natural frequency-dependent decay constants
    const ampFund = (isDing ? 0.52 : 0.44) * vel;
    const ampWarmth = (isDing ? 0.24 : 0.20) * vel;
    const ampOct = (isDing ? 0.26 : 0.22) * Math.pow(vel, 1.15);
    const ampFifth = (isDing ? 0.16 : 0.14) * Math.pow(vel, 1.3);
    const ampShim = 0.045 * Math.pow(vel, 1.6);

    // Decay time constants (seconds): lower notes ring longer, upper harmonics decay into warm fundamental
    const pitchScale = Math.pow(220 / f0, 0.35);
    const tauFund = (isDing ? 1.65 : 1.25) * pitchScale;
    const tauOct = 0.72 * pitchScale;
    const tauFifth = 0.42 * pitchScale;
    const tauShim = 0.055;

    // Click-free soft attack ramp (4ms) followed by natural exponential modal decay
    const attackEnd = now + 0.004;

    this.triggerModalEnvelope(this.gainFund.gain, now, attackEnd, ampFund, tauFund);
    this.triggerModalEnvelope(this.gainWarmth.gain, now + 0.002, attackEnd + 0.003, ampWarmth, tauFund * 0.92);
    this.triggerModalEnvelope(this.gainOctave.gain, now, attackEnd, ampOct, tauOct);
    this.triggerModalEnvelope(this.gainFifth.gain, now, attackEnd, ampFifth, tauFifth);
    this.triggerModalEnvelope(this.gainShimmer.gain, now, now + 0.002, ampShim, tauShim);

    // Dynamic body lowpass filter: opens on finger strike, settles into warm meditative sustain
    const peakCutoff = Math.min(5200, f0 * (3.2 + vel * 4.5));
    const sustainCutoff = Math.max(520, f0 * 2.15);
    this.bodyFilter.frequency.cancelScheduledValues(now);
    this.bodyFilter.frequency.setValueAtTime(peakCutoff, now);
    this.bodyFilter.frequency.setTargetAtTime(sustainCutoff, now + 0.018, 0.48);

    // Trigger soft flesh fingertip pad exciter ("thump & ping")
    this.triggerFingertipExciter(now, f0, vel, isDing);
  }

  private triggerModalEnvelope(
    param: AudioParam,
    now: number,
    attackEnd: number,
    peakAmp: number,
    tau: number
  ): void {
    param.cancelScheduledValues(now);
    // Start from current value for zero-click re-triggering
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(peakAmp, attackEnd);
    param.setTargetAtTime(0.0001, attackEnd, tau);
  }

  /**
   * Synthesizes the soft, organic pad-of-the-finger contact with the steel dome.
   */
  private triggerFingertipExciter(now: number, f0: number, vel: number, isDing: boolean): void {
    // 1. Soft filtered velvet-noise skin brush (14ms)
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = this.noiseBuffer;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(f0 * 1.5, now);
    bp.Q.setValueAtTime(3.2, now);

    const nGain = this.ctx.createGain();
    const nPeak = 0.14 * vel;
    nGain.gain.setValueAtTime(0.0001, now);
    nGain.gain.linearRampToValueAtTime(nPeak, now + 0.0025);
    nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);

    noiseSrc.connect(bp);
    bp.connect(nGain);
    nGain.connect(this.panner);

    noiseSrc.start(now);
    noiseSrc.stop(now + 0.022);

    // 2. Warm thumb/finger flesh cushion impulse (low woody thump at ~105 Hz)
    const thumpOsc = this.ctx.createOscillator();
    thumpOsc.type = 'sine';
    const thumpStart = isDing ? 135 : 165;
    thumpOsc.frequency.setValueAtTime(thumpStart, now);
    thumpOsc.frequency.exponentialRampToValueAtTime(62, now + 0.024);

    const thumpGain = this.ctx.createGain();
    const thumpPeak = (isDing ? 0.22 : 0.14) * vel;
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.linearRampToValueAtTime(thumpPeak, now + 0.002);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.028);

    thumpOsc.connect(thumpGain);
    thumpGain.connect(this.panner);

    thumpOsc.start(now);
    thumpOsc.stop(now + 0.032);
  }

  public damp(now: number, fast = false): void {
    const tau = fast ? 0.04 : 0.12;
    this.gainFund.gain.cancelScheduledValues(now);
    this.gainWarmth.gain.cancelScheduledValues(now);
    this.gainOctave.gain.cancelScheduledValues(now);
    this.gainFifth.gain.cancelScheduledValues(now);
    this.gainShimmer.gain.cancelScheduledValues(now);

    this.gainFund.gain.setTargetAtTime(0.0, now, tau);
    this.gainWarmth.gain.setTargetAtTime(0.0, now, tau);
    this.gainOctave.gain.setTargetAtTime(0.0, now, tau * 0.7);
    this.gainFifth.gain.setTargetAtTime(0.0, now, tau * 0.6);
    this.gainShimmer.gain.setTargetAtTime(0.0, now, 0.02);
  }

  public dispose(): void {
    try {
      this.oscFund.stop();
      this.oscWarmth.stop();
      this.oscOctave.stop();
      this.oscFifth.stop();
      this.oscShimmer.stop();
      this.voiceOut.disconnect();
    } catch {
      // Ignore cleanup errors
    }
  }
}

interface HandInteractionTracker {
  activeToneIndex: number;
  lastStruckToneIndex: number;
  lastStrikeTime: number;
  lastTipY: number;
  peakDownSpeed: number;
  isArmedForRepeat: boolean;
}

export class HandpanEngine implements SpatialInstrumentAudio {
  private ctx: AudioContext | null = null;
  private voices: HandpanVoice[] = [];
  private masterGain: GainNode | null = null;

  // Helmholtz "Gu" Cavity & Sympathetic Vessel Resonance
  private cavityGain: GainNode | null = null;
  private cavityFilter: BiquadFilterNode | null = null;
  private cavityOscs: OscillatorNode[] = [];
  private cavityEnergy = 0;

  // Hand interaction trackers for Left and Right hands
  private leftTracker: HandInteractionTracker = {
    activeToneIndex: -1,
    lastStruckToneIndex: -1,
    lastStrikeTime: 0,
    lastTipY: 0,
    peakDownSpeed: 0,
    isArmedForRepeat: true,
  };

  private rightTracker: HandInteractionTracker = {
    activeToneIndex: -1,
    lastStruckToneIndex: -1,
    lastStrikeTime: 0,
    lastTipY: 0,
    peakDownSpeed: 0,
    isArmedForRepeat: true,
  };

  private lastStruckNote = 'D3 (Ding)';
  private lastStruckFreq = 146.83;
  private peakGain = 0;
  private lastUpdateTime = 0;
  private keyboardListenerAttached = false;

  public initAudio(ctx: AudioContext, masterBus: AudioNode): void {
    if (this.ctx === ctx && this.voices.length > 0) {
      return; // Prevent duplicate initialization
    }
    this.ctx = ctx;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.95;
    this.masterGain.connect(masterBus);

    // Create soft pink/velvet noise buffer for finger-flesh contact exciter
    const bufLen = Math.floor(ctx.sampleRate * 0.05);
    const noiseBuffer = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < bufLen; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.950 * b2 + white * 0.048;
      data[i] = (b0 + b1 + b2 + white * 0.015) * 3.5;
    }

    // Pool of 10 polyphonic modal voices so meditative chords never cut off
    for (let i = 0; i < 10; i++) {
      this.voices.push(new HandpanVoice(ctx, this.masterGain, noiseBuffer));
    }

    // Build Helmholtz "Gu" Cavity & Sympathetic Vessel Resonator (D2, A2, D3, F3, A3)
    this.buildHelmholtzCavity(ctx, this.masterGain);
    this.setupKeyboardShortcuts();
  }

  /**
   * Creates the warm, calming internal air resonance ("Gu" port) and sympathetic steel hum
   * that blooms gently whenever the Handpan is played.
   */
  private buildHelmholtzCavity(ctx: AudioContext, destination: AudioNode): void {
    this.cavityFilter = ctx.createBiquadFilter();
    this.cavityFilter.type = 'lowpass';
    this.cavityFilter.frequency.value = 340;
    this.cavityFilter.Q.value = 1.2;

    this.cavityGain = ctx.createGain();
    this.cavityGain.gain.value = 0.0;

    // Sympathetic D minor vessel frequencies: D2 (Gu), A2, D3 (Ding), F3, A3
    const sympFreqs = [73.42, 110.00, 146.83, 174.61, 220.00];
    const sympAmps = [0.36, 0.24, 0.22, 0.12, 0.10];

    for (let i = 0; i < sympFreqs.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      // Slight organic detune for warm spatial chorus
      osc.frequency.value = sympFreqs[i] * (1 + (i % 2 === 0 ? 0.0006 : -0.0006));

      const g = ctx.createGain();
      g.gain.value = sympAmps[i];

      osc.connect(g);
      g.connect(this.cavityFilter);
      osc.start();
      this.cavityOscs.push(osc);
    }

    this.cavityFilter.connect(this.cavityGain);
    this.cavityGain.connect(destination);
  }

  /**
   * Allows playing all 9 D-Kurd tone fields via keys 1-9 for hybrid performance.
   */
  private setupKeyboardShortcuts(): void {
    if (this.keyboardListenerAttached) return;
    this.keyboardListenerAttached = true;

    window.addEventListener('keydown', (e) => {
      if (e.repeat || !this.ctx) return;
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      // Only trigger if Handpan pill is currently active
      const handpanPill = document.getElementById('pill-handpan');
      if (!handpanPill || !handpanPill.classList.contains('active')) return;

      if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key, 10) - 1;
        this.strikeTone(idx, 0.78, 0);
      }
    });
  }

  /**
   * Allocates either the voice already ringing on the same tone field (for seamless re-excitation)
   * or the oldest voice in the pool.
   */
  private allocateVoice(toneIndex: number): HandpanVoice {
    const sameToneVoice = this.voices.find((v) => v.toneIndex === toneIndex);
    if (sameToneVoice) return sameToneVoice;

    let oldest = this.voices[0];
    for (const v of this.voices) {
      if (v.lastTriggeredAt < oldest.lastTriggeredAt) {
        oldest = v;
      }
    }
    return oldest;
  }

  public strikeTone(toneIndex: number, velocity: number, rollBend: number): void {
    if (!this.ctx || toneIndex < 0 || toneIndex >= HANDPAN_TONES.length) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const tone = HANDPAN_TONES[toneIndex];
    const clampedVel = Math.max(0.28, Math.min(1.0, velocity));

    const voice = this.allocateVoice(toneIndex);
    voice.strike(tone, clampedVel, rollBend);

    // Feed sympathetic energy into the Helmholtz "Gu" cavity
    this.cavityEnergy = Math.min(1.0, this.cavityEnergy + clampedVel * 0.32);

    this.lastStruckNote = tone.name;
    this.lastStruckFreq = tone.freq;
    this.peakGain = Math.max(this.peakGain, clampedVel);

    // Push visual feedback to the 3D Handpan model
    handpanVisualState.dimpleGlows[toneIndex] = Math.max(
      handpanVisualState.dimpleGlows[toneIndex],
      1.6 + clampedVel * 1.4
    );
    handpanVisualState.dimpleDeflections[toneIndex] = clampedVel;
    handpanVisualState.pendingRipples.push({
      toneIndex,
      velocity: clampedVel,
    });
  }

  public update(
    time: number,
    leftK: KinematicHandState,
    rightK: KinematicHandState,
    leftLandmarks3D?: THREE.Vector3[] | null,
    rightLandmarks3D?: THREE.Vector3[] | null
  ): { primaryFreq: number; primaryGain: number; noteName?: string; cents?: number } {
    const dt = Math.max(0.004, Math.min(0.1, this.lastUpdateTime > 0 ? time - this.lastUpdateTime : 0.016));
    this.lastUpdateTime = time;

    // Reset per-frame hover highlights
    for (let i = 0; i < 9; i++) {
      handpanVisualState.dimpleHovered[i] = false;
    }

    if (!this.ctx) {
      return { primaryFreq: this.lastStruckFreq, primaryGain: 0, noteName: this.lastStruckNote, cents: 0 };
    }

    // Smoothly decay visual meter and sympathetic cavity energy
    this.peakGain *= Math.exp(-2.2 * dt);
    this.cavityEnergy *= Math.exp(-0.55 * dt);
    handpanVisualState.cavityResonance = this.cavityEnergy;

    // Process Right Hand & Left Hand interactions with the 3D Handpan dome
    this.processHandInteraction(time, rightK, rightLandmarks3D ?? null, this.rightTracker, true);
    this.processHandInteraction(time, leftK, leftLandmarks3D ?? null, this.leftTracker, false);

    // Modulate Helmholtz "Gu" cavity & sympathetic overtones with hand height and palm tilt
    if (this.cavityGain && this.cavityFilter) {
      const now = this.ctx.currentTime;
      const targetCavityGain = this.cavityEnergy * 0.16;
      this.cavityGain.gain.setTargetAtTime(targetCavityGain, now, 0.08);

      const swirl =
        (rightK.hasHand ? Math.abs(rightK.wristRoll) + Math.max(0, rightK.palmTilt) : 0) +
        (leftK.hasHand ? Math.abs(leftK.wristRoll) + Math.max(0, leftK.palmTilt) : 0);
      const targetCutoff = 260 + this.cavityEnergy * 180 + swirl * 220;
      this.cavityFilter.frequency.setTargetAtTime(Math.min(900, targetCutoff), now, 0.06);
    }

    const totalGain = Math.min(1.0, this.peakGain + this.cavityEnergy * 0.25);

    return {
      primaryFreq: this.lastStruckFreq,
      primaryGain: totalGain,
      noteName: this.lastStruckNote,
      cents: 0,
    };
  }

  /**
   * Evaluates 3D dome proximity, tone-field entry (glissando/melodic touch),
   * and rhythmic downward finger-taps for a single hand.
   */
  private processHandInteraction(
    time: number,
    handK: KinematicHandState,
    landmarks3D: THREE.Vector3[] | null,
    tracker: HandInteractionTracker,
    isRight: boolean
  ): void {
    if (!handK.hasHand) {
      tracker.activeToneIndex = -1;
      tracker.isArmedForRepeat = true;
      if (isRight) handpanVisualState.rightHandDomePos = null;
      else handpanVisualState.leftHandDomePos = null;
      return;
    }

    // Use Index Fingertip (landmark 8) if available, otherwise rawPos
    const locus = landmarks3D && landmarks3D.length > 8 ? landmarks3D[8] : handK.rawPos;
    if (isRight) handpanVisualState.rightHandDomePos = locus;
    else handpanVisualState.leftHandDomePos = locus;

    // Find closest tone field in (x, y) projected dome space
    const { closestIndex, minDist } = this.findClosestToneField(locus.x, locus.y);

    // Hover threshold: illuminates the tone field ring when hand is over it
    const HOVER_RADIUS = 0.095;
    // Active contact radius: entering this zone plucks the tone field
    const CONTACT_RADIUS = 0.072;

    if (minDist < HOVER_RADIUS) {
      handpanVisualState.dimpleHovered[closestIndex] = true;
    }

    const speed = handK.velocity.length();
    const downSpeed = Math.max(0, -handK.velocity.y);
    tracker.peakDownSpeed = Math.max(tracker.peakDownSpeed * 0.85, downSpeed);

    // Re-arm repeat tap on the same tone field once finger lifts slightly or slows down
    if (handK.velocity.y > 0.02 || Math.abs(locus.y - tracker.lastTipY) > 0.018) {
      tracker.isArmedForRepeat = true;
    }

    const timeSinceLast = time - tracker.lastStrikeTime;
    const cooldownPassed = timeSinceLast > 0.115;

    // 1. Explicit strike (mouse click, touch tap, or ballistic flick)
    if (handK.isStrike && minDist < 0.24) {
      const vel = Math.max(0.45, Math.min(1.0, handK.strikeVelocity || 0.82));
      this.strikeTone(closestIndex, vel, handK.wristRoll);
      tracker.activeToneIndex = closestIndex;
      tracker.lastStruckToneIndex = closestIndex;
      tracker.lastStrikeTime = time;
      tracker.lastTipY = locus.y;
      tracker.peakDownSpeed = 0;
      tracker.isArmedForRepeat = false;
      return;
    }

    // 2. Tone-Field Zone Entry / Melodic Glissando Strum
    // Moving into a tone field (or gliding from one tone field to another) plays it naturally!
    if (minDist < CONTACT_RADIUS) {
      if (tracker.activeToneIndex !== closestIndex && timeSinceLast > 0.085) {
        const entryVel = Math.max(0.38, Math.min(0.95, 0.38 + (speed / 1.1) * 0.58));
        this.strikeTone(closestIndex, entryVel, handK.wristRoll);
        tracker.activeToneIndex = closestIndex;
        tracker.lastStruckToneIndex = closestIndex;
        tracker.lastStrikeTime = time;
        tracker.lastTipY = locus.y;
        tracker.peakDownSpeed = 0;
        tracker.isArmedForRepeat = false;
        return;
      }

      // 3. Rhythmic Finger-Tap on the Same Tone Field
      // If hovering inside a tone field and tapping downward
      const isFingerTap =
        tracker.isArmedForRepeat &&
        cooldownPassed &&
        tracker.peakDownSpeed > 0.075 &&
        handK.velocity.y > -0.04;

      if (isFingerTap) {
        const tapVel = Math.max(0.40, Math.min(0.98, 0.36 + tracker.peakDownSpeed / 0.75));
        this.strikeTone(closestIndex, tapVel, handK.wristRoll);
        tracker.lastStrikeTime = time;
        tracker.lastTipY = locus.y;
        tracker.peakDownSpeed = 0;
        tracker.isArmedForRepeat = false;
      }
    } else if (minDist > CONTACT_RADIUS * 1.18) {
      // Hand left the tone field's contact radius (with hysteresis so edge jitter never double-triggers)
      tracker.activeToneIndex = -1;
      tracker.isArmedForRepeat = true;
    }
  }

  /**
   * Finds the nearest of the 9 tone fields to the given world (x, y) coordinates.
   */
  public findClosestToneField(worldX: number, worldY: number): { closestIndex: number; minDist: number } {
    let closestIndex = 0;
    let minDist = Infinity;

    for (let i = 0; i < HANDPAN_TONES.length; i++) {
      const t = HANDPAN_TONES[i];
      const dx = worldX - t.worldPos.x;
      const dy = worldY - t.worldPos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < minDist) {
        minDist = dist;
        closestIndex = i;
      }
    }

    return { closestIndex, minDist };
  }

  public mute(): void {
    this.cavityEnergy = 0;
    if (this.ctx) {
      const now = this.ctx.currentTime;
      for (const v of this.voices) {
        v.damp(now, true);
      }
      if (this.cavityGain) {
        this.cavityGain.gain.setTargetAtTime(0, now, 0.04);
      }
    }
  }

  public dispose(): void {
    for (const v of this.voices) {
      v.dispose();
    }
    this.voices = [];
    for (const osc of this.cavityOscs) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // Ignore cleanup errors
      }
    }
    this.cavityOscs = [];
  }
}
