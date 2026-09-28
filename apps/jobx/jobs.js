import { atom } from "nanostores";
import { map as nmap } from "nanostores";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";

export const EMPLOYMENT = ["full", "part", "remote", "contract", "internship"];
export const empKey = { full: "empFull", part: "empPart", remote: "empRemote", contract: "empContract", internship: "empInternship" };

export const CITIES = {
  kyiv:    { uk: "Київ",   en: "Kyiv",    lat: 50.4501, lon: 30.5234, s: 50.213, w: 30.236, n: 50.591, e: 30.827 },
  kharkiv: { uk: "Харків", en: "Kharkiv", lat: 49.9935, lon: 36.2304, s: 49.90,  w: 36.10,  n: 50.08,  e: 36.40 },
  odesa:   { uk: "Одеса",  en: "Odesa",   lat: 46.4825, lon: 30.7233, s: 46.36,  w: 30.60,  n: 46.60,  e: 30.82 },
  dnipro:  { uk: "Дніпро", en: "Dnipro",  lat: 48.4647, lon: 35.0462, s: 48.38,  w: 34.90,  n: 48.55,  e: 35.15 },
  lviv:    { uk: "Львів",  en: "Lviv",    lat: 49.8397, lon: 24.0297, s: 49.78,  w: 23.92,  n: 49.89,  e: 24.12 },
};
export const CITY_IDS = Object.keys(CITIES);
export const cityName = (id, loc) => { const c = CITIES[id] || CITIES.kyiv; return /uk/i.test(loc || "uk") ? c.uk : c.en; };
export const inCity = (j, id) => { const c = CITIES[id]; return !!c && Number.isFinite(j.lat) && Number.isFinite(j.lon) && j.lat >= c.s && j.lat <= c.n && j.lon >= c.w && j.lon <= c.e; };
export const viewFor = (id) => { const c = CITIES[id] || CITIES.kyiv; return { longitude: c.lon, latitude: c.lat, zoom: 11.0, pitch: 55, bearing: -18, minZoom: 10, maxZoom: 18 }; };
const KYIV = CITIES.kyiv;
const readCity = () => { try { const c = localStorage.getItem("jobx.city"); return c && CITIES[c] ? c : "kyiv"; } catch { return "kyiv"; } };
export const $city = atom(readCity());
$city.listen((c) => { try { localStorage.setItem("jobx.city", c); } catch { } });

export const DISTRICTS = {
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

export const DEV_HOST = typeof location !== "undefined" && /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/.test(location.hostname);
const NOW = Date.now(), H = 3600_000;
const MOCK_JOBS = [
  { id: "1", title: "Frontend-розробник", company: "Dreamware", lat: 50.4470, lon: 30.5060, address: "Київ, вулиця Богдана Хмельницького, 32", salary: "60 000–90 000 ₴", employment: "remote", description: "Preact, невеликі PWA, чистий код.\n\nГнучкий графік, дружня команда, віддалена робота.", contact: "@dreamware_jobs", poster: "Octocat", ms: NOW - 2 * H },
  { id: "2", title: "Бариста", company: "Кава Гармонія", lat: 50.4655, lon: 30.5175, address: "Київ, Контрактова площа, 4", salary: "22 000 ₴", employment: "part", description: "Ранкові зміни, навчаємо з нуля, чай і кава безкоштовно.", contact: "hr@harmony.ua", poster: "Ірина", ms: NOW - 5 * H },
  { id: "3", title: "Менеджер із продажу", company: "Кратос", lat: 50.4302, lon: 30.5350, address: "Київ, вулиця Лесі Українки, 26", salary: "37 500–90 000 ₴", employment: "full", description: "Повна зайнятість, вища освіта, CRM. Провідний постачальник комплектуючих.", contact: "https://t.me/kratos_hr", poster: "Кратос", ms: NOW - 30 * H },
  { id: "4", title: "Кухар-універсал (ст. м. Оболонь)", company: "KFC", lat: 50.5085, lon: 30.4990, address: "Київ, проспект Оболонський, 21б", salary: "27 000 ₴", employment: "full", description: "Готові взяти студента, людину з інвалідністю, пенсіонера. Навчання коштом компанії.", contact: "@kfc_jobs", poster: "KFC", ms: NOW - 3 * 24 * H },
  { id: "5", title: "Інженер-електронік", company: "Sempal", lat: 50.4537, lon: 30.5610, address: "Київ, вулиця Митрополита Андрея Шептицького, 4", salary: "60 000–100 000 ₴", employment: "full", description: "Досвід від 2 років, C++, Assembler. Провідний український виробник.", contact: "hr@sempal.com", poster: "Sempal", ms: NOW - 20 * H },
  { id: "6", title: "Майстер встановлення автомагнітол на ОС Android, автоелектрик", company: "Automod", lat: 50.4085, lon: 30.5230, address: "Київ, проспект Науки, 7", salary: "60 000 – 100 000 грн · % від виконаних робіт", employment: "", description: "Новий інсталяційний центр, запис на два тижні вперед. Досвід монтажу додаткового обладнання, знання автоелектрики.", contact: "https://www.work.ua/jobs/7980039/", poster: "work.ua", ms: NOW - 6 * 24 * H },
  { id: "7", title: "Бухгалтер у юридичну компанію", company: "Grain Law Firm", lat: 50.4830, lon: 30.4755, address: "Київ, вулиця Кирилівська, 104", salary: "За результатами співбесіди", employment: "", description: "Ведення бухгалтерського та податкового обліку, звітність, контроль руху коштів. Досвід від 3 років.", contact: "https://www.work.ua/jobs/8047563/", poster: "work.ua", ms: NOW - 12 * 24 * H },
  { id: "8", title: "Помічник категорійного менеджера", company: "Гривня Цент", lat: 50.4700, lon: 30.4620, address: "Київ, вулиця Юрія Іллєнка, 81а", salary: "", employment: "", description: "Замовлення постачальникам, контроль поставок, звірки з контрагентами, моніторинг цін.", contact: "https://www.work.ua/jobs/8507581/", poster: "work.ua", ms: NOW - 9 * H },
  { id: "9", title: "Менеджер по роботі з клієнтами", company: "Nova", lat: 50.4430, lon: 30.4760, address: "Київ, вулиця Індустріальна, 27", salary: "45 000 грн", employment: "remote", description: "Вхідні звернення, CRM, супровід угод. Віддалено, гнучкий графік.", contact: "hr@nova.ua", poster: "Nova", ms: NOW - 2 * 24 * H },
  { id: "10", title: "Юрист", company: "Кратос", lat: 50.4302, lon: 30.5350, address: "Київ, вулиця Лесі Українки, 26", salary: "50 000 – 60 000 грн ·Після всіх відрахувань", employment: "full", description: "Договірна робота, супровід закупівель.", contact: "https://t.me/kratos_hr", poster: "Кратос", ms: NOW - 40 * 24 * H },
];

export const $jobs = atom(gate ? MOCK_JOBS : []);
export const $loading = atom(!gate);
export const $glReady = atom(false);
export const $sent = atom(false);
export const $posting = atom(false);
export const $err = atom(null);
export const $form = nmap({ title: "", company: "", district: "shevchenkivskyi", salary: "", employment: "full", description: "", contact: "" });

export async function loadJobs() {
  if (gate) { $jobs.set(MOCK_JOBS); $loading.set(false); return; }
  try {
    const r = await fetch(`${VPS_PROXY}/jobs/list`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const j = await r.json();
    let list = Array.isArray(j && j.jobs) ? j.jobs : [];
    if (!list.length && DEV_HOST) list = MOCK_JOBS;
    $jobs.set(list);
  } catch { if (DEV_HOST) $jobs.set(MOCK_JOBS); } finally { $loading.set(false); }
}
export const jobById = (id) => $jobs.get().find((j) => String(j.id) === String(id)) || null;

export function shortSalary(s) {
  if (!s) return null;
  const nums = String(s).replace(/\s/g, "").match(/\d{3,}/g);
  if (!nums || !nums.length) return null;
  const cur = /\$/.test(s) ? "$" : /€/.test(s) ? "€" : "₴";
  const k = (n) => { n = +n; return n >= 1000 ? Math.round(n / 100) / 10 + "k" : "" + n; };
  return nums.length >= 2 ? `${k(nums[0])}–${k(nums[1])} ${cur}` : `${k(nums[0])} ${cur}`;
}

const cityOfPt = (lat, lon) => CITY_IDS.find((id) => inCity({ lat, lon }, id));
export const kmFromCentre = (lat, lon) => { if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null; const c = CITIES[cityOfPt(lat, lon) || "kyiv"]; return Math.round(Math.hypot((lat - c.lat) * 111.32, (lon - c.lon) * 111.32 * Math.cos(c.lat * Math.PI / 180)) * 10) / 10; };
export const applyLink = (c) => /^https?:\/\//i.test(c) ? c : /^@/.test(c) ? `https://t.me/${c.slice(1)}` : /@/.test(c) ? `mailto:${c}` : null;
const CITY_NAMES = CITY_IDS.flatMap((id) => [CITIES[id].uk, CITIES[id].en]);
export const streetOf = (a) => { let s = String(a || ""); for (const nm of CITY_NAMES) s = s.replace(new RegExp(`^\\s*${nm}\\s*,\\s*`, "i"), ""); return s; };
export const salaryNote = (s) => { const i = String(s || "").indexOf("·"); return i < 0 ? "" : String(s).slice(i + 1).trim(); };
const PLACE_RE = /(?:^|[^\p{L}])(?:м\.|ст\.|ТРЦ|ТЦ|вул|р-н|метро|просп|бул|пл\.)/iu;
export const rowTitle = (s) => {
  const m = /^(.*\S)\s*\(([^()]*)\)\s*$/.exec(String(s || ""));
  if (!m) return s;
  const inner = m[2].toLowerCase();
  return PLACE_RE.test(m[2]) || CITY_NAMES.some((n) => inner.includes(n.toLowerCase())) ? m[1] : s;
};
const DAY = 86400_000;
export const isNew = (j) => Number.isFinite(j.ms) && Date.now() - j.ms < DAY;
