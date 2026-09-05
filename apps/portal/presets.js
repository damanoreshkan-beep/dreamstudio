// The presets — DATA, the whole of what is "ours" over the ready system (pixi-filters@6.1.5, MIT). One entry
// per theme of rt/themes.json, in the strip's order. `chain` = the filters in pass order, each `[Name, dark,
// light?]`: `dark` is the options object, `light` merges over it for the light theme. A filter is built ONCE when
// the preset or the mode changes (never per frame); a filter that carries `time` (Godray, Reflection, CRT) is
// advanced on the ticker by the view. Read at the source (`lib/*/*.d.ts`, 2026-09-05): Outline, Glow and Bevel
// work on ALPHA edges — on an opaque camera sprite they draw nothing, so none is used; Emboss takes `strength`
// and Pixelate `size` as their one positional argument (POSITIONAL below); the rest take an options object.
// The overlay colour is the theme's own mark from rt/themes.json (dark swatch[1] / light swatch[1]).
export const POSITIONAL = { EmbossFilter: "strength", PixelateFilter: "size" };

export const PRESETS = {
  lum: { key: "styleLum", thumb: "lum", chain: [
    ["AdjustmentFilter", { contrast: 1.35, saturation: 0.8, brightness: 0.85 }, { contrast: 1.15, brightness: 0.95 }],
    ["AdvancedBloomFilter", { threshold: 0.62, bloomScale: 1.2, brightness: 0.9, blur: 8, quality: 4 }, { threshold: 0.72, bloomScale: 0.8 }],   // 0.35 flooded a window scene white on the see pod
    ["ColorOverlayFilter", { color: 0xF2B84B, alpha: 0.14 }, { color: 0x6F4800, alpha: 0.08 }],
  ] },
  paper: { key: "stylePaper", thumb: "paper", chain: [
    ["GrayscaleFilter", {}],
    ["EmbossFilter", { strength: 4 }, { strength: 3 }],
    ["AdjustmentFilter", { brightness: 1.35, contrast: 0.9, gamma: 1.1 }, { brightness: 1.45, contrast: 0.85 }],
    ["ColorOverlayFilter", { color: 0xF6F4EE, alpha: 0.35 }, { color: 0xF3EEE4, alpha: 0.5 }],
  ] },
  ink: { key: "styleInk", thumb: "ink", chain: [
    ["GrayscaleFilter", {}],
    ["AdjustmentFilter", { contrast: 2.4, brightness: 1.1, gamma: 0.9 }, { contrast: 2.0, brightness: 1.25 }],
    ["ColorOverlayFilter", { color: 0xFF8A6A, alpha: 0.12 }, { color: 0xA82B14, alpha: 0.10 }],
  ] },
  mercury: { key: "styleMercury", thumb: "chrome", chain: [
    ["ReflectionFilter", { mirror: false, boundary: 0.5, amplitude: [0, 8], waveLength: [30, 110], alpha: [1, 1] }],
    ["AdjustmentFilter", { saturation: 0.15, contrast: 1.5, brightness: 1.05 }, { contrast: 1.3, brightness: 1.1 }],
    ["ColorOverlayFilter", { color: 0xA8B8C8, alpha: 0.12 }, { color: 0x3E5568, alpha: 0.08 }],
  ] },
  smoke: { key: "styleSmoke", thumb: "smoke", chain: [
    ["GrayscaleFilter", {}],
    ["KawaseBlurFilter", { strength: 2, quality: 3 }, { strength: 1.5 }],
    ["SimplexNoiseFilter", { strength: 0.15, noiseScale: 6 }, { strength: 0.1 }],
    ["AdjustmentFilter", { contrast: 1.5, brightness: 1.05 }, { contrast: 1.2, brightness: 1.15, gamma: 1.2 }],
    ["ColorOverlayFilter", { color: 0xE8A66A, alpha: 0.08 }, { color: 0x8A4E14, alpha: 0.06 }],
  ] },
  thread: { key: "styleThread", thumb: "thread", chain: [
    ["CrossHatchFilter", {}],
    ["AdjustmentFilter", { contrast: 1.2, brightness: 0.9 }, { contrast: 1.1, brightness: 1.1 }],
    ["ColorOverlayFilter", { color: 0xE3B963, alpha: 0.25 }, { color: 0x7A5210, alpha: 0.15 }],
  ] },
  circuit: { key: "styleCircuit", thumb: "circuit", chain: [
    ["AdjustmentFilter", { saturation: 0.3, contrast: 1.4, brightness: 0.9 }, { contrast: 1.2, brightness: 1.05 }],
    ["CRTFilter", { curvature: 0, lineWidth: 1.5, lineContrast: 0.35, noise: 0.05, noiseSize: 1, vignetting: 0.35, vignettingAlpha: 0.6 }, { lineContrast: 0.2, vignetting: 0.2 }],
    ["ColorOverlayFilter", { color: 0xE5C15A, alpha: 0.25 }, { color: 0x6E4F00, alpha: 0.12 }],
  ] },
  veil: { key: "styleVeil", thumb: "veil", chain: [
    ["GodrayFilter", { gain: 0.55, lacunarity: 2.4, angle: 30, parallel: true, alpha: 0.85 }, { gain: 0.35, alpha: 0.6 }],
    ["HslAdjustmentFilter", { hue: 140, saturation: 0.45, lightness: 0, colorize: true, alpha: 0.7 }, { saturation: 0.3, alpha: 0.5 }],
    ["KawaseBlurFilter", { strength: 1, quality: 2 }],
  ] },
  ferro: { key: "styleFerro", thumb: "ferro", chain: [
    ["BulgePinchFilter", { radius: 0.6, strength: 0.35 }, { strength: 0.25 }],
    ["AdjustmentFilter", { saturation: 0.2, contrast: 1.8, brightness: 0.85 }, { contrast: 1.4, brightness: 1.0 }],
    ["SimplexNoiseFilter", { strength: 0.2, noiseScale: 8 }, { strength: 0.12 }],
    ["ColorOverlayFilter", { color: 0xB9AFF0, alpha: 0.2 }, { color: 0x5A4BB0, alpha: 0.12 }],
  ] },
  porcelain: { key: "stylePorcelain", thumb: "porcelain", chain: [
    ["EmbossFilter", { strength: 2.5 }, { strength: 2 }],
    ["AdjustmentFilter", { saturation: 0.5, brightness: 1.2, gamma: 1.1, contrast: 0.95 }, { brightness: 1.3 }],
    ["ColorOverlayFilter", { color: 0xE9C489, alpha: 0.22 }, { color: 0x7A5518, alpha: 0.12 }],
  ] },
  sand: { key: "styleSand", thumb: "sand", chain: [
    ["PixelateFilter", { size: 3 }, { size: 2 }],
    ["SimplexNoiseFilter", { strength: 0.25, noiseScale: 10 }, { strength: 0.18 }],
    ["AdjustmentFilter", { saturation: 0.7, contrast: 1.2, brightness: 0.95 }, { brightness: 1.1 }],
    ["ColorOverlayFilter", { color: 0xE9B860, alpha: 0.3 }, { color: 0x7A4D0E, alpha: 0.18 }],
  ] },
  plain: { key: "stylePlain", thumb: null, chain: [
    ["AdjustmentFilter", { contrast: 1.05 }, {}],
  ] },
};
export const IDS = Object.keys(PRESETS);

/**
 * Build the filter instances of one preset for one mode. `F` is the pixi-filters module (loaded lazily by the view).
 * A name the module lacks is skipped with a console warning — a typo in the data can never blank the portal.
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
