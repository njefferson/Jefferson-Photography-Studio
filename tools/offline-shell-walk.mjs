#!/usr/bin/env node
// THE APP OPENS OFFLINE. Reported from the device on 2.61: an iPad with no
// network got "Safari can't open the page. The error was: Response served by
// service worker has redirections" and a black screen.
//
//   node tools/offline-shell-walk.mjs [--plant[=redirect|alias]]
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
// serving dist. It starts its own on :8137 and closes it again.
//
// WHY IT NEEDS ITS OWN SERVER, and why no existing walk could have caught this.
// Every other walk here is served by `python3 -m http.server`, which returns
// /ir.html verbatim. THE DEPLOY DOES NOT: Cloudflare Pages 308-redirects every
// .html URL to its extensionless form — /ir.html to /ir, /index.html to / —
// measured against production on 2026-09-23. So the defect lives entirely in
// the gap between the harness and the deploy, and a walk on a plain file server
// is structurally incapable of seeing it. This one redirects the way Pages does.
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
// --plant=redirect (the default) and --plant=alias put back one half each, so
// each check can be seen to fail for its own reason. A plant is applied BY THE
// SERVER, to the sw.js it hands the browser, rather than by editing the shipped
// file — a plant that needs the tree dirtied is a plant somebody can forget to
// take out. The substitution is asserted to have landed before anything is
// measured, because a plant that silently did not apply prints the same green
// as a fix.
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { requireFreshDist } from "./fresh-dist.mjs";

requireFreshDist();
// --plant, --plant=redirect, --plant=alias. Bare --plant means the half the
// device reported; an unknown name stops rather than running a walk with no
// plant in it under a name that says there is one.
const PLANT_ARG = process.argv.find((a) => a === "--plant" || a.startsWith("--plant="));
const PLANT = PLANT_ARG ? (PLANT_ARG.split("=")[1] ?? "redirect") : "";
const DIST = new URL("../dist/", import.meta.url).pathname;
const PORT = 8137;
let failed = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "ok  " : "FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) failed++; };

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".dng": "application/octet-stream", ".jpg": "image/jpeg" };

// THE BUILT WORKER'S OWN PRECACHE LIST — read out of dist rather than restated
// here, because it is generated at build time and a copy would be a second
// answer to a question the build already answers.
const SW_SRC = await readFile(join(DIST, "sw.js"), "utf8");
const MANIFEST = SW_SRC.match(/const PRECACHE = \[([\s\S]*?)\];/);
if (!MANIFEST) throw new Error("dist/sw.js has no PRECACHE array — the build's precache plugin did not run");

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

// THE LINE THE FIX ADDED, and what it becomes when the defect is planted back.
// Matched against the built sw.js rather than the source, because the built one
// is what the browser runs.
const PLANTS = {
  redirect: {
    find: "  if (!res || !res.redirected) return res;",
    swap: "  return res; // PLANTED: store whatever the fetch returned, flag and all",
  },
  alias: {
    find: '  if (!u.endsWith(".html")) return null;',
    swap: "  return null; // PLANTED: .html keys only, which is what the list generates",
  },
};
if (PLANT && !PLANTS[PLANT]) {
  console.error(`unknown plant "${PLANT}" — one of: ${Object.keys(PLANTS).join(", ")}`);
  process.exit(2);
}
let planted = false;

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

/** A stand-in for the deploy, redirecting the way it really does.
 *
 *  Takes nothing; serves ../dist on PORT. Returns the running server so the
 *  caller can close it. Any request for `/x.html` answers 308 to `/x`, and
 *  `/x` is served from `x.html` on disk — which is what Cloudflare Pages does
 *  and what `python3 -m http.server` does not. The redirect is the whole point
 *  of this walk; a server without it cannot reproduce the defect.
 *
 *  Under --plant it also rewrites sw.js on its way out, and sets `planted`,
 *  which the caller asserts before trusting any red it sees.
 *
 *  It RESOLVES ON `listening`, which is the load-bearing part: a listen error
 *  arrives asynchronously, so a version that bound and launched the browser in
 *  the same breath would take a busy port while a browser was half-started and
 *  leave it running. Nothing here starts a process it has not confirmed it can
 *  clean up. */
function serve() {
  const s = createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    let p = decodeURIComponent(url.pathname);
    const to = deployServesAt(p);
    if (to) {
      res.writeHead(308, { Location: to });
      res.end();
      return;
    }
    let file = p === "/" ? "index.html" : p.replace(/^\//, "");
    if (!extname(file)) file += ".html";
    try {
      let body = await readFile(join(DIST, file));
      if (PLANT && file === "sw.js") {
        const text = body.toString("utf8");
        const { find, swap } = PLANTS[PLANT];
        if (text.includes(find)) { body = Buffer.from(text.replace(find, swap)); planted = true; }
      }
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404); res.end("not found");
    }
  });
  return new Promise((ok, no) => {
    s.once("error", no);
    s.listen(PORT, () => { s.removeListener("error", no); ok(s); });
  });
}

const server = await serve().catch((err) => {
  console.error(`\ncannot serve on :${PORT} — ${err.code ?? err.message}. This walk brings its own`);
  console.error(`server because the redirect IS the thing under test; free the port and re-run.\n`);
  process.exit(2);
});
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${PORT}/ir.html`);

  // WAIT FOR THE PRECACHE TO FINISH, not for it to start. Everything below
  // measures the cache, and the install writes it one entry at a time — going
  // offline part-way through aborts the install, the worker never activates,
  // and the offline check then fails for a reason that has nothing to do with
  // redirects. That is exactly what the first version of this walk did.
  //
  // ACTIVATION IS THE WHOLE SIGNAL, and one wait is better than two. install
  // resolves only when its waitUntil does, which is after the last entry is
  // written, so a worker that is active with nothing installing has finished
  // precaching. A second wait counting cache entries against PRECACHE.length
  // was here and was worse than nothing: install now writes one alias per page
  // on top of that list, so `>= length` can hold with real entries still
  // missing, and it could never bind after the wait above anyway. A check that
  // cannot fail, under a comment saying it really waited, is the shape this
  // repository has the most lessons about.
  //
  // NOT waitForFunction: it does not await a Promise predicate, so an
  // `async () =>` condition returns a Promise, a Promise is truthy, and the
  // wait passes instantly. Three of them did.
  await until(p, "the worker to finish installing and activate", async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return !!(r && r.active && !r.installing);
  });
  await until(p, "the page to be under the worker's control", () => !!navigator.serviceWorker.controller);

  // THE PLANT LANDED — asserted before anything is measured. A --plant run that
  // did not actually substitute would print two honest-looking reds about a
  // fixed worker, which is the failure mode "made to fail once" exists to
  // prevent rather than to demonstrate.
  if (PLANT && !planted) {
    console.log(`FAIL  the plant did not apply — dist/sw.js does not contain the line it replaces`);
    failed++;
  }

  // 1 — NOTHING IN THE CACHE MAY BE REDIRECTED. This is the property, stated
  // once, rather than a list of the URLs that happen to redirect today.
  const bad = await p.evaluate(async () => {
    const out = [];
    for (const k of await caches.keys()) {
      const c = await caches.open(k);
      for (const req of await c.keys()) {
        const res = await c.match(req);
        if (res && res.redirected) out.push(new URL(req.url).pathname);
      }
    }
    return out;
  });
  check("1 nothing in the cache is a redirected response", bad.length === 0,
    bad.length ? `${bad.length} are: ${bad.slice(0, 6).join(", ")}` : "checked every entry of every cache");

  // 2 — AND EVERY PAGE IS UNDER THE URL A READER WILL ASK FOR. Read straight
  // out of the cache, BEFORE going offline, so it answers for what INSTALL
  // wrote and nothing else: a navigation caches what it fetched, so the same
  // question asked after one would be satisfied by the page this walk had just
  // visited. That distinction is the whole value of the check — activate wipes
  // the old cache on every release, so what a reader has offline the next
  // morning is exactly the set install put there.
  // The url set comes from deployServesAt, the same function the server answers
  // its 308s with, so what is asserted is that the worker's keys agree with the
  // DEPLOY — not with a second copy of the worker's own logic kept here.
  const pages = JSON.parse(`[${MANIFEST[1]}]`).filter((u) => u.endsWith(".html"));
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
  // than a saving: a 308 is cacheable by default, so once the browser has seen
  // it, a navigation to /ir.html is REPLAYED to /ir before the worker is
  // consulted at all. Measured here on 2026-09-23 — under --plant=alias this
  // check reports being served /ir, and it never asked for /ir.html. So a
  // second navigation to /ir would not be a second case; the url set is check
  // 2's job, and it asks the cache rather than the browser precisely because
  // the browser has its own answers.
  await ctx.setOffline(true);

  /** OPEN A URL WITH NO NETWORK AND SAY WHAT CAME BACK.
   *
   *  Takes `path` on the local stand-in. Returns `{ ir, where, title, chars,
   *  navError }` — `ir` is whether the INFRARED editor rendered, the rest is
   *  what arrived instead. What the caller relies on: it distinguishes the
   *  three ways this fails, because a blank page, the launcher and the wrong
   *  editor are identical to a presence test and have different causes. The
   *  title is part of the test rather than only the message: #stage is in
   *  macro.html too, so a stage alone cannot tell one editor from the other,
   *  and a check named for the IR start_url has to answer for the IR page. */
  const IR_TITLE = "Infrared Photography Studio";

  async function openOffline(path) {
    let navError = "";
    try {
      await p.goto(`http://127.0.0.1:${PORT}${path}`, { timeout: 60000 });
    } catch (err) {
      navError = String(err?.message ?? err).split("\n")[0];
    }
    if (navError) return { ir: false, navError };
    const got = await p.evaluate(() => ({
      stage: !!document.getElementById("stage"),
      where: location.pathname,
      title: document.title,
      chars: document.body ? document.body.innerHTML.length : 0,
    }));
    return { navError: "", ...got, ir: got.stage && got.title === IR_TITLE };
  }

  const said = (r) => r.navError || (r.ir
    ? `the infrared editor rendered from the cache at ${r.where}`
    : `served ${r.where} titled "${r.title}", ${r.chars} characters of body`);

  const viaHtml = await openOffline("/ir.html");
  check("3 the app opens offline at the manifest's start_url (/ir.html)", viaHtml.ir, said(viaHtml));


  await ctx.close();
} finally {
  await b.close();
  server.close();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
