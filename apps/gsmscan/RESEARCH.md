# gsmscan — research note

Sweeps a GSM downlink band with a HackRF over WebUSB and shows the band spectrum plus the active carriers
(ARFCNs). Public broadcast energy only — no Cell-IDs, no subscriber data. Research:
`docs/research/gsm-band-scanner.md`.

## Design refresh 2026-09-04

State map of the main screen (`[data-sweep]` on · off, `[data-band-sel]`, `[data-carrier-count]` on the
view root; `[data-connect-state]` ready · unsupported on the connect screen):

- connect (no device) — the antenna tile, title, body, CONNECT; without WebUSB a warning panel instead.
- sweeping, no carriers yet — spectrum card (canvas + scale strip), the empty state "Sweeping".
- carriers — spectrum card, the ACTIVE CARRIERS label + count, one raised row per ARFCN (number, MHz, BCCH
  tag in the info tone, four signal bars, dBm — hidden under 300 px of container width).
- island — the sweep glyph lit in the mark colour while a sweep runs, the word, settings, power.
- overlay `rf` — the settings sheet: LNA and VGA gain sliders, disconnect.

What changed and why:

- The two DaisyUI `range` inputs with printed dB values → the kit's `Slider` (`attr="data-gain"`); the
  value is not printed (a readout the owner cannot act on is hint text; the spectrum shows the gain).
- `animate-spin` on the island's radar glyph (a spinner by another name) → the glyph in `--app-accent`
  while sweeping, `.text-muted` otherwise; the state is the word.
- The spectrum canvas read hard-coded rgb triplets — the Farm-Noir purple fill and a theme sniff. It now
  reads its COMPUTED colours off the element: `color` (text-base-content) for the ink line and
  `--app-accent` for the fill, so both themes are right without a per-theme literal.
- `rounded-3xl` / `rounded-2xl` → `--ms-r`; `px-4` rows → `--ms-pad`; `gap-3` → `--ms-gap`; the island
  keeps the kit's own padding and radius (the pill with `p-2` fought the kit's padding).
- Labels: `text-xs uppercase` / `text-[0.6rem]` → the mono micro-label token; ink alphas `/45 /50 /55 /65` →
  `.text-muted`; the BCCH tag is `text-info` (a fact about the channel), not `text-secondary`.
- The connect tile: `bg-primary/12 rounded-3xl` → the raised surface with the glyph in the mark colour;
  the `alert bg-warning/12` box → `Panel` in the warning tone.
