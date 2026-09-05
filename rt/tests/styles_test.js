// rt/styles.js — the materials list is a CONTRACT two apps and one shader share: ids unique, every card an
// English block with the farm's void words, the order fixed (lychyna.frag indexes it).
import { assert, assertEquals } from "jsr:@std/assert@1";
import { STYLES, styleOf, styleIndex } from "../styles.js";

Deno.test("styles: eleven unique ids, every one with a key and an English block", () => {
  assertEquals(STYLES.length, 11);
  assertEquals(new Set(STYLES.map((s) => s.id)).size, 11);
  for (const s of STYLES) {
    assert(/^[a-z]+$/.test(s.id), `id ${s.id}`);
    assert(/^style[A-Z][a-z]+$/.test(s.key), `key ${s.key}`);
    assert(s.block.length > 40 && /^[\x20-\x7e]+$/.test(s.block), `block of ${s.id} is not plain English`);
    assert(/no text/.test(s.block), `${s.id}: the block must forbid text`);
  }
});

Deno.test("styles: the order is the shader's contract — lum first, sand last", () => {
  assertEquals(STYLES.map((s) => s.id), ["lum", "smoke", "chrome", "paper", "thread", "ink", "circuit", "veil", "ferro", "porcelain", "sand"]);
  assertEquals(styleIndex("lum"), 0);
  assertEquals(styleIndex("sand"), 10);
  assertEquals(styleIndex("nope"), -1);
  assertEquals(styleOf("ink")?.key, "styleInk");
  assertEquals(styleOf("none"), null);
});
