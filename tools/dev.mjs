import { serveDir } from "jsr:@std/http@1/file-server";

const app = Deno.args[0];
if (!app) { console.error("usage: deno task dev <appid>"); Deno.exit(1); }
const ROOT = Deno.cwd();
const appdir = `${ROOT}/apps/${app}`;
try { if (!Deno.statSync(appdir).isDirectory) throw 0; } catch { console.error("no such app:", appdir); Deno.exit(1); }

const RT_OVERLAY = `${ROOT}/rt`;
const localRuntime = `${ROOT}/../packages/runtime`;
let RT_CORE;
try {
  RT_CORE = Deno.statSync(`${localRuntime}/gate.js`).isFile ? localRuntime : null;
} catch { RT_CORE = null; }
if (!RT_CORE) { const g = new URL(import.meta.resolve("@microspec/core/runtime/gate.js")).pathname; RT_CORE = g.slice(0, g.lastIndexOf("/")); }
console.log(`  /_rt core source: ${RT_CORE.includes("/packages/runtime") && !RT_CORE.includes("node_modules") ? "local framework (live)" : "installed @microspec/core"}`);

const HEAD_KILL = `<script>try{navigator.serviceWorker&&navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()));window.caches&&caches.keys().then(ks=>ks.forEach(k=>caches.delete(k)));}catch(_){}</script>`;
const RELOAD = `<script>(()=>{const c=()=>{const e=new EventSource("/__dev");e.onmessage=m=>{if(m.data==="reload")location.reload()};e.onerror=()=>{e.close();setTimeout(c,1000)}};c()})()</script>`;
const clients = new Set();
const noStore = (res) => { try { res.headers.set("cache-control", "no-store"); } catch { } return res; };

async function handler(req) {
  const u = new URL(req.url);
  if (/\/sw\.js$/.test(u.pathname)) return new Response(`self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",(e)=>e.waitUntil(self.clients.claim()));`, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" } });
  if (u.pathname === "/__dev") {
    let ref;
    const body = new ReadableStream({
      start(c) { ref = c; clients.add(c); c.enqueue(new TextEncoder().encode(": connected\n\n")); },
      cancel() { clients.delete(ref); },
    });
    return new Response(body, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" } });
  }
  const fresh = new Request(req.url, { method: "GET", headers: (() => { const h = new Headers(req.headers); h.delete("if-none-match"); h.delete("if-modified-since"); return h; })() });
  if (u.pathname.startsWith("/_rt/")) {
    let o;
    try { o = await serveDir(fresh, { fsRoot: RT_OVERLAY, urlRoot: "_rt", quiet: true }); } catch { }
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
const iface = (() => { try { for (const n of Deno.networkInterfaces()) if (n.family === "IPv4" && !n.address.startsWith("127.")) return n.address; } catch { } return "<LAN-IP>"; })();
console.log(`\n  jobx dev · ${app}\n  mock:  http://localhost:${PORT}/${app}/\n  real:  http://${iface}:${PORT}/${app}/   ← open this for live data + WebGL\n  live-reload on save. Ctrl+C to stop.\n`);
Deno.serve({ port: PORT, hostname: "0.0.0.0" }, handler);
