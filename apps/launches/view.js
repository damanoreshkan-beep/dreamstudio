import { html } from "htm/preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T, whenLabel } from "/_rt/i18n.js";
import { Globe } from "/_rt/globe.js";
import { Calendar, monthKey } from "/_rt/calendar.js";
import { Panel } from "/_rt/ui.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70";

const coords = (lat, lon) =>
  `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? "E" : "W"}`;

const Nothing = (t, key) => html`<div class="flex flex-col items-center text-muted py-10 gap-2 text-center px-6">
  ${Icon("lucide:radar", "text-3xl")}<span class="text-sm">${T(t, key)}</span></div>`;

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

export function pads({ S }) {
  const t = useStore(S.t), loc = useStore(S.locale), data = useStore(S.data);
  const items = data.items || [];
  const [sel, setSel] = useState(null);
  const [focus, setFocus] = useState(null);

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
  const pick = ({ point }) => { if (point) { setSel(point.key); setFocus({ lat: point.lat, lon: point.lon }); } };

  return html`<div class="flex flex-col gap-[var(--ms-gap)]" data-sites=${sites.length} data-site=${sel || ""}>
    <${Globe} points=${points} focus=${focus} onPick=${pick} spin=${!sel} height=${300} />
    ${sites.length
      ? html`<${Panel} title=${T(t, "sites")} data-pads=${sites.length}>
          <div class="divide-y divide-base-300/40">
            ${sites.map((s) => html`<div key=${s.key}>
              <button type="button" data-site-row=${s.key} aria-expanded=${s.key === sel}
                class="flex items-center gap-2.5 py-2 w-full text-left min-w-0" onClick=${() => choose(s)}>
                ${""}
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

export function agenda({ S }) {
  const t = useStore(S.t), loc = useStore(S.locale), data = useStore(S.data);
  const items = data.items || [];
  const here = monthKey(Date.now());
  const [ym, setYm] = useState(here);
  const [day, setDay] = useState(null);

  const dated = useMemo(() => items.filter((it) => it.day), [items]);
  const marks = useMemo(() => { const m = {}; for (const it of dated) m[it.day] = (m[it.day] || 0) + 1; return m; }, [dated]);
  const months = useMemo(() => {
    const s = new Set([here]);
    for (const it of dated) s.add(it.day.slice(0, 7));
    for (const it of items) if (it.fuzzy) { const k = monthKey(Date.parse(it.net)); if (k) s.add(k); }
    return [...s].sort();
  }, [items, dated, here]);

  const goMonth = (next) => { setYm(next); setDay(null); };
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
    ${""}
    ${fuzzy.length
      ? html`<${Panel} title=${T(t, "calFuzzy")} data-agenda-fuzzy=${fuzzy.length}>
          <div class="divide-y divide-base-300/40">${fuzzy.map((it) => html`<${Launch} it=${it} t=${t} loc=${loc} S=${S} key=${it.id} />`)}</div>
        <//>`
      : null}
  </div>`;
}

export function launch({ item, t }) {
  const [, tick] = useState(0);
  const exact = !item.precision || item.precision === "day";
  const ms = Date.parse(item.net) - Date.now();
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
