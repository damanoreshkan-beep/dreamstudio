// character cards: 1024 PNG master → 256 webp q80, opaque on its black ground, into <out-dir>/ch-<id>.webp
//   deno run -A docs/research/mascot-tools/cards.mjs <png-dir> <out-dir>
import { encode as encodeWebp } from "npm:@jsquash/webp@1.4.0";
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";
await initWasm(fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm"));
const b64 = (b) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const SIZE = 256;
const [dir, out] = Deno.args;
const names = [];
for await (const e of Deno.readDir(dir)) if (e.isFile && e.name.endsWith(".png")) names.push(e.name.slice(0, -4));
for (const id of names.sort()) {
  const png = await Deno.readFile(`${dir}/${id}.png`);
  const r = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><image width="1024" height="1024" href="data:image/png;base64,${b64(png)}"/></svg>`, { fitTo: { mode: "width", value: SIZE } }).render();
  const px = new Uint8ClampedArray(r.pixels.buffer, r.pixels.byteOffset, r.pixels.byteLength);
  for (let i = 3; i < px.length; i += 4) px[i] = 255;
  const w = new Uint8Array(await encodeWebp({ data: px, width: SIZE, height: SIZE }, { quality: 80 }));
  await Deno.writeFile(`${out}/ch-${id}.webp`, w);
  console.log(`ch-${id}.webp ${(w.length / 1024).toFixed(0)}KB`);
}
