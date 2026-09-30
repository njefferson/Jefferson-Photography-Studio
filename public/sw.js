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
//
// AND AN UPDATE DOWNLOADS ONLY WHAT CHANGED (decision 071). Every release used
// to request all 218 entries, 28 MB, into an empty cache — a release that
// changed only a document included — and 25 MB of it was a sticker library
// untouched since July. Each entry below now carries a REVISION, the first
// sixteen hex digits of the SHA-256 of the file as built, and every copy this
// worker stores at install carries the revision it was CHECKED against, in an
// x-ips-rev header. Install takes each entry from wherever this device already
// holds those exact bytes and downloads only the rest. The per-release name
// stays: §7h and the hub's pwa-check want the cache to carry the release, and
// copying forward into a new cache gets Workbox's saving without its single
// shared cache (071, option 5).
const CACHE = "ips-" + "__BUILD_VERSION__";
// This worker's release, as a page and the report are told it. The strip, the
// report and the takeover below all compare it with the page's own version.
const RELEASE = CACHE.replace(/^ips-/, "");
// WHICH BUILD THIS IS, exactly: the commit, stamped at build time into this
// file AND into the page (vite.config.ts buildId). A version is not a build —
// a staging force-push can repeat one — and the takeover with nothing pressed
// (adoptIfAlone) is safe only for the build that is already on screen. Empty
// in source, which matches no page.
const BUILD = /* __BUILD_ID__ */ "";
// The app shell as [url, revision] pairs (HTML entries, hashed JS/CSS, fonts,
// icons, manifests) — injected at build time by the precache-manifest plugin
// (vite.config.ts) into the dist copy of this file. Empty in source so dev and
// direct reads stay valid; production always ships a populated list.
// Deliberately EXCLUDES the practice-photo examples (they load on demand into
// EXAMPLES, below) and, since 071, the sticker pictures (STICKERS).
const PRECACHE = [/* __PRECACHE_MANIFEST__ */];
// THE STICKER LIBRARY KEEPS A CACHE OF ITS OWN THAT NO RELEASE DELETES (071).
// Filled at install only for what it lacks, so a first install fetches the
// library once and a later release fetches none of it; never pruned, because a
// sticker removed from the library is still on somebody's saved edit and the
// host no longer has it. Best-effort: see `fill`.
const STICKERS = "ips-stickers";
const STICKER_FILES = [/* __STICKER_MANIFEST__ */];
// The revision of the host's header rules (_headers) this build shipped with.
// It is part of every label, because a copy carried forward keeps the headers
// it was FIRST stored with: without this, a change to a content type or a
// security header would never reach a file that did not change (071).
const HEADERS_REV = /* __HEADERS_REV__ */ "";
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
// A sticker picture, which lives in STICKERS whichever route stored it.
const isStickerAsset = (url) => url.pathname.includes("/stickers/") && url.pathname.endsWith(".png");
// The header a stored copy's label rides in, and where the install's own
// account of itself is kept for the report (diagnostic.ts installLine).
const REV = "x-ips-rev";
const SUMMARY = "./__install-summary";
// WHICH HEADER RULES A CACHE WAS FILLED UNDER: HEADERS_REV, written into a
// release's cache as its install begins and into STICKERS once every sticker
// it lacked has arrived. It is what decides whether an UNLABELLED copy in that
// cache may be trusted on its bytes (`trustsUnlabelled`), because a label
// travels with the copy but an unlabelled one says nothing about its headers.
const HEADERS_KEY = "./__headers";
// HOW LONG THE STICKERS MAY TAKE, DERIVED RATHER THAN FITTED. Chromium ends a
// service-worker event that runs past five minutes, and an install that is
// ended is an install that failed — for the stickers, which were never meant to
// be able to fail one. So the stickers stop at four fifths of that limit,
// counted from the START of the install, and a request still running then is
// aborted; the last fifth is kept for what follows them, which is local work
// (the check that everything arrived, and the summary) on whatever disk the
// device has. At 1.45 Mb/s — a real connection this app is used on, read off
// its diagnostic report — the whole library is about 138 s, so four minutes finishes it with the app itself
// before it; a thinner line gets the rest when a sticker is used, or at the
// next install. WebKit publishes no such limit; this is the one we know.
const EVENT_LIMIT_MS = 5 * 60 * 1000;
const STICKER_DEADLINE_MS = EVENT_LIMIT_MS * 0.8;

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
//
// AND IT WRITES THE LABEL (decision 071). Given `labelled` — { buf, rev }, the
// bytes already read out of `res` and the revision they were checked against —
// it builds a NEW response from those bytes carrying `rev` in the x-ips-rev
// header, or carrying no label at all when rev is null (bytes that did not
// match). A constructed response can never be `redirected`, so every install
// write, which all come through here, meets the contract above by
// construction. content-encoding and content-length are dropped: `buf` is the
// DECODED body, and a stored length describing the compressed one is a claim
// about bytes that are not there. What the install relies on: a label is only
// ever written beside the bytes it names. Run-time writes pass no `labelled`
// and store no label, which only ever means "hash me before trusting me".
async function servableCopy(res, labelled) {
  if (labelled) {
    const headers = new Headers(res.headers);
    headers.delete("content-encoding");
    headers.delete("content-length");
    if (labelled.rev) headers.set(REV, labelFor(labelled.rev));
    else headers.delete(REV);
    return new Response(labelled.buf, { status: res.status, statusText: res.statusText, headers });
  }
  if (!res || !res.redirected) return res;
  const body = await res.blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

/** The label a copy of bytes at revision `rev` carries: the revision, and the
 *  revision of the header rules it was stored under. Takes the revision;
 *  returns the header value. What the callers rely on: two labels are equal
 *  only when both the bytes AND the host's header rules are the same. */
function labelFor(rev) {
  return `${rev}.${HEADERS_REV}`;
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

/** THE ONE HANDLE ON THIS RELEASE'S CACHE, opened once and kept. Takes
 *  nothing; returns a promise of the Cache. A failed open is forgotten so the
 *  next caller tries again rather than inheriting the rejection. What the
 *  callers rely on: it is the same cache every request and every install write
 *  goes to. The END of an install deliberately does NOT use it (mustBeWhole):
 *  a handle outlives the cache it names, and whether the cache still exists is
 *  exactly what that check asks. */
let ownP = null;
function ownCache() {
  if (!ownP) ownP = caches.open(CACHE).catch((err) => { ownP = null; throw err; });
  return ownP;
}

/** The revision of a body: the first sixteen hex digits of its SHA-256 — the
 *  SAME rule as vite.config.ts revOf. Takes an ArrayBuffer; returns the string.
 *  What the caller relies on: equality with a manifest revision means these are
 *  the bytes the build hashed. */
async function revOf(buf) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
  let s = "";
  for (let i = 0; i < 8; i++) s += d[i].toString(16).padStart(2, "0");
  return s;
}

/** Where one version stands against another. Takes `a` and `b`, version
 *  strings such as "2.63.10"; returns 1 when `a` is numerically higher,
 *  segment by segment with a missing segment counting as 0, -1 when lower, 0
 *  when equal, and null when either is not made of numbers. The same rule as
 *  src/swupdate.ts compareVersions, which the page uses; this copy decides
 *  which release caches `activate` leaves alone. */
function compareVersions(a, b) {
  const parse = (v) => (/^\d+(\.\d+)*$/.test(v) ? v.split(".").map(Number) : null);
  const x = parse(a), y = parse(b);
  if (!x || !y) return null;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** A signal that aborts after `ms`. Takes the milliseconds; returns an
 *  AbortSignal. AbortSignal.timeout where the engine has it (Safari 16+), a
 *  timer where it does not, so no sticker download can outlast its budget on
 *  either. */
function deadline(ms) {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

/** MAY AN UNLABELLED COPY IN CACHE `c` BE TRUSTED ON ITS BYTES? Takes the
 *  cache; returns true when it was filled under THIS build's header rules, or
 *  carries no record at all — a release from before labels, the one time an
 *  unlabelled copy's headers are taken on trust (071). A copy the install
 *  stored unlabelled because its bytes did not match, or one fetched at run
 *  time, keeps the headers of the deploy it came from; when the rules have
 *  changed since, only a download brings the new ones. Found by the walk's
 *  check 24, where exactly such a copy was carried across a change. A cache
 *  that cannot be read trusts nothing. */
async function trustsUnlabelled(c) {
  try {
    const m = await c.match(HEADERS_KEY);
    return !m || (await m.text()) === HEADERS_REV;
  } catch {
    return false;
  }
}

/** DOES CACHE `c` ALREADY HOLD `u` AT REVISION `rev`? Returns true when it
 *  does — relabelling in place an unlabelled copy whose bytes hash to `rev`
 *  (one fetched at run time, or stored by a release from before labels) when
 *  `trust` says unlabelled copies in `c` may be taken on their bytes.
 *  A copy that cannot be READ is not there: it is deleted, so the next attempt
 *  does not trip over it again, and false comes back. Without that, one broken
 *  entry would fail this install and every retry of it the same way, for good
 *  (071 review). What the caller relies on: true means those exact bytes, with
 *  this build's header rules, are stored under `u`. */
async function settled(c, u, rev, trust = true) {
  try {
    const have = await c.match(u);
    if (!have) return false;
    const label = have.headers.get(REV);
    if (label === labelFor(rev)) return true;
    if (label !== null || !trust) return false; // other bytes, other headers, or headers unknown: download
    const buf = await have.arrayBuffer();
    if ((await revOf(buf)) !== rev) return false;
    await c.put(u, await servableCopy(have, { buf, rev }));
    return true;
  } catch {
    try { await c.delete(u); } catch { /* the download below overwrites it anyway */ }
    return false;
  }
}

/** THE BYTES FOR `u` AT `rev`, FROM ANY OLDER RELEASE ON THIS DEVICE, or null.
 *  Takes the source caches newest first, each as { c, trust } (olderCopies). A
 *  copy labelled for `rev` is taken as it is: it was checked when it was
 *  stored. An unlabelled one, from a source whose header rules are this
 *  build's (`trust`), is hashed and taken only if it IS those bytes — which is
 *  what makes the first release with labels copy the whole library forward
 *  instead of downloading it, and what lets a newer page's files, fetched under
 *  the old worker into ITS cache, be copied rather than fetched again. A source
 *  that cannot be read is skipped, never thrown: this install does not depend
 *  on any other release's cache being healthy (071 review). What the caller
 *  relies on: a non-null result digests to `rev`, and is safe to store under
 *  `u` as it is. */
async function findVerified(sources, u, rev) {
  for (const { c, trust } of sources) {
    try {
      const r = await c.match(u);
      if (!r) continue;
      const label = r.headers.get(REV);
      if (label === labelFor(rev)) return r; // copied, not downloaded
      if (label !== null || !trust) continue;
      const buf = await r.arrayBuffer();
      if ((await revOf(buf)) === rev) return await servableCopy(r, { buf, rev });
    } catch { /* unreadable here: the next copy, then the network */ }
  }
  return null;
}

/** DOWNLOAD `u` AND CHECK WHAT CAME. Takes the url, its revision, and an
 *  optional AbortSignal. Returns { res, verified }; throws when the host
 *  answers anything but ok, when `signal` fires, or when a newer release is
 *  live (below).
 *
 *  A mismatch is asked once more with cache:"reload", because a copy the
 *  browser kept can predate the deploy. A SECOND mismatch has two causes that
 *  need opposite answers. A host rewriting the file will do it for ever, so
 *  refusing would stop every update for good: that copy is stored UNLABELLED
 *  and counted, and is simply downloaded again next time. A newer release
 *  deployed during this install is the other, and storing ITS page as this
 *  release would hand this version a page naming files it does not have. So
 *  the live worker script is read, uncached, and if it is not this build the
 *  install stops: the newer release installs itself. What the caller relies
 *  on: `verified` true means the stored bytes are the build's; false means the
 *  live deploy is still this build and the bytes are the host's. */
async function fetchVerified(u, rev, signal) {
  let res = await fetch(u, { signal });
  if (!res.ok) throw new Error(`precache ${u}: ${res.status}`);
  let buf = await res.arrayBuffer();
  if ((await revOf(buf)) === rev) return { res: await servableCopy(res, { buf, rev }), verified: true };
  res = await fetch(u, { cache: "reload", signal });
  if (!res.ok) throw new Error(`precache ${u}: ${res.status}`);
  buf = await res.arrayBuffer();
  if ((await revOf(buf)) === rev) return { res: await servableCopy(res, { buf, rev }), verified: true };
  const live = await fetch("./sw.js", { cache: "no-store", signal });
  const text = live.ok ? await live.text() : "";
  if (!text.includes(`const BUILD = ${JSON.stringify(BUILD)};`)) {
    throw new Error(`precache ${u}: the host is serving a different release now, which will install itself`);
  }
  return { res: await servableCopy(res, { buf, rev: null }), verified: false };
}

/** Store `res` under `u` in cache `c`, and under the address the deploy serves
 *  a page at. Takes the cache, the url and the response; returns nothing. The
 *  ALIAS FIRST: `settled` treats `u` as proof the page is stored, so `u` is
 *  written last and an install cut off between the two leaves `u` missing,
 *  never the alias. */
async function store(c, u, res) {
  const alias = alsoAt(u);
  if (alias) await c.put(alias, res.clone());
  await c.put(u, res);
}

/** Every OTHER release's cache on this device, newest first (CacheStorage
 *  keeps creation order). Takes nothing; returns { c, trust } for each — the
 *  open cache, and whether its unlabelled copies may be taken on their bytes
 *  (trustsUnlabelled). Not the stable caches: nothing in them is a release. One
 *  that cannot be opened is left out rather than failing the install. */
async function olderCopies() {
  const names = (await caches.keys()).filter((k) => k !== CACHE && /^ips-\d/.test(k)).reverse();
  const out = [];
  for (const k of names) {
    try {
      const c = await caches.open(k);
      const trust = await trustsUnlabelled(c);
      out.push({ c, trust });
    } catch { /* not a source, then */ }
  }
  return out;
}

/** WHAT cache `c` lacks of this release — every PRECACHE url and every page's
 *  second address. Takes the cache; returns `{ n, files, first }`: how many
 *  entries are missing, how many FILES that is (a page and its second address
 *  are one file, and "./" is index.html's), and the first file found missing,
 *  named by its PRECACHE url (null when none). What the callers rely on: `n`
 *  is 0 exactly when every entry is there (the install's test), and `files`
 *  and `first` are what the takeover's refusal tells the reader. */
async function gapIn(c) {
  const pageOf = new Map();
  for (const [u] of PRECACHE) { const a = alsoAt(u); if (a) pageOf.set(a, u); }
  let n = 0, first = null;
  const files = new Set();
  const miss = (u) => { n++; const f = pageOf.get(u) || u; files.add(f); if (first === null) first = f; };
  for (const [u] of PRECACHE) {
    if (!(await c.match(u))) miss(u);
    const alias = alsoAt(u);
    if (alias && !(await c.match(alias))) miss(alias);
  }
  return { n, files: files.size, first };
}

/** How many of this release's entries cache `c` lacks. Takes the cache; returns
 *  the count, `gapIn(c).n`. Read by the end of an install, which must never
 *  finish on a cache with anything missing from it. */
async function missingFrom(c) {
  return (await gapIn(c)).n;
}

/** IS THIS RELEASE'S CACHE STILL THERE, AND WHOLE? Takes nothing; returns
 *  nothing, and THROWS when it is not — which fails the install, so the worker
 *  never activates and the browser tries again.
 *
 *  WHY AN INSTALL THAT WROTE EVERY FILE CAN STILL BE EMPTY (071 review, and
 *  measured in Chromium). An earlier update is waiting and this newer one is
 *  installing; the reader closes the last window. The browser then activates
 *  the waiting worker on its own, and its cleanup deletes every other release's
 *  cache — including the one this install is filling. Every write after that
 *  lands in a cache no name reaches, the install "succeeds", this worker then
 *  activates too with no window left to wait for, and deletes the last real
 *  cache. The app would not open offline, and nothing would say so. A worker
 *  from before this release deletes everything that is not its own, so nothing
 *  on OUR side of the race could prevent it; the only guard is to look at the
 *  end, BY NAME, with a handle opened now. */
async function mustBeWhole() {
  if (!(await caches.has(CACHE))) throw new Error(`${CACHE} was deleted while it was being filled`);
  const missing = await missingFrom(await caches.open(CACHE));
  if (missing) throw new Error(`${CACHE} is missing ${missing} of its entries at the end of its install`);
}

/** How many sticker pictures are NOT in STICKERS right now. Takes nothing;
 *  returns the count — all of them when the cache itself is gone, which a
 *  worker from before this release does to it. Read at the END of an install,
 *  so the summary says what the device has, not what the install attempted. */
async function stickersMissing() {
  try {
    if (!(await caches.has(STICKERS))) return STICKER_FILES.length;
    const c = await caches.open(STICKERS);
    let n = 0;
    for (const [u] of STICKER_FILES) if (!(await c.match(u))) n++;
    return n;
  } catch {
    return STICKER_FILES.length;
  }
}

// WHAT THIS WORKER IS DOWNLOADING, for any window that asks or listens (071).
let progress = null;
let lastTold = 0;

/** Posts {type:"install-progress", version, done, total} to every window of
 *  this site, controlled or not — the open pages belong to the OLD worker, so
 *  without includeUncontrolled this reaches nobody. Takes `force`; at most one
 *  message every 250 ms unless it is set. Returns nothing and never throws:
 *  telling is a courtesy the install does not depend on. */
async function tell(force) {
  if (!progress) return;
  const now = Date.now();
  if (!force && now - lastTold < 250) return;
  lastTold = now;
  try {
    const msg = { type: "install-progress", version: RELEASE, done: progress.done, total: progress.total };
    for (const c of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) c.postMessage(msg);
  } catch { /* nobody to tell */ }
}

/** THE INSTALL (071). Takes nothing; returns when this release's cache is
 *  whole, and throws when it is not. Four phases, in this order.
 *  A — take locally whatever this device already has, with no network.
 *  B — the app itself, ONE DOWNLOAD AT A TIME, all or nothing: any failure
 *      throws, the worker never activates, and the old one keeps serving.
 *      One at a time because firing all 218 at once is what Workbox stopped
 *      doing (issue 2528: ERR_INSUFFICIENT_RESOURCES, competing with the page).
 *      Entries that share a revision — "./" and "./index.html" are the same
 *      bytes — are downloaded ONCE.
 *  C — the stickers, best effort, stopping at STICKER_DEADLINE_MS from the
 *      start of the install; no sticker can fail an install.
 *  D — the cache is looked at again, by name, and must be whole (mustBeWhole).
 *  Resumable by construction: every entry is stored labelled the moment it
 *  lands, so an install the browser cuts off (an iPad closing the app) picks up
 *  where it stopped. Writes a summary for the report. */
async function fill() {
  if (!PRECACHE.length) return; // dev: nothing injected
  const started = Date.now();
  const stopAt = started + STICKER_DEADLINE_MS;
  const own = await ownCache();
  const sources = await olderCopies();
  // WHICH HEADER RULES THIS CACHE IS FILLED UNDER, recorded before anything
  // is put in it so the next release can read it (trustsUnlabelled). A cache
  // that already holds copies from under OTHER rules — the same release name
  // from a different build — is recorded only once phase B has replaced them,
  // so an attempt cut off half-way does not vouch for what it left behind.
  const ownTrusted = await trustsUnlabelled(own);
  if (ownTrusted) await own.put(HEADERS_KEY, new Response(HEADERS_REV));
  const tally = { kept: 0, fetched: 0, unverified: 0, stickersMissing: 0, ms: 0 };

  // A — the app's own files first: already here, or carried forward.
  const shellToFetch = new Map(); // revision -> the urls that are those bytes
  for (const [u, rev] of PRECACHE) {
    if (await settled(own, u, rev, ownTrusted)) { tally.kept++; continue; }
    const found = await findVerified(sources, u, rev);
    if (found) { await store(own, u, found); tally.kept++; continue; }
    if (!shellToFetch.has(rev)) shellToFetch.set(rev, []);
    shellToFetch.get(rev).push(u);
  }
  // ...then the stickers, each in its own try: a sticker that cannot be read
  // or written here is one to fetch later, never a failed install.
  const stickersToFetch = [];
  let stickers = null;
  try { stickers = await caches.open(STICKERS); } catch { /* counted as missing at the end */ }
  const stickersTrusted = stickers ? await trustsUnlabelled(stickers) : false;
  let allStickers = !!stickers; // every sticker this install lacked, it got
  if (stickers) {
    for (const [u, rev] of STICKER_FILES) {
      try {
        if (await settled(stickers, u, rev, stickersTrusted)) { tally.kept++; continue; }
        const found = await findVerified(sources, u, rev);
        if (found) { await stickers.put(u, found); tally.kept++; continue; }
        stickersToFetch.push([u, rev]);
      } catch { allStickers = false; /* left for the fetch route */ }
    }
  }
  progress = { done: 0, total: shellToFetch.size + stickersToFetch.length };
  await tell(true);

  // B — what changed in the app.
  for (const [rev, urls] of shellToFetch) {
    const got = await fetchVerified(urls[0], rev);
    for (let i = 0; i < urls.length; i++) await store(own, urls[i], i === urls.length - 1 ? got.res : got.res.clone());
    tally.fetched++;
    if (!got.verified) tally.unverified++;
    progress.done++;
    await tell(progress.done === progress.total);
  }

  if (!ownTrusted) await own.put(HEADERS_KEY, new Response(HEADERS_REV));

  // C — the stickers this device lacks, within the budget.
  for (let i = 0; i < stickersToFetch.length; i++) {
    const left = stopAt - Date.now();
    if (left <= 0) { allStickers = false; break; }
    const [u, rev] = stickersToFetch[i];
    try {
      const got = await fetchVerified(u, rev, deadline(Math.max(1000, left)));
      await stickers.put(u, got.res);
      tally.fetched++;
      if (!got.verified) tally.unverified++;
    } catch { allStickers = false; /* fetched when it is used, or at the next install */ }
    progress.done++;
    await tell(progress.done === progress.total);
  }
  // The sticker cache takes these header rules only once nothing in it is left
  // from under other ones — a copy this install could not replace keeps its
  // old record in force, so it is still not trusted next time.
  if (allStickers) {
    try { await stickers.put(HEADERS_KEY, new Response(HEADERS_REV)); } catch { /* the next install writes it */ }
  }

  // D — still there, and whole?
  await mustBeWhole();
  tally.stickersMissing = await stickersMissing();
  tally.ms = Date.now() - started;
  const now = await caches.open(CACHE);
  await now.put(SUMMARY, new Response(JSON.stringify(tally), { headers: { "content-type": "application/json" } }));
  progress = null;
}

self.addEventListener("install", (e) => {
  // Populate the NEW cache BEFORE activating (the activate step wipes the old
  // one). If a download of the app fails the install aborts, and the browser
  // retries on the next visit while the OLD service worker keeps serving — so a
  // flaky network can never leave a half-empty shell in front of anybody.
  //
  // AND THEN IT WAITS. This used to call skipWaiting() here, so a new worker
  // took over under the OPEN page — a page still running the previous release's
  // HTML and modules — and activate immediately deleted the old cache, leaving
  // that page served new files from then on. A mixed app, and invisible by
  // construction: nobody finds it by using the app. A worker that would change
  // what is on screen is released only by the reader's press (Doctrine §7h.1),
  // via the message below. The one exception is a worker that IS the build on
  // screen, which the page asks to take over (ADOPT, adoptIfAlone): taking it
  // changes nothing anybody can see, and it is refused whenever it could.
  //
  // What it fills and from where: see fill().
  e.waitUntil(fill());
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !keeps(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

/** WHICH CACHES AN ACTIVATION LEAVES ALONE. Takes a cache name; returns true
 *  for this release's own, the two stable ones (EXAMPLES, STICKERS), and any
 *  release NEWER than this one. That last is the other half of the race
 *  mustBeWhole describes: a newer release may be installing into its cache
 *  while this older one activates, and deleting it would empty that install
 *  from under it. A newer release's cache left here by an install that never
 *  finished is deleted by whichever release above it activates next. What the
 *  caller relies on: everything else of this site's is deleted, as before. */
function keeps(k) {
  if (k === CACHE || k === EXAMPLES || k === STICKERS) return true;
  const m = /^ips-(\d+(?:\.\d+)*)$/.exec(k);
  return !!m && compareVersions(m[1], RELEASE) === 1;
}

/** TAKE OVER WITH NOTHING PRESSED — only when nothing on any screen can change
 *  (071). Takes `asker`, the window that sent ADOPT, and `build`, the build it
 *  is running (its `__BUILD_ID__`). Calls skipWaiting only when all three hold:
 *  (1) the asking page is THIS build, by the id both were stamped with — not
 *      the version, which a staging force-push can repeat, and not a file name;
 *  (2) this release's cache is whole, so every file that page can ask for is
 *      here once the old cache is gone;
 *  (3) the asker is the ONLY window — skipWaiting moves every window, and
 *      another may be an older build (workbox-window's tab A and tab B).
 *  Otherwise it does nothing and the worker waits exactly as §7h has it; a
 *  newer build is always refused by (1), whatever the page asks.
 *  Returns WHAT IT DID AND WHY (2026-09-30): `{ taken: true }`, or
 *  `{ taken: false, why }` with `why` one of "build" (with `worker` and `page`,
 *  the two builds), "cache" (with `missing`, a count or "all", and `first`, a
 *  file), or "windows" (with `windows`, how many are open). The report prints
 *  it, because a refusal that says nothing looked identical to a takeover still
 *  running on the PC's report of 2026-09-30. What the caller relies on: the
 *  reason returned is the test that refused, checked in this order. */
async function adoptIfAlone(asker, build) {
  if (!BUILD || build !== BUILD) return { taken: false, why: "build", worker: BUILD || "(not stamped)", page: build || "(not stamped)" };
  if (!(await caches.has(CACHE))) return { taken: false, why: "cache", missing: "all", first: null };
  const gap = await gapIn(await caches.open(CACHE));
  if (gap.n) return { taken: false, why: "cache", missing: gap.files, first: gap.first };
  const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  if (wins.length !== 1 || wins[0].id !== asker.id) return { taken: false, why: "windows", windows: wins.length };
  await self.skipWaiting();
  return { taken: true };
}

// Let the page force a waiting worker to take over immediately (the "Update to
// the latest version" button in Settings, and the strip's Update now). Without
// this, a freshly-installed SW waits until every tab closes, so a new deploy
// needs a double force-close to appear — the exact thing the button exists to
// avoid.
self.addEventListener("message", (e) => {
  const d = e.data;
  if (d && d.type === "SKIP_WAITING") self.skipWaiting();
  // WHICH VERSION THIS WORKER IS. Asked by the update strip before it tells
  // anybody an update is available, because a waiting worker is not the same
  // thing as a newer app: navigations are network-first, so a reload hands the
  // reader the new page immediately while the browser separately notices sw.js
  // changed and parks a new worker. The strip used to announce that parked
  // worker as "a new version", naming the version already on screen.
  if (d && d.type === "VERSION" && e.ports && e.ports[0]) e.ports[0].postMessage(RELEASE);
  // HOW FAR THE DOWNLOAD HAS GOT. A page opened MID-install is not in any
  // matchAll yet, so it asks (071).
  if (d && d.type === "PROGRESS" && e.ports && e.ports[0]) {
    e.ports[0].postMessage(progress ? { version: RELEASE, done: progress.done, total: progress.total } : null);
  }
  // "I AM YOUR BUILD" — the page asking this worker to take over (adoptIfAlone).
  // The answer goes back on the port the page sent, when it sent one.
  if (d && d.type === "ADOPT" && e.source) {
    const port = e.ports && e.ports[0];
    // A check that throws still answers, so the page never waits on an answer
    // that is not coming and reports it as one still running.
    e.waitUntil(adoptIfAlone(e.source, String(d.build || "")).then(
      (r) => { if (port) port.postMessage(r); },
      (err) => { if (port) port.postMessage({ taken: false, why: "error", error: String((err && err.message) || err).slice(0, 200) }); }));
  }
});

/** WHERE A NON-NAVIGATION IS ANSWERED FROM. Takes the request and its parsed
 *  url; returns a stored response, or undefined for a miss. This worker's own
 *  cache first — the only one guaranteed to hold this release, and a lookup
 *  naming it does not queue behind writes to a cache an install is filling.
 *  Then the stable cache the url belongs to. Then EVERY cache, deliberately: a
 *  newer page served by an older worker finds its files in the waiting worker's
 *  cache, and naming only the active one broke opening a photo offline while an
 *  update waited (071). A cache that cannot be read is a miss, so the network
 *  still answers. */
async function lookup(req, url) {
  try {
    const mine = await (await ownCache()).match(req);
    if (mine) return mine;
    const stable = isStickerAsset(url) ? STICKERS : isExampleAsset(url) ? EXAMPLES : null;
    if (stable) {
      const s = await (await caches.open(stable)).match(req);
      if (s) return s;
    }
    return await caches.match(req);
  } catch {
    return undefined;
  }
}

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
            e.waitUntil(ownCache().then(async (c) => c.put(req, await servableCopy(copy))).catch(() => {}));
          }
          return res;
        } catch {
          // Offline: this release's own copy first, the same order as `lookup`.
          return (await lookup(req, url))
            || (await ownCache().then((c) => c.match("./")).catch(() => undefined))
            || (await caches.match("./"))
            || Response.error();
        }
      })(),
    );
    return;
  }

  // Cache-first for immutable, content-hashed assets. Practice-library RAWs
  // and sticker pictures go to their own stable caches (EXAMPLES, STICKERS).
  e.respondWith(
    (async () => {
      const hit = await lookup(req, url);
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
        // A STICKER THE INSTALL DID NOT GET is fetched here the first time it
        // is used, and kept in STICKERS like the rest (071): the install's
        // budget can leave some behind, and nothing else would ever fill them.
        const bucket = isExampleAsset(url) ? caches.open(EXAMPLES) : isStickerAsset(url) ? caches.open(STICKERS) : ownCache();
        // CLEANED HERE TOO, so the property is guaranteed rather than merely
        // true today. No asset url on this deploy redirects, and an asset is
        // never answered to a navigation, so nothing needs this right now —
        // but the walk asserts "nothing in ANY cache is redirected" over every
        // entry of every cache, and an invariant that holds by luck on one of
        // three write paths is one deploy change away from a red check with no
        // defect behind it.
        e.waitUntil(bucket.then(async (c) => c.put(req, await servableCopy(copy))).catch(() => {}));
      }
      return res;
    })(),
  );
});
