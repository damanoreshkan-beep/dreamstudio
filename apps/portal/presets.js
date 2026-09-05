// The presets — DATA, the whole of what is "ours" over the ready system (PixiJS 8 + pixi-filters 6.1.5, MIT).
// One entry per theme of rt/themes.json, in the strip's order. A preset is a GRAPH (graph.js — TD's TOPs on pixi):
//   tex     the material texture (assets/tex-<id>.webp, generated on the pods) — the composite layer AND the field
//           that displaces the camera
//   cam     the camera layer: blend mode + alpha
//   mat     the material layer over it: blend (add | screen | multiply | normal), alpha, tileScale, speed px/s,
//           breathe (amplitude) + rate (rad/s) — a TilingSprite scrolling on its own
//   echo    FEEDBACK: the last frame under the new one — decay (alpha), zoom (per frame), rot (radians)
//   disp    DISPLACE: the camera pushed by the material field — amount (px), speed px/s of the field
//   mirror  the world twinned and flipped ("x") — a kaleidoscope of two
//   chain   the POST filters in pass order, `[Name, dark, light?]` (`light` merges over `dark`), built once per
//           preset + mode, never per frame; `time`-driven filters (Godray, Reflection, CRT) are advanced by the view
//   light   overrides of the graph numbers for the light theme (merged over the preset)
// Read at the source (`lib/*/*.d.ts`, 2026-09-05): Outline, Glow and Bevel work on ALPHA edges — on an opaque
// camera sprite they draw nothing, so none is used; Emboss takes `strength` and Pixelate `size` positionally.
// Overlay colours are the theme's own marks (rt/themes.json swatch[1], dark / light).
export const POSITIONAL = { EmbossFilter: "strength", PixelateFilter: "size" };

export const PRESETS = {
  lum: { key: "styleLum", thumb: "lum", tex: "lum",
    cam: { blend: "normal", alpha: 0.55 },
    mat: { blend: "screen", alpha: 0.5, scale: 0.9, speed: [6, -4], breathe: 0.25, rate: 0.5 },
    echo: { decay: 0.86, zoom: 1.012, rot: 0.004 },
    disp: { amount: 18, speed: [10, 5] },
    chain: [
      ["AdjustmentFilter", { contrast: 1.3, saturation: 0.8, brightness: 0.85 }, { contrast: 1.15, brightness: 0.95 }],
      ["AdvancedBloomFilter", { threshold: 0.7, bloomScale: 0.9, brightness: 0.9, blur: 8, quality: 4 }, { threshold: 0.78, bloomScale: 0.6 }],
      ["ColorOverlayFilter", { color: 0xF2B84B, alpha: 0.12 }, { color: 0x6F4800, alpha: 0.08 }],
    ], light: { mat: { alpha: 0.35 }, echo: { decay: 0.8 } } },
  paper: { key: "stylePaper", thumb: "paper", tex: "paper",
    cam: { blend: "normal", alpha: 1 },
    mat: { blend: "multiply", alpha: 0.85, scale: 1.0, speed: [1, 1] },
    disp: { amount: 8, speed: [2, 1] },
    chain: [
      ["GrayscaleFilter", {}],
      ["EmbossFilter", { strength: 3.5 }, { strength: 3 }],
      ["AdjustmentFilter", { brightness: 1.35, contrast: 0.9, gamma: 1.1 }, { brightness: 1.45, contrast: 0.85 }],
      ["ColorOverlayFilter", { color: 0xF6F4EE, alpha: 0.3 }, { color: 0xF3EEE4, alpha: 0.45 }],
    ], light: { mat: { alpha: 0.7 } } },
  ink: { key: "styleInk", thumb: "ink", tex: "ink",
    cam: { blend: "normal", alpha: 0.65 },
    mat: { blend: "multiply", alpha: 0.6, scale: 1.3, speed: [4, 2] },
    echo: { decay: 0.72, zoom: 1.01, rot: -0.003 },
    disp: { amount: 22, speed: [6, -3] },
    chain: [
      ["GrayscaleFilter", {}],
      ["AdjustmentFilter", { contrast: 2.2, brightness: 1.1, gamma: 0.9 }, { contrast: 1.9, brightness: 1.25 }],
      ["ColorOverlayFilter", { color: 0xFF8A6A, alpha: 0.12 }, { color: 0xA82B14, alpha: 0.1 }],
    ], light: { mat: { alpha: 0.45 } } },
  mercury: { key: "styleMercury", thumb: "chrome", tex: "mercury",
    cam: { blend: "normal", alpha: 0.55 },
    mat: { blend: "screen", alpha: 0.3, scale: 1.2, speed: [-5, 3], breathe: 0.2, rate: 0.35 },
    echo: { decay: 0.6, zoom: 1.0, rot: 0 },
    disp: { amount: 14, speed: [6, 4] },
    mirror: "x",
    chain: [
      ["ReflectionFilter", { mirror: false, boundary: 0.5, amplitude: [0, 8], waveLength: [30, 110], alpha: [1, 1] }],
      ["AdjustmentFilter", { saturation: 0.15, contrast: 1.25, brightness: 0.95 }, { contrast: 1.15, brightness: 1.05 }],
      ["ColorOverlayFilter", { color: 0xA8B8C8, alpha: 0.1 }, { color: 0x3E5568, alpha: 0.08 }],
    ], light: { mat: { alpha: 0.3 } } },
  smoke: { key: "styleSmoke", thumb: "smoke", tex: "smoke",
    cam: { blend: "normal", alpha: 0.45 },
    mat: { blend: "screen", alpha: 0.6, scale: 1.4, speed: [3, -6], breathe: 0.3, rate: 0.4 },
    echo: { decay: 0.92, zoom: 1.02, rot: 0 },
    disp: { amount: 30, speed: [8, -8] },
    chain: [
      ["GrayscaleFilter", {}],
      ["KawaseBlurFilter", { strength: 0.9, quality: 3 }, { strength: 0.7 }],
      ["AdjustmentFilter", { contrast: 1.5, brightness: 1.05 }, { contrast: 1.2, brightness: 1.15, gamma: 1.2 }],
      ["ColorOverlayFilter", { color: 0xE8A66A, alpha: 0.08 }, { color: 0x8A4E14, alpha: 0.06 }],
    ], light: { mat: { alpha: 0.35 }, echo: { decay: 0.88 } } },
  thread: { key: "styleThread", thumb: "thread", tex: "thread",
    cam: { blend: "normal", alpha: 1 },
    mat: { blend: "multiply", alpha: 0.25, scale: 2.4, speed: [0, 0] },
    disp: { amount: 6, speed: [1, 0] },
    chain: [
      ["CrossHatchFilter", {}],
      ["AdjustmentFilter", { contrast: 1.2, brightness: 0.95 }, { contrast: 1.1, brightness: 1.1 }],
      ["ColorOverlayFilter", { color: 0xE3B963, alpha: 0.22 }, { color: 0x7A5210, alpha: 0.14 }],
    ], light: { mat: { alpha: 0.7 } } },
  circuit: { key: "styleCircuit", thumb: "circuit", tex: "circuit",
    cam: { blend: "normal", alpha: 0.6 },
    mat: { blend: "add", alpha: 0.3, scale: 1.1, speed: [10, 0] },
    echo: { decay: 0.7, zoom: 1.0, rot: 0 },
    disp: { amount: 10, speed: [0, 0] },
    mirror: "x",
    chain: [
      ["AdjustmentFilter", { saturation: 0.3, contrast: 1.4, brightness: 0.9 }, { contrast: 1.2, brightness: 1.05 }],
      ["CRTFilter", { curvature: 0, lineWidth: 1.5, lineContrast: 0.3, noise: 0.05, noiseSize: 1, vignetting: 0.35, vignettingAlpha: 0.6 }, { lineContrast: 0.2, vignetting: 0.2 }],
      ["ColorOverlayFilter", { color: 0xE5C15A, alpha: 0.2 }, { color: 0x6E4F00, alpha: 0.12 }],
    ], light: { mat: { alpha: 0.3 } } },
  veil: { key: "styleVeil", thumb: "veil", tex: "veil",
    cam: { blend: "normal", alpha: 0.5 },
    mat: { blend: "screen", alpha: 0.45, scale: 1.5, speed: [-8, 2], breathe: 0.2, rate: 0.3 },
    echo: { decay: 0.9, zoom: 1.015, rot: 0.006 },
    disp: { amount: 26, speed: [4, -6] },
    chain: [
      ["GodrayFilter", { gain: 0.5, lacunarity: 2.4, angle: 30, parallel: true, alpha: 0.8 }, { gain: 0.3, alpha: 0.6 }],
      ["AdjustmentFilter", { saturation: 0.55, contrast: 1.1, brightness: 1.0 }, { brightness: 1.08 }],
      ["ColorOverlayFilter", { color: 0x5FD3C8, alpha: 0.14 }, { color: 0x1E6E66, alpha: 0.1 }],
      ["KawaseBlurFilter", { strength: 1, quality: 2 }],
    ], light: { mat: { alpha: 0.5 }, echo: { decay: 0.85 } } },
  ferro: { key: "styleFerro", thumb: "ferro", tex: "ferro",
    cam: { blend: "normal", alpha: 0.5 },
    mat: { blend: "screen", alpha: 0.5, scale: 1.2, speed: [3, 3], breathe: 0.3, rate: 0.7 },
    echo: { decay: 0.88, zoom: 1.03, rot: 0 },
    disp: { amount: 36, speed: [12, 9] },
    mirror: "x",
    chain: [
      ["AdjustmentFilter", { saturation: 0.2, contrast: 1.3, brightness: 0.9 }, { contrast: 1.2, brightness: 1.0 }],
      ["BulgePinchFilter", { radius: 0.6, strength: 0.3 }, { strength: 0.2 }],
      ["ColorOverlayFilter", { color: 0xB9AFF0, alpha: 0.18 }, { color: 0x5A4BB0, alpha: 0.12 }],
    ], light: { mat: { alpha: 0.35 } } },
  porcelain: { key: "stylePorcelain", thumb: "porcelain", tex: "porcelain",
    cam: { blend: "normal", alpha: 1 },
    mat: { blend: "screen", alpha: 0.22, scale: 1.0, speed: [0, 0], breathe: 0.15, rate: 0.25 },
    disp: { amount: 6, speed: [1, 1] },
    chain: [
      ["AdjustmentFilter", { saturation: 0.35, brightness: 1.05, gamma: 1.05, contrast: 1.1 }, { brightness: 1.1 }],
      ["AdvancedBloomFilter", { threshold: 0.8, bloomScale: 0.45, brightness: 1, blur: 6, quality: 4 }, { threshold: 0.85, bloomScale: 0.35 }],
      ["ColorOverlayFilter", { color: 0xE9C489, alpha: 0.14 }, { color: 0x7A5518, alpha: 0.1 }],
    ], light: { mat: { alpha: 0.4 } } },
  sand: { key: "styleSand", thumb: "sand", tex: "sand",
    cam: { blend: "normal", alpha: 1 },
    mat: { blend: "multiply", alpha: 0.45, scale: 1.3, speed: [2, 0] },
    disp: { amount: 14, speed: [3, 0] },
    chain: [
      ["AdjustmentFilter", { saturation: 0.7, contrast: 1.2, brightness: 0.95 }, { brightness: 1.1 }],
      ["ColorOverlayFilter", { color: 0xE9B860, alpha: 0.28 }, { color: 0x7A4D0E, alpha: 0.16 }],
    ], light: { mat: { alpha: 0.55 } } },
  plain: { key: "stylePlain", thumb: null, tex: null,
    cam: { blend: "normal", alpha: 0.7 },
    echo: { decay: 0.55, zoom: 1.0, rot: 0 },
    chain: [["AdjustmentFilter", { contrast: 1.05 }, {}]] },
};
export const IDS = Object.keys(PRESETS);

/** The preset's graph numbers for one mode: the light theme's overrides merged one level deep over the dark ones. */
export function graphOf(id, light) {
  const p = PRESETS[id] || PRESETS.plain;
  if (!light || !p.light) return p;
  const o = { ...p };
  for (const k of Object.keys(p.light)) o[k] = { ...(p[k] || {}), ...p.light[k] };
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
    const Cls = F[name];
    if (!Cls) { console.warn("portal: no filter", name); continue; }
    const opts = light && lite ? { ...dark, ...lite } : { ...dark };
    const pos = POSITIONAL[name];
    try { out.push(pos ? new Cls(opts[pos]) : new Cls(opts)); } catch (e) { console.warn("portal: filter failed", name, e?.message); }
  }
  return out;
}
