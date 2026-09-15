// rt/genchar.js — the pure parts of the character generator: the picture prompt, the fallback name, the row map.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { lookPrompt, nameFrom, charOf, looksLikeLook, genStatusCode, LOOK, LOOK_ASK } from "../genchar.js";

Deno.test("genchar: the body job's refusal is the app's error key — 402 means the farm wallet cannot pay it", () => {
  assertEquals(genStatusCode(402), "ePoor");
  assertEquals(genStatusCode(401), "eSignIn");
  assertEquals(genStatusCode(429), "eRate");
  assertEquals(genStatusCode(413), "eBig");
  assertEquals(genStatusCode(400), "eFailed");
});

Deno.test("genchar: a vision answer is a look only when it is a real English description — never a Space's error, a refusal or Cyrillic", () => {
  assert(looksLikeLook("young adult woman, slim build, medium height, light skin, long dark brown wavy hair, black leather jacket, white t-shirt, blue jeans, white sneakers"));
  assert(!looksLikeLook("[ERROR] No GPU was available after 60s [Create a free account](https://huggingface.co/join)"));
  assert(!looksLikeLook("I cannot identify people in images."));
  assert(!looksLikeLook("short answer"));
  assert(!looksLikeLook("молода жінка, темне волосся, чорна куртка, сині джинси, білі кросівки, худорлява статура"));
  assert(/no names/i.test(LOOK_ASK) && /english/i.test(LOOK_ASK), "the ask forbids identity and demands English");
});

Deno.test("genchar: the picture prompt is the English description plus the fixed look, bounded", () => {
  assertEquals(lookPrompt("a tall runner in a red jacket"), "a tall runner in a red jacket" + LOOK);
  assert(lookPrompt("x".repeat(2000)).length <= 600 + LOOK.length);
  assert(LOOK.includes("full body") && LOOK.includes("A-pose") && LOOK.includes("white background"));
});

Deno.test("genchar: a name falls back to the first two words of the prompt, capitalised, ≤40", () => {
  assertEquals(nameFrom("  swift   courier of the night "), "Swift Courier");
  assertEquals(nameFrom("zara"), "Zara");
  assertEquals(nameFrom(""), "");
  assert(nameFrom("x".repeat(60) + " y").length <= 40);
});

Deno.test("genchar: an edge row becomes the app's character — a my- id, an absolute glb, a stable tint, a checked kind", () => {
  const c = charOf({ char_id: "k7ab", name: "Nox", kind: "creature", glb_url: "/feed/character/k7ab.glb", avatar_url: "data:image/jpeg;base64,AA", created_at: "2026-09-13T10:00:00Z" });
  assertEquals(c.id, "my-k7ab"); assertEquals(c.kind, "creature"); assertEquals(c.name, "Nox");
  assert(c.glb.startsWith("https://") && c.glb.endsWith("/feed/character/k7ab.glb"));
  assertEquals(c.tint, charOf({ char_id: "k7ab", glb_url: "/x" }).tint, "the tint is a function of the id");
  assertEquals(charOf({ char_id: "z1", kind: "dragon", glb_url: "/x" }).kind, "human");
  assertEquals(charOf({ char_id: "z1", glb_url: "/x" }).avatar, "");
});
