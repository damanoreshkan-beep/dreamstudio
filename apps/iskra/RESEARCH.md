# Iskra — research & state map

One-tap ESP32 firmware flasher. Target: **M5StickC Plus2** (ESP32-PICO family), USB bridge **CH9102** (WCH,
`usbVendorId 0x1a86`). Flashing runs entirely in the browser over **WebSerial** with **esptool-js** — no
server, no native tool.

## State map (the view's phases)

| phase | trigger | screen |
| --- | --- | --- |
| `idle` | first paint (WebSerial present) | device card + Flash button + hint |
| `unsupported` | `!("serial" in navigator)` | desktop-Chrome note (no button) |
| `flashing` | Flash pressed → connect → write | button disabled with `{p}%`, determinate progress bar, chip line, live log |
| `done` | writeFlash + after() resolved | success card + "Flash again" |
| `error` | any thrown error (except a dismissed picker) | error card + last log line + "Retry" |

A dismissed port picker (`NotFoundError`/`AbortError`) returns to `idle`, not `error`.

Under the headless gate (`/_rt/gate.js`), the DOM has no WebSerial, so nothing reaches for a device; the
view seeds a mid-flash screen (62 %, a chip name, four log lines) so the store capture is alive.

## esptool-js API (pinned: esptool-js@0.6.1)

- Loaded lazily: `const { ESPLoader, Transport } = await import("https://esm.sh/esptool-js@0.6.1")` — only on
  the first Flash, so preflight/the gate never touch the network and there is no SW-shell dependency.
- `new Transport(port, true)` → `new ESPLoader({ transport, baudrate: 115200, terminal })` → `esploader.main()`
  (returns the chip name) → `esploader.writeFlash({...})` → `esploader.after()` (hard reset) → `transport.disconnect()`.
- **`fileArray[].data` is a `Uint8Array`, NOT a binary string** (this changed from the old ~0.4.x API).
  Convert the fetched image with `new Uint8Array(await res.arrayBuffer())`.
- `reportProgress: (fileIndex, written, total) => …` — `written/total` is the fraction.

## Decisions to confirm before shipping

1. **Image type & offset.** The code assumes a **merged** image (bootloader + partition table + app in one
   file) written at **`0x0`** with `flashMode/flashFreq/flashSize: "keep"` (don't rewrite the image header).
   If instead the build is a **bare app image**, it belongs at `0x10000` and needs the bootloader (`0x1000`)
   and partition table (`0x8000`) flashed too — change `FLASH_ADDR`/`fileArray` in `view.js` accordingly.
2. **Vendor id.** Confirm the bridge on the physical unit is CH9102 (`0x1a86`). A different revision could ship
   another bridge; widen/adjust the `filters` in `view.js` if so.

## Firmware asset

`assets/firmware.bin` is the app's own binary, committed and served verbatim (`deploy/build.mjs` copies
`apps/<id>/assets/*`). It is referenced with `new URL("./assets/firmware.bin", import.meta.url).href` and
fetched only when Flash is pressed. **Drop the real image into `assets/firmware.bin` and record its
provenance/version here before the first push.**
