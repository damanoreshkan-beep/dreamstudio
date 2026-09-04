# ambient — research note

A soundscape mixer that synthesises every layer in the browser (`/_rt/audio.js` primitives; no files): 20
layers in 6 categories, each with its own volume, one transport, a sleep timer. See the header comment in
`view.js`.

## Design refresh 2026-09-04

State map of the main screen (`[data-mix-state]` idle · playing · paused, `[data-mix-on]` = running layers,
`[data-timer-min]` on the view root):

- `idle` — transport disabled (a play button that starts silence would be a lie), all 20 tiles off.
- `playing` — N tiles lifted with the app tint, each carrying a VOLUME slider; the transport's subtitle is
  the count.
- `paused` — same tiles, transport shows play.
- sleep timer — the rail below the mixer; the chosen duration is the pressed option, tapping it again clears.

What changed and why:

- The per-layer DaisyUI `range` → the kit's `Slider` (`attr="data-vol"`), captioned "Volume" (i18n key
  `volume`, both locales) — the tile's header already names the layer, so the caption is the control's job,
  not a second copy of the name.
- The three sleep-timer chips (a hand-rolled one-of-N with `aria-pressed` + `bg-[var(--app-tint)]`) → the
  kit's `Segmented` rail, the same strip outpost uses for the same control; `attr="data-timer"` keeps the
  e2e hook and `aria-pressed` semantics.
- Category labels: `text-[11px] font-semibold uppercase` → the farm's mono micro-label
  (`text-[length:var(--ms-label)]`).
- Tiles: `rounded-2xl p-3` → `rounded-[var(--ms-r)] p-[var(--ms-pad)]`; the bare `transition` (which
  cross-fades the extrusion) → `transition-[box-shadow,background-color]`; column gaps → `--ms-gap`.
