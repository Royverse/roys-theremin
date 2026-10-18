// ============================================================================
// STAGE CAROUSEL 3D ORCHESTRATOR (v3.1)
// Smoothly crossfades, scales, and manages the 5 spatial instruments.
// Clean, minimalist 3D stage with zero clutter overhead.
// ============================================================================

import * as THREE from 'three';
import type { InstrumentId, KinematicHandState, PortalHoverState, SpatialInstrumentScene } from '../types/atelier';
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
      update: (time, leftK, rightK, _leftLm, _rightLm, gain) => {
        thereminModel.update(time, gain);
        thereminVFX.update(
          time,
          rightK.hasHand ? rightK.rawPos : null,
          leftK.hasHand ? leftK.rawPos : null,
          440,
          gain
        );
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
    _portalState?: PortalHoverState
  ): void {
    // Smoothly interpolate instrument scale & visibility
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

    // Update active instrument scene
    this.instruments[this.activeInstrumentId].update(time, leftK, rightK, leftLm, rightLm, gain);
  }

  public dispose(): void {
    for (const inst of Object.values(this.instruments)) {
      inst.dispose();
    }
  }
}
