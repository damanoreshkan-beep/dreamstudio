# iching — the ceremony rebuild (2026-08-11)

The ask→cast→answer flow, rebuilt around one full-screen ceremony. Decisions logged here are CLOSED.

## Revision 2 — the film (owner, same day)

The first rebuild kept the old island (method strip + odds row + summary) and attached the ceremony to
it. **Rejected wholesale**: "я це бачу як фільм магічний, а ти мені старе залишив технічний ui". The UI
is now built from zero as acts over the always-visible WebGPU current:

- **Act I** — the field: the cast luminous on a night pane at centre (tap = replay its reading), ONE
  control at the foot — the question slot with the golden caret blinking in it. No method row, no odds
  row on the set.
- **Act II** — the veil (transparent dialog box + `bg-[#0b0f14]/90` ground): the question written on a
  **golden writing line** (the signature element; the same gold caret is the through-line of the film).
  The method strip + exact odds sit quietly at the foot of this act.
- **Act III** — the shuffle at `/70` veil so the field visibly dances: `$seedLines` feeds the flickering
  values straight into the shader seed — **the slits of light in the current ARE the shuffling lines**.
  The odds are spoken as a one-line incantation under the figure.
- **Act IV/V** — the name in huge light type, then the answer types itself **centered, like film
  subtitles**. Gold is reserved for movement marks, the caret/writing line, and the recast dot — never
  body text.
- Chrome geometry comes ONLY from `.ms-stage` (the unit gate rejected the first hand-written
  `var(--dock-h)`); dark DaisyUI tokens are re-scoped inside the ceremony via `data-theme="signal"` so
  the kit strip survives the light theme.

## What was actually broken (measured, not guessed)

- `/feed/ai` mode `summarize` **works** (probed with the allowlisted Origin; Gemini answers in uk).
  The client was the problem: under the gate / offline the read sheet had **no fixture** (tarot has
  `GATE_SUMMARY`; iching held a skeleton forever), the reading was never **persisted** (cache-only —
  a cleared localStorage forgets an answer the journal still lists), and the question had **no
  relationship** to the journal (same question → new cast → contradictory answer).

## The flow (owner's spec, 2026-08-11)

1. Tap the question slot → a **full-screen ceremony** (`S.screen === "ask"`, history-backed, Back closes).
2. Submit → journal lookup by normalized question (`trim → collapse spaces → lowercase`, stored as `qk`).
   - **Known question → the SAME entry replays**: same lines, same stored text. The Book does not answer
     one question twice.
   - New question (or empty) → a fresh cast, saved immediately.
3. **Casting animation** (~2.5s): six lines flicker randomly (90ms), then lock **bottom-first**
   (1000 + i·280ms) with a glue effect — the two yin halves slide together into a yang bar (animated SVG
   `x`/`width`, `transition-[x,width]`; a full bar crossfades over the seam). One `navigator.vibrate(6)`
   per lock — a state event, not a tap, so it does not collide with the systemic haptic.
4. **Answer**: hexagram header fades in, the reading **types out** letter by letter (~20ms/char, capped)
   with an sr-only full copy for screen readers. The text is written into the journal entry (`tx[locale]`)
   the moment it lands, so a repeat — even offline — replays it verbatim.
5. **Recast once per day**: the button shows only when `entry.day !== today` (local `YYYY-MM-DD`).
   Recast overwrites the entry in place (new lines, new day, `tx` cleared) — one entry per question.

## Determinism contract

`instant()` = `gate || prefers-reduced-motion` (same idiom as `/_rt/skeleton.js`): no flicker, no
typewriter, no motion entry — final state immediately. Fixed `GATE_READING` (uk+en) mirrors tarot's
`GATE_SUMMARY`. `GATE_ROWS` is the ONE fixture: journal list, question lookup, and the seeded `$last`
all read it, and `g1` carries an old `day` so the e2e can see the recast button appear for a replayed
question and NOT for a fresh one (under the gate every answer text is identical, so presence of
`[data-recast]`/`[data-asked]` is what proves the dedupe branch ran).

## Closed decisions

- **Typewriter stays app-local.** First consumer; promote to `/_rt/skeleton.js` only when a second app
  wants it. (A runtime edit = whole-farm verify + SW manifest churn for every importer.)
- **Ceremony is a full-screen `class="modal"` dialog** (tarot's Ritual precedent) — not a `Sheet`
  (`modal-bottom` is the banned hand-roll; full-screen is not that shape). Opaque `#0b0f14`, fixed dark
  in both themes like the island, because it floats over the always-dark WebGPU field.
- **The AI signature stays `method|lines|question`** — the runtime cache dedupes transport; the journal
  (`tx` per locale) is the durable copy the replay reads first.
- **No quick-cast button on the island.** All casting goes through the ceremony; the question slot is the
  single entry point (a faux-input button, like a search bar that opens a search screen).

## Design refresh 2026-09-04

The film stays a film; what changed is that its surfaces are now the THEME's, not `#0b0f14` + `text-white`
literals, so the same acts read on the light field too. State map of the cast screen (`[data-ic-state]`
empty · cast · shuffle on the `.ms-stage` root; `[data-phase]` ask · cast · answer inside the ceremony):

- empty — the current, one pane ("the book is still silent"), the question slot with the golden caret.
- cast — the pane with the hexagram, the name, pinyin, number · trigrams · change; tap = replay.
- shuffle — the field's seed follows the flickering lines (`$seedLines`), the pane shows them.
- overlay ask / ask — the veil, ASK THE BOOK, the question on the writing line, CAST, the method strip +
  the odds at the foot.
- overlay ask / cast — the veil thinned (`[data-thin]`), the shuffle, the incantation chip.
- overlay ask / answer — hexagram header, the question, the replay date when it is a replay, the answer
  typing itself, provenance, RECAST (once a day, old entries only) + CLOSE.
- journal — raised rows (question first), the entry sheet; empty state.

What changed and why:

- `apps/iching/head.html` (inlined by `scaffold --force`): `.ic-pane` (the night pane = base-100 at 85 %
  with the 2 px blur over the current — foreign content, so the blur is the sanctioned kind), `.ic-slot`
  (the question pill with the material's rim), `.ic-veil` / `[data-thin]` (90 % / 70 % of base-100),
  `.ic-chip`, `.ic-caret` (a CSS blink, not `animate-pulse`), `.ic-line`. In the dark theme these are
  black-on-black exactly as before; in the light theme they are paper-on-paper with ink.
- The 8 `bg-[#0b0f14]` and 39 `text-white*` literals are gone; ink is `text-base-content` (with the same
  alphas), muted copy is `.text-muted`; the `data-theme="signal"` re-scope inside the ceremony is gone with
  them (its whole purpose was to force dark tokens under white text).
- The ceremony's `<div class="modal-box">` now carries `style="background:transparent"`: `.modal-box`
  paints an opaque base-100 unlayered, so the old `bg-transparent` utility never won and the "transparent
  dialog" of Revision 2 was in fact opaque. The veil is now genuinely over the current.
- The ceremony's word-buttons (`rounded-full border border-white/30`) → `btn btn-ghost rounded-full`
  mono pills; CLOSE is `btn-primary` (ink on ground), never `bg-white text-[#0b0f14]`.
- Radii `rounded-[2rem]` / `rounded-2xl` / `rounded-xl` → `--ms-r` (the pane's padding is `--ms-pad`
  multiples); the journal rows read `--ms-pad` / `--ms-gap`.
- Left as is, with the reason: the full-screen `<dialog class="modal">` ceremony is NOT a bottom sheet
  (tarot's Ritual precedent; preflight allows it) — a `Sheet` caps at 88dvh and would cut the film into a
  drawer. `[&_*]:!shadow-none` inside it stays: the kit strip on a veil must not extrude.
