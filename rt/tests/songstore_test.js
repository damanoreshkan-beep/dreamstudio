import { assertEquals } from "jsr:@std/assert@1";
import { plan, songStore, keeper } from "../songstore.js";
import { TaskError } from "../task.js";

const song = (id, size = 4) => ({ id, size });
// CacheStorage as the browser has it, held in memory: Deno's Cache has no keys()
function memCaches() {
  const all = new Map();
  return {
    async open(name) {
      if (!all.has(name)) all.set(name, new Map());
      const m = all.get(name);
      return {
        async put(k, r) { m.set(String(k), { body: await r.blob(), headers: [...r.headers] }); },
        async match(k) { const e = m.get(String(k)); return e ? new Response(e.body, { headers: e.headers }) : undefined; },
        async delete(k) { return m.delete(String(k)); },
        async keys() { return [...m.keys()].map((url) => new Request(url)); },
      };
    },
  };
}
const fresh = (name) => songStore(name, memCaches());

Deno.test("songstore: plan pulls what the phone lacks in shelf order and drops what left the shelf", () => {
  const p = plan([song("c"), song("b"), song("a")], new Set(["a", "x"]));
  assertEquals(p.get, ["c", "b"]);
  assertEquals(p.drop, ["x"]);
  assertEquals(plan([], new Set()), { get: [], drop: [] });
});

Deno.test("songstore: a song and the shelf survive in the bucket; drop removes only that song", async () => {
  const st = fresh("test-songstore-a");
  await st.put("s1", new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" }));
  await st.put("s2", new Blob([new Uint8Array([4])]));
  await st.saveShelf({ songs: [song("s1"), song("s2")], usage: { count: 2 } });
  assertEquals([...(await st.held())].sort(), ["s1", "s2"], "the shelf record is not a song");
  const b = await st.blob("s1");
  assertEquals(b.type, "audio/mpeg");
  assertEquals([...new Uint8Array(await b.arrayBuffer())], [1, 2, 3]);
  await st.drop("s1");
  assertEquals([...(await st.held())], ["s2"]);
  assertEquals(await st.blob("s1"), null);
  assertEquals((await st.readShelf()).usage.count, 2);
});

Deno.test("songstore: the keeper pulls every song, drops a deleted one, and leaves a refused one for later", async () => {
  const st = fresh("test-songstore-b");
  await st.put("gone", new Blob([new Uint8Array([9])]));
  const pulled = [], failed = [];
  let until = null;   // { test(held, failed) → bool, go } — the next event that satisfies it resolves the wait
  const wait = (test) => new Promise((go) => { until = { test, go }; });
  const tick = (held) => { if (until?.test(held)) { const { go } = until; until = null; go(held); } };
  let last = new Set();
  const fetchFn = async (url) => {
    pulled.push(url);
    if (url === "u:bad") return new Response("no", { status: 404 });
    return new Response(new Uint8Array([7, 7, 7, 7]), { status: 200, headers: { "content-length": "4" } });
  };
  const k = keeper({
    store: st, urlOf: async (id) => `u:${id}`, fetchFn,
    onHeld: (h) => { last = h; tick(h); },
    onFail: (e, s) => { failed.push([s.id, e instanceof TaskError]); tick(last); },
  });
  const full = wait((h) => h.has("new") && h.has("old") && !h.has("gone") && failed.length === 1);
  k.set([song("new"), song("bad"), song("old")]);
  await full;
  assertEquals(failed, [["bad", true]]);
  assertEquals(pulled, ["u:new", "u:bad", "u:old"], "newest first, one at a time, the refused one once");
  assertEquals((await st.blob("new")).size, 4);
  const dropped = wait((h) => !h.has("new"));
  k.set([song("old")]);
  assertEquals([...(await dropped)], ["old"]);
});
