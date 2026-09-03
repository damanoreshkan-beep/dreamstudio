// Рух — the state behind the screen, written from the state map in RESEARCH.md (third cut, 2026-09-03).
// Everything the view shows is one of these atoms; every transition is a named function below; the <video>
// element is the ONE piece of DOM the state owns (the view hands it over once). Numbers and their measurements:
// apps/rukh/RESEARCH.md.
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { collection, idbSupported } from "/_rt/db.js";
import { startJob, followOne, cancelJob } from "/_rt/imagejob.js";
import { shareFile, downloadBlob } from "/_rt/apk.js";
import { toDataURL, mockArt } from "/_rt/intake.js";

const BASE = `${VPS_PROXY}/video`;
export const WORDS_MAX = 500;        // the edge's PROMPT_MAX
const CAP = 24;                      // clips kept in IndexedDB — a 3 s LTX clip is ~650 KB, 24 of them ~16 MB
const MIN_CLIP_BYTES = 4096;         // anything smaller is an error page, not a clip
const DECODE_MS = 8000;              // how long a landed clip gets to report metadata before it is called unplayable
const MOCK_CLIP = new URL("./assets/mock.webm", import.meta.url).href;   // 1.5 s of drifting light, VP9 (the gate's Chromium has no H.264)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the atoms ────────────────────────────────────────────────────────────────────────────────────────────────
/** The first frame: a same-origin picture URL (blob:/data:), or null — the words alone film. */
export const $src = atom(null);
export const $words = persistentAtom("ms:rukh:words", "");
/** "auto" (the edge's measured pool) or a catalogue id — the owner's choice, as in mirage. */
export const $model = persistentAtom("ms:rukh:model", "auto");
/** The catalogue: `{ list: [{ id, tier: "both"|"i2v", alive }], at, loading, error }`. */
export const $models = atom({ list: [], at: 0, loading: false, error: false });
/** The job: phase idle | working | done | error; `error` an i18n key; eta/pct/elapsed mirrored from the edge. */
export const $job = atom({ phase: "idle", error: null, eta: null, pct: null, elapsed: 0 });
/** The clip on the stage: `{ id, url, blob, words, pic, by, ts, dur, res }` — `pic` the first frame's URL or "". */
export const $clip = atom(null);
export const $clips = atom([]);
/** The player: what the <video> reports, plus `unplayable` when the browser refused the bytes. */
export const $player = atom({ playing: false, pos: 0, dur: 0, muted: true, unplayable: false });

const clipStore = collection("rukh");
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const setJob = (patch) => $job.set({ ...$job.get(), ...patch });

// ── object URLs: one owner ───────────────────────────────────────────────────────────────────────────────────
// A blob: URL lives until revoked; a picture URL may be owned by the chooser (until replaced) AND by a clip
// (its first frame) — it is revoked only when nobody holds it.
const held = (url) => $src.get() === url || $clips.get().some((c) => c.url === url || c.pic === url) || $clip.get()?.url === url;
const revoke = (url) => { if (url?.startsWith?.("blob:") && !held(url)) { try { URL.revokeObjectURL(url); } catch { /* */ } } };

// ── the catalogue ────────────────────────────────────────────────────────────────────────────────────────────
const GATE_MODELS = [{ id: "Lightricks/LTX-2-3", tier: "both", alive: true }, { id: "Upsampler/wan-2-2-5b-video", tier: "both", alive: true }, { id: "zerogpu-aoti/wan2-2-fp8da-aoti-faster", tier: "i2v", alive: null }];
/** Fetch the catalogue (public on the edge; `fresh` re-probes liveness). Under the gate a three-row mock. */
export async function loadModels(fresh = false) {
  const cur = $models.get();
  if (gate) { if (!cur.at) $models.set({ list: GATE_MODELS, at: Date.now(), loading: false, error: false }); return; }
  if (!fresh && cur.at && Date.now() - cur.at < 300_000) return;
  $models.set({ ...cur, loading: true, error: false });
  try {
    const r = await fetch(`${BASE}/models${fresh ? "?fresh=1" : ""}`);
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    $models.set({ list: Array.isArray(j?.models) ? j.models : [], at: Date.now(), loading: false, error: false });
  } catch { $models.set({ ...$models.get(), loading: false, error: true }); }
}
/** The rail for a mode: alive or unknown (never dead), the i2v rows only with a picture. */
export const modelsFor = (hasPic) => $models.get().list.filter((m) => m.alive !== false && (m.tier !== "i2v" || hasPic));
export const setModel = (id) => $model.set(id || "auto");
const modelToSend = (hasPic) => { const id = $model.get(); return id !== "auto" && modelsFor(hasPic).some((m) => m.id === id) ? id : null; };

// ── the first frame ──────────────────────────────────────────────────────────────────────────────────────────
/** A picture becomes the first frame (from the chooser, the camera, the last generation, or a clip's own). */
export function setSrc(url) { const old = $src.get(); $src.set(url || null); if (old && old !== url) revoke(old); }
/** Drop the picture (the words stay); returns the restore for the undo toast. */
export function removeSrc() { const old = $src.get(); if (!old) return () => {}; $src.set(null); return () => $src.set(old); }

// ── the player: ONE <video>, owned here, driven by the Transport ─────────────────────────────────────────────
// A clip lands ~40 s after the tap, when no user gesture is left: Chrome allows the autoplay only MUTED. So a
// landed clip plays muted in a loop by itself and the Transport's play — a gesture — unmutes it.
let el = null, detach = null, pending = null, decodeTimer = 0;
/** The view hands over its <video> once mounted (and null on unmount); a clip that landed earlier loads then. */
export function attachVideo(v) {
  if (el === v) return;
  detach?.(); detach = null; el = v;
  if (!el) return;
  const sync = () => $player.set({ ...$player.get(), playing: !el.paused && !el.ended, pos: el.currentTime || 0, dur: Number.isFinite(el.duration) ? el.duration : 0, muted: !!el.muted });
  const ok = () => { clearTimeout(decodeTimer); $player.set({ ...$player.get(), unplayable: false }); sync(); };
  const bad = () => { clearTimeout(decodeTimer); $player.set({ ...$player.get(), unplayable: true, playing: false }); };
  const evs = [["play", sync], ["pause", sync], ["ended", sync], ["timeupdate", sync], ["durationchange", sync], ["volumechange", sync], ["loadedmetadata", ok], ["error", bad]];
  for (const [e, f] of evs) el.addEventListener(e, f);
  detach = () => { for (const [e, f] of evs) el?.removeEventListener(e, f); };
  if (pending) { const p = pending; pending = null; load(p.url, p.play); }
}
function load(url, play) {
  if (!el) { pending = { url, play }; return; }
  clearTimeout(decodeTimer);
  $player.set({ playing: false, pos: 0, dur: 0, muted: true, unplayable: false });
  if (el.src !== url) { el.src = url; el.load?.(); }   // the gate's DOM (linkedom) has a <video> without load/play
  if (gate) return;
  // no metadata within DECODE_MS = the browser will not decode these bytes; say so, keep share/save
  decodeTimer = setTimeout(() => { if (el && el.src === url && !(el.readyState >= 1)) $player.set({ ...$player.get(), unplayable: true }); }, DECODE_MS);
  if (play) { el.muted = true; el.play?.()?.catch?.(() => {}); }
}
/** The Transport's play — a gesture: unmute, then play; pause pauses. */
export function toggle() {
  if (!el || !el.src) return;
  if (el.paused) { el.muted = false; el.play?.()?.catch?.(() => {}); } else el.pause?.();
}
/** Seek within the clip. */
export function seek(t) { if (el) el.currentTime = Math.max(0, Math.min(el.duration || 0, t)); }

// ── the clip ─────────────────────────────────────────────────────────────────────────────────────────────────
let runs = 0, job = null;
function land({ blob, url, by, words, pic, dur, res }) {
  const id = newId(), ts = Date.now();
  const clip = { id, url: url || URL.createObjectURL(blob), blob, words, pic: pic || "", by: by || "", ts, dur: dur || 0, res: res || "" };
  let list = [clip, ...$clips.get()];
  while (list.length > CAP) { const gone = list.pop(); clipStore.remove(gone.id).catch(() => {}); revoke(gone.url); }
  $clips.set(list);
  $clip.set(clip);
  if (idbSupported && !gate) clipStore.put(id, { blob, words, pic: !!clip.pic, by: clip.by, dur: clip.dur, res: clip.res }).catch(() => {});
  setJob({ phase: "done", error: null, eta: null, pct: null, elapsed: 0 });
  $src.set(null);            // the picture steps aside — the clip IS its motion; the first-frame chip brings it back
  load(clip.url, true);
}
const fail = (run, code) => { if (run === runs) setJob({ phase: "error", error: code, eta: null, pct: null, elapsed: 0 }); };

/** Shoot: the words (+ the first frame) → one job through the edge; a newer tap supersedes an older job. */
export async function generate() {
  const words = $words.get().trim(), src = $src.get();
  if (!words && !src) return;
  const run = ++runs;
  if (job) cancelJob(BASE, job); job = null;
  setJob({ phase: "working", error: null, eta: null, pct: null, elapsed: 0 });
  const model = modelToSend(!!src);
  if (gate) {
    await sleep(90); if (run !== runs) return;
    const blob = await (await fetch(MOCK_CLIP)).blob().catch(() => null);
    if (run !== runs) return;
    if (blob) land({ blob, by: model || "mock", words, pic: src, dur: 1.5, res: "192x256" }); else fail(run, "eFailed");
    return;
  }
  let id;
  try {
    const body = { prompt: words, ...(model ? { model } : {}) };
    if (src) {
      let sent; try { sent = await toDataURL(src); } catch { throw { code: "eFailed" }; }
      if (run !== runs) return;
      body.image = sent.data;
    }
    id = await startJob(BASE, body);
  } catch (e) { fail(run, e?.code || "eFailed"); return; }
  if (run !== runs) { cancelJob(BASE, id); return; }
  job = id;
  // the Space that is filming rides the pending JSON as `phase`; the sealed tunnel does not carry the x-video-by
  // header back (the live drive showed by=""), so the last phase seen names the clip's maker
  let by = "";
  const r = await followOne({ base: BASE, job: id, alive: () => run === runs,
    onLive: (m) => { if (run === runs) { if (m.phase) by = m.phase; setJob({ eta: m.eta ?? null, pct: m.pct ?? null, elapsed: m.elapsed || 0 }); } } });
  if (run !== runs) return;
  job = null;
  if (r.status !== "done") { fail(run, r.status === "busy" ? "eBusy" : r.status === "timeout" ? "eTimeout" : "eFailed"); return; }
  // the bytes must be a clip: the edge answers video/* with x-video-*; anything else is not a result
  if (!r.blob || !r.blob.type.startsWith("video/") || r.blob.size < MIN_CLIP_BYTES) { fail(run, "eFailed"); return; }
  land({ blob: r.blob, url: r.url, by: r.by || by, words, pic: src });
}

/** A clip from the collection goes on the stage (muted autoplay; the transport unmutes). */
export function selectClip(id) {
  const c = $clips.get().find((x) => x.id === id); if (!c) return;
  $clip.set(c); setSrc(null); load(c.url, true);
}

// ── share · save · the collection ────────────────────────────────────────────────────────────────────────────
const nameOf = (c) => `rukh-${new Date(c.ts).toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${c.blob.type.includes("webm") ? "webm" : "mp4"}`;
/** Share through the shell or the Web Share sheet; falls back to a download. */
export const share = (c) => shareFile(c.blob, nameOf(c));
export const save = (c) => downloadBlob(c.blob, nameOf(c));
/** Remove a clip; returns the restore for the undo toast. */
export function removeClip(id) {
  const c = $clips.get().find((x) => x.id === id); if (!c) return () => {};
  $clips.set($clips.get().filter((x) => x.id !== id));
  if ($clip.get()?.id === id) $clip.set(null);
  clipStore.remove(id).catch(() => {});
  return () => { $clips.set([c, ...$clips.get()].sort((a, b) => b.ts - a.ts)); if (idbSupported && !gate) clipStore.put(c.id, { blob: c.blob, words: c.words, pic: !!c.pic, by: c.by, dur: c.dur, res: c.res }).catch(() => {}); };
}

let booted = false;
/** Once: the catalogue, the collection. Under the gate a clip is already on the stage (data-live). */
export async function boot() {
  if (booted) return; booted = true;
  loadModels();
  if (gate) {
    $words.set("Паперовий кораблик пливе дощовим струмком, мʼяке світло");
    const blob = await (await fetch(MOCK_CLIP)).blob().catch(() => null);
    if (blob) land({ blob, by: "Lightricks/LTX-2-3", words: $words.get(), pic: "", dur: 1.5, res: "192x256" });
    return;
  }
  if (!idbSupported) return;
  try {
    const rows = await clipStore.all();
    $clips.set(rows.slice(0, CAP).map((r) => ({ id: r.id, url: URL.createObjectURL(r.blob), blob: r.blob, words: r.words || "", pic: "", by: r.by || "", ts: r._ts, dur: r.dur || 0, res: r.res || "" })));
  } catch { /* empty */ }
}
export { mockArt };
