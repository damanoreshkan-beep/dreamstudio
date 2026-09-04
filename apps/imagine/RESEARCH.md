# imagine — research notes

Text → image (Твори), instruction editing (Онови) and image → text (Опиши) over the edge's keyless HF
cascades. The wire protocol and the photo intake are the core's (`/_rt/imagejob.js`, `/_rt/intake.js`);
mirage is the sibling built on the same two modules and the precedent this app's screens copy.

## Design refresh 2026-09-04

State map of the main screen (Твори; Онови and Опиши carry the same shape with a source phase in front):

- **idle** — stage: the dust at rest on black · island: quality + aspect strips, the empty field, «Згенерувати» disabled.
- **input given** — same, the verb enabled; the dice writes a prompt (`aria-busy` while the model writes it), history opens a Sheet.
- **working** — stage: the living dust with the worker's own progress; over it the chip «Малюю · m:ss · step/steps» (`[data-working]`); island: the verb becomes «Скасувати» (`[data-cancel]`).
- **done** — stage: the snap scroller of up to four slides (`[data-slide]`), the size chip top-right (`[data-res]`), the dots (the last one breathes while the race still delivers); island: «Ще» + the save circle (`[data-save]`).
- **error** — the dust at rest, the error line under the field (`[data-error]`, `role=alert`), the verb says «Ще».
- overlays: the lightbox (`S.screen = view`), the history Sheet (`hist`); Онови/Опиші add the chooser island (`empty`), the primed viewfinder (`camera`) and Опиші's read Panel (`[data-read]`).
- 412×430 / 360×340: the two strips demote to glyphs (every item has an icon), the composer keeps one field row; the pictures are contained above the MEASURED island height.

What changed and why:

- The two hand-rolled `role=tablist` strips (`seg()` / `asp()`) are the kit's `Segmented` (`data-q`, `data-aspect`); the e2e reads `aria-pressed`, the kit's state, instead of `aria-selected`.
- The composer is an `Island`; the field is the inset well + tool row mirage uses; every button is a verb, save/share-class actions are circles with their word as the accessible name.
- The race is `startJob` / `follow` / `cancelJob` from `/_rt/imagejob.js` (the 135 × 1.5 s budget, `busy` and `timeout` answered as `eBusy` / `eTimeout`); Онови's and Опиші's own chooser + camera + `toEditableDataURL` are the kit's `Chooser`, `Camera`, `toDataURL` (`{ data, w, h }` — the string is `.data`); the three private `mockArt` copies are the kit's.
- Colour: no literal in the views; the two scrims, the chip and the working light live in `head.html` and are documented as OVER MEDIA (a picture, the dust, a camera frame); the pre-luminous `text-secondary` on the dice is gone.
- Sizes: `rounded-2xl/3xl` → `--ms-r` / `--ms-r-in`; the size chip and the tags carry `text-[length:var(--ms-label)]`; `text-white/45` dots are `opacity-45` marks on a white current colour, over media.
- No `animate-pulse`: the dice is `aria-busy`, the "one more slide" dot breathes through a reduced-motion-safe keyframe (rukh's typographic pulse), the edit's progress is an accent filament whose length is the real percentage.
- `data-phase` / `data-aspect-fit` / `data-quality` on the stage root are the hooks the driver reads.
