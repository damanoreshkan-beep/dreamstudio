// Hacker News adapter (Algolia front-page API — CORS *, no key). Returns { items, meta }.
import { fetchJson } from "/_rt/feed.js";
import { isGate } from "/_rt/gate.js";

// Gate fixture: the runners' shared egress gets rate-limited by Algolia and a live-data e2e then reds the
// whole run (twice on 2026-09-01, green from every other network). In the gate the front page is a
// deterministic set — real HN shapes (points, comments, an outbound url, a recent timestamp) so every
// assertion the e2e makes (badges, detail with relative time, search to zero, bookmark) has something real.
const GATE_HN = [
  ["Show HN: A terminal SDR that needs no root", "sdr", 412, 133, "https://github.com/example/hackrf-term"],
  ["Deno 2.9 ships the outdated command with a lockfile-only mode", "deno", 288, 97, "https://deno.com/blog/v2.9"],
  ["WebGPU in every browser: what changed in 2026", "mdn", 351, 120, "https://developer.mozilla.org/webgpu-2026"],
  ["The case for cut-paper interfaces", "tufte", 176, 64, "https://example.org/cut-paper"],
  ["JSR provenance: how a publish is verified end to end", "jsr", 203, 41, "https://jsr.io/docs/provenance"],
  ["A no-root userspace Bluetooth driver in 4k lines", "wisp", 267, 88, "https://github.com/example/rtl8761-userspace"],
  ["Ask HN: What replaced your home server this year?", "askhn", 154, 302, ""],
  ["Measuring a sprite's alpha instead of guessing its offset", "eye", 98, 23, "https://example.org/measure-the-shot"],
].map(([title, author, points, comments, url], i) => ({
  id: `gate-${i}`, title, author, points, comments,
  url: url || `https://news.ycombinator.com/item?id=gate-${i}`,
  ts: Date.now() - (i + 1) * 47 * 60 * 1000,
}));

export async function load(filters = {}) {
  if (isGate) return { items: Number(filters.cursor) ? [] : GATE_HN, meta: {}, next: null };
  // Infinite scroll: the front-page ranking spans several Algolia pages (nbHits ~150); cursor = page index.
  const page = Number(filters.cursor) || 0;
  const url = `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30&page=${page}`;
  const data = await fetchJson(url);
  const items = (data.hits || []).filter((h) => h.title).map((h) => ({
    id: String(h.objectID),
    title: h.title,
    author: h.author || "",
    points: h.points ?? 0,
    comments: h.num_comments ?? 0,
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    ts: (h.created_at_i || 0) * 1000,
  }));
  const next = data.page + 1 < data.nbPages ? data.page + 1 : null;
  return { items, meta: {}, next };
}
