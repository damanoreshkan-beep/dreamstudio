// Space launches adapter (Launch Library 2 by The Space Devs). CORS * → direct, no backend; the
// 15 req/hour limit is PER IP, so each user has their own budget (a shared proxy would be worse here).
//
// ONE page is worth a lot here. The globe plots every pad we hold and the calendar draws a month of them,
// and neither can ask for more (a tool tab has no `load`), so a 15-item first page left both screens
// looking at a fortnight. At limit=40 one request reaches 2026-12-31 — three months, eleven countries and
// thirty-one pads from a single call against a budget of fifteen an hour (measured 2026-09-21).
import { fetchJson } from "/_rt/feed.js";
import { dayKey } from "/_rt/calendar.js";
import { gate } from "/_rt/gate.js";

// How far a launch date is to be BELIEVED. Launch Library answers "sometime in Q4" by returning the last
// day of the quarter at 00:00Z, and it is not a rare case: of the next 40 launches, 15 came back as a
// quarter and 12 as a month, thirteen of them piled on 31 December (measured 2026-09-21). Printed as a
// timestamp every one of those reads as a confirmed minute — so the precision rides along with the date,
// the card label stops where the date stops being true (/_rt/i18n.js whenLabel), and the calendar marks
// only the days someone actually promised.
const BELIEVE = (abbrev) => {
  const a = String(abbrev || "").toUpperCase();
  if (/^Q[1-4]$/.test(a)) return "quarter";
  if (a === "Y" || a === "YEAR") return "year";
  if (a === "M" || a === "MO" || a === "MONTH") return "month";
  if (a === "DAY" || a === "D" || a === "WK" || a === "WEEK") return "day";
  return "";   // SEC / MIN / HR — a real T-0
};

const SOON_MS = 7 * 86400000;

// One LL2 record → one item. The gate fixture below goes through this same function on purpose: a mock
// that bypasses the mapping proves the screens draw and nothing about whether the mapping is right.
function toItem(r, now) {
  const precision = BELIEVE(r.net_precision?.abbrev);
  const fuzzy = precision === "month" || precision === "quarter" || precision === "year";
  const t = Date.parse(r.net);
  const pad = r.pad || {}, place = pad.location || {};
  // Strings in the API ("19.597275"); the globe wants numbers, and a pad with no fix is simply not
  // plottable — never a (0,0) pin in the Gulf of Guinea.
  const lat = Number(pad.latitude), lon = Number(pad.longitude);
  const fixed = Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0);
  const abbrev = String(r.status?.abbrev || "");
  return {
    id: r.id,
    title: r.name,
    provider: r.launch_service_provider?.name || "",
    net: r.net,
    precision,
    // The LOCAL day this launch falls on — "" when nobody has promised a day. A launch at 23:30Z is
    // tomorrow in Kyiv, so the key comes from calendar.js rather than the ISO text's first ten chars.
    day: !fuzzy && !isNaN(t) ? dayKey(t) : "",
    thumb: r.image || "",
    rocket: r.rocket?.configuration?.full_name || r.rocket?.configuration?.name || "",
    pad: pad.name || "",
    place: place.name || "",
    country: place.country_code || "",
    lat: fixed ? lat : null,
    lon: fixed ? lon : null,
    orbit: r.mission?.orbit?.abbrev && r.mission.orbit.abbrev !== "N/A" ? r.mission.orbit.abbrev : "",
    mission: r.mission?.description || "",
    url: r.vidURLs?.[0]?.url || "",
    map: pad.wiki_url || "",
    // The three buckets the feed groups by — mutually exclusive, because a section renders every item
    // whose test() passes and an item in two sections is an item printed twice.
    go: abbrev === "Go",
    hold: abbrev === "Hold",
    tbc: abbrev === "TBC" || abbrev === "TBD",
    soon: !fuzzy && !isNaN(t) && t - now < SOON_MS,
    later: !fuzzy && (isNaN(t) || t - now >= SOON_MS),
    fuzzy,
  };
}

// ---- the gate fixture -------------------------------------------------------------------------------
// This app's screens are the one kind the live API cannot gate: 15 requests an hour per IP means a CI run
// can legitimately arrive throttled, and the old spec answered that by accepting an error state — which
// makes every populated assertion optional, and a map and a calendar that are never drawn are a map and a
// calendar nobody is checking. So under the gate the app seeds five real pads and six launches, shaped
// exactly like LL2 answers and carrying all four precisions, and the screens are then deterministic.
//
// The dates are RELATIVE to today: a fixture pinned to fixed timestamps stops being "this month" the
// moment the month turns, and a calendar fixture that drifts out of the month it is meant to fill is a
// test that quietly stops testing.
const px = "data:image/gif;base64,R0lGODlhAQABAIAAAKuqqgAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";
const site = (id, name, pad, lat, lon, cc) => ({ id, name: pad, latitude: String(lat), longitude: String(lon), location: { name, country_code: cc } });
const endOfMonth = (ahead) => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + ahead + 1, 0)).toISOString(); };
const endOfQuarter = (ahead) => { const d = new Date(); const q = Math.floor(d.getUTCMonth() / 3) + ahead; return new Date(Date.UTC(d.getUTCFullYear(), q * 3 + 3, 0)).toISOString(); };
function fixture(now) {
  const H = 3600000, D = 86400000;
  const rows = [
    ["Falcon 9 Block 5 | Starlink Group 12-4", "SpaceX", "Falcon 9 Block 5", now + 2 * H, "MIN", "Go", "LEO",
      site(1, "Cape Canaveral SFS, FL, USA", "Space Launch Complex 40", 28.5619, -80.5772, "USA")],
    ["Electron | Owl For One", "Rocket Lab", "Electron", now + 3 * D + 5 * H, "HR", "TBC", "SSO",
      site(2, "Mahia Peninsula, New Zealand", "Rocket Lab Launch Complex 1A", -39.2616, 177.8649, "NZL")],
    ["Soyuz 2.1a | Progress MS-34", "Roscosmos", "Soyuz 2.1a", now + 3 * D + 9 * H, "DAY", "Go", "LEO",
      site(3, "Baikonur Cosmodrome, Kazakhstan", "31/6", 45.996, 63.564, "KAZ")],
    ["Long March 8A | Unknown Payload", "CASC", "Long March 8A", now + 12 * D, "HR", "TBD", "LEO",
      site(4, "Wenchang Space Launch Site, China", "Commercial LC-1", 19.5973, 110.9308, "CHN")],
    ["Ariane 62 | Metop-SG B1", "Arianespace", "Ariane 62", Date.parse(endOfMonth(0)), "M", "TBD", "PO",
      site(5, "Guiana Space Centre, French Guiana", "Ariane Launch Area 4", 5.2394, -52.7686, "GUF")],
    ["Starship | Flight 15", "SpaceX", "Starship", Date.parse(endOfQuarter(1)), "Q4", "TBD", "Sub",
      site(1, "Cape Canaveral SFS, FL, USA", "Space Launch Complex 40", 28.5619, -80.5772, "USA")],
  ];
  return rows.map(([name, agency, rocket, t, prec, status, orbit, pad], i) => ({
    id: `gate-${i}`,
    name,
    net: new Date(t).toISOString(),
    net_precision: { abbrev: prec },
    status: { abbrev: status },
    launch_service_provider: { name: agency },
    rocket: { configuration: { full_name: rocket } },
    mission: { description: "Fixture mission — the gate's own payload.", orbit: { abbrev: orbit } },
    pad,
    image: px,
  }));
}

export async function load(filters = {}) {
  const now = Date.now();
  if (gate) return { items: fixture(now).map((r) => toItem(r, now)), meta: {}, next: null };
  // Infinite scroll: LL2 returns a `next` URL (offset-paged); use it verbatim as the cursor.
  const url = filters.cursor || "https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=40&hide_recent_previous=true";
  const data = await fetchJson(url);
  if (!Array.isArray(data.results)) throw new Error("unavailable"); // e.g. 429 throttle → error state, not empty
  return { items: data.results.map((r) => toItem(r, now)), meta: {}, next: data.next || null };
}
