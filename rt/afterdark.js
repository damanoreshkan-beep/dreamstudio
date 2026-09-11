// afterdark.js — the beat signal for the techno-rave stage. Pure, unit-tested. The audio graph (a live
// <audio> → MediaElementSource → AnalyserNode) lives in the app; the part that must be RIGHT — turning a
// frequency frame into a single `pulse` the shader can dance to, and a groove that never freezes when there
// is no audio — lives here. The shader (afterdark.frag) reads `pulse` + an integrated `phase` and does the
// visual dance; this file owns the numbers behind them.

// The kick lives in the lowest bins. With fftSize 1024 @44.1k a bin is ~43 Hz, so bins 1..6 ≈ 40–260 Hz —
// the thump, not the hi-hats. Measured against the rautemusik techno stream: a wider band let the snare in
// and the pulse stopped reading as the kick.
export const KICK_LO = 1;
export const KICK_HI = 6;

// Mean kick-band energy of a frequency frame (Uint8Array 0..255), normalised 0..1.
export function bassEnergy(freq, lo = KICK_LO, hi = KICK_HI) {
  if (!freq || !freq.length) return 0;
  const a = Math.max(0, lo), b = Math.min(freq.length - 1, hi);
  let s = 0;
  for (let i = a; i <= b; i++) s += freq[i];
  return (s / (b - a + 1)) / 255;
}

// One frame of the beat detector: an adaptive baseline (slow rolling average) subtracts the track's steady
// loudness so only ONSETS spike; the pulse rises instantly to a new peak and decays ~0.90/frame, so a kick
// is a sharp attack with a musical tail. State is { pulse, baseline }; pass the previous, get the next.
//   baseline = baseline*0.98 + bass*0.02        (rolling floor)
//   onset    = max(0, bass - baseline*1.25)      (only above the floor)
//   target   = min(1, onset*4.0)                 (scale the onset into 0..1)
//   pulse    = target>pulse ? target : pulse*0.90 (instant rise, slow release)
export function stepPulse(state, bass, { attack = 4.0, decay = 0.9, thresh = 1.25, floor = 0.02 } = {}) {
  const prev = state || { pulse: 0, baseline: 0 };
  const baseline = prev.baseline * (1 - floor) + bass * floor;
  const onset = Math.max(0, bass - baseline * thresh);
  const target = Math.min(1, onset * attack);
  const pulse = target > prev.pulse ? target : prev.pulse * decay;
  return { pulse, baseline };
}

// No audio (idle / pre-tap / the gate) → the dancer must never freeze. A punchy repeating groove at ~126 BPM
// (2.1 Hz): a cubed sine makes it a beat, not a wobble; small so idle reads as swaying-in-place, not raving.
export function idleGroove(t, bpm = 126) {
  const g = bpm / 60;
  const beat = Math.pow(0.5 + 0.5 * Math.sin(t * Math.PI * 2 * g), 3);
  return 0.08 + 0.30 * beat;
}

// Integrate a drift phase from energy rather than time*energy (which jerks the whole scene when energy jumps):
// the scene's laser sweep and haze drift ride this. dt seconds, energy 0..1.
export function integratePhase(phase, dt, energy) {
  return phase + Math.min(0.1, dt) * (0.3 + Math.max(0, Math.min(1, energy)) * 1.2);
}
