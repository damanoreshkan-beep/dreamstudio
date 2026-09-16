# Iskra — research & state map

One-tap ESP32 firmware flasher for **M5StickC Plus2** (ESP32-PICO family), USB bridge **CH9102** (WCH,
`1a86:55d4`). Flashing runs **only inside our APK**: the native USB bridge (`shell.usb.*`) force-claims the
CH9102 and `serialusb.js` presents it to **esptool-js** as an ordinary `SerialPort`. No server, no native
tool — and no browser path.

## Why the browser is a stub

A browser cannot reach the device. Android holds the CH9102 in the kernel `cdc_acm` driver, and no browser
can detach it: Android Chrome/WebView have no working WebSerial for it, and on Samsung DeX Chrome exposes
`navigator.serial` but a "success" there never reaches the chip. So the app checks one thing — **are we
inside our APK** (`inApk() = usbSerialAvailable()`, i.e. `shell.usb.*` is present). If not, the whole app is
a stub: one card that builds and downloads the APK. The flasher renders only in the shell.

## State map (the view's phases)

| phase | trigger | screen |
| --- | --- | --- |
| `browser` | `!gate && !inApk()` | stub: "flashing lives in the app" + **Download APK** button |
| `idle` | in the APK (or the gate) | device card + Flash button + hint |
| `flashing` | Flash pressed → connect → write | button disabled with `{p}%`, determinate ring, chip line, live log |
| `done` | writeFlash + after() resolved | success card + "Flash again" |
| `error` | any thrown error (except a dismissed picker) | error card + last log line + "Retry" |

Under the headless gate (`/_rt/gate.js`) there is no shell bridge, so the view seeds the **flasher** (idle)
— the e2e asserts the front door — never the browser stub.

## Download-APK path (the stub's only action)

`getApk` → `buildApk({ url: location.href, name })` (`/_rt/apk.js`) → edge `POST /feed/apk` signs the APK and
grants our origin the **`full`** flavour, whose bridge carries the `usb` capability → `downloadBlob`. So the
downloaded APK is this same page wrapped in the shell that can actually flash. Same mechanism as `apps/os`.
The start URL is this page, so Android treats a re-download as an update, not a second copy.

## esptool-js API (pinned: esptool-js@0.6.1)

- Loaded lazily on the first Flash: `const { ESPLoader, Transport } = await import("https://esm.sh/esptool-js@0.6.1")`.
- `new Transport(port, true)` → `new ESPLoader({ transport, baudrate: 115200, terminal })` → `esploader.main()`
  (returns the chip name) → `esploader.writeFlash({...})` → `esploader.after()` (hard reset) → `transport.disconnect()`.
- **`fileArray[].data` is a `Uint8Array`, NOT a binary string** — convert with `new Uint8Array(await res.arrayBuffer())`.
- `reportProgress: (fileIndex, written, total) => …` — `written/total` is the fraction.
- `port` here comes from `serialusb.js` (`shell.usb.*`), which also drives the ESP reset (RTS→EN, DTR→GPIO0).

## Firmware

The token-bearing image is served by the edge at `/feed/m5fw` (`VPS_PROXY + "/m5fw"`), fetched only at flash
time — never bundled or committed, because it carries the device token. The code assumes a **merged** image
(bootloader + partition table + app) written at **`0x0`** with `flashMode/flashFreq/flashSize: "keep"`.

## To confirm on the physical unit

1. **Vendor/product id** of the bridge is `1a86:55d4` (CH9102). A different revision could ship another
   bridge — re-probe descriptors and adjust `serialusb.js`.
2. **DTR/RTS polarity** for the reset-into-bootloader sequence on the M5 board.
