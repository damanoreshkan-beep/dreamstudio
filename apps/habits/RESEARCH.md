# habits — a local-first streak tracker

No API, no backend: habits and daily marks live in IndexedDB (`/_rt/db.js`). Sub-screens route through
`S.screen` / `S.sheet` so system Back closes them.

## Design refresh 2026-09-04

State map of the main screen: **loading** (nothing until `$ready`) · **empty** (`[data-habits="0"]`, the
sprout, the one verb `#empty-add`) · **list** (`[data-habits=N]`: a Panel per habit — icon tile, name,
streak line, the round `[data-today]` check chip, the week strip) · **add sheet** (`#h-add`: name, icon
groove, colour groove, `#h-save`) · **detail sheet** (stats, the 13-week heatmap, `#d-del` → confirm).

What changed and why:

- The label trap (view.js:20 `text-[var(--ms-label)]` — a colour to Tailwind v4) → `text-[length:…]`; the
  stat captions (`text-xs text-muted`) now read the same label; the streak line and the no-store note are
  sentences → `text-sm text-muted` (the note lost `text-warning` — a fact, not an alarm).
- `rounded-2xl` on the field and every button (:173, :192, :222, :239, :264–266) → removed, the theme's
  `--radius-field` applies; the two grooves inside the sheet, the icon cells, the week chips and the icon
  tile inside a Panel → `--ms-r-in` (concentric).
- `transition` (a blanket set that includes box-shadow — the material) on the chips, cells and the check
  → `transition-transform` / `transition-colors`.
- The check on a filled chip: `color:#fff` → `var(--color-base-100)` — the page's own colour on a lit mark,
  the relation every `-content` pair in the theme has; no literal white in either theme.
- The eight-hex `COLORS` list stays and is now DOCUMENTED as the habit's MARK palette: user-chosen identity
  stored per habit, painted only on marks (tile, chips, cells), never on text or under text.
- `data-habits` on the list/empty root is the state hook for the driver.
