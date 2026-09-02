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

- **Phase 1 SHIPPED** (core 1.2.0–1.2.3, product d4facfe): the registry, the picker (mirage's grid —
  three to a row, a round picture, the chosen card ringed; titled "Тема"), the link swap, `S.material`,
  the picker e2e in a real browser (store). Five themes live: Сяйво (lum, the luminous default), Папір,
  Туш, Ртуть (palettes in both modes, no sprites yet — the hooks stay empty until phase 4) and Просто (the
  core's neutral look). Until the mascot exists a card shows the theme's SWATCH (base + accent for the
  current mode, `swatch` in themes.json). Verified with the eye on the live store in both modes and with
  Папір chosen (the whole screen re-inks, the row reads the chosen name).
- Two traps from 1.2.3, for anyone touching the picker: the chosen card's ring is a `runtime.css` RULE on
  `[data-materials] [aria-pressed=true]` — a Tailwind `ring-[var(--app-accent)]` utility is dropped by the
  build's class scanner and never reaches dist (green gates, no ring on the phone); and the swatch's mode
  reads `html[data-theme]`, because a `?theme=` override (the gate, the eye) never writes the theme atom.
- **Phase 2 SHIPPED, then re-decided** (2026-09-01): the picker's pictures are mirage's curled FOX (the
  owner's pick over the cat after seeing both: "зроби замість кота все таки ту лисичку") — `rt/theme-<id>.webp`
  cut from mirage's 1024 masters (`docs/research/mascot-tools/fox-thumbs.mjs`), a clay fox for Просто;
  `thumb` in themes.json, the registry test proves each named thumb exists.
- **Phase 4 SHIPPED for Папір · Туш · Ртуть** (product d6a26c6, 2026-09-01; owner: "тема папір зовсім не
  передає атмосферу папіру. немає текстур"): five sprites per mode per theme (lip, garland, corner, empty-state
  scatter, mode art — a ring at night, a sun by day), generated on the pods with mirage's material blocks
  (`mascot-tools/jobs2.mjs` shape), imported with exact alpha as `rt/ds-<theme>-<n|d>-<hook>.webp`
  (`ds-import --prefix=<theme> --out=rt`), every offset MEASURED off the alpha (`mascot-tools/measure.mjs`:
  lip = the band's peak row, garland = the blank lower part × the half-width tile, scatter = the core on the
  glyph). The shared geometry left theme-lum for **`rt/decor.css`** (rules on tokens; a theme imports it after
  runtime.css and sets sprites + offsets + opacities per mode); each page also carries its material's GRAIN
  as an SVG fractal-noise tile the browser draws (paper fibres, rice-paper mottle, brushed steel) — no file.
  The theme suite proves every named hook carries its offsets and both mode arts exist. Weight: ~300 KB of
  sprites per theme, loaded only when that theme is chosen (the picker's thumbs are 5–22 KB each).
  Просто stays untextured by definition. Trap: a bright chrome on pure white has no alpha to extract — the
  day mercury corner is a gunmetal take.
- **The theme WIDGET** (core 1.2.5, owner: "поєднай картки темна тема та тема в один дійсно якісний віджет,
  одразу з мікрокартинками та сонцем та місяцем"): one profile card — a day/night radio whose faces are the
  theme's `--ds-art-day` / `--ds-art-night` (both pictures whatever mode the page is in; glyphs when a theme
  sets none) and a strip of round micro-pictures, the chosen one ringed, a tap applying at once. The sheet
  is gone; the store e2e drives the strip and the radio.
- **Phase 3 SHIPPED** (2026-09-02): all seven remaining materials — Дим, Нитка, Схема, Аврора, Ферофлюїд,
  Порцеляна, Пісок — full modules with both palettes (one contrast red across all 84 checks: ferro's light
  accent), sprites via the one 77-job pod batch (`mascot-tools/jobs3.mjs`; stragglers rerun by name — two
  never landed and their hooks stay unset: smoke's night corner, ferro's day sun), offsets measured, SVG
  grains per material, the smoke fox in each theme's light as the thumb. TWELVE themes in the picker.
- **The mascot is THE BLACK SMOKE FOX** (owner 2026-09-02, mascot.md): one character, alpha-imported once
  as `rt/ds-n-mascot.webp`; her tokens (`--ds-mascot`, `--ds-mascot-s`) live in `rt/decor.css` (the one
  named-file exception there) and the core's `[data-mascot]` (1.2.10) draws her in every empty state.
- **THE HEADER CARRIES NO TEXTURE** (owner 2026-09-02: "прибери текстури з хедеру системно, вони
  заважають"): the woven-lip hook is REMOVED from decor.css, every theme's `--ds-lip*` tokens and all 21
  lip sprites (incl. lum's retired ds-n-arc) are gone; the suite bans the token so it cannot creep back.
  The header's only light is the runtime hairline (`--lm-lip` / `--lm-lip-glow`) — a line, not a texture.

## Decision log

- Files in `rt/`, not `themes/<id>/`: the overlay is flat by design; a directory would need the build,
  the server and rtmap to learn a second convention for one feature.
- Link swap over 11 stylesheets loaded at once: one material's css + sprites per page load.
- The picker lives in the core because the profile is systemic — and it renders nothing without a
  product's registry, so the core still knows no product.
