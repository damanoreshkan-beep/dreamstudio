// Рух — the picture, the words, the model, the job and the player OUTLIVE the view: the runtime mounts one tab
// at a time, and a clip that cost a GPU admission must land while the profile is open. The state map and the
// measurements behind every number here: apps/rukh/RESEARCH.md.
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { collection, idbSupported } from "/_rt/db.js";
import { startJob, followOne, cancelJob } from "/_rt/imagejob.js";
import { shareFile, downloadBlob } from "/_rt/apk.js";
import { toDataURL, mockArt } from "/_rt/intake.js";

const BASE = `${VPS_PROXY}/video`;
export const WORDS_MAX = 500;   // the edge's PROMPT_MAX
const CAP = 24;                 // clips kept in IndexedDB — a 3 s LTX clip is ~650 KB, 24 of them ~16 MB
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MOCK_CLIP = new URL("./assets/mock.webm", import.meta.url).href;   // 1.5 s of drifting light, VP9 (the gate's Chromium has no H.264)

/** The first frame: a same-origin picture URL (blob:/data:) or null — text-only when null. */
export const $src = atom(null);
export const $words = persistentAtom("ms:rukh:words", "");
/** The model: "auto" (the edge's measured pool) or a catalogue id — the owner's choice, as in mirage. */
export const $model = persistentAtom("ms:rukh:model", "auto");
/** The catalogue from the edge: `{ list: [{ id, tier: "both"|"i2v", alive }], at, loading, error }`. */
export const $models = atom({ list: [], at: 0, loading: false, error: false });
/** The job: phase idle | working | done | error; `error` an i18n key; eta/pct/elapsed mirrored from the edge. */
export const $gen = atom({ phase: "idle", error: null, eta: null, pct: null, elapsed: 0 });
/** The clip on the stage: `{ id, url, blob, words, pic, by, ts, dur, res }` — `pic` is the first frame's URL or "". */
export const $clip = atom(null);
export const $clips = atom([]);
export const $player = atom({ playing: false, pos: 0, dur: 0, muted: true });

const clipStore = collection("rukh");
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const revoke = (u) => { if (u?.startsWith?.("blob:")) { try { URL.revokeObjectURL(u); } catch { /* */ } } };

// ---- the catalogue --------------------------------------------------------------------------------------------
// the gate never sees the edge: a three-row mock keeps the rail populated on the shot and in e2e
const GATE_MODELS = [{ id: "Lightricks/LTX-2-3", tier: "both", alive: true }, { id: "Upsampler/wan-2-2-5b-video", tier: "both", alive: true }, { id: "zerogpu-aoti/wan2-2-fp8da-aoti-faster", tier: "i2v", alive: null }];
/** Fetch the catalogue (once, or `fresh` re-probes liveness on the edge). */
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
/** The models the rail offers for the current mode: alive or unknown (never dead), and i2v rows only with a picture. */
export const modelsFor = (hasPic) => $models.get().list.filter((m) => m.alive !== false && (m.tier !== "i2v" || hasPic));
export const setModel = (id) => $model.set(id || "auto");
/** The catalogue id to send, or null for auto — a chosen model the mode cannot use falls back to auto. */
const modelToSend = (hasPic) => { const id = $model.get(); return id !== "auto" && modelsFor(hasPic).some((m) => m.id === id) ? id : null; };

// ---- the first frame ----------------------------------------------------------------------------------------
/** Take a picture as the first frame (a blob:/data: URL from the chooser, the camera, the last generation or a clip's own). */
export function setSrc(url) { const old = $src.get(); if (old && old !== url && !$clips.get().some((c) => c.pic === old)) revoke(old); $src.set(url || null); }
/** Drop the picture (the words stay); returns the restore function for the undo toast. */
export function removeSrc() { const old = $src.get(); if (!old) return () => {}; $src.set(null); return () => $src.set(old); }

// ---- the clip -----------------------------------------------------------------------------------------------
let runs = 0, job = null;
function land({ blob, url, by, words, pic, dur, res }) {
  const id = newId(), ts = Date.now(), clip = { id, url: url || URL.createObjectURL(blob), blob, words, pic: pic || "", by: by || "", ts, dur: dur || 0, res: res || "" };
  $clip.set(clip);
  let list = [clip, ...$clips.get()];
  while (list.length > CAP) { const gone = list.pop(); revoke(gone.url); clipStore.remove(gone.id).catch(() => {}); }
  $clips.set(list);
  if (idbSupported && !gate) clipStore.put(id, { blob, words, pic: !!clip.pic, by: clip.by, dur: clip.dur, res: clip.res }).catch(() => {});
  $gen.set({ phase: "done", error: null, eta: null, pct: null, elapsed: 0 });
  // the picture steps aside — the clip IS its motion; the first-frame chip on the clip brings it back for another take
  $src.set(null);
  load(clip.url, true);
}

/** Shoot it: the words (+ the first frame) → one job through the edge. Supersedes a running job. */
export async function generate() {
  const words = $words.get().trim(), src = $src.get();
  if (!words && !src) return;
  const run = ++runs;
  if (job) cancelJob(BASE, job); job = null;
  $gen.set({ phase: "working", error: null, eta: null, pct: null, elapsed: 0 });
  const model = modelToSend(!!src);
  if (gate) {
    await sleep(90); if (run !== runs) return;
    const blob = await (await fetch(MOCK_CLIP)).blob().catch(() => null);
    if (run !== runs) return;
    if (blob) land({ blob, by: model || "mock", words, pic: src, dur: 1.5, res: "192x256" });
    else $gen.set({ phase: "error", error: "eFailed", eta: null, pct: null, elapsed: 0 });
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
  } catch (e) { if (run === runs) $gen.set({ phase: "error", error: e?.code || "eFailed", eta: null, pct: null, elapsed: 0 }); return; }
  if (run !== runs) { cancelJob(BASE, id); return; }
  job = id;
  const r = await followOne({ base: BASE, job: id, alive: () => run === runs,
    onLive: (m) => { if (run === runs) $gen.set({ ...$gen.get(), eta: m.eta ?? null, pct: m.pct ?? null, elapsed: m.elapsed || 0 }); } });
  if (run !== runs) return;
  job = null;
  if (r.status === "done") land({ blob: r.blob, url: r.url, by: r.by, words, pic: src });
  else $gen.set({ phase: "error", error: r.status === "busy" ? "eBusy" : r.status === "timeout" ? "eTimeout" : "eFailed", eta: null, pct: null, elapsed: 0 });
}

// ---- the player (ONE <video> in the view, the Transport drives it) -------------------------------------------
// A clip that lands ~40 s after the tap has no user gesture left: Chrome allows the autoplay only MUTED. So a
// landed clip plays muted in a loop by itself, and the Transport's play button — a gesture — unmutes it.
let el = null, pendingUrl = null, pendingPlay = false;
/** The view hands over its <video> once mounted; a clip that landed before it is loaded then. */
export function attachVideo(v) {
  if (el === v) return;
  el = v;
  if (!el) return;
  const sync = () => $player.set({ playing: !el.paused && !el.ended, pos: el.currentTime || 0, dur: Number.isFinite(el.duration) ? el.duration : 0, muted: !!el.muted });
  for (const ev of ["play", "pause", "ended", "timeupdate", "durationchange", "loadedmetadata", "volumechange"]) el.addEventListener(ev, sync);
  if (pendingUrl) { const u = pendingUrl, p = pendingPlay; pendingUrl = null; load(u, p); }
}
function load(url, play = false) {
  if (!el) { pendingUrl = url; pendingPlay = play; return; }
  if (el.src !== url) { el.src = url; el.load?.(); }   // the gate's DOM (linkedom) has a <video> without load/play
  $player.set({ playing: false, pos: 0, dur: 0, muted: true });
  if (play && !gate) { el.muted = true; el.play?.()?.catch?.(() => {}); }
}
/** The Transport's play: a gesture — unmute, then play; pause pauses. */
export function toggle() {
  if (!el || !el.src) return;
  if (el.paused) { el.muted = false; el.play?.()?.catch?.(() => {}); } else el.pause?.();
}
/** Seek within the clip. */
export function seek(t) { if (el) el.currentTime = Math.max(0, Math.min(el.duration || 0, t)); }
/** Put a clip from the collection on the stage (and play it, muted — the transport unmutes). */
export function selectClip(id) {
  const c = $clips.get().find((x) => x.id === id); if (!c) return;
  $clip.set(c); $src.set(null); load(c.url, true);
}

// ---- share / save / the collection ------------------------------------------------------------------------
const nameOf = (c) => `rukh-${new Date(c.ts).toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${c.blob.type.includes("webm") ? "webm" : "mp4"}`;
/** Share the clip through the shell or the Web Share sheet; falls back to a download. */
export const share = (c) => shareFile(c.blob, nameOf(c));
export const save = (c) => downloadBlob(c.blob, nameOf(c));
/** Remove a clip; returns the restore function for the undo toast. */
export function removeClip(id) {
  const c = $clips.get().find((x) => x.id === id); if (!c) return () => {};
  $clips.set($clips.get().filter((x) => x.id !== id));
  if ($clip.get()?.id === id) $clip.set(null);
  clipStore.remove(id).catch(() => {});
  return () => { $clips.set([c, ...$clips.get()].sort((a, b) => b.ts - a.ts)); if (idbSupported && !gate) clipStore.put(c.id, { blob: c.blob, words: c.words, pic: !!c.pic, by: c.by, dur: c.dur, res: c.res }).catch(() => {}); };
}

let booted = false;
/** Restore the collection and the catalogue once. Under the gate a clip is already on the stage (data-live). */
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
