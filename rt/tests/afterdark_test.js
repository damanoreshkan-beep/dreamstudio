// afterdark — beat-signal unit tests. Pure logic: no browser, no import map.
//   deno test -A rt/rt_test.js   (the barrel imports this file)

import { assert, assertEquals } from "jsr:@std/assert@1";
import { bassEnergy, stepPulse, idleGroove, integratePhase, KICK_LO, KICK_HI } from "../afterdark.js";

Deno.test("bassEnergy: mean of the kick band, normalised 0..1, empty → 0", () => {
  assertEquals(bassEnergy(null), 0);
  assertEquals(bassEnergy(new Uint8Array(0)), 0);
  const flat = new Uint8Array(512).fill(255);
  assertEquals(bassEnergy(flat), 1, "all-max frame reads full energy");
  const zero = new Uint8Array(512);
  assertEquals(bassEnergy(zero), 0);
  // only the kick bins count: energy outside KICK_LO..KICK_HI is ignored
  const f = new Uint8Array(512);
  for (let i = KICK_LO; i <= KICK_HI; i++) f[i] = 128;
  assert(Math.abs(bassEnergy(f) - 128 / 255) < 1e-9, "kick-band only");
  const g = new Uint8Array(512); g[100] = 255;   // a high bin
  assertEquals(bassEnergy(g), 0, "energy above the kick band does not register");
});

Deno.test("stepPulse: instant rise to a peak, slow decay, adaptive floor", () => {
  let s = { pulse: 0, baseline: 0 };
  // a sustained loud frame first raises the pulse, then the baseline catches up and the onset fades
  s = stepPulse(s, 0.9);
  assert(s.pulse > 0.5, "a kick spikes the pulse instantly");
  const peak = s.pulse;
  // silence: the pulse must decay, never jump
  const q = stepPulse({ pulse: peak, baseline: s.baseline }, 0);
  assert(q.pulse < peak && q.pulse > 0, "pulse decays on silence");
  assert(Math.abs(q.pulse - peak * 0.9) < 1e-9, "decay is ~0.90/frame");
  // a steady tone (no onsets) settles the pulse toward 0 as the baseline absorbs it
  let steady = { pulse: 0, baseline: 0 };
  for (let i = 0; i < 400; i++) steady = stepPulse(steady, 0.5);
  assert(steady.pulse < 0.15, `a steady tone stops pulsing, got ${steady.pulse}`);
});

Deno.test("stepPulse: null state is safe, output stays in 0..1", () => {
  const s = stepPulse(null, 0.7);
  assert(s.pulse >= 0 && s.pulse <= 1);
  assert(s.baseline >= 0 && s.baseline <= 1);
});

Deno.test("idleGroove: bounded, never frozen, actually varies over a bar", () => {
  let lo = 1, hi = 0;
  for (let t = 0; t < 2; t += 0.01) { const v = idleGroove(t); assert(v >= 0 && v <= 1, "in range"); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  assert(hi - lo > 0.15, "the groove moves (not a frozen constant)");
  assert(lo > 0, "never fully still");
});

Deno.test("integratePhase: monotone increasing, dt-clamped, energy speeds it up", () => {
  assert(integratePhase(0, 0.016, 0) > 0, "drifts even with no energy");
  assert(integratePhase(0, 0.016, 1) > integratePhase(0, 0.016, 0), "energy speeds the drift");
  // a huge dt (a backgrounded tab) is clamped so the phase never leaps
  assert(integratePhase(0, 100, 1) <= 0.1 * 1.5 + 1e-9, "dt is clamped");
});
