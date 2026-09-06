# Портал на Godot — усередині нашого APK-shell (дослідження, 2026-09-05)

Власник: «тачдизайнер хочу… не через веб, а просити встановити… але не окремий застосунок, у нас вже є
механізм збірки apk. там можна все». Нижче — що є, що дає Godot, як вони склеюються, і план по фазах.
Кожне твердження — з джерела; де джерела не було, стоїть «(перевірити)».

## 1. Що у нас є (shell)

- **Один шаблон APK, дві версії** (`microspec-edge/template/`, Java, AGP 8.5.2, `minSdk 24`, `targetSdk 31`,
  `namespace apk.microspec`): `lite` = WebView без мосту (27 КБ у base64), `full` = міст `__msShell` +
  системні можливості (1.39 МБ у base64, ~1 МБ APK). Збирається ОДИН раз у GitHub Actions
  (`build-template-apk.yml`, гілка `apk-template`), вбудовується як `edge/apk/template-{lite,full}.b64.js`,
  і **чистий Deno патчить його на кожен запит** (start URL, назва, іконка, package = digest URL, `bridge.json`)
  і підписує v2 (`edge/apk/sign2.js`). `jniLibs.useLegacyPackaging = true` → .so витягуються при інсталяції,
  тож перепакування в Deno не потребує вирівнювання сторінок (уже доведено на `libax56rf.so`).
- **Міст = каталог** `packages/shell/actions.json` (id, capability, call/subscribe, JSON-схеми, дозволи,
  `minBridge`, мок для гейта) → `deno task shell` генерує таблицю рантайму, `apk/java-gen.mjs` — `Catalogue.java`.
  Апка бачить усе лише через `/_rt/shell.js` (`has/why/call/subscribe`, версійне узгодження). Origin-lock на
  кожній навігації; `full` лише для наших origin-ів.
- Правило `rules/shell.md`: «Zero AndroidX, zero FCM, zero Play Services» — заради розміру. WebView сам по собі
  слабший за браузер (без Notification/Push; camera/mic — через `onPermissionRequest`).
- Web-половина будь-якого фіксу шелла не потребує переінсталяції (сторінка з github.io); Java — дорога половина.

## 2. Що дає Godot (факти)

- **Godot як бібліотека для чужого Android-застосунку** — офіційно: Maven `org.godotengine:godot:<v>`;
  `GodotFragment` у Activity, що реалізує `GodotHost`; проєкт з `assets/` або `--main-pack res://x.pck` через
  `GodotHost#getCommandLine()`; двосторонній звʼязок через `GodotPlugin` (`@UsedByGodot`-методи з GDScript,
  `emitSignal` у GDScript, `Engine.get_singleton("Name")`). Обмеження (дослівно): один інстанс Godot на процес;
  автоматичний resize/зміна орієнтації не підтримуються й можуть крашити.
- **Maven Central**: остання `4.7.2.stable` (є 4.5.2, 4.6.x). AAR `4.5.2.stable` = **100.7 МБ** (усі ABI:
  arm64-v8a, armeabi-v7a, x86, x86_64) → з `abiFilters 'arm64-v8a'` в APK іде ~¼. Залежності POM:
  `kotlin-stdlib`, **`androidx.fragment`** — тобто «Zero AndroidX» для цієї версії шелла доведеться зняти.
- **Камера**: `CameraServer` «реалізовано на Linux, Android, macOS, iOS»; Android-фід влито окремим PR
  #106094 (початковий #98416 розбили). NV12 з Camera2 → YUV-текстури, конвертація на GPU. Брати 4.7.2.
- **PCK**: `godot --headless --export-pack` дає `.pck` без збірки APK; у рантаймі
  `ProjectSettings.load_resource_pack(path)` або `--main-pack` (перевірити, чи `--export-pack` потребує
  експорт-шаблонів — у документації не сказано; у CI шаблони можна просто мати).
- **Редактор на Android** — офіційний, у Play Store (4.7.2), експортує/ставить APK на пристрої; обмеження:
  Forward+ не радять (беремо Mobile), UX не для телефонів. VisualShader — вузловий редактор шейдерів.
- Ліцензія MIT.

## 3. Як склеїти (архітектура)

```
 ┌──────────────── MainActivity (apk.microspec, flavour godot) ────────────────┐
 │  FrameLayout                                                                │
 │   ├─ GodotFragment  ── Vulkan Mobile, повний екран, камера через CameraServer│
 │   │      pck: portal.pck (завантажений з нашого origin, оновлюється як web)   │
 │   └─ WebView (прозорий фон) ── сторінка порталу з github.io: стрічка, ручки, │
 │          «Зберегти», прайминг; жести сцени → міст → Godot                    │
 │  ShellBridge  ── godot.* (каталог) ⇄ GodotPlugin "MsPortal" (signals)        │
 └──────────────────────────────────────────────────────────────────────────────┘
```

- **Третя версія шаблону `godot`** (flavour dimension `power` лишається): = `full` + `org.godotengine:godot`
  + `androidx.fragment`, `abiFilters arm64-v8a`. `lite`/`full` не змінюються ні на байт. Edge обирає `godot`
  лише для origin-ів наших апок, що оголосили `needs: ["godot"]` (portal). Розмір APK порталу ≈ 25–30 МБ
  (перевірити на першій збірці).
- **Godot під WebView**: WebView з `setBackgroundColor(0)`; сторінка в режимі shell-godot малює прозорий фон
  там, де сцена. Дотики: WebView споживає все → сторінка пересилає жести сцени мостом (`godot.input`:
  тап, пінч, фокус) — дешево і зберігає CamStage-логіку в web-половині (fullscreen = сховати острів + Godot
  на весь екран, без Android-fullscreen).
- **Камера — в Godot** (CameraServer), не у WebView: два власники одного сенсора не буває. Прайминг лишається
  web (CameraPrime), дозвіл CAMERA у маніфесті вже є.
- **Каталог `godot.*`** (capability `godot`, bridge N+1): `godot.start {pack, scene, params}`, `godot.stop`,
  `godot.set {key, value}` (параметри пресету/ручки → GDScript), `godot.input {type, x, y, scale}`,
  `godot.save` (Godot рендерить viewport → PNG → `MediaStore.Downloads` тим самим шляхом, що `files`),
  `godot.state` (subscribe: ready/fps/caps/error). У гейті — детермінований мок з каталогу, як у всіх.
- **PCK з продукту**: `godot/portal/` у репо продукту (сцени, VisualShader-пресети, GDScript), CI експортує
  `portal.pck` headless (Godot Linux-бінарник ~100 МБ у CI, GPU не треба) → `dist/portal/portal.pck` поруч із
  веб-апкою → шелл завантажує/кешує за версією. Оновлення пресетів = звичайний деплой продукту, без
  переінсталяції.
- **Що робить сам Godot, а не ми**: камера → текстура; feedback = `SubViewport` пінг-понг; трасування/штрих/
  композит = VisualShader-графи (вузли, не GLSL руками); bloom/тон — `Environment`/Compositor; збереження —
  `Viewport.get_texture().get_image().save_png()`. Оптичний потік у Godot вузлом нема (у TD є) — якщо знадобиться,
  це compute-шейдер у рушії, де це штатний інструмент; але спершу без нього: якір через feedback + `UV`-вузли.

## 4. Ризики (чесно)

1. **Godot-камера на Android у бібліотечному режимі** — Camera2 живе у Godot-плагіні; у `GodotFragment`
   всередині чужої Activity дозвіл питає хост. Перевірити на першій збірці.
2. **Один Godot на процес + orientation crash** — фіксуємо `portrait` у маніфесті (уже так).
3. **AndroidX у шелі** — лише у flavour `godot`; правило «Zero AndroidX» переписати як «lite/full — zero».
4. **Розмір і памʼять**: +25 МБ APK, Godot-рантайм ~100–200 МБ RAM; WebView поруч. На S25 норм; «старе залізо»
   = Mobile-рендер + `detail` як зараз.
5. **Пʼять ABI vs Deno-патчер**: `.so` у legacy-пакуванні стиснуті → патчер їх не чіпає (як з `libax56rf.so`).
6. **CI шаблону**: AAR 100 МБ тягнеться з Maven на кожну збірку шаблону (рідко) — ок.

## 5. План по фазах

- **Ф0 — цей документ; рішення власника** щодо: (а) flavour `godot` з AndroidX і +25 МБ; (б) камера в Godot;
  (в) 4.7.2.
- **Ф1 — шаблон `godot` + міст**: gradle flavour, `GodotFragment` під прозорим WebView, плагін `MsPortal`,
  каталог `godot.*` (start/stop/set/input/save/state), `Catalogue.java`, edge вибирає `godot` для `needs:godot`.
  Доказ: APK з `/feed/apk` для порталу ставиться на S25, Godot стартує з тестовим PCK (кольоровий квад +
  камера), `os` → Run all зелений на новому мосту.
- **Ф2 — Godot-проєкт порталу**: `godot/portal/` — камера → SubViewport-feedback → VisualShader-пресети
  (12 тем × 2 режими, ті самі текстури 1024²), параметри з `godot.set`, збереження; CI експортує PCK.
  Веб-портал у shell-режимі: прозорий фон, стрічка/ручки → міст. Доказ: 60 fps на S25 (Godot `Performance`
  через `godot.state`), матеріал тримається на поверхнях (feedback у просторі камери), «Зберегти» у Downloads.
- **Ф3 — глибина**: якщо якір потребує потоку — compute-шейдер у Godot; MediaPipe-маска — окреме рішення.
- **Поза shell** портал лишається веб-версією (pixi) як є — «просити встановити» = профільний рядок APK, який
  уже існує в кожній апці.

## 6. Ф2 як зроблено (2026-09-06)

Граф TD у вузлах Godot, `godot/portal/`:

- **Cam** — ColorRect із `shaders/cam.gdshader` на площинах самого feed (Y + CbCr, video range, BT.709), як є.
- **LoopA / LoopB** — два прозорі SubViewport, пінг-понг: `_process` вмикає один `UPDATE_ONCE` на кадр; у ньому
  **Echo** (`echo.gdshader`: текстура іншого viewport'а × decay, зум, поворот) під **Fresh** (`trace.gdshader`:
  Sobel по яскравості сенсора + тон-штрих, намальовані матеріалом з `tex/<id>.webp`, premultiplied).
- **Out** — `out.gdshader`: loop над камерою (`hint_screen_texture`), add / multiply / normal.
- **Presets** (`presets.gd`) — ті ж 12 тем, що `apps/portal/presets.js`; `tuned(id, light, knobs)`; сторінка
  передає `preset`/`light`/`knobs` через `godot.set`.
- Трасування читає **Y-площину** напряму (`cam_luma` у `lib/portal.gdshaderinc`) через той самий `turn`, що й
  камера — тому один шейдер трасує екран на роздільності екрана і **знімок на роздільності сенсора**.

**Зберегти без обмежень**: `_on_save` перемикає feed на найбільший формат сенсора (єдина межа —
`RenderingDevice.LIMIT_MAX_TEXTURE_SIZE_2D`), чекає 2 кадри (таймаут 4 с), рендерить StillLoop → Still один раз,
`Image.save_png` у `user://saves/<name>`, `MsPortal.savedFile(name, path)`; шелл стрімить файл у MediaStore
Downloads (`MainActivity.saveFile`) і видаляє його; feed повертається на прев'ю (≤1280 по ширині).

**Пастки**: headless Godot (dummy renderer) НЕ парсить шейдери — синтаксична помилка видна лише на GPU
(logcat `shader:`); GDScript строгий до `:=` без типу (`get_image()`, `save_png()` повертають Variant для
парсера); `Image.create_filled` немає у 4.7 — `Image.create` + `fill`; `[preset.0.options]` порожня секція
дає безпечну ERROR при експорті. Експорт: `Godot --headless --path godot/portal --import`, потім
`--export-pack Android apps/portal/assets/portal.pck` (бінарник linux.arm64 у scratchpad, не в git).

## 7. Ф2.1 — життя і погляди (2026-09-06, власник: «застивше і зелене… рісерч готових пресетів, ми їх тільки модифікуємо»)

Джерела (усе CC0, godotshaders.com — «code snippets can be used freely without the author's permission»):
- Kuwahara (innerdev) — https://godotshaders.com/shader/kuwahara-shader-godot-4/ → `kuwahara_l` (на яскравості
  сенсора, хрома лишається камерина; квадранти без ваг, radius 2–3 — мобільний бюджет).
- Weird Glitch (Ayzzi_Dev) — https://godotshaders.com/shader/weird-glitch-shader/ → `glitch_uv` + хрома-розрив і
  скан-дроп у `look.gdshader` style 5 (зрізи рядків спалахами за TIME).
- Monotone halftone — https://godotshaders.com/shader/screen-space-canvas-monotone-halftone/ → `halftone_m`
  (крапки або штрих 45°).
- Screen Smoke/Fog (TheHyper-Dev) — https://godotshaders.com/shader/screen-smoke-fog/ → ідея домен-варпу:
  `warp_field` (fbm value-noise, дихає за TIME) гне ехо (`echo.warp`) і мерехтить плитку (`lines.shimmer`).
- Chromatic aberration (тег chromatic-aberration) → style 4, радіальний розрив каналів.
- Пінг-понг SubViewport: https://github.com/inkusgames/godot4_shader_viewport_example ,
  https://github.com/Namey5/godot-interactive-water (двобуферна текстура — та ж схема, що наш Loop і Motion).
- GodotPostProcess/addon (ASCII, CRT/VHS, grain, fish eye) — каталог ідей на далі.

Що змінилось у графі: **LookView** (look.gdshader, style/amount/p на планах сенсора; Cam = blit) — 8 поглядів;
**MotionA/B** (¼ роздільності loop: R = яскравість, G = енергія |Δ| із згасанням) — «життя» на тому, що
рухається: `motion.lift` піднімає лінію, `echo.motion_push` розмазує шлейф; **echo** отримав `flow` (px за
1/30 с), `warp` (px, поле), `motion_push`; **усі швидкості в секундах** (`decay^(dt·30)`, zoom, rot, flow) —
на 60 fps хвіст більше не зникає за 0,2 с (це і було «застивше»: decay 0.86 на кадр при 60 fps = 0,22 за 10
кадрів, дрейф 6 px/с). Пресети: ink = oil, paper/ferro = posterize+dither, thread = штрих, mercury = chromatic,
circuit = glitch, veil/sand = grain(+pixel), lum/smoke/plain = як є. Ручки рушія на сторінці лише в APK
(`ENGINE_KNOBS`: Погляд, Життя, Вітер, Мерехтіння).

Сторінка шле `engine.note` (camera bound … / saved / save:) у клієнт-лог. Шелл: `GodotLayer.onDestroy`
завершує процес — бібліотека дозволяє один рушій на процес (`engine.fail: Unable to setup the Godot engine`
у логах 00:56).

## 8. Камера = офіційне демо, не наш код (2026-09-06, власник: «є стандарти. найди. не вигадуй код… бери за основу робочий і збагачуй»)

Клієнт-лог після Ф2.1: `camera: no frame on format 19` двічі — наш власний танець камери. Стандарт:
**godot-demo-projects `misc/camera_feed`** (PR #1225) = `shiena/godot-camerafeed-demo` (MIT) — `camerafeed.gd` +
`ycbcr_to_rgb.gdshader`; клон у scratchpad `camdemo/`. Наш камерний код ВИДАЛЕНО; `godot/portal/camera.gd`
(`PortalCamera`) = `camerafeed.gd` функція в функцію (ті самі імена: `_reload_camera_list`,
`_on_camera_feeds_updated`, `_on_camera_list_item_selected`, `_update_format_list`,
`_on_format_list_item_selected`, `_start_camera_feed`, `_on_frame_changed`, `_setup_textures`,
`_get_color_range`, `_request_camera_permission`, `_exit_tree`), лише списки замінено на два значення
(`want_position`, `format_index`) і матеріал прев'ю — на сигнал `bound(info)`. Що в демо інакше, ніж було в нас:
- `set_format(index, {})` — ПОРОЖНІЙ словник (ми слали `{"output":"separate"}`);
- після `set_format` — `await get_tree().process_frame`, і лише тоді `feed_is_active = true` (ми — в тому ж кадрі);
- перед перемиканням — деактивація і `CAMERA_DEACTIVATION_DELAY` 0.1 с;
- дозвіл: `OS.get_granted_permissions()` → `OS.request_permission("CAMERA")` → `await on_request_permissions_result`
  ДО `monitoring_feeds` (рушій сам не повторює активацію після дозволу);
- формат за замовчуванням 0; наш «≤1280» — одне зайве вибирання формату після першого `bound` (як тап у списку);
- шейдер: 4 текстури (`rgb/y/cbcr/ycbcr_texture`), mode 0 RGB · 1 YCbCr SEP · 2 YCbCr **interleaved** (парність
  пікселя через `TEXTURE_PIXEL_SIZE`) — у нас FEED_YCBCR (type 2) трактувався як SEP → порожня хрома = ЗЕЛЕНЕ;
  `color_range` з `format.color_range`, інакше Android = video. Усе це тепер у `lib/portal.gdshaderinc`
  (`normalize_ycbcr`, `ycbcr_to_srgb`, `sensor_rgb`, `sensor_luma`) — look/trace/motion читають через нього.
Збереження = `cam.select_format(big)` (демо-функція) → 2 кадри → рендер → `cam.select_format(preview)`.
