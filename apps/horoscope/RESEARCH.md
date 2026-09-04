# horoscope — research note

A feed-tool: the real daily reading for one sign (yesterday · today · tomorrow) from horoscope.com through
the VPS proxy, localized by `/_rt/localize.js`, cached per (sign, day). See the header comment in `view.js`.

## Design refresh 2026-09-04

State map of the main screen (`[data-state]` on the view root, `[data-day-sel]`, `[data-sign-idx]`):

- `loading` — sign card · day strip · a structure-shaped skeleton (decoding date label, four prose lines, a
  pixel block where the ratings panel will be).
- `localizing` — the reading arrived in English; the prose skeleton holds until the natural-language text
  for the locale is ready; ratings already show.
- `ready` — date label · prose (`[data-reading]`) · the ratings panel (`[data-ratings]`); with a stale cache
  the date row carries an OFFLINE micro-label in the warning tone.
- `error` — nothing cached and the network failed: cloud-off glyph + "check the network".
- overlay `signs` — the sign sheet (`#signsheet`, 12-cell groove, the chosen cell wears the app tint).

What changed and why:

- The three-day `role="tablist"` grid was a hand-rolled clone of the kit's strip → `Segmented` (solid skin,
  `attr="data-day"`); the e2e now asserts `aria-pressed`, the state the kit exposes.
- The ratings box (`sf-raised rounded-2xl p-4` by hand) → `Panel` with its mono micro-label as the title.
- Four Tailwind hex ratings colours (rose/blue/violet/green) were decoration — a filled step is now the app's
  MARK colour `--app-accent`; the empty step keeps `--sf-track-face`.
- Every micro-label is the farm's `font-mono text-[length:var(--ms-label)] uppercase tracking-wider
  text-base-content/70` (the `text-[0.62rem]` / `text-xs` sizes and the `/40 /45 /55` ink alphas are gone;
  muted text is `.text-muted`); radii and gaps read `--ms-r` / `--ms-r-in` / `--ms-gap` / `--ms-pad`.
- The sign glyph on the card is the mark colour; the selected sign in the sheet is `--app-tint`, not
  `text-secondary` (an accent never carries text).
