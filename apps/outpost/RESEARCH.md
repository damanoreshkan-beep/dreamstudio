# outpost — research note

A software generator of sci-fi station ambience: six macro beds in one persistent Web Audio graph that
MORPHS between stations (`/_rt/scifi.js` formulas, unit-tested). See the header comment in `view.js`.

## Design refresh 2026-09-04

State map of the main screen (`[data-op-state]` online · standby, `[data-station-sel]`, `[data-timer-min]`
on the console root; `[data-status]` is the status line):

- standby — station rail (the chosen station pressed), the hero transport in its halo rings, the LED in
  `--sf-track-face`, six fader strips at the station's levels, RESET MIX, the sleep-timer rail.
- online — the reactor glow breathes behind the core in the mark colour, the LED breathes, the status line
  says ONLINE; faders live.
- tweaked — any fader moved off the station preset (RESET MIX restores it; station pick resets it).
- sleep timer — one of four durations pressed, or none.

What changed and why:

- The three Farm-Noir purple `rgba(159,140,246,…)` radial gradients (the nebula wash, the core glow) →
  `head.html`: the same gradients composed from `--app-accent` / `--app-accent-2` with `color-mix`, so the
  wash follows the theme's pair of light and reads as a warm cast on paper.
- `animate-pulse` on the glow and the LED → one `op-breathe` keyframe in `head.html` (reduced-motion off).
- Each fader's DaisyUI `range` + a separate name column → the kit's `Slider` (`attr="data-level"`), whose
  mono caption IS the layer's name and the input's accessible name (the name was shown twice).
- The status line and the reset button: `text-xs` → the mono micro-label token / `text-sm`; ink alpha `/55`
  → the label's `/70`; strips `rounded-2xl px-3.5` → `--ms-r` / `--ms-pad`; gaps → `--ms-gap`.
