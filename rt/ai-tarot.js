// microspec runtime — the TAROT readings that are grounded per card (apps/spirit).
//
//   • spiritRead — ONE card speaks: its spirit, in the first person, from the card's canonical meaning in
//     the orientation drawn. The block is built by `groundCard()` together with its cache signature, the
//     transit rule (rt/signif.js `groundX()`): a signature that misses a fact its block contains serves a
//     stale reading forever, so a caller never assembles the pair by hand.
//
// The other orientation's meaning is deliberately NOT in the block — two meanings in one block read as
// "both are present" (the relation trap measured on transit's ruler/house confusion). `CORPUS` rides in the
// signature: change how a block is worded and every cached reading built on the old one must miss.
import { reading, aiTick } from "@microspec/core/runtime/ai-core.js";

/** Bump when `groundCard`'s wording changes — it expires every reading cached against the old block. */
export const CORPUS = 1;

const SPIRIT = reading("tarot-s", "spirit");
export const spiritRead = SPIRIT.get;
export const isSpiritRead = SPIRIT.has;
export const warmSpiritRead = SPIRIT.warm;

const SUIT = { wands: "Wands", cups: "Cups", swords: "Swords", pentacles: "Pentacles" };
const RANK = { 1: "Ace", 11: "Page", 12: "Knight", 13: "Queen", 14: "King" };

/** How the card is named in the block — "The Magician (Major Arcana I)" / "Three of Cups (Minor Arcana)". */
export function cardLine(c) {
  if (c.arcana === "major") return `${c.name} (Major Arcana ${c.num})`;
  const rank = RANK[c.num] || String(c.num);
  return `${rank} of ${SUIT[c.suit] || c.suit} (Minor Arcana)`;
}

/**
 * The grounding block for one drawn card and the signature the reading is cached under.
 * @param c a DECK entry (rt/tarotdeck.js)
 * @param reversed the orientation drawn
 * @returns { text, sig } — always together
 */
export function groundCard(c, reversed) {
  const text = [
    `CARD: ${cardLine(c)}.`,
    `ORIENTATION: ${reversed ? "reversed" : "upright"}.`,
    `MEANING (A. E. Waite, 1910, for this orientation): ${reversed ? c.rev : c.up}`,
  ].join("\n");
  return { text, sig: `s${CORPUS}|${c.id}|${reversed ? "r" : "u"}` };
}

export { aiTick };
