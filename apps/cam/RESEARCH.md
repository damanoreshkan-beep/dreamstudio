# cam — a pocket camera console

## CamStage 2026-09-07

cam no longer owns a camera. The kit's `CamStage` (core 1.2.50) sits in the viewfinder well and owns the
priming screen, `getUserMedia` + its flip retry, the wake lock and the torch; cam holds `facing`, `torch` and
the element the stage hands over through `onVideo`, and draws the shot from it. `constraints` carries cam's own
`{ width, height: { ideal: 1920 } }` into the stage's `getUserMedia` — the shot is a centred square scaled to
1200 px, so a 640×480 default would upscale from 480. `primeFull` keeps the priming screen over the whole
console. `gestures={false}` — the deck
already has the zoom, and a tap on a console's viewfinder means nothing; `fullscreen={false}` — the picture is
a square set in a chassis. The zoom slider is therefore purely digital now (CSS scale on the preview, the
centred crop in `grab`); the track-level optical zoom it also applied is gone with the raw track.

## Design refresh 2026-09-04

State map of the shoot screen (one `ms-stage`, the console is a `Panel`; hooks on the stage root:
`data-facing` · `data-aspect` · `data-timer` · `data-cam-fx` · `data-count`):

- **gate / no camera** — cam passes no `still`, so `CamStage` stands aside (no stream, no priming screen) and
  the viewfinder well shows a flat neutral frame (`bg-neutral`); every control is live.
- **priming** — `CamStage`'s own screen with `primeFull`, so it covers the whole console (pinned to a fixed
  `.ms-stage`) rather than the square well, which would clip the Enable button; denied / unavailable are its
  states, not the app's. The look on the wrapper is keyed on `ready` for exactly this reason: a `filter` or a
  `transform` there would become the containing block of that fixed screen and pull it back into the well.
- **live** — the stage shows the feed in the well (`show`, never mirrored by the stage itself); the console's
  filter, digital zoom and mirror ride on the wrapper around it, keyed on the stage's `ready`. The filter
  strip (Segmented), exposure + zoom (two kit Sliders), the
  recessed toggle deck (flip · torch or front flash · grid · timer · mirror · aspect), the shutter.
- **counting** (`data-count` > 0) — the hero number over the feed; **lit** — the whole screen is white for
  420 ms before a front-camera grab; **flash** — the 160 ms white wash after a capture; **shot** — the last
  frame in the well beside the shutter.
- At 412×430 and 360×340 the square well takes what the deck leaves (the Panel's `min-h-0` flex column).

What changed and why:

- The chassis is the kit's `Panel` (was `rounded-[1.9rem] bg-base-100 p-4 sf-e3`); the LED is a plain
  `--app-accent` mark (no `shadow-*`); both micro-labels use `text-[length:var(--ms-label)]` at `/70`.
- The viewfinder is an `sf-inset` well at `--ms-r-in` (was a 3px `border-base-300` hairline plus an
  app-authored inset shadow); the Farm-Noir gate gradient (`#2b2540/#0c0c12`) is gone; the glass glare
  gradient is gone (decoration). What stays white/black is over the FEED and says so in a comment: the grid,
  the corner marks, the crop bars, the countdown, the flash ring (now a `border-white/90` ring, no
  `shadow-[…]`), the flash.
- The two DaisyUI `range` inputs are kit `Slider`s (`data-dial`); the toggle deck and the last-shot well
  take `--ms-r-in`; chrome gaps are `--ms-gap`; the shutter's `transition` names `transform` only.
