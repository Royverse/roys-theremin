// ============================================================================
// SPATIAL LASER HARP & VOLUMETRIC OPTICAL MODEL (1981 / 2026)
// Sculpted obsidian floor emitter with 10 upward-diverging laser strings
// and dynamic fingertip intersection plasma nodes
// ============================================================================

import * as THREE from 'three';
import type { KinematicHandState, SpatialInstrumentScene } from '../../types/atelier';

export function buildLaserHarpModel(): SpatialInstrumentScene {
  const group = new THREE.Group();

  // 1. Sculpted Obsidian Floor Prism Emitter
  const baseGeo = new THREE.CylinderGeometry(0.38, 0.44, 0.06, 32);
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x0f1117,
    roughness: 0.15,
    metalness: 0.9,
  });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.position.set(0, -0.04, 0);
  baseMesh.receiveShadow = true;
  group.add(baseMesh);

  // Luminous Aperture Ring
  const ringGeo = new THREE.TorusGeometry(0.36, 0.006, 16, 64);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x8b5cf6 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.008;
  group.add(ring);

  // 2. 10 Upward-Diverging Volumetric Laser Beams
  const beamCount = 10;
  const beamMeshes: THREE.Mesh[] = [];
  const beamMaterials: THREE.MeshBasicMaterial[] = [];
  const beamGeo = new THREE.CylinderGeometry(0.0022, 0.0042, 0.85, 12);

  for (let i = 0; i < beamCount; i++) {
    const norm = (i / (beamCount - 1)) - 0.5; // [-0.5, 0.5]
    const baseAngle = norm * 0.52; // Fan out by ~30 deg total

    const mat = new THREE.MeshBasicMaterial({
      color: i < 5 ? 0x06b6d4 : 0x8b5cf6, // Cyan to Violet gradient
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const beam = new THREE.Mesh(beamGeo, mat);
    beam.position.set(norm * 0.58, 0.38, 0);
    beam.rotation.z = -baseAngle;
    group.add(beam);

    beamMeshes.push(beam);
    beamMaterials.push(mat);
  }

  // 3. Fingertip Break Plasma Nodes (Up to 4 simultaneous intersection sparks)
  const sparkGeo = new THREE.SphereGeometry(0.014, 16, 16);
  const sparkMeshes: THREE.Mesh[] = [];
  for (let s = 0; s < 4; s++) {
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    const spark = new THREE.Mesh(sparkGeo, sparkMat);
    group.add(spark);
    sparkMeshes.push(spark);
  }

  const update = (
    time: number,
    leftK: KinematicHandState,
    rightK: KinematicHandState,
    leftLm: THREE.Vector3[] | null,
    rightLm: THREE.Vector3[] | null,
    gain: number
  ): void => {
    // Animate subtle laser beam luminescence pulsation
    for (let i = 0; i < beamCount; i++) {
      const pulse = Math.sin(time * 6.0 + i * 0.8) * 0.08;
      beamMaterials[i].opacity = 0.65 + pulse + gain * 0.25;
    }

    // Update plasma nodes when fingertips intersect beam zone
    let sparkIdx = 0;
    const checkFingers = (landmarks: THREE.Vector3[] | null) => {
      if (!landmarks) return;
      const tips = [8, 12, 16]; // Index, Middle, Ring
      for (const t of tips) {
        if (sparkIdx >= sparkMeshes.length) break;
        const pt = landmarks[t];
        if (pt.y > 0.05 && pt.y < 0.65 && Math.abs(pt.x) < 0.42) {
          const spark = sparkMeshes[sparkIdx];
          spark.position.copy(pt);
          (spark.material as THREE.MeshBasicMaterial).opacity = 0.95;
          const s = 1.0 + Math.sin(time * 20.0) * 0.3;
          spark.scale.set(s, s, s);
          sparkIdx++;
        }
      }
    };

    if (rightK.hasHand) checkFingers(rightLm);
    if (leftK.hasHand) checkFingers(leftLm);

    // Fade unused sparks
    for (let j = sparkIdx; j < sparkMeshes.length; j++) {
      (sparkMeshes[j].material as THREE.MeshBasicMaterial).opacity *= 0.8;
    }
  };

  const dispose = (): void => {
    baseGeo.dispose();
    baseMat.dispose();
    ringGeo.dispose();
    ringMat.dispose();
    beamGeo.dispose();
    for (const m of beamMaterials) m.dispose();
    sparkGeo.dispose();
    for (const s of sparkMeshes) (s.material as THREE.Material).dispose();
  };

  return { group, update, dispose };
}
