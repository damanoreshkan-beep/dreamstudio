// DreamStudio store — the farm's launcher in the App Store's own structure (2026-08-31, second cut): a
// VERTICAL page with no horizontal scroller on it at all (the first cut's snap rails fought the vertical
// swipe on a phone), made of: a large "Today" title, a stack of full-width featured cards (a REAL capture of
// the app as the ground, eyebrow + title + one line, the icon row with an Open pill), then a section per
// category — three rows and "See all". A category or a search is the full list of rows. The app page (the
// kit's Sheet, large) is the App Store product page: icon + name + Open, an information strip, a carousel
// of real per-screen captures, the description, What's new, Information. NEW badges live in IndexedDB via
// /_rt/db.js. The account card on the Me tab comes from the runtime (profile.account) — the same sealed
// session tide and nova use. The store lives in its OWN scope (/store/), so opening an app is out-of-scope
// → the app is independently installable even when the store PWA is installed. Apps are siblings at ../<id>/.
import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Sheet } from "/_rt/ui.js";
import { collection } from "/_rt/db.js";
import apps from "./apps.json" with { type: "json" };
import spec from "./spec.json" with { type: "json" };

const Icon = (icon, cls, style) => html`<iconify-icon icon=${icon} class=${cls || ""} style=${style || ""}></iconify-icon>`;
// The ONE micro-label size (the density ladder's --ms-label; `length:` because a bare var() in text-[…] is a
// COLOUR to Tailwind v4). Every eyebrow, fact caption and count reads this — the store had seven hand-picked
// sizes down to 0.52rem, below the ladder's own floor. Ink only: the accent is a MARK (a dot, a rim), never text.
const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70";
const DOT = (accent2) => html`<span aria-hidden="true" class="w-1.5 h-1.5 rounded-full shrink-0" style=${`background:var(${accent2 ? "--app-accent-2" : "--app-accent"})`}></span>`;
// The app's REAL icon: the icon.svg wrapper — a 256² WebP of light on its own black ground — fills the tile
// in both themes, because the glow is the identity and re-tinting it would wash it out
// (docs/research/luminous-icons.md). An app without one falls back to its brand paths, then to a glyph.
const AppArt = (a, size) => a.icon
  ? html`<img src=${`../${a.id}/icon.svg`} alt="" aria-hidden="true" decoding="async" loading="lazy" style=${`width:${size};height:${size}`} class="rounded-[inherit] block" />`
  : a.art
  ? html`<svg viewBox="0 0 24 24" style=${`width:${size};height:${size};color:var(--color-base-content)`} fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: a.art }}></svg>`
  : Icon(a.glyph, "", `font-size:${size};color:var(--color-base-content)`);
// A tile: the icon on its own black ground with the farm's lit rim. `cls` sizes it.
const Tile = (a, cls) => html`<div class=${`relative shrink-0 rounded-[22%] overflow-hidden bg-black sf-raised sf-e2 flex items-center justify-center ${cls}`}>${AppArt(a, a.icon ? "100%" : "46%")}</div>`;
const SEEN = collection("seen");      // { id → { v: lastSeenVersion } } — "you have opened this"
// The catalogue you had already been SHOWN — a different question, used to share its answer. `seen` is
// empty for a first-time visitor, so "not in seen" marked all apps NEW: a wall of identical badges. NEW
// means "appeared since your last visit": the first visit establishes the baseline and marks nothing.
const CATALOG = collection("catalog");
const appUrl = (id, install = false) => `../${id}/${install ? "?install=1" : ""}`;   // store is /…/store/, apps are siblings /…/<id>/
// Every screen is captured in BOTH themes (the eye batch runs twice), so a paper store shows paper apps —
// dark captures in the light theme were the tell that nothing was adapted. The view subscribes to S.theme
// (below), the one sanctioned way for markup to follow the toggle live.
const shotUrl = (a, tab, light) => `./assets/shot-${a.id}--${tab}${light ? "--light" : ""}.webp`;
// Section order: everyday utilities first. Each app declares its own `category` in spec.json (carried into
// apps.json by the manifest), so the sections group themselves — the store never hard-codes where an app goes.
const CATS = ["science", "feeds", "tools", "sound", "hackrf", "creative", "money", "wellness", "play", "esoterica"];
const catKey = (c) => "cat" + c[0].toUpperCase() + c.slice(1);
// TODAY (owner, 2026-09-03: "апки додаватись автоматом … створені впродовж 48 годин, а в цій рубриці
// показується одна стара"): the stack is NEWBORN + CURATED. An app born in the last TODAY_DAYS (its `added`
// stamp, see FRESH below — day granularity, so "48 hours" = today or yesterday) leads the stack by itself,
// newest first, and becomes the hero; `spec.featured` is the editors' list and follows, minus any app the
// birthday already placed. Nobody edits `featured` to announce a launch, and a launch leaves the top by
// ageing into the curated order — or out of it. The hero's eyebrow says WHEN for a newborn, not "premium".
const TODAY_DAYS = 2;
const ageDays = (a) => Math.max(0, Math.floor((Date.now() - Date.parse(a.added + "T00:00:00")) / 86400000));
const isNewborn = (a) => !!a.added && ageDays(a) < TODAY_DAYS;
const NEWBORN = apps.filter(isNewborn).sort((x, y) => y.added.localeCompare(x.added) || x.title.localeCompare(y.title, "uk"));
const CURATED = (spec.featured || []).map((id) => apps.find((a) => a.id === id)).filter((a) => a && !isNewborn(a));
const FEATURED = [...NEWBORN, ...CURATED];
const isFeatured = (a) => FEATURED.some((f) => f.id === a.id);
const ROWS_PER_SECTION = 3;
// FRESH ARRIVALS (owner, 2026-09-02: "рубрика свіжі новинки … слайди по 3 … щоб оновлювалось автоматом, а
// старі чистились"): a rubric nobody curates. An app carries `added` — its birthday, stamped into spec.json
// by the core's scaffold on the FIRST scaffold and carried here by the manifest — and the rubric is that
// field and a window: the apps born in the last FRESH_DAYS, newest first, at most three slides of three. A
// new app joins by being scaffolded; an old one leaves by ageing. An app without `added` (the farm before
// the split) is simply never fresh. Nothing is ever edited here to add or remove one.
const FRESH_DAYS = 21, FRESH_MAX = 9, PER_SLIDE = 3;
const FRESH = apps.filter((a) => a.added && ageDays(a) <= FRESH_DAYS)
  .sort((x, y) => y.added.localeCompare(x.added) || x.title.localeCompare(y.title, "uk")).slice(0, FRESH_MAX);
const SLIDES = Array.from({ length: Math.ceil(FRESH.length / PER_SLIDE) }, (_, i) => FRESH.slice(i * PER_SLIDE, i * PER_SLIDE + PER_SLIDE));

export function store({ S, openScreen, closeScreen }) {
  const t = useStore(S.t), screen = useStore(S.screen), locale = useStore(S.locale);
  const light = useStore(S.theme) === "signal-light";
  const firstShot = (a) => (a.shots?.length ? shotUrl(a, a.shots[0], light) : null);
  // The tile text is the APP's string, not the store's — the manifest carries every locale and the view picks.
  const nameOf = (a) => a.titles?.[locale] || a.title;
  const taglineOf = (a) => a.taglines?.[locale] || a.tagline || "";
  const screensOf = (a) => a.screens?.[locale] || a.screens?.en || [];
  // The first sentence is the App Store's "subtitle"; the whole paragraph is the description on the page.
  const subtitleOf = (a) => { const s = taglineOf(a); const m = /^(.{12,90}?[.!?—])\s/.exec(s + " "); return m ? m[1].replace(/[—.]$/, "") : s; };
  // The manifest bakes ONE order (uk-collated) — the sort belongs to the render, beside the names it sorts.
  const byName = (x, y) => nameOf(x).localeCompare(nameOf(y), locale);
  // ONE page, no inner navigation (owner, 2026-08-31): the first cut's category switch was LOCAL state, so
  // the hardware Back could not return from it — a violation of the farm's routing invariant (every
  // dismissable state is history-backed). Rather than wiring history into a filter, the mechanism is GONE:
  // everything is on the one scrolling page, search filters it in place, and the only overlay is the app
  // page, which rides S.screen and already answers Back.
  // SEARCH lives in the header row, folded behind an icon (rules/invariants.md, owner 2026-09-04: a permanent
  // bar "багато займає місця у шапці"). The OPEN state rides the runtime's own S.searchOpen — the atom the
  // Back registry already folds for a list tab's header search — so system Back folds it here too; the
  // query is view state that empties whenever the field folds. Unfolded, the field takes the Today row's
  // place: glyph · field (focused) · a mono count of matches · ×.
  const [q, setQ] = useState("");
  const searchOpen = useStore(S.searchOpen);
  const fieldRef = useRef(null);
  useEffect(() => { if (searchOpen) fieldRef.current?.focus?.(); else setQ(""); }, [searchOpen]);
  const [seen, setSeen] = useState(null);   // { id: version } last opened at (null while loading from IndexedDB)
  const [fresh, setFresh] = useState(null); // ids that were NOT in the catalogue last visit (null = loading)
  const [more, setMore] = useState(false);  // the page's description, expanded
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
  const installed = (a) => !!seen && a.id in seen;   // opened at least once = the store's actionable "installed" (no cross-origin install API)
  const remember = (a) => { SEEN.put(a.id, { v: a.version }).catch(() => {}); setSeen((s) => ({ ...(s || {}), [a.id]: a.version })); };
  const launch = (a, install = false) => { remember(a); try { window.open(appUrl(a.id, install), "_blank", "noopener"); } catch { location.assign(appUrl(a.id, install)); } };
  // NEW / UPDATED: a mono word in ink with the pole as its MARK — amber for a newcomer, cyan for a new version.
  // A filled accent badge put the pole under text, which the material forbids (rubric: the bloom never sits behind text).
  const tag = (b) => b === "new" ? html`<span class=${`${LABEL} inline-flex items-center gap-1 shrink-0`}>${DOT()}${T(t, "newBadge")}</span>` : b === "upd" ? html`<span class=${`${LABEL} inline-flex items-center gap-1 shrink-0`}>${DOT(true)}${T(t, "updBadge")}</span>` : null;
  const needsUsb = (a) => (a.needs || []).includes("usb");
  // Tap: the app page for anything you have not opened yet (discovery), a straight launch for one you have.
  const tap = (a) => (installed(a) ? launch(a) : openScreen(a.id));
  // The App Store's GET: a quiet pill — ink on a base-300 pill, never a filled button on every row (thirty
  // filled buttons is a wall, not a store). The page's own Open is the one filled button.
  const pill = (a, extra = "") => html`<button class=${`btn btn-xs rounded-full px-3.5 min-h-7 h-7 bg-base-300 border-0 text-base-content font-bold shrink-0 ${extra}`} aria-label=${`${T(t, "openApp")} — ${nameOf(a)}`} onClick=${(e) => { e.stopPropagation(); launch(a); }}>${installed(a) ? Icon("lucide:external-link", "text-sm") : T(t, "openApp")}</button>`;

  // ── the app PAGE (history-backed via S.screen: Back closes it) ──
  const sel = screen ? apps.find((a) => a.id === screen) : null;
  const page = html`<${Sheet} id="appsheet" size="lg" open=${!!sel} onClose=${closeScreen} title=${sel ? nameOf(sel) : ""}>
    ${sel ? (() => { const b = badgeOf(sel), scr = screensOf(sel), shots = sel.shots || [], desc = taglineOf(sel), long = desc.length > 180; return html`<div class="flex flex-col gap-6 pb-2">
      ${/* The product header: icon left, name / subtitle / the one filled Open + a quiet Install beside it. */""}
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
      ${/* The information strip — the App Store's row of facts under the header: a label in small caps, the
            value below. A WELL (sf-inset) rather than two hairlines: the facts sit IN the page, and a border
            around a strip is not depth in this material. Version · category · offline · screens. */""}
      <div class="grid grid-cols-4 divide-x divide-base-300/60 sf-inset rounded-[var(--ms-r-in)] py-3 text-center">
        ${[[T(t, "version"), `v${sel.version || "1.0"}`], [T(t, "category"), T(t, catKey(sel.category))], [T(t, "offline"), T(t, "yes")], [T(t, "screens"), String(scr.length || 1)]].map(([k, v]) => html`<div class="px-1 min-w-0 flex flex-col gap-1" key=${k}>
          <div class=${`${LABEL} truncate`}>${k}</div>
          <div class="text-sm font-semibold truncate">${v}</div>
        </div>`)}
      </div>
      ${/* the device note is a fact in ink; the USB glyph carries the accent as the mark that says "attention" */""}
      ${needsUsb(sel) ? html`<div data-needs-device class="flex items-center gap-2 text-sm text-base-content sf-inset rounded-[var(--ms-r-in)] px-3 py-2">${Icon("lucide:usb", "shrink-0 text-[length:var(--ms-icon)]", "color:var(--app-accent)")}<span>${T(t, sel.deviceNote || "needsDeviceHackrf")}</span></div>` : null}
      ${/* Screenshots — one real capture per screen, in the app's populated state. The ONE horizontal scroller
            in the store: proximity snap (never mandatory — that is what fought the vertical swipe), its own
            overscroll, no scrollbar. */""}
      ${shots.length ? html`<div class="flex flex-col gap-2">
        <div class="font-bold text-lg px-0.5">${T(t, "screenshots")}</div>
        <div class="flex gap-3 overflow-x-auto snap-x [overscroll-behavior-x:contain] [scrollbar-width:none] -mx-[var(--ms-pad)] px-[var(--ms-pad)] pb-1">
          ${shots.map((tab, i) => html`<figure key=${tab} class="snap-start shrink-0 w-[62%] max-w-[15rem] rounded-[var(--ms-r-in)] overflow-hidden bg-black sf-raised sf-e2 aspect-[384/832]">
            <img src=${shotUrl(sel, tab, light)} alt=${scr[i] || ""} loading=${i ? "lazy" : "eager"} decoding="async" class="w-full h-full object-cover object-top block" />
          </figure>`)}
        </div>
      </div>` : null}
      ${/* The description — the app's own paragraph, clamped with a "more" like the App Store's. */""}
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
          ${[[T(t, "developer"), "DreamStudio"], [T(t, "category"), T(t, catKey(sel.category))], [T(t, "version"), `v${sel.version || "1.0"}`], [T(t, "offline"), T(t, "yes")], [T(t, "installation"), T(t, "homeScreen")], ...(needsUsb(sel) ? [[T(t, "device"), "USB"]] : []), ...(scr.length ? [[T(t, "screens"), scr.join(" · ")]] : [])].map(([k, v]) => html`<div class="flex items-start justify-between gap-4 py-2.5 border-b border-base-300/50 last:border-0" key=${k}><span class="text-muted shrink-0">${k}</span><span class="text-right break-words">${v}</span></div>`)}
        </div>
      </div>
    </div>`; })() : null}
  <//>`;

  // ── the shapes: FEATURED cards, list ROW ──
  // Today's stack is a HERO + a two-column grid (owner, 2026-09-01: "картки зроби на мобі в 2 колонки але
  // гарно"): the first card keeps the wide layout — text left, the capture as a proportional thumbnail —
  // and every other featured app is a vertical card, its capture on top cropped from the app's own head
  // (object-top: the header and the first content, never a stretched middle). A full-bleed tap layer sits
  // under the content and the pill above it — never a button inside a button (axe: nested-interactive).
  // The hero carries the store's EDITORIAL slogan for the app (i18n `slogan_<id>`, the App Store's own
  // practice: the Today headline is the editors' line, not the developer's tagline) above the app's first
  // sentence; with no slogan the line simply is not there. Its width answers itself — head.html's container
  // query grows the words and stands the second capture (the other theme) beside the first past 34rem.
  const sloganOf = (a) => t?.["slogan_" + a.id] || "";
  // WHEN, in words the reader already thinks in: "сьогодні" · "вчора" · "3 дні тому" · "2 тижні тому".
  const rtf = new Intl.RelativeTimeFormat(locale === "uk" ? "uk" : "en", { numeric: "auto" });
  const whenOf = (a) => { const d = ageDays(a); return d < 7 ? rtf.format(-d, "day") : rtf.format(-Math.round(d / 7), "week"); };
  // The eyebrow of a Today card: a newborn says WHEN it was born (the reason it is here), a curated app says
  // "premium" (the editors' reason) — both followed by the category.
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
  // TINY and whole (owner, 2026-09-01: "картинки … повністю пропорційні маленькі, картки акуратно
  // крихітно"): the capture is never cropped — a small phone at its own 384:832 aspect on the left, the
  // words in a quiet column beside it. No tagline here; the hero and the app page carry the prose.
  const FeaturedTall = (a) => { const shot = firstShot(a); return html`<article key=${a.id} class="relative h-full rounded-[var(--ms-r)] sf-raised sf-e2 overflow-hidden">
    <button data-featured data-newborn=${isNewborn(a) ? "1" : null} data-app=${a.id} aria-label=${nameOf(a)} onClick=${() => tap(a)} class="absolute inset-0 w-full h-full rounded-[inherit] text-left"></button>
    <div class="relative h-full flex items-stretch gap-2.5 p-3 pointer-events-none">
      ${shot ? html`<div class="shrink-0 self-center w-14 aspect-[384/832] rounded-[var(--ms-r-in)] overflow-hidden bg-black sf-raised sf-e2"><img src=${shot} alt="" loading="lazy" decoding="async" class="w-full h-full block" /></div>` : null}
      <div class="min-w-0 flex-1 flex flex-col gap-1 py-0.5">
        <div class=${`${LABEL} flex items-center gap-1.5 min-w-0`}>${isNewborn(a) ? DOT() : null}<span class="truncate">${isNewborn(a) ? whenOf(a) : T(t, catKey(a.category))}</span></div>
        ${/* no icon tile here — the capture already IS the app's face, and the 80px column belongs to the name */""}
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
  // A plain column with a full-width hairline between rows — the first cut indented every row after the
  // first with a margin meant for the divider alone, and the whole list stepped sideways.
  const rows = (items) => html`<div class="flex flex-col [&>div+div]:border-t [&>div+div]:border-base-300/40">${items.map(Row)}</div>`;
  const sectionHead = (label, count) => html`<div class="flex items-baseline justify-between gap-3 px-0.5">
    <span class="font-bold text-[1.15rem] leading-tight tracking-tight">${label}</span>
    <span class=${`${LABEL} tabular-nums shrink-0`}>${count}</span>
  </div>`;
  const noResults = html`<div class="flex flex-col items-center text-muted py-16 gap-2 text-center px-6">${Icon("lucide:search-x", "text-4xl")}<span>${T(t, "noResults")}</span></div>`;
  const dateLine = new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  // search filters the one page in place — the list remounts (key) so the stagger plays
  const query = q.trim().toLowerCase();
  const found = query ? apps.filter((a) => (nameOf(a) + " " + taglineOf(a)).toLowerCase().includes(query)).sort(byName) : null;
  // The head row: the date + "Today" with the search glyph at its right, or — unfolded — the field in that
  // row's place, the runtime's own shape (SearchField in render.js: a bare row, the count at the right, ×).
  // Folded, a hidden twin keeps `#store-filter` in the DOM so a typed query still drives the page, the way
  // the runtime keeps its `#filter` — and typing into the twin unfolds the field, since a query has to be
  // visible to be cleared.
  const onType = (e) => { setQ(e.target.value); if (e.target.value && !S.searchOpen.get()) S.searchOpen.set(true); };
  const headRow = searchOpen
    ? html`<div data-search-open class="flex items-center gap-2 h-[var(--ms-ctl)] px-0.5">
        ${Icon("lucide:search", "text-lg text-muted shrink-0")}
        <input id="store-filter" ref=${fieldRef} type="search" value=${q} onInput=${onType} placeholder=${T(t, "search")} aria-label=${T(t, "search")} autocomplete="off"
          class="input grow min-w-0 bg-transparent text-base border-0 px-0 outline-none appearance-none focus:outline-none focus:ring-0 shadow-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden" />
        <span id="store-status" class=${`${LABEL} tabular-nums shrink-0`}>${found ? found.length : apps.length}</span>
        <button id="search-close" class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label=${T(t, "close")} onClick=${() => S.searchOpen.set(false)}>${Icon("lucide:x", "text-xl")}</button>
      </div>`
    : html`<div class="flex items-end justify-between gap-3 px-0.5">
        <div class="flex flex-col gap-0.5 min-w-0">
          <div class=${`${LABEL} text-muted`}>${dateLine}</div>
          <h2 class="text-[2rem] font-bold leading-none tracking-tight">${T(t, "today")}</h2>
        </div>
        <input id="store-filter" type="search" class="input hidden" tabindex="-1" aria-hidden="true" value=${q} onInput=${onType} />
        <button id="search-btn" class="btn btn-ghost btn-sm btn-circle shrink-0 mb-0.5" aria-label=${T(t, "search")} onClick=${() => S.searchOpen.set(true)}>${Icon("lucide:search", "text-xl")}</button>
      </div>`;

  // ── FRESH ARRIVALS: a pager of slides, three tiny cards each ──
  // The slide is the unit (owner: "слайди по 3 щоб вміщалось"): a horizontal pager with MANDATORY snap on
  // whole slides, each slide a stack of three cards — never a rail of cards, which stops mid-card. The
  // counter beside the title ("2 / 3", not dots) is read off the scroller itself and is a button: a tap
  // turns the page — the one way to page without a touch screen. The next slide peeks in from the right
  // (head.html: the slide is 2rem short of the rail), which is what says "there is more" without an arrow.
  const railRef = useRef(null);
  const [slide, setSlide] = useState(0);
  const onRail = () => { const el = railRef.current; if (!el || el.children.length < 2) return; const step = el.children[1].offsetLeft - el.children[0].offsetLeft; setSlide(Math.max(0, Math.min(SLIDES.length - 1, Math.round(el.scrollLeft / step)))); };
  const goSlide = (i) => { const el = railRef.current; if (!el?.children[i]) return; el.scrollTo({ left: el.children[i].offsetLeft - el.children[0].offsetLeft, behavior: "smooth" }); };
  // A fresh card: tiny and whole — the icon tile, an eyebrow that says the category and WHEN, the name, two
  // lines of the app's own first sentence. Down the left edge a 2px light whose height IS the app's
  // freshness (born today = the full height, the window's last day = a spark): colour as meaning, no badge
  // and no pill — the whole card is the button and the app page carries Open.
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

  // TODAY — the whole store on one scroll: the featured stack, then every category with ALL its apps.
  // data-store-* are the state hooks the driver reads: the mode, the search fold, how many lead Today and
  // how many are newborn, the open page.
  return html`<div class="flex flex-col gap-7" data-store-mode="today" data-store-search=${searchOpen ? "open" : "folded"} data-store-featured=${FEATURED.length} data-store-newborn=${NEWBORN.length} data-store-page=${sel ? sel.id : null}>
    ${headRow}
    ${FEATURED.length ? html`<div class="ms-stagger grid grid-cols-2 md:grid-cols-3 gap-3">${FEATURED.map((a, i) => html`<div style=${`--i:${i}`} key=${a.id} class=${i === 0 ? "col-span-2 md:col-span-3" : "min-h-0"}>${i === 0 ? Featured(a) : FeaturedTall(a)}</div>`)}</div>` : null}
    ${freshSection}
    ${CATS.map((c) => {
      const items = apps.filter((a) => a.category === c).sort(byName);
      if (!items.length) return null;
      return html`<div class="flex flex-col gap-2" key=${c}>
        ${sectionHead(T(t, catKey(c)), items.length)}
        ${items.every(needsUsb) ? html`<div class="flex items-center gap-1.5 text-sm text-muted px-0.5">${Icon("lucide:usb", "shrink-0", "color:var(--app-accent)")}<span>${T(t, "needsDevice")}</span></div>` : null}
        ${rows(items)}
      </div>`;
    })}
    ${page}
  </div>`;
}
