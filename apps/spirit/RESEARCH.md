# Дух карти — the card speaks (research + decisions, 2026-09-02)

Owner: "нову апку з нашими картами таро, але онови їх стиль під кожну тему, злегка тільки, карти будуть на
весь екран і словами кожна картка дає совіти (генеруються) дух мага який розсудливо виступає за кожну
карту, дух карти" — then: "оновлювати їх не потрібно … ми можемо зробити це програмно фільтрами і
нагенерити текст". So: the SAME 78 scans, re-inked per material by CSS; the advice is a model's, in the
voice of the card's spirit; one card fills the screen.

Every load-bearing claim names where it was read. UNVERIFIED items are at the end.

## The deck (reused, not copied)

- The 78 Rider-Waite-Smith cards + Waite's upright/reversed meanings were `apps/tarot/deck.js` (generated,
  static, 1909 art). Two apps now read them, so the data moved to the product's domain layer as
  `rt/tarotdeck.js` (`DECK`), the way `rt/signif.js` holds the astrology corpus — one deck, no drift.
  `apps/tarot/view.js` imports `/_rt/tarotdeck.js`; its `sw.js` precache follows from the import graph
  (`deno task sw`).
- The scans stay per app under `apps/<id>/assets/` (78 JPEGs, 7.7 MB): `deploy/build.mjs` copies an app's
  `assets/*` verbatim and the build has no cross-app path; git stores identical blobs once, so the second
  copy costs the checkout, not the history. `imgURL()` = `new URL("./assets/…", import.meta.url)`
  (`rules/stack.md`: never an absolute path).
- Draw math is systemic `/_rt/tarot.js` (`rt/tarot.js`: `draw(seed, size, deckLen)` = partial Fisher–Yates
  + one rng per card for orientation, unit-tested in `rt/tests/tarot_test.js`). `draw(seed, 78, 78)` is a
  full shuffled deck with an orientation each — the whole deck IS one draw, so every card is reachable by
  swiping and the first card is the card of the day (seed = `hashSeed(dateKey)`, `apps/tarot/view.js`).

## Per-theme re-inking — filters, never new pictures

- The material is on the root: `applyMaterial()` sets `html[data-material="<id>"]`
  (`packages/runtime/material.js`), applied at boot from `S.material` (`index.js:147-151`) and on every
  change. The registry (`rt/themes.json`) has TWELVE ids: lum paper ink mercury smoke thread circuit veil
  ferro porcelain sand plain.
- Every textured theme defines `--app-accent` (11 of 12 modules; `plain` inherits the core default) and a
  `--ds-grain` SVG noise tile drawn on `body` (10 of 12: not lum, not plain) — so two overlays read the
  theme by themselves: a `soft-light` wash of `color-mix(in oklch, var(--app-accent) N%, transparent)` and
  the grain at `multiply`. What stays per material is ONE `filter:` line (sepia/saturate/contrast), written
  in `apps/spirit/head.html` (app-owned head content survives a re-scaffold — the scaffold truth in
  the skill). The surface rim + bloom around the card come free from `sf-e3` (`--sf-*` tokens per theme).
- "Злегка": no filter moves saturation below 0.35 or contrast beyond ±18 %; the picture stays the picture.
  Judged on the eye per material where the shot can reach it (UNVERIFIED for the ones it cannot — see end).

## The words — mode `spirit` on the edge

- Transport is the systemic `POST /feed/ai` (`packages/runtime/ai-core.js` `reading(ns, mode)` → get/has/
  warm, fail-open, never caches `truncated`). New mode = one MODES entry in `microspec-edge/edge/ai-prompts.js`
  (`{cap, tokens, temp, cache, system}`; `ai.js` reads nothing else for a mode without `level`/`turns`/
  `check`). `modeOf()` falls back to `polish` for an unknown name — so the edge ships FIRST and the mode is
  read out of the running container before the app is pushed ([[reference-ai-module]]).
- The reading is GROUNDED the transit way ([[reference-grounded-readings]]): the block hands the model the
  card, its orientation and Waite's meaning for THAT orientation only (the other one is not sent — two
  meanings in one block is the "misread relation" trap); the signature covers card id + orientation +
  `CORPUS` version, built by the same function (`rt/ai-tarot.js` `groundCard()` → `{text, sig}`), so a
  caller cannot pair a stale key with a new block. Cache = 78 × 2 × locale, permanent (`ms:ai:tarot-s:<loc>`).
- Voice: first person, the card's spirit — a sober mage ("розсудливо"), simple human words, no mystic fog;
  3–4 sentences (sentence counts are the only length dial that works — [[reference-ai-length-control]]);
  the uk gender rule + «ти» + no predictions of health/death/money, copied from GROUND_RULES; no narration
  of the task; return ONLY the words. `tokens: 400` leaves headroom so the PROMPT bounds the length.
- Signed-in only, like every `/feed/ai` call: a 401 raises the runtime's authWall by itself
  (`packages/runtime/authwall.js`), `profile.account: "any"` shows the account card.
- Under the gate: a fixed `GATE_SPIRIT` text per locale (tarot's `GATE_SUMMARY` precedent) — no network.

## The screen

- One `fit` tool tab: `h-full min-h-0 flex flex-col` — a name row (shrink-0), the art in the `flex-1
  min-h-0` void (`object-contain`, the 350×600 scan never cropped; reversed = `rotate-180`, the tradition
  and tarot's own rendering), a three-button row (prev · shuffle · next — a gesture is never the only way,
  `docs/AUTHORING.md`). `usePanX` swipes the deck with wrap.
- Tapping the card opens the spirit: `S.screen === "spirit"` (history-backed), a transparent `dialog.modal`
  over the page with a night veil (`data-theme="signal"` inside, iching's Ceremony precedent, so the ink is
  white in both themes and axe composites the veil) — the small card at the top, the name, the words typed
  out (iching's Typewriter idiom; instant under the gate / reduced motion), provenance line, "next card".
  The act's body is `overflow-y-auto`: the one place long words may scroll (a dialog, not the fit view).
- Split shapes: at 360×340 the art row shrinks (`min-h-0`), the button row holds `--ms-ctl`; the dialog
  scrolls. Verified by the fit gate across the matrix in CI.

## Icon

Luminous contract (`docs/research/luminous-icons.md`): `mrfakename/Z-Image-Turbo` on the four pods from
inside `microspec-edge` (`genraw.mjs` via `docker exec -i -e JOBS=… microspec-edge deno run -A -`), subject
"the silhouette of a tall upright tarot card, a hooded spirit figure rising out of its top edge as a wisp
of light" + the fixed style block; `tools/art/icon-import.mjs spirit=<png> --out=/root/dreamstudio/apps`
writes `icon.webp` + the `icon.svg` wrapper; scaffold keeps an owned icon.svg.

## Decision log

- Name `spirit` / «Дух карти» — the app is the voice, not the spread; tarot keeps the spreads.
- No text input, no question: closed by design (no injection surface, every answer cacheable forever).
- The other orientation's meaning is NOT sent to the model (contrast reads as presence — measured on
  transit's ruler/house confusion).
- The deck grid (owner, same day: "додай сітку всіх 78 карт") is a kit Sheet in CANONICAL order (majors,
  then suits — for finding a card), each tile in this shuffle's orientation, the current card ringed by an
  inline `box-shadow` on `--app-accent` (a `ring-[var(--app-accent)]` utility is dropped by the build's
  scanner); a tap jumps to that card's place in the shuffled order. 78 lazy thumbnails; seen on the eye
  (`--tap '[data-deck]'`) in both themes: four columns at 384px, names beneath.

## Shipped and seen (2026-09-02, product 874da30, verify + deploy green)

The eye reaches a material by a TAP CHAIN (`shot.mjs` runs comma-separated taps 600 ms apart):
`bash vps/eye.sh spirit --tap '[data-tab="me"],[data-material-id="paper"],[data-tab="card"]'`. Read on the
live build: lum dark + paper mode, the veil open, split-sm 360×340 (the card shrinks, every control and the
dock survive), Папір (warm sepia + grain) and Туш on paper (near-monochrome, the red orientation mark) —
each reads as the same picture under that theme's light, never a new picture.

## UNVERIFIED

- The other nine materials' filter lines are set by the same rule but were not shot; judge them on the
  phone when the theme is switched.
