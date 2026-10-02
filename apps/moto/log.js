import { html } from "htm/preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Panel } from "/_rt/ui.js";
import { Calendar, dayKey, monthKey } from "/_rt/calendar.js";
import { curvePath } from "/_rt/weather.js";
import { KMH, TIERS, avgMs, leanTier, records, streak } from "/_rt/ride.js";
import { $days, loadDays } from "./engine.js";

const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70 truncate";
const pad2 = (n) => String(n).padStart(2, "0");
const hhmm = (ms) => `${Math.floor(ms / 3600000)}:${pad2(Math.floor(ms % 3600000 / 60000))}`;
const km = (m) => (m / 1000).toFixed(1);
const kmh = (ms) => String(Math.round(ms * KMH));

const Stat = (label, value, unit, extra) => html`<div class="rounded-[var(--ms-r-in)] sf-inset px-3 py-2 min-w-0">
  <div class=${LABEL}>${label}</div>
  <div class="font-mono text-[length:var(--ms-title)] font-semibold leading-tight truncate tabular-nums">${value}${unit ? html`<span class="text-[length:var(--ms-label)] font-normal text-base-content/70 ml-1">${unit}</span>` : null}</div>
  ${extra || null}
</div>`;

const Tiers = (lean) => html`<div class="flex gap-1 mt-1.5" data-tier=${leanTier(lean)}>
  ${TIERS.map((_, i) => html`<span key=${i} class=${`h-1 flex-1 rounded-full ${i < leanTier(lean) ? "" : "bg-base-content/15"}`} style=${i < leanTier(lean) ? "background:var(--app-accent)" : null}></span>`)}
</div>`;

function Curve({ series }) {
  const { line, area } = curvePath(series, 300, 90, 6);
  if (!line) return null;
  return html`<svg data-curve viewBox="0 0 300 90" preserveAspectRatio="none" class="w-full h-24 block text-base-content" aria-hidden="true">
    <path d=${area} fill="currentColor" style="color:var(--app-accent)" opacity="0.2" />
    <path d=${line} fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
  </svg>`;
}

export function motoLog({ S }) {
  const t = useStore(S.t), loc = useStore(S.locale), days = useStore($days);
  const [picked, setPicked] = useState(null), [month, setMonth] = useState(null);
  useEffect(() => { loadDays(); }, []);

  const keys = useMemo(() => [...days.keys()].filter((k) => days.get(k)?.dist > 0).sort(), [days]);
  const today = dayKey(new Date());
  if (!keys.length) return html`<div data-empty class="text-center text-muted py-12">${T(t, "noRides")}</div>`;

  const sel = picked && days.has(picked) ? picked : keys.includes(today) ? today : keys[keys.length - 1];
  const day = days.get(sel), rec = records(keys.map((k) => days.get(k)));
  const marks = Object.fromEntries(keys.map((k) => [k, 1]));
  const kmhU = T(t, "unitKmh");

  return html`<div class="flex flex-col gap-[var(--ms-gap)]" data-log=${keys.length}>
    <${Panel} title=${T(t, "records")} data-records>
      <div class="grid grid-cols-2 gap-[var(--ms-gap)]">
        ${Stat(T(t, "recTop"), kmh(rec.top), kmhU)}
        ${Stat(T(t, "recLean"), `${Math.round(rec.lean)}°`, null, Tiers(rec.lean))}
        ${Stat(T(t, "recSprint"), rec.best == null ? "—" : rec.best.toFixed(1), rec.best == null ? null : T(t, "unitS"))}
        ${Stat(T(t, "recStreak"), String(streak(keys, today)))}
      </div>
    <//>
    <${Panel}>
      <${Calendar} month=${month || sel.slice(0, 7)} onMonth=${setMonth} marks=${marks} value=${sel} pick="marked"
        min=${keys[0].slice(0, 7)} max=${monthKey(new Date())} locale=${loc}
        onPick=${(k) => { setPicked(k); setMonth(k.slice(0, 7)); }} />
    <//>
    <${Panel} data-day=${sel} data-live
      title=${new Date(`${sel}T12:00:00`).toLocaleDateString(loc === "uk" ? "uk-UA" : "en-US", { day: "numeric", month: "long" })}>
      <${Curve} series=${day.series} />
      <div class="grid grid-cols-2 gap-[var(--ms-gap)]">
        ${Stat(T(t, "dDist"), km(day.dist), T(t, "unitKm"))}
        ${Stat(T(t, "dTime"), hhmm(day.moveMs))}
        ${Stat(T(t, "dAvg"), kmh(avgMs(day)), kmhU)}
        ${Stat(T(t, "dMax"), kmh(day.max), kmhU)}
        ${Stat(T(t, "dLean"), `${Math.round(day.maxL || 0)}° / ${Math.round(day.maxR || 0)}°`)}
        ${Stat(T(t, "dCorners"), String(day.corners || 0))}
      </div>
    <//>
  </div>`;
}
