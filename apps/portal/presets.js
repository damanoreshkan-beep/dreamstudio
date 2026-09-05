// The presets — DATA, the whole of what is "ours" over the ready system (PixiJS 8 + pixi-filters 6.1.5, MIT).
// One entry per theme of rt/themes.json, in the strip's order. A preset is a GRAPH (graph.js — TD's TOPs on pixi):
//   tex     the material texture (assets/tex-<id>.webp, generated on the pods) — it DRAWS the contours and it is
//           the field that ripples them
//   edge    the trace: strength (gain on the Sobel gradient), step (sample distance, px), floor (below = nothing)
//   lines   the traced contours: alpha (into the loop), speed px/s of the material through the lines, scale of
//           the material, ripple (px, DisplacementFilter by the material) + fieldSpeed px/s, breathe (amplitude)
//           + rate (rad/s), blend of the loop over the base (add | screen | normal | multiply)
//   echo    FEEDBACK: the last loop frame under the new lines — decay (alpha), zoom (per frame), rot (radians)
//   base    the camera under the lines: tint (dims), sat (ColorMatrix saturate, −1 = drained)
//   mirror  the loop twinned and flipped ("x") — a kaleidoscope of two
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
  paper: { key: "stylePaper", thumb: "paper", tex: "paper",
    edge: { strength: 2.6, step: 1.5, floor: 0.2 },
    lines: { alpha: 0.85, speed: [10, 6], scale: 1 },
    echo: { decay: 0.6, zoom: 1, rot: 0 },
    base: { tint: 0x8a8a8a, sat: -0.85 },
    chain: [
      ["AdjustmentFilter", { brightness: 1.1, contrast: 1.05, gamma: 1.05 }, { brightness: 1.15 }],
      ["ColorOverlayFilter", { color: 0xF6F4EE, alpha: 0.12 }, { color: 0xF3EEE4, alpha: 0.2 }],
    ], light: { base: { tint: 0xe8e8e8 }, lines: { blend: "multiply", alpha: 0.9, invert: 1 } } },
  ink: { key: "styleInk", thumb: "ink", tex: "ink",
    edge: { strength: 2.6, step: 1.2, floor: 0.15 },
    lines: { alpha: 0.9, speed: [15, 10], scale: 1.3, ripple: 10, fieldSpeed: [8, -6] },
    echo: { decay: 0.75, zoom: 1.006, rot: -0.002 },
    base: { tint: 0x707070, sat: -1 },
    chain: [
      ["GrayscaleFilter", null, {}],
      ["AdjustmentFilter", { contrast: 1.25, brightness: 1 }, { contrast: 1.15 }],
    ], light: { base: { tint: 0xeeeeee, sat: -1 }, lines: { blend: "multiply", alpha: 1 } } },
  mercury: { key: "styleMercury", thumb: "chrome", tex: "mercury",
    edge: { strength: 2, step: 1, floor: 0.12 },
    lines: { alpha: 0.8, speed: [50, 30], scale: 1.2, ripple: 14, fieldSpeed: [30, 20] },
    echo: { decay: 0.85, zoom: 1, rot: 0 },
    base: { tint: 0x404040, sat: -0.9 },
    mirror: "x",
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
  thread: { key: "styleThread", thumb: "thread", tex: "thread",
    edge: { strength: 2.4, step: 1, floor: 0.18 },
    lines: { alpha: 1, speed: [30, 0], scale: 2, ripple: 3, fieldSpeed: [10, 0] },
    echo: { decay: 0.7, zoom: 1, rot: 0 },
    base: { tint: 0x707070, sat: -0.6 },
    chain: [
      ["AdjustmentFilter", { contrast: 1.15, brightness: 1 }, { contrast: 1.1, brightness: 1.05 }],
      ["ColorOverlayFilter", { color: 0xE3B963, alpha: 0.1 }, { color: 0x7A5210, alpha: 0.08 }],
    ], light: { lines: { blend: "multiply", alpha: 0.95, invert: 1 } } },
  circuit: { key: "styleCircuit", thumb: "circuit", tex: "circuit",
    edge: { strength: 2.4, step: 1, floor: 0.15 },
    lines: { alpha: 0.8, speed: [80, 0], scale: 1.1, ripple: 4, fieldSpeed: [40, 0] },
    echo: { decay: 0.8, zoom: 1, rot: 0 },
    base: { tint: 0x2a2a2a, sat: -0.8 },
    mirror: "x",
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
  ferro: { key: "styleFerro", thumb: "ferro", tex: "ferro",
    edge: { strength: 2.2, step: 1, floor: 0.14 },
    lines: { alpha: 0.9, speed: [25, 25], scale: 1.2, ripple: 18, fieldSpeed: [30, 30], breathe: 0.3, rate: 0.8 },
    echo: { decay: 0.9, zoom: 1.03, rot: 0 },
    base: { tint: 0x585858, sat: -0.8 },
    mirror: "x",
    chain: [
      ["AdjustmentFilter", { contrast: 1.2, brightness: 1 }, { contrast: 1.1 }],
      ["BulgePinchFilter", { radius: 0.6, strength: 0.25 }, { strength: 0.15 }],
      ["ColorOverlayFilter", { color: 0xB9AFF0, alpha: 0.08 }, { color: 0x5A4BB0, alpha: 0.08 }],
    ], light: {} },
  porcelain: { key: "stylePorcelain", thumb: "porcelain", tex: "porcelain",
    edge: { strength: 2, step: 1.2, floor: 0.16 },
    lines: { alpha: 0.8, speed: [8, 8], scale: 1 },
    echo: { decay: 0.65, zoom: 1, rot: 0 },
    base: { tint: 0xa0a0a0, sat: -0.7 },
    chain: [
      ["AdjustmentFilter", { brightness: 1.1, gamma: 1.05, contrast: 1.05 }, { brightness: 1.15 }],
      ["AdvancedBloomFilter", { threshold: 0.6, bloomScale: 0.4, brightness: 1, blur: 6, quality: 4 }, { threshold: 0.8, bloomScale: 0.3 }],
      ["ColorOverlayFilter", { color: 0xE9C489, alpha: 0.08 }, { color: 0x7A5518, alpha: 0.06 }],
    ], light: { base: { tint: 0xf0f0f0 }, lines: { blend: "multiply", alpha: 0.9, invert: 1 } } },
  sand: { key: "styleSand", thumb: "sand", tex: "sand",
    edge: { strength: 2.2, step: 1, floor: 0.15 },
    lines: { alpha: 0.85, speed: [35, 0], scale: 1.3, ripple: 8, fieldSpeed: [15, 0] },
    echo: { decay: 0.75, zoom: 1.004, rot: 0 },
    base: { tint: 0x5a5a5a, sat: -0.5 },
    chain: [
      ["AdjustmentFilter", { saturation: 0.8, contrast: 1.15, brightness: 1 }, { brightness: 1.08 }],
      ["ColorOverlayFilter", { color: 0xE9B860, alpha: 0.12 }, { color: 0x7A4D0E, alpha: 0.1 }],
    ], light: { lines: { blend: "multiply", alpha: 0.9 } } },
  plain: { key: "stylePlain", thumb: null, tex: null,
    edge: { strength: 2, step: 1, floor: 0.15 },
    lines: { alpha: 0.7 },
    echo: { decay: 0.85, zoom: 1.01, rot: 0 },
    base: { tint: 0x707070, sat: -0.4 },
    chain: [], light: { lines: { blend: "multiply", alpha: 0.8, invert: 1 } } },
};
export const IDS = Object.keys(PRESETS);

/** The preset's graph numbers for one mode: LIGHT, then the preset's light overrides, merged one level deep. */
export function graphOf(id, light) {
  const p = PRESETS[id] || PRESETS.plain;
  if (!light) return p;
  const o = { ...p };
  for (const layer of [LIGHT, p.light || {}]) for (const k of Object.keys(layer)) o[k] = { ...(o[k] || {}), ...layer[k] };
  return o;
}

/**
 * Build the post-chain filter instances of one preset for one mode. `F` is the pixi-filters module (loaded lazily
 * by the view). A name the module lacks is skipped with a console warning — a typo in the data never blanks the portal.
 */
export function buildChain(F, id, light) {
  const p = PRESETS[id] || PRESETS.plain;
  const out = [];
  for (const [name, dark, lite] of p.chain) {
    if (light ? lite === null : dark === null) continue;   // a filter of the other theme
    const Cls = F[name];
    if (!Cls) { console.warn("portal: no filter", name); continue; }
    const opts = light && lite ? { ...(dark || {}), ...lite } : { ...dark };
    const pos = POSITIONAL[name];
    try { out.push(pos ? new Cls(opts[pos]) : new Cls(opts)); } catch (e) { console.warn("portal: filter failed", name, e?.message); }
  }
  return out;
}
