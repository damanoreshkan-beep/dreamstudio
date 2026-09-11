// afterbeat.js — a pure, realtime BEAT CLOCK for the techno-rave stage. The old afterdark.js turns a frame
// into ONE kick `pulse`; this file turns a STREAM of frames into the thing a dancer needs to move to the
// SONG and not just the bass: a tempo (BPM), a phase-locked beat (beatPhase 0..1, 0 = on the beat), the
// predicted time of the next beat, a bar phase, and a confidence. No browser, no import map — unit-tested.
//
// The app owns the audio graph (a dedicated AnalyserNode, smoothing 0, getFloatFrequencyData → dB → a 0..1
// magnitude frame). This file owns the numbers, the standard causal beat-tracking pipeline:
//   multi-band spectral flux  →  adaptive-whitened onset  →  a fixed 100 Hz novelty grid  →
//   autocorrelation tempo with a techno prior (118–140 BPM, no half/double)  →  PLP phase (a one-frequency
//   DFT of the novelty) → beatPhase + nextBeat. On a breakdown the tempo is HELD and the phase free-runs, so
//   the floor stays in time through the drop; the caller falls back to idleGroove only on true silence.

export const FR = 100;                        // novelty feature rate (Hz): a fixed grid, immune to rAF jitter
export const NOV_LEN = 600;                   // 6 s ring of novelty samples
export const BPM_MIN = 118, BPM_MAX = 150;    // techno four-on-the-floor band — the strongest half/double guard
export const BPM_REF = 128;                   // prior centre
export const LAG_MIN = Math.round(60 * FR / BPM_MAX);   // 40
export const LAG_MAX = Math.round(60 * FR / BPM_MIN);   // 51
const TAU = Math.PI * 2;
const frac = (x) => x - Math.floor(x);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Multi-band half-wave-rectified spectral flux between two 0..1 magnitude frames. With fftSize 1024 @44.1k a
// bin is ~43 Hz: bins 1..6 = kick (≈40–260 Hz), 7..40 = body/snare (≈0.3–1.7 kHz), 41.. = hats/air. Every
// band contributes (that is the whole point — not bass-only), the kick weighted highest because it is techno.
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
    nov: new Float32Array(NOV_LEN), head: -1, count: 0,   // ring of onsets; head = index of newest sample
    binStart: 0, binPeak: 0, seeded: false,               // 10 ms accumulator, keyed by wall clock
    baseline: 0,                                           // rolling flux floor (adaptive whitening)
    bpm: BPM_REF, conf: 0, lastTempoAt: -1,
    phase: 0, beatIndex: 0, prevWrapPhase: 0, lastNow: 0,
  };
}

// Autocorrelate the novelty ring over the techno lag band, weight by a log-Gaussian prior at 128 BPM, and
// return the interpolated tempo + a peak-to-mean confidence. Cheap: ~9 lags × 600 taps, called ~7 Hz.
export function estimateTempo(nov, head, count) {
  const N = Math.min(count, NOV_LEN);
  if (N < LAG_MAX + 20) return null;                       // not enough history yet
  const at = (k) => nov[(head - k + NOV_LEN) % NOV_LEN];   // k samples ago (0 = newest)
  const ac = new Float64Array(LAG_MAX + 1);
  let acSum = 0;
  for (let lag = LAG_MIN; lag <= LAG_MAX; lag++) {
    let s = 0;
    for (let k = 0; k + lag < N; k++) s += at(k) * at(k + lag);
    const bpm = 60 * FR / lag;
    const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / BPM_REF) / 0.15, 2));   // symmetric in octaves
    ac[lag] = s * w;
    acSum += ac[lag];
  }
  let best = LAG_MIN, peak = -1;
  for (let lag = LAG_MIN; lag <= LAG_MAX; lag++) if (ac[lag] > peak) { peak = ac[lag]; best = lag; }
  if (peak <= 0) return null;
  // parabolic interpolation around the peak for sub-lag tempo
  const yl = ac[Math.max(LAG_MIN, best - 1)], yr = ac[Math.min(LAG_MAX, best + 1)], yc = ac[best];
  const denom = (yl - 2 * yc + yr);
  const shift = denom !== 0 ? 0.5 * (yl - yr) / denom : 0;
  const lag = clamp(best + shift, LAG_MIN, LAG_MAX);
  const mean = acSum / (LAG_MAX - LAG_MIN + 1);
  return { bpm: 60 * FR / lag, conf: mean > 0 ? peak / mean : 0 };
}

// PLP phase: correlate the recent novelty with a Hann-windowed complex sinusoid at the tempo frequency f
// (Müller's predominant-local-pulse kernel). Returns the phase φ, the correlation magnitude and the window's
// mean novelty; `strength` = mag/mean is SCALE-FREE (1 = a perfect pulse train, ~0 = noise) — real audio
// onsets are tens of times weaker than a synthetic click, so no absolute threshold can gate them. windowSec ≈ 2.5 s.
export function plpPhase(nov, head, count, f, endT, windowSec = 2.5) {
  const W = Math.min(count, Math.round(windowSec * FR));
  if (W < FR) return null;
  let re = 0, im = 0, wsum = 0, vsum = 0;
  for (let k = 0; k < W; k++) {
    const t = endT - k / FR;
    const w = 0.5 - 0.5 * Math.cos(TAU * (W - 1 - k) / (W - 1));   // Hann, heaviest at the newest sample
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

// One step of the clock. `flux` from spectralFlux(), `nowSec` a monotonic clock in seconds. Returns the live
// readout; mutates and returns `state`. `confidence` gates the caller: high → drive the dance from the clock;
// low → the caller holds/free-runs (done here) and, on true silence, drops to idleGroove.
export function stepBeat(state, flux, nowSec, { attack = 4.0 } = {}) {
  const s = state || createBeatState();
  // adaptive whitening — only ONSETS above the rolling floor survive (same idea as afterdark.js stepPulse)
  s.baseline = s.baseline * 0.99 + flux * 0.01;
  const onset = Math.min(1, Math.max(0, flux - s.baseline * 1.1) * attack);

  // accumulate onsets into a fixed 100 Hz grid keyed by the wall clock (rAF runs ~60 Hz and drifts)
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

  // the pulse of the last ~2.5 s at the held tempo (PLP). Measured BEFORE the tempo update so a breakdown
  // (pulse gone from the window) freezes the tempo instead of letting the emptying ring bend it — the clock
  // then dead-reckons at the held bpm. endT is the END of the newest committed bin, not "now" (≤10 ms lag).
  let f = s.bpm / 60;
  const plp = plpPhase(s.nov, s.head, s.count, f, s.binStart);
  // calibrated on the live stream (2026-09-11): steady techno reads strength 0.2–0.45, a breakdown 0.02–0.15
  const pulsing = plp && plp.mean > 1e-5 && plp.strength > 0.12;

  // re-estimate tempo ~7 Hz (the only O(lags·N) cost), EMA-smooth, keep the old bpm when unsure
  if (s.lastTempoAt < 0 || nowSec - s.lastTempoAt >= 0.15) {
    s.lastTempoAt = nowSec;
    const t = pulsing ? estimateTempo(s.nov, s.head, s.count) : null;
    if (t) { s.bpm = s.bpm * 0.9 + t.bpm * 0.1; s.conf = s.conf * 0.6 + t.conf * 0.4; }
    else s.conf *= 0.9;
    f = s.bpm / 60;
  }

  const dt = s.lastNow ? Math.max(0, Math.min(0.1, nowSec - s.lastNow)) : 0;
  s.lastNow = nowSec;
  // phase from PLP when the pulse is strong; otherwise dead-reckon at the held tempo (rides a breakdown)
  const plpStrong = pulsing && s.conf > 1.6;
  if (plpStrong) s.phase = frac(f * nowSec - plp.phi / TAU);
  else s.phase = frac(s.phase + dt * f);
  // a beat is a wrap of the phase
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
