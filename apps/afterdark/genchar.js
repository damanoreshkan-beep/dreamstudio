// afterdark — a NEW CHARACTER FROM WORDS. Two edge jobs in a row, both already on the VPS: the prompt → a picture
// (/feed/image, the pods' Space race, signed-in only — a 401 opens the runtime's sign-in wall by itself), then the
// picture → a rigged body (/feed/character: TRELLIS mesh → Make-It-Animatable rig → stored, /feed/character/<id>.glb).
// The Spaces are reached by the edge's browser pods, never from here (they refuse a bare HTTP client). Runs at
// module level — a tab switch does not kill it; progress lands in state.js atoms, the cast tab only reads them.
// A page reload loses the wait (the edge keeps the job an hour; resuming it is a next step, not this one).
import { VPS_PROXY } from "/_rt/feed.js";
import { startJob, follow } from "/_rt/imagejob.js";
import { toEnglish } from "/_rt/translate.js";
import { toDataURL } from "/_rt/intake.js";
import { $genCharLoading, $genCharPct, $genCharError, $newChar, addMyChar, toggleChar } from "./state.js";

const IMG = `${VPS_PROXY}/image`, CHAR = `${VPS_PROXY}/character`, HOST = VPS_PROXY.replace(/\/feed$/, "");
// what the mesh Space needs to see: one whole body, arms off the torso, nothing behind it
const LOOK = ", full body head to toe, single character, standing A-pose with arms slightly out, facing camera, centered, plain white background, studio lighting, 3d game character render, no text";
const TINTS = ["#FF3EB5", "#39FF6A", "#F5B942", "#7C5CFF", "#22D3EE", "#FF6AD5", "#4ADE80", "#FB7185", "#FBBF24", "#38BDF8", "#F472B6", "#A3E635", "#F97316", "#2DD4BF", "#C084FC", "#FACC15"];
const POLL = 3000, BUDGET = 20 * 60_000;              // TRELLIS ≤7 min + the rig ≤9 min, plus the queue
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let run = 0, t0 = 0;
export const genElapsed = () => (t0 ? (Date.now() - t0) / 1000 | 0 : 0);

// the grid's round avatar: the top square of the picture (head and shoulders of a full-body shot), 96 px
function headShot(url) {
  return new Promise((ok, no) => {
    const img = new Image();
    img.onload = () => { try { const w = img.naturalWidth, h = img.naturalHeight, side = Math.min(w, h * 0.45); const c = document.createElement("canvas"); c.width = c.height = 96; c.getContext("2d").drawImage(img, (w - side) / 2, 0, side, side, 0, 0, 96, 96); ok(c.toDataURL("image/jpeg", 0.85)); } catch (e) { no(e); } };
    img.onerror = () => no(new Error("load failed"));
    img.src = url;
  });
}

/** Make a character; resolves to it (also added to my characters and put on stage), or undefined on a failure (the error atom says why). */
export async function generateCharacter({ prompt, name, kind }) {
  if ($genCharLoading.get()) return;
  const my = ++run; t0 = Date.now();
  const alive = () => my === run;
  $genCharError.set(""); $genCharPct.set(0); $genCharLoading.set("picture");
  try {
    const en = await toEnglish(prompt);
    const job = await startJob(IMG, { prompt: en + LOOK, quality: "fast", aspect: "portrait", ratio: 0.75, seed: Math.floor(Math.random() * 1e9), k: 1 });
    let blob = null;
    const st = await follow({ base: IMG, job, alive, onLive: (l) => $genCharPct.set(l.pct || 0), onSlide: (s) => { blob ??= s.blob; } });
    if (!alive()) return;
    if (!blob) throw { code: st === "busy" ? "eBusy" : st === "timeout" ? "eTimeout" : "eFailed" };
    const url = URL.createObjectURL(blob);
    let image, avatar;
    try { image = (await toDataURL(url, 1024)).data; avatar = await headShot(url); } finally { URL.revokeObjectURL(url); }
    $genCharLoading.set("queued"); $genCharPct.set(0);
    const r = await fetch(CHAR, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image, name }) });
    const j0 = await r.json().catch(() => ({}));
    if (!(r.status === 202 || r.status === 409) || !j0.job) throw { code: r.status === 429 ? "eRate" : r.status === 401 ? "eSignIn" : "eFailed" };   // 409 = my own job still running: follow it
    const id = j0.job, began = Date.now();
    while (Date.now() - began < BUDGET) {
      await sleep(POLL);
      if (!alive()) return;
      let j; try { j = await (await fetch(`${CHAR}/${id}`)).json(); } catch { continue; }
      if (!j) continue;
      if (j.status === "error") throw { code: "eFailed", why: j.error };
      if (j.status === "done") {
        const c = { id: `my-${id}`, name, tint: TINTS[parseInt(id.slice(-2), 36) % TINTS.length], kind, glb: HOST + j.glb, avatar, ts: Date.now() };
        addMyChar(c); toggleChar(c.id); $newChar.set(c.id); $genCharLoading.set("");
        return c;
      }
      $genCharLoading.set(j.stage === "mesh" || j.stage === "rig" || j.stage === "store" ? j.stage : "queued");
      $genCharPct.set(j.pct || 0);
    }
    throw { code: "eTimeout" };
  } catch (e) {
    if (!alive()) return;
    $genCharError.set(e?.code || "eFailed"); $genCharLoading.set("");
    if (e?.why) console.warn("[genchar]", e.why);
  }
}

/** Forget the wait (the edge finishes on its own; the picture race is not cancelled — its next call is the same job). */
export function cancelGenerate() { run++; t0 = 0; $genCharLoading.set(""); $genCharPct.set(0); }
