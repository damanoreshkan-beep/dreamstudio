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
import { Island, Transport } from "/_rt/ui.js";
import { GlStage } from "/_rt/glstage.js";
import { retryDelay, progressCheck } from "/_rt/tide.js";
import { bassEnergy, stepPulse, idleGroove, integratePhase } from "/_rt/afterdark.js";
import { GIRLS, girlById, trioFor } from "./girls.js";

const STREAM = "https://streams.rautemusik.fm/techno/mp3-192";
const AC = typeof AudioContext !== "undefined" ? AudioContext : (typeof globalThis !== "undefined" && globalThis.webkitAudioContext) || null;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- persisted working set ----
const $focus = persistentAtom("afterdark:focus", GIRLS[1].id);   // the lead girl (centre of the trio)
const $muted = persistentAtom("afterdark:muted", "0");
// the Enter cover is dismissed once the audio gesture happened; under the gate the shot is the live rave, so
// we seed past the gesture (like tide seeds past the real stream) and the mock owns the state machine.
const $entered = atom(gate);
const $playing = atom(false);
const $state = atom("idle");                                     // idle | connecting | live | reconnecting | offline
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
.ad-dot{width:.5rem;height:.5rem;border-radius:9999px;background:var(--app-accent);box-shadow:0 0 8px var(--app-accent)}
[data-rave][data-state="live"] .ad-dot{animation:adPulse .46s ease-in-out infinite}
[data-rave][data-state="connecting"] .ad-dot,[data-rave][data-state="reconnecting"] .ad-dot{animation:adBlink 1s steps(2) infinite}
@keyframes adPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.9);opacity:.55}}
@keyframes adBlink{0%{opacity:1}50%{opacity:.25}}
.ad-enter-ring{box-shadow:0 0 0 1px rgba(255,255,255,.18),0 0 40px 0 color-mix(in oklch,var(--app-accent) 55%,transparent)}
@keyframes adBreath{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
[data-enter] .ad-enter-ring{animation:adBreath 2.6s ease-in-out infinite}
/* the dancer filmstrip: a horizontal scroll of name-chips, snap, no visible scrollbar */
.ad-strip{scrollbar-width:none;-ms-overflow-style:none;scroll-snap-type:x proximity}
.ad-strip::-webkit-scrollbar{display:none}
.ad-chip{scroll-snap-align:center}
@media(prefers-reduced-motion:reduce){.ad-dot,[data-enter] .ad-enter-ring{animation:none!important}}`;

// ================= the rave =================
export function afterdark({ S }) {
  const t = useStore(S.t);
  const loc = useStore(S.locale);
  const focusId = useStore($focus);
  const playing = useStore($playing);
  const state = useStore($state);
  const entered = useStore($entered);
  const mute = useStore($muted) === "1";
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
        engine = createDanceStage(stageRef.current, () => env);
        engineRef.current = engine;
        if (engine.ok) engine.setTrio(trioFor($focus.get()));
      } catch { /* no WebGL / no addons: the rave field + DOM still carry the screen */ }
    })();
    return () => { engine?.dispose?.(); engineRef.current = null; };
  }, []);

  const trio = trioFor(focusId);                                 // [left, centre, right] — the three on stage
  const focus = girlById(focusId);
  const stateLine = state === "connecting" ? T(t, "connecting") : state === "reconnecting" ? T(t, "reconnecting") : state === "offline" ? T(t, "offline") : state === "live" ? T(t, "live") : T(t, "idle");
  const onToggle = () => (entered ? toggle() : enter());
  const setFocus = (id) => { if (id === $focus.get()) return; $focus.set(id); engineRef.current?.setTrio?.(trioFor(id)); };
  const onPointer = (e) => { if (env.mode === "orient") return; env.mode = "pointer"; const r = e.currentTarget.getBoundingClientRect(); env.ttx = clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1); env.tty = clamp((e.clientY - r.top) / r.height * 2 - 1, -1, 1); };

  return html`<${Fragment}>
    <style>${CSS}</style>
    ${/* the fixed night stage — z-0 (NOT negative: a negative z hides behind the light farm-theme body, and the
         rave is dark-committed). The opaque gradient is the first-paint/offline floor; GlStage paints the rave
         over it; the transparent dancers canvas sits over that; the DOM chrome (z-10) over all. */""}
    <div class="fixed inset-0 z-0" style="background:radial-gradient(120% 90% at 50% 8%, #1A0A22 0%, #0C0614 46%, #050308 100%)"></div>
    <${GlStage} shader=${new URL("afterdark.frag", import.meta.url)} seed=${(focus.id.charCodeAt(0) % 13) / 13}
      vary=${vary} ink=${ink} zClass="z-0" />
    ${/* the 3D dancers, over the rave field, under the DOM chrome */""}
    <canvas ref=${stageRef} data-dancers aria-hidden="true" class="fixed inset-0 z-0 w-full h-full pointer-events-none"></canvas>

    <div data-rave data-state=${state} data-focus=${focusId} data-entered=${entered ? "yes" : "no"}
      class="relative z-10 h-full min-h-0 flex flex-col gap-[var(--ms-gap)]">
      ${/* top label: the track/vibe + a live pulse dot; the status WORD is announced politely */""}
      <div class="shrink-0 flex justify-center">
        <${Island} tone="dark" className="flex items-center gap-2.5 !py-1.5 !px-3.5 rounded-full">
          <span class="ad-dot shrink-0"></span>
          <span class="font-mono uppercase tracking-wider text-[length:var(--ms-label)] text-white/90">${T(t, "station")}</span>
          <span class="w-px h-3 bg-white/20"></span>
          <span class="font-mono uppercase tracking-wider text-[length:var(--ms-label)] text-white/65">${T(t, "genre")}</span>
          <span class="font-mono uppercase tracking-wider text-[length:var(--ms-label)] text-white/80 tabular-nums" aria-live="polite">· ${stateLine}</span>
        </${Island}>
      </div>

      ${/* the void: where the dancers perform (in the canvas behind) — pointer parallax lives here */""}
      <div class="flex-1 min-h-0 relative" onPointerMove=${onPointer}>
        ${!entered ? html`<div class="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none">
          <button data-enter aria-label=${T(t, "enter")} onClick=${enter}
            class="pointer-events-auto flex flex-col items-center gap-3 select-none group">
            <span class="ad-enter-ring w-24 h-24 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white">
              <iconify-icon icon="lucide:play" class="text-4xl translate-x-0.5"></iconify-icon>
            </span>
            <span class="font-mono uppercase tracking-[0.28em] text-sm text-white/90">${T(t, "enter")}</span>
          </button>
        </div>` : html`<div class="absolute inset-x-0 bottom-1 flex justify-center pointer-events-none">
          ${/* who leads, and her move — the stage is the visual, this names it */""}
          <span class="font-mono uppercase tracking-[0.2em] text-[length:var(--ms-label)] text-white/55">${focus.name} · ${T(t, focus.danceKey)}</span>
        </div>`}
      </div>

      ${/* ONE island: the dancer filmstrip + the transport, together */""}
      <${Island} tone="dark" className="shrink-0 flex flex-col gap-[var(--ms-gap)] max-w-md w-full mx-auto">
        <div class="ad-strip flex items-center gap-2 overflow-x-auto -mx-1 px-1 py-0.5" role="group" aria-label=${T(t, "dancers")}>
          ${GIRLS.map((g) => {
            const lead = g.id === focusId;
            const onStage = trio.includes(g.id);
            return html`<button key=${g.id} data-girl=${g.id} type="button" aria-pressed=${lead ? "true" : "false"}
              aria-label=${`${g.name} — ${T(t, g.danceKey)}`} onClick=${() => setFocus(g.id)}
              class=${`ad-chip shrink-0 flex items-center gap-1.5 rounded-full pl-1.5 pr-3 py-1.5 transition-[background-color,box-shadow,transform,opacity] duration-200 ${lead ? "bg-white/15 ring-2 ring-[var(--app-accent)] scale-[1.03]" : onStage ? "bg-white/[.07] ring-1 ring-white/20" : "bg-white/[.03] ring-1 ring-white/10 opacity-70 hover:opacity-100"}`}>
              <span class="w-3.5 h-3.5 rounded-full shrink-0" style=${`background:${g.tint};box-shadow:0 0 6px ${g.tint}88`}></span>
              <span class=${`font-mono text-[length:var(--ms-label)] tracking-wide ${lead ? "text-white" : "text-white/80"}`}>${g.name}</span>
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
