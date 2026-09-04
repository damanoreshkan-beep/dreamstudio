# globe — spin the Earth, pick a country

## Design refresh 2026-09-04

State map of the earth tab (hooks on the root: `data-sel` = the selected ccn3 or empty, `data-matches`;
the facts Panel carries `data-facts`):

- **idle** — the globe spins; the search field under it. No caption: the globe is its own invitation.
- **searching** (`data-matches` > 0) — up to six match rows, each led by the ISO alpha-2 code in mono.
- **selected** (`data-sel`) — the globe stops on the country; the facts `Panel`: the code in an `sf-inset`
  well, the name and region, then the five fact rows (capital · population · area · languages · currency).
- ISS and quakes tabs are unchanged (their palettes are marks).

What changed and why:

- The 496 regional-indicator flag emoji never render: `iso()` decodes each pair back to its ISO 3166-1
  alpha-2 code (the data file is untouched) and sets it in mono — in the match rows and in the facts head.
- The hint under the globe ("Spin the globe or tap a country") is gone — hint text under a working control;
  the e2e now asserts the search field instead of the caption.
- The flat `card bg-base-100 border border-base-300 rounded-2xl` is the kit's `Panel`; the fact rows'
  labels are `text-[length:var(--ms-label)]` at `/70`, their icons `.text-muted`, the dividers `divide-y`.
- The search field drops `input-bordered`/`rounded-2xl` for the theme's `.input` at `--ms-ctl`/`--ms-r`;
  the match rows drop `rounded-2xl`; the column gap is `--ms-gap`.
