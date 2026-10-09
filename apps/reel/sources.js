import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { hostOf, sourceTitle, groupByDomain } from "/_rt/sitelabel.js";
import { PRESETS } from "./presets.js";
import { Icon, openSite } from "./util.js";
import { $src, $subs, subscribe, unsubscribe, $sessions, $sessSite, $watched, clearWatched, $owner, avatarSeen } from "./store.js";
import { resetNav, openSource } from "./feed.js";
import { useShareIntake } from "./share.js";
import { Favicon } from "./island.js";
import { SourceSheet, SessionSheet } from "./sheets.js";

const ROW_MAX = 120;

function SourceFace({ s, size = "w-10 h-10" }) {
  const pic = s.avatar || avatarSeen.get(s.url) || null;
  const [src, setSrc] = useState(pic);
  if (!src) return html`<${Favicon} url=${s.url} size=${size} />`;
  return html`<img src=${src} alt="" loading="lazy" class=${`${size} rounded-full object-cover shrink-0 bg-base-300`} onError=${() => setSrc(null)} />`;
}

function PageRow({ s, active, subbed, onPlay, onToggle, lead, sub, t }) {
  return html`<li class=${`flex items-center gap-0.5 pr-1 ${active ? "sf-inset rounded-2xl" : ""}`}>
    <button data-src-row class="flex items-center gap-2.5 flex-1 min-w-0 text-left px-2.5 py-2.5 rounded-xl sf-press" onClick=${() => onPlay(s)}>
      ${lead}
      <span class="min-w-0 flex-1">
        ${""}
        <span data-src-title class=${`block break-words leading-snug ${active ? "font-semibold" : ""}`}>${sourceTitle(s.url, { pageTitle: s.name, max: ROW_MAX })}</span>
        ${sub ? html`<span class="block text-[0.7rem] font-mono text-base-content/70 truncate">${sub}</span>` : null}
      </span>
    </button>
    <button data-src-keep class=${`btn btn-ghost btn-sm btn-circle shrink-0 ${subbed ? "text-primary" : "opacity-50"}`} aria-label=${T(t, subbed ? "unsub" : "sub")} data-haptic=${subbed ? "bump" : "off"} onClick=${onToggle}>${Icon(subbed ? "lucide:check" : "lucide:plus", "text-lg")}</button>
  </li>`;
}

function DomainCard({ g, curSrc, subbedUrls, onPlay, onOpen, onToggle, onSession, sessions, t }) {
  const hot = g.items.some((s) => s.url === curSrc);
  const hasSession = !!(sessions && sessions[g.domain]);
  const shell = `rounded-2xl ${hot ? "bg-primary/10 sf-e3" : "sf-raised sf-e2"}`;
  const one = g.items.length === 1 ? g.items[0] : null;
  const oneName = one ? sourceTitle(one.url, { pageTitle: one.name, max: ROW_MAX }) : "";
  const solo = one && oneName.toLowerCase() === String(g.name || "").toLowerCase();
  const head = html`<div class="flex items-center gap-2.5 min-w-0 flex-1 text-left px-2.5 py-2.5 rounded-xl">
    <${SourceFace} s=${one || g.items[0]} />
    <span class="min-w-0 flex-1">
      ${""}
      <span data-src-title=${solo ? "" : null} class="block font-semibold truncate leading-tight">${solo ? oneName : g.name}</span>
      <span class="block text-[0.7rem] font-mono text-base-content/70 truncate">${g.domain}${g.items.length > 1 ? ` · ${g.items.length}` : ""}</span>
    </span>
  </div>`;
  const siteActs = html`<${Fragment}>
    <button data-open-site class="btn btn-ghost btn-sm btn-circle shrink-0 opacity-70" aria-label=${T(t, "openSite")} onClick=${() => onOpen(g.items[0])}>${Icon("lucide:external-link", "text-lg")}</button>
    ${onSession ? html`<button data-session class=${`btn btn-ghost btn-sm btn-circle shrink-0 ${hasSession ? "text-primary" : "opacity-70"}`} aria-label=${T(t, "sessTitle")} aria-pressed=${hasSession} onClick=${() => onSession(g.items[0])}>${Icon("lucide:key-round", "text-lg")}</button>` : null}
  <//>`;

  if (solo) {
    return html`<section class=${`${shell} flex items-center gap-0.5 pr-1 ${one.url === curSrc ? "sf-inset" : ""}`}>
      <button data-src-row class="flex min-w-0 flex-1 sf-press rounded-2xl text-left" onClick=${() => onPlay(one)}>
        ${head}
      </button>
      ${siteActs}
      <button data-src-keep class=${`btn btn-ghost btn-sm btn-circle shrink-0 ${subbedUrls.has(one.url) ? "text-primary" : "opacity-50"}`} aria-label=${T(t, subbedUrls.has(one.url) ? "unsub" : "sub")} data-haptic=${subbedUrls.has(one.url) ? "bump" : "off"} onClick=${() => onToggle(one)}>${Icon(subbedUrls.has(one.url) ? "lucide:check" : "lucide:plus", "text-lg")}</button>
    </section>`;
  }
  return html`<section class=${`${shell} overflow-hidden`}>
    <header class="flex items-center gap-0.5 pr-1 border-b border-base-300">${head}${siteActs}</header>
    <ul class="divide-y divide-base-300/60">
      ${g.items.map((s) => html`<${PageRow} s=${s} active=${s.url === curSrc} subbed=${subbedUrls.has(s.url)} onPlay=${onPlay} onToggle=${() => onToggle(s)} lead=${html`<span class=${`shrink-0 rounded-full ${s.url === curSrc ? "w-1.5 h-5 bg-primary" : "w-1.5 h-1.5 bg-base-content/30"}`}></span>`} t=${t} key=${s.url} />`)}
    </ul>
  </section>`;
}

const FILTER_FROM = 6;

export function sources({ S, undo, toast }) {
  const t = useStore(S.t), screen = useStore(S.screen);
  useShareIntake(S, toast);
  const subs = useStore($subs), curSrc = useStore($src), watchedN = useStore($watched).size, sessions = useStore($sessions);
  const [q, setQ] = useState("");
  const editSession = (s) => { $sessSite.set(s.url); S.screen.set("session"); };
  const play = (s) => { resetNav(S); $owner.set("reel"); openSource(s.url, s.name); S.tab.set("reel"); };
  const subbedUrls = new Set(subs.map((x) => x.url));
  const needle = q.trim().toLowerCase();
  const hit = (s) => !needle || `${sourceTitle(s.url, { pageTitle: s.name })} ${hostOf(s.url)}`.toLowerCase().includes(needle);
  const mine = groupByDomain(subs.filter(hit));
  const discover = groupByDomain(PRESETS.filter((p) => !subbedUrls.has(p.url) && hit(p)));

  return html`<${Fragment}>
    <div class="flex flex-col gap-4 @container">
      ${""}
      <div class="flex items-center gap-2">
        ${subs.length >= FILTER_FROM ? html`<label class="input input-sm flex items-center gap-2 rounded-2xl flex-1 min-w-0 h-auto min-h-8">
          ${Icon("lucide:filter", "opacity-50 shrink-0 text-sm")}
          <textarea id="src-filter" rows="1" data-line enterkeyhint="search" autocomplete="off" class="grow min-w-0 leading-5 py-1 bg-transparent outline-none border-0" placeholder=${T(t, "filterPh")} aria-label=${T(t, "filterPh")} value=${q} onInput=${(e) => setQ(e.target.value)}></textarea>
        </label>` : null}
        <button id="add-url" class=${`btn btn-primary rounded-2xl gap-2 ${subs.length >= FILTER_FROM ? "btn-sm shrink-0" : "flex-1"}`} onClick=${() => S.screen.set("source")}>${Icon("lucide:plus")} ${T(t, "addUrl")}</button>
      </div>

      <div class="flex flex-col gap-2.5">
        <div class="text-sm font-semibold px-1 flex items-center gap-1.5">${Icon("lucide:bookmark", "text-primary")} ${T(t, "subs")}</div>
        ${mine.length
          ? mine.map((g) => html`<${DomainCard} g=${g} curSrc=${curSrc} subbedUrls=${subbedUrls} onPlay=${play} onOpen=${openSite} onToggle=${(s) => unsubscribe(s.url)} onSession=${editSession} sessions=${sessions} t=${t} key=${g.domain} />`)
          : html`<div class="text-sm text-base-content/70 px-1 py-3">${T(t, needle ? "noHits" : "noSubs")}</div>`}
      </div>

      ${discover.length ? html`<div class="flex flex-col gap-2.5">
        <div class="text-sm font-semibold px-1 flex items-center gap-1.5">${Icon("lucide:compass")} ${T(t, "discover")}</div>
        ${discover.map((g) => html`<${DomainCard} g=${g} curSrc=${curSrc} subbedUrls=${subbedUrls} onPlay=${play} onOpen=${openSite} onToggle=${(s) => subscribe(s)} t=${t} key=${g.domain} />`)}
      </div>` : null}

      ${watchedN > 0 ? html`<button id="clear-watched" class="btn btn-ghost btn-sm rounded-2xl gap-2 text-base-content/70 self-center mt-2" onClick=${clearWatched} data-haptic="bump">${Icon("lucide:rotate-ccw")} ${T(t, "clearWatched", { n: watchedN })}</button>` : null}
    </div>
    ${screen === "source" ? html`<${SourceSheet} S=${S} t=${t} />` : null}
    ${screen === "session" ? html`<${SessionSheet} S=${S} t=${t} undo=${undo} />` : null}
  </${Fragment}>`;
}
