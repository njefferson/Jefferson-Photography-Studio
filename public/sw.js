// Offline cache with correct update behavior.
//
// Navigations are network-first (so a new deploy is picked up as soon as you're
// online), falling back to cache when offline. Hashed build assets are
// cache-first (their names change every build, so this is safe and fast).
// A new CACHE name wipes old entries on activation — but the new cache is fully
// PRECACHED at install first (see below), so a fresh release works offline
// immediately instead of blacking out until the next online visit.
// The name is STAMPED AT BUILD TIME with the app's real version (vite.config.ts
// replaces the placeholder below) — it is not a version of its own and is never
// edited by hand. Every deploy is a new commit, so every deploy gets a fresh
// cache automatically. (Hand-numbered ips-v1…ips-v80 are pre-stamp history.)
const CACHE = "ips-" + "__BUILD_VERSION__";
// The whole app shell (HTML entries, hashed JS/CSS, fonts, icons, manifests) —
// injected at build time by the precache-manifest plugin (vite.config.ts) into
// the dist copy of this file. Empty in source so dev and direct reads stay
// valid; production always ships a populated list. Deliberately EXCLUDES the
// practice-photo examples (they load on demand into EXAMPLES, below).
const PRECACHE = [/* __PRECACHE_MANIFEST__ */];
// The practice-library RAW files (~10 MB each) live in their own VERSION-STABLE
// cache that survives CACHE bumps — otherwise every release wipes them and a
// tap re-downloads megabytes the user already had. Their bytes are immutable
// content (binned once from the camera originals); if one is ever replaced
// under the same name, bump THIS version too.
const EXAMPLES = "ips-examples-v1";
const isExampleRaw = (url) => url.pathname.includes("/examples/") && url.pathname.endsWith(".dng");

self.addEventListener("install", (e) => {
  // Populate the NEW cache BEFORE activating (the activate step wipes the old
  // one). addAll is all-or-nothing: if a fetch fails the install aborts and the
  // browser retries on the next visit while the OLD service worker keeps serving
  // — so a flaky network can never leave a half-empty shell. skipWaiting only
  // after the shell is in hand.
  e.waitUntil(
    (async () => {
      if (PRECACHE.length) {
        const c = await caches.open(CACHE);
        await c.addAll(PRECACHE);
      }
      await self.skipWaiting();
    })(),
  );
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

// Let the page force a waiting worker to take over immediately (the "Update to
// the latest version" button in Settings). Without this, a freshly-installed SW
// waits until every tab closes, so a new deploy needs a double force-close to
// appear — the exact thing the button exists to avoid.
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
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
          // Only cache good responses — a cached 404/500 would replay forever.
          if (res.ok) {
            const copy = res.clone();
            e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}));
          }
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
      // Only cache good responses — cache-first would replay a cached 404
      // forever, and one bad fetch would poison the version-stable examples
      // cache permanently (review find, 2026-07-15). Clone BEFORE returning:
      // once respondWith starts consuming the body, clone() throws and the
      // cache write silently never happens (measured — fast connections lost
      // that race).
      if (res.ok) {
        const copy = res.clone();
        const bucket = isExampleRaw(url) ? EXAMPLES : CACHE;
        e.waitUntil(caches.open(bucket).then((c) => c.put(req, copy)).catch(() => {}));
      }
      return res;
    })(),
  );
});
