export const KICK_LO = 1;
export const KICK_HI = 6;

export function bassEnergy(freq, lo = KICK_LO, hi = KICK_HI) {
  if (!freq || !freq.length) return 0;
  const a = Math.max(0, lo), b = Math.min(freq.length - 1, hi);
  let s = 0;
  for (let i = a; i <= b; i++) s += freq[i];
  return (s / (b - a + 1)) / 255;
}

export function stepPulse(state, bass, { attack = 4.0, decay = 0.9, thresh = 1.25, floor = 0.02 } = {}) {
  const prev = state || { pulse: 0, baseline: 0 };
  const baseline = prev.baseline * (1 - floor) + bass * floor;
  const onset = Math.max(0, bass - baseline * thresh);
  const target = Math.min(1, onset * attack);
  const pulse = target > prev.pulse ? target : prev.pulse * decay;
  return { pulse, baseline };
}

export function idleGroove(t, bpm = 126) {
  const g = bpm / 60;
  const beat = Math.pow(0.5 + 0.5 * Math.sin(t * Math.PI * 2 * g), 3);
  return 0.08 + 0.30 * beat;
}

export function integratePhase(phase, dt, energy) {
  return phase + Math.min(0.1, dt) * (0.3 + Math.max(0, Math.min(1, energy)) * 1.2);
}
