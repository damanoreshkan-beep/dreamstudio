# pendulum — research notes

A dowsing pendulum swinging between the two poles of a duality, one full swing to a breath. Pure DOM (no
WebGL), so the CI shot and every phone render the same frame; the swing math is the core's `/_rt/pendulum.js`.

## Design refresh 2026-09-04

State map of the main screen (one screen, no chrome of its own):

- **swinging** — the orb on its rod, the two pole words above it crossfading with the breath (the favoured one takes `--color-accent`); tap anywhere (`[data-stage]`) turns the pair.
- **turning** — the orb blooms (`scale`), the next pair fades in; `data-pair` on the stage carries the index.
- **gate / reduced motion** — one still, deterministic frame (`GATE_PH`), the arm held, no float.
- 412×430 / 360×340: the geometry is in `vh` (pivot 9vh, arm 47vh), so the orb stays in the lower centre at any height.

What changed and why:

- The orb was the pre-luminous Farm-Noir purple as five hex stops plus an `rgba(159,140,246)` halo and a literal offset shadow pair. It is now `.pd-bob` / `.pd-halo` in `head.html`: the app's MARK colour (`--app-accent`) shaded in oklch relative to that one hue (highlight · body · underside), the halo from the theme's own `--lm-bloom` / `--lm-bloom-hi`, the glow as a single soft cast. One orb, both themes, no literal.
- The pole words' crossfade floor rose from 60 % to 70 % ink (`poleInk`), the lowest alpha that stays legible on the light theme.
- Deliberately left: the `fixed` full-screen stage and the `top:27vh` word row — this screen is a single ambient surface with no dock-adjacent controls, so the chrome tokens have nothing to clear.
