// remix — what the screen decides without the network: the three variants, how a preset reads in words, the
// file a save gets, the producer's tags out of the AI's reply, and the fixtures the gate renders.
export const VARIANTS = ["slowed", "deep", "nightcore"];
// mirrored in edge remix.js TAG — the words the edge puts in the file name and the ID3 title
export const TAG = { slowed: "slowed + reverb", deep: "deep slowed + reverb", nightcore: "nightcore" };

/** "Artist - Title (slowed + reverb).mp3" for the `<a download>`, matching the edge's attachment name. */
export const remixFile = (m, v) => `${[m.artist, m.title].filter(Boolean).join(" - ") || m.id} (${TAG[v]}).mp3`.replace(/[\\/:*?"<>|]/g, "");

/** The room in one word, from the preset's wet weight: an i18n key. */
export const roomKey = (p) => (!p || !p.wet ? "roomDry" : p.wet >= 0.4 ? "roomDeep" : p.wet >= 0.2 ? "roomSoft" : "roomHint");

/** "0.85× · 96 BPM" — the numbers a listener can check against the original. */
export const presetLine = (p) => (p ? `${p.speed.toFixed(2)}×${p.bpm ? ` · ${p.bpm} BPM` : ""}` : "");

/** The edge's why-codes → i18n keys; unknown codes are dropped, never shown raw. */
const WHY = new Set(["fast", "slow", "dense", "sparse", "vocal", "bright", "dark", "instrumental", "rap", "phonk", "rnb", "pop", "rock", "edm", "dnb", "ambient", "ballad"]);
export const whyKeys = (why) => (why || []).filter((w) => WHY.has(w)).map((w) => `why_${w}`);

const GENRES = new Set(["rap", "phonk", "rnb", "pop", "rock", "edm", "dnb", "ambient", "ballad", "other"]);
const VOCALS = new Set(["rap", "sung", "instrumental"]);
/** The AI's strict-JSON reply → { genre, vocal, why } with only the values the edge accepts; null when unusable. */
export function parseTags(text) {
  let j = null;
  try { const m = String(text || "").match(/\{[\s\S]*\}/); j = m ? JSON.parse(m[0]) : null; } catch { return null; }
  if (!j || !GENRES.has(j.genre)) return null;
  return { genre: j.genre, vocal: VOCALS.has(j.vocal) ? j.vocal : "", why: String(j.why || "").trim().slice(0, 200) };
}

/** The grounding block for /feed/ai mode `remix` and the key its answer is cached under. */
export const groundSong = (m) => ({
  text: [`ARTIST: ${m.artist || "unknown"}`, `TITLE: ${m.title || "unknown"}`, m.album ? `ALBUM: ${m.album}` : "", m.year ? `YEAR: ${m.year}` : ""].filter(Boolean).join("\n"),
  sig: `r1|${m.id}`,
});

// 401 is the runtime's: the sealed tunnel opens the sign-in wall on it, so the screen says nothing of its own.
export const errorKey = (status) => (status === 401 ? "" : status === 413 ? "errLong" : status === 429 ? "errBusy" : status === 400 ? "errLink" : "errMeta");

export const FIXTURE_LINK = "https://music.youtube.com/watch?v=dQw4w9WgXcQ";
export const FIXTURE_META = { id: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", artist: "Rick Astley", album: "Whenever You Need Somebody", year: 1987, duration: 213, cover: null };
// measured on the song itself (apps/remix/RESEARCH.md): 112.9 BPM, −13 LUFS, a dense bright pop mix with the vocal forward
export const FIXTURE_ANALYSIS = {
  bpm: 112.9, lufs: -13, lra: 5, tp: -0.3, bright: 3300, flat: 0.108, mid: 0.99, bass: 0.73, density: "dense",
  presets: {
    slowed: { speed: 0.85, decay: 2.5, wet: 0.22, lp: 10000, hp: 200, pre: 40, master: 0, bass: 0, bpm: 96 },
    deep: { speed: 0.75, decay: 4.5, wet: 0.37, lp: 7500, hp: 250, pre: 50, master: 12000, bass: 0, bpm: 85 },
    nightcore: { speed: 1.3, decay: 0, wet: 0, lp: 0, hp: 0, pre: 0, master: 0, bass: 2.5, bpm: 147 },
  },
  why: ["dense", "vocal", "pop"],
};
export const FIXTURE_TAGS = { genre: "pop", vocal: "sung", why: "" };
