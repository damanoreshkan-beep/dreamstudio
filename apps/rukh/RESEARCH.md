# Рух — film from words or a photo (research note, 2026-09-03)

The app: type what happens, or hand over a photo as the first frame (or both), tap Зняти / Оживити, get a
short clip (2–3.5 s) to watch, share and keep. Every claim below carries how it was validated; the UNVERIFIED
list at the end is what the build must not lean on.

## The survey — what changed since 2026-09-02

The trending survey of 2026-09-02 (`reference_hf_spaces_survey_2026_09`) looked at 200 trending Spaces and
found every video generator `size="xlarge"` — dead for the anonymous 2-minute bucket. A KEYWORD catalogue is
a different population: 29 synonyms × {likes, trendingScore} through
`GET /api/spaces?search=…&expand[]=runtime` gave 2265 Spaces, 576 RUNNING, 221 with a `gr.Video` in
`app.py`, **136 neither `xlarge` nor a static `duration > 120`** (scratch `vidcat.mjs`, VERIFIED). The
cpu-basic rows among them are API proxies (Wan-AI/Wan2.1 → DashScope behind the author's key,
akhaliq/veo3.1-fast → the visitor's own HF login) or a 14B model on two vCPUs — none is a row.

## The Spaces, measured through the browser worker (the pods, `vps/hfvideo.mjs`)

| Space | declares (app.py) | inputs, DOM order | measured |
|---|---|---|---|
| `zerogpu-aoti/wan2-2-fp8da-aoti-faster` | `10 + steps · 15·(frames·w·h / 81·832·624)^1.5` ≈ 62 s at its defaults (6 steps, 3.5 s) | `gr.Image` (required) · Prompt · Duration slider 0.5–5 · Advanced | **i2v: 832×576 · 3.56 s · 243 KB mp4, 53 s from the click** (pod p3) |
| `Lightricks/LTX-2-3` | `@spaces.GPU(duration=75)`, LTX-2.3 22B distilled, video + audio | `gr.Image` (optional) · Prompt · Duration 1–10 (3) · Enhance Prompt (off) · High Resolution (on → 1536×1024 for 16:9; the image's aspect picks 16:9 / 9:16 / 1:1) | **t2v: 1536×1024 · 3.04 s · 1.37 MB, 46 s** (p1, second try); the first two runs got the queue toast `No GPU was available after 60s` — a refusal for that run, not the bucket |
| `Upsampler/wan-2-2-5b-video` | `15 + 8/step at the reference workload`, capped, ≈ 43 s at its defaults (4 steps, 2 s, 896²) | `gr.Image` (optional) · Prompt · Duration · Advanced | **t2v: 896×896 · 2.04 s · 487 KB, 36 s** (p3) |
| `KingNish/wan2-2-fast` | 60/75/90 s by steps × duration | same shape | toast `ZeroGPU worker error RuntimeError` in 13 s — dropped |
| `multimodalart/self-forcing` | bare `@spaces.GPU` (60 s) | Prompt · "Start Streaming" | streams into a `blob:` `<video>` and the frame's `fetch` of it fails (Node crashed on it) — a streaming contract, dropped |

The output contract, VERIFIED on the three winners: after the click the frame gains a NEW
`<video src="https://<space>.hf.space/gradio_api/file=/tmp/gradio/<hash>/<name>.mp4">` (a download link
appears beside it); `.progress-text` reads `2/6 steps | 24.9/55.0s | 33.3%` (Wan) or `processing | 24.1/58.2s`
(LTX); the bytes start `ftypisom`. `createElement("video")` on the blob gives width/height/duration in-page.

**Video IN is not a product keyless** (VERIFIED on app.py): `alexnasa/Wan2.2-Animate-ZEROGPU` is
`size='large'` behind an interactive SAM2 mask; `linoyts/wan2-1-VACE-fast` takes a `gr.Gallery` of images
(the adapter cannot fill one); the `ltx-community/ltx-2.3-*` relights are one effect each and declare
`60 + 1.2·frames` (≥ 90 s at their smallest frame count). So the app is text → video, image → video, and
text + image → video; a clip-in mode waits for a Space that admits anonymously.

## The public route (`/feed/video`, edge 89d6783, probed with a sealed probe sid)

- t2v `{prompt}` → `{job}` → 42 s → `video/mp4`, 652 KB, `x-video-by: Lightricks/LTX-2-3`,
  `x-video-res: 1536x1024`, `x-video-dur: 3.04` (VERIFIED through `https://dreamstudio.mooo.com/feed`).
- i2v `{prompt, image: data:image/png}` (the cat fixture) → 36 s → 638 KB, LTX-2-3 again, 1536×1024.
- The edge runs a FAN of two Spaces on two pods per round (T2V: Wan 5B + LTX; I2V: Wan 14B + LTX, then Wan 5B),
  the first clip wins and cancels the other; a round of refusals hands over to the pool's next entries. A
  day's cache keys on words + the picture's tail. The phase line names ONE Space until it drops out — the
  first cut alternated two names every poll and read as a flicker.
- Anonymous economics: LTX declares 75 s and Wan 5B ≈ 43 s against a 120 s bucket per pod per day, so a pod
  pays for one LTX or two Wan 5B before the pod-rotator moves its exit. Generation is signed-in only; a
  401 raises the systemic authWall.

## The state map (the premium bar, `rules/design.md` — written before the second cut, 2026-09-03)

The first cut shipped without this table and the owner opened it raw: the clip landed BEHIND the first frame
(the `src` stayed set, so the picture kept the stage), it did not play (Chrome blocks an unmuted `play()`
40 s after the tap — no gesture), the model was not on the screen, and the × sat under nothing but read as
dead. Every row below names what the FRAME shows, what the ISLAND holds, the verb, and what demotes.

| state | the frame (stage) | the island | verb | ≤520 px |
|---|---|---|---|---|
| empty | the chooser island (upload · camera · last picture) on the black inset frame | words · «Модель» rail (Авто + the `both` rows) · button | Зняти (off) | frame beside island; words one line |
| words | same — the sources ride on the frame | words · rail · button | Зняти | — |
| picture | the picture, `object-contain` on black; × chip top-left (`data-remove-picture`, z-10, undo toast); caption «Перший кадр» | words · rail (the `i2v` row joins) · button | Оживити | — |
| working | what was there stays; a 2 px amber filament along the frame's bottom edge grows with `pct` (`data-progress`) | status line «Знімаю/Оживляю… N s» beside the words, button off | — | — |
| done | the CLIP, muted loop, autoplay; first-frame chip top-left when it came from a picture (`data-first-frame` → the picture returns); the compact sources top-right; meta bottom: «з фото · 1536×1024 · 0:03 · без звуку» | words · rail · Transport (play = unmute+play; share · save · clips) · button | Зняти / Оживити | transport compacts on width by itself |
| error | stays | the error line (an instruction, no blame) | on | — |
| clips sheet | — | rows: words · model · seconds · when; delete with undo | — | — |

Precedents: the island/stage/split regime from vidlunnia (`apps/vidlunnia/view.js`), the rail from mirage's
options sheet (`data-model`, `data-models-check`, `shortName`), the sources from the kit (`/_rt/intake.js`).

## The app

- The runtime's `/_rt/intake.js` (core 1.2.14, this app was the third photo intake — the copies in mirage
  and zir were the signal) gives the chooser, the primed viewfinder and `toDataURL` (1024 cap → ~300 KB JPEG
  on the wire; the edge's body cap is 2.5 MB).
- ONE `<video>` stays mounted in the frame across modes so the Transport's element survives; `attachVideo`
  hands it to the state once, a clip that landed before the mount loads then.
- The gate's clip is `assets/mock.webm` — 1.5 s of drifting light, VP9, 4.5 KB — because the gate's Chromium
  has no H.264 (Playwright's build) and CI must never spend a GPU minute. `boot` seeds it (data-live).
- Filenames: `rukh-<yyyy-mm-dd-hh-mm>.mp4` (or `.webm` for the mock) through the shell-aware `shareFile`.

## UNVERIFIED — do not lean on

- ~~Whether LTX-2.3's clip carries an AUDIO track~~ — VERIFIED with ffprobe on the media container
  (2026-09-03 evening): LTX-2.3 = h264 High yuv420p 1536×1024 24 fps **+ AAC LC**; Wan 2.2 5B = h264 High
  yuv420p 896², no audio. Both play on Android Chrome; the eye's headless Chromium has no H.264 (its
  `video.error.code = 4` in `vps/drive-rukh.mjs` is the build, not the file). Every clip is now re-encoded
  by the media process (`edge/norm.js`: H.264 Main, yuv420p, AAC, faststart) so a Space switching its
  writer (diffusers' `export_to_video` defaults to OpenCV `mp4v`) can never reach a phone.
- The re-encode, measured live: an LTX clip 810 057 B → 915 370 B (H.264 Main + AAC LC, faststart) in
  872 ms on the media container; the whole request answered in 28 s.
- The bytes behind the blob AFTER the sealed tunnel: `video/mp4`, 407 756 B, `ftypisom` (drive-rukh, live
  app, sealed probe session) — the transport delivers the file intact.
- `Upsampler/wan-2-2-5b-video` with an image (its `gr.Image` is optional and the code path is the same, but
  the i2v probe ran on the 14B Space and LTX only).
- `hugging-apps/cmd-i2v-demo` (≤ 60 s declared, Cosmos-based) and `linoyts/wan2-2-i2v-rCM` — catalogued, not
  driven; candidates for the I2V pool's tail.
