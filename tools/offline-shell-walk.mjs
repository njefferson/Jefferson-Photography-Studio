#!/usr/bin/env node
// THE APP OPENS OFFLINE, AND AN UPDATE IS WHAT IT CLAIMS TO BE. Reported from
// the device on 2.61: an iPad with no network got "Safari can't open the page.
// The error was: Response served by service worker has redirections" and a
// black screen. Since decision 071 it also drives REAL second workers — a
// genuinely different sw.js served to the same browser — through every update
// path the worker and the strip have.
//
//   node tools/offline-shell-walk.mjs [--port=8137] [--plant[=NAME]]
//
//   npm install --no-save playwright-core
//
// NOT in .branch-guard's `also=`: it drives a real browser. Run it before a
// release, or through tools/walk-all.mjs, which finds it on disk.
//
// IT BRINGS ITS OWN SERVER, which no other walk here does — twelve of them also
// ignore --port and hardcode :8131, so ignoring the argument is not what makes
// this one different. What makes it different is that the behaviour under test
// is a behaviour OF THE SERVER, so it cannot measure whatever is already
// serving dist. It starts its own on :8137 (or --port) and closes it again.
//
// WHY IT NEEDS ITS OWN SERVER, and why no existing walk could have caught this.
// Every other walk here is served by `python3 -m http.server`, which returns
// /ir.html verbatim. THE DEPLOY DOES NOT: Cloudflare Pages 308-redirects every
// .html URL to its extensionless form — /ir.html to /ir, /index.html to / —
// measured against production on 2026-09-23. So the defect lives entirely in
// the gap between the harness and the deploy, and a walk on a plain file server
// is structurally incapable of seeing it. This one redirects the way Pages does.
// And an update is a second DEPLOY: the server here can hand out a different
// sw.js, different bytes for a file, a slow file, a refused one or one that
// never answers, and it logs every request, so "downloaded only what changed"
// is counted at the host rather than inferred from the cache.
//
// WHAT GOES WRONG — TWO HALVES, and the second one survives fixing the first.
// The precache list is generated from `dist` and is therefore full of .html
// names. Fetching one FOLLOWS the 308, and the response that comes back carries
// redirected:true; a service worker may not answer a NAVIGATION with one, which
// is the refusal the device reported. AND the cache then holds only .html keys,
// which are urls no reader is ever on — the deploy has redirected them all to
// /ir, which is what the manifest's start_url resolves to and what gets
// installed to a home screen. Offline that url is a miss: the fallback served
// the launcher instead of the editor, and the launcher's Infrared door did it
// again. Offline-first is a product value here, which makes this the most
// expensive kind of defect: invisible to anyone with a network.
//
// EVERY PLANT PUTS ONE DEFECT BACK, so each check can be seen to fail for its
// own reason. A plant is applied BY THE SERVER, to the sw.js it hands the
// browser, rather than by editing the shipped file — a plant that needs the
// tree dirtied is a plant somebody can forget to take out. Every substitution
// is asserted to have landed before the run is trusted, because a plant that
// silently did not apply prints the same green as a fix. Bare --plant means
// `redirect`, the half the device reported. The list, and the check each one
// turns red, is PLANTS below.
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, extname } from "node:path";
import { requireFreshDist } from "./fresh-dist.mjs";
import { execSync } from "node:child_process";

requireFreshDist();
// --plant, --plant=NAME. An unknown name stops rather than running a walk with
// no plant in it under a name that says there is one.
const PLANT_ARG = process.argv.find((a) => a === "--plant" || a.startsWith("--plant="));
const PLANT = PLANT_ARG ? (PLANT_ARG.split("=")[1] ?? "redirect") : "";
const DIST = new URL("../dist/", import.meta.url).pathname;
const PORT = Number((process.argv.find((a) => a.startsWith("--port=")) ?? "--port=8137").split("=")[1]);
const ORIGIN = `http://127.0.0.1:${PORT}`;
let failed = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "ok  " : "FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".dng": "application/octet-stream", ".jpg": "image/jpeg" };

// THE BUILT WORKER'S OWN LISTS AND STAMPS — read out of dist rather than
// restated here, because they are generated at build time and a copy would be
// a second answer to a question the build already answers.
const SW_SRC = await readFile(join(DIST, "sw.js"), "utf8");
const grab = (re, what) => {
  const m = SW_SRC.match(re);
  if (!m) throw new Error(`dist/sw.js has no ${what} — the build's precache plugin did not run`);
  return m;
};
const MANIFEST = grab(/const PRECACHE = \[([\s\S]*?)\];/, "PRECACHE array");
const ENTRIES = JSON.parse(`[${MANIFEST[1]}]`); // [url, revision]
const STICKER_FILES = JSON.parse(`[${grab(/const STICKER_FILES = \[([\s\S]*?)\];/, "STICKER_FILES array")[1]}]`);
const V = grab(/const CACHE = "ips-([^"]+)";/, "stamped CACHE")[1];
const BUILD = JSON.parse(grab(/const BUILD = ("[^"]*");/, "stamped BUILD")[1]);
const HEADERS_REV = JSON.parse(grab(/const HEADERS_REV = ("[^"]*");/, "stamped HEADERS_REV")[1]);

/** THE REVISION RULE, restated here ON PURPOSE, from the file bytes: the first
 *  sixteen hex digits of the SHA-256. Takes a Buffer; returns the string. It is
 *  the third copy of one rule (vite.config.ts, public/sw.js) and the only one
 *  that is not trusted — check 4 holds the build's list to it, so a build and a
 *  worker that drifted apart TOGETHER still go red here. */
const revOf = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);
const labelOf = (rev) => `${rev}.${HEADERS_REV}`;

/** POLL A CONDITION IN THE PAGE UNTIL IT HOLDS.
 *
 *  Takes `page`; `what`, named in the timeout so a failure says which wait gave
 *  up; `fn`, evaluated in the page and AWAITED — unlike waitForFunction's
 *  predicate, which is not; `arg`, handed to it; and `ms`, the deadline.
 *  Returns nothing, and throws if the condition never holds.
 *
 *  What the caller relies on: that it really waited. Every condition it is used
 *  for below measures cache state that the install writes one entry at a time,
 *  so a wait that returns early turns this walk green against a half-built
 *  cache — which is what an `async` predicate handed to waitForFunction does. */
async function until(page, what, fn, arg, ms = 180000) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (await page.evaluate(fn, arg)) return;
    if (Date.now() > deadline) throw new Error(`timed out after ${Math.round(ms / 1000)}s waiting for ${what}`);
    await page.waitForTimeout(100);
  }
}

/** The same, answering false instead of throwing when `ms` runs out — for the
 *  checks whose FAILURE is that something never happens. Takes and returns as
 *  `until`, but returns whether the condition came to hold. */
async function within(page, fn, arg, ms) {
  try { await until(page, "", fn, arg, ms); return true; } catch { return false; }
}

// THE LINES THE FIXES ADDED, and what each becomes when its defect is planted
// back. Matched against the built sw.js rather than the source, because the
// built one is what the browser runs. `turns` names the check each should turn
// red; a plant that turns nothing red is a plant nobody has watched fail.
const PLANTS = {
  redirect: {
    turns: "1",
    edits: [["  if (!res || !res.redirected) return res;", "  return res; // PLANTED: store whatever the fetch returned, flag and all"]],
  },
  alias: {
    turns: "2",
    edits: [['  if (!u.endsWith(".html")) return null;', "  return null; // PLANTED: .html keys only, which is what the list generates"]],
  },
  // Not a line of sw.js: the SERVER behaves as the host does with no 404.html
  // in the deploy, answering a missing file with the start page and a 200.
  no404: { turns: "0", server: true },
  // "./" and "./index.html" — the same bytes — are each downloaded.
  nodedupe: {
    turns: "5",
    edits: [["    for (let i = 0; i < urls.length; i++) await store(own, urls[i], i === urls.length - 1 ? got.res : got.res.clone());", "    await store(own, urls[0], got.res); for (const v of urls.slice(1)) await store(own, v, (await fetchVerified(v, rev)).res); // PLANTED: every address downloaded on its own"]],
  },
  // An unchanged file is downloaded again instead of carried forward.
  nocopy: {
    turns: "6",
    edits: [["      if (label === labelFor(rev)) return r; // copied, not downloaded", "      if (false) return r; // PLANTED: never carry a labelled copy forward"]],
  },
  // The sticker cache is never consulted, so every release fetches the library.
  stickerrefetch: {
    turns: "8",
    edits: [["        if (await settled(stickers, u, rev, stickersTrusted)) { tally.kept++; continue; }", "        if (false) { tally.kept++; continue; } // PLANTED: the sticker cache is never consulted"]],
  },
  // The installing worker tells nobody, by broadcast or by answer.
  noprogress: {
    turns: "9",
    edits: [
      ["  if (!progress) return;", "  return; // PLANTED: nobody is told"],
      ["    e.ports[0].postMessage(progress ? { version: RELEASE, done: progress.done, total: progress.total } : null);", "    e.ports[0].postMessage(null); // PLANTED: nobody is answered"],
    ],
  },
  // A waiting worker takes over for ANY build the page names — a newer one too.
  adoptany: {
    turns: "10",
    edits: [["  if (!BUILD || build !== BUILD) return;", "  // PLANTED: any build the page names is taken as this one"]],
  },
  // The page's "I am your build" is ignored, so the same build waits for ever.
  noadopt: {
    turns: "16",
    edits: [['  if (d && d.type === "ADOPT" && e.source) e.waitUntil(adoptIfAlone(e.source, String(d.build || "")));', "  // PLANTED: ADOPT is ignored"]],
  },
  // A second window does not stop the takeover.
  alone: {
    turns: "17",
    edits: [["  if (wins.length !== 1 || wins[0].id !== asker.id) return;", "  // PLANTED: every other window is ignored"]],
  },
  // The end of an install never looks at its cache again.
  noendcheck: {
    turns: "18",
    edits: [["  await mustBeWhole();", "  // PLANTED: the install never looks again"]],
  },
  // An activation deletes a NEWER release's cache too.
  newerdeleted: {
    turns: "21",
    edits: [["  return !!m && compareVersions(m[1], RELEASE) === 1;", "  return false; // PLANTED: every other release's cache goes"]],
  },
  // A file that never matches is stored even when a different release is live.
  nolivecheck: {
    turns: "23",
    edits: [["  if (!text.includes(`const BUILD = ${JSON.stringify(BUILD)};`)) {", "  if (false) { // PLANTED: the live release is never asked"]],
  },
  // The host's header rules are no part of a label.
  noheaders: {
    turns: "24",
    edits: [["  return `${rev}.${HEADERS_REV}`;", "  return rev; // PLANTED: the header rules are no part of a label"]],
  },
  // An unlabelled copy is taken on its bytes whatever rules it was stored under.
  trustall: {
    turns: "24",
    edits: [["      const trust = await trustsUnlabelled(c);", "      const trust = true; // PLANTED: every older copy's headers taken on trust"]],
  },
  // A sticker download has no deadline.
  nosignal: {
    turns: "20",
    edits: [["      const got = await fetchVerified(u, rev, deadline(Math.max(1000, left)));", "      const got = await fetchVerified(u, rev); // PLANTED: no deadline on a sticker"]],
  },
};
if (PLANT && !PLANTS[PLANT]) {
  console.error(`unknown plant "${PLANT}" — one of: ${Object.keys(PLANTS).join(", ")}`);
  process.exit(2);
}
const plantHits = new Set();
let no404Planted = false;

/** THE PLANT, applied to one sw.js on its way out. Takes the text; returns it
 *  with every edit of the plant in force substituted, and records which edits
 *  landed so the run can refuse to trust itself when one did not. */
function withPlant(text) {
  const plant = PLANT && PLANTS[PLANT];
  if (!plant || plant.server) return text;
  let t = text;
  for (const [find, swap] of plant.edits) {
    if (t.includes(find)) { t = t.replace(find, () => swap); plantHits.add(find); }
  }
  return t;
}

/** A RELEASE OTHER THAN THE ONE BUILT — the real dist/sw.js with its version,
 *  its build id, and the revision of any file given new bytes rewritten.
 *  Takes { version, build, files: { "/path": Buffer }, edits: [[find, swap]] };
 *  returns the sw.js text to serve. Every substitution is asserted to land, so
 *  a release this walk believes it is serving is the one it serves. The new
 *  revision is computed HERE, from the bytes, never copied from the worker. */
function release({ version = V, build = BUILD, files = {}, edits = [] }) {
  let t = SW_SRC;
  const sub = (a, b) => {
    if (!t.includes(a)) throw new Error(`release ${version}: "${a.slice(0, 80)}" is not in dist/sw.js`);
    t = t.replace(a, () => b);
  };
  if (version !== V) sub(`const CACHE = "ips-${V}";`, `const CACHE = "ips-${version}";`);
  if (build !== BUILD) sub(`const BUILD = ${JSON.stringify(BUILD)};`, `const BUILD = ${JSON.stringify(build)};`);
  for (const [path, bytes] of Object.entries(files)) {
    const old = ENTRIES.find(([u]) => u === "." + path);
    if (!old) throw new Error(`release ${version}: ${path} is not in the precache list`);
    sub(JSON.stringify(old), JSON.stringify(["." + path, revOf(bytes)]));
  }
  for (const [a, b] of edits) sub(a, b);
  return t;
}

/** THE URL THE DEPLOY REDIRECTS A PAGE TO, and the ONE expression of that rule
 *  in this file.
 *
 *  Takes an absolute path or a `./x.html` precache entry. Returns where Pages
 *  sends it — `/ir.html` to `/ir`, `/index.html` to `/` — or null for anything
 *  that is not a page. Both callers matter: the server below answers 308 with
 *  it, and check 2 builds the url set it expects the worker to have cached with
 *  it. What the caller relies on: those two are the SAME rule, so the check is
 *  asserting that the worker agrees with the deploy rather than with a second
 *  copy of its own logic kept here. (The first draft had three copies and
 *  claimed it had one; they agreed only on today's manifest.) */
function deployServesAt(u) {
  if (!u.endsWith(".html")) return null;
  return u.endsWith("/index.html") ? u.slice(0, -"index.html".length) : u.slice(0, -5);
}

// WHAT THE STAND-IN DEPLOY IS SERVING RIGHT NOW. Each scenario sets it and
// `reset` puts it back: the built sw.js, dist's bytes, nothing slow, nothing
// refused. `log` is every path asked for, in order; `done` is when each
// response finished, for the one wait that has to follow a response;
// `onRequest`, when set, runs as each file is asked for — a second deploy
// landing in the middle of an install.
const S = {};
function reset() {
  Object.assign(S, { sw: SW_SRC, files: new Map(), slow: new Map(), fail: new Set(), failStickers: false, hangStickers: false, log: [], done: [], hung: [], onRequest: null });
}
reset();

/** A stand-in for the deploy, redirecting the way it really does.
 *
 *  Takes nothing; serves ../dist on PORT, as `S` says. Returns the running
 *  server so the caller can close it. Any request for `/x.html` answers 308 to
 *  `/x`, and `/x` is served from `x.html` on disk — which is what Cloudflare
 *  Pages does and what `python3 -m http.server` does not. The redirect is the
 *  whole point of the offline half of this walk; a server without it cannot
 *  reproduce the defect.
 *
 *  It sends no validators and no cache headers, so the browser keeps no copy it
 *  may reuse without asking, and every download an install makes arrives here
 *  and is logged: the request log is the count of what an update cost.
 *
 *  It RESOLVES ON `listening`, which is the load-bearing part: a listen error
 *  arrives asynchronously, so a version that bound and launched the browser in
 *  the same breath would take a busy port while a browser was half-started and
 *  leave it running. Nothing here starts a process it has not confirmed it can
 *  clean up. */
function serve() {
  const s = createServer(async (req, res) => {
    const url = new URL(req.url, ORIGIN);
    const p = decodeURIComponent(url.pathname);
    S.log.push(p);
    const to = deployServesAt(p);
    if (to) {
      res.writeHead(308, { Location: to });
      res.end();
      return;
    }
    let file = p === "/" ? "index.html" : p.replace(/^\//, "");
    if (!extname(file)) file += ".html";
    const key = "/" + file;
    const sticker = key.startsWith("/stickers/") && key.endsWith(".png");
    S.onRequest?.(key); // a deploy landing at this exact moment, when a scenario says so
    if (S.slow.has(key)) await sleep(S.slow.get(key));
    if (S.fail.has(key) || (sticker && S.failStickers)) {
      res.writeHead(503, { "Content-Type": "text/plain" });
      res.end("refused by the walk");
      S.done.push({ p: key, t: Date.now() });
      return;
    }
    if (sticker && S.hangStickers) { S.hung.push(res); return; } // never answered
    try {
      let body = S.files.get(key) ?? await readFile(join(DIST, file));
      if (file === "sw.js") body = Buffer.from(withPlant(S.sw));
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      // WHAT THE HOST DOES WITH AN ADDRESS IT DOES NOT HAVE (decision 071):
      // Cloudflare Pages serves 404.html with a 404 when the deploy has one,
      // and otherwise treats the site as a single-page app and answers with
      // index.html and a 200. The second is what let an install store the start
      // page under a program file's name. --plant=no404 serves as though the
      // deploy had no 404.html.
      const has404 = PLANT !== "no404" && await readFile(join(DIST, "404.html")).then(() => true, () => false);
      if (has404) {
        res.writeHead(404, { "Content-Type": "text/html" }); res.end(await readFile(join(DIST, "404.html")));
      } else {
        if (PLANT === "no404") no404Planted = true;
        res.writeHead(200, { "Content-Type": "text/html" }); res.end(await readFile(join(DIST, "index.html")));
      }
    }
    S.done.push({ p: key, t: Date.now() });
  });
  return new Promise((ok, no) => {
    s.once("error", no);
    s.listen(PORT, "127.0.0.1", () => { s.removeListener("error", no); ok(s); });
  });
}

// ---- 4 — THE BUILD'S OWN LISTS, checked from the bytes, before any browser ----
// The worker labels a copy only when its digest equals the list's revision, so
// a list that disagreed with the files would make every install download
// everything, or trust nothing, while every browser check below still passed.
{
  const bad = [];
  for (const [u, r] of ENTRIES) {
    const file = u === "./" ? "index.html" : u.slice(2);
    const got = await readFile(join(DIST, file)).then(revOf, () => "(missing)");
    if (got !== r) bad.push(`${u} lists ${r}, the file is ${got}`);
  }
  for (const [u, r] of STICKER_FILES) {
    const got = await readFile(join(DIST, u.slice(2))).then(revOf, () => "(missing)");
    if (got !== r) bad.push(`${u} lists ${r}, the file is ${got}`);
  }
  const headersGot = await readFile(join(DIST, "_headers")).then(revOf, () => "none");
  if (headersGot !== HEADERS_REV) bad.push(`HEADERS_REV is ${HEADERS_REV}, _headers is ${headersGot}`);
  const onDisk = [];
  for (const d of await readdir(join(DIST, "stickers"), { recursive: true })) if (String(d).endsWith(".png")) onDisk.push(`./stickers/${String(d).split("\\").join("/")}`);
  const listed = new Set(STICKER_FILES.map(([u]) => u));
  const unlisted = onDisk.filter((u) => !listed.has(u));
  const inShell = ENTRIES.filter(([u]) => u.startsWith("./stickers/") && u.endsWith(".png")).length;
  if (unlisted.length) bad.push(`${unlisted.length} sticker pictures are in no list: ${unlisted.slice(0, 3).join(", ")}`);
  if (inShell) bad.push(`${inShell} sticker pictures are still in the app's own list`);
  check(`4 every revision the build lists is the SHA-256 of the file it ships (${ENTRIES.length} app files, ${STICKER_FILES.length} stickers, _headers)`,
    bad.length === 0, bad.length ? bad.slice(0, 4).join("; ") : `v${V}, build ${BUILD.slice(0, 12)}…`);
}

// ---- 4b — THE STAMP NAMES THE TREE THE BUILD WAS MADE FROM ----
// The same-build takeover (adoptIfAlone) trusts this stamp, and the report
// prints it. vite.config.ts buildId appends a digest when the tree has changes
// nobody committed; restated here from the same two git reads, so a stamp that
// claims changes the tree does not have goes red. It did: Vite writes a
// temporary copy of its own config beside it for the length of a load, the
// stamp's git read ran in that window, and every build of a clean commit was
// stamped as modified with a digest that differed from build to build.
{
  const git = (c) => execSync(c, { encoding: "utf8" }).trim();
  let want = "(git could not be read)";
  try {
    const sha = git("git rev-parse HEAD");
    const changed = git("git status --porcelain");
    want = changed
      ? `${sha}+${createHash("sha256").update(changed).update(execSync("git diff HEAD", { maxBuffer: 1 << 28 })).digest("hex").slice(0, 12)}`
      : sha;
  } catch { /* want says so */ }
  check("4b the build is stamped with the tree it was built from, and nothing else",
    BUILD === want, BUILD === want ? BUILD.slice(0, 20) + "…" : `stamped ${BUILD}, the tree is ${want}`);
}

const server = await serve().catch((err) => {
  console.error(`\ncannot serve on :${PORT} — ${err.code ?? err.message}. This walk brings its own`);
  console.error(`server because the redirect IS the thing under test; free the port and re-run.\n`);
  process.exit(2);
});
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });

/** THE STRIP'S HISTORY, kept by the page itself: every change to its visibility,
 *  state, sentence or count, in order, in `window.__strip`. An init script, so
 *  it is there before the app runs and survives nothing but a reload. */
const STRIP_LOG = `(() => {
  window.__strip = [];
  const snap = () => {
    const s = document.getElementById("swStrip"); if (!s) return;
    const t = s.querySelector(".sw-strip-sentence"), c = s.querySelector(".sw-strip-count");
    const e = { hidden: s.hidden, state: s.dataset.state || "", sentence: (t ? t.textContent : s.textContent).trim(), count: c ? c.textContent : "" };
    const l = window.__strip[window.__strip.length - 1];
    if (!l || l.hidden !== e.hidden || l.state !== e.state || l.sentence !== e.sentence || l.count !== e.count) window.__strip.push(e);
  };
  document.addEventListener("DOMContentLoaded", () => {
    const s = document.getElementById("swStrip"); if (!s) return;
    snap();
    new MutationObserver(snap).observe(s, { attributes: true, childList: true, subtree: true, characterData: true });
  });
  window.__cc = 0;
  navigator.serviceWorker.addEventListener("controllerchange", () => { window.__cc++; });
})();`;

/** Which worker is which, asked of each: the controller, the active, the
 *  waiting worker's VERSION, whether one is installing, and every cache name.
 *  Takes the page; returns the object. A worker that does not answer reads as
 *  "no answer", never as a version. */
const workers = (p) => p.evaluate(async () => {
  const ask = (w) => !w ? Promise.resolve(null) : new Promise((res) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = (e) => res(e.data);
    w.postMessage({ type: "VERSION" }, [ch.port2]);
    setTimeout(() => res("no answer"), 1500);
  });
  const r = await navigator.serviceWorker.getRegistration();
  return {
    controller: await ask(navigator.serviceWorker.controller),
    active: await ask(r?.active), waiting: await ask(r?.waiting), installing: !!r?.installing,
    keys: await caches.keys(),
  };
});

/** A FRESH BROWSER PROFILE on /ir.html, once its worker is installed, active
 *  and in control. Takes the page path and an optional init script; returns
 *  { ctx, p }. The caller closes ctx. */
async function openFresh(init) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  await p.goto(`${ORIGIN}/ir.html`);
  await settledWorker(p);
  return { ctx, p };
}

/** WAIT FOR THE PRECACHE TO FINISH, not for it to start. Takes the page;
 *  returns once a worker is active with nothing installing or waiting and the
 *  page is under its control. install resolves only when its waitUntil does,
 *  which is after the last entry is written, so a worker that is active with
 *  nothing installing has finished precaching.
 *  NOT waitForFunction: it does not await a Promise predicate, so an
 *  `async () =>` condition returns a Promise, a Promise is truthy, and the wait
 *  passes instantly. Three of them did. */
async function settledWorker(p, ms = 120000) {
  await until(p, "the worker to finish installing and activate", async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return !!(r && r.active && !r.installing && !r.waiting);
  }, null, ms);
  await until(p, "the page to be under the worker's control", () => !!navigator.serviceWorker.controller, null, ms);
}

/** Ask the host for the newest worker, from the page. */
const update = (p) => p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
/** Resolves once a worker has installed and is waiting. */
const waiting = (p, ms = 60000) => until(p, "the new release to finish installing and wait", async () => {
  const r = await navigator.serviceWorker.getRegistration();
  return !!(r && r.waiting && !r.installing);
}, null, ms);

/** WHAT CACHE `name` HOLDS FOR `entries`: each url's x-ips-rev label and the
 *  SHA-256 prefix of its stored bytes, hashed IN the page from what the cache
 *  gives back. Takes the page, the cache name and [url, rev] pairs; returns
 *  [url, label, digest] triples, label and digest null for a miss. */
const stored = (p, name, entries) => p.evaluate(async ({ name, entries }) => {
  const hex = async (buf) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].slice(0, 8).map((x) => x.toString(16).padStart(2, "0")).join("");
  if (!(await caches.has(name))) return entries.map(([u]) => [u, null, null]);
  const c = await caches.open(name);
  const out = [];
  for (const [u] of entries) {
    const m = await c.match(u);
    out.push([u, m ? m.headers.get("x-ips-rev") : null, m ? await hex(await m.arrayBuffer()) : null]);
  }
  return out;
}, { name, entries });

/** The install's summary as that release stored it, or null. */
const summaryOf = (p, name) => p.evaluate(async (name) => {
  if (!(await caches.has(name))) return null;
  const r = await (await caches.open(name)).match("./__install-summary");
  return r ? r.json() : null;
}, name);

/** RUN ONE SCENARIO in its own browser profile, and never let it take the
 *  others down. Takes a name and the body, which is handed a place to register
 *  the context it opens; whatever it throws is a FAIL with its reason, and the
 *  context is closed in `finally` whatever happened. */
async function scenario(name, body) {
  const ctxs = [];
  reset();
  try {
    await body((c) => { ctxs.push(c); return c; });
  } catch (err) {
    check(`${name} could not finish`, false, String(err?.message ?? err).split("\n")[0]);
  } finally {
    for (const r of S.hung) { try { r.destroy(); } catch { /* already gone */ } }
    for (const c of ctxs) await c.close().catch(() => {});
    reset();
  }
}

const PAL = "/palette.css";
const palReal = await readFile(join(DIST, "palette.css"));
/** palette.css with one comment appended: the same file for the app, different
 *  bytes and therefore a different revision — a release that changed one file. */
const palAs = (tag) => Buffer.concat([palReal, Buffer.from(`\n/* offline-shell-walk: ${tag} */\n`)]);
const READY = "A new version of this app is ready.";

try {
  // ======== A: the first install, and the app offline =====================
  await scenario("A (first install)", async (keep) => {
    const { ctx, p } = await openFresh();
    keep(ctx);
    const firstInstall = [...S.log];

    // THE PLANT LANDED — asserted before anything is measured. A --plant run
    // that did not actually substitute would print honest-looking reds about a
    // fixed worker, which is the failure mode "made to fail once" exists to
    // prevent rather than to demonstrate.
    const plant = PLANT && PLANTS[PLANT];
    if (plant && !plant.server) {
      const missed = plant.edits.filter(([find]) => !plantHits.has(find));
      if (missed.length) check("the plant applied", false, `dist/sw.js does not contain: ${missed.map(([f]) => f.trim()).join(" | ")}`);
    }

    // 0 — A FILE THE DEPLOY DOES NOT HAVE IS NOT FOUND, and nothing is stored
    // under its name (decision 071). Asked through the worker, the way an
    // install or a stale page asks: with the host's single-page fallback it
    // came back as the start page with a 200, and the worker kept it.
    const missing404 = await p.evaluate(async () => {
      const u = "/assets/not-in-this-deploy-071.js";
      const r = await fetch(u, { cache: "no-store" });
      const stored = await caches.match(u);
      return { status: r.status, type: r.headers.get("content-type") ?? "", stored: !!stored };
    });
    if (PLANT === "no404" && !no404Planted) check("the no404 plant applied", false, "the server was never asked for a missing file");
    check("0 a file the deploy does not have answers 404, and nothing is stored under its name",
      missing404.status === 404 && !missing404.stored,
      `status ${missing404.status} (${missing404.type})${missing404.stored ? ", and the worker stored it" : ""}`);

    // 1 — NOTHING IN THE CACHE MAY BE REDIRECTED. This is the property, stated
    // once, rather than a list of the URLs that happen to redirect today.
    // Since 071 every INSTALL write is a constructed response and cannot carry
    // the flag, so the install alone no longer exercises the line --plant=
    // redirect removes. A run-time fetch does: the query string misses every
    // cache, the stand-in answers 308, and the worker stores what came back
    // through the same function. That write lands inside waitUntil, AFTER the
    // fetch resolves — so the check waits for the entry to exist, or the plant
    // could come out green by measuring before it.
    await p.evaluate(() => fetch("/ir.html?walk=1").then((r) => r.text()));
    await until(p, "the run-time copy of /ir.html?walk=1 to be stored", async () => !!(await caches.match("/ir.html?walk=1")), null, 15000);
    const bad = await p.evaluate(async () => {
      const out = [];
      for (const k of await caches.keys()) {
        const c = await caches.open(k);
        for (const req of await c.keys()) {
          const res = await c.match(req);
          if (res && res.redirected) out.push(new URL(req.url).pathname + new URL(req.url).search);
        }
      }
      return out;
    });
    check("1 nothing in the cache is a redirected response", bad.length === 0,
      bad.length ? `${bad.length} are: ${bad.slice(0, 6).join(", ")}` : "checked every entry of every cache, including a run-time copy that followed a 308");

    // 2 — AND EVERY PAGE IS UNDER THE URL A READER WILL ASK FOR. Read straight
    // out of the cache, BEFORE going offline, so it answers for what INSTALL
    // wrote and nothing else: a navigation caches what it fetched, so the same
    // question asked after one would be satisfied by the page this walk had
    // just visited. That distinction is the whole value of the check — activate
    // wipes the old cache on every release, so what a reader has offline the
    // next morning is exactly the set install put there.
    // The url set comes from deployServesAt, the same function the server
    // answers its 308s with, so what is asserted is that the worker's keys
    // agree with the DEPLOY — not with a second copy of the worker's own logic.
    const pages = ENTRIES.map(([u]) => u).filter((u) => u.endsWith(".html"));
    const canonical = pages.map(deployServesAt);
    const missing = await p.evaluate(async (urls) => {
      const out = [];
      for (const u of urls) if (!(await caches.match(new URL(u, location.href).href))) out.push(u);
      return out;
    }, canonical);
    check(`2 all ${canonical.length} pages are cached under the url the deploy serves them at`, missing.length === 0,
      missing.length ? `${missing.length} missing: ${missing.join(", ")}` : canonical.join(", "));

    // 3 — AND THE APP ACTUALLY OPENS WITH NO NETWORK, from the manifest's own
    // start_url, which is the reader's test and the only one that would have
    // caught this from outside.
    //
    // ONE NAVIGATION COVERS BOTH URLS, which is a measured platform fact rather
    // than a saving: a 308 is cacheable by default, so once the browser has
    // seen it, a navigation to /ir.html is REPLAYED to /ir before the worker is
    // consulted at all. Measured here on 2026-09-23 — under --plant=alias this
    // check reports being served /ir, and it never asked for /ir.html. So a
    // second navigation to /ir would not be a second case; the url set is check
    // 2's job, and it asks the cache rather than the browser precisely because
    // the browser has its own answers.
    await ctx.setOffline(true);
    const IR_TITLE = "Infrared Photography Studio";
    let navError = "";
    try {
      await p.goto(`${ORIGIN}/ir.html`, { timeout: 60000 });
    } catch (err) {
      navError = String(err?.message ?? err).split("\n")[0];
    }
    const got = navError ? null : await p.evaluate(() => ({
      stage: !!document.getElementById("stage"), where: location.pathname, title: document.title,
      chars: document.body ? document.body.innerHTML.length : 0,
    }));
    // The title is part of the test rather than only the message: #stage is in
    // macro.html too, so a stage alone cannot tell one editor from the other.
    const ir = !!got && got.stage && got.title === IR_TITLE;
    check("3 the app opens offline at the manifest's start_url (/ir.html)", ir,
      navError || (ir ? `the infrared editor rendered from the cache at ${got.where}` : `served ${got.where} titled "${got.title}", ${got.chars} characters of body`));

    // 5 — A FIRST INSTALL LABELS EVERYTHING IT STORES, with the revision the
    // walk computed from the bytes, and the sticker library is in its own
    // cache. Caches read fine offline, so this runs after 3.
    const own = await stored(p, `ips-${V}`, ENTRIES);
    const lib = await stored(p, "ips-stickers", STICKER_FILES);
    const wrong = [...own.map((x, i) => [x, ENTRIES[i][1]]), ...lib.map((x, i) => [x, STICKER_FILES[i][1]])]
      .filter(([[, label, digest], r]) => label !== labelOf(r) || digest !== r).map(([[u, label]]) => `${u} (${label ?? "missing"})`);
    // "./" and "./index.html" are the same bytes: ONE download stores both.
    const root = firstInstall.filter((u) => u === "/").length, index = firstInstall.filter((u) => u === "/index.html").length;
    check(`5 a first install stores all ${ENTRIES.length} app files in ips-${V} and all ${STICKER_FILES.length} stickers in ips-stickers, each labelled with its revision, and the start page's bytes once`,
      wrong.length === 0 && root === 1 && index === 0,
      `${wrong.length ? `${wrong.length} wrong: ${wrong.slice(0, 4).join(", ")}` : "every label names the bytes stored beside it"}; "/" downloaded ${root} time(s), "/index.html" ${index}`);
  });

  // ======== B: a NEWER release that changed one file =======================
  await scenario("B (an update)", async (keep) => {
    const { ctx, p } = await openFresh(STRIP_LOG);
    keep(ctx);
    await p.evaluate(() => { window.__cc = 0; }); // the first install's own claim is not a takeover
    const pal2 = palAs("9999.2");
    S.sw = release({ version: "9999.2", build: "walk-9999.2", files: { [PAL]: pal2 } });
    S.files.set(PAL, pal2);
    // Served slowly, so the downloading notice is on screen long enough to see.
    S.slow.set(PAL, 1500);
    S.log = [];
    await update(p);
    await waiting(p);
    const reqs = [...S.log];

    // 6 — NOTHING UNCHANGED IS DOWNLOADED, and the new cache is still whole.
    const extra = reqs.filter((u) => u !== "/sw.js" && u !== PAL);
    const want = ENTRIES.map(([u, r]) => [u, u === "." + PAL ? revOf(pal2) : r]);
    const got = await stored(p, "ips-9999.2", want);
    const wrong = got.filter(([, label], i) => label !== labelOf(want[i][1])).map(([u, label]) => `${u} (${label ?? "missing"})`);
    check(`6 an update that changed one file downloads nothing else, and its cache holds all ${ENTRIES.length} entries labelled`,
      extra.length === 0 && wrong.length === 0,
      `${reqs.length} requests: ${[...new Set(reqs)].slice(0, 8).join(", ")}${wrong.length ? `; ${wrong.length} entries wrong: ${wrong.slice(0, 3).join(", ")}` : ""}`);

    // 7 — THE CHANGED FILE IS DOWNLOADED ONCE, and what is stored is its NEW bytes.
    const palCount = reqs.filter((u) => u === PAL).length;
    const [[, palLabel, palDigest]] = await stored(p, "ips-9999.2", [["." + PAL, revOf(pal2)]]);
    check("7 the one changed file is downloaded once and stored with its new bytes and label",
      palCount === 1 && palDigest === revOf(pal2) && palLabel === labelOf(revOf(pal2)),
      `requested ${palCount} time(s); stored ${palDigest}, label ${palLabel}; the new bytes are ${revOf(pal2)}`);

    // 8 — NO STICKER IS DOWNLOADED AGAIN: the library outlives the release.
    const stickerReqs = reqs.filter((u) => u.startsWith("/stickers/") && u.endsWith(".png"));
    check("8 a second release fetches no sticker", stickerReqs.length === 0,
      stickerReqs.length ? `${stickerReqs.length} sticker requests, first ${stickerReqs[0]}` : `0 of ${STICKER_FILES.length} requested`);

    // 9 — THE STRIP SAID IT WAS DOWNLOADING, with a count, and then that it was ready.
    await until(p, "the ready notice", () => { const s = document.getElementById("swStrip"); return !s.hidden && s.dataset.state === "ready"; }, null, 15000);
    await p.waitForTimeout(200);
    const log = await p.evaluate(() => window.__strip);
    const dl = log.findIndex((e) => !e.hidden && e.state === "downloading" && e.sentence === "Downloading the update…" && /^\d+ of \d+$/.test(e.count));
    const rd = log.findIndex((e, i) => i > dl && !e.hidden && e.state === "ready" && e.sentence === READY && e.count === "");
    check("9 while it downloaded, the strip said so with a count, and then said the new version was ready",
      dl >= 0 && rd > dl, log.filter((e) => !e.hidden && e.sentence).map((e) => `[${e.state}] ${e.sentence}${e.count ? " " + e.count : ""}`).join(" → ") || "the strip never showed");

    // 10 — A NEWER WORKER DOES NOT TAKE OVER WITH NOTHING PRESSED. The page
    // asks every waiting worker to adopt it; a newer build must refuse. Six
    // seconds, because the state right after the notice appears looks identical
    // in both builds (NOTES, the 2026-09-10 negative control that passed a
    // defect).
    await p.waitForTimeout(6000);
    const w10 = await workers(p);
    const cc10 = await p.evaluate(() => window.__cc);
    check("10 a newer version waits: nothing pressed, nothing taken over",
      w10.controller === V && w10.waiting === "9999.2" && cc10 === 0 && w10.keys.includes(`ips-${V}`),
      `controller ${w10.controller}, waiting ${w10.waiting}, ${cc10} takeover(s), caches ${w10.keys.join(", ")}`);

    // 11 — PRESSING UPDATE TAKES IT, reloads once, and clears the old cache.
    const nav = p.waitForNavigation({ timeout: 30000 });
    await p.click("#swStripGo", { timeout: 10000 });
    await nav;
    await until(p, "the page to be controlled after the update", () => !!navigator.serviceWorker.controller, null, 15000);
    const w11 = await workers(p);
    check("11 pressing Update now takes the new version and deletes the old one's cache",
      w11.controller === "9999.2" && !w11.keys.includes(`ips-${V}`) && w11.keys.includes("ips-9999.2") && w11.keys.includes("ips-stickers"),
      `controller ${w11.controller}, caches ${w11.keys.join(", ")}`);

    // 12 — THE REPORT SAYS WHAT THAT INSTALL COST, from the test page, which
    // is the diagnostic a reader copies.
    await p.goto(`${ORIGIN}/debug.html`);
    await until(p, "the test page's report", () => /Offline worker/.test(document.getElementById("dText")?.value ?? ""), null, 30000);
    const line = await p.evaluate(() => document.getElementById("dText").value.split("\n").find((l) => l.startsWith("Offline worker")) ?? "");
    const kept = ENTRIES.length + STICKER_FILES.length - 1;
    check("12 the report's Offline worker line says what the install kept and downloaded",
      line.includes(`its install kept ${kept} files already on this device and downloaded 1,`) && line.includes("every sticker on the device"),
      line.replace(/\s+/g, " ").slice(0, 220));

    // 13 — A DOWNLOAD THAT FAILS SAYS SO, and offers OK rather than Update.
    await p.goto(`${ORIGIN}/ir.html`);
    await until(p, "the page to be controlled", () => !!navigator.serviceWorker.controller, null, 15000);
    await p.waitForTimeout(500);
    S.sw = release({ version: "9999.3", build: "walk-9999.3", files: { [PAL]: palAs("9999.3") } });
    S.fail.add(PAL);
    S.slow.set(PAL, 1500);
    await update(p).catch(() => {});
    const failedShown = await within(p, () => { const s = document.getElementById("swStrip"); return !s.hidden && s.dataset.state === "failed"; }, null, 20000);
    const f = await p.evaluate(() => ({
      sentence: document.querySelector("#swStrip .sw-strip-sentence")?.textContent ?? "",
      later: document.getElementById("swStripLater").textContent,
      goShown: getComputedStyle(document.getElementById("swStripGo")).display !== "none",
      sawDownloading: window.__strip.some((e) => !e.hidden && e.state === "downloading"),
    }));
    check("13 a download that fails ends at a notice that says so, with OK and no Update button",
      failedShown && f.sawDownloading && f.sentence.startsWith("The update could not finish downloading.") && f.later === "OK" && !f.goShown,
      `${failedShown ? "shown" : "never shown"}: "${f.sentence}" · button "${f.later}" · Update ${f.goShown ? "still offered" : "hidden"} · downloading ${f.sawDownloading ? "seen first" : "never seen"}`);
    if (failedShown) await p.click("#swStripLater", { timeout: 5000 });

    // 14 — NOT NOW DURING A DOWNLOAD hides it, and does not silence the ready
    // notice that follows: its own flag, not the new-version one.
    S.fail.clear();
    const pal4 = palAs("9999.4");
    S.sw = release({ version: "9999.4", build: "walk-9999.4", files: { [PAL]: pal4 } });
    S.files.set(PAL, pal4);
    S.slow.set(PAL, 2500);
    await update(p);
    await until(p, "the downloading notice", () => { const s = document.getElementById("swStrip"); return !s.hidden && s.dataset.state === "downloading"; }, null, 15000);
    await p.click("#swStripLater", { timeout: 5000 });
    const hiddenAfter = await p.evaluate(() => document.getElementById("swStrip").hidden);
    await waiting(p);
    const readyAfter = await within(p, () => { const s = document.getElementById("swStrip"); return !s.hidden && s.dataset.state === "ready"; }, null, 10000);
    check("14 Not now during a download hides it, and the ready notice still comes when it finishes",
      hiddenAfter && readyAfter, `hidden after Not now: ${hiddenAfter}; ready notice afterwards: ${readyAfter}`);
  });

  // ======== C: no message ever arrives =====================================
  await scenario("C (no messages)", async (keep) => {
    // Every "message" listener on the worker container is dropped, and the
    // PROGRESS question is never sent — the two routes the count can arrive by.
    const SILENCE = `(() => {
      window.__dropped = { listeners: 0, asks: 0 };
      const add = ServiceWorkerContainer.prototype.addEventListener;
      ServiceWorkerContainer.prototype.addEventListener = function (t, ...r) { if (t === "message") { window.__dropped.listeners++; return; } return add.call(this, t, ...r); };
      const post = ServiceWorker.prototype.postMessage;
      ServiceWorker.prototype.postMessage = function (m, ...r) { if (m && m.type === "PROGRESS") { window.__dropped.asks++; return; } return post.call(this, m, ...r); };
    })();`;
    const { ctx, p } = await openFresh(SILENCE + STRIP_LOG);
    keep(ctx);
    const pal2 = palAs("9999.2");
    S.sw = release({ version: "9999.2", build: "walk-9999.2", files: { [PAL]: pal2 } });
    S.files.set(PAL, pal2);
    S.slow.set(PAL, 1500);
    await update(p);
    await waiting(p);
    const readyShown = await within(p, () => { const s = document.getElementById("swStrip"); return !s.hidden && s.dataset.state === "ready"; }, null, 10000);
    const r = await p.evaluate(() => ({
      dropped: window.__dropped,
      counted: window.__strip.some((e) => e.count !== "" || e.state === "downloading"),
      count: document.querySelector("#swStrip .sw-strip-count")?.textContent ?? "(none)",
    }));
    check("15 with no progress message at all, the strip still ends at the ready notice, with no count",
      readyShown && !r.counted && r.count === "" && r.dropped.listeners > 0 && r.dropped.asks > 0,
      `ready ${readyShown}; a count ${r.counted ? "WAS" : "was never"} shown; dropped ${r.dropped.listeners} listener(s) and ${r.dropped.asks} question(s)`);
  });

  // ======== D: the SAME build, waiting ======================================
  await scenario("D (the same build)", async (keep) => {
    // Release 1 is an older version under another build id; the page is this
    // build. Then this build's own worker arrives.
    S.sw = release({ version: "0.0.1", build: "walk-0.0.1" });
    const { ctx, p } = await openFresh(STRIP_LOG);
    keep(ctx);
    await p.evaluate(() => { window.__marker = "no reload"; window.__cc = 0; });
    // A NEWER release's cache, as one still installing would leave it.
    await p.evaluate(async () => { await (await caches.open("ips-9999.9")).put("/walk-newer", new Response("newer")); });
    S.sw = SW_SRC;
    S.log = [];
    await update(p);
    const took = await within(p, () => window.__cc > 0, null, 20000);
    // controllerchange fires as activation BEGINS, before the activate handler
    // has deleted anything, so the cache list is read once it has finished.
    if (took) await within(p, async () => (await navigator.serviceWorker.getRegistration())?.active?.state === "activated", null, 10000);
    const w = await workers(p);
    const r = await p.evaluate(() => ({ marker: window.__marker, shown: window.__strip.some((e) => !e.hidden) }));
    const reqs = [...new Set(S.log)];
    check("16 a waiting worker that IS the build on screen takes over with nothing pressed and nothing reloaded",
      took && w.controller === V && r.marker === "no reload" && !r.shown && !w.keys.includes("ips-0.0.1") && reqs.every((u) => u === "/sw.js"),
      `controller ${w.controller} (${took ? "took over" : "never took over"}), ${r.marker === "no reload" ? "no reload" : "RELOADED"}, strip ${r.shown ? "SHOWN" : "never shown"}, caches ${w.keys.join(", ")}, requests ${reqs.join(", ") || "none"}`);
    // 21 — AND THAT ACTIVATION LEFT A NEWER RELEASE'S CACHE ALONE, which is what
    // stops an older worker activating from emptying a newer one's install.
    check("21 an activation deletes older releases' caches and leaves a newer one's alone",
      took && w.keys.includes("ips-9999.9") && !w.keys.includes("ips-0.0.1"), `caches ${w.keys.join(", ")}`);
  });

  // ======== E: the same build, with a second window open ====================
  await scenario("E (two windows)", async (keep) => {
    S.sw = release({ version: "0.0.1", build: "walk-0.0.1" });
    const { ctx, p } = await openFresh(STRIP_LOG);
    keep(ctx);
    const p2 = await ctx.newPage();
    await p2.goto(`${ORIGIN}/ir.html`);
    await until(p2, "the second window to be controlled", () => !!navigator.serviceWorker.controller, null, 15000);
    await p.evaluate(() => { window.__cc = 0; });
    S.sw = SW_SRC;
    await update(p);
    await waiting(p);
    await p.waitForTimeout(5000);
    const w = await workers(p);
    const cc = await p.evaluate(() => window.__cc);
    check("17 with a second window open, the same build still waits: the other window may be an older one",
      w.controller === "0.0.1" && w.waiting === V && cc === 0,
      `controller ${w.controller}, waiting ${w.waiting}, ${cc} takeover(s) five seconds after it installed`);
  });

  // ======== F: the app is closed while an update installs ===================
  await scenario("F (closed mid-install)", async (keep) => {
    // Release 1, then release 2 WAITING — a worker from before 071, whose
    // activate keeps nothing but its own cache and the practice photos — and
    // then this build installing, with its one changed file served slowly. The
    // last window closes while that file is on its way. The browser activates
    // the waiting worker on its own, and its cleanup deletes the cache this
    // install is filling (071 review, reproduced in Chromium).
    const pal1 = palAs("0.0.1");
    S.sw = release({ version: "0.0.1", build: "walk-0.0.1", files: { [PAL]: pal1 } });
    S.files.set(PAL, pal1);
    const { ctx, p } = await openFresh();
    keep(ctx);
    S.sw = release({
      version: "0.0.2", build: "walk-0.0.2", files: { [PAL]: pal1 },
      edits: [["  if (k === CACHE || k === EXAMPLES || k === STICKERS) return true;", "  return k === CACHE || k === EXAMPLES; // WALK: a worker from before 071 keeps nothing else"]],
    });
    await update(p);
    await waiting(p);
    S.sw = SW_SRC;
    S.files.delete(PAL);
    S.slow.set(PAL, 5000);
    S.log = [];
    S.done = [];
    await update(p);
    const t0 = Date.now();
    while (!S.log.includes(PAL)) {
      if (Date.now() - t0 > 20000) throw new Error("the install never asked for the changed file");
      await sleep(50);
    }
    await p.close();
    while (!S.done.some((d) => d.p === PAL)) {
      if (Date.now() - t0 > 30000) throw new Error("the changed file was never answered");
      await sleep(50);
    }
    await sleep(2500); // the rest of that install is local
    const p2 = await ctx.newPage();
    await p2.goto(`${ORIGIN}/ir.html`);
    await until(p2, "the reopened page to be controlled", () => !!navigator.serviceWorker.controller, null, 15000);
    const r = await p2.evaluate(async (entries) => {
      const ask = (w) => !w ? Promise.resolve(null) : new Promise((res) => {
        const ch = new MessageChannel(); ch.port1.onmessage = (e) => res(e.data);
        w.postMessage({ type: "VERSION" }, [ch.port2]); setTimeout(() => res("no answer"), 1500);
      });
      const reg = await navigator.serviceWorker.getRegistration();
      const active = await ask(reg.active);
      const name = `ips-${active}`;
      const has = await caches.has(name);
      let missing = entries.length;
      if (has) { const c = await caches.open(name); missing = 0; for (const [u] of entries) if (!(await c.match(u))) missing++; }
      return { active, has, missing, keys: await caches.keys() };
    }, ENTRIES);
    check("18 closing the app while an update installs still leaves a whole offline copy behind the version that opens",
      r.has && r.missing === 0,
      `active ${r.active}; its cache ${r.has ? `is missing ${r.missing} of ${ENTRIES.length}` : "does not exist"}; caches ${r.keys.join(", ") || "none"}`);
  });

  // ======== G: every sticker refused ========================================
  await scenario("G (stickers refused)", async (keep) => {
    S.failStickers = true;
    const { ctx, p } = await openFresh();
    keep(ctx);
    const s = await summaryOf(p, `ips-${V}`);
    await p.goto(`${ORIGIN}/debug.html`);
    await until(p, "the test page's report", () => /Offline worker/.test(document.getElementById("dText")?.value ?? ""), null, 30000);
    const line = await p.evaluate(() => document.getElementById("dText").value.split("\n").find((l) => l.startsWith("Offline worker")) ?? "");
    // And a missing sticker is fetched the first time it is used, into the library's cache.
    S.failStickers = false;
    const one = STICKER_FILES[0][0];
    await p.evaluate((u) => fetch(u).then((r) => r.arrayBuffer()), one);
    const onUse = await within(p, async (u) => !!(await (await caches.open("ips-stickers")).match(u)), one, 10000);
    check(`19 with every sticker refused the install still finishes, says ${STICKER_FILES.length} are missing, and a sticker is fetched when it is used`,
      !!s && s.stickersMissing === STICKER_FILES.length && line.includes(`${STICKER_FILES.length} stickers still to fetch`) && onUse,
      `summary ${JSON.stringify(s)}; report "${line.replace(/\s+/g, " ").slice(0, 160)}…"; fetched on use: ${onUse}`);
  });

  // ======== H: a sticker that never answers =================================
  await scenario("H (a stalled sticker)", async (keep) => {
    // The budget is rewritten to four seconds for this one release, and the
    // host holds every sticker request open without answering. A deadline
    // that only stops NEW downloads would leave the first one hanging until
    // the browser ends the install at five minutes — and fails it.
    S.hangStickers = true;
    S.sw = release({ edits: [["const STICKER_DEADLINE_MS = EVENT_LIMIT_MS * 0.8;", "const STICKER_DEADLINE_MS = 4000; // WALK: four seconds"]] });
    const ctx = keep(await b.newContext({ viewport: { width: 1280, height: 950 } }));
    const p = await ctx.newPage();
    await p.goto(`${ORIGIN}/ir.html`);
    const t0 = Date.now();
    const done = await within(p, async () => {
      const r = await navigator.serviceWorker.getRegistration();
      return !!(r && r.active && !r.installing && !r.waiting);
    }, null, 25000);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const s = done ? await summaryOf(p, `ips-${V}`) : null;
    check("20 a sticker download that never answers is cut off at the deadline, and the install still finishes",
      done && !!s && s.stickersMissing === STICKER_FILES.length,
      done ? `activated after ${secs} s with ${s?.stickersMissing} stickers left to fetch` : `still installing after ${secs} s`);
  });

  // ======== I: bytes that never match their revision ========================
  await scenario("I (bytes that never match)", async (keep) => {
    const { ctx, p } = await openFresh();
    keep(ctx);
    // The list names bytes the host never serves — what a host rewriting a
    // file looks like from inside the worker. The same build is live.
    S.sw = release({ version: "9999.2", build: "walk-9999.2", files: { [PAL]: palAs("never served") } });
    S.log = [];
    await update(p);
    await waiting(p);
    const s2 = await summaryOf(p, "ips-9999.2");
    const [[, lab, dig]] = await stored(p, "ips-9999.2", [["." + PAL, ""]]);
    const palReqs = S.log.filter((u) => u === PAL).length;
    check("22 a file that never matches its revision, while this build is still the one live, is stored unlabelled and counted, and the update arrives",
      !!s2 && s2.unverified === 1 && dig === revOf(palReal) && lab === null && palReqs === 2,
      `asked ${palReqs} time(s); stored ${dig ?? "nothing"} ${lab === null ? "unlabelled" : `labelled ${lab}`}; summary ${JSON.stringify(s2)}`);

    // A DIFFERENT release goes live while that check is being made: the
    // install must stop rather than store the other release's file as its own.
    S.sw = release({ version: "9999.3", build: "walk-9999.3", files: { [PAL]: palAs("never served either") } });
    S.onRequest = (key) => { if (key === PAL) S.sw = release({ version: "9999.4", build: "walk-9999.4" }); };
    S.log = [];
    await update(p);
    await until(p, "that install to end", async () => !(await navigator.serviceWorker.getRegistration()).installing, null, 30000);
    S.onRequest = null;
    const w23 = await workers(p);
    const asked = S.log.filter((u) => u === PAL).length, script = S.log.filter((u) => u === "/sw.js").length;
    check("23 when a different release goes live during that check, the install stops instead of storing its file",
      w23.waiting === "9999.2" && asked === 2 && script >= 2,
      `waiting ${w23.waiting}; the file asked ${asked} time(s), the worker script ${script}`);

    // 24 — THE HOST'S HEADER RULES CHANGE: nothing is carried forward, because
    // every copy on the device was stored with the old headers.
    S.sw = release({
      version: "9999.5", build: "walk-9999.5",
      edits: [[`const HEADERS_REV = ${JSON.stringify(HEADERS_REV)};`, `const HEADERS_REV = "walk-headers-changed";`]],
    });
    S.log = [];
    await update(p);
    await waiting(p);
    const want = new Set();
    const seenRev = new Set();
    for (const [u, r] of ENTRIES) { if (seenRev.has(r)) continue; seenRev.add(r); want.add(u === "./" ? "/" : u.slice(1)); }
    for (const [u] of STICKER_FILES) want.add(u.slice(1));
    const got = new Set(S.log);
    // A page downloaded arrives here as /x.html, or as /x alone when the browser
    // replays a 308 it has already seen (check 3's measured fact); a page
    // carried forward arrives as neither.
    const notAsked = [...want].filter((u) => !got.has(u) && !(deployServesAt(u) && got.has(deployServesAt(u))));
    check("24 when the host's header rules change, every file is downloaded again rather than carried forward with the old headers",
      notAsked.length === 0, notAsked.length ? `${notAsked.length} of ${want.size} carried forward, e.g. ${notAsked.slice(0, 3).join(", ")}` : `all ${want.size} downloaded`);
  });
} finally {
  await b.close();
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
}
if (PLANT) console.log(`\nplant "${PLANT}" should turn check ${PLANTS[PLANT].turns} red`);
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
