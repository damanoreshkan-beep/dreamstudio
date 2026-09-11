// afterdark — the dancer roster. Each is a REAL rigged 3D character (Mixamo, royalty-free) exported with a
// distinct dance clip and shipped as a Draco-compressed .glb beside the view (assets/<id>.glb, ~0.15–0.7 MB).
// The stage shows a TRIO — the focused girl centre-front, her two list-neighbours flanking — so every pick
// changes who leads while three keep dancing, each to her own clip. `name` is a proper noun (untranslated);
// `danceKey` is the i18n label for her move; `tint` is her signature colour for the picker chip.
export const GIRLS = [
  { id: "kaya",       name: "Kaya",       danceKey: "dNorthern", tint: "#FF3EB5" },
  { id: "michelle",   name: "Michelle",   danceKey: "dHouse",    tint: "#39FF6A" },
  { id: "arissa",     name: "Arissa",     danceKey: "dSnake",    tint: "#F5B942" },
  { id: "eve",        name: "Eve",        danceKey: "dShuffle",  tint: "#7C5CFF" },
  { id: "sophie",     name: "Sophie",     danceKey: "dRobot",    tint: "#22D3EE" },
  { id: "nightshade", name: "Nightshade", danceKey: "dTwist",    tint: "#FF6AD5" },
  { id: "louise",     name: "Louise",     danceKey: "dWave",     tint: "#4ADE80" },
  { id: "kachujin",   name: "Kachujin",   danceKey: "dSalsa",    tint: "#FB7185" },
  { id: "jolleen",    name: "Jolleen",    danceKey: "dBboy",     tint: "#FBBF24" },
  { id: "pirate",     name: "Pirate",     danceKey: "dHiphop",   tint: "#38BDF8" },
  { id: "akai",       name: "Akai",       danceKey: "dArms",     tint: "#F472B6" },
];

export const girlIndex = (id) => { const i = GIRLS.findIndex((g) => g.id === id); return i < 0 ? 0 : i; };
export const girlById = (id) => GIRLS[girlIndex(id)];
export const glbUrl = (id) => new URL(`assets/${id}.glb`, import.meta.url).href;

// The trio for a focused girl: her two list-neighbours (wrapping) flank her, she leads centre.
// Returns [leftId, centreId, rightId] — the contract dancers.js's three slots consume.
export function trioFor(id) {
  const n = GIRLS.length, i = girlIndex(id);
  return [GIRLS[(i - 1 + n) % n].id, GIRLS[i].id, GIRLS[(i + 1) % n].id];
}
