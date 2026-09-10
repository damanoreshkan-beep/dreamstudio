// jobx — jobs on a 3D map of Kyiv. The map is the app's HERO BACKGROUND: a full-screen, theme-coloured 3D
// city that fills the Map tab, with a single control island at the foot. Jobs are a separate List tab; a
// vacancy's detail and the post form are BIG ROUTED PAGES (S.screen), never bottom-sheet modals.
//
// Theme-first: the map's whole palette is DERIVED from the active theme's tokens (--color-base-*, --app-accent)
// and recomputed on every theme switch — light theme → a light city, dark → a dark city, always coherent with
// the rest of the farm. Nothing about the map's colour is hardcoded.
//
// The WebGL map is a probe-guarded enhancement (glstage law): it runs on a live WebGL2 context, never under the
// headless/CI gate — there the DOM (the List tab, the routed pages) is the truth the gate, axe and e2e see.
import { html } from "htm/preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { map as nmap } from "nanostores";
import { Island } from "/_rt/ui.js";
import { T } from "/_rt/i18n.js";
import { gate, isGate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { session } from "/_rt/auth.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const EMPLOYMENT = ["full", "part", "remote", "contract", "internship"];
const empKey = { full: "empFull", part: "empPart", remote: "empRemote", contract: "empContract", internship: "empInternship" };

const GEO = "https://dreamstudio.mooo.com/kyiv";     // static Kyiv geometry (nginx, gzip), lazy — never bundled
const DECK_URL = "https://esm.sh/deck.gl@9.4.0";      // dynamic-imported only behind a WebGL2 probe
const KYIV = { lat: 50.4501, lon: 30.5234 };
const VIEW = { longitude: KYIV.lon, latitude: KYIV.lat, zoom: 11.0, pitch: 55, bearing: -18, minZoom: 10, maxZoom: 18 };

// Kyiv districts — a posted job picks one; its centre gives the point on the map (no map-tap needed on a page).
const DISTRICTS = {
  shevchenkivskyi: { uk: "Шевченківський", en: "Shevchenkivskyi", lat: 50.452, lon: 30.480 },
  pecherskyi: { uk: "Печерський", en: "Pecherskyi", lat: 50.425, lon: 30.540 },
  podilskyi: { uk: "Подільський", en: "Podilskyi", lat: 50.475, lon: 30.515 },
  solomianskyi: { uk: "Солом'янський", en: "Solomianskyi", lat: 50.430, lon: 30.445 },
  holosiivskyi: { uk: "Голосіївський", en: "Holosiivskyi", lat: 50.380, lon: 30.510 },
  obolonskyi: { uk: "Оболонський", en: "Obolonskyi", lat: 50.510, lon: 30.500 },
  desnianskyi: { uk: "Деснянський", en: "Desnianskyi", lat: 50.515, lon: 30.605 },
  dniprovskyi: { uk: "Дніпровський", en: "Dniprovskyi", lat: 50.455, lon: 30.615 },
  darnytskyi: { uk: "Дарницький", en: "Darnytskyi", lat: 50.400, lon: 30.630 },
  sviatoshynskyi: { uk: "Святошинський", en: "Sviatoshynskyi", lat: 50.455, lon: 30.360 },
};

// ── state ────────────────────────────────────────────────────────────────────────────────────────────────
const DEV_HOST = typeof location !== "undefined" && /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/.test(location.hostname);
const MOCK_JOBS = [
  { id: "1", title: "Frontend-розробник", company: "Dreamware", lat: 50.452, lon: 30.480, address: "Шевченківський", salary: "60 000–90 000 ₴", employment: "remote", description: "Preact, невеликі PWA, чистий код. Гнучкий графік, дружня команда, віддалена робота.", contact: "@dreamware_jobs", poster: "Octocat", ms: Date.now() },
  { id: "2", title: "Бариста", company: "Кава Гармонія", lat: 50.475, lon: 30.515, address: "Подільський", salary: "22 000 ₴", employment: "part", description: "Ранкові зміни, навчаємо з нуля, чай і кава безкоштовно.", contact: "hr@harmony.ua", poster: "Ірина", ms: Date.now() },
  { id: "3", title: "Менеджер із продажу", company: "Кратос", lat: 50.425, lon: 30.540, address: "Печерський", salary: "37 500–90 000 ₴", employment: "full", description: "Повна зайнятість, вища освіта, CRM. Провідний постачальник комплектуючих.", contact: "https://t.me/kratos_hr", poster: "Кратос", ms: Date.now() },
  { id: "4", title: "Кухар", company: "KFC", lat: 50.510, lon: 30.500, address: "Оболонський", salary: "27 000 ₴", employment: "full", description: "Готові взяти студента, людину з інвалідністю, пенсіонера. Навчання коштом компанії.", contact: "@kfc_jobs", poster: "KFC", ms: Date.now() },
  { id: "5", title: "Інженер-електронік", company: "Sempal", lat: 50.400, lon: 30.630, address: "Дарницький", salary: "60 000–100 000 ₴", employment: "full", description: "Досвід від 2 років, C++, Assembler. Провідний український виробник.", contact: "hr@sempal.com", poster: "Sempal", ms: Date.now() },
];

const $jobs = atom(gate ? MOCK_JOBS : []);
const $loading = atom(!gate);
const $glReady = atom(false);
const $sent = atom(false);
const $posting = atom(false);
const $err = atom(null);
const $form = nmap({ title: "", company: "", district: "shevchenkivskyi", salary: "", employment: "full", description: "", contact: "" });

async function loadJobs() {
  if (gate) { $jobs.set(MOCK_JOBS); $loading.set(false); return; }
  try {
    const r = await fetch(`${VPS_PROXY}/jobs/list`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const j = await r.json();
    let list = Array.isArray(j && j.jobs) ? j.jobs : [];
    if (!list.length && DEV_HOST) list = MOCK_JOBS;
    $jobs.set(list);
  } catch { if (DEV_HOST) $jobs.set(MOCK_JOBS); } finally { $loading.set(false); }
}
const jobById = (id) => $jobs.get().find((j) => String(j.id) === String(id)) || null;

// ── theme-derived palette ────────────────────────────────────────────────────────────────────────────────
// Read a CSS custom property and resolve it to sRGB. getComputedStyle returns the token verbatim — here that
// is `oklch(…)`, not `rgb(…)` — so parsing the numbers directly would read oklch components as RGB (blue
// buildings, brown water). Painting the resolved colour onto a 1×1 canvas and reading the pixel converts ANY
// colour syntax (oklch, hex, rgb) to true sRGB bytes.
let _ctx = null;
function themeRGB(name, fb) {
  try {
    const p = document.createElement("span");
    p.style.cssText = `color:var(${name});position:absolute;left:-9999px`;
    document.body.appendChild(p);
    const c = getComputedStyle(p).color;
    p.remove();
    _ctx = _ctx || document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    _ctx.clearRect(0, 0, 1, 1); _ctx.fillStyle = "#000"; _ctx.fillStyle = c; _ctx.fillRect(0, 0, 1, 1);
    const d = _ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  } catch { return fb; }
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
// The whole map, in the theme's gamut: ground = base-200 (= the app's own bg, so the map reads as background),
// buildings a step off it, outlines/roads from base-content, water a base-300 pulled toward accent, columns accent.
function palette() {
  const base1 = themeRGB("--color-base-100", [16, 16, 18]);
  const base2 = themeRGB("--color-base-200", [10, 10, 12]);
  const base3 = themeRGB("--color-base-300", [22, 22, 26]);
  const ink = themeRGB("--color-base-content", [235, 235, 235]);
  const accent = themeRGB("--app-accent", [0, 229, 255]);
  const dark = (ink[0] + ink[1] + ink[2]) / 3 > 140;    // light ink ⇒ dark theme
  return {
    dark, bg: base2, accent,
    building: mix(base2, ink, dark ? 0.16 : 0.26),
    buildingLine: [...mix(base3, ink, 0.5), dark ? 110 : 90],
    water: [...mix(base3, accent, dark ? 0.3 : 0.4), 210],
    waterLine: [...mix(base3, accent, 0.55), 160],
    road: [...mix(base2, ink, 0.34), 160],
    district: [...ink, dark ? 55 : 50],
    // salary pills (Airbnb-style): a solid surface pill, accent border, ink text; clusters invert to accent.
    pillBg: [...base1, 240], pillText: [...ink, 255], pillBorder: [...accent, 255],
    clusterBg: [...accent, 245], clusterText: [...(dark ? base2 : [255, 255, 255]), 255],
    anchor: [...accent, 255], beam: [...accent, dark ? 70 : 90],
  };
}

// A compact salary for the pill — "60–90k ₴" / "45k ₴"; null when there's no number (→ a plain anchor dot).
function shortSalary(s) {
  if (!s) return null;
  const nums = String(s).replace(/\s/g, "").match(/\d{3,}/g);
  if (!nums || !nums.length) return null;
  const cur = /\$/.test(s) ? "$" : /€/.test(s) ? "€" : "₴";
  const k = (n) => { n = +n; return n >= 1000 ? Math.round(n / 100) / 10 + "k" : "" + n; };
  return nums.length >= 2 ? `${k(nums[0])}–${k(nums[1])} ${cur}` : `${k(nums[0])} ${cur}`;
}

const clusterJobs = (jobs) => {
  const g = new Map();
  for (const j of jobs) { if (!Number.isFinite(j.lat) || !Number.isFinite(j.lon)) continue; const k = `${j.lat.toFixed(3)}_${j.lon.toFixed(3)}`; (g.get(k) || g.set(k, []).get(k)).push(j); }
  return [...g.values()].map((grp) => ({ coordinates: [grp.reduce((s, j) => s + j.lon, 0) / grp.length, grp.reduce((s, j) => s + j.lat, 0) / grp.length], count: grp.length, jobs: grp }));
};
// Buildings are viewport-CULLED on a grid (deck.gl has no per-feature frustum culling — it draws every vertex
// of a layer each frame, so 155k extruded footprints melt a weak GPU). Only the cells around the camera draw,
// and only past BLD_ZOOM — a city-wide view draws none, so it stays smooth. CELL ≈ 450 m; CELL_RADIUS cells
// each side of centre caps the draw count (~a few thousand footprints) regardless of pitch.
const CELL = 0.006, BLD_ZOOM = 12.5, CELL_RADIUS = 4;

// ── the 3D map (probe-guarded, lazy, theme-derived) ──────────────────────────────────────────────────────
async function makeDeck(canvas) {
  if (isGate) return null;
  try { if (!canvas.getContext("webgl2")) return null; } catch { return null; }
  let D; try { D = await import(DECK_URL); } catch { return null; }
  if (!D || !D.Deck) return null;

  const geo = {};
  const grab = async (n) => { try { geo[n] = await (await fetch(`${GEO}/${n}.json`)).json(); } catch { geo[n] = null; } };
  await grab("districts"); await grab("water"); await grab("roads"); await grab("metro"); await grab("buildings");
  // Bin every building into its grid cell ONCE (by a footprint corner — a building is tiny vs a cell). Each cell
  // is a STABLE FeatureCollection, so deck.gl reuses that cell's tessellated GPU buffers while it stays on
  // screen; panning only tessellates the few cells newly entered — never the whole layer (the old stall).
  const bGrid = new Map();
  if (geo.buildings && geo.buildings.features) for (const f of geo.buildings.features) {
    f.properties._h = f.properties.h || 12;
    const p = f.geometry.coordinates[0][0];
    const k = `${Math.floor(p[0] / CELL)}_${Math.floor(p[1] / CELL)}`;
    let cell = bGrid.get(k); if (!cell) bGrid.set(k, cell = { type: "FeatureCollection", features: [] });
    cell.features.push(f);
  }

  let zoom = VIEW.zoom, cLng = VIEW.longitude, cLat = VIEW.latitude, pal = palette(), jobs = [], onPick = () => {}, curClusters = [], cellSig = "";
  // The cell keys to draw for the current camera: a square of CELL_RADIUS cells around the centre, past the
  // zoom gate. A fixed radius (not the pitched viewport bounds) keeps the draw bounded even to the horizon.
  const visCells = () => {
    if (zoom < BLD_ZOOM || !bGrid.size) return [];
    const ci = Math.floor(cLng / CELL), cj = Math.floor(cLat / CELL), out = [];
    for (let di = -CELL_RADIUS; di <= CELL_RADIUS; di++) for (let dj = -CELL_RADIUS; dj <= CELL_RADIUS; dj++) {
      const k = `${ci + di}_${cj + dj}`; if (bGrid.has(k)) out.push(k);
    }
    return out;
  };

  function layers() {
    const L = [];
    if (geo.districts) L.push(new D.GeoJsonLayer({ id: "districts", data: geo.districts, filled: false, stroked: true, getLineColor: pal.district, getLineWidth: 2, lineWidthMinPixels: 1, lineWidthMaxPixels: 3, pickable: false }));
    if (geo.water) L.push(new D.GeoJsonLayer({ id: "water", data: geo.water, filled: true, stroked: true, getFillColor: pal.water, getLineColor: pal.waterLine, lineWidthMinPixels: 1, pickable: false }));
    if (geo.roads) L.push(new D.GeoJsonLayer({ id: "roads", data: geo.roads, filled: false, stroked: true, getLineColor: pal.road, getLineWidth: (f) => { const h = f.properties && f.properties.hw; return h === "motorway" || h === "trunk" ? 12 : h === "primary" ? 9 : h === "secondary" ? 6 : 3; }, lineWidthUnits: "meters", lineWidthMinPixels: 0.5, lineWidthMaxPixels: 4, pickable: false }));
    if (geo.metro && geo.metro.lines) L.push(new D.GeoJsonLayer({ id: "metro", data: geo.metro.lines, filled: false, stroked: true, getLineColor: (f) => { const c = (f.properties && f.properties.color) || pal.accent; return [c[0], c[1], c[2], 200]; }, getLineWidth: 4, lineWidthUnits: "meters", lineWidthMinPixels: 2, lineWidthMaxPixels: 5, pickable: false }));
    // One layer per visible cell — deck keeps each cell's buffers between frames, so panning never re-tessellates
    // the whole city. The cull holds the drawn count to a few thousand, so a light material (ambient + diffuse,
    // NO specular — the costly per-fragment term) is affordable and gives the faces their 3D shading.
    for (const key of visCells()) {
      L.push(new D.GeoJsonLayer({ id: `bld-${key}`, data: bGrid.get(key), extruded: true, opacity: pal.dark ? 0.92 : 0.97, getElevation: (f) => f.properties._h, getFillColor: pal.building, material: { ambient: pal.dark ? 0.5 : 0.62, diffuse: 0.55, shininess: 1, specularColor: [0, 0, 0] }, pickable: false, updateTriggers: { getFillColor: [pal] } }));
    }
    // Job markers — Airbnb-style salary PILLS on an anchored stem (map-UX + deck.gl research). A single job
    // shows its salary; a cluster shows the count (accent-filled). The pill would detach over a tilted 3D city,
    // so a slim beam + an anchor dot pin it to its point. All colour is theme-derived (pal.*). Pill/dot pick →
    // open the job (single) or the top job of the cluster.
    const cl = clusterJobs(jobs);
    curClusters = cl;                              // CPU hit-test source (see the Deck onClick below)
    if (cl.length) {
      // A cluster shows its count; a single job its salary. A job with NO salary has no label — it must NOT
      // draw an empty pill (a blank box reads as broken), so the pill layer takes only labelled markers and
      // the unpriced job stays a clean anchor dot + beam (a pin); a tap on it still opens via the CPU hit-test.
      const label = (d) => (d.count > 1 ? String(d.count) : (shortSalary(d.jobs[0] && d.jobs[0].salary) || ""));
      const pilled = cl.filter((d) => label(d));
      L.push(new D.ColumnLayer({ id: "beam", data: cl, diskResolution: 12, radius: 6, extruded: true, elevationScale: 1, getPosition: (d) => d.coordinates, getElevation: 220, getFillColor: pal.beam, pickable: false }));
      L.push(new D.ScatterplotLayer({ id: "anchor", data: cl, getPosition: (d) => d.coordinates, radiusUnits: "pixels", getRadius: 5, radiusMinPixels: 5, radiusMaxPixels: 9, getFillColor: pal.anchor, stroked: true, getLineColor: [255, 255, 255, 200], lineWidthUnits: "pixels", getLineWidth: 1.5, pickable: true }));
      L.push(new D.TextLayer({
        id: "pills", data: pilled, pickable: true, billboard: true, sizeUnits: "pixels",
        getPosition: (d) => [d.coordinates[0], d.coordinates[1], 220], getPixelOffset: [0, -12],
        getText: label, getSize: (d) => (d.count > 1 ? 15 : 13), sizeMinPixels: 11, sizeMaxPixels: 20,
        background: true, backgroundBorderRadius: 11, backgroundPadding: [10, 6, 10, 6], getBackgroundColor: (d) => (d.count > 1 ? pal.clusterBg : pal.pillBg),
        getBorderColor: pal.pillBorder, getBorderWidth: 1.2,
        getColor: (d) => (d.count > 1 ? pal.clusterText : pal.pillText),
        fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 700, characterSet: "auto",
        updateTriggers: { getBackgroundColor: [pal], getColor: [pal], getBorderColor: [pal], getText: [jobs] },
      }));
    }
    return L;
  }

  // Resolve a tap to a marker WITHOUT the GPU picker. deck.gl's picking framebuffer is unreliable across the
  // devices this ships to (a job map that cannot be tapped is the bug this fixes) — so we project every marker
  // to the screen with the viewport (reliable everywhere) and take the nearest within a finger's radius. The
  // pill floats at 220 m (offset up 12 px) and the anchor sits on the ground, so a tap near EITHER counts.
  function pickCluster(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !curClusters.length) return null;
    const vp = deck.getViewports()[0]; if (!vp) return null;
    let best = null, bd = Infinity;
    for (const c of curClusters) {
      const lab = c.count > 1 ? String(c.count) : (shortSalary(c.jobs[0] && c.jobs[0].salary) || "");
      const [px, py] = vp.project([c.coordinates[0], c.coordinates[1], 220]);   // pill floats at 220 m…
      const [gx, gy] = vp.project([c.coordinates[0], c.coordinates[1], 0]);      // …the anchor sits on ground
      // Distance to the pill's RECTANGLE (0 when the tap is on the pill), sized from the label — a wide salary
      // pill must be tappable across its whole width, not just at its centre point.
      let dPill = Infinity;
      if (lab) { const cx = px, cy = py - 12, hw = lab.length * 4.4 + 14, hh = 15;
        dPill = Math.hypot(Math.max(Math.abs(x - cx) - hw, 0), Math.max(Math.abs(y - cy) - hh, 0)); }
      const dDot = Math.hypot(x - gx, y - gy);                                    // the ground pin
      const d = Math.min(dPill, dDot);
      if (d < bd) { bd = d; best = c; }
    }
    return bd <= 14 ? best : null;               // on the pill/pin (or a fingertip past it); else it's the map
  }
  const deck = new D.Deck({
    canvas, initialViewState: VIEW, controller: { dragRotate: true, touchRotate: true }, views: new D.MapView({ repeat: false }),
    // Cap render resolution: a 3× phone otherwise shades ~9× the fragments of the building/road fills every
    // frame — the biggest thermal cost. 1.5 keeps edges crisp (SDF pills stay sharp) at a fraction of the load.
    useDevicePixels: Math.min(globalThis.devicePixelRatio || 1, 1.5),
    getCursor: ({ isDragging }) => (isDragging ? "grabbing" : "grab"),
    // A tap opens a vacancy: use the GPU pick when it works, else the CPU nearest-marker fallback (info.x/y are
    // canvas-local and present even when the pick misses). A drag never reaches here — deck fires onClick on taps.
    onClick: (info) => { const c = (info && info.object && info.object.jobs) ? info.object : pickCluster(info && info.x, info && info.y); if (c && c.jobs) onPick(c); },
    // Rebuild the layer list only when the SET of visible building cells (or the zoom gate) changes — panning
    // within the same cells costs nothing and deck drives the camera itself. The signature is the cell keys.
    onViewStateChange: ({ viewState }) => {
      zoom = viewState.zoom; cLng = viewState.longitude; cLat = viewState.latitude;
      const sig = visCells().join(",");
      if (sig !== cellSig) { cellSig = sig; deck.setProps({ layers: layers() }); }
    },
    layers: [],
  });
  return {
    rebuild(next) { if (next.pal) pal = next.pal; if (next.jobs) jobs = next.jobs; if ("onPick" in next) onPick = next.onPick; deck.setProps({ layers: layers(), style: { background: `rgb(${pal.bg.join(",")})` } }); },
    destroy() { try { deck.finalize(); } catch { /* */ } },
  };
}

function MapStage({ isDark, jobs, onPick }) {
  const ref = useRef(null), ctl = useRef(null);
  useEffect(() => {
    let dead = false;
    (async () => { const c = await makeDeck(ref.current); if (dead) { c && c.destroy(); return; } ctl.current = c; if (c) { $glReady.set(true); c.rebuild({ pal: palette(), jobs: $jobs.get(), onPick }); } })();
    return () => { dead = true; $glReady.set(false); ctl.current && ctl.current.destroy(); ctl.current = null; };
  }, []);
  useEffect(() => { ctl.current && ctl.current.rebuild({ pal: palette(), jobs, onPick }); }, [isDark, jobs]);
  return html`<canvas ref=${ref} data-map class="absolute inset-0 w-full h-full block" aria-hidden="true"></canvas>`;
}

// ── shared bits ──────────────────────────────────────────────────────────────────────────────────────────
const kmFromCentre = (lat, lon) => (!Number.isFinite(lat) || !Number.isFinite(lon)) ? null : Math.round(Math.hypot((lat - KYIV.lat) * 111.32, (lon - KYIV.lon) * 111.32 * Math.cos(KYIV.lat * Math.PI / 180)) * 10) / 10;
const applyLink = (c) => /^https?:\/\//i.test(c) ? c : /^@/.test(c) ? `https://t.me/${c.slice(1)}` : /@/.test(c) ? `mailto:${c}` : null;

function JobRow({ t, j, onOpen }) {
  const km = kmFromCentre(j.lat, j.lon);
  return html`<button data-job-row class="w-full text-left card sf-raised sf-e2 rounded-[var(--ms-r)] active:scale-[.99] transition" onClick=${onOpen}>
    <div class="card-body p-[var(--ms-pad)] gap-1">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0"><div data-job-title class="font-semibold leading-tight truncate">${j.title}</div>
          <div class="text-[0.88rem] text-muted truncate">${j.company}</div></div>
        ${j.salary ? html`<div class="shrink-0 font-mono text-[0.8rem] font-semibold whitespace-nowrap">${j.salary}</div>` : null}
      </div>
      <div class="flex items-center gap-2 text-[0.76rem] text-muted">
        ${j.employment && empKey[j.employment] ? html`<span class="badge badge-sm badge-ghost">${T(t, empKey[j.employment])}</span>` : null}
        ${j.address ? html`<span class="flex items-center gap-1">${Icon("lucide:map-pin", "text-[0.95em]")}${j.address}</span>` : null}
        ${km != null ? html`<span>· ${km} ${T(t, "kmFromCentre")}</span>` : null}
      </div>
    </div>
  </button>`;
}

// A big routed page shell — a full screen with a sticky header and a back button (never a bottom sheet).
function Page({ t, title, onBack, children }) {
  return html`<div data-page class="fixed inset-0 z-40 bg-base-200 overflow-y-auto ms-detail-in">
    <header class="navbar sticky top-0 z-10 bg-base-100 sf-e2 px-2 gap-1 min-h-14" style="padding-top:env(safe-area-inset-top)">
      <button data-back class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "back")} onClick=${onBack}>${Icon("lucide:arrow-left", "text-xl")}</button>
      <div class="flex-1 font-bold tracking-tight truncate px-1">${title}</div>
    </header>
    <div class="px-[var(--ms-pad)] py-[var(--ms-gap)] max-w-2xl mx-auto pb-[calc(var(--dock-h)+env(safe-area-inset-bottom)+1rem)]">${children}</div>
  </div>`;
}

function JobPage({ t, id, onBack }) {
  const j = jobById(id);
  if (!j) return html`<${Page} t=${t} title=${T(t, "job")} onBack=${onBack}><div class="text-muted py-10 text-center">—</div><//>`;
  const km = kmFromCentre(j.lat, j.lon), link = applyLink(j.contact);
  return html`<${Page} t=${t} title=${j.title} onBack=${onBack}>
    <div class="flex flex-col gap-[var(--ms-gap)]">
      <div>
        <div class="text-2xl font-bold leading-tight">${j.title}</div>
        <div class="text-base-content/80 mt-0.5">${j.company}</div>
      </div>
      ${j.salary ? html`<div class="text-xl font-mono font-semibold">${j.salary}</div>` : null}
      <div class="flex flex-wrap gap-1.5">
        ${j.employment && empKey[j.employment] ? html`<span class="badge badge-neutral">${T(t, empKey[j.employment])}</span>` : null}
        ${j.address ? html`<span class="badge badge-ghost gap-1">${Icon("lucide:map-pin")}${j.address}</span>` : null}
        ${km != null ? html`<span class="badge badge-ghost">${km} ${T(t, "kmFromCentre")}</span>` : null}
      </div>
      ${j.description ? html`<p class="text-[0.98rem] leading-relaxed whitespace-pre-line text-base-content/90">${j.description}</p>` : null}
      ${j.poster ? html`<div class="text-[0.82rem] text-muted">${T(t, "postedBy")}: ${j.poster}</div>` : null}
      <div class="pt-2">
        ${link
          ? html`<a data-apply href=${link} target="_blank" rel="noopener noreferrer" class="btn btn-primary rounded-full gap-2 w-full">${Icon("lucide:send")}<span>${T(t, "applyBtn")}</span></a>`
          : html`<div data-apply class="font-mono text-center select-all p-3 rounded-[var(--ms-r-in)] sf-inset">${j.contact}</div>`}
      </div>
    </div>
  <//>`;
}

function Field({ label, children }) {
  return html`<label class="block"><span class="block mb-1 text-[0.82rem] font-medium text-muted">${label}</span>${children}</label>`;
}
function PostPage({ t, loc, onBack }) {
  const sent = useStore($sent), posting = useStore($posting), err = useStore($err), f = useStore($form);
  const input = "input input-bordered w-full bg-base-100";
  const submit = async () => {
    if ($posting.get()) return;
    if (!f.title.trim() || !f.company.trim() || !f.description.trim() || !f.contact.trim()) { $err.set("errFields"); return; }
    const d = DISTRICTS[f.district] || DISTRICTS.shevchenkivskyi;
    const sess = session.get();
    if (!gate && !(sess && sess.sid)) { $err.set("needLogin"); return; }
    $err.set(null); $posting.set(true);
    try {
      if (!gate) { const r = await fetch(`${VPS_PROXY}/jobs/post`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sid: sess.sid, title: f.title, company: f.company, salary: f.salary, employment: f.employment, description: f.description, contact: f.contact, lat: d.lat, lon: d.lon, address: (loc === "en" ? d.en : d.uk) }) }); if (!r.ok) throw new Error("post " + r.status); }
      $sent.set(true); ["title", "company", "salary", "description", "contact"].forEach((k) => $form.setKey(k, ""));
    } catch { $err.set("errFailed"); }
    $posting.set(false);
  };
  return html`<${Page} t=${t} title=${T(t, "postTitle")} onBack=${onBack}>
    ${sent
      ? html`<div data-sent class="flex flex-col items-center gap-3 py-12 text-center">
          <span class="grid place-items-center w-16 h-16 rounded-full bg-[var(--app-accent)]/15 text-[var(--app-accent)]">${Icon("lucide:check", "text-3xl")}</span>
          <div class="text-xl font-semibold">${T(t, "sentTitle")}</div><p class="max-w-sm text-muted">${T(t, "sentBody")}</p>
          <button class="btn btn-primary rounded-full mt-2" onClick=${onBack}>${T(t, "close")}</button></div>`
      : html`<form data-form class="flex flex-col gap-[var(--ms-gap)]" onSubmit=${(e) => { e.preventDefault(); submit(); }}>
          <${Field} label=${T(t, "fldTitle")}><input data-f-title class=${input} value=${f.title} maxlength="120" placeholder=${T(t, "fldTitlePh")} onInput=${(e) => $form.setKey("title", e.currentTarget.value)} /><//>
          <div class="grid grid-cols-2 gap-[var(--ms-gap)]">
            <${Field} label=${T(t, "fldCompany")}><input data-f-company class=${input} value=${f.company} maxlength="100" placeholder=${T(t, "fldCompanyPh")} onInput=${(e) => $form.setKey("company", e.currentTarget.value)} /><//>
            <${Field} label=${T(t, "fldSalary")}><input data-f-salary class=${input} value=${f.salary} maxlength="80" placeholder=${T(t, "fldSalaryPh")} onInput=${(e) => $form.setKey("salary", e.currentTarget.value)} /><//>
          </div>
          <${Field} label=${T(t, "fldDistrict")}>
            <select data-f-district class="select select-bordered w-full bg-base-100" value=${f.district} onChange=${(e) => $form.setKey("district", e.currentTarget.value)}>
              ${Object.entries(DISTRICTS).map(([k, d]) => html`<option value=${k} selected=${f.district === k}>${loc === "en" ? d.en : d.uk}</option>`)}
            </select>
          <//>
          <${Field} label=${T(t, "fldEmployment")}>
            <div class="flex flex-wrap gap-1.5">${EMPLOYMENT.map((e) => html`<button type="button" data-emp=${e} class=${`btn btn-sm rounded-full ${f.employment === e ? "btn-primary" : "btn-ghost border border-base-content/15"}`} onClick=${() => $form.setKey("employment", e)}>${T(t, empKey[e])}</button>`)}</div>
          <//>
          <${Field} label=${T(t, "fldDesc")}><textarea data-f-desc rows="5" class="textarea textarea-bordered w-full bg-base-100 leading-relaxed" value=${f.description} maxlength="2000" placeholder=${T(t, "fldDescPh")} onInput=${(e) => $form.setKey("description", e.currentTarget.value)}></textarea><//>
          <${Field} label=${T(t, "fldContact")}><input data-f-contact class=${input} value=${f.contact} maxlength="200" placeholder=${T(t, "fldContactPh")} onInput=${(e) => $form.setKey("contact", e.currentTarget.value)} /><//>
          ${err ? html`<div data-err class="text-[0.9rem] text-error">${T(t, err)}</div>` : null}
          <button data-submit type="submit" class="btn btn-primary rounded-full mt-1" disabled=${posting}>${posting ? T(t, "submitting") : T(t, "submit")}</button>
        </form>`}
  <//>`;
}

// Routed pages, shared by both tool tabs (only the active tab renders; S.screen is app-global + history-backed).
function Screens({ t, loc, screen, close }) {
  if (screen === "post") return html`<${PostPage} t=${t} loc=${loc} onBack=${close} />`;
  if (screen && screen.startsWith("job:")) return html`<${JobPage} t=${t} id=${screen.slice(4)} onBack=${close} />`;
  return null;
}

// ── MAP tab — the hero background + a single control island ───────────────────────────────────────────────
export function mapView({ t, S, screen, openScreen, closeScreen }) {
  const jobs = useStore($jobs);
  const theme = useStore(S.theme);
  const loc = useStore(S.locale);
  const glReady = useStore($glReady);
  const [showMap] = useState(!isGate);
  const isDark = !/light/i.test(String(theme || ""));
  useEffect(() => { loadJobs(); }, []);

  // The map is the app's HERO: a fixed, EDGE-TO-EDGE field that fills the whole device — under the glass app
  // bar and the floating dock, not boxed inside the padded content column. Everything else floats over it.
  return html`<div data-stage class="fixed inset-0 z-0 overflow-hidden bg-base-200">
    ${showMap ? html`<${MapStage} isDark=${isDark} jobs=${jobs} onPick=${(c) => openScreen(`job:${(c.jobs && c.jobs[0] || {}).id}`)} />` : null}
    ${!showMap || !glReady
      ? html`<div class="absolute inset-0 grid place-items-center px-8 text-center text-muted">
          <div>${Icon("lucide:map", "text-4xl opacity-40")}<p class="mt-3">${T(t, "mapHint")}</p></div>
        </div>` : null}

    <!-- the one island: post a job. Island(pinned) owns the dock clearance (measured --dock-h), so the app
         never hand-writes chrome geometry; className makes the glass tray hug the primary CTA. -->
    <${Island} pinned at="bottom" tone="glass" className="!p-1 rounded-full">
      <button data-post class="btn btn-primary gap-2 rounded-full px-5" onClick=${() => { $sent.set(false); $err.set(null); openScreen("post"); }}>
        ${Icon("lucide:plus", "text-[1.15em]")}<span class="font-medium">${T(t, "postCta")}</span>
      </button>
    <//>

    <${Screens} t=${t} loc=${loc} screen=${screen} close=${closeScreen} />
  </div>`;
}

// ── LIST tab — jobs as a big page of rows ────────────────────────────────────────────────────────────────
export function listView({ t, S, screen, openScreen, closeScreen }) {
  const jobs = useStore($jobs);
  const loading = useStore($loading);
  const loc = useStore(S.locale);
  const [q, setQ] = useState("");
  useEffect(() => { loadJobs(); }, []);
  const ql = q.trim().toLowerCase();
  const shown = ql ? jobs.filter((j) => `${j.title} ${j.company} ${j.address || ""}`.toLowerCase().includes(ql)) : jobs;

  return html`<div class="h-full min-h-0 flex flex-col">
    <div class="px-[var(--ms-pad)] pt-2 pb-1">
      <input data-search type="search" value=${q} placeholder=${T(t, "searchPh")} onInput=${(e) => setQ(e.currentTarget.value)} class="input input-bordered w-full bg-base-100" />
    </div>
    <div class="flex-1 min-h-0 overflow-y-auto px-[var(--ms-pad)] pb-[calc(var(--dock-h)+env(safe-area-inset-bottom)+1rem)]">
      ${loading && !jobs.length
        ? html`<div class="py-10 text-center text-muted">${T(t, "loadingJobs")}</div>`
        : shown.length
          ? html`<div class="flex flex-col gap-[var(--ms-gap)] pt-1">${shown.map((j) => html`<${JobRow} t=${t} j=${j} key=${j.id} onOpen=${() => openScreen(`job:${j.id}`)} />`)}</div>`
          : html`<div class="py-10 text-center text-muted">${ql ? T(t, "noMatch") : T(t, "emptyJobs")}</div>`}
    </div>
    <${Screens} t=${t} loc=${loc} screen=${screen} close=${closeScreen} />
  </div>`;
}
