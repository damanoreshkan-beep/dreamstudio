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
import { Fragment } from "preact";
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

const GEO = "https://dreamstudio.mooo.com/geo";      // per-city static geometry: `${GEO}/${city}/…` (nginx, gzip)
const DECK_URL = "https://esm.sh/deck.gl@9.4.0";      // dynamic-imported only behind a WebGL2 probe

// The cities jobx covers. Each has a centre (the map's initial camera), a bbox (which jobs belong to it, and
// the edge's post-validation), and a work.ua slug (the vacancy sync). Buildings + base geometry live at
// `${GEO}/${id}/…` on the VPS. Kyiv is the default. The same registry shape lives in edge/jobs.js.
const CITIES = {
  kyiv:    { uk: "Київ",   en: "Kyiv",    lat: 50.4501, lon: 30.5234, s: 50.213, w: 30.236, n: 50.591, e: 30.827 },
  kharkiv: { uk: "Харків", en: "Kharkiv", lat: 49.9935, lon: 36.2304, s: 49.90,  w: 36.10,  n: 50.08,  e: 36.40 },
  odesa:   { uk: "Одеса",  en: "Odesa",   lat: 46.4825, lon: 30.7233, s: 46.36,  w: 30.60,  n: 46.60,  e: 30.82 },
  dnipro:  { uk: "Дніпро", en: "Dnipro",  lat: 48.4647, lon: 35.0462, s: 48.38,  w: 34.90,  n: 48.55,  e: 35.15 },
  lviv:    { uk: "Львів",  en: "Lviv",    lat: 49.8397, lon: 24.0297, s: 49.78,  w: 23.92,  n: 49.89,  e: 24.12 },
};
const CITY_IDS = Object.keys(CITIES);
const cityName = (id, loc) => { const c = CITIES[id] || CITIES.kyiv; return /uk/i.test(loc || "uk") ? c.uk : c.en; };
const inCity = (j, id) => { const c = CITIES[id]; return !!c && Number.isFinite(j.lat) && Number.isFinite(j.lon) && j.lat >= c.s && j.lat <= c.n && j.lon >= c.w && j.lon <= c.e; };
const viewFor = (id) => { const c = CITIES[id] || CITIES.kyiv; return { longitude: c.lon, latitude: c.lat, zoom: 11.0, pitch: 55, bearing: -18, minZoom: 10, maxZoom: 18 }; };
const KYIV = CITIES.kyiv;   // legacy alias (kmFromCentre default)
// The chosen city persists per viewer (localStorage), defaulting to Kyiv; the store drives map, list and posting.
const readCity = () => { try { const c = localStorage.getItem("jobx.city"); return c && CITIES[c] ? c : "kyiv"; } catch { return "kyiv"; } };
const $city = atom(readCity());
$city.listen((c) => { try { localStorage.setItem("jobx.city", c); } catch { /* private mode */ } });

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
// The fixture mirrors PRODUCTION's shape, not a tidy ideal: exact street addresses ("Київ, вулиця …"), a
// salary with words after the number, a text-only salary, an unpriced job, an empty employment, work.ua rows
// whose contact is the listing link, and two jobs at one point (a cluster). Every row shape the live feed
// has produced is here, so the eye on `?mock` sees what the phone sees (2026-09-10: the tidy fixture hid
// a raw salary string blowing the list row apart).
const NOW = Date.now();
const MOCK_JOBS = [
  { id: "1", title: "Frontend-розробник", company: "Dreamware", lat: 50.4470, lon: 30.5060, address: "Київ, вулиця Богдана Хмельницького, 32", salary: "60 000–90 000 ₴", employment: "remote", description: "Preact, невеликі PWA, чистий код.\n\nГнучкий графік, дружня команда, віддалена робота.", contact: "@dreamware_jobs", poster: "Octocat", ms: NOW },
  { id: "2", title: "Бариста", company: "Кава Гармонія", lat: 50.4655, lon: 30.5175, address: "Київ, Контрактова площа, 4", salary: "22 000 ₴", employment: "part", description: "Ранкові зміни, навчаємо з нуля, чай і кава безкоштовно.", contact: "hr@harmony.ua", poster: "Ірина", ms: NOW },
  { id: "3", title: "Менеджер із продажу", company: "Кратос", lat: 50.4302, lon: 30.5350, address: "Київ, вулиця Лесі Українки, 26", salary: "37 500–90 000 ₴", employment: "full", description: "Повна зайнятість, вища освіта, CRM. Провідний постачальник комплектуючих.", contact: "https://t.me/kratos_hr", poster: "Кратос", ms: NOW },
  { id: "4", title: "Кухар", company: "KFC", lat: 50.5085, lon: 30.4990, address: "Київ, проспект Оболонський, 21б", salary: "27 000 ₴", employment: "full", description: "Готові взяти студента, людину з інвалідністю, пенсіонера. Навчання коштом компанії.", contact: "@kfc_jobs", poster: "KFC", ms: NOW },
  { id: "5", title: "Інженер-електронік", company: "Sempal", lat: 50.4537, lon: 30.5610, address: "Київ, вулиця Митрополита Андрея Шептицького, 4", salary: "60 000–100 000 ₴", employment: "full", description: "Досвід від 2 років, C++, Assembler. Провідний український виробник.", contact: "hr@sempal.com", poster: "Sempal", ms: NOW },
  { id: "6", title: "Майстер встановлення автомагнітол на ОС Android, автоелектрик", company: "Automod", lat: 50.4085, lon: 30.5230, address: "Київ, проспект Науки, 7", salary: "60 000 – 100 000 грн · % від виконаних робіт", employment: "", description: "Новий інсталяційний центр, запис на два тижні вперед. Досвід монтажу додаткового обладнання, знання автоелектрики.", contact: "https://www.work.ua/jobs/7980039/", poster: "work.ua", ms: NOW },
  { id: "7", title: "Бухгалтер у юридичну компанію", company: "Grain Law Firm", lat: 50.4830, lon: 30.4755, address: "Київ, вулиця Кирилівська, 104", salary: "За результатами співбесіди", employment: "", description: "Ведення бухгалтерського та податкового обліку, звітність, контроль руху коштів. Досвід від 3 років.", contact: "https://www.work.ua/jobs/8047563/", poster: "work.ua", ms: NOW },
  { id: "8", title: "Помічник категорійного менеджера", company: "Гривня Цент", lat: 50.4700, lon: 30.4620, address: "Київ, вулиця Юрія Іллєнка, 81а", salary: "", employment: "", description: "Замовлення постачальникам, контроль поставок, звірки з контрагентами, моніторинг цін.", contact: "https://www.work.ua/jobs/8507581/", poster: "work.ua", ms: NOW },
  { id: "9", title: "Менеджер по роботі з клієнтами", company: "Nova", lat: 50.4430, lon: 30.4760, address: "Київ, вулиця Індустріальна, 27", salary: "45 000 грн", employment: "remote", description: "Вхідні звернення, CRM, супровід угод. Віддалено, гнучкий графік.", contact: "hr@nova.ua", poster: "Nova", ms: NOW },
  { id: "10", title: "Юрист", company: "Кратос", lat: 50.4302, lon: 30.5350, address: "Київ, вулиця Лесі Українки, 26", salary: "50 000 ₴", employment: "full", description: "Договірна робота, супровід закупівель.", contact: "https://t.me/kratos_hr", poster: "Кратос", ms: NOW },
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
  const accent = themeRGB("--app-accent", [242, 184, 75]);
  const accent2 = themeRGB("--app-accent-2", [92, 228, 220]);
  const dark = (ink[0] + ink[1] + ink[2]) / 3 > 140;    // light ink ⇒ dark theme
  return {
    dark, bg: base2, accent,
    building: mix(base2, ink, dark ? 0.16 : 0.26),
    buildingLine: [...mix(base3, ink, 0.5), dark ? 110 : 90],
    // Colour = meaning: the jobs are the warm pole (accent), the Dnipro is the cool one (accent-2). With both
    // on the amber accent the river read as sand and the pills had nothing to stand out against.
    water: [...mix(base3, accent2, dark ? 0.35 : 0.45), 210],
    waterLine: [...mix(base3, accent2, 0.6), 160],
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

// Markers cluster in SCREEN space, per camera — Airbnb's rule: two pills never overlap. Jobs whose pills would
// collide at the current zoom merge into one count pill, and the merge dissolves as the zoom makes room.
// Greedy over projected pixels (each pill's real footprint, PILL_H tall) against the live viewport; ≤1000 jobs cost
// well under a millisecond, and the layer list is rebuilt when the zoom or the tilt moves a step. deck.gl's
// own CollisionFilterExtension was tried first (2026-09-10) and hid EVERY label: on the first frame the
// collision map is stale (visgl/deck.gl#10333, open) and by glyph content (#10386, open).
const PILL_H = 34, PILL_GAP = 8;    // a pill's height on screen and the air kept between two pills, px
const BLOCK_H = 40, PILL_Z = 54;    // the accent building-block's height and the pill's altitude, metres — pill hugs the block top
// A marker's label: a cluster shows its count, a single job its compact salary, an unpriced job nothing (a
// bare pin). Its width on screen follows the label — a count pill is a third of a salary pill, and a pin is a
// dot — so the overlap test is the real footprint, not one worst-case box (that merged jobs 5 km apart).
const labelOf = (c) => (c.count > 1 ? String(c.count) : (shortSalary(c.jobs[0] && c.jobs[0].salary) || ""));
const pillW = (lab) => (lab ? lab.length * 7.6 + 20 : 12);
function clusterJobs(jobs, vp) {
  const out = [];
  for (const j of jobs) {
    if (!Number.isFinite(j.lat) || !Number.isFinite(j.lon)) continue;
    const [x, y] = vp.project([j.lon, j.lat, PILL_Z]);
    const wj = pillW(shortSalary(j.salary) || "");
    let hit = null;
    for (const c of out) if (Math.abs(c.x - x) < (wj + pillW(labelOf(c))) / 2 + PILL_GAP && Math.abs(c.y - y) < PILL_H) { hit = c; break; }
    if (!hit) { out.push({ x, y, lon: j.lon, lat: j.lat, count: 1, jobs: [j] }); continue; }
    hit.jobs.push(j); hit.count++;
    const k = 1 / hit.count;                                   // running mean: the pill sits among its jobs
    hit.x += (x - hit.x) * k; hit.y += (y - hit.y) * k; hit.lon += (j.lon - hit.lon) * k; hit.lat += (j.lat - hit.lat) * k;
  }
  return out.map((c) => ({ coordinates: [c.lon, c.lat], count: c.count, jobs: c.jobs }));
}
// Buildings come as VECTOR TILES (deck.gl MVTLayer): deck loads, decodes (in a worker) and draws ONLY the
// {z}/{x}/{y} tiles in the current viewport+zoom — native frustum culling + LOD, the thing a monolithic
// GeoJsonLayer can't do (it has none, so the old 33 MB / 155k-feature file drew every vertex every frame and
// melted weak GPUs). Shown only past BLD_ZOOM: a city-wide view fetches no building tiles at all, so it stays
// smooth, and the 3D city rises as you zoom in (the Google/Apple-maps idiom). Tiles: vps → /kyiv/tiles/.
const BLD_ZOOM = 12.5;

// ── the 3D map (probe-guarded, lazy, theme-derived) ──────────────────────────────────────────────────────
async function makeDeck(canvas, cityId) {
  if (isGate) return null;
  try { if (!canvas.getContext("webgl2")) return null; } catch { return null; }
  let D; try { D = await import(DECK_URL); } catch { return null; }
  if (!D || !D.Deck) return null;

  const VIEW = viewFor(cityId);                 // camera centred on this city
  const gbase = `${GEO}/${cityId}`;             // this city's geometry root on the VPS
  const geo = {};
  const grab = async (n) => { try { geo[n] = await (await fetch(`${gbase}/${n}.json`)).json(); } catch { geo[n] = null; } };
  // Base layers: every city has water + roads; only Kyiv carries district outlines + a metro network, so the
  // others don't fetch them (a 404 on a missing layer would be console noise). Buildings stream as tiles.
  const baseLayers = cityId === "kyiv" ? ["water", "roads", "districts", "metro"] : ["water", "roads"];
  await Promise.all(baseLayers.map(grab));

  let zoom = VIEW.zoom, cLng = VIEW.longitude, cLat = VIEW.latitude, cPitch = VIEW.pitch, cBearing = VIEW.bearing;
  let pal = palette(), jobs = [], onPick = () => {}, curClusters = [], camSig = "", curVp = null;
  // The camera the clusters are computed against: deck's own viewport once it has rendered a frame, else one
  // built from the current view over the canvas's real size (the first build happens before the first frame).
  const viewportNow = () => curVp || new D.WebMercatorViewport({ width: canvas.clientWidth || 384, height: canvas.clientHeight || 832, longitude: cLng, latitude: cLat, zoom, pitch: cPitch, bearing: cBearing });

  function layers() {
    const L = [];
    if (geo.districts) L.push(new D.GeoJsonLayer({ id: "districts", data: geo.districts, filled: false, stroked: true, getLineColor: pal.district, getLineWidth: 2, lineWidthMinPixels: 1, lineWidthMaxPixels: 3, pickable: false }));
    if (geo.water) L.push(new D.GeoJsonLayer({ id: "water", data: geo.water, filled: true, stroked: true, getFillColor: pal.water, getLineColor: pal.waterLine, lineWidthMinPixels: 1, pickable: false }));
    if (geo.roads) L.push(new D.GeoJsonLayer({ id: "roads", data: geo.roads, filled: false, stroked: true, getLineColor: pal.road, getLineWidth: (f) => { const h = f.properties && f.properties.hw; return h === "motorway" || h === "trunk" ? 12 : h === "primary" ? 9 : h === "secondary" ? 6 : 3; }, lineWidthUnits: "meters", lineWidthMinPixels: 0.5, lineWidthMaxPixels: 4, pickable: false }));
    if (geo.metro && geo.metro.lines) L.push(new D.GeoJsonLayer({ id: "metro", data: geo.metro.lines, filled: false, stroked: true, getLineColor: (f) => { const c = (f.properties && f.properties.color) || pal.accent; return [c[0], c[1], c[2], 200]; }, getLineWidth: 4, lineWidthUnits: "meters", lineWidthMinPixels: 2, lineWidthMaxPixels: 5, pickable: false }));
    // Buildings — vector tiles, drawn only past the zoom gate. deck fetches just the visible {z}/{x}/{y} tiles,
    // decodes them off-thread and reuses their buffers, so there is no monolith download and no re-tessellation
    // stall. `material` without specular (the costly per-fragment term) still shades the faces for the 3D read.
    if (zoom >= BLD_ZOOM) {
      L.push(new D.MVTLayer({
        id: "buildings", data: `${gbase}/tiles/{z}/{x}/{y}.pbf`, minZoom: 13, maxZoom: 16,
        extruded: true, opacity: pal.dark ? 0.92 : 0.97, getElevation: (f) => (f.properties && f.properties.h) || 12,
        getFillColor: pal.building, material: { ambient: pal.dark ? 0.5 : 0.62, diffuse: 0.55, shininess: 1, specularColor: [0, 0, 0] },
        pickable: false, updateTriggers: { getFillColor: [pal] },
      }));
    }
    // Job markers — a job's spot is marked by HIGHLIGHTING its building: a squat accent-coloured block glows on
    // the point (prettier than the old stem, and a big tap target), with the salary/count pill hugging its top.
    // All colour is theme-derived (pal.*). Block or pill pick → open the job (single) or the cluster's top job.
    const cl = clusterJobs(jobs, viewportNow());
    curClusters = cl;                              // CPU hit-test source (see the Deck onClick below)
    if (cl.length) {
      // A cluster shows its count; a single job its salary. A job with NO salary has no label → no pill, just
      // the glowing block; a tap on it still opens via the CPU hit-test (ground point) or the block's GPU pick.
      const label = labelOf;
      const pilled = cl.filter((d) => label(d));
      L.push(new D.ColumnLayer({ id: "highlight", data: cl, diskResolution: 4, radius: 15, angle: 45, extruded: true, elevationScale: 1, getPosition: (d) => d.coordinates, getElevation: BLOCK_H, getFillColor: pal.accent, opacity: 0.9, material: { ambient: 0.7, diffuse: 0.4, shininess: 1, specularColor: [0, 0, 0] }, pickable: true }));
      // The pill hugs the block's top by ALTITUDE (never a pixel offset), so its screen position is exactly what
      // clusterJobs projected and the CPU hit-test measures against.
      L.push(new D.TextLayer({
        id: "pills", data: pilled, pickable: true, billboard: true, sizeUnits: "pixels",
        getPosition: (d) => [d.coordinates[0], d.coordinates[1], PILL_Z],
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
      const lab = labelOf(c);
      const [px, py] = vp.project([c.coordinates[0], c.coordinates[1], PILL_Z]);   // pill floats above the beam…
      const [gx, gy] = vp.project([c.coordinates[0], c.coordinates[1], 0]);        // …the anchor sits on ground
      // Distance to the pill's RECTANGLE (0 when the tap is on the pill), sized from the label — a wide salary
      // pill must be tappable across its whole width, not just at its centre point.
      let dPill = Infinity;
      if (lab) { const cx = px, cy = py, hw = pillW(lab) / 2, hh = PILL_H / 2;
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
    // Rebuild the layer list only when the camera moves a step that changes which pills collide (a quarter
    // zoom, a tilt or a turn) or crosses the building zoom-gate — panning costs nothing and deck drives the
    // camera (and its own tile loading) itself. The signature is the camera steps; a quarter-zoom step also
    // catches the BLD_ZOOM crossing that adds/removes the buildings tile layer.
    onViewStateChange: ({ viewState }) => {
      zoom = viewState.zoom; cLng = viewState.longitude; cLat = viewState.latitude; cPitch = viewState.pitch; cBearing = viewState.bearing;
      curVp = deck.getViewports()[0] || null;
      const sig = `${Math.round(zoom * 4)}|${Math.round(cPitch / 10)}|${Math.round(cBearing / 20)}`;
      if (sig !== camSig) { camSig = sig; deck.setProps({ layers: layers() }); }
    },
    layers: [],
  });
  return {
    rebuild(next) { if (next.pal) pal = next.pal; if (next.jobs) jobs = next.jobs; if ("onPick" in next) onPick = next.onPick; deck.setProps({ layers: layers(), style: { background: `rgb(${pal.bg.join(",")})` } }); },
    destroy() { try { deck.finalize(); } catch { /* */ } },
  };
}

function MapStage({ isDark, city, jobs, onPick }) {
  const ref = useRef(null), ctl = useRef(null);
  // A city switch REBUILDS the deck (new camera, new geometry + tile source); theme/jobs just re-layer.
  useEffect(() => {
    let dead = false;
    (async () => { const c = await makeDeck(ref.current, city); if (dead) { c && c.destroy(); return; } ctl.current = c; if (c) { $glReady.set(true); c.rebuild({ pal: palette(), jobs, onPick }); } })();
    return () => { dead = true; $glReady.set(false); ctl.current && ctl.current.destroy(); ctl.current = null; };
  }, [city]);
  useEffect(() => { ctl.current && ctl.current.rebuild({ pal: palette(), jobs, onPick }); }, [isDark, jobs]);
  return html`<canvas ref=${ref} data-map class="absolute inset-0 w-full h-full block" aria-hidden="true"></canvas>`;
}

// ── shared bits ──────────────────────────────────────────────────────────────────────────────────────────
// Distance from the job's OWN city centre (the one whose bbox holds it), so "km from centre" is honest in
// every city, not measured from Kyiv.
const cityOfPt = (lat, lon) => CITY_IDS.find((id) => inCity({ lat, lon }, id));
const kmFromCentre = (lat, lon) => { if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null; const c = CITIES[cityOfPt(lat, lon) || "kyiv"]; return Math.round(Math.hypot((lat - c.lat) * 111.32, (lon - c.lon) * 111.32 * Math.cos(c.lat * Math.PI / 180)) * 10) / 10; };
const applyLink = (c) => /^https?:\/\//i.test(c) ? c : /^@/.test(c) ? `https://t.me/${c.slice(1)}` : /@/.test(c) ? `mailto:${c}` : null;
// The feed carries a city prefix ("Львів, вулиця …") that is noise in a row — the street is the information.
// Strip any known city name; the detail page keeps the full address.
const CITY_NAMES = CITY_IDS.flatMap((id) => [CITIES[id].uk, CITIES[id].en]);
const streetOf = (a) => { let s = String(a || ""); for (const nm of CITY_NAMES) s = s.replace(new RegExp(`^\\s*${nm}\\s*,\\s*`, "i"), ""); return s; };
// Does a salary string say more than its number ("… % від виконаних робіт")? Then the words are shown too.
const salaryHasWords = (s) => /[A-Za-zА-Яа-яІіЇїЄєҐґ]{4,}/.test(String(s || ""));

// A row is scannable in one glance or it is not a row: the title may take two lines (a Ukrainian job title
// is long, and a truncated one loses the role), the company one; the pay is the COMPACT form on the right
// ("60k–100k ₴") and only when there is a number — a sentence like "За результатами співбесіди" belongs to
// the detail, in a row it ate the title (measured on the live feed, 2026-09-10). The meta line never wraps:
// the street truncates, the distance is a fixed mono chip.
function JobRow({ t, j, onOpen }) {
  const km = kmFromCentre(j.lat, j.lon), pay = shortSalary(j.salary), street = streetOf(j.address);
  return html`<button data-job-row class="w-full text-left card sf-raised sf-e2 rounded-[var(--ms-r)] active:scale-[.99] transition" onClick=${onOpen}>
    <div class="card-body p-[var(--ms-pad)] gap-1.5">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1"><div data-job-title class="font-semibold leading-tight line-clamp-2">${j.title}</div>
          <div class="text-[0.88rem] text-muted truncate">${j.company}</div></div>
        ${pay ? html`<div class="shrink-0 font-mono text-[0.8rem] font-semibold whitespace-nowrap tabular-nums pt-0.5">${pay}</div>` : null}
      </div>
      <div class="flex items-center gap-2 text-[0.76rem] text-muted min-w-0">
        ${j.employment && empKey[j.employment] ? html`<span class="badge badge-sm badge-ghost shrink-0">${T(t, empKey[j.employment])}</span>` : null}
        ${street ? html`<span class="flex items-center gap-1 min-w-0">${Icon("lucide:map-pin", "text-[0.95em] shrink-0")}<span class="truncate">${street}</span></span>` : null}
        ${km != null ? html`<span class="ml-auto shrink-0 whitespace-nowrap font-mono tabular-nums">${km} ${T(t, "km")}</span>` : null}
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
  const km = kmFromCentre(j.lat, j.lon), link = applyLink(j.contact), pay = shortSalary(j.salary);
  // The bar names the KIND of page; the title is the h1 below it — the same word twice, 40 px apart, was the
  // one thing the eye saw first on this page.
  return html`<${Page} t=${t} title=${T(t, "job")} onBack=${onBack}>
    <div class="flex flex-col gap-[var(--ms-gap)]">
      <div>
        <h1 class="text-2xl font-bold leading-tight break-words">${j.title}</h1>
        <div class="text-base-content/80 mt-0.5">${j.company}</div>
      </div>
      ${pay
        ? html`<div><div class="text-xl font-mono font-semibold tabular-nums">${pay}</div>${salaryHasWords(j.salary) ? html`<div class="text-[0.85rem] text-muted">${j.salary}</div>` : null}</div>`
        : j.salary ? html`<div class="text-base-content/80">${j.salary}</div>` : null}
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
  const city = useStore($city);
  const input = "input input-bordered w-full bg-base-100";
  const submit = async () => {
    if ($posting.get()) return;
    if (!f.title.trim() || !f.company.trim() || !f.description.trim() || !f.contact.trim()) { $err.set("errFields"); return; }
    // Place the job: in Kyiv the chosen district's centre; in the other cities the city centre (no districts).
    let lat, lon, address;
    if (city === "kyiv") { const d = DISTRICTS[f.district] || DISTRICTS.shevchenkivskyi; lat = d.lat; lon = d.lon; address = (loc === "en" ? d.en : d.uk); }
    else { const c = CITIES[city]; lat = c.lat; lon = c.lon; address = cityName(city, loc); }
    const sess = session.get();
    if (!gate && !(sess && sess.sid)) { $err.set("needLogin"); return; }
    $err.set(null); $posting.set(true);
    try {
      if (!gate) { const r = await fetch(`${VPS_PROXY}/jobs/post`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sid: sess.sid, title: f.title, company: f.company, salary: f.salary, employment: f.employment, description: f.description, contact: f.contact, city, lat, lon, address }) }); if (!r.ok) throw new Error("post " + r.status); }
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
          ${city === "kyiv"
            ? html`<${Field} label=${T(t, "fldDistrict")}>
                <select data-f-district class="select select-bordered w-full bg-base-100" value=${f.district} onChange=${(e) => $form.setKey("district", e.currentTarget.value)}>
                  ${Object.entries(DISTRICTS).map(([k, d]) => html`<option value=${k} selected=${f.district === k}>${loc === "en" ? d.en : d.uk}</option>`)}
                </select>
              <//>`
            : html`<${Field} label=${T(t, "fldCity")}>
                <div class="input input-bordered w-full bg-base-100 flex items-center gap-2 opacity-80">${Icon("lucide:map-pin", "text-primary")}${cityName(city, loc)}</div>
              <//>`}
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

// The city picker as a BIG routed page (never a modal): a list of cities; tapping one switches the map, the
// list and where a new job is posted, and persists.
function CityPage({ t, loc, onBack }) {
  const city = useStore($city);
  const jobs = useStore($jobs);
  const pick = (id) => { $city.set(id); onBack(); };
  return html`<${Page} t=${t} title=${T(t, "cityTitle")} onBack=${onBack}>
    <div class="flex flex-col gap-[var(--ms-gap)]">
      ${CITY_IDS.map((id) => { const n = jobs.filter((j) => inCity(j, id)).length; return html`<button key=${id} data-city-opt=${id} onClick=${() => pick(id)}
        class=${`w-full text-left card sf-raised rounded-[var(--ms-r)] active:scale-[.99] transition ${id === city ? "ring-2 ring-primary" : ""}`}>
        <div class="card-body p-[var(--ms-pad)] flex-row items-center gap-3">
          ${Icon("lucide:building-2", "text-xl text-primary")}
          <div class="flex-1 font-semibold">${cityName(id, loc)}</div>
          ${n ? html`<span class="badge badge-ghost badge-sm font-mono">${n}</span>` : null}
          ${id === city ? Icon("lucide:check", "text-primary text-xl") : null}
        </div>
      </button>`; })}
    </div>
  <//>`;
}

// Routed pages, shared by both tool tabs (only the active tab renders; S.screen is app-global + history-backed).
function Screens({ t, loc, screen, close }) {
  if (screen === "post") return html`<${PostPage} t=${t} loc=${loc} onBack=${close} />`;
  if (screen === "city") return html`<${CityPage} t=${t} loc=${loc} onBack=${close} />`;
  if (screen && screen.startsWith("job:")) return html`<${JobPage} t=${t} id=${screen.slice(4)} onBack=${close} />`;
  return null;
}

// ── MAP tab — the hero background + a single control island ───────────────────────────────────────────────
export function mapView({ t, S, screen, openScreen, closeScreen }) {
  const jobs = useStore($jobs);
  const city = useStore($city);
  const theme = useStore(S.theme);
  const loc = useStore(S.locale);
  const glReady = useStore($glReady);
  const [showMap] = useState(!isGate);
  const isDark = !/light/i.test(String(theme || ""));
  useEffect(() => { loadJobs(); }, []);
  const cityJobs = jobs.filter((j) => inCity(j, city));   // only this city's vacancies on this city's map

  // The map is the app's HERO: a fixed, EDGE-TO-EDGE field that fills the whole device — under the glass app
  // bar and the floating dock, not boxed inside the padded content column. Everything else floats over it.
  // The routed pages are SIBLINGS of the stage, never children: `z-0` makes the stage a stacking context, and
  // a page inside it sits under the z-30 app bar no matter what z-index it declares — the bar's wordmark
  // printed through the page's own header (measured 2026-09-10).
  return html`<${Fragment}>
    <div data-stage class="fixed inset-0 z-0 overflow-hidden bg-base-200">
      ${showMap ? html`<${MapStage} isDark=${isDark} city=${city} jobs=${cityJobs} onPick=${(c) => openScreen(`job:${(c.jobs && c.jobs[0] || {}).id}`)} />` : null}
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

      <!-- the one island: post a job. Island(pinned) owns the dock clearance (measured --dock-h), so the app
           never hand-writes chrome geometry; className makes the glass tray hug the primary CTA. -->
      <${Island} pinned at="bottom" tone="glass" className="!p-1 rounded-full">
        <button data-post class="btn btn-primary gap-2 rounded-full px-5" onClick=${() => { $sent.set(false); $err.set(null); openScreen("post"); }}>
          ${Icon("lucide:plus", "text-[1.15em]")}<span class="font-medium">${T(t, "postCta")}</span>
        </button>
      <//>
    </div>
    <${Screens} t=${t} loc=${loc} screen=${screen} close=${closeScreen} />
  <//>`;
}

// ── LIST tab — jobs as a big page of rows ────────────────────────────────────────────────────────────────
export function listView({ t, S, screen, openScreen, closeScreen }) {
  const jobs = useStore($jobs);
  const city = useStore($city);
  const loading = useStore($loading);
  const loc = useStore(S.locale);
  const [q, setQ] = useState("");
  useEffect(() => { loadJobs(); }, []);
  const cityJobs = jobs.filter((j) => inCity(j, city));   // list shows only the chosen city's vacancies
  const ql = q.trim().toLowerCase();
  const shown = ql ? cityJobs.filter((j) => `${j.title} ${j.company} ${j.address || ""}`.toLowerCase().includes(ql)) : cityJobs;

  return html`<div class="h-full min-h-0 flex flex-col">
    <div class="px-[var(--ms-pad)] pt-2 pb-1 flex items-center gap-2">
      <button data-city class="btn btn-ghost btn-sm gap-1.5 rounded-full shrink-0 px-3" onClick=${() => openScreen("city")}>
        ${Icon("lucide:map-pin", "text-[1.05em] text-primary")}<span class="font-semibold">${cityName(city, loc)}</span>${Icon("lucide:chevron-down", "text-[0.85em] opacity-60")}
      </button>
      <input data-search type="search" value=${q} placeholder=${T(t, "searchPh")} onInput=${(e) => setQ(e.currentTarget.value)} class="input input-bordered flex-1 min-w-0 bg-base-100" />
    </div>
    <div class="flex-1 min-h-0 overflow-y-auto px-[var(--ms-pad)] pb-[calc(var(--dock-h)+env(safe-area-inset-bottom)+1rem)]">
      ${loading && !cityJobs.length
        ? html`<div class="py-10 text-center text-muted">${T(t, "loadingJobs")}</div>`
        : shown.length
          ? html`<div class="flex flex-col gap-[var(--ms-gap)] pt-1">${shown.map((j) => html`<${JobRow} t=${t} j=${j} key=${j.id} onOpen=${() => openScreen(`job:${j.id}`)} />`)}</div>`
          : html`<div class="py-10 text-center text-muted">${ql ? T(t, "noMatch") : T(t, "emptyJobs")}</div>`}
    </div>
    <${Screens} t=${t} loc=${loc} screen=${screen} close=${closeScreen} />
  </div>`;
}
