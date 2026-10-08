import { VPS_PROXY } from "@microspec/core/runtime/feed.js";
import { startTask, taskSlides, followCall, taskKey } from "./task.js";
import { toEnglish } from "@microspec/core/runtime/translate.js";
import { session } from "@microspec/core/runtime/auth.js";
import { gate } from "@microspec/core/runtime/gate.js";

const CHAR = `${VPS_PROXY}/character`, VISION = `${VPS_PROXY}/vision`;
export const LOOK = ", full body head to toe, single character, standing A-pose with arms slightly out, facing camera, centered, plain white background, studio lighting, 3d game character render, no text";
const JOB_TTL = 60 * 60_000;
const TINTS = ["#FF3EB5", "#39FF6A", "#F5B942", "#7C5CFF", "#22D3EE", "#FF6AD5", "#4ADE80", "#FB7185", "#FBBF24", "#38BDF8", "#F472B6", "#A3E635", "#F97316", "#2DD4BF", "#C084FC", "#FACC15"];
const HOST = VPS_PROXY.replace(/\/feed$/, "");

/** An edge refusal → the app's error key; 402 = the farm wallet cannot pay the body. Pure. */
export const genStatusCode = (status) => (status === 402 ? "ePoor" : status === 429 ? "eRate" : status === 401 ? "eSignIn" : status === 413 ? "eBig" : "eFailed");
/** The picture prompt: the English description plus the fixed look the mesh Space needs. Pure. */
export const lookPrompt = (en) => String(en || "").trim().slice(0, 600) + LOOK;
export const LOOK_ASK = "Describe the LOOK of the person in this photo for a 3D game character artist, as ONE English paragraph of 40-70 words: a comma-separated list of visual traits — apparent gender and age range, build and height impression, skin tone, hair (length, colour, style), facial hair or glasses if any, upper clothing with colours and patterns, lower clothing, footwear, accessories (hat, bag, jewellery, headphones). Only what is visible. No names, no identity guesses, no background, no pose, no emotions, no sentences about the photo itself. Output the description only.";
/** A vision answer that can stand as a look: ≥ 8 words, Latin script, not a Space's error or a refusal. Pure. */
export const looksLikeLook = (text) => { const s = String(text || "").trim(); return s.split(/\s+/).length >= 8 && !/^\s*\[error\]|no gpu|bounding box|i cannot|i can't|as an ai/i.test(s) && !/[Ѐ-ӿ]/.test(s); };
/** A name when the maker gave none: the first two words of the prompt, capitalised, ≤40 chars. Pure. */
export const nameFrom = (prompt) => String(prompt || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ").slice(0, 40);
/** An edge row {char_id, name, kind, glb_url, avatar_url, created_at} → the app's character {id: "my-…", …}. Pure. */
export const charOf = (r) => ({ id: `my-${r.char_id}`, name: r.name || "", tint: TINTS[parseInt(String(r.char_id).slice(-2), 36) % TINTS.length], kind: r.kind === "creature" ? "creature" : "human", glb: HOST + r.glb_url, avatar: r.avatar_url || "", ts: Date.parse(r.created_at) || Date.now() });

function headShot(url) {
  return new Promise((ok, no) => {
    const img = new Image();
    img.onload = () => { try { const w = img.naturalWidth, h = img.naturalHeight, side = Math.min(w, h * 0.45); const c = document.createElement("canvas"); c.width = c.height = 96; c.getContext("2d").drawImage(img, (w - side) / 2, 0, side, side, 0, 0, 96, 96); ok(c.toDataURL("image/jpeg", 0.85)); } catch (e) { no(e); } };
    img.onerror = () => no(new Error("load failed"));
    img.src = url;
  });
}

/**
 * The generator an app owns. `app` is its id in the edge's wallet catalogue — the body job is paid from the farm
 * wallet at that app's price (a refusal is "ePoor"); `jobKey` is its localStorage slot for the job in flight;
 * `$loading` ("" | picture | queued | mesh | rig | store), `$pct`, `$error` (an i18n key) are the app's atoms;
 * `onDone(char)` gets the finished character; `onCharged()` (optional) runs once the edge has taken the price;
 * `onFail(code)` (optional) runs before the error atom is set.
 */
export function makeGenerator({ app, jobKey, $loading, $pct, $error, onDone, onCharged, onFail }) {
  // a saved job without `task` is from the polling bundle: the edge finishes it on its own and lists it in mine
  const jobGet = () => { try { const j = JSON.parse(localStorage.getItem(jobKey) || "null"); return j && typeof j.task === "string" && Date.now() - j.ts < JOB_TTL ? j : null; } catch { return null; } };
  const jobSet = (j) => { try { j ? localStorage.setItem(jobKey, JSON.stringify(j)) : localStorage.removeItem(jobKey); } catch { } };
  const whoNow = () => session.get()?.user?.login || "";
  let run = 0, t0 = 0;
  const genElapsed = () => (t0 ? (Date.now() - t0) / 1000 | 0 : 0);

  // The body is a TASK on the edge (task.js, the weak-link transport): its stages arrive as events, its row as the
  // result; a reload follows the same task id. No poll budget — the edge's own pods end a hung Space.
  async function followJob(task, alive) {
    let row;
    try {
      row = await followCall(task, { onLive: (l) => {
        if (!alive()) return;
        $loading.set(l.stage === "mesh" || l.stage === "rig" || l.stage === "store" ? l.stage : "queued");
        $pct.set(l.pct || 0);
      } });
    } catch (e) { throw { code: "eFailed", why: e?.message }; }
    if (!alive()) return;
    const c = charOf(row);
    jobSet(null); $loading.set("");
    onDone(c);
    return c;
  }
  function fail(e, alive, charged) {
    if (!alive()) return;
    jobSet(null);
    if (charged) onFail?.(e?.code || "eFailed");
    $error.set(e?.code || "eFailed"); $loading.set("");
    if (e?.why) console.warn("[genchar]", e.why);
  }
  const statusCode = (r) => genStatusCode(r.status);

  /**
   * Make a character from `prompt` (any language) or from `photo` (a data: URL — described by /feed/vision first);
   * resolves to it (also handed to onDone), or undefined on a failure (the error atom says why).
   */
  async function generateCharacter({ prompt = "", photo = "", name, kind }) {
    if ($loading.get()) return;
    const my = ++run; t0 = Date.now();
    const alive = () => my === run;
    $error.set(""); $pct.set(0); $loading.set(photo ? "look" : "picture");
    try {
      let en;
      if (photo) {
        const r = await fetch(VISION, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: photo, prompt: LOOK_ASK }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.text) throw { code: statusCode(r), why: j.error || r.status };
        if (!looksLikeLook(j.text)) throw { code: "eFailed", why: "vision: " + String(j.text).slice(0, 80) };
        en = j.text;
        if (!alive()) return;
        $loading.set("picture");
      } else en = await toEnglish(prompt);
      let blob = null, st;
      try {
        st = await taskSlides("/feed/image", { prompt: lookPrompt(en), quality: "fast", aspect: "portrait", ratio: 0.75, seed: Math.floor(Math.random() * 1e9), k: 2 },
          { onLive: (l) => { if (alive()) $pct.set(l.pct || 0); }, onSlide: (s) => { blob ??= s.blob; } });
      } catch (e) { throw { code: e?.status ? genStatusCode(e.status) : "eFailed" }; }
      if (!alive()) return;
      if (!blob) throw { code: st === "busy" ? "eBusy" : "eFailed" };
      const { toDataURL } = await import("@microspec/core/runtime/intake.js");
      const url = URL.createObjectURL(blob);
      let image, avatar;
      try { image = (await toDataURL(url, 1024)).data; avatar = await headShot(url); } finally { URL.revokeObjectURL(url); }
      $loading.set("queued"); $pct.set(0);
      // a 202 start is a new, charged body; a 409 is the one already running — /feed/task follows it either way
      let rep;
      try { rep = await startTask("/task", { route: "/feed/character", body: { app, image, name, kind, avatar }, k: taskKey() }); }
      catch (e) { throw { code: genStatusCode(e?.status) }; }
      if (rep.status === 202) onCharged?.();
      jobSet({ task: rep.id, ts: Date.now(), user: whoNow() });
      return await followJob(rep.id, alive);
    } catch (e) { fail(e, alive, true); }
  }

  /** Pick up the job a previous page load left in flight (boot): the progress continues where it was. */
  function resumeGeneration() {
    if (gate || $loading.get()) return;
    const saved = jobGet();
    if (!saved) { jobSet(null); return; }
    const who = whoNow();
    if (saved.user && who && saved.user !== who) { jobSet(null); return; }
    const my = ++run; t0 = saved.ts;
    const alive = () => my === run;
    $error.set(""); $pct.set(0); $loading.set("queued");
    followJob(saved.task, alive).catch((e) => fail(e, alive, false));
  }

  /** Forget the wait (the edge finishes on its own and keeps the body in my list). */
  function cancelGenerate() { run++; t0 = 0; jobSet(null); $loading.set(""); $pct.set(0); }

  return { generateCharacter, resumeGeneration, cancelGenerate, genElapsed };
}

/** The list from the edge for the current session — rows already mapped through charOf; null offline / signed out / 401. */
export async function fetchMyChars() {
  let r; try { r = await fetch(`${CHAR}/mine`); } catch { return null; }
  if (r.status === 401) return [];
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return Array.isArray(j?.characters) ? j.characters.map(charOf) : null;
}
/** Forget a character on the edge (the .glb stays, immutable and unlisted). */
export async function removeChar(id) {
  try { await fetch(`${CHAR}/mine/remove`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: String(id).replace(/^my-/, "") }) }); }
  catch { }
}
