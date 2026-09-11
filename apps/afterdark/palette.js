// afterdark — the STAGE PALETTE, read from the active farm theme (owner, 2026-09-11: the lighting's colour
// scheme follows the theme, and a light theme lights the floor as DAY). Every theme publishes its tokens as CSS
// custom properties on the root; this reads the ones the stage lights with and packs them as EIGHT vec4s — the
// shape /_rt/glstage.js hands a shader as `points[8]`, and dancers.js reads the same array for its lights:
//   0..3  washes   the four coloured lights the chase steps through: app accent · secondary · accent · warning
//   4     sun      the haze / sun tint (warning = the theme's warm tone)
//   5     bgTop    the room's far tone (near-black at night, the theme's paper by day)
//   6     bgBot    the floor's far tone
//   7     key      the white-ish key light (primary)
// Colours are parsed by the canvas (so hex, rgb() and oklch() all read), cached per string, and the view eases
// the packed array frame to frame so a theme toggle cross-fades instead of snapping.

export const SLOTS = 8;
const FALLBACK = { washes: ["#FF3EB5", "#8B5CF6", "#39FF6A", "#F5B942"], sun: "#F5B942", key: "#FFE9F4", base: "#0A0510", content: "#F2EEE6" };
const cache = new Map();
let cv = null;
function rgb(str) {
  const s = (str || "").trim();
  if (!s) return null;
  if (cache.has(s)) return cache.get(s);
  let out = null;
  try {
    cv ||= document.createElement("canvas"); cv.width = cv.height = 1;
    const g = cv.getContext("2d", { willReadFrequently: true });
    g.clearRect(0, 0, 1, 1); g.fillStyle = "#000"; g.fillStyle = s;
    if (g.fillStyle !== "#000000" || /^#0{3,6}$|^black$/i.test(s)) { g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; out = [d[0] / 255, d[1] / 255, d[2] / 255]; }
  } catch { out = null; }
  cache.set(s, out);
  return out;
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const WHITE = [1, 1, 1];

/** Is the applied theme a light one? (`<id>-light` — the runtime's own convention, glstage keys env.x on it.) */
export function isDay() { return typeof document !== "undefined" && (document.documentElement.getAttribute("data-theme") || "").includes("light"); }

/** The packed palette for the CURRENT theme: Float32Array(32) = 8 × [r, g, b, 1]. */
export function readPalette() {
  const out = new Float32Array(SLOTS * 4);
  let get = () => "";
  try { const cs = getComputedStyle(document.documentElement); get = (k) => cs.getPropertyValue(k); } catch { /* no DOM: fallback */ }
  const day = isDay();
  const tok = (k, fb) => rgb(get(k)) || rgb(fb);
  // a light theme's tokens are DARK (ink on paper) — as coloured light in daylight they are lifted toward white
  const washes = [tok("--app-accent", FALLBACK.washes[0]), tok("--color-secondary", FALLBACK.washes[1]), tok("--color-accent", FALLBACK.washes[2]), tok("--color-warning", FALLBACK.washes[3])]
    .map((c) => day ? mix(c, WHITE, 0.4) : c);
  const sun = tok("--color-warning", FALLBACK.sun);
  const base = tok("--color-base-100", FALLBACK.base);
  const primary = tok("--color-primary", FALLBACK.key);
  // the room: at night the theme's base sinks to near-black with a breath of the app accent; by day it is the
  // theme's paper, lifted toward white at the top and warmed toward the sun on the floor
  const bgTop = day ? mix(base, WHITE, 0.12) : mix(scale(base, 0.35), washes[0], 0.06);
  const bgBot = day ? mix(base, sun, 0.22) : scale(base, 0.12);
  // the key light: a warm white — by day the sun itself; at night the theme's primary, pulled toward white
  const key = day ? mix(sun, WHITE, 0.55) : mix(primary, WHITE, 0.5);
  const slots = [...washes, sun, bgTop, bgBot, key];
  slots.forEach((c, i) => { out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 1; });
  return out;
}
