# zir — sight for a picture (4× upscale on the pods)

Owner's ask (2026-09-02): Upscayl (github.com/upscayl/upscayl) as a farm app. Upscayl is an Electron GUI
over `upscayl-ncnn` (Real-ESRGAN on ncnn + Vulkan): it needs a Vulkan GPU, the VPS has none, and an always-on
GPU box is €180+/month. The owner's call: "у нас же є hf і у нас поди з впн — розширюємо спейси та ai". So
the capability rides the farm's existing mechanism — anonymous HF Gradio Spaces driven by the pods' Chromium
(`microspec-edge`, `edge/browser/server.mjs`) — and this app is the screen for it.

## The catalogue (HF API, 2026-09-02)

`GET /api/spaces?search=<upscale|upscaler|esrgan|super resolution>&sort=likes&limit=100&expand[]=runtime`:
327 Spaces, **78 RUNNING**, of which ~30 on `cpu-basic` (their own hardware — no ZeroGPU quota at all) and
~15 on `zero-a10g`. The full process is now `rules/spaces.md` in the microspec skill.

## Driven on the pods (`vps/hfupscale.mjs`, fixtures 256² · 768² · 1280²)

| Space | hardware | run button | out element | 768² in → | time | note |
|---|---|---|---|---|---|---|
| OzzyGT/basic_upscaler | zero (60s) | "Upscale" | ImageSlider webp link | 3072² | 7.3s | UltraSharp default |
| Nick088/Real-ESRGAN_Pytorch | zero (60s) | "Submit" | gr.Image webp link | 3072² | 8.7s | radio x2/x4/x8, x4 default; the frame took 35s to load once |
| Phips/Upscaler | zero (60s) | "Upscale" | ImageSlider webp + gr.File PNG | 3072² | 16.5s | 4xBHI_dat2_real (photo-real DAT2), tiled 1024 |
| Upsampler/media-upscaler | zero (dynamic) | "Upscale" | ImageSlider webp | 1024² (from 256²) | 5.7s | Image tab first; dropdown default |
| ovi054/image-upscaler-pro | **cpu-basic** | "Submit" | gr.Image data: PNG | 3072² / **5120²** | 12.3s / **24.3s** (1280² in) | ABPN mobile SR, ONNX; 5120² PNG = 18.7 MB |
| anthienlong/Face-Real-ESRGAN | cpu-basic | "Submit" | webp link | 512² (256² in, x2) | 18.4s | x2 default; clicking the "4x" radio 0.5s before Submit → "Image not uploaded" (the radio re-renders the form; wait, then click) |

Dropped, measured: Hockman/real-esrgan-upscaler (PyTorch on cpu-basic: **329s ETA for a 256² x2**),
NickKolok/Real-ESRGAN (Gradio 3 — no stable iframe in 105s), LPX55/FLUX.MF-Lightning-Fast-Upscaler
(a generative 1024² re-render, 22s — not an upscale), jasperai/Flux.1-dev-Controlnet-Upscaler and
bbqhan/SeedVR2-3B-Image-Upscale (the click produced nothing in 240s: no progress, no toast, no picture),
guetLzy/Real-ESRGAN-Demo (no `input[type=file]` in the stabilised frame), gokaygokay/Tile-Upscaler
(re-diffuses at a 512 "resolution" default), Jonny001/Image-Upscaler ("Enhance" checkbox OFF by default →
returns the input), the GFPGAN gallery Spaces (a gr.Gallery input the adapter cannot fill).

## What the edge does with it (`edge/image.js`, commit 62f0438)

- `POST /feed/image/upscale {image, quality: "hd"|"fast", model?}` → `{job}`; `GET /feed/image/upscale/get?job=`
  is the ONE-PICTURE contract (progress JSON, then the bytes). Signed-in only, like every generation route.
- **hd** = `podFan(k=2, first:true)` over `UPSCALE_HD` (OzzyGT · Phips · Nick088 · Upsampler, start rotated
  per request) — two pods, two Spaces, the first picture cancels the other; when both refuse, the CPU row.
- **fast** = the CPU row alone (`ovi054`): never refused, ~12s at 768², ~24s at 1280².
- The worker's `kind:"upscale"`: the run button ranked upscale/enhance FIRST (the edit list AVOIDS those
  words), the radio `choice:"4x"` clicked by label, the gr.File PNG link preferred over the preview webp, and
  a re-encode to webp q0.92 IN the page past 4 MB (a 4096² PNG is ~25 MB; the phone keeps every pixel).

## The screen

One fit screen. Stage = the photo (chooser: upload · camera · the last picture made in the farm) → the scan
line while the pods work → the COMPARE: both pictures fill the same box, the enlarged one clipped to the
left of a divider you drag (pointer capture; arrow keys move it 5%); a mono readout `768×1024 → 3072×4096`
under it. Island = quality (Sharp | Fast) + options (the model rail: Auto or a live Space, CPU-tagged) and
the action row (new photo · enlarge again · save · share · Enlarge/Stop). Double-tap → full size (S.screen
"view", history-backed). The upload is capped at 1024 on the long side (4× = 4096², the most a phone should
be handed). The field (`zir.frag`) is the picture's palette gone soft under concentric focus rings that
tighten while a job runs — a lens racking focus — within the farm's display-space amplitude contract.

## Not built, on purpose

- No scale choice (2×/4×/8×): 4× is the product; every HD row defaults to it or is told so by radio.
- No face-restoration mode (GFPGAN/CodeFormer): a different task, the gallery-input Spaces need a different
  adapter, and "restore a face" deserves its own screen if the owner wants it.
- No in-browser WebGPU model: rejected by the owner in favour of the pods.
