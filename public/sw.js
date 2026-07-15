// Offline cache with correct update behavior.
//
// Navigations are network-first (so a new deploy is picked up as soon as you're
// online), falling back to cache when offline. Hashed build assets are
// cache-first (their names change every build, so this is safe and fast).
// Bumping CACHE wipes old entries on activation.
const CACHE = "ips-v52";
// The practice-library RAW files (~10 MB each) live in their own VERSION-STABLE
// cache that survives CACHE bumps — otherwise every release wipes them and a
// tap re-downloads megabytes the user already had. Their bytes are immutable
// content (binned once from the camera originals); if one is ever replaced
// under the same name, bump THIS version too.
const EXAMPLES = "ips-examples-v1";
const isExampleRaw = (url) => url.pathname.includes("/examples/") && url.pathname.endsWith(".dng");

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE && k !== EXAMPLES).map((k) => caches.delete(k)));
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

  // Cache-first for immutable, content-hashed assets. Practice-library RAWs
  // go to their own stable cache (see EXAMPLES above).
  e.respondWith(
    (async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      // Clone BEFORE returning: once respondWith starts consuming the body,
      // clone() throws and the cache write silently never happens (measured —
      // on a fast connection this raced and lost).
      const copy = res.clone();
      const bucket = isExampleRaw(url) ? EXAMPLES : CACHE;
      e.waitUntil(caches.open(bucket).then((c) => c.put(req, copy)).catch(() => {}));
      return res;
    })(),
  );
});
