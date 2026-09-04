// FM Radio — a broadband-FM receiver for a HackRF One, decoded entirely on the device. WebUSB drives the
// radio; a Web Worker (dsp.worker.js) streams the 2 Msps IQ, demodulates audio, decodes RDS metadata (station
// name / genre / radiotext) off the composite, and runs the auto-scan. This view is the head unit: a
// now-playing card, seek + band-scan, and the station list. See docs/research/hackrf-webusb-fm.md + rds-and-scan.md.
//
// Two realities: with a device attached the worker feeds real audio + RDS + scan results; under the headless
// gate (and ?mock preview) there is no USB, so the view seeds a plausible station + a scan list so the
// populated screen — the part every downstream gate measures — renders, marked data-live.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Sheet, Segmented, Island, Slider, Transport } from "/_rt/ui.js";
import { wakeLock } from "/_rt/sensors.js";
import { holdAudio } from "/_rt/mediasession.js";
import { gate } from "/_rt/gate.js";
import { OUT_RATE } from "/_rt/fmradio.js";
import { ptyName } from "/_rt/rds.js";
import { usbSupported, USB_FILTERS } from "/_rt/hackrf.js";
import { createUsbSession } from "/_rt/usbsession.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* */ } };
// `length:` — a bare var() in text-[…] reads as a COLOUR to Tailwind v4 and the size falls back to the parent's
const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70";

const FM_LO = 87.5, FM_HI = 108.0, STEP_HZ = 100_000;
const clampHz = (hz) => Math.max(FM_LO * 1e6, Math.min(FM_HI * 1e6, Math.round(hz / STEP_HZ) * STEP_HZ));
const fmMhz = (hz) => (hz / 1e6).toFixed(1);
const JC = (init) => ({ encode: JSON.stringify, decode: (s) => { try { return JSON.parse(s); } catch { return init; } } });
const EMPTY_RDS = { pi: 0, pty: 0, ptyName: "", ps: "", rt: "", tp: 0, ms: 0 };

// ---- shared state (module scope, survives tab switches) ----
const $playing = atom(false), $signal = atom(0);
const $rds = atom({ ...EMPTY_RDS }), $stereo = atom(false), $scan = atom({ active: false, frac: 0 });
const $freq = persistentAtom("fmradio:freq", 100e6, { encode: String, decode: Number });
const $stations = persistentAtom("fmradio:stations", [], JC([]));
const $known = persistentAtom("fmradio:known", {}, JC({}));   // accumulated station names, keyed by frequency
const $saved = persistentAtom("fmradio:saved", [], JC([]));   // user favourites
const $vol = persistentAtom("fmradio:vol", 0.8, { encode: String, decode: Number });
const $lna = persistentAtom("fmradio:lna", 16, { encode: String, decode: Number });
const $vga = persistentAtom("fmradio:vga", 20, { encode: String, decode: Number });
const $amp = persistentAtom("fmradio:amp", "0", { encode: String, decode: (s) => s === "1" });
const $tc = persistentAtom("fmradio:tc", 50, { encode: String, decode: Number });

// ---- audio (main thread): schedule the worker's 48 kHz chunks; a gain node is the mute. ----
let audioCtx = null, gainNode = null, nextT = 0, wl = null, np = null;
function ensureAudio() {
  if (audioCtx) return audioCtx;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  audioCtx = new AC({ latencyHint: "playback" });
  gainNode = audioCtx.createGain(); gainNode.gain.value = 0; gainNode.connect(audioCtx.destination);
  return audioCtx;
}
function pushAudio(f32) {
  const c = audioCtx; if (!c || !f32.length) return;
  const buf = c.createBuffer(1, f32.length, OUT_RATE); buf.copyToChannel(f32, 0);
  const s = c.createBufferSource(); s.buffer = buf; s.connect(gainNode);
  const now = c.currentTime; if (nextT < now + 0.08) nextT = now + 0.08;
  s.start(nextT); nextT += f32.length / OUT_RATE;
}
const rssiLevel = (db) => Math.max(0, Math.min(1, (db + 60) / 40));
const npTitle = () => { const ps = $rds.get().ps; return ps ? `${ps} · ${fmMhz($freq.get())} FM` : `FM ${fmMhz($freq.get())} MHz`; };

// The USB + worker lifecycle is /_rt/usbsession.js — five apps carried a byte-identical copy of it.
// `onOpen` is where the AudioContext is built: after the device is granted (so a cancelled picker costs
// nothing) and before the worker spawns (so its first audio chunk has somewhere to land).
const rf = createUsbSession({
  atom,
  spawn: () => new Worker(new URL("./dsp.worker.js", import.meta.url), { type: "module" }),
  supported: usbSupported,
  filters: USB_FILTERS,
  onOpen: () => { const c = ensureAudio(); c?.resume?.(); },
  start: () => ({ type: "start", freq: $freq.get(), lna: $lna.get(), vga: $vga.get(), amp: $amp.get(), tcUs: $tc.get() }),
  reset: () => { $rds.set({ ...EMPTY_RDS }); $signal.set(0); $scan.set({ active: false, frac: 0 }); },
  onMessage: (m) => {
    if (m.type === "audio") pushAudio(new Float32Array(m.buf));
    else if (m.type === "signal") { $signal.set(rssiLevel(m.rssi)); $stereo.set(!!m.stereo); }
    else if (m.type === "rds") { const { type, ...s } = m; $rds.set(s); if (s.ps && !s.dynamic) rememberStation($freq.get(), s); if (np) np.meta(npTitle()); }
    else if (m.type === "scanStart") $scan.set({ active: true, frac: 0 });
    else if (m.type === "scanProgress") $scan.set({ active: true, frac: m.frac ?? $scan.get().frac });
    else if (m.type === "scanDone") { mergeStations(m.stations); $scan.set({ active: false, frac: 1 }); }
    else if (m.type === "seekDone") { $freq.set(m.freq); $scan.set({ active: false, frac: 0 }); if (np) np.meta(npTitle()); }
  },
});
const $connected = rf.$connected, $usbOk = rf.$usbOk;
// keep any station the scan found, carrying a known/accumulated PS name forward if we have one
function mergeStations(found) {
  const known = $known.get();
  $stations.set(found.map((s) => ({ ...s, ps: known[s.freq]?.ps || "" })));
}
// accumulate a confirmed station name against its frequency, and propagate into the scan + saved lists
function rememberStation(freq, s) {
  const k = { ...$known.get() }; k[freq] = { ps: s.ps, pi: s.pi, pty: s.pty }; $known.set(k);
  const patch = (atom) => { const list = atom.get(); const i = list.findIndex((x) => x.freq === freq); if (i >= 0 && list[i].ps !== s.ps) { const n = [...list]; n[i] = { ...n[i], ps: s.ps, pi: s.pi, pty: s.pty }; atom.set(n); } };
  patch($stations); patch($saved);
}
const isSaved = (freq) => $saved.get().some((x) => x.freq === freq);
function toggleSave(undo) {
  buzz(12);
  const freq = $freq.get(), r = $rds.get(), kn = $known.get()[freq] || {}, sv = $saved.get(), i = sv.findIndex((x) => x.freq === freq);
  if (i >= 0) { const removed = sv[i]; $saved.set(sv.filter((_, k) => k !== i)); undo?.(() => $saved.set([...$saved.get(), removed].sort((a, b) => a.freq - b.freq)), removed.ps || fmMhz(removed.freq)); }
  else $saved.set([...sv, { freq, pi: r.pi || kn.pi || 0, ps: r.ps || kn.ps || "", pty: r.pty || kn.pty || 0 }].sort((a, b) => a.freq - b.freq));
}

const connect = () => { buzz(12); return rf.connect(); };
function disconnect() { buzz(); pause(); rf.disconnect(); }

function play() {
  buzz(12);
  const c = ensureAudio(); c?.resume?.();
  if (gainNode) gainNode.gain.value = $vol.get();
  $playing.set(true); wl = wakeLock.acquire();
  if (np) np.release();
  np = holdAudio({ title: npTitle(), artist: "microspec", onPlay: () => { if (!$playing.get()) play(); }, onPause: () => pause(), resumeCtx: () => c?.resume?.() });
  np.setPlaying(npTitle());
}
function pause() { if (gainNode) gainNode.gain.value = 0; $playing.set(false); if (wl) { wl.release(); wl = null; } if (np) { np.release(); np = null; } }
function setFreq(hz) { const f = clampHz(hz); $freq.set(f); $rds.set({ ...EMPTY_RDS }); rf.post({ type: "tune", freq: f }); if (np) np.meta(npTitle()); }
function seek(dir) { buzz(12); if (gate || !rf.running()) { setFreq($freq.get() + dir * STEP_HZ); return; } $scan.set({ active: true, frac: 0 }); rf.post({ type: "seek", dir }); }
function scan() { buzz(12); if (gate || !rf.running()) return; $scan.set({ active: true, frac: 0 }); rf.post({ type: "scan" }); }
function setVol(v) { $vol.set(v); if (gainNode && $playing.get()) gainNode.gain.value = v; }
function pushGain() { rf.post({ type: "gain", lna: $lna.get(), vga: $vga.get(), amp: $amp.get() }); }
function setTc(tc) { $tc.set(tc); rf.post({ type: "deemph", tcUs: tc }); }

// ================= view =================
export function fmradioView({ S, screen, openScreen, closeScreen, undo }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const connected = useStore($connected), usbOk = useStore($usbOk);
  const freq = useStore($freq), signal = useStore($signal), playing = useStore($playing);
  const rds = useStore($rds), stereo = useStore($stereo), scanSt = useStore($scan), stations = useStore($stations);
  const known = useStore($known), savedList = useStore($saved);
  const demo = gate;

  // Under the gate / ?mock there is no HackRF — seed a plausible tuned station + scan list so the populated
  // head-unit renders (marked data-live) for the a11y / overflow / taste gates.
  useEffect(() => {
    if (!demo) return;
    $connected.set(true); $freq.set(100e6); $signal.set(0.74); $stereo.set(true);
    $rds.set({ pi: 0x4A01, pty: 10, ptyName: "Pop music", ps: "HIT FM", rt: "Now playing — the best hits, live on air", dynamic: false, scroll: "", tp: 0, ms: 1 });
    $known.set({ 96_000_000: { ps: "RADIO ROKS", pi: 0x4A02, pty: 11 }, 100_000_000: { ps: "HIT FM", pi: 0x4A01, pty: 10 }, 103_600_000: { ps: "KISS FM", pi: 0x4A03, pty: 10 } });
    $stations.set([
      { freq: 96_000_000, stereo: true, ps: "RADIO ROKS" }, { freq: 98_600_000, stereo: true, ps: "" },
      { freq: 100_000_000, stereo: true, ps: "HIT FM" }, { freq: 103_600_000, stereo: true, ps: "KISS FM" },
      { freq: 105_000_000, stereo: false, ps: "" }, { freq: 107_000_000, stereo: true, ps: "" },
    ]);
    $saved.set([{ freq: 100_000_000, pi: 0x4A01, ps: "HIT FM", pty: 10 }, { freq: 103_600_000, pi: 0x4A03, ps: "KISS FM", pty: 10 }]);
  }, []);

  if (!connected) {
    const supported = usbSupported() && usbOk;
    return html`<div class="flex flex-col items-center justify-center text-center gap-5 pt-10 px-2 max-w-sm mx-auto" data-connected="false">
      <div class="w-20 h-20 rounded-[var(--ms-r)] grid place-items-center bg-primary/12 text-primary sf-e2">${Icon("lucide:radio-tower", "text-4xl")}</div>
      <h2 class="text-2xl font-semibold">${T(t, "connectTitle")}</h2>
      <p class="text-base-content/70 leading-relaxed">${T(t, "connectBody")}</p>
      ${supported
        ? html`<button id="connect" data-connect class="btn btn-primary btn-lg gap-2 mt-1" onClick=${connect}>${Icon("lucide:usb")}${T(t, "connectBtn")}</button>`
        : html`<div class="alert bg-warning/12 text-warning text-sm justify-center gap-2">${Icon("lucide:triangle-alert", "shrink-0")}${T(t, "noUsb")}</div>`}
    </div>`;
  }

  const genre = rds.ptyName && rds.pty ? rds.ptyName : "";
  const name = rds.ps || known[freq]?.ps || "";        // live name, else the accumulated one for this frequency
  const info = rds.rt || rds.scroll || "";             // RadioText, or the scrolling-PS text when the PS is dynamic
  const savedNow = savedList.some((x) => x.freq === freq);
  // The app's own controls ride the kit's Transport as `actions`: save (a pressed state), the settings sheet
  // and power. Past `keep` they demote into the history-backed overflow sheet (S.screen "more"), never vanish.
  const actions = [
    { id: "save", icon: savedNow ? "lucide:bookmark-check" : "lucide:bookmark", label: T(t, "save"), onClick: () => toggleSave(undo), active: savedNow, pressed: savedNow, attr: { "data-save": true } },
    { id: "settings", icon: "lucide:sliders-horizontal", label: T(t, "settings"), onClick: () => { buzz(); openScreen("rf"); }, attr: { "data-settings": true, "aria-expanded": screen === "rf" } },
    { id: "disconnect", icon: "lucide:power", label: T(t, "disconnect"), onClick: () => { if (!demo) disconnect(); }, attr: { "data-disconnect": true } },
  ];
  return html`<${Fragment}>
    <!-- body: a compact tuner header, then the station list — this is what scrolls -->
    <div class="flex flex-col gap-1.5 max-w-[440px] mx-auto w-full pb-[9.5rem]" data-connected="true" data-freq=${fmMhz(freq)} data-scanning=${scanSt.active} data-tuned=${!!name}>
      <div class="flex items-end gap-[var(--ms-gap)] pt-0.5 pb-1">
        <div class="flex-1 min-w-0">
          <${Slider} id="band" attr="data-band" label=${T(t, "band")} min=${FM_LO} max=${FM_HI} step=${0.1} value=${(freq / 1e6).toFixed(1)} onInput=${(v) => setFreq(v * 1e6)} />
        </div>
        ${/* the scan's progress is the rail below, not a spinning glyph on the verb */""}
        <button data-scan aria-label=${T(t, "scan")} aria-busy=${scanSt.active} disabled=${scanSt.active} onClick=${scan} class="btn btn-sm gap-1.5 shrink-0">${Icon("lucide:radar", "text-base")}${T(t, "scan")}</button>
      </div>
      ${/* A 6px rail cannot hold a shadow pair, so the groove takes the system's one sanctioned tone step
           (--sf-track-face) instead of an ink alpha — the same face a range track uses. */""}
      ${scanSt.active ? html`<div class="w-full h-1.5 rounded-full overflow-hidden" style="background:var(--sf-track-face)" data-scanbar><div class="h-full bg-primary transition-[width] duration-200" style=${`width:${Math.round((scanSt.frac || 0) * 100)}%`}></div></div>` : null}
      ${stations.length ? stations.slice().sort((a, b) => a.freq - b.freq).map((s) => {
    const on = Math.abs(s.freq - freq) < STEP_HZ / 2;
    // The tuned station is a DEEPER extrusion carrying the accent tint, not a ringed row: with the hairline
    // gone the depth step is what separates it from its neighbours, and aria-current still carries the state.
    return html`<button key=${s.freq} data-station=${fmMhz(s.freq)} aria-current=${on} onClick=${() => setFreq(s.freq)}
        class=${`flex items-center gap-3 rounded-[var(--ms-r)] px-[var(--ms-pad)] py-2.5 text-left transition-colors ${on ? "bg-primary/10 sf-e3" : "sf-raised sf-e2"}`}>
        <span class="font-mono tabular-nums text-lg w-16 shrink-0 ${on ? "text-primary" : ""}">${fmMhz(s.freq)}</span>
        <span class="flex-1 min-w-0 truncate text-sm ${on && rds.ps ? "text-base-content" : "text-muted"}">${on && rds.ps ? rds.ps : s.ps || (s.stereo ? T(t, "stereo") : T(t, "mono"))}</span>
        ${s.stereo ? Icon("lucide:radio", "text-muted text-base shrink-0") : null}
      </button>`;
  }) : html`<button data-scan-empty onClick=${scan} disabled=${scanSt.active} class="btn btn-ghost btn-sm justify-start gap-2 text-muted mt-1">${Icon("lucide:radar")}${T(t, "scanHint")}</button>`}
    </div>

    <!-- floating player island: now-playing + the kit's transport (seek · listen · seek + the app's actions) -->
    <${Island} pinned data-player className="w-full max-w-[440px] flex flex-col gap-[var(--ms-gap)]">
        <div class="flex items-center gap-2.5" data-live data-nowplaying>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="font-mono tabular-nums text-xl font-semibold leading-none shrink-0">${fmMhz(freq)}</span>
              <span class=${`${LABEL} shrink-0`}>${T(t, "unitMhz")}</span>
              <span class="truncate font-semibold text-sm ml-0.5">${name || html`<span class="text-muted">${T(t, "tuning")}</span>`}</span>
              <span data-stereo class=${`shrink-0 ${stereo ? "text-primary" : "text-muted"}`} title=${T(t, stereo ? "stereo" : "mono")}>${Icon("lucide:radio", "text-sm")}</span>
              ${/* The genre is a chip — a mono micro-label in a ghost badge, ink not colour: the pair of light is a mark, never text */""}
              ${genre ? html`<span class=${`shrink-0 badge badge-ghost badge-sm ${LABEL} truncate max-w-[6rem]`} data-genre>${genre}</span>` : null}
            </div>
            ${info ? html`<div class="text-sm text-muted leading-snug truncate mt-0.5" data-rt>${info}</div>` : null}
          </div>
          <${SignalBars} level=${signal} label=${T(t, "sigLabel")} />
        </div>
        <${Transport} locale=${loc} size="sm" playing=${playing} onToggle=${() => (playing ? pause() : play())}
          onPrev=${() => seek(-1)} onNext=${() => seek(1)} keep=${2}
          moreOpen=${screen === "more"} onMore=${() => openScreen("more")} onMoreClose=${closeScreen}
          actions=${actions} />
      <//>

    <${SettingsSheet} open=${screen === "rf"} onClose=${closeScreen} t=${t} demo=${demo} />
  </${Fragment}>`;
}

// Five bars, unchanged geometry. An unlit bar is 6px wide — far too thin for the shadow pair — so it takes
// --sf-track-face, the system's one sanctioned tone step for a thin track, rather than an ink alpha.
function SignalBars({ level, label }) {
  const bars = 5, lit = Math.round(level * bars);
  return html`<div class="flex items-end gap-[3px] h-7" role="img" aria-label=${label} data-signal>
    ${[...Array(bars)].map((_, i) => html`<span key=${i} class=${`w-1.5 rounded-sm ${i < lit ? "bg-primary" : ""}`} style=${`height:${34 + i * 16}%${i < lit ? "" : ";background:var(--sf-track-face)"}`}></span>`)}
  </div>`;
}

// settings island → history-backed bottom sheet (S.screen="rf"): gains, de-emphasis, volume, disconnect.
function SettingsSheet({ open, onClose, t, demo }) {
  const vol = useStore($vol), lna = useStore($lna), vga = useStore($vga), amp = useStore($amp), tc = useStore($tc);
  // Kit sliders: the caption is the accessible name. A gain carries a real unit the receiver is set to, so
  // its dB reading is part of the caption — one line, not a second readout beside the track.
  return html`<${Sheet} id="rfsheet" open=${open} onClose=${onClose} title=${T(t, "settings")} icon="lucide:sliders-horizontal">
    <${Slider} id="vol" attr="data-rf" label=${T(t, "volume")} min=${0} max=${1} step=${0.01} value=${vol} onInput=${setVol} />
    <${Slider} id="lna" attr="data-rf" label=${`${T(t, "gainLna")} · ${lna} dB`} min=${0} max=${40} step=${8} value=${lna} onInput=${(v) => { $lna.set(v); pushGain(); }} />
    <${Slider} id="vga" attr="data-rf" label=${`${T(t, "gainVga")} · ${vga} dB`} min=${0} max=${62} step=${2} value=${vga} onInput=${(v) => { $vga.set(v); pushGain(); }} />
    <label class="flex items-center justify-between text-sm"><span class="flex items-center gap-2">${Icon("lucide:zap", "text-base text-muted")}${T(t, "gainAmp")} <span class="font-mono text-[length:var(--ms-label)] text-muted">+14 dB</span></span>
      <input type="checkbox" class="toggle toggle-primary toggle-sm" checked=${amp} aria-label=${T(t, "gainAmp")} onChange=${(e) => { $amp.set(e.target.checked); pushGain(); }} /></label>
    <div class="flex flex-col gap-1">
      <span class=${LABEL}>${T(t, "deemph")}</span>
      <${Segmented} attr="data-tc" size="sm" label=${T(t, "deemph")}
        items=${[[50, "deemphEu"], [75, "deemphUs"]].map(([v, k]) => ({ id: String(v), label: T(t, k) }))}
        value=${String(tc)} onChange=${(id) => setTc(Number(id))} />
    </div>
    ${!demo ? html`<button data-disconnect class="btn btn-ghost btn-sm gap-2 text-muted self-start" onClick=${() => { disconnect(); onClose(); }}>${Icon("lucide:power")}${T(t, "disconnect")}</button>` : null}
  </${Sheet}>`;
}

// Saved tab — the user's favourite stations. Tap opens on the Radio tab; delete is reversible (undo-toast).
export function savedView({ S, undo }) {
  const t = useStore(S.t), saved = useStore($saved), freq = useStore($freq), known = useStore($known);
  const open = (s) => { buzz(); setFreq(s.freq); S.tab.set("tune"); };
  const del = (i) => { buzz(); const removed = saved[i]; $saved.set(saved.filter((_, k) => k !== i)); undo?.(() => $saved.set([...$saved.get(), removed].sort((a, b) => a.freq - b.freq)), removed.ps || fmMhz(removed.freq)); };
  // The shell's own empty-state shape (data-empty + data-mascot): the theme scatters its light behind the glyph.
  if (!saved.length) return html`<div data-empty class="flex flex-col items-center text-muted py-16 gap-2 text-center px-6"><span data-mascot aria-hidden="true"></span>${Icon("lucide:bookmark", "text-4xl")}<span class="font-medium">${T(t, "savedEmpty")}</span></div>`;
  return html`<div class="flex flex-col gap-2 max-w-[440px] mx-auto w-full pb-6" data-saved-count=${saved.length}>
    ${saved.map((s, i) => {
    const on = Math.abs(s.freq - freq) < STEP_HZ / 2, nm = s.ps || known[s.freq]?.ps || "";
    return html`<div key=${s.freq} data-saved class=${`flex items-center gap-3 rounded-[var(--ms-r)] px-[var(--ms-pad)] py-3 transition-colors ${on ? "bg-primary/10 sf-e3" : "sf-raised sf-e2"}`}>
      <button data-open class="flex-1 min-w-0 flex items-center gap-3 text-left" onClick=${() => open(s)}>
        <span class=${`font-mono tabular-nums text-xl w-[4.5rem] shrink-0 ${on ? "text-primary" : ""}`}>${fmMhz(s.freq)}</span>
        <span class="flex-1 min-w-0 flex flex-col">
          <span class="truncate font-medium">${nm || T(t, "tuning")}</span>
          ${s.pty ? html`<span class=${`${LABEL} truncate`}>${ptyName(s.pty)}</span>` : null}
        </span>
      </button>
      <button data-del aria-label=${T(t, "del")} data-haptic="bump" class="btn btn-ghost btn-sm btn-circle text-muted shrink-0" onClick=${() => del(i)}><iconify-icon icon="lucide:trash-2" class="text-lg"></iconify-icon></button>
    </div>`;
  })}
  </div>`;
}
