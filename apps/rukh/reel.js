import { atom } from "nanostores";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { startJob, followOne, cancelJob } from "/_rt/imagejob.js";
import { toEnglish } from "/_rt/translate.js";
import { report } from "/_rt/telemetry.js";

const BASE = `${VPS_PROXY}/video`;
const SCENARIO = `${VPS_PROXY}/scenario`;
/** The chunk (owner, 2026-09-08: no more than two seconds). The edge clamps to the same number and writes
 *  it into the Space's own Duration control where the row has one; see `CHUNK_MAX_SEC` in edge/video.js. */
export const CHUNK_SEC = 2;
/** The lengths the owner can pick, in seconds. */
export const LENGTHS = [15, 30, 60];
const MIN_CLIP_BYTES = 4096;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** `{ phase: idle|writing|filming|done|error, error, at, of }` — `at` is the chunk being filmed, 1-based. */
export const $reelJob = atom({ phase: "idle", error: null, at: 0, of: 0 });
/** The storyboard: `[{ i, beat, status: waiting|filming|done|error, url, blob, thumb, dur }]`. */
export const $reel = atom([]);
/** The chosen total length in seconds. */
export const $length = atom(30);

const setJob = (p) => $reelJob.set({ ...$reelJob.get(), ...p });
const setChunk = (i, p) => $reel.set($reel.get().map((c) => (c.i === i ? { ...c, ...p } : c)));

/**
 * The final visible frame of a clip, as a data: URL — the next chunk's first frame.
 * Returns "" when the browser will not decode the clip, so a broken chunk breaks the CHAIN, not the reel:
 * the caller then films the next beat from words alone rather than from a black square.
 */
export async function lastFrame(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    const meta = await new Promise((ok) => { v.onloadedmetadata = () => ok(true); v.onerror = () => ok(false); setTimeout(() => ok(false), 8000); });
    if (!meta || !v.videoWidth) return "";
    v.currentTime = Math.max(0, (v.duration || 0) - 0.06);
    const seeked = await new Promise((ok) => { v.onseeked = () => ok(true); v.onerror = () => ok(false); setTimeout(() => ok(false), 8000); });
    if (!seeked) return "";
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.92);
  } catch { return ""; }
  finally { URL.revokeObjectURL(url); }
}

/**
 * ONE prompt → N beats, one per chunk, from the edge's text cascade. A failure is not fatal: the reel falls
 * back to the prompt itself for every beat, which films the same idea N times — worse, but still a reel.
 */
export async function beatsFor(prompt, durationSec, locale = "en") {
  const n = Math.max(1, Math.ceil(durationSec / CHUNK_SEC));
  if (gate) return Array.from({ length: n }, (_, i) => `${prompt} — ${i + 1}`);
  try {
    const r = await fetch(SCENARIO, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, durationSec, locale }) });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    const beats = Array.isArray(j?.beats) ? j.beats.filter((b) => typeof b === "string" && b.trim()) : [];
    if (!beats.length) throw new Error("no beats");
    return Array.from({ length: n }, (_, i) => beats[i] || prompt);
  } catch (e) {
    report("reel.scenario.fail", { reason: String(e?.message || e).slice(0, 40) });
    return Array.from({ length: n }, () => prompt);
  }
}

let runs = 0, live = null;

/** Stop the reel where it stands; the chunks already filmed stay on the storyboard. */
export function stopReel() {
  runs++;
  if (live) { cancelJob(BASE, live); live = null; }
  setJob({ phase: $reel.get().some((c) => c.status === "done") ? "done" : "idle", at: 0 });
}

/**
 * Film the whole reel: scenario first, then one chunk per beat, each starting from the previous chunk's last
 * frame. A newer tap supersedes an older reel (the `run` guard), exactly as a single shot does in state.js.
 */
export async function runReel({ prompt, firstFrame = "", locale = "en" }) {
  const words = String(prompt || "").trim();
  if (!words) return;
  const run = ++runs;
  const seconds = $length.get();

  setJob({ phase: "writing", error: null, at: 0, of: 0 });
  $reel.set([]);
  const beats = await beatsFor(words, seconds, locale);
  if (run !== runs) return;

  $reel.set(beats.map((beat, n) => ({ i: n + 1, beat, status: "waiting", url: "", blob: null, thumb: "", dur: 0 })));
  setJob({ phase: "filming", at: 1, of: beats.length });

  let carry = firstFrame;
  for (const [n, beat] of beats.entries()) {
    if (run !== runs) return;
    const i = n + 1;
    setJob({ at: i });
    setChunk(i, { status: "filming" });

    if (gate) {
      await sleep(60);
      if (run !== runs) return;
      const blob = await (await fetch(new URL("./assets/mock.webm", import.meta.url).href)).blob().catch(() => null);
      if (!blob) { setChunk(i, { status: "error" }); continue; }
      setChunk(i, { status: "done", blob, url: URL.createObjectURL(blob), dur: 1.5, thumb: "" });
      continue;
    }

    try {
      let beatEn;
      try { beatEn = await toEnglish(beat); } catch { setChunk(i, { status: "error" }); carry = ""; continue; }
      if (run !== runs) return;
      const body = { prompt: beatEn, seconds: CHUNK_SEC, ...(carry ? { image: carry } : {}) };
      const id = await startJob(BASE, body);
      if (run !== runs) { cancelJob(BASE, id); return; }
      live = id;
      const r = await followOne({ base: BASE, job: id, alive: () => run === runs });
      live = null;
      if (run !== runs) return;
      if (r.status !== "done" || !r.blob || !r.blob.type.startsWith("video/") || r.blob.size < MIN_CLIP_BYTES) {
        setChunk(i, { status: "error" });
        carry = "";
        continue;
      }
      const url = r.url || URL.createObjectURL(r.blob);
      const thumb = await lastFrame(r.blob);
      if (run !== runs) return;
      setChunk(i, { status: "done", blob: r.blob, url, dur: r.dur || 0, thumb });
      carry = thumb;
    } catch (e) {
      if (run !== runs) return;
      live = null;
      setChunk(i, { status: "error" });
      carry = "";
    }
  }

  if (run !== runs) return;
  const made = $reel.get().filter((c) => c.status === "done").length;
  setJob({ phase: made ? "done" : "error", error: made ? null : "eFailed", at: 0 });
  report("reel.done", { of: beats.length, made, seconds });
}
