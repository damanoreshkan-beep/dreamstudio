# flux — research note

Paint with motion: the camera's frame-to-frame difference (`/_rt/motion.js`) says where you moved; the app
splats additive light there and the trails fade. See the header comment in `view.js`.

## The camera: the kit's CamStage (2026-09-07)

flux owns no stream. `/_rt/camstage.js` owns the priming screen, `camera.start` and its retry, the wake lock
(hence `needs: ["camera", "wakeLock"]`) and the flip; flux gets the playing element through `onVideo` and
`{ ready, err }` through `onState`. Props: `show={true}` with
`picClassName="transition-opacity duration-300 opacity-20|opacity-0"` (the stage IS the ghost picture — the
toggle dims the picture itself, not the stage, which would dim flux's own paint with it),
`facing="environment"` (never mirrored), `fullscreen={false}` (a fullscreen resize would re-fit and therefore
WIPE the painting the app exists to save), `gestures={false}` (a tap on a canvas of light is not a focus
point), `primeFull` (the stage is the picture box, not the whole screen — the priming screen is pinned to
`.ms-stage` so Enable is never clipped and the state reads as it did before the migration), no `still` (in
the gate the stage stands aside and the seeded ribbon is the shot).

State map of the main screen (`[data-flux]` prime · live · error, `[data-energy]` 0–100 on the view root):

- `prime` — the black stage with CamStage's priming overlay (enable / settings) over the whole `.ms-stage`
  (`primeFull`), the control island included; no meter.
- `live` — the paint canvas edge to edge at `z-[2]` (above the stage's gesture layer), the stage's picture
  under it at 20 % when the ghost is on, the motion meter `[data-readout]` at the top of the frame, the
  control island floating above the dock: ghost · sound · clear · SAVE.
- `error` — the stage plus its priming overlay in the denied / unavailable state.
- The gate paints a seeded ribbon and a 42 % meter so the shot is populated.
- `[data-live]` belongs to CamStage (the stage), NOT to the meter — the meter is `[data-readout]`.

What changed and why:

- The bottom deck (`sf-raised sf-e2 px-4 pt-3 pb-3`, a bar welded to the stage's edge) → the kit's `Island`,
  pinned above the dock off the measured chrome tokens, so the picture runs under it edge to edge. Glass
  tone, not the over-media tone: the ground beneath is black paint in both themes, so the page's own
  surface reads against it and the primary (ink) button keeps its contrast in the light theme.
- The two toggles stay independent buttons (deliberately NOT a Segmented — they are not alternatives).
- `bg-black` on the stage and the white meter over it are kept and documented: the stage is media — additive
  light on a black ground, exported on the same black — and the meter is ink over a picture.
- Save is a `btn-sm rounded-full` primary so the island keeps one control height.
