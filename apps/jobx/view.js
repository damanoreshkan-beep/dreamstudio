import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { Island, Segmented } from "/_rt/ui.js";
import { T } from "/_rt/i18n.js";
import { isGate } from "/_rt/gate.js";
import { empKey, cityName, inCity, $city, $jobs, $loading, $glReady, $sent, $err, loadJobs, shortSalary, streetOf } from "./jobs.js";
import { MapStage } from "./map.js";
import { Icon, JobRow, Screens } from "./pages.js";

try { if (typeof localStorage !== "undefined" && localStorage.getItem("jobx:theme") === "ink") localStorage.setItem("jobx:theme", "signal"); } catch { }

const $preview = atom(null);
export function mapView({ t, S, screen, openScreen, closeScreen }) {
  const jobs = useStore($jobs);
  const city = useStore($city);
  const theme = useStore(S.theme);
  const loc = useStore(S.locale);
  const glReady = useStore($glReady);
  const preview = useStore($preview);
  const [me, setMe] = useState(null);
  const [showMap] = useState(!isGate);
  const ctlRef = useRef(null);
  const isDark = !/light/i.test(String(theme || ""));
  useEffect(() => { loadJobs(); }, []);
  useEffect(() => { $preview.set(null); setMe(null); }, [city]);
  const cityJobs = jobs.filter((j) => inCity(j, city));
  const onPick = (c, cam) => {
    if (!c) { $preview.set(null); return; }
    $preview.set({ coordinates: c.coordinates, jobs: c.jobs });
    if (cam && c.count > 1 && cam.zoom < 15.5) cam.flyTo(c.coordinates[0], c.coordinates[1], Math.min(cam.zoom + 2.2, 16.5));
  };
  const locate = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((p) => {
      const pt = [p.coords.longitude, p.coords.latitude];
      setMe(pt);
      if (inCity({ lat: pt[1], lon: pt[0] }, city) && ctlRef.current) ctlRef.current.flyTo(pt[0], pt[1], 14.5);
    }, () => {}, { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 });
  };
  const openJob = (j) => { $preview.set(null); openScreen(`job:${j.id}`); };

  return html`<${Fragment}>
    <div data-stage class="fixed inset-0 z-0 overflow-hidden bg-base-200">
      ${showMap ? html`<${MapStage} isDark=${isDark} city=${city} jobs=${cityJobs} loc=${loc} me=${me} selected=${preview && preview.coordinates} ctlRef=${ctlRef} onPick=${onPick} />` : null}
      ${!showMap || !glReady
        ? html`<div class="absolute inset-0 grid place-items-center px-8 text-center text-muted pointer-events-none">
            <div>${Icon("lucide:map", "text-4xl opacity-40")}<p class="mt-3">${T(t, "mapHint")}</p></div>
          </div>` : null}

      <!-- city picker: a top pill (Island owns the header clearance) opening the big city page -->
      <${Island} pinned at="top" tone="glass" className="!p-0.5 rounded-full">
        <button data-city class="btn btn-ghost btn-sm gap-1.5 rounded-full px-3" onClick=${() => openScreen("city")}>
          ${Icon("lucide:map-pin", "text-[1.05em] text-primary")}<span class="font-semibold">${cityName(city, loc)}</span>${Icon("lucide:chevron-down", "text-[0.9em] opacity-60")}
        </button>
      <//>

      ${preview
        ? html`<${Island} pinned at="bottom" tone="glass" className="!p-2 rounded-[var(--ms-r)] w-full max-w-md ms-detail-in">
            <div data-preview class="flex flex-col gap-1">
              <div class="flex items-center justify-between gap-2 px-1">
                <div class="text-[0.78rem] text-muted font-medium">${preview.jobs.length > 1 ? `${preview.jobs.length} ${T(t, "jobsHere")}` : T(t, "job")}</div>
                <button data-preview-close class="btn btn-ghost btn-xs btn-circle" aria-label=${T(t, "close")} onClick=${() => $preview.set(null)}>${Icon("lucide:x", "text-base")}</button>
              </div>
              <div class="flex flex-col gap-1 max-h-[38vh] overflow-y-auto">
                ${preview.jobs.slice(0, 12).map((j) => { const pay = shortSalary(j.salary), street = streetOf(j.address); return html`<button key=${j.id} data-preview-job class="w-full text-left rounded-[var(--ms-r-in)] px-3 py-2 hover:bg-base-content/5 active:bg-base-content/10 transition" onClick=${() => openJob(j)}>
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 flex-1"><div class="font-semibold leading-tight line-clamp-2">${j.title}</div><div class="text-[0.85rem] text-muted truncate">${j.company}${street ? ` · ${street}` : ""}</div></div>
                    ${pay ? html`<div class="shrink-0 font-mono text-[0.8rem] font-semibold whitespace-nowrap tabular-nums pt-0.5">${pay}</div>` : null}
                  </div>
                </button>`; })}
              </div>
            </div>
          <//>`
        : html`<${Island} pinned at="bottom" tone="glass" className="!p-1 rounded-full">
            <div class="flex items-center gap-1">
              <button data-locate class="btn btn-ghost btn-circle" aria-label=${T(t, "locate")} title=${T(t, "locate")} onClick=${locate}>${Icon("lucide:locate-fixed", "text-[1.25em]")}</button>
              <button data-post class="btn btn-primary gap-2 rounded-full px-5" onClick=${() => { $sent.set(false); $err.set(null); openScreen("post"); }}>
                ${Icon("lucide:plus", "text-[1.15em]")}<span class="font-medium">${T(t, "postCta")}</span>
              </button>
            </div>
          <//>`}
    </div>
    <${Screens} t=${t} loc=${loc} screen=${screen} close=${closeScreen} />
  <//>`;
}

const PAGE = 40;
const EMP_FILTERS = ["all", "remote", "full", "part"];
export function listView({ t, S, screen, openScreen, closeScreen }) {
  const jobs = useStore($jobs);
  const city = useStore($city);
  const loading = useStore($loading);
  const loc = useStore(S.locale);
  const [q, setQ] = useState("");
  const [emp, setEmp] = useState("all");
  const [shown, setShown] = useState(PAGE);
  const [sentinel, setSentinel] = useState(null);
  const inputRef = useRef(null), scrollRef = useRef(null);
  const searching = screen === "search";
  useEffect(() => { loadJobs(); }, []);
  useEffect(() => { if (!searching && !String(screen || "").startsWith("job:")) setQ(""); }, [screen]);
  useEffect(() => { if (searching && inputRef.current) inputRef.current.focus(); }, [searching]);
  const cityJobs = jobs.filter((j) => inCity(j, city));
  const ql = q.trim().toLowerCase();
  const list = cityJobs
    .filter((j) => emp === "all" || j.employment === emp)
    .filter((j) => !ql || `${j.title} ${j.company} ${j.address || ""}`.toLowerCase().includes(ql))
    .sort((a, b) => (Number(b.ms) || 0) - (Number(a.ms) || 0));
  useEffect(() => { setShown(PAGE); }, [city, emp, ql]);
  useEffect(() => {
    if (!sentinel || shown >= list.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setShown((n) => Math.min(n + PAGE, list.length)); }, { rootMargin: "600px" });
    io.observe(sentinel);
    return () => io.disconnect();
  }, [sentinel, shown, list.length]);
  const empItems = EMP_FILTERS.map((id) => ({ id, label: T(t, id === "all" ? "empAll" : empKey[id]) }));

  return html`<div class="h-full min-h-0 flex flex-col">
    <div class="px-[var(--ms-pad)] pt-2 pb-1 flex items-center gap-2">
      <button data-city class="btn btn-ghost btn-sm gap-1.5 rounded-full shrink-0 px-3" onClick=${() => openScreen("city")}>
        ${Icon("lucide:map-pin", "text-[1.05em] text-primary")}<span class="font-semibold">${cityName(city, loc)}</span>${Icon("lucide:chevron-down", "text-[0.85em] opacity-60")}
      </button>
      ${searching
        ? html`<textarea rows="1" data-line ref=${inputRef} data-search enterkeyhint="search" value=${q} placeholder=${T(t, "searchPh")} onInput=${(e) => setQ(e.currentTarget.value)} class="input input-bordered input-sm rounded-full flex-1 min-w-0 bg-base-100"></textarea>
          <button data-search-close class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label=${T(t, "close")} onClick=${closeScreen}>${Icon("lucide:x", "text-xl")}</button>`
        : html`<span class="flex-1"></span>
          <button data-search-btn class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label=${T(t, "search")} onClick=${() => openScreen("search")}>${Icon("lucide:search", "text-xl")}</button>`}
    </div>
    <div class="px-[var(--ms-pad)] pb-1">
      <${Segmented} items=${empItems} value=${emp} onChange=${setEmp} scroll size="sm" attr="data-emp-filter" label=${T(t, "fldEmployment")} />
    </div>
    <div ref=${scrollRef} data-list class="flex-1 min-h-0 overflow-y-auto px-[var(--ms-pad)] pb-[calc(var(--dock-h)+env(safe-area-inset-bottom)+1rem)]">
      ${loading && !cityJobs.length
        ? html`<div class="py-10 text-center text-muted">${T(t, "loadingJobs")}</div>`
        : list.length
          ? html`<div class="flex flex-col gap-[var(--ms-gap)] pt-1">
              ${list.slice(0, shown).map((j) => html`<${JobRow} t=${t} j=${j} loc=${loc} key=${j.id} onOpen=${() => openScreen(`job:${j.id}`)} />`)}
              ${shown < list.length ? html`<div ref=${setSentinel} data-more aria-hidden="true" class="h-px"></div>` : null}
            </div>`
          : html`<div class="py-10 text-center text-muted">${ql ? T(t, "noMatch") : T(t, "emptyJobs")}</div>`}
    </div>
    <${Screens} t=${t} loc=${loc} screen=${screen} close=${closeScreen} />
  </div>`;
}
