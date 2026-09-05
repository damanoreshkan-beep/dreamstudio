# apk-see — «Playwright для APK»: Android-емулятор на VPS (2026-09-06 — ПРАЦЮЄ)

Власник: «як ти тестуєш апки? типу аналог плейрайту» → «так, будуй apk-see на VPS» → «рухайся в цю сторону…
тест нашого апк». Стан: образ `microspec-apk-see` (8.5 ГБ) на VPS, драйвер `microspec-edge/vps/apk-see.sh`
(`--build | --up | --down | <app> [--power godot] [--wait ms] [--tap x,y] | --lab <apk>`), бут ~1:40 під
вкладеним KVM, гість онлайн після `cmd wifi connect-network AndroidWifi open` (у `--up`). **Перший улов — за
хвилину після мережі**: причина крашу порталу на S25 (`--main-pack` заборонений бібліотекою Godot без
`disable_path_overrides=no`), далі три помилки в нашому GDScript/Java і кеш паку без валідації. Нижче — план
(виконано пп. 1–3), виміри й лабораторія.

## Навіщо
Сьогодні APK ніде не запускається до телефона власника: CI перевіряє лише підпис (`apksigner verify`) і маніфест
(`aapt2 badging`); краш «closed because this app has a bug» видно тільки в logcat, якого в нас нема. apk-see =
see-под для APK: збірка через `/feed/apk` → `adb install` → запуск → `screencap` + `logcat` + вердикт.

## Ресурси VPS (виміряно 2026-09-06 ~00:30 UTC)
6 vCPU EPYC 2 ГГц з AMD-V, `/dev/kvm` є і **пишеться з контейнера** (`--device /dev/kvm`, перевірено),
7.7 ГБ RAM (вільно ~4.5, поди+едж ~2 ГБ), 186 ГБ диска. Емулятор за запитом: `-memory 2048 -cores 3`, x86_64
Android 14 `google_apis` (НЕ `google_apis_playstore`: без Play образ дає `adb root`), GPU `swiftshader_indirect`,
камера `hw.camera.back=virtualscene` (рендерена 3D-сцена — камерна апка бачить картинку). Холодний бут 1–2 хв,
зі снапшоту ~10 с. Образ ~2 ГБ.

## Що треба добудувати
1. **Образ** (Dockerfile у `vps/apk-see/`): SDK cmdline-tools → `sdkmanager` (platform-tools, emulator, один
   system image) → `avdmanager create avd see` → config.ini переписати цілком (камера, розмір 1080×2340/440,
   RAM). Запуск: `docker run --device /dev/kvm -p 127.0.0.1:5555:5555 microspec-apk-see`.
2. **ABI**: шаблон `godot` має нести й `x86_64` (Godot AAR має; `abiFilters 'arm64-v8a','x86_64'`), а патчер
   лишати ОДИН ABI на збірку (`abi` у запиті `/feed/apk`, default arm64-v8a; `lib/<інший>/` викидається) — щоб
   телефон не качав емуляторну копію (~25 МБ). Чернетка була написана й відкочена (не заважати паузі).
3. **Драйвер** `vps/apk-see.sh <app> [--power godot] [--abi x86_64] [--wait ms] [--tap x,y]`: APK з публічного
   `/feed/apk` → `docker cp` → `adb install -r` → package = `apk.microspec.a<sha8(url)>` → `am start -n
   <pkg>/apk.microspec.MainActivity` → wait → `adb exec-out screencap -p` → `logcat -d` з часу старту, фільтр
   pid + `AndroidRuntime` + `DEBUG` + `godot` → JSON-вердикт як в ока (`errors`, `crash`, `anr`) + PNG у скретч.
4. **Ризик №1**: Vulkan Mobile у Godot на SwiftShader емулятора — може впасти у GL Compatibility або не піти;
   перший прогін це покаже. Fallback: `--rendering-driver opengl3` через `godot.start` params.

## Ідея на потім (власник): apk-see як ЛАБОРАТОРІЯ
«Накатити чужі апки і реверсити їх API, свій драйвер, свій віртуальний пристрій, повний уявний Wireshark —
наприклад TikTok шаркнути». Що для цього є і що ні:
- Емулятор = свій пристрій із root (`adb root` на образі без Play): можна поставити будь-який APK, зняти
  трафік цілком (`tcpdump` у гості або на `emulator -tcpdump out.pcap` — весь трафік ВМ у pcap для Wireshark),
  а HTTPS розкривати через **mitmproxy** як проксі емулятора (`-http-proxy`) із CA, встановленим як СИСТЕМНИЙ
  (root → `/system/etc/security/cacerts`, або через Magisk-модуль на образі з writable system).
- **Certificate pinning** (TikTok, більшість великих апок) не обходиться CA — потрібен **Frida** (frida-server у
  гості, скрипти unpinning) або objection; ARM-only апки на x86-образі йдуть через ARM-трансляцію (Android 11+),
  повільно й не завжди. Для TikTok реальніше — образ arm64 на ARM-хості (нема) або справжній телефон із root.
- Юридично/етично: свій пристрій, свій трафік — дослідження API дозволене, масовий скрейпінг і обхід захисту
  ToS — рішення власника, не автоматизація в гейтах (див. «No public proxies», «no paid API in gates»).
- Наш драйвер поверх: `vps/apk-see.sh --lab <apk> --pcap out.pcap --mitm` — ставить APK, вмикає проксі/дамп,
  ганяє сценарій тапів, віддає pcap + mitm-flow. Це той самий apk-see плюс три прапорці.

## Що емулятор доводить, а що ні (виміряно на порталі, 7 прогонів)
Доводить: інсталяція й запуск APK, міст (`msShell` у logcat), завантаження/валідацію паку, старт рушія, камеру
(Camera2 → YCbCr-кадри в Godot), потік стану в сторінку, крахи/ANR з причиною. НЕ доводить картинку рушія:
SwiftShader не презентує Vulkan і не лінкує GLES3-шейдери Godot (uniform-ліміт 261). Тому шелл на емуляторі
вмикає `--rendering-driver opengl3` (щоб рушій хоч презентував), а GPU-рендер судить телефон.

## Порядок, коли повернемось
образ (п.1) → пробний бут → ABI (п.2, CI шаблону + scp) → драйвер (п.3) → портал на емуляторі → лабораторія.
