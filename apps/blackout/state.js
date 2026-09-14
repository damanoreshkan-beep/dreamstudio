// blackout — the state: the runners (afterdark's 11 bundled Mixamo characters priced in coins + the ones this
// viewer made from words or a photo), the wallet, the record, and the live run the stage mirrors into the DOM.
// Under the gate the run is a fixed populated frame.
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { gate } from "/_rt/gate.js";
import { session } from "/_rt/auth.js";
import { fetchMyChars, removeChar } from "/_rt/genchar.js";
import { watchPurchases } from "/_rt/coins.js";

// afterdark's cast. Kaya (and Louise, Sophie) T-posed until 2026-09-13: the converter wrote duplicate bone chains
// and the clips drove a leaf copy — fixed in the assets (pipeline collapse-bones), not here.
export const SKINS = [
  { id: "arissa", name: "Arissa", tint: "#F5B942", price: 0 },
  { id: "kaya", name: "Kaya", tint: "#FF3EB5", price: 20 },
  { id: "michelle", name: "Michelle", tint: "#39FF6A", price: 25 },
  { id: "eve", name: "Eve", tint: "#7C5CFF", price: 40 },
  { id: "sophie", name: "Sophie", tint: "#22D3EE", price: 60 },
  { id: "nightshade", name: "Nightshade", tint: "#FF6AD5", price: 80 },
  { id: "louise", name: "Louise", tint: "#4ADE80", price: 100 },
  { id: "kachujin", name: "Kachujin", tint: "#FB7185", price: 120 },
  { id: "jolleen", name: "Jolleen", tint: "#FBBF24", price: 150 },
  { id: "pirate", name: "Pirate", tint: "#38BDF8", price: 180 },
  { id: "akai", name: "Akai", tint: "#F472B6", price: 220 },
];
export const GEN_PRICE = 1000;   // a runner of your own — from words or a photo (owner, 2026-09-13)
// THE ARMOURY (owner, 2026-09-13: «пистолет … різні мають бути зброя … у магазині можна купити»): a tap fires down her
// lane. `dmg` in walker hit points (a walker has 2), `rate` shots/s, `mag` rounds before the reload (`reloadS`),
// `lanes` = how many lanes either side the shot also covers (the shotgun's spread), `range` metres.
export const WEAPONS = [
  { id: "pistol", name: "Pistol", price: 0, dmg: 1, rate: 3, mag: 8, reloadS: 1.1, lanes: 0, range: 28, tint: "#F5B942", sfx: "shot-pistol" },
  { id: "shotgun", name: "Shotgun", price: 350, dmg: 2, rate: 1.2, mag: 4, reloadS: 1.6, lanes: 1, range: 14, tint: "#FB7185", sfx: "shot-shotgun" },
  { id: "smg", name: "SMG", price: 600, dmg: 1, rate: 8, mag: 24, reloadS: 1.4, lanes: 0, range: 24, tint: "#22D3EE", sfx: "shot-smg" },
];
export const weaponById = (id) => WEAPONS.find((w) => w.id === id) || WEAPONS[0];
const BUNDLED = new Set(["arissa"]);   // the default skin ships with the app (offline); the rest are afterdark's, same origin

// MY RUNNERS — the ones this viewer made ({id: "my-…", name, tint, kind, glb, avatar, ts}, newest first). The row of
// truth is on the edge (keyed by the sealed session); this is a persisted MIRROR so the grid resolves them before
// the network answers, refreshed on every session change, emptied on sign-out.
export const $myChars = persistentAtom("blackout:myChars", "[]");
export function myChars() { let a; try { a = JSON.parse($myChars.get()); } catch { a = null; } return Array.isArray(a) ? a.filter((c) => c && typeof c.id === "string" && typeof c.glb === "string") : []; }
const setMyChars = (list) => $myChars.set(JSON.stringify(list));
export const addMyChar = (c) => setMyChars([c, ...myChars().filter((x) => x.id !== c.id)]);
export async function removeMyChar(id) {
  setMyChars(myChars().filter((x) => x.id !== id));
  if ($skin.get() === id) $skin.set("arissa");
  if (!gate) await removeChar(id);
}
const sidNow = () => { try { return localStorage.getItem("ms:gh:sid") || ""; } catch { return ""; } };
async function loadMyChars() { const list = await fetchMyChars(); if (list) setMyChars(list); }
if (!gate) {
  let loadedFor = sidNow();
  if (loadedFor) setTimeout(loadMyChars, 0);   // after /_rt/index.js has installed the sealed fetch that carries the sid
  session.listen((s) => { const sid = s ? s.sid : ""; if (sid === loadedFor) return; loadedFor = sid; if (s) loadMyChars(); else setMyChars([]); });
}

export const skinById = (id) => SKINS.find((s) => s.id === id) || myChars().find((c) => c.id === id) || SKINS[0];   // a stored id that left the list → the default
export const avatarUrl = (id) => { const s = skinById(id); return s.avatar || new URL(`assets/av-${s.id}.png`, import.meta.url).href; };
export const glbUrl = (id) => { const s = skinById(id); if (s.glb) return s.glb; return new URL(BUNDLED.has(s.id) ? `assets/${s.id}.glb` : `../afterdark/assets/${s.id}.glb`, import.meta.url).href; };

const NS = "blackout:";
export const $best = persistentAtom(`${NS}best`, "0");
export const $coins = persistentAtom(`${NS}coins`, "0");
export const $runs = persistentAtom(`${NS}runs`, "0");
export const $skin = persistentAtom(`${NS}skin`, "arissa");
export const $owned = persistentAtom(`${NS}owned`, '["arissa"]');
export const $muted = persistentAtom(`${NS}muted`, "0");   // "1" = the effects and the stream are silent (the beat clock free-runs)
export const $weapon = persistentAtom(`${NS}weapon`, "pistol");
export const $arms = persistentAtom(`${NS}arms`, '["pistol"]');
export const arms = () => { try { const a = JSON.parse($arms.get()); return Array.isArray(a) ? a : ["pistol"]; } catch { return ["pistol"]; } };
// a weapon tap: owned → wield; affordable → buy + wield; else nothing (the card shows the price)
export function pickWeapon(id) {
  const w = weaponById(id), have = arms();
  if (!have.includes(w.id)) { if (!spend(w.price)) return false; $arms.set(JSON.stringify([...have, w.id])); }
  $weapon.set(w.id);
  return true;
}
export const muted = () => $muted.get() === "1";
// the mix: four levels 0…1 over sound.js's own balance — the whole game, the stream, the effects (her, the horde, the
// arms), the city (wind, lamps, crows, sirens, bats). Music at 0 does not just go quiet: the stream is not fetched.
export const MIX = { master: 1, music: 1, sfx: 1, city: 1 };
export const $mix = persistentAtom(`${NS}mix`, JSON.stringify(MIX));
export const mix = () => { try { const m = JSON.parse($mix.get()); return Object.fromEntries(Object.keys(MIX).map((k) => [k, Number.isFinite(m?.[k]) ? Math.max(0, Math.min(1, m[k])) : MIX[k]])); } catch { return { ...MIX }; } };
export const setMix = (k, v) => $mix.set(JSON.stringify({ ...mix(), [k]: v }));
export const owned = () => { try { const a = JSON.parse($owned.get()); return Array.isArray(a) ? a : ["arissa"]; } catch { return ["arissa"]; } };
export const coins = () => +$coins.get() || 0;
/** Take `n` coins from the wallet; false when it cannot afford them. */
export function spend(n) { const c = coins(); if (c < n) return false; $coins.set(String(c - n)); return true; }
export const refund = (n) => $coins.set(String(coins() + n));
/** Coins bought in Telegram Stars land here — the claim answers once per purchase, so the wallet grows exactly once. */
export const $bought = atom(0);   // the last claim's coins, for the toast
export const credit = (n) => { if (n > 0) { $coins.set(String(coins() + n)); $bought.set(n); } };
if (!gate) watchPurchases(credit);   // on boot and whenever the page comes back from Telegram

// the live run: idle (cover) | run | over (card). The stage writes $run ~6×/s; the HUD reads it.
// `near` = how close the horde is, 0 (out in the murk) … 1 (at the heels) — the HUD's red edge.
export const $state = atom(gate ? "run" : "idle");
export const $run = atom(gate ? { frame: 240, dist: 128, coins: 7, speed: 7.1, fps: 0, lane: 1, near: 0.35, boost: 4, ammo: 6, reload: false, kills: 2 } : { frame: 0, dist: 0, coins: 0, speed: 0, fps: 0, lane: 1, near: 0, boost: 0, ammo: 8, reload: false, kills: 0 });
export const $phys = atom(gate ? "skipped" : "loading");
export const $why = atom("");
export const $last = atom({ dist: 0, coins: 0, record: false });   // the run just finished (the card)

// the generation in flight (one at a time): "" | look | picture | queued | mesh | rig | store
export const $genLoading = atom("");
export const $genPct = atom(0);
export const $genError = atom("");
export const $newChar = atom("");

if (gate) { $coins.set("1250"); $best.set("340"); $owned.set('["arissa"]'); $skin.set("arissa"); $myChars.set('[{"id":"my-gate1","name":"Nox","tint":"#7C5CFF","kind":"human","glb":"about:blank","avatar":"","ts":0}]'); }

// a skin tap: owned (or mine) → select; affordable → buy + select; else nothing (the card shows the price)
export function pickSkin(id) {
  const s = skinById(id), have = owned();
  if (!s.glb && !have.includes(s.id)) {
    if (!spend(s.price)) return false;
    $owned.set(JSON.stringify([...have, s.id]));
  }
  $skin.set(s.id);
  return true;
}

// the run ends: bank the coins, the record, the count
export function finishRun(dist, coinsGot) {
  const d = Math.round(dist), record = d > (+$best.get() || 0);
  if (record) $best.set(String(d));
  $coins.set(String(coins() + coinsGot));
  $runs.set(String((+$runs.get() || 0) + 1));
  $last.set({ dist: d, coins: coinsGot, record });
  $state.set("over");
}
