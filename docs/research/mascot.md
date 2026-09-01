# The mascot — a feline that does not exist (DECIDED 2026-09-01: Kotyk-Zirka)

**Owner's pick: Котик-Зірка (candidate 3).** Shipped the same day as the five picker thumbnails
(`rt/theme-<id>.webp`, 384², webp q80 — the same subject through every theme's material, Z-Image-Turbo on
the edge pods via the RAW generator). The prompt contract that produced them:

    a small imaginary chubby cat sitting like a loaf with its paws tucked in, two five-pointed star shaped
    ears on top of its head, a very short tail, a small crescent mark on its chest, eyes shut, faintly
    smiling, full body, centred, plenty of empty space around it, <material block>

where the material block is mirage's style block rephrased so the material FORMS the cat ("…the ink itself
forms the cat, no real cat…" — without it the model puts a photo cat next to the material). Blocks used:
lum / paper / ink / chrome (Mercury) from `apps/mirage/styles.js`; Просто = "a simple smooth matte pale grey
clay figurine, the clay itself forms the cat, no real cat, soft even studio light, minimal, plain dark grey
void". Two takes per theme, picked by eye on a contact sheet (lum a · paper a · ink a · mercury a · plain b).
Known drift: the star ears hold unevenly (Сяйво renders plain ears with stars around; Ртуть one star ear) —
at a 96px round thumb the silhouette + material carry it; a hero-size render (1024) will want a re-roll
with the ears weighted ("ears that ARE five-pointed stars").

---

Original proposal, kept for the record:

Owner: "замість лисички вигадаємо свого персонажа, якого не існує в природі, але із сімейства котячих".
The mascot is the ONE subject rendered through every material (mirage's fox, replaced): the thumbnail of
each theme card in the profile's picker, and later the face of empty states and the store's hero. It must
read at 96px (a card thumbnail) and at 1024px, in eleven materials, in both modes — so the SILHOUETTE
carries it, not the detail. Three candidates; the owner picks one (or a blend), then `docs/research/
mascot.md` becomes the prompt contract and the thumbnails are generated on the edge pods through the RAW
generator (never `rerun.mjs`, which appends the luminous block to every job).

## 1 · Lumka (Лумка) — the lantern cat

A small, compact cat with oversized ears whose tips fray into soft luminous tufts, a long tail ending in a
lantern-like bulb it curls around its paws, calm half-closed eyes. Sits upright, curled slightly, like a
question mark. The tail-bulb is the one detail every material keeps (a bulb of light, a paper lantern, a
chrome sphere, a sand hill with a glowing top…). Silhouette: round body + two big ears + a hooked tail.

## 2 · Vetra (Ветра) — the moth-cat

A lean cat with two pairs of ears set like moth wings, a ruff of fine filaments around the neck, a tail that
splits into three thin ribbons trailing behind, eyes like two crescents. In motion, mid-leap. Silhouette:
long diagonal body + a wing-shaped head + three ribbons. Reads dramatic at 1024, harder at 96.

## 3 · Kotyk-Zirka (Котик-зірка) — the star-eared

A chubby short cat with five-pointed star ears, a very short tail, and a chest mark shaped like a small
crescent; sits like a loaf with the paws tucked in, eyes shut, faintly smiling. Silhouette: a loaf with two
stars on top — the simplest to read at any size, the most "brand" (a star-eared loaf is instantly ours).

## The prompt contract (whichever wins)

Subject line (constant): "a small imaginary cat, <silhouette phrase>, sitting curled, calm half-closed
eyes, full body, centred, plenty of empty space around it, no text". Then mirage's style block for the
material (apps/mirage/styles.js), then: "the creature itself is made of that material — no real cat, the
material forms the shape". Ground per mode as the ds-sprites: pure black for night, pure white for day (so
alpha is exact math through `ds-import`). One master per material at 1024, thumbnails at 384 (webp q80).

## Where it goes

- `rt/theme-<id>.webp` — the picker thumbnail (the mascot in that material).
- later: the empty state's figure and the store's hero (a systemic hook, like the theme art).
