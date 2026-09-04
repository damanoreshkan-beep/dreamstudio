# store — the farm's front door

The launcher in the App Store's own structure: Today (a hero + a two-column stack), Fresh arrivals (a pager
of three-card slides), then every category with all its apps; a search filters the one page in place and the
app page is the kit's Sheet. The Today rubric is automatic — an app born in the last 48 h (`added`) leads
the stack, `spec.featured` follows minus the newborns — and is NOT touched by the refresh below.

## Design refresh 2026-09-04

State map of the main screen (one page, one scroll):

- **today** (`data-store-mode="today"`, `data-store-featured`, `data-store-newborn`): the head row (date
  line + "Today", the search glyph `#search-btn` at its right) · the featured grid (the hero wide, the rest
  tall cards; a newborn carries an amber dot in its eyebrow) · Fresh arrivals (pager, `data-fresh-page`
  counter) · a section per category, rows with a quiet Open pill.
- **search unfolded** (`data-store-search="open"`, `[data-search-open]`): the field takes the head row's
  place — glyph · `#store-filter` focused · `#store-status` mono count · `#search-close`. The open state is
  the runtime's `S.searchOpen`, so system Back folds it (and folding empties the query). Folded, a hidden
  twin `#store-filter` keeps a typed query working and unfolds the field.
- **search** (`data-store-mode="search"`, `data-store-found`): the matching rows, or the no-results empty
  state, under the unfolded field.
- **page** (`data-store-page=<id>`): the app page in the large Sheet — tile + name + the ONE filled Open
  (`btn-primary`) + a ghost Install, the fact strip in a well, captures, description, What's new, Info.
- **row badges**: NEW = amber dot + mono word, UPDATED = cyan dot + mono word (`tag()`); featured = a
  sparkles glyph in the accent.

What changed and why (the audit: zero `--ms-label`, seven hand-picked sizes down to 0.52rem, amber as text 13×):

- The permanent full-width search input over the content (view.js:237–240) is gone — search is folded behind
  an icon in the head row and unfolds in place, the shape rules/invariants.md gives a list tab's header
  search (a tool tab cannot use the runtime's `#search-btn`, so the store draws the same row itself); the
  e2e now types into `#store-filter` and checks the fold.
- ONE label constant `LABEL` = `font-mono text-[length:var(--ms-label)] uppercase tracking-wider
  text-base-content/70` replaces `text-[0.52rem]` (:212, :261), `[0.58rem]` (:134, :189), `[0.62rem]`
  (:294) and the `text-xs` counts (:234, :273, :274, :156). 0.52rem was below the ladder's own floor.
- Amber/cyan are MARKS, never text: `text-secondary` (:112 pill, :153 more, :189/:212/:262 eyebrows, :223
  sparkles) → ink + a dot/glyph in `--app-accent`; `badge-secondary`/`badge-warning` (:106) → mono word with
  a dot; `btn-secondary` Open (:125) → `btn-primary` (ink is the brand); `text-warning` (:138, :156, :304) →
  ink/muted with the USB glyph or a cyan dot as the mark; head.html's life light reads `--app-accent`.
- Surfaces: the fact strip's two hairlines (`border-y border-base-300`) → an `sf-inset` well at
  `--ms-r-in`; capture thumbnails' `ring-1 ring-base-300` → `sf-raised sf-e2` (the lit rim); the device note
  → an inset well. Radii: `rounded-2xl` (search, note) → `--ms-r`; `rounded-[1.1rem]`/`[0.6rem]`/`[0.55rem]`
  inside padded cards → `--ms-r-in` (concentric); the counter's `rounded-md` → a pill.
- Muted: the search glyph `text-base-content/50` → `.text-muted`.
- Kept: the row dividers (`[&>div+div]:border-t`) and the Info list's `border-b` — list separators between
  rows, not a border around a card; `text-base-content/80–85` prose (≥/70 is in the safe band); the fresh
  card's `calc(var(--ms-r)*.8)` (derived from the token, a deliberately smaller card); no skeleton — the
  catalogue is a static import, the only async is the NEW-badge lookup and nothing waits on it.
