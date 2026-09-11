// afterbeat — beat-clock unit tests. Pure logic: no browser, no import map. A synthetic click track (an
// onset impulse every beat at a known tempo) fed through the same 60 Hz frame cadence the app uses must
// lock BPM, phase and the next-beat prediction; a breakdown must HOLD the tempo and free-run the phase.
//   deno test -A rt/rt_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { spectralFlux, createBeatState, stepBeat, estimateTempo, BPM_MIN, BPM_MAX, FR, NOV_LEN } from "../afterbeat.js";

const frac = (x) => x - Math.floor(x);
const circDist = (a, b) => { const d = frac(a - b); return Math.min(d, 1 - d); };   // distance on the unit circle

// Drive the clock with an impulse train at `bpm` for `seconds` at a 60 Hz frame rate (rAF), with a little
// frame jitter like a real browser. Returns the final readout plus the click times so phase can be checked.
function clickTrack({ bpm, seconds, fps = 60, jitter = 0.002, noise = 0, start = 0, state = null, t0 = 0 }) {
  const period = 60 / bpm;
  let s = state, t = t0, out = null, nextClick = start;
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const clicks = [];
  while (t < t0 + seconds) {
    const dt = 1 / fps + (rnd() - 0.5) * 2 * jitter;
    let flux = noise * rnd();
    if (t + dt > nextClick) { flux = 1; clicks.push(nextClick); nextClick += period; }
    t += dt;
    out = stepBeat(s, flux, t);
    s = out.state;
  }
  return { ...out, clicks, t };
}

Deno.test("spectralFlux: only positive bin increases count, empty/mismatched frames read 0", () => {
  assertEquals(spectralFlux(null, null), 0);
  assertEquals(spectralFlux(new Float32Array(8), new Float32Array(4)), 0);
  const prev = new Float32Array(512), mag = new Float32Array(512);
  assertEquals(spectralFlux(mag, prev), 0, "no change → no flux");
  mag[3] = 1;                                                           // one kick bin rises
  const kick = spectralFlux(mag, prev);
  assert(kick > 0, "a rising bin makes flux");
  assertEquals(spectralFlux(prev, mag), 0, "a FALLING bin does not (half-wave rectified)");
  const hi = new Float32Array(512); hi[300] = 1;
  assert(spectralFlux(hi, prev) < kick, "the kick band is weighted above the air band");
});

Deno.test("estimateTempo: needs history, returns null on an empty ring", () => {
  const s = createBeatState();
  assertEquals(estimateTempo(s.nov, s.head, 0), null);
  assertEquals(estimateTempo(s.nov, s.head, NOV_LEN), null, "an all-zero ring has no peak");
});

Deno.test("click track at 130 BPM: locks bpm within ±1, phase ≈ 0 on the click, next beat predicted", () => {
  const r = clickTrack({ bpm: 130, seconds: 14 });
  assert(Math.abs(r.bpm - 130) < 1, `bpm ${r.bpm}`);
  assert(r.confidence > 0.5, `confidence ${r.confidence}`);
  // the phase must read ~0 at the instant of a click: step once more exactly onto the next click
  const period = 60 / 130;
  const next = r.clicks[r.clicks.length - 1] + period;
  const on = stepBeat(r.state, 1, next);
  assert(circDist(on.beatPhase, 0) < 0.08, `beatPhase at the click ${on.beatPhase}`);
  // mid-beat, the predicted next beat is the next click (±40 ms)
  const mid = stepBeat(on.state, 0, next + period / 2);
  assert(Math.abs(mid.nextBeatAt - (next + period)) < 0.04, `nextBeatAt off by ${mid.nextBeatAt - (next + period)}`);
  // beats were counted: ~14 s × 130/60 ≈ 30
  assert(Math.abs(r.beatIndex - 14 * 130 / 60) < 4, `beatIndex ${r.beatIndex}`);
  assert(r.barPhase >= 0 && r.barPhase < 1);
});

Deno.test("click track at 124 BPM with noise: still locks", () => {
  const r = clickTrack({ bpm: 124, seconds: 14, noise: 0.25 });
  assert(Math.abs(r.bpm - 124) < 1.5, `bpm ${r.bpm}`);
  assert(r.confidence > 0.3, `confidence ${r.confidence}`);
});

Deno.test("half-tempo clicks (65 BPM) can never drag the clock out of the techno band", () => {
  // a bare 65 BPM impulse train has NO autocorrelation at the half period, so the band-limited search
  // finds nothing to chase: the tempo stays inside 118–140 whatever the input does
  const r = clickTrack({ bpm: 65, seconds: 14 });
  assert(r.bpm >= BPM_MIN && r.bpm <= BPM_MAX, `bpm ${r.bpm} escaped the band`);
  const fast = clickTrack({ bpm: 170, seconds: 14 });
  assert(fast.bpm >= BPM_MIN && fast.bpm <= BPM_MAX, `bpm ${fast.bpm} escaped the band`);
});

Deno.test("breakdown: silence HOLDS the tempo and free-runs the phase; confidence collapses", () => {
  const locked = clickTrack({ bpm: 128, seconds: 12 });
  const bpm = locked.bpm, beats = locked.beatIndex;
  let s = locked.state, t = locked.t, out = null;
  for (let i = 0; i < 60 * 4; i++) { t += 1 / 60; out = stepBeat(s, 0, t); s = out.state; }
  assert(Math.abs(out.bpm - bpm) < 0.3, `tempo drifted on silence: ${bpm} → ${out.bpm}`);
  assert(out.confidence < 0.05, `confidence should collapse, got ${out.confidence}`);
  assert(out.beatIndex - beats >= 7, `phase must free-run through the breakdown (got ${out.beatIndex - beats} beats in 4 s)`);
});

Deno.test("stepBeat: null state is safe, outputs bounded, a huge dt never leaps the phase", () => {
  const a = stepBeat(null, 0.5, 1);
  assert(a.beatPhase >= 0 && a.beatPhase < 1);
  assert(a.confidence >= 0 && a.confidence <= 1);
  const b = stepBeat(a.state, 0, 100);                                   // a backgrounded tab: 99 s gap
  assert(b.beatIndex - a.beatIndex <= 1, "dt is clamped so a gap adds at most one beat");
  assert(Number.isFinite(b.nextBeatAt) && b.nextBeatAt > 100);
});

Deno.test(`novelty grid runs at ${FR} Hz: 1 s of frames fills ~${FR} samples regardless of fps`, () => {
  let s = null, t = 0, out = null;
  out = stepBeat(s, 0, 0); s = out.state;                                // seed the grid at t=0
  for (let i = 0; i < 30; i++) { t += 1 / 30; out = stepBeat(s, 0, t); s = out.state; }
  assert(Math.abs(s.count - FR) <= 2, `30 fps: ${s.count}`);
  s = null; t = 0; out = stepBeat(s, 0, 0); s = out.state;
  for (let i = 0; i < 120; i++) { t += 1 / 120; out = stepBeat(s, 0, t); s = out.state; }
  assert(Math.abs(s.count - FR) <= 2, `120 fps: ${s.count}`);
});
