// jobx — jobs on a 3D map of a city (Kyiv, Kharkiv, Odesa, Dnipro, Lviv). The map is the app's HERO BACKGROUND: a full-screen, theme-coloured 3D
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

// Landmark orientation medallions — a small premium set of AI-illustrated icons per city (a dark-glass coin
// with a glowing gold rim + a stylised gold landmark), so the map reads at a glance ("that's Maidan"). Baked
// here (never fetched at runtime); rendered as a NON-pickable deck layer, gated to the building zoom and
// filtered to the active city (so only 3–8 show at once). Coords are the real landmark points; the icon file
// is assets/lm-<id>.webp. One medallion works on BOTH themes (dark disc reads on the light map, gold rim/glow
// reads on the dark map) — no per-theme variant.
const LANDMARKS = {
  kyiv: [
    { id: "maidan", uk: "Майдан Незалежності", en: "Maidan Nezalezhnosti", lat: 50.45024, lon: 30.52406 },
    { id: "sofia", uk: "Софійський собор", en: "St Sophia Cathedral", lat: 50.45291, lon: 30.51425 },
    { id: "lavra", uk: "Києво-Печерська лавра", en: "Kyiv Pechersk Lavra", lat: 50.435, lon: 30.55445 },
    { id: "zoloti", uk: "Золоті ворота", en: "Golden Gate", lat: 50.44885, lon: 30.51337 },
    { id: "motherland", uk: "Батьківщина-Мати", en: "Motherland Monument", lat: 50.42655, lon: 30.56307 },
    { id: "vdng", uk: "ВДНГ", en: "VDNH", lat: 50.38085, lon: 30.47658 },
    { id: "olymp", uk: "НСК Олімпійський", en: "Olimpiyskiy Stadium", lat: 50.43404, lon: 30.51897 },
    { id: "kontraktova", uk: "Контрактова площа", en: "Kontraktova Square", lat: 50.46271, lon: 30.51839 },
  ],
  lviv: [
    { id: "rynok", uk: "Площа Ринок", en: "Rynok Square", lat: 49.84193, lon: 24.03237 },
    { id: "vysokyi", uk: "Високий замок", en: "High Castle", lat: 49.84817, lon: 24.03924 },
    { id: "potocki", uk: "Палац Потоцьких", en: "Potocki Palace", lat: 49.83795, lon: 24.02693 },
  ],
  odesa: [
    { id: "potemkin", uk: "Потьомкінські сходи", en: "Potemkin Stairs", lat: 46.4885, lon: 30.74188 },
    { id: "derybasivska", uk: "Дерибасівська вулиця", en: "Derybasivska Street", lat: 46.48431, lon: 30.73574 },
    { id: "prymorskyi", uk: "Приморський бульвар", en: "Prymorsky Boulevard", lat: 46.48786, lon: 30.74132 },
  ],
  kharkiv: [
    { id: "derzhprom", uk: "Держпром", en: "Derzhprom", lat: 50.00486, lon: 36.23222 },
    { id: "mirror", uk: "Дзеркальний струмінь", en: "Mirror Stream", lat: 49.99865, lon: 36.23471 },
    { id: "annunciation", uk: "Благовіщенський собор", en: "Annunciation Cathedral", lat: 49.9909, lon: 36.22225 },
  ],
  dnipro: [
    { id: "naberezhna", uk: "Дніпровська набережна", en: "Dnipro Embankment", lat: 48.44506, lon: 35.07754 },
    { id: "menora", uk: "Менора", en: "Menorah Center", lat: 48.46371, lon: 35.05327 },
    { id: "ostriv", uk: "Монастирський острів", en: "Monastyrsky Island", lat: 48.46008, lon: 35.08263 },
  ],
};
const lmUrl = (id) => new URL(`assets/lm-${id}.webp`, import.meta.url).href;
const LM_ZOOM = 12.5;   // landmarks appear with the 3D buildings, never at the cluttered city-wide view
const LM_Z = 120;       // medallions share the pills' ROOFTOP PLANE (metres): above the tallest common building

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
// The whole map, in the theme's gamut — and MEMOISED per theme: palette() runs on every rebuild, six token
// reads through a canvas each time is waste, and a NEW object per call defeated deck's updateTriggers (a
// fresh `pal` = every accessor re-ran on every rebuild). `key` is the identity the layers trigger on.
let _pal = null;
function palette() {
  const base2 = themeRGB("--color-base-200", [10, 10, 12]);
  const ink = themeRGB("--color-base-content", [235, 235, 235]);
  const key = `${document.documentElement.dataset.theme || ""}|${base2.join()}|${ink.join()}`;
  if (_pal && _pal.key === key) return _pal;
  const base1 = themeRGB("--color-base-100", [16, 16, 18]);
  const base3 = themeRGB("--color-base-300", [22, 22, 26]);
  const accent = themeRGB("--app-accent", [242, 184, 75]);
  const accent2 = themeRGB("--app-accent-2", [92, 228, 220]);
  const dark = (ink[0] + ink[1] + ink[2]) / 3 > 140;    // light ink ⇒ dark theme
  const white = [255, 255, 255];
  return (_pal = {
    key, dark, bg: base2, ink, accent,
    // Buildings: a SUBDUED mass a small step off the ground, the tall ones a touch lighter (height = the
    // second colour), lit by the scene light — never outlined, never brighter than a road. The stage.
    building: mix(base2, ink, dark ? 0.09 : 0.15), buildingHi: dark ? mix(base2, ink, 0.26) : mix(base2, ink, 0.05),
    // Colour = meaning: the jobs are the warm pole (accent), the river is the cool one (accent-2).
    water: [...mix(base3, accent2, dark ? 0.35 : 0.45), 210], waterLine: [...mix(base3, accent2, 0.6), 160],
    // Roads: a hierarchy — the skeleton (motorway/primary) bright, the capillaries faint.
    roadMajor: [...mix(base2, ink, dark ? 0.62 : 0.6), 215], roadMid: [...mix(base2, ink, dark ? 0.46 : 0.42), 180], road: [...mix(base2, ink, dark ? 0.34 : 0.28), 140],
    district: [...ink, dark ? 55 : 50], districtText: [...ink, 200],
    stationRing: [...(dark ? base2 : white), 235],
    // salary pills (Airbnb-style): a solid surface pill, accent border, ink text; clusters invert to accent;
    // the selected one warms toward the accent. Leaders tie a pill to its block on the ground.
    pillBg: [...base1, 242], pillBgSel: [...mix(base1, accent, 0.28), 250], pillText: [...ink, 255], pillBorder: [...accent, 255],
    clusterBg: [...accent, 245], clusterText: [...(dark ? base2 : white), 255],
    accentHi: mix(accent, white, 0.35), leader: [...accent, 150], lmLeader: [...ink, 70],
    me: [...accent2, 255],
    // landmark labels: neutral (ink on a base-100 pill, NO accent border) so they read as PLACES, not jobs.
    lmText: [...ink, 255], lmBg: [...base1, 224],
  });
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

// ── THE MAP'S HIERARCHY (owner, 2026-09-11: «3D-будинки другорядні — їх затуляє все; лейбли вище; метро видно»)
// Everything that MEANS something draws OVER the building mass, never inside it:
//   ground (districts · water · roads)  →  buildings (a subdued, lit mass; no outlines; depth-tested)
//   →  metro (glow + core tubes, stations)  →  landmarks  →  job blocks, pulse, LEADER lines, pills
// The informational layers set `depthTest:false` and come last in the list, so a tower can never bury a
// pill, a metro line or a medallion. Pills float on a ROOFTOP PLANE (PILL_Z, above the tallest common
// building) and a thin leader line ties each pill to its block on the ground — the altitude reads as a
// pin, not as a mistake. Markers cluster in SCREEN space per camera — Airbnb's rule: two pills never
// overlap (deck's CollisionFilterExtension hid every label on its first frame, visgl/deck.gl#10333/#10386).
const PILL_H = 34, PILL_GAP = 8;    // a pill's height on screen and the air kept between two pills, px
const BLOCK_H = 40, PILL_Z = 120;   // the accent block's height and the pill's altitude, metres (rooftop plane)
const BLD_ZOOM = 12.5;              // buildings (tiles) + landmarks + stations appear from here; city-wide stays clean
const LABEL_ZOOM = 13.2;            // district names live BELOW this zoom (the city-wide view), then step aside
// A marker's label: a cluster shows its count, a single job its compact salary, an unpriced job nothing (a
// bare block). Its width on screen follows the label, so the overlap test is the real footprint.
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
  return out.map((c) => ({ coordinates: [c.lon, c.lat], count: c.count, jobs: c.jobs, x: c.x, y: c.y }));
}
// A landmark steps aside for a job pill: both live on the rooftop plane, and the job is the product.
const landmarkFree = (lm, clusters, vp) => { const [x, y] = vp.project([lm.lon, lm.lat, LM_Z]); return !clusters.some((c) => Math.abs(c.x - x) < (pillW(labelOf(c)) / 2 + 40) && Math.abs(c.y - y) < 60); };
// A metro station takes the colour of the nearest line vertex (the data ships stations grey and unnamed).
function colourStations(metro) {
  if (!metro || !metro.stations || !metro.lines) return [];
  const pts = [];
  for (const f of metro.lines.features || []) { const c = f.properties && f.properties.color; if (!c) continue; const g = f.geometry; const lines = g.type === "LineString" ? [g.coordinates] : g.coordinates; for (const ln of lines) for (let i = 0; i < ln.length; i += 3) pts.push([ln[i][0], ln[i][1], c]); }
  return metro.stations.map((s) => { let best = null, bd = Infinity; for (const p of pts) { const d = (p[0] - s.coordinates[0]) ** 2 + (p[1] - s.coordinates[1]) ** 2; if (d < bd) { bd = d; best = p[2]; } } return { coordinates: s.coordinates, color: best || [150, 150, 150] }; });
}
// The ground: a theme-derived gradient on the canvas (deck clears transparent), a soft centre light and a
// vignette — the field reads as a lit table, not a flat fill. Night ⇒ a breath of the accent at the centre.
function groundCSS(pal) {
  const c = pal.dark ? mix(pal.bg, pal.accent, 0.07) : mix(pal.bg, [255, 255, 255], 0.35);
  const e = pal.dark ? mix(pal.bg, [0, 0, 0], 0.55) : mix(pal.bg, pal.ink, 0.1);
  return `radial-gradient(120% 90% at 50% 38%, rgb(${c.join(",")}) 0%, rgb(${pal.bg.join(",")}) 55%, rgb(${e.join(",")}) 100%)`;
}

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
  const stations = colourStations(geo.metro);
  const districtLabels = (geo.districts && geo.districts.features || []).filter((f) => f.properties && f.properties.name && f.properties.center).map((f) => ({ name: f.properties.name, coordinates: f.properties.center }));

  let zoom = VIEW.zoom, cLng = VIEW.longitude, cLat = VIEW.latitude, cPitch = VIEW.pitch, cBearing = VIEW.bearing;
  let pal = palette(), jobs = [], onPick = () => {}, curClusters = [], camSig = "", loc = "uk", me = null, selected = null;
  let staticLayers = [], dead = false;
  const landmarks = LANDMARKS[cityId] || [];   // this city's orientation medallions (constant for this deck)
  // The viewport for clustering is BUILT from the controller state, never read back from deck: getViewports()
  // returns the PREVIOUS frame (measured 2026-09-11: zoom 11 while the camera was at 14.2), so a flight
  // clustered the pills for a view that was gone.
  const viewportNow = () => new D.WebMercatorViewport({ width: canvas.clientWidth || 384, height: canvas.clientHeight || 832, longitude: cLng, latitude: cLat, zoom, pitch: cPitch, bearing: cBearing });
  const OVER = { depthTest: false };            // "draws over the buildings" — the informational layers' contract
  const hw = (f) => (f.properties && f.properties.hw) || "";
  const bldColor = (f) => { const h = (f.properties && f.properties.h) || 12; return mix(pal.building, pal.buildingHi, Math.max(0, Math.min(1, (h - 8) / 70))); };

  // The static stack (rebuilt on a camera step / theme / jobs); the pulse ring is the only per-frame layer.
  function layers() {
    const L = [], vp = viewportNow();
    if (geo.districts && zoom < 14) L.push(new D.GeoJsonLayer({ id: "districts", data: geo.districts, filled: false, stroked: true, getLineColor: pal.district, getLineWidth: 2, lineWidthMinPixels: 1, lineWidthMaxPixels: 2, pickable: false }));
    if (geo.water) L.push(new D.GeoJsonLayer({ id: "water", data: geo.water, filled: true, stroked: true, getFillColor: pal.water, getLineColor: pal.waterLine, lineWidthMinPixels: 1, pickable: false }));
    // Roads: a HIERARCHY — motorways and primaries brighter and wider than the capillaries, so the city's
    // skeleton reads at every zoom instead of one grey mesh.
    if (geo.roads) L.push(new D.GeoJsonLayer({
      id: "roads", data: geo.roads, filled: false, stroked: true, pickable: false,
      getLineColor: (f) => { const h = hw(f); return h === "motorway" || h === "trunk" || h === "primary" ? pal.roadMajor : h === "secondary" ? pal.roadMid : pal.road; },
      getLineWidth: (f) => { const h = hw(f); return h === "motorway" || h === "trunk" ? 16 : h === "primary" ? 11 : h === "secondary" ? 7 : 4; },
      lineWidthUnits: "meters", lineWidthMinPixels: 0.6, lineWidthMaxPixels: 6, capRounded: true, jointRounded: true,
      updateTriggers: { getLineColor: [pal.key] },
    }));
    // Buildings — vector tiles, drawn only past the zoom gate, SUBDUED: a lit mass a step off the ground,
    // taller ones a touch lighter, no outlines, no specular — the stage, never the actor.
    if (zoom >= BLD_ZOOM) {
      L.push(new D.MVTLayer({
        id: "buildings", data: `${gbase}/tiles/{z}/{x}/{y}.pbf`, minZoom: 13, maxZoom: 16,
        extruded: true, opacity: 1, getElevation: (f) => (f.properties && f.properties.h) || 12,
        getFillColor: bldColor, material: { ambient: pal.dark ? 0.42 : 0.55, diffuse: 0.65, shininess: 1, specularColor: [0, 0, 0] },
        pickable: false, updateTriggers: { getFillColor: [pal.key] },
      }));
    }
    // Metro — OVER the buildings: a wide soft glow under a bright core, the real line colours; stations as
    // dots in their line's colour once the 3D city is up. Never depth-tested: a tower cannot cover a line.
    if (geo.metro && geo.metro.lines) {
      const lineCol = (a) => (f) => { const c = (f.properties && f.properties.color) || pal.accent; return [c[0], c[1], c[2], a]; };
      L.push(new D.GeoJsonLayer({ id: "metro-glow", data: geo.metro.lines, filled: false, stroked: true, getLineColor: lineCol(pal.dark ? 75 : 85), getLineWidth: 26, lineWidthUnits: "meters", lineWidthMinPixels: 5, lineWidthMaxPixels: 16, capRounded: true, jointRounded: true, pickable: false, parameters: OVER }));
      L.push(new D.GeoJsonLayer({ id: "metro", data: geo.metro.lines, filled: false, stroked: true, getLineColor: lineCol(240), getLineWidth: 6, lineWidthUnits: "meters", lineWidthMinPixels: 1.8, lineWidthMaxPixels: 5, capRounded: true, jointRounded: true, pickable: false, parameters: OVER }));
      if (zoom >= 12 && stations.length) L.push(new D.ScatterplotLayer({ id: "stations", data: stations, getPosition: (d) => d.coordinates, getFillColor: (d) => d.color, getLineColor: pal.stationRing, stroked: true, lineWidthMinPixels: 2, getRadius: 34, radiusUnits: "meters", radiusMinPixels: 4, radiusMaxPixels: 8, pickable: false, parameters: OVER }));
    }
    // District names on the city-wide view — orientation before the 3D city rises; they fade out as you zoom in.
    if (districtLabels.length && zoom < LABEL_ZOOM) {
      L.push(new D.TextLayer({
        id: "district-labels", data: districtLabels, pickable: false, billboard: true, sizeUnits: "pixels",
        getPosition: (d) => d.coordinates, getText: (d) => d.name, getSize: 11, sizeMinPixels: 10, sizeMaxPixels: 13,
        getColor: pal.districtText, fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 600, characterSet: "auto",
        outlineWidth: 3, outlineColor: [...pal.bg, 220], fontSettings: { sdf: true, fontSize: 48 },
        parameters: OVER, updateTriggers: { getColor: [pal.key], outlineColor: [pal.key] },
      }));
    }
    // Job markers: the accent block on the ground (a big tap target), a LEADER line up to the rooftop plane,
    // and the salary/count pill there. All over the buildings. The clusters are also the CPU hit-test source.
    const cl = clusterJobs(jobs, vp);
    curClusters = cl;
    // Landmark medallions (with the 3D city), stepping aside where a pill would sit on them.
    if (zoom >= LM_ZOOM && landmarks.length) {
      const lms = landmarks.filter((lm) => landmarkFree(lm, cl, vp));
      L.push(new D.IconLayer({ id: "landmarks", data: lms, pickable: false, billboard: true, sizeUnits: "pixels", getSize: 46, sizeMinPixels: 30, sizeMaxPixels: 56, getPosition: (d) => [d.lon, d.lat, LM_Z], getIcon: (d) => ({ url: lmUrl(d.id), width: 256, height: 256, anchorY: 128, mask: false }), parameters: OVER }));
      L.push(new D.LineLayer({ id: "landmark-leaders", data: lms, getSourcePosition: (d) => [d.lon, d.lat, 0], getTargetPosition: (d) => [d.lon, d.lat, LM_Z - 20], getColor: pal.lmLeader, getWidth: 1, widthMinPixels: 1, widthMaxPixels: 1.5, pickable: false, parameters: OVER }));
      L.push(new D.TextLayer({
        id: "landmark-labels", data: lms, pickable: false, billboard: true, sizeUnits: "pixels",
        getPosition: (d) => [d.lon, d.lat, LM_Z], getText: (d) => (/uk/i.test(loc) ? d.uk : d.en),
        getSize: 12, sizeMinPixels: 10, sizeMaxPixels: 15, getPixelOffset: [0, 33],
        background: true, backgroundBorderRadius: 8, backgroundPadding: [7, 3, 7, 3], getBackgroundColor: pal.lmBg, getColor: pal.lmText,
        fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 600, characterSet: "auto", parameters: OVER,
        updateTriggers: { getText: [loc], getBackgroundColor: [pal.key], getColor: [pal.key] },
      }));
    }
    if (cl.length) {
      const pilled = cl.filter((d) => labelOf(d));
      const isSel = (d) => selected && d.coordinates[0] === selected[0] && d.coordinates[1] === selected[1];
      L.push(new D.ColumnLayer({ id: "highlight", data: cl, diskResolution: 4, radius: 15, angle: 45, extruded: true, elevationScale: 1, getPosition: (d) => d.coordinates, getElevation: BLOCK_H, getFillColor: (d) => (isSel(d) ? pal.accentHi : pal.accent), opacity: 0.95, material: { ambient: 0.7, diffuse: 0.4, shininess: 1, specularColor: [0, 0, 0] }, pickable: true, autoHighlight: true, highlightColor: [...pal.accentHi, 255], parameters: OVER, updateTriggers: { getFillColor: [selected, pal.key] } }));
      L.push(new D.LineLayer({ id: "leaders", data: cl, getSourcePosition: (d) => [d.coordinates[0], d.coordinates[1], BLOCK_H], getTargetPosition: (d) => [d.coordinates[0], d.coordinates[1], PILL_Z - 14], getColor: pal.leader, getWidth: 1.5, widthUnits: "pixels", widthMinPixels: 1, widthMaxPixels: 2, pickable: false, parameters: OVER }));
      L.push(new D.TextLayer({
        id: "pills", data: pilled, pickable: true, billboard: true, sizeUnits: "pixels",
        getPosition: (d) => [d.coordinates[0], d.coordinates[1], PILL_Z],
        getText: labelOf, getSize: (d) => (d.count > 1 ? 16 : 14), sizeMinPixels: 12, sizeMaxPixels: 22,
        background: true, backgroundBorderRadius: 11, backgroundPadding: [10, 6, 10, 6],
        getBackgroundColor: (d) => (d.count > 1 ? pal.clusterBg : (isSel(d) ? pal.pillBgSel : pal.pillBg)),
        getBorderColor: pal.pillBorder, getBorderWidth: 1.2,
        getColor: (d) => (d.count > 1 ? pal.clusterText : pal.pillText),
        fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 700, characterSet: "auto", parameters: OVER,
        updateTriggers: { getBackgroundColor: [pal.key, selected], getColor: [pal.key], getBorderColor: [pal.key], getText: [jobs] },
      }));
    }
    if (me) L.push(new D.ScatterplotLayer({ id: "me", data: [me], getPosition: (d) => d, getFillColor: pal.me, getLineColor: [255, 255, 255, 230], stroked: true, lineWidthMinPixels: 2, getRadius: 12, radiusUnits: "pixels", pickable: false, parameters: OVER }));
    return L;
  }
  // The pulse: a breathing ring under every marker (the only layer that changes per frame — the static
  // stack keeps its instances, so deck re-uploads nothing else). ~20 fps, and only while the tab is visible.
  const pulseLayer = (t) => new D.ScatterplotLayer({
    id: "pulse", data: curClusters, getPosition: (d) => d.coordinates, stroked: true, filled: false,
    getLineColor: [...pal.accent, Math.round(120 * (1 - t))], getRadius: 14 + 26 * t, radiusUnits: "pixels", lineWidthMinPixels: 1.5, lineWidthMaxPixels: 2,
    pickable: false, parameters: OVER, updateTriggers: { getRadius: [t], getLineColor: [t] },
  });
  const commit = () => { staticLayers = layers(); deck.setProps({ layers: [...staticLayers, pulseLayer(pulseT)] }); };
  // 12 fps: a redraw is the whole scene (the tiles too), so the ring breathes slowly rather than burning a
  // phone; off while hidden, off past 80 markers, and off (`still`) for a software-GL eye that cannot keep up.
  let pulseT = 0, pulseTimer = null, still = false;
  const pulse = () => { if (dead) return; if (!still && !document.hidden && curClusters.length && curClusters.length <= 80) { pulseT = (pulseT + 0.045) % 1; deck.setProps({ layers: [...staticLayers, pulseLayer(pulseT)] }); } pulseTimer = setTimeout(pulse, 80); };

  // Resolve a tap to a marker WITHOUT the GPU picker (unreliable across the devices this ships to): project
  // every marker with the viewport and take the nearest within a finger's radius — the pill on the rooftop
  // plane, the leader between, or the block on the ground all count.
  function pickCluster(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !curClusters.length) return null;
    const vp = viewportNow();
    let best = null, bd = Infinity;
    for (const c of curClusters) {
      const lab = labelOf(c);
      const [px, py] = vp.project([c.coordinates[0], c.coordinates[1], PILL_Z]);
      const [gx, gy] = vp.project([c.coordinates[0], c.coordinates[1], 0]);
      let dPill = Infinity;
      if (lab) { const hw2 = pillW(lab) / 2, hh = PILL_H / 2; dPill = Math.hypot(Math.max(Math.abs(x - px) - hw2, 0), Math.max(Math.abs(y - py) - hh, 0)); }
      // the leader: distance from the tap to the segment ground→pill
      const vx = px - gx, vy = py - gy, len2 = vx * vx + vy * vy || 1; const tt = Math.max(0, Math.min(1, ((x - gx) * vx + (y - gy) * vy) / len2));
      const dLead = Math.hypot(x - (gx + vx * tt), y - (gy + vy * tt));
      const d = Math.min(dPill, Math.hypot(x - gx, y - gy), dLead + 4);
      if (d < bd) { bd = d; best = c; }
    }
    return bd <= 18 ? best : null;
  }
  // The camera moves like a film camera: every programmatic move is a FLY (FlyToInterpolator), never a cut.
  const flyTo = (lon, lat, z, ms = 900) => { deck.setProps({ initialViewState: { longitude: lon, latitude: lat, zoom: z, pitch: cPitch, bearing: cBearing, minZoom: VIEW.minZoom, maxZoom: VIEW.maxZoom, transitionDuration: ms, transitionInterpolator: new D.FlyToInterpolator({ speed: 1.4 }) } }); };
  const deck = new D.Deck({
    canvas, initialViewState: VIEW, controller: { dragRotate: true, touchRotate: true, inertia: 300 }, views: new D.MapView({ repeat: false }),
    useDevicePixels: Math.min(globalThis.devicePixelRatio || 1, 1.5),
    effects: [new D.LightingEffect({ ambient: new D.AmbientLight({ color: [255, 255, 255], intensity: pal.dark ? 0.9 : 1.0 }), sun: new D.DirectionalLight({ color: [255, 250, 240], intensity: pal.dark ? 1.4 : 1.3, direction: [-0.6, -1, -2.2] }) })],
    getCursor: ({ isDragging, isHovering }) => (isDragging ? "grabbing" : isHovering ? "pointer" : "grab"),
    onClick: (info) => { const c = (info && info.object && info.object.jobs) ? info.object : pickCluster(info && info.x, info && info.y); if (c && c.jobs) onPick(c, { zoom, flyTo }); else onPick(null); },
    onViewStateChange: ({ viewState }) => {
      zoom = viewState.zoom; cLng = viewState.longitude; cLat = viewState.latitude; cPitch = viewState.pitch; cBearing = viewState.bearing;
      // a step of zoom / tilt / turn, or a pan of ~a screen — re-cluster and re-gate the layers
      const sig = `${Math.round(zoom * 4)}|${Math.round(cPitch / 10)}|${Math.round(cBearing / 20)}|${Math.round(cLng * 40)}|${Math.round(cLat * 60)}`;
      if (sig !== camSig) { camSig = sig; commit(); }
    },
    layers: [],
  });
  pulse();
  const ctl = {
    rebuild(next) {
      if (next.pal) pal = next.pal; if (next.jobs) jobs = next.jobs; if ("onPick" in next) onPick = next.onPick; if ("loc" in next) loc = next.loc;
      if ("me" in next) me = next.me; if ("selected" in next) selected = next.selected;
      deck.setProps({ style: { background: groundCSS(pal) }, effects: [new D.LightingEffect({ ambient: new D.AmbientLight({ color: [255, 255, 255], intensity: pal.dark ? 0.9 : 1.0 }), sun: new D.DirectionalLight({ color: [255, 250, 240], intensity: pal.dark ? 1.4 : 1.3, direction: [-0.6, -1, -2.2] }) })] });
      commit();
    },
    flyTo,
    zoom: () => zoom,
    still(v) { still = !!v; },
    destroy() { dead = true; clearTimeout(pulseTimer); try { deck.finalize(); } catch { /* */ } },
  };
  if (DEV_HOST) globalThis.__jobx = ctl;   // the eye: fly the camera from the console on a dev host
  return ctl;
}

function MapStage({ isDark, city, jobs, onPick, loc, me, selected, ctlRef }) {
  const ref = useRef(null), ctl = useRef(null);
  // A city switch REBUILDS the deck (new camera, new geometry + tile source); theme/jobs/locale just re-layer.
  useEffect(() => {
    let dead = false;
    (async () => { const c = await makeDeck(ref.current, city); if (dead) { c && c.destroy(); return; } ctl.current = c; if (ctlRef) ctlRef.current = c; if (c) { $glReady.set(true); c.rebuild({ pal: palette(), jobs, onPick, loc, me, selected }); } })();
    return () => { dead = true; $glReady.set(false); ctl.current && ctl.current.destroy(); ctl.current = null; if (ctlRef) ctlRef.current = null; };
  }, [city]);
  useEffect(() => { ctl.current && ctl.current.rebuild({ pal: palette(), jobs, onPick, loc, me, selected }); }, [isDark, jobs, loc, me, selected]);
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
// A tap on a marker opens a PREVIEW in the bottom island (the job's title, company, pay — one more tap opens
// the page); a cluster tapped from afar flies the camera in AND lists its jobs, so no vacancy is ever lost
// behind a count. «Де я» flies to the viewer's own position (a cool dot, accent-2) when it is in this city.
const $preview = atom(null);   // { coordinates, jobs } | null
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
  const cityJobs = jobs.filter((j) => inCity(j, city));   // only this city's vacancies on this city's map
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

  // The map is the app's HERO: a fixed, EDGE-TO-EDGE field that fills the whole device — under the glass app
  // bar and the floating dock, not boxed inside the padded content column. Everything else floats over it.
  // The routed pages are SIBLINGS of the stage, never children: `z-0` makes the stage a stacking context, and
  // a page inside it sits under the z-30 app bar no matter what z-index it declares — the bar's wordmark
  // printed through the page's own header (measured 2026-09-10).
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
