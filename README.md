# Roy’s Theremin — Acoustic Field Synthesizer

> A high-touch, sculptural 3D WebGL Theremin played with real-time MediaPipe hand tracking and vacuum-tube acoustics.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Netlify-00ad9f?style=for-the-badge&logo=netlify)](https://roys-theremin.netlify.app)
[![Three.js](https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=three.js&logoColor=white)](https://threejs.org/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Hands%20AI-0072b2?style=for-the-badge&logo=google)](https://developers.google.com/mediapipe)
[![Web Audio API](https://img.shields.io/badge/Web%20Audio-Acoustics-f59e0b?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

---

## 🌐 Live Experience
Experience the instrument directly in your browser:  
👉 **[https://roys-theremin.netlify.app](https://roys-theremin.netlify.app)**

---

## ✨ Highlights & Architecture

### 1. Authentic Historical Mechanics & Acoustics
* **Pitch Antenna (Vertical Chrome Rod):**  
  Measures mutual capacitance changes to alter the beat frequency of a heterodyne dual-oscillator across 5 octaves ($C_2\ 65.4\text{ Hz}$ to $C_7\ 2093\text{ Hz}$).
* **Clara Rockmore’s Aerial Fingering:**  
  Arm position places the octave register, while opening or curling the fingers (thumb-to-index pinch aperture) articulates microtonal semitones and natural vibrato ($\pm 35\text{ cents}$) without arm shaking.
* **Volume Antenna (Horizontal Chrome Loop):**  
  Authentic inverted capacitance response: resting or hovering near the loop mutes sound completely ($0\text{ dB}$); lifting upward increases loudness.
* **Staccato Articulation:**  
  Clenching your left hand into a fist or performing a rapid downward dip triggers an instant, click-free mute, allowing you to articulate individual notes without sliding between them.

### 2. Luxury Neumorphic Interface (2026 Aesthetic)
* **Sculptural Floating Console:** Replaces cluttered corner cards with an obsidian glass console (`backdrop-filter: blur(28px)`) featuring dual-directional lighting and debossed tactile grooves.
* **Swiss-Precision Cent Deviation Ruler:** Ultra-fine horizontal scale with micro-ticks and an illuminated needle that locks into an emerald state when within $\pm 5\text{ cents}$ of tempered pitch.
* **Segmented Scale Selector:** Seamlessly switch between **Analog** (pure continuous microtonal glissando), **Magnetic** (Gaussian soft-quantization for guided pitch centering), and **Pentatonic**.
* **Incandescent Filament Indicator:** A pulsating pilot lamp modeled on vintage vacuum-tube warmup dynamics.

### 3. Procedural 3D WebGL (Three.js) & Field VFX
* **Moog Etherwave Body:** 100% procedural walnut woodgrain cabinet, brushed metal faceplate, 4 Bakelite rotary control knobs, and a telescopic mic stand.
* **12AX7 Glowing Vacuum Tube:** Glass capsule with internal triode plates and a warm tungsten filament point light that pulses with audio amplitude.
* **Capacitive Electromagnetic Field FX:** Swirling particles around both antennas that pull toward your hands as they draw near, plus **delicate, organic corona discharge filaments** bridging the antennas to your fingertips.

### 4. Real-Time MediaPipe Hand Tracking
* **Mirrored Video Stream:** Mirrored perspective for natural hand-eye coordination.
* **Starlight Wireframe Skeleton:** Whisper-thin 1.2px pearl and amber lines with delicate micro-joint nodes.
* **Zero-Setup Mouse/Touch Fallback:** Move your cursor across the screen to test pitch and volume immediately even without a camera.

---

## 🎮 How to Play

1. Open **[https://roys-theremin.netlify.app](https://roys-theremin.netlify.app)**.
2. Click **Audio** to initialize the Web Audio engine.
3. Click **Vision** to enable your webcam for MediaPipe hand tracking.
4. **Right Hand (Pitch):**
   * Move closer to the right vertical rod to raise pitch; move away to lower pitch.
   * Pinch or spread thumb and index fingers for Clara Rockmore aerial vibrato.
5. **Left Hand (Volume):**
   * Raise your hand above the horizontal loop to increase volume.
   * Lower your hand toward the loop or form a fist to mute sound instantly.

---

## 🛠️ Local Development & Build

### Prerequisites
* Node.js 18+ (tested on Node v22)
* npm or pnpm

### Quickstart
```bash
# Clone the repository
git clone https://github.com/Royverse/roys-theremin.git
cd roys-theremin

# Install dependencies
npm install

# Start local development server
npm run dev

# Build for production
npm run build
```

---

## 📜 License
MIT License © 2026 Royverse
