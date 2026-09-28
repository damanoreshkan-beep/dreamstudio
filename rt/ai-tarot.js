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
