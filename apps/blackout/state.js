// blackout — the state: skins (afterdark's 11 bundled Mixamo characters, priced in coins), the wallet, the
// record, and the live run the stage mirrors into the DOM. Under the gate the run is a fixed populated frame.
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { gate } from "/_rt/gate.js";

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
const BUNDLED = new Set(["arissa"]);   // the default skin ships with the app (offline); the rest are afterdark's, same origin
export const skinById = (id) => SKINS.find((s) => s.id === id) || SKINS[0];   // a stored id that left the list → the default
export const avatarUrl = (id) => new URL(`assets/av-${skinById(id).id}.png`, import.meta.url).href;
export const glbUrl = (id) => { const s = skinById(id).id; return new URL(BUNDLED.has(s) ? `assets/${s}.glb` : `../afterdark/assets/${s}.glb`, import.meta.url).href; };

const NS = "blackout:";
export const $best = persistentAtom(`${NS}best`, "0");
export const $coins = persistentAtom(`${NS}coins`, "0");
export const $runs = persistentAtom(`${NS}runs`, "0");
export const $skin = persistentAtom(`${NS}skin`, "arissa");
export const $owned = persistentAtom(`${NS}owned`, '["arissa"]');
export const owned = () => { try { const a = JSON.parse($owned.get()); return Array.isArray(a) ? a : ["arissa"]; } catch { return ["arissa"]; } };

// the live run: idle (cover) | run | over (card). The stage writes $run ~6×/s; the HUD reads it.
export const $state = atom(gate ? "run" : "idle");
export const $run = atom(gate ? { frame: 240, dist: 128, coins: 7, gap: 18, speed: 4.2, fps: 0 } : { frame: 0, dist: 0, coins: 0, gap: 30, speed: 0, fps: 0 });
export const $phys = atom(gate ? "skipped" : "loading");
export const $why = atom("");
export const $last = atom({ dist: 0, coins: 0, record: false });   // the run just finished (the card)

if (gate) { $coins.set("50"); $best.set("340"); $owned.set('["arissa"]'); $skin.set("arissa"); }

// a skin tap: owned → select; affordable → buy + select; else nothing (the card shows the price)
export function pickSkin(id) {
  const s = skinById(id), have = owned();
  if (!have.includes(s.id)) {
    const c = +$coins.get() || 0;
    if (c < s.price) return false;
    $coins.set(String(c - s.price));
    $owned.set(JSON.stringify([...have, s.id]));
  }
  $skin.set(s.id);
  return true;
}

// the run ends: bank the coins, the record, the count
export function finishRun(dist, coins) {
  const d = Math.round(dist), record = d > (+$best.get() || 0);
  if (record) $best.set(String(d));
  $coins.set(String((+$coins.get() || 0) + coins));
  $runs.set(String((+$runs.get() || 0) + 1));
  $last.set({ dist: d, coins, record });
  $state.set("over");
}
