#!/usr/bin/env node
// THE START SCREEN WHILE THE EDITOR IS BEING PREPARED (decision 071).
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/build-wait-walk.mjs [--port=8131]
//
// WHY IT EXISTS. The first launch after a release sat on a PC for most of a
// minute with the start screen painted and nothing answering. Measured on the
// device: 42 s building the editor's picture code through Direct3D, 557 ms on
// an iPad. The editor built it inside the Renderer constructor and asked the
// driver whether it had finished at once, which holds the page for the whole
// build; it now asks for KHR_parallel_shader_compile, polls the one question
// that does not wait, and says on the start screen what it is doing.
//
// NOTHING HERE IS SLOW ON ITS OWN — the container builds the program in about
// twenty milliseconds — so every arm makes the build slow from outside with
// tools/slow-build.mjs, which models what Chromium does: every question about
// the program except COMPLETION_STATUS_KHR holds the page until the link is
// done. The app carries no hook for it.
//
// THE ARMS, each a claim that can fail:
//   1  a launch that expects a cold build says so BEFORE the build starts,
//      a control on the start screen answers while it runs, and "ready" is
//      said again when a dialog that was open over it closes
//   2  a launch that expected a warm build and got a slow one: no words for
//      the first second, words after it, a count, and NOTHING ON THE CARD
//      MOVES — before, during, at "ready" and after it clears — and the
//      report's Start-up line says the page stayed free, from its frames
//   3  a photo chosen during the build says so in the busy card and opens by
//      itself once the editor is ready
//   4  a warm launch that builds quickly says nothing at all
//   5  a browser with no way to build off the page: the words are PAINTED —
//      two frames — before the page is held, and the Start-up line admits the
//      page waited
//   5b the same browser starting again, its last build slow: the words are
//      painted before the page is held again. A record of the same picture code
//      is not a promise of a quick build (Firefox 156 on a PC paid 44 s every
//      start, and said nothing on the second).
//   6  a build that fails has its own panel, not "WebGL2 is missing", its
//      report carries what the driver said, and a photo chosen during it did
//      not cost the session stored from last time
//   7  the graphics taken away mid-build raise the lost-graphics panel
//
// DECISION 086, at a PC's size, run in this order because the first two are
// also the CONTROL for the third:
//   8c pictures that never arrive cannot hold the editor: the build waits for
//      them no longer than the ceiling (TILES_WAIT_MS in src/main.ts, 2 s);
//      and the instruments read that card as the 086 report saw it — no
//      picture in view arrived at the hold, every box flat in a screenshot
//   8b a browser that builds off the page: nothing about the pictures changes
//      and the build does not wait for them; and once they have loaded, the
//      same instrument reads every box as a picture
//   8  a browser with no way to build off the page: the practice pictures in
//      the start card's first view had arrived two frames or more before the
//      page was held, the ones out of view were left lazy, and a screenshot
//      taken DURING the hold shows pictures, not empty boxes, wherever this
//      Chromium can take one then
//   MADE TO FAIL: arm 8 is disowned in its own output unless 8c and 8b
//   reproduced an empty card and a full one with the same two instruments.
//
//   --shot=PATH writes arm 8's during-the-hold screenshot there, to be OPENED.
//
// SEEN FAILING against the build before this change (the synchronous one),
// which is the only thing that makes a pass here mean anything.
import { chromium } from "playwright-core";
import { requireFreshDist } from "./fresh-dist.mjs";
import { slowBuild } from "./slow-build.mjs";
requireFreshDist();

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `--${n}=${d}`).split("=")[1];
const PORT = arg("port", "8131");
const PAGE = `http://127.0.0.1:${PORT}/ir.html`;
const PREPARING = "Preparing the editor…";
const PREPARING_OPEN = "Preparing the editor — your photo opens as soon as it's ready.";
const READY = "The editor is ready.";
const JPG = ["public/examples/canopy.jpg", "public/examples/lodge.jpg"];
// The reader's own phone, from a §7f report: the start card is at its most
// crowded here, so a line that grew would show here first.
const PHONE = { viewport: { width: 402, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
// THE PC THE 086 REPORT CAME FROM, near enough: a desktop window tall enough
// that the practice grid's first row is inside the start card's first view.
// Arms 8 to 8c check that it is, rather than trusting this comment.
const PC = { viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 1 };
const SHOT = arg("shot", "");
const TILES_WAIT_MS = 2000; // src/main.ts, decision 086

let failed = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "ok  " : "FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) failed++; };
const ms = (n) => `${Math.round(n)} ms`;

/** A page with the build slowed as `cfg` says, loaded far enough that the start
 *  card is in the document. Not to "load": a build that holds the page holds
 *  the load event with it, and the old code is what this walk must be able to
 *  run against. */
async function open(ctx, cfg, record, extra) {
  const p = await ctx.newPage();
  p.on("dialog", (d) => d.accept());
  // WHAT THE LAST BUILD LEFT ON RECORD, when an arm needs a particular one: set
  // before the app's own code reads it.
  if (record) await p.addInitScript((r) => { try { localStorage.setItem("ips-graphics-built", r); } catch { /* the arm's checks say so */ } }, record);
  await p.addInitScript(slowBuild, cfg);
  if (extra) await p.addInitScript(extra);
  await p.goto(PAGE, { waitUntil: "commit" });
  await p.waitForSelector("#welcomeWhat", { state: "attached", timeout: 60000 });
  return p;
}
/** What the fake saw, without the context (not serialisable). */
const seen = (p) => p.evaluate(() => { const { ctx: _c, ...rest } = window.__bw; return { ...rest, now: performance.now() }; });
const linked = (p) => p.waitForFunction(() => window.__bw && window.__bw.linkAt > 0, null, { timeout: 60000, polling: 50 });
const released = (p) => p.waitForFunction(() => window.__bw.releasedAt > 0, null, { timeout: 60000, polling: 50 });
const sinceLink = (p, t) => p.waitForFunction((t) => performance.now() - window.__bw.linkAt >= t, t, { timeout: 60000, polling: 50 });
const sinceRelease = (p, t) => p.waitForFunction((t) => window.__bw.releasedAt > 0 && performance.now() - window.__bw.releasedAt >= t, t, { timeout: 60000, polling: 50 });

/** The start card's layout, as numbers: the card's own box and content height,
 *  the Open button a finger is about to reach for, and the preparing line. */
const box = (p) => p.evaluate(() => {
  const r = (e) => { if (!e) return "none"; const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map((n) => Math.round(n)).join(","); };
  const w = document.getElementById("welcome");
  const para = document.getElementById("preparing");
  return {
    card: r(w), content: w.scrollHeight, open: r(document.querySelector("#welcome .welcome-open")), line: r(document.getElementById("preparingLine")),
    text: para?.textContent ?? "(no preparing line)", count: document.getElementById("preparingFor")?.textContent ?? "",
    lines: para && para.textContent ? Math.round(para.getBoundingClientRect().height / parseFloat(getComputedStyle(para).lineHeight)) : 0,
  };
});
const layout = (b) => `card ${b.card} · content ${b.content} · Open ${b.open} · line ${b.line}`;

/** The report's Start-up and Graphics build lines, read out of the dialog the
 *  reader copies them from. */
async function report(p, via = "verTag") {
  await p.evaluate((id) => document.getElementById(id).click(), via);
  await p.waitForFunction(() => { const t = document.getElementById("verDlgText"); return !!t && /\nStart-up/.test(t.value); }, null, { timeout: 30000 });
  const txt = await p.evaluate(() => document.getElementById("verDlgText").value);
  await p.evaluate(() => document.getElementById("verDlg").close());
  const line = (k) => (txt.match(new RegExp(`^${k}\\s+(.*)$`, "m")) || [])[1] || "(no such line)";
  return { startup: line("Start-up"), build: line("Graphics build") };
}

/** WHAT THE START CARD'S PRACTICE PICTURES WERE THE MOMENT THE PAGE WAS HELD
 *  (decision 086), recorded IN the page, because nothing outside it can ask
 *  while it is held.
 *
 *  Takes nothing; returns nothing. Installed with `addInitScript` AFTER
 *  `slowBuild`, so it wraps that fake's getProgramParameter: the first question
 *  after the big link that is not the COMPLETION_STATUS_KHR poll is the one
 *  that holds the page, and the pictures are read just before it is asked.
 *  Leaves `window.__bw.pictures = { frame, at, tiles }`, each tile with
 *  whether it sits in the card's first view, its `loading`, whether its bytes
 *  had arrived, the frame they arrived at (-1: never), and its visible box.
 *
 *  What callers rely on: self-contained, like `slowBuild`, since Playwright
 *  serialises it into the page; and it reads the view the same way the app's
 *  practicePicturesPainted does (inside both the window and the card's box),
 *  so "in view" means the same thing on both sides. */
function watchPictures() {
  const arrived = new Map();
  document.addEventListener("load", (e) => {
    const t = e.target;
    if (t && t.tagName === "IMG" && window.__bw) arrived.set(t, window.__bw.frames);
  }, true);
  const P = WebGL2RenderingContext.prototype;
  const inner = P.getProgramParameter;
  P.getProgramParameter = function (prog, pname) {
    const bw = window.__bw;
    if (bw && bw.linkAt > 0 && !bw.pictures && pname !== 0x91b1) {
      const card = document.getElementById("welcome");
      const list = document.getElementById("galleryList");
      if (card && list) {
        const c = card.getBoundingClientRect();
        const top = Math.max(0, c.top), bottom = Math.min(innerHeight, c.bottom);
        const left = Math.max(0, c.left), right = Math.min(innerWidth, c.right);
        bw.pictures = {
          frame: bw.frames, at: performance.now(),
          tiles: Array.from(list.querySelectorAll("img")).map((im) => {
            const r = im.getBoundingClientRect();
            const inView = r.width > 0 && r.height > 0 && r.bottom > top && r.top < bottom && r.right > left && r.left < right;
            const vx = Math.max(r.left, left), vy = Math.max(r.top, top);
            const vis = inView ? [vx, vy, Math.min(r.right, right) - vx, Math.min(r.bottom, bottom) - vy].map(Math.round) : null;
            return { name: (im.getAttribute("src") || "").split("/").pop(), inView, loading: im.loading, complete: im.complete && im.naturalWidth > 0, frame: arrived.has(im) ? arrived.get(im) : -1, vis };
          }),
        };
      }
    }
    return inner.call(this, prog, pname);
  };
}

/** The practice pictures in the start card's first view NOW, read from a page
 *  that is free: each one's visible box `[x, y, w, h]` and whether its bytes
 *  have arrived. The same reading of "in view" as `watchPictures`. */
const picturesInView = (p) => p.evaluate(() => {
  const c = document.getElementById("welcome").getBoundingClientRect();
  const top = Math.max(0, c.top), bottom = Math.min(innerHeight, c.bottom);
  const left = Math.max(0, c.left), right = Math.min(innerWidth, c.right);
  return Array.from(document.querySelectorAll("#galleryList img")).flatMap((im) => {
    const r = im.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0 && r.bottom > top && r.top < bottom && r.right > left && r.left < right)) return [];
    const vx = Math.max(r.left, left), vy = Math.max(r.top, top);
    return [{ name: (im.getAttribute("src") || "").split("/").pop(), complete: im.complete && im.naturalWidth > 0, vis: [vx, vy, Math.min(r.right, right) - vx, Math.min(r.bottom, bottom) - vy].map(Math.round) }];
  });
});

/** How much each box of a screenshot varies, as the standard deviation of its
 *  luminance (0-255). Takes a page with no content security policy to work in,
 *  the PNG, and boxes `[x, y, w, h]` in CSS pixels at a device scale of 1.
 *  Returns one number per box. An empty tile is the tile's flat surface colour,
 *  near 0; a photograph is well above it. Insets each box by 2 px so a border
 *  does not count as a picture. */
async function spread(blank, png, boxes) {
  return blank.evaluate(async ({ b64, boxes }) => {
    const im = new Image();
    im.src = "data:image/png;base64," + b64;
    await im.decode();
    const c = document.createElement("canvas");
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext("2d");
    g.drawImage(im, 0, 0);
    return boxes.map(([x, y, w, h]) => {
      const d = g.getImageData(x + 2, y + 2, Math.max(1, w - 4), Math.max(1, h - 4)).data;
      let s = 0, s2 = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; s += l; s2 += l * l; n++; }
      const m = s / n;
      return Math.sqrt(Math.max(0, s2 / n - m * m));
    });
  }, { b64: png.toString("base64"), boxes });
}
const EMPTY_BELOW = 6; // luminance spread under which a tile's box reads as empty
const fmt = (v) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(1));

const shown = (p, id) => p.evaluate((i) => { const e = document.getElementById(i); if (!e) return false; const r = e.getBoundingClientRect(); return !e.hidden && r.width > 0 && r.height > 0; }, id);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
try {
  // ── 1 ─────────────────────────────────────────────────────────────────────
  console.log("\n1 — a launch that expects a cold build (nothing recorded for this picture code), 3 s build");
  const warmCtx = await browser.newContext(PHONE);
  let warmRecord = null;
  {
    const p = await open(warmCtx, { delay: 3000, par: true });
    await linked(p);
    let s = await seen(p);
    const w = s.said.find(([t]) => t === PREPARING);
    check("the words go up before the build is handed to the driver, and are painted first",
      !!w && w[1] < s.linkAt && s.linkFrame - w[2] >= 2,
      w ? `"${w[0]}" at frame ${w[2]}, the link at frame ${s.linkFrame}` : `the preparing line was never written (${s.said.length} writes)`);
    // A REAL CLICK, on a control the reader can see, while the build runs.
    await p.click("#welcomeWhat", { timeout: 60000 });
    s = await seen(p);
    const help = await p.evaluate(() => !!document.getElementById("helpDlg")?.open);
    check("a start-screen control answers while the editor is being prepared",
      help && !s.releasedAt, help ? (s.releasedAt ? `Help opened ${ms(s.now - s.releasedAt)} AFTER the build let go — the page was held` : `Help opened ${ms(s.now - s.linkAt)} into a 3000 ms build`) : "Help did not open");
    // LEFT OPEN ACROSS THE END OF THE BUILD, so "ready" is written behind a
    // modal, where a screen reader cannot hear it.
    await released(p);
    await sinceRelease(p, 400);
    const behind = await box(p);
    const closedAt = await p.evaluate(() => { document.getElementById("helpDlg").close(); return performance.now(); });
    await p.waitForTimeout(400);
    s = await seen(p);
    const after = s.said.filter(([, at]) => at > closedAt).map(([t]) => t);
    check("\"ready\" is said again once the dialog over it closes, so it is heard",
      behind.text === READY && after.includes(READY),
      `behind the dialog: "${behind.text}" · written after it closed: ${after.length ? after.map((t) => `"${t}"`).join(", ") : "nothing"}`);
    const stored = await p.evaluate(() => { try { return localStorage.getItem("ips-graphics-built"); } catch { return null; } });
    let rec = null;
    try { rec = JSON.parse(stored); } catch { /* reported below */ }
    check("a finished build is recorded with what it cost",
      !!rec && typeof rec.key === "string" && typeof rec.ms === "number" && rec.ms >= 2500,
      rec ? `key recorded, ${ms(rec.ms)}` : `recorded as ${JSON.stringify(stored)}`);
    // THE RECORD A WARM BROWSER HOLDS: this picture code, built quickly. Arms 2
    // to 4 start from it, because a build of seconds leaves a record that says
    // the next one will be slow too, and what they ask about is a launch that
    // expected a quick one.
    warmRecord = JSON.stringify({ key: rec ? rec.key : "", ms: 20 });
    await p.close();
  }

  // ── 2 ─────────────────────────────────────────────────────────────────────
  console.log("\n2 — a launch that expected a warm build and got a 6 s one, at phone size");
  {
    const p = await open(warmCtx, { delay: 6000, par: true }, warmRecord);
    await linked(p);
    await sinceLink(p, 400);
    const before = await box(p);
    check("no words in the first second", before.text === "", `"${before.text}" at 400 ms`);
    await sinceLink(p, 2400);
    const during = await box(p);
    let s = await seen(p);
    const first = s.said.find(([t]) => t === PREPARING);
    check("the words go up after about a second of building",
      !!first && first[1] - s.linkAt >= 950 && first[1] - s.linkAt < 1600,
      first ? `at ${ms(first[1] - s.linkAt)}` : "never");
    check("and the seconds count beside them, on one line",
      during.text === PREPARING && /^\d+ s$/.test(during.count) && during.lines === 1,
      `"${during.text}" "${during.count}" on ${during.lines} line(s)`);
    await p.click("#welcomeWhat", { timeout: 60000 });
    s = await seen(p);
    const help = await p.evaluate(() => !!document.getElementById("helpDlg")?.open);
    check("the start screen answers while the words are up", help && !s.releasedAt,
      help ? (s.releasedAt ? "only after the build let go" : `Help opened ${ms(s.now - s.linkAt)} into the build`) : "Help did not open");
    await p.evaluate(() => document.getElementById("helpDlg")?.close());
    await released(p);
    await sinceRelease(p, 300);
    const ready = await box(p);
    check("the end of the wait is said", ready.text === READY && ready.count === "", `"${ready.text}"`);
    await sinceRelease(p, 5600);
    const cleared = await box(p);
    check("and then the line empties", cleared.text === "", `"${cleared.text}"`);
    const moved = [["during", during], ["at ready", ready], ["after", cleared]].filter(([, b]) => layout(b) !== layout(before));
    check("NOTHING ON THE START CARD MOVES — before, during, at ready, after",
      !moved.length,
      moved.length ? `before ${layout(before)}; ${moved.map(([n, b]) => `${n} ${layout(b)}`).join("; ")}` : layout(before));
    const r = await report(p);
    check("the report says the page stayed free, from its frames", /the page stayed free/.test(r.startup) && /said it was preparing/.test(r.startup), r.startup.replace(/^.*?(graphics)/, "$1").split(" · ")[0]);
    await p.close();
  }

  // ── 3 ─────────────────────────────────────────────────────────────────────
  console.log("\n3 — a photo chosen during a 5 s build");
  {
    const p = await open(warmCtx, { delay: 5000, par: true }, warmRecord);
    await linked(p);
    await sinceLink(p, 300);
    await p.setInputFiles("#welcomeFile", JPG[0]);
    // UNTIL THE CARD SAYS SO, not a fixed wait: what is being asked is what the
    // card says while the build runs, and the build has seconds left.
    await p.waitForFunction((t) => document.getElementById("busy")?.open && document.getElementById("busyText")?.textContent === t, PREPARING_OPEN, { timeout: 3000, polling: 50 }).catch(() => {});
    const mid = await p.evaluate(() => ({ busy: !!document.getElementById("busy")?.open, text: document.getElementById("busyText")?.textContent ?? "", welcome: !document.getElementById("welcome").hidden, released: window.__bw.releasedAt > 0 }));
    check("the busy card says the photo waits for the editor",
      mid.busy && mid.text === PREPARING_OPEN && mid.welcome && !mid.released,
      `busy ${mid.busy ? "open" : "closed"}: "${mid.text}"${mid.released ? " — but the build had already finished" : ""}`);
    await p.waitForFunction(() => document.getElementById("welcome").hidden, null, { timeout: 120000 });
    const s = await seen(p);
    check("and it opens by itself once the editor is ready", s.releasedAt > 0, s.releasedAt ? `opened ${ms(s.now - s.releasedAt)} after the build finished` : "opened before the build finished");
    await p.close();
  }

  // ── 4 ─────────────────────────────────────────────────────────────────────
  console.log("\n4 — a warm launch that builds in 300 ms");
  {
    const p = await open(warmCtx, { delay: 300, par: true }, warmRecord);
    await released(p);
    await sinceRelease(p, 1500);
    const s = await seen(p);
    check("says nothing at all", !s.said.some(([t]) => t), s.said.length ? s.said.map(([t]) => `"${t}"`).join(", ") : "no writes");
    await p.close();
  }
  await warmCtx.close();

  // ── 5 ─────────────────────────────────────────────────────────────────────
  console.log("\n5 — a browser with no way to build off the page, cold, 1.5 s");
  {
    const ctx = await browser.newContext(PHONE);
    const p = await open(ctx, { delay: 1500, par: false });
    await released(p);
    await p.waitForTimeout(300);
    const s = await seen(p);
    const w = s.said.find(([t]) => t === PREPARING);
    const held = s.early[0];
    check("the words are painted before the page is held",
      !!w && !!held && held[1] > w[1] && held[2] - w[2] >= 2,
      w && held ? `"${w[0]}" at frame ${w[2]}, held by ${held[0]} at frame ${held[2]}` : `words ${w ? "written" : "never written"}, ${held ? `held by ${held[0]}` : "never held"}`);
    const r = await report(p);
    check("and the report admits the page waited", /the page waited/.test(r.startup), r.startup.replace(/^.*?(graphics)/, "$1").split(" · ")[0]);
    await p.close();

    // ── 5b ───────────────────────────────────────────────────────────────────
    // THE SECOND START IN THAT BROWSER. Firefox 156 on a PC offers no way to
    // build off the page and reuses nothing from its last start: 44 s, every
    // time, with the same picture code. The first start above recorded its
    // build; this one must not take that record as a promise of a quick one,
    // because a page held by its build cannot run the one-second fallback.
    console.log("\n5b — the same browser starting again: no way to build off the page, and its last build was slow");
    const p2 = await open(ctx, { delay: 1500, par: false });
    await released(p2);
    await p2.waitForTimeout(300);
    const s2 = await seen(p2);
    const w2 = s2.said.find(([t]) => t === PREPARING);
    const held2 = s2.early[0];
    check("the words are painted before the page is held, on a start after a slow one",
      !!w2 && !!held2 && held2[1] > w2[1] && held2[2] - w2[2] >= 2,
      w2 && held2 ? `"${w2[0]}" at frame ${w2[2]}, held by ${held2[0]} at frame ${held2[2]}` : `words ${w2 ? "written" : "never written"}, ${held2 ? `held by ${held2[0]} at frame ${held2[2]}` : "never held"}`);
    await ctx.close();
  }

  // ── 6 ─────────────────────────────────────────────────────────────────────
  console.log("\n6 — a build that fails, with a session stored from last time");
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 850 } });
    let p = await open(ctx, { delay: 0, par: true });
    await p.setInputFiles("#welcomeFile", JPG);
    await p.waitForFunction(() => document.getElementById("welcome").hidden && !document.getElementById("busy").open, null, { timeout: 120000 });
    await p.waitForTimeout(3000); // the set's writes land
    await p.close();
    const resumeText = (q) => q.waitForFunction(() => { const b = document.getElementById("resumeSession"); return b && !b.hidden ? b.textContent : ""; }, null, { timeout: 20000 }).then((h) => h.jsonValue()).catch(() => "");
    p = await open(ctx, { delay: 0, par: true });
    const had = await resumeText(p);
    check("(set up) a session of two is stored and offered", /2 photos/.test(had), had || "no Resume button");
    await p.close();

    p = await open(ctx, { delay: 2500, par: true, fail: true });
    await linked(p);
    await p.setInputFiles("#welcomeFile", JPG[0]);
    await p.waitForFunction(() => { const a = document.getElementById("glBroken"), b = document.getElementById("unsupported"); return (a && !a.hidden) || (b && !b.hidden); }, null, { timeout: 60000 });
    await p.waitForTimeout(400);
    // `=== false`, not `!hidden`: on a build without the panel the element is
    // null, and `!undefined` read as a panel on screen the first time this ran.
    const st = await p.evaluate(() => ({ broken: document.getElementById("glBroken")?.hidden === false, unsupported: !document.getElementById("unsupported").hidden, busy: !!document.getElementById("busy").open }));
    check("a build that fails has its own panel, not \"WebGL2 is missing\"", st.broken && !st.unsupported,
      `own panel ${st.broken ? "shown" : "not shown"}, WebGL2 panel ${st.unsupported ? "SHOWN" : "hidden"}`);
    check("and the photo's busy card closes", !st.busy, st.busy ? "still open" : "closed");
    const sizes = await p.evaluate(() => ["glBrokenReload", "glBrokenReport"].map((id) => { const e = document.getElementById(id); const r = e?.getBoundingClientRect(); return e ? `${id} ${Math.round(r.width)}x${Math.round(r.height)}` : `${id} missing`; }));
    check("its two buttons are at least 44px tall", sizes.every((t) => { const m = /(\d+)x(\d+)$/.exec(t); return m && +m[2] >= 44 && +m[1] >= 44; }), sizes.join(" · "));
    if (st.broken) {
      const r = await report(p, "glBrokenReport");
      check("its report carries what the driver said", /planted by the walk/.test(r.build), r.build.slice(0, 110));
    } else check("its report carries what the driver said", false, "no panel to reach the report from");
    await p.close();

    p = await open(ctx, { delay: 0, par: true });
    const still = await resumeText(p);
    check("the session stored before is still there to resume", /2 photos/.test(still), still || "no Resume button — the stored session was deleted");
    await p.close();
    await ctx.close();
  }

  // ── 7 ─────────────────────────────────────────────────────────────────────
  console.log("\n7 — the graphics taken away mid-build");
  {
    const ctx = await browser.newContext(PHONE);
    const p = await open(ctx, { delay: 5000, par: true });
    await linked(p);
    await sinceLink(p, 800);
    await p.evaluate(() => window.__bw.ctx?.getExtension("WEBGL_lose_context")?.loseContext());
    const up = await p.waitForFunction(() => !document.getElementById("glLost").hidden, null, { timeout: 30000 }).then(() => true).catch(() => false);
    await p.waitForTimeout(300);
    const st = await p.evaluate(() => ({ broken: document.getElementById("glBroken")?.hidden === false, text: document.getElementById("preparing")?.textContent ?? "" }));
    check("the lost-graphics panel says so, and nothing claims the code was refused", up && !st.broken,
      `lost panel ${up ? "shown" : "NOT shown"}, refused panel ${st.broken ? "SHOWN" : "hidden"}`);
    check("and the preparing line stops saying it is preparing", st.text === "", `"${st.text}"`);
    await ctx.close();
  }

  // ── 8c ────────────────────────────────────────────────────────────────────
  // THE 086 REPORT REPRODUCED ON PURPOSE: pictures that never arrive leave the
  // card exactly as the PC showed it, so this arm is both the ceiling's check
  // and the control that says the instruments can see an empty card at all.
  const control = { inView: 0, arrived: -1, flattest: null, fullest: null };
  console.log("\n8c — practice pictures that never arrive, on a browser with no way to build off the page, at a PC's size");
  {
    const ctx = await browser.newContext(PC);
    // NEVER ANSWERED: the request stays open until the context closes.
    await ctx.route("**/examples/gallery/thumbs/**", () => {});
    const p = await open(ctx, { delay: 1500, par: false }, null, watchPictures);
    await released(p);
    await p.waitForTimeout(300);
    const s = await seen(p);
    const w = s.said.find(([t]) => t === PREPARING);
    const waited = w ? s.linkAt - w[1] : -1;
    check(`the build waits for them, and no longer than the ceiling (${TILES_WAIT_MS} ms)`,
      !!w && waited >= TILES_WAIT_MS - 200 && waited < TILES_WAIT_MS + 900,
      w ? `the link ${ms(waited)} after the words` : "the words were never written");
    const ready = await p.waitForFunction((t) => document.getElementById("preparing")?.textContent === t, READY, { timeout: 10000 }).then(() => true).catch(() => false);
    check("and the editor still becomes ready", ready, ready ? "said ready" : "never said ready");
    const atHold = s.pictures ? s.pictures.tiles.filter((t) => t.inView) : [];
    control.inView = atHold.length;
    control.arrived = atHold.filter((t) => t.complete).length;
    const now = await picturesInView(p);
    const blank = await ctx.newPage();
    const sp = now.length ? await spread(blank, await p.screenshot(), now.map((t) => t.vis)) : [];
    await blank.close();
    control.flattest = sp.length ? Math.max(...sp) : null;
    await ctx.close();
  }

  // ── 8b ────────────────────────────────────────────────────────────────────
  console.log("\n8b — the same size, cold, on a browser that builds off the page");
  {
    const ctx = await browser.newContext(PC);
    const p = await open(ctx, { delay: 3000, par: true });
    await released(p);
    await p.waitForTimeout(300);
    const s = await seen(p);
    const w = s.said.find(([t]) => t === PREPARING);
    const modes = await p.evaluate(() => Array.from(document.querySelectorAll("#galleryList img")).map((im) => im.loading));
    check("nothing about the practice pictures changes: every one is still lazy",
      modes.length > 0 && modes.every((m) => m === "lazy"),
      `${modes.filter((m) => m === "lazy").length} of ${modes.length} lazy`);
    check("and the build does not wait for them: two frames after the words, no more",
      !!w && s.linkAt - w[1] < 500 && s.linkFrame - w[2] >= 2,
      w ? `the link ${ms(s.linkAt - w[1])} and ${s.linkFrame - w[2]} frames after the words` : "the words were never written");
    // THE OTHER HALF OF THE CONTROL: the same boxes once their pictures are in.
    await p.waitForFunction(() => {
      const c = document.getElementById("welcome").getBoundingClientRect();
      return Array.from(document.querySelectorAll("#galleryList img")).every((im) => {
        const r = im.getBoundingClientRect();
        const inView = r.width > 0 && r.height > 0 && r.bottom > Math.max(0, c.top) && r.top < Math.min(innerHeight, c.bottom);
        return !inView || (im.complete && im.naturalWidth > 0);
      });
    }, null, { timeout: 20000, polling: 100 }).catch(() => {});
    await p.waitForTimeout(300);
    const now = await picturesInView(p);
    const blank = await ctx.newPage();
    const sp = now.length && now.every((t) => t.complete) ? await spread(blank, await p.screenshot(), now.map((t) => t.vis)) : [];
    await blank.close();
    control.fullest = sp.length ? Math.min(...sp) : null;
    await ctx.close();
  }

  // ── MADE TO FAIL ──────────────────────────────────────────────────────────
  const trusted = control.inView > 0 && control.arrived === 0
    && control.flattest != null && control.flattest < EMPTY_BELOW
    && control.fullest != null && control.fullest >= EMPTY_BELOW;
  console.log(`\nMADE TO FAIL — the 086 report's card, every practice tile an empty box, must be reproduced before arm 8 means anything. `
    + `Pictures never answered: ${control.arrived < 0 ? "no record" : `${control.arrived} of ${control.inView} in view arrived by the hold`} (must be 0 of 1 or more); `
    + `largest spread of those boxes ${fmt(control.flattest)} (must be under ${EMPTY_BELOW}). `
    + `The same boxes with pictures loaded: smallest spread ${fmt(control.fullest)} (must be ${EMPTY_BELOW} or more). `
    + (trusted ? "Reproduced." : "NOT REPRODUCED — nothing arm 8 says about the pictures below is trustworthy."));
  check("(control) the instruments see an empty card as empty and a full one as full", trusted);

  // ── 8 ─────────────────────────────────────────────────────────────────────
  // THE 086 REPORT: Firefox on a PC, no KHR_parallel_shader_compile, a build
  // that holds the page at every start, and a start card of empty tiles for the
  // whole hold. SEEN FAILING against the build before 086 is the requirement:
  // there the pictures in view were lazy and had not arrived by the hold.
  console.log("\n8 — a browser with no way to build off the page, cold, 6 s, at a PC's size: the practice pictures in view");
  {
    const ctx = await browser.newContext(PC);
    const p = await open(ctx, { delay: 6000, par: false }, null, watchPictures);
    // SCREENSHOTS ALL THE WAY THROUGH, each stamped by the wall clock when it
    // was asked for and when it came back; the page's own times say afterwards
    // which ones were taken while it was held. Whether this Chromium can take
    // one then at all is not known in advance, and is reported either way.
    const shots = [];
    let stop = false;
    const shooting = (async () => {
      const until = Date.now() + 20000;
      while (!stop && Date.now() < until) {
        const t0 = Date.now();
        const buf = await p.screenshot({ timeout: 20000 }).catch(() => null);
        shots.push({ t0, t1: Date.now(), buf });
        await new Promise((r) => setTimeout(r, 150));
      }
    })();
    await released(p);
    stop = true;
    await shooting;
    await p.waitForTimeout(300);
    const s = await seen(p);
    const origin = await p.evaluate(() => performance.timeOrigin);
    const pics = s.pictures;
    const held = s.early[0];
    const w = s.said.find(([t]) => t === PREPARING);
    const inView = pics ? pics.tiles.filter((t) => t.inView) : [];
    const outView = pics ? pics.tiles.filter((t) => !t.inView) : [];
    check("(set up) the page was held, and some practice pictures sit in the start card's first view at this size",
      !!held && !!pics && inView.length > 0,
      !held ? "the page was never held — this arm measures nothing" : !pics ? "the pictures were not read at the hold" : `${inView.length} in view, ${outView.length} below it`);
    const late = inView.filter((t) => !t.complete || t.frame < 0 || pics.frame - t.frame < 2);
    check("every practice picture in view had arrived two frames or more before the page was held",
      !!pics && inView.length > 0 && !late.length,
      pics ? (late.length ? `${late.length} of ${inView.length} not: ${late.slice(0, 5).map((t) => `${t.name} ${t.complete ? `arrived at frame ${t.frame}` : `not arrived (${t.loading})`}`).join(", ")} · held at frame ${pics.frame}` : `${inView.length} of ${inView.length}, the page held at frame ${pics.frame}`) : "no record");
    const eager = outView.filter((t) => t.loading !== "lazy");
    check("the practice pictures below the first view were left to load lazily",
      !!pics && !eager.length,
      outView.length ? (eager.length ? `${eager.length} of ${outView.length} switched to ${eager[0].loading}` : `${outView.length} of ${outView.length} still lazy`) : "none below the view at this size");
    check("the words were still painted before the page was held",
      !!w && !!held && held[1] > w[1] && held[2] - w[2] >= 2,
      w && held ? `"${w[0]}" at frame ${w[2]}, held by ${held[0]} at frame ${held[2]}` : `words ${w ? "written" : "never written"}, ${held ? "held" : "never held"}`);
    // DURING THE HOLD: asked for after the hold began and back before it let go.
    const from = held ? origin + held[1] : Infinity, to = origin + s.releasedAt;
    const during = shots.filter((x) => x.buf && x.t0 > from && x.t1 < to);
    if (!during.length) {
      console.log(`note  no screenshot could be taken during the hold in this Chromium (${shots.length} asked for); the in-page record above is the check here, and one load on the PC in Firefox is the other`);
    } else {
      const shot = during[Math.floor(during.length / 2)];
      if (SHOT) { const { writeFileSync } = await import("node:fs"); writeFileSync(SHOT, shot.buf); console.log(`      the screenshot taken during the hold: ${SHOT}`); }
      const blank = await ctx.newPage();
      const spreads = await spread(blank, shot.buf, inView.map((t) => t.vis));
      await blank.close();
      const empty = spreads.map((v, i) => [inView[i].name, v]).filter(([, v]) => v < EMPTY_BELOW);
      check("a screenshot taken DURING the hold shows the pictures in view, not empty boxes",
        trusted && !empty.length,
        `${during.length} taken during the hold; ${empty.length ? `${empty.length} of ${spreads.length} boxes flat: ${empty.slice(0, 5).map(([n, v]) => `${n} ${fmt(v)}`).join(", ")}` : `every box varies (lowest spread ${fmt(Math.min(...spreads))})`}${trusted ? "" : " — and the control did not reproduce, so this reading is not evidence"}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} failed` : "\nthe start screen stays free and says what it is doing while the editor is prepared");
process.exit(failed ? 1 : 0);
