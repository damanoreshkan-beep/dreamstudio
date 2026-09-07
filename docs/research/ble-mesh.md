# BLE-меш між телефонами — як воно насправді працює (дослідження, 2026-09-06)

Власник: «мене цікавить саме ця меш технологія… ble технологія реклами… через протокол епл… ті ж самі
аіртеги… чи є стандарти такого пінпонгу наприклад на 10 стрибків, це контролювати». Нижче — факти з
джерел (VERIFIED), що з цього транспорт, а що ні, і що клонувати.

## 1. «Системний пінпонг» — чи ретранслює радіо саме по собі

- **Wi-Fi**: ні. Без роутера нема пересилання; monitor mode на штатному телефоні без рута нема
  (наш AX56 — окрема історія, `[[reference_meshbench]]`).
- **BLE**: стандарт є — **Bluetooth Mesh** (SIG, 2017): *managed flooding*: кожен relay-вузол
  ретранслює кожне вперше почуте повідомлення; **TTL 7 біт, максимум 127**, зменшується на кожному
  стрибку; кеш повідомлень проти петель; advertising bearer несе до 27 байт корисних. АЛЕ телефони
  **не є вузлами меша**: в Android/iOS нема стеку Bluetooth Mesh, телефон підключається до справжнього
  вузла (чип nRF52/ESP32/лампа) лише як **GATT proxy client**. І наша «стеля дроту» вже виміряна
  (`docs/research/ble-air.md`): `AdvertiseData` Android дає лише mfg/service data, тобто AD-тип
  Mesh Message 0x2A з телефону не випромінити. Висновок: стандартний пінпонг існує, але тільки між
  чипами; телефон у ньому — гість через один чип.

## 2. AirTag / Find My — не меш, а один стрибок у хмару

- Мітка кожні 15 хв міняє пару ключів P-224 і кладе **публічний ключ у BLE-рекламу**. Будь-який iPhone
  поруч (з увімкненим Find My) бере **своє** GPS-положення, шифрує його цим ключем і **вивантажує в
  Apple** разом із хешем ключа. Власник качає звіти й розшифровує приватним ключем. Знахідник нікому
  далі не ретранслює; йому потрібен інтернет. (Apple Platform Security «Find My».)
- **Як транспорт даних це вже зроблено**: «Send My» (Positive Security, 2021): 1 біт на ключ,
  28-байтний масив `[bit index][message id][modem id]…[bit]`, ESP32 як передавач (обрано, бо швидко міняє
  BT MAC), **~3 байт/с** на відправку, **затримка 1–60 хв**, 16 байт читаються ~5 с. Читання — через
  бекенд Apple: **потрібен Apple ID** (2FA лише SMS) + anisette-сервер; у 2026 це живе
  (macless-haystack, FindMy.py оновлено 2026-06-01, go-haystack). Без Apple ID — ніяк.
- Тобто: односторонній, повільний, через чужі iPhone у хмару Apple. Для чату — ні. Для «записка дійде,
  коли хтось із iPhone пройде повз» — так; наш **wisp** уже вміє те, заради чого вони взяли ESP32
  (свіжа випадкова адреса на кожен маячок, `[[project_rtl8761_bt]]`).
- Snatcher (CCS ’26, arXiv 2606.21067): реклама Find My досі нешифрована, MAC ротується повільно —
  протокол не змінився.

## 3. Google / Samsung — так само один стрибок, і закрито

- **Google Find Hub network** (Android, 2024): мітка = Fast Pair-пристрій, **реєстрація в Nearby Device
  Console + форма пропозиції**; реклама = ефемерний ідентифікатор 20 або 32 байти, ротація ~1024 с
  (±1…204 с), маячок ≥ раз на 2 с; довільного корисного навантаження **нема** за специфікацією;
  читання — акаунт Google. (developers.google.com/nearby/fast-pair/specifications/extensions/fmdn)
- **Samsung SmartThings Find**: лише Galaxy, BLE після 30 хв офлайну, звіт у сервер Samsung; API для
  сторонніх нема.
- Жоден із трьох не пересилає телефон→телефон і не дає peer-to-peer.

## 4. Справжній телефон-телефон BLE-меш зі стрибками — bitchat (еталон, клонувати)

permissionlesstech/bitchat (iOS/macOS) + bitchat-android, **Unlicense**, WHITEPAPER.md (VERIFIED):
- Кожен телефон **одночасно GATT central і peripheral**; пакети йдуть по **зʼєднаннях**, не по
  рекламі (реклама — лише для виявлення). Причина — iOS: у фоні iOS **не рекламує mfg data і local
  name**, service UUID ховає в «overflow area», яку бачить лише інший iOS; реклама у фоні «best
  effort». Android тримає меш foreground service-ом.
- Заголовок: version · type · **TTL** · timestamp · flags, 8-байтний sender id, опційний recipient,
  payload, Ed25519-підпис (**TTL поза підписом**, щоб relay міг зменшувати).
- **TTL 7** на старті; щільний граф (≥6 лінків) обрізає до 5; тонкий ланцюг (≤2) — повна глибина.
  Дедуп: LRU 1000 записів / 5 хв за (sender, timestamp, type, digest); split horizon; fanout ~log₂
  ступеня для broadcast, повний для announce/фрагментів. ~30 м на стрибок.
- Фрагменти ~469 байт, 128 збірок, 30 с, 1 МіБ cap. Announce кожні 4 с наодинці, 15–30 с у мережі.
- Store-and-forward: outbox 100 повідомлень/peer, 24 год, 8 спроб; **курʼєри spray-and-wait**
  (бюджет копій 4, до 8, ділиться навпіл при зустрічі); gossip публічної історії 6 год (GCS-фільтри).
- Шифрування Noise; слабке місце — метадані (стабільний 8-байтний id, сусіди в announce).
- Стандарти лічильника стрибків для порівняння: Bluetooth Mesh TTL 0–127; Meshtastic hop_limit 3 біти
  (max 7, типово 3); bitchat 7; Reticulum байт hops (announce до 128). У власному протоколі TTL — наш
  байт: «10 стрибків» = TTL 10, і саме bitchat-овий clamp по щільності — те, що варто взяти.

## 5. Реклама-only меш (без зʼєднань) — де межа

Android↔Android у foreground: так — наш `ble.advertiseRaw` + сканер (prox), extended advertising до
1650 байт на BT5-чипах (S25 має); relay = переклав почуте у свій маячок з TTL−1. iOS у фоні цього не
побачить і не випромінить (§4). Тому bitchat і пішов через GATT.

## 6. Що з цього для нас

1. **Меш-носій = клон bitchat-android** (Unlicense) як можливість шелла `mesh.*` (foreground service,
   central+peripheral, TTL/дедуп/фрагменти як є), сторінка — UI. TTL і clamp — наші ручки.
2. **Reticulum поверх** (`docs/research/nomad.md`): BLE-флуд як інтерфейс RNS (треба 5 біт/с) — тоді
   телефон із інтернетом стає мостом BLE↔світ, і «два телефони не в одній мережі» отримують відповідь.
3. **Find My як транспорт** — окремий лабораторний трюк для wisp/prox (односторонні записки через чужі
   iPhone), не для чату; потребує Apple ID для читання.

## 7. Чи можна абьюзити чужі пристрої як безкоштовні реле (2026-09-06)

Власник: «абьюзить пристрої ніяк не можна? може розраби щось приховали, простий спосіб на низькому рівні?
по типу синхронізації погоди чи gps». Чесна відповідь: **ні, структурно.** Щоб чужий телефон переслав
пакет, на ньому має крутитися код, який це робить — або вендорський (finding-мережі), або наш (апка).
Радіо саме чужі байти не форвардить; фонове виконання й дозволи для того й є.

- **«Погода/GPS через Wi-Fi» — це pull з хмари, не пересилання.** WPS: телефон шле список BSSID сусідніх
  AP на сервер Apple/Google, отримує координати (Apple віддає ще до 400 сусідніх BSSID у кеш). Свої дані
  туди не вкласти. Діра є, але інша: WPS віддає координати будь-якого BSSID без доказу видимості
  (arXiv 2405.14975, theregister 2024-05) — це витік розташування AP, **не канал зв'язку**. Захист:
  суфікс `_nomap` у SSID.
- **Єдиний «app-less relay через чужі телефони» = finding-мережі** (Find My/Hub/SmartThings) — і це вже
  §2: односторонньо, ~3 байт/с, затримка до години, читання лише з акаунтом вендора. **Активно
  закривається**: DULT (Apple+Google, iOS 17.5 / Android 6+, з 2024; IETF dult draft threat-model-03,
  2025-10) попереджає про чужу мітку, що їде за тобою; ліміти міток/ротації. Вікно звужується, не росте.
- **AirDrop / AWDL / Quick Share** — пряме телефон-телефон по Wi-Fi, але потребує згоди людини + близькості;
  тихого форварду довільних даних апка туди не впхне.
- **UWB** (чип у SmartThings Find, точний напрямок) — відкритого API для довільних даних нема (Apple/Samsung).

Висновок: безкоштовних чужих реле нема — лишається меш на НАШИХ телефонах з апкою + Reticulum-міст (§6).

## 8. Дріт bitchat (VERIFIED з коду 2026-09-06) + план фазами

Рішення власника: «BLE тут-і-зараз, bitchat-сумісність». Стратегія — НЕ переписувати протокол, а
**клонувати bitchat-android (Unlicense) і портувати його меш-пакет як можливість шелла** (standard-first,
[[feedback_standard_first_no_invented_code]]).

**Константи (bitchat-android main, app/.../util/AppConstants.kt + protocol/BinaryProtocol.kt):**
- Сервіс `F47B5E2D-4A9E-4C5A-9B3F-8E1D2C3A4B5C`; характеристика (READ+WRITE+NOTIFY)
  `A1B2C3D4-E5F6-4A5B-8C9D-0E1F2A3B4C5D`; CCCD `00002902-…`. Ім'я адаптера = 8-символьний peerID.
- Кадр: HEADER_SIZE v1=14 / v2=16, SENDER_ID 8, RECIPIENT_ID 8, SIGNATURE 64; прапорці
  HAS_RECIPIENT 0x01 · HAS_SIGNATURE 0x02 · IS_COMPRESSED 0x04 · HAS_ROUTE 0x08; broadcast = 8×0xFF; TTL байт.
- Типи: ANNOUNCE 0x01 · MESSAGE 0x02 · LEAVE 0x03 · NOISE_HANDSHAKE 0x10 · NOISE_ENCRYPTED 0x11 ·
  FRAGMENT 0x20 · REQUEST_SYNC 0x21 · FILE_TRANSFER 0x22 · VOICE_FRAME 0x29.
- Фрагмент: поріг 512, макс 469 Б, ≤256/id, 1 МіБ/набір. Ролі: server (peripheral, рекламує сервіс) +
  client (central) одночасно. Noise (southernstorm, Curve25519 + ChaChaPoly/AESGCM). TTL 7 (§4).
- Пакет ~40 Kotlin-файлів (mesh/, protocol/, noise/, model/) + Noise → тягне kotlin-stdlib. Масштаб
  порівнянний з флейвором `godot`, не вечір роботи.

**Архітектурний закон:** GATT client+server + foreground service НЕ живуть у WebView. Меш = Java/Kotlin у
шеллі (як `GodotLayer`), сторінка лише UI через міст. Це дорога половина ([[reference_shell_files_storage]],
`rules/shell.md`).

**План:**
- **Ф0 proof (лаб).** Клонувати bitchat-android, зібрати стоковий APK, підняти на apk-see (дві AVD або
  емулятор+S25) → довести, що наша лаба взагалі бачить BLE-меш; wisp/prox сканують сервіс `F47B5E2D`.
  Ризик, який Ф0 знімає: чи робить емулятор реальне BLE-радіо між AVD (інакше тест лише S25 + телефон власника).
- **Ф1 флейвор шелла `mesh`.** `full` + вендорені пакети bitchat (Unlicense) + `MeshLayer` + foreground
  service. Дії мосту `mesh.start/stop`, `mesh.send{text,recipient?}`, підписки `mesh.peers`, `mesh.messages`
  (origin-lock). Дозволи BLUETOOTH_ADVERTISE/SCAN/CONNECT + FOREGROUND_SERVICE (targetSdk 31 = runtime BT).
  Шаблон-ФАЙЛ `template-mesh.apk` (як godot; kotlin-stdlib → виміряти розмір), scp на VPS, один `--allow-read`.
  Каталог `flavours` каже, що `mesh` несе можливість; грант-листи генеруються. Доказ: apk-see — наш service
  рекламує `F47B5E2D`, стоковий bitchat бачить наш announce.
- **Ф2 апка ферми.** `runtime/meshstage.js` (сторона сторінки, як godotstage.js) + `apps/<id>`: чат у наших
  матеріалах, список peer-ів, індикатор стрибків/TTL, преміум-бар. Іконка + захоплення + Today (`rules/art.md`).
  Доказ = НЕ кількість, а інтероп: повідомлення зі СТОКОВОГО bitchat з'являється в нашій апці й навпаки
  (два телефони). TTL/clamp — наші ручки.
- **Ф3 міст Reticulum (виплата мережевого ефекту, звʼязок із `nomad.md`).** Меш-вузол несе ще й RNS: BLE-меш
  = інтерфейс Reticulum, телефон з інтернетом мостить локальний натовп bitchat у глобальний світ Sideband.
  Відкладено — велике, залежить від рішення по `nomad.md`.

**Ризики названо:** (1) масштаб ~40 Kotlin-файлів = тижні, не вечір; (2) iOS ми НЕ випускаємо — інтероп із
iOS-bitchat по BLE так, свій iOS-застосунок ні; (3) дріт до 1.0 може дрейфувати (v1/v2 заголовок уже
співіснують) → пінити коміт; (4) DULT: наш вузол — телефон у руці користувача, не тиха мітка за чужим →
низький ризик, але позначити; (5) щільність інсталяцій bitchat тонка → інтероп множить те, що є (§6).

## Джерела
bluetooth.com «Intro to Bluetooth Mesh part 2», Nordic DevZone «Things you should know about Bluetooth
mesh», Silicon Labs AN1200.1 · Apple Platform Security «Find My security» · positive.security/blog/send-my ·
dchristl/macless-haystack FAQ, docs.mikealmel.ooo/FindMy.py · arXiv 2606.21067 (Snatcher) ·
developers.google.com FMDN spec · support.smartthings.com «SmartThings Find» · §7: arXiv 2405.14975
(WPS surveillance), theregister 2024-05-23, IETF dult threat-model-03 (2025-10), thehackernews 2024-05
(DULT launch) · permissionlesstech/bitchat
WHITEPAPER.md · davidgyoung/ios-overflow-area · source.android.com ble_advertising · наші
`docs/research/ble-air.md`, `ble-apple-emit.md`.
