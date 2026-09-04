# synesth — research notes

The colour→music mapping is the core's (`/_rt/chroma.js`, unit-tested); the camera and the synth are the
runtime's capabilities. This file carries the screen's state map and its design decisions.

## Design refresh 2026-09-04

State map of Live (a `.ms-stage` column): **priming** (`data-enabled=no`) — the black stage, the camera
prime over it · **live, silent** (`data-enabled=yes data-playing=off`) — the note orbs on the dimmed camera
frame, the scale strip, the transport · **playing** (`data-playing=on`) — the orbs breathe, the chord is
the transport's subtitle · **denied / unavailable** — the prime's error variants. The gate seeds the palette
and shows the orbs.

Changed: the control bar was a hand-rolled bottom panel (`bg-base-100 border-t border-base-300` — a hairline
standing in for the island's material); it is the kit's `Island`, floating at the stage's foot with the
runtime's gap as its air. The stage root is `bg-base-100` (`base-200` was a pre-luminous no-op). The orbs
keep their computed colours and their pulse while playing — they ARE the camera's data and the sound, not a
placeholder. No labels on this screen; nothing loads, so no skeleton.
