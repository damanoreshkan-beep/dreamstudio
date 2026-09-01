// The show as state + a loop that OUTLIVE the view: the runtime mounts one tab at a time, and a race that
// cost a GPU minute must keep landing while the profile is open. Everything here is module-level;
// view.js subscribes and renders. The contract: apps/vydyvo/RESEARCH.md.
import { atom } from "nanostores";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { T } from "/_rt/i18n.js";
import { toEnglish } from "/_rt/translate.js";
import { holdBackground } from "/_rt/bghold.js";
import { collection, idbSupported } from "/_rt/db.js";
import { startJob, follow, cancelJob } from "/_rt/imagejob.js";
import { LINES, presetOf, composePrompt, mockFrame } from "./presets.js";

const OPTS_KEY = "ms:vydyvo:opts";
const BASE = `${VPS_PROXY}/image`;
const CAP = 24;      // frames kept (blobs in IndexedDB) — an hour of 2K at two per race is ~40 MB, so not unbounded
const AHEAD = 2;     // fresh frames kept ready before the next race starts
const K = 2;         // pictures per race — a steady trickle, half the races of mirage's 4 for the same spend per race
// how long to leave the GPU alone after each refusal; the collection carries the show meanwhile
const BACKOFF = { eRate: 120_000, eBusy: 300_000, eTimeout: 300_000, eFailed: 180_000, eNetwork: 60_000, eSignIn: 600_000 };
const DEFAULT = { preset: "still", prompt: "", every: 120, quality: "2k" };
export const EVERY = [30, 60, 120, 300];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const loadOpts = () => { try { const v = JSON.parse(localStorage.getItem(OPTS_KEY) || "null"); if (v && EVERY.includes(v.every)) return { ...DEFAULT, ...v }; } catch { /* */ } return DEFAULT; };
export const $opts = atom(loadOpts());
export const setOpts = (p) => { const v = { ...$opts.get(), ...p }; $opts.set(v); try { localStorage.setItem(OPTS_KEY, JSON.stringify(v)); } catch { /* */ } };

// frames: { id, url, preset, li, prompt, mode, w, h, ts, shown, shownAt } — oldest first
export const $frames = atom([]);
// the stage: two picture slots cross-fade; `cur`/`prev` are frame ids, `since` when `cur` went up
export const $stage = atom({ cur: null, prev: null, since: 0, slot: 0 });
// idle | working; `until` = the GPU is left alone until then; `error` = the last refusal's i18n key
export const $gen = atom({ phase: "idle", error: null, until: 0, live: null });
const patchGen = (p) => $gen.set({ ...$gen.get(), ...p });

const store = collection("vydyvo");
const revoke = (url) => { if (url?.startsWith?.("blob:")) { try { URL.revokeObjectURL(url); } catch { /* */ } } };
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const lineOf = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % LINES; };

export const unshown = () => $frames.get().filter((f) => !f.shown);
export const current = () => { const st = $stage.get(); return $frames.get().find((f) => f.id === st.cur) || null; };

function addFrame(f) {
  const id = newId(), frame = { id, li: lineOf(id), ts: Date.now(), shown: false, shownAt: 0, ...f };
  let list = [...$frames.get(), frame];
  // over the cap the oldest SHOWN frame goes (never the one on stage); a fresh frame is worth more than an old one
  const cur = $stage.get().cur;
  while (list.length > CAP) {
    const gone = list.filter((x) => x.shown && x.id !== cur).sort((a, b) => a.shownAt - b.shownAt)[0] || list.find((x) => x.id !== cur);
    if (!gone) break;
    list = list.filter((x) => x !== gone); revoke(gone.url); store.remove(gone.id).catch(() => {});
  }
  $frames.set(list);
  if (f.blob && idbSupported) store.put(id, { blob: f.blob, preset: f.preset, li: frame.li, prompt: f.prompt, mode: f.mode, w: f.w, h: f.h }).catch(() => {});
}

// the collection comes back on boot as ALREADY SHOWN: the loop cycles it at once and paints fresh ones ahead
async function restore() {
  if (gate || !idbSupported) return;
  let rows = []; try { rows = await store.all(); } catch { return; }
  const list = rows.slice(0, CAP).reverse().map((r) => ({ id: r.id, url: URL.createObjectURL(r.blob), preset: r.preset, li: r.li ?? 0, prompt: r.prompt || "", mode: r.mode || "dark", w: r.w, h: r.h, ts: r._ts, shown: true, shownAt: r._ts }));
  if (list.length) $frames.set([...list, ...$frames.get()]);
}

function present(id, now) {
  const st = $stage.get();
  $frames.set($frames.get().map((f) => (f.id === id ? { ...f, shown: true, shownAt: now } : f)));
  $stage.set({ cur: id, prev: st.cur, since: now, slot: 1 - st.slot });
}
// the next frame: the oldest fresh one; else the one shown longest ago (a collection cycles, never stops)
function advance(now) {
  const cur = $stage.get().cur, fresh = unshown()[0];
  const next = fresh || $frames.get().filter((f) => f.id !== cur).sort((a, b) => a.shownAt - b.shownAt)[0];
  if (next) present(next.id, now);
}
/** Skip to the next frame now (a tap on the picture). */
export function skip() { advance(Date.now()); }

let loopId = null, runs = 0, job = null, hold = null, ctxRef = null;
/** Start the show loop once; `ctx.t` is the dictionary for the hold's words. Idempotent. */
export function startLoop(ctx) {
  ctxRef = ctx;
  if (loopId) return;
  loopId = -1;
  restore().finally(() => { tick(); loopId = setInterval(tick, 1000); });
}
function tick() {
  const now = Date.now(), st = $stage.get(), o = $opts.get();
  if (!st.cur) { const first = unshown()[0] || $frames.get()[0]; if (first) present(first.id, now); }
  else if (now - st.since >= o.every * 1000) advance(now);
  const g = $gen.get();
  const online = gate || (typeof navigator === "undefined" || navigator.onLine !== false);
  if (g.phase !== "working" && now >= g.until && unshown().length < AHEAD && online) generate();
}

async function generate() {
  const run = ++runs, o = $opts.get(), preset = presetOf(o.preset);
  const mode = document.documentElement.getAttribute("data-theme") === "signal-light" ? "light" : "dark";
  const seed = Math.floor(Math.random() * 1e9);
  patchGen({ phase: "working", error: null, live: null });
  if (gate) {
    await sleep(90); if (run !== runs) return;
    for (let n = 0; n < K; n++) addFrame({ url: mockFrame(seed + n, preset.hue, mode), preset: preset.id, prompt: o.prompt, mode, w: 90, h: 160 });
    patchGen({ phase: "idle", until: Date.now() + 3000 });
    return;
  }
  let subject = o.prompt.trim();
  if (subject) { try { subject = await toEnglish(subject); } catch { /* the Spaces prefer English; the original still runs */ } }
  if (run !== runs) return;
  const prompt = composePrompt(subject, preset, mode);
  const ratio = Math.max(0.3, Math.min(3, (window.innerWidth || 1) / (window.innerHeight || 1)));
  try { job = await startJob(BASE, { prompt, quality: o.quality, aspect: "screen", ratio, seed, k: K }); }
  catch (e) { return fail(run, e.code || "eNetwork"); }
  if (run !== runs) { cancelJob(BASE, job); return; }
  hold = holdBackground({ title: T(ctxRef.t, "title"), body: T(ctxRef.t, "notifWorking") });
  let got = 0;
  const status = await follow({
    base: BASE, job, alive: () => run === runs,
    onLive: (live) => patchGen({ live }),
    onSlide: (s) => { got++; addFrame({ url: s.url, blob: s.blob, preset: preset.id, prompt: o.prompt, mode, w: s.w, h: s.h }); },
  });
  if (status === "stale") return;
  hold?.(); hold = null; job = null;
  if (got) patchGen({ phase: "idle", error: null, live: null, until: Date.now() + 5000 });
  else fail(run, status === "busy" ? "eBusy" : status === "timeout" ? "eTimeout" : "eFailed");
}
function fail(run, code) {
  if (run !== runs) return;
  hold?.(); hold = null; job = null;
  patchGen({ phase: "idle", error: code, live: null, until: Date.now() + (BACKOFF[code] || 120_000) });
}
