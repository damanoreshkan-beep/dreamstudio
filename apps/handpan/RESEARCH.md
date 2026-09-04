# Handpan — 3D "resonance field": research note

Deep-research pass (2026-07-22) backing a one-shot build. Enriches the handpan with a three.js layer, as the
rave app did — but a handpan is **percussive and meditative**, not a continuous EDM spectrum, so the visual is
a different, physically-honest idea. Sources at the bottom. This is the concrete recipe the build follows.

## 1. Why NOT a spectrum bar chart (the rave look) — and what instead

Rave's signal is a sustained wall of sound → a radial FFT ring + a scrolling terrain read perfectly. A
handpan produces **discrete strikes** that ring and *bloom* into a convolution-reverb wash (the 1:2:3
harmonic voice, long sustain). The honest visual for that is not a bar chart of a near-silent spectrum — it
is **waves radiating from the point you struck**, exactly as a real steel pan's surface throws standing waves
when a tone field is hit (Chladni / drumhead physics; the meditative "stone in still water" metaphor). The
owner asked for precisely this ("хвилі звуку від ударів"). Decision: **an ambient resonance field of
expanding, interfering ripples**, one launched per strike, decaying with the note.

## 2. The wave model (maths → runtime, unit-tested)

Each strike is a **wave packet** on a 2D surface: a cosine oscillation windowed by a Gaussian so its energy
stays localised at a moving ring, riding an outgoing front `r = speed·age`, under an exponential temporal
decay (matches the note's ring-out) and a `1/(1+spread·r)` spatial falloff (energy thins as the ring grows):

```
u        = distance(node, origin) − speed·age        // signed distance from the wavefront
packet   = cos(k·u) · exp(−u² / width²)              // Gaussian-windowed cosine, k = 2π/wavelength
env      = amp · exp(−age / life)                    // ring-out, mirrors the reverb tail
spatial  = 1 / (1 + spread · speed·age)              // crest thins as it expands
height   = Σ_strikes  env · spatial · packet         // interference sum → the surface displacement
```

Multiple strikes **interfere** (sum), which is the whole point — a chord or a fast run makes a live,
crossing-ripple surface. Per-node hue is the **amplitude-weighted** hue of the contributing strikes, so a
low-pitched ripple stays violet where it dominates and a high one leans cyan where *it* dominates. All pure,
deterministic (no `Math.random`) → `packages/runtime/ripple.js` with Deno unit tests (farm rule: maths in the
runtime, verified by `deno test` even though WebGL only runs in CI). API: `RippleField({speed,width,
wavelength,life,spread,max})` → `.strike(x,y,{amp,hue,t})`, `.sample(x,y,t)→{h,hue}` (one pass, called per
node per frame), `.energy(t)`, `.hue(t)`, `.prune(t)`; plus a pure `ring(u,width,k)`.

Tuning (world units, ±5.8 field): `speed 4.6 · wavelength 1.7 (k≈3.7) · width 0.95 · life 1.6s · spread 0.13
· max 14`. Calm, ~3–4 visible rings across, ring-out ≈ the note decay.

## 3. Signal: strike EVENTS + a master tap (not just an FFT)

- **Primary — strike events.** `view.js` already knows every strike (live taps in `strike()`, scheduled loop
  hits surfaced in the `draw()` rAF as cells light). Each emits one ripple: **position** from the struck
  field's ring angle (`ding → centre`; field k of n → `angle −π/2 + k/n·2π`, r≈0.66), **hue** from the
  semitone offset above the ding (`268 − t·70`, violet→blue, brand-anchored), **amp** from velocity.
- **Secondary — one `AnalyserNode`** tapped off the shared master (`e.master.connect(analyser)`, a pure
  observer, like rave) → a scalar ambient level (mean byte /255) → a **slow global breathing/glow** so the
  reverb tail and the `space` slider are felt between strikes. When there's no live audio (paused / gate),
  the pump falls back to the field's own `energy()` and seeds gentle deterministic ripples so the shot lives.

## 4. three.js layer (2nd shipped three.js app; follow `reference_webgl_threejs_in_farm`)

Import map (`apps/handpan/index.html`): add `"three": "https://esm.sh/three@0.171.0"`. **Lazy-import inside
the init effect**, **probe-guard** on `getContext('webgl2')||('webgl')` (NOT gate-guard — CI Chromium *has*
WebGL, so verify.mjs captures the real 3D; preflight/linkedom has neither WebGL nor `three` → throws → caught
→ Canvas2D fallback), one module rAF **pump**, dispose renderer/geo/mat in cleanup.

- **No GLSL** (can't compile locally / verify from a shot): the surface is a **30×30 `InstancedMesh` of small
  spheres** on the XZ plane; per frame each dot's **Y = field.sample(x,z,t).h·MAXH**, colour lifts and tints
  with |h| + hue. One draw call (`setMatrixAt`/`setColorAt` + `needsUpdate`), mobile-friendly — same idiom as
  rave's terrain/ring. A **radial edge fade** (L·(1−dist/maxDist·0.85)) melts the grid into the base so it
  never reads as a hard rectangle (a `GATE_BLINDSPOTS` trap).
- **Composition:** a fixed ambient canvas at **z-0 inside the Play panel** (panel bg goes transparent → the
  dark base-200 shows through), the pan + controls wrapped **relative z-10**. Ripples bloom from *behind* the
  opaque pan rim outward — "the instrument resonating into the room." Camera tilted ~50° above, looking down,
  so rings read as rings (a gentle perspective, not rave's steep horizon).
- **Fallback (Canvas2D):** sample `field` over a coarse grid, draw filled dots sized/opac'd by |h|, same
  `data-ripple data-live` hooks. Guarded hard (linkedom's 2d stub → bail unless real `arc`/`fillRect`).

## 5. Sensors → immersion (reuse rave verbatim, gentler)

Reuse `viz.js`'s `enableImmersion`/gyro-`Parallax`/compass head-look block unchanged (`/_rt/sensors.js`
`tilt`+`compass`, prime behind a gesture — iOS gates the permission; respect `prefers-reduced-motion`). Keep
the camera parallax small and the world-rotation gentle — this is a meditation instrument, not a ride.

## Pitfalls captured
- Don't reuse the spectrum bar-chart — a near-silent percussive spectrum reads dead; use strike-driven ripples.
- Don't CPU-mutate a `BufferGeometry` — displace **instances** (one draw call), like rave.
- Don't gate-guard `three` (CI would never verify it) — **probe-guard** the WebGL context.
- Don't let the dot grid read as a rectangle — radial edge fade into the base.
- Keep hues in a non-wrapping band (200–300) so amplitude-weighted hue averaging stays sane.
- Deterministic gate: no `Math.random` in the field; seed fixed strikes so the CI shot is alive + reproducible.

## Sources
- Rohner/Schärer Hang & Saraz handpan acoustics — 1:2:3 partials, long sustain (the ring-out the decay mimics).
- Chladni figures / struck-membrane standing waves; ideal-drumhead radial modes (the ripple metaphor).
- Codrops, *Coding a 3D Audio Visualizer with Three.js* (2025) — instanced/uniform-driven, no CPU geometry.
- MDN AnalyserNode (observer-tap pattern); `apps/rave/RESEARCH.md` + `reference_webgl_threejs_in_farm` (farm precedent).

## Design refresh 2026-09-04

State map of the main screen (Play):

- **idle** — the scale rail (`Segmented`, `[data-scale]`), the pan with its steel fields over the ripple field, the island: Transport (stop icon) + Flow + Rec actions + the space `Slider` (`[data-space]`).
- **struck** — the field glows in the app's mark colour (`.hp-lit`, `--glow: var(--app-accent)`), a ripple lands in the field behind.
- **playing / recording** — the Transport's play is a stop, Rec is `aria-pressed` and pulses; Flow sweeps the loop in.
- **Weave** — the grid, the pinned island with the Transport and four actions (demoting past `keep` into the overflow Sheet); the settings Sheet holds tempo + space `Slider`s, shimmer/drone toggles, voice + scale rails.
- **Saved** — skeleton cards → the list; delete is undo-backed.
- 412×430 / 360×340: the pan is `min(90vw, 62vh)`; the island's Transport compacts on width, the slider's caption sits beside its track below 9 rem.

What changed and why:

- The three DaisyUI `range`s (the island's space, the sheet's tempo and space) are the kit's `Slider`: the caption is the accessible name (`data-space`, `data-set="tempo"` / `"space"`); tempo carries its BPM in the caption («Темп · 80», the mono label · count shape), space prints nothing, as a macro should.
- `head.html`: the glow fell back to the pre-luminous purple `#9F8CF6` through `--color-secondary`; it is `--app-accent` now. The steel itself stays literal and is documented as a DEPICTED material (dark in any room, like a photo) — the reason there is no light-theme branch for it.
- Micro-labels in the settings Sheet carry the mono `--ms-label` pattern; `text-xs` meta is the label token; saved cards sit at `--ms-r`; the two `transition` on cards name their property.
- Deliberately left: `bg-secondary/25 text-secondary` on the immersion button and `text-secondary` on the ding row (the theme tunes `--color-secondary` per theme for text, `rules/design.md`), and `outline-base-content/50` on the playhead cell (a mark, not text).
