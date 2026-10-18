// ============================================================================
// SWISS HANDPAN (PANART HANG) PROCEDURAL 3D MODEL (2000)
// Nitrided steel convex & bottom Gu shells, 9 embossed D Kurd harmonic tone fields,
// engraved note badges, hover halos, physical dimple deflection & cymatic ripples
// ============================================================================

import * as THREE from 'three';
import type { KinematicHandState, SpatialInstrumentScene } from '../../types/atelier';
import {
  HANDPAN_DOME,
  HANDPAN_TONES,
  handpanVisualState,
} from '../../audio/instruments/handpanEngine';

interface CymaticWave {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  active: boolean;
  scale: number;
  speed: number;
}

/**
 * Generates a crisp canvas texture for the subtle engraved note name on each tone field.
 */
function createNoteBadgeTexture(label: string, isDing: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 128, 128);

  // Subtle circular heat-treated bronze halo
  ctx.strokeStyle = isDing ? 'rgba(245, 158, 11, 0.55)' : 'rgba(16, 185, 129, 0.42)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.stroke();

  // Note typography
  ctx.font = isDing
    ? '600 30px "JetBrains Mono", monospace'
    : '500 28px "JetBrains Mono", monospace';
  ctx.fillStyle = isDing ? 'rgba(254, 243, 199, 0.88)' : 'rgba(226, 232, 240, 0.78)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 64, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function buildHandpanModel(): SpatialInstrumentScene {
  const group = new THREE.Group();

  // Tilt top dome towards the player/camera so all 9 tone fields are clearly visible and reachable
  group.position.set(HANDPAN_DOME.CENTER_X, HANDPAN_DOME.CENTER_Y, HANDPAN_DOME.CENTER_Z);
  group.rotation.x = HANDPAN_DOME.TILT_X;

  // 1. Top Nitrided Steel Shell ("Ding" Side)
  const topShellGeo = new THREE.SphereGeometry(
    HANDPAN_DOME.SHELL_RADIUS,
    64,
    32,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.5
  );
  const topShellMat = new THREE.MeshStandardMaterial({
    color: 0x1b2230, // Heat-blued nitrided steel
    roughness: 0.34,
    metalness: 0.88,
  });
  const topShell = new THREE.Mesh(topShellGeo, topShellMat);
  topShell.scale.set(1.0, 0.44, 1.0);
  topShell.castShadow = true;
  topShell.receiveShadow = true;
  group.add(topShell);

  // 2. Bottom Helmholtz Vessel Shell ("Gu" Side)
  const bottomShellGeo = new THREE.SphereGeometry(
    HANDPAN_DOME.SHELL_RADIUS,
    48,
    24,
    0,
    Math.PI * 2,
    Math.PI * 0.5,
    Math.PI * 0.5
  );
  const bottomShellMat = new THREE.MeshStandardMaterial({
    color: 0x141923,
    roughness: 0.42,
    metalness: 0.85,
  });
  const bottomShell = new THREE.Mesh(bottomShellGeo, bottomShellMat);
  bottomShell.scale.set(1.0, 0.40, 1.0);
  bottomShell.castShadow = true;
  group.add(bottomShell);

  // 3. Hand-Hammered Brass Equatorial Rim & Rope Seal
  const rimGeo = new THREE.TorusGeometry(HANDPAN_DOME.SHELL_RADIUS + 0.003, 0.009, 20, 72);
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    emissive: 0x78350f,
    emissiveIntensity: 0.15,
    roughness: 0.28,
    metalness: 0.92,
  });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.rotation.x = Math.PI / 2;
  group.add(rim);

  // 4. Sculpted Hardwood Tripod Stand underneath the vessel
  const standGeo = new THREE.CylinderGeometry(0.14, 0.22, 0.28, 32, 1, true);
  const standMat = new THREE.MeshStandardMaterial({
    color: 0x1c1510,
    roughness: 0.7,
    metalness: 0.15,
    side: THREE.DoubleSide,
  });
  const stand = new THREE.Mesh(standGeo, standMat);
  stand.position.set(0, -0.22, -0.04);
  stand.rotation.x = -HANDPAN_DOME.TILT_X * 0.65;
  group.add(stand);

  // 5. 9 Embossed Harmonic Tone Fields (1 Central Ding + 8 Chor Dimples)
  const dimpleGroups: THREE.Group[] = [];
  const dimpleMaterials: THREE.MeshStandardMaterial[] = [];
  const haloMaterials: THREE.MeshBasicMaterial[] = [];
  const badgeTextures: THREE.CanvasTexture[] = [];
  const baseLocalY: number[] = [];

  const dingGeo = new THREE.SphereGeometry(0.056, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.42);
  const chorGeo = new THREE.SphereGeometry(0.045, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.40);
  const haloGeo = new THREE.RingGeometry(0.046, 0.054, 36);
  const dingHaloGeo = new THREE.RingGeometry(0.057, 0.067, 40);
  const badgePlaneGeo = new THREE.PlaneGeometry(0.068, 0.068);

  for (let i = 0; i < HANDPAN_TONES.length; i++) {
    const tone = HANDPAN_TONES[i];
    const isDing = i === 0;

    const fieldGroup = new THREE.Group();
    fieldGroup.position.copy(tone.localPos);
    baseLocalY.push(tone.localPos.y);

    // Orient tone field normal to match the curved dome surface
    const surfaceNormal = new THREE.Vector3(
      tone.localPos.x * 0.85,
      1.0,
      tone.localPos.z * 0.85
    ).normalize();
    const upVec = new THREE.Vector3(0, 1, 0);
    fieldGroup.quaternion.setFromUnitVectors(upVec, surfaceNormal);

    // Hammered tone field dimple
    const mat = new THREE.MeshStandardMaterial({
      color: isDing ? 0x332b22 : 0x263142,
      emissive: isDing ? 0xf59e0b : 0x10b981,
      emissiveIntensity: isDing ? 0.16 : 0.10,
      roughness: 0.24,
      metalness: 0.92,
    });
    const dimpleMesh = new THREE.Mesh(isDing ? dingGeo : chorGeo, mat);
    dimpleMesh.scale.set(1.0, isDing ? 0.35 : 0.26, isDing ? 1.0 : 1.15);
    fieldGroup.add(dimpleMesh);

    // Glowing perimeter harmonic ring (lights up on hover and strike)
    const hMat = new THREE.MeshBasicMaterial({
      color: isDing ? 0xfbbf24 : 0x34d399,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const haloRing = new THREE.Mesh(isDing ? dingHaloGeo : haloGeo, hMat);
    haloRing.rotation.x = -Math.PI / 2;
    haloRing.position.y = 0.008;
    fieldGroup.add(haloRing);

    // Crisp engraved note label (always upright towards viewer)
    const tex = createNoteBadgeTexture(tone.shortLabel, isDing);
    badgeTextures.push(tex);
    const badgeMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    const badgeMesh = new THREE.Mesh(badgePlaneGeo, badgeMat);
    badgeMesh.rotation.x = -Math.PI / 2;
    badgeMesh.position.y = 0.019;
    fieldGroup.add(badgeMesh);

    group.add(fieldGroup);
    dimpleGroups.push(fieldGroup);
    dimpleMaterials.push(mat);
    haloMaterials.push(hMat);
  }

  // 6. Pool of 8 Polyphonic Expanding Cymatic Ripple Waves
  const rippleGeo = new THREE.RingGeometry(0.044, 0.052, 40);
  const cymaticWaves: CymaticWave[] = [];
  for (let i = 0; i < 8; i++) {
    const rMat = new THREE.MeshBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const rMesh = new THREE.Mesh(rippleGeo, rMat);
    rMesh.visible = false;
    group.add(rMesh);
    cymaticWaves.push({
      mesh: rMesh,
      mat: rMat,
      active: false,
      scale: 1.0,
      speed: 2.2,
    });
  }

  const spawnCymaticWave = (toneIndex: number, velocity: number): void => {
    const wave = cymaticWaves.find((w) => !w.active) || cymaticWaves[0];
    const targetGroup = dimpleGroups[toneIndex];
    if (!targetGroup) return;

    wave.active = true;
    wave.scale = 0.85;
    wave.speed = 1.8 + velocity * 1.4;
    wave.mesh.visible = true;
    wave.mesh.position.copy(targetGroup.position);
    wave.mesh.position.y += 0.015;
    wave.mesh.quaternion.copy(targetGroup.quaternion);
    wave.mesh.rotateX(-Math.PI / 2);

    wave.mat.color.setHex(toneIndex === 0 ? 0xfbbf24 : 0x34d399);
    wave.mat.opacity = Math.min(0.95, 0.45 + velocity * 0.5);
  };

  const update = (
    time: number,
    _leftK: KinematicHandState,
    _rightK: KinematicHandState,
    _leftLm: THREE.Vector3[] | null,
    _rightLm: THREE.Vector3[] | null,
    _gain: number
  ): void => {
    // 1. Consume pending strike ripple events from HandpanEngine
    while (handpanVisualState.pendingRipples.length > 0) {
      const ev = handpanVisualState.pendingRipples.shift()!;
      spawnCymaticWave(ev.toneIndex, ev.velocity);
    }

    // 2. Subtle breathing float of the vessel with Helmholtz cavity resonance
    const breath = Math.sin(time * 1.8) * 0.003;
    group.position.y = HANDPAN_DOME.CENTER_Y + breath;
    rimMat.emissiveIntensity = 0.12 + handpanVisualState.cavityResonance * 0.45;

    // 3. Update 9 Tone Field glows, hover highlights, and physical spring deflection
    for (let i = 0; i < HANDPAN_TONES.length; i++) {
      const isHovered = handpanVisualState.dimpleHovered[i];
      const isDing = i === 0;

      // Decay strike glow & physical deflection
      handpanVisualState.dimpleGlows[i] *= 0.91;
      handpanVisualState.dimpleDeflections[i] *= 0.82;

      const glow = handpanVisualState.dimpleGlows[i];
      const deflection = handpanVisualState.dimpleDeflections[i];

      const baseEmissive = isDing ? 0.16 : 0.10;
      const hoverBoost = isHovered ? 0.48 : 0.0;
      dimpleMaterials[i].emissiveIntensity = baseEmissive + hoverBoost + glow;

      // Halo ring brightness
      const targetHaloOpacity = isHovered
        ? 0.78 + Math.sin(time * 8.0) * 0.12
        : Math.min(0.95, 0.20 + glow * 0.45);
      haloMaterials[i].opacity += (targetHaloOpacity - haloMaterials[i].opacity) * 0.25;

      // Physical micro-bounce of the steel tone field on finger impact
      dimpleGroups[i].position.y = baseLocalY[i] - deflection * 0.009;
    }

    // 4. Animate expanding cymatic waves across the steel dome
    for (const wave of cymaticWaves) {
      if (!wave.active) continue;
      wave.scale += wave.speed * 0.025;
      wave.mesh.scale.set(wave.scale, wave.scale, 1);
      wave.mat.opacity *= 0.90;
      if (wave.mat.opacity < 0.015) {
        wave.active = false;
        wave.mesh.visible = false;
        wave.mat.opacity = 0;
      }
    }
  };

  const dispose = (): void => {
    topShellGeo.dispose();
    topShellMat.dispose();
    bottomShellGeo.dispose();
    bottomShellMat.dispose();
    rimGeo.dispose();
    rimMat.dispose();
    standGeo.dispose();
    standMat.dispose();
    dingGeo.dispose();
    chorGeo.dispose();
    haloGeo.dispose();
    dingHaloGeo.dispose();
    badgePlaneGeo.dispose();
    rippleGeo.dispose();
    for (const m of dimpleMaterials) m.dispose();
    for (const h of haloMaterials) h.dispose();
    for (const t of badgeTextures) t.dispose();
    for (const w of cymaticWaves) w.mat.dispose();
  };

  return { group, update, dispose };
}
