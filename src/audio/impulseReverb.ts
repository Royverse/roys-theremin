// ============================================================================
// PROCEDURAL CONCERT HALL CONVOLUTION REVERB
// Synthesizes a stereo acoustic impulse response in memory with early
// reflections and high-frequency air absorption (zero external assets required)
// ============================================================================

export function createConcertHallImpulse(
  ctx: AudioContext,
  durationSeconds = 1.9,
  decayRate = 2.8
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * durationSeconds);
  const impulse = ctx.createBuffer(2, length, sampleRate);

  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  // Early reflection tap times (in seconds) and gains
  const earlyTaps = [
    { time: 0.014, gainL: 0.35, gainR: 0.22 },
    { time: 0.023, gainL: 0.20, gainR: 0.34 },
    { time: 0.037, gainL: 0.25, gainR: 0.18 },
    { time: 0.052, gainL: 0.14, gainR: 0.26 },
  ];

  for (const tap of earlyTaps) {
    const idx = Math.floor(tap.time * sampleRate);
    if (idx < length) {
      left[idx] += tap.gainL;
      right[idx] += tap.gainR;
    }
  }

  // Diffuse tail with exponential decay and warm low-pass air absorption
  let lpL = 0;
  let lpR = 0;

  for (let i = 0; i < length; i++) {
    const t = i / length;
    // Smooth 10ms pre-delay envelope
    const attackEnv = Math.min(1.0, i / (sampleRate * 0.01));
    const decayEnv = Math.exp(-t * decayRate) * (1.0 - t * 0.35);
    const env = attackEnv * decayEnv;

    const whiteL = (Math.random() * 2 - 1) * env * 0.22;
    const whiteR = (Math.random() * 2 - 1) * env * 0.22;

    // One-pole lowpass filter simulating acoustic room damping
    const damping = 0.28 + t * 0.45;
    lpL = lpL * damping + whiteL * (1.0 - damping);
    lpR = lpR * damping + whiteR * (1.0 - damping);

    left[i] += lpL;
    right[i] += lpR;
  }

  return impulse;
}
