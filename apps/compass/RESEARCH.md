# compass — a compass that points at TRUE north

One screen: the heading (true when a position gives the WMM a declination, magnetic otherwise — never a
"true" north it cannot know), the rose that turns under a fixed index, and the disclosure line: the
declination in use, or why there is none. `/_rt/sensors.js` hands every consumer a true heading; the model
is `/_rt/geomag.js` (WMM2025, on-device).

## Design refresh 2026-09-04

State map of the main screen (`[data-compass]`):

- `data-perm="ask"` — iOS before the gesture: the Enable button under the rose, heading decoding.
- `data-perm="none"` — no magnetometer: the error line in `text-error`, the rose static.
- `data-true="1"` — position known: label "True heading", the declination line (`[data-dec]`) and the
  model's mono micro-label.
- `data-true="0"` — running without a position: label "Magnetic heading", the warning line naming the
  reason (no position / permission refused) — or "expired" when the date is outside WMM2025's range.

What changed and why:

- **Micro-labels take the token**: `text-[0.62rem]` (the heading label) and `text-[0.65rem]
  text-base-content/45` (the model line) → `font-mono text-[length:var(--ms-label)] uppercase
  tracking-wider text-base-content/70` / `.text-muted`; the status column is `text-sm`, not `text-xs`.
- **The Enable button is a pill** (`rounded-full`, the farm's button shape), the column gap is `--ms-gap`.
- The root carries `data-true`/`data-perm` so the eye can name the state it shot.

Deliberately kept: the rose's ink-alpha tick marks (marks drawn on the face, not surfaces); `text-error`
on N and its tick (the one meaning colour on the dial); the 8 px `sf-e2` pivot.
