// Iskra — one-tap ESP32 firmware flasher over WebSerial. Point it at an M5StickC Plus2 (its CH9102 USB
// bridge is WCH vendor 0x1a86), press Flash, and esptool-js writes the app's own firmware.bin straight to
// the chip over the serial link and resets it. The firmware comes from the EDGE (/feed/m5fw), fetched only
// at flash time — never bundled or committed, because the image carries the device token. esptool-js is loaded
// LAZILY on the first flash (dynamic import) so the module graph stays clean and the headless gate never
// reaches the network. The screen is one object — a progress ring around the device (styles in head.html,
// the .isk-* classes). WebSerial is desktop Chrome/Edge only; where it isn't there, the view says so.
// The flash offset and the "keep" header options assume a MERGED image (bootloader+partitions+app in one
// .bin at 0x0); see RESEARCH.md if your build is a bare app image instead.
import { html } from "htm/preact";
import { useState, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { usbSerialAvailable, makeUsbSerialPort } from "./serialusb.js";
import { buildApk, apkFilename, downloadBlob } from "/_rt/apk.js";
import { report } from "/_rt/telemetry.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

const FW_URL = VPS_PROXY + "/m5fw";   // the edge serves the token-bearing image; the runtime seals this fetch
const ESPTOOL = "https://esm.sh/esptool-js@0.6.1";
const CH_VENDOR = 0x1a86;   // WCH CH9102 / CH340 — the M5StickC Plus2 USB bridge
const FLASH_ADDR = 0x0;     // merged image (bootloader + partition table + app) → offset 0
const BAUD = 115200;

const R = 54, C = 2 * Math.PI * R;   // the ring geometry (viewBox 0 0 120 120, cx/cy 60, r 54)
// The ONLY way to flash is from inside our APK: its native USB bridge (shell.usb.*) force-claims the CH9102,
// which no browser can do (Android holds it in cdc_acm; a WebSerial "success" on DeX/Chrome never reaches the
// chip). So in a browser this app is a stub that hands over the APK; the flasher runs only in the shell.
const inApk = () => usbSerialAvailable();

export function iskra({ S, toast }) {
  const t = useStore(S.t);
  // phase: idle | flashing | done | error. The gate seeds "idle" (the e2e asserts the front door under a
  // headless DOM that has no WebSerial), so nothing here ever reaches for a device under the gate.
  const [phase, setPhase] = useState("idle");
  const [pct, setPct] = useState(0);
  const [chip, setChip] = useState(null);
  const [msg, setMsg] = useState(null);   // the latest esptool line — shown small while busy, and on error
  const busyRef = useRef(false);
  const [apkBusy, setApkBusy] = useState(false);   // building the download-APK for a phone that has no WebSerial

  const flash = async () => {
    if (busyRef.current || !inApk()) return;
    busyRef.current = true;
    setPhase("flashing"); setPct(0); setChip(null); setMsg(T(t, "connecting"));
    // Instrumented to the edge (report → /feed/log) so an on-device flash can be debugged with no console:
    // read `bash vps/logs.sh iskra 1h flash`. Steps: start → port → sync → fw → done, or error with the reason.
    report("flash.start", { via: "shellusb" }, "info");
    let transport;
    try {
      const { ESPLoader, Transport } = await import(ESPTOOL);
      // The CH9102 is driven over the shell's native USB bridge (serialusb.js → shell.call usb.*); esptool-js
      // sees an ordinary SerialPort.
      const port = await makeUsbSerialPort({ vid: CH_VENDOR });
      report("flash.port", { via: "shellusb" }, "info");
      transport = new Transport(port, true);
      const term = { clean() {}, writeLine: (d) => { setMsg(d); report("flash.esptool", { line: String(d).slice(0, 120) }, "info"); }, write() {} };
      const esploader = new ESPLoader({ transport, baudrate: BAUD, terminal: term });
      const name = await esploader.main("no_reset");   // our serial port already reset the chip into the ROM
      report("flash.sync", { chip: name }, "info");
      setChip(name); setMsg(null);
      const bytes = new Uint8Array(await (await fetch(FW_URL)).arrayBuffer());   // ArrayBuffer → Uint8Array (esptool-js wants bytes, NOT a binary string)
      report("flash.fw", { bytes: bytes.length }, "info");
      await esploader.writeFlash({
        fileArray: [{ data: bytes, address: FLASH_ADDR }],
        flashSize: "keep", flashMode: "keep", flashFreq: "keep",
        eraseAll: false, compress: true,
        reportProgress: (_i, written, total) => setPct(total ? written / total : 0),
      });
      await esploader.after();   // hard-reset out of the bootloader into the freshly flashed app
      report("flash.done", {}, "info");
      setPct(1); setPhase("done"); toast?.(T(t, "toastDone"));
    } catch (e) {
      // a dismissed port picker is "not now", not a fault — fall back to idle without an error card
      if (e && (e.name === "NotFoundError" || e.name === "AbortError")) { setPhase("idle"); setMsg(null); report("flash.cancel", {}, "info"); }
      else { setMsg(String(e?.message || e)); setPhase("error"); report("flash.error", { name: e?.name || "", msg: String(e?.message || e).slice(0, 160) }); }
    } finally {
      try { await transport?.disconnect(); } catch { /* link already gone */ }
      busyRef.current = false;
    }
  };

  // A phone browser has neither WebSerial nor the shell bridge, so flashing can't run on the web here. Build
  // the APK instead — our own shell wrapper of this same page, which reaches the CH9102 through its native USB
  // bridge (serialusb.js). Same farm mechanism as apps/os: the edge signs it and grants our origin the `full`
  // flavour that carries `usb`. The start URL is this page, so Android treats a re-download as an update.
  const getApk = async () => {
    if (apkBusy) return;
    setApkBusy(true);
    try {
      const name = T(t, "title");
      const blob = await buildApk({ url: location.href.split("#")[0].split("?")[0], name });
      downloadBlob(blob, apkFilename(name));
    } catch (e) { toast?.(String(e?.message || e)); }
    finally { setApkBusy(false); }
  };

  // In a browser the device is unreachable, so everything but this stub is inert: show the "get the APK" card.
  // The gate seeds the flasher (the e2e asserts the front door under a headless DOM with no shell bridge).
  if (!gate && !inApk()) {
    return html`<div class="isk-stage">
      <div data-dev data-phase="browser" class="isk-dev">
        <div class="isk-core">${Icon("lucide:smartphone", "isk-glyph")}</div>
      </div>
      <div class="isk-card">
        <div class="isk-msg">${T(t, "unsupportedTitle")}</div>
        <div class="isk-hint">${T(t, "unsupportedHint")}</div>
        <button id="apk-btn" disabled=${apkBusy} onClick=${getApk} class="btn btn-primary rounded-2xl isk-go">
          ${Icon("lucide:download", "")}${apkBusy ? T(t, "apkBuilding") : T(t, "getApk")}
        </button>
      </div>
    </div>`;
  }

  const busy = phase === "flashing", done = phase === "done", err = phase === "error";
  const devCls = `isk-dev ${busy ? "is-busy" : done ? "is-done" : err ? "is-err" : ""}`.trim();
  const showPct = busy;   // the number lives in the core while writing; a glyph the rest of the time
  const glyph = done ? "lucide:check" : err ? "lucide:zap-off" : "lucide:zap";
  const btnLabel = busy ? T(t, "flashing", { p: Math.round(pct * 100) })
    : done ? T(t, "flashAgain") : err ? T(t, "retry") : T(t, "flash");
  const btnIcon = done ? "lucide:check" : err ? "lucide:rotate-ccw" : "lucide:zap";
  // the status line under the ring
  const phaseLine = busy ? (chip ? T(t, "chipLine", { chip }) : T(t, "connecting"))
    : done ? T(t, "doneTitle") : err ? T(t, "errorTitle") : "";
  const hintLine = idleHint(t, phase);

  return html`<div class="isk-stage">
    <div data-dev data-phase=${phase} class=${devCls}>
      <svg class="isk-ring" viewBox="0 0 120 120" aria-hidden="true">
        <circle class="isk-track" cx="60" cy="60" r=${R}></circle>
        <circle class="isk-fill" cx="60" cy="60" r=${R}
          style=${`stroke-dasharray:${C};stroke-dashoffset:${C * (1 - (done ? 1 : pct))}`}></circle>
      </svg>
      <div class="isk-core">
        ${showPct
          ? html`<div class="isk-pct">${Math.round(pct * 100)}<span>%</span></div>`
          : Icon(glyph, "isk-glyph")}
      </div>
    </div>

    <div class="isk-status">
      ${phaseLine ? html`<div class=${`isk-phase ${err ? "isk-bad" : ""}`.trim()}>${phaseLine}</div>` : null}
      ${hintLine ? html`<div class="isk-hint">${hintLine}</div>` : null}
      ${msg && (busy || err) ? html`<div class=${`isk-chip ${err ? "isk-bad" : ""}`.trim()}>${msg}</div>` : null}
    </div>

    <div class="isk-actions">
      <button id="flash-btn" disabled=${busy} onClick=${flash} class="btn btn-primary rounded-2xl isk-go">
        ${Icon(btnIcon, "")}${btnLabel}
      </button>
      <div class="isk-dev-name">${T(t, "deviceName")} · ${T(t, "firmwareName")}</div>
    </div>
  </div>`;
}

// The one-line lede under the ring, per phase (the error/done detail lives in isk-hint through phaseLine).
function idleHint(t, phase) {
  if (phase === "idle") return T(t, "hint");
  if (phase === "done") return T(t, "doneHint");
  if (phase === "error") return T(t, "errorHint");
  return "";
}
