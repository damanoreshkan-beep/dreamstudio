// Kotyk-Zirka in every theme — prints the JOBS json for genraw.mjs (two takes per theme).
const CAT = "a small imaginary chubby cat sitting like a loaf with its paws tucked in, two five-pointed star shaped ears on top of its head, a very short tail, a small crescent mark on its chest, eyes shut, faintly smiling, full body, centred, plenty of empty space around it";
const M = {
  lum: "drawn only with thin glowing light filaments and luminous nodes, a hollow wireframe plexus of bright threads and points of light forms the cat, no real cat, translucent, nothing solid, volumetric bloom, floating alone in an empty pure black void, no floor, warm amber gold light with clearly visible electric cyan accents, cinematic, no text",
  paper: "built as a layered white paper bas-relief, many stacked cut-paper layers form the cat, no real cat, depth only from raking side light and soft shadows, all white, papercut lightbox art, no text",
  ink: "formed by black and vermilion ink blooming in clear water, the ink itself forms the cat, no real cat, arrested mid-bloom, fine tendrils, bright white backlight, high-speed photograph, no text",
  mercury: "formed from molten liquid mirror-chrome, the flowing metal itself forms the cat, no real cat, sharp studio reflections, black void, one soft key light, no text",
  plain: "a simple smooth matte pale grey clay figurine, the clay itself forms the cat, no real cat, soft even studio light, minimal, plain dark grey void, no text",
};
const jobs = [];
for (const [id, block] of Object.entries(M)) for (const t of ["a", "b"]) jobs.push([`kz_${id}_${t}`, `${CAT}, ${block}`]);
console.log(JSON.stringify(jobs));
