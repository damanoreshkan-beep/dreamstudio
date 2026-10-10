import { assert, assertEquals } from "jsr:@std/assert@1";
import { isAudio, mb, songLine, usageLine, titleOf, errorKey, shareFile, FIXTURE_SONGS, FIXTURE_USAGE } from "../fonoteka.js";

Deno.test("fonoteka shareFile — the share sheet gets an allowed audio type, never the cache's octet-stream", () => {
  assertEquals(shareFile("Rick Astley - Never Gonna.mp3", "application/octet-stream"), { name: "Rick Astley - Never Gonna.mp3", type: "audio/mpeg" }, "the failure of 2026-10-10: Chrome said Permission denied");
  assertEquals(shareFile("field.M4A", ""), { name: "field.m4a", type: "audio/mp4" }, "Chrome's extension list is lower-case");
  assertEquals(shareFile("voice.opus", "audio/ogg").type, "audio/ogg");
  assertEquals(shareFile("no-extension", "audio/flac"), { name: "no-extension.flac", type: "audio/flac" });
  assertEquals(shareFile("track.bin", "application/octet-stream"), { name: "track.mp3", type: "audio/mpeg" }, "an unknown name still leaves as an mp3");
});

// Chrome on Android's isDangerousFilename, restated: what the share sheet will accept as a name
const chromeAccepts = (n) => !!n && !n.includes("..") && !/[\/\\]/.test(n) && n === n.trim() && !n.endsWith(".") && n.lastIndexOf(".") > 0 &&
  ["mp3", "m4a", "oga", "ogg", "opus", "wav", "weba", "flac"].includes(n.slice(n.lastIndexOf(".") + 1));

Deno.test("fonoteka shareFile — every song name leaves as one Chrome's share sheet accepts", () => {
  for (const name of ["Song... (live).mp3", "AC/DC - Thunder.MP3", " spaced .mp3", "end.dot..mp3", "trailing.", "..", "", "Польова пісня.mp3", "a\\b.ogg", "x.M4A"]) {
    const f = shareFile(name, "application/octet-stream");
    assert(chromeAccepts(f.name), `"${name}" → "${f.name}" would be refused with "Permission denied"`);
  }
  assertEquals(shareFile("Song... (live).mp3", "").name, "Song. (live).mp3");
  assertEquals(shareFile("AC/DC - Thunder.MP3", "").name, "AC DC - Thunder.mp3");
});

const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, "0")}`;

Deno.test("fonoteka: a song is audio by type or by extension; a picture is not", () => {
  assert(isAudio({ type: "audio/mpeg", name: "x" }) && isAudio({ type: "", name: "song.MP3" }) && isAudio({ type: "application/octet-stream", name: "a.m4a" }));
  assert(!isAudio({ type: "image/png", name: "shot.png" }) && !isAudio({ type: "", name: "notes.txt" }) && !isAudio(null));
});

Deno.test("fonoteka: sizes read as one-decimal MB; the row line carries only what the song knows", () => {
  assertEquals(mb(6_037_204), "6.0 MB");
  assertEquals(mb(0), "0.0 MB");
  assertEquals(songLine(FIXTURE_SONGS[0], clock), "Rick Astley · 4:11 · 6.0 MB");
  assertEquals(songLine(FIXTURE_SONGS[2], clock), "4:34 · 6.6 MB");
  assertEquals(songLine({ id: "x" }, clock), "");
});

Deno.test("fonoteka: the shelf readout and the title fallback", () => {
  assertEquals(usageLine(FIXTURE_USAGE, { songs: "songs", of: "of" }), "3 songs · 17.9 MB of 3 GB");
  assertEquals(usageLine(null, {}), "");
  assertEquals(titleOf(FIXTURE_SONGS[2]), "Польова пісня");
  assertEquals(titleOf({ id: "zz", name: "" }), "zz");
});

Deno.test("fonoteka: status → error key; 401 stays silent; 409 splits on the reason", () => {
  assertEquals([errorKey(401), errorKey(413), errorKey(415), errorKey(502)], ["", "errLarge", "errNotAudio", "errUpload"]);
  assertEquals(errorKey(409, "too many songs"), "errCount");
  assertEquals(errorKey(409, "library full"), "errFull");
});
