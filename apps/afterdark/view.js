// afterdark — a one-track techno rave. ONE fit screen: the afterdark.frag rave field (lasers/haze/strobe) on
// /_rt/glstage.js behind a Three.js stage of THREE rigged girls dancing to the beat, under a thin dark-glass
// DOM layer — the Enter cover (the audio gesture), a top status label, and ONE island holding play/pause + a
// filmstrip picker of the 11 dancers. DOM is the truth the gate/axe/e2e see; both canvases are aria-hidden and
// probe-guarded (WebGL only; skipped under the headless gate, where the DOM alone must carry every meaning).
//
// The audio path (recipe): ONE <audio crossOrigin="anonymous"> (set BEFORE src) → MediaElementSource →
// AnalyserNode → destination; the AudioContext is resumed from the Enter tap (autoplay policy). The kick-band
// energy becomes a single `pulse` (rt/afterdark.js) that BOTH the shader and the 3D girls dance to; no audio →
// an idle groove, never a freeze. Stream drops port tide's reconnect. The stage is DARK-COMMITTED
// (theme-independent) so both farm-theme shots stay coherent and the dark-glass controls pass axe in both.

import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { persistentAtom } from "@nanostores/persistent";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { wakeLock } from "/_rt/sensors.js";
import { holdAudio } from "/_rt/mediasession.js";
import { gate } from "/_rt/gate.js";
import { report } from "/_rt/telemetry.js";
import { Island, Transport } from "/_rt/ui.js";
import { GlStage } from "/_rt/glstage.js";
import { retryDelay, progressCheck } from "/_rt/tide.js";
import { bassEnergy, stepPulse, idleGroove, integratePhase } from "/_rt/afterdark.js";
import { GIRLS } from "./girls.js";

const STREAM = "https://streams.rautemusik.fm/techno/mp3-192";
const AC = typeof AudioContext !== "undefined" ? AudioContext : (typeof globalThis !== "undefined" && globalThis.webkitAudioContext) || null;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- persisted working set ----
// the CAST: which girls are on stage (1..11). A JSON id array; the engine lays them out as a crowd that fits
// the screen. Tapping a chip toggles a girl on/off; the last one can't be removed (the stage is never empty).
const DEFAULT_CAST = ["kaya", "michelle", "arissa"];
const $cast = persistentAtom("afterdark:cast", JSON.stringify(DEFAULT_CAST));
const ALL_IDS = GIRLS.map((g) => g.id);
function getCast() {
  let a; try { a = JSON.parse($cast.get()); } catch { a = null; }
  a = Array.isArray(a) ? a.filter((id) => ALL_IDS.includes(id)) : [];
  return a.length ? a : DEFAULT_CAST.slice();
}
const $muted = persistentAtom("afterdark:muted", "0");
// the Enter cover is dismissed once the audio gesture happened; under the gate the shot is the live rave, so
// we seed past the gesture (like tide seeds past the real stream) and the mock owns the state machine.
const $entered = atom(gate);
const $playing = atom(false);
const $state = atom("idle");                                     // idle | connecting | live | reconnecting | offline
const $stage3d = atom(gate ? "skipped" : "loading");             // the 3D stage's readout: loading | ready | failed | skipped
const $stage3dWhy = atom("");
const muted = () => $muted.get() === "1";

// ---- the engine (module scope: survives tab switches, shared with the lock screen) ----
let el = null, ctx = null, src = null, analyser = null, freq = null, np = null, wl = null;
let attempt = 0, retryTimer = null, stallTimer = null, connectTimer = null, liveTimer = null, mark = null;

function attach(a) {
  if (src) { try { src.disconnect(); } catch { /* */ } src = null; }
  if (!AC) return;
  try {
    ctx ||= new AC();
    ctx.resume();
    src = ctx.createMediaElementSource(a);
    if (!analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.4; freq = new Uint8Array(analyser.frequencyBinCount); analyser.connect(ctx.destination); }
    src.connect(analyser);
  } catch { src = null; }
}

function hold() {
  if (!np) np = holdAudio({ title: "rautemusik", artist: "techno", onPlay: () => { if (!$playing.get()) start(); }, onPause: () => stop(), resumeCtx: () => ctx?.resume() });
  np.setPlaying("rautemusik");
}

function play({ reconnect = false } = {}) {
  // the gate has no audio: the mock owns the machine, and the session is still held (the APK's background
  // service is only visible to CI in Chromium, so short-circuiting before it would leave that half untested).
  if (gate || typeof Audio === "undefined") { $playing.set(true); $state.set("live"); hold(); return; }
  if (!reconnect) attempt = 0;
  clearTimeout(retryTimer); clearTimeout(stallTimer); clearTimeout(connectTimer);
  const old = el;
  if (old) { try { old.pause(); old.removeAttribute("src"); old.load(); } catch { /* */ } }
  const a = document.createElement("audio");
  a.preload = "none";
  a.crossOrigin = "anonymous";                                   // BEFORE src, per the CORS recipe
  a.src = STREAM;
  a.volume = muted() ? 0 : 1;
  el = a;
  $state.set(reconnect ? "reconnecting" : "connecting");
  let hadAudio = false;
  const armStall = () => { clearTimeout(stallTimer); stallTimer = setTimeout(() => { if (el === a && $state.get() !== "live") lost(a); }, 8000); };
  a.onplaying = () => { if (el !== a) return; attempt = 0; hadAudio = true; clearTimeout(connectTimer); clearTimeout(stallTimer); $state.set("live"); a.volume = muted() ? 0 : 1; };
  a.onwaiting = a.onstalled = () => { if (el !== a) return; if (hadAudio) { $state.set("reconnecting"); armStall(); } };
  a.onended = () => { if (el === a) lost(a); };
  a.onerror = () => { if (el === a) lost(a); };
  connectTimer = setTimeout(() => { if (el === a && $state.get() !== "live") lost(a); }, 12000);
  attach(a);
  const p = a.play();
  if (p && p.catch) p.catch((err) => { if (el !== a) return; if (err && err.name === "NotAllowedError") { stop(); return; } lost(a); });
  $playing.set(true);
  if (!wl) wl = wakeLock.acquire();
  hold();
  mark = null;
  if (!liveTimer) liveTimer = setInterval(probe, 4000);
}

// A dropped link holds the ONE station and reconnects with backoff — a live Icecast stream cannot resume, so
// each retry is a fresh element. `online`/connection-change short-circuit the wait (tide's proven logic).
function lost(a) {
  if (el !== a || !$playing.get()) return;
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  $state.set(online ? "reconnecting" : "offline");
  el = null; try { a.pause(); a.removeAttribute("src"); a.load(); } catch { /* */ }
  clearTimeout(connectTimer); clearTimeout(stallTimer); clearTimeout(retryTimer);
  const wait = retryDelay(attempt); attempt += 1;
  retryTimer = setTimeout(() => { retryTimer = null; if ($playing.get()) play({ reconnect: true }); }, wait);
}
function probe() {
  if (gate || !$playing.get() || !el || $state.get() !== "live") return;
  const r = progressCheck({ time: el.currentTime, mark, now: performance.now() });
  mark = r.mark;
  if (r.dead) lost(el);
}
function relink() {
  if (!$playing.get() || gate) return;
  if ($state.get() !== "live") { clearTimeout(retryTimer); retryTimer = null; play({ reconnect: true }); return; }
  probe();
}
if (typeof addEventListener !== "undefined") {
  addEventListener("online", relink);
  try { navigator.connection?.addEventListener?.("change", relink); } catch { /* the probe still covers it */ }
}

function stop() {
  $playing.set(false); $state.set("idle");
  clearTimeout(connectTimer); clearTimeout(retryTimer); clearTimeout(stallTimer);
  attempt = 0;
  if (el) { const o = el; el = null; try { o.pause(); o.removeAttribute("src"); o.load(); } catch { /* */ } }
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
  mark = null;
  if (wl) { wl.release(); wl = null; }
  if (np) { np.release(); np = null; }
}
const start = () => play({});
const toggle = () => { $playing.get() ? stop() : start(); };
function setMuted(m) { $muted.set(m ? "1" : "0"); if (el) { try { el.volume = m ? 0 : 1; } catch { /* iOS */ } } }

// ---- the field's live channels: a plain object the shader + the 3D stage read every frame, never state ----
const env = { last: 0, tick: 0, pulseState: { pulse: 0, baseline: 0 }, pulse: 0, energy: 0, dph: 0, sph: 0, tiltX: 0, tiltY: 0, ttx: 0, tty: 0, mode: "auto" };
function vary() {
  const now = performance.now();
  const dt = env.last ? Math.min(0.1, (now - env.last) / 1000) : 0; env.last = now;
  let pulse, energy;
  if (analyser && src && $playing.get() && $state.get() === "live") {
    analyser.getByteFrequencyData(freq);
    energy = bassEnergy(freq);
    env.pulseState = stepPulse(env.pulseState, energy);
    pulse = env.pulseState.pulse;
  } else {
    env.tick += dt; pulse = idleGroove(env.tick); energy = pulse;
  }
  env.pulse = pulse; env.energy = energy;
  env.playing = $playing.get();                                 // paused → the 3D girls ease into a calm idle sway
  env.dph += dt * 2.1;                                           // steady ~126 BPM groove; the kick adds the punch
  env.sph = integratePhase(env.sph, dt, pulse);
  return [pulse, env.dph, env.sph, 1];                          // vary.w=1 → the shader keeps the centre bloom on the kick
}
// parallax: DeviceOrientation tilt (permission asked on the Enter tap) → pointer → a slow auto-sway; eased.
function ink() {
  if (env.mode === "auto") { const t = env.tick; env.ttx = Math.sin(t * 0.5) * 0.5; env.tty = Math.sin(t * 0.33) * 0.3; }
  env.tiltX += (env.ttx - env.tiltX) * 0.06;
  env.tiltY += (env.tty - env.tiltY) * 0.06;
  return [env.tiltX, env.tiltY, 0, 0];
}
function armOrient() {
  env.mode = "orient";
  addEventListener("deviceorientation", (e) => { if (e.gamma == null && e.beta == null) return; env.mode = "orient"; env.ttx = clamp(e.gamma / 35, -1, 1); env.tty = clamp((e.beta - 45) / 35, -1, 1); });
}
function requestTilt() {
  try {
    const D = typeof DeviceOrientationEvent !== "undefined" ? DeviceOrientationEvent : null;
    if (D && typeof D.requestPermission === "function") D.requestPermission().then((s) => { s === "granted" ? armOrient() : (env.mode = "pointer"); }).catch(() => { env.mode = "pointer"; });
    else if (D) armOrient();
    else env.mode = "pointer";
  } catch { env.mode = "pointer"; }
}
async function enter() {
  $entered.set(true);
  try { if (AC) { ctx ||= new AC(); await ctx.resume(); } } catch { /* */ }
  requestTilt();
  start();
}

const CSS = `
/* the stage is DARK-COMMITTED (theme-independent), so the runtime app-bar — transparent, theme-ink text —
   would vanish over it in the light farm theme. Give it a dark-glass surface + light text in BOTH themes,
   matching the islands. Scoped to the stage view: it unmounts on the profile tab. */
header.navbar{background:rgba(10,6,18,.9);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,255,255,.07)}
header.navbar [data-title],header.navbar [data-battery]{color:rgba(255,255,255,.92)!important}
/* the runtime halos the wordmark in the PAGE's tone (paper in the light theme) — over a dark-committed
   stage that halo is a pale smudge behind the name, so the halo here is the stage's own night. */
header.navbar [data-title]{text-shadow:0 1px 2px #0A0510,0 0 14px #0A0510}
/* the transport sits on a dark island in BOTH themes, so its primary key is the dark theme's cream key in
   both — the light theme's black primary on dark glass was a black disc on black (measured 2026-09-11). */
[data-rave] .btn-primary{background:#F2EEE6;border-color:#F2EEE6;color:#0A0510}
.dk-dot{width:.5rem;height:.5rem;border-radius:9999px;background:var(--app-accent);box-shadow:0 0 8px var(--app-accent)}
[data-rave][data-state="live"] .dk-dot{animation:adPulse .46s ease-in-out infinite}
[data-rave][data-state="connecting"] .dk-dot,[data-rave][data-state="reconnecting"] .dk-dot{animation:adBlink 1s steps(2) infinite}
@keyframes adPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.9);opacity:.55}}
@keyframes adBlink{0%{opacity:1}50%{opacity:.25}}
.dk-enter-ring{box-shadow:0 0 0 1px rgba(255,255,255,.18),0 0 40px 0 color-mix(in oklch,var(--app-accent) 55%,transparent)}
@keyframes adBreath{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
[data-enter] .dk-enter-ring{animation:adBreath 2.6s ease-in-out infinite}
/* the dancer filmstrip: a horizontal scroll of name-chips, snap, no visible scrollbar */
.dk-strip{scrollbar-width:none;-ms-overflow-style:none;scroll-snap-type:x proximity}
.dk-strip::-webkit-scrollbar{display:none}
.dk-chip{scroll-snap-align:center}
@media(prefers-reduced-motion:reduce){.dk-dot,[data-enter] .dk-enter-ring{animation:none!important}}`;

// ================= the rave =================
export function afterdark({ S }) {
  const t = useStore(S.t);
  const loc = useStore(S.locale);
  useStore($cast);                                                // re-render when the cast changes
  const cast = getCast();
  const playing = useStore($playing);
  const state = useStore($state);
  const entered = useStore($entered);
  const mute = useStore($muted) === "1";
  const stage3d = useStore($stage3d), stage3dWhy = useStore($stage3dWhy);
  const stageRef = useRef();
  const engineRef = useRef(null);

  // the 3D dance stage: probe-guarded (WebGL only) and skipped under the headless gate (Draco/addons/GLBs over
  // CDNs flake CI, and the DOM carries all meaning there). Created once; the picker drives its trio.
  useEffect(() => {
    if (gate) { start(); return () => {}; }
    let engine = null;
    (async () => {
      try {
        const { createDanceStage } = await import("./dancers.js");
        if (!stageRef.current) return;
        engine = createDanceStage(stageRef.current, () => env, (st, why) => { $stage3d.set(st); $stage3dWhy.set(why || ""); if (st === "failed") report("stage3d.fail", { why: why || "" }); });
        engineRef.current = engine;
        if (engine.ok) engine.setCast(getCast());
      } catch (e) { $stage3d.set("failed"); $stage3dWhy.set(String(e && e.message || e).slice(0, 80)); report("stage3d.fail", { why: $stage3dWhy.get() }); }
    })();
    return () => { engine?.dispose?.(); engineRef.current = null; };
  }, []);

  const onStage = new Set(cast);
  const stateLine = state === "connecting" ? T(t, "connecting") : state === "reconnecting" ? T(t, "reconnecting") : state === "offline" ? T(t, "offline") : state === "live" ? T(t, "live") : T(t, "idle");
  const onToggle = () => (entered ? toggle() : enter());
  const applyCast = (next) => { if (!next.length) return; $cast.set(JSON.stringify(next)); engineRef.current?.setCast?.(next); };
  const toggleGirl = (id) => { const c = getCast(); applyCast(c.includes(id) ? (c.length > 1 ? c.filter((x) => x !== id) : c) : [...c, id]); };
  const pickAll = () => applyCast(cast.length >= ALL_IDS.length ? DEFAULT_CAST.slice() : ALL_IDS.slice());
  const onPointer = (e) => { if (env.mode === "orient") return; env.mode = "pointer"; const r = e.currentTarget.getBoundingClientRect(); env.ttx = clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1); env.tty = clamp((e.clientY - r.top) / r.height * 2 - 1, -1, 1); };

  return html`<${Fragment}>
    <style>${CSS}</style>
    ${/* the fixed night stage — z-0 (NOT negative: a negative z hides behind the light farm-theme body, and the
         rave is dark-committed). The opaque gradient is the first-paint/offline floor; GlStage paints the rave
         over it; the transparent dancers canvas sits over that; the DOM chrome (z-10) over all. */""}
    <div class="fixed inset-0 z-0" style="background:radial-gradient(120% 90% at 50% 8%, #1A0A22 0%, #0C0614 46%, #050308 100%)"></div>
    <${GlStage} shader=${new URL("afterdark.frag", import.meta.url)} seed=${((cast[0] || "a").charCodeAt(0) % 13) / 13}
      vary=${vary} ink=${ink} zClass="z-0" />
    ${/* the 3D dancers, over the rave field, under the DOM chrome */""}
    <canvas ref=${stageRef} data-dancers aria-hidden="true" class="fixed inset-0 z-0 w-full h-full pointer-events-none"></canvas>

    <div data-rave data-state=${state} data-cast=${cast.length} data-entered=${entered ? "yes" : "no"} data-3d=${stage3d} data-3d-why=${stage3dWhy}
      class="relative z-10 h-full min-h-0 flex flex-col gap-[var(--ms-gap)]">
      ${/* top label: the track/vibe + a live pulse dot; the status WORD is announced politely */""}
      <div class="shrink-0 flex justify-center">
        <${Island} tone="dark" className="flex items-center gap-2.5 !py-1.5 !px-3.5 rounded-full">
          <span class="dk-dot shrink-0"></span>
          <span class="font-mono uppercase tracking-wider text-[length:var(--ms-label)] text-white/90">${T(t, "station")}</span>
          <span class="w-px h-3 bg-white/20"></span>
          <span class="font-mono uppercase tracking-wider text-[length:var(--ms-label)] text-white/65">${T(t, "genre")}</span>
          ${/* the link's state, one word — only once the rave is entered: before that the Enter cover IS the
               state, and a sentence in the pill wrapped it onto two lines (measured 2026-09-11) */""}
          ${entered ? html`<span class="font-mono uppercase tracking-wider text-[length:var(--ms-label)] text-white/80 tabular-nums" aria-live="polite">· ${stateLine}</span>` : null}
        </${Island}>
      </div>

      ${/* the void: where the dancers perform (in the canvas behind) — pointer parallax lives here */""}
      <div class="flex-1 min-h-0 relative" onPointerMove=${onPointer}>
        ${/* the Enter cover sits in the UPPER third of the void, over the beams — never over the dancers, who
             stand mid-frame (the centred ring printed «УВІЙТИ» across the lead girl, measured 2026-09-11) */""}
        ${!entered ? html`<div class="absolute inset-0 flex flex-col items-center justify-start pt-[6%] gap-4 pointer-events-none">
          <button data-enter aria-label=${T(t, "enter")} onClick=${enter}
            class="pointer-events-auto flex flex-col items-center gap-3 select-none group">
            <span class="dk-enter-ring w-24 h-24 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white">
              <iconify-icon icon="lucide:play" class="text-4xl translate-x-0.5"></iconify-icon>
            </span>
            <span class="font-mono uppercase tracking-[0.28em] text-sm text-white/90">${T(t, "enter")}</span>
          </button>
        </div>` : html`<div class="absolute inset-x-0 bottom-1 flex justify-center pointer-events-none">
          ${/* how many are dancing — the stage is the visual, this counts it */""}
          <span class="font-mono uppercase tracking-[0.2em] text-[length:var(--ms-label)] text-white/55">${cast.length} / ${ALL_IDS.length} ${T(t, "onStage")}</span>
        </div>`}
      </div>

      ${/* ONE island: the dancer filmstrip + the transport, together */""}
      <${Island} tone="dark" className="shrink-0 flex flex-col gap-[var(--ms-gap)] max-w-md w-full mx-auto">
        <div class="dk-strip flex items-center gap-2 overflow-x-auto -mx-1 px-1 py-0.5" role="group" aria-label=${T(t, "dancers")}>
          ${/* tap a girl to add/remove her from the stage; the last one can't be removed */""}
          <button data-all type="button" aria-pressed=${cast.length >= ALL_IDS.length ? "true" : "false"}
            aria-label=${T(t, "all")} onClick=${pickAll}
            class=${`dk-chip shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-[background-color,box-shadow,transform,opacity] duration-200 ${cast.length >= ALL_IDS.length ? "bg-white/15 ring-2 ring-[var(--app-accent)]" : "bg-white/[.05] ring-1 ring-white/15 hover:opacity-100"}`}>
            <iconify-icon icon="lucide:users" class="text-[length:var(--ms-label)] text-white/85"></iconify-icon>
            <span class="font-mono uppercase text-[length:var(--ms-label)] tracking-wide text-white/85">${T(t, "all")}</span>
          </button>
          ${GIRLS.map((g) => {
            const on = onStage.has(g.id);
            return html`<button key=${g.id} data-girl=${g.id} type="button" aria-pressed=${on ? "true" : "false"}
              aria-label=${`${g.name} — ${T(t, g.danceKey)}`} onClick=${() => toggleGirl(g.id)}
              class=${`dk-chip shrink-0 flex items-center gap-1.5 rounded-full pl-1.5 pr-3 py-1.5 transition-[background-color,box-shadow,transform,opacity] duration-200 ${on ? "bg-white/15 ring-2 ring-[var(--app-accent)]" : "bg-white/[.04] ring-1 ring-white/10 opacity-65 hover:opacity-100"}`}>
              <span class="w-3.5 h-3.5 rounded-full shrink-0" style=${`background:${g.tint};box-shadow:${on ? `0 0 7px ${g.tint}` : "none"}`}></span>
              <span class=${`font-mono text-[length:var(--ms-label)] tracking-wide ${on ? "text-white" : "text-white/75"}`}>${g.name}</span>
            </button>`;
          })}
        </div>
        <${Transport} locale=${loc} playing=${playing} onToggle=${onToggle} stopIcon=${true}
          actions=${[
            { id: "mute", icon: mute ? "lucide:volume-x" : "lucide:volume-2", label: T(t, mute ? "aUnmute" : "aMute"), active: mute, pressed: mute, onClick: () => setMuted(!mute), attr: { "data-mute": "" } },
          ]} />
      </${Island}>
    </div>
  </${Fragment}>`;
}
