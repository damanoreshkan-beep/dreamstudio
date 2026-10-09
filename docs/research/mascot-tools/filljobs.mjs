// FILL TEXTURES — the material a free form is filled with (fonoteka's orb; core shape.js), one per theme per
// mode, generated at 2048 on the pods and imported at 1536 (`ds-import --size=1536`, name `fill`). The chrome
// sprites (garland, corner, scatter) stay 512: they are small on screen; a fill is ~408 CSS px on a 3× phone.
//
// The SUBJECT is one composition for every theme — a small radiant heart with fine strands thinning into a
// lot of empty space — so a form shows the material's heart wherever the song's shape cuts it. The MATERIAL
// is the theme's own (rt/styles.js wording), restated per mode: NIGHT on pure black (imported alphaFromBlack),
// DAY on pure white (alphaFromWhite) — the import needs clean corners, so every block names its ground.
//
//   deno run -A docs/research/mascot-tools/filljobs.mjs [takes=2] > fill-jobs.json
//   J=$(cat fill-jobs.json); cat docs/research/mascot-tools/genraw.mjs | ssh vps "docker exec -i -e SIZE=2048 -e JOBS='$J' microspec-edge deno run -A -" > fill-out.txt
// Round 1 (2026-10-09) said "a small radiant heart" — the model drew a literal heart shape in all 42 takes,
// and the radial burst made every material look alike. So: no symbol word, no rays — an abstract loose
// cluster OF THE MATERIAL ITSELF, organic and asymmetric, densest in the middle and dissolving into the ground.
// Round 2: the materials read true, but naming the unwanted shape ("no heart") still drew it in 2 of 8, and the
// day grounds came out as grey paper with a vignette and a cast shadow (corners 199–228, not white) — so the
// shape is never named, and every ground is a seamless flat colour with nothing standing on it.
const SUBJECT = "an abstract loose organic cluster of the material itself, irregular and asymmetric, densest around the middle of the frame and dissolving into scattered fragments toward the edges, lots of empty space around it, close-up macro detail, no symbol, no rays, no recognisable object, floating, nothing standing on a surface";
const GROUND = { n: "seamless flat pure black background #000000, no vignette, no floor", d: "seamless flat pure white background #ffffff, no cast shadow, no vignette, no floor, no paper texture" };
const NIGHT = {
  lum: "drawn only with thin glowing light filaments and luminous nodes, translucent, nothing solid, soft volumetric bloom, warm amber gold light with clearly visible electric cyan accents, on a pure black background, cinematic, no text",
  paper: "made of thin cut strips of white paper with gold-leaf edges, layered with depth, lit by one raking side light, on a pure black background, papercut art, no text",
  ink: "formed by vermilion and white ink blooming in dark water, fine tendrils arrested mid-bloom, lit from the side, on a pure black background, high-speed photograph, no text",
  mercury: "formed from molten liquid mirror-chrome droplets and fine flowing threads of metal, sharp studio reflections, one soft key light, on a pure black background, no text",
  smoke: "sculpted from wisps of white smoke frozen mid-swirl, a single hard side light, fine volumetric detail, on a pure black background, high-speed photograph look, no text",
  thread: "embroidered in fine gold and amber silk threads, visible individual stitches, subtle sheen of the threads, on a pure black background, macro photograph, no text",
  circuit: "etched as fine glowing gold circuit traces and tiny pads, thin luminous traces branching outward, on a pure black background, macro, no text",
  veil: "formed by thin translucent ribbons of aurora light, green and violet drapery of light, a few stars, on a pure black background, long-exposure look, no text",
  ferro: "formed from glossy black ferrofluid spikes and droplets with bright rim-lit edges, liquid metal sheen, one rim light, on a pure black background, no text",
  porcelain: "as thin backlit porcelain filigree, warm light glowing through translucent bone china, embossed detail, on a pure black background, no text",
  sand: "drawn as fine glowing grains of golden sand and thin incised grooves catching a low golden sun, on a pure black background, photograph, no text",
};
const DAY = {
  lum: "drawn with thin gilded gold threads and tiny gold beads, delicate filigree, a few fine teal threads, on a pure white background, soft even daylight, no text",
  paper: "made of thin cut strips of white and cream paper with gold-leaf edges, layered with soft shadows, on a pure white background, papercut art, no text",
  ink: "painted with black and vermilion sumi ink, fine brush tendrils and spatters, on a pure white background, rice paper feel, no text",
  mercury: "formed from polished gunmetal and steel droplets and fine flowing threads of metal, crisp reflections, on a pure white background, studio photograph, no text",
  smoke: "sculpted from wisps of charcoal grey smoke frozen mid-swirl, fine volumetric detail, on a pure white background, high-speed photograph look, no text",
  thread: "embroidered in fine amber, rust and indigo silk threads, visible individual stitches, on a pure white background, macro photograph, no text",
  circuit: "etched as fine copper and gold circuit traces and tiny pads, thin traces branching outward, on a pure white background, macro, no text",
  veil: "formed by thin translucent ribbons of soft green and violet watercolour light, delicate drapery, on a pure white background, no text",
  ferro: "formed from glossy black ferrofluid spikes and droplets, liquid sheen, crisp highlights, on a pure white background, studio photograph, no text",
  porcelain: "as delicate blue-and-white porcelain filigree, cobalt brush detail on bone china, on a pure white background, no text",
  sand: "drawn as fine incised grooves and grains in pale golden sand, soft raking light, on a pure white background, photograph, no text",
};
const takes = Number(Deno.args[0] || 2);
const jobs = [];
for (const [mode, table] of [["n", NIGHT], ["d", DAY]]) {
  for (const [theme, block] of Object.entries(table)) {
    for (let k = 0; k < takes; k++) jobs.push([`fill_${theme}_${mode}_${"abc"[k]}`, `${SUBJECT}, ${block}, ${GROUND[mode]}`]);
  }
}
console.log(JSON.stringify(jobs));
