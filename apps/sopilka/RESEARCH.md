# sopilka — a playable Ukrainian fipple flute

## Design refresh 2026-09-04

State map of the play screen (hooks on the root: `data-note` (the Latin note while blowing, else empty),
`data-blowing`, `data-octave`; the pipe is `data-pipe`, each hole `data-hole`, the toggle `data-over`):

- **silent** — the note reads "—"; the pipe with six open bores; Overblow off.
- **blowing** (`data-blowing`) — the note name in ink, its Latin name + octave under it; covered holes wear
  the bone pad; the pitch follows the fingering legato.
- **overblown** (`data-over=true`, `data-octave=6`) — the same fingering an octave up.
- **no audio** — one muted line under the toggle.

What changed and why:

- The note was painted `light-dark(#7a5c1f,#e8c874)` — colour as text; it is ink now. The pipe's fixed
  palette (wood gradient, bore, pad, labium window — an OBJECT's colours, deliberately not themed) moved out
  of view.js into `head.html` as `.so-pipe/.so-bore/.so-pad/.so-window`, with the reasoning next to the
  values; the comment no longer argues from the superseded neumorphic `--nm-light`.
- The micro-label is `text-[length:var(--ms-label)]` at `/70`; the column gap is `--ms-gap`; the toggle
  drops `rounded-2xl`; the pipe is `rounded-full` (a 6rem-wide pill was `rounded-[3rem]`). `sf-e3` stays: the
  pipe sits on the page and its extrusion is the page's, a rung of the ladder.
