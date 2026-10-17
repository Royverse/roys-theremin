// ============================================================================
// 3D ARTICULATED HAND SKELETON & CAPACITIVE TETHER RIG (THREE.JS)
// Renders full 21-joint 3D hands, finger-span indicators, and antenna field
// tethers directly inside the 3D WebGL viewport with 1:1 spatial fidelity.
// ============================================================================

import * as THREE from 'three';
import { WORLD_SPACE } from '../math/spatialProjection';

const HAND_BONE_CONNECTIONS: ReadonlyArray<[number, number]> = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm arch
  [5, 9], [9, 13], [13, 17], [0, 17],
];

interface ArticulatedHandMesh {
  root: THREE.Group;
  joints: THREE.Mesh[];
  bonesGeo: THREE.BufferGeometry;
  bonesMat: THREE.LineBasicMaterial;
  pinchGeo: THREE.BufferGeometry;
  pinchLine: THREE.Line;
}

export interface HandRig3DUpdateParams {
  time: number;
  hasPitchHand: boolean;
  pitchLandmarks3D: THREE.Vector3[] | null;
  pitchControlPos: THREE.Vector3 | null;
  pitchAntennaPoint: THREE.Vector3 | null;
  pitchPos: number;

  hasVolumeHand: boolean;
  volumeLandmarks3D: THREE.Vector3[] | null;
  volumeControlPos: THREE.Vector3 | null;
  volumeLoopPoint: THREE.Vector3 | null;
  volumeGain: number;
  isFistMuted: boolean;
}

export class HandRig3D {
  public readonly group = new THREE.Group();

  private pitchHandMesh: ArticulatedHandMesh;
  private volumeHandMesh: ArticulatedHandMesh;

  // Fallback / Probe Orbs (when in mouse mode or as core locus)
  private pitchProbe: THREE.Mesh;
  private volumeProbe: THREE.Mesh;

  // Sliding Resonance Ring on Pitch Rod & Volume Loop Halo
  private pitchRodRing: THREE.Mesh;
  private volumeLoopHalo: THREE.Mesh;

  // Capacitive Tether Lines (Hand -> Antenna)
  private pitchTetherGeo: THREE.BufferGeometry;
  private pitchTetherLine: THREE.Line;
  private volumeTetherGeo: THREE.BufferGeometry;
  private volumeTetherLine: THREE.Line;

  // Shared Geometries for disposal
  private jointSphereSmall = new THREE.SphereGeometry(0.0042, 12, 12);
  private jointSphereKey = new THREE.SphereGeometry(0.0065, 16, 16);

  constructor() {
    // 1. Build 3D Articulated Hand Meshes (Right = Platinum/Cyan, Left = Warm Amber)
    this.pitchHandMesh = this.createHandMesh(0xe2e8f0, 0x38bdf8, true);
    this.volumeHandMesh = this.createHandMesh(0xfbbf24, 0xf59e0b, false);
    this.group.add(this.pitchHandMesh.root);
    this.group.add(this.volumeHandMesh.root);

    // 2. Build Control Locus Probes (visible in both camera & mouse modes)
    const probeGeo = new THREE.SphereGeometry(0.009, 20, 20);
    const pitchProbeMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.85,
    });
    this.pitchProbe = new THREE.Mesh(probeGeo, pitchProbeMat);
    this.pitchProbe.visible = false;
    this.group.add(this.pitchProbe);

    const volumeProbeMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.85,
    });
    this.volumeProbe = new THREE.Mesh(probeGeo, volumeProbeMat);
    this.volumeProbe.visible = false;
    this.group.add(this.volumeProbe);

    // 3. Sliding Resonance Ring on the Vertical Pitch Rod
    const rodRingGeo = new THREE.RingGeometry(0.009, 0.016, 32);
    const rodRingMat = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.pitchRodRing = new THREE.Mesh(rodRingGeo, rodRingMat);
    this.pitchRodRing.rotation.x = Math.PI / 2;
    this.pitchRodRing.position.set(WORLD_SPACE.PITCH_ROD_X, 0.25, 0);
    this.group.add(this.pitchRodRing);

    // 4. Expanding Flux Halo inside the Horizontal Volume Loop
    const loopHaloGeo = new THREE.RingGeometry(0.015, 0.048, 32);
    const loopHaloMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.volumeLoopHalo = new THREE.Mesh(loopHaloGeo, loopHaloMat);
    this.volumeLoopHalo.rotation.x = Math.PI / 2;
    this.volumeLoopHalo.position.set(WORLD_SPACE.VOLUME_LOOP_X, WORLD_SPACE.VOLUME_LOOP_Y, 0);
    this.group.add(this.volumeLoopHalo);

    // 5. Capacitive Measurement Tether Lines
    this.pitchTetherGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    this.pitchTetherLine = new THREE.Line(
      this.pitchTetherGeo,
      new THREE.LineBasicMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
      })
    );
    this.pitchTetherLine.visible = false;
    this.group.add(this.pitchTetherLine);

    this.volumeTetherGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    this.volumeTetherLine = new THREE.Line(
      this.volumeTetherGeo,
      new THREE.LineBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
      })
    );
    this.volumeTetherLine.visible = false;
    this.group.add(this.volumeTetherLine);
  }

  private createHandMesh(
    jointColorHex: number,
    boneColorHex: number,
    hasPinchLine: boolean
  ): ArticulatedHandMesh {
    const root = new THREE.Group();
    root.visible = false;

    const joints: THREE.Mesh[] = [];
    const keyIndices = new Set([0, 4, 8, 12, 16, 20]);

    const jointMat = new THREE.MeshBasicMaterial({
      color: jointColorHex,
      transparent: true,
      opacity: 0.9,
    });

    const tipMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
    });

    for (let i = 0; i < 21; i++) {
      const isKey = keyIndices.has(i);
      const mesh = new THREE.Mesh(
        isKey ? this.jointSphereKey : this.jointSphereSmall,
        isKey ? tipMat.clone() : jointMat.clone()
      );
      joints.push(mesh);
      root.add(mesh);
    }

    // Bones geometry (24 connections * 2 vertices * 3 floats)
    const bonePositions = new Float32Array(HAND_BONE_CONNECTIONS.length * 2 * 3);
    const bonesGeo = new THREE.BufferGeometry();
    bonesGeo.setAttribute('position', new THREE.BufferAttribute(bonePositions, 3));

    const bonesMat = new THREE.LineBasicMaterial({
      color: boneColorHex,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    });
    const bonesSegments = new THREE.LineSegments(bonesGeo, bonesMat);
    root.add(bonesSegments);

    // Thumb-to-Index aerial fingering span indicator
    const pinchGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const pinchLine = new THREE.Line(
      pinchGeo,
      new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: hasPinchLine ? 0.85 : 0.0,
        blending: THREE.AdditiveBlending,
      })
    );
    pinchLine.visible = hasPinchLine;
    root.add(pinchLine);

    return { root, joints, bonesGeo, bonesMat, pinchGeo, pinchLine };
  }

  private updateArticulatedHand(
    handMesh: ArticulatedHandMesh,
    landmarks3D: THREE.Vector3[] | null,
    isMuted = false
  ): void {
    if (!landmarks3D || landmarks3D.length < 21) {
      handMesh.root.visible = false;
      return;
    }

    handMesh.root.visible = true;

    // Update 21 joint positions
    for (let i = 0; i < 21; i++) {
      handMesh.joints[i].position.copy(landmarks3D[i]);
    }

    // Update 24 bone segments
    const posArr = handMesh.bonesGeo.attributes.position.array as Float32Array;
    for (let c = 0; c < HAND_BONE_CONNECTIONS.length; c++) {
      const [i1, i2] = HAND_BONE_CONNECTIONS[c];
      const p1 = landmarks3D[i1];
      const p2 = landmarks3D[i2];
      const offset = c * 6;
      posArr[offset]     = p1.x;
      posArr[offset + 1] = p1.y;
      posArr[offset + 2] = p1.z;
      posArr[offset + 3] = p2.x;
      posArr[offset + 4] = p2.y;
      posArr[offset + 5] = p2.z;
    }
    handMesh.bonesGeo.attributes.position.needsUpdate = true;

    // Color shift if fist muted
    if (isMuted) {
      handMesh.bonesMat.color.setHex(0xef4444);
    } else if (handMesh === this.volumeHandMesh) {
      handMesh.bonesMat.color.setHex(0xf59e0b);
    }

    // Update thumb-to-index aerial fingering line (landmarks 4 & 8)
    if (handMesh.pinchLine.visible) {
      const pinchArr = handMesh.pinchGeo.attributes.position.array as Float32Array;
      const thumb = landmarks3D[4];
      const index = landmarks3D[8];
      pinchArr[0] = thumb.x;
      pinchArr[1] = thumb.y;
      pinchArr[2] = thumb.z;
      pinchArr[3] = index.x;
      pinchArr[4] = index.y;
      pinchArr[5] = index.z;
      handMesh.pinchGeo.attributes.position.needsUpdate = true;
    }
  }

  public update(params: HandRig3DUpdateParams): void {
    const {
      time,
      hasPitchHand,
      pitchLandmarks3D,
      pitchControlPos,
      pitchAntennaPoint,
      pitchPos,
      hasVolumeHand,
      volumeLandmarks3D,
      volumeControlPos,
      volumeLoopPoint,
      volumeGain,
      isFistMuted,
    } = params;

    // 1. Update 3D Articulated Hands (when webcam landmarks are present)
    this.updateArticulatedHand(this.pitchHandMesh, hasPitchHand ? pitchLandmarks3D : null);
    this.updateArticulatedHand(
      this.volumeHandMesh,
      hasVolumeHand ? volumeLandmarks3D : null,
      isFistMuted
    );

    // 2. Update Pitch Control Probe, Tether & Sliding Antenna Ring
    if (hasPitchHand && pitchControlPos && pitchAntennaPoint) {
      // Show probe orb only when full 3D skeleton is not shown (e.g. mouse mode)
      this.pitchProbe.visible = !pitchLandmarks3D;
      this.pitchProbe.position.copy(pitchControlPos);

      // Update tether line from hand control point to pitch antenna rod
      this.pitchTetherLine.visible = true;
      const pTether = this.pitchTetherGeo.attributes.position.array as Float32Array;
      pTether[0] = pitchControlPos.x;
      pTether[1] = pitchControlPos.y;
      pTether[2] = pitchControlPos.z;
      pTether[3] = pitchAntennaPoint.x;
      pTether[4] = pitchAntennaPoint.y;
      pTether[5] = pitchAntennaPoint.z;
      this.pitchTetherGeo.attributes.position.needsUpdate = true;

      // Slide resonance ring along the pitch rod
      const rodY =
        WORLD_SPACE.PITCH_ROD_Y_MIN +
        pitchPos * (WORLD_SPACE.PITCH_ROD_Y_MAX - WORLD_SPACE.PITCH_ROD_Y_MIN);
      this.pitchRodRing.position.set(WORLD_SPACE.PITCH_ROD_X, rodY, 0);
      const ringScale = 1.0 + pitchPos * 0.65 + Math.sin(time * 8.0) * 0.08;
      this.pitchRodRing.scale.set(ringScale, ringScale, 1);
      this.pitchRodRing.visible = true;
    } else {
      this.pitchProbe.visible = false;
      this.pitchTetherLine.visible = false;
      this.pitchRodRing.visible = false;
    }

    // 3. Update Volume Control Probe, Tether & Loop Flux Halo
    if (hasVolumeHand && volumeControlPos && volumeLoopPoint) {
      this.volumeProbe.visible = !volumeLandmarks3D;
      this.volumeProbe.position.copy(volumeControlPos);
      (this.volumeProbe.material as THREE.MeshBasicMaterial).color.setHex(
        isFistMuted ? 0xef4444 : 0xfbbf24
      );

      this.volumeTetherLine.visible = true;
      const vTether = this.volumeTetherGeo.attributes.position.array as Float32Array;
      vTether[0] = volumeControlPos.x;
      vTether[1] = volumeControlPos.y;
      vTether[2] = volumeControlPos.z;
      vTether[3] = volumeLoopPoint.x;
      vTether[4] = volumeLoopPoint.y;
      vTether[5] = volumeLoopPoint.z;
      this.volumeTetherGeo.attributes.position.needsUpdate = true;

      this.volumeLoopHalo.visible = true;
      const haloScale = 0.6 + volumeGain * 1.15;
      this.volumeLoopHalo.scale.set(haloScale, haloScale, 1);
      const haloMat = this.volumeLoopHalo.material as THREE.MeshBasicMaterial;
      haloMat.color.setHex(isFistMuted ? 0xef4444 : 0xf59e0b);
      haloMat.opacity = isFistMuted ? 0.35 : 0.2 + volumeGain * 0.6;
    } else {
      this.volumeProbe.visible = false;
      this.volumeTetherLine.visible = false;
      this.volumeLoopHalo.visible = false;
    }
  }
}
