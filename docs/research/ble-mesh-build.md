# СПЕЦИФІКАЦІЯ ЗБІРКИ — «BLE-меш» (bitchat-сумісний), spec-driven development

**Для виконавця:** ця специфікація написана моделлю Fable для виконання моделлю **Opus 5** (у Claude Code:
`/fast`, або модель `claude-opus-5`). Виконуй ФАЗАМИ, зверху вниз. Кожна фаза має критерій готовності
(verifiable) — не переходь до наступної, доки поточний критерій не ДОВЕДЕНО реальним прогоном, не здогадом.

**Як запускати (власник):** відкрий сесію Opus у `/root/dreamstudio`, скажи «виконуй `docs/research/
ble-mesh-build.md`, фаза Ф0» (потім Ф1a, Ф1b, Ф2). Після кожної фази — стоп і показ доказу власнику.

---

## §0. Зафіксовані рішення (НЕ переглядати — рішення власника 2026-09-06, `meta/decisions.md`)

1. **BLE тут-і-зараз, bitchat-сумісність.** Центр ваги — BLE телефон-телефон, не LoRa, не інтернет.
2. **Серце апки: публічний канал + приватний чат.** Публічна кімната (читає кожен поруч, історія 6 год) І
   приватні наскрізь-шифровані повідомлення.
3. **Ідентичність: анонім як у bitchat.** Псевдонім + ключ Noise на пристрої, окремо від профілю ферми.
   Це дає ПОВНУ сумісність зі стоковим bitchat. НЕ привʼязувати до sid ферми.
4. **Стратегія: клонувати bitchat-android, портувати меш verbatim, не вигадувати протокол.**
   ([[feedback_standard_first_no_invented_code]] — офіційний робочий код → порт функція в функцію → збагачення.)

## §1. Закони, яких виконавець ЗОБОВʼЯЗАНИЙ дотримуватись

Прочитай ПЕРЕД кодом (це не опційно):
- `.claude/skills/microspec/rules/shell.md` — меш живе в Java/Kotlin шеллі, НЕ у WebView; підпис v2,
  вирівнювання, targetSdk 31; **Java/Kotlin редагувати РЕДАКТОРОМ, ніколи генерованим рядком** (hook блокує).
- `.claude/skills/microspec/rules/constraints.md` — ніколи Chromium локально; **гейти зелені перед КОЖНИМ
  пушем**; не видаляти upstream refs; не `checkout`/`restore` файл з незакоміченою роботою.
- `.claude/skills/microspec/rules/art.md` — перед першим `scaffold` НОВОЇ апки: люмінесцентна іконка в
  ПЕРШОМУ коміті, виміряна; захоплення обох тем того ж дня.
- `.claude/skills/microspec/rules/design.md` — новий екран не пушиться небаченим: `bash vps/see.sh <app>`
  обидві теми, кожен стан.
- `docs/research/portal-godot.md` — **ЦЕ ТВІЙ ШАБЛОН.** Флейвор `mesh` структурно ІДЕНТИЧНИЙ флейвору
  `godot`: важка нативна можливість, окремий template-ФАЙЛ, `MeshLayer` як `GodotLayer`, сторона сторінки
  як `runtime/godotstage.js`. Копіюй його форму рішення в рішення.

**Жорсткі контролі (перевіряй сам):**
- **Бюджет 2 спроби на під-проблему.** Помилка/стан не зрушили після 2 спроб → СТОП, залогуй що пробував +
  доказ + гіпотезу, ескалюй до Fable (§6). Ніколи третьої однакової спроби.
- **Гейти = істина.** `deno task gates` зелені локально перед пушем. Push-gate hook відмовляє пуш без
  зеленого штампа дерева: `gates` окремою командою, `push` наступною.
- **Око = обовʼязковий тест.** APK перевіряється на apk-see (§5), не «здається працює».
- **Ніколи не чіпати Noise-криптографію і підпис.** Береш southernstorm Noise як є. Не «покращуй».
- **Документуй у META.** Кінець кожної фази → `meta/journal.md` (що зроблено, коміт, число); потік
  `meta/streams/ble-mesh.md` переписати в теперішній стан. ([[feedback_meta_layer]])

## §2. Стратегія (клон, не винахід)

- Джерело: `github.com/permissionlesstech/bitchat-android`, ліцензія **Unlicense** (public domain — вільно
  вендорити). **Пінуй коміт** одразу (дріт до 1.0 дрейфує) і запиши хеш у `meta/streams/ble-mesh.md`.
- Портуємо ЛИШЕ транспорт: пакети `mesh/`, `protocol/`, `noise/`, `model/`. НЕ беремо UI (Compose),
  Nostr, voice, geohash-канали (у v1). Store-and-forward (`StoreForwardManager`) — беремо.
- Сторінка (апка ферми) — лише UI, говорить з мешем через міст. Нуль протокольної логіки в JS.

## §3. Дріт bitchat (VERIFIED з коду 2026-09-06 — звірка, не вигадка)

Джерело: `app/src/main/java/com/bitchat/android/util/AppConstants.kt`, `protocol/BinaryProtocol.kt`.
- Сервіс GATT `F47B5E2D-4A9E-4C5A-9B3F-8E1D2C3A4B5C`; характеристика (READ+WRITE+NOTIFY)
  `A1B2C3D4-E5F6-4A5B-8C9D-0E1F2A3B4C5D`; CCCD `00002902-0000-1000-8000-00805f9b34fb`.
- Імʼя BT-адаптера = 8-символьний peerID (приватність iOS).
- Кадр: HEADER v1=14 / v2=16 байт, SENDER_ID 8, RECIPIENT_ID 8, SIGNATURE 64 (Ed25519); прапорці
  HAS_RECIPIENT 0x01 · HAS_SIGNATURE 0x02 · IS_COMPRESSED 0x04 · HAS_ROUTE 0x08; broadcast = 8×0xFF; TTL байт.
- Типи: ANNOUNCE 0x01 · MESSAGE 0x02 · LEAVE 0x03 · NOISE_HANDSHAKE 0x10 · NOISE_ENCRYPTED 0x11 ·
  FRAGMENT 0x20 · REQUEST_SYNC 0x21 · FILE_TRANSFER 0x22 · VOICE_FRAME 0x29.
- Фрагмент: поріг 512, макс 469 Б, ≤256/id, 1 МіБ/набір, timeout 30 с. TTL старт 7 (clamp 5 при ≥6 лінках).
- Публічне = recipient broadcast, БЕЗ Noise (читає кожен); приватне = NOISE_ENCRYPTED. Gossip публічної
  історії 6 год. Квитанції delivered/read по мешу.
- **Ці числа НЕ переписувати руками в код** — вони приходять із портованих файлів. Тут — для звірки на око.

## §4. Контракт мосту (сторона сторінки ↔ Java), який треба реалізувати

Дії в `packages/shell/actions.json` (capability `mesh`), потім `deno task shell` → `apk/java-gen.mjs`:
- `mesh.start()` → `{peerID, nick}` (піднімає foreground service, GATT server+client, реклама сервісу).
- `mesh.stop()`.
- `mesh.state()` → `{running, peerCount, maxHops, myPeerID, nick}`.
- `mesh.setNick(name)`.
- `mesh.sendPublic({text})` → `{msgId}`.
- `mesh.sendPrivate({peerID, text})` → `{msgId}`.
- subscribe `mesh.peers` → знімки `[{peerID, nick, hops, rssi, lastSeen}]` (це і є ЛІЧИЛЬНИК проти
  «пустоти» — власник бачить, скільки досяжно й на скільки стрибків).
- subscribe `mesh.messages` → `{msgId, kind:"public"|"private", fromPeerID, nick, text, ts}`.
- subscribe `mesh.receipts` → `{msgId, state:"queued"|"sent"|"delivered"|"read"}`.
Кожна дія origin-locked (лише наші origin). Мок для гейта — як у godot-дій.

## §5. Фази

### §5.0 ВИМІРЯНО 2026-09-06 (Fable, перед запуском Opus) — читати перед Ф0/Ф1

Три факти, здобуті прогоном, а не здогадом. Вони змінюють Ф0 і Ф1 — не переоткривай їх:

1. **Емулятор apk-see МАЄ Bluetooth.** `pm list features` дає `android.hardware.bluetooth` І
   `android.hardware.bluetooth_le`; живі `bluetooth_manager` і HAL `android.hardware.bluetooth.IBluetoothHci/
   default`; `settings get global bluetooth_on` = 1; API 34. Тобто BLE-застосунок там СТАРТУЄ і бачить стек.
   **Ще НЕ доведено:** чи чують одне одного ДВА інстанси емулятора (для цього потрібен спільний
   rootcanal/netsim). Це і є вимір Ф0 — не припускай ні «так», ні «ні».
2. **Тулчейн bitchat значно новіший за наш шелл** (`gradle/libs.versions.toml`, коміт нижче):
   AGP **9.3.1**, Kotlin **2.4.10**, compileSdk/targetSdk **37**, buildTools **37.0.0**, minSdk **26**,
   Gradle wrapper **9.6.1**. Наш шаблон: AGP 8.5.2, targetSdk 31, minSdk 24, gradle 8.7 (JDK 17).
   **Наслідок для Ф1b, спланувати заздалегідь:** вендорені Kotlin-джерела не скомпілюються під наш AGP 8.5.2
   як є. Або піднімаємо тулчейн шаблона, або компілюємо меш окремим gradle-модулем зі своїм AGP. Мінімальний
   SDK флейвора `mesh` доведеться підняти 24 → **26** (bitchat: «API 26 for proper BLE support»).
   Це РІШЕННЯ, а не деталь: якщо тягне за собою підйом AGP усього шаблона — СТОП і ескалюй (§6).
3. **Збирати Android тепер можна на нашому VPS** — з'явився інструмент (Fable, сьогодні):
   `bash vps/apk-build.sh --image` (разово) і `bash vps/apk-build.sh <src-dir> <gradle-task> [--jdk 21]
   [--heap 3g] [--stop-emulator]` у `/root/microspec-edge`. Образ `microspec-android-build` 2,87 ГБ: JDK 17
   і 21, платформи android-34 / 37.0 / 37.2, build-tools 34.0.0 і 37.0.0, gradle 8.7 + підтримка wrapper-ів,
   кеш gradle у томі. Локально (телефон) Java/SDK НЕМА і не буде — не намагайся збирати тут.
   - **Памʼять — справжнє обмеження VPS** (виміряно): 7 ГБ усього, ~5 тримають поди, своп 2 ГБ майже повний.
     Тому `--heap` (типово 3g) і `--stop-emulator` (звільняє ~2,5 ГБ, повертає емулятор після збірки).
     Проєкт, що просить `-Xmx4g` (bitchat просить), без цього йде у своп і глухне.
   - **Пастка імен SDK (виміряно):** пакета `platforms;android-37` НЕ ІСНУЄ — з API 36 платформи мають
     МІНОРНУ версію (`android-37.0`, `37.1`, `37.2`). Одне хибне імʼя валить увесь виклик `sdkmanager`.
- **Пін bitchat-android:** коміт `9a399cc3332157ab340b18cc9c115a98bb760ebb` (2026-09-06T06:16:30Z), реліз
  v2.0.1 має готові `bitchat-android-x86_64.apk` (21,8 МБ) і `-arm64.apk` — але для інтеропу краще СВОЯ
  збірка (можна додати логування).

### §5.1 Ф0 — ЗРОБЛЕНО 2026-09-06 (Fable). Не повторювати; читати як факти.

**Критерій «у logcat видно рекламу сервісу `F47B5E2D` від стокового bitchat» — ДОВЕДЕНО, двічі, чисто.**

Як: клон запінено (`9a399cc…`), APK зібрано НАШИМ збирачем на VPS (`bash vps/apk-build.sh <клон>
:app:assembleDebug --jdk 21 --heap 3g --stop-emulator`) — **BUILD SUCCESSFUL за 4 хв 3 с** з нуля, разом із
завантаженням Gradle 9.6.1 і всіх залежностей; пʼять split-APK, зокрема `app-x86_64-debug.apk` (46,9 МБ)
для емулятора. Далі `bash vps/apk-see.sh --lab <apk> --wait 25000 --tap 360,1440`.

Що сказав logcat (дослівні маркери, шукати саме їх у Ф1b):
```
I/BluetoothMeshService: Starting Bluetooth mesh service with peer ID: a347926b632f16d2
D/BluetoothGattServer: onServiceAdded() - handle=134 uuid=f47b5e2d-4a9e-4c5a-9b3f-8e1d2c3a4b5c status=0
I/BluetoothGattClientManager: BLE scan started      (фільтр сканування — на той самий UUID)
D/BtGatt.AdvertiseManager: onAdvertisingSetStarted() - regId=-4, advertiserId=0, status=0
I/BluetoothGattServerManager: Advertising started (power mode: PERFORMANCE)
```
**Нуль помилок стеку Bluetooth, нуль FATAL.** Тобто віртуальний BT емулятора тримає ПОВНИЙ набір:
GATT-сервер + реклама + сканування з фільтром. **Наслідок: Ф1a/Ф1b можна вести й перевіряти на емуляторі,
не лише на живих телефонах.** peerID = 16 hex (8 байт), новий на кожну переустановку — підтверджує модель
«анонім, ключ на пристрої».

Що ще виміряно:
- **Онбординг bitchat — стіна у ДВА кроки**: «Grant Permissions» (тап ~360,1440) і «Battery optimization»
  («Skip for Now» ~522,1425). **Меш стартує ЗА нею** — реклама вже йде, поки висить онбординг. Для нашої
  апки це нагадування: виняток батарейної оптимізації — реальна вимога фонового мешу, не косметика.
- **Екран чату** (`scratchpad/bitchat-emu4.png`): нік `@anon9787`, мітка `mesh`, і **ЛІЧИЛЬНИК СУСІДІВ у
  заголовку (0)** — той самий індикатор проти «пустоти», що в §Ф2. Орієнтир для нашого UI: він у шапці.
- **Виправлено інструмент** `vps/apk-see.sh` (це кусало саме тут): в емуляторному образі НЕМА `aapt2`, а
  запасний спосіб шукав лише наш префікс `apk.microspec`, тож чужий APK ставився і не запускався
  («Activity class {} does not exist»). Тепер пакет береться з ДИФУ списку сторонніх пакетів до/після
  install, є прапорець `--pkg <name>` для переустановки. Пастка при правці: внутрішній блок живе в
  ОДИНАРНИХ лапках `bash -c` — апостроф у коментарі ламає весь скрипт (спіймано).

### §5.2 ДВА ВУЗЛИ ЧУЮТЬ ОДНЕ ОДНОГО — доведено на БОКСІ 2026-09-06

Останнє відкрите питання Ф0 **закрито ствердно**. Не на VPS (там один емулятор = 3,4 ГБ RSS, другий
вбив би продакшн-под), а на **бенч-боксі власника** — 15 ГБ RAM, 4 потоки, `/dev/kvm`.

Стенд (відтворюваний):
- Бокс по Wi-Fi `mrx@192.168.50.197` (ethernet `.114` був опущений — пробуй ОБИДВІ адреси).
- SDK нативно в `~/android` (`emulator` 37.1.11, platform-tools, `platforms;android-34`,
  `system-images;android-34;google_apis;x86_64`, 5,3 ГБ). **`sdkmanager` працює під JDK 26 боксу** —
  другий JDK не потрібен.
- Два AVD `mesh1`/`mesh2`, порти **5554** і **5556**, по 2048 МБ.
- **Один `netsimd` на хост обслуговує ОБИДВА емулятори** — це і є спільний віртуальний радіоефір
  (Rootcanal). Другий емулятор не піднімає свій, а приєднується (у `ps` видно один живий netsimd + зомбі).

Результат (logcat обох, дослівно):
```
5554: D PeerManager: 🆕 New verified peer: anon5392 (a454fd4358ecdfbd)
5556: D PeerManager: 🔄 Updated verified peer: anon5057 (0f681bb6529a5091)
5556: D MessageHandler: Verified announce from 0f681bb6529a5091 (anon5057)
```
Кожен бачить ІНШОГО, і не просто як рекламу: **verified peer / verified announce** = підпис announce
перевірено, особа підтверджена. Тобто на емуляторах працює ПОВНИЙ ланцюг: реклама → сканування →
GATT-зʼєднання → announce → перевірка особи.

**Наслідок для Ф1/Ф2:** розробку і перевірку інтеропу можна вести на боксі щодня, двома віртуальними
телефонами, без смикання власника. Живі телефони лишаються для того, чого Rootcanal не має: **дальності,
загасання і справжніх стрибків** — там фізики радіо немає взагалі.

**Пастка продуктивності (виміряно):** два емулятори × 2 ядра на 2-ядерному i5 з SwiftShader → `System UI
isn't responding` (ANR), UI не тапається, хоча МЕШ під ним працює. Лікується роздільністю: 720×1560 →
**480×960, density 240** (те саме, чому образ apk-see сидить на 720×1560, а не 1080×2340). Меш-шар ANR
не заважає — peer-и знайшлись саме під час ANR.

### §5.3 ТЕОРІЮ ДОВЕДЕНО — НАШ код увійшов у меш bitchat (2026-09-06, бокс)

Власник, справедливо: «нафіг тестувати ui, це забота плейрайту… твоя задача тестувати функціональну
частину хоч через консоль але всередині апк… роби прості апки, прям дуже мікро лише перевірити теорію…
я не знаю навіщо це тестувати якщо код доведений». Саме так: bitchat доводити не треба, доводити треба
НАШУ здатність говорити його мовою. Тестування UI чужої апки згорнуто.

**`docs/research/mesh-lab/meshprobe/`** — мікро-APK, **12,5 КБ**, чиста Java, БЕЗ AndroidX, БЕЗ UI, БЕЗ
жодного вендореного чужого рядка. Той самий тулчейн, що й шелл (AGP 8.5.2, gradle 8.7, JDK 17,
compileSdk 34, minSdk 26) — тобто це репетиція флейвора `mesh`, а не чернетка. Збірка: 32 с.
```
bash vps/apk-build.sh docs/research/mesh-lab/meshprobe :app:assembleDebug --jdk 17 --heap 2g
adb -s emulator-5554 install -r -g meshprobe.apk && adb logcat -s MESHPROBE:V
```
Робить рівно чотири речі: сканує за сервісом bitchat → підключається GATT → підписується на
характеристику → **розбирає кадри ВЛАСНИМ парсером** (написаним із §3, не портованим).

Результат (logcat, дослівно):
```
FOUND peer addr=7A:F9:1E:E3:DA:D4 rssi=-8
mtu=517 status=0                       ← MTU просимо ПЕРШИМ: типові 23 байти мовчки різали б кадри
SUBSCRIBED to 7A:F9:1E:E3:DA:D4
FRAME 178B :: v1 ANNOUNCE     ttl=7 sender=a454fd4358ecdfbd len=92 signed
FRAME 103B :: v1 REQUEST_SYNC ttl=0 sender=a454fd4358ecdfbd len=17 signed
advertising: OK
```
Звірка по байтах (hex того ж кадру):
`01 | 01 | 07 | 000001a0789df28d | 02 | 005c | a454fd4358ecdfbd | 0108 616e6f6e35333932…`
= версія 1 · ANNOUNCE · **TTL 7** (як у whitepaper) · timestamp · прапорець HAS_SIGNATURE · payload 92 ·
sender `a454fd4358ecdfbd` — **той самий peerID, що bitchat показав як `anon5392`** — і далі в корисних
даних `616e6f6e35333932` = ASCII **"anon5392"**, нік У ВІДКРИТОМУ ВИГЛЯДІ (підтверджує §4 whitepaper:
метадані — найслабше місце цього протоколу).

**Що це закриває:** наш код бачить, підключається, підписується, декодує і сам рекламується. Формат кадру
з §3 підтверджено на живому дроті, а не з читання. Ф1a по суті доведено в мікро-формі.
**Що лишається на Ф1a/Ф1b:** ВІДПОВІДАТИ (свій announce у їхньому форматі + Noise), тобто вже не парсер,
а стан; і GATT-сервер на нашому боці, щоб до нас підключались.

### §5.5 Ф1 КРОК 1 — ЗАКРИТО ДВОБІЧНО (2026-09-07, бокс)

**Критерій спеки досягнуто: стоковий bitchat бачить НАС як verified peer, а ми бачимо його.**

```
5556 (стоковий bitchat):  PeerManager: 🔄 Updated verified peer: meshnode (84980051ca897799)
                          MessageHandler: Verified announce from 84980051ca897799 (meshnode)
5554 (наш вузол):         MESHNODE: PEERS all=1 direct=1 [a454fd4358ecdfbd]
                          MESHNODE: in  REQUEST_SYNC from anon5392
                          MESHNODE: out v1 ANNOUNCE to anon5392
```
Нік `meshnode` у ЇХНЬОМУ списку прийшов з НАШОГО `AppStateStore` — тобто роз'єм працює наскрізь, а не
лише компілюється. Анонс підписаний і перевірений їхньою криптографією.

**Числа підсумку:** вендоровано **114 файлів / 32 530 рядків** (пін `9a399cc…`, Unlicense) + **8 файлів /
523 рядки** нашого роз'єму. APK **7,5 МБ** (їхній — 46 МБ). Збірка 1 хв 55 с на боксі.

**Тулчейн НЕ піднімали:** AGP 8.5.2, Kotlin 2.4.10, gradle 8.7, JDK 17, compileSdk 34, minSdk **26**
(єдина зміна проти шелла). Залежності — їхні ж координати, але СТАРІШІ artefacts там, де найновіші
вимагали AGP 9.1/SDK 37 через AAR-метадані: coroutines 1.11.0, gson 2.14.0, bcprov-jdk18on 1.85,
security-crypto **1.1.0-alpha06**, core-ktx **1.13.1**, lifecycle-process 2.8.7, `android.useAndroidX=true`.

**Що НЕ взяли** (і чому Ф1 не перетворився на всиновлення чужого продукту): app-шар з
ConversationRepository, Nostr (7 568 рядків), Tor, Wi-Fi Aware, hotspot, geohash-канали, Compose-UI
(29 407 рядків), камера + MLKit, самооновлювач, file-sharing.

**Роз'єм — 8 файлів у їхніх пакетах** (`docs/research/mesh-lab/adapter/`), кожен позначений «OUR CODE, in
THEIR package»:
| Файл | Що це |
|---|---|
| `AppStateStore.kt` | головний шов: сусіди по транспортах + повідомлення → `MeshSink` → (у шеллі) міст → сторінка |
| `DebugSettingsManager.kt` | 4 перемикачі (StateFlow, бо транспорт їх `collect`), ліміти лінків, трасування в logcat |
| `ContactDirectory.kt` | одна функція: канонічний id розмови = id співрозмовника |
| `HostServices.kt` | `NicknameProvider` (нік зі сторінки) + `MessageRouter` (null: другого транспорту нема) |
| `GeohashAliasRegistry.kt` | порожня мапа: геохеш-каналів не возимо |
| `HostNotifications.kt` | сповіщення — справа шелла, не транспорту |
| `MeshServiceHolder.kt` | лічильник власників спільного gossip; тіло СКОПІЙОВАНО, не переписано |
| `MainActivity.kt` | стенд; у шеллі стає `MeshLayer` (ті самі дві реєстрації, міст замість Log) |

**Дві пастки, кожна коштувала прогону:**
1. `BluetoothPermissionManager` вимагає **ACCESS_FINE/COARSE_LOCATION** РАЗОМ із трійцею BLUETOOTH_* і
   інакше пише `Missing Bluetooth permissions`, хоча dumpsys показує всі три granted=true. Це їхня
   перевірка, не Android: на targetSdk 31 з `neverForLocation` скан локації не потребує. Лишили як є —
   шелл питатиме так само, як bitchat.
2. `BluetoothMeshService` — це НЕ app-шар, як я спершу вирішив, а BLE-оркестратор: `MeshCore`
   використовує лише Wi-Fi Aware, для BLE ядром є саме він. Викидати його не можна.

**Відоме, не блокер:** у logcat повторюється `Disconnected … status 133 (client)` — класична generic GATT
failure Android; вузли при цьому лишаються verified peer-ами і обмін іде. Перевірити на живих телефонах.

**Далі:** крок 2 — приватне повідомлення в обидва боки (Noise уже всередині, окремої роботи нема);
крок 3 — перенести цей самий набір у шаблон як флейвор `mesh` + `MeshLayer` + дії мосту зі §4.

### §5.6 Ф1 КРОК 2 — КОД ГОТОВИЙ, доказ упирається в лінк емулятора (2026-09-07)

Приватка (Noise, наскрізь) реалізована в стенді: `MainActivity.greet(peerID)` — на кожного нового
verified direct-сусіда ініціює `initiateNoiseHandshake`, чекає `hasEstablishedSession` до 30 с, тоді
`sendPrivateMessage`. Вхідну ловить `MeshSink.onPrivateMessage` + `delegate.didReceiveMessage(isPrivate)`.
Збирається, ставиться (APK 7,5 МБ).

**АЛЕ доведення на емуляторі не вийшло, і причина НЕ в коді — вона в rootcanal.** Виміряно: ACL-зʼєднання
утворюється (`btm_ble_connected`, `onAdvertisingSetEnabled status=0`), але лінк нестабільний
(`Disconnected … status 133` повторюється), і цієї сесії жоден бік не дійшов до verified peer. Одиночний
підписаний ANNOUNCE проходить (доведено §5.5), а **3-крокове Noise-рукостискання потребує стабільнішого
вікна, ніж емулятор надійно дає** — воно то стартує, то рветься на середині. Дві спроби поспіль — нуль
прогресу → СТОП за бюджетом, без третього однакового прогону.

**Це саме той випадок, який §5.5 уже позначив:** дальність, стабільність лінка і завершеність рукостискання
= робота для ДВОХ ЖИВИХ ТЕЛЕФОНІВ (S25 + телефон власника), не для rootcanal. Емулятор довів те, на що він
здатний: наш вузол компілюється, стартує, стає verified-членом мешу і обмінюється анонсами двобічно.
Приватка — наступний доказ, і його місце на залізі. APK готовий до сайдлоуду поряд зі стоковим bitchat.

### §5.7 ФЛЕЙВОР ШЕЛЛА `mesh` ЗІБРАНО І ДОВЕДЕНО (2026-09-07, крок 3)

**Продакшн-шелл (`apk.microspec`) мешить — двобічно зі стоковим bitchat, з нашого APK.** Не meshnode, а
справжній флейвор шелла.

Прогін (бокс, emulator-5554 = наш шелл, 5556 = стоковий bitchat):
```
OUR shell:  BluetoothMeshService: Starting … peer ID: 1a8de71627bc9523
            BluetoothGattServer: onServiceAdded uuid=f47b5e2d-4a9e-4c5a-9b3f-8e1d2c3a4b5c status=0
            BluetoothGattServerManager: Advertising started · BLE scan started
stock:      MessageHandler: Verified announce from 1a8de71627bc9523
            PeerManager: 🔄 Updated verified peer: 1a8de71627bc9523
```
Збірка `assembleMeshRelease` на боксі: BUILD SUCCESSFUL 1:53, APK **7,3 МБ** (JVM-only, будь-який чип).

Що зроблено в шеллі (`microspec-edge/template`):
- build.gradle: kotlin+parcelize plugins, `kotlin.stdlib.default.dependency=false` (lite/full лишаються
  чистою Java), флейвор `mesh` (minSdk 26), source-set матриця (mesh = src/full ShellBridge + src/nogodot
  no-op Godot + src/mesh real MeshLayer + вендор; lite/full/godot += src/nomesh no-op MeshLayer),
  Java 17, meshImplementation з точними версіями (§5.5).
- `src/mesh/java/com/bitchat/android/**` — вендорений транспорт (114 файлів, пін 9a399cc).
- `src/mesh/java/apk/microspec/MeshLayer.java` (справжній, міст транспорт↔ShellBridge через
  BluetoothMeshDelegate) + `src/nomesh/.../MeshLayer.java` (no-op).
- ShellBridge: диспетч `mesh.start/stop/state/setNick/sendPublic/sendPrivate` + стріми
  `mesh.peers/messages/receipts` + очистка; MainActivity вплетено (attach + lifecycle).
- Пастка (спіймано): Kotlin interface defaults не видні Java як defaults без `-Xjvm-default=all` →
  Java-делегат мусить перекрити `didReceiveVerifyChallenge/Response` (+ `didResolvePrivateMediaPolicy`).

Каталог (`microspec/packages/shell/`): +9 дій `mesh.*` в actions.json, `flavours.mesh:["mesh"]`,
bridgeVersion 34→35, «mesh» додано в enum схеми (capability + flavours items); `deno task shell` →
`shell-actions.js` (bridge 35, 63 дії) регенеровано.

**ЛИШИЛОСЬ — стандартний ритуал релізу/деплою (outward-facing, потребує «go» власника; НЕ вигадка):**
1. core: bump версії → gates → publish на JSR → у продукті `deno task install` (щоб сторінка бачила
   mesh.* у каталозі).
2. edge template: зібрати флейвор `mesh` у CI (`build-template-apk.yml` + `mesh`), embed/scp
   `template-mesh.apk` на VPS; регенерувати `edge/apk/capabilities.js` (грант `mesh`); навчити `/feed/apk`
   power `mesh`; `Catalogue.java` → bridge 35.
3. згенерувати реальний APK poholos (power mesh), apk-see + телефон власника (verified peer з bitchat,
   приватка в обидва боки — §5.6 на живому лінку).
4. store-захоплення обох тем + slogan; push продукту (Today-рубрика публікує героя).

### §5.4 ПЛАН Ф1 ПЕРЕПИСАНО — тулчейн-розриву НЕМАЄ (2026-09-06, після §5.3)

Власник: «а тепер ми це присобачимо до нашої ферми збірника apk і все… ui це вже частина вебу». Так —
і два сьогоднішні виміри роблять це дешевшим, ніж планувалось. **§5.0 п.2 більше не є блокером.**

**Вимір 1 (§5.3):** кадр bitchat читається нашим Java-парсером на ~100 рядків. Кодек — не проблема.
**Вимір 2 (сьогодні):** `com.bitchat.android.noise.southernstorm/**` — **16 файлів ЧИСТОЇ Java, 11 459
рядків, НУЛЬ імпортів androidx / kotlin / android** (лише `java.security`, `javax.crypto`). Ліцензія
Unlicense. Тобто найдорожча половина — криптографія Noise — вендориться в наш Java-шаблон ЯК Є.

**⛔ ПОПРАВКА (власник спинив тут же): «ми взяли готовий код. ти про що зараз?»** Перша редакція цього
розділу пропонувала вендорити лише Noise, а решту (кодек, GATT-сервер, announce, relay, фрагменти,
store-and-forward) писати самим на Java. **Це помилка і пряме порушення
[[feedback_standard_first_no_invented_code]]** — «не вигадуй код… клонуй… бери за основу робочий і
збагачуй». `meshprobe` — доказ ТЕОРІЇ на 12 КБ, а НЕ підстава переписувати чужий доведений стек.
Переписаний relay/дедуп/фрагменти/store-and-forward = нові баги там, де їх уже немає.

**Правильно: беремо ВЕСЬ транспорт як є.** Вендоримо `mesh/`, `protocol/`, `noise/`, `model/` цілком
(Unlicense) і збагачуємо тільки на межі — `MeshLayer` + дії мосту.

Тулчейн — це питання **ПАКУВАННЯ, а не привід писати своє**:
- **Kotlin у шаблоні вже є прецедент** — флейвор `godot` тягне kotlin-stdlib. Kotlin — це gradle-плагін
  плюс stdlib, підключається ДЛЯ ФЛЕЙВОРА `mesh`, не для всього шаблона.
- **AGP 9.3.1 потрібен ЇХНЬОМУ проєкту, не їхнім файлам.** Вендоровані ДЖЕРЕЛА компілюються нашим AGP
  8.5.2 доти, доки не використовують API, яких немає в нашому compileSdk. BLE-код таких не використовує
  (перевірити компіляцією, не здогадом).
- **compileSdk 34 vs їхні 37** — те саме: значення має лише реальний виклик API, а не число в їхньому
  каталозі версій.
- `minSdk` флейвора `mesh`: 24 → **26** (їхня межа, «API 26 for proper BLE support»).
- Що з цього не зійдеться — правимо ТОЧКОВО на місці збою, з повним текстом помилки, а не обходимо
  переписуванням. Дві спроби на кожен збій, далі ескалація (§6).

Внесок `meshprobe` у Ф1 — не код, а ЗНАННЯ: підтверджений формат кадру, робочий рецепт
scan → connect → MTU 517 → CCCD → notify, і готовий стенд, на якому видно, чи наш вузол став своїм.

**Форма інтеграції (незмінна, дзеркало `godot`):** флейвор `mesh` = `full` + `MeshLayer` + foreground
service; дії `mesh.*` зі §4 у `packages/shell/actions.json` → `deno task shell` → `Catalogue.java`;
`flavours` map каже, що `mesh` несе capability; шаблон-ФАЙЛ `edge/apk/template-mesh.apk` (CI → scp на VPS);
сторінка отримує через `spec.profile.apk: "mesh"` → `power: "mesh"`. **UI — це веб**: нуль протокольної
логіки в JS, лише `/_rt/shell.js` і `runtime/meshstage.js`; тест UI — Playwright на моковому стані
([[feedback_test_function_not_ui]]), тест транспорту — logcat.

**Порядок робіт Ф1 (замінює старі Ф1a/Ф1b):**
1. **Вендорити транспорт цілком** (`mesh/`, `protocol/`, `noise/`, `model/` з піна `9a399cc…`) у
   мінімальний Android-проєкт БЕЗ Compose/Nostr/voice/UI; підключити Kotlin-плагін; компілювати нашим
   AGP 8.5.2 / compileSdk 34 / minSdk 26 і правити ТОЧКОВО те, що не зійшлося.
   **Доказ:** запустити `BluetoothMeshService`, підписатись на делегата → у logcat наш процес бачить
   `verified peer`, а стоковий bitchat на сусідньому емуляторі бачить НАС (`PeerManager: New verified peer`).
   Це двобічно, на відміну від `meshprobe`, який лише слухав.
2. Приватне повідомлення в обидва боки (Noise іде разом із транспортом, окремої роботи немає).
3. Перенести той самий вендорений набір у шаблон як флейвор `mesh` + `MeshLayer` + дії мосту зі §4 +
   `template-mesh.apk` (CI → scp на VPS).
4. Апка ферми (UI у наших матеріалах, лічильник сусідів у шапці, іконка за `rules/art.md`).

Справжня невідомість лишилась одна — крок 1, і вона про КОМПІЛЯЦІЮ чужих джерел під наш тулчейн,
а не про протокол.

### Ф0 — Доказ у лабі (клон + стоковий APK на apk-see) — ВИКОНАНО, див. §5.1
**Мета:** довести, що наша лаба взагалі бачить BLE-меш, ДО будь-якого коду шелла.
**Кроки:**
1. `git clone https://github.com/permissionlesstech/bitchat-android` у scratchpad; запиши хеш HEAD у стрім.
2. Зібрати стоковий debug APK (Android SDK/NDK; `./gradlew :app:assembleDebug`). Якщо збірка червона —
   це ще не наша проблема, залогуй і ескалюй (це показник, чи середовище готове).
3. `bash vps/apk-see.sh --lab <шлях-до-bitchat-debug.apk>` (у `/root/microspec-edge`) — підняти на емуляторі.
   Якщо є друга AVD / S25 — підняти два інстанси.
4. wisp/prox: сканувати ефір на сервіс `F47B5E2D` — підтвердити рекламу.
**Критерій готовності:** у logcat/скані видно рекламу сервісу `F47B5E2D` від стокового bitchat.
**Знімає ризик:** чи робить apk-see-емулятор реальне BLE-радіо між AVD. Якщо НІ — зафіксуй у стрімі, що
тест мешу лише на S25 + телефон власника, і це не блокер для Ф1.

### Ф1a — Мінімальний Android-застосунок з транспортом bitchat (важка ізоляція)
**Мета:** довести, що транспортний підпакет bitchat КОМПІЛЮЄТЬСЯ і працює ОКРЕМО від UI bitchat. Це
найризикованіша частина (замикання залежностей чужого коду) — робиться у ВИКИДНОМУ мінімальному апці, де
помилки дешеві.
**Кроки:**
1. Новий мінімальний Android-проєкт (без Compose): один Activity + foreground service.
2. Вендорити з клону ЛИШЕ: `mesh/`, `protocol/`, `noise/`, `model/` + їхнє замикання залежностей
   (kotlin-stdlib, kotlinx.coroutines — це принесе флейвор, як godot приніс androidx.fragment). Обрізати
   все, що тягне Compose/Nostr/voice/geohash. Компілювати ітеративно, прибираючи непотрібні гілки.
3. Інстанціювати `BluetoothMeshService`/`UnifiedMeshService`, підписатися на його делегат, логувати
   peers/announce/повідомлення в logcat.
4. Дозволи в маніфесті: `BLUETOOTH_SCAN` (з `neverForLocation`), `BLUETOOTH_ADVERTISE`, `BLUETOOTH_CONNECT`,
   `FOREGROUND_SERVICE`. targetSdk 31.
**Критерій готовності:** мінімальний апк на apk-see (`--lab`) рекламує `F47B5E2D` і в logcat бачить announce
від стокового bitchat з Ф0 (два інстанси або S25). Тобто ДВА РІЗНІ застосунки в одному BLE-меші.
**Якщо замикання залежностей не сходиться за 2 спроби** — СТОП, ескалюй (§6): можливо, вендорити ширший
підпакет як окремий gradle-модуль і покластися на R8 у release.

### Ф1b — Флейвор шелла `mesh`
**Мета:** внести доведений транспорт у наш APK-шелл як можливість.
**Кроки (дзеркало godot, читай `portal-godot.md` §1–2):**
1. `template/`: новий source set/флейвор `mesh` = `full` + вендорені пакети з Ф1a + `MeshLayer.kt`
   (аналог `GodotLayer`) + foreground service. `nogodot`-подібний no-op `MeshLayer` для lite/full/godot.
2. `MeshLayer` мапить делегат мешу ↔ `ShellBridge` (події в кільце `system.logs` + у сторінку через
   `window.__msShellReply`/подію, як у godot). Ніколи не генерувати JS через рядок у Java (§1).
3. Каталог `packages/shell/actions.json`: дії `mesh.*` (§4), capability `mesh`; `flavours` map: `mesh`
   несе capability `mesh`. `deno task shell` → `apk/java-gen.mjs` (`Catalogue.java`). Грант-листи
   генеруються (`edge/apk/capabilities.js`), не типуються руками.
4. Шаблон-ФАЙЛ `edge/apk/template-mesh.apk` (kotlin-stdlib великий → як godot, gitignored, scp на VPS,
   один `--allow-read` шлях). Додати до `build-template-apk.yml` (гілка `apk-template`). Виміряти розмір APK.
5. Валідатор `apk/validate-js-in-java.mjs` має покривати новий JS-несучий Java (перевір, що не порожній).
**Критерій готовності:** `bash vps/apk-see.sh <тест-сторінка> --power mesh --wait 45000` — наш шелл піднімає
foreground service, рекламує `F47B5E2D`, стоковий bitchat (Ф0) бачить наш announce. Гейти зелені, підпис v2
валідний, інсталяція проходить (layout, не лише verify).

### Ф2 — Апка ферми (UI)
**Мета:** продукт, який бачить власник.
**Кроки:**
1. `runtime/meshstage.js` — сторона сторінки (як `godotstage.js`): обгортка над `/_rt/shell.js` для дій
   §4. Новий entrypoint у core → директивний рядок `@ts-self-types` + `/** @module */` + `deno task dts`
   + JSDoc на кожен export ([[reference_jsr_dts_generator]]).
2. Нова апка `apps/mesh` (або назва власника): `spec.json` (`profile.apk: "mesh"`), `scaffold --force`,
   `head.html`. Екрани: **Канал #поруч** (публічна кімната, історія), **Приватні** (список peer-ів + діалог),
   зверху ЖИВИЙ рядок присутності «N поруч · до K стрибків», квитанції ✓/✓✓ на приватних, банер «нікого
   поруч, віддам коли зʼявиться» коли peerCount=0. У наших матеріалах, преміум-бар (`rules/design.md`).
3. **Іконка ПЕРШИМ комітом** (`rules/art.md`, поди Z-Image, виміряти icongeom). Захоплення обох тем +
   `slogan_mesh` того ж дня (Today-рубрика).
4. `deno task sw` (import-граф змінився), гейти, `bash vps/see.sh mesh` обидві теми/стани перед пушем.
**Критерій готовності (це НЕ кількість, а інтероп):** на двох телефонах (S25 + власника) публічне
повідомлення з НАШОЇ апки зʼявляється у СТОКОВОМУ bitchat і навпаки; приватне доставляється з квитанцією;
відхід за межу досяжності роняє лічильник до 0 і показує банер. Зняти на око, показати власнику.

### Ф3 — Міст Reticulum (ВІДКЛАДЕНО — не починати без окремого рішення)
Меш-вузол несе ще й RNS: BLE-меш як інтерфейс Reticulum (`docs/research/nomad.md`). Залежить від рішення
власника по «Номад». Не входить у цей запуск.

## §6. Коли СТОП і ескалація до Fable

Передай назад сильній моделі (Fable), НЕ пали третю спробу, якщо:
- Замикання залежностей bitchat не компілюється після 2 підходів (Ф1a).
- Інтероп не працює: наш вузол і стоковий bitchat не бачать одне одного, попри валідну рекламу (Ф1b/Ф2) —
  це налагодження за дротом (звірка байтів кадру, Noise-хендшейк), робота для Fable.
- Будь-що навколо підпису v2 / вирівнювання / інсталяції (це вже колись коштувало днів, `rules/shell.md`).
- apk-see не дає BLE між інстансами і немає другого фізичного телефону для тесту.
Формат ескалації: що пробував, точний доказ (logcat/скан/помилка ЦІЛКОМ, без `cut`/`tail`), гіпотеза.

## §7. Читати першим (джерела істини)
- `docs/research/ble-mesh.md` §8 (дріт + план), `portal-godot.md` (шаблон флейвора), `rules/shell.md`,
  `rules/art.md`, `rules/design.md`, `rules/constraints.md`.
- bitchat-android: `mesh/BluetoothMeshService.kt`, `UnifiedMeshService.kt`, `PacketRelayManager.kt`,
  `FragmentManager.kt`, `StoreForwardManager.kt`, `BluetoothGattServerManager.kt`,
  `BluetoothGattClientManager.kt`, `protocol/BinaryProtocol.kt`, `util/AppConstants.kt`.
