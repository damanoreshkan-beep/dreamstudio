// Відлуння — the take, the words, the job and the player OUTLIVE the view: the runtime mounts one tab at a
// time, and a clone that cost a GPU admission must land while the profile is open. The contract and the
// measurements behind every number here: apps/vidlunnia/RESEARCH.md.
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { mic } from "/_rt/sensors.js";
import { AC } from "/_rt/audio.js";
import { collection, idbSupported } from "/_rt/db.js";
import { startJob, followOne, cancelJob } from "/_rt/imagejob.js";
import { shareFile, downloadBlob } from "/_rt/apk.js";
import { conditionSample, encodeWav } from "/_rt/grain.js";
import { referenceWav, wavDataUrl, mockVoice, envelope, REF_RATE } from "/_rt/wav.js";

const BASE = `${VPS_PROXY}/voice`;
export const TAKE_MAX = 10;     // seconds — OmniVoice clones from 5–20 s; ten keeps the body under 1 MB
const TAKE_MIN = 1.2;           // shorter than this is a tap, not a voice
export const BARS = 48;
const CAP = 40;                 // echoes kept in IndexedDB
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The manner is OmniVoice's own vocabulary (the edge refuses anything else): the Space's Voice Design items
// that make sense OVER a cloned voice. `key` is the i18n label.
export const MANNERS = [
  { id: "asis", key: "mAsIs", instruct: "" },
  { id: "whisper", key: "mWhisper", instruct: "Whisper" },
  { id: "low", key: "mLow", instruct: "Low Pitch" },
  { id: "high", key: "mHigh", instruct: "High Pitch" },
  { id: "child", key: "mChild", instruct: "Child" },
  { id: "elderly", key: "mElderly", instruct: "Elderly" },
];
export const mannerOf = (id) => MANNERS.find((m) => m.id === id) || MANNERS[0];

/** The reference take: `{ pcm, sr, dur, quiet, clipped, bars, url, seeded }` or null. */
export const $take = atom(null);
/** The recorder: state idle | recording | decoding; `bars` the live level ring; `err` the last mic reason. */
export const $rec = atom({ state: "idle", bars: [], since: 0, err: null });
export const $words = persistentAtom("ms:vidlunnia:words", "");
export const $manner = persistentAtom("ms:vidlunnia:manner", "asis");
export const $primed = persistentAtom("ms:vidlunnia:primed", "");
/** The job: phase idle | working | done | error; `error` an i18n key; eta/pct/elapsed mirrored from the edge. */
export const $gen = atom({ phase: "idle", error: null, eta: null, pct: null, elapsed: 0 });
/** The echo on the transport: `{ id, url, blob, words, manner, by, ts }` or null. */
export const $echo = atom(null);
export const $echoes = atom([]);
export const $player = atom({ playing: false, pos: 0, dur: 0 });

const takeStore = collection("vidlunnia-take");
const echoStore = collection("vidlunnia");
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const revoke = (u) => { if (u?.startsWith?.("blob:")) { try { URL.revokeObjectURL(u); } catch { /* */ } } };
const wavBlob = (pcm, sr) => new Blob([encodeWav([pcm], sr)], { type: "audio/wav" });

// ---- the take ----------------------------------------------------------------------------------------------
function setTake(t, persist = true) {
  revoke($take.get()?.url);
  const take = { ...t, bars: Array.from(envelope(t.pcm, BARS)), url: URL.createObjectURL(wavBlob(t.pcm, t.sr)) };
  $take.set(take);
  if (persist && idbSupported && !gate) takeStore.put("take", { pcm: t.pcm, sr: t.sr, dur: t.dur, quiet: t.quiet, clipped: t.clipped }).catch(() => {});
}
// The gate has no microphone: a voice-shaped synthetic take stands in, marked `seeded` so the view says data-live
function seedTake() { const pcm = mockVoice(2.4, REF_RATE, 7); setTake({ pcm, sr: REF_RATE, dur: 2.4, quiet: false, clipped: false, seeded: true }, false); }

let rec = null, meter = null;
function startMeter(stream) {
  if (!AC) return null;
  const ctx = new AC(), src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
  an.fftSize = 1024; src.connect(an);
  const buf = new Uint8Array(an.fftSize), bars = [];
  const id = setInterval(() => {
    an.getByteTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v; }
    bars.push(Math.min(1, Math.sqrt(s / buf.length) * 3.2)); if (bars.length > BARS) bars.shift();
    $rec.set({ ...$rec.get(), bars: [...bars] });
  }, 50);
  return () => { clearInterval(id); try { src.disconnect(); ctx.close(); } catch { /* */ } };
}
const stopMeter = () => { meter?.(); meter = null; };

/** Start a take (the tap on the mic). Under the gate a synthetic voice lands at once. */
export function startRecord() {
  if (gate) { seedTake(); return; }
  if (rec) return;
  if (!mic.supported) { $rec.set({ ...$rec.get(), state: "idle", err: "unsupported" }); return; }
  $rec.set({ state: "recording", bars: [], since: Date.now(), err: null });
  rec = mic.record({
    seconds: TAKE_MAX, timeoutMs: 15000,
    onStream: (s) => { meter = startMeter(s); },
    onErr: (k) => { stopMeter(); $rec.set({ ...$rec.get(), state: "idle", err: k }); },
  });
  rec.done.then(async (r) => {
    stopMeter(); rec = null;
    if (!r) { if ($rec.get().state === "recording") $rec.set({ ...$rec.get(), state: "idle" }); return; }
    await adopt(r.blob);
  });
}
/** Stop the take early (the tap on the square); the audio so far is kept. */
export function stopRecord() { rec?.stop(); }

async function adopt(blob) {
  $rec.set({ ...$rec.get(), state: "decoding" });
  try {
    const ctx = new AC();
    const dec = await ctx.decodeAudioData(await blob.arrayBuffer());
    const chans = []; for (let c = 0; c < dec.numberOfChannels; c++) chans.push(dec.getChannelData(c));
    try { ctx.close(); } catch { /* */ }
    const c = conditionSample(chans, dec.sampleRate);
    if (c.dur < TAKE_MIN) { $rec.set({ state: "idle", bars: [], since: 0, err: "short" }); return; }
    setTake({ pcm: c.pcm, sr: c.sr, dur: c.dur, quiet: c.quiet, clipped: c.clipped });
    $rec.set({ state: "idle", bars: [], since: 0, err: null });
  } catch { $rec.set({ state: "idle", bars: [], since: 0, err: "error" }); }
}

// ---- the echo ----------------------------------------------------------------------------------------------
let runs = 0, job = null;
function land({ blob, url, by, words, manner }) {
  const id = newId(), ts = Date.now(), echo = { id, url: url || URL.createObjectURL(blob), blob, words, manner, by: by || "", ts };
  $echo.set(echo);
  let list = [echo, ...$echoes.get()];
  while (list.length > CAP) { const gone = list.pop(); revoke(gone.url); echoStore.remove(gone.id).catch(() => {}); }
  $echoes.set(list);
  if (idbSupported && !gate) echoStore.put(id, { blob, words, manner, by: echo.by }).catch(() => {});
  $gen.set({ phase: "done", error: null, eta: null, pct: null, elapsed: 0 });
  load(echo.url);
}
const hashOf = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

/** Say it: the take + the words + the manner → one clone through the edge. Supersedes a running job. */
export async function generate() {
  const take = $take.get(), words = $words.get().trim(), manner = mannerOf($manner.get());
  if (!take || !words) return;
  const run = ++runs;
  if (job) cancelJob(BASE, job); job = null;
  $gen.set({ phase: "working", error: null, eta: null, pct: null, elapsed: 0 });
  if (gate) {
    await sleep(90); if (run !== runs) return;
    land({ blob: wavBlob(mockVoice(1.6, REF_RATE, hashOf(words + manner.id)), REF_RATE), words, manner: manner.id, by: "mock" });
    return;
  }
  let id;
  try { id = await startJob(BASE, { text: words, audio: wavDataUrl(referenceWav(take.pcm, take.sr)), instruct: manner.instruct, seed: 0 }); }
  catch (e) { if (run === runs) $gen.set({ phase: "error", error: e?.code || "eFailed", eta: null, pct: null, elapsed: 0 }); return; }
  if (run !== runs) { cancelJob(BASE, id); return; }
  job = id;
  const r = await followOne({ base: BASE, job: id, alive: () => run === runs,
    onLive: (m) => { if (run === runs) $gen.set({ ...$gen.get(), eta: m.eta ?? null, pct: m.pct ?? null, elapsed: m.elapsed || 0 }); } });
  if (run !== runs) return;
  job = null;
  if (r.status === "done") land({ blob: r.blob, url: r.url, by: r.by, words, manner: manner.id });
  else $gen.set({ phase: "error", error: r.status === "busy" ? "eBusy" : r.status === "timeout" ? "eTimeout" : "eFailed", eta: null, pct: null, elapsed: 0 });
}

// ---- the player (one <audio>, the Transport drives it) ---------------------------------------------------
let el = null;
function audio() {
  if (el || typeof Audio === "undefined") return el;
  el = new Audio(); el.preload = "auto";
  const sync = () => $player.set({ playing: !el.paused && !el.ended, pos: el.currentTime || 0, dur: Number.isFinite(el.duration) ? el.duration : 0 });
  for (const ev of ["play", "pause", "ended", "timeupdate", "durationchange", "loadedmetadata"]) el.addEventListener(ev, sync);
  return el;
}
function load(url) { const a = audio(); if (!a) return; a.src = url; a.load(); $player.set({ playing: false, pos: 0, dur: 0 }); }
/** Play / pause the echo on the transport. */
export function toggle() { const a = audio(); if (!a || !a.src) return; if (a.paused) a.play().catch(() => {}); else a.pause(); }
/** Seek within the echo. */
export function seek(t) { const a = audio(); if (a) a.currentTime = Math.max(0, Math.min(a.duration || 0, t)); }
/** Put an echo from the collection on the transport (and play it). */
export function selectEcho(id) {
  const e = $echoes.get().find((x) => x.id === id); if (!e) return;
  $echo.set(e); load(e.url); toggle();
}
/** Play the reference take once (a preview, not a transport). */
export function playTake() { const t = $take.get(), a = audio(); if (!t || !a) return; if (a.src !== t.url) { a.src = t.url; a.load(); } a.currentTime = 0; a.play().catch(() => {}); }

// ---- share / save / the collection --------------------------------------------------------------------------
const nameOf = (e) => `vidlunnia-${new Date(e.ts).toISOString().slice(0, 16).replace(/[:T]/g, "-")}.wav`;
/** Share the echo through the shell or the Web Share sheet; falls back to a download. */
export const share = (e) => shareFile(e.blob, nameOf(e));
export const save = (e) => downloadBlob(e.blob, nameOf(e));
/** Remove an echo; returns the restore function for the undo toast. */
export function removeEcho(id) {
  const e = $echoes.get().find((x) => x.id === id); if (!e) return () => {};
  $echoes.set($echoes.get().filter((x) => x.id !== id));
  if ($echo.get()?.id === id) $echo.set(null);
  echoStore.remove(id).catch(() => {});
  return () => { $echoes.set([e, ...$echoes.get()].sort((a, b) => b.ts - a.ts)); if (idbSupported && !gate) echoStore.put(e.id, { blob: e.blob, words: e.words, manner: e.manner, by: e.by }).catch(() => {}); };
}

let booted = false;
/** Restore the take and the collection once. */
export async function boot() {
  if (booted) return; booted = true;
  if (gate) { seedTake(); return; }
  if (!idbSupported) return;
  try {
    const t = await takeStore.get("take");
    if (t?.pcm?.length) setTake({ pcm: t.pcm, sr: t.sr, dur: t.dur, quiet: !!t.quiet, clipped: !!t.clipped }, false);
  } catch { /* no take yet */ }
  try {
    const rows = await echoStore.all();
    $echoes.set(rows.slice(0, CAP).map((r) => ({ id: r.id, url: URL.createObjectURL(r.blob), blob: r.blob, words: r.words, manner: r.manner, by: r.by || "", ts: r._ts })));
  } catch { /* empty */ }
}
