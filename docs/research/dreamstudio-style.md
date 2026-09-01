# DreamStudio style — the portal, the two sides, the tilt engine (research, 2026-08-31)

> **STATUS (same evening): the tilt engine is REMOVED.** The owner found the motion nauseating ("укачує"),
> and its moving full-width lip was horizontal overflow on every app that no rest-state gate could see
> (headless Chromium has no deviceorientation). Everything else here — the portal, the two sides, the
> sprites, the lit chrome — SHIPPED and stands; the decor is simply static now, and the verify gate reads
> chrome pseudo-element transforms so shifted decor can never return. Keep the sensor sections below as
> the record of why it was tried and why it went.

The owner's artistic logic, stated once so every later pass builds on it and not beside it:

> **The screen is a PORTAL.** The chrome (header, dock) is the portal's *rim* — it catches light; it never
> drops a flat black shadow. Depth is told with LIGHT, not with blur or grey smears. And the portal has two
> sides: **NIGHT** (the dark theme — the moon's side: black depth, woven light filaments, fireflies,
> amber + cyan) and **DAY** (the paper theme — the sun's side: gilded golden threads and rays on warm
> paper). Themes are identities, not palettes; the theme toggle is literally sun and moon.

Everything sensor-driven below is "a game engine, purely for design": real device tilt moves the LIGHT on
the rim — the way a lacquered box turns under a lamp — not layers sliding (parallax is explicitly *not*
the effect; the owner said so).

## The tilt engine — the math (verified sources)

**Input.** `deviceorientation`: `beta` = rotation about X (front-back, −180…180), `gamma` = rotation about
Y (left-right, −90…90) ([MDN gamma](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/gamma),
[MDN device orientation events](https://developer.mozilla.org/en-US/docs/Web/API/Device_orientation_events)).
`alpha` (compass) is NOT used — the farm already learned a heading must never come off alpha
(`[[reference_compass_gimbal_look]]`).

**Normalisation.** The rest pose of a phone in a hand is ~β=40°, not 0 — normalise against a slowly-adapted
rest pose, not against flat-on-table:
`tx = clamp((γ − γ₀) / 30, −1, 1)`, `ty = clamp((β − β₀) / 30, −1, 1)`, where `(β₀, γ₀)` is an EMA of the
input with a very low constant (τ ≈ 8 s) — the "where the hand settled" tracker. 30° of tilt = full travel.

**Smoothing: the 1€ filter** (Casiez, Roussel, Vogel — CHI 2012,
[paper](https://direction.bordeaux.inria.fr/~roussel/publications/2012-CHI-one-euro-filter.pdf),
[reference impl](https://github.com/jaantollander/OneEuroFilter)). An adaptive low-pass: slow motion →
low cutoff (kills jitter), fast motion → high cutoff (kills lag).

    α(fc, Δt) = 1 / (1 + 1/(2π·fc·Δt))          — smoothing factor of one exponential stage
    x̂ᵢ  = α·xᵢ + (1−α)·x̂ᵢ₋₁                     — exponential smoothing
    dxᵢ = (xᵢ − x̂ᵢ₋₁)/Δt, smoothed with fc = d_cutoff (1 Hz)
    fc  = min_cutoff + β_gain·|d̂x|               — the adaptive cutoff

  Starting constants for tilt-as-light: `min_cutoff = 1.0 Hz`, `β_gain = 0.02`, `d_cutoff = 1.0 Hz` —
  tune by eye on the device, they are the two knobs the paper says to tune (jitter ↔ lag).

**Light from tilt.** The rim light is a directional highlight whose screen offset is simply
`(dx, dy) = (k·tx, k·ty)` with k ≈ 4–8 px for chrome hairlines and k ≈ 12–20 px for the enclosure wash —
moved with `transform: translate3d()`, never `background-position` (transform composites; position paints).
This is the farm's own gyro-specular precedent (handpan's light-reactive buttons,
`[[reference_gyro_material_buttons]]`) promoted to the SYSTEM.

**What we deliberately do NOT do:** full head-coupled off-axis projection
([Kooima, Generalized Perspective Projection](https://www.semanticscholar.org/paper/14d1b312aba825bcce17edd67e3fdc139f1a76a2),
[head-coupled perspective](https://en.wikipedia.org/wiki/Head-coupled_perspective)) — it needs eye tracking
to be honest; with tilt alone it lies about the geometry and reads as wobble. The portal's depth comes from
the LIGHT moving and from static depth cues (rim occlusion, luminance falloff), which is exactly the
"не зовсім параллакс" the owner asked for.

## Energy budget (the hard rules)

Sources: [web.dev device orientation](https://web.dev/articles/device-orientation),
[MDN devicemotion](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicemotion_event).

- **Zero rAF at rest.** The engine is EVENT-driven: a sensor event updates the filter; ONE
  `requestAnimationFrame` is scheduled only if none is pending (rAF-coalescing), writes the two custom
  properties (`--ds-tx`, `--ds-ty`) once, and stops. No loop, ever.
- **Dead-band**: |Δ| < 0.004 after filtering → no write at all. A phone on a table costs nothing.
- **Consumers are compositor-only**: `transform: translate3d(calc(var(--ds-tx)*Npx), …)` and `opacity` on
  fixed, `will-change`-free layers (a handful of small elements; the browser promotes them on first move).
- **Pause on `visibilitychange`** (unsubscribe), resubscribe on visible; **`prefers-reduced-motion`
  disables the subscription entirely** — the portal is then lit statically.
- **iOS permission**: `DeviceOrientationEvent.requestPermission()` exists and needs a user gesture; NEVER
  prompt for decoration — if permission is not already granted (or the API absent), stay static. Sensor
  apps that already asked (compass, handpan) get the effect for free.
- Weak phones: no canvas in chrome, no animated blur/filter, sprites are small webp (<15 KB) decoded once.

## The two sprite sets

Generated like the icons (Z-Image on the pods), each set on ITS OWN ground so the alpha is exact math:

- **Night** (`/_rt/ds/n-*.webp`): corner curl, dock strand, particle scatter, portal ring, horizon arc,
  wisp — woven amber filaments + cyan sparks on pure black; α = max(r,g,b) above the measured black floor
  (`alphaFromBlack`, deploy/icons.mjs — already shipped for the APK foregrounds).
- **Day** (`/_rt/ds/d-*.webp`): sun disc, corner ray curl, strand with sun motifs, golden motes, horizon
  arc, sun+moon pair — gilded golden threads on pure white paper; α = "distance from white":
  for a pixel P over white, P = C·α + 255·(1−α) ⇒ **α = 1 − min(r,g,b)/255, C = (P − 255·(1−α))/α**
  (the exact mirror of the black-ground formula; min channel because gold removes blue first).

Use is RESTRAINED and chrome-only: the dock's strand, a corner curl in the enclosure, the scatter behind
empty states — decoration wears `.ms-decor` (the watch ladder already drops it), never under text, and the
axe bed never changes because sprites sit in the chrome band, not behind content.

## The portal chrome (what replaces the black shadows)

Today's offenders, measured (`theme.css`, `render.js`): `--nm-cast rgba(0,0,0,.9)` composed into
`.sf-e4/.sf-e5/.sf-frost/.modal-box/[data-toast]/menus`, and `DockFade`'s solid
`linear-gradient(base-200 38% → transparent)` band under the dock — on true black these read as flat black
smears (the owner: "банальна чорна тінь").

- Dark/night: floating things separate by **rim + bloom + a tight dark EDGE veil** (blur ≤ 8px, spread
  negative — an occlusion line, not a smear); the cast term goes.
- Paper/day: a soft warm cast IS honest daylight — it stays (`rgba(40,32,20,.22)`).
- Header = the portal's lip: its lit hairline moves with `--ds-tx` (the light slides along the edge as the
  phone tilts). Dock the same, opposite phase (light source is above).
- The enclosure gains a depth falloff (radial darkening toward the rim on night; a warm paper vignette on
  day) — static, cheap, and the one place a corner sprite may live.

## Second cut — the lip is woven, the sprites are visible (core 1.0.1, 2026-09-01)

Owner, on the first cut: "хедер не гармонійний усьому дизайну… не бачу текстур". Measured on the deployed
build: the app bar still carried `bg-base-100 sf-e2` in its markup (only the three overlay headers had been
cleaned), so it was a flat card with a ring welded over every stage; and of the 12 sprites exactly ONE was
consumed — the dock garland at `h-9 opacity-40`, `auto 200%` (the 512px art drawn at 14%: bulbs ~5px).

What ships, all in `theme.css` (markup carries only hooks — `data-garland`, `data-empty`, `data-dock-fade`):

| piece | night (`signal`) | day (`signal-light`) |
|---|---|---|
| bar | pane gradient only (no bg, no ring) | same |
| `::before` band | `ds-n-arc` 100% wide, 28px window at `center 52%`, bottom −10px, α .6, masked 18–82% × 32–68% | none (gold on paper = smear) |
| `::after` hairline | `rgba(255,238,208,.58)` centred 38–62%, glow `0 0 12px 1px accent 26%` | ink `rgba(20,18,16,.18)`, no glow |
| wordmark | `text-shadow 0 0 14px accent 42%` | none |
| garland | `ds-n-strand` tile 50% wide, `center calc(100% + 23.5vw)`, α .85 | `ds-d-strand`, `+22.75vw`, α .9 |
| empty state | `ds-n-scatter` 260px at `center −44px`, α .8 | `ds-d-scatter`, α .9 |

**Every offset is measured off the sprite's alpha** (scratch `measure-sprites.mjs`: per-row alpha mass →
first/last row above 8% of the max, the ≥50% core, the peak row):

    ds-n-arc      384  art rows 180–245, core 187–239, peak 194   → band peak at 50.5%; `center 52%` in a 28px window
    ds-n-strand   512  art rows 146–271 (wire 146, bulbs to 271)  → 47.1% blank below × half-width tile = 23.5vw
    ds-d-strand   512  art rows 202–279                           → 45.5% → 22.75vw
    ds-n-scatter  384  core rows 173–200 (48%)                    → on 260px: core at 125px; glyph centre 82px → −44px
    ds-d-scatter  512  core rows 225–271 (48%)                    → same offset

Why `calc(100% + Nvw)` for the garland: `100%` aligns the sprite's bottom with the zone's bottom, `+N` pushes its
empty lower part below the viewport, so the bulbs END on the screen edge whatever `--dock-h` is; the tile is
50% of the width so the one seam sits behind the centred dock pill. Past 640px the tile pins to 192px
(`calc(100% + 89px)`) so a desktop never gets a 3× garland. Watch mode (≤300px) drops both header pseudo
layers with `.ms-decor`. Chrome pseudo-elements carry NO transform — the verify gate still reads them.

Left open (deliberately not in this cut): the corner curl (`ds-n-corner` / `ds-d-corner`) — the only free
corners are the bottom ones, and cropped to the 68px dock zone the swirl reads as a partial blob; needs a
composition pass with the eye. Sun/moon as the theme-toggle art (`ds-d-moonsun`, `ds-n-ring`).
