// Alpha extents of the theme sprites in rt/: per-row alpha mass → where the art sits in the square, so every
// decor offset is a MEASUREMENT (docs/research/themes.md).  deno run -A measure.mjs [prefix]
import { decode } from "npm:@jsquash/webp@1.4.0";
const dir = new URL("../../../rt/", import.meta.url);
const prefix = Deno.args[0] ? `ds-${Deno.args[0]}-` : "ds-";
for (const f of [...Deno.readDirSync(dir)].map((e) => e.name).filter((n) => n.startsWith(prefix) && n.endsWith(".webp")).sort()) {
  const { width: w, height: h, data } = await decode(Deno.readFileSync(new URL(f, dir)));
  const rows = new Float64Array(h), cols = new Float64Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const a = data[(y * w + x) * 4 + 3]; rows[y] += a; cols[x] += a; }
  const ext = (arr, n, thr) => { const m = Math.max(...arr); let a = -1, b = -1; for (let i = 0; i < n; i++) if (arr[i] > m * thr) { if (a < 0) a = i; b = i; } return [a, b]; };
  const [r0, r1] = ext(rows, h, 0.08), [c0, c1] = ext(cols, w, 0.08), [rc0, rc1] = ext(rows, h, 0.5);
  let peak = 0; for (let y = 0; y < h; y++) if (rows[y] > rows[peak]) peak = y;
  console.log(`${f.padEnd(28)} ${w}x${h}  rows ${r0}-${r1} (${((r0 / h) * 100).toFixed(0)}–${((r1 / h) * 100).toFixed(0)}%)  core ${rc0}-${rc1}  peak ${peak} (${((peak / h) * 100).toFixed(0)}%)  cols ${c0}-${c1}`);
}
