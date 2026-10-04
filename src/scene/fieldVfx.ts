// ============================================================================
// ELECTROMAGNETIC FIELD VISUAL EFFECTS & REACTIVE PLASMA ARCS
// Refined, ethereal micro-particles and organic corona discharge
// ============================================================================

import * as THREE from 'three';

export interface FieldVFX {
  group: THREE.Group;
  update: (
    time: number,
    pitchHandPos: THREE.Vector3 | null,
    volumeHandPos: THREE.Vector3 | null,
    pitchFreq: number,
    volumeGain: number
  ) => void;
  dispose: () => void;
}

export function createFieldVFX(
  pitchTipPos: THREE.Vector3,
  volumeLoopPos: THREE.Vector3
): FieldVFX {
  const group = new THREE.Group();

  // --------------------------------------------------------------------------
  // 1. PITCH CAPACITIVE FIELD (Ethereal Platinum Starlight Dust)
  // --------------------------------------------------------------------------
  const pitchCount = 380;
  const pitchBaseGeo = new THREE.BufferGeometry();
  const pitchPositions = new Float32Array(pitchCount * 3);
  const pitchBaseCoords = new Float32Array(pitchCount * 3);
  const pitchPhases = new Float32Array(pitchCount);

  for (let i = 0; i < pitchCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    // Radius around vertical rod: 0.02m to 0.22m
    const radius = 0.02 + Math.pow(Math.random(), 1.6) * 0.20;
    // Height along rod: 0.05m to 0.52m
    const y = 0.05 + Math.random() * 0.46;
    const x = pitchTipPos.x + Math.cos(angle) * radius;
    const z = pitchTipPos.z + Math.sin(angle) * radius;

    pitchPositions[i * 3]     = x;
    pitchPositions[i * 3 + 1] = y;
    pitchPositions[i * 3 + 2] = z;

    pitchBaseCoords[i * 3]     = x;
    pitchBaseCoords[i * 3 + 1] = y;
    pitchBaseCoords[i * 3 + 2] = z;

    pitchPhases[i] = Math.random() * Math.PI * 2;
  }

  pitchBaseGeo.setAttribute('position', new THREE.BufferAttribute(pitchPositions, 3));

  const pitchPointMaterial = new THREE.PointsMaterial({
    color: 0xdbeafe, // Soft luminous starlight
    size: 0.0075,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const pitchPoints = new THREE.Points(pitchBaseGeo, pitchPointMaterial);
  group.add(pitchPoints);

  // --------------------------------------------------------------------------
  // 2. VOLUME CAPACITIVE FIELD (Warm Champagne / Golden Amber Dust)
  // --------------------------------------------------------------------------
  const volumeCount = 340;
  const volumeBaseGeo = new THREE.BufferGeometry();
  const volumePositions = new Float32Array(volumeCount * 3);
  const volumeBaseCoords = new Float32Array(volumeCount * 3);
  const volumePhases = new Float32Array(volumeCount);

  for (let i = 0; i < volumeCount; i++) {
    const u = Math.random() * Math.PI * 2;
    const v = Math.random() * Math.PI * 2;
    const majorR = 0.08 + Math.random() * 0.035;
    const minorR = 0.012 + Math.random() * 0.07;

    const x = volumeLoopPos.x + (majorR + minorR * Math.cos(v)) * Math.cos(u);
    const z = volumeLoopPos.z + (majorR + minorR * Math.cos(v)) * Math.sin(u);
    const y = volumeLoopPos.y + minorR * Math.sin(v);

    volumePositions[i * 3]     = x;
    volumePositions[i * 3 + 1] = y;
    volumePositions[i * 3 + 2] = z;

    volumeBaseCoords[i * 3]     = x;
    volumeBaseCoords[i * 3 + 1] = y;
    volumeBaseCoords[i * 3 + 2] = z;

    volumePhases[i] = Math.random() * Math.PI * 2;
  }

  volumeBaseGeo.setAttribute('position', new THREE.BufferAttribute(volumePositions, 3));

  const volumePointMaterial = new THREE.PointsMaterial({
    color: 0xf59e0b, // Warm golden filament glow
    size: 0.0075,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const volumePoints = new THREE.Points(volumeBaseGeo, volumePointMaterial);
  group.add(volumePoints);

  // --------------------------------------------------------------------------
  // 3. REACTIVE CORONA ARCS (Delicate Fine Filaments)
  // --------------------------------------------------------------------------
  const ARC_SEGMENTS = 12;
  const MAX_ARCS = 3;
  const arcPositions = new Float32Array(MAX_ARCS * ARC_SEGMENTS * 2 * 3);
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPositions, 3));

  const arcMaterial = new THREE.LineBasicMaterial({
    color: 0xfef3c7,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    linewidth: 1,
  });

  const arcLines = new THREE.LineSegments(arcGeo, arcMaterial);
  group.add(arcLines);

  // --------------------------------------------------------------------------
  // 4. MINIMALIST 3D HAND RINGS (Instead of heavy wireframe balls)
  // --------------------------------------------------------------------------
  const ringGeo = new THREE.RingGeometry(0.016, 0.019, 32);

  const pitchRingMat = new THREE.MeshBasicMaterial({
    color: 0xdbeafe,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
  });
  const pitchRing = new THREE.Mesh(ringGeo, pitchRingMat);
  pitchRing.visible = false;
  group.add(pitchRing);

  const volumeRingMat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
  });
  const volumeRing = new THREE.Mesh(ringGeo, volumeRingMat);
  volumeRing.visible = false;
  group.add(volumeRing);

  function generateArc(
    start: THREE.Vector3,
    end: THREE.Vector3,
    array: Float32Array,
    offset: number,
    jitterScale: number
  ) {
    const points: THREE.Vector3[] = [];
    points.push(start.clone());

    for (let s = 1; s < ARC_SEGMENTS; s++) {
      const t = s / ARC_SEGMENTS;
      const interp = new THREE.Vector3().lerpVectors(start, end, t);
      const env = Math.sin(t * Math.PI) * jitterScale;
      interp.x += (Math.random() - 0.5) * env;
      interp.y += (Math.random() - 0.5) * env;
      interp.z += (Math.random() - 0.5) * env;
      points.push(interp);
    }
    points.push(end.clone());

    for (let s = 0; s < ARC_SEGMENTS; s++) {
      const p1 = points[s];
      const p2 = points[s + 1];
      const idx = offset + s * 6;

      array[idx]     = p1.x;
      array[idx + 1] = p1.y;
      array[idx + 2] = p1.z;

      array[idx + 3] = p2.x;
      array[idx + 4] = p2.y;
      array[idx + 5] = p2.z;
    }
  }

  let arcFrameCounter = 0;

  const update = (
    time: number,
    pitchHandPos: THREE.Vector3 | null,
    volumeHandPos: THREE.Vector3 | null,
    pitchFreq: number,
    volumeGain: number
  ) => {
    // 1. Pitch Particles Update
    const pPos = pitchBaseGeo.attributes.position.array as Float32Array;
    const freqSpeed = Math.min(18.0, pitchFreq * 0.01);

    for (let i = 0; i < pitchCount; i++) {
      const bx = pitchBaseCoords[i * 3];
      const by = pitchBaseCoords[i * 3 + 1];
      const bz = pitchBaseCoords[i * 3 + 2];
      const phase = pitchPhases[i];

      const drift = Math.sin(time * 1.5 + phase) * 0.005;
      const ripple = Math.sin(time * freqSpeed + by * 20.0 + phase) * 0.004;

      let x = bx + Math.cos(phase + time) * drift;
      let y = by + ripple;
      let z = bz + Math.sin(phase + time) * drift;

      if (pitchHandPos) {
        const dx = pitchHandPos.x - x;
        const dy = pitchHandPos.y - y;
        const dz = pitchHandPos.z - z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < 0.30) {
          const pull = (1.0 - dist / 0.30) * 0.05;
          x += (dx / dist) * pull;
          y += (dy / dist) * pull;
          z += (dz / dist) * pull;
        }
      }

      pPos[i * 3]     = x;
      pPos[i * 3 + 1] = y;
      pPos[i * 3 + 2] = z;
    }
    pitchBaseGeo.attributes.position.needsUpdate = true;

    // 2. Volume Particles Update
    const vPos = volumeBaseGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < volumeCount; i++) {
      const bx = volumeBaseCoords[i * 3];
      const by = volumeBaseCoords[i * 3 + 1];
      const bz = volumeBaseCoords[i * 3 + 2];
      const phase = volumePhases[i];

      const drift = Math.sin(time * 1.4 + phase) * 0.005;
      let x = bx + drift;
      let y = by + Math.cos(time * 1.8 + phase) * 0.005;
      let z = bz + Math.sin(time * 1.2 + phase) * 0.005;

      if (volumeHandPos) {
        const dx = volumeHandPos.x - x;
        const dy = volumeHandPos.y - y;
        const dz = volumeHandPos.z - z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < 0.28) {
          const pull = (1.0 - dist / 0.28) * 0.045;
          x += (dx / dist) * pull;
          y += (dy / dist) * pull;
          z += (dz / dist) * pull;
        }
      }

      vPos[i * 3]     = x;
      vPos[i * 3 + 1] = y;
      vPos[i * 3 + 2] = z;
    }
    volumeBaseGeo.attributes.position.needsUpdate = true;

    // 3. Update Minimal 3D Hand Tracking Rings
    if (pitchHandPos) {
      pitchRing.position.copy(pitchHandPos);
      pitchRing.lookAt(pitchTipPos);
      pitchRing.visible = true;
      const s = 1.0 + Math.sin(time * 6.0) * 0.08;
      pitchRing.scale.set(s, s, s);
    } else {
      pitchRing.visible = false;
    }

    if (volumeHandPos) {
      volumeRing.position.copy(volumeHandPos);
      volumeRing.rotation.x = Math.PI / 2;
      volumeRing.visible = true;
      const s = 0.9 + volumeGain * 0.4;
      volumeRing.scale.set(s, s, s);
    } else {
      volumeRing.visible = false;
    }

    // 4. Update Subtle Corona Discharge Filaments
    arcFrameCounter++;
    if (arcFrameCounter % 3 === 0) {
      const arcPos = arcGeo.attributes.position.array as Float32Array;
      let arcIndex = 0;

      if (pitchHandPos) {
        const dist = pitchHandPos.distanceTo(pitchTipPos);
        if (dist < 0.24) {
          generateArc(pitchTipPos, pitchHandPos, arcPos, arcIndex * ARC_SEGMENTS * 6, 0.025);
          arcIndex++;
        }
      }

      if (volumeHandPos) {
        const dist = volumeHandPos.distanceTo(volumeLoopPos);
        if (dist < 0.22 && volumeGain > 0.08) {
          generateArc(volumeLoopPos, volumeHandPos, arcPos, arcIndex * ARC_SEGMENTS * 6, 0.02);
          arcIndex++;
        }
      }

      for (let k = arcIndex; k < MAX_ARCS; k++) {
        const startIdx = k * ARC_SEGMENTS * 6;
        for (let j = 0; j < ARC_SEGMENTS * 6; j++) {
          arcPos[startIdx + j] = 0;
        }
      }

      arcGeo.attributes.position.needsUpdate = true;
      arcMaterial.opacity = 0.35 + Math.random() * 0.3;
      arcLines.visible = arcIndex > 0;
    }
  };

  const dispose = () => {
    pitchBaseGeo.dispose();
    pitchPointMaterial.dispose();
    volumeBaseGeo.dispose();
    volumePointMaterial.dispose();
    arcGeo.dispose();
    arcMaterial.dispose();
    ringGeo.dispose();
    pitchRingMat.dispose();
    volumeRingMat.dispose();
  };

  return { group, update, dispose };
}
