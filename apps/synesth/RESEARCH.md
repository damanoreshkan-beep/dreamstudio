# synesth — research notes

The colour→music mapping is the core's (`/_rt/chroma.js`, unit-tested); the camera is the kit's `CamStage`
(`/_rt/camstage.js` — the priming screen, the stream and its retry, the wake lock, the flip and the torch,
all owned by the element; the app only samples the picture it is handed) and the synth is the runtime's.
This file carries the screen's state map and its design decisions.

## Design refresh 2026-09-04

State map of Live (a `.ms-stage` column): **priming** (`data-enabled=no`) — the black stage, CamStage's
prime over the whole screen (`primeFull`: the stage box is only the picture, the controls are below it) · **live, silent** (`data-enabled=yes data-playing=off`, the stage's own `data-live=1`) — the
note orbs (`data-readout`) on the camera picture, dimmed by the stage's own `picClassName="opacity-35"`,
the scale strip, the transport · **playing** (`data-playing=on`) — the orbs breathe, the chord is
the transport's subtitle · **denied / unavailable** — the prime's error variants, CamStage's. `data-enabled`
follows the stage's `ready` (the first frame), not the tap on Enable. The gate seeds the palette and shows
the orbs: the stage stands aside there (no `still`), so the seeded gradient is the backdrop.

Changed: the control bar was a hand-rolled bottom panel (`bg-base-100 border-t border-base-300` — a hairline
standing in for the island's material); it is the kit's `Island`, floating at the stage's foot with the
runtime's gap as its air. The stage root is `bg-base-100` (`base-200` was a pre-luminous no-op). The orbs
keep their computed colours and their pulse while playing — they ARE the camera's data and the sound, not a
placeholder. No labels on this screen; nothing loads, so no skeleton.
