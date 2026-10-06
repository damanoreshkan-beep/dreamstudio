// takt — the conductor. Decides what the field shows and WHEN, on the beat grid: a quantum of change per
// beat, a mutation per bar, a palette per 4 bars, a new family per 8-bar phrase, a hard cut on a drop.
// Randomness is an R3 quasirandom sequence (Roberts): evenly spread, never clumping, never a repeat run.
export const FAMILIES = 5; // flow, cells, lattice, kaleido, tunnel
export const PHRASE = 16, PALETTE_EVERY = 8, FADE_BEATS = 2;
export const ZOOM_PER_BEAT = 0.3;
// Every beat is a lunge: fast at the kick, settling before the next one — motion that lands ON the grid,
// not a drift that happens to be measured in beats.
export const lunge = (phase) => 1 - Math.pow(1 - Math.max(0, Math.min(1, phase)), 3);
const A3 = [0.8191725134, 0.6710436067, 0.5497004779]; // 1/g, 1/g², 1/g³ for g = 1.22074408460576
const frac = (x) => x - Math.floor(x);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Which family follows which: soft after hard, hard after soft; a self-loop never, the one before rarely.
const NEXT = [
  [0, 3, 3, 1, 3],
  [3, 0, 2, 3, 2],
  [3, 2, 0, 3, 2],
  [2, 3, 3, 0, 2],
  [3, 2, 2, 3, 0],
];

export function r3(n, seed = 0) {
  return A3.map((a, i) => frac(0.5 + seed * (i + 1) * 0.618 + n * a));
}

export function nextFamily(cur, prev, u) {
  const w = NEXT[cur].map((x, i) => (i === prev ? x * 0.5 : x));
  const sum = w.reduce((s, x) => s + x, 0);
  let acc = 0;
  for (let i = 0; i < w.length; i++) { acc += w[i] / sum; if (u < acc) return i; }
  return (cur + 1) % FAMILIES;
}

export function look(n, seed, family) {
  const [a, b, c] = r3(n, seed);
  return {
    family,
    scale: 1 + 3 * a,
    warp: 0.3 + 1.2 * b,
    sym: 3 + Math.floor(c * 6),
    quant: 2 + Math.floor(frac(a + b) * 6),
    hue: frac(seed + a * 0.7 + b * 0.3),
    spread: 0.1 + 0.25 * c,
    sat: 0.7 + 0.3 * b,
    contrast: 0.8 + 0.8 * a,
    spin: c < 0.5 ? -1 : 1,
  };
}

const EASED = ["scale", "warp", "hue", "spread", "sat", "contrast"];
const copy = (l) => ({ ...l });

export function createScore(seed = 0) {
  const a = look(0, seed, Math.floor(frac(seed * 7.31) * FAMILIES));
  return { seed, n: 1, a, cur: copy(a), b: null, fadeAt: -1, mix: 0, prev: -1, phraseAt: 0, beat: -1, bar: -1, flash: 0, fast: 0, slow: 0, lull: 0, zoom: 0, rot: 0, flick: 0, cuts: 0, phrases: 0 };
}

function fresh(s) {
  const [u] = r3(s.n, s.seed + 0.37);
  const fam = nextFamily(s.a.family, s.prev, u);
  return look(s.n++, s.seed, fam);
}

export function stepScore(s, { beatIndex = 0, beatPhase = 0, bpm = 126, energy = 0, pulse = 0, dt = 0 }) {
  const spb = 60 / Math.max(60, bpm);
  const kf = 1 - Math.exp(-dt / (2 * spb)), ks = 1 - Math.exp(-dt / (32 * spb));
  if (!s.primed) { s.fast = s.slow = energy; s.primed = true; }
  s.fast += (energy - s.fast) * kf;
  s.slow += (energy - s.slow) * ks;
  const newBeat = beatIndex !== s.beat, bar = Math.floor(beatIndex / 4), newBar = bar !== s.bar;
  s.beat = beatIndex;
  if (newBeat) s.flick = beatIndex;
  if (newBar) {
    s.bar = bar;
    const quiet = s.fast < 0.7 * s.slow, lull = s.lull;
    s.lull = quiet ? lull + 1 : 0;
    const drop = !quiet && lull >= 2 && s.fast > 1.4 * s.slow && s.fast > 0.12;
    const since = beatIndex - s.phraseAt;
    if (drop) {
      s.prev = s.a.family; s.a = fresh(s); s.cur = copy(s.a); s.b = null; s.mix = 0; s.fadeAt = -1;
      s.flash = 1; s.phraseAt = beatIndex; s.cuts++;
    } else if (since > 0 && since % PHRASE === 0 && !s.b) {
      s.b = fresh(s); s.fadeAt = beatIndex; s.phrases++;
    } else if (since > 0 && since % PALETTE_EVERY === 0) {
      const [, b2, c2] = r3(s.n++, s.seed + 0.11);
      s.a.hue = frac(s.a.hue + 0.18 + 0.5 * b2); s.a.spread = 0.1 + 0.25 * c2; s.a.sat = 0.7 + 0.3 * b2;
    } else {
      const [m] = r3(s.n++, s.seed + 0.71);
      s.a.hue = frac(s.a.hue + 0.02 * s.a.spin); s.a.warp = clamp(s.a.warp + (m - 0.5) * 0.3, 0.3, 1.5);
    }
  }
  if (s.b) {
    const x = clamp((beatIndex + beatPhase - s.fadeAt) / FADE_BEATS, 0, 1);
    s.mix = x * x * (3 - 2 * x);
    if (x >= 1) { s.prev = s.a.family; s.a = s.b; s.cur = copy(s.b); s.b = null; s.mix = 0; s.fadeAt = -1; }
  }
  const k = clamp(dt * 2.5, 0, 1);
  for (const key of EASED) {
    const t = s.a[key], c = s.cur[key];
    s.cur[key] = key === "hue" ? frac(c + (frac(t - c + 0.5) - 0.5) * k) : c + (t - c) * k;
  }
  s.flash *= Math.exp(-dt * 4);
  s.zoom = (beatIndex + lunge(beatPhase)) * ZOOM_PER_BEAT;
  s.rot = (Math.floor(beatIndex / 4) + lunge(frac(beatIndex / 4 + beatPhase / 4))) * 0.12 * s.a.spin;
  const drive = clamp((s.slow - 0.06) / 0.3, 0, 1);
  const since = beatIndex - s.phraseAt;
  const B = s.b || s.a;
  return {
    ink: [s.a.family, B.family, drive, s.flash],
    mix: s.mix,
    points: [
      s.cur.scale, s.cur.warp, s.a.sym, s.a.quant,
      s.cur.hue, s.cur.spread, s.cur.sat, s.cur.contrast,
      B.scale, B.warp, B.sym, B.quant,
      B.hue, B.spread, B.sat, B.contrast,
      s.zoom, s.rot, frac(since / PHRASE), bar % 8,
      s.flick, pulse, lunge(beatPhase), 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ],
  };
}
