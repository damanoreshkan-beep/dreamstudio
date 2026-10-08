// task — a server-side job followed over a WEAK LINK (owner, 2026-10-08: "працювати це має у польових умовах при
// слабому зв'язку"). Three moves, each of which survives the connection dying under it:
//   · startTask  — the POST that starts the job carries the client's own key `k`; a reply lost on the way is
//                  sent again with the same key and the edge answers the SAME task (edge remix.js).
//   · followTask — the job's events from its Durable Stream (edge streams.js, durablestreams.com), read by the
//                  protocol's own client: every event has an offset, a dropped poll resumes "after N".
//   · fetchResumable — a file pulled with Range: a download cut at 5 MB continues from 5 MB, not from zero.
// No call here has a deadline. A result or an error arrives as an event; the only waiting is the retry pace,
// which an `online` event cuts short. Measured before (the remix, three sealed GETs with a 110 s abort):
// 24.7 MB on the wire for 18.2 MB of mp3 and 110.7 s at the phone's 225 KB/s — one bad minute lost it all.
import { VPS_PROXY } from "@microspec/core/runtime/feed.js";

const DS_CLIENT = "https://esm.sh/@durable-streams/client@0.2.7";   // loaded on the first task, not at boot

/** A key for one tap: the same key re-sent is the same task on the edge. */
export const taskKey = () => crypto.randomUUID().replaceAll("-", "").slice(0, 24);

/** An HTTP answer that retrying cannot change (4xx but 408/429): the caller words it, nobody re-sends it. */
export class TaskError extends Error {
  constructor(status, msg) { super(msg || `http ${status}`); this.status = status; }
}
const final = (s) => s >= 400 && s < 500 && s !== 408 && s !== 429;

/** The pause before retry n: 1, 2, 4 … 15 s, ended early by the network coming back; rejects on abort. */
export function pace(n, signal, win = globalThis) {
  return new Promise((go, no) => {
    if (signal?.aborted) { no(signal.reason); return; }
    const done = () => { clearTimeout(t); win.removeEventListener?.("online", done); signal?.removeEventListener("abort", stop); go(); };
    const stop = () => { clearTimeout(t); win.removeEventListener?.("online", done); no(signal.reason); };
    const t = setTimeout(done, Math.min(15_000, 1000 * 2 ** n));
    win.addEventListener?.("online", done, { once: true });
    signal?.addEventListener("abort", stop, { once: true });
  });
}

/** POST `body` (with its `k`) to a /feed route until an answer comes back; → the parsed JSON. */
export async function startTask(route, body, { signal, fetchFn = (...a) => fetch(...a) } = {}) {
  for (let n = 0; ; n++) {
    try {
      const r = await fetchFn(`${VPS_PROXY}${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
      if (r.ok) return await r.json();
      if (final(r.status)) throw new TaskError(r.status, (await r.json().catch(() => null))?.error);
    } catch (e) { if (e instanceof TaskError || signal?.aborted) throw e; }
    await pace(n, signal);
  }
}

/** Every event of task `id`, in order, to `onEvent`; resolves at the stream's EOF. A gone task rejects (404). */
export async function followTask(id, onEvent, { signal } = {}) {
  const { stream } = await import(DS_CLIENT);
  let n = 0;
  const res = await stream({
    url: `${VPS_PROXY}/task/${id}`, live: "long-poll", signal,
    // A 404/410 is the task forgotten (the media worker restarted): stop and say so. Anything else retries — but
    // the client re-dials the moment this returns ({} = "again", read off its source), so the pace is ours.
    onError: async (e) => {
      if (e?.status === 404 || e?.status === 410) return undefined;
      await pace(n++, signal);
      return {};
    },
  });
  await new Promise((done, fail) => {
    res.subscribeJson(async (batch) => { for (const ev of batch.items) onEvent(ev); });
    res.closed.then(done, fail);
  });
  if (!res.streamClosed && !signal?.aborted) throw new TaskError(404, "task gone");
}

/** The i18n code a refused start deserves — the words imagejob.js's startJob used, so the screens keep theirs. */
export const jobCode = (e) => ({ 429: "eRate", 413: "eBig", 401: "eSignIn" })[e?.status] || "eFailed";

/**
 * One task with ONE result file (a generated clip, an export): start → events → the file by Range. The shape of
 * imagejob's followOne — `{ status: "done" | "busy" | "error", blob?, url?, …the ready event }` — so a caller swaps
 * one call; but no poll count and no timeout: it ends when the task does. `onStart(id)` hands out the id (to
 * cancel), `onLive(ev)` every other event (stage, progress), `onProgress(got, total)` the download. A refused
 * start throws a TaskError (see jobCode).
 */
export async function taskOne(route, body, { signal, onStart, onLive, onProgress } = {}) {
  const { id } = await startTask(route, { ...body, k: taskKey() }, { signal });
  onStart?.(id);
  let ready = null, fail = null;
  await followTask(id, (ev) => {
    if (ev.t === "ready") ready = ev;
    else if (ev.t === "fail") fail = ev;
    else onLive?.(ev);
  }, { signal });
  if (!ready) return { status: fail?.error === "busy" ? "busy" : "error", error: fail?.error || null };
  const blob = await fetchResumable(`${VPS_PROXY}/task/${id}/${ready.name}`, { signal, size: ready.bytes, onProgress });
  return { status: "done", blob, url: URL.createObjectURL(blob), ...ready };
}

/** GET a file whole, resuming with Range from the bytes already in hand after any drop; → a Blob. `size` is the
 *  length when the caller already knows it (a task's `ready` event does): the edge's forward drops
 *  content-length, and without a length a body that ends early but cleanly would pass for the whole file. */
export async function fetchResumable(url, { signal, onProgress, size = 0, fetchFn = (...a) => fetch(...a) } = {}) {
  let parts = [], got = 0, total = size, type = "";
  for (let n = 0; ; n++) {
    try {
      const r = await fetchFn(url, { headers: got ? { range: `bytes=${got}-` } : {}, signal });
      if (got && r.status === 200) { parts = []; got = 0; }            // the range was ignored: the body is whole again
      else if (!r.ok) { if (final(r.status)) throw new TaskError(r.status); throw new Error(`http ${r.status}`); }
      type ||= r.headers.get("content-type") || "";
      const whole = /\/(\d+)$/.exec(r.headers.get("content-range") || "");
      total = whole ? Number(whole[1]) : total || Number(r.headers.get("content-length")) || 0;
      const reader = r.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value); got += value.length; n = 0;                  // bytes moved: the next drop starts the pace over
        onProgress?.(got, total);
      }
      if (!total || got >= total) return new Blob(parts, { type: type || "application/octet-stream" });
    } catch (e) { if (e instanceof TaskError || signal?.aborted) throw e; }
    await pace(n, signal);
  }
}
