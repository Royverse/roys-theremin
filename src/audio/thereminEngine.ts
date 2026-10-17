// ============================================================================
// VIRTUAL THEREMIN SYNTHESIS & ACOUSTICS ENGINE (v2)
// Authentic Heterodyne & Triode Saturation Model with Formant Voicing
// and Procedural Concert Hall Convolution Reverb
// ============================================================================

import { createConcertHallImpulse } from './impulseReverb';

export interface NoteInfo {
  noteName: string;
  octave: number;
  midi: number;
  targetFreq: number;
  cents: number;
}

export type QuantizeMode = 'continuous' | 'soft' | 'hard';
export type VoiceProfile = 'clara' | 'aether' | 'vocal' | 'moog';

export const SCALES: Record<string, number[]> = {
  CHROMATIC:      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  MAJOR:          [0, 2, 4, 5, 7, 9, 11],
  NATURAL_MINOR:  [0, 2, 3, 5, 7, 8, 10],
  PENTATONIC_MAJ: [0, 2, 4, 7, 9],
  PENTATONIC_MIN: [0, 3, 5, 7, 10],
  BLUES:          [0, 3, 5, 6, 7, 10],
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

interface VoicePresetConfig {
  sineMix: number;
  harmonicMix: number;
  harmonicType: OscillatorType;
  drive: number;
  asymmetry: number;
  filterQ: number;
  formantFreq: number;
  formantGainDb: number;
}

const VOICE_PRESETS: Record<VoiceProfile, VoicePresetConfig> = {
  clara: {
    sineMix: 0.72,
    harmonicMix: 0.28,
    harmonicType: 'triangle',
    drive: 1.45,
    asymmetry: 0.14,
    filterQ: 1.7,
    formantFreq: 680,
    formantGainDb: 4.5,
  },
  aether: {
    sineMix: 0.90,
    harmonicMix: 0.10,
    harmonicType: 'triangle',
    drive: 1.15,
    asymmetry: 0.08,
    filterQ: 1.1,
    formantFreq: 520,
    formantGainDb: 1.5,
  },
  vocal: {
    sineMix: 0.55,
    harmonicMix: 0.45,
    harmonicType: 'triangle',
    drive: 1.65,
    asymmetry: 0.18,
    filterQ: 2.8,
    formantFreq: 920,
    formantGainDb: 7.5,
  },
  moog: {
    sineMix: 0.45,
    harmonicMix: 0.55,
    harmonicType: 'sawtooth',
    drive: 1.80,
    asymmetry: 0.16,
    filterQ: 2.2,
    formantFreq: 780,
    formantGainDb: 5.0,
  },
};

export class ThereminEngine {
  private ctx: AudioContext | null = null;
  private isRunning = false;
  private graphBuilt = false;

  // Sound generator nodes
  private oscSine: OscillatorNode | null = null;
  private oscHarmonic: OscillatorNode | null = null;
  private gainSine: GainNode | null = null;
  private gainHarmonic: GainNode | null = null;
  private driftLfo: OscillatorNode | null = null;
  private driftGain: GainNode | null = null;
  private waveShaper: WaveShaperNode | null = null;
  private formantFilter: BiquadFilterNode | null = null;
  private lowpassFilter: BiquadFilterNode | null = null;
  private vca: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  // Pitch range: C2 (65.41 Hz) to C6 (1046.50 Hz) default melodic 4-octave span
  public fMin = 65.41;
  public fMax = 1318.51; // E6 (concert soprano range)

  // Parameter smoothing time constants (seconds)
  public tauPitch = 0.014;  // 14ms for zero zipper noise & natural portamento
  public tauVolume = 0.009; // 9ms for crisp staccato muting without clicks

  // Pitch assist & Voice profile
  public quantizeMode: QuantizeMode = 'continuous';
  public activeScale: number[] = SCALES.CHROMATIC;
  public softStrength = 0.74;
  private currentVoice: VoiceProfile = 'clara';

  // Live telemetry values
  public currentFreq = 440.0;
  public currentGain = 0.0;

  public async initAudio(): Promise<boolean> {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return false;
      this.ctx = new AudioCtxClass();
    }

    if (!this.graphBuilt) {
      this.buildGraph();
      this.graphBuilt = true;
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.isRunning = true;
    return true;
  }

  private buildGraph(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const preset = VOICE_PRESETS[this.currentVoice];

    // 1. Dual Heterodyne Oscillators (Fundamental Sine + Harmonic Body)
    this.oscSine = ctx.createOscillator();
    this.oscSine.type = 'sine';

    this.oscHarmonic = ctx.createOscillator();
    this.oscHarmonic.type = preset.harmonicType;

    this.gainSine = ctx.createGain();
    this.gainSine.gain.value = preset.sineMix;

    this.gainHarmonic = ctx.createGain();
    this.gainHarmonic.gain.value = preset.harmonicMix;

    // 2. Analog Drift LFO (Simulates vacuum tube thermal stability wander)
    this.driftLfo = ctx.createOscillator();
    this.driftLfo.frequency.value = 0.19;
    this.driftGain = ctx.createGain();
    this.driftGain.gain.value = 1.4;

    this.driftLfo.connect(this.driftGain);
    this.driftGain.connect(this.oscSine.frequency);
    this.driftGain.connect(this.oscHarmonic.frequency);

    // 3. Asymmetric 12AX7 Triode Waveshaper
    this.waveShaper = ctx.createWaveShaper();
    this.waveShaper.curve = this.createTubeTransferCurve(
      2048,
      preset.drive,
      preset.asymmetry
    ) as Float32Array<ArrayBuffer>;
    this.waveShaper.oversample = '4x';

    // 4. Acoustic Body Formant Filter (Peaking EQ modeling cabinet & vocal tract)
    this.formantFilter = ctx.createBiquadFilter();
    this.formantFilter.type = 'peaking';
    this.formantFilter.frequency.value = preset.formantFreq;
    this.formantFilter.Q.value = 1.8;
    this.formantFilter.gain.value = preset.formantGainDb;

    // 5. Dynamic Pitch-Tracking Lowpass Filter
    this.lowpassFilter = ctx.createBiquadFilter();
    this.lowpassFilter.type = 'lowpass';
    this.lowpassFilter.Q.value = preset.filterQ;
    this.lowpassFilter.frequency.value = 1400;

    // 6. VCA Gain Node (Controlled by Left Hand Volume Loop)
    this.vca = ctx.createGain();
    this.vca.gain.value = 0.0;

    // 7. Procedural Concert Hall Convolution Reverb (Parallel Dry/Wet)
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = createConcertHallImpulse(ctx, 1.85, 2.9);

    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 0.76;

    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0.24;

    // 8. Analyser & Master Output
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.82;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.85;

    // Wire audio graph
    this.oscSine.connect(this.gainSine);
    this.oscHarmonic.connect(this.gainHarmonic);

    this.gainSine.connect(this.waveShaper);
    this.gainHarmonic.connect(this.waveShaper);

    this.waveShaper.connect(this.formantFilter);
    this.formantFilter.connect(this.lowpassFilter);
    this.lowpassFilter.connect(this.vca);

    // Dry + Reverb sum into Analyser -> Master -> Destination
    this.vca.connect(this.dryGain);
    this.vca.connect(this.convolver);
    this.convolver.connect(this.wetGain);

    this.dryGain.connect(this.analyser);
    this.wetGain.connect(this.analyser);

    this.analyser.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);

    // Start continuous oscillators
    const now = ctx.currentTime;
    this.oscSine.start(now);
    this.oscHarmonic.start(now);
    this.driftLfo.start(now);

    this.setPitch(0.5, 0);
  }

  public setVoiceProfile(profile: VoiceProfile): void {
    this.currentVoice = profile;
    const preset = VOICE_PRESETS[profile];
    if (!this.ctx || !this.graphBuilt) return;

    const now = this.ctx.currentTime;
    if (this.oscHarmonic) {
      this.oscHarmonic.type = preset.harmonicType;
    }
    if (this.gainSine && this.gainHarmonic) {
      this.gainSine.gain.setTargetAtTime(preset.sineMix, now, 0.025);
      this.gainHarmonic.gain.setTargetAtTime(preset.harmonicMix, now, 0.025);
    }
    if (this.waveShaper) {
      this.waveShaper.curve = this.createTubeTransferCurve(
        2048,
        preset.drive,
        preset.asymmetry
      ) as Float32Array<ArrayBuffer>;
    }
    if (this.formantFilter && this.lowpassFilter) {
      this.formantFilter.frequency.setTargetAtTime(preset.formantFreq, now, 0.03);
      this.formantFilter.gain.setTargetAtTime(preset.formantGainDb, now, 0.03);
      this.lowpassFilter.Q.setTargetAtTime(preset.filterQ, now, 0.03);
    }
  }

  public getVoiceProfile(): VoiceProfile {
    return this.currentVoice;
  }

  private createTubeTransferCurve(
    samples = 2048,
    drive = 1.45,
    asymmetry = 0.14
  ): Float32Array {
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      const xDrive = x * drive;
      curve[i] = Math.tanh(xDrive + asymmetry * Math.pow(xDrive, 2));
    }
    let max = 0;
    for (let i = 0; i < samples; i++) {
      if (Math.abs(curve[i]) > max) max = Math.abs(curve[i]);
    }
    if (max > 0) {
      for (let i = 0; i < samples; i++) curve[i] /= max;
    }
    return curve;
  }

  /**
   * Sets pitch based on normalized hand proximity [0, 1] and Clara Rockmore finger span [-1, 1]
   */
  public setPitch(handPos: number, fingerSpan = 0): number {
    const rawFreq = this.calculateRawFrequency(handPos, fingerSpan);
    const targetFreq = this.applyPitchAssist(rawFreq);
    this.currentFreq = targetFreq;

    if (this.ctx && this.isRunning && this.oscSine && this.oscHarmonic && this.lowpassFilter) {
      const now = this.ctx.currentTime;
      this.oscSine.frequency.setTargetAtTime(targetFreq, now, this.tauPitch);
      this.oscHarmonic.frequency.setTargetAtTime(targetFreq, now, this.tauPitch);

      // Resonant lowpass filter tracks fundamental pitch dynamically
      const filterCutoff = Math.min(8500, Math.max(420, targetFreq * 3.1));
      this.lowpassFilter.frequency.setTargetAtTime(filterCutoff, now, this.tauPitch);
    }

    return targetFreq;
  }

  /**
   * Sets volume based on normalized hand height above loop [0, 1]
   */
  public setVolume(handHeight: number, forceMute = false): number {
    const targetGain = forceMute ? 0.0 : this.calculateGain(handHeight);
    this.currentGain = targetGain;

    if (this.ctx && this.isRunning && this.vca) {
      const now = this.ctx.currentTime;
      this.vca.gain.setTargetAtTime(targetGain, now, this.tauVolume);
    }

    return targetGain;
  }

  public calculateRawFrequency(handPos: number, fingerSpan = 0): number {
    // Clara Rockmore aerial fingering modulates pitch by up to +/- 2.5 semitones
    const FINGER_SPAN_OCTAVE_WEIGHT = 0.048;
    const effectivePos = Math.min(
      1.0,
      Math.max(0.0, handPos + fingerSpan * FINGER_SPAN_OCTAVE_WEIGHT)
    );
    return this.fMin * Math.pow(this.fMax / this.fMin, effectivePos);
  }

  public calculateGain(handHeight: number): number {
    const MUTE_DEADBAND = 0.035;
    const clamped = Math.min(1.0, Math.max(0.0, handHeight));
    if (clamped <= MUTE_DEADBAND) return 0.0;
    const norm = (clamped - MUTE_DEADBAND) / (1.0 - MUTE_DEADBAND);
    // Smooth perceptual loudness taper
    return Math.pow(norm, 2.4);
  }

  public applyPitchAssist(rawFreq: number): number {
    if (
      this.quantizeMode === 'continuous' ||
      !this.activeScale ||
      this.activeScale.length === 0
    ) {
      return rawFreq;
    }

    const rawMidi = 69 + 12 * Math.log2(rawFreq / 440);
    const nearestScaleMidi = this.findNearestScaleMidi(rawMidi);

    if (this.quantizeMode === 'hard') {
      return 440 * Math.pow(2, (nearestScaleMidi - 69) / 12);
    }

    // Soft-Quantize: Monotonic Gaussian magnetic potential well
    const delta = rawMidi - nearestScaleMidi;
    const sigma = 0.24;
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
    if (!this.ctx || !this.isRunning) return;
    const now = this.ctx.currentTime;
    if (this.vca) {
      this.vca.gain.setTargetAtTime(0.0, now, 0.008);
    }
    this.isRunning = false;
    window.setTimeout(() => {
      if (!this.isRunning && this.ctx && this.ctx.state === 'running') {
        void this.ctx.suspend();
      }
    }, 45);
  }
}
