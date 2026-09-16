# Iskra — research & state map

One-tap ESP32 firmware flasher for **M5StickC Plus2** (ESP32-PICO, USB bridge **CH9102**, `1a86:55d4`).
The page is only the screen: the **shell** writes the image.

## Where the protocol lives, and why (2026-09-16)

It used to live here: `esptool-js` drove a Web Serial port that proxied every read/write over the native
bridge. **Measured, it cannot work.** The ESP ROM loader is chatty and timing-tight — a ~100 ms sync window
and thousands of blocks — while each read costs a WebView↔native round-trip (~100–200 ms). Sync never caught
a reply, and a 2.7 MB image would be ~42k crossings. Symptom in the logs: `Failed to connect with the
device`, with the chip answering only its own boot log.

So the protocol moved next to the USB. The `flash` APK flavour vendors **EspToolbox's ESP ROM loader**
(Kotlin, MIT, `com.crescenzi.esp32`, verbatim) plus its Physicaloid AAR and the usb-serial driver; a thin
`FlashLayer` wires it to two actions. The page makes **one** call.

Board quirk that cost the most: on this M5 the reset lines are **swapped** versus stock esptool —
**DTR drives EN, RTS drives GPIO0**. EspToolbox's `UsbRepo.reset()` encodes it, so we take that verbatim
rather than deriving it again.

## The contract

| | |
| --- | --- |
| `shell.call("flash.run", { url, address })` | fetch the image, reset into the download ROM, write it. Resolves when done. |
| `shell.subscribe("flash.progress")` | `{ pct?, line? }` while it writes. |
| `spec.json` → `profile.apk: "flash"` | the flavour the Download-APK button asks the edge for. |

`inApk()` is `shell.has("flash.run")` — true only inside the `flash`-flavour APK (bridge ≥ 38).

## State map (the view's phases)

| phase | trigger | screen |
| --- | --- | --- |
| `browser` | `!gate && !inApk()` | stub: "flashing lives in the app" + **Download APK** button |
| `idle` | in the APK (or the gate) | device card + Flash button + hint |
| `flashing` | Flash pressed | determinate ring from `flash.progress`, the loader's line under it |
| `done` | `flash.run` resolved | success card + "Flash again" |
| `error` | `flash.run` rejected | error card + the shell's `detail` + "Retry" |

Under the headless gate there is no bridge, so the view seeds the **flasher** (idle) — the e2e asserts the
front door — never the browser stub.

## Firmware

Served by the edge at `/feed/m5fw` (`VPS_PROXY + "/m5fw"`) and fetched **by the shell**, never bundled — the
image carries the device token. It is a **merged** image (bootloader + partition table + app), written at
**`0x0`**. The box's `arduino-cli` recipe confirms the equivalent offsets: bootloader `0x1000`, partitions
`0x8000`, `boot_app0` `0xe000`, app `0x10000`, `--flash-mode/freq/size keep`, `-z`.

## Debugging on the device

`bash vps/logs.sh iskra 1h flash` — `flash.start` → `flash.done {bytes}` or `flash.error {code, msg}`.
