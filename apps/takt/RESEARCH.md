# takt — one button, a field that lives on the beat

Measured 2026-10-05 (deno probes, Web Audio spec, Quilez, Roberts).

## The stream
- `https://streams.rautemusik.fm/techno/mp3-192` (the alias afterdark and tide already use). The host 302s to a
  per-request radiohost edge with an expiring token — always give `<audio>` the alias, never the target.
- CORS: both the 302 and the final 200 reflect the request `Origin` → `crossOrigin="anonymous"` +
  `createMediaElementSource` gives the analyser real samples. Without CORS the spec mandates silence to the
  graph (Web Audio §1.22.4), which is why `tide` keeps a `cors` flag per station.
- No keyless now-playing title (`status-json.xsl` says "Kein Titel Update"); the signed API is the site's own
  credential, so the screen says nothing about tracks. The privacy text anticipates third-party players.
- Direct Icecast, no HLS DVR: the DVR runs 300 s behind live and restarts on every edge deploy; a radio
  button wants now.

## The beat
Reused, not rewritten: `rt/afterbeat.js` (spectral flux on an unsmoothed 1024-FFT → onset novelty at 100 Hz →
autocorrelation tempo 118–150 BPM with a log-Gaussian prior → PLP phase; `confidence` gates the readout) and
`rt/afterdark.js` (`bassEnergy` bins 1–6, `stepPulse` kick envelope, `idleGroove` at 126 BPM when there is no
signal). `lead` = `outputLatency + baseLatency + 1/60` so the visuals anticipate the speaker.

## The conductor — `rt/takt.js`
Order is the beat grid; randomness is an R3 quasirandom sequence (Roberts: `frac(0.5 + n·(1/g, 1/g², 1/g³))`,
`g = 1.2207440846`), so picks are evenly spread and never clump or repeat a run. Schedule:
- every **beat**: `flick` advances (cells re-roll, lattice rows step, a few cells blink)
- every **bar** (4): hue drifts 0.012 in the look's direction, warp mutates ±0.075
- every **16 beats**: palette jump (hue +0.18–0.68, new spread and saturation)
- every **32 beats** (an 8-bar phrase): a new family, chosen by a Markov table that forbids a self-loop,
  halves the family before last and prefers hard after soft; it arrives over 4 beats as a block dissolve
  (14 blocks per frame-height, random order by hash)
- a **drop** — a bar whose 2-beat energy is > 1.4× the 32-beat mean after ≥ 2 quiet bars (< 0.7×) — is a
  hard cut: new family at once, white flash decaying at 4/s, and the phrase clock re-anchors there.
Eased outputs (`cur`) follow the targets at 2.5/s so a mutation never pops; a cut copies them instantly.

## The field — `takt.frag`
Five families answer with a value 0..1; the tone map is the same for all: hue walks between two neon hues
(HSV, sat 0.7–1) over the value, light = `smoothstep(0.2, 0.85, v)²`, white-hot core `v⁶`, gain
`(0.75 + 0.25·drive)(0.9 + 0.25·pulse)`. Light theme = the same field as ink on paper (`mix(0.95, hue·0.45, l)`).
- flow: two-stage domain warp (Quilez), ridges `1 − |2v − 1|` cubed → filaments
- cells: voronoi F1/F2, 45 % of cells lit, re-rolled every 2 beats; edges at F2−F1
- lattice: posterised cells (noise ⊕ per-cell hash), odd rows step one cell per beat, 18 % blink per beat
- kaleido: n-fold mirror (3–8) of a warped field, posterised to `quant + 2` levels, turning with the bars
- tunnel: `(θ·n, 0.5/r + zoom)` rings and spokes, rushing in a quarter-frame per beat
Costs ≤ ~20 noise taps per pixel per family; both families run only during the 4-beat dissolve.
GLSL rule kept: no reversed `smoothstep`. Dither ±0.5/255 before the write.

## Chrome
No island, no text — the hero `Transport` alone over the field (owner, 2026-10-05). The runtime's navbar and
dock fade after 4 s without a touch while it plays (`data-immersive`, nothing removed), never under the gate.
The stream credit is the profile's source link. Kit fix that this app surfaced: the hero's glyph used
`!text-base-content`, which the browser build never emits — invisible in the gate, store shots and `see`.
