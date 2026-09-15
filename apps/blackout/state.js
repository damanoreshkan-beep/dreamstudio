// blackout — the state: the runners (afterdark's 11 bundled Mixamo characters priced in coins + the ones this
// viewer made from words or a photo), the wallet, the record, and the live run the stage mirrors into the DOM.
// Under the gate the run is a fixed populated frame.
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { gate } from "/_rt/gate.js";
import { session } from "/_rt/auth.js";
import { fetchMyChars, removeChar } from "/_rt/genchar.js";
import { makeWallet } from "/_rt/wallet.js";

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
export const $runs = persistentAtom(`${NS}runs`, "0");
export const $skin = persistentAtom(`${NS}skin`, "arissa");
export const $muted = persistentAtom(`${NS}muted`, "0");   // "1" = the effects and the stream are silent (the beat clock free-runs)
export const $weapon = persistentAtom(`${NS}weapon`, "pistol");

// THE WALLET is the farm's (rt/wallet.js, 2026-09-15): the balance and what is bought live on the edge, per account.
// A skin is the item `skin:<id>`, a weapon `arm:<id>`; the prices above are display copies of the edge's catalogue.
// Under the gate: a local wallet of 1250.
export const wallet = makeWallet("blackout", { gateBalance: 1250 });
export const { $wallet, $bought } = wallet;
export const ownsSkin = (id) => { const s = skinById(id); return !!s.glb || wallet.owns(`skin:${s.id}`, s.price); };
export const ownsArm = (id) => { const w = weaponById(id); return wallet.owns(`arm:${w.id}`, w.price); };
// what she actually wears and wields: a stored pick the wallet does not own (signed out, another account) falls back
// to the free one — but only once the wallet has answered, so a boot does not swap her body twice
export const wornSkin = (id) => (!$wallet.get().ready || ownsSkin(id) ? id : "arissa");
export const wieldedArm = (id) => (!$wallet.get().ready || ownsArm(id) ? id : "pistol");
// a weapon tap: owned → wield; else the edge buys it and it is wielded. Resolves the buy's outcome ("ok" | "poor" | "eSignIn" | "error").
export async function pickWeapon(id) {
  const w = weaponById(id);
  const r = ownsArm(w.id) ? "ok" : await wallet.buy(`arm:${w.id}`, w.price);
  if (r === "ok") $weapon.set(w.id);
  return r;
}
export const muted = () => $muted.get() === "1";
// the mix: four levels 0…1 over sound.js's own balance — the whole game, the stream, the effects (her, the horde, the
// arms), the city (wind, lamps, crows, sirens, bats). Music at 0 does not just go quiet: the stream is not fetched.
export const MIX = { master: 1, music: 1, sfx: 1, city: 1 };
export const $mix = persistentAtom(`${NS}mix`, JSON.stringify(MIX));
export const mix = () => { try { const m = JSON.parse($mix.get()); return Object.fromEntries(Object.keys(MIX).map((k) => [k, Number.isFinite(m?.[k]) ? Math.max(0, Math.min(1, m[k])) : MIX[k]])); } catch { return { ...MIX }; } };
export const setMix = (k, v) => $mix.set(JSON.stringify({ ...mix(), [k]: v }));

// the live run: idle (cover) | run | over (card). The stage writes $run ~6×/s; the HUD reads it.
// `near` = how close the horde is, 0 (out in the murk) … 1 (at the heels) — the HUD's red edge.
export const $state = atom(gate ? "run" : "idle");
export const $run = atom(gate ? { frame: 240, dist: 128, coins: 7, speed: 7.1, fps: 0, lane: 1, near: 0.35, boost: 4, ammo: 6, reload: false, kills: 2 } : { frame: 0, dist: 0, coins: 0, speed: 0, fps: 0, lane: 1, near: 0, boost: 0, ammo: 8, reload: false, kills: 0 });
export const $phys = atom(gate ? "skipped" : "loading");
export const $why = atom("");
// the run just finished (the card): `coins` picked up, `granted` what the wallet kept (null while the edge answers),
// `kept` false for a guest — nothing was saved
export const $last = atom({ dist: 0, coins: 0, granted: null, kept: null, record: false });

// the generation in flight (one at a time): "" | look | picture | queued | mesh | rig | store
export const $genLoading = atom("");
export const $genPct = atom(0);
export const $genError = atom("");
export const $newChar = atom("");

if (gate) { $best.set("340"); $skin.set("arissa"); $weapon.set("pistol"); $myChars.set('[{"id":"my-gate1","name":"Nox","tint":"#7C5CFF","kind":"human","glb":"about:blank","avatar":"","ts":0}]'); }

// a skin tap: owned (or mine) → select; else the edge buys it and it is worn. Resolves the buy's outcome.
export async function pickSkin(id) {
  const s = skinById(id);
  const r = ownsSkin(s.id) ? "ok" : await wallet.buy(`skin:${s.id}`, s.price);
  if (r === "ok") $skin.set(s.id);
  return r;
}

// a run starts: the wallet's ticket is asked for now (a guest gets none) — the run does not wait for it
let ticket = Promise.resolve(null);
export const beginRun = () => { ticket = wallet.startRun(); };
// the run ends: the record, the count, the card — then the wallet claims the coins and the card shows what it kept
export function finishRun(dist, coinsGot) {
  const d = Math.round(dist), record = d > (+$best.get() || 0);
  if (record) $best.set(String(d));
  $runs.set(String((+$runs.get() || 0) + 1));
  $last.set({ dist: d, coins: coinsGot, granted: null, kept: null, record });
  $state.set("over");
  const mine = ticket; ticket = Promise.resolve(null);
  wallet.finishRun(mine, coinsGot).then(({ granted, kept }) => { if ($last.get().dist === d) $last.set({ ...$last.get(), granted, kept }); });
}
