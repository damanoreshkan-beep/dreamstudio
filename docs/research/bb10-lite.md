# RESEARCH — BB10-lite mode for the dreamstudio store

**Goal.** A minimal, staged plan so the stock BlackBerry 10 browser (BlackBerry Classic, OS 10.3.3.2205)
gets a readable, usable app list at `dreamstudio.mooo.com` instead of a blank white screen. Research +
design only — no app code touched, nothing pushed.

**Trigger.** Owner opens `dreamstudio.mooo.com` on a real BlackBerry Classic: blank/white screen.

## 1. Root cause — confirmed against the real boot path

Traced via the codebase graph (`packages/runtime/index.js` `start()`, `home-mrx-microspec` project) and by
reading the actual shipped files (`dreamstudio/dist/store/index.html`, `app.js`, `app.css`) and the SOURCE
(`dreamstudio/apps/store/index.html`).

**The user's import-map hypothesis is half right, half already fixed:**

- SOURCE (`dreamstudio/apps/store/index.html:34-51,87-94`) really does author `<script type="importmap">`
  (esm.sh: preact, htm, nanostores, motion, three, d3-geo…) and `import spec from "./spec.json" with
  { type: "json" }`. **VERIFIED** — this is exactly what the hypothesis describes.
- But that is dev-only. The **deployed** artifact (what a browser actually fetches) is produced by
  `deploy/build-app.mjs` (`buildAppCompat`), which already exists to fix a DIFFERENT, less-ancient compat
  problem (Safari 16.1.1, see `docs/RESEARCH-safari16-compat.md`): it runs `deno bundle --platform browser
  --minify` and rewrites `index.html` to a plain `<script type="module" src="app.js"></script>` with **no**
  `importmap`, no `with {type:json}` (confirmed: `grep -rl "importmap" dist/` → zero hits; `dist/store/app.js`
  has zero `import ... from` statements — it is one 561-line bundled+minified file). A per-app "compat gate"
  (`build-app.mjs:88-95`) fails the build if any of `with{type`, `type="importmap"`, tailwind-CDN leaks into
  `dist/`. **So the import-map/import-attribute part of the hypothesis is REFUTED for what BB10 actually
  receives** — it was already engineered away, just for a different (2022-era) target.

**What actually reaches BB10, in order of how hard each is to fix:**

1. **`<script type="module" src="app.js">` itself — sufficient alone.** WebKit 537.35 (2013) predates the
   `type="module"` script type entirely (shipped Safari 10.1 / Chrome 61, 2017). Per the HTML spec, an
   unrecognized script `type` is simply never executed — no console error, no fallback: this alone explains
   a page with zero interactive JS. **VERIFIED** (dist/store/index.html:89, dist/air/index.html:58, and
   every other app — identical pattern, farm-wide).
2. **The bundled JS is ES2017+ syntax — a hard parse (SyntaxError) failure, not a missing-API failure.**
   Even if `type="module"` were ignored and treated as a classic script, WebKit 537.35 (pre-ES6, ~2013
   JavaScriptCore) cannot parse arrow functions, `let`/`const`, template literals, `class`, optional chaining,
   nullish coalescing, spread/rest, or `async`/`await` — a SyntaxError aborts the whole script, nothing after
   it runs. Measured directly in the shipped `dist/store/app.js`: **830** `=>`, **1063** template-literal
   backticks, **219** `async`/`await`, **215** `?.`, **41** `??`, **66** `...` spreads, **546** `const`/`let`.
   This is consistent with `docs/RESEARCH-safari16-compat.md`'s own note ("everything else the farm uses —
   private fields, `?.`, `??`, `.at()`, top-level await — is ≤ Safari 15.4") — that floor is 2022-era Safari,
   ~9 years newer than BB10's engine. `deno bundle` (the farm's only bundler) **has no `--target` and does not
   downlevel syntax** (proven in that doc's own F1 finding) — bundling cannot fix this, only a real
   ES5-transpile (Babel/SWC, a Node toolchain) could, and even then the runtime APIs below would still be
   missing.
3. **CSS custom properties collapse the chrome, independent of JS.** Every app's inline boot-shell CSS and
   the built `app.css` lean on `var(--color-base-200,#000000)` etc. — `dist/store/app.css` alone has **1194**
   `var(--…)` uses; the inline `<style>` in every `index.html` sets `background:var(--color-base-200,#000000)`
   on `html,body`. CSS custom properties shipped in Safari 9.1 (2016) — WebKit 537.35 predates them. A CSS
   engine that doesn't understand `var()` treats the whole declaration as invalid (not "fall back to the
   literal in the parens" — the fallback is part of the same unparseable function syntax) and drops it, so
   `background` reverts to the UA default (transparent → white body), never black. This is the literal reason
   the failure is a **white** screen and not a black one with a stuck spinner. Also present and equally
   unsupported: `color-mix(in oklch, …)`, `@container` queries, `env(safe-area-inset-top)` — all silently
   dropped, never crash, just invisible.
4. **`fetch` is used but never reached.** `packages/runtime/sealedfetch.js`/`usage.js` call `fetch`, which
   WebKit 537.35 also lacks (shipped Safari 10.1/2017) — moot as a boot blocker since nothing runs, but
   relevant for what a lite build must use instead (XHR, or nothing at all — see the plan).

**Conclusion:** the blank screen is over-determined — three independent, unrelated technologies (ES module
loading, ES2017+ syntax, CSS custom properties) each alone guarantee it, on a browser ~11 years older than
the farm's already-established compat floor (Safari 16.1.1). No bundler/`--target` flag in the Deno-native
toolchain closes an 11-year gap; the only real options are described in §4.

## 2. BB10 capability matrix

**Device UA — VERIFIED, read directly off the device** (`ssh bb10` → PPS object
`/pps/services/browser_user_agent`, not inferred from public tables):

```
Mozilla/5.0 (BB10; Touch) AppleWebKit/537.35+ (KHTML, like Gecko) Version/10.3.3.2205 Mobile Safari/537.35+
```

Device: `uname -a` → `QNX BLACKBERRY-9D0A 8.0.0 2016/12/12-22:40:53EST MSM8960_V3.2.1.1_F_CLASSICATT_Rev:11
armle` (BlackBerry Classic, QNX 8, OS 10.3.3.2205). Screen: 720×720 (BlackBerry Classic spec, INFERRED from
model — not independently re-measured this session).

| Feature | Support | Source |
|---|---|---|
| WebKit engine, JavaScriptCore JS engine (not V8/Blink) | present | UA string; [firt.dev/blackberry-10](https://firt.dev/blackberry-10/) |
| ES6/ES2015+ syntax (arrow fns, `let`/`const`, classes, template literals, `?.`, `??`, spread, async/await) | **absent** — parse-time SyntaxError | multiple sources agree BB10 JS is ES5-only; cross-checked against the measured syntax counts in §1 |
| `<script type="module">` / ES modules | **absent** (predates Safari 10.1/Chrome 61, 2017) | [caniuse: es6-module](https://caniuse.com/es6-module) |
| `<script type="importmap">` | **absent** (Safari 16.4+/Chrome 89+, 2021-2023) | general knowledge, not separately re-verified — moot per §1 (dist doesn't ship one) |
| `fetch()` | **absent** — BB10 browser uses XMLHttpRequest only | web search corroborated by multiple sources (BB10 forums/dev discussions); no fetch polyfill shipped |
| `Promise` | **absent/unreliable** — BB10-era WebKit predates native Promises | web search (BB10 dev forum thread on ES6 Promise support) — labelled INFERRED, not device-tested this session |
| CSS custom properties (`var()`, `--*`) | **absent** (Safari 9.1+, 2016) | [caniuse: css-variables](https://caniuse.com/css-variables) |
| CSS `@container` queries, `color-mix()` | **absent** (2022-2023 era) | general web-platform knowledge |
| Flexbox (unprefixed, modern syntax) | risky/partial — BB10-era WebKit is right at the boundary of old (`-webkit-box`) vs. new flexbox syntax | not verified this session; **the lite build avoids flexbox entirely** (block/inline-block only) rather than resolve this |
| Service Worker | absent, but harmless — runtime guards with `if ("serviceWorker" in navigator)` | `packages/runtime/index.js` `registerWorker()` — feature-detected, not a boot blocker |
| WebGL, IndexedDB, FullScreen API, getUserMedia, Vibration API | present | [firt.dev/blackberry-10](https://firt.dev/blackberry-10/) — irrelevant to the store list, noted for completeness |

**Also found on the device (not part of this task, noted for context):** `/accounts/1000/shared/misc/berrybrowser`
— a sideloaded Chromium `content_shell` ("Berry Browser", modern engine) from an earlier session's
BB10-modernization effort (see the `bb10` skill). That is a parallel, separate path (a real modern browser
replacing the stock one) and is out of scope here — this task is specifically about the **stock** browser.

## 3. Telemetry findings

**Checked, found empty — and structurally has to be.** Queried the farm's own Postgres telemetry
(`ssh vps` → `docker exec microspec-db psql -U edge -d edge`, table `client_log`, per
`microspec-expert`'s documented `/feed/log` pipeline):

- `select count(*) from client_log where ua ilike '%BB10%' or ua ilike '%QNX%'` → **0 rows**.
- Table has 732 rows total, 2026-09-03 → 2026-09-14. No square 720×720 viewport rows either.
- An earlier broader query (`ua ilike '%webkit/537%'`) returned 728 rows — but that pattern is a false
  trail: modern Chrome/Edge/Android WebView freeze their UA at `AppleWebKit/537.36` (a frozen, unrelated
  string), so it matches almost all Chromium traffic, not old WebKit. Confirmed by inspecting the actual UA
  strings returned (all modern Android/Chrome/Telegram-in-app browsers).
- Checked the VPS nginx (`microspec-web`) access logs too, in case a raw page-load (not a telemetry POST) was
  captured — but that log's retention is short (only from 2026-09-14 22:17 in the current log buffer) and
  shows no BB10/QNX hits in that window. **UNKNOWN beyond that window** — not evidence of absence, just
  outside retention.

**Why zero is the structurally-expected answer, not evidence of no visits:** the telemetry beacon
(`installTelemetry`, `installUsage`) is wired inside `packages/runtime/index.js`'s `start()` function — the
*same* bundled `app.js` that fails to parse/execute per §1. **VERIFIED via the graph**
(`home-mrx-microspec.packages.runtime.start`, `index.js:120-134`): `installTelemetry(spec.id)` and
`installUsage(S)` are literally the 4th/5th statements inside `start()`, called synchronously before the
Preact `render()` call. If the module never parses, `start()` never runs, and neither does the telemetry
that would have reported the failure. **This is a chicken-and-egg gap in the farm's own error collection**:
it can catch a runtime exception in a booted app, but it cannot see a browser that never got far enough to
boot at all. Worth a one-line note in `docs/GATE_BLINDSPOTS.md` when this ships, independent of the BB10
work.

## 4. Architecture actually serving the domain (corrects stale docs)

Verified live (not from the skill file, which is stale on this point): `dreamstudio.mooo.com` resolves via
plain **A record → 74.208.61.210** (the VPS), **not** a GitHub Pages CNAME (`dig CNAME` → ENODATA). A `fetch()`
with the exact BB10 UA returned `server: nginx/1.24.0 (Ubuntu)` — the **host** nginx on the VPS, not the
`nginx:1.27-alpine` container. Confirmed the chain by reading the actual configs:

- Host nginx, Certbot-managed, `/etc/nginx/sites-enabled/dreamstudio` on the VPS: `location /` →
  `proxy_pass http://127.0.0.1:8090` (everything else — `/feed/*` — goes to the edge `core` service on 8787).
- `127.0.0.1:8090` is the **containerized** `microspec-web` (`edge/compose.yml`'s `web:` service, nginx:1.27-alpine),
  serving `/srv/www` (bind-mounted `:ro`) as its docroot.
- `/srv/www` on the VPS **is** the deployed `dist/` mirror (same `_rt/`, `air/`, `ambient/`… layout, a
  `.nojekyll` marker carried over from the dual GH-Pages-compatible build) — landed there by the dreamstudio
  `deploy.yml` running on a **self-hosted GitHub Actions runner physically on this VPS**
  (`~/actions-runner*/_work/dreamstudio/dreamstudio` — several runner instances present), not by a GitHub
  Pages CDN push. The skill's "custom domain → GitHub Pages" line describes an earlier or parallel state; the
  live path today is VPS-native end to end.

**This matters for the plan:** because a real, owner-controlled nginx sits in front of every request, **UA
sniffing does not have to be done client-side in JS** (which cannot run reliably on the very browser we are
detecting) — it can be done once, server-side, in the reverse proxy, which is the most robust place to put it.

## 5. The plan — staged, minimal

**Chosen approach: build-time pre-rendered static ES5/no-framework page + host-nginx UA routing.**
Rejected alternatives, with reasons:

- **Transpiled legacy bundle (Babel/SWC → ES5 + polyfills for the real SPA).** Rejected: `deno bundle` (the
  project's only bundler) cannot downlevel syntax (proven in `docs/RESEARCH-safari16-compat.md` F1 — "No
  `--target`"); adding Babel/SWC means a Node toolchain, which this Deno-native, zero-`node_modules` project
  deliberately avoids. Even done, the result would need `fetch`/`Promise` polyfills and would still be a
  heavy SPA on a single-core 2013 ARM chip, for a task that is just "list ~83 apps and let me tap one."
  Wildly disproportionate to the value.
- **Client-side UA-sniff + XHR-rendered list.** Rejected as the *primary* mechanism: it still requires some
  JS to execute reliably on the one browser we have zero confidence in (zero telemetry, and BB10-era WebKit
  has known-flaky ES5 DOM edge cases per firt.dev). A page that needs no JS at all to show its content is
  strictly more robust, and costs nothing extra to build since the data (`apps.json`) is already static.
- **Chosen: pre-render at build time, route by UA at the edge.** The app list rarely changes and is already
  fully described by the existing static `dist/store/apps.json` (83 entries, each with `id, title, titles,
  tagline, bg, fg, href, category` — plain hex colors, no CSS vars needed). Baking it into plain HTML at
  build time means the BB10 page needs **zero working JavaScript** to be useful — the strongest possible
  floor given the telemetry blind spot in §3.

### Files to add (next pass — none created this session)

1. **`deploy/build-lite.mjs`** (new, Deno-native, no Node) — reads the same app metadata `deploy/manifest.mjs`
   already collects (reuse, don't refetch) and emits:
   - `dist/lite/index.html` — one static page: plain `<ul><li><a href="/<id>/">Title</a> — tagline</li>…</ul>`,
     inline hex colors from each app's `bg`/`fg` (no `var()`), system-font stack, no external `<script>`/font
     `<link>`, no flexbox (block/inline-block layout only), a `viewport` meta (`width=device-width,
     initial-scale=1` — no `viewport-fit=cover`). Category headers as plain `<h2>`.
   - `dist/lite/app-fallback.html` — ONE shared static notice page ("Ця апка потребує сучасного браузера —
     відкрий dreamstudio.mooo.com на іншому пристрої"), used for every `/<id>/` hit from an old-WebKit UA
     instead of trying to run that app's real (JS-only) page. Kept generic/unpersonalized on purpose — no
     per-app templating needed, one file.
   - Wire as a new step in `deploy/build.mjs` (a plain function call after the existing per-app loop) or a
     new `deno task lite` node in the 8n8 registry — matches how `build-app.mjs`'s compat pass was wired in.
2. **A compat gate, same shape as `build-app.mjs`'s** (`docs/RESEARCH-safari16-compat.md` precedent): a small
   Deno script/test asserting `dist/lite/*.html` contains none of `var(--`, `` ` ``, `=>`, `type="module"`,
   `fetch(`, `@container` — fail loud on regression, exactly like the existing per-app leak check. Fold into
   `preflight.mjs` or a new tiny `deploy/lite_test.mjs` run by `deno task gates`.
3. **Host nginx change** (`/etc/nginx/sites-enabled/dreamstudio` on the VPS — Certbot-managed, confirmed
   **not** currently git-tracked anywhere in `edge/`; propose adding a tracked copy at
   `edge/vps/nginx-dreamstudio.conf` as source of truth going forward, applied by hand like the existing
   Certbot-managed file already is):
   ```
   map $http_user_agent $ms_legacy {
       default   0;
       ~*BB10    1;
       ~*QNX     1;
   }
   # inside the existing `server { listen 443 ssl; ... }` block, ahead of the generic `location /`:
   location = / {
       if ($ms_legacy) { return 302 /lite/; }
       proxy_pass http://127.0.0.1:8090;
       proxy_set_header Host $host;
       proxy_http_version 1.1;
   }
   location ~ ^/([a-z0-9-]+)/$ {
       if ($ms_legacy) { rewrite ^ /lite/app-fallback.html last; }
       proxy_pass http://127.0.0.1:8090;
       proxy_set_header Host $host;
       proxy_http_version 1.1;
   }
   ```
   (`if` here only ever does a bare `return`/`rewrite … last`, the one usage pattern nginx's own docs consider
   safe despite the general "if is evil" warning — still, `nginx -t` before every reload, and this is a
   one-time hand-edit like the Certbot block already is, not something `vps/deploy.sh` currently touches.)
4. No changes to any of the 83 apps' own `spec.json`/`view.js`/`index.html`. No changes to `packages/runtime/`.

### How it deploys

Nothing new: `dist/lite/` is emitted by the existing `deploy/build.mjs` run, which already ships everything
under `dist/` to `/srv/www` via the current dreamstudio `deploy.yml` (self-hosted runner on the VPS, §4) —
the lite page rides the exact same pipe as every other static asset. The **only** manual, one-time step is
the nginx site-config edit in §5.3, on the VPS, applied and `nginx -t && systemctl reload nginx`'d by hand —
consistent with how the Certbot-managed file is already maintained (never touched by the automated deploy).

### Verification (staged, smallest proof first)

1. **Local, browser-free:** `deno task gates` stays green; the new lite-compat check (§5.2) catches any
   accidental modern syntax/CSS in the generated files before it ever reaches a device.
2. **Server-side, from the device itself (no GUI needed):** `ssh bb10` → run the device's own `wget`
   (`/accounts/1000/shared/misc/clitools/bin/wget`, confirmed present) with
   `--user-agent="Mozilla/5.0 (BB10; Touch) AppleWebKit/537.35+ (KHTML, like Gecko) Version/10.3.3.2205 Mobile Safari/537.35+"`
   against `https://dreamstudio.mooo.com/` and one `/<id>/` path — confirms the nginx `map`/`rewrite` actually
   fires for the real UA and returns the lite/fallback HTML, and lets a quick grep confirm zero `var(--`,
   `=>`, `type="module"` in the response, all without needing the device's GUI browser at all.
3. **The eye — the step nothing else substitutes for:** ask the owner to open the actual stock browser on
   the BlackBerry Classic and look. Only a human looking at the physical 720×720 screen can confirm real
   legibility/tap targets; no headless tool on this device can screenshot its own browser chrome.
4. Optionally, once §5 is live, re-check `client_log` for a `BB10`/`QNX` UA row appearing over the following
   days — if the lite page is reached via the fallback path only (no JS at all), it will still show zero
   telemetry rows by design; that is expected and not a red flag.

## Open items / risks (flag, don't guess)

- Flexbox support boundary in BB10-era WebKit is UNKNOWN precisely — the plan sidesteps it entirely
  (block/inline-block only) rather than resolving it.
- `Promise` support on-device is INFERRED from forum discussion, not independently tested; irrelevant since
  the lite page plan uses no JS at all.
- The host nginx file's `if`-based rewrite should be smoke-tested with `nginx -t` and a couple of `curl`/`wget`
  probes (from the VPS itself, or from the device) before reload, per the manager rulebook's "verify through
  the path real traffic takes" rule — do not trust the config on read-through alone.
- BlackBerry Classic's 720×720 screen size is taken from the known hardware spec (INFERRED), not re-measured
  from the device this session (no reliable on-device tool for reporting real screen px over this shell was
  attempted, since it was out of scope for a research pass).
