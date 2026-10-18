// ============================================================================
// ROY'S ATELIER OF SPATIAL INSTRUMENTS — NEUMORPHIC CONSOLE & HUD (v3)
// 5-Instrument Stage Carousel with Zero-Click Overhead Portal & Wrist-Cross Navigation
// ============================================================================

import type { HandTracker, HandGestureResult } from '../tracking/handTracker';
import type { InstrumentId } from '../types/atelier';
import { INSTRUMENT_MANIFEST } from '../types/atelier';

export class ThereminHUD {
  private container: HTMLElement;
  private tracker: HandTracker;
  private onSelectInstrument?: (id: InstrumentId) => void;
  private onToggleAudio?: () => Promise<boolean>;

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
  private instTitleEl!: HTMLElement;
  private instYearEl!: HTMLElement;
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
  private stagePills: Record<InstrumentId, HTMLButtonElement> = {} as any;
  private portalDwellBar!: HTMLElement;

  private waveBuffer = new Uint8Array(256);
  private lastTunedState = false;
  private currentActiveInstrument: InstrumentId = 'theremin';

  constructor(
    container: HTMLElement,
    tracker: HandTracker,
    onSelectInstrument?: (id: InstrumentId) => void,
    onToggleAudio?: () => Promise<boolean>
  ) {
    this.container = container;
    this.tracker = tracker;
    this.onSelectInstrument = onSelectInstrument;
    this.onToggleAudio = onToggleAudio;

    this.buildDOM();
    this.setupListeners();
  }

  private buildDOM(): void {
    this.container.innerHTML = `
      <!-- Top Navigation & Neumorphic 5-Instrument Stage Bar -->
      <header class="hud-header">
        <div class="brand-group">
          <div class="pilot-lamp">
            <span class="pilot-glow"></span>
          </div>
          <div class="brand-titles">
            <h1 class="brand-name">Roy’s Atelier</h1>
            <span class="brand-tag">Spatial Instruments · v3</span>
          </div>
        </div>

        <!-- 5-Instrument Stage Carousel Navigation -->
        <div class="stage-nav-cluster">
          <div class="portal-guidance-pill" title="Raise either hand above this bar or cross wrists to switch">
            <span class="portal-spark">✦</span>
            <span class="portal-text">Zero-Click Stage: Hover at top or cross wrists to switch</span>
          </div>
          <div class="stage-segmented-control" role="tablist" aria-label="Instruments Stage">
            <button class="stage-btn active" data-inst="theremin" id="pill-theremin">
              <span class="stage-dot" style="background: #f59e0b"></span>
              <span class="stage-label">Theremin</span>
            </button>
            <button class="stage-btn" data-inst="cristal" id="pill-cristal">
              <span class="stage-dot" style="background: #38bdf8"></span>
              <span class="stage-label">Cristal</span>
            </button>
            <button class="stage-btn" data-inst="handpan" id="pill-handpan">
              <span class="stage-dot" style="background: #10b981"></span>
              <span class="stage-label">Handpan</span>
            </button>
            <button class="stage-btn" data-inst="martenot" id="pill-martenot">
              <span class="stage-dot" style="background: #ec4899"></span>
              <span class="stage-label">Martenot</span>
            </button>
            <button class="stage-btn" data-inst="laserharp" id="pill-laserharp">
              <span class="stage-dot" style="background: #8b5cf6"></span>
              <span class="stage-label">Laser Harp</span>
            </button>
            <div id="portal-dwell-bar" class="portal-dwell-bar"></div>
          </div>
        </div>

        <!-- System Controls -->
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
          <button id="btn-calibrate" class="neumorphic-btn btn-calibrate" title="Calibrate reach" aria-label="Calibrate">
            <span class="btn-text">Calibrate</span>
          </button>

          <!-- Technique Guide Button -->
          <button id="btn-guide" class="neumorphic-btn btn-circle" title="Organology Guide" aria-label="Guide">
            <span class="info-mark">?</span>
          </button>
        </div>
      </header>

      <!-- Center Floating Sculptural Console -->
      <main class="console-viewport">
        <div class="sculptural-console">
          <!-- Top Row: Precision Pitch & Dynamics -->
          <div class="console-top-row">
            <!-- Left: Dynamics -->
            <div class="dynamics-module">
              <div class="module-header">
                <span class="module-label">Kinetic Amplitude</span>
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
              <div class="inst-subtitle-badge">
                <span id="inst-title" class="inst-title">Moog Etherwave</span>
                <span id="inst-year" class="inst-year">1929 / 1996</span>
              </div>
            </div>

            <!-- Right: Cathode Waveform Scope -->
            <div class="scope-module">
              <div class="module-header">
                <span class="module-label">Acoustic Core</span>
                <span id="voice-legend" class="sub-legend">Heterodyne Dual Osc</span>
              </div>
              <div class="scope-aperture">
                <canvas id="osc-canvas" class="osc-canvas" width="160" height="38"></canvas>
              </div>
              <div class="module-footer">
                <span class="sub-metric">Stereo Convolver</span>
                <span class="sub-legend">Concert Hall</span>
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

      <!-- Spatial Guidance Hints -->
      <aside id="hint-left" class="spatial-hint hint-left">
        <span class="hint-key">Left Hand</span>
        <span class="hint-action" id="hint-left-action">Left: Elevate for volume · Fist to staccato mute</span>
      </aside>

      <aside id="hint-right" class="spatial-hint hint-right">
        <span class="hint-key">Right Hand</span>
        <span class="hint-action" id="hint-right-action">Right: Proximity sets pitch · Finger pinch shapes vibrato</span>
      </aside>

      <!-- Organology & Technique Modal -->
      <div id="guide-modal" class="modal-backdrop hidden">
        <div class="modal-card">
          <div class="modal-header">
            <div class="modal-title-group">
              <h2 class="modal-title">Roy’s Atelier of Spatial Instruments</h2>
              <span class="modal-subtitle">Organology, 1€ Kinematics & Zero-Click Navigation</span>
            </div>
            <button id="btn-close-guide" class="modal-close-btn" aria-label="Close">✕</button>
          </div>
          <div class="modal-content">
            <div class="guide-grid">
              <div class="guide-pillar">
                <div class="pillar-num">01</div>
                <h3 class="pillar-title">Zero-Click Stage Navigation</h3>
                <p>Raise either hand into the <strong>top Crown Portal</strong> above the stage pills to fill the golden dwell ring (0.75s) and switch instruments hands-free. Or cross both wrists in front of the camera for 0.6s to quick-cycle to the next instrument.</p>
              </div>

              <div class="guide-pillar">
                <div class="pillar-num">02</div>
                <h3 class="pillar-title">5 Rare World Instruments</h3>
                <p><strong>Theremin (1929):</strong> Capacitive proximity pitch & volume.<br/>
                   <strong>Cristal Baschet (1952):</strong> Tangential rubbing velocity excites 12 glass rods.<br/>
                   <strong>Swiss Handpan (2000):</strong> Mid-air downward acceleration strike on 9 tone fields.<br/>
                   <strong>Ondes Martenot (1928):</strong> Sliding ribbon ring pitch + Touche expression drawer.<br/>
                   <strong>Laser Harp (1981):</strong> Break and pluck 10 volumetric light beams in mid-air.</p>
              </div>

              <div class="guide-pillar">
                <div class="pillar-num">03</div>
                <h3 class="pillar-title">Zero Physical Resistance (Air Physics)</h3>
                <p>Unlike virtual pianos, every instrument in Roy’s Atelier was specifically selected because continuous spatial movement, friction, and acceleration define its authentic acoustic physics.</p>
              </div>
            </div>
            <footer class="modal-footer">
              <span class="fallback-note">Desktop: Move mouse to play · Scroll wheel for vibrato · Click/Space to mute or strike Handpan. Click stage pills to switch directly.</span>
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
    this.instTitleEl = this.container.querySelector('#inst-title')!;
    this.instYearEl = this.container.querySelector('#inst-year')!;
    this.oscCanvas = this.container.querySelector('#osc-canvas') as HTMLCanvasElement;
    this.oscCtx = this.oscCanvas.getContext('2d');
    this.hintLeftEl = this.container.querySelector('#hint-left-action')!;
    this.hintRightEl = this.container.querySelector('#hint-right-action')!;
    this.audioBtn = this.container.querySelector('#btn-audio') as HTMLButtonElement;
    this.cameraBtn = this.container.querySelector('#btn-camera') as HTMLButtonElement;
    this.calibrateBtn = this.container.querySelector('#btn-calibrate') as HTMLButtonElement;
    this.guideModal = this.container.querySelector('#guide-modal')!;
    this.portalDwellBar = this.container.querySelector('#portal-dwell-bar')!;

    this.cameraDockEl = document.getElementById('camera-dock')!;
    this.cameraLabelEl = document.getElementById('camera-label')!;

    const ids: InstrumentId[] = ['theremin', 'cristal', 'handpan', 'martenot', 'laserharp'];
    for (const id of ids) {
      this.stagePills[id] = this.container.querySelector(`#pill-${id}`) as HTMLButtonElement;
    }
  }

  private setupListeners(): void {
    // Stage navigation buttons (click fallback)
    const ids: InstrumentId[] = ['theremin', 'cristal', 'handpan', 'martenot', 'laserharp'];
    for (const id of ids) {
      const btn = this.stagePills[id];
      if (btn) {
        btn.addEventListener('click', () => {
          this.setActiveInstrument(id);
          if (this.onSelectInstrument) {
            this.onSelectInstrument(id);
          }
        });
      }
    }

    // Audio toggle
    this.audioBtn.addEventListener('click', async () => {
      if (this.onToggleAudio) {
        const active = await this.onToggleAudio();
        if (active) this.audioBtn.classList.add('active');
        else this.audioBtn.classList.remove('active');
      }
    });

    // Camera toggle
    this.cameraBtn.addEventListener('click', async () => {
      this.cameraBtn.disabled = true;
      const active = await this.tracker.toggleCamera();
      this.cameraBtn.disabled = false;

      if (active) {
        if (this.onToggleAudio) {
          await this.onToggleAudio();
          this.audioBtn.classList.add('active');
        }
        this.cameraBtn.classList.add('active');
        this.cameraDockEl.classList.add('active');
        if (this.cameraLabelEl) this.cameraLabelEl.textContent = '1€ Kinematics Active';
      } else {
        this.cameraBtn.classList.remove('active');
        this.cameraDockEl.classList.remove('active');
        if (this.cameraLabelEl) this.cameraLabelEl.textContent = 'Tracking Idle';
      }
    });

    // Calibration
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

    // Camera dock expand
    this.cameraDockEl.addEventListener('click', () => {
      this.cameraDockEl.classList.toggle('expanded');
      const isExpanded = this.cameraDockEl.classList.contains('expanded');
      this.tracker.resize(isExpanded ? 320 : 220, isExpanded ? 180 : 124);
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

  public setActiveInstrument(id: InstrumentId): void {
    if (this.currentActiveInstrument === id) return;
    this.currentActiveInstrument = id;

    // Update active pill
    for (const [btnId, btn] of Object.entries(this.stagePills)) {
      if (btnId === id) btn.classList.add('active');
      else btn.classList.remove('active');
    }

    const manifest = INSTRUMENT_MANIFEST[id];
    this.instTitleEl.textContent = manifest.name;
    this.instYearEl.textContent = manifest.year;
    this.voiceLegendEl.textContent = manifest.category;

    this.hintLeftEl.textContent = manifest.leftHint;
    this.hintRightEl.textContent = manifest.rightHint;
  }

  // --------------------------------------------------------------------------
  // PER-FRAME UPDATE LOOP
  // --------------------------------------------------------------------------
  public update(
    gestures: HandGestureResult,
    targetFreq: number,
    currentGain: number,
    activeInstrumentId: InstrumentId,
    getWaveformData: (buf: Uint8Array) => void
  ): void {
    if (this.currentActiveInstrument !== activeInstrumentId) {
      this.setActiveInstrument(activeInstrumentId);
    }

    // 1. Note & Frequency Display
    this.freqEl.textContent = targetFreq.toFixed(1);

    // Cent Deviation Needle
    const noteInfo = this.detectNote(targetFreq);
    this.noteNameEl.textContent = noteInfo.name;

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

    // 2. Dynamics / Volume Meter & Tracking Mode
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

    // 3. Overhead Crown Portal Dwell Progress Visualizer
    const portal = gestures.portalState;
    if (portal && portal.isActive && portal.targetInstrument) {
      const targetPill = this.stagePills[portal.targetInstrument];
      if (targetPill) {
        const rect = targetPill.getBoundingClientRect();
        const parentRect = this.portalDwellBar.parentElement?.getBoundingClientRect() || { left: 0 };
        const leftOffset = rect.left - parentRect.left;
        this.portalDwellBar.style.left = `${leftOffset}px`;
        this.portalDwellBar.style.width = `${rect.width * portal.progress}px`;
        this.portalDwellBar.style.opacity = '1';
      }
    } else {
      this.portalDwellBar.style.opacity = '0';
      this.portalDwellBar.style.width = '0px';
    }

    // 4. Oscilloscope
    this.drawOscilloscope(currentGain, getWaveformData);
  }

  private detectNote(freq: number): { name: string; cents: number } {
    if (freq <= 0) return { name: '--', cents: 0 };
    const semitonesFromA4 = 12 * Math.log2(freq / 440);
    const midi = Math.round(69 + semitonesFromA4);
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const name = `${noteNames[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
    const targetFreq = 440 * Math.pow(2, (midi - 69) / 12);
    const cents = Math.round(1200 * Math.log2(freq / targetFreq));
    return { name, cents };
  }

  private drawOscilloscope(gain: number, getWaveformData: (buf: Uint8Array) => void): void {
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

    getWaveformData(this.waveBuffer);

    const manifest = INSTRUMENT_MANIFEST[this.currentActiveInstrument];
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = manifest.accentColor;
    ctx.shadowBlur = 6;
    ctx.shadowColor = manifest.accentColor;
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
