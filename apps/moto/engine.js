import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { geo, motion, wakeLock, haptic } from "/_rt/sensors.js";
import { collection } from "/_rt/db.js";
import { gate } from "/_rt/gate.js";
import { dayKey } from "/_rt/calendar.js";
import { mulberry32 } from "/_rt/groove.js";
import { KMH, tripInit, tripStep, leanInit, leanStep, leanStats, leanTrack, dayRecord } from "/_rt/ride.js";

const DAYS = collection("moto");

export const $skin = persistentAtom("moto:skin", "classic");
export const $limit = persistentAtom("moto:limit", "0");
export const $seen = persistentAtom("moto:seen", "");

const wave = (n, seed) => Array.from({ length: n }, (_, i) => Math.max(0, Math.round(74 + 38 * Math.sin(i / 7 + seed) + 22 * Math.sin(i / 2.3 + seed * 3))));
const SAMPLE_DAY = { dist: 342600, moveMs: 4 * 3600e3 + 12 * 60e3, max: 188 / KMH, best: 4.3, series: wave(180, 1), bucketMs: 80000, maxL: 41, maxR: 38, corners: 127 };
const SAMPLE_TRIP = { ...tripInit(SAMPLE_DAY), v: 128 / KMH, raw: 128 / KMH, moving: true, heading: 47 };
const SAMPLE_LEAN = { deg: 34, maxL: 41, maxR: 38, corners: 127 };
const NO_LEAN = { deg: null, maxL: 0, maxR: 0, corners: 0 };

export const $on = atom(gate);
export const $trip = atom(gate ? SAMPLE_TRIP : tripInit());
export const $lean = atom(gate ? SAMPLE_LEAN : NO_LEAN);
export const $err = atom(null);
export const $over = atom(false);
export const $days = atom(new Map());

let loaded = null, key = "", stopGeo = null, stopMotion = null, lock = null, dog = null;
let lean = leanInit(), stats = leanStats(), lastT = 0, lastPub = 0, fixAt = 0, saveAt = 0;

function sampleDays() {
  const rnd = mulberry32(0x6d6f746f), out = new Map(), now = new Date();
  for (let back = 45; back >= 1; back--) {
    const skip = rnd() < 0.45;
    const dist = 20000 + rnd() * 260000, avg = 12 + rnd() * 10;
    const day = {
      dist: Math.round(dist), moveMs: Math.round(dist / avg * 1000), max: Math.round((28 + rnd() * 26) * 100) / 100,
      best: rnd() < 0.6 ? Math.round((3.6 + rnd() * 3) * 10) / 10 : null, series: wave(60 + Math.floor(rnd() * 120), back),
      bucketMs: 5000, maxL: Math.round(22 + rnd() * 22), maxR: Math.round(22 + rnd() * 22), corners: Math.floor(rnd() * 90),
    };
    if (skip && back > 2 && back % 4) continue;
    out.set(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back)), day);
  }
  out.set(dayKey(now), SAMPLE_DAY);
  return out;
}

export function loadDays() {
  loaded ||= (async () => {
    if (gate) { $days.set(sampleDays()); return; }
    try {
      const rows = await DAYS.all();
      $days.set(new Map(rows.map(({ id, _ts, ...day }) => [id, day])));
    } catch { }
    if (!$on.get()) open(Date.now());
  })();
  return loaded;
}

function save() {
  if (gate || !key) return;
  const day = dayRecord($trip.get(), stats);
  if (!(day.dist > 0)) return;
  const next = new Map($days.get());
  next.set(key, day);
  $days.set(next);
  DAYS.put(key, day).catch(() => { });
}

function open(now) {
  key = dayKey(new Date(now));
  const day = $days.get().get(key);
  $trip.set(tripInit(day));
  stats = leanStats(day);
  $lean.set({ deg: null, maxL: stats.maxL, maxR: stats.maxR, corners: stats.corners });
}

function warn(v, buzz) {
  const lim = Number($limit.get()) || 0, k = v == null ? 0 : v * KMH, was = $over.get();
  const now = lim > 0 && k > lim + (was ? 1 : 3);
  if (now === was) return;
  $over.set(now);
  if (now && buzz) haptic.buzz([200, 100, 200]);
}
$limit.listen(() => warn($trip.get().v));
if (gate) warn(SAMPLE_TRIP.v);

function onFix(p) {
  const now = Date.now();
  if (dayKey(new Date(now)) !== key) { save(); open(now); }
  const trip = tripStep($trip.get(), { ...p, t: p.t || now });
  fixAt = now;
  $trip.set(trip);
  $err.set(null);
  warn(trip.v, true);
  if (now - saveAt > 15000) { saveAt = now; save(); }
}

// A speed nobody has confirmed for 5 s is not shown: a frozen 90 in a tunnel is worse than dashes.
function stale() {
  const trip = $trip.get();
  if (trip.v != null && Date.now() - fixAt > 5000) $trip.set({ ...trip, v: null, raw: null });
}

const screenAngle = () => {
  const a = (typeof screen !== "undefined" && screen.orientation?.angle) ?? (typeof window !== "undefined" ? window.orientation : 0) ?? 0;
  return ((a % 360) + 360) % 360;
};

function onMotion(s) {
  if (!s.rot) return;
  const dt = lastT ? (s.t - lastT) / 1000 : 0;
  lastT = s.t;
  const v = Date.now() - fixAt < 3000 ? $trip.get().raw : null;
  lean = leanStep(lean, s, v, dt, screenAngle());
  if (!lean.frame) return;
  stats = leanTrack(stats, lean.phi, v, dt);
  if (s.t - lastPub < 120) return;
  lastPub = s.t;
  $lean.set({ deg: lean.phi, maxL: stats.maxL, maxR: stats.maxR, corners: stats.corners });
}

// motion.request() must be the first thing the tap does: iOS grants it only inside the gesture, and an
// await before it would spend the gesture on IndexedDB.
export async function start() {
  if ($on.get()) return;
  const granted = gate ? null : motion.request();
  $on.set(true);
  $err.set(null);
  if (gate) { $trip.set(SAMPLE_TRIP); $lean.set(SAMPLE_LEAN); warn(SAMPLE_TRIP.v); return; }
  await loadDays();
  if (!$on.get()) return;
  open(Date.now());
  lean = leanInit(); lastT = 0; lastPub = 0; fixAt = 0; saveAt = Date.now();
  lock = wakeLock.acquire();
  dog = setInterval(stale, 1000);
  stopGeo = geo.watch(onFix, (e) => $err.set(e), { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  if ((await granted) && $on.get()) stopMotion = motion.start(onMotion);
}

export function stop() {
  if (!$on.get()) return;
  $on.set(false);
  stopGeo?.(); stopMotion?.(); lock?.release(); clearInterval(dog);
  stopGeo = stopMotion = lock = dog = null;
  save();
  $over.set(false);
  $err.set(null);
  $trip.set({ ...$trip.get(), v: null, raw: null, last: null, moving: false });
  $lean.set({ ...$lean.get(), deg: null });
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && $on.get()) save(); });
}
