// ============================================================================
// SPATIAL PROJECTION & CAMERA-INVARIANT THEREMIN KINEMATICS
// Maps 2D/3D MediaPipe hand landmarks to Three.js world coordinates and
// computes capacitance-based pitch & volume parameters.
// ============================================================================

import * as THREE from 'three';
import type { NormalizedLandmark } from '../types/mediapipe';

export interface CalibrationBounds {
  pitchMinX: number;     // Mirrored screen X for lowest pitch (Zero Beat, default 0.44)
  pitchAntennaX: number; // Mirrored screen X of the vertical pitch rod (default 0.76)
  volumeLoopY: number;   // Screen Y of the horizontal volume loop (mute plane, default 0.75)
  volumeMaxY: number;    // Screen Y for maximum volume crescendo (default 0.22)
}

export const DEFAULT_CALIBRATION: CalibrationBounds = {
  pitchMinX: 0.44,
  pitchAntennaX: 0.76,
  volumeLoopY: 0.75,
  volumeMaxY: 0.22,
};

// 3D World constants matching `thereminModel.ts` (SI meters)
export const WORLD_SPACE = {
  SPAN_X: 1.12,           // Total horizontal width mapped across screen [0, 1] -> [-0.56m, +0.56m]
  SPAN_Y: 0.72,           // Total vertical height scale
  FLOOR_SCREEN_Y: 0.76,   // Screen Y corresponding to world Y = 0.0m
  BASE_Z: 0.06,           // Default hand depth in front of cabinet
  CANONICAL_PALM_M: 0.082,// Anatomical palm length (wrist to middle MCP) in meters (~8.2cm)
  PITCH_ROD_X: 0.26,      // 3D X position of vertical pitch antenna
  PITCH_ROD_Y_MIN: 0.065, // 3D Y base of pitch antenna
  PITCH_ROD_Y_MAX: 0.525, // 3D Y tip of pitch antenna
  VOLUME_LOOP_X: -0.35,   // 3D X center of horizontal volume loop
  VOLUME_LOOP_Y: 0.02,    // 3D Y height of horizontal volume loop
};

/**
 * Monotonically maps mirrored normalized screen coordinates [0, 1] into 3D world space.
 * Guarantees 1:1 directional fidelity:
 * - Moving left on screen (normX decreases) strictly decreases worldX (moves left in 3D).
 * - Moving right on screen (normX increases) strictly increases worldX (moves right in 3D).
 * - Moving up on screen (normY decreases) strictly increases worldY (moves up in 3D).
 */
export function projectScreenToWorld(
  normX: number,
  normY: number,
  normZ = 0
): THREE.Vector3 {
  const clampedX = Math.max(0.0, Math.min(1.0, normX));
  const clampedY = Math.max(0.0, Math.min(1.0, normY));
  const clampedZ = Math.max(-0.25, Math.min(0.25, normZ));

  const worldX = (clampedX - 0.5) * WORLD_SPACE.SPAN_X;
  const worldY = (WORLD_SPACE.FLOOR_SCREEN_Y - clampedY) * WORLD_SPACE.SPAN_Y;
  const worldZ = WORLD_SPACE.BASE_Z - clampedZ * 0.35;

  return new THREE.Vector3(worldX, worldY, worldZ);
}

/**
 * Computes anatomical palm length (Wrist [0] to Middle MCP [9]) in normalized screen space.
 * Used as a scale-invariant divisor so gesture thresholds work at any distance from the webcam.
 */
export function computePalmScale(landmarks: NormalizedLandmark[]): number {
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  if (!wrist || !middleMcp) return 0.1;

  const dist = Math.hypot(
    middleMcp.x - wrist.x,
    middleMcp.y - wrist.y,
    (middleMcp.z - wrist.z) * 0.5
  );
  return Math.max(0.035, Math.min(0.35, dist));
}

/**
 * Reconstructs all 21 3D hand landmarks in Three.js world space with anatomical scale normalization.
 * Ensures the 3D hand rig moves in exact 1:1 correspondence with the user's hand while maintaining
 * natural physical proportions relative to the 3D Theremin cabinet.
 */
export function projectHandLandmarksTo3D(
  landmarks: NormalizedLandmark[]
): THREE.Vector3[] {
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  const palmCenterX = (wrist.x + middleMcp.x) * 0.5;
  const palmCenterY = (wrist.y + middleMcp.y) * 0.5;
  const palmCenterZ = ((wrist.z || 0) + (middleMcp.z || 0)) * 0.5;

  const palmAnchorWorld = projectScreenToWorld(palmCenterX, palmCenterY, palmCenterZ);
  const palmScale2D = computePalmScale(landmarks);

  // Normalize hand size in 3D space to anatomical scale (~8.2cm palm length)
  const metricScale = WORLD_SPACE.CANONICAL_PALM_M / palmScale2D;

  return landmarks.map((lm) => {
    const dx = (lm.x - palmCenterX) * metricScale;
    const dy = -(lm.y - palmCenterY) * metricScale; // Invert screen Y to 3D +Y up
    const dz = -((lm.z || 0) - palmCenterZ) * metricScale * 0.85;

    return new THREE.Vector3(
      palmAnchorWorld.x + dx,
      palmAnchorWorld.y + dy,
      palmAnchorWorld.z + dz
    );
  });
}

export interface PitchKinematicsResult {
  pitchPos: number;              // Normalized [0, 1] pitch proximity
  pitchSpan: number;             // Normalized [-1, 1] Clara Rockmore aerial finger aperture
  handWorldPos: THREE.Vector3;   // 3D position of the active pitch control point
  antennaClosestPoint: THREE.Vector3; // Nearest point on the 3D vertical pitch rod
  rawScreenPos: { x: number; y: number };
}

/**
 * Computes Pitch Antenna kinematics and Clara Rockmore aerial fingering modulation
 * from mirrored right-hand landmarks.
 */
export function computePitchKinematics(
  landmarks: NormalizedLandmark[],
  landmarks3D: THREE.Vector3[],
  calibration: CalibrationBounds = DEFAULT_CALIBRATION
): PitchKinematicsResult {
  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const middleMcp = landmarks[9];
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const pinkyTip = landmarks[20];

  const palmScale = computePalmScale(landmarks);

  // Active sensing locus: weighted toward index knuckle & index tip (leading edge facing antenna)
  const senseX = wrist.x * 0.25 + indexMcp.x * 0.45 + indexTip.x * 0.30;
  const senseY = wrist.y * 0.25 + indexMcp.y * 0.45 + indexTip.y * 0.30;

  // 1. Coarse Pitch Proximity:
  // Combines horizontal approach toward the pitch antenna with a gentle vertical register assist.
  // Moving right toward the pitch antenna (from pitchMinX -> pitchAntennaX) smoothly raises pitch.
  // If the hand passes slightly to the right of pitchAntennaX, we use a smooth symmetric radial falloff
  // around the antenna rod so it never jumps abruptly.
  const spanX = Math.max(0.15, calibration.pitchAntennaX - calibration.pitchMinX);
  let horizontalProximity: number;

  if (senseX <= calibration.pitchAntennaX) {
    horizontalProximity = (senseX - calibration.pitchMinX) / spanX;
  } else {
    // Smooth proximity on the outer side of the rod
    const overshoot = senseX - calibration.pitchAntennaX;
    horizontalProximity = 1.0 - overshoot / (spanX * 0.65);
  }
  horizontalProximity = Math.max(0.0, Math.min(1.0, horizontalProximity));

  // Subtle vertical height contribution (raising hand along the rod slightly elevates register)
  const verticalHeight = Math.max(0.0, Math.min(1.0, (0.75 - senseY) / 0.55));
  const pitchPos = Math.max(
    0.0,
    Math.min(1.0, horizontalProximity * 0.88 + verticalHeight * 0.12)
  );

  // 2. Clara Rockmore Aerial Fingering (Scale-Invariant via Palm Normalization):
  // Measure thumb-index pinch ratio and thumb-pinky fan ratio relative to anatomical palm size.
  const pinchRatio = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y) / palmScale;
  const fanRatio = Math.hypot(thumbTip.x - pinkyTip.x, thumbTip.y - pinkyTip.y) / palmScale;

  // Neutral resting hand: pinchRatio ~ 0.52, fanRatio ~ 1.10
  const pinchDelta = (pinchRatio - 0.52) / 0.42;
  const fanDelta = (fanRatio - 1.10) / 0.55;
  const pitchSpan = Math.max(-1.0, Math.min(1.0, pinchDelta * 0.65 + fanDelta * 0.35));

  // 3. 3D World Control Point & Nearest Antenna Point (for 3D visual tether & arcs)
  const indexTip3D = landmarks3D[8] || projectScreenToWorld(senseX, senseY);
  const middleMcp3D = landmarks3D[9] || projectScreenToWorld(middleMcp.x, middleMcp.y);
  const handWorldPos = new THREE.Vector3().lerpVectors(middleMcp3D, indexTip3D, 0.65);

  const clampedRodY = Math.max(
    WORLD_SPACE.PITCH_ROD_Y_MIN,
    Math.min(WORLD_SPACE.PITCH_ROD_Y_MAX, handWorldPos.y)
  );
  const antennaClosestPoint = new THREE.Vector3(
    WORLD_SPACE.PITCH_ROD_X,
    clampedRodY,
    0.0
  );

  return {
    pitchPos,
    pitchSpan,
    handWorldPos,
    antennaClosestPoint,
    rawScreenPos: { x: senseX, y: senseY },
  };
}

export interface VolumeKinematicsResult {
  volumeHeight: number;          // Normalized [0, 1] height above volume loop
  isFistMuted: boolean;          // True when hand is clenched into a staccato mute fist
  handWorldPos: THREE.Vector3;   // 3D position of the palm center
  loopClosestPoint: THREE.Vector3; // Corresponding point on the 3D horizontal volume loop
  rawScreenPos: { x: number; y: number };
}

/**
 * Computes Volume Loop kinematics and camera-distance-invariant Fist Staccato Mute
 * from mirrored left-hand landmarks.
 */
export function computeVolumeKinematics(
  landmarks: NormalizedLandmark[],
  landmarks3D: THREE.Vector3[],
  calibration: CalibrationBounds = DEFAULT_CALIBRATION
): VolumeKinematicsResult {
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  const palmScale = computePalmScale(landmarks);

  const palmX = (wrist.x + middleMcp.x) * 0.5;
  const palmY = (wrist.y + middleMcp.y) * 0.5;

  // 1. Vertical Elevation above Volume Loop:
  // In screen space, smaller Y = higher physical hand = louder volume.
  const activeVerticalRange = Math.max(0.18, calibration.volumeLoopY - calibration.volumeMaxY);
  const volumeHeight = Math.max(
    0.0,
    Math.min(1.0, (calibration.volumeLoopY - palmY) / activeVerticalRange)
  );

  // 2. Scale-Invariant Fist / Staccato Mute Detection:
  // Compare fingertip-to-wrist and fingertip-to-MCP distances against palmScale.
  const tipPairs: Array<[number, number]> = [
    [8, 5],   // Index tip to MCP
    [12, 9],  // Middle tip to MCP
    [16, 13], // Ring tip to MCP
    [20, 17], // Pinky tip to MCP
  ];

  let avgTipToWristRatio = 0;
  let avgTipToMcpRatio = 0;

  for (const [tipIdx, mcpIdx] of tipPairs) {
    const tip = landmarks[tipIdx];
    const mcp = landmarks[mcpIdx];
    avgTipToWristRatio += Math.hypot(tip.x - wrist.x, tip.y - wrist.y) / palmScale;
    avgTipToMcpRatio += Math.hypot(tip.x - mcp.x, tip.y - mcp.y) / palmScale;
  }
  avgTipToWristRatio /= 4;
  avgTipToMcpRatio /= 4;

  // Open palm: avgTipToWristRatio ~ 1.75, avgTipToMcpRatio ~ 0.82
  // Closed fist: avgTipToWristRatio < 1.12 or avgTipToMcpRatio < 0.46
  const isFistMuted = avgTipToWristRatio < 1.12 || avgTipToMcpRatio < 0.46;

  // 3. 3D World Control Point & Loop Anchor
  const wrist3D = landmarks3D[0] || projectScreenToWorld(wrist.x, wrist.y);
  const mcp3D = landmarks3D[9] || projectScreenToWorld(middleMcp.x, middleMcp.y);
  const handWorldPos = new THREE.Vector3().lerpVectors(wrist3D, mcp3D, 0.55);

  const clampedLoopX = Math.max(-0.44, Math.min(-0.26, handWorldPos.x));
  const loopClosestPoint = new THREE.Vector3(
    clampedLoopX,
    WORLD_SPACE.VOLUME_LOOP_Y,
    0.0
  );

  return {
    volumeHeight,
    isFistMuted,
    handWorldPos,
    loopClosestPoint,
    rawScreenPos: { x: palmX, y: palmY },
  };
}
