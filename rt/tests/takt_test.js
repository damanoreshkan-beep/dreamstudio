import { assert, assertEquals } from "jsr:@std/assert@1";
import { FAMILIES, PHRASE, PALETTE_EVERY, FADE_BEATS, r3, nextFamily, look, createScore, stepScore } from "../takt.js";

const FR = 60, BPM = 128;
// Runs the score beat by beat at 60 fps; `energy(beatIndex)` shapes the music.
function run(s, beats, energy = () => 0.3, from = 0) {
  const spb = 60 / BPM, dt = 1 / FR;
  let out = null, t = from * spb;
  const end = (from + beats) * spb;
  while (t < end) {
    const b = t / spb, beatIndex = Math.floor(b);
    out = stepScore(s, { beatIndex, beatPhase: b - beatIndex, bpm: BPM, energy: energy(beatIndex), pulse: 0, dt });
    t += dt;
  }
  return out;
}

Deno.test("r3: every coordinate in [0,1), consecutive points far apart, deterministic", () => {
  let minGap = 1;
  for (let n = 0; n < 500; n++) {
    const p = r3(n, 0.3), q = r3(n + 1, 0.3);
    for (const x of p) assert(x >= 0 && x < 1);
    minGap = Math.min(minGap, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
  }
  assert(minGap > 0.2, `consecutive points too close: ${minGap}`);
  assertEquals(r3(7, 0.5), r3(7, 0.5));
});

Deno.test("nextFamily: never the current one, every family reachable, prefers contrast", () => {
  for (let cur = 0; cur < FAMILIES; cur++) {
    const seen = new Set();
    for (let i = 0; i < 200; i++) { const f = nextFamily(cur, -1, (i + 0.5) / 200); assert(f !== cur); seen.add(f); }
    assertEquals(seen.size, FAMILIES - 1);
  }
  assertEquals(nextFamily(0, -1, 0.0), 1);
});

Deno.test("look: parameters inside the shader's ranges", () => {
  for (let n = 0; n < 100; n++) {
    const l = look(n, 0.42, n % FAMILIES);
    assert(l.scale >= 1 && l.scale <= 4 && l.warp >= 0.3 && l.warp <= 1.5);
    assert(l.sym >= 3 && l.sym <= 8 && l.quant >= 2 && l.quant <= 7);
    assert(l.hue >= 0 && l.hue < 1 && l.sat >= 0.45 && l.contrast >= 0.8);
    assert(l.spin === 1 || l.spin === -1);
  }
});

Deno.test("phrase: a new family starts a crossfade at beat 32 and lands within 4 beats", () => {
  const s = createScore(0.2), fam = s.a.family;
  let out = run(s, PHRASE);
  assertEquals(s.phrases, 0);
  out = run(s, 1, undefined, PHRASE);
  assertEquals(s.phrases, 1);
  assert(s.b && s.b.family !== fam, "no fresh family B");
  assert(out.mix > 0 && out.mix < 1, `mix mid-fade: ${out.mix}`);
  assert(out.ink[0] === fam && out.ink[1] === s.b.family);
  out = run(s, FADE_BEATS, undefined, PHRASE + 1);
  assertEquals(s.b, null);
  assertEquals(out.mix, 0);
  assert(out.ink[0] !== fam, "A did not become the new family");
});

Deno.test("palette: hue jumps every 16 beats, drifts a little every bar, eased in the output", () => {
  const s = createScore(0.9);
  run(s, 4);
  const h0 = s.a.hue;
  run(s, 1, undefined, 4);
  const drift = Math.abs(s.a.hue - h0);
  assert(drift > 0.005 && drift < 0.05, `bar drift ${drift}`);
  run(s, PALETTE_EVERY - 5, undefined, 5);
  const hBefore = s.a.hue;
  run(s, 1, undefined, PALETTE_EVERY);
  const jump = Math.abs(((s.a.hue - hBefore + 1.5) % 1) - 0.5);
  assert(jump > 0.1, `palette jump ${jump}`);
  const out = run(s, 0.05, undefined, PALETTE_EVERY + 1);
  assert(Math.abs(out.points[4] - s.a.hue) > 0.01, "hue is not eased");
});

Deno.test("drop: a loud bar after two quiet bars cuts hard — new family, flash, phrase re-anchored", () => {
  const s = createScore(0.5);
  const energy = (b) => (b < 32 ? 0.4 : b < 44 ? 0.05 : 0.6);
  run(s, 44, energy);
  assert(s.lull >= 2, `lull ${s.lull}`);
  const before = s.a.family;
  const out = run(s, 5, energy, 44);
  assertEquals(s.cuts, 1);
  assert(s.a.family !== before && s.b === null && out.mix === 0);
  assertEquals(s.phraseAt, 48);
  assert(out.ink[3] > 0, "no flash");
  run(s, 4, energy, 49);
  assert(s.flash < 0.01, "flash did not decay");
});

Deno.test("steady music: no cut, zoom advances a quarter per beat, same seed = same score", () => {
  const a = createScore(0.33), b = createScore(0.33);
  const oa = run(a, 40, () => 0.35), ob = run(b, 40, () => 0.35);
  assertEquals(a.cuts, 0);
  assert(Math.abs(a.zoom - 10) < 0.3, `zoom ${a.zoom}`);
  assertEquals(oa.points, ob.points);
  assertEquals(oa.ink, ob.ink);
});
