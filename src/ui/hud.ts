// ============================================================================
// ROY'S THEREMIN — LUXURY NEUMORPHIC CONSOLE & MINIMALIST HUD (v2)
// High-touch, sculptural 2026 audio-visual experience with Voice Profiles,
// Spatial Calibration, and 3D Tracking Telemetry
// ============================================================================

import { ThereminEngine, SCALES, type VoiceProfile } from '../audio/thereminEngine';
import type { HandTracker, HandGestureResult } from '../tracking/handTracker';

const VOICE_LABELS: Record<VoiceProfile, string> = {
  clara: 'Clara String',
  aether: 'Pure Aether',
  vocal: 'Vocal Choir',
  moog: 'Moog Brass',
};

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
  private trackingBadgeEl!: HTMLElement;
  private voiceLegendEl!: HTMLElement;
  private oscCanvas!: HTMLCanvasElement;
  private oscCtx: CanvasRenderingContext2D | null = null;
  private hintLeftEl!: HTMLElement;
  private hintRightEl!: HTMLElement;
  private audioBtn!: HTMLButtonElement;
  private cameraBtn!: HTMLButtonElement;
  private calibrateBtn!: HTMLButtonElement;
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
            <span class="brand-tag">Acoustic Field Synthesizer · v2</span>
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

          <!-- Spatial Calibrate Button -->
          <button id="btn-calibrate" class="neumorphic-btn btn-calibrate" title="Calibrate hand neutral center" aria-label="Calibrate">
            <span class="btn-text">Calibrate</span>
          </button>

          <!-- Segmented Voice Profile Selector -->
          <div class="segmented-control voice-control" role="group" aria-label="Voice Timbre">
            <button class="seg-btn voice-btn active" data-voice="clara" title="Clara Rockmore Warm Cello Formant">Clara</button>
            <button class="seg-btn voice-btn" data-voice="aether" title="1929 RCA Pure Heterodyne Tube">Aether</button>
            <button class="seg-btn voice-btn" data-voice="vocal" title="Soprano Choir Vowel Formants">Vocal</button>
            <button class="seg-btn voice-btn" data-voice="moog" title="Moog Etherwave Rich Brass">Moog</button>
          </div>

          <!-- Segmented Scale Switch -->
          <div class="segmented-control scale-control" role="group" aria-label="Pitch Quantization">
            <button class="seg-btn scale-btn active" data-mode="continuous">Analog</button>
            <button class="seg-btn scale-btn" data-mode="soft">Magnetic</button>
            <button class="seg-btn scale-btn" data-mode="pentatonic">Pentatonic</button>
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
                <span id="tracking-badge" class="sub-legend">Pointer Field</span>
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
                <span id="voice-legend" class="sub-legend">Clara String</span>
              </div>
              <div class="scope-aperture">
                <canvas id="osc-canvas" class="osc-canvas" width="160" height="38"></canvas>
              </div>
              <div class="module-footer">
                <span class="sub-metric">12AX7</span>
                <span class="sub-legend">Hall Convolver</span>
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
        <span class="hint-key">Left Hand · Volume Loop</span>
        <span class="hint-action">Elevate for crescendo · Clench fist to mute</span>
      </aside>

      <aside id="hint-right" class="spatial-hint hint-right">
        <span class="hint-key">Right Hand · Pitch Rod</span>
        <span class="hint-action">Move right to raise pitch · Finger span shapes vibrato</span>
      </aside>

      <!-- Minimalist Technique Modal -->
      <div id="guide-modal" class="modal-backdrop hidden">
        <div class="modal-card">
          <div class="modal-header">
            <div class="modal-title-group">
              <h2 class="modal-title">Léon Theremin & Clara Rockmore</h2>
              <span class="modal-subtitle">Precision 3D Non-Contact Performance · v2</span>
            </div>
            <button id="btn-close-guide" class="modal-close-btn" aria-label="Close">✕</button>
          </div>
          <div class="modal-content">
            <div class="guide-grid">
              <div class="guide-pillar">
                <div class="pillar-num">01</div>
                <h3 class="pillar-title">Right Hand: 1:1 Spatial Pitch & Aerial Fingering</h3>
                <p>Moving your right hand toward the vertical pitch rod on the right raises the pitch from C2 to C7 with zero-latency 1€ adaptive filtering. Open or pinch your thumb and index finger to articulate Clara Rockmore microtonal vibrato independent of camera depth.</p>
              </div>

              <div class="guide-pillar">
                <div class="pillar-num">02</div>
                <h3 class="pillar-title">Left Hand: Volume Loop & Single-Hand Assist</h3>
                <p>Hovering near the left horizontal loop grounds the field (silence); lifting upward swells the volume. Clench a fist for crisp staccato mute. If only your right hand is raised, <strong>Single-Hand Assist</strong> automatically shapes expression from hand elevation.</p>
              </div>

              <div class="guide-pillar">
                <div class="pillar-num">03</div>
                <h3 class="pillar-title">Formant Voices & Spatial Calibration</h3>
                <p>Switch between <strong>Clara</strong> (warm cello), <strong>Aether</strong> (1929 RCA tube), <strong>Vocal</strong> (choir formants), and <strong>Moog</strong> (rich brass). Click <strong>Calibrate</strong> while holding your hands in a comfortable posture to center the sensing field to your space.</p>
              </div>
            </div>
            <footer class="modal-footer">
              <span class="fallback-note">Desktop Pointer Mode: Move mouse horizontally for Pitch, vertically for Volume, Scroll Wheel for Vibrato, and Click or press Spacebar for Staccato Mute. Click the camera dock to expand.</span>
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
    this.trackingBadgeEl = this.container.querySelector('#tracking-badge')!;
    this.voiceLegendEl = this.container.querySelector('#voice-legend')!;
    this.oscCanvas = this.container.querySelector('#osc-canvas') as HTMLCanvasElement;
    this.oscCtx = this.oscCanvas.getContext('2d');
    this.hintLeftEl = this.container.querySelector('#hint-left')!;
    this.hintRightEl = this.container.querySelector('#hint-right')!;
    this.audioBtn = this.container.querySelector('#btn-audio') as HTMLButtonElement;
    this.cameraBtn = this.container.querySelector('#btn-camera') as HTMLButtonElement;
    this.calibrateBtn = this.container.querySelector('#btn-calibrate') as HTMLButtonElement;
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
        // Also ensure audio is started when user engages Vision so they immediately hear their hands
        if (!this.engine.getIsRunning()) {
          await this.engine.initAudio();
          this.audioBtn.classList.add('active');
        }
        this.cameraBtn.classList.add('active');
        this.cameraDockEl.classList.add('active');
        if (this.cameraLabelEl) this.cameraLabelEl.textContent = '1€ Tracking Active';
      } else {
        this.cameraBtn.classList.remove('active');
        this.cameraDockEl.classList.remove('active');
        if (this.cameraLabelEl) this.cameraLabelEl.textContent = 'Tracking Idle';
      }
    });

    // Spatial Calibrate button
    this.calibrateBtn.addEventListener('click', () => {
      const labelSpan = this.calibrateBtn.querySelector('.btn-text');
      const result = this.tracker.calibrateSpace();
      if (result.calibrated) {
        this.calibrateBtn.classList.add('active');
        if (labelSpan) labelSpan.textContent = 'Calibrated';
        setTimeout(() => {
          if (labelSpan) labelSpan.textContent = 'Calibrate';
        }, 1600);
      } else {
        this.calibrateBtn.classList.remove('active');
        if (labelSpan) labelSpan.textContent = 'Reset';
        setTimeout(() => {
          if (labelSpan) labelSpan.textContent = 'Calibrate';
        }, 1200);
      }
    });

    // Click camera dock to toggle expanded preview
    this.cameraDockEl.addEventListener('click', () => {
      this.cameraDockEl.classList.toggle('expanded');
      const isExpanded = this.cameraDockEl.classList.contains('expanded');
      this.tracker.resize(isExpanded ? 320 : 220, isExpanded ? 180 : 124);
    });

    // Voice Profile buttons
    const voiceButtons = this.container.querySelectorAll<HTMLButtonElement>('.voice-btn');
    voiceButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        voiceButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const voiceId = (btn.dataset.voice || 'clara') as VoiceProfile;
        this.engine.setVoiceProfile(voiceId);
        this.voiceLegendEl.textContent = VOICE_LABELS[voiceId];
      });
    });

    // Segmented Scale buttons
    const scaleButtons = this.container.querySelectorAll<HTMLButtonElement>('.scale-btn');
    scaleButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        scaleButtons.forEach((b) => b.classList.remove('active'));
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
    this.centsTextEl.textContent = isTuned
      ? `In Tune (±${Math.abs(noteInfo.cents)}c)`
      : `${sign}${noteInfo.cents}c`;

    // 2. Dynamics / Volume Meter & Tracking Mode Telemetry
    const volumePercent = Math.min(100, Math.max(0, currentGain * 100));
    this.vuFillEl.style.width = `${volumePercent}%`;
    this.vuValEl.textContent = `${Math.round(volumePercent)}%`;

    if (this.tracker.getIsCameraActive()) {
      if (gestures.inputMode === 'camera-single') {
        this.trackingBadgeEl.textContent = '1-Hand Assist';
      } else if (gestures.hasPitchHand && gestures.hasVolumeHand) {
        this.trackingBadgeEl.textContent = 'Dual-Hand 3D';
      } else {
        this.trackingBadgeEl.textContent = 'Vision Ready';
      }
    } else {
      this.trackingBadgeEl.textContent = 'Pointer Field';
    }

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
