// afterdark — the WORKING SET shared by the stage and the cast tab: who is on stage, which moves the floor may
// play. Persisted per viewer; the stage subscribes and drives the 3D engine, the cast tab edits.
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { CHARACTERS, registerChars } from "./characters.js";
import { DEFAULT_MOVES, MOVE_IDS, isMoveId } from "./dances.js";

// MY CHARACTERS: the ones this viewer made from a prompt (genchar.js) — {id, name, tint, kind, glb, avatar, ts},
// newest first. The body lives on the edge (/feed/character/<id>.glb, immutable); the avatar is a small data
// URL so the grid needs no network for it. Registered into characters.js so the stage resolves them like the library.
export const $myChars = persistentAtom("afterdark:myChars", "[]");
export function getMyChars() {
  let a; try { a = JSON.parse($myChars.get()); } catch { a = null; }
  return Array.isArray(a) ? a.filter((c) => c && typeof c.id === "string" && typeof c.glb === "string") : [];
}
export const addMyChar = (c) => $myChars.set(JSON.stringify([c, ...getMyChars().filter((x) => x.id !== c.id)]));
export function removeMyChar(id) {
  $myChars.set(JSON.stringify(getMyChars().filter((x) => x.id !== id)));
  const c = getCast().filter((x) => x !== id); if (c.length) setCast(c);
}
registerChars(getMyChars());
$myChars.listen(() => registerChars(getMyChars()));

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
