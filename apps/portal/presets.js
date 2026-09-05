// The presets — DATA, the whole of what is "ours" over the ready system (PixiJS 8 + pixi-filters 6.1.5, MIT).
// One entry per theme of rt/themes.json, in the strip's order. A preset is a GRAPH (graph.js — TD's TOPs on pixi):
//   tex     the material texture (assets/tex-<id>.webp, generated on the pods) — it DRAWS the contours and it is
//           the field that ripples them
//   edge    the trace: strength (gain on the Sobel gradient), step (sample distance, px), floor (below = nothing)
//   lines   the traced contours: alpha (into the loop), speed px/s of the material through the lines, scale of
//           the material, ripple (px, DisplacementFilter by the material) + fieldSpeed px/s, breathe (amplitude)
//           + rate (rad/s), blend of the loop over the base (add | screen | normal | multiply), tempo (× on both
//           speeds, a knob)
//   detail  the resolution of the lines/loop passes (1 = CSS px, 2 = device px on a DPR-2 phone) — a knob;
//           base.dim (0–1 grey, a knob) replaces base.tint when set
//   echo    FEEDBACK: the last loop frame under the new lines — decay (alpha), zoom (per frame), rot (radians)
//   base    the camera under the lines: tint (dims), sat (ColorMatrix saturate, −1 = drained)
//   mirror  the loop twinned and flipped ("x") — a kaleidoscope of two; NO preset uses it (owner, 2026-09-05:
//           "не дзеркаль бо укачує" — the mirror seam makes the picture sway on a moving phone)
//   chain   the POST filters in pass order, `[Name, dark, light?]` (`light` merges over `dark`; `dark: null` = only
//           on the light theme, `light: null` = only on the dark), built once per preset + mode, never per frame;
//           `time`-driven filters (Godray, Reflection, CRT) are advanced by the view
//   light   overrides of the graph numbers for the light theme (merged one level deep over LIGHT, then the preset)
// Read at the source (`lib/*/*.d.ts`, 2026-09-05): Outline, Glow and Bevel work on ALPHA edges — on an opaque
// camera sprite they draw nothing, so none is used; Emboss takes `strength` and Pixelate `size` positionally.
// Overlay colours are the theme's own marks (rt/themes.json swatch[1], dark / light).
export const POSITIONAL = { EmbossFilter: "strength", PixelateFilter: "size" };

/** The light theme's ground for every preset: the camera pale and drained, the lines over it in `normal`. */
const LIGHT = { base: { tint: 0xd8d8d8, sat: -0.7 }, lines: { blend: "normal" } };

export const PRESETS = {
  lum: { key: "styleLum", thumb: "lum", tex: "lum",
    edge: { strength: 2.2, step: 1, floor: 0.12 },
    lines: { alpha: 0.75, speed: [40, -25], scale: 0.8, ripple: 6, fieldSpeed: [20, 10], breathe: 0.2, rate: 0.9 },
    echo: { decay: 0.9, zoom: 1.012, rot: 0.004 },
    base: { tint: 0x3a3a3a, sat: -0.6 },
    chain: [
      ["AdvancedBloomFilter", { threshold: 0.35, bloomScale: 1.1, brightness: 1, blur: 8, quality: 4 }, { threshold: 0.6, bloomScale: 0.6 }],
      ["ColorOverlayFilter", { color: 0xF2B84B, alpha: 0.08 }, { color: 0x6F4800, alpha: 0.06 }],
    ], light: { lines: { alpha: 0.9 } } },
  paper: { key: "stylePaper", thumb: "paper", tex: "paper", detail: 2,
    edge: { strength: 2.6, step: 1.5, floor: 0.2 },
    lines: { alpha: 0.85, speed: [10, 6], scale: 1 },
    echo: { decay: 0.6, zoom: 1, rot: 0 },
    base: { tint: 0x8a8a8a, sat: -0.85 },
    chain: [
      ["AdjustmentFilter", { brightness: 1.1, contrast: 1.05, gamma: 1.05 }, { brightness: 1.15 }],
      ["ColorOverlayFilter", { color: 0xF6F4EE, alpha: 0.12 }, { color: 0xF3EEE4, alpha: 0.2 }],
    ], light: { base: { tint: 0xe8e8e8 }, lines: { blend: "multiply", alpha: 0.9, invert: 1 } } },
  ink: { key: "styleInk", thumb: "ink", tex: "ink", detail: 2,
    edge: { strength: 2.6, step: 1.2, floor: 0.15 },
    lines: { alpha: 0.9, speed: [15, 10], scale: 1.3, ripple: 10, fieldSpeed: [8, -6] },
    echo: { decay: 0.75, zoom: 1.006, rot: -0.002 },
    base: { tint: 0x707070, sat: -1 },
    chain: [
      ["GrayscaleFilter", null, {}],
      ["AdjustmentFilter", { contrast: 1.25, brightness: 1 }, { contrast: 1.15 }],
    ], light: { base: { tint: 0xeeeeee, sat: -1 }, lines: { blend: "multiply", alpha: 1 } } },
  mercury: { key: "styleMercury", thumb: "chrome", tex: "mercury", detail: 2,
    edge: { strength: 2, step: 1, floor: 0.12 },
    lines: { alpha: 0.8, speed: [50, 30], scale: 1.2, ripple: 14, fieldSpeed: [30, 20] },
    echo: { decay: 0.85, zoom: 1, rot: 0 },
    base: { tint: 0x404040, sat: -0.9 },
    chain: [
      ["ReflectionFilter", { mirror: false, boundary: 0.5, amplitude: [0, 6], waveLength: [30, 110], alpha: [1, 1] }],
      ["AdvancedBloomFilter", { threshold: 0.4, bloomScale: 0.8, brightness: 1, blur: 6, quality: 4 }, { threshold: 0.65, bloomScale: 0.4 }],
      ["ColorOverlayFilter", { color: 0xA8B8C8, alpha: 0.06 }, { color: 0x3E5568, alpha: 0.06 }],
    ], light: {} },
  smoke: { key: "styleSmoke", thumb: "smoke", tex: "smoke",
    edge: { strength: 1.6, step: 2, floor: 0.1 },
    lines: { alpha: 0.6, speed: [15, -40], scale: 1.4, ripple: 16, fieldSpeed: [10, -25], breathe: 0.3, rate: 0.5 },
    echo: { decay: 0.94, zoom: 1.02, rot: 0 },
    base: { tint: 0x303030, sat: -0.7 },
    chain: [
      ["KawaseBlurFilter", { strength: 0.45, quality: 3 }, { strength: 0.35 }],
      ["AdvancedBloomFilter", { threshold: 0.4, bloomScale: 0.8, brightness: 1, blur: 10, quality: 4 }, { threshold: 0.6, bloomScale: 0.5 }],
      ["ColorOverlayFilter", { color: 0xE8A66A, alpha: 0.06 }, { color: 0x8A4E14, alpha: 0.05 }],
    ], light: {} },
  thread: { key: "styleThread", thumb: "thread", tex: "thread", detail: 2,
    edge: { strength: 2.4, step: 1, floor: 0.18 },
    lines: { alpha: 1, speed: [30, 0], scale: 2, ripple: 3, fieldSpeed: [10, 0] },
    echo: { decay: 0.7, zoom: 1, rot: 0 },
    base: { tint: 0x707070, sat: -0.6 },
    chain: [
      ["AdjustmentFilter", { contrast: 1.15, brightness: 1 }, { contrast: 1.1, brightness: 1.05 }],
      ["ColorOverlayFilter", { color: 0xE3B963, alpha: 0.1 }, { color: 0x7A5210, alpha: 0.08 }],
    ], light: { lines: { blend: "multiply", alpha: 0.95, invert: 1 } } },
  circuit: { key: "styleCircuit", thumb: "circuit", tex: "circuit", detail: 2,
    edge: { strength: 2.4, step: 1, floor: 0.15 },
    lines: { alpha: 0.8, speed: [80, 0], scale: 1.1, ripple: 4, fieldSpeed: [40, 0] },
    echo: { decay: 0.8, zoom: 1, rot: 0 },
    base: { tint: 0x2a2a2a, sat: -0.8 },
    chain: [
      ["CRTFilter", { curvature: 0, lineWidth: 1.5, lineContrast: 0.25, noise: 0.04, noiseSize: 1, vignetting: 0.35, vignettingAlpha: 0.6 }, { lineContrast: 0.15, vignetting: 0.2 }],
      ["ColorOverlayFilter", { color: 0xE5C15A, alpha: 0.1 }, { color: 0x6E4F00, alpha: 0.08 }],
    ], light: {} },
  veil: { key: "styleVeil", thumb: "veil", tex: "veil",
    edge: { strength: 1.8, step: 1.5, floor: 0.12 },
    lines: { alpha: 0.65, speed: [-30, 15], scale: 1.5, ripple: 12, fieldSpeed: [-12, 8], breathe: 0.25, rate: 0.4 },
    echo: { decay: 0.92, zoom: 1.015, rot: 0.006 },
    base: { tint: 0x3c3c3c, sat: -0.5 },
    chain: [
      ["GodrayFilter", { gain: 0.45, lacunarity: 2.4, angle: 30, parallel: true, alpha: 0.7 }, { gain: 0.3, alpha: 0.5 }],
      ["KawaseBlurFilter", { strength: 0.6, quality: 2 }],
      ["ColorOverlayFilter", { color: 0x5FD3C8, alpha: 0.08 }, { color: 0x1E6E66, alpha: 0.08 }],
    ], light: {} },
  ferro: { key: "styleFerro", thumb: "ferro", tex: "ferro", detail: 2,
    edge: { strength: 2.2, step: 1, floor: 0.14 },
    lines: { alpha: 0.9, speed: [25, 25], scale: 1.2, ripple: 18, fieldSpeed: [30, 30], breathe: 0.3, rate: 0.8 },
    echo: { decay: 0.9, zoom: 1.03, rot: 0 },
    base: { tint: 0x585858, sat: -0.8 },
    chain: [
      ["AdjustmentFilter", { contrast: 1.2, brightness: 1 }, { contrast: 1.1 }],
      ["BulgePinchFilter", { radius: 0.6, strength: 0.25 }, { strength: 0.15 }],
      ["ColorOverlayFilter", { color: 0xB9AFF0, alpha: 0.08 }, { color: 0x5A4BB0, alpha: 0.08 }],
    ], light: {} },
  porcelain: { key: "stylePorcelain", thumb: "porcelain", tex: "porcelain", detail: 2,
    edge: { strength: 2, step: 1.2, floor: 0.16 },
    lines: { alpha: 0.8, speed: [8, 8], scale: 1 },
    echo: { decay: 0.65, zoom: 1, rot: 0 },
    base: { tint: 0xa0a0a0, sat: -0.7 },
    chain: [
      ["AdjustmentFilter", { brightness: 1.1, gamma: 1.05, contrast: 1.05 }, { brightness: 1.15 }],
      ["AdvancedBloomFilter", { threshold: 0.6, bloomScale: 0.4, brightness: 1, blur: 6, quality: 4 }, { threshold: 0.8, bloomScale: 0.3 }],
      ["ColorOverlayFilter", { color: 0xE9C489, alpha: 0.08 }, { color: 0x7A5518, alpha: 0.06 }],
    ], light: { base: { tint: 0xf0f0f0 }, lines: { blend: "multiply", alpha: 0.9, invert: 1 } } },
  sand: { key: "styleSand", thumb: "sand", tex: "sand", detail: 2,
    edge: { strength: 2.2, step: 1, floor: 0.15 },
    lines: { alpha: 0.85, speed: [35, 0], scale: 1.3, ripple: 8, fieldSpeed: [15, 0] },
    echo: { decay: 0.75, zoom: 1.004, rot: 0 },
    base: { tint: 0x5a5a5a, sat: -0.5 },
    chain: [
      ["AdjustmentFilter", { saturation: 0.8, contrast: 1.15, brightness: 1 }, { brightness: 1.08 }],
      ["ColorOverlayFilter", { color: 0xE9B860, alpha: 0.12 }, { color: 0x7A4D0E, alpha: 0.1 }],
    ], light: { lines: { blend: "multiply", alpha: 0.9 } } },
  plain: { key: "stylePlain", thumb: null, tex: null, detail: 2,
    edge: { strength: 2, step: 1, floor: 0.15 },
    lines: { alpha: 0.7 },
    echo: { decay: 0.85, zoom: 1.01, rot: 0 },
    base: { tint: 0x707070, sat: -0.4 },
    chain: [], light: { lines: { blend: "multiply", alpha: 0.8, invert: 1 } } },
};
export const IDS = Object.keys(PRESETS);

// THE KNOBS — the fine settings behind the sliders icon (owner, 2026-09-05: "не вистачає додаткових налаштувань …
// насиченість, інтенсивність, мила ефекту … кожна тема може мати свій набор тонких налаштувань"). A knob is a
// path into the preset's graph (or `chain.<i>.<prop>` into a post filter's options) with a range; each theme
// names its own set. Values the person moves are stored per preset (view.js) and laid over the mode's numbers.
const K = (id, path, min, max, step = 0.01) => ({ id, path, min, max, step });
const C = {
  intensity: K("kIntensity", "lines.alpha", 0, 1, 0.01),
  sharp: K("kSharp", "edge.strength", 0.5, 6, 0.1),
  floor: K("kFloor", "edge.floor", 0, 0.5, 0.01),
  tempo: K("kTempo", "lines.tempo", 0, 3, 0.05),
  trail: K("kTrail", "echo.decay", 0.3, 0.98, 0.01),
  zoom: K("kZoom", "echo.zoom", 0.98, 1.05, 0.001),
  ripple: K("kRipple", "lines.ripple", 0, 30, 1),
  sat: K("kSat", "base.sat", -1, 0.5, 0.05),
  ground: K("kGround", "base.dim", 0, 1, 0.01),
  detail: K("kDetail", "detail", 1, 2, 0.5),
};
export const KNOBS = {
  lum: [C.intensity, C.sharp, C.tempo, C.trail, C.ripple, K("kGlow", "chain.0.bloomScale", 0, 2, 0.05), C.sat, C.ground, C.detail],
  paper: [C.intensity, C.sharp, C.floor, C.trail, K("kContrast", "chain.0.contrast", 0.5, 2, 0.05), C.ground, C.detail],
  ink: [C.intensity, C.sharp, C.floor, C.ripple, C.trail, K("kContrast", "chain.1.contrast", 0.5, 2, 0.05), C.ground, C.detail],
  mercury: [C.intensity, C.sharp, C.tempo, C.ripple, C.trail, K("kGlow", "chain.1.bloomScale", 0, 2, 0.05), C.ground, C.detail],
  smoke: [C.intensity, C.sharp, C.tempo, C.ripple, C.trail, C.zoom, K("kSoft", "chain.0.strength", 0, 2, 0.05), K("kGlow", "chain.1.bloomScale", 0, 2, 0.05), C.ground, C.detail],
  thread: [C.intensity, C.sharp, C.floor, C.tempo, K("kContrast", "chain.0.contrast", 0.5, 2, 0.05), C.ground, C.detail],
  circuit: [C.intensity, C.sharp, C.tempo, C.trail, K("kNoise", "chain.0.noise", 0, 0.3, 0.01), K("kVignette", "chain.0.vignetting", 0, 1, 0.05), C.ground, C.detail],
  veil: [C.intensity, C.sharp, C.tempo, C.ripple, C.trail, C.zoom, K("kRays", "chain.0.gain", 0, 1, 0.05), K("kSoft", "chain.1.strength", 0, 2, 0.05), C.sat, C.ground, C.detail],
  ferro: [C.intensity, C.sharp, C.tempo, C.ripple, C.trail, C.zoom, K("kContrast", "chain.0.contrast", 0.5, 2, 0.05), K("kBulge", "chain.1.strength", -0.5, 0.5, 0.05), C.ground, C.detail],
  porcelain: [C.intensity, C.sharp, C.floor, C.trail, K("kBright", "chain.0.brightness", 0.5, 1.6, 0.05), K("kGlow", "chain.1.bloomScale", 0, 2, 0.05), C.ground, C.detail],
  sand: [C.intensity, C.sharp, C.tempo, C.ripple, C.trail, K("kSat", "chain.0.saturation", 0, 2, 0.05), C.ground, C.detail],
  plain: [C.intensity, C.sharp, C.floor, C.trail, C.zoom, C.sat, C.ground, C.detail],
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
  if (knob.path === "lines.tempo") return g.lines?.tempo ?? 1;
  if (knob.path === "detail") return g.detail ?? 1;
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
