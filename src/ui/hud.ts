// ============================================================================
// ROY'S THEREMIN — LUXURY NEUMORPHIC CONSOLE & MINIMALIST HUD
// High-touch, sculptural 2026 audio-visual experience
// ============================================================================

import { ThereminEngine, SCALES } from '../audio/thereminEngine';
import type { HandTracker, HandGestureResult } from '../tracking/handTracker';

export class ThereminHUD {
  private container: HTMLElement;
  private engine: ThereminEngine;
  private tracker: HandTracker;

  // DOM Elements
  private noteNameEl!: HTMLElement;
  private freqEl!: HTMLElement;
  private centsNeedleEl!: HTMLElement;
  private centsTextEl!: HTMLElement;
  private centsMarkCenterEl!: HTMLElement;
  private vuFillEl!: HTMLElement;
  private vuValEl!: HTMLElement;
  private muteIndicatorEl!: HTMLElement;
  private oscCanvas!: HTMLCanvasElement;
  private oscCtx: CanvasRenderingContext2D | null = null;
  private hintLeftEl!: HTMLElement;
  private hintRightEl!: HTMLElement;
  private audioBtn!: HTMLButtonElement;
  private cameraBtn!: HTMLButtonElement;
  private guideModal!: HTMLElement;
  private cameraDockEl!: HTMLElement;
  private cameraLabelEl!: HTMLElement;

  private waveBuffer = new Uint8Array(256);
  private lastTunedState = false;

  constructor(container: HTMLElement, engine: ThereminEngine, tracker: HandTracker) {
    this.container = container;
    this.engine = engine;
    this.tracker = tracker;

    this.buildDOM();
    this.setupListeners();
  }

  private buildDOM(): void {
    this.container.innerHTML = `
      <!-- Top Navigation & Neumorphic Header Bar -->
      <header class="hud-header">
        <div class="brand-group">
          <div class="pilot-lamp">
            <span class="pilot-glow"></span>
          </div>
          <div class="brand-titles">
            <h1 class="brand-name">Roy’s Theremin</h1>
            <span class="brand-tag">Acoustic Field Synthesizer</span>
          </div>
        </div>

        <!-- Tactile Control Bar -->
        <div class="control-cluster">
          <!-- Audio Toggle Button -->
          <button id="btn-audio" class="neumorphic-btn btn-audio" aria-label="Toggle Audio">
            <span class="btn-dot"></span>
            <span class="btn-text">Audio</span>
          </button>

          <!-- Vision Tracking Button -->
          <button id="btn-camera" class="neumorphic-btn btn-camera" aria-label="Toggle Vision">
            <span class="btn-dot"></span>
            <span class="btn-text">Vision</span>
          </button>

          <!-- Segmented Scale Switch -->
          <div class="segmented-control">
            <button class="seg-btn active" data-mode="continuous">Analog</button>
            <button class="seg-btn" data-mode="soft">Magnetic</button>
            <button class="seg-btn" data-mode="pentatonic">Pentatonic</button>
          </div>

          <!-- Technique Guide Button -->
          <button id="btn-guide" class="neumorphic-btn btn-circle" title="Technique Guide" aria-label="Guide">
            <span class="info-mark">?</span>
          </button>
        </div>
      </header>

      <!-- Center Floating Sculptural Console -->
      <main class="console-viewport">
        <div class="sculptural-console">
          <!-- Top Row: Precision Pitch & Dynamics -->
          <div class="console-top-row">
            <!-- Left: Volume Dynamics -->
            <div class="dynamics-module">
              <div class="module-header">
                <span class="module-label">Amplitude</span>
                <span id="mute-indicator" class="mute-indicator">Muted</span>
              </div>
              <div class="groove-meter">
                <div id="vu-fill" class="groove-fill"></div>
              </div>
              <div class="module-footer">
                <span id="vu-val" class="sub-metric">0%</span>
                <span class="sub-legend">Loop Distance</span>
              </div>
            </div>

            <!-- Center: Prime Note & Frequency Display -->
            <div class="note-centerpiece">
              <div class="note-primary-wrap">
                <span id="note-name" class="note-primary">A4</span>
              </div>
              <div class="freq-caption">
                <span id="freq-text" class="freq-val">440.0</span>
                <span class="freq-unit">Hz</span>
              </div>
            </div>

            <!-- Right: Cathode Waveform Scope -->
            <div class="scope-module">
              <div class="module-header">
                <span class="module-label">Resonance</span>
                <span class="sub-legend">Triode Mix</span>
              </div>
              <div class="scope-aperture">
                <canvas id="osc-canvas" class="osc-canvas" width="160" height="38"></canvas>
              </div>
              <div class="module-footer">
                <span class="sub-metric">12AX7</span>
                <span class="sub-legend">4x Oversampled</span>
              </div>
            </div>
          </div>

          <!-- Bottom Row: Swiss Dial Cent Deviation Ruler -->
          <div class="cents-dial-row">
            <div class="cents-dial-container">
              <div class="cents-ruler">
                <span class="ruler-tick major">-50</span>
                <span class="ruler-tick">-25</span>
                <div id="cents-center-mark" class="ruler-center-mark">
                  <span class="center-notch"></span>
                </div>
                <span class="ruler-tick">+25</span>
                <span class="ruler-tick major">+50</span>
              </div>
              <div class="cents-track">
                <div id="cents-needle" class="cents-needle"></div>
              </div>
            </div>
            <div class="cents-readout">
              <span id="cents-text" class="cents-val">0 cents</span>
            </div>
          </div>
        </div>
      </main>

      <!-- Spatial Guidance Hints (Discreet, fade on engagement) -->
      <aside id="hint-left" class="spatial-hint hint-left">
        <span class="hint-key">Left Hand</span>
        <span class="hint-action">Elevate for volume · Clench fist to mute</span>
      </aside>

      <aside id="hint-right" class="spatial-hint hint-right">
        <span class="hint-key">Right Hand</span>
        <span class="hint-action">Proximity sets pitch · Finger pinch shapes vibrato</span>
      </aside>

      <!-- Minimalist Technique Modal -->
      <div id="guide-modal" class="modal-backdrop hidden">
        <div class="modal-card">
          <div class="modal-header">
            <div class="modal-title-group">
              <h2 class="modal-title">Léon Theremin & Clara Rockmore</h2>
              <span class="modal-subtitle">The Principles of Non-Contact Performance</span>
            </div>
            <button id="btn-close-guide" class="modal-close-btn" aria-label="Close">✕</button>
          </div>
          <div class="modal-content">
            <div class="guide-grid">
              <div class="guide-pillar">
                <div class="pillar-num">01</div>
                <h3 class="pillar-title">Right Hand: Aerial Fingering</h3>
                <p>Arm elevation and horizontal position define the base octave (C2 through C7). Microtonal semitones and Rockmore vibrato are articulated purely through finger span: open your hand to sharpen, curl inward to flatten.</p>
              </div>

              <div class="guide-pillar">
                <div class="pillar-num">02</div>
                <h3 class="pillar-title">Left Hand: The Inverted Loop</h3>
                <p>Resting your palm close to the loop grounds the capacitive field, resulting in complete silence (0 dB). Lift smoothly upward for crescendo. Form a loose fist or dip down for crisp staccato articulation.</p>
              </div>

              <div class="guide-pillar">
                <div class="pillar-num">03</div>
                <h3 class="pillar-title">Magnetic Pitch Assist</h3>
                <p>The continuous theremin is naturally fretless. For melodic intuition, engage <strong>Magnetic</strong> mode for gentle 12-EDO semitone centering, or <strong>Pentatonic</strong> for pure harmonic harmony.</p>
              </div>
            </div>
            <footer class="modal-footer">
              <span class="fallback-note">Desktop Note: You can also explore sounds by moving your mouse (Screen Right = Pitch, Screen Left = Volume, Click = Mute).</span>
            </footer>
          </div>
        </div>
      </div>
    `;

    // Query elements
    this.noteNameEl = this.container.querySelector('#note-name')!;
    this.freqEl = this.container.querySelector('#freq-text')!;
    this.centsNeedleEl = this.container.querySelector('#cents-needle')!;
    this.centsTextEl = this.container.querySelector('#cents-text')!;
    this.centsMarkCenterEl = this.container.querySelector('#cents-center-mark')!;
    this.vuFillEl = this.container.querySelector('#vu-fill')!;
    this.vuValEl = this.container.querySelector('#vu-val')!;
    this.muteIndicatorEl = this.container.querySelector('#mute-indicator')!;
    this.oscCanvas = this.container.querySelector('#osc-canvas') as HTMLCanvasElement;
    this.oscCtx = this.oscCanvas.getContext('2d');
    this.hintLeftEl = this.container.querySelector('#hint-left')!;
    this.hintRightEl = this.container.querySelector('#hint-right')!;
    this.audioBtn = this.container.querySelector('#btn-audio') as HTMLButtonElement;
    this.cameraBtn = this.container.querySelector('#btn-camera') as HTMLButtonElement;
    this.guideModal = this.container.querySelector('#guide-modal')!;

    this.cameraDockEl = document.getElementById('camera-dock')!;
    this.cameraLabelEl = document.getElementById('camera-label')!;
  }

  private setupListeners(): void {
    // Audio toggle
    this.audioBtn.addEventListener('click', async () => {
      const isRunning = this.engine.getIsRunning();
      if (!isRunning) {
        await this.engine.initAudio();
        this.audioBtn.classList.add('active');
      } else {
        this.engine.stop();
        this.audioBtn.classList.remove('active');
      }
    });

    // Camera toggle
    this.cameraBtn.addEventListener('click', async () => {
      this.cameraBtn.disabled = true;
      const active = await this.tracker.toggleCamera();
      this.cameraBtn.disabled = false;

      if (active) {
        this.cameraBtn.classList.add('active');
        this.cameraDockEl.classList.add('active');
        if (this.cameraLabelEl) this.cameraLabelEl.textContent = 'Tracking Active';
      } else {
        this.cameraBtn.classList.remove('active');
        this.cameraDockEl.classList.remove('active');
        if (this.cameraLabelEl) this.cameraLabelEl.textContent = 'Tracking Idle';
      }
    });

    // Segmented Mode buttons
    const segButtons = this.container.querySelectorAll<HTMLButtonElement>('.seg-btn');
    segButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        segButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.mode;
        if (mode === 'continuous') {
          this.engine.quantizeMode = 'continuous';
          this.engine.activeScale = SCALES.CHROMATIC;
        } else if (mode === 'soft') {
          this.engine.quantizeMode = 'soft';
          this.engine.activeScale = SCALES.CHROMATIC;
        } else if (mode === 'pentatonic') {
          this.engine.quantizeMode = 'soft';
          this.engine.activeScale = SCALES.PENTATONIC_MAJ;
        }
      });
    });

    // Guide Modal
    const guideBtn = this.container.querySelector('#btn-guide')!;
    const closeBtn = this.container.querySelector('#btn-close-guide')!;
    guideBtn.addEventListener('click', () => this.guideModal.classList.remove('hidden'));
    closeBtn.addEventListener('click', () => this.guideModal.classList.add('hidden'));
    this.guideModal.addEventListener('click', (e) => {
      if (e.target === this.guideModal) this.guideModal.classList.add('hidden');
    });
  }

  // --------------------------------------------------------------------------
  // PER-FRAME UPDATE LOOP
  // --------------------------------------------------------------------------
  public update(gestures: HandGestureResult, targetFreq: number, currentGain: number): void {
    // 1. Note & Frequency Display
    const noteInfo = ThereminEngine.detectNote(targetFreq);
    this.noteNameEl.textContent = noteInfo.noteName;
    this.freqEl.textContent = targetFreq.toFixed(1);

    // Cent Deviation Needle
    const centsClamped = Math.max(-50, Math.min(50, noteInfo.cents));
    const needlePercent = ((centsClamped + 50) / 100) * 100;
    this.centsNeedleEl.style.left = `${needlePercent}%`;

    const isTuned = Math.abs(noteInfo.cents) <= 6;
    if (isTuned !== this.lastTunedState) {
      this.lastTunedState = isTuned;
      if (isTuned) {
        this.centsNeedleEl.classList.add('tuned');
        this.noteNameEl.classList.add('tuned');
        this.centsMarkCenterEl.classList.add('tuned');
      } else {
        this.centsNeedleEl.classList.remove('tuned');
        this.noteNameEl.classList.remove('tuned');
        this.centsMarkCenterEl.classList.remove('tuned');
      }
    }

    const sign = noteInfo.cents > 0 ? '+' : '';
    this.centsTextEl.textContent = isTuned ? `In Tune (±${Math.abs(noteInfo.cents)}c)` : `${sign}${noteInfo.cents}c`;

    // 2. Dynamics / Volume Meter
    const volumePercent = Math.min(100, Math.max(0, currentGain * 100));
    this.vuFillEl.style.width = `${volumePercent}%`;
    this.vuValEl.textContent = `${Math.round(volumePercent)}%`;

    const isMuted = gestures.isFistMuted || currentGain < 0.015;
    if (isMuted) {
      this.muteIndicatorEl.classList.add('active');
    } else {
      this.muteIndicatorEl.classList.remove('active');
    }

    // 3. Spatial Hint Fading
    if (gestures.hasVolumeHand) {
      this.hintLeftEl.classList.add('dimmed');
    } else {
      this.hintLeftEl.classList.remove('dimmed');
    }

    if (gestures.hasPitchHand) {
      this.hintRightEl.classList.add('dimmed');
    } else {
      this.hintRightEl.classList.remove('dimmed');
    }

    // 4. Oscilloscope
    this.drawOscilloscope(currentGain);
  }

  private drawOscilloscope(gain: number): void {
    const ctx = this.oscCtx;
    if (!ctx) return;
    const w = this.oscCanvas.width;
    const h = this.oscCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Subtle horizontal baseline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    if (gain < 0.005) {
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      return;
    }

    this.engine.getWaveformData(this.waveBuffer);

    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#f59e0b'; // Warm incandescent tube waveform
    ctx.shadowBlur = 6;
    ctx.shadowColor = 'rgba(245, 158, 11, 0.5)';
    ctx.beginPath();

    const sliceWidth = w / this.waveBuffer.length;
    let x = 0;

    for (let i = 0; i < this.waveBuffer.length; i++) {
      const v = this.waveBuffer[i] / 128.0;
      const y = (v * h) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}
