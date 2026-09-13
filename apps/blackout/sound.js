// blackout — the SOUND: a library of effects generated once through /feed/sfx (docs/research/sfx-tools, AudioGen /
// Stable Audio 3 on the pods) and shipped as assets, played through one Web Audio graph; afterdark's techno stream
// under it all, with the beat clock (rt/afterbeat.js) reading the kick so the street's lamps pulse in time. Nothing
// here plays before the Run tap (autoplay policy: the context is resumed from that gesture). Under the gate there
// is no audio at all — the mock owns the run and the HUD still tells the truth.
import { createEngine } from "/_rt/audio.js";
import { spectralFlux, createBeatState, stepBeat } from "/_rt/afterbeat.js";
import { bassEnergy, stepPulse, idleGroove } from "/_rt/afterdark.js";

// the library: name → file + how it plays. `loop` beds run for the whole run; a `rate` spread keeps a repeated hit
// from sounding like a sample; `gain` is the mix (the master sits at 0.85)
export const SFX = {
  run: { loop: true, gain: 0.55 },
  jump: { gain: 0.7, spread: 0.06 }, land: { gain: 0.6, spread: 0.08 }, slide: { gain: 0.7 }, lane: { gain: 0.35, spread: 0.12 },
  coin: { gain: 0.5, spread: 0.1 }, stumble: { gain: 0.9 },
  "hit-wood": { gain: 0.9 }, "hit-metal": { gain: 0.9 }, "hit-car": { gain: 0.9 },
  "zombie-growl-1": { gain: 0.6, spread: 0.1 }, "zombie-growl-2": { gain: 0.6, spread: 0.1 }, "zombie-scream": { gain: 0.8 },
  horde: { loop: true, gain: 0.0 }, "horde-run": { loop: true, gain: 0.0 },
  bite: { gain: 0.9 }, fall: { gain: 0.9 }, heartbeat: { loop: true, gain: 0.0 },
  wind: { loop: true, gain: 0.35 }, "lamp-hum": { loop: true, gain: 0.12 }, "lamp-pop": { gain: 0.5 }, siren: { gain: 0.35 }, crow: { gain: 0.4 },
  "whoosh-start": { gain: 0.8 }, over: { gain: 0.9 },
  // the armoury and the street's second night (2026-09-13, late): shots, the reload, what a round does to a walker
  "shot-pistol": { gain: 0.85, spread: 0.05 }, "shot-shotgun": { gain: 0.95, spread: 0.04 }, "shot-smg": { gain: 0.7, spread: 0.06 },
  reload: { gain: 0.6 }, "zombie-hit": { gain: 0.7, spread: 0.1 }, "zombie-die": { gain: 0.8, spread: 0.08 },
  can: { gain: 0.8 }, boost: { loop: true, gain: 0.0 }, bats: { gain: 0.5 },
};
const url = (name) => new URL(`assets/sfx-${name}.mp3`, import.meta.url).href;
const STREAM = "https://streams.rautemusik.fm/techno/mp3-192";   // afterdark's station, the direct Icecast feed (CORS-open: the analyser hears it)
const IDLE_BPM = 126;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const frac = (x) => x - Math.floor(x);

/** The game's sound engine, or null where Web Audio does not exist (the gate). `muted()` reads the setting. */
export function createSound({ muted }) {
  const eng = createEngine({ master: 0.85, noise: false });
  if (!eng) return null;
  const { ctx, master } = eng;
  const buffers = new Map(), loops = new Map();
  let loaded = false, loading = null;
  const musicGain = ctx.createGain(); musicGain.gain.value = 0.7; musicGain.connect(master);
  const sfxGain = ctx.createGain(); sfxGain.connect(master);

  async function load() {
    if (loading) return loading;
    loading = Promise.all(Object.keys(SFX).map(async (name) => {
      try { const ab = await (await fetch(url(name))).arrayBuffer(); buffers.set(name, await ctx.decodeAudioData(ab)); }
      catch { /* a missing effect is silence, never a broken run */ }
    })).then(() => { loaded = true; });
    return loading;
  }
  // one-shot: a fresh source each time, a little pitch spread so a repeat never sounds copied
  function play(name, { gain = 1, rate = 1 } = {}) {
    const buf = buffers.get(name), spec = SFX[name]; if (!buf || !spec || muted()) return;
    const s = ctx.createBufferSource(); s.buffer = buf;
    s.playbackRate.value = rate * (1 + (spec.spread ? (Math.random() - 0.5) * 2 * spec.spread : 0));
    const g = ctx.createGain(); g.gain.value = spec.gain * gain;
    s.connect(g); g.connect(sfxGain); s.start();
  }
  // a bed: started once, its gain and rate driven every frame (the run's footsteps follow her speed; the horde grows with `near`)
  function bed(name) {
    if (loops.has(name)) return loops.get(name);
    const buf = buffers.get(name), spec = SFX[name]; if (!buf || !spec) return null;
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    const g = ctx.createGain(); g.gain.value = 0;
    s.connect(g); g.connect(sfxGain); s.start();
    const h = { s, g, target: spec.gain };
    loops.set(name, h);
    return h;
  }
  const bedTo = (name, gain, rate = 1, k = 0.15) => { const h = bed(name); if (!h) return; const want = muted() ? 0 : gain; h.g.gain.value += (want - h.g.gain.value) * k; if (Math.abs(h.s.playbackRate.value - rate) > 0.005) h.s.playbackRate.value = rate; };
  function stopBeds() { for (const h of loops.values()) { try { h.s.stop(); } catch { /* ended */ } } loops.clear(); }

  // ── the music: afterdark's stream into the same context; two analysers — one smoothed for the pulse, one raw for the beat clock ──
  let el = null, src = null, an = null, beatAn = null, freq = null, fdb = null, mag = null, magPrev = null, live = false;
  const beat = { state: createBeatState(), pulseState: null, bpm: IDLE_BPM, phase: 0, confidence: 0, pulse: 0, energy: 0, tick: 0, last: 0 };
  function music(on) {
    if (!on) { if (el) { try { el.pause(); el.removeAttribute("src"); el.load(); } catch { /* */ } } el = null; live = false; return; }
    if (el) { el.play().catch(() => {}); return; }
    const a = document.createElement("audio");
    a.crossOrigin = "anonymous"; a.preload = "none"; a.volume = 1;
    a.onplaying = () => { if (el === a) live = true; };
    a.onerror = a.onended = a.onstalled = () => { if (el === a) live = false; };
    el = a;
    try {
      src = ctx.createMediaElementSource(a);
      if (!an) { an = ctx.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0.4; freq = new Uint8Array(an.frequencyBinCount); }
      if (!beatAn) { beatAn = ctx.createAnalyser(); beatAn.fftSize = 1024; beatAn.smoothingTimeConstant = 0; fdb = new Float32Array(beatAn.frequencyBinCount); mag = new Float32Array(beatAn.frequencyBinCount); magPrev = new Float32Array(beatAn.frequencyBinCount); }
      src.connect(an); src.connect(beatAn); src.connect(musicGain);
    } catch { /* a second source on the same element throws — the element is fresh, so this is the gate's stub */ }
    a.src = STREAM;
    a.play().catch(() => { live = false; });
  }
  // every frame: the beat clock from the raw analyser (afterdark's loop), the idle groove when there is no audio
  function tick(nowMs) {
    const dt = beat.last ? Math.min(0.1, (nowMs - beat.last) / 1000) : 0; beat.last = nowMs;
    musicGain.gain.value += ((muted() ? 0 : 0.7) - musicGain.gain.value) * 0.1;
    if (live && an) {
      an.getByteFrequencyData(freq);
      beat.energy = bassEnergy(freq);
      beat.pulseState = stepPulse(beat.pulseState, beat.energy);
      beat.pulse = beat.pulseState.pulse;
      beatAn.getFloatFrequencyData(fdb);
      for (let i = 0; i < fdb.length; i++) { const v = (fdb[i] + 100) / 70; mag[i] = v > 0 ? (v < 1 ? v : 1) : 0; }
      const b = stepBeat(beat.state, spectralFlux(mag, magPrev), nowMs / 1000);
      const t = mag; mag = magPrev; magPrev = t;
      beat.state = b.state; beat.bpm = b.bpm; beat.confidence = b.confidence;
      const lead = (ctx.outputLatency || 0) + (ctx.baseLatency || 0) + 1 / 60;
      beat.phase = frac(b.beatPhase + lead * b.bpm / 60);
    } else {
      beat.tick += dt; beat.pulse = idleGroove(beat.tick); beat.energy = beat.pulse;
      beat.bpm = IDLE_BPM; beat.confidence = 0; beat.phase = frac(beat.tick * IDLE_BPM / 60);
    }
    return beat;
  }

  return {
    load, play, bedTo, stopBeds, music, tick, beat,
    get ready() { return loaded; },
    get live() { return live; },
    resume: () => ctx.resume(),
    dispose() { stopBeds(); music(false); try { ctx.close(); } catch { /* */ } },
  };
}
