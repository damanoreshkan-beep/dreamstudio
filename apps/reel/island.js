import { html } from "htm/preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Island } from "/_rt/ui.js";
import { resolveSearch, buildSearchUrl } from "/_rt/urlquery.js";
import { hostOf, siteName } from "/_rt/sitelabel.js";
import { letterTile } from "/_rt/tile.js";
import { Icon, framed } from "./util.js";
import { avatarSeen, accountAvatar, $drawer, $searchBases, searchBaseFor, $cast, pullCast } from "./store.js";
import { popFrame, diveTo, openAsSource } from "./feed.js";

export function Favicon({ url, size = "w-6 h-6" }) {
  const [failed, setFailed] = useState(false);
  const cls = `${size} rounded-lg object-contain shrink-0`;
  return failed
    ? html`<img src=${letterTile(siteName(url), { w: 64, h: 64, light: 30 })} alt="" class=${`${cls} object-cover`} />`
    : html`<img src=${`https://${hostOf(url)}/favicon.ico`} alt="" loading="lazy" class=${`${cls} bg-base-content/10`} onError=${() => setFailed(true)} />`;
}

function ChannelAvatar({ channel, onClick, label, current }) {
  const url = channel?.url || "";
  const given = channel?.avatar || null;
  const [pic, setPic] = useState(given || avatarSeen.get(url) || null);
  const [proxied, setProxied] = useState(false);
  useEffect(() => {
    setPic(given || avatarSeen.get(url) || null); setProxied(false);
    if (!url || given) return;
    let dead = false;
    accountAvatar(url).then((v) => { if (!dead && v) setPic(v); });
    return () => { dead = true; };
  }, [url, given]);
  if (!channel?.url) return null;
  const here = String(channel.url).replace(/#.*$/, "") === String(current || "").replace(/#.*$/, "");
  const initial = (channel.name || "?").trim().charAt(0).toUpperCase();
  const fail = () => {
    if (proxied || !pic) return setPic(null);
    setProxied(true);
    framed(pic, channel.url).then((u) => setPic(u || null)).catch(() => setPic(null));
  };
  return html`<button type="button" data-channel class="btn btn-ghost btn-sm btn-circle shrink-0 p-0 overflow-hidden border border-white/20 bg-white/10"
      aria-label=${label} title=${channel.name || ""} disabled=${here} onClick=${here ? null : onClick}>
    ${pic
      ? html`<img src=${pic} alt="" class="w-6 h-6 rounded-full object-cover" loading="lazy" onError=${fail} />`
      : html`<span class="w-6 h-6 rounded-full grid place-items-center text-[0.7rem] font-semibold text-white bg-white/20">${initial}</span>`}
  </button>`;
}

function CastFace({ person, onGo }) {
  const initial = (person.name || "?").trim().charAt(0).toUpperCase();
  const [pic, setPic] = useState(person.avatar || null);
  return html`<button type="button" data-cast-person class="btn btn-ghost btn-sm h-auto py-1 pl-1 pr-2 rounded-full gap-1.5 shrink-0 border border-white/20 bg-white/10 text-white font-normal"
      onClick=${() => onGo(person)} title=${person.name}>
    ${pic
      ? html`<img src=${pic} alt="" loading="lazy" class="w-6 h-6 rounded-full object-cover" onError=${() => setPic(null)} />`
      : html`<span class="w-6 h-6 rounded-full grid place-items-center text-[0.7rem] font-semibold bg-white/20">${initial}</span>`}
    <span class="text-xs max-w-[7rem] truncate">${person.name}</span>
  </button>`;
}

function CastDrawer({ t, onGo }) {
  const { loading, people, err } = useStore($cast);
  if (loading) return html`<div data-cast-row class="flex items-center gap-1.5 px-1 py-0.5 overflow-hidden">
    ${[0, 1, 2].map((i) => html`<span key=${i} class="h-8 w-24 rounded-full bg-white/10 animate-pulse shrink-0"></span>`)}
  </div>`;
  if (err || !people.length) return html`<div data-cast-row class="px-2.5 py-1.5 text-xs text-white/60">${T(t, err ? "loadErr" : "castNone")}</div>`;
  return html`<div data-cast-row data-scroller class="flex items-center gap-1.5 px-0.5 overflow-x-auto max-w-full"
      style="-webkit-mask-image:linear-gradient(to right,transparent,#000 12px,#000 calc(100% - 12px),transparent);mask-image:linear-gradient(to right,transparent,#000 12px,#000 calc(100% - 12px),transparent)">
    ${people.map((p) => html`<${CastFace} key=${p.url} person=${p} onGo=${onGo} />`)}
  </div>`;
}

function SearchDrawer({ t, base, onFind, onClose }) {
  const [q, setQ] = useState(resolveSearch(base).term || "");
  const ref = useRef();
  useEffect(() => { ref.current?.focus?.(); }, []);
  const go = (e) => { e?.preventDefault?.(); const term = q.trim(); if (term) onFind(term); };
  return html`<form class="flex items-center gap-1 min-w-0 w-full" onSubmit=${go}>
    <button type="button" class="btn btn-ghost btn-sm btn-circle text-white shrink-0" aria-label=${T(t, "close")} onClick=${onClose}>
      ${Icon("lucide:x", "text-lg")}
    </button>
    ${""}
    <textarea id="island-q" ref=${ref} rows="1" data-line enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false"
      class="grow min-w-0 bg-transparent text-sm leading-6 py-1.5 border-0 text-white placeholder:text-white/40 outline-none px-1"
      placeholder=${T(t, "searchPh")} aria-label=${T(t, "search")} value=${q} onInput=${(e) => setQ(e.target.value)}></textarea>
    <button id="island-find" type="submit" class="btn btn-sm rounded-full gap-1 shrink-0 border border-white/20 bg-white/15 text-white hover:bg-white/25">
      ${Icon("lucide:search", "text-sm")}<span class="text-xs">${T(t, "find")}</span>
    </button>
  </form>`;
}

export function SourceIsland({ S, t, src, title, clip, depth, channel, page }) {
  const act = "btn btn-ghost btn-sm btn-circle shrink-0 border border-white/20 bg-white/10 text-white";
  const drawer = useStore($drawer), bases = useStore($searchBases);
  const base = searchBaseFor(src, bases);
  useEffect(() => { if ($drawer.get() === "cast") $drawer.set(""); }, [page]);
  useEffect(() => { $drawer.set(""); }, [src]);
  const toggle = (which) => { const next = drawer === which ? "" : which; $drawer.set(next); if (next === "cast") pullCast(page); };
  const row = html`<div class="flex items-center gap-1 min-w-0 max-w-full">
      ${depth ? html`<button data-feed-back class="btn btn-ghost btn-sm btn-circle text-white shrink-0" aria-label=${T(t, "back")} onClick=${() => popFrame(S)}>${Icon("lucide:chevron-left", "text-xl")}</button>` : null}
      <${Favicon} url=${src} size="w-6 h-6" />
      ${""}
      <${ChannelAvatar} channel=${channel} current=${src} label=${channel?.name || ""}
        onClick=${() => diveTo(S, channel.url, channel.name)} />
      ${""}
      <span data-island-label data-island-src=${title} class="text-sm text-white truncate min-w-0 pl-0.5 pr-1">${clip || title}</span>
      ${""}
      ${base ? html`<button data-island-search class=${`${act} ${drawer === "search" ? "bg-white/25" : ""}`} aria-pressed=${drawer === "search"}
        aria-label=${T(t, "search")} onClick=${() => toggle("search")}>${Icon("lucide:search", "text-base")}</button>` : null}
      ${page ? html`<button data-island-cast class=${`${act} ${drawer === "cast" ? "bg-white/25" : ""}`} aria-pressed=${drawer === "cast"}
        aria-label=${T(t, "cast")} onClick=${() => toggle("cast")}>${Icon("lucide:users", "text-base")}</button>` : null}
      ${""}
      <button data-more class=${act} aria-label=${T(t, "more")} onClick=${() => S.screen.set("more")}>${Icon("lucide:ellipsis", "text-base")}</button>
    </div>`;
  return html`<${Island} pinned at="bottom" tone="dark"
      className=${`flex flex-col gap-1 min-w-0 max-w-full ${drawer ? "rounded-[1.6rem] w-[min(30rem,100%)]" : "rounded-full"}`}>
    ${drawer === "cast" ? html`<${CastDrawer} t=${t} onGo=${(p) => { $drawer.set(""); diveTo(S, p.url, p.name); }} />` : null}
    ${drawer === "search"
      ? html`<${SearchDrawer} t=${t} base=${base} onClose=${() => $drawer.set("")}
          onFind=${(term) => { $drawer.set(""); openAsSource(S, buildSearchUrl(base, term), term, false); }} />`
      : row}
  <//>`;
}
