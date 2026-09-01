# Themes as modules — the materials of mirage, a picker in the profile, and a mascot (spec, 2026-09-01)

Owner: "теми нагенеруй із апки міраж там є стилі · текстури також · теми мають бути окремим модулем · додай
в розділ Я налаштування тем такі ж самі як у міраж стилі … замість лисички вигадаємо свого персонажа, якого
не існує в природі, але із сімейства котячих". Prerequisite shipped: the theme split (core 1.1.0) — the
core's `runtime.css` is structure + a neutral default, and a product's `rt/theme.css` is a module the
overlay lays over it (core `docs/research/theme-split.md`).

## Contract

**A theme is a MODULE in the product's overlay** — a file family in `rt/`, because the overlay is copied
flat (the build and the gate's server skip directories, by design):

- `rt/theme-<id>.css` — `@import "./runtime.css";` first, then the material: the pair of marks, the two
  palettes (`signal` dark / `signal-light` light — a material has both MODES), the surface token values,
  the sprites it references, the portal chrome geometry, the enclosure, the type. Self-sufficient: linking
  it alone styles a page.
- `rt/<id>-<set>-<name>.webp` — its textures (`n-*` night, `d-*` day: lip, strand, scatter, corner, ring,
  arc, wisp, sun, moonsun…), imported by the core's `tools/art/ds-import.mjs --out=rt --prefix=<id>`.
- `rt/theme-<id>.webp` — the card thumbnail: the MASCOT rendered in that material (mirage's fox, replaced).
- `rt/themes.json` — the registry the runtime reads: `[{ id, name: { en, uk }, css, thumb }]`, first = default.
- `rt/theme.css` — `@import "./theme-luminous.css";` (the default material; the page's one `<link>`).
- `rt/tests/theme_test.js` iterates every `rt/theme-*.css`: the brand invariants that are universal (a rim
  on every surface, no 45° pair, base-100 === base-200, every hook's sprite exists, the poles text-safe in
  both modes, muted ink ≥ 4.5:1) run per theme; the luminous-only assertions (true black) stay on luminous.

**The picker is SYSTEMIC** (core 1.2.0): the profile's theme row grows a **Material** row when
`/_rt/themes.json` exists — a history-backed `Sheet` of style cards exactly like mirage's (thumbnail + name,
the current one raised), `S.material` a persistent atom, the choice applied by swapping the page's theme
`<link>` to `/_rt/theme-<id>.css` and setting `html[data-material]`. No themes.json → no row (the core
knows no product). The chosen theme's css and sprites are cached by the service worker on first use, so a
material chosen online holds offline.

**The materials** — from `apps/mirage/styles.js`, one theme each, its palette derived from the prompt's
own light and ground: `lum` (Glow — the luminous contract, today's brand), `smoke`, `chrome` (Mercury),
`paper`, `thread`, `ink`, `circuit`, `veil` (Aurora), `ferro` (Ferrofluid), `porcelain`, `sand`. Each keeps
the farm's laws: ink is the brand, colour = meaning, poles text-safe, a rim on every surface, muted a token.

**The mascot** — a feline that does not exist. Decision for the owner (a name and a look are taste, not
engineering); the proposal: a small, compact cat with oversized ears whose tips fray into soft luminous
tufts, a long tail ending in a lantern-like bulb, calm half-closed eyes; the body takes the material (woven
light, frozen smoke, cut paper…). Working name **Lumka** (uk «Лумка»). One prompt contract in
`docs/research/mascot.md` once chosen; the same subject through every style block, generated on the edge
pods with the raw generator (mirage's trap: `rerun.mjs` appends the luminous block to every job — a
style thumbnail must go through the raw generator or every material glows).

## Phases and acceptance

1. **Mechanism** — `rt/theme.css` becomes the import of `rt/theme-lum.css`; `rt/themes.json` with one
   entry; the core's picker (row + sheet + atom + link swap) and its e2e; gates green; the store looks
   identical to today. Ships as core 1.2.0 + a product bump.
2. **Mascot** — the contract chosen by the owner; 11 thumbnails (one per material) on the pods; the eye on
   the picker sheet in both modes.
3. **Materials** — 10 more `rt/theme-<id>.css` with both palettes, each passing the per-theme suite;
   picked one by one with the eye on the store (both modes, split shape).
4. **Textures** — per material the sprite set through `ds-import --prefix`, wired into its theme file;
   ~130 images, ~20 min on 4 pods; the eye per theme.
5. Docs: this spec's status, the README's theme section, a `themes.svg` diagram (docart reads
   `rt/themes.json`), the skill.

## Status

- **Phase 1 SHIPPED** (core 1.2.0–1.2.2, product b04fbcf+): the registry, the picker (mirage's grid —
  three to a row, a round picture, the chosen card ringed; titled "Тема"), the link swap, `S.material`,
  the picker e2e in a real browser (store). Five themes live: Сяйво (lum, the luminous default), Папір,
  Туш, Ртуть (palettes in both modes, no sprites yet — the hooks stay empty until phase 4) and Просто (the
  core's neutral look). Until the mascot exists a card shows the theme's SWATCH (base + accent for the
  current mode, `swatch` in themes.json).
- Phase 2 waits on the owner's pick (docs/research/mascot.md); phases 3–4 follow.

## Decision log

- Files in `rt/`, not `themes/<id>/`: the overlay is flat by design; a directory would need the build,
  the server and rtmap to learn a second convention for one feature.
- Link swap over 11 stylesheets loaded at once: one material's css + sprites per page load.
- The picker lives in the core because the profile is systemic — and it renders nothing without a
  product's registry, so the core still knows no product.
