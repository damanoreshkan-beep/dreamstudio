# kp — geomagnetic storms

## Design refresh 2026-09-04

State map of the now tab (hooks: `data-loading` on the skeleton, `data-empty` on the error state, on the
live root `data-g` (0–5) and `data-storm`; `data-kp` on the reading, `data-forecast` = bars shown):

- **loading** — the ring, a decoding reading, the `Pixels` chart in an `sf-inset` well, two stat Panels
  with `Scramble` slots (held ≥ 1 s by `useReveal`).
- **error, nothing cached** — the shell's empty-state shape (`data-empty` + `data-mascot`).
- **quiet / unsettled** (`data-storm=false`) — the gauge arc in the scale's green/amber, the Kp reading in
  ink, the status word; **storm** (`data-g` ≥ 1) — a dot in the scale's colour before "G1 · Minor storm".
- Below: the 3-day forecast bars (observed at half opacity), the day labels, the solar-wind and aurora stats.

What changed and why:

- The ten-pair hex scale left view.js for `head.html` as `--kp-0…--kp-9` (`light-dark()` pairs); view.js
  paints marks with `var(--kp-N)` only — the gauge arc, the bars, the storm dot. The reading and the G level
  were painted in the scale's colour (colour as text); they are ink now.
- The flat `card bg-base-100 border border-base-300 rounded-2xl` stats (live and skeleton) are the kit's
  `Panel`; the chart skeleton's hairline box is an `sf-inset` well at `--ms-r`.
- Micro-labels (`text-[0.62rem]`, `[0.6rem]`, `[0.55rem]`) are `text-[length:var(--ms-label)]` at `/70`;
  `/40`/`/50` alphas are `.text-muted`; the "updated" line is `text-sm`; the column gap is `--ms-gap`.
