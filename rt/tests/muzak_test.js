import { assertEquals } from "jsr:@std/assert@1";
import { videoId, clock, byline, errorKey } from "../muzak.js";

Deno.test("videoId: YouTube link shapes give the id, anything else null", () => {
  for (const u of ["https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RD", "https://youtu.be/dQw4w9WgXcQ?si=1", "https://youtube.com/shorts/dQw4w9WgXcQ", " https://m.youtube.com/watch?v=dQw4w9WgXcQ "]) assertEquals(videoId(u), "dQw4w9WgXcQ", u);
  for (const u of ["https://example.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ", "", null, "https://youtube.com/watch?v=short"]) assertEquals(videoId(u), null, String(u));
});

Deno.test("clock and byline: 3:33, and only what the song knows", () => {
  assertEquals(clock(213), "3:33");
  assertEquals(clock(0), "0:00");
  assertEquals(byline({ artist: "Band", album: "", year: 1987 }), "Band · 1987");
  assertEquals(byline({}), "");
});

Deno.test("errorKey: the edge's status becomes a sentence key", () => {
  assertEquals([400, 401, 413, 429, 502, 0].map(errorKey), ["errLink", "", "errLong", "errBusy", "errMeta", "errMeta"]);
});
