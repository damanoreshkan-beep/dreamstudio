import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { gate } from "/_rt/gate.js";
import { session } from "/_rt/auth.js";
import { fetchMyChars, removeChar } from "/_rt/genchar.js";
import { makeWallet } from "/_rt/wallet.js";

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
export const GEN_PRICE = 1000;
export const WEAPONS = [
  { id: "pistol", name: "Pistol", price: 0, dmg: 1, rate: 3, mag: 8, reloadS: 1.1, lanes: 0, range: 28, tint: "#F5B942", sfx: "shot-pistol" },
  { id: "shotgun", name: "Shotgun", price: 350, dmg: 2, rate: 1.2, mag: 4, reloadS: 1.6, lanes: 1, range: 14, tint: "#FB7185", sfx: "shot-shotgun" },
  { id: "smg", name: "SMG", price: 600, dmg: 1, rate: 8, mag: 24, reloadS: 1.4, lanes: 0, range: 24, tint: "#22D3EE", sfx: "shot-smg" },
];
export const weaponById = (id) => WEAPONS.find((w) => w.id === id) || WEAPONS[0];
const BUNDLED = new Set(["arissa"]);

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
  if (loadedFor) setTimeout(loadMyChars, 0);
  session.listen((s) => { const sid = s ? s.sid : ""; if (sid === loadedFor) return; loadedFor = sid; if (s) loadMyChars(); else setMyChars([]); });
}

export const skinById = (id) => SKINS.find((s) => s.id === id) || myChars().find((c) => c.id === id) || SKINS[0];
export const avatarUrl = (id) => { const s = skinById(id); return s.avatar || new URL(`assets/av-${s.id}.png`, import.meta.url).href; };
export const glbUrl = (id) => { const s = skinById(id); if (s.glb) return s.glb; return new URL(BUNDLED.has(s.id) ? `assets/${s.id}.glb` : `../afterdark/assets/${s.id}.glb`, import.meta.url).href; };

const NS = "blackout:";
export const $best = persistentAtom(`${NS}best`, "0");
export const $runs = persistentAtom(`${NS}runs`, "0");
export const $skin = persistentAtom(`${NS}skin`, "arissa");
export const $muted = persistentAtom(`${NS}muted`, "0");
export const $weapon = persistentAtom(`${NS}weapon`, "pistol");

export const wallet = makeWallet("blackout", { gateBalance: 1250 });
export const { $wallet, $bought } = wallet;
export const ownsSkin = (id) => { const s = skinById(id); return !!s.glb || wallet.owns(`skin:${s.id}`, s.price); };
export const ownsArm = (id) => { const w = weaponById(id); return wallet.owns(`arm:${w.id}`, w.price); };
export const wornSkin = (id) => (!$wallet.get().ready || ownsSkin(id) ? id : "arissa");
export const wieldedArm = (id) => (!$wallet.get().ready || ownsArm(id) ? id : "pistol");
export async function pickWeapon(id) {
  const w = weaponById(id);
  const r = ownsArm(w.id) ? "ok" : await wallet.buy(`arm:${w.id}`, w.price);
  if (r === "ok") $weapon.set(w.id);
  return r;
}
export const muted = () => $muted.get() === "1";
export const MIX = { master: 1, music: 1, sfx: 1, city: 1 };
export const $mix = persistentAtom(`${NS}mix`, JSON.stringify(MIX));
export const mix = () => { try { const m = JSON.parse($mix.get()); return Object.fromEntries(Object.keys(MIX).map((k) => [k, Number.isFinite(m?.[k]) ? Math.max(0, Math.min(1, m[k])) : MIX[k]])); } catch { return { ...MIX }; } };
export const setMix = (k, v) => $mix.set(JSON.stringify({ ...mix(), [k]: v }));

export const $state = atom(gate ? "run" : "idle");
export const $run = atom(gate ? { frame: 240, dist: 128, coins: 7, speed: 7.1, fps: 0, lane: 1, near: 0.35, boost: 4, ammo: 6, reload: false, kills: 2 } : { frame: 0, dist: 0, coins: 0, speed: 0, fps: 0, lane: 1, near: 0, boost: 0, ammo: 8, reload: false, kills: 0 });
export const $phys = atom(gate ? "skipped" : "loading");
export const $why = atom("");
export const $last = atom({ dist: 0, coins: 0, granted: null, kept: null, record: false });

export const $genLoading = atom("");
export const $genPct = atom(0);
export const $genError = atom("");
export const $newChar = atom("");

if (gate) { $best.set("340"); $skin.set("arissa"); $weapon.set("pistol"); $myChars.set('[{"id":"my-gate1","name":"Nox","tint":"#7C5CFF","kind":"human","glb":"about:blank","avatar":"","ts":0}]'); }

export async function pickSkin(id) {
  const s = skinById(id);
  const r = ownsSkin(s.id) ? "ok" : await wallet.buy(`skin:${s.id}`, s.price);
  if (r === "ok") $skin.set(s.id);
  return r;
}

let ticket = Promise.resolve(null);
export const beginRun = () => { ticket = wallet.startRun(); };
export function finishRun(dist, coinsGot) {
  const d = Math.round(dist), record = d > (+$best.get() || 0);
  if (record) $best.set(String(d));
  $runs.set(String((+$runs.get() || 0) + 1));
  $last.set({ dist: d, coins: coinsGot, granted: null, kept: null, record });
  $state.set("over");
  const mine = ticket; ticket = Promise.resolve(null);
  wallet.finishRun(mine, coinsGot).then(({ granted, kept }) => { if ($last.get().dist === d) $last.set({ ...$last.get(), granted, kept }); });
}
