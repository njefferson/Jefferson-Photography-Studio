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
// Anything under /examples/ that the reader can ask for: the Infrared practice
// RAWs and the Macro practice burst. Both are immutable bytes binned once from
// camera originals, both are fetched on demand rather than precached, and both
// belong in the cache that SURVIVES a release — a reader who has pulled the
// macro set down should not re-download it because the app shipped a fix.
const isExampleAsset = (url) =>
  url.pathname.includes("/examples/") && /\.(dng|jpg)$/.test(url.pathname);

// A RESPONSE THE BROWSER WILL LET US SERVE AS A PAGE.
//
// Cloudflare Pages 308-redirects every .html URL to its extensionless form —
// /ir.html to /ir, /index.html to / — and the precache list is generated from
// dist, so it is full of .html names. Fetching one FOLLOWS that redirect, and
// the response that comes back carries redirected:true. Serving such a response
// for a NAVIGATION is refused outright: Safari says "Response served by service
// worker has redirections" and shows nothing. Reported from the device on 2.61,
// offline, against the root URL.
//
// So it is rebuilt from its own body, which is the only way to clear the flag —
// a Response's `redirected` is read-only and clone() preserves it. Untouched
// when there was no redirect, so the normal path costs nothing.
//
// What the caller relies on: nothing this returns may be `redirected`, because
// everything it wraps ends up in the cache and anything in the cache can be
// answered to a navigation.
async function servableCopy(res) {
  if (!res || !res.redirected) return res;
  const body = await res.blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

// THE URL THE DEPLOY ACTUALLY SERVES THIS PAGE AT.
//
// The other half of the same defect, and the half that survives the fix above.
// Pages 308s /ir.html to /ir, so every link in this app, the IR manifest's
// start_url and anything a reader bookmarks or installs to a home screen all
// end up on the EXTENSIONLESS url. The precache list is generated from dist
// filenames, so it is entirely .html — which means offline, the only urls in
// the cache are ones no reader is ever on. A navigation to /ir missed, fell
// through to the root shell, and handed back the launcher instead of the
// editor; from the launcher, tapping Infrared did it again.
//
// So each page is stored under BOTH names. Precaching the extensionless form
// INSTEAD is not open to us: it 404s on every plain file server, which is what
// dev and every walk in this repository are served by, and a 404 aborts the
// install. Takes a precache url; returns the second key to store it under, or
// null for anything that is not a page. What the caller relies on: the returned
// key is the url Pages redirects `u` TO, so the cache's keys and the urls a
// reader can be on are the same set.
function alsoAt(u) {
  if (!u.endsWith(".html")) return null;
  // ANCHORED ON THE SLASH, not on the word. `/index\.html$/` would alias a page
  // called myindex.html to ./my, which is not where Pages serves it — the
  // contract above says the key IS the redirect target, so the two have to be
  // the same rule rather than nearly the same one.
  return u.endsWith("/index.html") ? u.slice(0, -"index.html".length) : u.slice(0, -5);
}

self.addEventListener("install", (e) => {
  // Populate the NEW cache BEFORE activating (the activate step wipes the old
  // one). If a fetch fails the install aborts, and the browser retries on the
  // next visit while the OLD service worker keeps serving — so a flaky network
  // can never leave a half-empty shell in front of anybody.
  //
  // AND THEN IT WAITS. This used to call skipWaiting() here, so a new worker
  // took over under the OPEN page — a page still running the previous release's
  // HTML and modules — and activate immediately deleted the old cache, leaving
  // that page served new files from then on. A mixed app, and invisible by
  // construction: nobody finds it by using the app. The reader's decision is
  // what releases the worker now (Doctrine §7h.1), via the message below.
  e.waitUntil(
    (async () => {
      if (PRECACHE.length) {
        const c = await caches.open(CACHE);
        // NOT addAll: it stores whatever the fetch returned, redirect flag and
        // all, and a redirected entry for a .html name is a page the browser
        // will refuse to render offline. It also cannot store a page under a
        // second key, which is what alsoAt below is for.
        //
        // THE INSTALL is all-or-nothing exactly as before — Promise.all rejects
        // on the first failure, so the worker never activates and the old one
        // keeps serving. THE CACHE is not: addAll batched its writes, and this
        // leaves whatever already succeeded sitting in the new cache. Harmless,
        // because that cache is only ever reached through a worker that
        // activated, and the next install attempt overwrites every key — but it
        // is not the parity the first draft of this comment claimed.
        await Promise.all(PRECACHE.map(async (u) => {
          const res = await fetch(u);
          if (!res.ok) throw new Error(`precache ${u}: ${res.status}`);
          const keep = await servableCopy(res);
          const alias = alsoAt(u);
          // Clone before the first put — a put consumes the body, so storing
          // the same page under two keys needs two bodies.
          await c.put(u, alias ? keep.clone() : keep);
          if (alias) await c.put(alias, keep);
        }));
      }
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
  // WHICH VERSION THIS WORKER IS. Asked by the update strip before it tells
  // anybody an update is available, because a waiting worker is not the same
  // thing as a newer app: navigations are network-first, so a reload hands the
  // reader the new page immediately while the browser separately notices sw.js
  // changed and parks a new worker. The strip used to announce that parked
  // worker as "a new version", naming the version already on screen.
  if (e.data && e.data.type === "VERSION" && e.ports && e.ports[0]) {
    e.ports[0].postMessage(CACHE.replace(/^ips-/, ""));
  }
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
            // CLEANED BEFORE IT IS STORED, for the same reason the precache is.
            // NOT for a real navigation, which is worth stating because the
            // obvious reading is wrong: a navigation request reaches us with
            // redirect mode `manual`, so a 308 comes back as an opaque redirect
            // — status 0, not ok — and the branch above never caches it. The
            // browser follows it and the destination arrives as its own
            // navigation. What this DOES cover is the rest of what the test
            // above catches: a script fetching "./" or an index page, which
            // follows redirects like anything else. Nothing in src/ does that
            // today — it is a guard on the test above it, not on a caller.
            const copy = res.clone();
            e.waitUntil(caches.open(CACHE).then(async (c) => c.put(req, await servableCopy(copy))).catch(() => {}));
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
        const bucket = isExampleAsset(url) ? EXAMPLES : CACHE;
        // CLEANED HERE TOO, so the property is guaranteed rather than merely
        // true today. No asset url on this deploy redirects, and an asset is
        // never answered to a navigation, so nothing needs this right now —
        // but the walk asserts "nothing in ANY cache is redirected" over every
        // entry of every cache, and an invariant that holds by luck on one of
        // three write paths is one deploy change away from a red check with no
        // defect behind it.
        e.waitUntil(caches.open(bucket).then(async (c) => c.put(req, await servableCopy(copy))).catch(() => {}));
      }
      return res;
    })(),
  );
});
