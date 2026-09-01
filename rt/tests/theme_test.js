// DreamStudio's material — the LUMINOUS contract (docs/research/luminous-icons.md), pinned on rt/theme.css.
// The core's runtime.css holds the structure and its own neutral suite; this one holds what makes the BRAND:
// the true-black page, the rim on every surface, the bloom on the lifted ones, the sprites every hook
// reaches for, and the two poles text-safe in both modes.
import { assert, assertEquals } from "jsr:@std/assert@1";

const css = await Deno.readTextFile(new URL("../theme.css", import.meta.url));

// A theme is declared in MORE THAN ONE block (the palette, then the material's tokens), so reading "the
// block after the selector" answers a different question than the one being asked. Collect them all.
const themeBlock = (t) => {
  let out = "", i = -1;
  while ((i = css.indexOf(`[data-theme="${t}"] {`, i + 1)) > -1) out += css.slice(i, css.indexOf("\n}", i)) + "\n";
  return out;
};
const value = (b, v) => { const d = b.slice(b.indexOf(v + ":")); return d.slice(0, d.indexOf(";")); };

Deno.test("the material: light IS the structure — a rim on every surface, a bloom on the lifted ones, a black page", () => {
  assert(/^@import "\.\/runtime\.css";/m.test(css), "rt/theme.css must @import the core's runtime.css FIRST — the brand is a layer on the structure, not a copy of it");

  for (const theme of ["signal", "signal-light"]) {
    const b = themeBlock(theme);
    // 1. The three terms exist and are NAMED, so a rule composes them instead of restating an rgba.
    for (const v of ["--lm-rim", "--lm-rim-hi", "--lm-rim-lo", "--lm-bloom", "--nm-cast"]) {
      assert(b.includes(v + ":"), `${theme} does not define ${v} — the rim and the bloom are the material`);
    }
    // 2. Every composed surface carries a RIM — a `0 0 0 1px` ring — because on a black page a surface with
    //    no lit edge simply is not there. Raised and pressed surfaces also carry a bloom; a well does not.
    const ring = /(?:^|,|:)\s*(?:inset\s+)?0 0 0 1px var\(--lm-(?:rim|rim-lo|bloom-hi)\)/;
    for (const v of ["--sf-drop", "--sf-lift2", "--sf-sink", "--sf-sink2", "--sf-press"]) {
      assert(b.includes(v + ":"), `${theme} does not define ${v}`);
      assert(ring.test(value(b, v)), `${theme} ${v} has no rim — a surface with no lit edge is invisible on black`);
    }
    // The third term is the BLOOM on black; on paper a glow is a smear (measured on the icons), so the raised
    // surface casts instead — a soft warm shadow is what a lifted sheet of paper does.
    assert(/--lm-bloom\b|--nm-cast/.test(value(b, "--sf-drop")) && value(b, "--sf-drop").includes("--lm-rim-hi"),
      `${theme} --sf-drop must carry the top edge AND a bloom (dark) or a cast (paper)`);
    assert(value(b, "--sf-press").includes("--lm-bloom-hi"), `${theme} --sf-press must turn the rim to accent — pressing something LIGHTS it`);
    assert(/inset 0 \d+px \d+px rgba\(/.test(value(b, "--sf-sink")), `${theme} --sf-sink needs a dark inner top — a well the light does not reach`);
    assert(!/--lm-bloom\b/.test(value(b, "--sf-sink")), `${theme} --sf-sink glows — a recess does not catch light`);
    // 3. base-100 === base-200: a raised surface is the page with a lit edge, not a lighter panel.
    const tok = (n) => /#[0-9A-Fa-f]{6}/.exec(b.slice(b.indexOf(`--color-${n}:`)))[0].toUpperCase();
    assertEquals(tok("base-100"), tok("base-200"), `${theme}: base-100 and base-200 differ`);
    // 4. No 45° pair survives anywhere in the material.
    for (const v of ["--sf-drop", "--sf-lift2", "--sf-sink", "--sf-sink2", "--sf-press"]) {
      assert(!/(\d+)px \1px \d+px/.test(value(b, v)), `${theme} ${v} carries a 45° offset pair — that is the extrusion, not light`);
    }
    // 5. Every hook reaches a sprite that exists in rt/ — a url() to a missing file is a silent nothing.
    for (const v of ["--ds-strand", "--ds-scatter", "--ds-corner", "--ds-theme-art"]) {
      const m = /url\("\/_rt\/(ds-[a-z]-[a-z]+\.webp)"\)/.exec(value(b, v));
      assert(m, `${theme} ${v} does not name a sprite`);
      assert(Deno.statSync(new URL(`../${m[1]}`, import.meta.url)).isFile, `${theme} ${v} names ${m[1]}, which is not in rt/`);
    }
  }

  // 6. The dark page is TRUE BLACK — the ground the 75 icons were generated on; the light one is paper.
  assertEquals(/--color-base-100:\s*(#[0-9A-Fa-f]{6})/.exec(themeBlock("signal"))[1].toUpperCase(), "#000000", "the dark page must be #000000 — the icons' own ground");
  assert(/--color-base-100:\s*#(?!FFFFFF)[0-9A-Fa-f]{6}/i.test(themeBlock("signal-light")), "the light page must be paper, not #FFFFFF");
  // 7. The pair of light is declared once, as hexes, on :root — render.js reads them off getComputedStyle.
  assert(/:root\s*\{[^}]*--app-accent:\s*#F2B84B/i.test(css) && /--app-accent-2:\s*#5CE4DC/i.test(css), "the pair is amber #F2B84B + cyan #5CE4DC");
});

Deno.test("the material: the pair of light is text-safe in BOTH modes — the CI-only trap", () => {
  const tokens = (theme) => {
    const i = css.indexOf(`[data-theme="${theme}"] {`);
    const out = {};
    for (const m of css.slice(i, css.indexOf("}", i)).matchAll(/(--color-[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)) out[m[1]] = m[2];
    return out;
  };
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lin = (v) => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  const relLum = (p) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
  const ratio = (a, b) => { const [x, y] = [relLum(a), relLum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const over = (fg, a, bg) => fg.map((v, i) => a * v + (1 - a) * bg[i]);
  for (const theme of ["signal", "signal-light"]) {
    const t = tokens(theme);
    const bed = { "base-100": rgb(t["--color-base-100"]), "base-200": rgb(t["--color-base-200"]), "base-300": rgb(t["--color-base-300"]) };
    bed["primary/10 on base-100"] = over(rgb(t["--color-primary"]), 0.10, bed["base-100"]);
    for (const pole of ["secondary", "accent", "info"]) {
      const fg = rgb(t[`--color-${pole}`]);
      for (const [surface, px] of Object.entries(bed)) {
        const r = ratio(fg, px);
        assert(r >= 4.5, `${theme}: --color-${pole} as TEXT on ${surface} is ${r.toFixed(2)}:1 — text-${pole} fails axe farm-wide`);
      }
      const r = ratio(rgb(t[`--color-${pole}-content`]), fg);
      assert(r >= 4.5, `${theme}: --color-${pole}-content on --color-${pole} is ${r.toFixed(2)}:1 — badge-${pole} fails axe`);
    }
    // muted ink clears 4.5:1 on every bed too — it is a token precisely so this can be checked
    const muted = rgb(t["--color-base-muted"]);
    for (const [surface, px] of Object.entries(bed)) assert(ratio(muted, px) >= 4.5, `${theme}: muted ink on ${surface} is ${ratio(muted, px).toFixed(2)}:1`);
  }
});
