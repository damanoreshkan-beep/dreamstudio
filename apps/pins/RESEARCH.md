# pins — a direct image link out of Pinterest

The extraction research lives in the core: `docs/research/pinterest-extraction.md`; the parsing in
`/_rt/pinterest.js` with unit tests. This file carries the app's own screen decisions.

## Design refresh 2026-09-04

State map of the Grab screen: **idle** (`[data-idle]` — the three URL shapes as chips that fill the field,
or `[data-recent]` when something was saved before) · **grabbing** (`#grab[aria-busy]`, the verb in its
progressive form, `[data-pin-skel]` a Pixels slot the pin decodes into) · **pin** (`[data-pin]` Panel:
image, text, board line, copy · download · save · open, the resolution line `[data-fullstate]`) · **board**
(`[data-board]` two columns of compact cards) · **error** (`[data-err]`). Saved tab: the count and the
two-column grid (`[data-saved]`), or the empty Panel.

What changed and why: the label trap ×5 (view.js:120, :136, :153, :163, :249 — `text-[var(--ms-label)]` is a
colour to Tailwind v4) → `text-[length:var(--ms-label)]`. The `lucide:loader … animate-spin` on the grab
button (:212) was a spinner → gone; the busy state is the verb ("grabbing") plus a `Pixels` slot where the
card will land. `rounded-2xl` on the field and buttons (:123, :210, :211) → removed so the theme's
`--radius-field` applies; the shape chips → pills; the image inside the Panel → `--ms-r-in` (concentric).
Kept: `#e2dfd8` in the gate fixture — it is the API's own dominant colour of that image, painted UNDER the
picture while it decodes (over media, data not design).
