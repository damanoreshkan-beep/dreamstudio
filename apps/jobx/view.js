// jobx — jobs on a 3D map of Kyiv. The farm's own board: a signed-in user posts a vacancy at a point in Kyiv,
// the owner approves it from Telegram, it stands as a glowing column on a dark, tilted, THEME-AWARE 3D city.
//
// Two render layers, by the farm's law (globe.js/glstage.js): the WebGL map is a PROBE-guarded enhancement, and
// everything meaningful also lives in the DOM — the only thing the headless gate, axe and e2e can see.
//   · DOM job panel  — the source of truth: a list of vacancies, always rendered, populated under the gate.
//   · deck.gl 3D map — initialised only when a WebGL2 context answers and we are not under the gate; the Kyiv
//     geometry (buildings/water/roads/metro/districts) is LARGE static GeoJSON lazy-fetched from /kyiv/ (nginx,
//     gzip, 30-day cache) — never bundled. When GL is absent (gate, or offline first-load) the panel fills in.
import { html } from "htm/preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom, map as nmap } from "nanostores";
import { T } from "/_rt/i18n.js";
import { Sheet, Island } from "/_rt/ui.js";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { session } from "/_rt/auth.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const EMPLOYMENT = ["full", "part", "remote", "contract", "internship"];
const empKey = { full: "empFull", part: "empPart", remote: "empRemote", contract: "empContract", internship: "empInternship" };

const GEO = "https://dreamstudio.mooo.com/kyiv";     // nginx static, gzip, lazy — never bundled
const DECK_URL = "https://esm.sh/deck.gl@9.4.0";      // dynamic-imported ONLY behind a WebGL2 probe
const KYIV = { lat: 50.4501, lon: 30.5234 };
const VIEW = { longitude: KYIV.lon, latitude: KYIV.lat, zoom: 11.0, pitch: 55, bearing: -15, minZoom: 10, maxZoom: 18 };

// ── state ────────────────────────────────────────────────────────────────────────────────────────────────
const MOCK_JOBS = [
  { id: "1", title: "Frontend-розробник", company: "Dreamware", lat: 50.4460, lon: 30.5230, address: "Печерськ", salary: "60 000–90 000 ₴", employment: "remote", description: "Preact, невеликі PWA, чистий код. Гнучкий графік, дружня команда.", contact: "@dreamware_jobs", poster: "Octocat", ms: Date.now() },
  { id: "2", title: "Бариста", company: "Кава Гармонія", lat: 50.4530, lon: 30.5100, address: "Шевченківський", salary: "22 000 ₴", employment: "part", description: "Ранкові зміни, навчаємо з нуля, чай і кава безкоштовно.", contact: "hr@harmony.ua", poster: "Ірина", ms: Date.now() },
  { id: "3", title: "Менеджер із продажу", company: "Кратос", lat: 50.4405, lon: 30.5480, address: "Липки", salary: "37 500–90 000 ₴", employment: "full", description: "Повна зайнятість, вища освіта, CRM. Провідний постачальник комплектуючих.", contact: "https://t.me/kratos_hr", poster: "Кратос", ms: Date.now() },
  { id: "4", title: "Кухар", company: "KFC", lat: 50.4620, lon: 30.5180, address: "Поділ", salary: "27 000 ₴", employment: "full", description: "Готові взяти студента, людину з інвалідністю, пенсіонера. Навчання коштом компанії.", contact: "@kfc_jobs", poster: "KFC", ms: Date.now() },
  { id: "5", title: "Інженер-електронік", company: "Sempal", lat: 50.4300, lon: 30.5600, address: "Печерськ", salary: "60 000–100 000 ₴", employment: "full", description: "Досвід від 2 років, C++, Assembler. Провідний український виробник.", contact: "hr@sempal.com", poster: "Sempal", ms: Date.now() },
];

const $jobs = atom(gate ? MOCK_JOBS : []);
const $loading = atom(!gate);
const $glReady = atom(false);       // the deck.gl map is live
const $city = atom(null);           // an open cluster's jobs (Sheet), or null
const $listOpen = atom(false);      // the full-list Sheet
const $query = atom("");
const $post = atom(false);
const $sent = atom(false);
const $posting = atom(false);
const $err = atom(null);
const $pick = atom(null);           // a picked {lat,lon} for a new posting
const $form = nmap({ title: "", company: "", salary: "", employment: "full", description: "", contact: "" });

async function loadJobs() {
  if (gate) { $jobs.set(MOCK_JOBS); $loading.set(false); return; }
  try {
    const r = await fetch(`${VPS_PROXY}/jobs/list`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const j = await r.json();
    $jobs.set(Array.isArray(j && j.jobs) ? j.jobs : []);
  } catch { /* keep whatever we have */ } finally { $loading.set(false); }
}

// ── colours ──────────────────────────────────────────────────────────────────────────────────────────────
// Vacancy density → the reference legend (1+ cyan … 20+ red). A MARK colour, so it may be any hue.
function vacancyColor(n) {
  if (n <= 1) return [0, 229, 255];
  if (n <= 3) return [52, 211, 153];
  if (n <= 5) return [163, 230, 53];
  if (n <= 7) return [250, 204, 21];
  if (n <= 10) return [251, 146, 60];
  return [244, 63, 94];
}
const LEGEND = [[1, "1+"], [3, "3+"], [5, "5+"], [7, "7+"], [10, "10+"], [20, "20+"]];

// Cluster jobs onto a ~110 m grid (lat/lon to 3 dp), like the reference.
function clusterJobs(jobs) {
  const grid = new Map();
  for (const j of jobs) {
    if (!Number.isFinite(j.lat) || !Number.isFinite(j.lon)) continue;
    const key = `${j.lat.toFixed(3)}_${j.lon.toFixed(3)}`;
    (grid.get(key) || grid.set(key, []).get(key)).push(j);
  }
  return [...grid.values()].map((group) => {
    const lat = group.reduce((s, j) => s + j.lat, 0) / group.length;
    const lon = group.reduce((s, j) => s + j.lon, 0) / group.length;
    return { coordinates: [lon, lat], count: group.length, jobs: group };
  });
}

// Building zone tint, indexed off a coarse geographic grid — dark and light palettes (theme-aware).
const ZONE_DARK = [[20, 25, 60], [35, 18, 50], [15, 30, 55], [30, 15, 45], [12, 35, 55], [40, 20, 45], [15, 38, 48], [38, 12, 48], [18, 22, 62], [15, 40, 40], [42, 18, 38], [18, 32, 52]];
const ZONE_LIGHT = [[150, 156, 178], [166, 150, 172], [144, 160, 180], [162, 148, 168], [142, 163, 176], [170, 152, 164], [146, 165, 168], [164, 146, 166], [148, 157, 182], [146, 166, 160], [172, 150, 158], [148, 161, 178]];
function preprocessBuildings(geo) {
  if (!geo || !geo.features) return geo;
  for (const f of geo.features) {
    const g = f.geometry, c = g && (g.type === "Polygon" ? g.coordinates[0] && g.coordinates[0][0] : g.coordinates && g.coordinates[0] && g.coordinates[0][0] && g.coordinates[0][0][0]);
    let idx = 0;
    if (c) idx = Math.abs((Math.floor((c[0] - 30.3) * 30) * 7 + Math.floor((c[1] - 50.3) * 30) * 13) % ZONE_DARK.length);
    const d = ZONE_DARK[idx], l = ZONE_LIGHT[idx];
    f.properties._fd = [d[0], d[1], d[2], 200];
    f.properties._ld = [Math.min(255, d[0] + 40), Math.min(255, d[1] + 45), Math.min(255, d[2] + 60), 100];
    f.properties._fl = [l[0], l[1], l[2], 240];
    f.properties._ll = [Math.max(0, l[0] - 12), Math.max(0, l[1] - 12), Math.max(0, l[2] - 10), 60];
    f.properties._h = f.properties.h || 12;
  }
  return geo;
}
const lodFor = (z) => (z < 11 ? 45 : z < 11.5 ? 30 : z < 12 ? 20 : z < 12.5 ? 12 : z < 13 ? 6 : z < 14 ? 1 : 0);

// ── the 3D map (probe-guarded, lazy, theme-aware) ────────────────────────────────────────────────────────
// Returns a controller with rebuild()/destroy(); null when WebGL2/deck.gl is unavailable (gate/offline).
async function makeDeck(canvas) {
  if (gate) return null;
  try { if (!canvas.getContext("webgl2")) return null; } catch { return null; }
  let D; try { D = await import(DECK_URL); } catch { return null; }
  if (!D || !D.Deck) return null;

  const geo = {};
  const grab = async (name) => { try { const r = await fetch(`${GEO}/${name}.json`); geo[name] = await r.json(); } catch { geo[name] = null; } };
  await grab("districts"); await grab("water"); await grab("roads"); await grab("metro");
  await grab("buildings"); if (geo.buildings) preprocessBuildings(geo.buildings);

  let zoom = VIEW.zoom, isDark = true, jobs = [], onPick = () => {}, onPlace = null;
  const state = {};

  function buildingsAt(lod) {
    if (!geo.buildings || !geo.buildings.features) return null;
    if (lod === 0) return geo.buildings;
    return { type: "FeatureCollection", features: geo.buildings.features.filter((f) => f.properties._h >= lod) };
  }

  function layers() {
    const L = [];
    const fk = isDark ? "_fd" : "_fl", lk = isDark ? "_ld" : "_ll";
    if (geo.districts) L.push(new D.GeoJsonLayer({ id: "districts", data: geo.districts, filled: false, stroked: true, getLineColor: isDark ? [60, 65, 90, 70] : [170, 165, 155, 55], getLineWidth: 2, lineWidthMinPixels: 1, lineWidthMaxPixels: 3, pickable: false }));
    if (geo.water) L.push(new D.GeoJsonLayer({ id: "water", data: geo.water, filled: true, stroked: true, getFillColor: isDark ? [12, 25, 65, 180] : [155, 190, 215, 180], getLineColor: isDark ? [25, 50, 120, 140] : [130, 170, 200, 120], lineWidthMinPixels: 1, pickable: false }));
    if (geo.roads) L.push(new D.GeoJsonLayer({ id: "roads", data: geo.roads, filled: false, stroked: true, getLineColor: isDark ? [38, 40, 55, 150] : [210, 206, 198, 150], getLineWidth: (f) => { const h = f.properties && f.properties.hw; return h === "motorway" || h === "trunk" ? 14 : h === "primary" ? 10 : h === "secondary" ? 7 : 4; }, lineWidthUnits: "meters", lineWidthMinPixels: 0.5, lineWidthMaxPixels: 5, pickable: false }));
    if (geo.metro && geo.metro.lines) L.push(new D.GeoJsonLayer({ id: "metro", data: geo.metro.lines, filled: false, stroked: true, getLineColor: (f) => { const c = (f.properties && f.properties.color) || [150, 150, 150]; return [c[0], c[1], c[2], isDark ? 150 : 190]; }, getLineWidth: 4, lineWidthUnits: "meters", lineWidthMinPixels: 2, lineWidthMaxPixels: 5, pickable: false }));
    if (geo.metro && geo.metro.stations) L.push(new D.ScatterplotLayer({ id: "stations", data: geo.metro.stations, getPosition: (d) => d.coordinates, getRadius: 50, getFillColor: (d) => [...d.color, 220], stroked: true, getLineColor: [255, 255, 255, isDark ? 110 : 220], lineWidthMinPixels: 1, radiusMinPixels: 3, radiusMaxPixels: 8, pickable: false, antialiasing: true }));
    const b = buildingsAt(lodFor(zoom));
    if (b) L.push(new D.GeoJsonLayer({ id: "buildings", data: b, extruded: true, wireframe: true, opacity: isDark ? 0.7 : 0.9, getElevation: (f) => f.properties._h, getFillColor: (f) => f.properties[fk], getLineColor: (f) => f.properties[lk], material: isDark ? { ambient: 0.35, diffuse: 0.5, shininess: 25, specularColor: [40, 55, 110] } : { ambient: 0.7, diffuse: 0.4, shininess: 8, specularColor: [220, 218, 212] }, pickable: false, updateTriggers: { getFillColor: [isDark], getLineColor: [isDark] } }));
    const clusters = clusterJobs(jobs);
    if (clusters.length) {
      L.push(new D.ColumnLayer({ id: "cols", data: clusters, diskResolution: 24, radius: 55, extruded: true, elevationScale: 80, getPosition: (d) => d.coordinates, getElevation: (d) => Math.max(1, d.count), getFillColor: (d) => [...vacancyColor(d.count), 235], getLineColor: (d) => [...vacancyColor(d.count), 120], wireframe: true, lineWidthMinPixels: 1, pickable: true, autoHighlight: true, highlightColor: [255, 255, 255, 40], onClick: (info) => { if (info && info.object) onPick(info.object); }, material: { ambient: 0.4, diffuse: 0.7, shininess: 60, specularColor: [0, 229, 255] } }));
      L.push(new D.ScatterplotLayer({ id: "col-tops", data: clusters, getPosition: (d) => [d.coordinates[0], d.coordinates[1], Math.max(1, d.count) * 80], getRadius: 32, getFillColor: (d) => { const c = vacancyColor(d.count); return [Math.min(255, c[0] + 60), Math.min(255, c[1] + 60), Math.min(255, c[2] + 60), 240]; }, radiusMinPixels: 4, radiusMaxPixels: 12, pickable: false, antialiasing: true }));
    }
    if (state.pin) L.push(new D.ScatterplotLayer({ id: "pin", data: [state.pin], getPosition: (d) => [d.lon, d.lat], getRadius: 90, getFillColor: [0, 229, 255, 200], stroked: true, getLineColor: [255, 255, 255, 230], lineWidthMinPixels: 2, radiusMinPixels: 8, radiusMaxPixels: 16, pickable: false, antialiasing: true }));
    return L;
  }

  const deck = new D.Deck({
    canvas,
    initialViewState: VIEW,
    controller: { dragRotate: true, touchRotate: true },
    views: new D.MapView({ repeat: false }),
    getCursor: ({ isDragging }) => (onPlace ? "crosshair" : isDragging ? "grabbing" : "grab"),
    onViewStateChange: ({ viewState }) => { const nz = viewState.zoom; if (Math.abs(nz - zoom) > 0.25) { zoom = nz; deck.setProps({ layers: layers() }); } },
    onClick: (info) => { if (onPlace && info && info.coordinate) { onPlace(info.coordinate[1], info.coordinate[0]); } },
    layers: [],
  });

  const ctl = {
    rebuild(next) {
      if (next.isDark != null) isDark = next.isDark;
      if (next.jobs) jobs = next.jobs;
      if ("onPick" in next) onPick = next.onPick;
      if ("onPlace" in next) onPlace = next.onPlace;
      if ("pin" in next) state.pin = next.pin;
      deck.setProps({ layers: layers(), style: { background: isDark ? "#06060a" : "#e8e6e1" } });
    },
    destroy() { try { deck.finalize(); } catch { /* */ } },
  };
  return ctl;
}

function MapStage({ t, isDark, jobs }) {
  const canvasRef = useRef(null);
  const ctlRef = useRef(null);
  const placing = useStore($pick) === "placing";   // active while the map waits for a tap to drop the pin

  useEffect(() => {
    let dead = false;
    (async () => {
      const ctl = await makeDeck(canvasRef.current);
      if (dead) { ctl && ctl.destroy(); return; }
      ctlRef.current = ctl;
      if (ctl) { $glReady.set(true); ctl.rebuild({ isDark, jobs: $jobs.get(), onPick: (c) => $city.set(c), onPlace: null }); }
    })();
    return () => { dead = true; $glReady.set(false); ctlRef.current && ctlRef.current.destroy(); ctlRef.current = null; };
  }, []);

  // theme + data changes re-drive the live deck
  useEffect(() => { ctlRef.current && ctlRef.current.rebuild({ isDark, jobs }); }, [isDark, jobs]);
  // placing mode: the next map tap sets the new posting's point
  useEffect(() => {
    if (!ctlRef.current) return;
    ctlRef.current.rebuild({ onPlace: placing ? (lat, lon) => { $pick.set({ lat, lon }); ctlRef.current.rebuild({ pin: { lat, lon }, onPlace: null }); $post.set(true); } : null });
  }, [placing]);

  return html`<canvas ref=${canvasRef} data-map class="absolute inset-0 w-full h-full block"
      style=${`background:${isDark ? "#06060a" : "#e8e6e1"}`} aria-hidden="true"></canvas>`;
}

// ── job card + list (the DOM truth) ──────────────────────────────────────────────────────────────────────
const kmFromCentre = (lat, lon) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const dLat = (lat - KYIV.lat) * 111.32, dLon = (lon - KYIV.lon) * 111.32 * Math.cos(KYIV.lat * Math.PI / 180);
  return Math.round(Math.hypot(dLat, dLon) * 10) / 10;
};
const applyLink = (contact) => /^https?:\/\//i.test(contact) ? contact : /^@/.test(contact) ? `https://t.me/${contact.slice(1)}` : /@/.test(contact) ? `mailto:${contact}` : null;

function JobCard({ t, j }) {
  const emp = j.employment && empKey[j.employment] ? T(t, empKey[j.employment]) : "";
  const km = kmFromCentre(j.lat, j.lon);
  const link = applyLink(j.contact);
  return html`<${Island} className="p-[var(--ms-pad)]">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div data-job-title class="font-semibold leading-tight">${j.title}</div>
        <div class="text-[0.9rem] text-muted truncate">${j.company}</div>
      </div>
      ${j.salary ? html`<div class="shrink-0 font-mono text-[0.82rem] font-semibold text-base-content whitespace-nowrap">${j.salary}</div>` : null}
    </div>
    <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
      ${emp ? html`<span class="badge badge-sm badge-ghost">${emp}</span>` : null}
      ${km != null ? html`<span class="text-[0.76rem] text-muted flex items-center gap-1">${Icon("lucide:map-pin", "text-[0.9em]")}${km} ${T(t, "kmFromCentre")}</span>` : null}
    </div>
    ${j.description ? html`<p class="mt-2 text-[0.9rem] leading-relaxed text-muted whitespace-pre-line line-clamp-4">${j.description}</p>` : null}
    <div class="mt-3 flex items-center justify-between gap-2">
      ${j.poster ? html`<span class="text-[0.76rem] text-muted truncate">${j.poster}</span>` : html`<span></span>`}
      ${link
        ? html`<a data-apply href=${link} target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm gap-1.5 rounded-full">${Icon("lucide:send", "text-[1em]")}<span>${T(t, "applyBtn")}</span></a>`
        : html`<span data-apply class="font-mono text-[0.8rem] text-muted select-all">${j.contact}</span>`}
    </div>
  <//>`;
}

function JobList({ t, jobs, empty }) {
  if (!jobs.length) return html`<div class="py-8 text-center text-muted">${empty}</div>`;
  return html`<div class="flex flex-col gap-[var(--ms-gap)] pb-2">${jobs.map((j) => html`<${JobCard} t=${t} j=${j} key=${j.id} />`)}</div>`;
}

// ── the view ─────────────────────────────────────────────────────────────────────────────────────────────
export function mapView({ t, S }) {
  const jobs = useStore($jobs);
  const loading = useStore($loading);
  const glReady = useStore($glReady);
  const theme = useStore(S.theme);
  const city = useStore($city);
  const listOpen = useStore($listOpen);
  const [showMap] = useState(!gate);   // under the gate, no canvas — the list fills the region
  const isDark = !/light/i.test(String(theme || ""));

  useEffect(() => { loadJobs(); }, []);

  const total = jobs.length;
  const openPost = () => { $sent.set(false); $err.set(null); $pick.set(null); $post.set(true); };

  // Full-bleed: the map fills the whole tab, edge to edge — a premium, immersive stage. Everything else is a
  // floating ISLAND over it (theme-aware opaque surfaces, sf-e3), not chrome bolted to the edges.
  return html`<div data-stage class="relative h-full w-full min-h-0 overflow-hidden ${isDark ? "bg-black" : "bg-base-200"}">

    ${showMap
      ? html`<${MapStage} t=${t} isDark=${isDark} jobs=${jobs} />`
      : null}
    ${!showMap || !glReady
      ? html`<div class="absolute inset-0 overflow-y-auto px-[var(--ms-pad)] pt-20 pb-24">
          <${JobList} t=${t} jobs=${jobs} empty=${loading ? T(t, "loadingJobs") : T(t, "emptyJobs")} />
        </div>`
      : null}

    <!-- brand island (top-left) -->
    <div class="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-base-100 sf-e3 pl-2.5 pr-3.5 py-1.5">
      <span class="w-2 h-2 rounded-full shrink-0" style="background:var(--app-accent)"></span>
      <span class="font-bold tracking-tight text-sm leading-none">JOBX</span>
      <span data-total class="font-mono text-[0.72rem] text-muted leading-none">${total} · ${T(t, "kyiv")}</span>
    </div>

    <!-- density legend island (top-right, only when the 3D map is up) -->
    ${glReady ? html`<div class="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-base-100 sf-e3 px-3 py-1.5">
      ${LEGEND.map(([n, lbl]) => { const c = vacancyColor(n); return html`<span class="flex items-center gap-1">
        <span class="w-2 h-2 rounded-full" style=${`background:rgb(${c[0]},${c[1]},${c[2]})`}></span>
        <span class="text-[0.62rem] font-mono text-muted leading-none">${lbl}</span></span>`; })}
    </div>` : null}

    <!-- control island (bottom-centre) — one widget, list + post -->
    <div class="absolute left-1/2 bottom-4 -translate-x-1/2 flex items-center gap-1 rounded-full bg-base-100 sf-e3 p-1.5">
      <button data-list class="btn btn-ghost btn-sm gap-2 rounded-full" onClick=${() => { $query.set(""); $listOpen.set(true); }}>
        ${Icon("lucide:list", "text-[1.1em]")}<span class="font-medium">${T(t, "listBtn")}</span>
        <span class="badge badge-sm badge-neutral font-mono">${total}</span>
      </button>
      <button data-post class="btn btn-primary btn-sm gap-1.5 rounded-full" onClick=${openPost}>
        ${Icon("lucide:plus", "text-[1.15em]")}<span class="font-medium">${T(t, "postCta")}</span>
      </button>
    </div>

    <${ClusterSheet} t=${t} city=${city} onClose=${() => $city.set(null)} onPost=${() => { $city.set(null); openPost(); }} />
    <${ListSheet} t=${t} jobs=${jobs} open=${listOpen} onClose=${() => $listOpen.set(false)} />
    <${PostSheet} t=${t} onClose=${() => $post.set(false)} />
  </div>`;
}

function ClusterSheet({ t, city, onClose, onPost }) {
  return html`<${Sheet} id="jobx-cluster" open=${!!city} onClose=${onClose} title=${T(t, "hereTitle")} icon="lucide:map-pin">
    ${city ? html`<${JobList} t=${t} jobs=${city.jobs || []} empty=${T(t, "emptyJobs")} />
      <div class="pb-2 pt-1"><button class="btn btn-ghost btn-sm gap-2 rounded-full w-full border border-base-content/10" onClick=${onPost}>${Icon("lucide:plus")}<span>${T(t, "postCta")}</span></button></div>` : null}
  <//>`;
}

function ListSheet({ t, jobs, open, onClose }) {
  const q = useStore($query).trim().toLowerCase();
  const filtered = q ? jobs.filter((j) => `${j.title} ${j.company} ${j.address || ""}`.toLowerCase().includes(q)) : jobs;
  return html`<${Sheet} id="jobx-list" open=${open} onClose=${onClose} title=${T(t, "listTitle")} icon="lucide:list">
    ${open ? html`<div class="pb-2">
      <input data-search type="search" value=${useStore($query)} placeholder=${T(t, "searchPh")}
        onInput=${(e) => $query.set(e.currentTarget.value)}
        class="input input-bordered w-full bg-base-200/60 mb-[var(--ms-gap)]" />
      <${JobList} t=${t} jobs=${filtered} empty=${T(t, "noMatch")} />
    </div>` : null}
  <//>`;
}

function Field({ label, children }) {
  return html`<label class="block"><span class="block mb-1 text-[0.82rem] font-medium text-muted">${label}</span>${children}</label>`;
}

function PostSheet({ t, onClose }) {
  const open = useStore($post);
  const sent = useStore($sent);
  const posting = useStore($posting);
  const err = useStore($err);
  const f = useStore($form);
  const pick = useStore($pick);
  const glReady = useStore($glReady);
  const input = "input input-bordered w-full bg-base-200/60";

  const submit = async () => {
    if ($posting.get()) return;
    if (!f.title.trim() || !f.company.trim() || !f.description.trim() || !f.contact.trim()) { $err.set("errFields"); return; }
    const loc = pick && pick.lat ? pick : { lat: KYIV.lat, lon: KYIV.lon };
    const sess = session.get();
    if (!gate && !(sess && sess.sid)) { $err.set("needLogin"); return; }
    $err.set(null); $posting.set(true);
    try {
      if (!gate) {
        const r = await fetch(`${VPS_PROXY}/jobs/post`, { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ sid: sess.sid, ...f, lat: loc.lat, lon: loc.lon }) });
        if (!r.ok) throw new Error("post " + r.status);
      }
      $sent.set(true);
      $form.setKey("title", ""); $form.setKey("company", ""); $form.setKey("salary", ""); $form.setKey("description", ""); $form.setKey("contact", "");
    } catch { $err.set("errFailed"); }
    $posting.set(false);
  };

  const picked = pick && pick.lat;
  return html`<${Sheet} id="jobx-post" open=${open} onClose=${onClose} title=${T(t, "postTitle")} icon="lucide:briefcase">
    ${sent
      ? html`<div data-sent class="flex flex-col items-center gap-3 py-8 text-center">
          <span class="grid place-items-center w-14 h-14 rounded-full bg-[var(--app-accent)]/15 text-[var(--app-accent)]">${Icon("lucide:check", "text-2xl")}</span>
          <div class="text-lg font-semibold">${T(t, "sentTitle")}</div>
          <p class="max-w-xs text-muted">${T(t, "sentBody")}</p>
          <button class="btn btn-primary btn-sm rounded-full mt-1" onClick=${onClose}>${T(t, "close")}</button>
        </div>`
      : html`<form data-form class="flex flex-col gap-[var(--ms-gap)] pb-2" onSubmit=${(e) => { e.preventDefault(); submit(); }}>
          <${Field} label=${T(t, "fldTitle")}><input data-f-title class=${input} value=${f.title} maxlength="120" placeholder=${T(t, "fldTitlePh")} onInput=${(e) => $form.setKey("title", e.currentTarget.value)} /><//>
          <div class="grid grid-cols-2 gap-[var(--ms-gap)]">
            <${Field} label=${T(t, "fldCompany")}><input data-f-company class=${input} value=${f.company} maxlength="100" placeholder=${T(t, "fldCompanyPh")} onInput=${(e) => $form.setKey("company", e.currentTarget.value)} /><//>
            <${Field} label=${T(t, "fldSalary")}><input data-f-salary class=${input} value=${f.salary} maxlength="80" placeholder=${T(t, "fldSalaryPh")} onInput=${(e) => $form.setKey("salary", e.currentTarget.value)} /><//>
          </div>
          <${Field} label=${T(t, "fldEmployment")}>
            <div class="flex flex-wrap gap-1.5">${EMPLOYMENT.map((e) => html`<button type="button" data-emp=${e} class=${`btn btn-sm rounded-full ${f.employment === e ? "btn-primary" : "btn-ghost border border-base-content/15"}`} onClick=${() => $form.setKey("employment", e)}>${T(t, empKey[e])}</button>`)}</div>
          <//>
          <${Field} label=${T(t, "fldLocation")}>
            <button type="button" data-pick class="btn btn-ghost w-full justify-start gap-2 border border-base-content/15 rounded-[var(--ms-r-in)]"
              disabled=${!glReady}
              onClick=${() => { $pick.set("placing"); $post.set(false); }}>
              ${Icon("lucide:map-pin", "text-[1.1em] text-[var(--app-accent)]")}
              <span class="truncate">${picked ? `${pick.lat.toFixed(4)}, ${pick.lon.toFixed(4)}` : glReady ? T(t, "pickOnMap") : T(t, "pickCentre")}</span>
            </button>
          <//>
          <${Field} label=${T(t, "fldDesc")}><textarea data-f-desc rows="4" class="textarea textarea-bordered w-full bg-base-200/60 leading-relaxed" value=${f.description} maxlength="2000" placeholder=${T(t, "fldDescPh")} onInput=${(e) => $form.setKey("description", e.currentTarget.value)}></textarea><//>
          <${Field} label=${T(t, "fldContact")}><input data-f-contact class=${input} value=${f.contact} maxlength="200" placeholder=${T(t, "fldContactPh")} onInput=${(e) => $form.setKey("contact", e.currentTarget.value)} /><//>
          ${err ? html`<div data-err class="text-[0.85rem] text-error">${T(t, err)}</div>` : null}
          <button data-submit type="submit" class="btn btn-primary rounded-full mt-1" disabled=${posting}>${posting ? T(t, "submitting") : T(t, "submit")}</button>
        </form>`}
  <//>`;
}
