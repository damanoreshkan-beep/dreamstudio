// The presets — DATA, the whole of what is "ours" over the ready system (PixiJS 8 + pixi-filters 6.1.5, MIT).
// One entry per theme of rt/themes.json, in the strip's order. A preset is a GRAPH (graph.js — TD's TOPs on pixi):
//   tex     the material texture (assets/tex-<id>.webp, 1024², generated on the pods) — it DRAWS the contours and
//           fills the tones, at an ATOMIC tile, its phase nailed to the scene by the optical flow
//   detail  the resolution of the passes (1 = CSS px, 2 = device px on a DPR-2 phone) — a knob
//   edge    the trace: strength (gain on the Sobel gradient), step (sample distance, px), floor (below = nothing)
//   lines   alpha (into the loop), scale (the tile = scale × the texture's 1024 px: 0.25 = 256 px, 0.12 = 123 px —
//           "дрібні текстурочки атомні"), speed px/s of the phase drift (a shimmer, not a film — the flow moves the
//           rest), tempo (× on it, a knob), blend of the loop over the base (add | screen | normal | multiply),
//           invert (a pale material draws dark), breathe (amplitude) + rate (rad/s)
//   shade   the tone hatching: amount (0–1), on ("dark" = the shadows take the material, "light" = the lights),
//           band [from, to] of the tone where it fades in
//   echo    FEEDBACK: the last loop frame, advected by the flow, under the new trace — decay, zoom (per frame), rot
//   base    the camera under it all — AS IS by default (owner: "якість камери не порти"); dim (0–1 grey) and sat
//           (ColorMatrix saturate) exist only as knobs
//   chain   the POST filters in pass order, `[Name, dark, light?]` (`light` merges over `dark`; `dark: null` = only
//           on the light theme, `light: null` = only on the dark), built once per preset + mode, never per frame;
//           `time`-driven filters (Godray, Reflection, CRT) are advanced by the view
//   light   overrides of the graph numbers for the light theme (merged one level deep over LIGHT, then the preset)
// Read at the source (`lib/*/*.d.ts`, 2026-09-05): Outline, Glow and Bevel work on ALPHA edges — on an opaque
// camera sprite they draw nothing, so none is used; Emboss takes `strength` and Pixelate `size` positionally.
// Overlay colours are the theme's own marks (rt/themes.json swatch[1], dark / light). No preset mirrors (owner:
// "не дзеркаль бо укачує").
export const POSITIONAL = { EmbossFilter: "strength", PixelateFilter: "size" };

/** The light theme's ground for every preset: the camera still as it is, the lines over it in `normal`. */
const LIGHT = { lines: { blend: "normal" } };

export const PRESETS = {
  lum: { key: "styleLum", thumb: "lum", tex: "lum", detail: 2,
    edge: { strength: 2.2, step: 1, floor: 0.12 },
    lines: { alpha: 0.6, scale: 0.18, speed: [6, -4], breathe: 0.15, rate: 0.9 },
    shade: { amount: 0.35, on: "light", band: [0.72, 1] },
    echo: { decay: 0.86, zoom: 1.006, rot: 0.002 },
    chain: [
      ["AdvancedBloomFilter", { threshold: 0.8, bloomScale: 0.5, brightness: 1, blur: 8, quality: 4 }, { threshold: 0.88, bloomScale: 0.3 }],
    ], light: { lines: { alpha: 0.7 } } },
  paper: { key: "stylePaper", thumb: "paper", tex: "paper", detail: 2,
    edge: { strength: 2.6, step: 1.5, floor: 0.2 },
    lines: { alpha: 0.9, scale: 0.16, speed: [0, 0], blend: "multiply", invert: 1 },
    shade: { amount: 0.7, on: "dark", band: [0.3, 0.8] },
    echo: { decay: 0.5, zoom: 1, rot: 0 },
    chain: [], light: { lines: { blend: "multiply", alpha: 0.95, invert: 1 } } },
  ink: { key: "styleInk", thumb: "ink", tex: "ink", detail: 2,
    edge: { strength: 2.6, step: 1.2, floor: 0.15 },
    lines: { alpha: 0.95, scale: 0.12, speed: [2, 1], blend: "multiply" },
    shade: { amount: 0.75, on: "dark", band: [0.25, 0.7] },
    echo: { decay: 0.7, zoom: 1.004, rot: -0.001 },
    chain: [
      ["GrayscaleFilter", null, {}],
    ], light: { lines: { blend: "multiply", alpha: 1 } } },
  mercury: { key: "styleMercury", thumb: "chrome", tex: "mercury", detail: 2,
    edge: { strength: 2, step: 1, floor: 0.12 },
    lines: { alpha: 0.55, scale: 0.16, speed: [8, 5], blend: "screen" },
    shade: { amount: 0.45, on: "light", band: [0.7, 1] },
    echo: { decay: 0.8, zoom: 1, rot: 0 },
    chain: [
      ["AdvancedBloomFilter", { threshold: 0.85, bloomScale: 0.4, brightness: 1, blur: 6, quality: 4 }, { threshold: 0.9, bloomScale: 0.3 }],
    ], light: { lines: { blend: "screen" } } },
  smoke: { key: "styleSmoke", thumb: "smoke", tex: "smoke", detail: 1,
    edge: { strength: 1.6, step: 2, floor: 0.1 },
    lines: { alpha: 0.7, scale: 0.3, speed: [3, -8], breathe: 0.25, rate: 0.5 },
    shade: { amount: 0.5, on: "dark", band: [0.2, 0.7] },
    echo: { decay: 0.93, zoom: 1.012, rot: 0 },
    chain: [
      ["KawaseBlurFilter", { strength: 0.4, quality: 3 }, { strength: 0.3 }],
      ["AdvancedBloomFilter", { threshold: 0.5, bloomScale: 0.6, brightness: 1, blur: 10, quality: 4 }, { threshold: 0.7, bloomScale: 0.4 }],
    ], light: {} },
  thread: { key: "styleThread", thumb: "thread", tex: "thread", detail: 2,
    edge: { strength: 2.4, step: 1, floor: 0.18 },
    lines: { alpha: 1, scale: 0.1, speed: [4, 0], blend: "multiply", invert: 1 },
    shade: { amount: 0.9, on: "dark", band: [0.15, 0.85] },
    echo: { decay: 0.6, zoom: 1, rot: 0 },
    chain: [], light: { lines: { blend: "multiply", alpha: 0.95, invert: 1 } } },
  circuit: { key: "styleCircuit", thumb: "circuit", tex: "circuit", detail: 2,
    edge: { strength: 2.4, step: 1, floor: 0.15 },
    lines: { alpha: 0.85, scale: 0.2, speed: [12, 0] },
    shade: { amount: 0.5, on: "dark", band: [0.2, 0.6] },
    echo: { decay: 0.75, zoom: 1, rot: 0 },
    chain: [
      ["CRTFilter", { curvature: 0, lineWidth: 1.5, lineContrast: 0.18, noise: 0.03, noiseSize: 1, vignetting: 0.3, vignettingAlpha: 0.5 }, { lineContrast: 0.1, vignetting: 0.15 }],
    ], light: {} },
  veil: { key: "styleVeil", thumb: "veil", tex: "veil", detail: 1,
    edge: { strength: 1.8, step: 1.5, floor: 0.12 },
    lines: { alpha: 0.7, scale: 0.3, speed: [-6, 3], breathe: 0.2, rate: 0.4 },
    shade: { amount: 0.5, on: "light", band: [0.4, 0.9] },
    echo: { decay: 0.9, zoom: 1.008, rot: 0.003 },
    chain: [
      ["GodrayFilter", { gain: 0.35, lacunarity: 2.4, angle: 30, parallel: true, alpha: 0.55 }, { gain: 0.25, alpha: 0.4 }],
      ["ColorOverlayFilter", { color: 0x5FD3C8, alpha: 0.06 }, { color: 0x1E6E66, alpha: 0.06 }],
    ], light: {} },
  ferro: { key: "styleFerro", thumb: "ferro", tex: "ferro", detail: 2,
    edge: { strength: 2.2, step: 1, floor: 0.14 },
    lines: { alpha: 0.9, scale: 0.2, speed: [5, 5], breathe: 0.25, rate: 0.8 },
    shade: { amount: 0.7, on: "dark", band: [0.15, 0.6] },
    echo: { decay: 0.85, zoom: 1.015, rot: 0 },
    chain: [
      ["BulgePinchFilter", { radius: 0.6, strength: 0.15 }, { strength: 0.1 }],
    ], light: {} },
  porcelain: { key: "stylePorcelain", thumb: "porcelain", tex: "porcelain", detail: 2,
    edge: { strength: 2, step: 1.2, floor: 0.16 },
    lines: { alpha: 0.85, scale: 0.16, speed: [0, 0] },
    shade: { amount: 0.5, on: "light", band: [0.55, 0.95] },
    echo: { decay: 0.55, zoom: 1, rot: 0 },
    chain: [
      ["AdvancedBloomFilter", { threshold: 0.75, bloomScale: 0.35, brightness: 1, blur: 6, quality: 4 }, { threshold: 0.85, bloomScale: 0.25 }],
    ], light: { lines: { blend: "multiply", alpha: 0.9, invert: 1 } } },
  sand: { key: "styleSand", thumb: "sand", tex: "sand", detail: 2,
    edge: { strength: 2.2, step: 1, floor: 0.15 },
    lines: { alpha: 0.9, scale: 0.12, speed: [6, 0], blend: "multiply" },
    shade: { amount: 0.7, on: "dark", band: [0.2, 0.75] },
    echo: { decay: 0.7, zoom: 1.002, rot: 0 },
    chain: [], light: { lines: { blend: "multiply", alpha: 0.9 } } },
  plain: { key: "stylePlain", thumb: null, tex: null, detail: 2,
    edge: { strength: 2, step: 1, floor: 0.15 },
    lines: { alpha: 0.75, scale: 0.25 },
    shade: { amount: 0, on: "dark", band: [0.3, 0.8] },
    echo: { decay: 0.8, zoom: 1.006, rot: 0 },
    chain: [], light: { lines: { blend: "multiply", alpha: 0.8, invert: 1 } } },
};
export const IDS = Object.keys(PRESETS);

// THE KNOBS — the fine settings behind the sliders icon (owner, 2026-09-05: "кожна тема може мати свій набор
// тонких налаштувань"). A knob is a path into the preset's graph (or `chain.<i>.<prop>` into a post filter's
// options) with a range; each theme names its own set. Values the person moves are stored per preset (view.js)
// and laid over the mode's numbers.
const K = (id, path, min, max, step = 0.01, def) => ({ id, path, min, max, step, def });
const C = {
  intensity: K("kIntensity", "lines.alpha", 0, 1, 0.01),
  sharp: K("kSharp", "edge.strength", 0.5, 6, 0.1),
  floor: K("kFloor", "edge.floor", 0, 0.5, 0.01),
  grain: K("kGrain", "lines.scale", 0.04, 0.6, 0.01),
  hatch: K("kHatch", "shade.amount", 0, 1, 0.01),
  tempo: K("kTempo", "lines.tempo", 0, 3, 0.05),
  trail: K("kTrail", "echo.decay", 0.3, 0.98, 0.01),
  zoom: K("kZoom", "echo.zoom", 0.98, 1.05, 0.001),
  sat: K("kSat", "base.sat", -1, 0.5, 0.05),
  ground: K("kGround", "base.dim", 0, 1, 0.01),
  detail: K("kDetail", "detail", 1, 2, 0.5),
};
const GLOW = (i) => K("kGlow", `chain.${i}.bloomScale`, 0, 2, 0.05);
// THE ENGINE'S KNOBS — paths only the Godot stage reads (godot/portal/presets.gd carries the mode's numbers; the
// page shows these in the APK only). look.amount = the material's eye over the plain camera; motion.lift = how
// much the line lives on what moves; echo.warp = the wind bending the trails; lines.shimmer = the tile breathing.
export const ENGINE_KNOBS = [
  K("kLook", "look.amount", 0, 1, 0.05, 1),
  K("kLife", "motion.lift", 0, 6, 0.1, 2.5),
  K("kWind", "echo.warp", 0, 20, 0.5, 4),
  K("kShimmer", "lines.shimmer", 0, 1, 0.05, 0.15),
];
export const KNOBS = {
  lum: [C.intensity, C.hatch, C.grain, C.sharp, C.tempo, C.trail, GLOW(0), C.sat, C.ground, C.detail],
  paper: [C.intensity, C.hatch, C.grain, C.sharp, C.floor, C.trail, C.ground, C.detail],
  ink: [C.intensity, C.hatch, C.grain, C.sharp, C.floor, C.trail, C.ground, C.detail],
  mercury: [C.intensity, C.hatch, C.grain, C.sharp, C.tempo, C.trail, GLOW(0), C.sat, C.ground, C.detail],
  smoke: [C.intensity, C.hatch, C.grain, C.sharp, C.tempo, C.trail, C.zoom, K("kSoft", "chain.0.strength", 0, 2, 0.05), GLOW(1), C.ground, C.detail],
  thread: [C.intensity, C.hatch, C.grain, C.sharp, C.floor, C.tempo, C.ground, C.detail],
  circuit: [C.intensity, C.hatch, C.grain, C.sharp, C.tempo, C.trail, K("kNoise", "chain.0.noise", 0, 0.3, 0.01), K("kVignette", "chain.0.vignetting", 0, 1, 0.05), C.ground, C.detail],
  veil: [C.intensity, C.hatch, C.grain, C.sharp, C.tempo, C.trail, C.zoom, K("kRays", "chain.0.gain", 0, 1, 0.05), C.sat, C.ground, C.detail],
  ferro: [C.intensity, C.hatch, C.grain, C.sharp, C.tempo, C.trail, C.zoom, K("kBulge", "chain.0.strength", -0.5, 0.5, 0.05), C.ground, C.detail],
  porcelain: [C.intensity, C.hatch, C.grain, C.sharp, C.floor, C.trail, GLOW(0), C.ground, C.detail],
  sand: [C.intensity, C.hatch, C.grain, C.sharp, C.tempo, C.trail, C.sat, C.ground, C.detail],
  plain: [C.intensity, C.hatch, C.grain, C.sharp, C.floor, C.trail, C.zoom, C.sat, C.ground, C.detail],
};

const getPath = (o, path) => path.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
const setPath = (o, path, v) => {
  const ks = path.split("."); let a = o;
  for (const k of ks.slice(0, -1)) { a[k] = Array.isArray(a[k]) ? [...a[k]] : { ...(a[k] || {}) }; a = a[k]; }
  a[ks[ks.length - 1]] = v;
};

/** The preset's graph numbers for one mode: LIGHT, then the preset's light overrides, merged one level deep. */
export function graphOf(id, light) {
  const p = PRESETS[id] || PRESETS.plain;
  if (!light) return p;
  const o = { ...p };
  for (const layer of [LIGHT, p.light || {}]) for (const k of Object.keys(layer)) o[k] = { ...(o[k] || {}), ...layer[k] };
  return o;
}

/** The mode's graph with the person's knob values (`{path: value}`) laid over — chain paths are the caller's. */
export function tuned(id, light, over) {
  const g = { ...graphOf(id, light) };
  for (const [path, v] of Object.entries(over || {})) if (!path.startsWith("chain.")) setPath(g, path, v);
  return g;
}

/** What a knob shows: the person's value, else the mode's number (`base.dim` is read off the tint's grey). */
export function knobValue(id, light, over, knob) {
  if (over && knob.path in over) return over[knob.path];
  if (knob.path.startsWith("chain.")) {
    const [, i, prop] = knob.path.split("."); const [, dark, lite] = (PRESETS[id] || PRESETS.plain).chain[+i] || [];
    return (light && lite && prop in lite ? lite : dark || {})[prop] ?? knob.min;
  }
  const g = graphOf(id, light);
  if (knob.path === "base.dim") return ((g.base?.tint ?? 0xffffff) & 0xff) / 255;
  if (knob.path === "base.sat") return g.base?.sat ?? 0;
  if (knob.path === "lines.tempo") return g.lines?.tempo ?? 1;
  if (knob.path === "detail") return g.detail ?? 1;
  if (knob.def !== undefined) return getPath(g, knob.path) ?? knob.def;
  return getPath(g, knob.path) ?? knob.min;
}

/**
 * Build the post-chain filter instances of one preset for one mode. `F` is the pixi-filters module (loaded lazily
 * by the view). A name the module lacks is skipped with a console warning — a typo in the data never blanks the portal.
 */
export function buildChain(F, id, light, over) {
  const p = PRESETS[id] || PRESETS.plain;
  const out = [];
  p.chain.forEach(([name, dark, lite], i) => {
    if (light ? lite === null : dark === null) return;   // a filter of the other theme
    const Cls = F[name];
    if (!Cls) { console.warn("portal: no filter", name); return; }
    const opts = light && lite ? { ...(dark || {}), ...lite } : { ...dark };
    for (const [path, v] of Object.entries(over || {})) { const m = path.match(/^chain\.(\d+)\.(\w+)$/); if (m && +m[1] === i) opts[m[2]] = v; }
    const pos = POSITIONAL[name];
    try { out.push(pos ? new Cls(opts[pos]) : new Cls(opts)); } catch (e) { console.warn("portal: filter failed", name, e?.message); }
  });
  return out;
}
