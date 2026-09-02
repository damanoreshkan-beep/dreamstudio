// DreamStudio's materials — every theme MODULE in rt/ (rt/theme-<id>.css, registered in rt/themes.json) holds
// the farm's universal invariants; the LUMINOUS contract (docs/research/luminous-icons.md) is pinned on
// theme-lum.css alone. The core's runtime.css holds the structure and its own neutral suite.
import { assert, assertEquals } from "jsr:@std/assert@1";

const RT = new URL("../", import.meta.url);
const registry = JSON.parse(await Deno.readTextFile(new URL("themes.json", RT)));
const themes = Object.fromEntries(await Promise.all(registry.map(async (m) => [m.id, await Deno.readTextFile(new URL(m.css, RT))])));

// A theme is declared in MORE THAN ONE block (the palette, then the material's tokens), so reading "the
// block after the selector" answers a different question than the one being asked. Collect them all —
// and for a module that only @imports (plain), read the imported file's blocks through the core's copy.
const CORE_RT = new URL("../node_modules/@microspec/core/packages/runtime/", RT);
const expand = async (css) => {
  // an @import is inlined BEFORE the importing text, as the cascade sees it — the brand's later declaration wins
  let head = "";
  for (const m of css.matchAll(/@import\s+"\.\/([\w.-]+\.css)";/g)) {
    const local = await Deno.readTextFile(new URL(m[1], RT)).catch(() => null);
    head += (local ? await expand(local) : await Deno.readTextFile(new URL(m[1], CORE_RT))) + "\n";
  }
  return head + css;
};
const themeBlock = (css, t) => {
  let out = "", i = -1;
  while ((i = css.indexOf(`[data-theme="${t}"] {`, i + 1)) > -1) out += css.slice(i, css.indexOf("\n}", i)) + "\n";
  return out;
};
const value = (b, v) => { const d = b.slice(b.lastIndexOf(v + ":")); return d.slice(0, d.indexOf(";")); };
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (v) => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const relLum = (p) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
const ratio = (a, b) => { const [x, y] = [relLum(a), relLum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const over = (fg, a, bg) => fg.map((v, i) => a * v + (1 - a) * bg[i]);
const lastTokens = (css, theme) => {
  // the LAST declaration wins in CSS, so the palette a brand declares after the import is the effective one
  const out = {};
  let i = -1;
  while ((i = css.indexOf(`[data-theme="${theme}"] {`, i + 1)) > -1) {
    for (const m of css.slice(i, css.indexOf("\n}", i)).matchAll(/(--color-[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)) out[m[1]] = m[2];
  }
  return out;
};

Deno.test("themes · the registry: every module exists, imports the structure first, and the default is what the page links", async () => {
  assert(registry.length >= 1 && registry[0].id === "lum", "the first entry is the default material; rt/theme.css must import it");
  const def = await Deno.readTextFile(new URL("theme.css", RT));
  assert(def.includes(`@import "./${registry[0].css}";`), "rt/theme.css does not import the registry's first entry — first paint and applied state would disagree");
  for (const m of registry) {
    assert(/^[a-z][a-z0-9-]*$/.test(m.id), `${m.id}: an id is a css-safe token`);
    assert(m.name?.en && m.name?.uk, `${m.id}: a name in both locales`);
    assert(/^@import "\.\/(runtime|theme-[\w-]+)\.css";/m.test(themes[m.id]), `${m.id}: a module @imports runtime.css (or another module) FIRST`);
    // the card's round picture is the mascot in that theme — a named thumb that is not in rt/ is a broken image on every profile
    if (m.thumb) assert((await Deno.stat(new URL(m.thumb, RT))).size > 0, `${m.id}: thumb ${m.thumb} missing from rt/`);
  }
});

Deno.test("themes · every material keeps the farm's laws: a ring on every surface, no 45° pair, one page tone, text-safe poles, muted ink a token", async () => {
  for (const m of registry) {
    const css = await expand(themes[m.id]);
    for (const theme of ["signal", "signal-light"]) {
      const b = themeBlock(css, theme);
      const ring = /(?:^|,|:)\s*(?:inset\s+)?0 0 0 1px var\(--lm-(?:rim|rim-lo|bloom-hi)\)/;
      for (const v of ["--sf-drop", "--sf-lift2", "--sf-sink", "--sf-sink2", "--sf-press"]) {
        assert(b.includes(v + ":"), `${m.id}/${theme} does not define ${v}`);
        assert(ring.test(value(b, v)), `${m.id}/${theme} ${v} has no rim`);
        assert(!/(\d+)px \1px \d+px/.test(value(b, v)), `${m.id}/${theme} ${v} carries a 45° offset pair — that is the extrusion, not light`);
      }
      const t = lastTokens(css, theme);
      assertEquals(t["--color-base-100"], t["--color-base-200"], `${m.id}/${theme}: base-100 and base-200 differ`);
      const bed = { "base-100": rgb(t["--color-base-100"]), "base-200": rgb(t["--color-base-200"]), "base-300": rgb(t["--color-base-300"]) };
      bed["primary/10 on base-100"] = over(rgb(t["--color-primary"]), 0.10, bed["base-100"]);
      for (const pole of ["secondary", "accent", "info"]) {
        const fg = rgb(t[`--color-${pole}`]);
        for (const [surface, px] of Object.entries(bed)) assert(ratio(fg, px) >= 4.5, `${m.id}/${theme}: --color-${pole} as TEXT on ${surface} is ${ratio(fg, px).toFixed(2)}:1 — text-${pole} fails axe`);
        assert(ratio(rgb(t[`--color-${pole}-content`]), fg) >= 4.5, `${m.id}/${theme}: --color-${pole}-content on --color-${pole} fails`);
      }
      const muted = rgb(t["--color-base-muted"]);
      for (const [surface, px] of Object.entries(bed)) assert(ratio(muted, px) >= 4.5, `${m.id}/${theme}: muted ink on ${surface} is ${ratio(muted, px).toFixed(2)}:1`);
      // every sprite a material names must exist in rt/ — a url() to a missing file is a silent nothing
      for (const u of b.matchAll(/url\("\/_rt\/([\w.-]+\.webp)"\)/g)) {
        assert(await Deno.stat(new URL(u[1], RT)).then((s) => s.isFile, () => false), `${m.id}/${theme} names ${u[1]}, which is not in rt/`);
      }
    }
  }
});

Deno.test("themes · lum — the LUMINOUS contract: true black, a bloom on the lifted, the pair of light, a sprite on every hook", async () => {
  const css = await expand(themes.lum);
  const dark = themeBlock(css, "signal"), light = themeBlock(css, "signal-light");
  assertEquals(/--color-base-100:\s*(#[0-9A-Fa-f]{6})/.exec(themes.lum.slice(themes.lum.indexOf('[data-theme="signal"] {')))[1].toUpperCase(), "#000000", "the dark page must be #000000 — the icons' own ground");
  assert(/--color-base-100:\s*#(?!FFFFFF)[0-9A-Fa-f]{6}/i.test(themes.lum.slice(themes.lum.indexOf('[data-theme="signal-light"] {'))), "the light page must be paper, not #FFFFFF");
  assert(/--lm-bloom\b/.test(value(dark, "--sf-drop")), "night's raised surface carries the bloom");
  assert(/--nm-cast/.test(value(light, "--sf-drop")), "paper's raised surface casts instead of glowing");
  assert(!/--lm-bloom\b/.test(value(dark, "--sf-sink")), "a well does not glow");
  assert(/--app-accent:\s*#F2B84B/i.test(themes.lum) && /--app-accent-2:\s*#5CE4DC/i.test(themes.lum), "the pair is amber #F2B84B + cyan #5CE4DC");
  for (const v of ["--ds-strand", "--ds-scatter", "--ds-corner"]) {
    assert(/url\("\/_rt\/ds-n-[a-z]+\.webp"\)/.test(value(dark, v)), `night ${v} names a sprite`);
    assert(/url\("\/_rt\/ds-d-[a-z]+\.webp"\)/.test(value(light, v)), `day ${v} names a sprite`);
  }
  assert(/--ds-art-day:\s*url\("\/_rt\/ds-d-sun\.webp"\)/.test(themes.lum) && /--ds-art-night:\s*url\("\/_rt\/ds-n-ring\.webp"\)/.test(themes.lum), "the widget's sun and moon are the gilded sun and the woven ring");
});

Deno.test("themes · a textured theme measures its decor: every hook that names a sprite carries the offsets decor.css reads, and both mode arts exist", async () => {
  for (const m of registry) {
    const css = await expand(themes[m.id]);
    const root = /:root\s*{([^}]*)}/.exec(themes[m.id])?.[1] || "";
    for (const theme of ["signal", "signal-light"]) {
      const b = themeBlock(css, theme);
      const named = (v) => /url\(/.test(value(b, v));
      // the header carries NO texture (owner 2026-09-02: "прибери текстури з хедеру системно") — the lip
      // hook is gone from decor.css, so a theme naming the token would set a value nobody reads
      assert(!b.includes("--ds-lip:"), `${m.id}/${theme}: --ds-lip is banned — the header carries no texture`);
      if (named("--ds-strand")) for (const v of ["--ds-strand-y", "--ds-strand-y-wide", "--ds-strand-a"]) assert(b.includes(v + ":"), `${m.id}/${theme}: --ds-strand without ${v}`);
      if (named("--ds-scatter")) for (const v of ["--ds-scatter-pos", "--ds-scatter-size", "--ds-scatter-a"]) assert(b.includes(v + ":"), `${m.id}/${theme}: --ds-scatter without ${v}`);
      if (named("--ds-corner")) assert(b.includes("--ds-corner-a:"), `${m.id}/${theme}: --ds-corner without --ds-corner-a`);
      // a hook with a sprite needs decor.css in the chain, or the token is a value nobody reads
      if (named("--ds-strand")) assert(/@import "\.\/decor\.css";/.test(themes[m.id]), `${m.id}: names sprites but does not import decor.css`);
    }
    for (const u of root.matchAll(/--ds-art-(?:day|night):\s*url\("\/_rt\/([\w.-]+\.webp)"\)/g)) {
      assert(await Deno.stat(new URL(u[1], RT)).then((s) => s.isFile, () => false), `${m.id}: mode art ${u[1]} is not in rt/`);
    }
  }
});
