# air — the European Air Quality Index as a gauge

One `tool` tab: the EAQI gauge for the device's position (Kyiv fallback), a 24-hour forecast band, the five
key pollutants each banded by its own EEA sub-index, and the active pollen species. Open-Meteo Air Quality
(CAMS Europe, keyless, CORS *). The banding maths is `/_rt/air.js` (unit-tested); the view is layout.

## Design refresh 2026-09-04

State map of the main screen (`[data-air]`):

- `data-ready="0"` — the structure-shaped skeleton: the gauge ring on `--sf-track-face`, two `Scramble`
  slots, a `Pixels` well for the forecast, three decoding rows. Held by `useReveal` so a fast load never flashes.
- `data-ready="0" data-empty` — fetch failed with nothing cached: the runtime's empty-state shape (mascot
  hook + icon + one line), the scatter decor hangs on `data-empty`.
- `data-ready="1" data-band=0…5` — populated: gauge arc in the band's hue, ink number, band word with its
  mark, forecast bars, pollutants with a band dot each, pollen rows with a band dot each.

What changed and why:

- **Colour as text is gone.** The AQI number, the band word, every pollutant reading and the pollen level
  were painted in a per-theme `AQ_INK` ramp (12 hexes tuned twice). The band is a MARK now — the arc, the
  bars, and a 2 px dot beside the word/value — and the words are ink. One ramp (`AQ`, 6 hexes, documented as
  marks), no `light-dark()` text colours, nothing that has to be re-measured when the theme moves.
- **Micro-labels take the token**: `text-[0.6rem]`/`[0.62rem]`/`[0.55rem]` → `font-mono
  text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70` (one `LABEL` constant); the
  axis ticks and unit glyphs use the same size.
- **Muted text is `.text-muted`** (was `text-base-content/40–50` in the skeleton); the forecast well takes
  `rounded-[var(--ms-r)]`; gaps/padding ride `--ms-gap`/`--ms-pad`.
- Skeleton and empty states carry the `data-air`/`data-ready` hooks so the eye can name the state it shot.

Deliberately kept: the 6-hex EEA ramp (a gauge palette is a mark, allowed by design.md); the hairline row
dividers (a `border-b` between rows is part of the language, not depth).
