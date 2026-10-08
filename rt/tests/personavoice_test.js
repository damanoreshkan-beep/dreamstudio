import { assert, assertEquals } from "jsr:@std/assert@1";
import { speechChunks, designFor, voicePhaseKey, CHUNK_MAX } from "../personavoice.js";

Deno.test("personavoice: a short reply is one piece; sentences pack up to the cap; nothing is lost or empty", () => {
  assertEquals(speechChunks("  Привіт.   Я тут. "), ["Привіт. Я тут."]);
  const long = Array.from({ length: 30 }, (_, i) => `Речення номер ${i + 1} про щось важливе.`).join(" ");
  const parts = speechChunks(long);
  assert(parts.length > 1 && parts.every((p) => p.length <= CHUNK_MAX && p.length > 0));
  assertEquals(parts.join(" "), long, "every word, in order");
  assertEquals(speechChunks(""), []);
});

Deno.test("personavoice: a sentence longer than the cap is cut at a comma or a space, never mid-word", () => {
  const words = Array.from({ length: 120 }, (_, i) => `слово${i}`).join(" ") + ".";
  const parts = speechChunks(words, 100);
  assert(parts.every((p) => p.length <= 100));
  assertEquals(parts.join(" "), words);
  assert(parts.every((p) => /^\S/.test(p) && /\S$/.test(p)));
});

Deno.test("personavoice: a Ukrainian reply drops the English accent; an English one keeps it", () => {
  const v = { gender: "Male", age: "Elderly", pitch: "Low Pitch", accent: "British Accent" };
  assertEquals(designFor(v, "Добрий вечір, Ватсоне."), { gender: "Male", age: "Elderly", pitch: "Low Pitch" });
  assertEquals(designFor(v, "Good evening, Watson."), v);
  assertEquals(designFor(null, "x"), null);
  assertEquals(voicePhaseKey("making"), "voiceMaking");
  assertEquals(voicePhaseKey("idle"), "");
});
