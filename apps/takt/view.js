import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { wakeLock } from "/_rt/sensors.js";
import { holdAudio } from "/_rt/mediasession.js";
import { gate } from "/_rt/gate.js";
import { Transport } from "/_rt/ui.js";
import { GlStage } from "/_rt/glstage.js";
import { retryDelay, progressCheck } from "/_rt/tide.js";
import { bassEnergy, stepPulse, idleGroove } from "/_rt/afterdark.js";
import { spectralFlux, stepBeat } from "/_rt/afterbeat.js";
import { createScore, stepScore } from "/_rt/takt.js";

const STREAM = "https://streams.rautemusik.fm/techno/mp3-192";
const AC = typeof AudioContext !== "undefined" ? AudioContext : (typeof globalThis !== "undefined" && globalThis.webkitAudioContext) || null;
const IDLE_BPM = 126, IDLE_AFTER = 4000;
const frac = (x) => x - Math.floor(x);

const $playing = atom(false);
const $state = atom("idle");
const $bpm = atom(0);
const $hidden = atom(false);

let el = null, ctx = null, src = null, analyser = null, freq = null, beatAn = null, fdb = null, mag = null, magPrev = null;
let np = null, wl = null, attempt = 0, retryTimer = null, stallTimer = null, connectTimer = null, liveTimer = null, mark = null, idleTimer = null;

const env = {
  last: 0, tick: 0, pulseState: { pulse: 0, baseline: 0 }, beatState: null, lead: 0.08,
  bpm: IDLE_BPM, beatPhase: 0, barPhase: 0, beatIndex: 0, confidence: 0,
  score: createScore(gate ? 0.42 : Math.random()), ink: [0, 0, 0, 0], points: new Float32Array(32),
};

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
  if (!np) np = holdAudio({ title: "Takt", artist: "RauteMusik · Techno", onPlay: () => { if (!$playing.get()) start(); }, onPause: () => stop(), resumeCtx: () => ctx?.resume() });
  np.setPlaying("Takt");
}

function play({ reconnect = false } = {}) {
  if (gate || typeof Audio === "undefined") { $playing.set(true); $state.set("live"); hold(); return; }
  if (!reconnect) attempt = 0;
  clearTimeout(retryTimer); clearTimeout(stallTimer); clearTimeout(connectTimer);
  const old = el;
  if (old) { try { old.pause(); old.removeAttribute("src"); old.load(); } catch { } }
  const a = document.createElement("audio");
  a.preload = "none";
  a.crossOrigin = "anonymous";
  el = a;
  $state.set(reconnect ? "reconnecting" : "connecting");
  let hadAudio = false;
  const armStall = () => { clearTimeout(stallTimer); stallTimer = setTimeout(() => { if (el === a && $state.get() !== "live") lost(a); }, 8000); };
  a.onplaying = () => { if (el !== a) return; attempt = 0; hadAudio = true; clearTimeout(connectTimer); clearTimeout(stallTimer); $state.set("live"); };
  a.onwaiting = a.onstalled = () => { if (el !== a) return; if (hadAudio) { $state.set("reconnecting"); armStall(); } };
  a.onended = () => { if (el === a) lost(a); };
  a.onerror = () => { if (el === a) lost(a); };
  connectTimer = setTimeout(() => { if (el === a && $state.get() !== "live") lost(a); }, 12000);
  attach(a);
  a.src = STREAM;
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
  el = null; try { a.pause(); a.removeAttribute("src"); a.load(); } catch { }
  clearTimeout(connectTimer); clearTimeout(stallTimer); clearTimeout(retryTimer);
  const wait = retryDelay(attempt); attempt += 1;
  retryTimer = setTimeout(() => { retryTimer = null; if ($playing.get()) play({ reconnect: true }); }, wait);
}
function probe() {
  if (gate || !$playing.get() || !el || $state.get() !== "live") return;
  const r = progressCheck({ time: el.currentTime, mark, now: performance.now(), budget: 8000 });
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
  $playing.set(false); $state.set("idle"); $bpm.set(0);
  clearTimeout(connectTimer); clearTimeout(retryTimer); clearTimeout(stallTimer);
  attempt = 0;
  if (el) { const o = el; el = null; try { o.pause(); o.removeAttribute("src"); o.load(); } catch { } }
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
  mark = null;
  if (wl) { wl.release(); wl = null; }
  if (np) { np.release(); np = null; }
  wake();
}
const start = () => { ctx?.resume?.(); play({}); };
const toggle = () => { $playing.get() ? stop() : start(); };

// The chrome hides only while it plays and the screen has been left alone; any touch wakes it.
function wake() {
  clearTimeout(idleTimer); idleTimer = null;
  if ($hidden.get()) $hidden.set(false);
  if ($playing.get() && !gate) idleTimer = setTimeout(() => { if ($playing.get()) $hidden.set(true); }, IDLE_AFTER);
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
    env.bpm = IDLE_BPM; env.confidence = 0; env.lead = 0;
    const beats = env.tick * IDLE_BPM / 60;
    env.beatPhase = frac(beats); env.beatIndex = Math.floor(beats); env.barPhase = frac(beats / 4);
  }
  const leadBeats = env.lead * env.bpm / 60;
  const beatA = frac(env.beatPhase + leadBeats), barA = frac(env.barPhase + leadBeats / 4);
  const shown = live && env.confidence > 0.35 ? Math.round(env.bpm) : 0;
  if (shown !== $bpm.get()) $bpm.set(shown);
  const out = stepScore(env.score, { beatIndex: env.beatIndex, beatPhase: beatA, bpm: env.bpm, energy, pulse, dt });
  env.ink = out.ink; env.points.set(out.points);
  return [pulse, beatA, barA, out.mix];
}
const ink = () => env.ink;
const points = () => env.points;
if (typeof globalThis !== "undefined") globalThis.__takt = env;

export function takt({ S }) {
  const loc = useStore(S.locale);
  const playing = useStore($playing);
  const state = useStore($state);
  const bpm = useStore($bpm);
  const hidden = useStore($hidden);

  useEffect(() => {
    if (gate) { start(); return () => {}; }
    const onAny = () => wake();
    addEventListener("pointerdown", onAny, { passive: true });
    addEventListener("pointermove", onAny, { passive: true });
    addEventListener("keydown", onAny);
    return () => { removeEventListener("pointerdown", onAny); removeEventListener("pointermove", onAny); removeEventListener("keydown", onAny); clearTimeout(idleTimer); };
  }, []);
  useEffect(() => {
    if (typeof document === "undefined") return () => {};
    if (hidden) document.documentElement.dataset.immersive = ""; else delete document.documentElement.dataset.immersive;
    return () => { delete document.documentElement.dataset.immersive; };
  }, [hidden]);
  useEffect(() => { wake(); }, [playing]);

  return html`<${Fragment}>
    <${GlStage} shader=${new URL("takt.frag", import.meta.url)} seed=${0.37} vary=${vary} ink=${ink} points=${points} zClass="z-0" />
    <div data-takt data-state=${state} data-bpm=${bpm || ""} data-immersive=${hidden ? "yes" : "no"}
      class="relative z-10 h-full min-h-0 flex items-center justify-center p-[var(--ms-pad)]">
      <${Transport} locale=${loc} playing=${playing} onToggle=${toggle} size="hero" stopIcon />
    </div>
  <//>`;
}
