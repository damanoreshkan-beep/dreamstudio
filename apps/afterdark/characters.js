// afterdark — the dancer roster. Each is a REAL rigged 3D character (Mixamo, royalty-free) exported with a
// distinct dance clip and shipped as a Draco-compressed .glb beside the view (assets/<id>.glb, ~0.15–0.7 MB).
// The stage shows a TRIO — the focused character centre-front, her two list-neighbours flanking — so every pick
// changes who leads while three keep dancing, each to her own clip. `name` is a proper noun (untranslated);
// `tint` is her signature colour for the picker chip.
export const CHARACTERS = [
  { id: "kaya",       name: "Kaya",       tint: "#FF3EB5" },
  { id: "michelle",   name: "Michelle",   tint: "#39FF6A" },
  { id: "arissa",     name: "Arissa",     tint: "#F5B942" },
  { id: "eve",        name: "Eve",        tint: "#7C5CFF" },
  { id: "sophie",     name: "Sophie",     tint: "#22D3EE" },
  { id: "nightshade", name: "Nightshade", tint: "#FF6AD5" },
  { id: "louise",     name: "Louise",     tint: "#4ADE80" },
  { id: "kachujin",   name: "Kachujin",   tint: "#FB7185" },
  { id: "jolleen",    name: "Jolleen",    tint: "#FBBF24" },
  { id: "pirate",     name: "Pirate",     tint: "#38BDF8" },
  { id: "akai",       name: "Akai",       tint: "#F472B6" },
];

export const charIndex = (id) => { const i = CHARACTERS.findIndex((g) => g.id === id); return i < 0 ? 0 : i; };
export const charById = (id) => CHARACTERS[charIndex(id)];
export const glbUrl = (id) => new URL(`assets/${id}.glb`, import.meta.url).href;
export const avatarUrl = (id) => new URL(`assets/av-${id}.png`, import.meta.url).href;   // a 256 px LOSSLESS head shot rendered from the full-resolution raw GLB (owner: no compression; pipeline: scratch Three.js page + RoomEnvironment → sharp)

// The trio for a focused character: her two list-neighbours (wrapping) flank her, she leads centre.
// Returns [leftId, centreId, rightId] — the contract dancers.js's three slots consume.
export function trioFor(id) {
  const n = CHARACTERS.length, i = charIndex(id);
  return [CHARACTERS[(i - 1 + n) % n].id, CHARACTERS[i].id, CHARACTERS[(i + 1) % n].id];
}
