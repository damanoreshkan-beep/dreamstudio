// The style cards of Make — DATA, not logic, and since 2026-09-05 the product's: `rt/styles.js` holds the
// materials (lychyna's mirror reads the same list by index), this file keeps only what is mirage's — the
// thumbnails: one shared subject (a curled fox) rendered through every block by the same model that powers
// Make, so a card shows the material honestly — assets/style-<id>.webp, generated on the edge pods.
export { STYLES, styleOf } from "/_rt/styles.js";
export const styleThumb = (id) => new URL(`assets/style-${id}.webp`, import.meta.url).href;
