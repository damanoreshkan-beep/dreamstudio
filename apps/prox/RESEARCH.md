# prox — BLE proximity beacons, heard and sent

The signal analysis lives in the product's `rt/blesig.js` (classification) and `rt/blesend.js` (the
presets), both unit-tested; this app is the two screens over them.

## Design refresh 2026-09-04

State map. Listen: **scanning** (`[data-scanner]` — the live dot, packet count, `[data-livecount]`) ·
**cards** (`[data-card][data-live="0|1"]`: a heard card is LIT by an accent outline and its glyph turns
amber; a quiet one says "not heard") · **blocked** / **error** (`[data-blocked]`, `[data-err]` wells, the
Allow verb) · **card sheet** (`#prox-card`: chips, the `[data-custom]` well, then `[data-decode]` when
heard or `[data-never]` when not). Send: **lab gate** (`[data-prime]`) · **presets** (`[data-preset]`,
the lit one broadcasting) · **active** (`[data-active]`, the bytes) · **needs app** / **error** wells.

What changed and why:

- `sf-sunken` (×9) is not a class the material has — every "well" here had NO surface. → `sf-inset`.
- The live mark was `ring-1` — a ring IS a box-shadow, and so is the material, so one overwrote the other
  (habits hit this first). → an accent `outline` (`LIVE`), its own property. Quiet cards lose their
  `border border-base-content/10` hairline: `sf-raised sf-e2` draws the edge.
- Hand-picked sizes `text-[0.62–0.9rem]` (×16) → the ladder's label token (`LABEL` / `MONO`) for badges,
  captions and byte readouts; row keys → `text-sm`.
- Target chips (`rounded bg-base-content/10`) → `CHIP`: a small well pill in ink, no tone step under text.
- `rounded-2xl` (×4 cards) → `--ms-r`; `rounded-xl`/`rounded-lg` wells → `--ms-r` in the page, `--ms-r-in`
  inside a sheet or a card; the preset's text field → a pill well instead of a hairline box.
- The `expl_*` paragraph on the card sheet (view.js:217) sat next to a working decode — hand-holding. It
  is now the EMPTY state of a never-heard card (under "not heard yet"), where the words are the screen;
  a heard card shows its decode and nothing else. Both locales keep every key.
- Kept: the pulsing live dot (an LED, not a spinner); `text-base-content/80` prose; the accent as the
  glyph/dot/outline mark only.
