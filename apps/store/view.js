import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Sheet } from "/_rt/ui.js";
import { collection } from "/_rt/db.js";
import apps from "./apps.json" with { type: "json" };
import spec from "./spec.json" with { type: "json" };

const Icon = (icon, cls, style) => html`<iconify-icon icon=${icon} class=${cls || ""} style=${style || ""}></iconify-icon>`;
const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70";
const DOT = (accent2) => html`<span aria-hidden="true" class="w-1.5 h-1.5 rounded-full shrink-0" style=${`background:var(${accent2 ? "--app-accent-2" : "--app-accent"})`}></span>`;
const AppArt = (a, size) => a.icon
  ? html`<img src=${`../${a.id}/icon.svg`} alt="" aria-hidden="true" decoding="async" loading="lazy" style=${`width:${size};height:${size}`} class="rounded-[inherit] block" />`
  : a.art
  ? html`<svg viewBox="0 0 24 24" style=${`width:${size};height:${size};color:var(--color-base-content)`} fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: a.art }}></svg>`
  : Icon(a.glyph, "", `font-size:${size};color:var(--color-base-content)`);
const Tile = (a, cls) => html`<div class=${`relative shrink-0 rounded-[22%] overflow-hidden bg-black sf-raised sf-e2 flex items-center justify-center ${cls}`}>${AppArt(a, a.icon ? "100%" : "46%")}</div>`;
const SEEN = collection("seen");
const CATALOG = collection("catalog");
const appUrl = (id, install = false) => `../${id}/${install ? "?install=1" : ""}`;
const shotUrl = (a, tab, light) => `./assets/shot-${a.id}--${tab}${light ? "--light" : ""}.webp`;
const CATS = ["science", "feeds", "tools", "sound", "hackrf", "creative", "money", "wellness", "play", "esoterica"];
const catKey = (c) => "cat" + c[0].toUpperCase() + c.slice(1);
const TODAY_DAYS = 2;
const ageDays = (a) => Math.max(0, Math.floor((Date.now() - Date.parse(a.added + "T00:00:00")) / 86400000));
const isNewborn = (a) => !!a.added && ageDays(a) < TODAY_DAYS;
const NEWBORN = apps.filter(isNewborn).sort((x, y) => y.added.localeCompare(x.added) || x.title.localeCompare(y.title, "uk"));
// The first curated id is the LEAD: it keeps the big card whatever is born after it (owner, 2026-10-05).
const LEAD = apps.find((a) => a.id === (spec.featured || [])[0]) || null;
const CURATED = (spec.featured || []).slice(1).map((id) => apps.find((a) => a.id === id)).filter((a) => a && !isNewborn(a));
const FEATURED = [...(LEAD ? [LEAD] : []), ...NEWBORN.filter((a) => a !== LEAD), ...CURATED];
const isFeatured = (a) => FEATURED.some((f) => f.id === a.id);
const ROWS_PER_SECTION = 3;
const FRESH_DAYS = 21, FRESH_MAX = 9, PER_SLIDE = 3;
const FRESH = apps.filter((a) => a.added && ageDays(a) <= FRESH_DAYS)
  .sort((x, y) => y.added.localeCompare(x.added) || x.title.localeCompare(y.title, "uk")).slice(0, FRESH_MAX);
const SLIDES = Array.from({ length: Math.ceil(FRESH.length / PER_SLIDE) }, (_, i) => FRESH.slice(i * PER_SLIDE, i * PER_SLIDE + PER_SLIDE));

export function store({ S, openScreen, closeScreen }) {
  const t = useStore(S.t), screen = useStore(S.screen), locale = useStore(S.locale);
  const light = useStore(S.theme) === "signal-light";
  const firstShot = (a) => (a.shots?.length ? shotUrl(a, a.shots[0], light) : null);
  const nameOf = (a) => a.titles?.[locale] || a.title;
  const taglineOf = (a) => a.taglines?.[locale] || a.tagline || "";
  const screensOf = (a) => a.screens?.[locale] || a.screens?.en || [];
  const subtitleOf = (a) => { const s = taglineOf(a); const m = /^(.{12,90}?[.!?—])\s/.exec(s + " "); return m ? m[1].replace(/[—.]$/, "") : s; };
  const byName = (x, y) => nameOf(x).localeCompare(nameOf(y), locale);
  const [q, setQ] = useState("");
  const searchOpen = useStore(S.searchOpen);
  const fieldRef = useRef(null);
  useEffect(() => { if (searchOpen) fieldRef.current?.focus?.(); else setQ(""); }, [searchOpen]);
  const [seen, setSeen] = useState(null);
  const [fresh, setFresh] = useState(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    Promise.all([SEEN.all(), CATALOG.all()]).then(([s, c]) => {
      setSeen(Object.fromEntries(s.map((x) => [x.id, x.v])));
      const ids = apps.map((a) => a.id);
      const rec = c.find((x) => x.id === "known");
      const known = rec ? new Set(rec.ids || []) : null;
      setFresh(known ? new Set(ids.filter((i) => !known.has(i))) : new Set());
      CATALOG.put("known", { ids }).catch(() => {});
    }).catch(() => { setSeen({}); setFresh(new Set()); });
  }, []);
  useEffect(() => { setMore(false); }, [screen]);
  const badgeOf = (a) => (!seen || !fresh ? null : fresh.has(a.id) && !(a.id in seen) ? "new" : (a.id in seen) && seen[a.id] !== a.version ? "upd" : null);
  const installed = (a) => !!seen && a.id in seen;
  const remember = (a) => { SEEN.put(a.id, { v: a.version }).catch(() => {}); setSeen((s) => ({ ...(s || {}), [a.id]: a.version })); };
  const launch = (a, install = false) => { remember(a); try { window.open(appUrl(a.id, install), "_blank", "noopener"); } catch { location.assign(appUrl(a.id, install)); } };
  const tag = (b) => b === "new" ? html`<span class=${`${LABEL} inline-flex items-center gap-1 shrink-0`}>${DOT()}${T(t, "newBadge")}</span>` : b === "upd" ? html`<span class=${`${LABEL} inline-flex items-center gap-1 shrink-0`}>${DOT(true)}${T(t, "updBadge")}</span>` : null;
  const needsUsb = (a) => (a.needs || []).includes("usb");
  const tap = (a) => (installed(a) ? launch(a) : openScreen(a.id));
  const pill = (a, extra = "") => html`<button class=${`btn btn-xs rounded-full px-3.5 min-h-7 h-7 bg-base-300 border-0 text-base-content font-bold shrink-0 ${extra}`} aria-label=${`${T(t, "openApp")} — ${nameOf(a)}`} onClick=${(e) => { e.stopPropagation(); launch(a); }}>${installed(a) ? Icon("lucide:external-link", "text-sm") : T(t, "openApp")}</button>`;

  const sel = screen ? apps.find((a) => a.id === screen) : null;
  const page = html`<${Sheet} id="appsheet" size="lg" open=${!!sel} onClose=${closeScreen} title=${sel ? nameOf(sel) : ""}>
    ${sel ? (() => { const b = badgeOf(sel), scr = screensOf(sel), shots = sel.shots || [], desc = taglineOf(sel), long = desc.length > 180; return html`<div class="flex flex-col gap-6 pb-2">
      ${""}
      <div class="flex items-start gap-4">
        ${Tile(sel, "w-28 h-28")}
        <div class="min-w-0 flex-1 flex flex-col gap-1 pt-0.5">
          <div class="font-bold text-[1.35rem] leading-tight break-words">${nameOf(sel)}</div>
          <div class="text-sm text-muted leading-snug line-clamp-2">${subtitleOf(sel)}</div>
          <div class="flex items-center gap-2 mt-2">
            <button id="open-app" class="btn btn-sm btn-primary rounded-full px-5 min-h-8 h-8 font-bold" onClick=${() => launch(sel)}>${T(t, "openApp")}</button>
            <button id="install-app" class="btn btn-sm btn-ghost rounded-full px-3 min-h-8 h-8 gap-1.5" onClick=${() => launch(sel, true)}>${Icon("lucide:download", "text-base")}${T(t, "installApp")}</button>
          </div>
        </div>
      </div>
      ${""}
      <div class="grid grid-cols-4 divide-x divide-base-300/60 sf-inset rounded-[var(--ms-r-in)] py-3 text-center">
        ${[[T(t, "version"), `v${sel.version || "1.0"}`], [T(t, "category"), T(t, catKey(sel.category))], [T(t, "offline"), T(t, "yes")], [T(t, "screens"), String(scr.length || 1)]].map(([k, v]) => html`<div class="px-1 min-w-0 flex flex-col gap-1" key=${k}>
          <div class=${`${LABEL} truncate`}>${k}</div>
          <div class="text-sm font-semibold truncate">${v}</div>
        </div>`)}
      </div>
      ${""}
      ${needsUsb(sel) ? html`<div data-needs-device class="flex items-center gap-2 text-sm text-base-content sf-inset rounded-[var(--ms-r-in)] px-3 py-2">${Icon("lucide:usb", "shrink-0 text-[length:var(--ms-icon)]", "color:var(--app-accent)")}<span>${T(t, sel.deviceNote || "needsDeviceHackrf")}</span></div>` : null}
      ${""}
      ${shots.length ? html`<div class="flex flex-col gap-2">
        <div class="font-bold text-lg px-0.5">${T(t, "screenshots")}</div>
        <div class="flex gap-3 overflow-x-auto snap-x [overscroll-behavior-x:contain] [scrollbar-width:none] -mx-[var(--ms-pad)] px-[var(--ms-pad)] pb-1">
          ${shots.map((tab, i) => html`<figure key=${tab} class="snap-start shrink-0 w-[62%] max-w-[15rem] rounded-[var(--ms-r-in)] overflow-hidden bg-black sf-raised sf-e2 aspect-[384/832]">
            <img src=${shotUrl(sel, tab, light)} alt=${scr[i] || ""} loading=${i ? "lazy" : "eager"} decoding="async" class="w-full h-full object-cover object-top block" />
          </figure>`)}
        </div>
      </div>` : null}
      ${""}
      <div class="flex flex-col gap-1">
        <p class=${`text-[0.95rem] leading-relaxed text-base-content/85 break-words ${more || !long ? "" : "line-clamp-3"}`}>${desc}</p>
        ${long ? html`<button class="self-end text-sm font-semibold text-base-content" onClick=${() => setMore(!more)}>${more ? T(t, "less") : T(t, "more")}</button>` : null}
      </div>
      <div class="flex flex-col gap-1">
        <div class="flex items-baseline justify-between px-0.5"><span class="font-bold text-lg">${T(t, "whatsNew")}</span><span class=${`${LABEL} normal-case tracking-normal inline-flex items-center gap-1`}>v${sel.version || "1.0"}${b === "upd" ? html` · ${DOT(true)}<span>${T(t, "newVersion")}</span>` : ""}</span></div>
        <p class="text-sm text-base-content/80">${T(t, "whatsNewBody")}</p>
      </div>
      <div class="flex flex-col gap-1">
        <div class="font-bold text-lg px-0.5">${T(t, "info")}</div>
        <div class="flex flex-col text-sm">
          ${[[T(t, "developer"), T(t, "title")], [T(t, "category"), T(t, catKey(sel.category))], [T(t, "version"), `v${sel.version || "1.0"}`], [T(t, "offline"), T(t, "yes")], [T(t, "installation"), T(t, "homeScreen")], ...(needsUsb(sel) ? [[T(t, "device"), "USB"]] : []), ...(scr.length ? [[T(t, "screens"), scr.join(" · ")]] : [])].map(([k, v]) => html`<div class="flex items-start justify-between gap-4 py-2.5 border-b border-base-300/50 last:border-0" key=${k}><span class="text-muted shrink-0">${k}</span><span class="text-right break-words">${v}</span></div>`)}
        </div>
      </div>
    </div>`; })() : null}
  <//>`;

  const sloganOf = (a) => t?.["slogan_" + a.id] || "";
  const rtf = new Intl.RelativeTimeFormat(locale === "uk" ? "uk" : "en", { numeric: "auto" });
  const whenOf = (a) => { const d = ageDays(a); return d < 7 ? rtf.format(-d, "day") : rtf.format(-Math.round(d / 7), "week"); };
  const eyebrowOf = (a) => `${isNewborn(a) ? whenOf(a) : T(t, "premium")} · ${T(t, catKey(a.category))}`;
  const Featured = (a) => { const tab = a.shots?.[0]; const slogan = sloganOf(a); return html`<article key=${a.id} class="st-hero relative rounded-[var(--ms-r)] sf-raised sf-e2 overflow-hidden">
    <button data-featured data-newborn=${isNewborn(a) ? "1" : null} data-app=${a.id} aria-label=${nameOf(a)} onClick=${() => tap(a)} class="absolute inset-0 w-full h-full rounded-[inherit] text-left"></button>
    <div class="st-hero-body relative flex items-stretch gap-3 p-[var(--ms-pad)] pointer-events-none">
      <div class="st-hero-text min-w-0 flex-1 flex flex-col gap-1.5">
        <div class=${`${LABEL} flex items-center gap-1.5 min-w-0`}>${isNewborn(a) ? DOT() : null}<span class="truncate">${eyebrowOf(a)}</span></div>
        <div class="flex items-center gap-2.5 min-w-0">
          ${Tile(a, "w-10 h-10")}
          <span class="st-hero-name font-bold text-[1.05rem] leading-tight truncate">${nameOf(a)}</span>
        </div>
        ${slogan ? html`<div data-slogan class="st-hero-slogan font-bold tracking-tight">${slogan}</div>` : null}
        <p class="text-[0.8rem] text-muted leading-snug line-clamp-3">${subtitleOf(a)}</p>
        <div class="mt-auto pt-1">${pill(a, "pointer-events-auto")}</div>
      </div>
      ${tab ? html`<div class="st-hero-shots shrink-0 self-center flex items-center gap-2">
        <div class="st-hero-shot aspect-[384/832] rounded-[var(--ms-r-in)] overflow-hidden bg-black sf-raised sf-e2"><img src=${shotUrl(a, tab, light)} alt="" loading="lazy" decoding="async" class="w-full h-full block" /></div>
        <div class="st-hero-shot st-hero-shot2 aspect-[384/832] rounded-[var(--ms-r-in)] overflow-hidden bg-black sf-raised sf-e2"><img src=${shotUrl(a, tab, !light)} alt="" loading="lazy" decoding="async" class="w-full h-full block" /></div>
      </div>` : null}
    </div>
  </article>`; };
  const FeaturedTall = (a) => { const shot = firstShot(a); return html`<article key=${a.id} class="relative h-full rounded-[var(--ms-r)] sf-raised sf-e2 overflow-hidden">
    <button data-featured data-newborn=${isNewborn(a) ? "1" : null} data-app=${a.id} aria-label=${nameOf(a)} onClick=${() => tap(a)} class="absolute inset-0 w-full h-full rounded-[inherit] text-left"></button>
    <div class="relative h-full flex items-stretch gap-2.5 p-3 pointer-events-none">
      ${shot ? html`<div class="shrink-0 self-center w-14 aspect-[384/832] rounded-[var(--ms-r-in)] overflow-hidden bg-black sf-raised sf-e2"><img src=${shot} alt="" loading="lazy" decoding="async" class="w-full h-full block" /></div>` : null}
      <div class="min-w-0 flex-1 flex flex-col gap-1 py-0.5">
        <div class=${`${LABEL} flex items-center gap-1.5 min-w-0`}>${isNewborn(a) ? DOT() : null}<span class="truncate">${isNewborn(a) ? whenOf(a) : T(t, catKey(a.category))}</span></div>
        ${""}
        <span class="font-bold text-[0.88rem] leading-tight line-clamp-2 break-words">${nameOf(a)}</span>
        <div class="mt-auto pt-1">${pill(a, "pointer-events-auto")}</div>
      </div>
    </div>
  </article>`; };
  const Row = (a) => { const b = badgeOf(a); return html`<div data-app=${a.id} key=${a.id} class="flex items-center gap-3 py-2">
    <button aria-label=${nameOf(a)} onClick=${() => tap(a)} class="flex items-center gap-3 flex-1 min-w-0 text-left">
      ${Tile(a, "w-[3.25rem] h-[3.25rem]")}
      <div class="min-w-0 flex-1 flex flex-col gap-0.5">
        <span class="font-semibold text-[0.9rem] leading-tight truncate flex items-center gap-2">${nameOf(a)}${b ? tag(b) : null}${isFeatured(a) ? Icon("lucide:sparkles", "text-[0.8em] shrink-0", "color:var(--app-accent)") : null}</span>
        <span class="text-[0.78rem] text-muted leading-snug truncate">${subtitleOf(a)}</span>
      </div>
    </button>
    ${pill(a)}
  </div>`; };
  const rows = (items) => html`<div class="flex flex-col [&>div+div]:border-t [&>div+div]:border-base-300/40">${items.map(Row)}</div>`;
  const CAT_GLYPH = { science: "lucide:orbit", feeds: "lucide:rss", tools: "lucide:wrench", sound: "lucide:music-4", hackrf: "lucide:radio", creative: "lucide:sparkles", money: "lucide:coins", wellness: "lucide:leaf", play: "lucide:gamepad-2", esoterica: "lucide:moon-star" };
  const sectionHead = (label, count, cat) => html`<div class="flex items-baseline justify-between gap-3 px-0.5">
    <span class="font-bold text-[1.15rem] leading-tight tracking-tight inline-flex items-center gap-2">${cat && CAT_GLYPH[cat] ? Icon(CAT_GLYPH[cat], "st-cat-glyph") : null}${label}</span>
    <span class=${`${LABEL} tabular-nums shrink-0`}>${count}</span>
  </div>`;
  const noResults = html`<div class="flex flex-col items-center text-muted py-16 gap-2 text-center px-6">${Icon("lucide:search-x", "text-4xl")}<span>${T(t, "noResults")}</span></div>`;
  const dateLine = new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const query = q.trim().toLowerCase();
  const found = query ? apps.filter((a) => (nameOf(a) + " " + taglineOf(a)).toLowerCase().includes(query)).sort(byName) : null;
  const onType = (e) => { setQ(e.target.value); if (e.target.value && !S.searchOpen.get()) S.searchOpen.set(true); };
  const headRow = searchOpen
    ? html`<div data-search-open class="flex items-center gap-2 min-h-[var(--ms-ctl)] px-0.5">
        ${Icon("lucide:search", "text-lg text-muted shrink-0")}
        <textarea id="store-filter" ref=${fieldRef} rows="1" data-line enterkeyhint="search" value=${q} onInput=${onType} placeholder=${T(t, "search")} aria-label=${T(t, "search")} autocomplete="off"
          class="grow min-w-0 bg-transparent text-base leading-6 py-1.5 border-0 px-0 outline-none appearance-none focus:outline-none focus:ring-0 shadow-none placeholder:text-muted"></textarea>
        <span id="store-status" class=${`${LABEL} tabular-nums shrink-0`}>${found ? found.length : apps.length}</span>
        <button id="search-close" class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label=${T(t, "close")} onClick=${() => S.searchOpen.set(false)}>${Icon("lucide:x", "text-xl")}</button>
      </div>`
    : html`<div class="flex items-end justify-between gap-3 px-0.5">
        <div class="flex flex-col gap-0.5 min-w-0">
          <div class=${`${LABEL} text-muted`}>${dateLine}</div>
          <h2 class="text-[2rem] font-bold leading-none tracking-tight">${T(t, "today")}</h2>
        </div>
        <textarea id="store-filter" rows="1" data-line enterkeyhint="search" class="input hidden" tabindex="-1" aria-hidden="true" value=${q} onInput=${onType}></textarea>
        <button id="search-btn" class="btn btn-ghost btn-sm btn-circle shrink-0 mb-0.5" aria-label=${T(t, "search")} onClick=${() => S.searchOpen.set(true)}>${Icon("lucide:search", "text-xl")}</button>
      </div>`;

  const railRef = useRef(null);
  const [slide, setSlide] = useState(0);
  const onRail = () => { const el = railRef.current; if (!el || el.children.length < 2) return; const step = el.children[1].offsetLeft - el.children[0].offsetLeft; setSlide(Math.max(0, Math.min(SLIDES.length - 1, Math.round(el.scrollLeft / step)))); };
  const goSlide = (i) => { const el = railRef.current; if (!el?.children[i]) return; el.scrollTo({ left: el.children[i].offsetLeft - el.children[0].offsetLeft, behavior: "smooth" }); };
  const Fresh = (a, i) => { const life = Math.max(0.12, 1 - ageDays(a) / FRESH_DAYS); return html`<button key=${a.id} data-app=${a.id} data-fresh-card aria-label=${nameOf(a)} onClick=${() => tap(a)} style=${`--life:${life.toFixed(2)};--i:${i}`} class="st-fresh relative w-full text-left rounded-[calc(var(--ms-r)*.8)] sf-raised sf-e2 overflow-hidden flex items-center gap-3 p-2.5 pl-3.5">
    <span aria-hidden="true" class="st-fresh-life"></span>
    ${Tile(a, "w-11 h-11")}
    <span class="min-w-0 flex-1 flex flex-col gap-0.5">
      <span class=${`${LABEL} flex items-baseline justify-between gap-2 leading-none`}>
        <span class="truncate">${T(t, catKey(a.category))}</span>
        <span class="text-muted shrink-0 normal-case tracking-normal">${whenOf(a)}</span>
      </span>
      <span class="font-semibold text-[0.88rem] leading-tight truncate">${nameOf(a)}</span>
      <span class="text-[0.72rem] text-muted leading-snug line-clamp-2">${subtitleOf(a)}</span>
    </span>
  </button>`; };
  const freshSection = SLIDES.length ? html`<section data-fresh class="flex flex-col gap-2">
    <div class="flex items-baseline justify-between gap-3 px-0.5">
      <span class="font-bold text-[1.15rem] leading-tight tracking-tight">${T(t, "fresh")}</span>
      ${SLIDES.length > 1
        ? html`<button data-fresh-page class=${`${LABEL} tabular-nums shrink-0 py-1 px-1.5 -mr-1.5 -my-1 rounded-full`} aria-label=${`${T(t, "freshPage")} ${slide + 1} / ${SLIDES.length}`} onClick=${() => goSlide((slide + 1) % SLIDES.length)}><span class="text-base-content font-semibold">${slide + 1}</span> / ${SLIDES.length}</button>`
        : html`<span class=${`${LABEL} tabular-nums shrink-0`}>${FRESH.length}</span>`}
    </div>
    <div ref=${railRef} onScroll=${onRail} class="st-rail relative flex gap-3 overflow-x-auto snap-x snap-mandatory [overscroll-behavior-x:contain] [scrollbar-width:none] [scroll-padding-inline:var(--ms-pad)] -mx-[var(--ms-pad)] px-[var(--ms-pad)] pb-1">
      ${SLIDES.map((s, i) => html`<div key=${i} data-fresh-slide class="st-slide ms-stagger snap-start shrink-0 grid gap-2 content-start">${s.map(Fresh)}</div>`)}
    </div>
  </section>` : null;

  if (found) {
    return html`<div class="flex flex-col gap-4" data-store-mode="search" data-store-search=${searchOpen ? "open" : "folded"} data-store-found=${found.length}>${headRow}
      <div class="ms-stagger flex flex-col" key=${query}>${found.length ? rows(found) : noResults}</div>
      ${page}
    </div>`;
  }

  return html`<div class="flex flex-col gap-7" data-store-mode="today" data-store-search=${searchOpen ? "open" : "folded"} data-store-featured=${FEATURED.length} data-store-newborn=${NEWBORN.length} data-store-page=${sel ? sel.id : null}>
    ${headRow}
    ${FEATURED.length ? html`<div class="ms-stagger grid grid-cols-2 md:grid-cols-3 gap-3">${FEATURED.map((a, i) => html`<div style=${`--i:${i}`} key=${a.id} class=${i === 0 ? "col-span-2 md:col-span-3" : "min-h-0"}>${i === 0 ? Featured(a) : FeaturedTall(a)}</div>`)}</div>` : null}
    ${freshSection}
    ${CATS.map((c) => {
      const items = apps.filter((a) => a.category === c).sort(byName);
      if (!items.length) return null;
      return html`<div class="flex flex-col gap-2" key=${c}>
        ${sectionHead(T(t, catKey(c)), items.length, c)}
        ${items.every(needsUsb) ? html`<div class="flex items-center gap-1.5 text-sm text-muted px-0.5">${Icon("lucide:usb", "shrink-0", "color:var(--app-accent)")}<span>${T(t, "needsDevice")}</span></div>` : null}
        ${rows(items)}
      </div>`;
    })}
    ${page}
  </div>`;
}
