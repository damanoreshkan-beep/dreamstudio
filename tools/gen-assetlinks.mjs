// Generate dist/.well-known/assetlinks.json — Android App Links / Digital Asset Links for the farm's APK
// shells. Run AFTER `deno task build`, BEFORE the rsync to the VPS web root (see .github/workflows/deploy.yml).
// Serving: nginx serves the whole dist/ at the site root and rsync -a preserves dot-directories (as it does
// for dist/.nojekyll), so this file lands at https://dreamstudio.mooo.com/.well-known/assetlinks.json.
//
// Each installable app is wrapped by microspec-edge into its OWN signed APK whose package name is
//   "apk.microspec.a" + SHA-256(startUrl)[0..8 bytes as hex]        (microspec-edge edge/apk/pkgid.js)
// The start URL the edge bakes for a first-party app is canonical — origin + pathname, no query/hash
// (microspec-edge edge/apkgen.js) — i.e. https://dreamstudio.mooo.com/<app>/ . Every APK is signed with ONE
// key; its self-signed cert's SHA-256 is below (microspec-edge edge/apk/cert.js — this is PUBLIC, it is the
// hash of a certificate, not key material; regenerate it via that repo's apk/genkey.ts if the key is rotated).
//
// One statement per package: Android verifies each package against this file for the host. handle_all_urls
// lets a verified farm app open ANY dreamstudio.mooo.com link — MainActivity routes it by the tapped URL.

const ORIGIN = "https://dreamstudio.mooo.com";
const CERT_SHA256 =
  "54:34:F0:62:9F:97:41:CD:53:82:DB:25:4C:42:1E:CB:5F:45:0A:ED:43:8A:9B:DA:62:F0:26:C2:8E:73:4F:77";
const DIST = "dist";

async function packageName(url) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url));
  const hex = [...new Uint8Array(digest).subarray(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return "apk.microspec.a" + hex;
}

// The installable apps are the built app directories — each has its own index.html. `_rt` is the shared
// runtime (not an app) and the root index.html is only a redirect to /store/, so neither is enumerated.
const ids = [];
for await (const e of Deno.readDir(DIST)) {
  if (!e.isDirectory || e.name === "_rt" || e.name.startsWith(".")) continue;
  try {
    if ((await Deno.stat(`${DIST}/${e.name}/index.html`)).isFile) ids.push(e.name);
  } catch { /* not an app directory */ }
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
