import { assert, assertEquals } from "jsr:@std/assert@1";
import { isAudio, mb, songLine, usageLine, titleOf, errorKey, FIXTURE_SONGS, FIXTURE_USAGE } from "../fonoteka.js";

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
