import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Scramble, Pixels, useReveal } from "/_rt/skeleton.js";
import { eaqiBand, pollutantBand, pollenBand } from "/_rt/air.js";
import { geo } from "/_rt/sensors.js";
import { isGate, MOCK, gate } from "/_rt/gate.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const KYIV = { lat: 50.45, lng: 30.52, place: null, located: false };
const urlFor = (lat, lng) =>
  `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}` +
  "&current=european_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,ragweed_pollen,olive_pollen" +
  "&hourly=european_aqi&timezone=auto&forecast_days=2";

const AQ = ["#41C06F", "#9BCB3C", "#E4C13A", "#E7742E", "#EC5A4A", "#C94BBA"];
const clamp = (b, n) => Math.max(0, Math.min(n, b));
const fillFor = (b) => AQ[clamp(b, 5)];
const AQI_KEYS = ["aqiGood", "aqiFair", "aqiModerate", "aqiPoor", "aqiVeryPoor", "aqiExtreme"];
const POLLEN_DOT = [null, fillFor(0), fillFor(2), fillFor(3), fillFor(4)];
const dot = (fill) => html`<span class="w-2 h-2 rounded-full shrink-0" aria-hidden="true" style=${`background:${fill}`}></span>`;
const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70";
const POLLEN_KEYS = ["pnNone", "pnLow", "pnModerate", "pnHigh", "pnVeryHigh"];

const POLLUTANTS = [
  { sp: "pm2_5", f: "pm2_5", label: "PM2.5" },
  { sp: "pm10", f: "pm10", label: "PM10" },
  { sp: "o3", f: "ozone", label: "O₃" },
  { sp: "no2", f: "nitrogen_dioxide", label: "NO₂" },
  { sp: "so2", f: "sulphur_dioxide", label: "SO₂" },
];
const POLLENS = [
  { f: "grass_pollen", sp: "grass", key: "pGrass" },
  { f: "birch_pollen", sp: "birch", key: "pBirch" },
  { f: "mugwort_pollen", sp: "mugwort", key: "pMugwort" },
  { f: "ragweed_pollen", sp: "ragweed", key: "pRagweed" },
  { f: "alder_pollen", sp: "alder", key: "pAlder" },
  { f: "olive_pollen", sp: "olive", key: "pOlive" },
];

const hhmm = (iso) => String(iso).slice(11, 16);

function makeSample() {
  const base = "2026-07-17T";
  const wave = [72, 68, 61, 55, 58, 66, 79, 88, 92, 86, 78, 70];
  const hours = Array.from({ length: 24 }, (_, i) => ({
    time: `${base}${String(i).padStart(2, "0")}:00`,
    aqi: wave[Math.floor(i / 2)] ?? 70,
  }));
  return {
    current: {
      time: `${base}14:00`,
      european_aqi: 88, pm2_5: 42, pm10: 68, ozone: 260, nitrogen_dioxide: 55, sulphur_dioxide: 12,
      grass_pollen: 85, birch_pollen: 0, mugwort_pollen: 18, ragweed_pollen: 6, alder_pollen: 0, olive_pollen: 0,
    },
    hours,
  };
}

const gauge = (aqi, band) => {
  const R = 42, C = 2 * Math.PI * R, ARC = 0.75, frac = Math.min(1, aqi / 100);
  return html`<svg viewBox="0 0 100 100" class="w-36 h-36" aria-hidden="true">
    <circle cx="50" cy="50" r=${R} fill="none" style="stroke:var(--sf-track-face)" stroke-width="7" stroke-linecap="round" stroke-dasharray=${`${(ARC * C).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(135 50 50)"></circle>
    <circle cx="50" cy="50" r=${R} fill="none" stroke=${fillFor(band)} stroke-width="7" stroke-linecap="round" stroke-dasharray=${`${(frac * ARC * C).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(135 50 50)"></circle>
  </svg>`;
};

export function air({ S }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  const [loc, setLoc] = useState(KYIV);
  const [data, setData] = useState(isGate || MOCK ? makeSample() : null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (isGate || MOCK || !geo.supported) return;
    let stop = () => {};
    stop = geo.watch(
      (fix) => {
        stop();
        setLoc((l) => ({ ...l, lat: fix.lat, lng: fix.lng, located: true }));
        fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${fix.lat}&longitude=${fix.lng}&localityLanguage=${locale}`)
          .then((r) => r.json())
          .then((g) => { const name = g.city || g.locality || g.principalSubdivision; if (name) setLoc((l) => ({ ...l, place: name })); })
          .catch(() => {});
      },
      () => {},
    );
    return () => stop();
  }, []);

  useEffect(() => {
    if (isGate || MOCK) return;
    let live = true;
    const load = async () => {
      try {
        const r = await fetch(urlFor(loc.lat, loc.lng));
        if (!r.ok) throw 0;
        const d = await r.json();
        const start = Math.max(0, (d.hourly?.time || []).findIndex((x) => x >= d.current.time));
        const hours = (d.hourly?.time || []).slice(start, start + 24).map((time, i) => ({
          time, aqi: d.hourly.european_aqi[start + i],
        }));
        if (live) { setData({ current: d.current, hours }); setErr(false); }
      } catch { if (live) setErr(true); }
    };
    load();
    const id = setInterval(load, 300000);
    return () => { live = false; clearInterval(id); };
  }, [loc.lat, loc.lng]);

  const ready = useReveal(!!data);
  if (err && !data) return html`<div data-air data-ready="0" data-empty class="flex flex-col items-center text-muted py-16 gap-2 text-center px-6"><span data-mascot aria-hidden="true"></span>${Icon("lucide:cloud-off", "text-4xl")}<span class="font-medium">${T(t, "statusError")}</span></div>`;
  if (!ready) return html`<div data-air data-ready="0" class="flex flex-col gap-[calc(var(--ms-gap)*1.5)] items-center">
    <div class="w-36 h-36 rounded-full border-[6px] flex items-center justify-center" style="border-color:var(--sf-track-face)"><span class="text-5xl font-bold tabular-nums text-muted"><${Scramble} len=${2} /></span></div>
    <div class="text-lg font-bold text-muted"><${Scramble} len=${8} /></div>
    <div class="w-full max-w-[420px] h-28 rounded-[var(--ms-r)] overflow-hidden sf-inset"><${Pixels} /></div>
    <div class="w-full max-w-[420px] flex flex-col gap-2">${[0, 1, 2].map((i) => html`<div class="flex items-center justify-between text-muted border-b border-base-300/50 pb-2" key=${i}><${Scramble} len=${7} /><${Scramble} len=${5} /></div>`)}</div>
  </div>`;

  const c = data.current;
  const aqi = Math.round(c.european_aqi ?? 0), band = eaqiBand(c.european_aqi);

  const hrs = data.hours || [];
  const H = 84, cap = Math.max(100, ...hrs.map((h) => h.aqi || 0)), yOf = (v) => H - (Math.min(cap, v) / cap) * (H - 4), bw = hrs.length ? 100 / hrs.length : 100;
  const ticks = hrs.map((h, i) => ({ i, label: hhmm(h.time) })).filter((_, i) => i % 6 === 0);

  const active = POLLENS.map((p) => ({ ...p, v: c[p.f] })).filter((p) => p.v != null && p.v > 0).sort((a, b2) => b2.v - a.v);

  return html`<div data-air data-ready="1" data-band=${band} class="flex flex-col gap-[calc(var(--ms-gap)*1.5)] items-center">
    <!-- current AQI gauge: the number is ink; the band is the arc's hue -->
    <div class="relative w-36 h-36 flex items-center justify-center">
      ${gauge(aqi, band)}
      <div class="absolute flex flex-col items-center">
        <div data-aqi class="text-5xl font-bold tabular-nums leading-none">${aqi}</div>
        <div class=${`${LABEL} mt-1`}>AQI</div>
      </div>
    </div>
    <div class="flex flex-col items-center gap-0.5 -mt-2 text-center px-[var(--ms-pad)]">
      <div class="text-lg font-bold inline-flex items-center gap-2">${dot(fillFor(band))}${T(t, AQI_KEYS[clamp(band, 5)])}</div>
      <div class="text-sm text-muted inline-flex items-center gap-1" data-live>${Icon("lucide:map-pin", "text-[0.85em]")}${loc.place || T(t, loc.located ? "myLocation" : "place")} · ${T(t, "updated")} ${hhmm(c.time)}</div>
    </div>

    <!-- 24-hour forecast -->
    <div class="w-full max-w-[420px] flex flex-col gap-1">
      <div class=${`${LABEL} px-1`}>${T(t, "forecastLabel")}</div>
      <svg viewBox=${`0 0 100 ${H}`} class="w-full" style="height:96px" preserveAspectRatio="none">
        ${hrs.map((h, i) => html`<rect x=${(i * bw + bw * 0.12).toFixed(2)} y=${yOf(h.aqi).toFixed(2)} width=${(bw * 0.76).toFixed(2)} height=${Math.max(0.6, H - yOf(h.aqi)).toFixed(2)} rx="0.5" fill=${fillFor(eaqiBand(h.aqi))} key=${i}></rect>`)}
      </svg>
      <div class="relative h-4 font-mono text-[length:var(--ms-label)] text-muted">
        ${ticks.map((d) => html`<span class="absolute -translate-x-1/2 whitespace-nowrap" style=${`left:${Math.min(94, Math.max(4, (d.i + 0.5) * bw)).toFixed(1)}%`} key=${d.i}>${d.label}</span>`)}
      </div>
    </div>

    <!-- pollutants: each value carries its own EEA sub-index band as the dot beside it -->
    <div class="w-full max-w-[420px] flex flex-col gap-1">
      <div class=${`${LABEL} px-1 mb-0.5`}>${T(t, "pollutantsLabel")}</div>
      ${POLLUTANTS.map((p) => {
        const v = c[p.f], pb = pollutantBand(p.sp, v);
        return html`<div class="flex items-center justify-between gap-2 py-1.5 border-b border-base-300/50 last:border-0" key=${p.sp}>
          <span class="font-mono text-sm font-semibold shrink-0">${p.label}</span>
          <span class="flex items-baseline gap-1.5 min-w-0">
            ${pb >= 0 ? dot(fillFor(pb)) : html`<span class="w-2 h-2 rounded-full sf-inset shrink-0" aria-hidden="true"></span>`}
            <span class="tabular-nums font-bold text-lg">${v != null ? Math.round(v) : "—"}</span>
            <span class="font-mono text-[length:var(--ms-label)] text-muted @max-[240px]:hidden">µg/m³</span>
          </span>
        </div>`;
      })}
    </div>

    <!-- pollen: active species, banded -->
    <div class="w-full max-w-[420px] flex flex-col gap-1">
      <div class=${`${LABEL} px-1 mb-0.5`}>${T(t, "pollenLabel")}</div>
      ${active.length ? active.map((p) => {
        const pb = pollenBand(p.sp, p.v);
        return html`<div class="flex items-center gap-2 py-1.5 border-b border-base-300/50 last:border-0" key=${p.sp}>
          ${POLLEN_DOT[pb] ? dot(POLLEN_DOT[pb]) : html`<span class="w-2 h-2 rounded-full sf-inset shrink-0" aria-hidden="true"></span>`}
          <span class="font-medium truncate flex-1 min-w-0">${T(t, p.key)}</span>
          <span class="text-sm font-semibold shrink-0">${T(t, POLLEN_KEYS[pb])}</span>
          <span class="tabular-nums font-mono text-[length:var(--ms-label)] text-muted text-right shrink-0 @max-[280px]:hidden">${Math.round(p.v)} ${T(t, "grains")}</span>
        </div>`;
      }) : html`<div class="flex items-center gap-2 py-1.5 text-muted"><span class="w-2 h-2 rounded-full sf-inset shrink-0"></span><span>${T(t, "pnNone")}</span></div>`}
    </div>
  </div>`;
}
