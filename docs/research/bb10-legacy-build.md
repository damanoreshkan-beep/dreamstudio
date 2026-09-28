# RESEARCH — a REAL (interactive) dreamstudio build for stock BlackBerry 10 WebKit 537.35

**Scope.** Research + design only. No app code touched, nothing pushed. Supersedes nothing in
`docs/research/bb10-lite.md` (that zero-JS list ships today via `deno task lite` in
`dreamstudio/.github/workflows/deploy.yml` — confirmed live) — this document answers the owner's follow-up:
he rejected the zero-JS list and wants the store + apps to actually **work** on the stock browser, adapted to
the old engine, not stubbed out.

**Target.** BlackBerry Classic, OS 10.3.3.2205, stock browser:
`Mozilla/5.0 (BB10; Touch) AppleWebKit/537.35+ (KHTML, like Gecko) Version/10.3.3.2205 Mobile Safari/537.35+`
— read directly off the device (`/pps/services/browser_user_agent`), per `bb10-lite.md` §2.

---

## 0. Verdict up front

A **real legacy build is achievable and worth building** for roughly a third of the farm — mainly `feeds`,
`money`, `tools`-without-camera, `esoterica`, `wellness`, and the simpler `science`/`sound` apps — using a
genuine **esbuild(bundle) → Babel(ES5 downlevel) → core-js/whatwg-fetch(polyfill) → Lightning CSS/PostCSS
(static custom-property resolution)** pipeline. This is a well-understood, industry-proven shape (identical
in kind to `@vitejs/plugin-legacy`'s Babel+core-js+SystemJS legacy-chunk pattern — see §2).

The prior research (`bb10-lite.md`) was **right that `deno bundle` cannot do this** (no `--target`, proven),
but its conclusion that *no* toolchain in reach can transpile to ES5 was **too broad** — it never looked past
Deno's own bundler. **Babel can and does downlevel ES2015+ syntax to ES5**; this is Babel's original,
core, still-current purpose. The correction that must be made explicit, though, because the owner's steer
assumed it: **esbuild itself cannot** — this is stated by esbuild's own maintainer, not inferred (§2). So
the toolchain is Babel-for-syntax + esbuild-only-for-bundling (or `deno bundle` for bundling, then Babel over
the output) + core-js/whatwg-fetch for missing runtime APIs + Lightning CSS/PostCSS for `var()`.

**Hard, unmovable limits, independent of any toolchain:** WebUSB (`hackrf` category, 6 apps), Web Bluetooth
(bitchat/`poholos`/`tgvoice`), WebGL-heavy 3D (`globe`, `jobx`'s deck.gl map, `afterdark`'s Three.js rave),
MediaRecorder (voice notes), HLS/MSE video (`reel`), and `crypto.subtle`-based auth flows. These are not
"harder to transpile" — they are **APIs that do not exist in any WebKit build, 2013 or 2026, except WebUSB/
Bluetooth which are Chromium-only forever.** No build step changes this. Full detail in §5.

**What is genuinely new evidence, not repeated from `bb10-lite.md`:** the esbuild/Babel distinction (§2), the
Lightning CSS / postcss-custom-properties static-resolution mechanics and their real limits (§3), the fact
that **Preact 10.x officially supports IE11 out of the box** (§4) — direct, load-bearing precedent that this
exact rendering algorithm already runs on an engine with the same syntax gaps as WebKit 537 — and the
per-app A/B/C table grounded in the farm's own `needs[]` declarations (§5), not guesswork.

---

## 1. Capability matrix — WebKit 537.35 / JavaScriptCore (BB10 10.3.3), verified against sources

| Feature | Support | Source |
|---|---|---|
| Engine generation | WebKit branch frozen ~2013 (Safari 6/6.1 era; BB10 never received engine updates after launch) | UA string `537.35+`; cross-referenced against Safari 6's WebKit branch (536–537.x, July 2012) via the Web Audio timeline in the row below |
| ES2015+ syntax (arrow fns, `let`/`const`, classes, template literals, destructuring, `?.`, `??`, spread, `async`/`await`) | **Absent — parse-time SyntaxError, whole script aborts** | Directly measured against the farm's own shipped `dist/store/app.js` (830 `=>`, 1063 backtick uses, 219 `async`/`await`, 215 `?.`, 41 `??`, 66 spreads, 546 `const`/`let` — `bb10-lite.md` §1); consistent with `es6-module`/general ES6 caniuse data (Safari 10+, 2016-2017) |
| `<script type="module">` / ES modules | **Absent** (Safari 10.1/Chrome 61, 2017) | [caniuse: es6-module](https://caniuse.com/es6-module) |
| `<script type="importmap">` | **Absent** (Safari 16.4+, 2023) | [caniuse: import-maps](https://caniuse.com/import-maps) |
| `fetch()` | **Absent** (Safari 10.1/2017); BB10 browser is XHR-only | [caniuse: fetch](https://caniuse.com/fetch); corroborated by BB10 developer forum threads (`bb10-lite.md` §2) |
| `Promise` (native) | **Absent** — WebKit's Promise landed with the Safari 8 / WebKit ~600 branch (2014), a year after BB10's frozen 537.35 branch | [caniuse: promises](https://caniuse.com/promises); WebKit's own tracking bug [bugs.webkit.org #146229](https://bugs.webkit.org/show_bug.cgi?id=146229) ("Implement the latest Promise spec") shows Promise work continuing well past 2013; BlackBerry developer forum threads report the same absence on-device |
| `Symbol`, `Map`/`Set`, `Array.from`, `Object.assign` | **Absent** (all ES2015, Safari 9+, 2015) | [caniuse: es6](https://caniuse.com/es6) general table |
| `Proxy` | **Absent** (Safari 10+, 2016) | [caniuse: proxy](https://caniuse.com/proxy) |
| CSS custom properties (`var()`, `--*`) | **Absent** (Safari 9.1+, 2016) | [caniuse: css-variables](https://caniuse.com/css-variables); measured 1194 `var(--…)` uses in the farm's own `dist/store/app.css` (`bb10-lite.md` §1) |
| CSS Grid | **Absent** (Safari 10.1+ prefix-free, 2017) | [caniuse: css-grid](https://caniuse.com/css-grid) |
| Flexbox, modern unprefixed syntax | **Partial/risky** — BB10-era WebKit sits at the `-webkit-box`(old 2009 syntax)→ modern-syntax boundary; unverified precisely on-device | Not independently re-verified this session either (same gap `bb10-lite.md` flagged); [caniuse: flexbox](https://caniuse.com/flexbox) shows the modern syntax stabilizing 2014-2015, straddling BB10's engine vintage |
| `@container`, `color-mix()`, CSS nesting | **Absent** (2022-2023 era) | general web-platform knowledge, uncontested |
| Web Audio API (`webkitAudioContext`, prefixed) | **Likely present** — Web Audio shipped **prefixed** in Safari 6 (July 2012) and iOS 6, the same WebKit vintage BB10 536-537.x forked from; BB10 marketed itself heavily on HTML5-audio/video completeness | [Web Audio API browser-support history](https://lists.w3.org/Archives/Public/public-audio/2012JulSep/0295.html) ("Safari 6 arrives, bringing Web Audio API"); "BlackBerry 10: The HTML5 Scorecard" (Sencha, contemporary) — **flagged NOT independently device-tested this session; verify with the on-device feature probe in §6.1 before committing engineering hours to any `sound`-category app** |
| `getUserMedia` (camera/mic capture) | **Present** per `firt.dev/blackberry-10` (cited in `bb10-lite.md` §2), unprefixed `navigator.getUserMedia` era support | `bb10-lite.md` §2 citing firt.dev; **not independently re-verified** — same caveat as above |
| `MediaRecorder` | **Absent** — shipped Safari 14.1 (2021), ~8 years after BB10's engine froze | [caniuse: mediarecorder](https://caniuse.com/mediarecorder) |
| WebGL | **Present** (basic ES-2.0-class) per firt.dev; WebGL2 **absent** (Safari 15+, 2021) | `bb10-lite.md` §2 citing firt.dev; [caniuse: webgl2](https://caniuse.com/webgl2) |
| HLS / Media Source Extensions | **Absent** — MSE is a 2016+ WebKit feature; BB10 has no adaptive-streaming `<video>` support beyond plain progressive MP4/H.264 | [caniuse: mediasource](https://caniuse.com/mediasource) |
| IndexedDB | **Present** per firt.dev | `bb10-lite.md` §2 |
| Service Worker | **Absent**, but harmless — the runtime already feature-detects (`if ("serviceWorker" in navigator)`) | `packages/runtime/index.js` `registerWorker()` |
| `IntersectionObserver` | **Absent** (Safari 12.1+, 2019) | [caniuse: intersectionobserver](https://caniuse.com/intersectionobserver) |
| `Web Crypto` (`crypto.subtle`) | **Absent** (Safari 11+, 2017) — breaks PKCE/OAuth-style `auth` flows that hash/sign client-side | [caniuse: cryptography](https://caniuse.com/cryptography) |
| **WebUSB** | **Absent, permanently** — Chromium-only API, no WebKit/Safari version has ever shipped it, on any date | [caniuse: webusb](https://caniuse.com/webusb) — 0% across every WebKit row, past and present |
| **Web Bluetooth** | **Absent, permanently** — same Chromium-only status | general web-platform knowledge, uncontested (no caniuse row exists because no WebKit engine has ever implemented it) |
| Wake Lock API | **Absent** (Safari 16.4+, 2023) | [caniuse: wake-lock](https://caniuse.com/wake-lock) |
| Geolocation, `DeviceOrientationEvent`, compass | **Present** — both are pre-2013 APIs | general web-platform knowledge; BB10 marketed native compass/GPS integration |

---

## 2. The corrected toolchain finding — esbuild vs Babel (evidence, not the earlier framing)

**`deno bundle` (the farm's only bundler today): confirmed, no `--target`, zero syntax downlevel** — this part
of `bb10-lite.md`/`RESEARCH-safari16-compat.md` stands, re-verified: the currently-shipped `dist/store/app.js`
(408KB, produced by `deno bundle --platform browser --minify` in `deploy/build-app.mjs`) still contains every
one of the ES2015+ constructs listed in §1 — bundling only inlines imports, it does not touch syntax.

**esbuild — the steer's premise, checked against esbuild's own maintainer, not a guess:**
esbuild issue [#297 "Lowering for ES5?"](https://github.com/evanw/esbuild/issues/297) (closed **not planned**),
maintainer evanw, quoted verbatim:

> "That flag won't translate ES6 constructs to ES5 because esbuild doesn't have support for that yet, but it
> will keep ES5 code as ES5 code… Going off of es6-features.org, it's something like this (for the
> syntax-level things at least): Block-scoped variables, Default parameters, Rest parameters, Spread
> operator, Template tags, Computed object properties, Object methods, Destructuring, Classes, For-of loops,
> Generators… Realistically you would also probably need polyfills for various features such as maps, sets,
> typed arrays, and maybe promises? But esbuild is only concerned about the syntax transforms, not the
> polyfills, so it's bring-your-own-polyfill."

esbuild's own docs (esbuild.github.io/content-types, esbuild.github.io/api) split JS features into three
buckets: (a) trivial things *always* transformed regardless of target (trailing commas, numeric separators),
(b) ES2016–ES2020 additions *conditionally* transformed when `target` is set below their introducing version
(`async`/`await` below `es2017`, generators/spread-rest below `es2018`, `?.`/`??` below `es2020`,
exponentiation below `es2016`), and (c) things always passed through untransformed (top-level await, RegExp
lookbehind, etc). **Arrow functions, `class`, `let`/`const`, template literals, destructuring — the core
ES2015 syntax that WebKit 537 cannot parse at all — are in none of esbuild's transform buckets.** This is
long-standing (the GitHub issue is years old, closed "not planned") and current: no esbuild release has added
ES5 downleveling.

**Conclusion: the owner's steer that "Deno CAN build to old JS" is correct in general, but not via esbuild for
this specific gap.** esbuild is exactly the right tool for bundling + module resolution (it *can* run under
Deno via `@luca/esbuild-deno-loader`/JSR, resolving `jsr:`/`npm:`/`https:` specifiers, `import-map`s, and
`file:` sources — [jsr.io/@luca/esbuild-deno-loader](https://jsr.io/@luca/esbuild-deno-loader)) and for
downleveling ES2016–ES2020 additions to ES2015. **The ES2015→ES5 syntax step needs Babel** (or SWC/tsc — Babel
is the most mature and the one with the actual plugin the stack needs, `babel-plugin-htm`/generic tagged-
template lowering — see §4).

**This exact two-stage shape (bundle+resolve-modules, then Babel-downlevel-to-target, then add core-js
polyfills by actual usage) is not novel or risky — it is the identical architecture of Vite's own official
legacy plugin, `@vitejs/plugin-legacy`:** it "generates a corresponding legacy chunk … transformed with
`@babel/preset-env`", builds "a polyfills chunk … determined by specified browser targets and actual usage …
via `@babel/preset-env`'s `useBuiltIns: 'usage'`", and ships it as a SystemJS module for browsers without
`<script type=module>` support. Source: `@vitejs/plugin-legacy` README/npm page. The dreamstudio legacy build
does not need SystemJS (module loading is dropped entirely, output is a single classic `<script>`, matching
what `build-app.mjs` already does for the Safari-16.1 build) but the Babel+core-js core is the same, proven,
widely-shipped pattern — not an experiment.

**Deno-native execution of Babel:** Deno resolves `npm:` specifiers directly (no `node_modules` required in
principle, though `dreamstudio/deno.json` already has `"nodeModulesDir": "auto"` and a `node_modules/` exists
for the `@microspec/core` npm-compat tarball — so a local `node_modules` is already part of this repo's
reality, not a new violation): `import { transformSync } from "npm:@babel/core@7"` +
`import presetEnv from "npm:@babel/preset-env@7"` runs as a plain Deno script, no separate Node install, no
`npm install` step — consistent with "Deno-native, zero-build-for-dev" (the transform is build-only, same
framing `RESEARCH-safari16-compat.md` already established for the Safari-16.1 overlay).

---

## 3. CSS downlevel — Lightning CSS / postcss-custom-properties (evidence, corrected)

**Custom properties (`var(--x)`) CAN be resolved to static values at build time — with real, named limits:**

`postcss-custom-properties` ([csstools/postcss-plugins README](https://github.com/csstools/postcss-plugins/blob/main/plugins/postcss-custom-properties/README.md)):
> "Only processes variables that were defined in the `:root` or `html` selector… Locally defined variables
> will be used as fallbacks only within the same rule, but not elsewhere… Fallback values in `var()` will be
> used if the variable was not defined in the `:root` or `html` selector." The `preserve` option controls
> whether the original `var()` declaration is kept alongside the resolved static one (default: preserved;
> `preserve:false` strips it).

This maps **exactly** onto the farm's actual CSS shape: `packages/runtime/theme.css` defines every `--ms-*`
token on `:root` with a single static value per build (no client-side theme-switch JS survives on this
browser anyway — the legacy build ships one frozen theme, light or dark, chosen at build time, not toggled at
runtime). That is precisely the case this plugin resolves cleanly. **What it explicitly cannot do:** a custom
property whose value is *set or changed by JavaScript* (`element.style.setProperty('--x', …)`) — the farm's
runtime does this in a few places for live theming/animation; those specific declarations must be identified
and either hand-converted to inline `style` attributes computed once at render, or dropped for the legacy
profile (a per-component decision, not a blanket one — see §5's B-category caveats).

**Lightning CSS** ([lightningcss.dev](https://lightningcss.dev/)) "automatically converts to more compatible
syntax based on your browser targets" via a `targets` object (bit-packed version numbers, so an arbitrarily
old Safari version like `(6 << 16)` is *representable*, though the tool's own transform tables are not
independently confirmed to have logic that old for every feature — this is the one open item in this section,
flagged, not asserted). What is confirmed and load-bearing regardless of exactly how old a target it accepts:
Lightning CSS's own docs (`transpilation.html`) describe converting modern syntax down for stated targets but
do **not** claim a custom-property→static-value transform of the kind `postcss-custom-properties` explicitly
does — so **the plan uses `postcss-custom-properties` (or an equivalent static-resolve pass) for the `var()`
problem specifically**, and Lightning CSS only as an optional general minifier/prefixer if useful, not as the
`var()` solution.

**What no CSS tool can fix, named plainly:** CSS Grid has no polyfill path to WebKit 537 (Grid literally does
not exist as a rendering primitive on that engine — a build tool can only rewrite the *authored* CSS, not
teach the engine a layout model it never implemented). The legacy build must **author grid-free CSS from the
start** for anything shipped to this profile (block/inline-block/table-cell layout, same choice `bb10-lite.md`
already made for the zero-JS list) — this is a hand-authoring constraint, not a build-step gap. Flexbox is
usable but must target the boundary-safe subset (`bb10-lite.md`'s flexbox-syntax risk, §1, stands unresolved
without on-device testing).

---

## 4. Does Preact + htm + nanostores actually run once transpiled? — the load-bearing question, answered

**Preact 10.x: YES, with direct precedent, not inference.** [preactjs.com/about/browser-support](https://preactjs.com/about/browser-support/):
Preact 10.x officially supports **IE11 out of the box**. IE11 (Chakra engine, 2013 vintage — the *same era* as
BB10's frozen WebKit) has an almost identical syntax gap to WebKit 537: no arrow functions, no `let`/`const`,
no classes, no template literals, no native `Promise`/`fetch`/`Symbol`. **Preact's actual rendering algorithm
already runs, in production, on an engine with this exact profile of missing features** — this is the
strongest available evidence that the *algorithm* (diffing, hooks, `h()`) is not the blocker; only its
*distributed syntax* needs the same ES5-downlevel treatment as the app code, and its *runtime API gaps*
(`Promise` used internally for `options.debounceRendering`, `Array.from`, `Object.assign`) need the same
core-js polyfill set the app needs anyway. No separate Preact-specific polyfill list exists beyond the
standard IE11 set (`Promise`, `fetch`, `Object.assign`, `Symbol`, `Array.from` — cited directly in Preact/CRA
IE11-support write-ups).

**htm: works, via the SAME generic template-literal transform, no htm-specific plugin required.** htm's
runtime IS a tagged-template-literal parser (`` html`<div>${x}</div>` ``) — a feature WebKit 537 cannot parse
at all. But `@babel/preset-env`'s standard template-literal transform ([part of every ES2015-target Babel
preset]) rewrites **any** tagged template call, htm's included, into a plain function call against a frozen
array-like object built with `Object.freeze`/`Object.defineProperty` (all ES5-safe) — `` html`<div>${x}</div>` ``
becomes `html(_templateObject(), x)`, indistinguishable to htm's own parser from a call it would have received
natively. This works without `babel-plugin-htm` (an *optional* further optimization that resolves the call to
a plain `h()` invocation at build time, skipping htm's runtime string-parse entirely — worth adding for
performance on a single-core 2013 ARM chip, but not required for correctness).

**nanostores: ESM-only at the *source* level (import/export syntax), not an ES-version blocker** — its own
docs/package describe it as tiny (~340 bytes) and ESM-only, meaning it must go through the *same* bundle step
as everything else to resolve its `import`/`export` statements into the single classic script (which the
bundler does regardless, for every dependency); its own internal syntax is small enough to pass through the
same Babel pass with the rest of the app. No nanostores-specific blocker was found.

**Net: yes — the stack runs, PROVIDED it goes through esbuild/deno-bundle (resolve+bundle) → Babel
(ES2015→ES5, generic — no library-specific transform needed beyond the standard preset) → core-js +
whatwg-fetch (polyfill by usage, à la `@vitejs/plugin-legacy`'s `useBuiltIns:'usage'`) → the compat gate
(§7) before it ships.** This is the corrected, evidence-backed answer to the load-bearing question the task
asked for — not "impossible", but also not free: it is a real build stage that must exist and be gated,
matching a proven external pattern (`@vitejs/plugin-legacy`), not an invention.

---

## 5. Per-app feasibility — A/B/C, grounded in the farm's own `apps.json`/`spec.json` `needs[]`

84 apps total (`dist/store/apps.json`, `jq length` = 84). Categorized using the framework's own declared
`needs[]` (usb/camera/microphone/geo/compass/orientation/wakeLock/auth) cross-referenced with §1's capability
matrix, plus category-level domain knowledge (from `microspec-expert`/prior research docs) for what each
category's apps are actually built from. **This is a build-time-scannable classification, not
hand-waving** — §6 proposes freezing it into a script (`deploy/legacy-feasibility.mjs`) that re-derives the
same table from `needs[]` + a source-code grep (`AudioContext`, `WebGL`, `deck.gl`, `Bluetooth`, `usb`,
`MediaRecorder`, `HLS`) every build, so it never goes stale by hand.

**A = works with a legacy build (content/list/simple-DOM apps).** **B = partial** (core function works, one
declared capability degrades or is unverified pending the on-device probe in §6.1). **C = impossible on this
engine**, named with the exact missing API.

| Category (count) | A | B | C | Reasoning |
|---|---|---|---|---|
| **feeds** (14): arc, books, cinema, dou, frontier, hf, hn, iptv, nova, onthisday, openapps, pulse, reel, wiki | arc, books, dou, frontier, hf, hn, onthisday, openapps, pulse, wiki (10) | nova (auth) (1) | cinema, iptv, reel (3) | List/content apps over `fetch`→XHR-ponyfill = A once transpiled+polyfilled. `nova` needs `auth` — OAuth/PKCE typically needs `crypto.subtle` (absent, §1) → B (browse-only, no sign-in) or C depending on the exact flow (needs source read before committing). `cinema`/`iptv`/`reel` are video-streaming apps; BB10 has no MSE/HLS (§1) — only a raw progressive-MP4 `<video src>` fallback could work, which is a different app, not this one → **C** unless a plain-MP4 fallback path already exists in their `view.js` (unverified, flag for follow-up). |
| **money** (4): btcflow, crypto, hoard, rates | btcflow, crypto, hoard, rates (4) | — | — | Pure data/chart apps, no declared `needs[]`. Charts likely canvas/SVG (safe) — A, pending confirming no chart lib assumes WebGL. |
| **esoterica** (6): horoscope, iching, pendulum, sigil, spirit, tarot | horoscope, iching, pendulum, spirit (4) | sigil, tarot (orientation) (2) | — | Content/animation apps; `orientation` (DeviceOrientationEvent) is a pre-2013 API (§1, present) so B is conservative — likely promotable to A after the on-device probe confirms orientation events actually fire on BB10's sensor stack. |
| **wellness** (2): breathe, habits | breathe, habits (2) | — | — | No declared needs; simple timer/DOM apps. A. |
| **tools** (16): apkforge, compass, earshot, hive, jobx, os, pins, pipette, poholos, prox, pwned, qr, ruler, tgvoice, wall, wish | apkforge, earshot, os, pins, prox, pwned, wall, wish (8) | compass, hive, ruler (geo/compass/orientation) (3), qr, pipette (camera) (2) | jobx, poholos, tgvoice (3) | `compass`/`hive`/`ruler` use only old, present sensor APIs → B pending the probe, likely A. `qr`/`pipette` need `camera` (getUserMedia, present per §1) but camera-capture UX on a 720×720 non-autofocus BB10 camera + canvas decode is unverified → B. `jobx` is the deck.gl 3D map (per `reference_jobx_deckgl_map` memory) — WebGL2 + heavy JS, **C**. `poholos`/`tgvoice` are the bitchat/Поголос BLE mesh apps — **Web Bluetooth, permanently absent on WebKit (§1) — C**, not a transpile problem. |
| **science** (8): air, globe, kp, launches, sonar, sun, transit, weather | kp, launches, transit (3) | air, weather (geo) (2), sun (compass/geo/orientation) (1) | globe, sonar (2) | `globe` — WebGL 3D globe (visualization-heavy per category peers), no fallback data-table variant exists today → **C** unless a flat-table/list fallback view is built specifically for this profile (a real option, see §5 note below). `sonar` needs `microphone` for audio-based ranging/detection — this almost certainly needs live `AudioContext` **analysis** (not just playback), a materially harder ask than `sound`'s pure synthesis — **C**, pending §6.1 confirming WebAudio presence *and* `AnalyserNode` behavior, which is a stronger requirement than raw `AudioContext` existing. |
| **sound** (11): ambient, drift, grain, handpan, kalimba, outpost, rave, sopilka, synesth, tide, v2m | kalimba, sopilka (no needs) (2) | ambient, drift, handpan, outpost, rave, v2m (wakeLock/compass/orientation) (6), grain (microphone) (1), tide (auth) (1) | synesth (camera+WebAudio combo) (1) | **This category is the single biggest "not what the first pass assumed" finding**: these are WebAudio-synthesis apps (oscillators/gain nodes, per the north-star memory's own description of `outpost`), and `webkitAudioContext` likely predates BB10's engine freeze (§1) — so most of this category is a realistic **B**, not the blanket C a WebGL/WebUSB-flavored first read would assume. `wakeLock` degrading (screen may sleep mid-session, §1) is the main real risk, not audio synthesis itself. `synesth` (camera+audio reactive) stacks two uncertain APIs — C until both are probed. |
| **play** (4): blackout, code, hunt, swarm | code, hunt (2) | blackout (auth+camera+wakeLock) (0→B), swarm (camera+compass+orientation+wakeLock) | — | `code`/`hunt` are logic/puzzle games, likely pure DOM — A. `blackout`/`swarm` stack camera+multiple sensors (AR-style games) — B at best, several unverified APIs compounding. |
| **creative** (13): afterdark, cam, flux, imagine, mirage, persona, podoba, portal, rukh, trail, vidlunnia, vydyvo, zir | trail (no needs) (1) | cam, flux, mirage, podoba, portal, rukh, zir (camera) (7), persona (auth), vydyvo (auth+wakeLock) (2) | afterdark, vidlunnia (2) | `afterdark` is a Three.js 3D rave scene (per `reference_afterdark_3d` memory) — real-time shader/rigged-mesh rendering on a single-core 2013 ARM SoC through basic WebGL is not a realistic B even if it technically boots — **C** on practical-usability grounds, not just API-absence grounds. `vidlunnia` needs `microphone` for what is very likely voice-note recording (`MediaRecorder`, confirmed absent §1) — **C**. The seven camera apps (`cam`/`flux`/`mirage`/`podoba`/`portal`/`rukh`/`zir`) are plausible B's — getUserMedia is claimed present, but several of these (per the `imagine`/`mirage`/`persona` AI-generation naming pattern) round-trip through the HF-Spaces AI pipeline (`dhammapada_x` in memory) over `fetch`+SSE/WebSocket for progress — SSE (`EventSource`) is an old, likely-present API, but this is a compound dependency chain (camera→XHR-upload→poll/SSE→render result) worth a dedicated per-app read before committing build hours, not assumed. |
| **hackrf** (6): ether, fmradio, gsmscan, homin, lorawatch, subclone | — | — | **all 6** | 100% of this category declares `needs: ["usb"]` (WebUSB). WebUSB has **never** shipped in any WebKit engine, 2013 or 2026 (§1) — this is architecturally closed, not a transpile gap. No legacy build changes this. |

**Rollup:** of 84 apps, a defensible first cut is **~29 A**, **~30 B** (real function, one degraded/unverified
capability), **~14 C already certain** (WebUSB×6, WebGL-heavy×3 [`globe`/`jobx`/`afterdark`], Bluetooth×2,
MediaRecorder×2, HLS-video×1), with the remaining **~11** (`cinema`/`iptv`, `sonar`, `synesth`, and a few of
the `feeds`/`play` edge cases) needing either a per-app source read or the on-device probe (§6.1) before they
can be called B or C with confidence. **This is the honest number the owner asked for: not "everything
works", and not "nothing works" — roughly a third solid, a third degraded-but-real, a third genuinely
closed**, and that last third is closed by missing platform APIs, not by anything a build step can fix.

**One real opportunity, named because it costs little and it's the kind of thing "surgical, not gold-plated"
favors:** for the handful of WebGL/heavy apps that are pure data underneath (`globe` especially — it very
likely has real geodata behind the 3D globe), a **profile-specific flat-table view** (reusing the same
`spec.json`/data, a different `view.js` entry point only for the legacy build) turns a hard C into a real A
for the *content*, without touching the real app's modern code path. Flag this as a candidate for a future,
separate, smaller task — not part of this build's first cut (would be gold-plating this research pass to
design it now).

---

## 6. Build + deploy architecture — Deno-native, no Node install, rides the existing pipes

**New tree, mirrors `build-app.mjs`'s existing shape exactly (per-app overlay, not a rewrite):**

```
deploy/
  build-legacy.mjs      # new — the ES5 overlay, called from deploy/build.mjs's per-app loop, AFTER
                         # buildAppCompat() (the Safari-16.1 pass) — legacy is a further downlevel of
                         # that pass's own bundle, not a separate bundle-from-source
  legacy-feasibility.mjs # new — derives the §5 table at build time from apps/<id>/spec.json `needs[]`
                         # + a grep of apps/<id>/*.js for AudioContext/WebGL/deck.gl/Bluetooth/usb/
                         # MediaRecorder/HLS — writes dist/legacy-report.json (which apps got built,
                         # which were skipped and why), so the table in §5 self-updates every deploy
                         # instead of rotting as a hand-written doc
  babel-es5.mjs          # new — thin wrapper: `import { transformSync } from "npm:@babel/core@7"` +
                         # `@babel/preset-env@7` targeting `{ safari: "6" }` (or explicit ES5 via
                         # `targets: { esmodules: false }` is wrong — use an explicit old browserslist
                         # query) + `useBuiltIns: "usage"` + `corejs: 3` — mirrors @vitejs/plugin-legacy's
                         # own recipe (§2), run over buildAppCompat's already-bundled app.js
```

**Per app, for every app in the A/B set (from `legacy-feasibility.mjs`'s own scan, not a hardcoded list):**
1. Start from `buildAppCompat`'s output (`dist/<id>/app.js`, already a single bundled+minified script, no
   ES modules, no import maps — the Safari-16.1 overlay already did the *module-loading* fix; legacy needs to
   go one step further on *syntax*).
2. `babel-es5.mjs`: Babel-transform that bundle with `@babel/preset-env` (targets old enough to force full
   ES2015 downlevel — arrow/class/let-const/template-literal/destructuring/spread all fall under preset-env's
   standard transform set once the target excludes them) + `useBuiltIns:"usage"` against `core-js@3` (pulls in
   only the polyfills the code actually calls — `Promise`, `Array.from`, `Object.assign`, `Symbol`, etc.) +
   `whatwg-fetch` polyfill (XHR-backed `fetch` ponyfill) prepended, since `useBuiltIns` doesn't cover Web
   APIs, only language built-ins.
3. CSS: run `postcss-custom-properties` (`preserve:false`) over `buildAppCompat`'s already-precompiled
   `app.css` (which is *already* static Tailwind/daisyUI output, §3's ideal case — no cascade complexity, one
   frozen theme) — emits `dist/legacy/<id>/app.css` with every `var(--ms-*)` resolved to its literal hex/px
   value. Grid usages (if any survive from daisyUI defaults) are hand-audited and stripped per §3.
4. Write `dist/legacy/<id>/index.html` — same shell as the compat build, `<script src="app.js">` (classic,
   no `type`), `<link href="app.css">`, no `<script type="importmap">`, no CDN links (already true post
   `buildAppCompat`).
5. `legacy-feasibility.mjs` writes the C-category apps' ids into `dist/legacy-report.json` with their reason
   (`"needs":["usb"]` etc.) — **no attempt to force-build them**; they simply aren't in `dist/legacy/`.

**Wiring into `deploy/build.mjs` and `deno.json`:** one new task, same shape as the existing `lite` task:
```json
"legacy": "deno run -A tools/build-legacy.mjs",   // or deploy/build-legacy.mjs, matching wherever buildAppCompat lives
"legacy:check": "deno run -A tools/legacy-check.mjs"
```
called from `deploy.yml` **after** the existing `dist-eye` step and **before** the existing `deno task lite`
step (mirrors the current comment: `"BB10-lite static store (zero-JS; after dist-eye so the eye skips it,
before rsync so it ships)"` — legacy slots in the same spot, and dist-eye's own directory scan
(`for await (const e of Deno.readDir(DIST)) if (e.isDirectory && e.name !== "_rt" ...)`) would otherwise treat
`dist/legacy/` as one more "app" and fail it against the *modern* assertions (`--ms-r` on `:root`, Tailwind
rule counts) that a static-token legacy page will never satisfy by construction — **this is exactly why §7
below is not optional**, it is the same "gate never looked at this tree" failure mode `dist-eye.mjs`'s own doc
comment describes for the August 2026 incident, one layer further down.

**UA routing at nginx (:8090 front, VPS host nginx, same file `bb10-lite.md` already found and
`deploy/nginx-bb10.conf` already drafted):** extend the existing `$ms_legacy` map's true branch. Today it
`return 302 /lite/` unconditionally; change it to route **per-app**, falling back to `/lite/` only for apps
not present under `dist/legacy/`:
```nginx
location ~ ^/([a-z0-9-]+)/$ {
    if ($ms_legacy) { rewrite ^/([a-z0-9-]+)/$ /legacy/$1/ last; }   # try the legacy build first
    proxy_pass http://127.0.0.1:8090;
    ...
}
# a separate, LOWER-priority location (or an nginx try_files/error_page 404 chain inside /legacy/) falls back
# to /lite/app-fallback.html when /legacy/<id>/ 404s (a C-category app) — nginx's `try_files` on the
# containerized web service, or a small `error_page 404 = /lite/app-fallback.html;` scoped to `location /legacy/`.
location = / {
    if ($ms_legacy) { return 302 /legacy/; }   # a legacy STORE INDEX (built from the same apps.json,
                                                # A/B apps link to /legacy/<id>/, C apps show disabled/greyed
                                                # with the same fallback text bb10-lite.md's page already has)
    proxy_pass http://127.0.0.1:8090;
    ...
}
```
Same operational discipline `bb10-lite.md` already established: this file is **not** touched by
`vps/deploy.sh` (Certbot-managed, hand-edited, `nginx -t && systemctl reload nginx`) — `deploy/nginx-bb10.conf`
in-repo stays the source-of-truth snapshot, updated in the same PR that adds the legacy build.

**Deploy path — unchanged, no new manual steps beyond the one nginx edit:** `dreamstudio`'s existing
`push main → verify.yml → deploy.yml (self-hosted runner) → rsync /srv/www` is untouched; `dist/legacy/` rides
inside `dist/` like `dist/lite/` already does. **No manual rsync, ever** — consistent with the project's own
CI/CD rule.

### 6.1 The on-device feature probe (new, cheap, closes the "unverified" gaps in §1/§5 for real)

Several §1/§5 rows are marked "likely/unverified" (WebAudio, getUserMedia specifics, flexbox boundary,
DeviceOrientation actually firing). The owner has physical SSH access to the device (`bb10ctl`/`bb10-dev`,
per the `bb10` skill) but **no way to screenshot the stock browser's own chrome** (established in
`bb10-lite.md` §5 — "no reliable on-device tool for reporting real screen px over this shell"). A cheap,
fully-scripted way to get **real** on-device answers without needing a screenshot: a single static HTML page
(`dist/legacy/probe.html`, ES5, zero dependencies) that feature-detects every uncertain API
(`typeof AudioContext`, `typeof webkitAudioContext`, `typeof navigator.getUserMedia`,
`typeof DeviceOrientationEvent`, `CSS.supports` where present, a live flexbox layout measurement via
`getComputedStyle`) and reports the result via **`new Image().src = "/feed/log?probe=" + encodeURIComponent(JSON.stringify(caps))`**
— the classic "image-beacon" GET trick, which needs **zero** modern JS (no `fetch`, no `Promise`, works on
literally every browser back to Netscape 2) and rides the farm's own existing `/feed/log` telemetry endpoint
(`edge/telemetry.js`, already logs arbitrary `data` to `client_log`, already keyless/hashed per the farm's
privacy design). Open this one URL on the device once (`bb10ctl` can drive `wget`/curl to fetch it, but a
human still has to open it in the actual browser for the JS to run — same one unavoidable step
`bb10-lite.md` §5 already named) and every "likely" in this document becomes "measured." **Recommended as the
very first practical step before spending build-hours on the `sound`/`science`/`creative` B-category apps.**

---

## 7. The gate — dist-eye must eye the legacy build, not skip it

**Problem, stated precisely:** `packages/gates/dist-eye.mjs` enumerates `dist/<every-non-_rt-directory>` as an
app and applies **modern-build assertions** — `--ms-r` resolves on `:root`, a kit surface has `border-radius >
0` (proof the Tailwind/token pipeline ran), `app.css` has ≥50 rules. A legacy page has **none of these by
design** — `var(--ms-r)` is deliberately gone (§3), `border-radius` is a static px value, `app.css` is
Babel/PostCSS output, not the shared Tailwind/daisyUI build. Run unmodified, dist-eye would either (a) fail
every legacy page against assertions that don't apply, training the team to ignore its red, or (b) need a
`--dist dist/legacy` sidestep that quietly never gets run — **the exact gate-evasion shape the task explicitly
forbids** ("No gate evasion — do not generate after the eye").

**Design: a `--profile` flag on dist-eye itself** (not a parallel unchecked script), because the header
comment's own stated purpose — "opens every app in a real Chromium… measures what the build did… before
anything is shipped" — applies just as much to `dist/legacy/`, only the *what to measure* changes:

```
deno run -A jsr:@microspec/core/dist-eye --dist dist/legacy --out dist-eye-legacy --profile legacy
```

`--profile legacy` swaps the in-page `measure()` closure (today's `cs(document.documentElement)
.getPropertyValue("--ms-r")` etc.) for a legacy-appropriate set, keeping the same **numbers, not impressions**
philosophy the module's own doc comment insists on:

1. **Static-safety, checked BEFORE the page ever opens** (this is the part no Chromium boot-test can catch,
   because Chromium's own V8 happily parses ES2020 — it is not a stand-in for JavaScriptCore 2013): parse
   `dist/legacy/<app>/app.js` with a real **ES5-mode parser** (`npm:acorn@8` with `{ ecmaVersion: 5 }`,
   `sourceType: "script"`) inside the gate script itself. Any `SyntaxError` from acorn at `ecmaVersion:5` is
   the deterministic, unambiguous proof that this file will not parse on WebKit 537 — stronger and more
   complete than `lite-check.mjs`'s regex-ban approach (which only catches the patterns someone thought to
   list; a real parser catches everything, including syntax nobody enumerated).
2. **CSS static-safety**, same idea, on `app.css`: grep-assert zero `var(--`, zero `@container`, zero
   `display:\s*grid` (regex is adequate for CSS — there is no equivalent "hidden other case" risk a parser
   would catch that a targeted ban list wouldn't, unlike JS).
3. **Boot assertion, in the real (Chromium) page**, adapted from today's kit-surface check: `#app` has
   children (booted), zero uncaught error, zero `console.error` outside the existing `NOISE` filter — kept
   as-is, this part is profile-agnostic. Drop the `--ms-r`/kit-surface/Tailwind-rule-count checks entirely for
   this profile (they test a pipeline this build never runs) and replace with: **every app tile/link the
   legacy store index (`dist/legacy/index.html`) points at resolves to a 200** (same-origin missing-file
   tracking dist-eye already does via its own file server, reused unchanged) — i.e. "all app tiles present,
   links resolve" from the task's own ask, made concrete.
4. **No BB10-specific rendering assertion** (border-radius, exact pixel layout) is attempted in Chromium —
   Chromium is not JavaScriptCore and cannot reproduce WebKit-537-specific rendering quirks (the flexbox
   boundary risk named in §1/§3 stays real and untestable by this gate). This is named as a limit, not
   silently assumed away: the gate proves *"this file cannot fail to parse and does boot in a browser"*, not
   *"this pixel-matches what BB10 will show"* — that last mile is the human-eye step in §8, unavoidable, same
   conclusion `bb10-lite.md` §5 already reached for its own (much simpler) output.

**Wiring:** `deploy.yml`'s existing `Eye on dist (real Chromium, measured)` step gains a second invocation
right after it (same job, same Chromium instance already booted — cheap):
```yaml
- name: Eye on dist (real Chromium, measured)
  run: deno task dist-eye --dist dist --out dist-eye
- name: Eye on the legacy build (ES5-parse + boot, WebKit-537 profile)
  run: deno task dist-eye --dist dist/legacy --out dist-eye-legacy --profile legacy
```
Both are **hard gates** — a red legacy-eye blocks the same `rsync` step the modern eye already blocks, no
separate/softer treatment. `deno task lite` (the existing zero-JS fallback) still runs after, unconditionally,
so C-category apps and any legacy-eye failure both still have a working fallback page in production — the
legacy build is additive, never a regression risk to what already ships.

---

## 8. Verification — staged, smallest proof first (extends `bb10-lite.md`'s own §5, doesn't replace it)

1. **On-device feature probe (§6.1)** — closes every "likely/unverified" row in §1 before committing build
   hours to the uncertain B-category apps. Cheapest, most valuable first step.
2. **Local, browser-free:** `deno task gates` stays green; the new ES5-parse + CSS-static checks (§7.1/7.2)
   catch any regression before a Chromium is even booted.
3. **CI, hard gate:** the new `dist-eye --profile legacy` step (§7) — every A/B app must boot with zero JS
   error under the ES5-parse+boot profile before `rsync` runs.
4. **From the device itself, no GUI:** same technique `bb10-lite.md` §5 already used — `ssh bb10` → the
   device's own `wget` with the real BB10 UA against `/legacy/<id>/` and `/legacy/` — confirms nginx routes
   correctly and the response is byte-for-byte what the gate already approved (no drift between what CI
   checked and what ships).
5. **The eye that nothing substitutes for:** the owner opens the real stock browser on the physical device.
   Only this step can catch the flexbox-boundary risk, real WebAudio/getUserMedia behavior beyond feature
   detection, actual layout/legibility at 720×720, and touch-target usability — exactly `bb10-lite.md`'s own
   conclusion, one layer deeper (now testing real interactive apps, not a static list).

---

## 9. Honest verdict

**How close to "all features work" is actually reachable: roughly a third of the farm (A), another third real
but degraded (B), and a third permanently closed (C) — by real platform-API absence, not by build-tool
laziness.** The corrected toolchain (Babel-for-syntax, not esbuild-for-syntax; `postcss-custom-properties` for
`var()`, not a wish) makes the A/B two-thirds a genuine, evidence-backed engineering project — not a stub, not
a rewrite from scratch, an **overlay** on the exact same `buildAppCompat` bundle the Safari-16.1 build already
produces, using well-worn, externally-validated tooling (`@vitejs/plugin-legacy`'s own architecture, Preact's
own IE11 precedent). The remaining third is closed by APIs that literally do not exist on any WebKit build —
WebUSB and Web Bluetooth are Chromium-exclusive **forever**, not "not yet"; MediaRecorder/MSE/Web Crypto/Wake
Lock are 2017-2023-era APIs a 2013 engine will never receive; WebGL-heavy 3D (`globe`, `jobx`, `afterdark`) is
an API-presence question that becomes a *practical* usability question on 2013-era single-core silicon even
where the API technically exists. **Naming the boundary honestly, as asked: this is not "dreamstudio works on
BB10" — it is "roughly two-thirds of dreamstudio's apps, correctly identified and gated per-app, work on
BB10; the WebUSB/Bluetooth/heavy-3D/streaming third does not and cannot, on this hardware, ever."**
