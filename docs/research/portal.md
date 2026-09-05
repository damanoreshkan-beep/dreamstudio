# Портал — the camera as real-time art at 60 fps: which READY system, and how it is only modified (2026-09-05)

The brief (owner, verbatim): «це мають бути просто готові пресети під наші теми і їх 2 режими світлий темний і
канвас з камерою в 60фпс і все. і кнопка зберегти. всьо. ніякого більше функціоналу. але за цим має бути сховано
ціла система. але щоб ми її не самі наговнокодили а взяли готове тільки модифікували.» And: «це не камера, це
портал» · «наша задача буде зробити порісерчіти готові пресети і модифікувати їх». No node editor in the browser.

Method: a Codex research thread (read-only, every claim cited and labelled) over 12 candidates, then every
load-bearing fact below re-read by me at the primary source (the LICENSE files, the READMEs, the docs pages).
Labels: **V** = I opened the source · **I** = inferred · **U** = unknown until measured.

## 1. TouchDesigner cannot be the engine (V)

`derivative.ca/UserGuide/System_Requirements`: "Microsoft Windows 10 / Windows 11", "Apple macOS 13 (Ventura)
and up", "TouchDesigner requires a GPU and drivers that support Vulkan 1.1", "A minimum of 4GB GPU memory". No
Linux build, no headless mode. Our VPS is Linux without a GPU; and even a GPU box would only send the phone a
VIDEO STREAM (latency, bandwidth, never 60 fps of the phone's own frames). The 60 fps the brief asks for live on
the phone's GPU, in the browser — which is what the farm's `GlStage` already does. TD stays a reference for the
IDEA (a graph of TOPs: source → noise → feedback → displace → palette), not for the runtime.

## 2. The candidates, measured

| System | Licence (V) | Ready effects (V) | Camera in | Size / import | 60 fps on a phone | Verdict |
|---|---|---|---|---|---|---|
| **PixiJS 8 + pixi-filters 6** | MIT + MIT (`github.com/pixijs/filters/blob/main/LICENSE`) | **37 package filters + 13 core**: Adjustment, AdvancedBloom, Ascii, Bevel, Bloom, BulgePinch, ColorGradient, ColorMap, ColorOverlay, ColorReplace, Convolution, CrossHatch, CRT, Dot, DropShadow, Emboss, Glitch, Glow, Godray, Grayscale, HslAdjustment, KawaseBlur, MotionBlur, MultiColorReplace, OldFilm, Outline, Pixelate, RadialBlur, Reflection, RGBSplit, Shockwave, SimpleLightmap, SimplexNoise, TiltShift, Twist, ZoomBlur; core Alpha, Blur, ColorMatrix, Displacement, Noise | `Texture.from(video)` (the sprite is the feed) | `pixi.min.mjs` 820 KB; filters as ESM per filter from a CDN; WebGL2 (+WebGPU in v8) | U on the S25 (no vendor benchmark); each filter = a pass, so 2–4 per preset | **the largest permissive READY-EFFECT library**; materials become stylisations (CrossHatch+Emboss = embroidery, Reflection+Adjustment = chrome, Godray+ColorGradient = aurora…) |
| **three.js + pmndrs/postprocessing** | MIT + Zlib (`github.com/pmndrs/postprocessing/blob/main/LICENSE.md`) | postprocessing: Bloom, Blur, ColorDepth, ColorGrading (LUT, Sepia, HueSat, Brightness/Contrast), DoF, Glitch, ChromaticAberration, GodRays, Pattern (Dot/Grid/Scanline), Pixelation, Outline, Shockwave, SSAO, Texture, ToneMapping; three's own examples/jsm: 27 passes (Afterimage = feedback, Halftone, Film, RenderPixelated, UnrealBloom, LUT…) | `THREE.VideoTexture(video)` (threejs.org/docs/pages/VideoTexture.html) | three.module.min.js 366 KB (three is ALREADY in the farm's import-map union) + postprocessing 633 KB | postprocessing MERGES compatible effects into one fullscreen pass ("without the performance penalties of traditional pass chaining") | strong №2: fewer artistic looks than pixi-filters, better pass merging, a 3D scene possible later; a second abstraction over one full-screen quad |
| hydra-synth | **AGPL-3.0** | `osc noise voronoi shape gradient src` + `color contrast posterize pixelate kaleid repeat scroll rotate modulate blend diff layer mask` — the closest thing to TD's TOP graph as one-liners; `s0.init({src: video})` | yes | script/ESM via unpkg | U; README: "experimental", an iOS autoplay caveat | **out**: the farm is MIT — an AGPL runtime would relicense the app; a source of IDEAS for the preset language only |
| MediaPipe Image Segmenter (`@mediapipe/tasks-vision`) | Apache-2.0 | not effects — a person/world MASK (`segmentForVideo` → category/confidence masks) | yes | `vision_bundle.mjs` from jsDelivr + wasm + model | the docs say `segmentForVideo()` is SYNCHRONOUS and blocks the main thread — run it in a Worker, not in the render loop | the "portal" mask (the person kept real, the world turned to material) — an optional second phase, never in the base 60 fps path |
| regl + webgl-noise | MIT + MIT-like | no effect library (a functional WebGL API) | yes | 87 KB | U | a base only — we already have `GlStage`; **lygia.xyz is NOT permissive** (Prosperity Public License 3.0.0: "try this software for commercial purposes for thirty days") — never vendor it |
| OGL | Unlicense | none ready | yes | 29 KB gz | U | a lighter GlStage — nothing gained |
| glfx.js | MIT | ~20 photo effects (ink, edge work, hexagonal pixelate, swirl, bulge, tilt-shift…) | images (same-origin) | old, WebGL1-era, last push 2023-10 | U | out: unmaintained |
| p5.js | LGPL-2.1 | 8 basic filters | yes | 990 KB | U | out: 1 MB for eight simple filters |
| Shader Park | MIT | a procedural 2D/3D DSL, hundreds of community examples | no verified video-texture API | — | U | out for a live camera |
| TF.js body-segmentation | Apache-2.0 | a mask (BodyPix 24 parts / MediaPipe selfie) | yes | 1.4 MB + tfjs 147 MB unpacked | U | worse than MediaPipe directly |
| OpenCV.js | Apache-2.0 | CV primitives, no art | `cv.VideoCapture` | heavy | U | out |
| cables.gl standalone export | MIT (package.json) | a node editor's export | yes | U | U | out by the brief (a node tool) — an offline authoring idea at most |
| **GlStage + our own shaders** (podoba's 11 today) | ours | 11 hand-written materials | `cam` at full res, `tex2`, `preserve` | 0 KB | measured: ~26 samples/px | the base every candidate renders INTO or beside; NOT what the owner asked for as the system ("не самі наговнокодили") |

Sizes are CDN files / npm unpacked, not gzip. Activity dates: pixi pushed 2026-09-04, filters 2026-02-13, three
2026-09-05, postprocessing 2026-09-04 (GitHub API, read by the thread).

## 3. Recommendation

**PixiJS 8 + pixi-filters — the ready system; we write presets, not effects.** Why this over three.js:
- 50 permissive, maintained, parametrised effects is the largest READY library; the brief is "take the ready
  thing, modify only" and a preset here is a JSON of filter names + params (nothing hand-rolled).
- The camera is a `Sprite(Texture.from(video))` at cover size; a preset is `sprite.filters = [...]`; light/dark
  is a second params object per preset (ColorGradient/ColorMap/Adjustment values), never a second shader.
- Save = `renderer.extract` / `canvas.toBlob` (Pixi's own `extract` API); a clip = `canvas.captureStream(30)` +
  `MediaRecorder` (WebM on Android; MP4 is not promised).
- The cost is the bundle (~0.8 MB + filters) and passes per preset (2–4) — the fps budget is measured on the
  S25 Ultra before the preset list is fixed; a preset that drops below 60 is cut, not tuned forever.

**three.js + postprocessing is the fallback** if pixi's chains cannot hold 60 fps at DPR 2 on the S25: its
merged EffectPass renders many effects in one pass, and three is already in the farm's import map.

**Not the base:** hydra (AGPL), lygia (non-commercial), glfx (dead), p5 (weight). **Phase 2, optional:**
MediaPipe in a Worker as the portal mask (person real, world in material) — the one thing that makes it "не
камера, а портал"; measured separately (model download, warm-up, mask fps, main-thread cost).

## 4. The preset system (12 themes × 2 modes, declarative)

```js
// presets.js — DATA. A preset names ready filters and their params; `dark`/`light` override params only.
export const PRESETS = {
  lum:       { chain: ["Adjustment", "AdvancedBloom", "RGBSplit"], dark: { threshold: 0.45, bloomScale: 1.6, brightness: 1.05 }, light: { threshold: 0.6, bloomScale: 0.9, brightness: 1.0 } },
  smoke:     { chain: ["Grayscale", "KawaseBlur", "SimplexNoise", "Adjustment"], dark: { blur: 3, contrast: 1.35 }, light: { blur: 2, contrast: 1.1, gamma: 1.2 } },
  chrome:    { chain: ["Reflection", "Adjustment", "HslAdjustment"], dark: { contrast: 1.4, saturation: 0.2 }, light: { contrast: 1.15, saturation: 0.25 } },
  paper:     { chain: ["Emboss", "ColorMap", "Outline"], dark: { strength: 5 }, light: { strength: 3 } },
  thread:    { chain: ["CrossHatch", "Emboss", "ColorOverlay"], dark: { alpha: 0.35 }, light: { alpha: 0.2 } },
  ink:       { chain: ["Grayscale", "Adjustment", "ColorReplace"], dark: { contrast: 2.2 }, light: { contrast: 1.8 } },
  circuit:   { chain: ["Outline", "CRT", "Glow"], dark: { lineWidth: 1, curvature: 1 }, light: { lineWidth: 1, curvature: 0.5 } },
  veil:      { chain: ["Godray", "ColorGradient", "KawaseBlur"], dark: { gain: 0.5, lacunarity: 2.5 }, light: { gain: 0.3, lacunarity: 2 } },
  ferro:     { chain: ["BulgePinch", "SimplexNoise", "Adjustment"], dark: { strength: 0.6, contrast: 1.5 }, light: { strength: 0.4, contrast: 1.2 } },
  porcelain: { chain: ["Bevel", "Adjustment", "Glow"], dark: { thickness: 2, saturation: 0.5 }, light: { thickness: 1, saturation: 0.6 } },
  sand:      { chain: ["Pixelate", "SimplexNoise", "ColorMap"], dark: { size: 3 }, light: { size: 2 } },
  plain:     { chain: ["Adjustment"], dark: { contrast: 1.05 }, light: {} },
};
```
Filters are constructed ONCE per preset+mode change (never per frame); the 11 material cards already in the
farm are the strip's thumbnails; the theme's own accent (`--app-accent` / `--color-accent`) feeds
ColorOverlay/ColorGradient so a preset follows the material theme without a second list.

## 5. What is measured before the preset list is fixed (U)

1. fps p50/p95 per preset × mode on the S25 Ultra (Chrome + the WebView), at DPR 2 and DPR 1.5.
2. The camera constraint that stays smooth: 720p30, 1080p30, 1080p60.
3. `preserveDrawingBuffer` cost — or a capture canvas created only on Save.
4. WebM recording on the S25 (codec, share sheet).
5. (phase 2) MediaPipe: model bytes, warm-up, mask fps in a Worker, main-thread stall.

## 6. Plan by phases

- **Ф0** — this document; the owner's choice of the engine (pixi recommended / three fallback).
- **Ф1** — the app «Портал»: one fit tab, the camera sprite at cover, the strip of 11 material cards (the same
  thumbnails), light/dark by the document theme, Save (frame) — NOTHING else; presets as data; gate = a still.
- **Ф2** — the fps sheet on the phone (the 24 states), the cut list; the icon on the pods; store captures.
- **Ф3** — the portal mask (MediaPipe in a Worker) as a measured experiment, shipped only if the base holds 60.

## 7. Phase 2 — the graph (built 2026-09-05)

The owner on phase 1: "звичайний фільтр" — a colour grade over the camera is not TouchDesigner. What makes TD
art is the GRAPH, and pixi already ships every node of it; `apps/portal/graph.js` assembles them from data:

| TD TOP | pixi node | in the preset |
|---|---|---|
| Feedback | two `RenderTexture`s ping-pong: the previous frame under the new one, faded, zoomed, turned | `echo {decay, zoom, rot}` |
| Displace | `DisplacementFilter` on the camera sprite, the map a scrolling `TilingSprite` of the material's generated texture | `disp {amount, speed}` |
| Composite | the same texture as a `TilingSprite` layer over the loop's output — `add / screen / multiply`, alpha, breathing | `mat {blend, alpha, scale, speed, breathe, rate}` |
| Mirror | the world twice, the twin flipped and masked to one half (the right half is the source) | `mirror: "x"` |
| LFO | every speed per second, every breath an amplitude on a rate | `speed`, `breathe/rate` |
| post | the phase-1 filter chain on the composite | `chain` |

The textures are the 11 material textures generated on the pods (`assets/tex-<id>.webp`, 512²), one per theme.
The loop renders at CSS resolution 1 into the feedback textures (two extra passes a frame) and the screen shows
it upscaled.

Two rules learnt on the see pod, both structural:
- **A layer with `screen`/`add` inside a feedback loop sums without bound** (six presets burnt to white, veil to
  pure green). The loop holds only the echo and the camera; the camera enters at the preset's alpha (0.45–0.7),
  which bounds the trail by the picture; the material composites AFTER the loop.
- **A mask `Graphics` no preset consumes is a white rect drawn over everything** — the masks join the tree only
  while a preset mirrors. Also: `DisplacementFilter.scale` is a `Point` (`.set(x, y)`), not a number.

## 8. Phase 2.1 — the TRACED graph (built 2026-09-05, product f9e3109)

The owner on §7 from the phone: "статичні фільтри замість динаміки, немає текстур", "я очікував якісь лінії наших
текстур на краях обʼєктів а не просто статику", "воно має ожити". §7 laid the material over the whole frame at
alpha 0.3 moving 5 px/s — a film, not a drawing. The TD answer is three TOPs: **Edge** (Sobel) → **Composite**
(multiply the edge by a moving texture) → **Feedback**, then Over the dimmed source. Research done by hand (Codex
is down): the Edge TOP's parameters (`strength`, sample `offset`, `combineinput`, `operand`) from docs.derivative.ca;
pixi 8's custom-filter contract from the official `pixijs-filters` skill and the DisplacementFilter source
(`Filter.from({gl:{vertex, fragment}, resources})`, `uInputSize`/`uInputClamp` provided, textures as resources
`uX: source, uXSampler: source.style`, resources re-assignable through the accessor); skills installed globally:
`pixijs`, `pixijs-filters`, `shader-programming`, `touchdesigner` (MCP-shaped; its feedback notes hold: one
resolution across the loop, soft boundaries). 21st.dev holds React hero backgrounds, no camera pipeline — no fit.

The graph now (`graph.js`), three passes at CSS resolution 1 + the stage:

| pass | node | what |
|---|---|---|
| lines | `traced` sprite + **EdgeFilter** (ours, 25 lines GLSL) | Sobel on luminance × the material sampled at `uMatScale/uMatOffset` (scrolling), `uInvert` for pale materials; writes premultiplied `vec4(m·e, e)` — a line or nothing |
| loop | `echo` (prev RT: decay, zoom, rot) + `fresh` (linesRT at alpha, `DisplacementFilter` by the material field) | trails on a transparent ground: bounded, alive on a still scene |
| out | `base` (camera: tint + `ColorMatrixFilter.saturate`) + `view`/`twin` (loop, blend `add`, masked halves when mirroring) | the post chain of §5 on top |

`Filter.from` with only a fragment threw `Cannot read properties of undefined (reading 'substring')` — GlProgram
needs the vertex; pixi's default filter vertex is inlined verbatim. Preset data (`presets.js`): `edge {strength,
step, floor}`, `lines {alpha, speed, scale, ripple, fieldSpeed, breathe, rate, blend, invert}`, `echo`, `base
{tint, sat}`, `mirror`, `chain` with `null` = "not on this theme"; `LIGHT` = the pale drained ground + `normal`
lines, pale materials `invert` + `multiply` (the light theme is a contour drawing, the dark a light drawing).
Sheets: 12 dark + 9 light on the see pod before the push.

## 9. Phase 3 — the material as a property of the surface (built 2026-09-05, product 5d6ad8b)

The owner, moving the phone: "текстури не цепляються до обʼєктів … виглядає як фільтр звичайний поверх",
"якість камери не порти", "дрібні текстурочки атомні, а не великі поверх усього", "фурмули математики алгоритми
мають працювати … на старому желізі бездоганно", "ми володіємо глибиною". §8 scrolled the material in SCREEN
space — a film. TD's answer is Optical Flow → Feedback → Remap: the texture coordinates travel with the scene.

| pass | resolution | reads/px | what |
|---|---|---|---|
| luma | 1/4 CSS | 1 | the camera, small, a pair (now / last) |
| **flow** | 1/4 CSS | 54 | Lucas–Kanade, 3×3 window: `A = Σ[Ix², IxIy; IxIy, Iy²]`, `b = −Σ[IxIt, IyIt]`, `f = A⁻¹b`, det-guarded, clamped to ±6 low-res px, mixed ½ with the last flow; encoded `0.5 ± f/12` in RG |
| **anchor** | detail | 2 | the material's tile PHASE per pixel: `a(p) = fract(a_prev(p − f) − f/period + drift)` — the phase moves with the scene; 8 bits hold a 256-px tile to a pixel |
| cam | detail | 1 | the camera at cover into a full-frame RT (so the trace's UV is the screen's) |
| **trace** | detail | ~12 | Sobel contours `e` + tone hatching `shade·smoothstep(band, tone)` (the shadows or the lights take the material); the material sampled at `screen/period + a(p)`; premultiplied `(m·w, w)` |
| **echo** | detail | 1 | the last loop frame sampled at `p − f` (the trail follows the scene), then faded, zoomed, turned |
| loop / out | detail / stage | — | echo under fresh; the loop added (or multiplied) over the camera AS IS |

Every custom filter renders at its target's resolution (`resolution: "inherit"`), all full-frame sprites sit at
(0,0) w×h so one RT samples another at the same `vTextureCoord`, and a cleared flow is 0.5 grey (zero), never
black (−max). Atomic grain: the tile = `lines.scale × 1024 px` (0.12–0.25 → 123–256 px), a knob. Dark drawing
materials (ink, thread, sand, paper) multiply on both themes; luminous ones add. The still on the see pod cannot
show the anchoring (flow = 0); the phone can.
