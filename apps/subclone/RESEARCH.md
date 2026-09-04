# subclone — research notes

The domain research lives in the core: `docs/research/subghz-ook-clone.md` (OOK capture/replay over a HackRF
on WebUSB, rolling-code detection). This file carries the screen's state map and its design decisions.

## Design refresh 2026-09-04

State map of Clone: **not connected** (`[data-connected=no]`) — the plate, the title, the body, the connect
verb (or the no-WebUSB alert) · **connected, idle** (`data-rec=idle`) — the frequency strip, the saved list or
its empty state, the record island · **recording** (`data-rec=recording`) — the record key in error ink,
pulsing · **captured** — the lifted Panel with the name field + save / discard above the list ·
**empty capture** — the well line · **transmitting** (`data-tx=on`) — the row's key filled and pulsing ·
**settings** — the Sheet (`#rfsheet`) with two Sliders.

Changed: both `<input type="range">` are the kit's `Slider` (value as a mono count in the caption — the kit
prints none); the caption under the repeats slider was hint text on a working control and is gone (the key
stays in both locales); the captured card and every saved row are the kit's `Panel` (no hand-rolled
`sf-raised rounded-2xl px-4` surfaces); radii are the theme's (`--ms-r` on wells, the field radius on inputs
and buttons — eight `rounded-2xl/3xl/xl` gone); the record key sizes off `--ms-ctl` and names its transition
(the material is a box-shadow pair); muted ink is `.text-muted` (five `/50`–`/55` alphas failed paper); mono
meta lines are the `--ms-label` length token, not `0.7rem`/`text-xs`. `animate-pulse` on the recording key and
the sending glyph stays — a live state, honoured by reduced-motion in the runtime.
