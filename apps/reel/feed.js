import { VPS_PROXY, pool } from "/_rt/feed.js";
import { sealedFrameUrl } from "/_rt/sealedfetch.js";
import { gate } from "/_rt/gate.js";
import { dedupeVideos, isBlackSample, isFlatSample, hasPoster } from "/_rt/vfilter.js";
import { sourceTitle, humanText } from "/_rt/sitelabel.js";
import { reject } from "lodash-es";
import { DEFAULT_SRC, MOCK, MOCK_DEEP, GATE_TITLES, GATE_SEARCH } from "./presets.js";
import { framed } from "./util.js";
import { $src, subscribe, sessionsReady, sessionFor, unseen, $items, $next, $loading, $err, $active, $ephemeral, $srcTitle, $srcHint, setSrcTitle, $frames, $restoreTo, $owner, $feedChannel, $full, rememberSearch } from "./store.js";

const snapshot = (label) => ({ label, src: $src.get(), title: $srcTitle.get(), hint: $srcHint.get(), items: $items.get(), next: $next.get(), active: $active.get(), eph: $ephemeral.get(), owner: $owner.get(), err: $err.get() });
function restoreTop() {
  const fs = $frames.get(); if (!fs.length) return;
  const f = fs[fs.length - 1];
  $frames.set(fs.slice(0, -1));
  gen++;
  loadingMore = false;
  $src.set(f.src); $srcTitle.set(f.title); $srcHint.set(f.hint); $items.set(f.items); $next.set(f.next); $ephemeral.set(f.eph);
  $owner.set(f.owner); $loading.set(false); $err.set(f.err);
  $active.set(f.active); $restoreTo.set(f.active);
  if (!f.items.length && !f.err && !gate) loadSource(f.src, false, f.hint);
}
let bound = false;
export function bindNav(S) {
  if (bound) return; bound = true;
  S.stack.listen((v) => { while ($frames.get().length > (v?.length || 0)) restoreTop(); });
}
export function pushFrame(S, label) { $frames.set([...$frames.get(), snapshot(label)]); S.stack.set([...S.stack.get(), label]); }
export function popFrame(S) { const st = S.stack.get(); if (st.length) S.stack.set(st.slice(0, -1)); }
export function resetNav(S) { $frames.set([]); if (S.stack.get().length) S.stack.set([]); }

export function diveTarget(item, src) {
  const u = item?.page;
  if (!u || !/^https?:\/\//i.test(u)) return null;
  return u.replace(/#.*$/, "") === String(src).replace(/#.*$/, "") ? null : u;
}
export function openSource(url, hint) { $src.set(url); loadSource(url, false, hint); }
export function diveTo(S, url, hint) {
  if (!url) return;
  pushFrame(S, $srcTitle.get());
  navigator.vibrate?.(10);
  openSource(url, hint);
}

export function openAsSource(S, url, hint, keep = true) {
  if (keep) subscribe({ name: sourceTitle(url), url });
  resetNav(S);
  $owner.set("reel");
  openSource(url, hint);
  S.tab.set("reel");
  S.screen.set(null);
}

const blankPosters = new Set();
const checkedPosters = new Set();
function posterIsBlank(poster, page) {
  const isData = poster.startsWith("data:");
  if (gate && !isData) return Promise.resolve(false);
  if (typeof document === "undefined" || typeof Image === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    let done = false; const finish = (v) => { if (!done) { done = true; clearTimeout(to); resolve(v); } };
    const to = setTimeout(() => finish(false), 6000);
    const sample = (src) => {
      const img = new Image(); if (!isData) img.crossOrigin = "anonymous";
      img.onload = () => { try {
        const c = document.createElement("canvas"); c.width = 24; c.height = 24;
        const cx = c.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0, 24, 24);
        const px = cx.getImageData(0, 0, 24, 24).data;
        finish(isBlackSample(px) || isFlatSample(px));
      } catch { finish(false); } };
      img.onerror = () => {
        if (isData || src !== poster) return finish(false);
        framed(poster, page).then(sample).catch(() => finish(false));
      };
      img.src = src;
    };
    sample(poster);
  });
}
export async function checkBlankPosters() {
  const todo = [];
  for (const it of $items.get()) { const p = it.poster; if (p && !checkedPosters.has(p)) { checkedPosters.add(p); todo.push([p, it.page || null]); } }
  if (!todo.length) return;
  const hits = new Set();
  await pool(todo, 4, async ([p, pg]) => { if (await posterIsBlank(p, pg)) hits.add(p); });
  if (hits.size) { hits.forEach((p) => blankPosters.add(p)); $items.set(reject($items.get(), (i) => i.poster && hits.has(i.poster))); }
}
function clean(arr, { requirePoster = false } = {}) {
  let out = reject(unseen(arr), (i) => i.poster && blankPosters.has(i.poster));
  out = out.map((i) => (i.title ? { ...i, title: humanText(i.title) } : i));
  if (requirePoster) out = out.filter(hasPoster);
  return dedupeVideos(out);
}

let loadingMore = false, gen = 0;
export async function loadSource(url, append = false, hint = "") {
  if (append) { if (loadingMore || !url) return; loadingMore = true; }
  else {
    $loading.set(true); $err.set(false); $items.set([]); $next.set(null); $active.set(0); $restoreTo.set(0);
    $srcHint.set(hint || ""); setSrcTitle(url, { hint });
  }
  const g = append ? gen : ++gen;
  if (gate) {
    rememberSearch(url, GATE_SEARCH);
    if (!append) {
      $items.set(clean(url === DEFAULT_SRC ? MOCK : MOCK_DEEP)); $ephemeral.set(false); $loading.set(false);
      setSrcTitle(url, { pageTitle: GATE_TITLES[url] || "", hint });
    }
    loadingMore = false; return;
  }
  try {
    await sessionsReady;
    const cookie = sessionFor(url);
    const r = await (cookie
      ? fetch(`${VPS_PROXY}/videos`, { method: "POST", headers: { "content-type": "application/json", "x-ms-egress": "reel" }, body: JSON.stringify({ url, cookie }) })
      : fetch(`${VPS_PROXY}/videos?url=${encodeURIComponent(url)}`, { headers: { "x-ms-egress": "reel" } }));
    const d = await r.json();
    if (g !== gen) return;
    const eph = append ? $ephemeral.get() : !!d.ephemeral;
    const got = clean(Array.isArray(d.items) ? d.items : [], { requirePoster: eph });
    $items.set(append ? dedupeVideos([...$items.get(), ...got]) : got);
    $next.set(d.next || null);
    if (!append) $feedChannel.set(d.channel || null);
    rememberSearch(url, d.search);
    if (!append) setSrcTitle(url, { pageTitle: d.title || "", hint });
    if (!append) $ephemeral.set(eph);
  } catch { if (g === gen && !append) $err.set(true); }
  finally { if (g === gen) $loading.set(false); if (append) loadingMore = false; }
}

export async function openFull(S, item) {
  const page = item?.page || item?.orig || item?.video;
  if (!page) return;
  const title = item.title || "";
  $full.set({ page, title, url: null, err: false });
  S.screen.set("full");
  const settle = (patch) => { const cur = $full.get(); if (cur && cur.page === page) $full.set({ ...cur, ...patch }); };
  if (gate) return settle({ url: item.video });
  try {
    const d = await (await fetch(`${VPS_PROXY}/stream?url=${encodeURIComponent(page)}`)).json();
    const list = (Array.isArray(d.sources) ? d.sources : []).filter((s) => !s.remote);
    const vars = (Array.isArray(d.variants) ? d.variants : []).filter((v) => v?.url && v?.bandwidth);
    const canLadder = typeof MediaSource !== "undefined" || typeof window.ManagedMediaSource !== "undefined";
    if (canLadder && vars.length > 1) {
      const sealed = await Promise.all(vars.map((v) => framed(v.url, page)));
      const lines = ["#EXTM3U"];
      vars.forEach((v, i) => {
        if (!sealed[i]) return;
        const attrs = [`BANDWIDTH=${Math.round(v.bandwidth)}`];
        if (v.resolution) attrs.push(`RESOLUTION=${v.resolution}`);
        if (v.codecs) attrs.push(`CODECS="${v.codecs}"`);
        lines.push(`#EXT-X-STREAM-INF:${attrs.join(",")}`, sealed[i]);
      });
      if (lines.length > 2) {
        const master = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: "application/vnd.apple.mpegurl" }));
        return settle({ url: master, type: "hls", blob: master, title: humanText(d.title) || title });
      }
    }
    const pick = list.find((s) => s.format === "hls") || list[0];
    if (!pick) return settle({ err: true });
    settle({ url: await sealedFrameUrl(pick.url, page), type: pick.format === "hls" ? "hls" : "progressive", title: humanText(d.title) || title });
  } catch { settle({ err: true }); }
}
