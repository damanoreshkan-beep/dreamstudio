// fonoteka — what the screen decides without the network: which shared files are songs, how a song reads in a
// row, how much of the shelf is used, and the fixtures the gate renders.
export const MB = 1_000_000;

/** A shared file the library takes: audio by type, or by a known extension when the type is blank. */
export const isAudio = (f) => !!f && (String(f.type || "").startsWith("audio/") || /\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i.test(String(f.name || "")));

// The audio types the phone's share sheet accepts, by extension. Chrome refuses a file share whose type is
// not on its allow-list with "Permission denied" — and a kept song comes back from the cache as
// application/octet-stream (the edge serves the bytes untyped), which is exactly what failed (2026-10-10).
const AUDIO = { mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", wav: "audio/wav", flac: "audio/flac", weba: "audio/webm" };

/**
 * The file a song is shared as: an allowed audio type from its extension (else the blob's own audio type,
 * else mp3), and a name that carries a matching extension.
 * @returns {{ name: string, type: string }}
 */
export function shareFile(name, blobType) {
  const ext = /\.([a-z0-9]{2,5})$/i.exec(String(name || ""))?.[1]?.toLowerCase();
  if (ext && AUDIO[ext]) return { name, type: AUDIO[ext] };
  const type = /^audio\//.test(blobType || "") ? blobType : "audio/mpeg";
  const add = Object.entries(AUDIO).find(([, t]) => t === type)?.[0] || "mp3";
  return { name: `${String(name || "song").replace(/\.[a-z0-9]{2,5}$/i, "")}.${add}`, type };
}

/** "6.0 MB" — one decimal, never a float tail. */
export const mb = (bytes) => `${(Math.max(0, Number(bytes) || 0) / MB).toFixed(1)} MB`;

/** The row's second line: artist · length · size — only what the song knows about itself. */
export function songLine(s, clock) {
  return [s.artist, s.dur ? clock(s.dur) : "", s.size ? mb(s.size) : ""].filter(Boolean).join(" · ");
}

/** The shelf readout: "12 songs · 84 MB of 3 GB" with the words left to the dictionary. */
export const usageLine = (u, words) => (u ? `${u.count} ${words.songs} · ${mb(u.bytes)} ${words.of} ${(u.maxBytes / 1e9).toFixed(0)} GB` : "");

/** The song's own title for the shelf and the lock screen: the tag, else the file name without its extension. */
export const titleOf = (s) => s.title || String(s.name || "").replace(/\.[a-z0-9]{2,5}$/i, "") || s.id;

/** 401 stays silent (the runtime's wall); 413/409 are the quota words; the rest one sentence. */
export const errorKey = (status, why) => (status === 401 ? "" : status === 413 ? "errLarge" : status === 409 ? (why === "too many songs" ? "errCount" : "errFull") : status === 415 ? "errNotAudio" : "errUpload");

export const FIXTURE_USAGE = { count: 3, bytes: 17_900_000, maxFiles: 300, maxBytes: 3_000_000_000 };
export const FIXTURE_SONGS = [
  { id: "a1b2c3d4e5f60718", name: "Rick Astley - Never Gonna Give You Up (slowed + reverb).mp3", title: "Never Gonna Give You Up (slowed + reverb)", artist: "Rick Astley", size: 6_037_204, dur: 250.6, added: "2026-10-07T20:00:00Z" },
  { id: "b2c3d4e5f6071829", name: "Rick Astley - Never Gonna Give You Up.mp3", title: "Never Gonna Give You Up", artist: "Rick Astley", size: 5_300_000, dur: 213.0, added: "2026-10-06T19:00:00Z" },
  { id: "c3d4e5f607182930", name: "Польова пісня.mp3", title: "", artist: "", size: 6_562_796, dur: 274.2, added: "2026-10-05T18:00:00Z" },
];
