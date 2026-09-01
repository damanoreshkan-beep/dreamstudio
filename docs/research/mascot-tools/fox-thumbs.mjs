// The picker's round pictures — mirage's curled fox in each theme's material (the owner's pick over the
// cat, 2026-09-01): 1024 PNG master → 384 webp q80 into rt/theme-<id>.webp.
//   deno run -A fox-thumbs.mjs <out-dir> lum=<png> paper=<png> ink=<png> mercury=<png> plain=<png>
import { encode as encodeWebp } from "npm:@jsquash/webp@1.4.0";
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";
await initWasm(fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm"));
const b64 = (b) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const [out, ...pairs] = Deno.args;
for (const p of pairs) {
  const [id, src] = p.split("=");
  const png = await Deno.readFile(src);
  const r = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><image width="1024" height="1024" href="data:image/png;base64,${b64(png)}"/></svg>`, { fitTo: { mode: "width", value: 384 } }).render();
  const px = r.pixels;
  const w = new Uint8Array(await encodeWebp({ data: new Uint8ClampedArray(px.buffer, px.byteOffset, px.byteLength), width: 384, height: 384 }, { quality: 80 }));
  await Deno.writeFile(`${out}/theme-${id}.webp`, w);
  console.log(`theme-${id}.webp ${(w.length / 1024).toFixed(0)}KB`);
}
