# qr — a QR scanner that previews before it opens

## Design refresh 2026-09-04

State map of the scan screen (hooks on the `ms-stage` root: `data-verdict` = idle · safe · caution · danger ·
info, `data-kind`; the aperture is `data-aperture`, the preview Island `data-preview`, its readout
`data-readout` — `data-live` belongs to CamStage's stage element):

- **priming** — CamStage's own screen; `primeFull` pins it to `.ms-stage`, so it covers the whole tab (the
  stage itself is only the aperture).
- **scanning** (`data-verdict=idle`, CamStage `data-ready`) — the feed shown by CamStage (`show`, a flat
  neutral frame under the gate), the white corner marks with the half-black scrim around them, the Island
  holding a mono "—" (`data-readout`).
- **held** (a verdict) — the corners re-ink in the theme's meaning colour; the Island: verdict chip + kind
  label, host over the full URL (`data-readout`), the flag chips, then Open (verdict-toned) · Copy · Scan again.
- At 412×430 / 360×340 the aperture is `min(64vw, 15rem)` and the Island keeps every control.

What changed and why:

- **2026-09-07** — the camera is the kit's `CamStage` (`show`, `fullscreen={false}`, `gestures={false}` but
  `pinch` since core 1.2.54 — the zoom brings a far, small code close, while the tap's focus ring inside the
  aperture would read as "code caught" and lie about a scan that has not happened; owner's call, no
  `still`): the app no longer owns the priming, `camera.start`, the wake lock or the `<video>`; the decoder
  samples the element `onVideo` hands it. Under the gate the stage stands aside and the seeded `bit.ly`
  string is still what the shot shows. `spec.json` `needs` gained `wakeLock`.
- The verdict edges were four hexes (`#40C173 · #D9973A · #F0655E · #9AA0A6`) and an `rgba` idle; they are
  `var(--color-success/warning/error)` now, and the idle frame is `#fff` with the comment that it sits on the
  camera feed (a picture, never the theme). The gate's `bg-gradient-to-b` stand-in is a flat `bg-neutral`.
- The hand-rolled bottom bar (`bg-base-100 border-t border-base-300`) is the kit's `Island` (in flow,
  `tag="section"`); `bg-base-200` on the stage root is gone (base-200 is base-100 here).
- Micro-labels (`text-[0.7rem]`, `/45`) are `text-[length:var(--ms-label)]` at `/70`; `/35`/`/55` alphas are
  `.text-muted`; the flag chips are sentence-case pills at `text-sm` (they are sentences, not labels).
- Corner radii follow `--ms-r`; the `transition-shadow` on the scrim (never animated) is gone.
