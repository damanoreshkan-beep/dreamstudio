// mascot thumbs: 1024 PNG master → 384 webp q80 into rt/theme-<id>.webp (the picker's round picture)
import { encode as encodeWebp } from "npm:@jsquash/webp@1.4.0";
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";
await initWasm(fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm"));
const b64 = (b) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const PICK = { lum: "kz_lum_a", paper: "kz_paper_a", ink: "kz_ink_a", mercury: "kz_mercury_a", plain: "kz_plain_b" };
const [dir, out] = Deno.args;
for (const [id, name] of Object.entries(PICK)) {
  const png = await Deno.readFile(`${dir}/${name}.png`);
  const r = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><image width="1024" height="1024" href="data:image/png;base64,${b64(png)}"/></svg>`, { fitTo: { mode: "width", value: 384 } }).render();
  const px = r.pixels;
  const w = new Uint8Array(await encodeWebp({ data: new Uint8ClampedArray(px.buffer, px.byteOffset, px.byteLength), width: 384, height: 384 }, { quality: 80 }));
  await Deno.writeFile(`${out}/theme-${id}.webp`, w);
  console.log(`theme-${id}.webp ${(w.length / 1024).toFixed(0)}KB`);
}
