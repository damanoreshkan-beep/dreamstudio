# flux — research note

Paint with motion: the camera's frame-to-frame difference (`/_rt/motion.js`) says where you moved; the app
splats additive light there and the trails fade. See the header comment in `view.js`.

## Design refresh 2026-09-04

State map of the main screen (`[data-flux]` prime · live · error, `[data-energy]` 0–100 on the view root):

- `prime` — the black stage with the CameraPrime overlay (enable / settings); no meter.
- `live` — the paint canvas edge to edge, the ghost video under it at 20 % when on, the motion meter at
  the top of the frame, the control island floating above the dock: ghost · sound · clear · SAVE.
- `error` — the stage plus CameraPrime in its denied / unavailable state.
- The gate paints a seeded ribbon and a 42 % meter so the shot is populated.

What changed and why:

- The bottom deck (`sf-raised sf-e2 px-4 pt-3 pb-3`, a bar welded to the stage's edge) → the kit's `Island`,
  pinned above the dock off the measured chrome tokens, so the picture runs under it edge to edge. Glass
  tone, not the over-media tone: the ground beneath is black paint in both themes, so the page's own
  surface reads against it and the primary (ink) button keeps its contrast in the light theme.
- The two toggles stay independent buttons (deliberately NOT a Segmented — they are not alternatives).
- `bg-black` on the stage and the white meter over it are kept and documented: the stage is media — additive
  light on a black ground, exported on the same black — and the meter is ink over a picture.
- Save is a `btn-sm rounded-full` primary so the island keeps one control height.
