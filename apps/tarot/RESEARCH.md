# tarot — research notes

The Rider-Waite-Smith deck, eleven spreads, the draw math in the core's `/_rt/tarot.js`, the deck and the
1909 scans in the product's `/_rt/tarotdeck.js` + `./assets/`. The Ritual is the participatory draw: colour,
tilt, compass and the moment distilled into a number and hashed into the seed.

## Design refresh 2026-09-04

State map of the main screen:

- **card of the day** — the spread rail (`Segmented`, `[data-spread]`), the title + one-line description, one large card with its meaning inline; `data-spread-id` / `data-cards` on the wrapper.
- **a spread** — the rail, the title row with synth · shuffle · «Ритуал», the whole layout fit to the screen (`FitReading`), each tile's position as a mono micro-label.
- **ritual** (`S.screen = ritual`) — the dark chamber: the live formula row, the charged ring and the number in the chosen colour, six colour keys, «Витягнути карти» as the ink verb; `data-charge` / `data-key-color` on the box.
- **card sheet** (`card`) and **synth sheet** (`synth`) — kit Sheets; the synth decodes through `Scramble`, offers «Спробувати ще» after 12 s.
- 412×430 / 360×340: the fit layout shrinks the tiles; the rail scrolls.

What changed and why:

- `ritualHow` (the four-sentence caption under working controls) is no longer rendered — hint text under a working control is banned; the key stays in both locales.
- The draw button was a chosen-colour background under `text-[#0a0a0b]` — a mark colour as a background under text. It is the farm's `btn-primary` now; the colour paints only marks (the ring, the number, the dot, the key).
- The Ritual is declared what it always was, a dark chamber in both themes (its particles composite with `lighter`, which only reads on black): the box is black with white ink, documented over the canvas; the pre-luminous purple key `[159,140,246]` is replaced by the farm's amber (the app's mark) and its cyan.
- Low-alpha ink is gone: `/30 /45 /50 /55` → `.text-muted` or the `--ms-label` mono pattern; `text-base-content/90` prose is plain ink; the Solo orientation word is the same `badge` the card sheet already used.
- Radii: `rounded-xl` card art → `--ms-r-in`; pills `rounded-full`; the ritual's paddings read `--ms-pad`.
- Deliberately left: the full-screen `<dialog class="modal">` Ritual (spirit copies this exact precedent for a top-layer card; a Sheet caps at 88dvh with a title row and cannot host a full-bleed canvas), and `h-[calc(100dvh-11.5rem)]` on the fit layout (unmeasured today; a chrome-token rewrite needs the eye on three shapes first).
