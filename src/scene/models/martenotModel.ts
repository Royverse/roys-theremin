// ============================================================================
// ONDES MARTENOT PROCEDURAL 3D MODEL (1928)
// French Art-Deco mahogany console, ribbon wire with sliding ring,
// and 12-string flame-shaped Palme acoustic resonator
// ============================================================================

import * as THREE from 'three';
import type { KinematicHandState, SpatialInstrumentScene } from '../../types/atelier';

export function buildMartenotModel(): SpatialInstrumentScene {
  const group = new THREE.Group();

  // 1. Art-Deco Mahogany Console Cabinet
  const consoleGeo = new THREE.BoxGeometry(0.74, 0.08, 0.22);
  const consoleMat = new THREE.MeshStandardMaterial({
    color: 0x3d1a0e, // Rich dark French mahogany
    roughness: 0.45,
    metalness: 0.15,
  });
  const consoleMesh = new THREE.Mesh(consoleGeo, consoleMat);
  consoleMesh.position.set(0.04, 0.04, 0);
  consoleMesh.receiveShadow = true;
  group.add(consoleMesh);

  // Brushed gold control panel faceplate
  const faceGeo = new THREE.BoxGeometry(0.72, 0.005, 0.18);
  const faceMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    roughness: 0.32,
    metalness: 0.85,
  });
  const faceplate = new THREE.Mesh(faceGeo, faceMat);
  faceplate.position.set(0.04, 0.082, 0);
  group.add(faceplate);

  // 2. Le Ruban (Horizontal Silver Wire & Index Ring)
  const wireGeo = new THREE.CylinderGeometry(0.0018, 0.0018, 0.68, 16);
  wireGeo.rotateZ(Math.PI / 2);
  const wireMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.15,
    metalness: 0.98,
  });
  const wire = new THREE.Mesh(wireGeo, wireMat);
  wire.position.set(0.06, 0.125, 0.06);
  group.add(wire);

  // Sliding 3D Metallic Ring (Anneau)
  const ringGeo = new THREE.TorusGeometry(0.014, 0.0035, 16, 32);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xec4899,
    emissive: 0xec4899,
    emissiveIntensity: 0.45,
    roughness: 0.2,
    metalness: 0.9,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.set(0.06, 0.125, 0.06);
  group.add(ring);

  // Semitone tick marks along the wire
  const tickGeo = new THREE.BoxGeometry(0.002, 0.008, 0.02);
  const tickMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8 });
  for (let i = 0; i <= 36; i++) {
    const tick = new THREE.Mesh(tickGeo, tickMat);
    const x = -0.28 + (i / 36) * 0.68;
    tick.position.set(x, 0.09, 0.06);
    group.add(tick);
  }

  // 3. Left-Hand Touche d'Intensité (Expression Key)
  const toucheGeo = new THREE.BoxGeometry(0.06, 0.035, 0.08);
  const toucheMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.4,
    metalness: 0.6,
  });
  const toucheKey = new THREE.Mesh(toucheGeo, toucheMat);
  toucheKey.position.set(-0.26, 0.095, -0.02);
  group.add(toucheKey);

  // 4. La Palme Resonator (Iconic flame-shaped 12-string acoustic harp on the left)
  const palmeGroup = new THREE.Group();
  palmeGroup.position.set(-0.46, 0.22, -0.08);
  palmeGroup.rotation.y = 0.25;

  const palmeShape = new THREE.Shape();
  palmeShape.moveTo(0, 0);
  palmeShape.quadraticCurveTo(0.12, 0.15, 0.14, 0.35);
  palmeShape.quadraticCurveTo(0.10, 0.50, 0, 0.58);
  palmeShape.quadraticCurveTo(-0.10, 0.50, -0.14, 0.35);
  palmeShape.quadraticCurveTo(-0.12, 0.15, 0, 0);

  const palmeBodyGeo = new THREE.ExtrudeGeometry(palmeShape, {
    depth: 0.025,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.005,
  });
  const palmeBodyMat = new THREE.MeshStandardMaterial({
    color: 0x4a2113,
    roughness: 0.5,
    metalness: 0.2,
  });
  const palmeBody = new THREE.Mesh(palmeBodyGeo, palmeBodyMat);
  palmeGroup.add(palmeBody);

  // 12 Sympathetic Golden Strings
  const stringGeo = new THREE.CylinderGeometry(0.0008, 0.0008, 0.48, 8);
  const stringMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
  for (let s = 0; s < 12; s++) {
    const str = new THREE.Mesh(stringGeo, stringMat);
    const sx = -0.065 + (s / 11) * 0.13;
    str.position.set(sx, 0.28, 0.018);
    palmeGroup.add(str);
  }
  group.add(palmeGroup);

  const update = (
    time: number,
    _leftK: KinematicHandState,
    rightK: KinematicHandState,
    _leftLm: THREE.Vector3[] | null,
    _rightLm: THREE.Vector3[] | null,
    gain: number
  ): void => {
    // 1. Move sliding ring locked to right hand X
    if (rightK.hasHand) {
      const targetX = Math.max(-0.28, Math.min(0.40, rightK.rawPos.x));
      ring.position.x += (targetX - ring.position.x) * 0.35;
      ringMat.emissiveIntensity = 0.4 + Math.sin(time * 8.0) * 0.15;
    } else {
      ringMat.emissiveIntensity = 0.2;
    }

    // 2. Touche key depress animation based on left hand pressure / volume
    const targetKeyY = 0.095 - gain * 0.02;
    toucheKey.position.y += (targetKeyY - toucheKey.position.y) * 0.3;

    // 3. Palme subtle acoustic shimmer
    palmeGroup.rotation.z = Math.sin(time * 24.0) * (gain * 0.012);
  };

  const dispose = (): void => {
    consoleGeo.dispose();
    consoleMat.dispose();
    faceGeo.dispose();
    faceMat.dispose();
    wireGeo.dispose();
    wireMat.dispose();
    ringGeo.dispose();
    ringMat.dispose();
    tickGeo.dispose();
    tickMat.dispose();
    toucheGeo.dispose();
    toucheMat.dispose();
    palmeBodyGeo.dispose();
    palmeBodyMat.dispose();
    stringGeo.dispose();
    stringMat.dispose();
  };

  return { group, update, dispose };
}
