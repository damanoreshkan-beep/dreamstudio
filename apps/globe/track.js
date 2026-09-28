import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Scramble, useReveal } from "/_rt/skeleton.js";
import { Globe, countryAt, worldReady, ringAround } from "/_rt/globe.js";
import { watchList, place } from "/_rt/watch.js";
import { isGate, MOCK } from "/_rt/gate.js";
import { subpoint, makeSat, FALLBACK_TLE } from "/_rt/orbit.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const TLE_URL = "https://tle.ivanstanojevic.me/api/tle/25544";
const CACHE_KEY = "iss.tle.v1";
const ME_KEY = "iss.me.v1";
const GATE_ME = { lat: 50.45, lon: 30.52 };
const BACK_MIN = 25, AHEAD_MIN = 92, STEP_MS = 60e3;
const ISS_COLOR = "#F5B94D", ME_COLOR = "#4ADE80";

/** The sub-satellite points either side of `at`, as two GeoJSON LineStrings: [been, going]. */
function groundTrack(rec, at) {
  const arc = (from, to) => {
    const pts = [];
    for (let m = from; m <= to; m++) {
      const p = subpoint(rec, new Date(at.getTime() + m * STEP_MS));
      if (p) pts.push([p.lon, p.lat]);
    }
    return pts.length > 1 ? { type: "LineString", coordinates: pts } : null;
  };
  return [arc(-BACK_MIN, 0), arc(0, AHEAD_MIN)];
}
const GATE_DATE = new Date("2026-07-20T02:10:00Z");
const fmt = (n) => n == null ? "—" : Math.round(Number(n)).toLocaleString("en-US").replace(/,/g, " ");

function initialSat() {
  try { if (typeof localStorage !== "undefined") { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); if (c && c.line1 && c.line2) return makeSat(c.line1, c.line2); } } catch { }
  return makeSat(FALLBACK_TLE.line1, FALLBACK_TLE.line2);
}

export function iss({ S }) {
  const t = useStore(S.t);
  const recRef = useRef(null);
  const [pos, setPos] = useState(() => { recRef.current = initialSat(); return subpoint(recRef.current, isGate || MOCK ? GATE_DATE : new Date()); });
  const [, tick] = useState(0);
  const [me, setMe] = useState(() => {
    if (isGate || MOCK) return GATE_ME;
    try { const v = JSON.parse(localStorage.getItem(ME_KEY) || "null"); return v && v.lat != null ? v : null; } catch { return null; }
  });
  const [rings, setRings] = useState([]);
  const [track, setTrack] = useState(null);
  const [meErr, setMeErr] = useState(false);

  useEffect(() => {
    let live = true;
    watchList("iss").then((j) => {
      if (!live) return;
      setRings((j.rules || []).filter((r) => r.source === "iss" && r.value > 0).map((r) => r.value));
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const redraw = () => { const r = recRef.current; if (r) setTrack(groundTrack(r, isGate || MOCK ? GATE_DATE : new Date())); };
    redraw();
    if (isGate || MOCK) return;
    const id = setInterval(redraw, 30e3);
    return () => clearInterval(id);
  }, []);

  const findMe = async () => {
    setMeErr(false);
    const p = await place();
    if (!p) { setMeErr(true); return; }
    setMe(p);
    try { localStorage.setItem(ME_KEY, JSON.stringify(p)); } catch { }
  };

  useEffect(() => {
    if (isGate || MOCK) return;
    const id = setInterval(() => { const r = recRef.current; if (r) { const p = subpoint(r, new Date()); if (p) setPos(p); } }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (isGate || MOCK) return;
    let live = true;
    const load = async () => {
      try {
        const r = await fetch(TLE_URL); if (!r.ok) throw 0; const j = await r.json();
        if (!live || !j.line1 || !j.line2) return;
        recRef.current = makeSat(j.line1, j.line2);
        try { if (typeof localStorage !== "undefined") localStorage.setItem(CACHE_KEY, JSON.stringify({ line1: j.line1, line2: j.line2, name: j.name, date: j.date })); } catch { }
        const p = subpoint(recRef.current, new Date()); if (p) setPos(p);
      } catch { }
    };
    load();
    const id = setInterval(load, 3 * 3600 * 1000);
    return () => { live = false; clearInterval(id); };
  }, []);

  useEffect(() => { const id = setInterval(() => { tick((x) => x + 1); if (worldReady()) clearInterval(id); }, 1000); return () => clearInterval(id); }, []);

  const ready = useReveal(!!pos);
  if (!ready) return html`<div class="flex flex-col gap-4 items-center">
    <${Globe} points=${[]} spin=${true} height=${320} />
    <div class="flex items-center gap-2 text-sm text-muted">${Icon("lucide:satellite", "text-base")}<span class="font-semibold"><${Scramble} len=${12} /></span></div>
    <div class="grid grid-cols-2 gap-2 w-full">${[0, 1, 2, 3].map((i) => html`<div class="card bg-base-100 rounded-2xl overflow-hidden sf-e2" key=${i}><div class="card-body p-3 gap-0.5 text-muted"><div class="text-[0.62rem] truncate"><${Scramble} len=${8} /></div><div class="text-xl font-bold truncate"><${Scramble} len=${6} /></div></div></div>`)}</div>
  </div>`;

  const { lat, lon, altKm, velocityKmh, sunlit } = pos;
  const country = countryAt(lat, lon);
  const over = country?.name || T(t, "overOcean");
  const visKey = sunlit ? "visDay" : "visEclipse";

  const stat = (icon, label, value, unit) => html`<div class="card bg-base-100 rounded-2xl sf-e2"><div class="card-body p-3 gap-0.5">
    <div class="text-[0.62rem] font-mono uppercase text-muted flex items-center gap-1">${Icon(icon)}${T(t, label)}</div>
    <div class="text-xl font-bold tabular-nums truncate">${value}<span class="text-sm font-medium text-muted ml-1">${T(t, unit)}</span></div>
  </div></div>`;

  return html`<div class="flex flex-col gap-4 items-center">
    <${Globe}
      points=${[
        { lat, lon, r: 16, color: "rgba(245,185,77,.16)" }, { lat, lon, r: 5, color: ISS_COLOR },
        ...(me ? [{ lat: me.lat, lon: me.lon, r: 4, color: ME_COLOR, pulse: true }] : []),
      ]}
      paths=${[
        ...(track?.[0] ? [{ geo: track[0], color: ISS_COLOR, width: 1.4, alpha: 0.55 }] : []),
        ...(track?.[1] ? [{ geo: track[1], color: ISS_COLOR, width: 1.4, dash: [4, 5] }] : []),
        ...(me ? rings.map((km) => ({ geo: ringAround(me.lat, me.lon, km), color: ME_COLOR, width: 1, alpha: 0.7, dash: [2, 4] })) : []),
      ]}
      focus=${{ lat, lon }} spin=${false} height=${320} />

    ${me
      ? html`<div data-me class="flex items-center gap-2 text-xs text-muted"><span class="inline-block size-2 rounded-full" style=${`background:${ME_COLOR}`}></span>${T(t, "meHere")} · ${T(t, "trackAhead")}</div>`
      : html`<button type="button" data-me-ask class="btn btn-sm btn-ghost rounded-full gap-1.5" onClick=${findMe}>${Icon("lucide:locate-fixed", "text-base")}${T(t, meErr ? "meDenied" : "meShow")}</button>`}

    <div data-over class="flex items-center gap-2 text-sm">
      <span class="relative flex h-2.5 w-2.5"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-70"></span><span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-success"></span></span>
      <span class="text-base-content/70">${T(t, "over")}</span><span class="font-semibold">${over}</span>
    </div>

    <div class="@container w-full max-w-[420px]"><div class="grid grid-cols-2 @max-[260px]:grid-cols-1 gap-2">
      ${stat("lucide:arrow-up-from-line", "altitude", fmt(altKm), "km")}
      ${stat("lucide:gauge", "velocity", fmt(velocityKmh), "kmh")}
    </div></div>

    ${""}
    <div class="w-full max-w-[420px] rounded-2xl sf-raised px-4 flex flex-col divide-y divide-base-300/40">
      <div class="flex items-center justify-between py-2.5"><span class="text-base-content/70 flex items-center gap-2">${Icon("lucide:map-pin")}${T(t, "coords")}</span><span data-coords class="font-medium tabular-nums">${lat.toFixed(2)}°, ${lon.toFixed(2)}°</span></div>
      <div class="flex items-center justify-between py-2.5"><span class="text-base-content/70 flex items-center gap-2">${Icon("lucide:sun-moon")}${T(t, "visibility")}</span><span class="font-medium">${T(t, visKey)}</span></div>
    </div>
  </div>`;
}
