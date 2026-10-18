// ============================================================================
// ROY'S ATELIER OF SPATIAL INSTRUMENTS (v3.0) — TYPES & INTERFACES
// ============================================================================

import * as THREE from 'three';

export type InstrumentId = 'theremin' | 'cristal' | 'handpan' | 'martenot' | 'laserharp';

export interface InstrumentManifestItem {
  id: InstrumentId;
  name: string;
  year: string;
  subtitle: string;
  category: string;
  accentColor: string;
  accentColorHex: number;
  leftHint: string;
  rightHint: string;
}

export const INSTRUMENT_MANIFEST: Record<InstrumentId, InstrumentManifestItem> = {
  theremin: {
    id: 'theremin',
    name: 'Moog Etherwave',
    year: '1929 / 1996',
    subtitle: 'Heterodyne Capacitive Field Synthesizer',
    category: 'Electrophones · Class 5',
    accentColor: '#f59e0b',
    accentColorHex: 0xf59e0b,
    leftHint: 'Left: Elevate for volume · Fist to staccato mute',
    rightHint: 'Right: Proximity sets pitch · Finger pinch shapes vibrato',
  },
  cristal: {
    id: 'cristal',
    name: 'Cristal Baschet',
    year: '1952',
    subtitle: 'Friction Glass Organ & Flame Resonator',
    category: 'Friction Idiophones · 131.22',
    accentColor: '#38bdf8',
    accentColorHex: 0x38bdf8,
    leftHint: 'Both Hands: Stroke or orbit in air across 12 glass rods',
    rightHint: 'Tangential speed excites friction · Pinch brightens overtones',
  },
  handpan: {
    id: 'handpan',
    name: 'Swiss Handpan',
    year: '2000',
    subtitle: 'Harmonic Nitrided Steel Vessel (D Kurd 9)',
    category: 'Harmonic Idiophones · 111.24',
    accentColor: '#10b981',
    accentColorHex: 0x10b981,
    leftHint: 'Both Hands: Mid-air downward flick strikes 9 tone dimples',
    rightHint: 'Strike speed sets velocity · Palm roll bends harmonic swirl',
  },
  martenot: {
    id: 'martenot',
    name: 'Ondes Martenot',
    year: '1928',
    subtitle: 'Ribbon Wire & Palme Sympathetic Resonator',
    category: 'Electro-Acoustic · Class 5',
    accentColor: '#ec4899',
    accentColorHex: 0xec4899,
    leftHint: 'Left: Touche d’intensité pressure & palm aperture resonance',
    rightHint: 'Right: Slide index ring along wire · Micro-shake vibrato',
  },
  laserharp: {
    id: 'laserharp',
    name: 'Spatial Laser Harp',
    year: '1981 / 2026',
    subtitle: 'Zero-Mass Optical & Plucked Cymatic Harp',
    category: 'Optical Chordophone · 530 / 312.22',
    accentColor: '#8b5cf6',
    accentColorHex: 0x8b5cf6,
    leftHint: 'Both Hands: Break or sweep across 10 volumetric light beams',
    rightHint: 'Crossing speed plucks string · Vertical height filters tone',
  },
};

export interface KinematicHandState {
  hasHand: boolean;
  rawPos: THREE.Vector3;
  velocity: THREE.Vector3;
  acceleration: THREE.Vector3;
  rubEnergy: number; // [0, 1] tangential friction energy
  isStrike: boolean; // True on ballistic downward strike
  strikeVelocity: number; // [0, 1] strike energy
  palmNormal: THREE.Vector3; // 3D unit normal vector of palm plane
  wristRoll: number; // [-1, 1] roll around arm axis
  palmTilt: number; // [-1, 1] vertical tilt
  pinchAperture: number; // [0, 1] normalized thumb-to-index distance
}

export interface PortalHoverState {
  isActive: boolean;
  targetInstrument: InstrumentId | null;
  progress: number; // [0, 1] dwell progress
  screenX: number; // [0, 1]
  screenY: number; // [0, 1]
}

export interface SpatialInstrumentAudio {
  initAudio: (ctx: AudioContext, masterBus: AudioNode) => Promise<void> | void;
  update: (
    time: number,
    leftK: KinematicHandState,
    rightK: KinematicHandState,
    leftLandmarks: THREE.Vector3[] | null,
    rightLandmarks: THREE.Vector3[] | null
  ) => { primaryFreq: number; primaryGain: number; noteName?: string; cents?: number };
  mute: () => void;
  dispose: () => void;
}

export interface SpatialInstrumentScene {
  group: THREE.Group;
  update: (
    time: number,
    leftK: KinematicHandState,
    rightK: KinematicHandState,
    leftLandmarks: THREE.Vector3[] | null,
    rightLandmarks: THREE.Vector3[] | null,
    gain: number
  ) => void;
  dispose: () => void;
}
