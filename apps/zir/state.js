// The pipeline, as state + actions that OUTLIVE the view: the runtime mounts one tab at a time, so a picture
// that cost a GPU minute must not live in useState. Module-level atoms; view.js subscribes and renders.
//
// One job shape: a photo (capped at 1024 on the long side) → POST /feed/image/upscale → the ONE-PICTURE
// contract (`followOne`: the status URL turns into the bytes) → the picture at 4× the pixels. The edge does
// the cascading: "hd" races two ZeroGPU rows on two pods, first wins, and falls to a CPU row that has no
// quota at all; "fast" is that CPU row alone (~12s at 768², ~24s at 1280², measured 2026-09-02).
import { atom } from "nanostores";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { T } from "/_rt/i18n.js";
import { writeLastGen } from "/_rt/lastgen.js";
import { notify, notifyAsk } from "/_rt/notify.js";
import { holdBackground } from "/_rt/bghold.js";
import { startJob, followOne, cancelJob } from "/_rt/imagejob.js";
import { mockArt, toDataURL, sizeOf, extOf } from "/_rt/intake.js";

const BASE = `${VPS_PROXY}/image/upscale`;
const OPTS_KEY = "ms:zir:opts";
const JOB_KEY = "ms:zir:job";

// phase: empty | camera | ready | working | done | error
// src = the photo (object/data URL) · inW/inH = what was sent · out = { url, w, h, ext, by } · live = the worker's progress
export const $st = atom({
  phase: gate ? "done" : "empty",
  src: gate ? mockArt(3) : null, inW: gate ? 768 : 0, inH: gate ? 1024 : 0,
  out: gate ? { url: mockArt(3, 4), w: 3072, h: 4096, ext: "png", by: "gate" } : null,
  live: null, error: null, t0: 0,
});
const DEFAULT_OPTS = { quality: "hd", model: "auto" };
const loadOpts = () => { try { const v = JSON.parse(localStorage.getItem(OPTS_KEY) || "null"); if (v?.quality) return { ...DEFAULT_OPTS, ...v }; } catch { /* */ } return DEFAULT_OPTS; };
export const $opts = atom(loadOpts());
export const setOpts = (p) => { const v = { ...$opts.get(), ...p }; $opts.set(v); try { localStorage.setItem(OPTS_KEY, JSON.stringify(v)); } catch { /* */ } };

// the catalogue: what the edge can run now, with HF's word on whether each Space is alive (5 min, `fresh` re-probes)
const GATE_MODELS = [{ id: "OzzyGT/basic_upscaler", tier: "hd", alive: true }, { id: "Phips/Upscaler", tier: "hd", alive: true }, { id: "ovi054/image-upscaler-pro", tier: "fast", alive: null }];
export const $models = atom({ list: [], at: 0, loading: false, error: false });
export async function loadModels(fresh = false) {
  const cur = $models.get();
  if (gate) { if (!cur.at) $models.set({ list: GATE_MODELS, at: Date.now(), loading: false, error: false }); return; }
  if (cur.loading || (!fresh && cur.at && Date.now() - cur.at < 5 * 60_000)) return;
  $models.set({ ...cur, loading: true, error: false });
  try {
    const r = await fetch(VPS_PROXY + "/image/models" + (fresh ? "?fresh=1" : ""));
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    $models.set({ list: j.upscale || [], at: Date.now(), loading: false, error: false });
  } catch { $models.set({ ...$models.get(), loading: false, error: true }); }
}
export const modelsAlive = () => $models.get().list.filter((m) => m.alive !== false);   // a Space HF calls dead is never offered

export const patch = (p) => { const a = $st.get(); $st.set({ ...a, ...(typeof p === "function" ? p(a) : p) }); };
const revoke = (url) => { if (url?.startsWith?.("blob:")) { try { URL.revokeObjectURL(url); } catch { /* */ } } };

let run = 0, job = null, hold = null;

export function setSource(url) {
  const cur = $st.get();
  if (cur.out) revoke(cur.out.url);
  if (cur.src !== url) revoke(cur.src);
  patch({ src: url, phase: "ready", out: null, error: null, live: null, inW: 0, inH: 0 });
}
export function clearSource() {
  cancel();
  const cur = $st.get(); revoke(cur.src); if (cur.out) revoke(cur.out.url);
  patch({ src: null, phase: "empty", out: null, error: null, live: null, inW: 0, inH: 0 });
}
// the result becomes the next source — a second pass on an already-enlarged picture (capped back to 1024 on send)
export function again() { const o = $st.get().out; if (o) setSource(o.url); }

const fail = (r, code) => { if (r !== run) return; patch({ phase: "error", error: code, live: null }); hold?.(); hold = null; };

export async function enlarge(ctx) {
  const st = $st.get();
  if (!st.src || st.phase === "working") return;
  const r = ++run;
  if (st.out) revoke(st.out.url);
  patch({ phase: "working", out: null, error: null, live: null, t0: Date.now() });
  if (gate) {                                                                    // deterministic, no network
    await new Promise((ok) => setTimeout(ok, 350));
    if (r !== run) return;
    patch({ phase: "done", out: { url: mockArt(3, 4), w: 3072, h: 4096, ext: "png", by: "gate" }, inW: 768, inH: 1024, live: null });
    return;
  }
  let sent;
  try { sent = await toDataURL(st.src); } catch { return fail(r, "eFailed"); }
  if (r !== run) return;
  patch({ inW: sent.w, inH: sent.h });
  const { quality, model } = $opts.get();
  try { job = await startJob(BASE, { image: sent.data, quality, ...(model && model !== "auto" ? { model } : {}) }); }
  catch (e) { return fail(r, e.code || "eNetwork"); }
  if (r !== run) { cancelJob(BASE, job); return; }
  try { localStorage.setItem(JOB_KEY, JSON.stringify({ job, ts: Date.now() })); } catch { /* */ }
  hold = holdBackground({ title: T(ctx.t, "title"), body: T(ctx.t, "working") });
  const res = await followOne({ base: BASE, job, alive: () => r === run, onLive: (live) => patch({ live }) });
  if (r !== run) return;
  hold?.(); hold = null;
  try { localStorage.removeItem(JOB_KEY); } catch { /* */ }
  if (res.status !== "done") return fail(r, res.status === "busy" ? "eBusy" : res.status === "timeout" ? "eTimeout" : "eFailed");
  const size = (await sizeOf(res.blob)) || { w: 0, h: 0 };
  if (r !== run) return;
  const out = { url: res.url, w: size.w, h: size.h, ext: extOf(res.blob), by: res.by };
  patch({ phase: "done", out, live: null });
  writeLastGen(out.url, "").catch(() => {});
  if (document.visibilityState === "hidden") {
    if (await notifyAsk()) notify({ id: "zir-done", title: T(ctx.t, "done"), body: `${out.w}×${out.h}` }).catch(() => {});
  }
}

export function cancel() {
  if ($st.get().phase !== "working") return;
  run++;
  if (job) { cancelJob(BASE, job); job = null; }
  hold?.(); hold = null;
  patch({ phase: "ready", live: null, error: null });
}

// the worker's progress → one word the caption shows, plus the step readout when the Space reports one
export const liveOf = (live) => {
  if (!live) return { key: "working", step: null };
  const st = String(live.stage || live.phase || "");
  if (/queue|waiting/i.test(st)) return { key: "queued", step: null };
  const step = live.step && live.steps ? `${live.step}/${live.steps}` : live.pct != null ? `${Math.round(live.pct)}%` : null;
  return { key: "working", step };
};
