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
//   6  a build that fails has its own panel, not "WebGL2 is missing", its
//      report carries what the driver said, and a photo chosen during it did
//      not cost the session stored from last time
//   7  the graphics taken away mid-build raise the lost-graphics panel
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

let failed = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "ok  " : "FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) failed++; };
const ms = (n) => `${Math.round(n)} ms`;

/** A page with the build slowed as `cfg` says, loaded far enough that the start
 *  card is in the document. Not to "load": a build that holds the page holds
 *  the load event with it, and the old code is what this walk must be able to
 *  run against. */
async function open(ctx, cfg) {
  const p = await ctx.newPage();
  p.on("dialog", (d) => d.accept());
  await p.addInitScript(slowBuild, cfg);
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

const shown = (p, id) => p.evaluate((i) => { const e = document.getElementById(i); if (!e) return false; const r = e.getBoundingClientRect(); return !e.hidden && r.width > 0 && r.height > 0; }, id);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
try {
  // ── 1 ─────────────────────────────────────────────────────────────────────
  console.log("\n1 — a launch that expects a cold build (nothing recorded for this picture code), 3 s build");
  const warmCtx = await browser.newContext(PHONE);
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
    check("a finished build is recorded, so the next launch expects it warm", !!stored, stored ? "recorded" : "nothing recorded");
    await p.close();
  }

  // ── 2 ─────────────────────────────────────────────────────────────────────
  console.log("\n2 — a launch that expected a warm build and got a 6 s one, at phone size");
  {
    const p = await open(warmCtx, { delay: 6000, par: true });
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
    const p = await open(warmCtx, { delay: 5000, par: true });
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
    const p = await open(warmCtx, { delay: 300, par: true });
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
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} failed` : "\nthe start screen stays free and says what it is doing while the editor is prepared");
process.exit(failed ? 1 : 0);
