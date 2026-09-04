# cam — a pocket camera console

## Design refresh 2026-09-04

State map of the shoot screen (one `ms-stage`, the console is a `Panel`; hooks on the stage root:
`data-facing` · `data-aspect` · `data-timer` · `data-cam-fx` · `data-count`):

- **gate / no camera** — the viewfinder well shows a flat neutral frame (`bg-neutral`); every control is live.
- **priming** (`!enabled || err`) — `CameraPrime` over the console; denied / unavailable are its own states.
- **live** — the feed in the well; the filter strip (Segmented), exposure + zoom (two kit Sliders), the
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
