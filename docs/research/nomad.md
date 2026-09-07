# «Номад» — NomadNet у фермі (дослідження, 2026-09-06)

Власник: «https://github.com/markqvist/NomadNet я хочу це. а ну давай подумаємо як ми це можемо загорнути».
Нижче — що таке NomadNet технічно, що вже існує готового (клонувати, не вигадувати), три способи загорнути,
рекомендація і план фазами. Кожне твердження з джерелом; VERIFIED = прочитано у коді/доках сьогодні,
INFERRED = випливає, але ще не збирали.

## 1. Що таке NomadNet (VERIFIED)

- Python-клієнт (urwid TUI + `--daemon`) над **Reticulum** (RNS, мережевий стек) і **LXMF** (формат повідомлень).
  Дві половини продукту: (а) **браузер вузлів** — вузол «hostить» сторінки у розмітці **micron** (`.mu`) і
  файли; клієнт відкриває Link до вузла і робить `Request("/page/index.mu", fields)`; (б) **пошта LXMF** —
  повідомлення peer-to-peer або через propagation-вузли (сховище для офлайн-одержувачів).
  Джерело: github.com/markqvist/NomadNet README; reticulum.network/manual.
- Для GUI на Android автор відсилає до **Sideband** (Kivy/p4a). Браузерної версії від автора нема; дискусія
  markqvist/Reticulum#128 — «поки не певні щодо micron і полів вводу».
- Криптографія RNS: X25519 + Ed25519, AES-256-CBC + HMAC-SHA256 (токени за зразком Fernet), HKDF, SHA-256/512;
  MTU 500 байт, дані пакета ≤465 байт; Link = 3 пакети (297 байт). Тобто портувати «з нуля» на JS — реально,
  але непотрібно: є готове (§2).
- Інтерфейси еталонного RNS: AutoInterface (IPv6 link-local multicast, UDP 29716/42671), TCP client/server,
  Backbone, UDP, I2P, RNode (LoRa, serial/BLE), Serial, Pipe, KISS/AX.25. **Жоден не доступний із браузера**
  (нема сирого UDP/TCP).

## 2. Що вже існує готового — екосистема Quad4 (VERIFIED, усе живе, комміти 2026-09-04…06)

| Що | Де | Факти |
|---|---|---|
| **Reticulum-Go** | Quad4-Software/Reticulum-Go, Apache-2.0, v1.1.1 (2026-08-31), 1248 комітів | wire-сумісний з Python RNS 1.4.2–1.5.2 (announces, paths, links, resources, channels, IFAC, transport; крипто-кросреф проти Python). **Є WASM-збірка** `cmd/reticulum-wasm` + `pkg/wasm` і **WebSocketInterface** (`websocket_native.go` / `websocket_wasm.go`). НЕ реалізовано: RNode/KISS/AX.25 (LoRa). Є бінарник `reticulum-go-android-arm64` (16,4 МБ) і `librns` (C/Dart FFI, Android у списку). |
| **WASM-міст** | `pkg/wasm/wasm.go` | глобал `reticulum`: `init(wsURL, appName, identityHex64)` · `getIdentity` · `getDestination` · `connect/disconnect/isConnected` · `announce` · `sendData` · `requestPath` · `setPacketCallback/setAnnounceCallback` · `getStats` · `onNetworkAvailable/onNetworkLost` · `setWatchedDestinations`; викликає `reticulumReady()`. Ідентичність — 64 байти hex, передається з JS (зберігання — наша справа, IndexedDB). **Link/Request у мості НЕМА** — лише пакети та анонси. |
| **WebSocketInterface** | там само | і native, і WASM — **тільки клієнт** (dial `ws://`/`wss://`, бінарні кадри = сирі RNS-пакети, без HDLC). Сервера-інтерфейсу нема: шлюз = **реле** `Quad4-Software/websocket-server` (BSD-3; режим `broadcast` = спільне середовище; rate-limit 10/с, burst 20, `CLIENT_LIMIT`, `DOMAIN` для WSS/CORS; Docker). Демо `reticulum-go.quad4.io/wasm-example` ходить на `wss://socket.quad4.io/ws`. |
| **Розмір WASM** | реліз `reticulum-go-example-wasm.wasm` | 8 081 012 raw · 2 174 033 gzip-9 · **1 605 045 brotli-11** (виміряно тут). |
| **LXMF у Go** | Quad4-Software/reticulum-go-protocols `pkg/lxmf`, 0BSD | LXMF 1.1.0 on the wire: pack + Ed25519 sign, opportunistic і direct delivery, stamps (PoW), `lxm://` paper URI, announce app-data; `NewDeliveryMessenger(id, tr)` дає той самий хеш `lxmf.delivery`, що й Python. Інтероп-тести проти LXMF-ref через uv. **Propagation-вузли (сховище офлайн-пошти) — у доці не згадані** (перевірити в коді перед Ф2). Модуль не в Go-proxy: `replace … => github.com/Quad4-Software/reticulum-go-protocols master`, `GOFLAGS=-mod=vendor`. |
| **Ren-Browser** | Quad4-Software/Ren-Browser, MIT, nightly 2026-09-03 | «NomadNet-браузер на Reticulum-Go»: Go + Wails + Svelte 5; **`internal/nomadnet/`** = browser.go (кеш Link-ів, `rlink.NewLink → Establish → link.Request(path, fields)` з таймаутами і вікном шляху), request.go (поля форм), url.go (`nomadnetwork://<hash>:/page/x.mu`), announce.go, identify.go; `internal/micron*` — рендер. Є **Android APK** 14,1 МБ (Wails Android, Go tip з MTE-фіксом), iOS, **server-режим** (headless бінарник/Docker, UI у браузері, `--public-mode` тримає історію в localStorage). |
| **Micron → HTML** | RFnexus/micron-parser-js (Unlicense) | `new MicronParser(dark, mono)`, `convertMicronToHtml/Fragment`, `bindPartials` (динамічні вставки), потребує DOMPurify; його ж використовують rBrowser і MeshChat(X). Є й Micron-Parser-Go (WASM 1,2 МБ у релізі Ren). |
| **MeshChatX** | Quad4-Software/MeshChatX (форк liamcottle/reticulum-meshchat), 0BSD/MIT, v4.8.6 | «все в одному» на Python: LXMF-пошта, вкладення, LXST-дзвінки, RRC, браузер NomadNet, propagation, мапа; Vue-фронт по WebSocket/HTTP (порт 8000); Docker `ghcr.io/quad4-software/meshchatx`; **Android APK 124,8 МБ (Chaquopy)**. |
| **rBrowser** | fr33n0w/rBrowser, MIT | Flask + RNS, micronparser.js, Termux на Android. Тонкий клієнт до Python. |
| **reticulum-android** | torlando-tech/reticulum-android, MIT | еталонний Python RNS у Chaquopy 3.11 як foreground service, Kotlin BLE/RNode-міст (з Columba), AutoInterface/TCP/UDP/I2P/RNode. |

Публічний тестнет автора (Amsterdam) **декомісійовано** (README RNS); входи — `directory.rns.recipes`,
`rmap.world` (JS-рендер, читати руками при збірці) або механізм `discover_interfaces` + `bootstrap_only`
(manual «Bootstrapping Connectivity»). Reticulum-Go додає DNSRendezvous/QUIC/WebTransport/HTTPS-інтерфейси.

## 3. Три способи загорнути

### A. Тонкий клієнт до VPS (MeshChatX/rBrowser-шаблон)
На VPS — `meshchatx --headless` у Docker; апка ферми `nomad` = наш преміум-UI до його HTTP/WS API через edge.
- Плюс: нуль нового коду в мережевому шарі, LXMF + propagation + браузер уже є, день роботи.
- Мінус: **ідентичність живе на сервері і ОДНА на інстанс** — усі користувачі ферми = один «Номад»; або
  контейнер на користувача (не продукт). Офлайн-мешу нема і не буде. Це проксі, не Reticulum.

### B. Справжній вузол у сторінці (Reticulum-Go WASM) — РЕКОМЕНДАЦІЯ
Сторінка = повноцінний RNS-вузол (WASM ~1,6 МБ brotli): своя ідентичність (64 байти в IndexedDB), свої анонси,
свої Link-и. Транспорт — WebSocket до **реле** на нашому VPS (`websocket-server` broadcast за nginx
`wss://dreamstudio.mooo.com/feed/rns`), до того ж реле підключений **демон `reticulum-go`** з
`WebSocketInterface` (клієнт до реле) + TCP/Backbone-аплінк у велику мережу (`bootstrap_only` + discovery,
або обраний вхід із rmap.world). Реле = спільне середовище (як AutoInterface): кожен браузер бачить кожного,
демон маршрутизує далі.
- Плюс: ідентичність у людини, багато користувачів природно, той самий код сторінки згодом працює з
  локальним шлюзом у телефоні (§C) — офлайн без переписування. Клонується з офіційного (`cmd/reticulum-wasm`,
  Ren `internal/nomadnet`, `pkg/lxmf`), не вигадується.
- Мінус/робота: міст треба **збагатити** — додати до `pkg/wasm` функції `fetchPage(hash, path, fields)` (порт
  Ren `browser.go` як є: той самий `*transport.Transport`, той самий `rlink`) і LXMF (`NewDeliveryMessenger`,
  `sendMessage`, `setMessageHandler`) — це Go-код у нашому форку/`cmd/`, компілюється `GOOS=js GOARCH=wasm`
  (INFERRED: rlink/lxmf збираються під wasm — перевірити першою збіркою). Propagation (офлайн-пошта) —
  залежить від `pkg/lxmf` (перевірити). Рейт-ліміт реле 10/с підняти для Resource-передач.
- Доказ за нуль інфраструктури: перша збірка може ходити на публічне `wss://socket.quad4.io/ws` (лише proof,
  не продакшн).

### C. Шлюз у телефоні (шелл, «off-grid»)
Флейвор шелла `rns`: бінарник `reticulum-go-android-arm64` (16 МБ) у `jniLibs` як `libreticulum.so`, foreground
service запускає демон з конфігом (AutoInterface по Wi-Fi + WebSocket-клієнт до локального реле… реле теж
треба — або control API). Сторінка (та сама, що в B) підключає свій WASM-вузол до `ws://127.0.0.1:<port>`.
Дає меш по локальному Wi-Fi без інтернету, TCP-аплінк коли є. **LoRa/RNode — ні** (нема в Reticulum-Go);
для RNode потрібен Python-шлях (reticulum-android/Chaquopy, як MeshChatX 125 МБ) — окреме рішення, якщо у
власника зʼявиться RNode. Альтернатива для B+C одразу: Ren-Browser Android APK як є (14 МБ) — але це чужий
застосунок, не ферма.

## 4. План (якщо B)

| Фаза | Що | Доказ |
|---|---|---|
| Ф0 proof (½ дня) | форк Reticulum-Go → `cmd/ms-wasm` = `reticulum-wasm` + `fetchPage` з Ren `browser.go`; збірка `GOOS=js GOARCH=wasm`; сторінка-стенд у scratchpad на `wss://socket.quad4.io/ws`; прочитати `index.mu` живого вузла (напр. MeshChatX `132f67e79d9b24aad014e93015fb858f:/page/index.mu`) | micron-текст у консолі + `vps/see.sh` |
| Ф1 «Номад» браузер | апка `nomad` у фермі: ідентичність (IndexedDB, експорт/імпорт), стрічка анонсів вузлів (з app-data: імʼя), сторінка через micron-parser-js + DOMPurify у наших матеріалах (micron-кольори → токени), поля форм, файли через `downloadBlob`; WASM у precache SW (`deno task sw`), `wasm_exec.js` вендорений; VPS: реле + демон у Docker, nginx `/feed/rns` (WSS), аплінк | see.sh обидві теми/форми; `apps/nomad/RESEARCH.md`; іконка за `rules/art.md` у першому коміті |
| Ф2 пошта LXMF | `pkg/lxmf` у міст: контакти з анонсів `lxmf.delivery`, надсилання direct/opportunistic, вхідні, stamps; propagation — після перевірки в коді | інтероп з Sideband/MeshChatX на телефоні власника |
| Ф3 шлюз у телефоні | флейвор `rns` шелла (§C) | Wi-Fi-меш між двома телефонами без інтернету |

Ризики, названі заздалегідь: (1) rlink/lxmf під wasm — перша збірка скаже; (2) реле broadcast = кожен кадр
кожному: на десятках браузерів ок, на сотнях — треба реле з фільтром; (3) Go-wasm тримає ~10–20 МБ
памʼяті і не спить у фоні (`onNetworkLost` при `visibilitychange`); (4) micron-сторінки з полями = «скринька
Пандори» (markqvist) — робимо як Ren: поля → `fields` у Request, без JS-виконання; (5) Quad4 — один
активний автор, форк тримати на пінованому коміті.

## 5. Джерела
- github.com/markqvist/NomadNet · reticulum.network/manual/{understanding,interfaces,gettingstartedfast}.html ·
  markqvist/Reticulum README «Public Testnet» · markqvist/Reticulum discussions #128, #969
- Quad4-Software: Reticulum-Go (docs/en/embedding-and-wasm.md, interfaces.md, configuration.md, compatibility.md,
  control-api.md; pkg/wasm/wasm.go; pkg/interfaces/websocket_{native,wasm}.go; releases v1.1.1) ·
  reticulum-go-protocols (README, docs/en/lxmf.md) · websocket-server README · Ren-Browser (README,
  main_android.go, internal/nomadnet/{browser,request,url}.go, releases nightly-2026.09.03) · MeshChatX (README,
  docs/en/building.md, releases v4.8.6) · reticulum-go.quad4.io/wasm-example
- RFnexus/micron-parser-js · fr33n0w/rBrowser · torlando-tech/reticulum-android · lorien/awesome-reticulum
