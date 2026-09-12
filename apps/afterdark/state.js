// afterdark — the WORKING SET shared by the stage and the cast tab: who is on stage, which moves the floor may
// play. Persisted per viewer; the stage subscribes and drives the 3D engine, the cast tab edits.
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { VPS_PROXY } from "/_rt/feed.js";
import { session } from "/_rt/auth.js";
import { gate } from "/_rt/gate.js";
import { CHARACTERS, registerChars } from "./characters.js";
import { DEFAULT_MOVES, MOVE_IDS, isMoveId } from "./dances.js";

// MY CHARACTERS: the ones this viewer made from a prompt (genchar.js) — {id, name, tint, kind, glb, avatar, ts},
// newest first. The row of truth is on the edge (`user_characters`, keyed by the sealed session; the edge
// writes it when a job finishes), read back through /feed/character/mine — so a phone and a laptop signed in
// as the same person hold the same list. `$myChars` is a local MIRROR: persisted so the grid and the cast
// resolve my ids before the network answers (and offline), refreshed on every session change, emptied on
// sign-out. Avatars and public immutable .glb links only — nothing secret. Registered into characters.js so
// the stage resolves them like the library.
const HOST = VPS_PROXY.replace(/\/feed$/, "");
const TINTS = ["#FF3EB5", "#39FF6A", "#F5B942", "#7C5CFF", "#22D3EE", "#FF6AD5", "#4ADE80", "#FB7185", "#FBBF24", "#38BDF8", "#F472B6", "#A3E635", "#F97316", "#2DD4BF", "#C084FC", "#FACC15"];
const JSON_H = { "content-type": "application/json" };
/** An edge row {char_id, name, kind, glb_url, avatar_url, created_at} → the grid's character. */
export const charOf = (r) => ({ id: `my-${r.char_id}`, name: r.name || "", tint: TINTS[parseInt(String(r.char_id).slice(-2), 36) % TINTS.length], kind: r.kind === "creature" ? "creature" : "human", glb: HOST + r.glb_url, avatar: r.avatar_url || "", ts: Date.parse(r.created_at) || Date.now() });

export const $myChars = persistentAtom("afterdark:myChars", "[]");
export function getMyChars() {
  let a; try { a = JSON.parse($myChars.get()); } catch { a = null; }
  return Array.isArray(a) ? a.filter((c) => c && typeof c.id === "string" && typeof c.glb === "string") : [];
}
const setMyChars = (list) => $myChars.set(JSON.stringify(list));
/** A body just finished (genchar.js) — the edge already holds the row; mirror it here. */
export const addMyChar = (c) => setMyChars([c, ...getMyChars().filter((x) => x.id !== c.id)]);
/** Forget a character here and on the edge (the .glb file stays, immutable and unlisted). */
export async function removeMyChar(id) {
  setMyChars(getMyChars().filter((x) => x.id !== id));
  const c = getCast().filter((x) => x !== id); if (c.length) setCast(c);
  if (gate) return;
  try { await fetch(`${VPS_PROXY}/character/mine/remove`, { method: "POST", headers: JSON_H, body: JSON.stringify({ id: id.replace(/^my-/, "") }) }); }
  catch { /* offline: the next load shows it again, and the viewer removes it again */ }
}
/** The list from the edge for the current session (a no-op when nobody is signed in, or under the gate). */
export async function loadMyChars() {
  if (gate || !sidNow()) return;
  let r; try { r = await fetch(`${VPS_PROXY}/character/mine`); } catch { return; }   // offline → keep the mirror
  if (r.status === 401) { setMyChars([]); return; }                                   // a dead session owns nothing
  if (!r.ok) return;
  const j = await r.json().catch(() => null);
  if (Array.isArray(j?.characters)) setMyChars(j.characters.map(charOf));
}
const sidNow = () => { try { return localStorage.getItem("ms:gh:sid") || ""; } catch { return ""; } };
registerChars(getMyChars());
$myChars.listen(() => registerChars(getMyChars()));
// boot: a stored session lists its characters at once; later a sign-in loads, a sign-out empties the mirror
// (the cast keeps the ids, `getCast` simply stops resolving them until the same person signs in again).
// Deferred a tick: this module evaluates before /_rt/index.js installs the sealed fetch that carries the sid.
if (!gate) {
  let loadedFor = sidNow();
  if (loadedFor) setTimeout(loadMyChars, 0);
  session.listen((s) => {
    const sid = s ? s.sid : "";
    if (sid === loadedFor) return;
    loadedFor = sid;
    if (s) loadMyChars(); else setMyChars([]);
  });
}

// the generation in flight (one at a time): `$genCharLoading` = "" | "picture" | "queued" | "mesh" | "rig" | "store",
// `$genCharPct` the stage's own percent (0 = unknown), `$genCharError` = "" | an i18n error key, `$newChar` = the
// last body made (the grid rings it)
export const $genCharLoading = atom("");
export const $genCharPct = atom(0);
export const $genCharError = atom("");
export const $newChar = atom("");

// the CAST: which characters are on stage (1..MAX_CAST). A JSON id array; the engine lays them out as a crowd
// that fits the screen. The last one can't be removed (the stage is never empty); the cap keeps a phone alive —
// every character is a full rigged body with 2048 textures (owner, 2026-09-12: the whole 105-strong library
// is selectable, the stage is not a stadium).
export const MAX_CAST = 12;
export const DEFAULT_CAST = ["kaya", "michelle", "arissa"];
export const ALL_IDS = CHARACTERS.map((g) => g.id);
const allIds = () => [...ALL_IDS, ...getMyChars().map((c) => c.id)];
export const $cast = persistentAtom("afterdark:cast", JSON.stringify(DEFAULT_CAST));
export function getCast() {
  let a; try { a = JSON.parse($cast.get()); } catch { a = null; }
  const ok = allIds();
  a = Array.isArray(a) ? a.filter((id) => ok.includes(id)).slice(0, MAX_CAST) : [];
  return a.length ? a : DEFAULT_CAST.slice();
}
export const setCast = (next) => { if (next.length) $cast.set(JSON.stringify(next.slice(0, MAX_CAST))); };
/** Toggle a character; returns false when the cap refuses an addition (the tab shows the hint). */
export function toggleChar(id) {
  const c = getCast();
  if (c.includes(id)) { if (c.length > 1) setCast(c.filter((x) => x !== id)); return true; }
  if (c.length >= MAX_CAST) return false;
  setCast([...c, id]); return true;
}
/** A fresh crowd: MAX_CAST characters drawn at random from the whole library (and my own). */
export function mixCast(rand = Math.random) {
  const pool = allIds(); const out = [];
  while (out.length < MAX_CAST && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  setCast(out);
}

// the MOVES: which dances the floor may play. A JSON id array; default = the ★ picks. The 36 curated ids ship
// with the app; any other Mixamo motion id comes from the library (moves.json + the VPS clips). The last one
// can't be removed (the floor never runs dry). Clips load on demand.
export const $moves = persistentAtom("afterdark:moves", JSON.stringify(DEFAULT_MOVES));
export function getMoves() {
  let a; try { a = JSON.parse($moves.get()); } catch { a = null; }
  a = Array.isArray(a) ? a.filter((id) => MOVE_IDS.includes(id) || isMoveId(id)) : [];
  return a.length ? a : DEFAULT_MOVES.slice();
}
export const setMoves = (next) => { if (next.length) $moves.set(JSON.stringify(next)); };
export function toggleMove(id) { const m = getMoves(); setMoves(m.includes(id) ? (m.length > 1 ? m.filter((x) => x !== id) : m) : [...m, id]); }
