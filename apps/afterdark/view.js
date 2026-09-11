// afterdark — a one-track techno rave. ONE fit screen: the afterdark.frag rave field (lasers/haze/strobe) on
// /_rt/glstage.js behind a Three.js stage of THREE rigged girls dancing to the beat, under a thin dark-glass
// DOM layer — the Enter cover (the audio gesture), a top status label, and ONE island holding play/pause + a
// filmstrip picker of the 11 dancers. DOM is the truth the gate/axe/e2e see; both canvases are aria-hidden and
// probe-guarded (WebGL only; skipped under the headless gate, where the DOM alone must carry every meaning).
//
// The audio path (recipe): ONE <audio crossOrigin="anonymous"> (set BEFORE src; the source is the edge's HLS DVR
// via hls.js, or the direct Icecast stream on iOS / as the fallback — see LIVE) → MediaElementSource →
// AnalyserNode → destination; the AudioContext is resumed from the Enter tap (autoplay policy). TWO readings
// per frame: the kick-band energy becomes a single `pulse` (rt/afterdark.js) — the punch; and a second,
// unsmoothed analyser feeds the BEAT CLOCK (rt/afterbeat.js) — tempo + phase-locked beat/bar, so the girls
// and the lights move IN TIME, not just on loudness. Accents are anticipated by the output latency (predict,
// never react). No audio → an idle groove at 126 BPM, never a freeze. Stream drops port tide's reconnect.
// The stage is DARK-COMMITTED (theme-independent) so both farm-theme shots stay coherent and the dark-glass
// controls pass axe in both. A maximize key in the transport toggles real Fullscreen (owner: never automatic).

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
import { GIRLS } from "./girls.js";
import { MOVES, MOVE_IDS, DEFAULT_MOVES } from "./dances.js";
import { readPalette, isDay, SLOTS } from "./palette.js";

const STREAM = "https://streams.rautemusik.fm/techno/mp3-192";
// THE DVR (edge live.js): the same stream, pulled ONCE by the server into a 6-min HLS window. The client sits
// ~285 s behind live and rides a five-minute outage from its own buffer — no reconnect churn. Variant B
// (owner, 2026-09-11): iOS keeps the DIRECT Icecast <audio> — Safari's native HLS feeds the AnalyserNode
// silence (WebKit 231656) and the beat would die; everyone else gets hls.js over MSE. If the DVR itself is
// unreachable (three manifest failures) this session falls back to the direct stream: a DVR outage is never silence.
// master.m3u8 lists the edge's TWO pullers as redundant streams — hls.js swaps pods on load errors (live.js)
const LIVE = VPS_PROXY + "/live/master.m3u8";
const IOS = typeof navigator !== "undefined" && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
// THE SYNC CONTRACT with the edge DVR (live.js: 8 s segments, a 20-min window), thought through 2026-09-11
// after a phone «зависає і різко грає свіжий блок»:
//  · start 300 s behind the edge and NEVER re-sync on our own — no liveMaxLatency (the only thing that makes
//    hls.js jump to the edge), no playback-rate catch-up, no stall-driven latency creep;
//  · if hls.js must recover, 'buffered' continues from what is already downloaded instead of leaping to the edge;
//  · pull the whole play-behind forward (up to 15 min) so the runway is ON the phone, and keep 2 min behind;
//  · the window's tail is 15 min behind the play head, so a sleep/pause/stall shorter than that never falls out;
//  · the element is never torn down for a stall (play()): hls.js retries the playlist itself.
const HLS_CFG = {
  lowLatencyMode: false,                        // default true — MUST be off for a DVR
  liveSyncDuration: 300,                        // start 5 min behind the edge …
  liveSyncMode: "buffered",                     // … and, should hls.js ever re-sync, prefer the buffer to the edge
  liveSyncOnStallIncrease: 0,                   // a stall must not creep the target
  maxLiveSyncPlaybackRate: 1,                   // never speed up to "catch up" — there is nothing to catch
  maxBufferLength: 330, maxMaxBufferLength: 900, maxBufferSize: 120 * 1024 * 1024,   // the runway lives on the phone
  backBufferLength: 120,
  fragLoadPolicy: { default: { maxTimeToFirstByteMs: 12000, maxLoadTimeMs: 30000, timeoutRetry: { maxNumRetry: 12, retryDelayMs: 1000, maxRetryDelayMs: 8000 }, errorRetry: { maxNumRetry: 12, retryDelayMs: 1000, maxRetryDelayMs: 8000 } } },
  playlistLoadPolicy: { default: { maxTimeToFirstByteMs: 12000, maxLoadTimeMs: 20000, timeoutRetry: { maxNumRetry: 12, retryDelayMs: 1000, maxRetryDelayMs: 8000 }, errorRetry: { maxNumRetry: 12, retryDelayMs: 1000, maxRetryDelayMs: 8000 } } },
};
const AC = typeof AudioContext !== "undefined" ? AudioContext : (typeof globalThis !== "undefined" && globalThis.webkitAudioContext) || null;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const frac = (x) => x - Math.floor(x);
const IDLE_BPM = 126;                                               // the groove when there is no audio

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
// the MOVES: which dances the floor may play (1..36). A JSON id array; default = the ★ picks. Tapping a chip
// toggles a move; the last one can't be removed (the floor never runs dry). Clips load on demand.
const $moves = persistentAtom("afterdark:moves", JSON.stringify(DEFAULT_MOVES));
function getMoves() {
  let a; try { a = JSON.parse($moves.get()); } catch { a = null; }
  a = Array.isArray(a) ? a.filter((id) => MOVE_IDS.includes(id)) : [];
  return a.length ? a : DEFAULT_MOVES.slice();
}
const TIER_TINT = { light: "#8B5CF6", groove: "#39FF6A", drive: "#FF3EB5" };
const $muted = persistentAtom("afterdark:muted", "0");
const $dock = persistentAtom("afterdark:dock", "1");             // "1" = the island is open; "0" = folded to one key (owner, 2026-09-11)
// the Enter cover is dismissed once the audio gesture happened; under the gate the shot is the live rave, so
// we seed past the gesture (like tide seeds past the real stream) and the mock owns the state machine.
const $entered = atom(gate);
const $playing = atom(false);
const $state = atom("idle");                                     // idle | connecting | live | buffering | reconnecting | offline
const $buffer = atom(0);                                         // seconds of audio the client holds AHEAD of the play head (the DVR, downloaded)
const $stage3d = atom(gate ? "skipped" : "loading");             // the 3D stage's readout: loading | ready | failed | skipped
const $stage3dWhy = atom("");
const $bpm = atom(0);                                            // the locked tempo (0 = not confident yet), for the pill
const $fs = atom(false);                                         // in real Fullscreen (the transport's maximize key)
const muted = () => $muted.get() === "1";

// ---- the engine (module scope: survives tab switches, shared with the lock screen) ----
let el = null, ctx = null, src = null, analyser = null, freq = null, np = null, wl = null;
let beatAn = null, fdb = null, mag = null, magPrev = null;      // the beat clock's own unsmoothed analyser
let attempt = 0, retryTimer = null, stallTimer = null, connectTimer = null, liveTimer = null, mark = null;
let hls = null, hlsMod = null, dvrDead = false;                  // the hls.js instance for the CURRENT element; module cached; DVR given up this session
async function loadHls() { if (hlsMod !== null) return hlsMod; try { hlsMod = (await import("hls.js")).default || false; } catch { hlsMod = false; } return hlsMod; }
function killHls() { if (hls) { try { hls.destroy(); } catch { /* */ } hls = null; } }
// hls.js on the element: manifest → play; a fatal network error restarts loading (a long outage exhausts the
// retries, #5488), a media error is recovered once, anything else drops the link like a direct stream would.
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
  if (src) { try { src.disconnect(); } catch { /* */ } src = null; }
  if (!AC) return;
  try {
    ctx ||= new AC();
    ctx.resume();
    src = ctx.createMediaElementSource(a);
    if (!analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.4; freq = new Uint8Array(analyser.frequencyBinCount); analyser.connect(ctx.destination); }
    // smoothing 0 + float dB: onsets stay sharp for the beat clock (the pulse analyser is smoothed for the eye)
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
  // the gate has no audio: the mock owns the machine, and the session is still held (the APK's background
  // service is only visible to CI in Chromium, so short-circuiting before it would leave that half untested).
  if (gate || typeof Audio === "undefined") { $playing.set(true); $state.set("live"); hold(); return; }
  if (!reconnect) attempt = 0;
  clearTimeout(retryTimer); clearTimeout(stallTimer); clearTimeout(connectTimer);
  const old = el;
  killHls();
  if (old) { try { old.pause(); old.removeAttribute("src"); old.load(); } catch { /* */ } }
  const a = document.createElement("audio");
  a.preload = "none";
  a.crossOrigin = "anonymous";                                   // BEFORE src, per the CORS recipe
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
  // the source: the DVR through hls.js where it can work (not iOS, MSE present, DVR alive), else the direct stream
  const H = (!IOS && !dvrDead) ? await loadHls() : false;
  if (el !== a) return;                                          // superseded while the module loaded
  const dvr = !!(H && H.isSupported());
  if (dvr) {
    // MSE: the element's `stalled` is noise (Chrome fires it on a fed SourceBuffer) and `waiting` is the
    // buffer running dry — which, with ~285 s downloaded, means the outage is already minutes long. NEITHER
    // tears the element down (that was the "перез'єднання → тиша" bug, 2026-09-11): hls.js keeps retrying
    // the playlist by itself and the same element resumes where it stopped. `playing` clears the label.
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

// A dropped link holds the ONE station and reconnects with backoff — a live Icecast stream cannot resume, so
// each retry is a fresh element. `online`/connection-change short-circuit the wait (tide's proven logic).
function lost(a) {
  if (el !== a || !$playing.get()) return;
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  $state.set(online ? "reconnecting" : "offline");
  el = null; killHls(); try { a.pause(); a.removeAttribute("src"); a.load(); } catch { /* */ }
  clearTimeout(connectTimer); clearTimeout(stallTimer); clearTimeout(retryTimer);
  const wait = retryDelay(attempt); attempt += 1;
  retryTimer = setTimeout(() => { retryTimer = null; if ($playing.get()) play({ reconnect: true }); }, wait);
}
function probe() {
  if (gate || !$playing.get() || !el) return;
  // what the client HOLDS: the DVR is downloaded ahead of the play head (the owner's ask: the buffer lives on
  // the phone, not only on the server) — shown in the pill so an outage's runway is visible
  try { const b = el.buffered; let ahead = 0; for (let i = 0; i < b.length; i++) if (b.start(i) <= el.currentTime + 0.5 && b.end(i) > el.currentTime) ahead = Math.max(ahead, b.end(i) - el.currentTime); const s = Math.floor(ahead); if (s !== $buffer.get()) $buffer.set(s); } catch { /* */ }
  // a play head that LEAPS (more than the probe interval + slack, with no seek of ours) is a re-sync we did not
  // ask for — the owner's "різко грає свіжий блок". Counted in telemetry so the DVR contract can be audited.
  if (mark && el.dvr) { const wall = (performance.now() - mark.at) / 1000, moved = el.currentTime - mark.time; if (moved > wall + 15 || moved < -15) report("dvr.jump", { moved: Math.round(moved), wall: Math.round(wall) }); }
  if ($state.get() !== "live") return;
  // a play head that stops moving: 8 s is a dead direct stream; on the DVR only a wedged hls.js (2 min — its
  // own retries come first, and a dry buffer means the outage already outlived four minutes of runway)
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
  try { navigator.connection?.addEventListener?.("change", relink); } catch { /* the probe still covers it */ }
}

function stop() {
  $playing.set(false); $state.set("idle");
  clearTimeout(connectTimer); clearTimeout(retryTimer); clearTimeout(stallTimer);
  attempt = 0;
  killHls();
  if (el) { const o = el; el = null; try { o.pause(); o.removeAttribute("src"); o.load(); } catch { /* */ } }
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
  mark = null; $buffer.set(0);
  if (wl) { wl.release(); wl = null; }
  if (np) { np.release(); np = null; }
}
const start = () => play({});
const toggle = () => { $playing.get() ? stop() : start(); };
function setMuted(m) { $muted.set(m ? "1" : "0"); if (el) { try { el.volume = m ? 0 : 1; } catch { /* iOS */ } } }

// ---- the field's live channels: a plain object the shader + the 3D stage read every frame, never state ----
const env = {
  last: 0, tick: 0, pulseState: { pulse: 0, baseline: 0 }, pulse: 0, energy: 0, dph: 0, sph: 0, tiltX: 0, tiltY: 0, ttx: 0, tty: 0, mode: "auto",
  // the beat clock (rt/afterbeat.js): bpm · beatPhase 0..1 (0 = on the beat) · barPhase · beatIndex · confidence 0..1.
  // `beatA`/`barA` are the ANTICIPATED phases (led by the audio output latency + a frame) — what the eye should
  // move to, so an accent lands WITH the kick, not after it. Idle (no audio) free-runs at IDLE_BPM, confidence 0.
  beatState: null, bpm: IDLE_BPM, beatPhase: 0, barPhase: 0, beatIndex: 0, confidence: 0, beatA: 0, barA: 0, lead: 0.08, drive: 0,
  // THE PALETTE (palette.js): the theme's colours packed as 8 vec4s, eased toward `palTarget` so a theme toggle
  // cross-fades; `day` 0..1 = a light theme (the floor is lit as DAY). The shader gets `pal` as points[8] and
  // day as env.x (the runtime's own channel); the 3D rig reads both off env.
  pal: null, palTarget: null, day: 0, themeKey: "", frame: 0,
  // THE CAMERA (owner, 2026-09-11): a finger drag orbits (yaw/pitch), a pinch zooms, a double tap resets;
  // `cam` is the eased value the 3D stage reads, `camT` the gesture's target; yaw is unbounded (a full walk-around)
  cam: { yaw: 0, pitch: 0, zoom: 1 }, camT: { yaw: 0, pitch: 0, zoom: 1 },
};
const CAM = { pitchMin: -0.12, pitchMax: 0.62, zoomMin: 0.55, zoomMax: 1.8 };   // yaw is free: walk all the way round (owner: «зі спини бачити»)
const ptrs = new Map();                                            // active pointers on the stage: id → {x, y}
let pinchDist = 0, lastTapAt = 0;
function camDown(e) {
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ }
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
if (typeof globalThis !== "undefined") globalThis.__afterdark = env;   // a device debug handle: bpm/confidence/day/palette in the console
// The theme has TWO axes — the mode (html[data-theme] = signal | signal-light) and the MATERIAL
// (html[data-material], whose stylesheet arrives LATER than the attribute) — so no attribute observer can
// catch the moment the tokens actually change. A cheap fingerprint of the tokens, checked twice a second, can.
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
    // the beat clock: float dB → 0..1 magnitude (−100..−30 dB is the useful range), flux vs the last frame
    beatAn.getFloatFrequencyData(fdb);
    for (let i = 0; i < fdb.length; i++) { const v = (fdb[i] + 100) / 70; mag[i] = v > 0 ? (v < 1 ? v : 1) : 0; }
    const b = stepBeat(env.beatState, spectralFlux(mag, magPrev), now / 1000);
    const t = mag; mag = magPrev; magPrev = t;
    env.beatState = b.state; env.bpm = b.bpm; env.beatPhase = b.beatPhase; env.barPhase = b.barPhase; env.beatIndex = b.beatIndex; env.confidence = b.confidence;
    env.lead = (ctx ? (ctx.outputLatency || 0) + (ctx.baseLatency || 0) : 0.06) + 1 / 60;
  } else {
    env.tick += dt; pulse = idleGroove(env.tick); energy = pulse;
    // no audio: the clock free-runs at the idle groove so every consumer still has a beat to breathe on
    env.bpm = IDLE_BPM; env.confidence = 0;
    const beats = env.tick * IDLE_BPM / 60;
    env.beatPhase = frac(beats); env.beatIndex = Math.floor(beats); env.barPhase = frac(beats / 4); env.lead = 0;
  }
  // the theme: ease the palette + day toward the applied theme (a toggle cross-fades in ~0.4 s)
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
  env.playing = $playing.get();                                 // paused → the 3D girls ease into a calm idle sway
  env.dph += dt * env.bpm / 60;                                  // the groove phase now follows the locked tempo
  env.sph = integratePhase(env.sph, dt, pulse);
  // vary.w = the shader's STROBE amount: only with a confident clock, and only as the passage drives (a
  // smoothed energy) — a breakdown or the idle groove never flashes
  env.drive += (clamp((energy - 0.14) / 0.3, 0, 1) - env.drive) * clamp(dt * 2, 0, 1);
  return [pulse, env.dph, env.sph, env.confidence * env.drive];
}
// parallax: DeviceOrientation tilt (permission asked on the Enter tap) → pointer → a slow auto-sway; eased.
function ink() {
  if (env.mode === "auto") { const t = env.tick; env.ttx = Math.sin(t * 0.5) * 0.5; env.tty = Math.sin(t * 0.33) * 0.3; }
  env.tiltX += (env.ttx - env.tiltX) * 0.06;
  env.tiltY += (env.tty - env.tiltY) * 0.06;
  // ink.z/w carry the ANTICIPATED beat + bar phase to the shader (env.y/z/w are the runtime's, not ours)
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
// Fullscreen is asked ON the key's gesture (a browser refuses it after an await/timeout) — mirrors the
// camstage.js idiom. iOS Safari (no element fullscreen for non-video) simply keeps the PWA viewport; Telegram
// gets its own fullscreen from tma.js at boot. While in fullscreen the runtime's navbar/dock hide (CSS on
// :root[data-immersive]) so the rave fills the glass; our island stays, with the minimize key on it.
function toggleFullscreen() {
  try {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
    const el = document.documentElement;
    const r = el.requestFullscreen?.({ navigationUI: "hide" }) || el.webkitRequestFullscreen?.();
    r?.catch?.(() => {});
  } catch { /* denied: nothing changes */ }
}
if (typeof document !== "undefined") document.addEventListener("fullscreenchange", () => $fs.set(!!document.fullscreenElement));
async function enter() {
  $entered.set(true);
  try { if (AC) { ctx ||= new AC(); await ctx.resume(); } } catch { /* */ }
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

// ================= the rave =================
export function afterdark({ S }) {
  const t = useStore(S.t);
  const loc = useStore(S.locale);
  useStore($cast);                                                // re-render when the cast changes
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

  // fullscreen: stamp the root so the runtime's navbar/dock hide; leaving the view restores everything
  useEffect(() => {
    if (typeof document === "undefined") return () => {};
    if (fs) document.documentElement.dataset.immersive = ""; else delete document.documentElement.dataset.immersive;
    return () => { delete document.documentElement.dataset.immersive; };
  }, [fs]);

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
        if (engine.ok) { engine.setMoves(getMoves()); engine.setCast(getCast()); }
      } catch (e) { $stage3d.set("failed"); $stage3dWhy.set(String(e && e.message || e).slice(0, 80)); report("stage3d.fail", { why: $stage3dWhy.get() }); }
    })();
    return () => { engine?.dispose?.(); engineRef.current = null; };
  }, []);

  const onStage = new Set(cast);
  const onToggle = () => (entered ? toggle() : enter());
  const applyCast = (next) => { if (!next.length) return; $cast.set(JSON.stringify(next)); engineRef.current?.setCast?.(next); };
  const toggleGirl = (id) => { const c = getCast(); applyCast(c.includes(id) ? (c.length > 1 ? c.filter((x) => x !== id) : c) : [...c, id]); };
  const pickAll = () => applyCast(cast.length >= ALL_IDS.length ? DEFAULT_CAST.slice() : ALL_IDS.slice());
  const onMoves = new Set(moves);
  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  const applyMoves = (next) => { if (!next.length) return; $moves.set(JSON.stringify(next)); engineRef.current?.setMoves?.(next); };
  const toggleMove = (id) => { const m = getMoves(); applyMoves(m.includes(id) ? (m.length > 1 ? m.filter((x) => x !== id) : m) : [...m, id]); };
  const pickStars = () => applyMoves(DEFAULT_MOVES.slice());
  const pickAllMoves = () => applyMoves(moves.length >= MOVE_IDS.length ? DEFAULT_MOVES.slice() : MOVE_IDS.slice());
  const isStars = sameSet(moves, DEFAULT_MOVES);
  const onPointer = (e) => { if (env.mode === "orient" || ptrs.size) return; env.mode = "pointer"; const r = e.currentTarget.getBoundingClientRect(); env.ttx = clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1); env.tty = clamp((e.clientY - r.top) / r.height * 2 - 1, -1, 1); };

  return html`<${Fragment}>
    <style>${CSS}</style>
    ${/* the fixed night stage — z-0 (NOT negative: a negative z hides behind the light farm-theme body, and the
         rave is dark-committed). The opaque gradient is the first-paint/offline floor; GlStage paints the rave
         over it; the transparent dancers canvas sits over that; the DOM chrome (z-10) over all. */""}
    <div class="dk-bg fixed inset-0 z-0"></div>
    <${GlStage} shader=${new URL("afterdark.frag", import.meta.url)} seed=${((cast[0] || "a").charCodeAt(0) % 13) / 13}
      vary=${vary} ink=${ink} points=${() => env.pal} zClass="z-0" />
    ${/* the 3D dancers, over the rave field, under the DOM chrome */""}
    <canvas ref=${stageRef} data-dancers aria-hidden="true" class="fixed inset-0 z-0 w-full h-full pointer-events-none"></canvas>

    <div data-rave data-state=${state} data-cast=${cast.length} data-entered=${entered ? "yes" : "no"} data-3d=${stage3d} data-3d-why=${stage3dWhy}
      data-fs=${fs ? "yes" : "no"} data-bpm=${bpm || ""} data-buffer=${buffer}
      class="relative z-10 h-full min-h-0 flex flex-col gap-[var(--ms-gap)]">
      ${/* no top label (owner, 2026-09-11: «занадто технічний і зайвий») — the link's state, tempo and the
           downloaded runway live on [data-rave] as data-state / data-bpm / data-buffer for the eye and the tests */""}
      ${/* the void: where the dancers perform (in the canvas behind) — pointer parallax lives here */""}
      <div class="dk-void flex-1 min-h-0 relative" onPointerMove=${onPointer} ...${camHandlers}>
        ${/* the Enter cover sits in the UPPER third of the void, over the beams — never over the dancers, who
             stand mid-frame (the centred ring printed «УВІЙТИ» across the lead girl, measured 2026-09-11) */""}
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

      ${/* ONE island: the move filmstrip, the dancer filmstrip + the transport, together — and a fold key that
           collapses the whole thing SMOOTHLY into that one key (grid-rows + max-width transitions, see CSS) */""}
      <${Island} tone="dark" className="dk-isle dk-dock shrink-0 flex flex-col gap-[var(--ms-gap)] w-full mx-auto" data-dock=${dockOpen ? "open" : "folded"}>
        <div class="dk-fold"><div class="dk-fold-in flex flex-col gap-[var(--ms-gap)]">
        <div class="dk-strip flex items-center gap-2 overflow-x-auto -mx-1 px-1 py-0.5" role="group" aria-label=${T(t, "moves")} data-moves=${moves.length}>
          ${/* which dances the floor may play: ★ = the top picks (default), «Усі» = the whole library; a chip's
               dot is its intensity tier (violet light · green groove · magenta drive) */""}
          <button data-stars type="button" aria-pressed=${isStars ? "true" : "false"} aria-label=${T(t, "starMoves")} onClick=${pickStars}
            class=${`dk-chip shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-[background-color,box-shadow,transform,opacity] duration-200 ${isStars ? "dk-chip-on" : "dk-chip-off"}`}>
            <iconify-icon icon="lucide:star" class="text-[length:var(--ms-label)] dk-ink-2"></iconify-icon>
            <span class="font-mono uppercase text-[length:var(--ms-label)] tracking-wide dk-ink-2">${T(t, "starMoves")}</span>
          </button>
          <button data-all-moves type="button" aria-pressed=${moves.length >= MOVE_IDS.length ? "true" : "false"} aria-label=${T(t, "all")} onClick=${pickAllMoves}
            class=${`dk-chip shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-[background-color,box-shadow,transform,opacity] duration-200 ${moves.length >= MOVE_IDS.length ? "dk-chip-on" : "dk-chip-off"}`}>
            <iconify-icon icon="lucide:sparkles" class="text-[length:var(--ms-label)] dk-ink-2"></iconify-icon>
            <span class="font-mono uppercase text-[length:var(--ms-label)] tracking-wide dk-ink-2">${T(t, "all")}</span>
          </button>
          ${MOVES.map((m) => {
            const on = onMoves.has(m.id), tint = TIER_TINT[m.tier] || TIER_TINT.groove;
            return html`<button key=${m.id} data-move=${m.id} type="button" aria-pressed=${on ? "true" : "false"}
              aria-label=${m.name} onClick=${() => toggleMove(m.id)}
              class=${`dk-chip shrink-0 flex items-center gap-1.5 rounded-full pl-1.5 pr-3 py-1.5 transition-[background-color,box-shadow,transform,opacity] duration-200 ${on ? "dk-chip-on" : "dk-chip-off dk-chip-dim"}`}>
              <span class="w-2 h-2 rounded-full shrink-0" style=${`background:${tint};box-shadow:${on ? `0 0 6px ${tint}` : "none"}`}></span>
              <span class=${`font-mono text-[length:var(--ms-label)] tracking-wide whitespace-nowrap ${on ? "dk-ink" : "dk-ink-3"}`}>${m.name}</span>
            </button>`;
          })}
        </div>
        <div class="dk-strip flex items-center gap-2 overflow-x-auto -mx-1 px-1 py-0.5" role="group" aria-label=${T(t, "dancers")}>
          ${/* tap a girl to add/remove her from the stage; the last one can't be removed */""}
          <button data-all type="button" aria-pressed=${cast.length >= ALL_IDS.length ? "true" : "false"}
            aria-label=${T(t, "all")} onClick=${pickAll}
            class=${`dk-chip shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-[background-color,box-shadow,transform,opacity] duration-200 ${cast.length >= ALL_IDS.length ? "dk-chip-on" : "dk-chip-off"}`}>
            <iconify-icon icon="lucide:users" class="text-[length:var(--ms-label)] dk-ink-2"></iconify-icon>
            <span class="font-mono uppercase text-[length:var(--ms-label)] tracking-wide dk-ink-2">${T(t, "all")}</span>
          </button>
          ${GIRLS.map((g) => {
            const on = onStage.has(g.id);
            return html`<button key=${g.id} data-girl=${g.id} type="button" aria-pressed=${on ? "true" : "false"}
              aria-label=${`${g.name} — ${T(t, g.danceKey)}`} onClick=${() => toggleGirl(g.id)}
              class=${`dk-chip shrink-0 flex items-center gap-1.5 rounded-full pl-1.5 pr-3 py-1.5 transition-[background-color,box-shadow,transform,opacity] duration-200 ${on ? "dk-chip-on" : "dk-chip-off dk-chip-dim"}`}>
              <span class="w-3.5 h-3.5 rounded-full shrink-0" style=${`background:${g.tint};box-shadow:${on ? `0 0 7px ${g.tint}` : "none"}`}></span>
              <span class=${`font-mono text-[length:var(--ms-label)] tracking-wide ${on ? "dk-ink" : "dk-ink-3"}`}>${g.name}</span>
            </button>`;
          })}
        </div>
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
