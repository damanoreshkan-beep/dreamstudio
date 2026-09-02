// rt/ai-tarot.js — the grounded block for one card and its signature. Pure: no browser, no network.
//   deno test -A rt/rt_test.js   (the barrel imports this file)
import { assert, assertEquals } from "jsr:@std/assert@1";
import { groundCard, cardLine, CORPUS } from "../ai-tarot.js";
import { DECK } from "../tarotdeck.js";

const magician = DECK.find((c) => c.id === "ar01");
const threeCups = DECK.find((c) => c.arcana === "minor" && c.suit === "cups" && c.num === 3);
const page = DECK.find((c) => c.arcana === "minor" && c.suit === "wands" && c.num === 11);

Deno.test("cardLine: majors by number, minors by rank and suit", () => {
  assertEquals(cardLine(magician), "The Magician (Major Arcana 1)");
  assertEquals(cardLine(threeCups), "3 of Cups (Minor Arcana)");
  assertEquals(cardLine(page), "Page of Wands (Minor Arcana)");
});

Deno.test("groundCard: the block carries ONE orientation's meaning and names it", () => {
  const up = groundCard(magician, false), rev = groundCard(magician, true);
  assert(up.text.includes("ORIENTATION: upright") && up.text.includes(magician.up), "upright block carries the upright meaning");
  assert(!up.text.includes(magician.rev), "the reversed meaning must NOT be in the upright block");
  assert(rev.text.includes("ORIENTATION: reversed") && rev.text.includes(magician.rev), "reversed block carries the reversed meaning");
  assert(!rev.text.includes(magician.up), "the upright meaning must NOT be in the reversed block");
});

Deno.test("groundCard: the signature covers card, orientation and corpus version", () => {
  const up = groundCard(magician, false), rev = groundCard(magician, true), other = groundCard(threeCups, false);
  assert(up.sig !== rev.sig, "orientation changes the key");
  assert(up.sig !== other.sig, "card changes the key");
  assert(up.sig.startsWith(`s${CORPUS}|`), "the corpus version rides in every key");
  assertEquals(groundCard(magician, false).sig, up.sig, "deterministic");
});

Deno.test("groundCard: every card in the deck grounds within the edge's cap", () => {
  for (const c of DECK) for (const r of [false, true]) {
    const { text } = groundCard(c, r);
    assert(text.length > 40 && text.length < 2000, `${c.id} ${r ? "rev" : "up"}: ${text.length} chars`);
  }
});
