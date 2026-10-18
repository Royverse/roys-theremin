// ============================================================================
// SWISS HANDPAN (HANG) PROCEDURAL 3D MODEL (2000)
// Nitrided steel convex dome, 9 embossed harmonic tone fields & cymatic ripples
// ============================================================================

import * as THREE from 'three';
import type { KinematicHandState, SpatialInstrumentScene } from '../../types/atelier';
import { HANDPAN_TONES } from '../../audio/instruments/handpanEngine';

export function buildHandpanModel(): SpatialInstrumentScene {
  const group = new THREE.Group();

  // Rotate entire instrument towards camera for ergonomic playing
  group.rotation.x = -0.32; // ~18 deg tilt towards player
  group.position.set(0, 0.05, 0.04);

  // 1. Nitrided Steel Shell (Top & Bottom Dome)
  const shellGeo = new THREE.SphereGeometry(0.32, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.48);
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0x1f242d, // Dark tempered indigo-steel
    roughness: 0.38,
    metalness: 0.88,
  });
  const topShell = new THREE.Mesh(shellGeo, shellMat);
  topShell.scale.set(1.0, 0.44, 1.0);
  topShell.receiveShadow = true;
  group.add(topShell);

  // Brass equatorial rim
  const rimGeo = new THREE.TorusGeometry(0.322, 0.008, 16, 64);
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.25,
    metalness: 0.95,
  });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.005;
  group.add(rim);

  // 2. 9 Embossed Tone Fields
  const dimpleMeshes: THREE.Mesh[] = [];
  const dimpleMaterials: THREE.MeshStandardMaterial[] = [];
  const dimpleGlows: number[] = new Array(9).fill(0);

  // Ding (Central Dome)
  const dingGeo = new THREE.SphereGeometry(0.048, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.4);
  const dingMat = new THREE.MeshStandardMaterial({
    color: 0x2e3644,
    emissive: 0x10b981,
    emissiveIntensity: 0.1,
    roughness: 0.32,
    metalness: 0.9,
  });
  const ding = new THREE.Mesh(dingGeo, dingMat);
  ding.rotation.x = Math.PI; // Concave/convex dimple impression
  ding.position.set(0, 0.145, 0);
  group.add(ding);
  dimpleMeshes.push(ding);
  dimpleMaterials.push(dingMat);

  // 8 Outer Tone Fields
  const outerGeo = new THREE.SphereGeometry(0.038, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.38);
  for (let i = 1; i <= 8; i++) {
    const tone = HANDPAN_TONES[i];
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2b3340,
      emissive: 0x10b981,
      emissiveIntensity: 0.08,
      roughness: 0.35,
      metalness: 0.9,
    });
    const mesh = new THREE.Mesh(outerGeo, mat);
    const x = Math.cos(tone.angle) * tone.radius;
    const z = Math.sin(tone.angle) * tone.radius;
    // Follow dome curve
    const y = 0.09 - (tone.radius * tone.radius) * 0.45;

    mesh.position.set(x, y, z);
    mesh.rotation.x = Math.PI;
    group.add(mesh);
    dimpleMeshes.push(mesh);
    dimpleMaterials.push(mat);
  }

  // 3. Expanding Cymatic Ripple Rings
  const rippleRingGeo = new THREE.RingGeometry(0.04, 0.046, 32);
  const rippleRingMat = new THREE.MeshBasicMaterial({
    color: 0x10b981,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
  });
  const rippleRing = new THREE.Mesh(rippleRingGeo, rippleRingMat);
  rippleRing.rotation.x = -Math.PI / 2;
  rippleRing.position.y = 0.15;
  group.add(rippleRing);

  let rippleScale = 1.0;

  const update = (
    _time: number,
    leftK: KinematicHandState,
    rightK: KinematicHandState,
    _leftLm: THREE.Vector3[] | null,
    _rightLm: THREE.Vector3[] | null,
    _gain: number
  ): void => {
    // Check if either hand struck to trigger visual dimple flash & ripple
    const triggerToneVisual = (worldX: number, worldY: number) => {
      const dx = worldX;
      const dy = worldY - 0.10;
      const r = Math.sqrt(dx * dx + dy * dy);
      let idx = 0;
      if (r >= 0.095) {
        let angle = Math.atan2(dy, dx);
        if (angle < 0) angle += Math.PI * 2;
        const sector = Math.floor((angle / (Math.PI * 2)) * 8);
        idx = 1 + (sector % 8);
      }
      dimpleGlows[idx] = 2.4;
      rippleRing.position.set(dimpleMeshes[idx].position.x, dimpleMeshes[idx].position.y + 0.01, dimpleMeshes[idx].position.z);
      rippleScale = 0.4;
      rippleRingMat.opacity = 0.85;
    };

    if (rightK.isStrike) {
      triggerToneVisual(rightK.rawPos.x, rightK.rawPos.y);
    }
    if (leftK.isStrike) {
      triggerToneVisual(leftK.rawPos.x, leftK.rawPos.y);
    }

    // Decay dimple glows
    for (let i = 0; i < 9; i++) {
      dimpleGlows[i] *= 0.88;
      const intensity = 0.08 + dimpleGlows[i];
      dimpleMaterials[i].emissiveIntensity = intensity;
    }

    // Expand ripple ring
    if (rippleRingMat.opacity > 0.01) {
      rippleScale += 0.06;
      rippleRing.scale.set(rippleScale, rippleScale, rippleScale);
      rippleRingMat.opacity *= 0.88;
    } else {
      rippleRingMat.opacity = 0;
    }
  };

  const dispose = (): void => {
    shellGeo.dispose();
    shellMat.dispose();
    rimGeo.dispose();
    rimMat.dispose();
    dingGeo.dispose();
    outerGeo.dispose();
    for (const m of dimpleMaterials) m.dispose();
    rippleRingGeo.dispose();
    rippleRingMat.dispose();
  };

  return { group, update, dispose };
}
