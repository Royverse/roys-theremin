// ============================================================================
// CRISTAL BASCHET PROCEDURAL 3D MODEL & FLAME RESONATOR (1952)
// Refractive glass rods with emissive friction response and brushed-steel flame
// ============================================================================

import * as THREE from 'three';
import type { KinematicHandState, SpatialInstrumentScene } from '../../types/atelier';

export function buildCristalModel(): SpatialInstrumentScene {
  const group = new THREE.Group();

  // 1. Walnut Acoustic Bridge Stand
  const bridgeGeo = new THREE.BoxGeometry(0.82, 0.05, 0.16);
  const bridgeMat = new THREE.MeshStandardMaterial({
    color: 0x271912,
    roughness: 0.72,
    metalness: 0.1,
  });
  const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
  bridge.position.set(0, 0.06, 0);
  bridge.receiveShadow = true;
  group.add(bridge);

  // 2. Sculptural Brushed-Steel Flame Resonator (Baschet iconic sheet)
  const flameShape = new THREE.Shape();
  flameShape.moveTo(0, 0);
  flameShape.quadraticCurveTo(0.18, 0.18, 0.28, 0.42);
  flameShape.quadraticCurveTo(0.24, 0.58, 0.14, 0.68);
  flameShape.quadraticCurveTo(0.04, 0.74, 0, 0.82);
  flameShape.quadraticCurveTo(-0.04, 0.74, -0.14, 0.68);
  flameShape.quadraticCurveTo(-0.24, 0.58, -0.28, 0.42);
  flameShape.quadraticCurveTo(-0.18, 0.18, 0, 0);

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: 0.012,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.006,
    bevelThickness: 0.006,
  };

  const flameGeo = new THREE.ExtrudeGeometry(flameShape, extrudeSettings);
  const flameMat = new THREE.MeshStandardMaterial({
    color: 0xd4d8e2,
    roughness: 0.28,
    metalness: 0.92,
  });
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.position.set(0, 0.08, -0.06);
  flame.scale.set(0.9, 0.9, 0.9);
  flame.castShadow = true;
  group.add(flame);

  // 3. Fiberglass Conical Acoustic Horn
  const hornGeo = new THREE.ConeGeometry(0.16, 0.32, 32, 1, true);
  const hornMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.45,
    roughness: 0.4,
    side: THREE.DoubleSide,
  });
  const horn = new THREE.Mesh(hornGeo, hornMat);
  horn.rotation.x = Math.PI / 2;
  horn.position.set(0, 0.28, -0.14);
  group.add(horn);

  // 4. 12 Translucent Crystal Glass Rods
  const rodCount = 12;
  const rodMeshes: THREE.Mesh[] = [];
  const rodMaterials: THREE.MeshPhysicalMaterial[] = [];
  const rodSpacing = 0.062;
  const startX = -((rodCount - 1) * rodSpacing) / 2;

  const rodGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.28, 16);
  rodGeo.rotateX(Math.PI / 2); // Rods extend forward toward player

  for (let i = 0; i < rodCount; i++) {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      emissive: 0x0284c7,
      emissiveIntensity: 0.12,
      transmission: 0.92,
      opacity: 0.88,
      transparent: true,
      roughness: 0.08,
      ior: 1.52,
    });
    const rod = new THREE.Mesh(rodGeo, mat);
    const x = startX + i * rodSpacing;
    rod.position.set(x, 0.095, 0.12);
    rod.castShadow = true;
    group.add(rod);
    rodMeshes.push(rod);
    rodMaterials.push(mat);
  }

  // 5. Standing wave ripple particles around active rods
  const rippleCount = 80;
  const rippleGeo = new THREE.BufferGeometry();
  const ripplePos = new Float32Array(rippleCount * 3);
  rippleGeo.setAttribute('position', new THREE.BufferAttribute(ripplePos, 3));
  const rippleMat = new THREE.PointsMaterial({
    color: 0x38bdf8,
    size: 0.008,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
  });
  const ripplePoints = new THREE.Points(rippleGeo, rippleMat);
  group.add(ripplePoints);

  const update = (
    time: number,
    leftK: KinematicHandState,
    rightK: KinematicHandState,
    _leftLm: THREE.Vector3[] | null,
    _rightLm: THREE.Vector3[] | null,
    gain: number
  ): void => {
    // Animate flame subtle vibration
    flame.rotation.z = Math.sin(time * 30.0) * (gain * 0.018);
    horn.scale.setScalar(1.0 + gain * 0.06);

    // Update glass rods emission based on hand proximity and rubbing
    for (let i = 0; i < rodCount; i++) {
      const rod = rodMeshes[i];
      const mat = rodMaterials[i];
      let rodExcitation = 0;

      if (rightK.hasHand) {
        const dx = Math.abs(rightK.rawPos.x - rod.position.x);
        if (dx < 0.035) {
          rodExcitation = Math.max(rodExcitation, rightK.rubEnergy);
        }
      }
      if (leftK.hasHand) {
        const dx = Math.abs(leftK.rawPos.x - rod.position.x);
        if (dx < 0.035) {
          rodExcitation = Math.max(rodExcitation, leftK.rubEnergy);
        }
      }

      const targetIntensity = 0.12 + rodExcitation * 2.8;
      mat.emissiveIntensity += (targetIntensity - mat.emissiveIntensity) * 0.15;
    }

    // Update shimmering ripple particles
    const pos = rippleGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < rippleCount; i++) {
      const angle = (i / rippleCount) * Math.PI * 2;
      const radius = 0.04 + (i % 5) * 0.02 + gain * 0.04;
      const rx = Math.cos(angle + time * 2.5) * radius;
      const ry = 0.10 + Math.sin(angle * 3.0 + time) * 0.03;
      const rz = 0.12 + Math.sin(angle + time * 2.5) * radius;

      pos[i * 3] = rx;
      pos[i * 3 + 1] = ry;
      pos[i * 3 + 2] = rz;
    }
    rippleGeo.attributes.position.needsUpdate = true;
  };

  const dispose = (): void => {
    bridgeGeo.dispose();
    bridgeMat.dispose();
    flameGeo.dispose();
    flameMat.dispose();
    hornGeo.dispose();
    hornMat.dispose();
    rodGeo.dispose();
    for (const m of rodMaterials) m.dispose();
    rippleGeo.dispose();
    rippleMat.dispose();
  };

  return { group, update, dispose };
}
