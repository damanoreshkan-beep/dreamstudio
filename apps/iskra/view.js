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

const FW_URL = VPS_PROXY + "/m5fw";
const FLASH_ADDR = 0x0;

const R = 54, C = 2 * Math.PI * R;
const inApk = () => shell.has("flash.run");

export function iskra({ S, toast }) {
  const t = useStore(S.t);
  const [phase, setPhase] = useState("idle");
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState(null);
  const busyRef = useRef(false);
  const [apkBusy, setApkBusy] = useState(false);

  useEffect(() => {
    if (gate || !inApk()) return;
    return shell.subscribe("flash.progress", {}, (f) => {
      if (typeof f?.pct === "number") setPct(f.pct / 100);
      if (f?.line) setMsg(String(f.line));
    }, () => { });
  }, []);

  useEffect(() => {
    if (gate || !inApk()) return;
    if (!/[?&]autoflash=1/.test(location.search)) return;
    const id = setTimeout(() => flash(), 900);
    return () => clearTimeout(id);
  }, []);

  const flash = async () => {
    if (busyRef.current || !inApk()) return;
    busyRef.current = true;
    setPhase("flashing"); setPct(0); setMsg(T(t, "connecting"));
    report("flash.start", { via: "native" }, "info");
    try {
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

  const getApk = async () => {
    if (apkBusy) return;
    setApkBusy(true);
    try {
      const name = T(t, "title");
      const blob = await buildApk({ url: location.href.split("#")[0].split("?")[0], name, power: "flash" });
      downloadBlob(blob, apkFilename(name));
    } catch (e) { toast?.(String(e?.message || e)); }
    finally { setApkBusy(false); }
  };

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
  const showPct = busy;
  const glyph = done ? "lucide:check" : err ? "lucide:zap-off" : "lucide:zap";
  const btnLabel = busy ? T(t, "flashing", { p: Math.round(pct * 100) })
    : done ? T(t, "flashAgain") : err ? T(t, "retry") : T(t, "flash");
  const btnIcon = done ? "lucide:check" : err ? "lucide:rotate-ccw" : "lucide:zap";
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

function idleHint(t, phase) {
  if (phase === "idle") return T(t, "hint");
  if (phase === "done") return T(t, "doneHint");
  if (phase === "error") return T(t, "errorHint");
  return "";
}
