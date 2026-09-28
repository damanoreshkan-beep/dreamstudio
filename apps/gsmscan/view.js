import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Sheet, Segmented, Island, Slider, Panel } from "/_rt/ui.js";
import { gate } from "/_rt/gate.js";
import { BANDS, arfcnToFreq } from "/_rt/gsmband.js";
import { usbSupported, USB_FILTERS } from "/_rt/hackrf.js";
import { createUsbSession } from "/_rt/usbsession.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70";
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { } };
const fMhz = (hz) => (hz / 1e6).toFixed(1);
const NORM_LO = -118, NORM_HI = -48;
const norm = (db) => Math.max(0, Math.min(1, (db - NORM_LO) / (NORM_HI - NORM_LO)));
const BAND_KEYS = ["gsm900", "dcs1800"];

const $spectrum = atom(null), $arfcns = atom([]), $sweep = atom({ active: false, frac: 0 });
const $band = persistentAtom("gsmscan:band", "gsm900", { encode: String, decode: (s) => (BANDS[s] ? s : "gsm900") });
const $lna = persistentAtom("gsmscan:lna", 24, { encode: String, decode: Number });
const $vga = persistentAtom("gsmscan:vga", 32, { encode: String, decode: Number });

const rf = createUsbSession({
  atom,
  spawn: () => new Worker(new URL("./dsp.worker.js", import.meta.url), { type: "module" }),
  supported: usbSupported,
  filters: USB_FILTERS,
  start: () => ({ type: "start", band: $band.get(), lna: $lna.get(), vga: $vga.get() }),
  reset: () => { $spectrum.set(null); $arfcns.set([]); $sweep.set({ active: false, frac: 0 }); },
  onMessage: (m) => {
    if (m.type === "sweep") { $spectrum.set(new Float32Array(m.buf || m.spectrum)); $arfcns.set(m.arfcns || []); $sweep.set({ active: true, frac: 1 }); }
    else if (m.type === "sweepProgress") $sweep.set({ active: true, frac: m.frac ?? $sweep.get().frac });
  },
});
const $connected = rf.$connected, $usbOk = rf.$usbOk;

const connect = () => { buzz(12); return rf.connect(); };
const disconnect = () => { buzz(); rf.disconnect(); };
function setBand(b) { buzz(); $band.set(b); $arfcns.set([]); $spectrum.set(null); rf.post({ type: "band", band: b }); }
function pushGain() { rf.post({ type: "gain", lna: $lna.get(), vga: $vga.get() }); }

function ctx2d(cv) { try { return cv && cv.getContext ? cv.getContext("2d") : null; } catch { return null; } }
function rgbTriplet(cv, prop) {
  try {
    const cs = getComputedStyle(cv);
    const v = (prop ? cs.getPropertyValue(prop) : cs.color).trim();
    const hex = v.match(/^#([0-9a-f]{6})$/i);
    if (hex) return [1, 3, 5].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).join(",");
    const rgb = v.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (rgb) return `${rgb[1]},${rgb[2]},${rgb[3]}`;
  } catch { }
  return "128,128,128";
}
function drawSpectrum(cv, bins) {
  const c = ctx2d(cv); const w = cv?.width | 0, h = cv?.height | 0; if (!c || !w || !h || !bins) return;
  const ink = rgbTriplet(cv), fill = rgbTriplet(cv, "--app-accent");
  c.clearRect(0, 0, w, h);
  const n = bins.length;
  c.beginPath(); c.moveTo(0, h);
  for (let x = 0; x <= w; x++) { const v = norm(bins[Math.min(n - 1, (x / w * n) | 0)]); c.lineTo(x, h - v * h); }
  c.lineTo(w, h); c.closePath();
  const g = c.createLinearGradient && c.createLinearGradient(0, 0, 0, h);
  if (g && g.addColorStop) { g.addColorStop(0, `rgba(${fill},0.5)`); g.addColorStop(1, `rgba(${fill},0.04)`); c.fillStyle = g; } else c.fillStyle = `rgba(${fill},0.3)`;
  c.fill();
  c.beginPath();
  for (let x = 0; x <= w; x++) { const v = norm(bins[Math.min(n - 1, (x / w * n) | 0)]); const y = h - v * h; x ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.strokeStyle = `rgba(${ink},0.8)`; c.lineWidth = Math.max(1, h / 90); c.stroke();
}
function useCanvas(draw, deps) {
  const ref = useRef(null), paint = useRef(draw);
  paint.current = draw;
  const fit = (cv) => {
    const box = cv.parentElement; if (!box) return false;
    const r = box.getBoundingClientRect(), w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h) return false;
    cv.style.display = "block"; cv.style.width = `${w}px`; cv.style.height = `${h}px`;
    const dpr = Math.min(2, (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1);
    const ww = w * dpr, hh = h * dpr;
    if (cv.width !== ww || cv.height !== hh) { cv.width = ww; cv.height = hh; }
    return true;
  };
  useEffect(() => {
    const cv = ref.current, box = cv && cv.parentElement; if (!cv || !box) return;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { if (fit(cv)) paint.current(cv); }) : null;
    ro && ro.observe(box);
    return () => ro && ro.disconnect();
  }, []);
  useEffect(() => { const cv = ref.current; if (cv && fit(cv)) draw(cv); }, deps);
  return ref;
}

function seedBand(n, phase = 0) {
  const out = new Float32Array(n); const peaks = [0.12, 0.3, 0.52, 0.68, 0.85];
  for (let b = 0; b < n; b++) {
    const d = b / n; let v = -112 + 3 * Math.sin(b * 0.5) + 2 * Math.sin(b * 0.17 + phase);
    for (const p of peaks) v = Math.max(v, -112 + 60 * Math.exp(-((d - p) ** 2) / 0.00008));
    out[b] = v;
  }
  return out;
}

export function gsmscanView({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t), theme = useStore(S.theme);
  const connected = useStore($connected), usbOk = useStore($usbOk), band = useStore($band);
  const spectrum = useStore($spectrum), arfcns = useStore($arfcns), sweep = useStore($sweep);
  const demo = gate;

  useEffect(() => {
    if (!demo) return;
    $connected.set(true); $spectrum.set(seedBand(360, 3));
    $arfcns.set([
      { arfcn: 18, freq: arfcnToFreq("gsm900", 18), db: -58, bcch: true }, { arfcn: 44, freq: arfcnToFreq("gsm900", 44), db: -64, bcch: true },
      { arfcn: 62, freq: arfcnToFreq("gsm900", 62), db: -71, bcch: false }, { arfcn: 81, freq: arfcnToFreq("gsm900", 81), db: -76, bcch: true },
      { arfcn: 103, freq: arfcnToFreq("gsm900", 103), db: -83, bcch: false },
    ]);
    $sweep.set({ active: true, frac: 1 });
  }, []);

  if (!connected) {
    const supported = usbSupported() && usbOk;
    return html`<div class="flex flex-col items-center justify-center text-center gap-5 pt-10 px-2 max-w-sm mx-auto" data-connect-state=${supported ? "ready" : "unsupported"}>
      ${""}
      <div class="w-20 h-20 rounded-[var(--ms-r)] grid place-items-center sf-raised sf-e3 text-[var(--app-accent)]">${Icon("lucide:antenna", "text-4xl")}</div>
      <h2 class="text-2xl font-semibold">${T(t, "connectTitle")}</h2>
      <p class="text-base-content/70 leading-relaxed">${T(t, "connectBody")}</p>
      ${supported
        ? html`<button id="connect" data-connect class="btn btn-primary btn-lg rounded-full gap-2 mt-1" onClick=${connect}>${Icon("lucide:usb")}${T(t, "connectBtn")}</button>`
        : html`<${Panel} className="w-full items-center text-warning text-sm"><div class="flex items-center gap-2">${Icon("lucide:triangle-alert", "shrink-0")}<span>${T(t, "noUsb")}</span></div><//>`}
    </div>`;
  }

  return html`<${Fragment}>
    <div class="@container flex flex-col gap-[var(--ms-gap)] max-w-[440px] mx-auto w-full pb-24"
      data-sweep=${sweep.active ? "on" : "off"} data-band-sel=${band} data-carrier-count=${arfcns.length}>
      <!-- band selector -->
      <div class="flex items-center gap-2 pt-0.5">
        <div class="flex-1 min-w-0"><${Segmented} attr="data-band" size="sm" label=${T(t, "spectrum")}
          items=${BAND_KEYS.map((k) => ({ id: k, label: BANDS[k].label }))} value=${band} onChange=${setBand} /></div>
      </div>

      <!-- band spectrum -->
      ${""}
      <div class="w-full rounded-[var(--ms-r)] sf-raised sf-e2 overflow-hidden">
        ${""}
        <div style="height:6rem">
          <canvas ref=${useCanvas((cv) => drawSpectrum(cv, $spectrum.get()), [spectrum, theme])} class="block w-full h-full text-base-content" role="img" aria-label=${T(t, "spectrum")} data-spectrum></canvas>
        </div>
        <div class=${`flex justify-between px-3 py-1 ${LABEL} tabular-nums border-t border-base-content/10`}>
          <span>${fMhz(BANDS[band].dlLo)}</span><span>${BANDS[band].label}</span><span>${fMhz(BANDS[band].dlHi)} MHz</span>
        </div>
      </div>

      <!-- active carriers -->
      <div class="flex items-center justify-between px-1">
        <span class=${LABEL}>${T(t, "carriers")}</span>
        <span class="font-mono text-[length:var(--ms-label)] tabular-nums text-muted" data-count>${arfcns.length}</span>
      </div>
      <div class="flex flex-col gap-1.5" data-live data-carriers>
        ${arfcns.length ? arfcns.map((a) => html`<div key=${a.arfcn} data-arfcn=${a.arfcn} class="flex items-center gap-[var(--ms-gap)] rounded-[var(--ms-r)] sf-raised sf-e2 px-[var(--ms-pad)] py-2.5">
          <span class="font-mono tabular-nums text-lg w-14 shrink-0">${a.arfcn}</span>
          <div class="flex-1 min-w-0 flex flex-col">
            <span class="font-mono tabular-nums text-sm truncate">${fMhz(a.freq)}<span class="text-muted"> MHz</span></span>
            ${""}
            ${a.bcch ? html`<span class="font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-info" data-bcch>BCCH · C0</span>` : null}
          </div>
          <${Bars} level=${norm(a.db)} label=${T(t, "sigLabel")} />
          <span class="font-mono tabular-nums text-[length:var(--ms-label)] text-muted w-14 text-right shrink-0 @max-[300px]:hidden">${a.db} dBm</span>
        </div>`)
      : html`<div class="flex flex-col items-center text-muted py-10 gap-2 text-center px-6">${Icon("lucide:radio-tower", "text-3xl")}<span class="text-sm">${T(t, sweep.active ? "scanning" : "noCarriers")}</span></div>`}
      </div>
    </div>

    <!-- floating control island: sweep status + settings + power -->
    ${""}
    <${Island} pinned data-player className="w-full max-w-[440px] flex items-center gap-2.5">
        ${Icon("lucide:radar", `text-lg shrink-0 ${sweep.active ? "text-[var(--app-accent)]" : "text-muted"}`)}
        <span class="flex-1 min-w-0 text-sm font-medium truncate">${T(t, "scanning")} <span class="font-mono text-[length:var(--ms-label)] text-base-content/70">${BANDS[band].label}</span></span>
        <button data-settings aria-label=${T(t, "settings")} aria-expanded=${screen === "rf"} class="btn btn-circle btn-ghost btn-sm shrink-0" onClick=${() => { buzz(); openScreen("rf"); }}>${Icon("lucide:sliders-horizontal", "text-lg")}</button>
        <button data-disconnect aria-label=${T(t, "disconnect")} class="btn btn-circle btn-ghost btn-sm text-muted shrink-0" onClick=${() => { if (!demo) disconnect(); }}>${Icon("lucide:power", "text-lg")}</button>
      <//>

    <${SettingsSheet} open=${screen === "rf"} onClose=${closeScreen} t=${t} demo=${demo} />
  </${Fragment}>`;
}

function Bars({ level, label }) {
  const bars = 4, lit = Math.round(level * bars);
  return html`<div class="flex items-end gap-[3px] h-6 shrink-0" role="img" aria-label=${label} data-signal>
    ${[...Array(bars)].map((_, i) => html`<span key=${i} class=${`w-1.5 rounded-sm ${i < lit ? "bg-primary" : ""}`} style=${`height:${40 + i * 20}%${i < lit ? "" : ";background:var(--sf-track-face)"}`}></span>`)}
  </div>`;
}

function SettingsSheet({ open, onClose, t, demo }) {
  const lna = useStore($lna), vga = useStore($vga);
  return html`<${Sheet} id="rfsheet" open=${open} onClose=${onClose} title=${T(t, "settings")} icon="lucide:sliders-horizontal">
    <${Slider} attr="data-gain" id="lna" label=${T(t, "gainLna")} value=${lna} min=${0} max=${40} step=${8} onInput=${(v) => { $lna.set(v); pushGain(); }} />
    <${Slider} attr="data-gain" id="vga" label=${T(t, "gainVga")} value=${vga} min=${0} max=${62} step=${2} onInput=${(v) => { $vga.set(v); pushGain(); }} />
    ${!demo ? html`<button data-disconnect class="btn btn-ghost btn-sm gap-2 text-muted self-start" onClick=${() => { disconnect(); onClose(); }}>${Icon("lucide:power")}${T(t, "disconnect")}</button>` : null}
  </${Sheet}>`;
}
