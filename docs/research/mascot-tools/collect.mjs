// collect.mjs <out-dir> <b64-lines-file>… → writes <out-dir>/<name>.png (later lines win) and prints the names
const [outDir, ...files] = Deno.args;
await Deno.mkdir(outDir, { recursive: true });
const seen = new Map();
for (const f of files) {
  const txt = await Deno.readTextFile(f).catch(() => "");
  for (const l of txt.split("\n")) {
    if (!l.includes("|")) continue;
    const [n, by, res, ct, b64] = l.split("|");
    if (!b64 || !ct?.startsWith("image/")) continue;
    await Deno.writeFile(`${outDir}/${n}.png`, Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    seen.set(n, res);
  }
}
console.log([...seen.keys()].sort().join(" "));
console.log(seen.size, "pictures");
