// genchar.js — A NEW CHARACTER, from words or from a photo. The two edge jobs afterdark shipped 2026-09-12 (a
// prompt → a picture through /feed/image, the picture → a rigged body through /feed/character), promoted here
// when blackout became the second app to make characters. A PHOTO takes one more hop first: /feed/vision
// turns it into the English description the picture model needs (the face never reaches the mesh Space — the
// look does). Runs at module level in the app: a tab switch does not kill it; progress lands in the atoms the
// app hands over. A RELOAD does not lose the wait: the job id is kept (an hour, the edge's own memory of it)
// and followed again on boot without a second POST; the edge writes the finished row itself.
import { VPS_PROXY } from "@microspec/core/runtime/feed.js";
import { startJob, follow } from "@microspec/core/runtime/imagejob.js";
import { toEnglish } from "@microspec/core/runtime/translate.js";
import { session } from "@microspec/core/runtime/auth.js";
import { gate } from "@microspec/core/runtime/gate.js";

const IMG = `${VPS_PROXY}/image`, CHAR = `${VPS_PROXY}/character`, VISION = `${VPS_PROXY}/vision`;
// what the mesh Space needs to see: one whole body, arms off the torso, nothing behind it
export const LOOK = ", full body head to toe, single character, standing A-pose with arms slightly out, facing camera, centered, plain white background, studio lighting, 3d game character render, no text";
const POLL = 3000, BUDGET = 20 * 60_000;              // TRELLIS ≤7 min + the rig ≤9 min, plus the queue
const JOB_TTL = 60 * 60_000;
const TINTS = ["#FF3EB5", "#39FF6A", "#F5B942", "#7C5CFF", "#22D3EE", "#FF6AD5", "#4ADE80", "#FB7185", "#FBBF24", "#38BDF8", "#F472B6", "#A3E635", "#F97316", "#2DD4BF", "#C084FC", "#FACC15"];
const HOST = VPS_PROXY.replace(/\/feed$/, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** An edge refusal → the app's error key; 402 = the farm wallet cannot pay the body. Pure. */
export const genStatusCode = (status) => (status === 402 ? "ePoor" : status === 429 ? "eRate" : status === 401 ? "eSignIn" : status === 413 ? "eBig" : "eFailed");
/** The picture prompt: the English description plus the fixed look the mesh Space needs. Pure. */
export const lookPrompt = (en) => String(en || "").trim().slice(0, 600) + LOOK;
// what /feed/vision is asked about a photo: the LOOK a character artist would copy, never who it is (the edge's
// vision route takes {image, prompt}; the pods' Space first, the keyed rows behind it)
export const LOOK_ASK = "Describe the LOOK of the person in this photo for a 3D game character artist, as ONE English paragraph of 40-70 words: a comma-separated list of visual traits — apparent gender and age range, build and height impression, skin tone, hair (length, colour, style), facial hair or glasses if any, upper clothing with colours and patterns, lower clothing, footwear, accessories (hat, bag, jewellery, headphones). Only what is visible. No names, no identity guesses, no background, no pose, no emotions, no sentences about the photo itself. Output the description only.";
/** A vision answer that can stand as a look: ≥ 8 words, Latin script, not a Space's error or a refusal. Pure. */
export const looksLikeLook = (text) => { const s = String(text || "").trim(); return s.split(/\s+/).length >= 8 && !/^\s*\[error\]|no gpu|bounding box|i cannot|i can't|as an ai/i.test(s) && !/[Ѐ-ӿ]/.test(s); };
/** A name when the maker gave none: the first two words of the prompt, capitalised, ≤40 chars. Pure. */
export const nameFrom = (prompt) => String(prompt || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ").slice(0, 40);
/** An edge row {char_id, name, kind, glb_url, avatar_url, created_at} → the app's character {id: "my-…", …}. Pure. */
export const charOf = (r) => ({ id: `my-${r.char_id}`, name: r.name || "", tint: TINTS[parseInt(String(r.char_id).slice(-2), 36) % TINTS.length], kind: r.kind === "creature" ? "creature" : "human", glb: HOST + r.glb_url, avatar: r.avatar_url || "", ts: Date.parse(r.created_at) || Date.now() });

// the grid's round avatar: the top square of the picture (head and shoulders of a full-body shot), 96 px
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
  const jobGet = () => { try { const j = JSON.parse(localStorage.getItem(jobKey) || "null"); return j && typeof j.id === "string" && Date.now() - j.ts < JOB_TTL ? j : null; } catch { return null; } };
  const jobSet = (j) => { try { j ? localStorage.setItem(jobKey, JSON.stringify(j)) : localStorage.removeItem(jobKey); } catch { /* private mode */ } };
  const whoNow = () => session.get()?.user?.login || "";
  let run = 0, t0 = 0;
  const genElapsed = () => (t0 ? (Date.now() - t0) / 1000 | 0 : 0);

  // Poll one edge job to its end. Resolves the character, undefined when this wait was superseded; throws {code}.
  async function followJob(id, alive, began) {
    while (Date.now() - began < BUDGET) {
      await sleep(POLL);
      if (!alive()) return;
      let j; try { j = await (await fetch(`${CHAR}/${id}`)).json(); } catch { continue; }
      if (!j) continue;
      if (j.status === "error") throw { code: "eFailed", why: j.error };
      if (j.status === "done") {
        const c = charOf(j);
        jobSet(null); $loading.set("");
        onDone(c);
        return c;
      }
      $loading.set(j.stage === "mesh" || j.stage === "rig" || j.stage === "store" ? j.stage : "queued");
      $pct.set(j.pct || 0);
    }
    throw { code: "eTimeout" };
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
        if (!looksLikeLook(j.text)) throw { code: "eFailed", why: "vision: " + String(j.text).slice(0, 80) };   // wrong beats missing: a refusal is never a prompt
        en = j.text;
        if (!alive()) return;
        $loading.set("picture");
      } else en = await toEnglish(prompt);
      // k>1 = the slides protocol: the only one that honours `aspect` (k:1 draws the Space's default square and
      // answers raw bytes, which follow() never reads); the first slide to land is the character
      const job = await startJob(IMG, { prompt: lookPrompt(en), quality: "fast", aspect: "portrait", ratio: 0.75, seed: Math.floor(Math.random() * 1e9), k: 2 });
      let blob = null;
      const st = await follow({ base: IMG, job, alive, onLive: (l) => $pct.set(l.pct || 0), onSlide: (s) => { blob ??= s.blob; } });
      if (!alive()) return;
      if (!blob) throw { code: st === "busy" ? "eBusy" : st === "timeout" ? "eTimeout" : "eFailed" };
      const { toDataURL } = await import("@microspec/core/runtime/intake.js");
      const url = URL.createObjectURL(blob);
      let image, avatar;
      try { image = (await toDataURL(url, 1024)).data; avatar = await headShot(url); } finally { URL.revokeObjectURL(url); }
      $loading.set("queued"); $pct.set(0);
      const r = await fetch(CHAR, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ app, image, name, kind, avatar }) });
      const j0 = await r.json().catch(() => ({}));
      if (!(r.status === 202 || r.status === 409) || !j0.job) throw { code: statusCode(r) };   // 409 = my own job still running: follow it
      if (r.status === 202) onCharged?.();
      const began = Date.now();
      jobSet({ id: j0.job, ts: began, user: whoNow() });
      return await followJob(j0.job, alive, began);
    } catch (e) { fail(e, alive, true); }
  }

  /** Pick up the job a previous page load left in flight (boot): the progress continues where it was. */
  function resumeGeneration() {
    if (gate || $loading.get()) return;
    const saved = jobGet();
    if (!saved) { jobSet(null); return; }
    const who = whoNow();
    if (saved.user && who && saved.user !== who) { jobSet(null); return; }   // somebody else's wait
    const my = ++run; t0 = saved.ts;
    const alive = () => my === run;
    $error.set(""); $pct.set(0); $loading.set("queued");
    followJob(saved.id, alive, saved.ts).catch((e) => fail(e, alive, false));
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
  catch { /* offline: the next load shows it again */ }
}
