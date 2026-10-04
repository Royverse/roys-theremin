// ============================================================================
// VIRTUAL THEREMIN SYNTHESIS & ACOUSTICS ENGINE
// Authentic Heterodyne & Tube Saturation Acoustics Model
// ============================================================================

export interface NoteInfo {
  noteName: string;
  octave: number;
  midi: number;
  targetFreq: number;
  cents: number;
}

export type QuantizeMode = 'continuous' | 'soft' | 'hard';

export const SCALES: Record<string, number[]> = {
  CHROMATIC:      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  MAJOR:          [0, 2, 4, 5, 7, 9, 11],
  NATURAL_MINOR:  [0, 2, 3, 5, 7, 8, 10],
  PENTATONIC_MAJ: [0, 2, 4, 7, 9],
  PENTATONIC_MIN: [0, 3, 5, 7, 10],
  BLUES:          [0, 3, 5, 6, 7, 10],
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export class ThereminEngine {
  private ctx: AudioContext | null = null;
  private isRunning = false;

  // Sound generator nodes
  private oscSine: OscillatorNode | null = null;
  private oscTri: OscillatorNode | null = null;
  private gainSine: GainNode | null = null;
  private gainTri: GainNode | null = null;
  private driftLfo: OscillatorNode | null = null;
  private driftGain: GainNode | null = null;
  private waveShaper: WaveShaperNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private vca: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  // Pitch range: C2 (65.41 Hz) to C7 (2093.00 Hz)
  public fMin = 65.41;
  public fMax = 2093.00;

  // Parameter smoothing time constants (seconds)
  public tauPitch = 0.012;  // 12ms for zero zipper noise & smooth trills
  public tauVolume = 0.008; // 8ms for crisp staccato muting without clicks

  // Pitch assist
  public quantizeMode: QuantizeMode = 'continuous';
  public activeScale: number[] = SCALES.CHROMATIC;
  public softStrength = 0.72; // Magnetic pull strength

  // Current values
  public currentFreq = 440.0;
  public currentGain = 0.0;

  constructor() {}

  public async initAudio(): Promise<boolean> {
    if (this.ctx && this.isRunning) return true;

    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.buildGraph();
    this.isRunning = true;
    return true;
  }

  private buildGraph(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // 1. Dual Oscillators (Fundamental Sine 75% + Harmonic Triangle 25%)
    this.oscSine = ctx.createOscillator();
    this.oscSine.type = 'sine';

    this.oscTri = ctx.createOscillator();
    this.oscTri.type = 'triangle';

    this.gainSine = ctx.createGain();
    this.gainSine.gain.value = 0.75;

    this.gainTri = ctx.createGain();
    this.gainTri.gain.value = 0.25;

    // 2. Analog Drift LFO (Simulates vacuum tube thermal drift)
    this.driftLfo = ctx.createOscillator();
    this.driftLfo.frequency.value = 0.18; // 0.18 Hz subtle wander
    this.driftGain = ctx.createGain();
    this.driftGain.gain.value = 1.8;      // +/- 1.8 Hz micro-variation

    this.driftLfo.connect(this.driftGain);
    this.driftGain.connect(this.oscSine.frequency);
    this.driftGain.connect(this.oscTri.frequency);

    // 3. Asymmetric Triode Waveshaper (Soft saturation for warm even harmonics)
    this.waveShaper = ctx.createWaveShaper();
    this.waveShaper.curve = this.createTubeTransferCurve(2048, 1.4, 0.12) as Float32Array<ArrayBuffer>;
    this.waveShaper.oversample = '4x';

    // 4. Formant / Resonant Lowpass Filter (Tracks fundamental)
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 1.6;
    this.filter.frequency.value = 1200;

    // 5. VCA Gain Node (Controlled by left volume antenna)
    this.vca = ctx.createGain();
    this.vca.gain.value = 0.0; // Starts muted

    // 6. Analyser Node for visual spectrum / oscilloscope
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.8;

    // 7. Master Gain
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.85;

    // Connect node chain
    this.oscSine.connect(this.gainSine);
    this.oscTri.connect(this.gainTri);

    this.gainSine.connect(this.waveShaper);
    this.gainTri.connect(this.waveShaper);

    this.waveShaper.connect(this.filter);
    this.filter.connect(this.vca);
    this.vca.connect(this.analyser);
    this.analyser.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);

    // Start oscillators
    const now = ctx.currentTime;
    this.oscSine.start(now);
    this.oscTri.start(now);
    this.driftLfo.start(now);

    this.setPitch(0.5, 0);
  }

  private createTubeTransferCurve(samples = 2048, drive = 1.4, asymmetry = 0.12): Float32Array {
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1; // Range: -1 to +1
      const xDrive = x * drive;
      // Asymmetric saturation introduces warm 2nd & 3rd harmonics
      curve[i] = Math.tanh(xDrive + asymmetry * Math.pow(xDrive, 2));
    }
    // Normalize to [-1.0, 1.0]
    let max = 0;
    for (let i = 0; i < samples; i++) {
      if (Math.abs(curve[i]) > max) max = Math.abs(curve[i]);
    }
    for (let i = 0; i < samples; i++) curve[i] /= max;
    return curve;
  }

  /**
   * Sets pitch based on normalized hand proximity (0 = far away/zero beat, 1 = closest)
   * and Clara Rockmore finger span (-1.0 to +1.0)
   */
  public setPitch(handPos: number, fingerSpan = 0): number {
    const rawFreq = this.calculateRawFrequency(handPos, fingerSpan);
    const targetFreq = this.applyPitchAssist(rawFreq);
    this.currentFreq = targetFreq;

    if (this.ctx && this.oscSine && this.oscTri && this.filter) {
      const now = this.ctx.currentTime;
      this.oscSine.frequency.setTargetAtTime(targetFreq, now, this.tauPitch);
      this.oscTri.frequency.setTargetAtTime(targetFreq, now, this.tauPitch);

      // Resonant filter tracks pitch dynamically
      const filterCutoff = Math.min(8000, Math.max(450, targetFreq * 2.8));
      this.filter.frequency.setTargetAtTime(filterCutoff, now, this.tauPitch);
    }

    return targetFreq;
  }

  /**
   * Sets volume based on normalized hand height above loop (0 = touching loop / mute, 1 = maximum height)
   */
  public setVolume(handHeight: number, forceMute = false): number {
    const targetGain = forceMute ? 0.0 : this.calculateGain(handHeight);
    this.currentGain = targetGain;

    if (this.ctx && this.vca) {
      const now = this.ctx.currentTime;
      this.vca.gain.setTargetAtTime(targetGain, now, this.tauVolume);
    }

    return targetGain;
  }

  public calculateRawFrequency(handPos: number, fingerSpan = 0): number {
    // Clara Rockmore finger extension can modulate pitch up to ~1 octave
    const OCTAVE_SPAN_FACTOR = 0.18;
    const effectivePos = Math.min(1.0, Math.max(0.0, handPos + fingerSpan * OCTAVE_SPAN_FACTOR));
    return this.fMin * Math.pow(this.fMax / this.fMin, effectivePos);
  }

  public calculateGain(handHeight: number): number {
    const MUTE_DEADBAND = 0.04;
    const clamped = Math.min(1.0, Math.max(0.0, handHeight));
    if (clamped <= MUTE_DEADBAND) return 0.0;
    const norm = (clamped - MUTE_DEADBAND) / (1.0 - MUTE_DEADBAND);
    // Cubic audio taper for natural perceptual loudness
    return Math.pow(norm, 2.8);
  }

  public applyPitchAssist(rawFreq: number): number {
    if (this.quantizeMode === 'continuous' || !this.activeScale || this.activeScale.length === 0) {
      return rawFreq;
    }

    const rawMidi = 69 + 12 * Math.log2(rawFreq / 440);
    const nearestScaleMidi = this.findNearestScaleMidi(rawMidi);

    if (this.quantizeMode === 'hard') {
      return 440 * Math.pow(2, (nearestScaleMidi - 69) / 12);
    }

    // Soft-Quantize: Gaussian magnetic well
    const delta = rawMidi - nearestScaleMidi; // Range: -0.5 to +0.5 semitones
    const sigma = 0.22;
    const pullFactor = this.softStrength * Math.exp(-Math.pow(delta / sigma, 2));
    const assistedMidi = nearestScaleMidi + delta * (1.0 - pullFactor);

    return 440 * Math.pow(2, (assistedMidi - 69) / 12);
  }

  private findNearestScaleMidi(midi: number): number {
    const roundMidi = Math.round(midi);
    let bestMidi = roundMidi;
    let minDiff = Infinity;

    for (let offset = -6; offset <= 6; offset++) {
      const candidate = roundMidi + offset;
      const pitchClass = ((candidate % 12) + 12) % 12;
      if (this.activeScale.includes(pitchClass)) {
        const diff = Math.abs(midi - candidate);
        if (diff < minDiff) {
          minDiff = diff;
          bestMidi = candidate;
        }
      }
    }
    return bestMidi;
  }

  public static detectNote(freq: number): NoteInfo {
    const midi = 69 + 12 * Math.log2(Math.max(20, freq) / 440);
    const nearestMidi = Math.round(midi);
    const pitchClass = ((nearestMidi % 12) + 12) % 12;
    const octave = Math.floor(nearestMidi / 12) - 1;
    const noteName = `${NOTE_NAMES[pitchClass]}${octave}`;
    const targetFreq = 440 * Math.pow(2, (nearestMidi - 69) / 12);
    const cents = Math.round((midi - nearestMidi) * 100);

    return {
      noteName,
      octave,
      midi: nearestMidi,
      targetFreq: Math.round(targetFreq * 100) / 100,
      cents,
    };
  }

  public getWaveformData(outputArray: Uint8Array): void {
    if (this.analyser) {
      this.analyser.getByteTimeDomainData(outputArray as Uint8Array<ArrayBuffer>);
    }
  }

  public getFrequencyData(outputArray: Uint8Array): void {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(outputArray as Uint8Array<ArrayBuffer>);
    }
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public stop(): void {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend();
      this.isRunning = false;
    }
  }
}
