import { assert, assertEquals } from "jsr:@std/assert@1";
import { VARIANTS, remixFile, roomKey, presetLine, whyKeys, parseTags, groundSong, errorKey, FIXTURE_ANALYSIS } from "../remix.js";

Deno.test("remix: the file name carries the variant's words and no path characters", () => {
  assertEquals(remixFile({ id: "x", artist: "Rick Astley", title: "Never Gonna Give You Up" }, "slowed"), "Rick Astley - Never Gonna Give You Up (slowed + reverb).mp3");
  assertEquals(remixFile({ id: "x", artist: "", title: "A/B: C?" }, "nightcore"), "AB C (nightcore).mp3");
  assertEquals(remixFile({ id: "x", artist: "", title: "" }, "deep"), "x (deep slowed + reverb).mp3");
});

Deno.test("remix: the room word follows the wet weight; the line shows speed and the new tempo", () => {
  assertEquals([roomKey({ wet: 0 }), roomKey({ wet: 0.15 }), roomKey({ wet: 0.22 }), roomKey({ wet: 0.5 }), roomKey(null)], ["roomDry", "roomHint", "roomSoft", "roomDeep", "roomDry"]);
  assertEquals(presetLine({ speed: 0.85, bpm: 96 }), "0.85× · 96 BPM");
  assertEquals(presetLine({ speed: 1.3, bpm: 0 }), "1.30×");
  assertEquals(presetLine(null), "");
});

Deno.test("remix: why-codes become i18n keys and junk is dropped", () => {
  assertEquals(whyKeys(["dense", "vocal", "pop", "<b>", "polka"]), ["why_dense", "why_vocal", "why_pop"]);
  assertEquals(whyKeys(undefined), []);
  for (const w of FIXTURE_ANALYSIS.why) assert(whyKeys([w]).length === 1, w);
});

Deno.test("remix: the AI reply is parsed strictly — a closed genre list, an optional vocal, a bounded sentence", () => {
  assertEquals(parseTags('```json\n{"genre":"rap","vocal":"rap","why":"Heavy 808s and a lazy flow."}\n```'), { genre: "rap", vocal: "rap", why: "Heavy 808s and a lazy flow." });
  assertEquals(parseTags('{"genre":"pop","vocal":"choir"}'), { genre: "pop", vocal: "", why: "" });
  assertEquals(parseTags('{"genre":"polka"}'), null);
  assertEquals(parseTags("not json"), null);
  assertEquals(parseTags(""), null);
  assertEquals(parseTags('{"genre":"ballad","why":"' + "x".repeat(400) + '"}').why.length, 200);
});

Deno.test("remix: the grounding block names the song and nothing else; the sig is per song", () => {
  const g = groundSong({ id: "abc", artist: "Band", title: "Song", album: "LP", year: 1999 });
  assertEquals(g.text, "ARTIST: Band\nTITLE: Song\nALBUM: LP\nYEAR: 1999");
  assertEquals(g.sig, "r1|abc");
  assertEquals(groundSong({ id: "abc", title: "Song" }).text, "ARTIST: unknown\nTITLE: Song");
});

Deno.test("remix: status → error key, 401 stays silent", () => {
  assertEquals([errorKey(401), errorKey(413), errorKey(429), errorKey(400), errorKey(502)], ["", "errLong", "errBusy", "errLink", "errMeta"]);
  assertEquals(VARIANTS, ["slowed", "deep", "nightcore"]);
});
