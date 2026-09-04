# sun — research notes

The celestial maths is the core's (`/_rt/astro`, `/_rt/skydial`, `/_rt/timescale`); this view is thin
composition. This file carries the screen's state map and its design decisions.

## Design refresh 2026-09-04

State map of Compass: **locating** (`data-located=no`) — the dial renders, the centre readout and the
scrubber are scramble slots, the "locating" line · **located, no compass** (`data-heading=no`) — north-up,
the no-compass line (or the enable-compass verb on iOS) · **located + heading** — the dial rotates, the sun
mark, Polaris if north of the equator, the day scrubber · **picked** (`data-picked=yes`) — the globe point
overrides GPS, the clear line · **globe** — the Sheet (`#globesheet`).

Changed: the pole star wore a fixed periwinkle (`#8AA2FF` + an rgba glow); it is the farm's cool pole
(`--app-accent-2`, the second mark) with a `color-mix` halo and a `currentColor` outline, so it is one
declaration in both themes. Every status line under the dial is the mono micro-label (`--ms-label` length
token) — the six `text-xs` lines were body-size captions in three different tints; muted ones are
`.text-muted`. Buttons take the theme's field radius (three `rounded-2xl` gone); the dial's heading chevron is
`.text-muted` (`/50` failed paper); the column gap is `--ms-gap`. The city chips stay a wrapping palette, not
a Segmented — they are jumps, and the picked value is usually none of them.
