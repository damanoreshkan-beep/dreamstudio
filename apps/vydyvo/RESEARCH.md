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

## The characters (their own choice since 2026-09-04; the theme decided until then)

2026-09-02 the farm theme was the world ("у нас все тема рішає"). 2026-09-04 the owner decoupled them: "не
будемо прив'язуватись до теми, давай зробимо окремий вибір персонажів мікрокартинками … сіткою, тикаємо і
відкривається на весь екран". `worlds.js` still carries the twelve WORLDS (a default subject, a NIGHT and a
DAY light block, a mood TINT for the owner's own words, 70/30), but the active one is now `opts.char`
(`activeWorld()` in state.js, `lum` until a pick), chosen in a GRID of square micro-pictures over the stage
(`CharGrid` in view.js: `assets/char-<id>-<n|d>.webp`, 512², generated ONCE on the pods with the show's own
prompt — an instant grid, no quota per visitor; the tile shows the mode's picture, is named by the side the
phone's mode shows (`NAMES`, `nameOf`) with the other side small, and a tap picks AND opens the show).
The phone's theme still decides day or night — the light in the picture and WHICH side speaks. Each world
is a character with two sides (`voiceDay`/`voiceNight`, `voiceOf(world, mode)`) that leads the line spark
as «Голос: …»; the edge's line mode holds its manner in plain human words without naming it. THE SPIRIT
SPEAKS ABOUT LIFE, NEVER ABOUT LIGHT (owner 2026-09-04: "слова мають не бути про світло чи тінь, а ніби
сама тіньова чи світовий дух говорить"): the voices name what the persona cares about (attention, memory,
patience, change, ties), the picture's subject no longer rides the spark, and the edge prompt forbids
light/darkness/shadow/glow/night/day and the picture itself as topics. The twelve, day / night: Будда /
Дух луни · Майстер орігамі / Літописець · Поет хайку / Каліграф · Алхімік / Двійник у дзеркалі · Вітер /
Шаман · Вишивальниця / Пряля долі · Інженер-мрійник / Машина, що снить · Небо / Сторож ночі · Скульптор /
Чорна вода · Гончар / Хранитель крихкого · Мандрівник / Море · Стоїк / Тиша. The client composes:
`[user prompt → English | world.subject], world[mode], SYSTEM[mode], SYSTEM.base` — where `mode` is read
off `html[data-theme]` at the moment the race starts (the light/dark theme drives the light in the picture,
which is the owner's "система промпт на клієнті"). `SYSTEM.base` is the wallpaper contract (full-bleed, no
text, off-centre subject, breathing space). The whole prompt is ≤ 800 chars (the edge slices there,
`edge/image.js:473`). The island stays MINIMAL (owner: "залиш лише те що реально потрібно"): words + Показ,
then status/settings + save + wand — no theme label, the whole page already wears the theme; since
2026-09-04 the character grid sits above the island. Frames carry the world id as `preset`. A frame FITS the page
only when its mode AND world match the document (2026-09-02, owner: a theme change shows the waiting
field, never the old world's picture): the veil, `advance`'s preference and the scheduler's `ahead` all
compare both, the veil fades in over the retiring picture, and its motes take the active theme's
`--color-accent`.

## Nothing is kept (the collection removed, owner 2026-09-04)

Until 2026-09-04 every landed frame was kept as a blob in IndexedDB and the show cycled the collection when
the GPU said no. The owner saw the same pictures again and again: "не зберігай і не накопичуй в db нічого,
постійно свіже, а те що пішло то ніколи не повернеш … на клієнті не кешуй, бо я бачу одне і те ж". Now: no
IndexedDB, no restore, no cycling. Frames live in memory only — the one on stage, the one fading out (kept
for the cross-fade) and the fresh ones painted ahead (`CAP` = 6 as a memory ceiling); `present()` frees every
shown frame that is neither of the two on stage; `advance()` picks only a FRESH frame and otherwise leaves the
stage as it is — the drift keeps the last picture alive until the next race lands. Two fresh frames are kept
"ahead"; when fewer, a race starts. The gate's proof of the wand is `data-vy-ahead` on the stage (the count of
fresh frames), not a collection count.

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
