// THE THEME DECIDES (owner, 2026-09-02: "у нас все тема рішає … закласти це у систему самої апки"):
// vydyvo has no preset UI — the farm theme the owner already picked IS the world every picture grows in.
// One entry per theme module (rt/themes.json): a default subject (used when the prompt is empty), the
// material's NIGHT and DAY light (rides with the mode read off html[data-theme]), and a short mood TINT
// that replaces the full block when the owner's own words drive the picture (70/30 — the words stronger).
export const WORLDS = {
  lum: {
    subject: "a lone tree drawn only with thin glowing light filaments and luminous nodes, a hollow wireframe plexus of bright threads, translucent, nothing solid",
    night: "floating alone in an empty pure black void, no floor, warm amber gold light with clearly visible electric cyan accents, volumetric bloom",
    day: "gilded golden threads on pure white paper, a few teal sparks, delicate fine linework, soft warm glow",
    tint: "luminous, woven of light, glowing filaments, deep and quiet",
  },
  paper: {
    subject: "a quiet valley with a small house and hills, built as a layered cut-paper diorama, stacked paper bas-relief",
    night: "cream paper layers in warm candlelight, deep soft shadows between the sheets",
    day: "white paper layers with gilded gold edges, raking morning light, papercut lightbox art",
    tint: "cut paper, layered, delicate, softly lit",
  },
  ink: {
    subject: "a mountain shoreline formed by ink blooming in clear water, fine tendrils arrested mid-bloom",
    night: "vermilion and coral ink glowing in dark water, high-speed photograph",
    day: "black and vermilion ink in bright water, sumi-e restraint, white air",
    tint: "ink in water, fine tendrils, calligraphic, restrained",
  },
  mercury: {
    subject: "a slow river of liquid mirror-chrome winding through a plain, molten metal beads along its banks",
    night: "flowing liquid chrome with sharp studio reflections in a black void, one soft key light",
    day: "molten mirror-chrome with soft silver reflections in pale bright air",
    tint: "liquid chrome, mirror reflections, cold and precise",
  },
  smoke: {
    subject: "a mountain ridge sculpted from dense smoke frozen mid-swirl, fine volumetric tendrils",
    night: "white smoke against pure darkness, a single hard side light, high-speed photograph look",
    day: "soft pale grey smoke in bright airy light, delicate translucent wisps",
    tint: "made of smoke, volumetric, frozen mid-swirl, hushed",
  },
  thread: {
    subject: "a rolling landscape embroidered in silk thread on linen, visible individual stitches",
    night: "gold and crimson silk on dark linen, subtle sheen, macro photograph, moody single light",
    day: "gilded gold and crimson silk on white linen, delicate even light",
    tint: "embroidered in silk thread, visible stitches, handmade",
  },
  circuit: {
    subject: "a city skyline etched as fine gold circuit traces and pads with a few tiny glowing green LEDs",
    night: "macro of a matte black circuit board, thin luminous traces, subtle depth",
    day: "fine dark copper traces etched on a pale board, macro, even light",
    tint: "etched circuit traces, precise, geometric, quietly technical",
  },
  veil: {
    subject: "a still lake under folds of a translucent aurora curtain, drapery of light with faint stars",
    night: "green and violet aurora light over darkness, long-exposure look",
    day: "pale watercolour aurora ribbons in a bright morning sky, airy",
    tint: "aurora light, translucent drapery, vast and silent",
  },
  ferro: {
    subject: "a garden of glossy black ferrofluid blooms with sharp magnetic spikes, liquid metal sheen",
    night: "glossy black ferrofluid, strong specular highlights, one rim light, studio black",
    day: "dark ferrofluid spikes in pale studio light, sharp and clean",
    tint: "ferrofluid, magnetic spikes, glossy liquid metal",
  },
  porcelain: {
    subject: "a shoreline of thin backlit porcelain relief, light glowing through translucent bone china",
    night: "warm light through bone china in a dark room, embossed detail",
    day: "white porcelain with delicate cobalt blue painted edges, soft bright light",
    tint: "translucent porcelain, backlit, fragile and calm",
  },
  sand: {
    subject: "long dunes drawn as deep incised lines in sand, long shadows inside the grooves",
    night: "wet dark sand catching low golden light, tide foam at the far edge",
    day: "pale dry sand, a low sun raking across, soft long shadows, photograph",
    tint: "incised sand, raking light, long shadows, patient",
  },
  plain: {
    subject: "a minimal still landscape of soft matte clay forms, simple geometry, generous empty space",
    night: "neutral grey-black matte clay in even dim studio light, minimal",
    day: "pale matte clay in soft even daylight, minimal, clean",
    tint: "minimal, matte, neutral, quiet",
  },
};
export const worldOf = (id) => WORLDS[id] || WORLDS.lum;

/** The active theme = the world: applyMaterial stamps `html[data-material]`; before the registry loads
 * (or with no registry at all) the farm's default — lum — speaks. */
export const activeWorld = () =>
  (typeof document !== "undefined" && document.documentElement.getAttribute("data-material")) || "lum";

// The wallpaper contract and the light of each mode — the client's "system prompt". The theme is read off
// the document when a race starts, so a light-mode phone gets pictures lit for paper, a dark one for black.
export const SYSTEM = {
  base: "a full-bleed wallpaper, cinematic, extremely detailed, the subject off-centre with generous empty space around it, no text, no letters, no watermark, no logo, no frame, no border",
  dark: "night, deep darkness, low-key lighting, one source of light, luminous details, black shadows",
  light: "daylight, high-key, airy, bright and soft, pale tones, gentle haze",
};

/**
 * The whole prompt for one race. `subject` is the scene in English; `userDriven` says the owner's own words
 * are behind it — then the subject leads and the world contributes only its mood tint (owner: "70% на 30%,
 * де текст юзера сильніший"). Kept under the edge's 800-character slice.
 */
export function composePrompt(subject, world, mode, userDriven = false) {
  const m = mode === "light" ? "light" : "dark";
  const style = userDriven ? world.tint : world[m === "light" ? "day" : "night"];
  return [subject?.trim() || world.subject, style, SYSTEM[m], SYSTEM.base].filter(Boolean).join(", ").slice(0, 800);
}

/** How many generic fallback lines the locales carry (`l_1..l_N`) — used only offline/under the gate. */
export const LINES = 6;

// A deterministic frame for the gate: portrait, no network (mirage's mockArt shape).
export const mockFrame = (seed, mode) => {
  const l = mode === "light" ? [88, 74, 58] : [34, 18, 6];
  const s = (seed * 2654435761) % 40, hue = (seed * 47) % 360;
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 160"><defs><radialGradient id="g" cx=".${3 + (s % 4)}" cy=".3" r=".9">` +
    `<stop offset="0" stop-color="hsl(${(hue + s) % 360} 55% ${l[0]}%)"/><stop offset=".5" stop-color="hsl(${(hue + 30) % 360} 45% ${l[1]}%)"/>` +
    `<stop offset="1" stop-color="hsl(${(hue + 200) % 360} 40% ${l[2]}%)"/></radialGradient></defs><rect width="90" height="160" fill="url(#g)"/></svg>`)}`;
};
