export const FR = 100;
export const NOV_LEN = 600;
export const BPM_MIN = 118, BPM_MAX = 150;
export const BPM_REF = 128;
export const LAG_MIN = Math.round(60 * FR / BPM_MAX);
export const LAG_MAX = Math.round(60 * FR / BPM_MIN);
const TAU = Math.PI * 2;
const frac = (x) => x - Math.floor(x);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function spectralFlux(mag, prev) {
  if (!mag || !prev || !mag.length || mag.length !== prev.length) return 0;
  const n = mag.length;
  const hiLo = Math.min(6, n - 1), midHi = Math.min(40, n - 1);
  let low = 0, mid = 0, high = 0;
  for (let i = 1; i < n; i++) {
    const d = mag[i] - prev[i];
    if (d <= 0) continue;
    if (i <= hiLo) low += d; else if (i <= midHi) mid += d; else high += d;
  }
  const lo = low / 6, md = mid / 34, hi = high / Math.max(1, n - 41);
  return 0.5 * lo + 0.3 * md + 0.2 * hi;
}

export function createBeatState() {
  return {
    nov: new Float32Array(NOV_LEN), head: -1, count: 0,
    binStart: 0, binPeak: 0, seeded: false,
    baseline: 0,
    bpm: BPM_REF, conf: 0, lastTempoAt: -1,
    phase: 0, beatIndex: 0, prevWrapPhase: 0, lastNow: 0,
  };
}

export function estimateTempo(nov, head, count) {
  const N = Math.min(count, NOV_LEN);
  if (N < LAG_MAX + 20) return null;
  const at = (k) => nov[(head - k + NOV_LEN) % NOV_LEN];
  const ac = new Float64Array(LAG_MAX + 1);
  let acSum = 0;
  for (let lag = LAG_MIN; lag <= LAG_MAX; lag++) {
    let s = 0;
    for (let k = 0; k + lag < N; k++) s += at(k) * at(k + lag);
    const bpm = 60 * FR / lag;
    const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / BPM_REF) / 0.15, 2));
    ac[lag] = s * w;
    acSum += ac[lag];
  }
  let best = LAG_MIN, peak = -1;
  for (let lag = LAG_MIN; lag <= LAG_MAX; lag++) if (ac[lag] > peak) { peak = ac[lag]; best = lag; }
  if (peak <= 0) return null;
  const yl = ac[Math.max(LAG_MIN, best - 1)], yr = ac[Math.min(LAG_MAX, best + 1)], yc = ac[best];
  const denom = (yl - 2 * yc + yr);
  const shift = denom !== 0 ? 0.5 * (yl - yr) / denom : 0;
  const lag = clamp(best + shift, LAG_MIN, LAG_MAX);
  const mean = acSum / (LAG_MAX - LAG_MIN + 1);
  return { bpm: 60 * FR / lag, conf: mean > 0 ? peak / mean : 0 };
}

export function plpPhase(nov, head, count, f, endT, windowSec = 2.5) {
  const W = Math.min(count, Math.round(windowSec * FR));
  if (W < FR) return null;
  let re = 0, im = 0, wsum = 0, vsum = 0;
  for (let k = 0; k < W; k++) {
    const t = endT - k / FR;
    const w = 0.5 - 0.5 * Math.cos(TAU * (W - 1 - k) / (W - 1));
    const v = w * nov[(head - k + NOV_LEN) % NOV_LEN];
    re += v * Math.cos(TAU * f * t);
    im += v * Math.sin(TAU * f * t);
    wsum += w; vsum += v;
  }
  const phi = Math.atan2(im, re);
  const mag = wsum > 0 ? Math.hypot(re, im) / wsum : 0;
  const mean = wsum > 0 ? vsum / wsum : 0;
  return { phi, mag, mean, strength: mean > 1e-6 ? mag / mean : 0 };
}

export function stepBeat(state, flux, nowSec, { attack = 4.0 } = {}) {
  const s = state || createBeatState();
  s.baseline = s.baseline * 0.99 + flux * 0.01;
  const onset = Math.min(1, Math.max(0, flux - s.baseline * 1.1) * attack);

  if (!s.seeded) { s.binStart = nowSec; s.seeded = true; }
  s.binPeak = Math.max(s.binPeak, onset);
  let guard = 0;
  while (nowSec - s.binStart >= 1 / FR && guard++ < NOV_LEN) {
    s.head = (s.head + 1) % NOV_LEN;
    s.nov[s.head] = s.binPeak;
    s.count++;
    s.binStart += 1 / FR;
    s.binPeak = onset;
  }

  let f = s.bpm / 60;
  const plp = plpPhase(s.nov, s.head, s.count, f, s.binStart);
  const pulsing = plp && plp.mean > 1e-5 && plp.strength > 0.12;

  if (s.lastTempoAt < 0 || nowSec - s.lastTempoAt >= 0.15) {
    s.lastTempoAt = nowSec;
    const t = pulsing ? estimateTempo(s.nov, s.head, s.count) : null;
    if (t) { s.bpm = s.bpm * 0.9 + t.bpm * 0.1; s.conf = s.conf * 0.6 + t.conf * 0.4; }
    else s.conf *= 0.9;
    f = s.bpm / 60;
  }

  const dt = s.lastNow ? Math.max(0, Math.min(0.1, nowSec - s.lastNow)) : 0;
  s.lastNow = nowSec;
  const plpStrong = pulsing && s.conf > 1.6;
  if (plpStrong) s.phase = frac(f * nowSec - plp.phi / TAU);
  else s.phase = frac(s.phase + dt * f);
  if (s.phase < s.prevWrapPhase - 0.5) s.beatIndex++;
  s.prevWrapPhase = s.phase;

  const confidence = plpStrong ? clamp((s.conf - 1.2) / 2, 0, 1) * clamp(plp.strength / 0.3, 0, 1) : 0;
  return {
    state: s,
    bpm: s.bpm,
    beatPhase: s.phase,
    nextBeatAt: nowSec + (1 - s.phase) / f,
    barPhase: (((s.beatIndex % 4) + s.phase) / 4),
    beatIndex: s.beatIndex,
    confidence,
    onset,
  };
}
