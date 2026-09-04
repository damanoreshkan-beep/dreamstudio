# fmradio — a HackRF FM head unit

## Design refresh 2026-09-04

State map of the tune screen (hooks: `data-connected` on the root, `data-freq` · `data-scanning` ·
`data-tuned` on the body, `data-player` on the island, `data-playing` on `#play`):

- **not connected** — the connect card (icon tile · title · body · `#connect` or the no-WebUSB alert).
- **connected, idle** — the band Slider + Scan, the station list (the tuned row is the deeper extrusion),
  the pinned Island: now-playing row (frequency · MHz label · name or "Tuning…" · stereo · genre badge ·
  RadioText · signal bars) over the kit's Transport (seek down · listen/mute · seek up · save · settings ·
  power). Under `keep=2` the power key demotes into the history-backed `tp-more` sheet at ≤340 px of row.
- **scanning** (`data-scanning`) — the Scan verb is `aria-busy` and disabled; the progress rail below it is
  the working state (no spinning glyph).
- **playing** — `#play[data-playing=true]`, the kit's pause glyph.
- **settings sheet** (`S.screen = "rf"`) — three kit Sliders (volume; LNA · dB and VGA · dB carry their
  reading in the caption because a gain is a unit the receiver is set to), the amp toggle, de-emphasis.
- **saved tab** — rows at `--ms-r`/`--ms-pad`; the empty state carries the shell's `data-empty`/`data-mascot`.

What changed and why:

- The hand-rolled play/pause (banned) and the seek keys are the kit's `Transport`; save/settings/disconnect
  ride it as `actions` with their `data-*` hooks intact (e2e: seek-up is now `#next`).
- Four DaisyUI `range`s are `Slider`s; the printed values beside them are gone (the gains keep theirs in the
  caption). `animate-spin` on Scan is gone — the rail is the progress.
- Colour as text is gone: the genre chip is a ghost badge in mono, not `text-secondary`; every
  `/30–/55` alpha is `.text-muted`; micro-labels are `text-[length:var(--ms-label)]` at `/70`.
- Radii and paddings are tokens (`--ms-r`, `--ms-pad`, `--ms-gap`); the Island keeps the kit's own geometry
  (the body's bottom padding grew to `9.5rem` to clear it); `transition` on rows names `colors`.
