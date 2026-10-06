import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { VPS_PROXY } from "/_rt/feed.js";
import { gate } from "/_rt/gate.js";
import { dedupeVideos } from "/_rt/vfilter.js";
import { resolveSearch } from "/_rt/urlquery.js";
import { hostOf, sourceTitle, registrableDomain } from "/_rt/sitelabel.js";
import { collection, idbSupported } from "/_rt/db.js";
import { DEFAULT_SRC, GREY_PX, MOCK, GATE_SEARCH, GATE_SUBS, GATE_CAST } from "./presets.js";

export const $src = persistentAtom("reel:src", DEFAULT_SRC);

const subsDB = collection("reelSubs");

export const $subs = atom(gate ? GATE_SUBS : []);
if (idbSupported && !gate) subsDB.all().then((rows) => $subs.set(rows)).catch(() => {});
export async function subscribe(s) {
  if (!s?.url || $subs.get().some((x) => x.url === s.url)) return;
  const feed = $feedChannel.get();
  const avatar = s.avatar || avatarSeen.get(s.url) || (feed && feed.url === s.url ? feed.avatar : null) || null;
  const rec = { name: s.name || sourceTitle(s.url), url: s.url, ...(avatar ? { avatar } : {}) };
  $subs.set([{ id: s.url, ...rec }, ...$subs.get()]);
  try { await subsDB.put(s.url, rec); } catch { }
}
export async function unsubscribe(url) {
  $subs.set($subs.get().filter((x) => x.url !== url));
  try { await subsDB.remove(url); } catch { }
}
function renameSub(url, title) {
  const cur = $subs.get().find((x) => x.url === url);
  if (!cur || !title || cur.name === title) return;
  $subs.set($subs.get().map((x) => (x.url === url ? { ...x, name: title } : x)));
  subsDB.put(url, { name: title, url }).catch(() => { });
}

const sessDB = collection("reelSessions");
export const $sessions = atom({});
export const sessionsReady = idbSupported && !gate
  ? sessDB.all().then((rows) => $sessions.set(Object.fromEntries(rows.map((r) => [r.id, r.cookie])))).catch(() => {})
  : Promise.resolve();
export const sessionKey = (url) => registrableDomain(hostOf(url));
export const sessionFor = (url) => $sessions.get()[sessionKey(url)] || "";
export async function setSession(url, cookie) {
  const k = sessionKey(url), c = String(cookie || "").trim();
  const next = { ...$sessions.get() };
  if (c) next[k] = c; else delete next[k];
  $sessions.set(next);
  try { if (c) await sessDB.put(k, { cookie: c }); else await sessDB.remove(k); } catch { }
}
export const $sessSite = atom("");

const watchedDB = collection("reelWatched");
export const $watched = atom(new Set());
if (idbSupported && !gate) watchedDB.all().then((rows) => $watched.set(new Set(rows.map((r) => r.id)))).catch(() => {});
export function markWatched(url) {
  if (!url || $watched.get().has(url)) return;
  const s = new Set($watched.get()); s.add(url); $watched.set(s);
  watchedDB.put(url, {}).catch(() => {});
}
export function clearWatched() { $watched.set(new Set()); watchedDB.clear().catch(() => {}); }
export const unseen = (arr) => arr.filter((i) => !$watched.get().has(i.orig || i.video));

const likesDB = collection("reelLikes");
const likeId = (i) => i.orig || i.video;
const GATE_LIKES = MOCK.slice(0, 3).map((i, n) => ({ id: likeId(i), video: i.video, orig: null, poster: n === 0 ? GREY_PX : null, page: i.page, title: i.title, host: hostOf(i.page), eph: false, ts: 1000 - n }));
export const $likes = atom(gate ? GATE_LIKES : []);
if (idbSupported && !gate) likesDB.all().then((rows) => $likes.set(rows)).catch(() => {});
export function addLike(i) {
  const id = likeId(i); if (!id || $likes.get().some((l) => l.id === id)) return;
  const rec = { id, video: i.video, orig: i.orig || null, poster: i.poster || null, page: i.page || null, title: i.title || null, host: hostOf(i.page || i.orig || i.video), eph: i.eph != null ? i.eph : $ephemeral.get(), ts: Date.now() };
  $likes.set([rec, ...$likes.get()]);
  likesDB.put(id, rec).catch(() => { });
}
export function unlike(id) {
  $likes.set($likes.get().filter((l) => l.id !== id));
  likesDB.remove(id).catch(() => {});
}

export const $items = atom(gate ? dedupeVideos(MOCK) : []);
export const $next = atom(null);
export const $loading = atom(!gate);
export const $err = atom(false);
export const $active = atom(0);
export const $ephemeral = atom(false);
export const $srcTitle = atom(sourceTitle(DEFAULT_SRC));
export const $srcHint = atom("");
export function setSrcTitle(url, opts) {
  const title = sourceTitle(url, opts);
  $srcTitle.set(title);
  renameSub(url, title);
  return title;
}

export const $frames = atom([]);
export const $restoreTo = atom(null);
export const $owner = atom("reel");

export const $feedChannel = atom(null);

export const $full = atom(null);

export const avatarSeen = new Map();
const avatarWait = new Map();
export function accountAvatar(url) {
  if (!url || gate) return Promise.resolve(null);
  if (avatarSeen.has(url)) return Promise.resolve(avatarSeen.get(url));
  if (avatarWait.has(url)) return avatarWait.get(url);
  const p = fetch(`${VPS_PROXY}/avatar?url=${encodeURIComponent(url)}`, { headers: { "x-ms-egress": "reel" } })
    .then((r) => r.json()).then((d) => d?.avatar || null).catch(() => null)
    .then((v) => { avatarSeen.set(url, v); avatarWait.delete(url); return v; });
  avatarWait.set(url, p);
  return p;
}

export const $drawer = atom("");

export const $searchBases = persistentAtom("reel:searchbase", {}, { encode: JSON.stringify, decode: JSON.parse });
if (gate) $searchBases.set({ ...$searchBases.get(), [hostOf(DEFAULT_SRC)]: GATE_SEARCH });
export function rememberSearch(url, example) {
  if (!example) return;
  const host = hostOf(url); if (!host) return;
  const cur = $searchBases.get();
  if (cur[host] === example) return;
  $searchBases.set({ ...cur, [host]: example });
}
export const searchBaseFor = (url, bases) => {
  if (!url) return "";
  if (resolveSearch(url).searchable) return url;
  return (bases || $searchBases.get())[hostOf(url)] || "";
};

export const $cast = atom({ page: "", loading: false, people: [], err: false });
export async function pullCast(page) {
  if (!page) return;
  const cur = $cast.get();
  if (cur.page === page && !cur.err) return;
  $cast.set({ page, loading: true, people: [], err: false });
  if (gate) { $cast.set({ page, loading: false, people: GATE_CAST, err: false }); return; }
  try {
    const r = await fetch(`${VPS_PROXY}/cast?url=${encodeURIComponent(page)}`, { headers: { "x-ms-egress": "reel" } });
    const d = await r.json();
    if ($cast.get().page !== page) return;
    $cast.set({ page, loading: false, people: Array.isArray(d.people) ? d.people : [], err: !!d.error });
  } catch {
    if ($cast.get().page === page) $cast.set({ page, loading: false, people: [], err: true });
  }
}
