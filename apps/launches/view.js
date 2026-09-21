// Космічні запуски — the two screens the launch list could not be.
//
// A feed answers "what is next". It cannot answer "where on Earth does it leave from" or "what does my
// month look like", and both questions were already in the data we were throwing away: every Launch
// Library pad carries a latitude and a longitude, and every launch carries how far its date is to be
// believed. So the pads go on the systemic globe (/_rt/globe.js, the same Earth the globe and sun apps
// spin) and the dated ones go on the systemic month grid (/_rt/calendar.js).
//
// The honest half: only 11 of the next 40 launches have a date anyone promised — 15 come back as a
// quarter and 12 as a month, which Launch Library returns as the last day of the period at 00:00Z
// (measured 2026-09-21). Those are NOT drawn on a calendar day; they sit under the month in their own
// block, and the card label stops at "жовтень 2026" instead of counting down to the 31st.
//
// Both views read the SAME items the list loaded (S.data) — a tool tab has no `load` of its own, which is
// also why the adapter asks for 40 in one request rather than 15.
import { html } from "htm/preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T, whenLabel } from "/_rt/i18n.js";
import { Globe } from "/_rt/globe.js";
import { Calendar, monthKey } from "/_rt/calendar.js";
import { Panel } from "/_rt/ui.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
// `length:` — a bare var() in text-[…] reads as a COLOUR to Tailwind v4 and the size falls back to the parent's
const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70";

// A pad's fix, written the way a map writes it — hemispheres instead of signs, so it survives being read
// aloud and never depends on the reader knowing that a minus means south.
const coords = (lat, lon) =>
  `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? "E" : "W"}`;

const Nothing = (t, key) => html`<div class="flex flex-col items-center text-muted py-10 gap-2 text-center px-6">
  ${Icon("lucide:radar", "text-3xl")}<span class="text-sm">${T(t, key)}</span></div>`;

// One launch, as a row you can tap into the drill-down the list already owns. S.detail is the runtime's
// overlay atom, so the globe and the calendar open the very same screen a card does — including its
// favourite star and its Back entry — instead of each growing a detail of its own.
const Launch = ({ it, t, loc, S }) => html`<button type="button" data-launch=${it.id}
  class="flex items-center gap-2.5 py-2 w-full text-left min-w-0" onClick=${() => S.detail.set(it)}>
  <span class="w-10 h-10 shrink-0 rounded-[var(--ms-r-in)] overflow-hidden sf-inset grid place-items-center">
    ${it.thumb
      ? html`<img src=${it.thumb} alt="" loading="lazy" class="w-full h-full object-cover" />`
      : Icon("lucide:rocket", "text-lg text-muted")}
  </span>
  <span class="min-w-0 flex-1">
    <span class="block font-medium truncate">${it.title}</span>
    <span class="block text-sm text-muted truncate">${whenLabel(t, it.net, loc, true, it.precision)}</span>
  </span>
  ${Icon("lucide:chevron-right", "text-muted shrink-0")}
</button>`;

// ── map — every pad we hold, on the Earth ─────────────────────────────────────────────────────────────
export function pads({ S }) {
  const t = useStore(S.t), loc = useStore(S.locale), data = useStore(S.data);
  const items = data.items || [];
  const [sel, setSel] = useState(null);
  const [focus, setFocus] = useState(null);

  // Launches cluster on a handful of pads — 25 of the next 40 leave from the USA alone — so the globe
  // plots SITES, not launches: one dot per fix, its radius carrying how many launches wait there.
  const sites = useMemo(() => {
    const by = new Map();
    for (const it of items) {
      if (it.lat == null || it.lon == null) continue;
      const key = `${it.lat.toFixed(3)},${it.lon.toFixed(3)}`;
      let s = by.get(key);
      if (!s) by.set(key, (s = { key, lat: it.lat, lon: it.lon, pad: it.pad, place: it.place, country: it.country, list: [] }));
      s.list.push(it);
    }
    return [...by.values()].sort((a, b) => Date.parse(a.list[0]?.net) - Date.parse(b.list[0]?.net));
  }, [items]);

  const points = sites.map((s) => ({ lat: s.lat, lon: s.lon, key: s.key, r: 3 + Math.min(4, s.list.length - 1), pulse: s.key === sel }));
  const choose = (s) => { setSel(s.key === sel ? null : s.key); setFocus({ lat: s.lat, lon: s.lon }); };
  // A tap on the canvas: globe.js hit-tests `points` first and hands the hit back as `point`, so the pin
  // and the row below are the same control — ocean taps fall through and change nothing.
  const pick = ({ point }) => { if (point) { setSel(point.key); setFocus({ lat: point.lat, lon: point.lon }); } };

  return html`<div class="flex flex-col gap-[var(--ms-gap)]" data-sites=${sites.length} data-site=${sel || ""}>
    <${Globe} points=${points} focus=${focus} onPick=${pick} spin=${!sel} height=${300} />
    ${sites.length
      ? html`<${Panel} title=${T(t, "sites")} data-pads=${sites.length}>
          <div class="divide-y divide-base-300/40">
            ${sites.map((s) => html`<div key=${s.key}>
              <button type="button" data-site-row=${s.key} aria-expanded=${s.key === sel}
                class="flex items-center gap-2.5 py-2 w-full text-left min-w-0" onClick=${() => choose(s)}>
                ${/* the country's code in a well — the same mark the globe app puts where a flag emoji would be */""}
                <span class="w-9 h-9 shrink-0 rounded-[var(--ms-r-in)] sf-inset grid place-items-center font-mono text-[0.68rem] font-semibold tracking-wider">${s.country || "—"}</span>
                <span class="min-w-0 flex-1">
                  <span class="block font-medium truncate">${s.pad || s.place}</span>
                  <span class="block text-sm text-muted truncate">${s.place}</span>
                </span>
                <span class="font-mono tabular-nums text-sm text-base-content/70 shrink-0">${s.list.length}</span>
              </button>
              ${s.key === sel
                ? html`<div class="pb-2 pl-11 flex flex-col min-w-0">
                    <span data-coords class=${LABEL}>${coords(s.lat, s.lon)}</span>
                    ${s.list.map((it) => html`<${Launch} it=${it} t=${t} loc=${loc} S=${S} key=${it.id} />`)}
                  </div>`
                : null}
            </div>`)}
          </div>
        <//>`
      : data.loading ? null : Nothing(t, data.error ? "statusError" : "mapEmpty")}
  </div>`;
}

// ── cal — the month, and what the month refuses to say ────────────────────────────────────────────────
export function agenda({ S }) {
  const t = useStore(S.t), loc = useStore(S.locale), data = useStore(S.data);
  const items = data.items || [];
  const here = monthKey(Date.now());
  const [ym, setYm] = useState(here);
  const [day, setDay] = useState(null);

  // `day` is filled only for a launch someone has actually dated (data.js), so the marks cannot lie.
  const dated = useMemo(() => items.filter((it) => it.day), [items]);
  const marks = useMemo(() => { const m = {}; for (const it of dated) m[it.day] = (m[it.day] || 0) + 1; return m; }, [dated]);
  // How far the arrows may travel: only over months we hold something for — paging into four empty years
  // is a control that answers nothing. The fuzzy ones count, since they are what the block below shows.
  const months = useMemo(() => {
    const s = new Set([here]);
    for (const it of dated) s.add(it.day.slice(0, 7));
    for (const it of items) if (it.fuzzy) { const k = monthKey(Date.parse(it.net)); if (k) s.add(k); }
    return [...s].sort();
  }, [items, dated, here]);

  const goMonth = (next) => { setYm(next); setDay(null); };   // a day from the old month means nothing in the new one
  const inMonth = day && day.slice(0, 7) === ym;
  const shown = inMonth ? dated.filter((it) => it.day === day) : dated.filter((it) => it.day.startsWith(ym));
  const fuzzy = items.filter((it) => it.fuzzy && monthKey(Date.parse(it.net)) === ym);
  const heading = inMonth
    ? new Date(`${day}T12:00:00`).toLocaleDateString(loc === "uk" ? "uk-UA" : "en-US", { day: "numeric", month: "long" })
    : T(t, "calMonth");

  return html`<div class="flex flex-col gap-[var(--ms-gap)]" data-agenda=${ym} data-day=${inMonth ? day : ""}>
    <${Panel}>
      <${Calendar} month=${ym} onMonth=${goMonth} marks=${marks} value=${inMonth ? day : null} pick="marked"
        min=${months[0]} max=${months[months.length - 1]} locale=${loc}
        onPick=${(k) => setDay(k === day ? null : k)} />
    <//>
    ${shown.length
      ? html`<${Panel} title=${heading} data-agenda-list=${shown.length}>
          <div class="divide-y divide-base-300/40">${shown.map((it) => html`<${Launch} it=${it} t=${t} loc=${loc} S=${S} key=${it.id} />`)}</div>
        <//>`
      : data.loading ? null : Nothing(t, data.error ? "statusError" : items.length ? "calNone" : "mapEmpty")}
    ${/* The block that exists because the data is honest: a launch the source places "in October" is in
          October, not on the 31st, so it is listed under the month instead of marked on a day. */""}
    ${fuzzy.length
      ? html`<${Panel} title=${T(t, "calFuzzy")} data-agenda-fuzzy=${fuzzy.length}>
          <div class="divide-y divide-base-300/40">${fuzzy.map((it) => html`<${Launch} it=${it} t=${t} loc=${loc} S=${S} key=${it.id} />`)}</div>
        <//>`
      : null}
  </div>`;
}

// ── the drill-down's body — the clock and the place ───────────────────────────────────────────────────
// `detail.view`: the runtime still owns the overlay, the app bar, the favourite star and Back; this is the
// body between the hero and the fact rows. It is here rather than in `rows` because both halves are live —
// the clock ticks and the Earth turns — and neither can be declared.
export function launch({ item, t }) {
  const [, tick] = useState(0);
  const exact = !item.precision || item.precision === "day";
  const ms = Date.parse(item.net) - Date.now();
  // One interval, and only where there is something to count: a month-precision launch has no second hand
  // to move, and a clock ticking towards a date nobody promised is the lie this app was built to stop.
  useEffect(() => {
    if (!exact || ms <= 0) return;
    const id = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [exact, item.id, ms <= 0]);

  const pad2 = (n) => String(Math.floor(n)).padStart(2, "0");
  const s = Math.max(0, Math.floor(ms / 1000));
  const clock = `${Math.floor(s / 86400) ? Math.floor(s / 86400) + ":" : ""}${pad2((s % 86400) / 3600)}:${pad2((s % 3600) / 60)}:${pad2(s % 60)}`;
  const fix = item.lat != null && item.lon != null;

  return html`<div class="flex flex-col gap-[var(--ms-gap)]" data-launch-body=${item.id}>
    ${exact ? html`<div data-countdown class="flex flex-col items-center gap-0.5 py-1">
      <span class=${LABEL}>${T(t, "tMinus")}</span>
      <span class="font-mono font-semibold tabular-nums tracking-tight leading-none" style="font-size:calc(var(--ms-hero) * 0.5)">
        ${ms > 0 ? clock : T(t, "whenPast")}</span>
    </div>` : null}
    ${fix ? html`<${Globe} marker=${{ lat: item.lat, lon: item.lon }} focus=${{ lat: item.lat, lon: item.lon }} spin=${false} height=${240} />` : null}
    ${fix ? html`<div class="text-center"><span data-coords class=${LABEL}>${coords(item.lat, item.lon)}</span></div>` : null}
  </div>`;
}
