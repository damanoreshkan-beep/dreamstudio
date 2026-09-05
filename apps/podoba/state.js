// podoba — state outside the mount (the runtime mounts one tab at a time). The LIVE layer is the shader's
// (view.js hands GlStage the camera); this file owns what the KEEPER needs: the material, the frozen frame,
// the job on /feed/image/edit, the result and its failures. Contract and the state map: RESEARCH.md.
import { atom } from "nanostores";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { T } from "/_rt/i18n.js";
import { notify, notifyAsk } from "/_rt/notify.js";
import { holdBackground } from "/_rt/bghold.js";
import { startJob, followOne, cancelJob } from "/_rt/imagejob.js";
import { extOf, sizeOf, toDataURL } from "/_rt/intake.js";
import { report } from "/_rt/telemetry.js";
import { STYLES, styleOf } from "/_rt/styles.js";

const EDIT = `${VPS_PROXY}/image/edit`;
const UPSCALE = `${VPS_PROXY}/image/upscale`;
const MAT_KEY = "podoba:mat";
const savedMat = () => { try { const m = localStorage.getItem(MAT_KEY); return STYLES.some((s) => s.id === m) ? m : "lum"; } catch { return "lum"; } };
/** The gate's camera: a still of our own (assets/mock.webp) — the shot, the store's captures, the keeper's stand-in. */
export const mockURL = new URL("assets/mock.webp", import.meta.url).href;

// phase: live → working (the frame is frozen, the pods paint) → done | error; done → enhancing → done (×4,
// `out.hd`); `again` returns to live from any of them
export const $st = atom({ phase: "live", mat: gate ? "lum" : savedMat(), facing: "environment", frame: null, out: null, error: null, t0: 0, live: null });
export const patch = (p) => $st.set({ ...$st.get(), ...p });
let run = 0, job = null, jobBase = EDIT, hold = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const revoke = (u) => { if (u && u.startsWith("blob:")) URL.revokeObjectURL(u); };

// One-shot operations (owner, 2026-09-05: "перемикаю стиль — має відкритись знову камера, проявлене зникає"): a
// material is chosen for the LIVE mirror, so choosing one from any other state returns to it — a running keeper is
// cancelled, a developed one is let go.
export function setMat(id) {
  if (!styleOf(id)) return;
  if ($st.get().phase !== "live") again();
  patch({ mat: id });
  try { localStorage.setItem(MAT_KEY, id); } catch { /* private mode */ }
}
/** The same frozen frame once more — the keeper failed, the shot is still worth developing. */
export function retry(ctx) { const st = $st.get(); if (st.phase === "error" && st.frame) return shoot(st.frame, ctx); }
export function flip() { if ($st.get().phase === "live") patch({ facing: $st.get().facing === "user" ? "environment" : "user" }); }

export const liveOf = (live) => {
  if (!live) return { key: "working" };
  const s = String(live.stage || live.phase || "");
  return { key: /queue|waiting/i.test(s) ? "queued" : "working" };
};

// The keeper: the frozen frame (a capped, mirrored JPEG data URL from the view) reimagined in the material by
// the pods' edit race (/feed/image/edit, k = 1 → the BYTES on the status URL, `followOne`). THE PROMPT IS THE
// VERY FIRST ONE, word for word — the owner, four rewrites later (2026-09-05): "самий найперший варіант було
// дуже якісні промпти". What was tried and lost the same day, so nobody tries it again: naming the subject
// ("keep every object, person…", "no people, faces") put a person into a photo with none; the STYLE route with
// the material's card as a reference (assets/style-<id>.webp, the fox) painted the FOX into the scene — a
// reference that has a subject transfers the subject. Only the block, after the photo, nothing else.
export async function shoot(frame, ctx) {
  const st = $st.get();
  if (!frame || st.phase === "working") return;
  const r = ++run, seed = Math.floor(Math.random() * 1e9);
  hold?.(); hold = null; revoke(st.out?.url);
  patch({ phase: "working", frame, out: null, error: null, live: null, t0: Date.now() });
  if (gate) { await sleep(120); if (r === run) patch({ phase: "done", out: { url: mockURL, w: 768, h: 1024, ext: "webp", by: "" }, live: null }); return; }
  if (frame.length > 9_000_000) return fail(r, "eBig");
  notifyAsk();
  const block = styleOf(st.mat)?.block || STYLES[0].block;
  jobBase = EDIT;
  try { job = await startJob(EDIT, { image: frame, prompt: `the same photograph reimagined, ${block}`, seed, k: 1 }); }
  catch (e) { return fail(r, e.code || "eNetwork"); }
  if (r !== run) { cancelJob(EDIT, job); return; }
  hold = holdBackground({ title: T(ctx.t, "title"), body: T(ctx.t, "working") });
  const res = await followOne({ base: EDIT, job, alive: () => r === run, onLive: (live) => patch({ live }) });
  if (res.status === "stale") return;
  hold?.(); hold = null; job = null;
  if (res.status !== "done") return fail(r, res.status === "timeout" ? "eTimeout" : res.status === "busy" ? "eBusy" : "eFailed");
  const size = await sizeOf(res.blob);   // measured, never assumed (naturalWidth lies on a scaled <img>)
  if (r !== run) { revoke(res.url); return; }
  patch({ phase: "done", out: { url: res.url, w: size?.w || 0, h: size?.h || 0, by: res.by, ext: extOf(res.blob) }, live: null });
  if (document.visibilityState === "hidden") notify({ id: "podoba-done", title: T(ctx.t, "title"), body: T(ctx.t, "notifDone"), url: "./" }).catch(() => {});
}

function fail(r, code) {
  if (r !== run) return;
  hold?.(); hold = null; job = null;
  patch({ phase: "error", error: code, live: null });
  report("keeper.fail", { reason: code, mat: $st.get().mat });   // the clients' own log (/feed/log)
}

// The enlargement: the keeper through /feed/image/upscale (zir's route — the hd race + the quota-free CPU row),
// the same 1024 cap on the way in, `followOne` out, the size MEASURED. A failure keeps the keeper as it is.
export async function enhance(ctx) {
  const st = $st.get();
  if (st.phase !== "done" || !st.out || st.out.hd) return;
  const r = ++run;
  patch({ phase: "enhancing", error: null, live: null, t0: Date.now() });
  if (gate) { await sleep(120); if (r === run) patch({ phase: "done", out: { ...st.out, w: st.out.w * 4, h: st.out.h * 4, hd: true }, live: null }); return; }
  let image;
  try { image = (await toDataURL(st.out.url)).data; } catch { return failHd(r, "eHd"); }
  if (r !== run) return;
  jobBase = UPSCALE;
  try { job = await startJob(UPSCALE, { image, quality: "hd" }); } catch (e) { return failHd(r, e.code === "eSignIn" ? "eSignIn" : "eHd"); }
  if (r !== run) { cancelJob(UPSCALE, job); return; }
  hold = holdBackground({ title: T(ctx.t, "title"), body: T(ctx.t, "enhancing") });
  const res = await followOne({ base: UPSCALE, job, alive: () => r === run, onLive: (live) => patch({ live }) });
  if (res.status === "stale") return;
  hold?.(); hold = null; job = null;
  if (res.status !== "done") return failHd(r, res.status === "busy" ? "eBusy" : "eHd");
  const size = await sizeOf(res.blob);
  if (r !== run) { revoke(res.url); return; }
  const old = $st.get().out?.url;
  patch({ phase: "done", out: { url: res.url, w: size?.w || 0, h: size?.h || 0, by: res.by, ext: extOf(res.blob), hd: true }, live: null });
  revoke(old);
}
function failHd(r, code) {
  if (r !== run) return;
  hold?.(); hold = null; job = null;
  patch({ phase: "done", error: code, live: null });
  report("hd.fail", { reason: code, mat: $st.get().mat });
}

/** Back to the live mirror: cancels a running keeper, frees the last picture. */
export function again() {
  run++;
  if (job) { cancelJob(jobBase, job); job = null; }
  hold?.(); hold = null;
  revoke($st.get().out?.url);
  patch({ phase: "live", frame: null, out: null, error: null, live: null });
}
