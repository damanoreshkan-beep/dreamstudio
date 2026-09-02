// iconjobs — the MASTER STYLE PROMPT of the DreamStudio icons, as code (docs/research/luminous-icons.md,
// round-3 block, VERIFIED on 24 icons + vydyvo/spirit/vidlunnia). A subject never carries style words; the
// block never changes per app. Prints the JOBS json genraw.mjs consumes:
//   deno run -A docs/research/mascot-tools/iconjobs.mjs <name>="<subject phrase>" … > icon-jobs.json
// Subject rule: "the silhouette of <ONE strong shape> with <ONE distinguishing feature>", or "the outline of …
// drawn as glowing lines" for anything the model knows as a material; no stand, no base, no scene.
export const ICON_STYLE =
  "drawn only with thin glowing light filaments and luminous nodes, a hollow wireframe plexus of bright threads " +
  "and points of light, translucent, nothing solid, no paper, no metal, no glass, volumetric bloom, floating alone " +
  "in an empty pure black void with generous empty space around it, no floor, no ground, no reflection, no shadow, " +
  "warm amber gold light with clearly visible electric cyan accents on the outer nodes, cinematic, no text, no letters";

/** The full prompt for one icon take. */
export const iconPrompt = (subject) => `${subject.trim().replace(/[,.\s]+$/, "")}, ${ICON_STYLE}`;

if (import.meta.main) {
  const jobs = [];
  for (const a of Deno.args) {
    const i = a.indexOf("=");
    if (i < 1) { console.error(`bad arg: ${a} — want <name>=<subject>`); Deno.exit(2); }
    jobs.push([a.slice(0, i), iconPrompt(a.slice(i + 1))]);
  }
  if (!jobs.length) { console.error("no jobs"); Deno.exit(2); }
  console.log(JSON.stringify(jobs));
}
