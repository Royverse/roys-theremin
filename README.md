# Roy’s Theremin — Acoustic Field Synthesizer (v2.0)

> A high-precision 3D WebGL & MediaPipe virtual theremin featuring **1€ Adaptive Velocity Hand Tracking**, **Palm-Scale Invariant Kinematics**, **3D Articulated Hand Skeletons**, and **12AX7 Triode Formant Synthesis**.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Netlify-00ad9f?style=for-the-badge&logo=netlify)](https://roys-theremin.netlify.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-WebGL%203D-000000?style=for-the-badge&logo=three.js&logoColor=white)](https://threejs.org/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Hands%20AI-0072b2?style=for-the-badge&logo=google)](https://developers.google.com/mediapipe)
[![Web Audio API](https://img.shields.io/badge/Web%20Audio-DSP%20Engine-f59e0b?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

---

## 🌐 Live Experience
Play the instrument directly in your browser:  
👉 **[https://roys-theremin.netlify.app](https://roys-theremin.netlify.app)**

---

## 🏛️ Codebase Architecture

The project is organized into clean, decoupled domain layers with strict TypeScript typing (`noUnusedLocals`, `noUnusedParameters`, zero `any` types):

```text
roys-theremin/
├── public/
│   └── favicon.svg                 # Bespoke vector emblem (glowing vacuum tube & antennas)
├── src/
│   ├── audio/
│   │   ├── impulseReverb.ts        # Procedural stereo concert-hall impulse response generator
│   │   └── thereminEngine.ts       # Dual-oscillator heterodyne DSP, 4 formant voices & 12AX7 waveshaper
│   ├── math/
│   │   ├── oneEuroFilter.ts        # 1€ Adaptive Velocity Filter (Casiez et al., CHI 2012)
│   │   └── spatialProjection.ts    # Monotonic 1:1 3D projection & palm-scale invariant kinematics
│   ├── scene/
│   │   ├── fieldVfx.ts             # Capacitive starlight/amber particle fields & corona discharge arcs
│   │   ├── handRig3D.ts            # 21-joint 3D articulated hand skeletons & antenna capacitance tethers
│   │   └── thereminModel.ts        # Procedural Moog Etherwave cabinet, 12AX7 tube & chrome antennas
│   ├── tracking/
│   │   └── handTracker.ts          # MediaPipe Hands pipeline, hysteresis, 1-hand assist & spatial calibration
│   ├── types/
│   │   └── mediapipe.d.ts          # Strict TypeScript declarations for @mediapipe/hands
│   ├── ui/
│   │   └── hud.ts                  # Luxury neumorphic console, Swiss cent dial, voice selector & scope
│   ├── main.ts                     # Application orchestrator & 60 FPS simulation loop
│   └── style.css                   # 2026 Neumorphic dark-studio design system
├── index.html                      # Application entry & floating camera dock
├── netlify.toml                    # Production build config & strict HTTP security headers
├── package.json                    # Dependencies & build scripts
└── tsconfig.json                   # Strict TypeScript compiler configuration
```

---

## 🔬 Mathematical Foundations (Enhancement v2)

### 1. Strict 1:1 Monotonic Spatial Projection
In mirrored webcam coordinates ($x_{\text{norm}} \in [0, 1]$, where $0$ is screen-left and $1$ is screen-right), moving either hand horizontally maps strictly monotonically to 3D Three.js world coordinates:

$$X_{\text{world}} = (x_{\text{norm}} - 0.5) \cdot W_{\text{span}}, \quad \frac{\partial X_{\text{world}}}{\partial x_{\text{norm}}} = W_{\text{span}} > 0$$

* **Left Volume Loop ($X = -0.35\text{ m}$):** Positioned in the left sensing zone ($x_{\text{norm}} \in [0.06, 0.48]$).
* **Right Pitch Rod ($X = +0.26\text{ m}$):** Positioned at the right boundary of the active pitch zone ($x_{\text{norm}} \in [0.44, 0.88]$). Moving your right hand to the right approaches the vertical pitch antenna and raises pitch; moving to the left moves away from the antenna and lowers pitch in exact visual and physical correspondence.

### 2. 1€ Adaptive Low-Pass Velocity Filter
Standard exponential moving averages introduce lag during rapid glissandi or allow jitter when holding a steady pitch. Every 3D hand coordinate and gesture metric is filtered through a **1€ Filter** (*Casiez, Roussel, & Vogel, CHI 2012*):

$$f_c(t) = f_{c,\min} + \beta \cdot \left|\hat{\dot{x}}(t)\right|, \quad \alpha(t) = \frac{1}{1 + \frac{1}{2\pi \Delta t \, f_c(t)}}$$

* **Holding a Note ($\left|\hat{\dot{x}}\right| \to 0$):** Cutoff drops to $f_{c,\min} = 1.35\text{ Hz}$, eliminating sub-pixel webcam noise so notes lock within $\pm 1\text{ cent}$.
* **Rapid Glissando & Vibrato ($\left|\hat{\dot{x}}\right| \gg 0$):** Cutoff scales dynamically with $\beta = 0.085$, providing near-zero phase lag.

### 3. Palm-Scale Invariant Gesture Recognition
Raw 2D landmark distances scale inversely with camera depth ($Z$). To make **Clara Rockmore Aerial Fingering** and **Staccato Fist Mute** invariant to how far the player sits from the camera, all finger apertures are normalized by the anatomical metacarpal palm length:

$$L_{\text{palm}} = \left\|\mathbf{p}_9 - \mathbf{p}_0\right\|_2, \quad \hat{d}_{\text{pinch}} = \frac{\left\|\mathbf{p}_4 - \mathbf{p}_8\right\|_2}{L_{\text{palm}}}$$

### 4. Dual-Oscillator Heterodyne & Formant Voices
Four selectable acoustic profiles shape the dual-oscillator core through a 4x-oversampled **12AX7 triode waveshaper**, dual resonant formant filters, and a procedural **stereo concert hall convolver**:
* **Clara String:** Warm cello-like formant resonance inspired by Clara Rockmore’s 1929 RCA Victor custom tube instrument.
* **Pure Aether:** Classic 1929 heterodyne sine-triangle blend with bell-like upper harmonics.
* **Vocal Choir:** Dual vowel-formant peaks ($F_1 = 650\text{ Hz}$, $F_2 = 1080\text{ Hz}$) with lush hall reverb.
* **Moog Brass:** Rich sawtooth/triangle core with assertive harmonic drive.

---

## 🎮 How to Play

1. Open **[https://roys-theremin.netlify.app](https://roys-theremin.netlify.app)**.
2. Click **Audio** (or directly click **Vision** to activate both audio and camera tracking).
3. **Right Hand — Pitch & Vibrato:**
   * Move your right hand **right** (closer to the vertical pitch rod) to raise pitch ($C_2$ to $C_7$); move **left** to lower pitch.
   * Open or pinch your thumb and index finger to articulate microtonal vibrato ($\pm 42\text{ cents}$).
4. **Left Hand — Volume & Staccato Mute:**
   * Elevate your left hand above the horizontal loop for crescendo; lower toward the loop for silence.
   * Clench your left hand into a fist (or dip rapidly) for an instant, click-free staccato mute.
   * *Single-Hand Assist:* If only your right hand is raised, volume automatically responds to your right hand’s vertical elevation so you can play effortlessly with one hand.
5. **Spatial Calibration:**
   * Hold your hands in your preferred neutral posture and click **Calibrate** to center the sensing field to your seating position.
6. **Desktop Pointer Mode (No Camera Required):**
   * Move mouse horizontally for **Pitch**, vertically for **Volume**, scroll wheel for **Vibrato**, and click or press **Spacebar** for **Staccato Mute**.

---

## 🛠️ Local Development & Build

### Prerequisites
* Node.js 18+
* npm or pnpm

### Quickstart
```bash
# Clone the repository
git clone https://github.com/Royverse/roys-theremin.git
cd roys-theremin

# Install dependencies
npm install

# Run strict TypeScript check
npm run typecheck

# Start local development server
npm run dev

# Build production bundle
npm run build
```

---

## 📜 License
MIT License © 2026 Royverse
