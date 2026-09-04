# os — the phone, read through the shell bridge

Four tool tabs over the Android shell's catalogue: **home** (the device panel: one measured fact per line,
and the four places worth going — station · ports · permissions · console, one level down), **radar** (BLE,
Wi-Fi and cells on one circle, LAN hosts below), **files** (the SAF explorer), **alarms** (the capability the
web cannot have). The gate mocks the bridge from the same catalogue, so every screen renders populated.

## Design refresh 2026-09-04

State map of the main screen (`[data-home] data-screen=…`):

- `data-screen="home"` — the device Panel (`[data-state]`: device · battery · network · radio · storage ·
  station · alarms · bridge, each a `Field` with a mono micro-label) and the five tiles (`[data-tiles]`);
  `data-bridge-on="0"` in a browser (the bridge line reads "off" in `text-error`, tiles still open).
  An update Panel (`[data-update]`) leads the column when the bridge is behind the catalogue.
- `data-screen="perms"` — the launcher grid, one tile per permission with its state dot (`[data-perm]
  [data-state]`).
- `data-screen="console"` — the bridge Panel (`[data-bridge]`, Run all), a Panel per capability with a
  runnable row each, the report Panel under them.
- `data-screen="station"` — the server's Fields and the power button.
- `data-screen="ports"` — the swept ports with their evidence lines, the scope Panel when the sweep is done.
- Alarms tab (`[data-alarms] data-blocked data-mins`): the Segmented interval strip + Set, the pending list.
- Files tab: roots → a folder → a preview (`[data-fs-preview]`), each level history-backed.

What changed and why:

- **Micro-labels take the token.** `text-[11px]` ×13 and `text-xs` ×16 (Field names, tallies, address
  lines, evidence lines, tile captions) → `font-mono text-[length:var(--ms-label)] tracking-wider`
  (`LABEL`) and, for the tiles' sentence-case words, `CAPTION` at the same size — they step with the
  density ladder now instead of holding 11 px on a 340 px window.
- **Muted is `.text-muted`** (was `text-base-content/45–55` on chevrons, units, sub-lines).
- **Kit, not copies.** The bridge box, the alarm-blocked box and the update box were `rounded-[var(--ms-r)]
  sf-raised sf-e2 p-4` by hand → `Panel` (their `data-*` hooks ride `...rest`). The alarm interval
  (four buttons with `aria-pressed` by hand) → `Segmented` (`attr="data-min"`, the e2e's selector).
- **One page scroll**: the text preview's `max-h-[60vh] overflow-y-auto` is gone — a long file is a long
  page; it sits in a `sf-inset` well (was `bg-base-200`, invisible on a page where base-200 is base-100).
- Full-width action buttons are pills (`rounded-full`); column gaps ride `--ms-gap`; error lines are
  `text-sm text-error`, not `text-xs`.

Deliberately kept: the radar's four kind counters (a multi-select FILTER with `aria-pressed`, not a
one-of-N strip — Segmented would make them exclusive); the `<pre>` file text at `text-xs` (content, not a
label); the `opacity-45` on a tile whose capability the bridge does not carry (a disabled control's state);
no head.html — the app needs no CSS of its own.
