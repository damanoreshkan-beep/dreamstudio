// Iskra — one-tap ESP32 firmware flasher. Point it at an M5StickC Plus2, press Flash, and the SHELL writes
// the image: `flash.run` hands the edge's firmware URL (/feed/m5fw) to the `flash` flavour, whose vendored
// ESP ROM loader resets the chip into its download ROM and writes it, reporting progress on `flash.progress`.
//
// WHY THE PAGE DOES NOT DO THE PROTOCOL. It used to: esptool-js drove a serial port proxied over the bridge,
// one round-trip per read. Measured 2026-09-16 — that cannot meet the ROM's ~100 ms sync window, and a 2.7 MB
// image is ~42k crossings. The protocol belongs next to the USB, so it moved into the shell and this file
// kept only the screen. A browser has no such shell, so there the app is a stub that hands over the APK.
//
// The screen is one object — a progress ring around the device (styles in head.html, the .isk-* classes).
import { html } from "htm/preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { shell } from "/_rt/shell.js";
import { buildApk, apkFilename, downloadBlob } from "/_rt/apk.js";
import { report } from "/_rt/telemetry.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

const FW_URL = VPS_PROXY + "/m5fw";   // the edge serves the token-bearing image; the runtime seals this fetch
const FLASH_ADDR = 0x0;     // merged image (bootloader + partition table + app) → offset 0

const R = 54, C = 2 * Math.PI * R;   // the ring geometry (viewBox 0 0 120 120, cx/cy 60, r 54)
// Flashing exists only inside our `flash`-flavour APK: no browser can force-claim the CH9102 (Android holds
// it in cdc_acm), and the ROM's timing cannot survive the bridge. Elsewhere this app is a download-APK stub.
const inApk = () => shell.has("flash.run");

export function iskra({ S, toast }) {
  const t = useStore(S.t);
  // phase: idle | flashing | done | error. The gate seeds "idle" (the e2e asserts the front door under a
  // headless DOM that has no WebSerial), so nothing here ever reaches for a device under the gate.
  const [phase, setPhase] = useState("idle");
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState(null);   // the loader's latest line — shown small while busy, and on error
  const busyRef = useRef(false);
  const [apkBusy, setApkBusy] = useState(false);   // building the download-APK for a browser that cannot flash

  // Progress while the shell writes: a percentage for the ring, a line for the status. Subscribed for the
  // screen's life so a flash started on one render keeps reporting; the cancel comes from the shell facade.
  useEffect(() => {
    if (gate || !inApk()) return;
    return shell.subscribe("flash.progress", {}, (f) => {
      if (typeof f?.pct === "number") setPct(f.pct / 100);
      if (f?.line) setMsg(String(f.line));
    }, () => { /* the run's own rejection carries the reason */ });
  }, []);

  const flash = async () => {
    if (busyRef.current || !inApk()) return;
    busyRef.current = true;
    setPhase("flashing"); setPct(0); setMsg(T(t, "connecting"));
    // Instrumented to the edge (report → /feed/log) so an on-device flash can be debugged with no console:
    // read `bash vps/logs.sh iskra 1h flash`.
    report("flash.start", { via: "native" }, "info");
    try {
      // ONE call: the shell fetches the image, resets the chip into its download ROM and writes it.
      const r = await shell.call("flash.run", { url: FW_URL, address: FLASH_ADDR });
      report("flash.done", { bytes: r?.bytes || 0 }, "info");
      setPct(1); setMsg(null); setPhase("done"); toast?.(T(t, "toastDone"));
    } catch (e) {
      setMsg(String(e?.detail || e?.message || e));
      setPhase("error");
      report("flash.error", { code: e?.code || "", msg: String(e?.detail || e?.message || e).slice(0, 160) });
    } finally {
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
      // power: the flavour this app declares in spec.json — the shell that carries the ESP loader. Without it
      // the edge would hand back plain `full`, which answers flash.run with `unavailable`.
      const blob = await buildApk({ url: location.href.split("#")[0].split("?")[0], name, power: "flash" });
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
  const phaseLine = busy ? T(t, "flashingLine")
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
