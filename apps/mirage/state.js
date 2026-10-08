import { atom } from "nanostores";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { T } from "/_rt/i18n.js";
import { toEnglish } from "/_rt/translate.js";
import { writeLastGen } from "/_rt/lastgen.js";
import { notify, notifyAsk } from "/_rt/notify.js";
import { holdBackground } from "/_rt/bghold.js";
import { mockArt, toDataURL, sizeOf, extOf } from "/_rt/intake.js";
import { cancelJob } from "/_rt/imagejob.js";
import { startTask, followSlides, taskOne, taskCall, taskKey, jobCode } from "/_rt/task.js";
import { report } from "/_rt/telemetry.js";
import { styleOf } from "./styles.js";

export const MODES = ["make", "edit", "read", "blend", "style"];
export const TWO_SLOT = ["blend", "style"];
export const GATE_PROMPT = "northern lights over a frozen lake, cinematic, ultra detailed";
export const GATE_TEXT = "Гірське озеро на світанку: дзеркальна вода віддзеркалює рожеві піки, над берегом стелиться легкий туман. Тиша, прохолода і золоте світло перших променів.\n\nгори, озеро, світанок, туман, тиша";
const K = 4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randSeed = () => Math.floor(Math.random() * 1e9);
const JOB_KEY = (mode) => `ms:mirage:job:${mode}`;
const OPTS_KEY = "ms:mirage:opts";
const BASE = { make: `${VPS_PROXY}/image`, edit: `${VPS_PROXY}/image/edit`, blend: `${VPS_PROXY}/image/blend`, style: `${VPS_PROXY}/image/style` };
const ROUTE = { make: "/feed/image", edit: "/feed/image/edit", blend: "/feed/image/blend", style: "/feed/image/style" };   // the job routes /feed/task starts

export const $mode = atom("make");
export const $make = atom({ prompt: gate ? GATE_PROMPT : "", phase: gate ? "done" : "idle",
  slides: gate ? [7, 8, 9, 10].map((s) => ({ url: mockArt(s), seed: s })) : [], idx: 0, more: false, error: null, live: null, t0: 0 });
export const $edit = atom({ prompt: "", phase: gate ? "ready" : "empty", src: gate ? mockArt(3) : null, original: gate ? mockArt(3) : null,
  slides: [], idx: 0, more: false, error: null, live: null, t0: 0 });
export const $blend = atom({ prompt: "", phase: "ready", a: gate ? mockArt(11) : null, b: gate ? mockArt(12) : null, cam: null,
  slides: [], idx: 0, more: false, error: null, live: null, t0: 0 });
export const $style = atom({ prompt: "", phase: "ready", a: gate ? mockArt(15) : null, b: gate ? mockArt(16) : null, cam: null,
  slides: [], idx: 0, more: false, error: null, live: null, t0: 0 });
export const $read = atom({ question: "", phase: gate ? "ready" : "empty", src: gate ? mockArt(5) : null, text: "", error: null });
const DEFAULT_OPTS = { quality: "2k", aspect: "screen", style: "none", model: { make: "auto", edit: "auto", read: "auto", blend: "auto", style: "auto" } };
const loadOpts = () => { try { const v = JSON.parse(localStorage.getItem(OPTS_KEY) || "null"); if (v?.quality && v?.aspect) return { ...DEFAULT_OPTS, ...v, model: { ...DEFAULT_OPTS.model, ...(v.model || {}) } }; } catch { } return DEFAULT_OPTS; };
export const $opts = atom(loadOpts());
export const setOpts = (p) => { const v = { ...$opts.get(), ...p }; $opts.set(v); try { localStorage.setItem(OPTS_KEY, JSON.stringify(v)); } catch { } };
export const setModel = (mode, id) => setOpts({ model: { ...$opts.get().model, [mode]: id || "auto" } });
const modelFor = (mode) => { const m = $opts.get().model[mode]; if (!m || m === "auto") return null; const cat = $models.get(); return cat.at && !cat.error && !modelsFor(mode).some((x) => x.id === m) ? null : m; };

const KIND = { make: "gen", edit: "edit", read: "read", blend: "blend", style: "style" };
const GATE_MODELS = { gen: [{ id: "black-forest-labs/FLUX.1-schnell", tier: "2k", alive: true }, { id: "mrfakename/Z-Image-Turbo", tier: "fast", alive: true }, { id: "krea/Krea-2", tier: "fast", alive: null }],
  edit: [{ id: "LPX55/Qwen-Image-Edit-2511-Turbo-Lightning", tier: "edit", alive: true }, { id: "JitRoy2024/Qwen_Img_Space", tier: "edit", alive: true }], read: [{ id: "ovh/Qwen2.5-VL-72B", tier: "vision", alive: null }, { id: "prithivMLmods/Qwen3-VL-Outpost", tier: "space", alive: true }],
  blend: [{ id: "linoyts/Qwen-Image-Edit-2511-Fast", tier: "blend", alive: true }, { id: "OmniGen2/OmniGen2", tier: "blend", alive: null }],
  style: [{ id: "bytedance-research/USO", tier: "style", alive: true }, { id: "multimodalart/flux-style-shaping", tier: "style", alive: true }] };
export const $models = atom({ gen: [], edit: [], read: [], blend: [], style: [], at: 0, loading: false, error: false });
export async function loadModels(fresh = false) {
  const cur = $models.get();
  if (gate) { if (!cur.at) $models.set({ ...GATE_MODELS, at: Date.now(), loading: false, error: false }); return; }
  if (cur.loading || (!fresh && cur.at && Date.now() - cur.at < 5 * 60_000)) return;
  $models.set({ ...cur, loading: true, error: false });
  try {
    const r = await fetch(VPS_PROXY + "/image/models" + (fresh ? "?fresh=1" : ""));
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    $models.set({ gen: j.gen || [], edit: j.edit || [], read: j.read || [], blend: j.blend || [], style: j.style || [], at: Date.now(), loading: false, error: false });
  } catch { $models.set({ ...$models.get(), loading: false, error: true }); }
}
export const modelsFor = (mode) => ($models.get()[KIND[mode]] || []).filter((m) => m.alive !== false);

const ATOM = { make: $make, edit: $edit, read: $read, blend: $blend, style: $style };
export const patch = (mode, p) => { const a = ATOM[mode]; a.set({ ...a.get(), ...(typeof p === "function" ? p(a.get()) : p) }); };

const runs = { make: 0, edit: 0, read: 0, blend: 0, style: 0 }, jobs = { make: null, edit: null, blend: null, style: null }, holds = { make: null, edit: null, blend: null, style: null };

const revoke = (url) => { if (url?.startsWith?.("blob:")) { try { URL.revokeObjectURL(url); } catch { } } };
const freeSlides = (list, keep = []) => list.forEach((s) => { if (!keep.includes(s.url)) revoke(s.url); });
const held = () => [$edit.get().src, $edit.get().original, $read.get().src, $blend.get().a, $blend.get().b, $style.get().a, $style.get().b];
const stillHeld = (url) => [...held(), ...$make.get().slides.map((s) => s.url), ...$edit.get().slides.map((s) => s.url), ...$blend.get().slides.map((s) => s.url), ...$style.get().slides.map((s) => s.url)].includes(url);

// Every race is a TASK on the edge (rt/task.js, the weak-link transport): progress as events, each picture by byte
// range the moment it lands. The task id rides next to the job in localStorage, so a reload replays the stream.
async function race(mode, body, run, ctx, seed) {
  const alive = () => run === runs[mode];
  let rep;
  try { rep = await startTask("/task", { route: ROUTE[mode], body, k: taskKey() }); } catch (e) { return fail(mode, run, e.code || jobCode(e)); }
  if (!alive()) { cancelJob(BASE[mode], rep.job); return; }
  jobs[mode] = rep.job;
  const t0 = Date.now();
  try { localStorage.setItem(JOB_KEY(mode), JSON.stringify({ job: rep.job, task: rep.id, prompt: body.prompt, seed, ts: t0, quality: body.quality })); } catch { }
  patch(mode, { t0 });
  await followJob(mode, rep.id, run, ctx, seed);
}

async function followJob(mode, task, run, ctx, seed) {
  const alive = () => run === runs[mode];
  const release = holdBackground({ title: T(ctx.t, "title"), body: T(ctx.t, mode === "edit" ? "reworking" : mode === "blend" ? "blending" : mode === "style" ? "styling" : "working") });
  holds[mode] = release;
  const mine = [];
  const status = await followSlides(task, {
    onLive: (live) => { if (alive()) patch(mode, { live }); },
    onSlide: (s) => {
      if (!alive()) return;
      mine.push({ url: s.url, w: s.w, h: s.h, by: s.by, n: s.n, ext: extOf(s.blob), seed: seed + s.n });
      patch(mode, { slides: [...mine], more: true, ...(mine.length === 1 ? { idx: 0, phase: "done" } : {}) });
      if (mine.length === 1) {
        if (mode === "make") writeLastGen(s.url, $make.get().prompt).catch(() => {});
        if (document.visibilityState === "hidden") notify({ id: `mirage-${mode}`, title: T(ctx.t, "title"), body: T(ctx.t, "notifDone"), url: "./" });
      }
    },
  }).catch(() => "error");   // the task forgotten (core restarted): the race is lost, say so
  if (!alive()) return;
  release(); holds[mode] = null; jobs[mode] = null;
  try { localStorage.removeItem(JOB_KEY(mode)); } catch { }
  patch(mode, { more: false, live: null });
  if (!mine.length) fail(mode, run, status === "busy" ? "eBusy" : "eFailed");
}

function fail(mode, run, code) {
  if (run !== runs[mode]) return;
  holds[mode]?.(); holds[mode] = null; jobs[mode] = null;
  patch(mode, { error: code, phase: "error", more: false, live: null });
  report(`${mode}.fail`, { reason: code, model: modelFor(mode) || "auto" });
}

export async function conjure(ctx) {
  const st = $make.get(), p = st.prompt.trim();
  if (!p || st.phase === "working") return;
  const seed = randSeed(), run = ++runs.make;
  holds.make?.(); holds.make = null;
  freeSlides(st.slides, held());
  patch("make", { slides: [], idx: 0, more: false, error: null, live: null, phase: "working", t0: Date.now() });
  if (gate) { await sleep(90); if (run === runs.make) patch("make", { slides: [seed, seed + 1, seed + 2, seed + 3].map((s) => ({ url: mockArt(s), seed: s })), phase: "done" }); return; }
  notifyAsk();
  patch("make", { live: { stage: "translate" } });
  let pEn; try { pEn = await toEnglish(p); } catch (e) { return fail("make", run, e.code || "eTranslate"); }
  if (run !== runs.make) return;
  const sb = styleOf($opts.get().style)?.block;
  if (sb) pEn = `${pEn}, ${sb}`;
  const { quality, aspect } = $opts.get();
  const ratio = Math.max(0.3, Math.min(3, (window.innerWidth || 1) / (window.innerHeight || 1)));
  await race("make", { prompt: pEn, quality, aspect, ratio, seed, k: K, model: modelFor("make") }, run, ctx, seed);
}

export async function rework(ctx) {
  const st = $edit.get(), p = st.prompt.trim();
  if (!p || !st.src || st.phase === "working") return;
  const seed = randSeed(), run = ++runs.edit;
  holds.edit?.(); holds.edit = null;
  freeSlides(st.slides, held());
  patch("edit", { slides: [], idx: 0, more: false, error: null, live: null, phase: "working", t0: Date.now() });
  if (gate) { await sleep(120); if (run === runs.edit) patch("edit", { slides: [0, 1, 2, 3].map((n) => ({ url: mockArt(seed + n), seed: seed + n })), phase: "done" }); return; }
  notifyAsk();
  let image;
  try { image = (await toDataURL(st.src)).data; } catch { return fail("edit", run, "eFailed"); }
  if (run !== runs.edit) return;
  if (image.length > 9_000_000) return fail("edit", run, "eBig");
  patch("edit", { live: { stage: "translate" } });
  let pEn; try { pEn = await toEnglish(p); } catch (e) { return fail("edit", run, e.code || "eTranslate"); }
  if (run !== runs.edit) return;
  await race("edit", { image, prompt: pEn, seed, k: K, model: modelFor("edit") }, run, ctx, seed);
}

export function keepEditing() {
  const st = $edit.get(), cur = st.slides[st.idx] || st.slides[0];
  if (!cur) return;
  freeSlides(st.slides, [cur.url, st.original]);
  patch("edit", { src: cur.url, slides: [], idx: 0, more: false, prompt: "", error: null, phase: "ready" });
}

async function fuse(mode, ctx) {
  const st = ATOM[mode].get(), p = st.prompt.trim();
  if (!p || !st.a || !st.b || st.phase === "working") return;
  const seed = randSeed(), run = ++runs[mode];
  holds[mode]?.(); holds[mode] = null;
  freeSlides(st.slides, held());
  patch(mode, { slides: [], idx: 0, more: false, error: null, live: null, phase: "working", t0: Date.now() });
  if (gate) { await sleep(120); if (run === runs[mode]) patch(mode, { slides: [0, 1, 2, 3].map((n) => ({ url: mockArt(seed + n), seed: seed + n })), phase: "done" }); return; }
  notifyAsk();
  let images;
  try { images = (await Promise.all([toDataURL(st.a), toDataURL(st.b)])).map((x) => x.data); } catch { return fail(mode, run, "eFailed"); }
  if (run !== runs[mode]) return;
  if (images.some((i) => i.length > 9_000_000)) return fail(mode, run, "eBig");
  patch(mode, { live: { stage: "translate" } });
  let pEn; try { pEn = await toEnglish(p); } catch (e) { return fail(mode, run, e.code || "eTranslate"); }
  if (run !== runs[mode]) return;
  await race(mode, { images, prompt: pEn, seed, k: K, model: modelFor(mode) }, run, ctx, seed);
}
export const blend = (ctx) => fuse("blend", ctx);
export const stylize = (ctx) => fuse("style", ctx);

export function setSlot(mode, slot, url) {
  const st = ATOM[mode].get(), old = st[slot];
  freeSlides(st.slides, [url, ...held()]);
  patch(mode, { [slot]: url, slides: [], idx: 0, more: false, error: null, phase: "ready", cam: null });
  if (old && old !== url && !stillHeld(old)) revoke(old);
}
export function clearSlot(mode, slot) {
  runs[mode]++;
  const st = ATOM[mode].get(), old = st[slot];
  freeSlides(st.slides, held());
  patch(mode, { [slot]: null, slides: [], idx: 0, more: false, error: null, phase: "ready", cam: null });
  if (old && !stillHeld(old)) revoke(old);
}

const ASK = {
  uk: { read: "Опиши це зображення українською: 2–3 речення про те, що на ньому і який настрій, потім окремим рядком до 5 ключових тегів через кому.", q: "Відповідай українською, коротко і по суті, спираючись лише на це зображення. Питання: " },
  en: { read: "Describe this image in English: 2–3 sentences on what is in it and its mood, then, on a separate line, up to 5 key tags separated by commas.", q: "Answer in English, briefly and to the point, from this image alone. Question: " },
};
export async function readPhoto(ctx) {
  const st = $read.get();
  if (!st.src || st.phase === "working") return;
  const run = ++runs.read, q = st.question.trim();
  patch("read", { error: null, text: "", phase: "working" });
  if (gate) { await sleep(120); if (run === runs.read) patch("read", { text: q ? GATE_TEXT.split("\n")[0] : GATE_TEXT, phase: "done" }); return true; }
  let image;
  try { image = (await toDataURL(st.src)).data; } catch { return fail("read", run, "eRead"); }
  if (run !== runs.read) return;
  if (image.length > 9_000_000) return fail("read", run, "eBig");
  const ask = ASK[ctx.loc] || ASK.en;
  // a TASK on the edge (rt/task.js): the vision cascade answers into the task's stream, so a dead zone mid-answer
  // costs a pause, not the answer
  let j;
  try { j = await taskCall("/task", { route: "/feed/vision", body: { image, prompt: q ? ask.q + q : ask.read, maxTokens: 400, model: modelFor("read") } }); }
  catch (e) { const s = e?.status; if (run === runs.read) fail("read", run, s === 429 ? "eRate" : s === 413 ? "eBig" : s === 502 ? "eReadBusy" : s ? "eRead" : "eNetwork"); return; }
  if (run !== runs.read) return;
  const out = String(j?.text || "").trim();
  if (!out) return fail("read", run, "eRead");
  patch("read", { text: out, phase: "done" });
  return true;
}

const UPSCALE = `${VPS_PROXY}/image/upscale`;
/** `{ mode, url, phase: idle|working|done|error, live, error }` — one enhance at a time, for the picture in view. */
export const $enhance = atom({ mode: "", url: "", phase: "idle", live: null, error: null });
let enhanceRun = 0, enhanceJob = null;
export async function enhance(mode) {
  const st = ATOM[mode]?.get(); const cur = st?.slides?.[st.idx] || st?.slides?.[0];
  if (!cur || cur.hd || $enhance.get().phase === "working") return;
  const r = ++enhanceRun;
  if (enhanceJob) cancelJob(UPSCALE, enhanceJob); enhanceJob = null;
  $enhance.set({ mode, url: cur.url, phase: "working", live: null, error: null });
  const fail = (code) => { if (r === enhanceRun) { $enhance.set({ mode, url: cur.url, phase: "error", live: null, error: code }); report("enhance.fail", { reason: code, mode }); } };
  const land = (out) => {
    if (r !== enhanceRun) return;
    const now = ATOM[mode].get();
    patch(mode, { slides: now.slides.map((s) => (s.url === cur.url ? { ...s, url: out.url, w: out.w, h: out.h, ext: out.ext, by: out.by, hd: true, orig: s.url } : s)) });
    $enhance.set({ mode, url: out.url, phase: "done", live: null, error: null });
  };
  if (gate) { await sleep(350); land({ url: mockArt(cur.seed || 3, 4), w: 3072, h: 4096, ext: "png", by: "gate" }); return; }
  let sent;
  try { sent = (await toDataURL(cur.url)).data; } catch { return fail("eFailed"); }
  if (r !== enhanceRun) return;
  let res;
  try {
    res = await taskOne("/task", { route: "/feed/image/upscale", body: { image: sent, quality: "hd" } }, {
      onStart: (_id, rep) => { if (r === enhanceRun) enhanceJob = rep.job; else cancelJob(UPSCALE, rep.job); },
      onLive: (live) => { if (r === enhanceRun) $enhance.set({ ...$enhance.get(), live }); },
    });
  } catch (e) { if (r === enhanceRun) fail(e?.code || jobCode(e)); return; }
  enhanceJob = null;
  if (r !== enhanceRun) return;
  if (res.status !== "done") return fail(res.status === "busy" ? "eBusy" : "eFailed");
  try {
    const size = (await sizeOf(res.blob)) || { w: 0, h: 0 };
    land({ url: res.url, w: size.w, h: size.h, ext: extOf(res.blob), by: res.by });
  } catch (e) { report("enhance.land", { msg: e?.message || String(e) }); fail("eFailed"); }
}

export function cancel(mode) {
  const st = ATOM[mode].get();
  if (st.phase !== "working") return;
  runs[mode]++;
  if (mode !== "read") {
    const job = jobs[mode]; jobs[mode] = null;
    holds[mode]?.(); holds[mode] = null;
    if (job && !gate) cancelJob(BASE[mode], job);
    try { localStorage.removeItem(JOB_KEY(mode)); } catch { }
    patch(mode, { more: false, live: null, phase: st.slides.length ? "done" : mode === "make" ? "idle" : "ready" });
  } else patch("read", { phase: "ready" });
}

export function setSource(mode, url) {
  const st = ATOM[mode].get();
  if (mode === "edit") {
    freeSlides(st.slides, [url]);
    [st.src, st.original].forEach((u) => { if (u && u !== url && !stillHeld(u)) revoke(u); });
    patch("edit", { src: url, original: url, slides: [], idx: 0, more: false, error: null, prompt: "", phase: "ready" });
  } else {
    if (st.src && st.src !== url && !stillHeld(st.src)) revoke(st.src);
    patch("read", { src: url, text: "", error: null, question: "", phase: "ready" });
  }
}
export function clearSource(mode) {
  runs[mode]++;
  const st = ATOM[mode].get();
  if (mode === "edit") { freeSlides(st.slides); patch("edit", { src: null, original: null, slides: [], idx: 0, more: false, error: null, phase: "empty" }); [st.src, st.original].forEach((u) => { if (u && !stillHeld(u)) revoke(u); }); }
  else { patch("read", { src: null, text: "", error: null, phase: "empty" }); if (st.src && !stillHeld(st.src)) revoke(st.src); }
}
export const toRead = (url) => { setSource("read", url); $mode.set("read"); };
export const toEdit = (url, prompt = "") => { setSource("edit", url); if (prompt) patch("edit", { prompt }); $mode.set("edit"); };
const oneLine = (s) => s.replace(/\s*\n+\s*/g, ". ").replace(/\.\s*\./g, ".").trim();
export const readToMake = () => { patch("make", { prompt: oneLine($read.get().text) }); $mode.set("make"); };
export const readToEdit = () => { const r = $read.get(); toEdit(r.src, oneLine(r.text)); };

export function resume(ctx) {
  if (gate) return;
  for (const mode of ["make", "edit", "blend", "style"]) {
    if (runs[mode]) continue;
    let j = null; try { j = JSON.parse(localStorage.getItem(JOB_KEY(mode)) || "null"); } catch { }
    if (!j?.task || Date.now() - j.ts > 240000) { try { localStorage.removeItem(JOB_KEY(mode)); } catch { } continue; }   // no task: a job from the polling bundle
    if ((mode === "edit" && !$edit.get().src) || (TWO_SLOT.includes(mode) && !(ATOM[mode].get().a && ATOM[mode].get().b))) { try { localStorage.removeItem(JOB_KEY(mode)); } catch { } continue; }
    const run = ++runs[mode]; jobs[mode] = j.job;
    patch(mode, { phase: "working", prompt: j.prompt || "", t0: j.ts, error: null });
    followJob(mode, j.task, run, ctx, j.seed || 0);
  }
}

export function liveOf(live) {
  if (!live) return { key: "queued", step: null, pct: null };
  if (live.stage === "translate") return { key: "translating", step: null, pct: 0.02 };
  if (live.step != null && live.steps) return { key: "painting", step: `${live.step}/${live.steps}`, pct: live.pct != null ? live.pct / 100 : live.step / live.steps };
  if (live.got > 0) return { key: "painting", step: `${live.got}/${K}`, pct: 0.5 + 0.5 * (live.got / K) };
  return { key: live.pct != null ? "painting" : "queued", step: null, pct: live.pct != null ? live.pct / 100 : null };
}
