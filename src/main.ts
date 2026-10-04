// ============================================================================
// MAIN APPLICATION ENTRY POINT
// Connects Three.js 3D Theremin Scene, MediaPipe Tracking, and Web Audio
// ============================================================================

import './style.css';
import * as THREE from 'three';
import { ThereminEngine } from './audio/thereminEngine';
import { buildThereminModel } from './scene/thereminModel';
import { createFieldVFX } from './scene/fieldVfx';
import { HandTracker } from './tracking/handTracker';
import { ThereminHUD } from './ui/hud';

class VirtualThereminApp {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;

  private engine!: ThereminEngine;
  private tracker!: HandTracker;
  private hud!: ThereminHUD;

  private thereminModel!: ReturnType<typeof buildThereminModel>;
  private fieldVFX!: ReturnType<typeof createFieldVFX>;

  private clock = new THREE.Clock();
  private mouse = { x: 0, y: 0 };

  constructor() {
    this.initAudioEngine();
    this.initThreeScene();
    this.initTrackerAndHUD();
    this.setupWindowListeners();
    this.animate();
  }

  // --------------------------------------------------------------------------
  // AUDIO ENGINE SETUP
  // --------------------------------------------------------------------------
  private initAudioEngine(): void {
    this.engine = new ThereminEngine();
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
    this.renderer.toneMappingExposure = 1.1;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07090c);
    this.scene.fog = new THREE.FogExp2(0x07090c, 0.45);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      42,
      window.innerWidth / window.innerHeight,
      0.05,
      50
    );
    this.camera.position.set(0, 0.32, 0.88);
    this.camera.lookAt(0, 0.08, 0);

    // ------------------------------------------------------------------------
    // LIGHTING: Cinematic Studio Lighting (Warm Tungsten & Platinum Rim)
    // ------------------------------------------------------------------------
    // Subtle warm ambient fill
    const hemiLight = new THREE.HemisphereLight(0x1e2430, 0x090a0d, 0.85);
    this.scene.add(hemiLight);

    // Key warm spotlight (Simulating high-end studio illumination)
    const keySpot = new THREE.SpotLight(0xffedd5, 85);
    keySpot.position.set(1.2, 2.4, 1.6);
    keySpot.angle = Math.PI / 4.5;
    keySpot.penumbra = 0.6;
    keySpot.castShadow = true;
    keySpot.shadow.mapSize.width = 2048;
    keySpot.shadow.mapSize.height = 2048;
    keySpot.shadow.camera.near = 0.5;
    keySpot.shadow.camera.far = 6;
    keySpot.shadow.bias = -0.0008;
    this.scene.add(keySpot);

    // Soft platinum rim light emphasizing antenna silhouettes
    const rimSpot = new THREE.SpotLight(0xe2e8f0, 32);
    rimSpot.position.set(-2.0, 1.5, -1.0);
    rimSpot.angle = Math.PI / 4;
    rimSpot.penumbra = 0.7;
    this.scene.add(rimSpot);

    // Warm under-cabinet ambient glow
    const fillLight = new THREE.PointLight(0xf59e0b, 1.2, 3);
    fillLight.position.set(0, -0.15, 0.6);
    this.scene.add(fillLight);

    // ------------------------------------------------------------------------
    // ENVIRONMENT / MATTE STUDIO PEDESTAL
    // ------------------------------------------------------------------------
    const floorGeo = new THREE.CylinderGeometry(3.5, 3.5, 0.05, 64);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0b0d11,
      roughness: 0.85,
      metalness: 0.1,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -0.78;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // ------------------------------------------------------------------------
    // BUILD 3D THEREMIN MODEL & ELECTROMAGNETIC FIELD VFX
    // ------------------------------------------------------------------------
    this.thereminModel = buildThereminModel();
    this.scene.add(this.thereminModel.group);

    this.fieldVFX = createFieldVFX(
      this.thereminModel.pitchTipPosition,
      this.thereminModel.volumeLoopCenter
    );
    this.scene.add(this.fieldVFX.group);
  }

  // --------------------------------------------------------------------------
  // TRACKER & HUD SETUP
  // --------------------------------------------------------------------------
  private initTrackerAndHUD(): void {
    const video = document.getElementById('webcam-video') as HTMLVideoElement;
    const skeletonCanvas = document.getElementById('skeleton-canvas') as HTMLCanvasElement;
    const hudOverlay = document.getElementById('hud-overlay') as HTMLElement;

    this.tracker = new HandTracker(video, skeletonCanvas);
    this.hud = new ThereminHUD(hudOverlay, this.engine, this.tracker);
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

      this.tracker.resize(220, 124);
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

    // 1. Query Real-Time Gestures from MediaPipe Hand Tracker
    const gestures = this.tracker.getGestures();

    // 2. Dispatch Audio Parameters
    let currentFreq = this.engine.currentFreq;
    let currentGain = this.engine.currentGain;

    if (gestures.hasPitchHand) {
      currentFreq = this.engine.setPitch(gestures.pitchPos, gestures.pitchSpan);
    }

    if (gestures.hasVolumeHand) {
      currentGain = this.engine.setVolume(gestures.volumeHeight, gestures.isFistMuted);
    } else {
      // Natural smooth decay if left hand is completely out of frame
      currentGain = this.engine.setVolume(0.0, true);
    }

    // 3. Update 3D Theremin Model (Vacuum tube glow pulsation, pilot light, knobs)
    this.thereminModel.update(time, currentGain);

    // 4. Update Capacitive Electromagnetic Field VFX & Reactive Lightning Arcs
    this.fieldVFX.update(
      time,
      gestures.hasPitchHand ? gestures.pitchWorldPos : null,
      gestures.hasVolumeHand ? gestures.volumeWorldPos : null,
      currentFreq,
      currentGain
    );

    // 5. Subtle Camera Parallax
    const targetCamX = this.mouse.x * 0.08;
    const targetCamY = 0.32 - this.mouse.y * 0.04;
    this.camera.position.x += (targetCamX - this.camera.position.x) * delta * 2.5;
    this.camera.position.y += (targetCamY - this.camera.position.y) * delta * 2.5;
    this.camera.lookAt(0, 0.08, 0);

    // 6. Update HUD Elements
    this.hud.update(gestures, currentFreq, currentGain);

    // 7. Render 3D Scene
    this.renderer.render(this.scene, this.camera);
  };
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  new VirtualThereminApp();
});
