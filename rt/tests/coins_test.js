// rt/coins.js — the packs and the pure helpers (the Telegram half is proven live through the edge).
import { assert, assertEquals } from "jsr:@std/assert@1";
import { PACKS, packOf, bestValue } from "../coins.js";

Deno.test("coins: three packs, whole star prices, cheaper per coin as they grow; the best value is the largest", () => {
  assertEquals(PACKS.length, 3);
  for (const p of PACKS) assert(p.coins > 0 && Number.isInteger(p.stars) && p.stars > 0, p.sku);
  for (let i = 1; i < PACKS.length; i++) assert(PACKS[i].stars / PACKS[i].coins <= PACKS[i - 1].stars / PACKS[i - 1].coins, "a bigger pack must not cost more per coin");
  assertEquals(bestValue(), "c5000");
  assertEquals(packOf("c500").coins, 500); assertEquals(packOf("nope"), null);
});
