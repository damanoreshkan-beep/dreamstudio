# Личина — the camera in our materials, live (research + decisions, 2026-09-05)

Owner: "це має бути якісно, показати як на камері в canvas все змінюється … і швидко і якісно щоб наші
стилі підтягувались. ти вирішуй." The idea is APP_IDEAS.md №9 (*Личина · mask — a live style-transfer
mirror: the camera feed reimagined as one of the 11 mirage materials*). Every load-bearing claim names where
it was read. UNVERIFIED items are at the end.

## Decision: the LIVE layer is a shader, the KEEPER is the Space

Two ways to put the camera into a material were on the table, measured on 2026-09-05 (a 26-keyword catalogue,
724 Spaces, 241 RUNNING, twelve `app.py` read):

| Path | What it is | Why not the live layer |
|---|---|---|
| `multimodalart/StreamDiffusionV2-Realtime` | true camera→video diffusion, frames POSTed as JPEG, 480×832, 58 s sessions | `@spaces.GPU(duration=60, size="xlarge")` = 120 GPU-s billed = the WHOLE anonymous bucket of a pod; admitted only on a fresh bucket, so ONE session per pod per day, and a custom `gradio.Server` SPA the adapter has no contract for. A product cannot stand on "sometimes, for 58 seconds". |
| `multimodalart/self-forcing` (+ `AstroAUmin/self-forcing`, `duration=45`) | text→video in 7 `.ts` chunks, plays while it generates, bare `@spaces.GPU` (60 s) | text in, not a camera; a streaming contract the pod driver does not speak yet (rukh dropped it: the `blob:` `<video>` cannot be fetched from the frame). Kept as a lead for a later "Слід". |
| **on-device WebGL2, the kit's `GlStage`** | the camera frame as a full-resolution texture, one fragment shader that draws it as each of the 11 materials | **chosen**: 60 fps, zero quota, offline, deterministic under the gate, and the materials are OURS by construction (`rt/styles.js` blocks are the same words the shader interprets). |

So: **live = shader, tap = keeper**. The shutter freezes the frame, the shader keeps painting it, and the same
frame goes to `/feed/image/edit` with the material's own English block (the block mirage appends to a Make
prompt) — the pods' edit race answers with the AI rendering of the same scene in that material, which fades in
over the shader frame. The two never contradict: the live layer is the preview, the keeper is the picture you
save. "Fast AND quality" is the split itself.

## The kit change this needed — `GlStage.cam` (core 1.2.31)

`GlStage` (`packages/runtime/glstage.js`) had one picture channel, `tex`, deliberately downsampled to 64 px
("a stage borrows a palette, it does not project the picture", 1.2.x). A mirror projects. The prop `cam`
(1.2.31, commit 60756db) is the opposite of `tex` on purpose: a `<video>`/canvas/image/ImageBitmap or a
function returning one, uploaded FULL resolution on texture unit 1, no mipmaps (a per-frame `generateMipmap`
is the stutter), `CLAMP_TO_EDGE`; a video uploads only when `currentTime` moved and `readyState ≥ 2`, any other
source when its identity changes; `camAspect = vec2(w/h, bound)`; `data-cam="yes"` on the canvas once a frame
is bound. Rows are uploaded top-first (no `UNPACK_FLIP_Y`), so the farm's `uv.y = 1 - uv.y` convention samples
upright. Read at `glstage.js` (the `uploadCam` closure) — the palette texture binds on unit 0 without saying so,
which is why `activeTexture(TEXTURE0)` is restored after the cam texture is created (a trap found by reading the
sibling code, not by a CI round).

The judging harness grew the same channel: `microspec-edge/vps/frag.sh --cam <photo>` binds the full-res
picture on unit 1, and `--vz` makes a `--sheet CxR` walk `vary.z` 0..1 across the cells instead of time — one
cell per material, the way this shader switches.

## The camera, honestly

- The stream is the kit's lifecycle: `camera.start(video, onErr, { facingMode })` from `/_rt/sensors.js`
  (`sensors.js:433-455`: `getUserMedia({ video: { facingMode }, audio: false })`, `playsinline`, the stop
  closure ends every track). Never cold: `CameraPrime` (`/_rt/camprime.js`) is rendered over the stage until
  the tap on Enable; the caps gate reads `camera` from the sensors import (`SYMBOL_CAPS`,
  `packages/gates/capabilities.mjs:96-104`) and `needs: ["camera"]` in `spec.json` matches it.
- The privacy line is overridden (`privacy` + `privacyIcon`), because the built-in one says "processed on the
  device" and here that is HALF true: the live frames never leave the phone; the ONE frame you shoot is
  uploaded. Say exactly that.
- On Android Chrome a portrait phone's track already arrives rotated (`videoWidth < videoHeight`), so the
  shader's cover-fit uses `camAspect.x` as is; the FRONT camera is mirrored in the shader (`vary.w = 1` flips
  `u`) — the way every mirror app does it, and the captured frame is mirrored the same way so the keeper
  matches what the eye saw.
- Screen stays awake while the mirror runs: `wakeLock.acquire()` (`sensors.js:201-215`), released with the
  stream. `needs: ["camera", "wakeLock"]`.

## The materials — one shader, eleven looks (`lychyna.frag`)

`vary.z = index / 10` selects the material in `rt/styles.js` order (the same order as mirage's cards and the
strip): 0 lum · 1 smoke · 2 chrome · 3 paper · 4 thread · 5 ink · 6 circuit · 7 veil · 8 ferro · 9 porcelain ·
10 sand. `vary.x = busy` (the keeper is being painted: the material breathes), `vary.y = arrival` (the keeper
landed: a bloom that settles), `vary.w = mirror`. `ink` = the app accent as a mark colour. Every material
reads the camera through the same three primitives, all in the shader:

- `cover(uv)` — object-fit cover of the camera into the screen: `asp = res.x/res.y`, `ca = camAspect.x`;
  wider camera → crop x by `asp/ca`, taller → crop y by `ca/asp`.
- `luma` + a 3×3 Sobel on luma with a texel of `1/textureSize(cam)` scaled by `ink.w`-independent `k` (2 texels
  on a 1080p frame — 1 texel is sensor noise) → gradient `g`, magnitude `e`, direction `a`.
- `fbm` (4 octaves, the mirage/hoard rotation matrix) for warps and grain; a `hash` for stars and sparkle.

| # | material | recipe (numbers are the shipped ones, judged on the VPS eye) |
|---|---|---|
| 0 | lum | black void; edges become filaments: `f = smoothstep(0.06, 0.30, e)`; a wider 2-texel blur of `f` is the bloom (×0.55 amber); nodes where `|gx|·|gy|` peaks → points of light; cyan (`0.35,0.95,1.0`) on the nodes at the outer 30 % of the frame; the body of the picture survives at `luma × 0.05` so a face is a face |
| 1 | smoke | grey, warped: `cam(cover(uv) + 0.012·(fbm(p·3 + t·0.05) − 0.5))`; `s = smoothstep(0.15, 0.9, luma)`; sculpted by a hard side light: `n = normalize(vec3(−g, 0.5))`, `L = (−0.8, 0.4, 0.45)`; colour `mix(0.06, 0.97, s·shade)` with a 4 % warm cast; vignette to black |
| 2 | chrome | liquid mirror: `n` from the gradient with `k = 6`; a synthetic studio: `env(n) = softbox band at n.y∈[0.15,0.55] (0.95) + floor band (0.12) + a thin stripe at 0.75`; `col = mix(0.02, 1.0, env) · (0.85 + 0.15·luma)`, cool `(0.86, 0.92, 1.0)` |
| 3 | paper | six cut layers: `L = floor(luma·6)/6`; a step's shadow: `d = L(uv) − L(uv + light·2px)` → `shadow = smoothstep(0, 0.17, d)` darkens 0.32; all white `0.93..1.0`; light from upper-left; the pure white ground never shows the camera's colour |
| 4 | thread | dark linen `0.09,0.075,0.06` with a weave `sin(x·W)·sin(y·W)` at W = 1.6 px⁻¹ ×0.04; a stitch grid of 7 px cells, one diagonal stitch per cell whose brightness is the cell's luma and whose hue is the cell's colour saturated ×1.3; sheen: `pow(1−|sin(stitch phase)|, 6)·0.4`; cells under luma 0.12 show linen |
| 5 | ink | white backlight `0.965`; darkness `d = 1 − luma` warped by `fbm` (0.02) → `blot = smoothstep(0.38, 0.62, d)`; vermilion where the source is warm: `w = smoothstep(0.08, 0.35, r − b)` → `mix(black 0.03, vermilion (0.78, 0.16, 0.08), w)`; tendrils = the warp's high octave on the edge |
| 6 | circuit | matte board `0.02,0.03,0.025` + a 0.02 grid every 28 px; traces = edges snapped to 8 directions: `a8 = round(a / 45°)·45°`, drawn where `e > 0.12` in gold `ink.rgb`; pads = discs r 3 px on the 28-px grid where luma > 0.55; the picture body as dark copper `luma·0.12·(0.9,0.55,0.25)` |
| 7 | veil | night `0.015,0.02,0.05` + stars (hash > 0.9985, twinkle); curtain: `c = pow(luma, 1.4) · (0.55 + 0.45·fbm(vec2(x·34, y·2.4 − t·0.15)))`; hue by luma `mix(green (0.35,0.95,0.55), violet (0.55,0.3,0.95), smoothstep(0.35, 0.85, luma))`; a 3-tap vertical smear for the long exposure |
| 8 | ferro | black gloss; spikes: `sp = pow(|sin(x·S)|·|sin(y·S)| , 3)` at S = 0.22 px⁻¹, raised by luma (`h = luma·0.8 + sp·luma`); normal from `h`; rim `pow(1 − n.z, 3)` in `(0.73, 0.69, 0.94)`; specular `pow(max(dot(reflect(−L, n), V), 0), 40)` |
| 9 | porcelain | dark surround; warm light through the relief: `col = (1.0, 0.86, 0.66) · pow(luma, 0.75)` × emboss `0.75 + 0.5·dot(n, L_back)`; a 5-tap blur of luma ×0.3 as the subsurface glow; edges (e) darken 0.35 as the embossed line |
| 10 | sand | wet sand `0.24, 0.17, 0.11` + grain (hash × 0.06); grooves: `gr = smoothstep(0.08, 0.3, e)`; inside the groove ×0.45; a golden rim on the sun side: edge sampled at `uv − sun·2px` → `+0.35·(1, 0.78, 0.45)`; the shadow: edge at `uv + sun·5px` ×0.6; sun from the right, low; sepia cast; foam at the far (top) edge as a faint fbm line |

Legibility: the island and the strip sit on their own glass; nothing else is typed over the field, so the
shader carries no luma clamp — the camera is the content.

## The keeper — `/feed/image/edit`, one picture

- Body `{ image, prompt, seed, k: 1 }` to `${VPS_PROXY}/image/edit` (`apps/mirage/state.js:170-181`,
  `rework()`); the prompt is English by construction: `"the same photograph reimagined, " + block` where
  `block` is the material's `rt/styles.js` block — no translation step, no user text. `startJob` +
  **`followOne`** from `/_rt/imagejob.js`: at k = 1 the edge answers the BYTES on the status URL (the
  one-picture contract zir and rukh follow), not a slide list — MEASURED by the pre-push drive on the see pod
  (`vps/drive.sh lychyna --see …`, 2026-09-05): `/feed/image/edit/get?job=…` turned `image/webp` at 95 s while
  the first build's `follow` kept waiting for JSON. The size is `sizeOf(blob)` (createImageBitmap), never read
  off an `<img>`.
- The drive can open a camera now: `vps/drive.mjs` launches Chromium with `--use-fake-device-for-media-stream`
  + `--use-fake-ui-for-media-stream` and grants `camera` on the context, so `tap [data-enable]` → the fake
  stream (a moving test pattern) → `[data-shutter]` → the real edge is the pre-push proof for every camera app.
- The frame is captured from the `<video>` into a canvas at the kit's cap (`MAX_SIDE = 1024`,
  `intake.js:64`), mirrored when the front camera is on, and encoded with `toDataURL` (`intake.js:97`).
- `report("keeper.fail", { reason, mat })` on every failure (the client log rule); `holdBackground` while the
  pods paint, like mirage; a 401 raises the systemic authWall by itself; `profile.account: "any"`.
- Under the gate no network: the keeper resolves after 120 ms to the mock photo itself — the e2e asserts the
  DONE state, never the pixels.

## The gate's camera

The headless gate has no camera. `cam` under `gate` is an `<img>` of `assets/mock.webp` (a 768×1024 portrait
generated on the pods with Z-Image — our own picture, no licence), marked `data-live` on the stage wrapper (the
sensor-app rule, `rules/invariants.md`). The same still is what the store captures show, so the Today hero
shows a real face in a real material.

## The screen — the state map (rules/design.md, THE PREMIUM BAR)

One `fit` tool tab. STAGE = `GlStage` full-bleed (`fixed inset-0 z-0`, the transparent header sits on it).
ISLAND = one glass island at the bottom: the MATERIAL STRIP (11 round thumbs from `assets/style-<id>.webp`,
`aria-pressed`, the active one ringed in the accent and named beside the strip in mono) and the ACTION ROW.

| state | stage | island row | primary | demotes at 412×430 / 360×340 |
|---|---|---|---|---|
| prime | black + `CameraPrime` overlay (reason, honest privacy, Enable) | strip (inert), row hidden | Enable (the kit's) | prime overlay compacts by its own rules |
| live | the camera in the material, `data-live` | strip · [flip] [SHUTTER] | shutter | strip 44 px tiles, name hidden under 20 rem |
| frozen → working | the frozen frame in the material, breathing (`vary.x`); mono status `Проявляю · m:ss` over the island | strip disabled · [×] [status] | cancel (×) | same |
| done | the keeper `<img>` fades over the frame (`vary.y` bloom); tap it = full view | strip (re-inks nothing: the keeper is a picture) · [live again] [save] [share] | live again | actions become circles |
| error | frozen frame stays; `data-error role=alert` line in the island | [live again] | live again | — |
| denied / unavailable | the prime overlay's own states (Open permissions) | strip inert | — | — |

Transitions in the table only. A material tap in `live` re-inks instantly (`vary.z`); in `done` it is ignored
until "live again" (the keeper was painted in one material — mixing is a lie).

Precedents copied: zir (`data-go`/`data-act`/`data-error`, the working readout, save/share via `apk.js`),
mirage (the style cards, `rework()`), pipette (the camera lifecycle + the seeded gate), vydyvo (wake lock).

## UNVERIFIED (the build does not depend on these)

- Whether Chrome on the S25 Ultra delivers the rear track at 1920×1080 or 1280×720 for `facingMode`
  without a `width` constraint — the shader's texel is read from `textureSize(cam)`, so both are right; only
  the edge detail differs. Measured on the phone, not here.
- Frame cost at DPR 2 on the S25 Ultra: ~4.5 M fragments × ~20 taps. Expected fine on Adreno 830; if the eye
  on the phone shows a stutter, the first move is `GlStage`'s DPR cap for `cam` stages, not the shader.
- Whether the shell's WebView mirrors `facingMode: "user"` itself (Chrome does not) — the shader flips
  unconditionally for the front camera.
