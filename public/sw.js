// Offline cache with correct update behavior.
//
// Navigations are network-first (so a new deploy is picked up as soon as you're
// online), falling back to cache when offline. Hashed build assets are
// cache-first (their names change every build, so this is safe and fast).
// Bumping CACHE wipes old entries on activation.
const CACHE = "ips-v26";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isNavigation =
    req.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith("/") || url.pathname.endsWith("index.html");

  if (isNavigation) {
    // Network-first: always try for the freshest app shell.
    e.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const c = await caches.open(CACHE);
          c.put(req, res.clone()).catch(() => {});
          return res;
        } catch {
          return (await caches.match(req)) || (await caches.match("./")) || Response.error();
        }
      })(),
    );
    return;
  }

  // Cache-first for immutable, content-hashed assets.
  e.respondWith(
    (async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(() => {});
      return res;
    })(),
  );
});
