// ============================================================================
// ROY'S ATELIER OF SPATIAL INSTRUMENTS (v3.1) — TYPES & INTERFACES
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
  wikiUrl: string;
  blurb: string;
}

export const INSTRUMENT_MANIFEST: Record<InstrumentId, InstrumentManifestItem> = {
  theremin: {
    id: 'theremin',
    name: 'Theremin',
    year: '1920',
    subtitle: 'Capacitive Field',
    category: 'Electrophone',
    accentColor: '#f59e0b',
    accentColorHex: 0xf59e0b,
    leftHint: 'Raise for volume · Fist mutes',
    rightHint: 'Move right for pitch · Pinch vibrato',
    wikiUrl: 'https://en.wikipedia.org/wiki/Theremin',
    blurb: 'Patented by Léon Theremin in 1928 and immortalized by virtuoso Clara Rockmore, two electromagnetic antennas sense your hands in mid-air without physical contact.',
  },
  cristal: {
    id: 'cristal',
    name: 'Cristal Baschet',
    year: '1952',
    subtitle: 'Crystal Organ',
    category: 'Friction Idiophone',
    accentColor: '#38bdf8',
    accentColorHex: 0x38bdf8,
    leftHint: 'Glide across glass rods',
    rightHint: 'Motion speed bows the crystal',
    wikiUrl: 'https://en.wikipedia.org/wiki/Cristal_Baschet',
    blurb: 'Sculpted in Paris by brothers Bernard and François Baschet, tuned glass rods stroked by the fingers transmit shimmering vibrations into a towering steel flame.',
  },
  handpan: {
    id: 'handpan',
    name: 'Swiss Handpan',
    year: '2000',
    subtitle: 'D Kurd Vessel',
    category: 'Struck Idiophone',
    accentColor: '#10b981',
    accentColorHex: 0x10b981,
    leftHint: 'Flick downward to strike',
    rightHint: 'Tilt palm to swirl overtones',
    wikiUrl: 'https://en.wikipedia.org/wiki/Handpan',
    blurb: 'Born in Bern, Switzerland from the steelpan and Indian ghatam, its nitrided steel dome unites fundamental, octave, and fifth harmonics in every dimple.',
  },
  martenot: {
    id: 'martenot',
    name: 'Ondes Martenot',
    year: '1928',
    subtitle: 'Ribbon & Palme',
    category: 'Electro-Acoustic',
    accentColor: '#ec4899',
    accentColorHex: 0xec4899,
    leftHint: 'Elevate for expression & harp',
    rightHint: 'Slide ring along wire for pitch',
    wikiUrl: 'https://en.wikipedia.org/wiki/Ondes_Martenot',
    blurb: 'Created by French cellist Maurice Martenot and beloved by Olivier Messiaen and Radiohead, a finger ring glides along a wire while a 12-string harp resonates sympathetically.',
  },
  laserharp: {
    id: 'laserharp',
    name: 'Laser Harp',
    year: '1981 · Future',
    subtitle: 'Optical Strings',
    category: 'Photonic Synth',
    accentColor: '#8b5cf6',
    accentColorHex: 0x8b5cf6,
    leftHint: 'Sweep through light beams',
    rightHint: 'Height filters tone · Pinch bends',
    wikiUrl: 'https://en.wikipedia.org/wiki/Laser_harp',
    blurb: 'Pioneered by Bernard Szajner and Jean-Michel Jarre, weightless shafts of coherent light replace physical strings—turning pure mid-air shadow into polyphonic sound.',
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
