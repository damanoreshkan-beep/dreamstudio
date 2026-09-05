# Портал — the camera as art at 60 fps on a READY system (build notes, 2026-09-05)

The research that chose the engine: `docs/research/portal.md` (PixiJS 8 + pixi-filters, MIT; three + postprocessing
the fallback; hydra AGPL and lygia non-commercial out; MediaPipe as a later mask). Owner: "давай pixi, на наступній
фазі нагенеруємо текстур". The brief, verbatim: ready presets per theme × light/dark, the camera in a canvas at
60 fps, a Save button — nothing else; a whole ready system behind it that we only modify.

## The system, and what is ours

- **Runtime**: `pixi.js@8.20.1` + `pixi-filters@6.1.5` from the page import map (core 1.2.37 —
  `packages/gen/scaffold.mjs`; the jsDelivr ESM builds, and the filters import `pixi.js` BARE, so the map gives
  one pixi instance; esm.sh would have bundled a second). The deploy bundles both into `app.js` (~1 MB) and the
  service worker precaches it — the portal works offline.
- **The picture**: `Texture.from(video)` (VideoSource, `updateFPS: 0` = every frame) on a `Sprite` sized to
  COVER the screen; `Application.init({ resizeTo: window, resolution: min(2, dpr), autoDensity, preference:
  "webgl", antialias: false })`.
- **A preset is DATA** (`presets.js`): `{ chain: [[FilterName, options]…], light: { …overrides } }` — filters
  are built ONCE when the preset or the mode changes, never per frame; filters that carry `time` (Godray,
  Reflection, CRT) are advanced on the ticker. Nothing hand-written in GLSL.
- **Read at the source before writing a preset** (`pixi-filters@6.1.5/lib/*/…d.ts`): Outline, Glow and Bevel
  work on ALPHA edges — on an opaque camera sprite they draw nothing, so no preset uses them; Emboss takes
  `strength` as its one argument; CrossHatch and Grayscale take none; Pixelate takes `size`; RGBSplit offsets
  are `[x, y]`; ColorGradient accepts a `css` string; Godray needs `parallel`/`angle`, Reflection `mirror`
  (false = ripple the whole frame).
- **Themes**: the 12 ids of `rt/themes.json` (lum paper ink mercury smoke thread circuit veil ferro porcelain sand
  plain). The active material (`html[data-material]`) is the DEFAULT preset; the strip switches. Light/dark
  follows `data-theme` — the same preset, a second params object. Thumbnails: the 11 material cards
  (`assets/style-<id>.webp`, mercury shows the chrome card), plain = the theme's own swatch.
- **Save**: `app.renderer.extract.canvas(app.stage)` → `toBlob("image/png")` → the kit's `downloadUrl`/
  `shareFile` (`/_rt/apk.js`). No upload, no wait.
- **Camera**: the kit's lifecycle (`camera.start` with the 1.2.32 retry, `CameraPrime` never cold, flip waits
  for `playing`); `needs: ["camera", "wakeLock"]`.
- **The gate**: no camera → the sprite is `assets/mock.webp` (the farm's own portrait), marked `data-live`; the
  e2e drives the strip, the flip, the save button and the preset attribute.

## The state map (rules/design.md)

| state | canvas | island (left · CENTRE · right) | demotes at 412×430 / 360×340 |
|---|---|---|---|
| prime | black, `CameraPrime` over it | strip · Save disabled · flip disabled | prime overlay by its own rules |
| live | the camera through the preset, `data-preset`, `data-mode` | strip (12, active ringed) · **ЗБЕРЕГТИ** · [flip] | tiles 44 px |
| saving (one frame) | unchanged | Save busy for the blob's lifetime | — |
| denied / unavailable | the prime overlay's states | strip · Save disabled | — |

No other state exists. A preset tap re-builds the filter chain (one frame); a theme toggle re-builds with the
other params object. Nothing is uploaded, nothing waits.

## The icon (rules/art.md) — three rounds, a floor accepted

Twelve takes (`portal_a…l`, Z-Image on the pods): "portal", "gateway", "doorway", "ring" — every phrasing grew
a reflective ground under the object (floor 128–224 px), including "floating in the void, nothing below it";
only two of twelve were off-centre or not-black otherwise. Chosen `portal_j` (a woven ring of light with cyan
on the outer nodes: core 68 %, centre +4/−6 px, corners black, floor 174 px) — the last-resort case the rule
names, taken after the rounds the rule allows, because a ring of light IS the portal and the floor reads as a
faint reflection at 512 px. Not a candidate for a fourth round.

## Two traps met on the see pod

- `sprite.filterArea = Rectangle(0, 0, W, H)` in CSS px at `resolution: 2` displaced the filtered output by a
  quadrant — dropped; the sprite is only a few percent larger than the screen.
- The see pod's Chromium had a stored material, which exposed a KIT bug: `material.js` matched daisyui's
  `themes.css` (linked first) with `theme[\w-]*\.css` and rewrote the wrong link — fixed in core 1.2.38
  (`theme(-\w+)?\.css`, with a test).

## Measured before the list is fixed (the phone)

fps p50/p95 per preset × mode on the S25 Ultra at DPR 2; the camera constraint (720p30 / 1080p30); the save
blob's size; which presets fall under 60 (cut, not tuned forever). Phase 2 (owner): generated material
TEXTURES per theme as sprites/displacement maps over the feed; phase 3: the MediaPipe person/world mask.

## Phase 2 — the graph (2026-09-05, product ff0bc32)

`graph.js`: TD's TOPs from pixi's own machinery, from the preset's data — feedback (RenderTexture ping-pong),
displacement by the material's generated texture (`assets/tex-<id>.webp`, a scrolling TilingSprite as the map),
the same texture composited over the loop, mirror (right half as the source), LFOs per second; the phase-1 chain
on top. Full table + the two structural rules (no screen/add inside a feedback loop; a mask Graphics not
consumed draws white) in `docs/research/portal.md` §7. Twelve see-pod sheets judged before the push.
