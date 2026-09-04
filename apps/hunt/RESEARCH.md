
---

# 2026-08-10 — the big update: a living day

The owner's verdict on the shipped look: bad and unconsidered. Measured against the shot: the
whole run lives in ONE permanent night; the huntress is a dark mark on a dark forest (the
brick-era rule — the player is the densest mark — inverted); the crafted backdrop reads as three
near-black bands.

## The decision

**Time of day is driven by distance.** One cycle = 480 columns: dawn (col 0) → day → golden hour
→ dusk → night (~col 320, right where difficulty saturates at 300) → a second dawn for the runs
that earn it. The existing night palette is kept VERBATIM as the night keyframe — it was crafted,
its mistake was being the only weather.

## Architecture (all look, zero wasm changes)

- `packages/runtime/hunt.js` — `worldAt(dist)`: pure keyframe interpolation over the full WORLD
  key set + ambient numerics (stars, fireflies, motes, orb kind/pos/tones, player rim). Unit
  tests pin: key parity per keyframe, the depth-luma law (every band darker than the sky behind
  it, bands step evenly), continuity (no visible jump per 6-column quantum), cycle wrap.
- Painters (`engine.js` canvas + `tools/art/frame.mjs` preview) get `setWorld(colors, genKey)` —
  world palette entries are LIVE, bake caches keyed by generation; palette quantized to 6-column
  steps so rebakes are rare and steps invisible. Character palette stays static (figures keep
  their art); terrain/backdrop indices resolve through the current phase.
- `render.js`: sky/orb/stars/clouds per phase; deterministic particles (fireflies dusk+night,
  motes day) hashed from frame+camera — no Math.random, so the preview shows them; spear motion
  trail; player rim-light baked as a cell variant (phase-tinted, absent at noon).
- `view.js`: screen shake on HURT/DEATH/BRICK/STOMP via ctx translate around renderFrame.
- HUD: coins were counted by the sim and never shown — gold disc + count joins the score column.

## Iteration loop

`deno run -A tools/art/frame.mjs hunt --dist N --out x.png` (new `--dist` flag fakes only the
palette input on a state copy) — judge dawn/noon/gold/dusk/night locally through the shipping
renderFrame before any push.

## Design refresh 2026-09-04

**State map — the console (fit).** `GameConsole` owns the frame; inside the aperture there are exactly four
states: *loading* (`Pixels` over the canvas), *no engine* (one sentence, terminal), *playing* (the canvas plus
the HUD dataset), and *over* (the restart card raised over the aperture, DEATH_ARC frames after the flag).
One overlay screen off the menu: the records `Sheet` — three stat wells and a destructive reset behind
`confirm`.

**What changed.** Only chrome; the simulation and the deck are untouched.

- The game-over caption and its number, and both lines of every records well, carried the size token in
  Tailwind's *colour* slot — the browser dropped the declaration, so five micro-labels had been shipping at
  body size. All five now carry the `length:` hint.
- Muted ink was `opacity-80` / `opacity-70`. Opacity fades the glyph against whatever is behind it; on the
  restart card that is the console plate, not the page, so the intended ratio was never the one drawn.
  Both are the designed `text-base-content/70` step now.
- The records wells were `rounded-2xl p-3` — a fixed 1rem corner inside a `Sheet` whose own corner steps with
  the density ladder, which is the concentric-radius mistake. They take `--ms-r-in` and `--ms-pad`; the reset
  button takes `--ms-r`.
- The stat captions gained `font-mono` + `tracking-wider`: they were the only labels in the app not written
  in the farm's one micro-label recipe.
- "No engine" was rendered at micro-label size. It is the only thing on the screen when it appears, so it is
  body copy in `.text-muted`.

**Deliberately left.** `PALETTE` in `art.js` and the sky/terrain ramps in `engine.js` are MARKS — pixels the
wasm paints into a canvas, with no theme to be aware of and no text among them. They stay hex, as documented
there. The deck, the aperture and the plate belong to `GameConsole`, shared with `brick`; anything changed
here would silently restyle that app too.
