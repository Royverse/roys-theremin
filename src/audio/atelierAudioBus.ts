// ============================================================================
// ATELIER SHARED AUDIO BUS & MASTER ACOUSTIC ENVIRONMENT
// Manages single AudioContext, stereo concert hall convolver, master limiter,
// and crossfading between active spatial instruments.
// ============================================================================

import { createConcertHallImpulse } from './impulseReverb';

export class AtelierAudioBus {
  private ctx: AudioContext | null = null;
  private isRunning = false;

  private masterInput: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  public async initAudio(): Promise<AudioContext> {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtxClass();
      this.buildGraph();
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.isRunning = true;
    return this.ctx;
  }

  private buildGraph(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // Master input node for all instrument engines
    this.masterInput = ctx.createGain();
    this.masterInput.gain.value = 1.0;

    // Convolver & Dry/Wet
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = createConcertHallImpulse(ctx, 2.2, 2.6);

    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 0.82;

    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0.28;

    this.masterInput.connect(this.dryGain);
    this.masterInput.connect(this.convolver);
    this.convolver.connect(this.wetGain);

    // Master Compressor / Limiter
    this.masterCompressor = ctx.createDynamicsCompressor();
    this.masterCompressor.threshold.value = -4.0;
    this.masterCompressor.knee.value = 8.0;
    this.masterCompressor.ratio.value = 6.0;
    this.masterCompressor.attack.value = 0.003;
    this.masterCompressor.release.value = 0.08;

    this.dryGain.connect(this.masterCompressor);
    this.wetGain.connect(this.masterCompressor);

    // Analyser Node for HUD Oscilloscope
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.82;

    // Master Volume Out
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.88;

    this.masterCompressor.connect(this.analyser);
    this.analyser.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  public getMasterInput(): AudioNode | null {
    return this.masterInput;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public getWaveformData(outputArray: Uint8Array): void {
    if (this.analyser) {
      this.analyser.getByteTimeDomainData(outputArray as unknown as Uint8Array<ArrayBuffer>);
    } else {
      outputArray.fill(128);
    }
  }

  public stop(): void {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend();
    }
    this.isRunning = false;
  }
}
