# Видиво — a living screensaver (research + decisions, 2026-09-01)

Owner: "фіча заставки … автогенерація нового зображення на основі промпту плавно з таймером показу. Поки
показується — генерується нове у фоні. Full size екран повністю. Нова апка. Проста якісна апка. Motion.
Стилі — власні унікальні пресети незвичайні в моєму стилі глибокого смислу, щоб враховувалась світла чи
темна тема з системним промптом на клієнті. Преміум." Then: "на весь екран з режимом не гасіння екрану",
"не саме зображення голе", and the trick: "частину DOM показувати поверх" — Fullscreen on the STAGE
subtree, so the chrome outside it vanishes and every overlay lives inside it.

Every load-bearing fact below names where it was read. UNVERIFIED items are at the end; the build does not
depend on them.

## The generation contract (mirage's, reused verbatim)

- `POST ${VPS_PROXY}/image` `{ prompt, quality: "fast"|"2k", aspect: "screen", ratio, seed, k, model }` →
  `{ job }`; `k > 1` selects the SLIDES protocol and is the ONLY path that honours `aspect`/`ratio`
  (`microspec-edge/edge/image.js:481-482` — `geo` exists only when `k > 1`). Poll
  `GET /image/get?job=` every 1.5 s, ≤135 polls (~200 s, `apps/mirage/race.js:8`); the JSON carries
  `{ status, got, slides[{n,w,h,by}], stage, pct… }`; each landed slide is `GET …&n=<i>` → image bytes
  (`edge/image.js:393-410`). `status:"error", error:"busy"` = every Space queued out (`race.js:45`).
  `POST /image/cancel {job}` stops a race nobody will watch (`race.js:52`).
- `aspect:"screen"` + `ratio = clamp(innerWidth/innerHeight, 0.3, 3)` (`apps/mirage/state.js:155`) → the
  edge sizes the picture to the phone's own shape, both axes capped together, multiples of 64
  (`edge/image.js:172-180`: fast ≈ 1024² budget, 2K ≈ 2048²; a 0.46 phone at 2K = 960×2048).
- **`k: 2`** here, not mirage's 4: a screensaver wants a steady trickle, and two frames per race halves the
  number of races per hour for the same GPU spend per race. Both frames enter the collection.
- Signed-in only: the route runs `requireUser` (`edge/image.js:472`); a 401 with `"sign in"` bumps the
  runtime's `authWall` and the shell opens the sign-in screen by itself (`packages/runtime/authwall.js`,
  `sealedfetch.js:204`). The app still gets its 401 → it shows `eSignIn` and backs off 10 min.
- Rate limit is per IP (`rateOk`, `edge/image.js:469`); ZeroGPU quota is per pod IP with VPN rotation
  (memory: anon ≈ 2 GPU-min/day). So: **back off** on `busy`/429/timeout (5 min), and **keep showing the
  collection** — the screensaver never stops because the GPU did.
- `holdBackground({title, body})` around the follow (`apps/mirage/state.js:109`) keeps the APK's process
  warm while a race runs in the background; released on every exit path.
- Prompt to English first (`toEnglish`, `/_rt/translate.js`, fail-open — `state.js:148`).

## Fullscreen, the trick, and staying awake

- `element.requestFullscreen({ navigationUI: "hide" })` on the STAGE element: a top-layer element is drawn
  alone, so the header and dock (outside it) are gone and everything inside it — clock, the line, the
  exit tap — stays. Precedents: tide's screensaver (`apps/tide/view.js:332-345`), mirage's lightbox
  (`apps/mirage/lightbox.js:30-36`). `fullscreenchange` → when the browser leaves fullscreen (ESC, system
  Back) the app closes its route, so state and display never disagree.
- **Fallback is the same subtree**: when Fullscreen is unavailable (the shell's WebView shows no
  `onShowCustomView` — `template/app/src/main/java/apk/microspec/MainActivity.java` has none; iOS Safari
  has no element fullscreen) the stage becomes `position: fixed; inset: 0; z-index: 60` over the chrome —
  identical look, and it is what the headless gate exercises.
- Routing invariant: show mode is `S.screen === "show"` — history-backed by the runtime, Back exits
  (`packages/runtime/index.js:211`).
- Screen never sleeps: `wakeLock.acquire()` → `{ release }` (`packages/runtime/sensors.js:201-215`; it
  re-acquires on `visibilitychange`). Held for the whole show, released on exit. `needs: ["wakeLock","auth"]`
  as tide declares (`apps/tide/spec.json:7`).

## The stage

- The picture is `position: fixed; inset: 0; z-index: 0` behind the chrome in normal mode (tide's pattern,
  `apps/tide/view.js:406-412`) — the header is transparent since core 1.2.4, so the wordmark sits on the
  picture; controls are `relative z-10` in the fit view (`h-full min-h-0 flex flex-col`,
  `docs/AUTHORING.md:135`). `object-fit: cover` fills any shape; the 108 % oversize keeps the drift from
  ever showing an edge.
- Cross-fade: two `<img>` slots; the next frame loads into the hidden slot (`onload` fires before the swap)
  and opacity transitions 1.6 s. Motion: a slow drift (`scale 1 → 1.06`, `translate ≤ 1.5 %`) over the
  whole display period, direction alternating per slot; `prefers-reduced-motion` disables it. CSS only —
  no rAF, no WebGL: a screensaver runs for hours on a battery.
- "Not the bare image": a black bottom scrim under a typographic layer — the clock (Geist Mono, tabular),
  the date, the frame's LINE (AI-fresh per frame; offline a generic `l_1..l_6` fallback), the
  prompt as a small caption. Fixed white on purpose (wall's precedent, `apps/wall/view.js:178-180`): the
  layer sits on a photograph, not on a farm surface, and reads the same in both themes.
- Loading, never a spinner: `Pixels` + `Scramble` from `/_rt/skeleton.js` until the first frame exists.

## The world IS the theme (presets removed, owner 2026-09-02)

There is no preset UI: "в пресети прибери, то зайве, у нас все тема рішає … закласти це у систему самої
апки". `worlds.js` carries one WORLD per farm theme (`rt/themes.json` ids) — a default subject (used when
the prompt is empty), a NIGHT and a DAY light block, and a short mood TINT used when the owner's own words
drive the picture (70/30). The active world is `html[data-material]` (the profile's theme picker), read at
race time; before a registry loads, `lum`. The client composes:
`[user prompt → English | world.subject], world[mode], SYSTEM[mode], SYSTEM.base` — where `mode` is read
off `html[data-theme]` at the moment the race starts (the light/dark theme drives the light in the picture,
which is the owner's "система промпт на клієнті"). `SYSTEM.base` is the wallpaper contract (full-bleed, no
text, off-centre subject, breathing space). The whole prompt is ≤ 800 chars (the edge slices there,
`edge/image.js:473`). The island's second row names the active theme; frames keep the world id in their
old `preset` IDB field, so a collection painted before the change still restores.

## The collection

Every landed frame is kept as a blob in IndexedDB (`/_rt/db.js` `collection("vydyvo")`, records
`{ id, ...value, _ts }`, newest-first `all()`), capped at 24 (oldest SHOWN frames go first, their object
URLs revoked). On boot the collection restores and the show starts at once — offline, signed-out or
rate-limited the screensaver still has something to show. Two fresh (unshown) frames are always kept
"ahead"; when fewer, a race starts.

## Under the gate

`gate` (`/_rt/gate.js`) → no network: a race is a 90 ms wait that yields two deterministic gradient
frames (seed-derived hue data URIs, not persisted), throttled to one race per 3 s so the collection
fills without hammering. The e2e drives: a frame on stage (world named, no preset cards), settings
(timer + quality) and Back, show mode (fullscreen fallback + clock + line) and Back, the prompt persisting.

## Decisions (closed)

- New app, not a mirage mode (owner). id `vydyvo` («Видиво» — a vision, a sight). accent `#B9C8F2`
  (moonlit) — a MARK colour only.
- Default period 2 min, quality 2K (owner's standing default for mirage), `k: 2`.
- No preview server; ship through the real pipeline and judge with the eye.
- The race protocol moves to the core as `runtime/imagejob.js` (systemic: two apps now) — mirage keeps its
  copy until its next touch.

## UNVERIFIED / open

- Whether the shell's WebView honours `requestFullscreen` (no `onShowCustomView` found) — the fallback
  covers it; a device check decides if the shell should grow the callback.
- The exact 429 body from the edge (mirage reads the status only) — the app reads the status only.
