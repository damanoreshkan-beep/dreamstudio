// songstore — fonoteka's songs KEPT ON THE PHONE (owner, 2026-10-09: songs must play with no network; every song
// on the shelf is kept, automatically). The service worker cannot do it: it never caches /feed and skips Range,
// so a song only ever streamed. The page keeps the bytes itself, in one Cache Storage bucket that also holds the
// last shelf it read — a cold start in a dead zone still has its list.
//   · plan        — what to pull and what to drop, from the shelf and what the phone holds (pure)
//   · songStore   — the bucket: held ids, a song's Blob, put/drop, the saved shelf
//   · keeper      — one song at a time, newest first, resumable over a weak link (task.js fetchResumable); a song
//                   deleted mid-pull is aborted, a song the edge refuses (4xx) is left for the next launch
// The bucket is NOT named `ms-fonoteka-…`: sw-core's activate sweeps that prefix on every new version.
import { fetchResumable, TaskError } from "./task.js";

export const BUCKET = "fonoteka-songs";
const BASE = "https://fonoteka.invalid/";   // cache keys only, never fetched — .invalid cannot resolve
const SONG = `${BASE}song/`;
const SHELF = `${BASE}shelf.json`;

/** What the phone must pull (shelf order) and drop (no longer on the shelf). */
export function plan(songs, held) {
  const want = new Set(songs.map((s) => s.id));
  return { get: songs.filter((s) => !held.has(s.id)).map((s) => s.id), drop: [...held].filter((id) => !want.has(id)) };
}

/** The bucket, in the window's CacheStorage (the unit test hands in its own — Deno's Cache has no keys()). */
export function songStore(bucket = BUCKET, storage = globalThis.caches) {
  const open = () => storage.open(bucket);
  return {
    async held() { return new Set((await (await open()).keys()).map((r) => r.url).filter((u) => u.startsWith(SONG)).map((u) => u.slice(SONG.length))); },
    async blob(id) { const r = await (await open()).match(SONG + id); return r ? r.blob() : null; },
    async put(id, blob) { await (await open()).put(SONG + id, new Response(blob, { headers: { "content-type": blob.type || "audio/mpeg" } })); },
    async drop(id) { await (await open()).delete(SONG + id); },
    async saveShelf(shelf) { await (await open()).put(SHELF, new Response(JSON.stringify(shelf), { headers: { "content-type": "application/json" } })); },
    async readShelf() { const r = await (await open()).match(SHELF); return r ? r.json() : null; },
  };
}

/** Keeps the phone in step with the shelf. `urlOf(id)` → the song's URL; `onHeld(Set)` after every change;
 *  `onFail(err, song)` for a song left behind. A full disk stops the pass — nothing after it would fit either. */
export function keeper({ store, urlOf, onHeld, onFail, fetchFn }) {
  let want = [], running = false, dirty = false, ctl = null, cur = "";
  const skip = new Set();
  async function run() {
    if (running) return;
    running = true;
    try {
      for (;;) {
        dirty = false;
        const held = await store.held();
        const { get, drop } = plan(want, held);
        for (const id of drop) await store.drop(id);
        if (drop.length) onHeld(await store.held());
        const s = want.find((x) => x.id === get.find((id) => !skip.has(id)));
        if (!s) { if (dirty) continue; break; }
        cur = s.id; ctl = new AbortController();
        try {
          const blob = await fetchResumable(await urlOf(s.id), { signal: ctl.signal, size: s.size, ...(fetchFn ? { fetchFn } : {}) });
          if (want.some((x) => x.id === s.id)) { await store.put(s.id, blob); onHeld(await store.held()); }
        } catch (e) {
          if (ctl.signal.aborted) continue;
          skip.add(s.id); onFail(e, s);
          if (!(e instanceof TaskError)) break;   // QuotaExceededError and the like: the next song would fail the same way
        } finally { cur = ""; ctl = null; }
      }
    } finally { running = false; }
  }
  return {
    /** The shelf changed (read, upload, delete): pull what is missing, drop what left, abort a pull that left. */
    set(songs) {
      want = songs; dirty = true;
      if (cur && !songs.some((s) => s.id === cur)) ctl?.abort();
      run();
    },
  };
}
