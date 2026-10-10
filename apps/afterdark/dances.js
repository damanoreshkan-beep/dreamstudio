export const MOVES = [
  { id: "108850901", name: "Robot v1",        tier: "drive",  star: true },
  { id: "108860901", name: "Robot v2",        tier: "drive",  star: true },
  { id: "125680901", name: "Melbourne Shuffle", tier: "drive", star: true },
  { id: "108880901", name: "Tut v1",          tier: "drive",  star: true },
  { id: "108890901", name: "Tut v2",          tier: "drive",  star: true },
  { id: "108780901", name: "Quake",           tier: "drive",  star: true },
  { id: "108780902", name: "Running Man",     tier: "drive",  star: true },
  { id: "101960906", name: "Running Man F",   tier: "drive",  star: true },
  { id: "128660902", name: "Running Man D",   tier: "drive",  star: true },
  { id: "121410901", name: "Northern Spin",   tier: "drive" },
  { id: "121420901", name: "Spin Dip",        tier: "drive" },
  { id: "121430901", name: "Floor Combo",     tier: "drive" },
  { id: "121440901", name: "Floor Spin",      tier: "drive" },
  { id: "109560901", name: "House v3",        tier: "groove", star: true },
  { id: "108710901", name: "House v2",        tier: "groove", star: true },
  { id: "108720901", name: "House v4",        tier: "groove", star: true },
  { id: "109070901", name: "Snake",           tier: "groove", star: true },
  { id: "108660901", name: "Side To Side",    tier: "groove" },
  { id: "108910902", name: "Waving Arms",     tier: "groove" },
  { id: "101960907", name: "Slide Step",      tier: "groove" },
  { id: "108810902", name: "Bboy Move v1",    tier: "groove" },
  { id: "108810903", name: "Bboy Move v2",    tier: "groove" },
  { id: "108910901", name: "Wave v2",         tier: "groove" },
  { id: "108900901", name: "Wave v1",         tier: "groove" },
  { id: "101960903", name: "Kick Step",       tier: "groove" },
  { id: "108830901", name: "Locking v2",      tier: "groove" },
  { id: "109010901", name: "Step",            tier: "groove" },
  { id: "121400901", name: "Northern Step",   tier: "groove" },
  { id: "109060901", name: "Really Twirl",    tier: "groove" },
  { id: "109000901", name: "Booty Step",      tier: "groove" },
  { id: "101810901", name: "African Noodle",  tier: "groove" },
  { id: "101810902", name: "African Rainbow", tier: "groove" },
  { id: "108650901", name: "Just Listening",  tier: "light",  star: true },
  { id: "101960902", name: "Body Wave",       tier: "light" },
  { id: "125670901", name: "Twist",           tier: "light" },
  { id: "128660901", name: "Maraschino",      tier: "light" },
];

export const MOVE_IDS = MOVES.map((m) => m.id);
export const DEFAULT_MOVES = MOVES.filter((m) => m.star).map((m) => m.id);
export const moveById = (id) => MOVES.find((m) => m.id === id) || null;
export const LIB_URL = "/geo/mx";   // same origin — the farm serves /geo on every host it lives on
const BUNDLED = new Set(MOVE_IDS);
export const isMoveId = (id) => /^\d{6,}$/.test(String(id));
export const moveUrl = (id) => (BUNDLED.has(id) ? new URL(`assets/move-${id}.glb`, import.meta.url).href : (isMoveId(id) ? `${LIB_URL}/move/${id}.glb` : null));
let catalog = null, catalogP = null;
const libTier = new Map();
export function loadCatalog() {
  if (!catalogP) catalogP = fetch(new URL("moves.json", import.meta.url)).then((r) => r.json()).then((list) => {
    catalog = list.filter((m) => !BUNDLED.has(m.id));
    for (const m of catalog) libTier.set(m.id, m.tier);
    return catalog;
  }).catch(() => { catalogP = null; return []; });
  return catalogP;
}
export const getCatalog = () => catalog;
export const libTierOf = (id) => libTier.get(id) || "groove";

export function tiersFor(ids) {
  const on = ids.map((id) => moveById(id) || { id, tier: libTierOf(id) });
  const pick = (t) => on.filter((m) => m.tier === t).map((m) => m.id);
  const all = on.map((m) => m.id);
  const light = pick("light"), groove = pick("groove"), drive = pick("drive");
  return { calm: ["idle"], light: light.length ? light : all, groove: groove.length ? groove : all, drive: drive.length ? drive : all };
}
