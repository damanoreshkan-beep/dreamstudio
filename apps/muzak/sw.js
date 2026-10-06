const ver = "1.0.0";
const cache = `muzak-${ver}`;
const urls = ["/store/muzak/", "/store/muzak/index.html", "/store/muzak/view.js", "/store/muzak/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(cache).then((c) => c.addAll(urls)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== cache).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request).then((r) => {
      if (!r || r.status !== 200 || r.type === "basic" && !e.request.url.startsWith("http")) return r;
      const c = r.clone();
      caches.open(cache).then((ch) => ch.put(e.request, c));
      return r;
    }).catch(() => new Response("offline", { status: 503 })))
  );
});
