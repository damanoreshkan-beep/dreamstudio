import { html } from "htm/preact";
import { useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { T } from "/_rt/i18n.js";
import { Panel, Island, Sheet, Stage } from "/_rt/ui.js";
import { shell, ERR } from "/_rt/shell.js";
import { gate } from "/_rt/gate.js";
import { compass, geo, wakeLock } from "/_rt/sensors.js";
import { newRose, addSample, roseStats, hasBearing, petal, BEARING_MIN_COVERAGE } from "/_rt/df.js";
import { classify, band, smooth, rotates, unwrapDeg, sightTrend } from "/_rt/radar.js";
import { vendorOf } from "/_rt/oui.js";
import { $roseAt, $devices, $fix, $target, $scanning, $err, RADIO_MS, $now, Icon, useField, $oui, $look, $copied, Legend, Reason, KIND_ICON, labelOf } from "./store.js";
import { loadOui, askAbout } from "./lookup.js";
import { dossier, copyText, MapView } from "./details.js";

const HUNT_TAU = 30_000;
let rose = newRose(72, HUNT_TAU);
let stopScan = null, radioTimer = null, ageTimer = null, stopCompass = null, stopGeo = null, lock = null;
let heading = 0;
const $heading = atom(0);

const GATE_FIELD = [
  { addr: "4C:11:22:33:44:55", name: "", rssi: -63, raw: "0201060516b2fc0700", kind: "ble" },
  { addr: "B8:27:EB:0A:0B:0C", name: "Earbuds", rssi: -47, raw: "05ff4c00070f", kind: "ble" },
  { addr: "C3:0A:0B:0C:0D:0E", name: "Tile", rssi: -78, raw: "0201060303edfe", kind: "ble" },
  { addr: "0A:99:88:77:66:55", name: "", rssi: -92, raw: "020106", kind: "ble" },
  { addr: "24:0A:C4:11:22:33", name: "Gate-AP", rssi: -52, kind: "wifi", ftm: true, freq: 5180 },
  { addr: "3C:5A:B4:44:55:66", name: "Gate-Guest", rssi: -74, kind: "wifi", ftm: false, freq: 2437 },
  { addr: "lte:301", name: "LTE 1300", rssi: -89, kind: "lte", serving: true, cid: 27183, lac: 4102, mcc: 255, mnc: 1, radio: "lte" },
  { addr: "lte:118", name: "LTE 1300", rssi: -104, kind: "lte", serving: false },
];

function seedRose(dirDeg = 292) {
  rose = newRose(72, HUNT_TAU);
  for (let b = 0; b < 72; b++) {
    const h = (b + 0.5) * 5;
    const off = Math.abs(((h - dirDeg + 540) % 360) - 180);
    addSample(rose, h, 0.12 + 0.78 * Math.max(0, Math.cos((off * Math.PI) / 180)) ** 2);
  }
  $roseAt.set(Date.now());
}

function upsert(frame) {
  if (!frame || frame.started || frame.ack || !frame.addr) return;
  const now = Date.now();
  const next = new Map($devices.get());
  const prev = next.get(frame.addr);
  const kind = frame.kind || "ble";
  const sm = smooth(prev?.smooth ?? NaN, frame.rssi, prev ? now - prev.at : 0);
  const sightings = [...(prev?.sightings || []), { at: now, rssi: frame.rssi, fix: $fix.get() }].slice(-60);
  next.set(frame.addr, {
    ...frame, kind, smooth: sm, at: now, first: prev?.first ?? now, sightings,
    cls: kind === "ble" ? classify(frame) : null,
  });
  $devices.set(next);

  if ($target.get() === frame.addr && Number.isFinite(frame.rssi)) {
    addSample(rose, heading, Math.max(0, (frame.rssi + 110) / 70));
    $roseAt.set(Date.now());
  }
}

const cellNum = (v) => (Number.isInteger(v) && v > 0 && v < 0x10000000 ? v : null);

async function sweepRadios() {
  if (shell.has("wifi.scan")) {
    try {
      const r = await shell.call("wifi.scan", {});
      for (const n of r.networks || []) {
        if (n.bssid) upsert({ addr: n.bssid, name: n.ssid || "", rssi: n.rssi, kind: "wifi", ftm: n.ftm, freq: n.freq });
      }
    } catch { }
  }
  if (shell.has("cell.info")) {
    try {
      const r = await shell.call("cell.info", {});
      for (const c of r.cells || []) {
        const id = c.pci ?? c.cid ?? c.lac;
        if (id == null) continue;
        upsert({
          addr: `${c.type || "cell"}:${id}`, name: `${(c.type || "cell").toUpperCase()} ${c.arfcn ?? ""}`.trim(),
          rssi: c.rssi, kind: "lte", serving: !!c.serving, cid: cellNum(c.cid), lac: cellNum(c.lac),
          mcc: cellNum(c.mcc), mnc: cellNum(c.mnc), radio: (c.type || "lte").toLowerCase(),
        });
      }
    } catch { }
  }
}

export function startScan() {
  if ($scanning.get()) return;
  $scanning.set(true);
  $err.set(null);
  if (gate) {
    for (const d of GATE_FIELD) upsert(d);
    if ($target.get()) seedRose();
    return;
  }
  rose = newRose(72, HUNT_TAU);
  $roseAt.set(Date.now());
  lock = wakeLock.acquire();
  stopScan = shell.subscribe("ble.scan", {}, upsert, (e) => {
    $err.set(e?.detail || e?.code || ERR.failed);
    $scanning.set(false);
  });
  sweepRadios();
  radioTimer = setInterval(sweepRadios, RADIO_MS);
  ageTimer = setInterval(() => $now.set(Date.now()), 1000);
  stopCompass = compass.start((deg) => {
    heading = deg;
    const h = Math.round(deg) % 360;
    if (h !== $heading.get()) $heading.set(h);
  });
  stopGeo = geo.watch((p) => $fix.set({ lat: p.lat, lon: p.lng, acc: p.accuracy }), () => {});
}

function endScan() {
  $scanning.set(false);
  try { stopScan?.(); } catch { }
  stopScan = null;
  clearInterval(radioTimer); radioTimer = null;
  clearInterval(ageTimer); ageTimer = null;
  try { stopCompass?.(); } catch { }
  try { stopGeo?.(); } catch { }
  try { lock?.release(); } catch { }
  stopCompass = stopGeo = lock = null;
}

export function ScanButton({ t }) {
  const on = useStore($scanning);
  const why = shell.whyCapability("ble");
  return html`<button data-scan=${on ? "on" : "off"} disabled=${!!why && !gate}
    onClick=${() => (on ? endScan() : startScan())}
    class=${`btn btn-sm gap-2 shrink-0 ${on ? "" : "btn-primary"}`}>
    ${Icon(on ? "lucide:square" : "lucide:radar")}<span>${T(t, on ? "stop" : "start")}</span>
  </button>`;
}

export function listView({ S, t, toast, screen, openScreen, closeScreen }) {
  const field = useField(S);
  const target = useStore($target);
  const oui = useStore($oui);
  const loc = useStore(S.locale);
  const look = useStore($look);
  const copied = useStore($copied);
  useEffect(loadOui, []);
  const takeIt = async (d) => {
    $target.set(d.addr);
    if (gate) seedRose(); else { rose = newRose(72, HUNT_TAU); $roseAt.set(Date.now()); }
    const text = dossier(d, t, oui, loc);
    const ok = await copyText(text);
    $copied.set({ addr: d.addr, lines: text.split("\n").length, ok });
    toast?.(T(t, ok ? "copied" : "copyFail"));
  };
  return html`<div class="flex flex-col gap-[var(--ms-gap)]">
    <${Panel}>
      <div class="flex items-center gap-[var(--ms-gap)] min-w-0">
        <${ScanButton} t=${t} />
        <${Legend} t=${t} field=${field} />
      </div>
      <${Reason} t=${t} />
    <//>

    <${Panel} title=${T(t, "signal")}>
      <div data-live data-copied=${copied?.addr || ""} data-copied-lines=${copied?.lines || 0} data-copied-ok=${copied?.ok ? "1" : "0"} class="flex flex-col">
        ${field.length === 0 ? html`<div class="text-base-content/70 text-sm">${T(t, "nothingYet")}</div>` : null}
        ${""}
        ${field.map((d) => {
          const lk = look && look.addr === d.addr ? look : null;
          const verdict = lk?.state === "done" ? (lk.v.found ? "found" : lk.v.reason) : lk?.state === "asking" ? "asking" : "";
          return html`<div key=${d.addr} data-row=${d.addr} data-verdict=${verdict} class="border-b border-base-content/10 last:border-0">
          <div class="flex items-center gap-1 min-w-0">
          <button data-dev=${d.addr} data-kind=${d.kind}
          aria-pressed=${String(d.addr === target)}
          onClick=${() => takeIt(d)}
          class="ms-reveal flex-1 min-w-0 text-left py-2 rounded-[var(--ms-r-in)] transition-colors hover:bg-base-content/5">
          <span class="flex items-center gap-2 min-w-0">
            ${Icon(KIND_ICON[d.kind], `text-[length:var(--ms-icon)] shrink-0 ${d.kind === "ble" ? "text-[var(--app-accent)]" : "text-base-content/70"}`)}
            <span class="flex-1 min-w-0 truncate">${labelOf(d, t)}</span>
            ${d.cls?.separated ? html`<span data-sep class="shrink-0 font-mono uppercase tracking-wide text-[length:var(--ms-label)] px-1.5 rounded-full border border-[var(--app-accent)]">${T(t, "sepTag")}</span>` : null}
            <span data-pct class="shrink-0 font-mono tabular-nums text-base-content">${d.percent}%</span>
          </span>
          ${""}
          <span class="mt-1.5 block h-1 rounded-full bg-base-content/10 overflow-hidden">
            <span class="block h-full rounded-full transition-[width] duration-500 ${d.kind === "ble" ? "bg-[var(--app-accent)]" : "bg-base-content/60"}"
              style=${`width:${d.percent}%`}></span>
          </span>
          ${""}
          <span class="mt-1 block font-mono text-[length:var(--ms-label)] text-base-content/70">
            ${(() => { const v = vendorOf(d.addr, d.kind, oui); return v ? html`<span data-vendor>${v}</span> · ` : null; })()}
            ${T(t, "band_" + band(d.smooth ?? d.rssi))} · ${Math.round(d.smooth ?? d.rssi)} dBm${rotates(d.addr) && d.kind === "ble" ? " · " + T(t, "rotating") : ""}
            ${""}
            ${d.cid || d.lac
              ? html` · <span data-cellid>${[d.cid ? `CID ${d.cid}` : null, d.lac ? `LAC ${d.lac}` : null].filter(Boolean).join(" · ")}</span>`
              : null}
          </span>
          </button>
          <button data-check=${d.addr} aria-label=${T(t, "check")} disabled=${verdict === "asking"}
            class=${`btn btn-ghost btn-sm btn-circle shrink-0 ${verdict === "found" ? "text-[var(--app-accent)]" : "text-base-content/70"}`}
            onClick=${() => verdict === "found" ? openScreen("where") : askAbout(d, field, () => openScreen("where"))}>
            ${Icon("lucide:map-pin", "text-xl")}
          </button>
          </div>
          ${lk?.state === "done" && !lk.v.found
            ? html`<div data-verdict-line class="pb-2 text-sm text-muted">${T(t, "no_" + lk.v.reason)}</div>`
            : null}
        </div>`;
        })}
      </div>
    <//>

    ${""}
    <${Sheet} id="where" open=${screen === "where"} onClose=${closeScreen} title=${T(t, "whereTitle")} icon="lucide:map-pin">
      ${look?.v?.found && screen === "where"
        ? html`<div data-where class="flex flex-col gap-[var(--ms-gap)]">
          <${MapView} lat=${look.v.lat} lon=${look.v.lon} accuracy=${look.v.accuracy} />
          <div class="flex items-baseline justify-between gap-2 min-w-0">
            <span class="font-mono tabular-nums">${look.v.lat.toFixed(5)}, ${look.v.lon.toFixed(5)}</span>
            <span class="font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-muted shrink-0">±${Math.round(look.v.accuracy || 0)} m · ${look.v.source}</span>
          </div>
          ${""}
          <div class="font-mono text-[length:var(--ms-label)] text-muted">© OpenStreetMap contributors</div>
        </div>`
        : html`<div class="text-sm text-muted">${T(t, "no_unknown")}</div>`}
    <//>
  </div>`;
}

export function huntView({ S, t, screen, openScreen, closeScreen }) {
  const field = useField(S);
  const target = useStore($target);
  useStore($roseAt);
  const dev = field.find((d) => d.addr === target) || null;
  const stats = roseStats(rose);
  const locked = hasBearing(stats);
  const p = petal(rose);
  let max = 0;
  for (let i = 0; i < p.length; i++) max = Math.max(max, p[i]);

  const path = [];
  for (let i = 0; i < p.length; i++) {
    const a = ((i + 0.5) / p.length) * Math.PI * 2 - Math.PI / 2;
    const r = 12 + (max > 0 ? (p[i] / max) * 30 : 0);
    path.push(`${i ? "L" : "M"}${(50 + Math.cos(a) * r).toFixed(2)} ${(50 + Math.sin(a) * r).toFixed(2)}`);
  }
  const dPath = path.join(" ") + " Z";

  const angRef = useRef(0);
  if (stats.bearingDeg !== null) angRef.current = unwrapDeg(angRef.current, stats.bearingDeg);
  const hdg = useStore($heading);
  const dialRef = useRef(0);
  dialRef.current = unwrapDeg(dialRef.current, hdg);
  const trend = dev ? sightTrend(dev.sightings) : null;

  const spread = Math.max(12, Math.min(80, 90 * (1 - stats.r)));
  const wx = (a, r) => (50 + r * Math.sin((a * Math.PI) / 180)).toFixed(2);
  const wy = (a, r) => (50 - r * Math.cos((a * Math.PI) / 180)).toFixed(2);
  const wedge = `M50 50 L${wx(-spread, 40)} ${wy(-spread, 40)} A40 40 0 0 1 ${wx(spread, 40)} ${wy(spread, 40)} Z`;

  return html`<div class="h-full min-h-0 flex flex-col gap-[var(--ms-gap)] ms-side">
    <${Stage}>
      <div class="absolute inset-0 flex items-center justify-center">
        <svg viewBox="0 0 100 100" class="w-full h-full max-h-full text-base-content" role="img"
          aria-label=${T(t, locked ? "aLobe" : "aCircle")}>
          <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-width="0.4" opacity="0.18" />
          <circle cx="50" cy="50" r="12" fill="none" stroke="currentColor" stroke-width="0.4" opacity="0.18" />
          ${""}
          <path d="M47.4 2.6 L52.6 2.6 L50 7.6 Z" fill="currentColor" opacity="0.65" />
          <g class="hv-dial" style=${`transform:rotate(${(-dialRef.current).toFixed(1)}deg)`}>
            ${
              Array.from({ length: 36 }, (_, i) => {
                const a = (i * 10 * Math.PI) / 180 - Math.PI / 2;
                const major = i % 9 === 0;
                const r0 = major ? 36 : 39.5;
                return html`<line key=${i} x1=${(50 + Math.cos(a) * r0).toFixed(2)} y1=${(50 + Math.sin(a) * r0).toFixed(2)}
                  x2=${(50 + Math.cos(a) * 42).toFixed(2)} y2=${(50 + Math.sin(a) * 42).toFixed(2)}
                  stroke="currentColor" stroke-width=${major ? 0.7 : 0.35} opacity=${major ? 0.45 : 0.2}
                  class=${i === 0 ? "text-[var(--app-accent)]" : ""} />`;
              })}
            ${""}
            ${max > 0 ? html`<path data-petal d=${dPath} style=${`d:path('${dPath}')`}
              fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="0.7"
              class=${`hv-petal text-[var(--app-accent)] ${gate ? "" : "hv-e-in"}`} />` : null}
            ${stats.bearingDeg !== null ? html`<g data-bearing
              class=${`hv-rose text-[var(--app-accent)] ${gate ? "" : "hv-e-in"}`}
              style=${`transform:rotate(${angRef.current.toFixed(1)}deg)`} opacity=${locked ? 1 : 0.55}>
              <path class="hv-petal" d=${wedge} style=${`d:path('${wedge}')`} fill="currentColor" fill-opacity="0.1" />
              <line x1="50" y1="50" x2="50" y2="10" stroke="currentColor" stroke-width=${locked ? 1.4 : 0.9}
                stroke-dasharray=${locked ? "none" : "2.5 2"} stroke-linecap="round" />
              <path d="M50 5.5 L46.6 13 L53.4 13 Z" fill="currentColor" />
            </g>` : null}
          </g>
          ${""}
          ${dev ? html`<g data-strength class="font-mono">
            <text x="50" y="53" text-anchor="middle" font-size="10.5" fill="currentColor"
              class="text-base-content font-mono">${dev.percent}</text>
            <text x="50" y="58.6" text-anchor="middle" font-size="3.2" fill="currentColor"
              class="text-base-content font-mono" opacity="0.55">${Math.round(dev.smooth ?? dev.rssi)} dBm</text>
            ${trend === "up" ? html`<path data-trend="up" d="M50 38 L47.4 42 L52.6 42 Z"
              fill="currentColor" class="text-[var(--app-accent)]" />` : null}
            ${trend === "down" ? html`<path data-trend="down" d="M50 42 L47.4 38 L52.6 38 Z"
              fill="currentColor" class="text-base-content" opacity="0.5" />` : null}
          </g>` : null}
        </svg>
      </div>
    <//>

    <div class="ms-side-main flex flex-col justify-end items-center pb-[var(--ms-gap)]">
      <${Island} className="w-full max-w-md">
        <div class="flex items-center gap-[var(--ms-gap)] min-w-0">
          <${ScanButton} t=${t} />
          <button data-pick class="btn btn-sm btn-ghost gap-2 min-w-0 flex-1 justify-start" onClick=${() => openScreen("pick")}>
            ${Icon("lucide:crosshair")}<span class="truncate">${dev ? labelOf(dev, t) : T(t, "pickTarget")}</span>
          </button>
        </div>
        ${""}
        <div data-live class="font-mono uppercase tracking-wide text-[length:var(--ms-label)]">
          <div class="text-base-content truncate">${locked
            ? T(t, "strongestAt").replace("{deg}", Math.round(stats.bearingDeg))
            : T(t, "coverage").replace("{pct}", Math.round(stats.coverage * 100))}${
              stats.coverage < BEARING_MIN_COVERAGE && stats.samples > 0 ? " · " + T(t, "keepSweeping") : ""}</div>
          <div class="text-base-content/70 truncate">
            ${T(t, "concentration")} ${stats.r.toFixed(2)} · ${T(t, "samples")} ${stats.samples}
          </div>
        </div>
      <//>
    </div>

    <${Sheet} id="pick" open=${screen === "pick"} onClose=${closeScreen} title=${T(t, "pickTarget")} icon="lucide:crosshair">
      <div class="flex flex-col gap-1">
        ${field.filter((d) => d.kind === "ble").map((d) => html`<button key=${d.addr} data-pick-dev=${d.addr}
          aria-pressed=${String(d.addr === target)}
          onClick=${() => { $target.set(d.addr); if (gate) seedRose(); else { rose = newRose(72, HUNT_TAU); $roseAt.set(Date.now()); } closeScreen(); }}
          class="btn btn-ghost justify-start h-auto min-h-0 py-2 rounded-[var(--ms-r-in)]">
          <span class="flex-1 min-w-0 text-left">
            <span class="block truncate">${labelOf(d, t)}</span>
            <span class="block font-mono text-[length:var(--ms-label)] text-base-content/70">${d.percent}% · ${Math.round(d.smooth ?? d.rssi)} dBm</span>
          </span>
        </button>`)}
        ${field.filter((d) => d.kind === "ble").length === 0
          ? html`<div class="text-base-content/70 text-sm">${T(t, "nothingYet")}</div>` : null}
      </div>
    <//>
  </div>`;
}
