const ORIGIN = "https://dreamstudio.mooo.com";
const CERT_SHA256 =
  "54:34:F0:62:9F:97:41:CD:53:82:DB:25:4C:42:1E:CB:5F:45:0A:ED:43:8A:9B:DA:62:F0:26:C2:8E:73:4F:77";
const DIST = "dist";

async function packageName(url) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url));
  const hex = [...new Uint8Array(digest).subarray(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return "apk.microspec.a" + hex;
}

const ids = [];
for await (const e of Deno.readDir(DIST)) {
  if (!e.isDirectory || e.name === "_rt" || e.name.startsWith(".")) continue;
  try {
    if ((await Deno.stat(`${DIST}/${e.name}/index.html`)).isFile) ids.push(e.name);
  } catch { }
}
ids.sort();

const statements = [];
for (const id of ids) {
  statements.push({
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: await packageName(`${ORIGIN}/${id}/`),
      sha256_cert_fingerprints: [CERT_SHA256],
    },
  });
}

await Deno.mkdir(`${DIST}/.well-known`, { recursive: true });
await Deno.writeTextFile(`${DIST}/.well-known/assetlinks.json`, JSON.stringify(statements, null, 2) + "\n");
console.log(`assetlinks: ${statements.length} apps → ${DIST}/.well-known/assetlinks.json`);
