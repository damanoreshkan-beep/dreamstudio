// dev.mjs — fast local preview with live-reload. NO build, NO JSR publish.
//
// The 2-min/160MB `deno task build` is a RELEASE step, not the inner loop. This serves an app straight from
// source: /_rt/* overlay-first (the product's rt/ shadows the installed @microspec/core runtime, exactly as
// the build layers them), and the app's own files from apps/<id>/. Apps reach the backend through ABSOLUTE
// URLs (dreamstudio.mooo.com/feed, /kyiv), so live data + the Kyiv geometry work against prod with no local
// backend. An SSE channel + a watcher reload the browser on every save (~1s edit→see).
//
//   deno task dev <appid>
//     http://localhost:8123/<id>/        → gate/mock (hostname is localhost): fixtures, WebGL still runs
//     http://<LAN-IP>:8123/<id>/         → the REAL app: gate=false → live data + WebGL (deck.gl 3D map)
//
// The LAN-IP URL is the one to open for a rich app — non-localhost means gate.js reports isGate=false, so the
// app shows live data instead of its fixture (WebGL is probe-guarded and runs either way). Pattern is the
// canonical Deno one: @std/http serveDir + Deno.watchFs + an injected EventSource client (SSE, one-way,
// auto-reconnecting) — no bundler, no dependency beyond the std lib.
import { serveDir } from "jsr:@std/http@1/file-server";

const app = Deno.args[0];
if (!app) { console.error("usage: deno task dev <appid>"); Deno.exit(1); }
const ROOT = Deno.cwd();
const appdir = `${ROOT}/apps/${app}`;
try { if (!Deno.statSync(appdir).isDirectory) throw 0; } catch { console.error("no such app:", appdir); Deno.exit(1); }

const RT_OVERLAY = `${ROOT}/rt`;                                              // the product's runtime overlay
// Prefer a LOCAL framework checkout (../packages/runtime) so edits to the shared runtime are picked up in the
// dev loop with no JSR publish (the safe, no-`links` form of Deno's local-package dev). Fall back to the
// installed @microspec/core when the framework isn't checked out beside the product.
const localRuntime = `${ROOT}/../packages/runtime`;
let RT_CORE;
try {
  RT_CORE = Deno.statSync(`${localRuntime}/gate.js`).isFile ? localRuntime : null;
} catch { RT_CORE = null; }
if (!RT_CORE) { const g = new URL(import.meta.resolve("@microspec/core/runtime/gate.js")).pathname; RT_CORE = g.slice(0, g.lastIndexOf("/")); }
console.log(`  /_rt core source: ${RT_CORE.includes("/packages/runtime") && !RT_CORE.includes("node_modules") ? "local framework (live)" : "installed @microspec/core"}`);

// Cache-first per-app service workers would serve a STALE shell on every reload (the new version only lands on
// the next launch), which fights live-reload. In dev we neutralise the SW: any sw.js is a self-unregistering
// worker, and the injected boot script drops any already-registered SW + its caches. So a save is seen at once.
// Neutralise the service worker IN THE HEAD, before the app boots: unregister any existing SW, clear its
// caches, and stub register() to a no-op. Without this the cache-first SW serves a stale shell on every reload
// (and the runtime pops a "new version — restart" overlay) — both of which fight live-reload. Runs in <head>
// so the runtime's own registerSW() call is already a no-op by the time it fires.
// Drop any already-registered SW + its caches. We do NOT touch navigator.serviceWorker.register (reassigning
// it breaks the runtime's boot); instead the dev server serves sw.js as 404, so the runtime's registration
// simply rejects (best-effort) — no SW installs, no cache, no "new version" overlay.
const HEAD_KILL = `<script>try{navigator.serviceWorker&&navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()));window.caches&&caches.keys().then(ks=>ks.forEach(k=>caches.delete(k)));}catch(_){}</script>`;
const RELOAD = `<script>(()=>{const c=()=>{const e=new EventSource("/__dev");e.onmessage=m=>{if(m.data==="reload")location.reload()};e.onerror=()=>{e.close();setTimeout(c,1000)}};c()})()</script>`;
const clients = new Set();
// Dev never caches: every module/asset is served no-store so a reload always gets the current bytes (a stale
// module cache is how a fresh gesture.js ends up importing an old swipe.js and the app dies on a SyntaxError).
const noStore = (res) => { try { res.headers.set("cache-control", "no-store"); } catch { /* immutable */ } return res; };

async function handler(req) {
  const u = new URL(req.url);
  // A STABLE, non-caching pass-through SW: it registers (so the runtime's boot proceeds) and activates at once,
  // but has NO fetch handler, so the browser fetches everything fresh — nothing is cached. Stable bytes mean it
  // never "updates", so the runtime's "new version" overlay never fires. HEAD_KILL first drops any prior real SW.
  if (/\/sw\.js$/.test(u.pathname)) return new Response(`self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",(e)=>e.waitUntil(self.clients.claim()));`, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" } });
  if (u.pathname === "/__dev") {
    let ref;
    const body = new ReadableStream({
      start(c) { ref = c; clients.add(c); c.enqueue(new TextEncoder().encode(": connected\n\n")); },
      cancel() { clients.delete(ref); },
    });
    return new Response(body, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" } });
  }
  // Drop conditional headers so serveDir never answers 304 (a 304 would keep the browser on a stale module,
  // and we can't inject into a null-body 304). Always a full, fresh 200.
  const fresh = new Request(req.url, { method: "GET", headers: (() => { const h = new Headers(req.headers); h.delete("if-none-match"); h.delete("if-modified-since"); return h; })() });
  if (u.pathname.startsWith("/_rt/")) {
    let o;
    try { o = await serveDir(fresh, { fsRoot: RT_OVERLAY, urlRoot: "_rt", quiet: true }); } catch { /* no overlay */ }
    if (!o || o.status === 404) o = await serveDir(fresh, { fsRoot: RT_CORE, urlRoot: "_rt", quiet: true });
    return noStore(o);
  }
  const res = noStore(await serveDir(fresh, { fsRoot: appdir, urlRoot: app, quiet: true }));
  if ((res.headers.get("content-type") || "").includes("text/html")) {
    let html = await res.text();
    html = html.includes("</head>") ? html.replace("</head>", HEAD_KILL + "</head>") : HEAD_KILL + html;
    html = html.includes("</body>") ? html.replace("</body>", RELOAD + "</body>") : html + RELOAD;
    const h = new Headers(res.headers); h.set("content-type", "text/html; charset=utf-8"); h.set("cache-control", "no-store"); h.delete("content-length");
    return new Response(html, { status: res.status, headers: h });
  }
  return res;
}

let timer;
const ping = () => { const d = new TextEncoder().encode("data: reload\n\n"); for (const c of [...clients]) { try { c.enqueue(d); } catch { clients.delete(c); } } };
(async () => {
  const w = Deno.watchFs([appdir, RT_OVERLAY, RT_CORE].filter((p) => { try { return Deno.statSync(p); } catch { return false; } }));
  for await (const _ of w) { clearTimeout(timer); timer = setTimeout(ping, 80); }
})();

const PORT = 8123;
const iface = (() => { try { for (const n of Deno.networkInterfaces()) if (n.family === "IPv4" && !n.address.startsWith("127.")) return n.address; } catch { /* */ } return "<LAN-IP>"; })();
console.log(`\n  jobx dev · ${app}\n  mock:  http://localhost:${PORT}/${app}/\n  real:  http://${iface}:${PORT}/${app}/   ← open this for live data + WebGL\n  live-reload on save. Ctrl+C to stop.\n`);
Deno.serve({ port: PORT, hostname: "0.0.0.0" }, handler);
