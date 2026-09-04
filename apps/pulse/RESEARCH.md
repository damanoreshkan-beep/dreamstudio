# pulse — research notes

A live view over Wikimedia EventStreams (SSE, no auth): every edit on every wiki, buffered and flushed on a
700 ms cadence so the screen never re-renders per event. Under the gate a synthetic stream stands in.

## Design refresh 2026-09-04

State map of the main screen:

- **connecting** — the hero Panel with the unlit LED and «Під'єднання», the rate slot decoding (`Scramble`), the filter Panel, the feed's empty state «Чекаю на правки».
- **live** — the LED breathes (`.pl-live`), the rate, the humans/bots rail, the top-wiki badges (scope = all), the session total; feed rows land newest first.
- **scoped / filtered** — the hero names the scope beside the LED; the two toggles are `aria-pressed` buttons (independent switches, deliberately not a Segmented); every change resets the accumulated view.
- **searching** — the feed narrows to matches; no matches = «Нічого не збігається» with the search-x glyph; the biggest-edit Panel hides while a query is typed.
- 412×430 / 360×340: the hero's rate drops a size below 240 px of container; everything else stacks.

What changed and why:

- `/_rt/gate.js` replaces the app's own `isLocal` check, so the mock stream follows the farm's one definition of "the gate".
- The three hand-assembled surfaces — the gradient hero card (`bg-gradient-to-b from-primary/15`, decoration), the filter block, the biggest-edit card — are `Panel`s; feed rows stay `.card` (the e2e counts them) at `--ms-r`.
- Micro-labels (status, humans/bots, total) carry the mono `--ms-label` pattern; `text-xs`/`base-content/50` are gone (`.text-muted`, `text-[0.78rem]` for row meta); inputs sit at `--ms-ctl`, pills are `rounded-full`.
- `animate-pulse` on the LED is a reduced-motion-safe keyframe in `head.html`; the rate is a `Scramble` slot until the first flush instead of a literal 0.
- Hooks: `data-live`, `data-scope`, `data-filters` on the root; `data-filter` on each toggle, `data-top` on the top-wiki badges, `data-big` on the biggest-edit Panel.
