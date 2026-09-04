# onthisday — what happened on today's date

Wikipedia's `rest_v1/feed/onthisday` (CORS `*`, keyless), in the UI locale's wiki. The gate and `?mock`
render a committed sample.

## Design refresh 2026-09-04

State map (`data-otd-state`): **loading** (five decoding cards, `Scramble` slots, held ≥ 1 s) · **list**
(`[data-otd]` cards — year · text · thumbnail; a card with a URL is a link) · **empty** · **error** (the
cloud-off empty state). `data-otd-cat` is the Segmented's value.

What changed and why: the three `card bg-base-100 border border-base-300 rounded-2xl` (view.js:79, :89,
:90) were flat hairline boxes — `.card` already carries the shallow raised pair from theme.css, so the
hairline was an edge drawn on top of an extrusion and the explicit `bg-base-100` a no-op. One `CARD` string
now: `card rounded-[var(--ms-r)]`. The thumbnail inside → `--ms-r-in`; `transition` on a link card →
`transition-transform`; the skeleton's `text-primary/50` → `.text-muted`. Added the two `data-otd-*` hooks
(the screen had none). Kept `text-primary` on the year (ink is the brand).
