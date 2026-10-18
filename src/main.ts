// ============================================================================
// ROY'S ATELIER OF SPATIAL INSTRUMENTS (v3.0) — APPLICATION ORCHESTRATOR
// Master coordinator for 5 spatial instruments, 3D revolving stage,
// 1€ kinematics, and zero-click gesture navigation.
// ============================================================================

import './style.css';
import * as THREE from 'three';
import type { InstrumentId } from './types/atelier';
import { AtelierAudioBus } from './audio/atelierAudioBus';
import { ThereminEngine } from './audio/thereminEngine';
import { CristalEngine } from './audio/instruments/cristalEngine';
import { HandpanEngine } from './audio/instruments/handpanEngine';
import { MartenotEngine } from './audio/instruments/martenotEngine';
import { LaserHarpEngine } from './audio/instruments/laserHarpEngine';

import { StageCarousel3D } from './scene/stageCarousel3D';
import { HandRig3D } from './scene/handRig3D';
import { HandTracker } from './tracking/handTracker';
import { ThereminHUD } from './ui/hud';

class SpatialAtelierApp {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;

  // Master Audio Bus & 5 Instrument Engines
  private audioBus!: AtelierAudioBus;
  private thereminEngine!: ThereminEngine;
  private cristalEngine!: CristalEngine;
  private handpanEngine!: HandpanEngine;
  private martenotEngine!: MartenotEngine;
  private laserHarpEngine!: LaserHarpEngine;

  // Tracking, 3D Stage & HUD
  private tracker!: HandTracker;
  private stageCarousel!: StageCarousel3D;
  private handRig3D!: HandRig3D;
  private hud!: ThereminHUD;

  private clock = new THREE.Clock();
  private mouse = { x: 0, y: 0 };
  private activeInstrumentId: InstrumentId = 'theremin';

  constructor() {
    this.initAudioEngines();
    this.initThreeScene();
    this.initTrackerAndHUD();
    this.setupWindowListeners();
    this.animate();
  }

  // --------------------------------------------------------------------------
  // AUDIO ENGINES SETUP
  // --------------------------------------------------------------------------
  private initAudioEngines(): void {
    this.audioBus = new AtelierAudioBus();
    this.thereminEngine = new ThereminEngine();
    this.cristalEngine = new CristalEngine();
    this.handpanEngine = new HandpanEngine();
    this.martenotEngine = new MartenotEngine();
    this.laserHarpEngine = new LaserHarpEngine();
  }

  private async activateAudio(): Promise<boolean> {
    try {
      const ctx = await this.audioBus.initAudio();
      const masterIn = this.audioBus.getMasterInput();
      if (!masterIn) return false;

      // Connect Theremin
      await this.thereminEngine.initAudio();

      // Connect other 4 engines
      this.cristalEngine.initAudio(ctx, masterIn);
      this.handpanEngine.initAudio(ctx, masterIn);
      this.martenotEngine.initAudio(ctx, masterIn);
      this.laserHarpEngine.initAudio(ctx, masterIn);

      return true;
    } catch (err) {
      console.error('Audio initialization error:', err);
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // THREE.JS 3D SCENE & LIGHTING SETUP
  // --------------------------------------------------------------------------
  private initThreeScene(): void {
    const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07090c);
    this.scene.fog = new THREE.FogExp2(0x07090c, 0.42);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      42,
      window.innerWidth / window.innerHeight,
      0.05,
      50
    );
    this.camera.position.set(0, 0.32, 0.92);
    this.camera.lookAt(0, 0.12, 0);

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0x1e2430, 0x090a0d, 0.9);
    this.scene.add(hemiLight);

    const keySpot = new THREE.SpotLight(0xffedd5, 95);
    keySpot.position.set(1.2, 2.6, 1.8);
    keySpot.angle = Math.PI / 4.2;
    keySpot.penumbra = 0.6;
    keySpot.castShadow = true;
    keySpot.shadow.mapSize.width = 2048;
    keySpot.shadow.mapSize.height = 2048;
    keySpot.shadow.camera.near = 0.5;
    keySpot.shadow.camera.far = 6;
    keySpot.shadow.bias = -0.0008;
    this.scene.add(keySpot);

    const rimSpot = new THREE.SpotLight(0x93c5fd, 38);
    rimSpot.position.set(-2.2, 1.6, -1.0);
    rimSpot.angle = Math.PI / 4;
    rimSpot.penumbra = 0.7;
    this.scene.add(rimSpot);

    const fillLight = new THREE.PointLight(0xf59e0b, 1.4, 3.5);
    fillLight.position.set(0, -0.12, 0.65);
    this.scene.add(fillLight);

    // Matte Studio Pedestal
    const floorGeo = new THREE.CylinderGeometry(3.6, 3.6, 0.05, 64);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0b0d11,
      roughness: 0.85,
      metalness: 0.1,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -0.78;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Revolving Stage Carousel & 3D Hand Skeleton Rig
    this.stageCarousel = new StageCarousel3D();
    this.scene.add(this.stageCarousel.group);

    this.handRig3D = new HandRig3D();
    this.scene.add(this.handRig3D.group);
  }

  // --------------------------------------------------------------------------
  // TRACKER & HUD SETUP
  // --------------------------------------------------------------------------
  private initTrackerAndHUD(): void {
    const video = document.getElementById('webcam-video') as HTMLVideoElement;
    const skeletonCanvas = document.getElementById('skeleton-canvas') as HTMLCanvasElement;
    const hudOverlay = document.getElementById('hud-overlay') as HTMLElement;

    this.tracker = new HandTracker(video, skeletonCanvas);

    // Handle instrument switching from gesture navigator or HUD click
    const handleSwitch = (id: InstrumentId) => {
      this.activeInstrumentId = id;
      this.stageCarousel.setInstrument(id);
      this.hud.setActiveInstrument(id);
      this.tracker.navigator.setInstrument(id);

      // Mute other engines on switch
      if (id !== 'theremin') this.thereminEngine.setVolume(0, true);
      if (id !== 'cristal') this.cristalEngine.mute();
      if (id !== 'handpan') this.handpanEngine.mute();
      if (id !== 'martenot') this.martenotEngine.mute();
      if (id !== 'laserharp') this.laserHarpEngine.mute();
    };

    this.tracker.navigator.setOnInstrumentChange(handleSwitch);

    this.hud = new ThereminHUD(
      hudOverlay,
      this.tracker,
      handleSwitch,
      () => this.activateAudio()
    );
  }

  // --------------------------------------------------------------------------
  // EVENT LISTENERS
  // --------------------------------------------------------------------------
  private setupWindowListeners(): void {
    window.addEventListener('resize', () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();

      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      const dock = document.getElementById('camera-dock');
      const isExpanded = dock?.classList.contains('expanded') ?? false;
      this.tracker.resize(isExpanded ? 320 : 220, isExpanded ? 180 : 124);
    });

    // Subtle 3D camera parallax drift with mouse
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
      this.mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
    });
  }

  // --------------------------------------------------------------------------
  // MAIN ANIMATION & SIMULATION LOOP (60 FPS)
  // --------------------------------------------------------------------------
  private animate = (): void => {
    requestAnimationFrame(this.animate);

    const delta = this.clock.getDelta();
    const time = this.clock.getElapsedTime();

    // 1. Query Real-Time 1€ Filtered Gestures & Kinematics
    const gestures = this.tracker.getGestures();
    const activeId = gestures.activeInstrument || this.activeInstrumentId;
    if (activeId !== this.activeInstrumentId) {
      this.activeInstrumentId = activeId;
      this.stageCarousel.setInstrument(activeId);
      this.hud.setActiveInstrument(activeId);
    }

    // 2. Dispatch Audio Parameters to Active Instrument Engine
    let currentFreq = 440.0;
    let currentGain = 0.0;

    switch (this.activeInstrumentId) {
      case 'theremin': {
        if (gestures.hasPitchHand) {
          currentFreq = this.thereminEngine.setPitch(gestures.pitchPos, gestures.pitchSpan);
        } else {
          currentFreq = this.thereminEngine.currentFreq;
        }

        if (gestures.hasVolumeHand) {
          currentGain = this.thereminEngine.setVolume(gestures.volumeHeight, gestures.isFistMuted);
        } else {
          currentGain = this.thereminEngine.setVolume(0.0, true);
        }
        break;
      }
      case 'cristal': {
        const res = this.cristalEngine.update(
          time,
          gestures.leftKinematics,
          gestures.rightKinematics
        );
        currentFreq = res.primaryFreq;
        currentGain = res.primaryGain;
        break;
      }
      case 'handpan': {
        const res = this.handpanEngine.update(
          time,
          gestures.leftKinematics,
          gestures.rightKinematics
        );
        currentFreq = res.primaryFreq;
        currentGain = res.primaryGain;
        break;
      }
      case 'martenot': {
        const res = this.martenotEngine.update(
          time,
          gestures.leftKinematics,
          gestures.rightKinematics
        );
        currentFreq = res.primaryFreq;
        currentGain = res.primaryGain;
        break;
      }
      case 'laserharp': {
        const res = this.laserHarpEngine.update(
          time,
          gestures.leftKinematics,
          gestures.rightKinematics,
          gestures.volumeLandmarks3D,
          gestures.pitchLandmarks3D
        );
        currentFreq = res.primaryFreq;
        currentGain = res.primaryGain;
        break;
      }
    }

    // 3. Update 3D Revolving Stage Carousel & Active Model
    this.stageCarousel.update(
      time,
      gestures.leftKinematics,
      gestures.rightKinematics,
      gestures.volumeLandmarks3D,
      gestures.pitchLandmarks3D,
      currentGain,
      gestures.portalState
    );

    // 4. Update 3D Articulated Hand Skeleton & Probes
    this.handRig3D.update({
      time,
      hasPitchHand: gestures.hasPitchHand,
      pitchLandmarks3D: gestures.pitchLandmarks3D,
      pitchControlPos: gestures.pitchWorldPos,
      pitchAntennaPoint: gestures.pitchAntennaPoint,
      pitchPos: gestures.pitchPos,
      hasVolumeHand: gestures.hasVolumeHand,
      volumeLandmarks3D: gestures.volumeLandmarks3D,
      volumeControlPos: gestures.volumeWorldPos,
      volumeLoopPoint: gestures.volumeLoopPoint,
      volumeGain: currentGain,
      isFistMuted: gestures.isFistMuted,
    });

    // 5. Subtle Camera Parallax
    const targetCamX = this.mouse.x * 0.06;
    const targetCamY = 0.32 - this.mouse.y * 0.03;
    this.camera.position.x += (targetCamX - this.camera.position.x) * delta * 2.5;
    this.camera.position.y += (targetCamY - this.camera.position.y) * delta * 2.5;
    this.camera.lookAt(0, 0.10, 0);

    // 6. Update HUD Elements & Oscilloscope
    this.hud.update(
      gestures,
      currentFreq,
      currentGain,
      this.activeInstrumentId,
      (buf) => {
        if (this.activeInstrumentId === 'theremin') {
          this.thereminEngine.getWaveformData(buf);
        } else {
          this.audioBus.getWaveformData(buf);
        }
      }
    );

    // 7. Render 3D Scene
    this.renderer.render(this.scene, this.camera);
  };
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  new SpatialAtelierApp();
});
