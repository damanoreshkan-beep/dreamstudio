// Sub-GHz remote cloner — records your OWN fixed-code OOK remotes (433.92/315/868 MHz) with a HackRF over
// WebUSB and replays them (first TX in the farm). Capture → save → transmit. Rolling-code (car keys, modern
// garages) is detected and replay is refused — it can't be replayed and defeating it is out of scope. The
// OOK DSP is /_rt/ook.js; a Web Worker does the RX/TX. See docs/research/subghz-ook-clone.md.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Sheet, Segmented, Island, Panel, Row, Slider } from "/_rt/ui.js";
import { gate } from "/_rt/gate.js";
import { OOK_FREQS } from "/_rt/ook.js";
import { usbSupported, USB_FILTERS } from "/_rt/hackrf.js";
import { createUsbSession } from "/_rt/usbsession.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* */ } };
// mono meta line at the micro-label size (`length:` — the bare form is a colour to Tailwind v4); no uppercase,
// because these lines carry units ("MHz") that must keep their case
const META = "font-mono text-[length:var(--ms-label)] tracking-wide tabular-nums";
const fMhz = (hz) => (hz / 1e6).toFixed(2);
const JC = (init) => ({ encode: JSON.stringify, decode: (s) => { try { return JSON.parse(s); } catch { return init; } } });
const uid = () => "s" + Date.now().toString(36) + Math.floor(performance.now() % 1000);

const $rec = atom({ state: "idle", cap: null }), $tx = atom(null);
const $freq = persistentAtom("subclone:freq", 433_920_000, { encode: String, decode: Number });
const $saved = persistentAtom("subclone:saved", [], JC([]));
const $txGain = persistentAtom("subclone:txg", 30, { encode: String, decode: Number });
const $repeats = persistentAtom("subclone:reps", 5, { encode: String, decode: Number });   // manual repeats per send

// The USB + worker lifecycle is /_rt/usbsession.js — five apps carried a byte-identical copy of it.
const rf = createUsbSession({
  atom,
  spawn: () => new Worker(new URL("./dsp.worker.js", import.meta.url), { type: "module" }),
  supported: usbSupported,
  filters: USB_FILTERS,
  start: () => ({ type: "open" }),
  reset: () => { $rec.set({ state: "idle", cap: null }); $tx.set(null); },
  onMessage: (m) => {
    if (m.type === "recording") $rec.set({ state: "recording", cap: null });
    else if (m.type === "captured") $rec.set({ state: m.frame.length ? "captured" : "empty", cap: m.frame.length ? m : null });
    else if (m.type === "transmitting") $tx.set(m.id);
    else if (m.type === "sent") $tx.set(null);
  },
});
const $connected = rf.$connected, $usbOk = rf.$usbOk;

const connect = () => { buzz(12); return rf.connect(); };
const disconnect = () => { buzz(); rf.disconnect(); };
function record() {
  buzz(12); if (gate || !rf.running()) return;
  if ($rec.get().state === "recording") rf.post({ type: "stopRecord" });   // toggle: stop → worker processes → "captured"
  else { $rec.set({ state: "recording", cap: null }); rf.post({ type: "record", freq: $freq.get() }); }
}
function discard() { buzz(); $rec.set({ state: "idle", cap: null }); }
function saveCap(name) {
  const c = $rec.get().cap; if (!c) return; buzz(12);
  $saved.set([{ id: uid(), name: name || fMhz(c.freq) + " FM", freq: c.freq, frame: c.frame, entries: c.entries }, ...$saved.get()]);
  $rec.set({ state: "idle", cap: null });
}
function transmit(s) { buzz(12); if (gate || !rf.running()) { $tx.set(s.id); setTimeout(() => $tx.set(null), 900); return; } rf.post({ type: "transmit", id: s.id, freq: s.freq, frame: s.frame, repeats: Math.max(1, $repeats.get()), txGain: $txGain.get() }); }
function setFreq(f) { buzz(); $freq.set(f); $rec.set({ state: "idle", cap: null }); }

export function subcloneView({ S, screen, openScreen, closeScreen, undo }) {
  const t = useStore(S.t);
  const connected = useStore($connected), usbOk = useStore($usbOk), freq = useStore($freq);
  const rec = useStore($rec), saved = useStore($saved), tx = useStore($tx);
  const demo = gate;
  const [nm, setNm] = useState("");

  useEffect(() => {
    if (!demo) return;
    $connected.set(true);
    $saved.set([
      { id: "d1", name: "Гараж", freq: 433_920_000, frame: [400, -1200, 1200, -400], entries: 24 },
      { id: "d2", name: "Ворота", freq: 433_920_000, frame: [350, -1050], entries: 24 },
      { id: "d3", name: "Розетка", freq: 433_920_000, frame: [300, -900, 900, -300], entries: 12 },
    ]);
  }, []);

  if (!connected) {
    const supported = usbSupported() && usbOk;
    return html`<div data-connected="no" class="flex flex-col items-center justify-center text-center gap-5 pt-10 px-2 max-w-sm mx-auto">
      <div class="w-20 h-20 rounded-[var(--ms-r)] grid place-items-center bg-primary/12 text-primary sf-e2">${Icon("lucide:radio-receiver", "text-4xl")}</div>
      <h2 class="text-2xl font-semibold">${T(t, "connectTitle")}</h2>
      <p class="text-base-content/70 leading-relaxed">${T(t, "connectBody")}</p>
      ${supported
        ? html`<button id="connect" data-connect class="btn btn-primary btn-lg gap-2 mt-1" onClick=${connect}>${Icon("lucide:usb")}${T(t, "connectBtn")}</button>`
        : html`<div class="alert bg-warning/12 text-warning rounded-[var(--ms-r)] text-sm justify-center gap-2">${Icon("lucide:triangle-alert", "shrink-0")}${T(t, "noUsb")}</div>`}
    </div>`;
  }

  const recording = rec.state === "recording";
  return html`<${Fragment}>
    <div class="@container flex flex-col gap-[var(--ms-gap)] max-w-[440px] mx-auto w-full pb-32" data-connected="yes" data-rec=${rec.state} data-tx=${tx ? "on" : "off"}>
      <!-- frequency selector -->
      <div class="pt-0.5"><${Segmented} attr="data-freq" size="sm"
        items=${OOK_FREQS.map((f) => ({ id: String(f), label: fMhz(f) }))}
        value=${String(freq)} onChange=${(id) => setFreq(Number(id))} /></div>

      <!-- just-captured signal, pending save. Surfaces carry the distinction now that the outlines are
           gone: the pending capture is a Panel lifted a rung (sf-e3), "nothing captured" is the WELL a
           signal will land in (sf-inset), and the saved signals below are Panels on the page (sf-e2). -->
      ${rec.state === "captured" && rec.cap ? html`<${Panel} className="sf-e3" data-captured>
        <div class="flex items-center gap-2 text-sm font-semibold">${Icon("lucide:radio-receiver", "text-primary")}${T(t, "capturedTitle")}</div>
        <div class=${`flex items-center gap-4 ${META} text-base-content/70`}>
          <span>${rec.cap.entries} ${T(t, "entries")}</span><span>×${rec.cap.repeats} ${T(t, "repeats")}</span>
        </div>
        <div class="flex gap-2">
          <input value=${nm} onInput=${(e) => setNm(e.target.value)} placeholder=${T(t, "namePlaceholder")} class="input input-sm flex-1" />
          <button data-save class="btn btn-sm btn-primary gap-1.5" onClick=${() => { saveCap(nm); setNm(""); }}>${Icon("lucide:bookmark-plus")}${T(t, "save")}</button>
          <button data-discard aria-label=${T(t, "discard")} class="btn btn-sm btn-ghost btn-circle" onClick=${discard}>${Icon("lucide:x", "text-lg")}</button>
        </div>
      <//>` : rec.state === "empty" ? html`<div class="flex items-center gap-2 text-sm text-muted sf-inset rounded-[var(--ms-r)] px-[var(--ms-pad)] py-3" data-empty>${Icon("lucide:radio-receiver")}${T(t, "nothingCaptured")}</div>` : null}

      <!-- saved signals -->
      ${saved.length ? html`<div class="flex flex-col gap-1.5" data-live data-saved-list>
        ${saved.map((s) => { const sending = tx === s.id; return html`<${Panel} key=${s.id} data-saved className="py-2.5"><${Row}>
          <div class="flex-1 min-w-0 flex flex-col">
            <span class="font-medium truncate">${s.name}</span>
            <span class=${`${META} text-muted`}>${fMhz(s.freq)} MHz · ${s.entries}</span>
          </div>
          <button data-transmit=${s.id} aria-label=${T(t, "transmit")} disabled=${sending} onClick=${() => transmit(s)} class=${`btn btn-sm shrink-0 gap-1.5 ${sending ? "btn-primary" : "btn-outline text-primary"}`}>${Icon("lucide:radio-tower", `text-base ${sending ? "animate-pulse" : ""}`)}<span class="@max-[340px]:hidden">${T(t, sending ? "transmitting" : "transmit")}</span></button>
          <button data-del aria-label=${T(t, "del")} data-haptic="bump" class="btn btn-ghost btn-sm btn-circle text-muted shrink-0" onClick=${() => del(s, undo)}>${Icon("lucide:trash-2", "text-lg")}</button>
        <//><//>`; })}
      </div>` : rec.state !== "captured" ? html`<div class="flex flex-col items-center text-muted py-10 gap-2 text-center px-6">${Icon("lucide:radio-receiver", "text-3xl")}<span class="text-sm">${T(t, "savedEmpty")}</span></div>` : null}
    </div>

    <!-- record island: the big capture button + freq + settings/power. The record key is not a play/pause
         (it captures), so it stays the app's own control; it names its transition (the material is a
         box-shadow pair, so an unnamed transition would melt sf-e3 on every press). -->
    <${Island} pinned data-player className="w-full max-w-[440px] flex items-center gap-[var(--ms-gap)] p-[calc(var(--ms-pad)/2)]">
        <button id="record" data-recording=${recording} aria-label=${T(t, recording ? "recording" : "record")} onClick=${record} class=${`w-[var(--ms-ctl)] h-[var(--ms-ctl)] rounded-full grid place-items-center sf-e3 active:scale-95 transition-transform shrink-0 ${recording ? "bg-error text-error-content animate-pulse" : "bg-primary text-primary-content"}`}>${Icon(recording ? "lucide:square" : "lucide:circle-dot", "text-2xl")}</button>
        <span class="flex-1 min-w-0 text-sm font-medium truncate">${T(t, recording ? "recording" : "record")} <span class=${`${META} text-base-content/70`}>${fMhz(freq)}</span></span>
        <button data-settings aria-label=${T(t, "settings")} aria-expanded=${screen === "rf"} class="btn btn-circle btn-ghost btn-sm shrink-0" onClick=${() => { buzz(); openScreen("rf"); }}>${Icon("lucide:sliders-horizontal", "text-lg")}</button>
        <button data-disconnect aria-label=${T(t, "disconnect")} class="btn btn-circle btn-ghost btn-sm text-muted shrink-0" onClick=${() => { if (!demo) disconnect(); }}>${Icon("lucide:power", "text-lg")}</button>
      <//>
    

    <${SettingsSheet} open=${screen === "rf"} onClose=${closeScreen} t=${t} demo=${demo} />
  </${Fragment}>`;
}

function del(s, undo) {
  buzz();
  const list = $saved.get(), i = list.findIndex((x) => x.id === s.id);
  $saved.set(list.filter((x) => x.id !== s.id));
  undo?.(() => { const cur = $saved.get(); const n = [...cur]; n.splice(Math.min(i, cur.length), 0, s); $saved.set(n); }, s.name);
}

function SettingsSheet({ open, onClose, t, demo }) {
  const g = useStore($txGain), reps = useStore($repeats);
  // Both ranges are the kit's Slider; the value rides the caption as a mono count ("REPEATS · ×5") because the
  // kit prints no value of its own. The caption under the repeats slider was hint text on a working control
  // (copy.md) and is gone — a toggle device is set to 1 by moving the slider, which the slider already says.
  return html`<${Sheet} id="rfsheet" open=${open} onClose=${onClose} title=${T(t, "settings")} icon="lucide:sliders-horizontal">
    <${Slider} id="reps" attr="data-repeats" label=${`${T(t, "txRepeats")} · ×${reps}`} min=${1} max=${16} step=${1} value=${reps} onInput=${(v) => $repeats.set(v)} />
    <${Slider} id="gain" attr="data-gain" label=${`${T(t, "txGain")} · ${g} dB`} min=${0} max=${47} step=${1} value=${g} onInput=${(v) => $txGain.set(v)} />
    <p class="text-xs text-muted leading-relaxed">${T(t, "ownNote")}</p>
    ${!demo ? html`<button data-disconnect class="btn btn-ghost btn-sm gap-2 text-muted self-start" onClick=${() => { disconnect(); onClose(); }}>${Icon("lucide:power")}${T(t, "disconnect")}</button>` : null}
  </${Sheet}>`;
}
