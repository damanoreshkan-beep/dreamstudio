# ruler — a GPS ruler

## Design refresh 2026-09-04

State map of the ruler tab (hooks on the root: `data-points`, `data-ready` (a fix exists), `data-fixed`
(the fix is usable); the readout surface is `data-readout`, the fix line `data-fix`/`data-live`, the
locating line `data-locating`):

- **locating** (`data-ready=false`) — the well is empty, the total is a `Scramble`, the fix line decodes
  "Locating…" beside a satellite glyph (no loader icon), Add is disabled.
- **fixed, no points** — "—" total, `0` points, the coordinates button; **walking** (`data-points` ≥ 1) — the
  polyline, per-segment labels, the live dashed segment and "To position"; ≥ 2 the total with its ±; ≥ 3 the
  area; **error** — the error line replaces the fix.
- The plot's height is `clamp(280px, 52svh, 460px)`; the Panel below holds readout · fix line · verbs.

What changed and why:

- `draw()` reads every colour off the canvas's computed style at draw time (`color`, `--app-accent`,
  `--color-base-100`, `--font-mono`) — the Farm-Noir `#C13BFF` fallback, `#888`, `#0a0a0b`, `#04120c`, `#fff`
  are gone; the one fixed ink left is `DOT_INK = "#000"` for the number on an `--app-accent` dot (the dot is
  one amber in both themes), documented. Alpha fills use `globalAlpha`, so the token's format never matters.
  The label halo used to read the canvas's own `background-color`, which is transparent in the well — it is
  the page colour now, so segment labels are legible over the area fill in both themes.
- The readout row, the fix line and the verbs sit in the kit's `Panel`; micro-labels are
  `text-[length:var(--ms-label)]` at `/70`; the well is `--ms-r`; the buttons drop `rounded-2xl` and
  `disabled:opacity-40` (the theme's `.btn` carries both); `opacity-*` on text is `.text-muted`.
