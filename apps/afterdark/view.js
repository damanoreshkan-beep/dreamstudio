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
import { VPS_PROXY } from "/_rt/feed.js";
import { bassEnergy, stepPulse, idleGroove, integratePhase } from "/_rt/afterdark.js";
import { spectralFlux, createBeatState, stepBeat, BPM_REF } from "/_rt/afterbeat.js";
import { MOVE_IDS, loadCatalog } from "./dances.js";
import { $cast, $moves, getCast, getMoves } from "./state.js";
export { castView } from "./cast.js";
import { readPalette, isDay, SLOTS } from "./palette.js";

const STREAM = "https://streams.rautemusik.fm/techno/mp3-192";
const LIVE = VPS_PROXY + "/live/master.m3u8";
const IOS = typeof navigator !== "undefined" && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
const HLS_CFG = {
  xhrSetup: (xhr, url) => { xhr.open("GET", url, true); xhr.setRequestHeader("Range", "bytes=0-"); },
  lowLatencyMode: false,
  liveSyncDuration: 300,
  liveSyncMode: "edge",
  liveSyncOnStallIncrease: 0,
  maxLiveSyncPlaybackRate: 1,
  maxBufferLength: 330, maxMaxBufferLength: 900, maxBufferSize: 120 * 1024 * 1024,
  backBufferLength: 120,
  fragLoadPolicy: { default: { maxTimeToFirstByteMs: 12000, maxLoadTimeMs: 30000, timeoutRetry: { maxNumRetry: 12, retryDelayMs: 1000, maxRetryDelayMs: 8000 }, errorRetry: { maxNumRetry: 12, retryDelayMs: 1000, maxRetryDelayMs: 8000 } } },
  playlistLoadPolicy: { default: { maxTimeToFirstByteMs: 8000, maxLoadTimeMs: 12000, timeoutRetry: { maxNumRetry: 3, retryDelayMs: 1000, maxRetryDelayMs: 4000 }, errorRetry: { maxNumRetry: 3, retryDelayMs: 1000, maxRetryDelayMs: 4000 } } },
};
const AC = typeof AudioContext !== "undefined" ? AudioContext : (typeof globalThis !== "undefined" && globalThis.webkitAudioContext) || null;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const frac = (x) => x - Math.floor(x);
const IDLE_BPM = 126;

const $muted = persistentAtom("afterdark:muted", "0");
const $dock = persistentAtom("afterdark:dock", "1");
const $entered = atom(gate);
const $playing = atom(false);
const $state = atom("idle");
const $buffer = atom(0);
const $stage3d = atom(gate ? "skipped" : "loading");
const $stage3dWhy = atom("");
const $bpm = atom(0);
const $fs = atom(false);
const muted = () => $muted.get() === "1";

let el = null, ctx = null, src = null, analyser = null, freq = null, np = null, wl = null;
let beatAn = null, fdb = null, mag = null, magPrev = null;
let attempt = 0, retryTimer = null, stallTimer = null, connectTimer = null, liveTimer = null, mark = null;
let hls = null, hlsMod = null, dvrDead = false;
async function loadHls() { if (hlsMod !== null) return hlsMod; try { hlsMod = (await import("hls.js")).default || false; } catch { hlsMod = false; } return hlsMod; }
function killHls() { if (hls) { try { hls.destroy(); } catch { } hls = null; } }
function attachHls(a, H) {
  let manifestFails = 0;
  const h = new H(HLS_CFG);
  hls = h;
  h.on(H.Events.ERROR, (_, d) => {
    if (el !== a || hls !== h || !d || !d.fatal) return;
    if (d.type === H.ErrorTypes.NETWORK_ERROR) {
      if (/^manifest/i.test(d.details || "") && ++manifestFails >= 3) { dvrDead = true; lost(a); return; }
      h.startLoad(); return;
    }
    if (d.type === H.ErrorTypes.MEDIA_ERROR) { h.recoverMediaError(); return; }
    lost(a);
  });
  h.attachMedia(a);
  h.loadSource(LIVE);
}

function attach(a) {
  if (src) { try { src.disconnect(); } catch { } src = null; }
  if (!AC) return;
  try {
    ctx ||= new AC();
    ctx.resume();
    src = ctx.createMediaElementSource(a);
    if (!analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.4; freq = new Uint8Array(analyser.frequencyBinCount); analyser.connect(ctx.destination); }
    if (!beatAn) { beatAn = ctx.createAnalyser(); beatAn.fftSize = 1024; beatAn.smoothingTimeConstant = 0; fdb = new Float32Array(beatAn.frequencyBinCount); mag = new Float32Array(beatAn.frequencyBinCount); magPrev = new Float32Array(beatAn.frequencyBinCount); }
    src.connect(analyser);
    src.connect(beatAn);
  } catch { src = null; }
}

function hold() {
  if (!np) np = holdAudio({ title: "rautemusik", artist: "techno", onPlay: () => { if (!$playing.get()) start(); }, onPause: () => stop(), resumeCtx: () => ctx?.resume() });
  np.setPlaying("rautemusik");
}

async function play({ reconnect = false } = {}) {
  if (gate || typeof Audio === "undefined") { $playing.set(true); $state.set("live"); hold(); return; }
  if (!reconnect) attempt = 0;
  clearTimeout(retryTimer); clearTimeout(stallTimer); clearTimeout(connectTimer);
  const old = el;
  killHls();
  if (old) { try { old.pause(); old.removeAttribute("src"); old.load(); } catch { } }
  const a = document.createElement("audio");
  a.preload = "none";
  a.crossOrigin = "anonymous";
  a.volume = muted() ? 0 : 1;
  el = a;

  $state.set(reconnect ? "reconnecting" : "connecting");
  let hadAudio = false;
  const armStall = () => { clearTimeout(stallTimer); stallTimer = setTimeout(() => { if (el === a && $state.get() !== "live") lost(a); }, 8000); };
  a.onplaying = () => { if (el !== a) return; attempt = 0; hadAudio = true; clearTimeout(connectTimer); clearTimeout(stallTimer); $state.set("live"); a.volume = muted() ? 0 : 1; };
  a.onended = () => { if (el === a) lost(a); };
  a.onerror = () => { if (el === a) lost(a); };
  connectTimer = setTimeout(() => { if (el === a && $state.get() !== "live") lost(a); }, 12000);
  attach(a);
  const H = (!IOS && !dvrDead) ? await loadHls() : false;
  if (el !== a) return;
  const dvr = !!(H && H.isSupported());
  if (dvr) {
    a.onstalled = null;
    a.onwaiting = () => { if (el === a && hadAudio) $state.set("buffering"); };
    attachHls(a, H);
  } else {
    a.onwaiting = a.onstalled = () => { if (el !== a) return; if (hadAudio) { $state.set("reconnecting"); armStall(); } };
    a.src = STREAM;
  }
  a.dvr = dvr;
  const p = a.play();
  if (p && p.catch) p.catch((err) => { if (el !== a) return; if (err && err.name === "NotAllowedError") { stop(); return; } lost(a); });
  $playing.set(true);
  if (!wl) wl = wakeLock.acquire();
  hold();
  mark = null;
  if (!liveTimer) liveTimer = setInterval(probe, 2000);
}

function lost(a) {
  if (el !== a || !$playing.get()) return;
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  $state.set(online ? "reconnecting" : "offline");
  el = null; killHls(); try { a.pause(); a.removeAttribute("src"); a.load(); } catch { }
  clearTimeout(connectTimer); clearTimeout(stallTimer); clearTimeout(retryTimer);
  const wait = retryDelay(attempt); attempt += 1;
  retryTimer = setTimeout(() => { retryTimer = null; if ($playing.get()) play({ reconnect: true }); }, wait);
}
function probe() {
  if (gate || !$playing.get() || !el) return;
  try { const b = el.buffered; let ahead = 0; for (let i = 0; i < b.length; i++) if (b.start(i) <= el.currentTime + 0.5 && b.end(i) > el.currentTime) ahead = Math.max(ahead, b.end(i) - el.currentTime); const s = Math.floor(ahead); if (s !== $buffer.get()) $buffer.set(s); } catch { }
  if (mark && el.dvr) { const wall = (performance.now() - mark.at) / 1000, moved = el.currentTime - mark.time; if (moved > wall + 15 || moved < -15) report("dvr.jump", { moved: Math.round(moved), wall: Math.round(wall) }); }
  if ($state.get() !== "live") return;
  const r = progressCheck({ time: el.currentTime, mark, now: performance.now(), budget: el.dvr ? 120000 : 8000 });
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
  try { navigator.connection?.addEventListener?.("change", relink); } catch { }
}

function stop() {
  $playing.set(false); $state.set("idle");
  clearTimeout(connectTimer); clearTimeout(retryTimer); clearTimeout(stallTimer);
  attempt = 0;
  killHls();
  if (el) { const o = el; el = null; try { o.pause(); o.removeAttribute("src"); o.load(); } catch { } }
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
  mark = null; $buffer.set(0);
  if (wl) { wl.release(); wl = null; }
  if (np) { np.release(); np = null; }
}
const start = () => play({});
const toggle = () => { $playing.get() ? stop() : start(); };
function setMuted(m) { $muted.set(m ? "1" : "0"); if (el) { try { el.volume = m ? 0 : 1; } catch { } } }

const env = {
  last: 0, tick: 0, pulseState: { pulse: 0, baseline: 0 }, pulse: 0, energy: 0, dph: 0, sph: 0, tiltX: 0, tiltY: 0, ttx: 0, tty: 0, mode: "auto",
  beatState: null, bpm: IDLE_BPM, beatPhase: 0, barPhase: 0, beatIndex: 0, confidence: 0, beatA: 0, barA: 0, lead: 0.08, drive: 0,
  pal: null, palTarget: null, day: 0, themeKey: "", frame: 0,
  cam: { yaw: 0, pitch: 0, zoom: 1 }, camT: { yaw: 0, pitch: 0, zoom: 1 },
};
const CAM = { pitchMin: -0.12, pitchMax: 0.62, zoomMin: 0.55, zoomMax: 1.8 };
const ptrs = new Map();
let pinchDist = 0, lastTapAt = 0;
function camDown(e) {
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch { }
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinchDist = Math.hypot(a.x - b.x, a.y - b.y); }
  if (ptrs.size === 1) { const now = performance.now(); if (now - lastTapAt < 300) { env.camT = { yaw: 0, pitch: 0, zoom: 1 }; } lastTapAt = now; }
}
function camMove(e) {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 1) {
    env.camT.yaw -= dx * 0.006;
    env.camT.pitch = clamp(env.camT.pitch + dy * 0.004, CAM.pitchMin, CAM.pitchMax);
  } else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDist > 0 && d > 0) env.camT.zoom = clamp(env.camT.zoom * (pinchDist / d), CAM.zoomMin, CAM.zoomMax);
    pinchDist = d;
  }
}
function camUp(e) { ptrs.delete(e.pointerId); pinchDist = 0; }
function camWheel(e) { env.camT.zoom = clamp(env.camT.zoom * (1 + e.deltaY * 0.0012), CAM.zoomMin, CAM.zoomMax); e.preventDefault(); }
const camHandlers = { onPointerDown: camDown, onPointerMove: camMove, onPointerUp: camUp, onPointerCancel: camUp, onWheel: camWheel };
function retheme() { env.palTarget = readPalette(); if (!env.pal) env.pal = new Float32Array(env.palTarget); }
if (typeof globalThis !== "undefined") globalThis.__afterdark = env;
function themeKey() {
  try { const r = document.documentElement, cs = getComputedStyle(r); return `${r.getAttribute("data-theme")}|${r.getAttribute("data-material")}|${cs.getPropertyValue("--color-base-100")}|${cs.getPropertyValue("--app-accent")}|${cs.getPropertyValue("--color-accent")}`; } catch { return ""; }
}
function vary() {
  const now = performance.now();
  const dt = env.last ? Math.min(0.1, (now - env.last) / 1000) : 0; env.last = now;
  let pulse, energy;
  const live = analyser && src && $playing.get() && $state.get() === "live";
  if (live) {
    analyser.getByteFrequencyData(freq);
    energy = bassEnergy(freq);
    env.pulseState = stepPulse(env.pulseState, energy);
    pulse = env.pulseState.pulse;
    beatAn.getFloatFrequencyData(fdb);
    for (let i = 0; i < fdb.length; i++) { const v = (fdb[i] + 100) / 70; mag[i] = v > 0 ? (v < 1 ? v : 1) : 0; }
    const b = stepBeat(env.beatState, spectralFlux(mag, magPrev), now / 1000);
    const t = mag; mag = magPrev; magPrev = t;
    env.beatState = b.state; env.bpm = b.bpm; env.beatPhase = b.beatPhase; env.barPhase = b.barPhase; env.beatIndex = b.beatIndex; env.confidence = b.confidence;
    env.lead = (ctx ? (ctx.outputLatency || 0) + (ctx.baseLatency || 0) : 0.06) + 1 / 60;
  } else {
    env.tick += dt; pulse = idleGroove(env.tick); energy = pulse;
    env.bpm = IDLE_BPM; env.confidence = 0;
    const beats = env.tick * IDLE_BPM / 60;
    env.beatPhase = frac(beats); env.beatIndex = Math.floor(beats); env.barPhase = frac(beats / 4); env.lead = 0;
  }
  if ((env.frame++ % 30) === 0) { const key = themeKey(); if (key !== env.themeKey) { env.themeKey = key; retheme(); } }
  if (!env.palTarget) retheme();
  const k = clamp(dt * 6, 0, 1);
  for (let i = 0; i < SLOTS * 4; i++) env.pal[i] += (env.palTarget[i] - env.pal[i]) * k;
  env.day += ((isDay() ? 1 : 0) - env.day) * k;
  const kc = clamp(dt * 9, 0, 1);
  env.cam.yaw += (env.camT.yaw - env.cam.yaw) * kc; env.cam.pitch += (env.camT.pitch - env.cam.pitch) * kc; env.cam.zoom += (env.camT.zoom - env.cam.zoom) * kc;
  const leadBeats = env.lead * env.bpm / 60;
  env.beatA = frac(env.beatPhase + leadBeats); env.barA = frac(env.barPhase + leadBeats / 4);
  const shown = env.confidence > 0.35 ? Math.round(env.bpm) : 0;
  if (shown !== $bpm.get()) $bpm.set(shown);
  env.pulse = pulse; env.energy = energy;
  env.playing = $playing.get();
  env.dph += dt * env.bpm / 60;
  env.sph = integratePhase(env.sph, dt, pulse);
  env.drive += (clamp((energy - 0.14) / 0.3, 0, 1) - env.drive) * clamp(dt * 2, 0, 1);
  return [pulse, env.dph, env.sph, env.confidence * env.drive];
}
function ink() {
  if (env.mode === "auto") { const t = env.tick; env.ttx = Math.sin(t * 0.5) * 0.5; env.tty = Math.sin(t * 0.33) * 0.3; }
  env.tiltX += (env.ttx - env.tiltX) * 0.06;
  env.tiltY += (env.tty - env.tiltY) * 0.06;
  return [env.tiltX, env.tiltY, env.beatA, env.barA];
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
function toggleFullscreen() {
  try {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
    const el = document.documentElement;
    const r = el.requestFullscreen?.({ navigationUI: "hide" }) || el.webkitRequestFullscreen?.();
    r?.catch?.(() => {});
  } catch { }
}
if (typeof document !== "undefined") document.addEventListener("fullscreenchange", () => $fs.set(!!document.fullscreenElement));
async function enter() {
  $entered.set(true);
  try { if (AC) { ctx ||= new AC(); await ctx.resume(); } } catch { }
  requestTilt();
  start();
}

const CSS = `
/* NIGHT (a dark theme): the stage is near-black and the chrome is dark glass with light ink. The runtime
   app-bar — transparent, theme-ink text — would vanish over the night stage in some dark themes, so it gets
   the same dark glass. Scoped to the stage view: it unmounts on the profile tab. */
:root:not([data-theme$="-light"]) header.navbar{background:rgba(10,6,18,.9);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,255,255,.07)}
:root:not([data-theme$="-light"]) header.navbar [data-title],:root:not([data-theme$="-light"]) header.navbar [data-battery]{color:rgba(255,255,255,.92)!important}
:root:not([data-theme$="-light"]) header.navbar [data-title]{text-shadow:0 1px 2px #0A0510,0 0 14px #0A0510}
/* the transport's primary key on dark glass is the cream key (the light theme's black primary on dark
   glass was a black disc on black, measured 2026-09-11); by day the theme's own primary is right */
:root:not([data-theme$="-light"]) [data-rave] .btn-primary{background:#F2EEE6;border-color:#F2EEE6;color:#0A0510}
.dk-bg{background:radial-gradient(120% 90% at 50% 8%, #1A0A22 0%, #0C0614 46%, #050308 100%)}
.dk-ink{color:rgba(255,255,255,.92)}.dk-ink-2{color:rgba(255,255,255,.82)}.dk-ink-3{color:rgba(255,255,255,.6)}
.dk-line{background:rgba(255,255,255,.2)}
.dk-chip-on{background:rgba(255,255,255,.15);box-shadow:0 0 0 2px var(--app-accent)}
.dk-chip-off{background:rgba(255,255,255,.05);box-shadow:0 0 0 1px rgba(255,255,255,.14)}
.dk-chip-dim{opacity:.65}.dk-chip-dim:hover{opacity:1}
.dk-av{background:rgba(255,255,255,.06)}.dk-av:active{transform:scale(.94)}
:root[data-theme$="-light"] .dk-av{background:color-mix(in oklch,var(--color-base-content) 8%,transparent)}
.dk-enter{background:rgba(0,0,0,.5);color:#fff}
/* THE FOLD: the island collapses into its one key. Two animatable things do it — the content's grid row goes
   1fr → 0fr (a real height animation without a magic max-height) and the island's max-width shrinks to the
   key's; padding follows. Reduced motion = an instant fold. */
.dk-dock{max-width:28rem;transition:max-width .45s cubic-bezier(.4,0,.2,1),padding .45s cubic-bezier(.4,0,.2,1)}
.dk-fold{display:grid;grid-template-rows:1fr;transition:grid-template-rows .45s cubic-bezier(.4,0,.2,1),opacity .3s ease .1s;opacity:1}
.dk-fold-in{min-height:0;overflow:hidden}
.dk-dock[data-dock="folded"]{max-width:3.75rem;padding:.25rem;gap:0}
.dk-dock[data-dock="folded"] .dk-fold{grid-template-rows:0fr;opacity:0;pointer-events:none;transition:grid-template-rows .45s cubic-bezier(.4,0,.2,1),opacity .2s ease}
@media(prefers-reduced-motion:reduce){.dk-dock,.dk-fold{transition:none}}
/* the void owns the finger: no browser pan/zoom, the drag orbits and the pinch zooms the 3D camera */
.dk-void{touch-action:none;overscroll-behavior:contain}
/* DAY (a light theme, owner 2026-09-11): the room is the theme's paper lit by the sun, so the chrome turns
   into the theme's own light glass with its ink — the palette itself (beams, washes, floor) comes from the
   theme tokens through palette.js, this is only the DOM's half. */
:root[data-theme$="-light"] .dk-bg{background:radial-gradient(120% 90% at 50% 8%, color-mix(in oklch,var(--color-base-100) 70%,white) 0%, var(--color-base-100) 50%, color-mix(in oklch,var(--color-base-100) 80%,var(--color-warning)) 100%)}
:root[data-theme$="-light"] [data-rave] .dk-isle{background:color-mix(in oklch,var(--color-base-100) 74%,transparent);border-color:color-mix(in oklch,var(--color-base-content) 12%,transparent);color:var(--color-base-content);box-shadow:0 8px 30px -12px color-mix(in oklch,var(--color-base-content) 35%,transparent)}
:root[data-theme$="-light"] .dk-ink{color:var(--color-base-content)}
:root[data-theme$="-light"] .dk-ink-2{color:color-mix(in oklch,var(--color-base-content) 82%,transparent)}
:root[data-theme$="-light"] .dk-ink-3{color:color-mix(in oklch,var(--color-base-content) 60%,transparent)}
:root[data-theme$="-light"] .dk-line{background:color-mix(in oklch,var(--color-base-content) 20%,transparent)}
:root[data-theme$="-light"] .dk-chip-on{background:color-mix(in oklch,var(--color-base-content) 12%,transparent)}
:root[data-theme$="-light"] .dk-chip-off{background:color-mix(in oklch,var(--color-base-content) 5%,transparent);box-shadow:0 0 0 1px color-mix(in oklch,var(--color-base-content) 14%,transparent)}
:root[data-theme$="-light"] .dk-enter{background:color-mix(in oklch,var(--color-base-100) 70%,transparent);color:var(--color-base-content)}
:root[data-theme$="-light"] .dk-enter-ring{box-shadow:0 0 0 1px color-mix(in oklch,var(--color-base-content) 18%,transparent),0 0 40px 0 color-mix(in oklch,var(--app-accent) 45%,transparent)}
.dk-enter-ring{box-shadow:0 0 0 1px rgba(255,255,255,.18),0 0 40px 0 color-mix(in oklch,var(--app-accent) 55%,transparent)}
@keyframes adBreath{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
[data-enter] .dk-enter-ring{animation:adBreath 2.6s ease-in-out infinite}
/* the dancer filmstrip: a horizontal scroll of name-chips, snap, no visible scrollbar */
.dk-strip{scrollbar-width:none;-ms-overflow-style:none;scroll-snap-type:x proximity}
.dk-strip::-webkit-scrollbar{display:none}
.dk-chip{scroll-snap-align:center}
/* FULLSCREEN (the transport's maximize key): the runtime's navbar/dock fade so the rave fills the glass; our
   island stays — the minimize key lives on it. Nothing is removed (axe/e2e still see it). */
:root[data-immersive] header.navbar,:root[data-immersive] nav[data-dock],:root[data-immersive] [data-dock-fade]{opacity:0;pointer-events:none;transition:opacity .5s ease}
@media(prefers-reduced-motion:reduce){[data-enter] .dk-enter-ring{animation:none!important}:root[data-immersive] header.navbar,:root[data-immersive] nav[data-dock]{transition:none}}`;

export function afterdark({ S }) {
  const t = useStore(S.t);
  const loc = useStore(S.locale);
  useStore($cast);
  useStore($moves);
  const cast = getCast();
  const moves = getMoves();
  const playing = useStore($playing);
  const state = useStore($state);
  const entered = useStore($entered);
  const mute = useStore($muted) === "1";
  const dockOpen = useStore($dock) !== "0";
  const stage3d = useStore($stage3d), stage3dWhy = useStore($stage3dWhy);
  const bpm = useStore($bpm);
  const buffer = useStore($buffer);
  const fs = useStore($fs);
  const stageRef = useRef();
  const engineRef = useRef(null);

  useEffect(() => {
    if (typeof document === "undefined") return () => {};
    if (fs) document.documentElement.dataset.immersive = ""; else delete document.documentElement.dataset.immersive;
    return () => { delete document.documentElement.dataset.immersive; };
  }, [fs]);

  useEffect(() => {
    if (gate) { start(); return () => {}; }
    let engine = null;
    (async () => {
      try {
        const { createDanceStage } = await import("./dancers.js");
        if (!stageRef.current) return;
        engine = createDanceStage(stageRef.current, () => env, (st, why) => { $stage3d.set(st); $stage3dWhy.set(why || ""); if (st === "failed") report("stage3d.fail", { why: why || "" }); });
        engineRef.current = engine;
        if (engine.ok) { engine.setMoves(getMoves()); engine.setCast(getCast()); }
      } catch (e) { $stage3d.set("failed"); $stage3dWhy.set(String(e && e.message || e).slice(0, 80)); report("stage3d.fail", { why: $stage3dWhy.get() }); }
    })();
    return () => { engine?.dispose?.(); engineRef.current = null; };
  }, []);

  const onToggle = () => (entered ? toggle() : enter());
  useEffect(() => { engineRef.current?.setCast?.(cast); }, [cast.join()]);
  useEffect(() => {
    if (moves.some((id) => !MOVE_IDS.includes(id))) loadCatalog().then(() => engineRef.current?.setMoves?.(getMoves()));
    else engineRef.current?.setMoves?.(moves);
  }, [moves.join()]);
  const onPointer = (e) => { if (env.mode === "orient" || ptrs.size) return; env.mode = "pointer"; const r = e.currentTarget.getBoundingClientRect(); env.ttx = clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1); env.tty = clamp((e.clientY - r.top) / r.height * 2 - 1, -1, 1); };

  return html`<${Fragment}>
    <style>${CSS}</style>
    ${""}
    <div class="dk-bg fixed inset-0 z-0"></div>
    <${GlStage} shader=${new URL("afterdark.frag", import.meta.url)} seed=${((cast[0] || "a").charCodeAt(0) % 13) / 13}
      vary=${vary} ink=${ink} points=${() => env.pal} zClass="z-0" />
    ${""}
    <canvas ref=${stageRef} data-dancers aria-hidden="true" class="fixed inset-0 z-0 w-full h-full pointer-events-none"></canvas>

    <div data-rave data-state=${state} data-cast=${cast.length} data-entered=${entered ? "yes" : "no"} data-3d=${stage3d} data-3d-why=${stage3dWhy}
      data-fs=${fs ? "yes" : "no"} data-bpm=${bpm || ""} data-buffer=${buffer}
      class="relative z-10 h-full min-h-0 flex flex-col gap-[var(--ms-gap)]">
      ${""}
      ${""}
      <div class="dk-void flex-1 min-h-0 relative" onPointerMove=${onPointer} ...${camHandlers}>
        ${""}
        ${!entered ? html`<div class="absolute inset-0 flex flex-col items-center justify-start pt-[6%] gap-4 pointer-events-none">
          <button data-enter aria-label=${T(t, "enter")} onClick=${enter}
            class="pointer-events-auto flex flex-col items-center gap-3 select-none group">
            <span class="dk-enter dk-enter-ring w-24 h-24 rounded-full backdrop-blur-md flex items-center justify-center">
              <iconify-icon icon="lucide:play" class="text-4xl translate-x-0.5"></iconify-icon>
            </span>
            <span class="font-mono uppercase tracking-[0.28em] text-sm dk-ink">${T(t, "enter")}</span>
          </button>
        </div>` : null}
      </div>

      ${""}
      <${Island} tone="dark" className="dk-isle dk-dock shrink-0 flex flex-col gap-[var(--ms-gap)] w-full mx-auto" data-dock=${dockOpen ? "open" : "folded"}>
        <div class="dk-fold"><div class="dk-fold-in flex flex-col gap-[var(--ms-gap)]">
        <${Transport} locale=${loc} playing=${playing} onToggle=${onToggle} stopIcon=${true}
          actions=${[
            { id: "mute", icon: mute ? "lucide:volume-x" : "lucide:volume-2", label: T(t, mute ? "aUnmute" : "aMute"), active: mute, pressed: mute, onClick: () => setMuted(!mute), attr: { "data-mute": "" } },
            { id: "fs", icon: fs ? "lucide:minimize" : "lucide:maximize", label: T(t, fs ? "aExitFs" : "aFs"), active: fs, pressed: fs, onClick: toggleFullscreen, attr: { "data-fs-key": "" } },
          ]} />
        </div></div>
        <button data-dock-toggle type="button" aria-expanded=${dockOpen ? "true" : "false"} aria-label=${T(t, dockOpen ? "aFold" : "aUnfold")} onClick=${() => $dock.set(dockOpen ? "0" : "1")}
          class="dk-dock-key btn btn-ghost btn-sm btn-circle mx-auto dk-ink-2">
          <iconify-icon icon=${dockOpen ? "lucide:chevron-down" : "lucide:chevron-up"} class="text-xl"></iconify-icon>
        </button>
      </${Island}>
    </div>
  </${Fragment}>`;
}
