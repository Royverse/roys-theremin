// ============================================================================
// STAGE CAROUSEL 3D ORCHESTRATOR & OVERHEAD HOLOGRAPHIC PORTAL (v3)
// Smoothly crossfades and rotates between the 5 spatial instruments,
// and renders the 3D overhead gesture portal rings.
// ============================================================================

import * as THREE from 'three';
import type { InstrumentId, KinematicHandState, PortalHoverState, SpatialInstrumentScene } from '../types/atelier';
import { INSTRUMENT_MANIFEST } from '../types/atelier';
import { buildThereminModel } from './thereminModel';
import { createFieldVFX } from './fieldVfx';
import { buildCristalModel } from './models/cristalModel';
import { buildHandpanModel } from './models/handpanModel';
import { buildMartenotModel } from './models/martenotModel';
import { buildLaserHarpModel } from './models/laserHarpModel';

export class StageCarousel3D {
  public readonly group = new THREE.Group();

  private activeInstrumentId: InstrumentId = 'theremin';
  private targetInstrumentId: InstrumentId = 'theremin';

  // 3D Instruments dictionary
  private instruments: Record<InstrumentId, SpatialInstrumentScene>;

  // Instrument Root Groups (for smooth cross-fade & scale)
  private instrumentRoots: Record<InstrumentId, THREE.Group>;

  // Overhead 3D Holographic Portal Orbs
  private portalGroup = new THREE.Group();
  private portalOrbs: THREE.Mesh[] = [];
  private portalRing: THREE.Mesh;
  private portalRingMat: THREE.MeshBasicMaterial;

  constructor() {
    this.instrumentRoots = {
      theremin: new THREE.Group(),
      cristal: new THREE.Group(),
      handpan: new THREE.Group(),
      martenot: new THREE.Group(),
      laserharp: new THREE.Group(),
    };

    // 1. Build Theremin
    const thereminModel = buildThereminModel();
    const thereminVFX = createFieldVFX(thereminModel.pitchTipPosition, thereminModel.volumeLoopCenter);
    const thereminGroup = new THREE.Group();
    thereminGroup.add(thereminModel.group);
    thereminGroup.add(thereminVFX.group);

    const thereminScene: SpatialInstrumentScene = {
      group: thereminGroup,
      update: (time, _leftK, _rightK, _leftLm, _rightLm, gain) => {
        thereminModel.update(time, gain);
        thereminVFX.update(time, null, null, 440, gain);
      },
      dispose: () => {
        thereminVFX.dispose();
      },
    };

    // 2. Build other 4 instruments
    const cristalScene = buildCristalModel();
    const handpanScene = buildHandpanModel();
    const martenotScene = buildMartenotModel();
    const laserHarpScene = buildLaserHarpModel();

    this.instruments = {
      theremin: thereminScene,
      cristal: cristalScene,
      handpan: handpanScene,
      martenot: martenotScene,
      laserharp: laserHarpScene,
    };

    // Add each instrument scene to its root group
    for (const [id, scene] of Object.entries(this.instruments) as [InstrumentId, SpatialInstrumentScene][]) {
      const root = this.instrumentRoots[id];
      root.add(scene.group);
      if (id !== 'theremin') {
        root.visible = false;
        root.scale.set(0.01, 0.01, 0.01);
      }
      this.group.add(root);
    }

    // 3. Build Overhead Holographic Gesture Portal Orbs
    const orbGeo = new THREE.SphereGeometry(0.016, 16, 16);
    const order: InstrumentId[] = ['theremin', 'cristal', 'handpan', 'martenot', 'laserharp'];

    for (let i = 0; i < 5; i++) {
      const id = order[i];
      const manifest = INSTRUMENT_MANIFEST[id];
      const mat = new THREE.MeshBasicMaterial({
        color: manifest.accentColorHex,
        transparent: true,
        opacity: 0.65,
      });
      const orb = new THREE.Mesh(orbGeo, mat);
      const x = -0.22 + (i / 4) * 0.44;
      orb.position.set(x, 0.54, -0.05);
      this.portalGroup.add(orb);
      this.portalOrbs.push(orb);
    }

    // Portal radial progress ring
    const ringGeo = new THREE.RingGeometry(0.024, 0.030, 32);
    this.portalRingMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    this.portalRing = new THREE.Mesh(ringGeo, this.portalRingMat);
    this.portalRing.position.set(0, 0.54, -0.04);
    this.portalGroup.add(this.portalRing);

    this.group.add(this.portalGroup);
  }

  public setInstrument(id: InstrumentId): void {
    if (this.targetInstrumentId === id) return;
    this.targetInstrumentId = id;
    this.activeInstrumentId = id;
  }

  public getActiveInstrumentId(): InstrumentId {
    return this.activeInstrumentId;
  }

  public update(
    time: number,
    leftK: KinematicHandState,
    rightK: KinematicHandState,
    leftLm: THREE.Vector3[] | null,
    rightLm: THREE.Vector3[] | null,
    gain: number,
    portalState: PortalHoverState
  ): void {
    // 1. Smoothly interpolate instrument scale & visibility
    const dtFactor = 0.14;
    for (const [id, root] of Object.entries(this.instrumentRoots) as [InstrumentId, THREE.Group][]) {
      const isActive = id === this.activeInstrumentId;
      if (isActive) {
        root.visible = true;
        const targetScale = 1.0;
        root.scale.x += (targetScale - root.scale.x) * dtFactor;
        root.scale.y += (targetScale - root.scale.y) * dtFactor;
        root.scale.z += (targetScale - root.scale.z) * dtFactor;
      } else {
        root.scale.x += (0.01 - root.scale.x) * dtFactor;
        root.scale.y += (0.01 - root.scale.y) * dtFactor;
        root.scale.z += (0.01 - root.scale.z) * dtFactor;
        if (root.scale.x < 0.05) {
          root.visible = false;
        }
      }
    }

    // 2. Update active instrument scene
    this.instruments[this.activeInstrumentId].update(time, leftK, rightK, leftLm, rightLm, gain);

    // 3. Update Overhead Holographic Portal Visuals
    const order: InstrumentId[] = ['theremin', 'cristal', 'handpan', 'martenot', 'laserharp'];
    for (let i = 0; i < 5; i++) {
      const id = order[i];
      const orb = this.portalOrbs[i];
      const isSelected = id === this.activeInstrumentId;
      const isHovered = portalState.isActive && portalState.targetInstrument === id;

      const baseScale = isSelected ? 1.4 : (isHovered ? 1.6 : 1.0);
      const pulse = isHovered ? Math.sin(time * 15.0) * 0.2 : 0;
      const s = baseScale + pulse;
      orb.scale.set(s, s, s);

      (orb.material as THREE.MeshBasicMaterial).opacity = isSelected ? 0.95 : (isHovered ? 0.9 : 0.45);

      if (isHovered) {
        this.portalRing.position.x = orb.position.x;
        this.portalRing.position.y = orb.position.y;
        this.portalRingMat.opacity = 0.85;
        const rScale = 0.6 + portalState.progress * 0.7;
        this.portalRing.scale.set(rScale, rScale, 1);
      }
    }

    if (!portalState.isActive) {
      this.portalRingMat.opacity *= 0.8;
    }
  }

  public dispose(): void {
    for (const inst of Object.values(this.instruments)) {
      inst.dispose();
    }
    for (const orb of this.portalOrbs) {
      orb.geometry.dispose();
      (orb.material as THREE.Material).dispose();
    }
    this.portalRing.geometry.dispose();
    this.portalRingMat.dispose();
  }
}
