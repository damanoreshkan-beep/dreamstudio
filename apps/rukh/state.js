// Рух — the picture, the words, the job and the player OUTLIVE the view: the runtime mounts one tab at a time,
// and a clip that cost a GPU admission must land while the profile is open. The contract and the measurements
// behind every number here: apps/rukh/RESEARCH.md.
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
/** The job: phase idle | working | done | error; `error` an i18n key; eta/pct/elapsed mirrored from the edge. */
export const $gen = atom({ phase: "idle", error: null, eta: null, pct: null, elapsed: 0 });
/** The clip on the stage: `{ id, url, blob, words, pic, by, ts, dur, res }` or null. */
export const $clip = atom(null);
export const $clips = atom([]);
export const $player = atom({ playing: false, pos: 0, dur: 0 });

const clipStore = collection("rukh");
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const revoke = (u) => { if (u?.startsWith?.("blob:")) { try { URL.revokeObjectURL(u); } catch { /* */ } } };

// ---- the first frame ----------------------------------------------------------------------------------------
/** Take a picture as the first frame (a blob:/data: URL from the chooser, the camera or the last generation). */
export function setSrc(url) { const old = $src.get(); if (old && old !== url) revoke(old); $src.set(url || null); }
/** Drop the picture (the words stay); returns the restore function for the undo toast. */
export function removeSrc() { const old = $src.get(); if (!old) return () => {}; $src.set(null); return () => $src.set(old); }

// ---- the clip -----------------------------------------------------------------------------------------------
let runs = 0, job = null;
function land({ blob, url, by, words, pic, dur, res }) {
  const id = newId(), ts = Date.now(), clip = { id, url: url || URL.createObjectURL(blob), blob, words, pic: !!pic, by: by || "", ts, dur: dur || 0, res: res || "" };
  $clip.set(clip);
  let list = [clip, ...$clips.get()];
  while (list.length > CAP) { const gone = list.pop(); revoke(gone.url); clipStore.remove(gone.id).catch(() => {}); }
  $clips.set(list);
  if (idbSupported && !gate) clipStore.put(id, { blob, words, pic: clip.pic, by: clip.by, dur: clip.dur, res: clip.res }).catch(() => {});
  $gen.set({ phase: "done", error: null, eta: null, pct: null, elapsed: 0 });
  load(clip.url, true);
}

/** Shoot it: the words (+ the first frame) → one job through the edge. Supersedes a running job. */
export async function generate() {
  const words = $words.get().trim(), src = $src.get();
  if (!words && !src) return;
  const run = ++runs;
  if (job) cancelJob(BASE, job); job = null;
  $gen.set({ phase: "working", error: null, eta: null, pct: null, elapsed: 0 });
  if (gate) {
    await sleep(90); if (run !== runs) return;
    const blob = await (await fetch(MOCK_CLIP)).blob().catch(() => null);
    if (run !== runs) return;
    if (blob) land({ blob, by: "mock", words, pic: !!src, dur: 1.5, res: "192x256" });
    else $gen.set({ phase: "error", error: "eFailed", eta: null, pct: null, elapsed: 0 });
    return;
  }
  let id;
  try {
    const body = { prompt: words };
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
  if (r.status === "done") land({ blob: r.blob, url: r.url, by: r.by, words, pic: !!src });
  else $gen.set({ phase: "error", error: r.status === "busy" ? "eBusy" : r.status === "timeout" ? "eTimeout" : "eFailed", eta: null, pct: null, elapsed: 0 });
}

// ---- the player (ONE <video> in the view, the Transport drives it) -------------------------------------------
let el = null, pendingUrl = null, pendingPlay = false;
/** The view hands over its <video> once mounted; a clip that landed before it is loaded then. */
export function attachVideo(v) {
  if (el === v) return;
  el = v;
  if (!el) return;
  const sync = () => $player.set({ playing: !el.paused && !el.ended, pos: el.currentTime || 0, dur: Number.isFinite(el.duration) ? el.duration : 0 });
  for (const ev of ["play", "pause", "ended", "timeupdate", "durationchange", "loadedmetadata"]) el.addEventListener(ev, sync);
  if (pendingUrl) { const u = pendingUrl, p = pendingPlay; pendingUrl = null; load(u, p); }
}
function load(url, play = false) {
  if (!el) { pendingUrl = url; pendingPlay = play; return; }
  if (el.src !== url) { el.src = url; el.load?.(); }   // the gate's DOM (linkedom) has a <video> without load/play
  $player.set({ playing: false, pos: 0, dur: 0 });
  if (play && !gate) el.play?.().catch(() => {});
}
/** Play / pause the clip on the transport. */
export function toggle() { if (!el || !el.src) return; if (el.paused) el.play?.().catch(() => {}); else el.pause?.(); }
/** Seek within the clip. */
export function seek(t) { if (el) el.currentTime = Math.max(0, Math.min(el.duration || 0, t)); }
/** Put a clip from the collection on the stage (and play it). */
export function selectClip(id) {
  const c = $clips.get().find((x) => x.id === id); if (!c) return;
  $clip.set(c); load(c.url, true);
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
  return () => { $clips.set([c, ...$clips.get()].sort((a, b) => b.ts - a.ts)); if (idbSupported && !gate) clipStore.put(c.id, { blob: c.blob, words: c.words, pic: c.pic, by: c.by, dur: c.dur, res: c.res }).catch(() => {}); };
}

let booted = false;
/** Restore the collection once. Under the gate a clip is already on the stage (data-live) — no network, no GPU. */
export async function boot() {
  if (booted) return; booted = true;
  if (gate) {
    $words.set("Паперовий кораблик пливе дощовим струмком, мʼяке світло");
    const blob = await (await fetch(MOCK_CLIP)).blob().catch(() => null);
    if (blob) land({ blob, by: "mock", words: $words.get(), pic: false, dur: 1.5, res: "192x256" });
    return;
  }
  if (!idbSupported) return;
  try {
    const rows = await clipStore.all();
    $clips.set(rows.slice(0, CAP).map((r) => ({ id: r.id, url: URL.createObjectURL(r.blob), blob: r.blob, words: r.words || "", pic: !!r.pic, by: r.by || "", ts: r._ts, dur: r.dur || 0, res: r.res || "" })));
  } catch { /* empty */ }
}
export { mockArt };
