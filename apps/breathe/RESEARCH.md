# breathe — a guided breathing orb

One screen, fully offline: a technique strip (box · 4-7-8 · coherent · calm), the orb that swells on the
inhale and settles on the exhale, the phase word and the countdown, one Transport to pause it. One rAF loop
computes phase, scale and countdown from elapsed time, so nothing drifts.

## Design refresh 2026-09-04

State map of the main screen (`[data-breathe]`):

- `data-tech=box|478|coherent|calm` — the chosen technique (the Segmented's active pill; persisted).
- `data-playing="1"` — the orb breathes, `[data-phase]` cycles Breathe in / Hold / Breathe out, the count
  runs; the Transport shows Pause.
- `data-playing="0"` — the loop is cancelled: orb, phase and count freeze where they were; Transport shows Play.
- Reduced motion: phase and count keep updating, the orb holds at 0.8 (the pulse is the motion asked to stop).

What changed and why:

- **The orb has no hex and no shadow in the view.** Three hard-coded teals plus an inline 70 px
  `box-shadow` became `.br-orb` in head.html: a sphere shaded from `--app-accent` by `color-mix` with the
  material's own bloom (`--lm-rim-hi` + `--lm-bloom-hi`), so it inverts with the theme for free and the
  app carries the farm's pair of light instead of its own.
- **The caption under the strip is gone** (hint text decorating a working control — copy.md §"First").
  The technique's gloss ("fall asleep easier") rides the Segmented item's `title`, the kit's slot for a
  one-line mood; the four `s*` keys stay in both locales.
- **The Transport sits in an Island** (the farm's floating material for a persistent control), gaps and
  padding ride `--ms-gap`/`--ms-pad`, and the root carries `data-tech`/`data-playing` for the eye.

Deliberately kept: `text-base-content/80` on the phase word (not muted — it is the instruction); the
`will-change:transform` inline (the rAF loop scales the orb sixty times a second).
