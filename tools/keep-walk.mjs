#!/usr/bin/env node
// SAVE A PHOTOGRAPH AS A FILE, PICK IT BACK, AND GET THE SAME PHOTOGRAPH WITH
// THE SAME EDIT ON IT.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/keep-walk.mjs [--port=8131] [--file=/path/to.NEF]
//
// WHAT THIS PROVES THAT keepfile-check DOES NOT (decision 043). That one holds
// the CONTAINER to its promise in isolation: write bytes, read them back,
// byte-identical, damage refused. This holds the JOIN — that the app writes
// what it thinks it writes and opens what it wrote.
//
// AND THE EDIT IT CHECKS IS A PAINTED MASK, not a slider. A slider is a number
// and every channel here carries numbers; a painted selection is nothing but
// the bitmap somebody painted, so it is the piece with no recipe behind it and
// the only one whose loss cannot be recovered from anywhere else. The first
// version of this format dropped it — along with the warp and the LUT — by
// inheriting the mask LIBRARY's rule, which is about applying a mask to OTHER
// photographs and is a question a keep file never asks. A saved photograph that
// comes back without its selections is not one you can go on editing.
//
// IT IS MEASURED AS COVERAGE ON SCREEN, through the app's own matte view, and
// not by reading a bitmap out of the page. What the reader gets back is a
// picture; a byte array that matches while nothing reaches the renderer is the
// shape of pass this repository has the most lessons about. Every interaction below is
// a REAL press through the browser's input pipeline and a REAL download
// captured off the page, never `element.click()` in an evaluate: a dispatched
// event is not a gesture, and a harness that presses by id cannot tell you
// whether a finger could have got there (hub LESSONS 348).
//
// AND THE OTHER KEEP — the Quick look's, straight after ending a session
// (decisions 075 and 076) — and the ways into the session that share its
// guard. Each arm runs in a fresh browser context:
//
//   --only=<arms, comma-separated>   (default: every arm below, in this order)
//
//   file      the keep file, above; and its "Opened" confirmation must be seen.
//   sweep     Done on a session of four, a Quick look of three, Keep — with the
//             ended session's delete SLOWED from outside by
//             tools/slow-storage.mjs, so the transaction really is uncommitted
//             and the store really is locked. Run twice: with the browser's own
//             allowance, answered slowly (the keep must not wait, and the report
//             must not blame the delete for the slow answer), and with no
//             allowance left (the keep must wait, saying so once and counting
//             beside it, with the report one press away; a second Keep, a look
//             file and a damaged look dropped with a photo must each be refused
//             in words, and nothing of them read).
//   practice  a practice photo tapped while a set is still being stored.
//   quota     the allowance says plenty and the disk refuses every write until
//             the old delete is done — at the commit (Chromium), at the request
//             over WebKit's allowance, and as WebKit's full disk, an
//             UnknownError: the refused photos wait, with words, and are
//             written again with the verdict pressed on them meanwhile.
//   late      a refusal the loop sees only after the delete has finished.
//   orders    refused photos written again: the one on screen from memory, one
//             whose file cannot be read again listed as not stored.
//   full      one photo the disk has no room for even after the delete.
//   busy      a photo opened from the strip while later photos wait for room.
//   stack     the report open when the card rises over it.
//   margin    an allowance between the set and twice the set.
//   lookrace  a look dropped while a set is still being stored: refused.
//   keepsniff a keep file still downloading when it is opened.
//   hang      a file whose first bytes never arrive — offered, skipped, listed;
//             again with the page hidden part-way, and with it frozen.
//   slowread  one photo whose read takes longer than its limit, and finishes;
//             a drop meanwhile is refused in words that name no set.
//   resume    files dropped while a session resumes must be refused.
//   persist   navigator.storage.persist() replaced by a promise that never
//             settles — Firefox's prompt that nobody has answered. A keep must
//             still reach its closing note, and a batch must still start.
//   mixed     a keep file dropped with photos over a session: not opened,
//             named, and the photos asked about the real session.
//   keeps     two keep files at once, and a damaged one ahead of a good one.
//   looks     a look opened on its own: damaged, dismissed, followed by photos.
//   stall     reads past their limit during the delete wait (skipped, and
//             landing), after a failed open, and after the first photo — side
//             by side, about 100 s.
//   writefail a write that fails for a reason other than room, orders after it.
//   clearabort the session index's clear failing at its commit: a set and Done
//             stop, a lone and a practice photo open, a Quick look Keep hands
//             the Quick look back.
//   unreach   the session's storage not reachable at all: a lone and a
//             practice photo open, with no word about a session or room.
//   batchend  a batch's finished card up when a set finishes storing.
//   batchlook a look dropped while a batch is processing: refused, the batch's
//             card, its Stop and its Save left alone.
//
// Every one of these was run against the builds before the fix and seen to
// fail there; the arms are real presses on the real app, with only storage's
// speed and the browser's answers changed from outside.
import { openMasks, closeMasks } from "./walk-input.mjs";
import { chromium } from "playwright-core";
import { requireFreshDist } from "./fresh-dist.mjs";
import { readFileSync, existsSync, mkdtempSync, rmSync, copyFileSync, writeFileSync, statSync } from "node:fs";
import { slowStorage } from "./slow-storage.mjs";
import { slowBuild } from "./slow-build.mjs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";

// BEFORE THE BROWSER, AND THIS WALK PROVED WHY. It renders through the build in
// `dist`, and a stale one measures the PREVIOUS build. The first attempt to make
// this walk fail planted a defect that did not compile — so `npm run build`
// stopped, `dist` kept the previous bundle, and the walk went green against a
// build that did not contain the plant. That is hub LESSONS 345, met head on by
// the very run meant to earn trust in this file. See tools/fresh-dist.mjs.
requireFreshDist();

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split("=").slice(1).join("=");
const BASE = `http://127.0.0.1:${arg("port", "8131")}`;
const FILE = arg("file", "/tmp/claude-0/-home-user/e7a820ad-44f5-555c-96b8-a4dcabafb549/scratchpad/real2/NIR_1737.NEF");
const ONLY = arg("only", "file,sweep,practice,quota,late,orders,full,busy,stack,margin,lookrace,keepsniff,hang,slowread,resume,persist,mixed,keeps,looks,stall,writefail,clearabort,unreach,batchend,batchlook").split(",").map((x) => x.trim()).filter(Boolean);
const want = (arm) => ONLY.includes(arm);
if (want("file") && !existsSync(FILE)) { console.log(`no frame at ${FILE} — pass --file=, or --only=sweep,persist`); process.exit(1); }

let failed = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
};

/** Fraction of the canvas the matte view is showing as selected.
 *
 *  The matte drops the photograph to dim monochrome and paints the selection in
 *  one colour (gl.ts: `vec3(1.0, 0.92, 0.25)`), which is why coverage can be
 *  read off the rendered frame at all — and why it is read by BOTH hue and
 *  brightness, so a half-covered pixel reads as half. The same measure
 *  `tools/fix-brush-walk.mjs` uses, deliberately: two instruments for one
 *  quantity is how they come to disagree. */
const matteCoverage = (page) => page.evaluate(() => {
  const c = document.getElementById("view");
  const oc = document.createElement("canvas");
  oc.width = c.width; oc.height = c.height;
  oc.getContext("2d").drawImage(c, 0, 0);
  const d = oc.getContext("2d").getImageData(0, 0, oc.width, oc.height).data;
  let n = 0, hit = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const V = Math.max(r, g, b); n++;
    if (g > 0.75 * r && b < 0.6 * g && V > 0.45) hit++;
  }
  return hit / n;
});

/** Paint a stroke across the photograph, as a finger would. */
const paintStroke = async (page) => {
  const box = await page.locator("#view").boundingBox();
  const y = box.y + box.height * 0.42;
  await page.mouse.move(box.x + box.width * 0.22, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width * (0.22 + 0.056 * i), y + Math.sin(i) * 8);
  await page.mouse.up();
  await page.waitForTimeout(900);
};

/** Arm the matte, read the coverage, put it away. Reading it means LOOKING at
 *  the rendered frame, so the view has to be the one the reader judges with. */
const coverageOf = async (page, row) => {
  await openMasks(page);
  await page.waitForTimeout(500);
  const pick = page.locator("#maskList .mask-row").nth(row).locator(".mask-pick");
  if ((await pick.getAttribute("aria-pressed")) !== "true") { await pick.click(); await page.waitForTimeout(500); }
  await page.locator("#mMatte").click();
  await page.waitForTimeout(900);
  const cov = await matteCoverage(page);
  await page.locator("#mMatte").click();
  await page.waitForTimeout(500);
  return cov;
};

/** THE KEEP FILE: save a photograph as a file, pick it back, and get the same
 *  photograph with the same edit on it. Takes the browser and a scratch
 *  directory; counts its failures into `failed`. */
async function fileArm(br, dir) {
  const ctx = await br.newContext({ viewport: { width: 1194, height: 834 }, acceptDownloads: true });
  const p = await ctx.newPage();
  console.log("\n=== keep file · save it, pick it back, same photograph same edit ===\n");

  await p.goto(`${BASE}/ir.html`, { waitUntil: "load" });
  await p.waitForTimeout(1000);
  await p.setInputFiles("#file", [FILE]);
  await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
  await p.waitForTimeout(2500);

  // AN EDIT WORTH RECOGNISING. A default edit would let a keep file that
  // carried NO edit pass this walk, which is the failure it exists to catch.
  await closeMasks(p); await p.locator("#ptab-basic").click();
  await p.waitForTimeout(400);
  const MARK = "0.62";
  await p.evaluate((v) => {
    const el = document.getElementById("sat");
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, MARK);
  await p.waitForTimeout(1200);
  const before = await p.evaluate(() => document.getElementById("sat").value);
  check("the edit was made and the control reads it back", before, MARK);

  // AND A PAINTED MASK, which is the part with no recipe behind it.
  await openMasks(p);
  await p.waitForTimeout(500);
  await p.locator("#addBrush").click();
  await p.waitForTimeout(700);
  await paintStroke(p);
  const painted = await coverageOf(p, 0);
  check("a stroke was painted and the app shows it as coverage", painted > 0.005, true);
  console.log(`          painted coverage: ${(painted * 100).toFixed(2)}% of the frame`);
  const maskLabel = await p.locator("#maskList .mask-row").nth(0).locator(".mask-pick").textContent();

  // THE REAL PRESS, and the real save.
  await closeMasks(p); await p.locator("#ptab-export").click();
  await p.waitForTimeout(500);
  const btn = p.locator("#keepFile");
  const box = await btn.boundingBox();
  check("the save control is on screen and finger-sized", !!box && box.width >= 44 && box.height >= 44, true);
  const [download] = await Promise.all([p.waitForEvent("download", { timeout: 120000 }), btn.click({ timeout: 60000 })]);
  const saved = join(dir, download.suggestedFilename());
  await download.saveAs(saved);
  // THE NAME MUST END IN A TYPE THE PLATFORM REGISTERS, and this walk cannot
  // test the thing that actually matters about it. The first version saved a
  // `.ipskeep`, every check here passed, and on an iPad the Files picker greyed
  // the file out — 27.9 MB, named correctly, unselectable, because iOS filters
  // that picker by UTI and an unregistered extension matches no allowed type.
  // Chromium's file input does NO such filtering: `setInputFiles` hands the
  // page any file whatever `accept` says, which is exactly why the pick-it-back
  // step below went green against a file no reader could have chosen.
  //
  // So this asserts the one property that IS checkable here — the name ends in
  // `.zip`, a real registered type and the thing the container actually is —
  // and states plainly that selectability is a DEVICE question. Do not read
  // this walk's green as covering it.
  check("the saved file ends in a type the platform registers", /\.zip$/i.test(download.suggestedFilename()), true);
  check("...and still says what it is", /\.ipskeep\.zip$/i.test(download.suggestedFilename()), true);

  // The original inside, against the original on disk — the whole promise.
  const src = readFileSync(FILE);
  const pkg = readFileSync(saved);
  check("the package is at least as big as the photograph it carries", pkg.length >= src.length, true);
  let at = -1;
  for (let i = 0; i + src.length <= pkg.length && at < 0; i++) {
    let hit = pkg[i] === src[0];
    for (let k = 1; hit && k < src.length; k++) if (pkg[i + k] !== src[k]) hit = false;
    if (hit) at = i;
  }
  check("...and your photograph is inside it, byte for byte, in one contiguous run", at >= 0, true);

  // PICK IT BACK through the same picker a reader uses.
  const p2 = await ctx.newPage();
  await p2.goto(`${BASE}/ir.html`, { waitUntil: "load" });
  await p2.waitForTimeout(1000);
  await p2.setInputFiles("#file", [saved]);
  await p2.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
  // AND IT SAYS SO WHERE IT CAN BE SEEN. The confirmation was mounted in the
  // busy card, which closed on the next line, so it was never painted.
  const opened = await waitToast(p2, "^Opened ", 2000);
  console.log(`          the "Opened" confirmation: ${toastSaid(opened)}`);
  check("(r) opening a keep file says so where the reader can see it", opened.found && opened.onTop, true);
  await p2.waitForTimeout(3000);
  await closeMasks(p2); await p2.locator("#ptab-basic").click();
  await p2.waitForTimeout(600);
  const after = await p2.evaluate(() => document.getElementById("sat").value);
  check("picking it back opens the photograph with the SAME edit on it", after, MARK);

  // THE MASK. Same row, same name, and — the part that actually matters — the
  // same pixels selected, read off the app's own matte rather than out of a
  // field. A tolerance rather than equality because the frame is re-decoded and
  // re-rendered from scratch; a mask that was DROPPED reads zero, which is not
  // a near miss, and a mask restored empty reads zero too.
  const rows2 = await p2.locator("#maskList .mask-row").count().catch(() => 0);
  await openMasks(p2);
  await p2.waitForTimeout(600);
  const rowCount = await p2.locator("#maskList .mask-row").count();
  check("the painted mask is in the list after reopening", rowCount >= 1, true);
  const label2 = rowCount ? await p2.locator("#maskList .mask-row").nth(0).locator(".mask-pick").textContent() : "(none)";
  check("...under the name it had", label2, maskLabel);
  const back = rowCount ? await coverageOf(p2, 0) : 0;
  console.log(`          restored coverage: ${(back * 100).toFixed(2)}% of the frame`);
  check("...selecting the same pixels it was painted over",
    back > 0 && Math.abs(back - painted) <= Math.max(0.004, painted * 0.15), true);
  void rows2;
  const name = await p2.evaluate(() => document.title + "|" + (document.getElementById("hint")?.textContent ?? ""));
  console.log(`          opened as: ${name.slice(0, 70)}`);
  await ctx.close();
}

// ─── THE OTHER KEEP (decisions 075 and 076) ─────────────────────────────────
// Three bundled JPEGs, copied under new names: small enough that a session of
// four opens in seconds here, and every stage the device report named — end,
// Quick look, Keep, the delete, the room check — is the same code for a JPEG as
// for a NEF. Only storage's SPEED and the browser's ANSWERS are changed, from
// outside, by tools/slow-storage.mjs.
const EX = "public/examples";
const JPG = ["canopy.jpg", "hillside.jpg", "lodge.jpg"].map((f) => join(EX, f));
const SLOW = 7000; // ms each photo's delete is held open; four photos = 28 s of sweep
const RULES = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const FREEING = "Freeing the space the last session used…";
const VIEW = { viewport: { width: 1194, height: 834 }, serviceWorkers: "block" };

/** Copies of the bundled JPEGs under `names`, in `dir`, starting `offset` along. */
const copies = (dir, names, offset = 0) => names.map((n, i) => { const to = join(dir, n); copyFileSync(JPG[(i + offset) % 3], to); return to; });

/** Open the Quick look on `files` through its own input and wait until every
 *  tile is built and Keep is pressable. Polls synchronous DOM state only. */
async function openQuick(p, files) {
  await p.setInputFiles("#quickFiles", files);
  await p.waitForFunction((n) => (document.getElementById("qlGrid")?.children.length ?? 0) >= n
    && !document.getElementById("qlKeep").disabled && !document.getElementById("qlGrid").dataset.busy, files.length, { timeout: 120000 });
}

/** The §7f report as the reader would take it: PRESSED — the version tag, or
 *  during a wait the busy card's own button — and NEVER opened by script. A
 *  report no finger can reach is not a report, and the first version of this
 *  walk fell back to a script click and went green on exactly that (decision
 *  075's review). Returns `line(key)` → that line's value, and `how`. */
async function report(p, via = "#verTag") {
  await p.evaluate(() => { const t = document.getElementById("verDlgText"); if (t) t.value = ""; });
  try { await p.click(via, { timeout: 3000 }); }
  catch { return { how: `NOT PRESSABLE — ${via} could not be pressed`, line: () => "(no report)" }; }
  await p.waitForFunction(() => { const v = document.getElementById("verDlgText")?.value || ""; return v && v !== "Gathering…"; }, null, { timeout: 30000 });
  const txt = await p.inputValue("#verDlgText");
  await p.click("#verClose");
  const line = (k) => { const l = txt.split("\n").find((x) => x.startsWith(k + " ")); return l === undefined ? "(no such line)" : l.slice(k.length).trim(); };
  return { how: `pressed ${via}`, line };
}

/** The names in the stored session index, which is what a resume would bring
 *  back — the strip can agree with itself and still disagree with this. */
const storedNames = (p) => p.evaluate(() => new Promise((res) => {
  try {
    const rq = indexedDB.open("ips-session");
    rq.onerror = () => res(null);
    rq.onsuccess = () => {
      const db = rq.result;
      try {
        const g = db.transaction("meta").objectStore("meta").getAll();
        g.onsuccess = () => { res(g.result.map((m) => m.name).sort()); db.close(); };
        g.onerror = () => { res(null); db.close(); };
      } catch { res(null); db.close(); }
    };
  } catch { res(null); }
}));

/** Is a toast matching `src` painted on top — hit-tested, not merely present?
 *  A toast mounted in a dialog under the top one, or in one that has closed,
 *  is in the DOM with opacity 1 and cannot be seen. It carries
 *  `pointer-events: none`, so it is lifted for the one hit test and put back. */
const toastOnTop = (p, src) => p.evaluate((src) => {
  const re = new RegExp(src);
  const el = [...document.querySelectorAll("div[role=status]")].find((d) => !d.id && re.test(d.textContent ?? "") && d.style.opacity === "1");
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  const was = el.style.pointerEvents;
  el.style.pointerEvents = "auto";
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  el.style.pointerEvents = was;
  return { found: true, onTop: !!hit && el.contains(hit), host: el.closest("dialog")?.id ?? "body", open: el.closest("dialog")?.open ?? true, text: el.textContent };
}, src);
/** Wait up to `ms` for a toast matching `src` to be showing, then hit-test it. */
const waitToast = async (p, src, ms = 2000) => {
  await p.waitForFunction((s) => [...document.querySelectorAll("div[role=status]")].some((d) => !d.id && new RegExp(s).test(d.textContent ?? "") && d.style.opacity === "1"), src, { timeout: ms, polling: 25 }).catch(() => {});
  return toastOnTop(p, src);
};
const toastSaid = (t) => (t.found ? `"${t.text}" in ${t.host}${t.open ? "" : " (a CLOSED dialog)"}, ${t.onTop ? "on top" : "NOT VISIBLE"}` : "none");

const tiles = (p) => p.evaluate(() => document.querySelectorAll("#sessionThumbs .session-thumb").length);

/** axe over the page as it stands, serious and critical only — the a11y
 *  walk's own rule set — in whichever colour scheme is being emulated. */
async function axeNow(p, what) {
  await p.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
  const r = await p.evaluate(async (rules) => await window.axe.run(document, { runOnly: rules }), RULES);
  const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  check(`${what}: axe finds nothing serious or critical`, serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`).join(" | "), "");
}

/** A session of `files`, then Done — the start of every keep-after-Done arm. */
async function sessionThenDone(p, files) {
  await p.setInputFiles("#file", files);
  await p.waitForFunction((n) => { const t = [...document.querySelectorAll("#sessionThumbs .session-thumb")]; return t.length === n && t.every((x) => !x.disabled) && !document.getElementById("busy").open; }, files.length, { timeout: 180000 });
  await p.waitForTimeout(1500);
  await p.click("#sessionDone");
  await p.waitForFunction(() => document.getElementById("sessionStrip").hidden && !document.getElementById("busy").open, null, { timeout: 60000 });
}

/** Everything arrives and settles: `n` tiles, every one switchable, no card,
 *  every held delete finished. Bounded, because on a build that loses the set
 *  it never comes, and that is a finding for the checks after it. */
const settle = (p, n, ms = 120000) => p.waitForFunction((n) => { const t = [...document.querySelectorAll("#sessionThumbs .session-thumb")]; return t.length >= n && t.every((x) => !x.disabled) && !document.getElementById("busy").open && window.__sweep.every((e) => e.tComplete !== null); }, n, { timeout: ms }).catch(() => {});

/** The walk's own view of a run: every Keep press, modal, word and count. */
const record = (p) => p.evaluate(() => ({ keeps: window.__keeps, dlg: window.__dlg, busy: window.__busyText, count: window.__busyCount, shown: window.__shown, sweep: window.__sweep }));
/** Every "N of M old photos freed" the freeing count showed after `t0`, as
 *  distinct N in order. The unit is part of the match: a bare "N of M" under
 *  "Still reading NAME…" read as the progress of the file named above it. */
const countsAfter = (out, t0) => [...new Set(out.count.filter((e) => e.t >= t0).map((e) => e.text.match(/^(\d+) of (\d+) old photos freed$/)).filter(Boolean).map((m) => Number(m[1])))];
/** A duration off the "Last keep" line, in ms. */
const msOf = (line, label) => { const m = line.match(new RegExp(`${label} (\\d+(?:\\.\\d+)?) ?(ms|s)\\b`)); return m ? Number(m[1]) * (m[2] === "s" ? 1000 : 1) : NaN; };

/** KEEP STRAIGHT AFTER ENDING A SESSION, with its delete slowed (decision 075).
 *
 *  Takes the browser, the scratch directory and `room`:
 *  - "spare" leaves the browser's allowance alone but makes estimate() take
 *    1.5 s to answer, so the keep must not wait — the set is on screen while
 *    the old delete still runs — and the report must not blame the delete for
 *    the slow answer.
 *  - "short" answers estimate() with nothing left of the allowance, so the keep
 *    must wait, saying so and counting; during the wait a second Keep, a look
 *    file, and a damaged look dropped with a photo must each be refused, and
 *    the report must be pressable.
 *  Counts its failures into `failed`. */
async function sweepArm(br, dir, room) {
  const short = room === "short";
  const SESSION = copies(dir, ["s1.jpg", "s2.jpg", "s3.jpg", "s4.jpg"]);
  const QUICK = copies(dir, ["q1.jpg", "q2.jpg", "q3.jpg"], 1);
  const QNAMES = ["q1.jpg", "q2.jpg", "q3.jpg"];
  console.log(`\n=== Keep straight after Done · the delete held ${SLOW / 1000}s a photo · ${short ? "the browser's allowance says NO ROOM" : "the browser's own allowance, answered after 1.5 s"} ===\n`);
  const ctx = await br.newContext(VIEW);
  try {
    await ctx.addInitScript(slowStorage, short ? { slow: SLOW, estimate: "none" } : { slow: SLOW, estimateDelay: 1500 });
    const p = await ctx.newPage();
    let asked = 0;
    p.on("dialog", (d) => { asked++; void d.accept(); });
    p.on("pageerror", (e) => console.log(`          page error: ${e.message}`));
    await p.goto(`${BASE}/ir.html`, { waitUntil: "load" });
    await p.waitForSelector("#file", { state: "attached" });
    await sessionThenDone(p, SESSION);
    await openQuick(p, QUICK);
    await p.evaluate(() => {
      window.__shown = null;
      const iv = setInterval(() => {
        if (document.getElementById("sessionStrip").hidden) return;
        window.__shown = { t: performance.now(), pending: window.__sweep.filter((e) => e.tComplete === null).length };
        clearInterval(iv);
      }, 10);
    });
    await p.click("#qlKeep");

    let during = null;
    if (short) {
      await p.waitForTimeout(1500);
      const card = await p.evaluate(() => ({ open: document.getElementById("busy").open, text: document.getElementById("busyText").textContent, count: document.getElementById("busyCount")?.hidden === false ? document.getElementById("busyCount").textContent : "" }));
      console.log(`          1.5 s after Keep the busy card reads: ${card.open ? `"${card.text}"${card.count ? ` with "${card.count}" beside it` : ""}` : "(no busy card)"}`);

      // (d) THE SECOND PRESS, while the wait is young. The reader picks the
      // folder again and presses Keep again — what doubled the set.
      await openQuick(p, QUICK);
      await p.click("#qlKeep", { timeout: 10000 });
      const toast = await waitToast(p, "Already adding photos", 1000);
      const ql = await p.evaluate(() => ({ open: document.getElementById("quickLook").open, tiles: document.getElementById("qlGrid").children.length }));
      console.log(`          second Keep: toast ${toastSaid(toast)}; Quick look ${ql.open ? `still open with ${ql.tiles} tiles` : "closed"}`);
      check("(d) a second Keep during the wait is refused with a toast the reader can see", toast.found && toast.onTop, true);
      check("(d) ...and changes nothing: the Quick look stays open with its photos", ql.open && ql.tiles === QUICK.length, true);
      if (ql.open) { await p.click("#qlClose"); await p.waitForFunction(() => !document.getElementById("quickLook").open, null, { timeout: 10000 }); }

      // (k) A LOOK IS REFUSED LIKE ANYTHING ELSE (decision 075's review). The
      // review let looks through a running open, and three of its findings were
      // in that pass-through; the plan's own words refuse everything.
      const look = join(dir, "walk.ipslook");
      writeFileSync(look, JSON.stringify({ f: "ips-look", v: 1, name: "Walk look", look: { tone: [0, 0.25, 0.5, 0.75, 1], sat: 1.2 } }));
      await p.waitForTimeout(3500); // the second Keep's refusal fades first
      const tLook = await p.evaluate(() => performance.now());
      await p.setInputFiles("#file", [look]);
      const refusedLook = await waitToast(p, "Already adding photos", 1500);
      await p.waitForTimeout(1000);
      const recv = await p.evaluate((t) => window.__dlg.some((d) => d.t >= t && d.id === "lookRecvDlg" && d.op === "open"), tLook);
      console.log(`          a look file dropped during the wait: refusal toast ${toastSaid(refusedLook)}; receive dialog ${recv ? "OPENED" : "never opened"}`);
      check("(k) a look file dropped during the wait is refused in words the reader can see, and nothing of it is received", refusedLook.found && refusedLook.onTop && !recv, true);
      if (recv) { await p.click("#lookRecvClose"); await p.waitForFunction(() => !document.getElementById("lookRecvDlg").open, null, { timeout: 10000 }); }

      // (ee) A DAMAGED LOOK AND A PHOTO, DROPPED TOGETHER. The whole drop is
      // refused and nothing in it is read: one toast, and it is the refusal.
      await p.waitForTimeout(3500); // the toast above fades first
      const damaged = join(dir, "damaged.ipslook");
      writeFileSync(damaged, '{"f":"ips-look","v":1,"name":"Cut short","look":{"tone":[0,0.25');
      await p.setInputFiles("#file", [damaged, QUICK[0]]);
      const mix = await waitToast(p, "Already adding photos", 3000);
      console.log(`          a damaged look and a photo dropped during the wait: toast ${toastSaid(mix)}`);
      check("(ee) a damaged look dropped with a photo during the wait is refused with it, unread: one toast, saying only what is running", mix.found && mix.onTop && mix.text === "Already adding photos — wait for this set to finish.", true);

      // (l) THE REPORT, PRESSED FROM THE CARD, and the card's colours with the
      // button on it.
      const btn = await p.evaluate(() => { const b = document.getElementById("busyReport"); if (!b || b.hidden) return null; const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), text: b.textContent }; });
      console.log(`          the card's report button: ${btn ? `"${btn.text}", ${btn.w}x${btn.h}` : "none"}`);
      check("(l) while it waits the card offers the report, at least 44 px each way", !!btn && btn.w >= 44 && btn.h >= 44, true);
      during = await report(p, "#busyReport");
      console.log(`          report during the wait (${during.how}):`);
      console.log(`            Adding photos    ${during.line("Adding photos")}`);
      console.log(`            Freeing storage  ${during.line("Freeing storage")}`);
      check("(l) ...and pressing it opens the report while the card is up", /^pressed/.test(during.how), true);
      const stillFreeing = await p.evaluate((w) => document.getElementById("busy").open && document.getElementById("busyText").textContent === w, FREEING);
      if (stillFreeing) {
        await p.emulateMedia({ colorScheme: "dark" }); await p.waitForTimeout(300);
        await axeNow(p, "(c) the busy card while freeing, with its count and report button, dark");
        await p.emulateMedia({ colorScheme: "light" }); await p.waitForTimeout(300);
        await axeNow(p, "(c) the busy card while freeing, with its count and report button, light");
      } else check("(c) the busy card is still showing the freeing words, so its colours can be measured", stillFreeing, true);
    } else {
      await p.waitForFunction(() => window.__shown, null, { timeout: 120000 }).catch(() => {});
      const pend = await p.evaluate(() => window.__sweep.filter((e) => e.tComplete === null).length);
      if (pend) {
        during = await report(p);
        console.log(`          report while the delete still runs (${during.how}):`);
        console.log(`            Freeing storage  ${during.line("Freeing storage")}`);
      }
    }

    await settle(p, QUICK.length, 150000);
    await p.waitForTimeout(1000);
    const out = await record(p);
    const k0 = out.keeps[0];
    const firstBusy = out.dlg.find((d) => d.id === "busy" && d.op === "open" && d.t >= k0);
    const lastDelete = Math.max(...out.sweep.map((e) => e.tComplete ?? Infinity));
    console.log(`          busy card first raised ${firstBusy ? `${Math.round(firstBusy.t - k0)} ms after Keep, saying "${firstBusy.text}"` : "never"}; last held delete finished ${Math.round(lastDelete - k0)} ms after Keep; the set on screen ${out.shown ? `${Math.round(out.shown.t - k0)} ms after Keep with ${out.shown.pending} deletes still held` : "never"}`);
    check("(a) the busy card is up within 100 ms of Keep", !!firstBusy && firstBusy.t - k0 <= 100, true);

    const saidFreeing = out.busy.some((e) => e.t >= k0 && e.text === FREEING);
    const spokenCounts = out.busy.filter((e) => e.t >= k0 && /^Freeing.*\d+ of \d+/.test(e.text)).length;
    const seen = countsAfter(out, k0);
    if (short) {
      // COUNTED, because "once" is the claim: the words are a live region, and
      // every write of them is another announcement (waitSayingFreeing's contract).
      const freeingSpoken = out.busy.filter((e) => e.t >= k0 && e.text === FREEING).length;
      console.log(`          freeing words spoken ${freeingSpoken} time(s); counts shown beside them: ${seen.length ? seen.join(", ") : "none"}; counts written into the spoken line: ${spokenCounts}`);
      check("(c) with no room the card says, once, that it is freeing the last session's space", freeingSpoken, 1);
      check("(c) ...with a count beside it that advances", seen.length >= 2 && seen.every((d, i) => i === 0 || d > seen[i - 1]), true);
      check("(m) ...and the count is never written into the spoken line", spokenCounts, 0);
      check("(e) the report names the wait while it runs", /not read yet — freeing the space the last session used/.test(during?.line("Adding photos") ?? ""), true);
    } else {
      // ONE CHECK, because it is one claim: the keep went straight on. The card's
      // words alone would pass the old build, which says "Adding" too — once the
      // whole delete has finished — so they are held to the moment the set appeared.
      // The card's first words are the open's own: "Opening N files…" since the
      // card rises before the first read, "Adding N photos…" before that.
      check("(b) with room in the allowance the keep does not wait: the set is on screen while the old delete still runs, and the card says it is opening or adding, never Freeing",
        !!out.shown && out.shown.pending > 0 && /^(Opening \d+ files?|Adding \d+ photos?)…$/.test(firstBusy?.text ?? "") && !saidFreeing, true);
    }
    check("(e) the report's Freeing storage line counts the delete while it runs",
      /^\d+ of \d+ photos' bytes deleted, running \d+s$/.test(during?.line("Freeing storage") ?? ""), true);

    const after = await report(p);
    const lk = after.line("Last keep");
    console.log(`          report after (${after.how}):`);
    console.log(`            Freeing storage  ${after.line("Freeing storage")}`);
    console.log(`            Last keep        ${lk}`);
    check("(e) ...and says there is nothing to free once it has finished", after.line("Freeing storage"), "nothing to free");
    check("(n) the report calls the browser's figure an allowance, never free space", /the browser allows/.test(lk) && !/\bfree\b/.test(lk), true);
    if (short) {
      check("(n) ...and says there is no room when nothing is left of it — not \"1 KB\"", /the browser allows no room/.test(lk) && !/(^|[^\d])1 KB/.test(lk), true);
    } else {
      const ask = msOf(lk, "asking the browser for room"), del = msOf(lk, "waiting on its delete");
      console.log(`          room check ${Number.isNaN(ask) ? "not reported" : `${Math.round(ask)} ms`}, wait on the delete ${Number.isNaN(del) ? "not reported" : `${Math.round(del)} ms`}`);
      check("(o) the 1.5 s the browser took to answer is reported as the room check, not as a wait on the delete", ask >= 1400 && del < 200, true);
      check("(b) ...and the report says there was enough in the allowance", /, enough for/.test(lk), true);
    }
    const n = await tiles(p);
    const names = await storedNames(p);
    console.log(`          session: ${n} tiles; stored index: ${names ? names.join(", ") : "(unreadable)"}`);
    // In the spare arm this is a GUARD rather than a new claim: the three are
    // written while the old delete holds the store, and must all land.
    check(short ? "(d) the session holds exactly one copy of each kept photo" : "(b) ...and all three arrive and are stored once, though written while the old delete ran",
      n === QUICK.length && JSON.stringify(names) === JSON.stringify(QNAMES), true);
  } finally {
    await ctx.close();
  }
}

/** A PRACTICE PHOTO WHILE A SET IS STILL BEING STORED (decision 075). Each
 *  photo's write is held open from outside, so the set is still arriving long
 *  after its first photo is on screen; Home is live, and a practice photo
 *  resets the session — which, under a loop still writing the set, ended the
 *  set and then had it written back. It must be refused before any question,
 *  and change nothing. Counts its failures into `failed`. */
async function practiceArm(br, dir) {
  const SET = copies(dir, ["v1.jpg", "v2.jpg", "v3.jpg"]);
  console.log(`\n=== A practice photo tapped while a set is still being stored ===\n`);
  const ctx = await br.newContext(VIEW);
  try {
    await ctx.addInitScript(slowStorage, { holdWrites: 6000 });
    const p = await ctx.newPage();
    let asked = 0;
    p.on("dialog", (d) => { asked++; void d.accept(); });
    p.on("pageerror", (e) => console.log(`          page error: ${e.message}`));
    await p.goto(`${BASE}/ir.html`, { waitUntil: "load" });
    await p.waitForSelector("#file", { state: "attached" });
    await p.setInputFiles("#file", SET);
    await p.waitForFunction(() => document.getElementById("welcome").hidden && !document.getElementById("busy").open, null, { timeout: 120000 });
    const stillStoring = await p.evaluate(() => [...document.querySelectorAll("#sessionThumbs .session-thumb")].some((x) => x.disabled));
    await p.click("#homeBtn");
    await p.waitForFunction(() => !document.getElementById("welcome").hidden, null, { timeout: 10000 }).catch(() => {});
    const tTap = await p.evaluate(() => performance.now());
    await p.click("#galleryList button.gal", { timeout: 10000 });
    const pt = await waitToast(p, "Already adding photos", 1500);
    const loading = await p.evaluate((t) => window.__dlg.some((d) => d.t >= t && d.id === "busy" && d.op === "open" && /Loading photo/.test(d.text)), tTap);
    console.log(`          tapped with the set ${stillStoring ? "still being stored" : "ALREADY STORED (the instrument missed its window)"}: toast ${toastSaid(pt)}; questions asked ${asked}; "Loading photo…" ${loading ? "RAISED" : "not raised"}`);
    check("(j) the instrument held: the set was still being stored when the practice photo was tapped", stillStoring, true);
    check("(j) a practice photo tapped while a set is still being stored is refused, before any question", pt.found && pt.onTop && asked === 0 && !loading, true);
    await p.waitForFunction((n) => { const t = [...document.querySelectorAll("#sessionThumbs .session-thumb")]; return t.length >= n && t.every((x) => !x.disabled); }, SET.length, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(1000);
    const n = await tiles(p);
    const names = await storedNames(p);
    console.log(`          afterwards: ${n} tiles; stored index: ${names ? names.join(", ") : "(unreadable)"}`);
    check("(j) ...and changes nothing: the set arrives whole, stored once", n === 3 && JSON.stringify(names) === JSON.stringify(["v1.jpg", "v2.jpg", "v3.jpg"]), true);
  } finally {
    await ctx.close();
  }
}

/** Every stored row's name, verdict, whether it carries an edit, and its
 *  order — what a resume rebuilds the session from. */
const storedRows = (p) => p.evaluate(() => new Promise((res) => {
  try {
    const rq = indexedDB.open("ips-session");
    rq.onerror = () => res(null);
    rq.onsuccess = () => {
      const db = rq.result;
      try {
        const g = db.transaction("meta").objectStore("meta").getAll();
        g.onsuccess = () => { res(g.result.map((m) => ({ name: m.name, mark: m.mark ?? null, edit: m.edit != null, order: m.order })).sort((a, b) => a.name.localeCompare(b.name))); db.close(); };
        g.onerror = () => { res(null); db.close(); };
      } catch { res(null); db.close(); }
    };
  } catch { res(null); }
}));

/** Start a page for an arm: the instruments, dialogs recorded and accepted,
 *  page errors printed, the app loaded. Returns the page and the notes list. */
async function armPage(ctx, cfg) {
  await ctx.addInitScript(slowStorage, cfg);
  return anotherPage(ctx);
}
/** Another page in a context `armPage` has already set up — its instruments
 *  are the context's, so they are not installed a second time. */
async function anotherPage(ctx) {
  const p = await ctx.newPage();
  const notes = [];
  p.on("dialog", (d) => { notes.push(d.message()); void d.accept(); });
  p.on("pageerror", (e) => console.log(`          page error: ${e.message}`));
  await p.goto(`${BASE}/ir.html`, { waitUntil: "load" });
  await p.waitForSelector("#file", { state: "attached" });
  return { p, notes };
}
const notesSaid = (notes) => (notes.length ? notes.map((m) => `"${m.replace(/\n/g, " / ")}"`).join("; ") : "none");

/** A DISK THAT FILLS ALTHOUGH THE ALLOWANCE SAID IT WOULD NOT (decision 075).
 *
 *  The allowance says plenty, so the keep goes straight on — and every write of
 *  a new photo is refused until the old session's held deletes have finished.
 *  `shape` is how the refusal arrives (tools/slow-storage.mjs `quotaShape`):
 *  "abort", a commit that did not fit, as Chromium reports it — only the app's
 *  `onabort` sees it; "request", WebKit refusing a put over its capacity-based
 *  allowance, a QuotaExceededError at the request; "full", WebKit finding the
 *  DISK full, an UnknownError at the request that names nothing about room.
 *  The keep must wait for the delete with the card up
 *  and counting, write the refused photos again, and end with each stored once.
 *  A Reject pressed on the first photo while its write is refused must be what
 *  its stored row says, with the edit it opened with. Counts into `failed`. */
async function quotaArm(br, dir, shape) {
  const SESSION = copies(dir, ["u1.jpg", "u2.jpg", "u3.jpg", "u4.jpg"]);
  const QUICK = copies(dir, ["w1.jpg", "w2.jpg", "w3.jpg"], 2);
  const QNAMES = ["w1.jpg", "w2.jpg", "w3.jpg"];
  console.log(`\n=== Keep straight after Done · the allowance says plenty · every write refused until the old delete is done · refused ${{ request: "AT THE REQUEST, over WebKit's allowance", full: "AT THE REQUEST as WebKit's full disk, an UnknownError", abort: "at the commit (Chromium), only abort firing" }[shape]} ===\n`);
  const ctx = await br.newContext(VIEW);
  try {
    const { p, notes } = await armPage(ctx, { slow: SLOW, estimate: "plenty", quotaWhileDeleting: 4, quotaShape: shape });
    await sessionThenDone(p, SESSION);
    await openQuick(p, QUICK);
    await p.click("#qlKeep");
    // (t) A VERDICT GIVEN WHILE THE PHOTO'S OWN WRITE IS REFUSED. The first
    // photo is on screen at once; its write waits behind the held delete.
    await p.waitForFunction(() => document.getElementById("welcome").hidden && !document.getElementById("busy").open, null, { timeout: 30000 }).catch(() => {});
    const pending = await p.evaluate(() => [...document.querySelectorAll("#sessionThumbs .session-thumb")].some((x) => x.disabled));
    // THE PRESS IS RECORDED, never swallowed: a press that landed under a card
    // raised meanwhile times out, and a check that trusted it then blamed the
    // stored row for a verdict that was never given.
    const pressed = await p.click("#sessionReject", { timeout: 10000 }).then(() => true, () => false);
    const took = pressed && await p.evaluate(() => document.getElementById("sessionReject").getAttribute("aria-pressed") === "true" && document.querySelector("#sessionThumbs .session-thumb")?.disabled === true);
    await settle(p, QUICK.length, 150000);
    await p.waitForTimeout(1500);
    const out = await record(p);
    const k0 = out.keeps[0];
    const planted = await p.evaluate(() => window.__quotaPlanted || 0);
    const saidFreeing = out.busy.some((e) => e.t >= k0 && e.text === FREEING);
    const seen = countsAfter(out, k0);
    const full = notes.find((m) => /Storage filled up|couldn't be opened|couldn't be stored/.test(m));
    const lk = (await report(p)).line("Last keep");
    const n = await tiles(p);
    const rows = await storedRows(p);
    const w1 = rows?.find((r) => r.name === "w1.jpg");
    console.log(`          writes refused for room: ${planted}; card said "${FREEING}": ${saidFreeing ? "yes" : "no"}, counts ${seen.length ? seen.join(", ") : "none"}`);
    console.log(`          notes: ${notesSaid(notes)}`);
    console.log(`          Last keep  ${lk}`);
    console.log(`          session: ${n} tiles; stored: ${rows ? rows.map((r) => `${r.name}${r.mark ? ` [${r.mark}]` : ""}${r.edit ? " +edit" : ""}`).join(", ") : "(unreadable)"}`);
    check(`(h) the instrument held: writes were refused for room while the old delete ran (${shape})`, planted >= 1, true);
    check(`(h) a write refused for room while the old delete runs waits for it, with the card up saying so and counting (${shape})`, saidFreeing && seen.length >= 1, true);
    check(`(h) ...and the refused photos are written again: no "Storage filled up", nothing "couldn't be opened" or "couldn't be stored" (${shape})`, full ?? "", "");
    check(`(h) ...and every photo is stored exactly once (${shape})`, n === QUICK.length && JSON.stringify(rows?.map((r) => r.name)) === JSON.stringify(QNAMES), true);
    check(`(h) ...and the report says all ${QUICK.length} were stored again (${shape})`, new RegExp(`${QUICK.length} stored again after the last session's space was freed`).test(lk), true);
    console.log(`          Reject: pressed ${pressed}, took on the photo on screen while its write was pending ${took}`);
    check(`(t) the instrument held: Reject was pressed, and took, while the first photo's write was still pending (${shape})`, pending && took, true);
    check(`(t) a Reject pressed while the photo's write was refused is what its stored row says, with the edit it opened with (${shape})`, w1?.mark === "reject" && w1?.edit === true, true);
  } finally {
    await ctx.close();
  }
}

/** A REFUSAL SEEN LATE (decision 075's review). The old delete is short, and
 *  each photo's read is slow, so the loop only gets round to a refused write
 *  after the delete has finished. A refusal the delete caused must still be
 *  written again, not taken for a full disk. Counts into `failed`. */
async function lateArm(br, dir) {
  const SESSION = copies(dir, ["l1.jpg", "l2.jpg", "l3.jpg", "l4.jpg", "l5.jpg", "l6.jpg", "l7.jpg", "l8.jpg"]);
  const QUICK = copies(dir, ["m1.jpg", "m2.jpg", "m3.jpg", "m4.jpg", "m5.jpg"], 1);
  console.log(`\n=== A refusal the loop sees only after the old delete has finished ===\n`);
  const ctx = await br.newContext(VIEW);
  try {
    const { p, notes } = await armPage(ctx, { slow: 1000, estimate: "plenty", quotaWhileDeleting: 8 });
    await sessionThenDone(p, SESSION);
    await openQuick(p, QUICK);
    await p.evaluate(() => { window.__slowFileReads = 2000; });
    await p.click("#qlKeep");
    await settle(p, QUICK.length, 120000);
    await p.waitForTimeout(1500);
    const planted = await p.evaluate(() => window.__quotaPlanted || 0);
    const rows = await storedRows(p);
    const n = await tiles(p);
    // LATE, PROVED: the loop raises the freeing card for a refused write only
    // when it gets to it while the delete still runs (the allowance says
    // plenty, so the room check never waits). None after Keep means every
    // refusal was seen after the delete had ended — what this arm exists for.
    const out = await record(p);
    const lapsDuring = out.busy.filter((e) => e.t >= out.keeps[0] && e.text === FREEING).length;
    console.log(`          writes refused for room: ${planted}; the freeing card raised during the delete ${lapsDuring} time(s); notes: ${notesSaid(notes)}; session ${n} tiles; stored ${rows ? rows.map((r) => r.name).join(", ") : "(unreadable)"}`);
    check("(u) the instrument held: writes were refused while the old delete ran, and the loop got to them only after it had ended", planted >= 1 && lapsDuring === 0, true);
    check("(u) a refusal the delete caused, seen after the delete has finished, is written again — the set is not cut short", !notes.some((m) => /Storage filled up/.test(m)) && n === QUICK.length && rows?.length === QUICK.length, true);
  } finally {
    await ctx.close();
  }
}

/** A REFUSED PHOTO WRITTEN AGAIN, AND ONE THAT CANNOT BE READ AGAIN (decision
 *  075's review). Every write is refused while the old delete runs, so all four
 *  photos wait and are written again. x1 is the photo ON SCREEN: it must be
 *  written from the bytes the reader is editing, never read again — a file
 *  changed or gone since dropped a photo still being edited and called it one
 *  that "couldn't be opened". x2 is not on screen and its file cannot be read
 *  again: it must be listed as not stored, never as not opened. And every
 *  stored photo keeps an order of its own (check (v)) — the path this drives
 *  cannot hand an order out twice; the `writefail` arm drives the one that
 *  could. */
async function ordersArm(br, dir) {
  const SESSION = copies(dir, ["o1.jpg", "o2.jpg", "o3.jpg", "o4.jpg"]);
  const QUICK = copies(dir, ["x1.jpg", "x2.jpg", "x3.jpg", "x4.jpg"], 2);
  console.log(`\n=== Refused photos written again: the one on screen from memory, one whose file cannot be read again ===\n`);
  const ctx = await br.newContext(VIEW);
  try {
    const { p, notes } = await armPage(ctx, { slow: 3000, estimate: "plenty", quotaWhileDeleting: 4, failReread: "^x[12]\\.jpg$" });
    await sessionThenDone(p, SESSION);
    await openQuick(p, QUICK);
    await p.evaluate(() => { window.__failRereadArmed = true; });
    await p.click("#qlKeep");
    await settle(p, 3, 120000);
    await p.waitForTimeout(1500);
    const failedReads = await p.evaluate(() => window.__rereadFailed || 0);
    const planted = await p.evaluate(() => window.__quotaPlanted || 0);
    const rows = await storedRows(p);
    const orders = rows ? rows.map((r) => r.order) : [];
    console.log(`          writes refused for room: ${planted}; re-reads failed: ${failedReads}; notes: ${notesSaid(notes)}; stored: ${rows ? rows.map((r) => `${r.name}@${r.order}`).join(", ") : "(unreadable)"}`);
    check("(v) the instrument held: the refused photo's file could not be read again", failedReads >= 1, true);
    check("(v) every stored photo keeps an order of its own", orders.length >= 2 && new Set(orders).size === orders.length, true);
    check("(ii) the photo on screen, refused while the old delete ran, is stored from the bytes in memory — not read again, not dropped", !!rows?.some((r) => r.name === "x1.jpg") && !notes.some((m) => /x1\.jpg/.test(m)), true);
    check("(ii) a photo whose file cannot be read again is listed as not stored, never as not opened", notes.some((m) => /couldn't be stored/.test(m) && /x2\.jpg/.test(m)) && !notes.some((m) => /couldn't be opened/.test(m)), true);
  } finally {
    await ctx.close();
  }
}

/** A DISK THAT IS SIMPLY FULL FOR ONE PHOTO (decision 075's review). Its second
 *  write is refused too, with no delete running; it is dropped, and the report
 *  must count as stored again only the photos whose second write landed. */
async function fullArm(br, dir) {
  const SESSION = copies(dir, ["f1.jpg", "f2.jpg", "f3.jpg", "f4.jpg"]);
  const QUICK = copies(dir, ["y1.jpg", "y2.jpg", "y3.jpg"], 1);
  console.log(`\n=== One photo the disk has no room for even after the delete ===\n`);
  const ctx = await br.newContext(VIEW);
  try {
    const { p, notes } = await armPage(ctx, { slow: 3000, estimate: "plenty", quotaWhileDeleting: 4, quotaAlways: "y3" });
    await sessionThenDone(p, SESSION);
    await openQuick(p, QUICK);
    await p.click("#qlKeep");
    await settle(p, 2, 120000);
    await p.waitForTimeout(2000);
    const lk = (await report(p)).line("Last keep");
    const rows = await storedRows(p);
    const againN = Number((lk.match(/(\d+) stored again/) ?? [])[1] ?? 0);
    console.log(`          notes: ${notesSaid(notes)}; stored: ${rows ? rows.map((r) => r.name).join(", ") : "(unreadable)"}`);
    console.log(`          Last keep  ${lk}`);
    check("(w) the instrument held: the photo the disk had no room for was dropped, with the note that says so", notes.some((m) => /Storage filled up/.test(m)) && !rows?.some((r) => r.name === "y3.jpg"), true);
    check("(w) the report counts as stored again only the photos whose second write landed", againN, rows?.length ?? -1);
  } finally {
    await ctx.close();
  }
}

/** THE WAIT KEEPS ITS OWN CARD (decision 075's review). Part-way through a set,
 *  the reader opens a stored photo — its "Loading…" card is up, its read queued
 *  behind the held delete — and meanwhile later photos are refused for room. The
 *  wait must not write over that card, and once the card closes it must raise
 *  its own and keep it up, saying so, until the delete is done. */
async function busyArm(br, dir) {
  const SESSION = copies(dir, ["b1.jpg", "b2.jpg", "b3.jpg", "b4.jpg"]);
  const QUICK = copies(dir, ["z1.jpg", "z2.jpg", "z3.jpg", "z4.jpg", "z5.jpg", "z6.jpg"], 1);
  console.log(`\n=== A photo opened from the strip while later photos wait for room ===\n`);
  const ctx = await br.newContext(VIEW);
  try {
    const { p } = await armPage(ctx, { slow: SLOW, estimate: "plenty", quotaWhileDeleting: 4, quotaSkip: 3 });
    await sessionThenDone(p, SESSION);
    await openQuick(p, QUICK);
    await p.evaluate((w) => {
      const S = (window.__card = []);
      setInterval(() => {
        const b = document.getElementById("busy");
        S.push({ t: performance.now(), open: b.open, text: document.getElementById("busyText").textContent, extras: document.getElementById("busyCount").hidden === false || document.getElementById("busyReport").hidden === false, ours: document.getElementById("busyText").textContent === w });
      }, 50);
    }, FREEING);
    await p.click("#qlKeep");
    await p.waitForFunction(() => { const t = [...document.querySelectorAll("#sessionThumbs .session-thumb")]; return t.length >= 6 && t.slice(0, 3).every((x) => !x.disabled) && !document.getElementById("busy").open; }, null, { timeout: 60000 }).catch(() => {});
    await p.evaluate(() => { window.__slowReads = 2500; });
    await p.locator("#sessionThumbs .session-thumb").nth(1).click({ timeout: 10000 }).catch(() => {});
    await settle(p, 6, 150000);
    await p.waitForTimeout(1000);
    const r = await p.evaluate(() => ({ card: window.__card, at: window.__quotaAt || [], sweep: window.__sweep, dlg: window.__dlg, words: window.__busyText, loading: window.__dlg.some((d) => d.id === "busy" && d.op === "open" && /Loading/.test(d.text)) }));
    // WRITTEN OVER ANOTHER FLOW'S CARD: the wait's words arriving while the card
    // up is one that another flow opened with other words — the last open or
    // close of the card before the write is an open that did not say them.
    const takeovers = r.words.filter((e) => e.text === FREEING).filter((e) => {
      const before = r.dlg.filter((d) => d.id === "busy" && d.t <= e.t).pop();
      return !!before && before.op === "open" && before.text !== FREEING && !/^Adding /.test(before.text);
    }).length;
    // FROM THE REFUSAL REACHING THE APP: tools/slow-storage.mjs stamps
    // `__quotaAt` when the refusal fires, not when the write was queued — the
    // stretch before it is the first photo on screen with nothing refused yet,
    // and counting it scored Playwright's round trips, not the wait.
    const from = r.at[0] ?? Infinity;
    const to = Math.max(...r.sweep.map((e) => e.tComplete ?? 0));
    let gap = 0, closedSince = null, foreignExtras = 0;
    for (const s of r.card) {
      if (s.t < from || s.t > to) continue;
      if (!s.open) { if (closedSince === null) closedSince = s.t; gap = Math.max(gap, s.t - closedSince); } else closedSince = null;
      if (s.open && s.extras && !s.ours) foreignExtras++;
    }
    const rows = await storedRows(p);
    console.log(`          refusals from ${Math.round(from)} ms, delete done ${Math.round(to)} ms; a "Loading…" card ${r.loading ? "was up" : "was NEVER up (the instrument missed)"}; longest stretch with no card: ${Math.round(gap)} ms; the wait's words written over another flow's card: ${takeovers}; samples with the count or report on another flow's card: ${foreignExtras}; stored ${rows?.length ?? "?"}`);
    check("(x) the instrument held: a photo was opened from the strip while writes were refused", r.loading && Number.isFinite(from), true);
    check("(x) while refused photos wait for the delete, the card is never gone for more than 600 ms", gap <= 600, true);
    check("(x) ...and the wait never writes over another flow's card", takeovers, 0);
    check("(x) ...and its count and report button never appear on another flow's card", foreignExtras, 0);
    check("(x) ...and all six photos are stored once", rows?.length === 6, true);
  } finally {
    await ctx.close();
  }
}

/** THE REPORT, BROUGHT TO THE TOP (decision 075's review). The report is open
 *  when a refused write raises the card over it; the card's "What's
 *  happening?" must bring the report up above the card, where it can be read
 *  and closed. */
async function stackArm(br, dir) {
  const SESSION = copies(dir, ["k1.jpg", "k2.jpg", "k3.jpg", "k4.jpg"]);
  const QUICK = copies(dir, ["n1.jpg", "n2.jpg", "n3.jpg"], 2);
  console.log(`\n=== The report open when the card rises over it ===\n`);
  const ctx = await br.newContext(VIEW);
  try {
    const { p } = await armPage(ctx, { slow: SLOW, estimate: "plenty", quotaWhileDeleting: 4 });
    await sessionThenDone(p, SESSION);
    await openQuick(p, QUICK);
    await p.click("#qlKeep");
    await p.waitForFunction(() => document.getElementById("welcome").hidden && !document.getElementById("busy").open, null, { timeout: 30000 }).catch(() => {});
    await p.click("#verTag");
    await p.waitForFunction(() => document.getElementById("verDlg").open, null, { timeout: 5000 }).catch(() => {});
    const rose = await p.waitForFunction((w) => document.getElementById("busy").open && document.getElementById("busyText").textContent === w && document.getElementById("busyReport").hidden === false, FREEING, { timeout: 30000 }).then(() => true).catch(() => false);
    let onTop = false, closable = false, adding = "(no report)";
    if (rose) {
      await p.click("#busyReport", { timeout: 5000 }).catch(() => {});
      await p.waitForTimeout(400);
      onTop = await p.evaluate(() => { const d = document.getElementById("verDlg"); const r = d.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && d.contains(hit); });
      // WHAT IT SAYS ABOUT THE WAITING PHOTOS: by what is known — the writes
      // failed while the old bytes were freed — never a cause it cannot know.
      await p.waitForFunction(() => { const v = document.getElementById("verDlgText")?.value || ""; return v && v !== "Gathering…"; }, null, { timeout: 30000 }).catch(() => {});
      adding = await p.evaluate(() => (document.getElementById("verDlgText").value.split("\n").find((l) => l.startsWith("Adding photos ")) ?? "(no such line)").slice("Adding photos ".length).trim());
      closable = await p.click("#verClose", { timeout: 2000 }).then(() => true).catch(() => false);
    }
    const back = await p.evaluate(() => document.getElementById("busy").open);
    console.log(`          card rose over the open report: ${rose ? "yes" : "no"}; after "What's happening?": report ${onTop ? "ON TOP" : "under the card"}, Close ${closable ? "pressable" : "NOT pressable"}; card still up after: ${back}`);
    check("(y) the instrument held: the card rose over the open report", rose, true);
    check("(y) \"What's happening?\" brings the report above the card, where it can be read and closed", onTop && closable, true);
    console.log(`          the report's Adding photos line meanwhile: "${adding}"`);
    check("(y) ...and says the waiting photos could not be stored while the space was freed — never that the device had no room", /waiting to be stored again — (it|they) could not be stored while the last session's space was being freed/.test(adding) && !/no room/.test(adding), true);
    await settle(p, 3, 120000);
  } finally {
    await ctx.close();
  }
}

/** THE VERDICT NAMES WHAT WAS COMPARED (decision 075's review). The allowance
 *  is more than the set but less than twice it: the keep waits, and the report
 *  must say it asked for twice the set's size, or it contradicts itself. */
async function marginArm(br, dir) {
  const SESSION = copies(dir, ["g1.jpg", "g2.jpg", "g3.jpg", "g4.jpg"]);
  const QUICK = copies(dir, ["e1.jpg", "e2.jpg", "e3.jpg"], 1);
  const incoming = QUICK.reduce((n, f) => n + statSync(f).size, 0);
  console.log(`\n=== An allowance between the set and twice the set ===\n`);
  const ctx = await br.newContext(VIEW);
  try {
    const { p } = await armPage(ctx, { slow: 2000, estimate: Math.round(incoming * 1.5) });
    await sessionThenDone(p, SESSION);
    await openQuick(p, QUICK);
    await p.click("#qlKeep");
    await settle(p, 3, 60000);
    await p.waitForTimeout(1000);
    const lk = (await report(p)).line("Last keep");
    console.log(`          Last keep  ${lk}`);
    check("(z) with 1.5 times the set left, the report says not enough and names the doubled figure it asked for", /not enough for [\d.]+ [KMG]?B — a keep asks for twice its size, [\d.]+ [KMG]?B/.test(lk), true);
  } finally {
    await ctx.close();
  }
}

/** A LOOK DROPPED WHILE A SET IS STILL BEING STORED IS REFUSED (decision 075's
 *  review, plan item D). The review let looks through a running open, and the
 *  pass-through carried three of round 3's findings; the plan's own words
 *  refuse everything while an open runs. Each photo's write is held, so the set
 *  is still arriving when the look is dropped: it must be refused in words,
 *  and nothing of it received or applied. */
async function lookRaceArm(br, dir) {
  const SET = copies(dir, ["c1.jpg", "c2.jpg", "c3.jpg"]);
  const look = join(dir, "race.ipslook");
  writeFileSync(look, JSON.stringify({ f: "ips-look", v: 1, name: "Race look", look: { tone: [0, 0.25, 0.5, 0.75, 1], sat: 1.2 } }));
  console.log(`\n=== A look dropped while a set is still being stored ===\n`);
  const ctx = await br.newContext(VIEW);
  try {
    const { p } = await armPage(ctx, { holdWrites: 4000 });
    await p.setInputFiles("#file", SET);
    await p.waitForFunction(() => document.getElementById("welcome").hidden && !document.getElementById("busy").open, null, { timeout: 60000 });
    const storing = await p.evaluate(() => [...document.querySelectorAll("#sessionThumbs .session-thumb")].some((x) => x.disabled));
    const t0 = await p.evaluate(() => performance.now());
    await p.setInputFiles("#file", [look]);
    const refusal = await waitToast(p, "Already adding photos", 2000);
    await p.waitForTimeout(1500);
    const recv = await p.evaluate((t) => window.__dlg.some((d) => d.t >= t && d.id === "lookRecvDlg" && d.op === "open"), t0);
    console.log(`          dropped with the set ${storing ? "still being stored" : "ALREADY STORED (the instrument missed)"}: refusal ${toastSaid(refusal)}; receive dialog ${recv ? "OPENED" : "never opened"}`);
    check("(aa) the instrument held: the set was still being stored when the look was dropped", storing, true);
    check("(aa) a look dropped while a set is being stored is refused in words the reader can see", refusal.found && refusal.onTop, true);
    check("(aa) ...and nothing of it is received, so nothing can be applied", recv, false);
  } finally {
    await ctx.close();
  }
}

/** A KEEP FILE WHOSE FIRST BYTES ARRIVE LATE (decision 075's review). Its head
 *  takes fourteen seconds, as a download still under way does. The card must
 *  offer to skip it rather than give up, and when the bytes come it must open
 *  as the keep file it is — with its edit — never as its bare original. */
async function keepSniffArm(br, dir) {
  console.log(`\n=== A keep file still downloading when it is opened ===\n`);
  const PHOTO = copies(dir, ["kp1.jpg"])[0];
  const ctx = await br.newContext({ ...VIEW, acceptDownloads: true });
  try {
    const p = await ctx.newPage();
    p.on("dialog", (d) => void d.accept());
    await p.goto(`${BASE}/ir.html`, { waitUntil: "load" });
    await p.setInputFiles("#file", [PHOTO]);
    await p.waitForFunction(() => document.getElementById("welcome")?.hidden && !document.getElementById("busy").open, null, { timeout: 60000 });
    await p.waitForTimeout(800);
    await closeMasks(p); await p.locator("#ptab-basic").click();
    await p.evaluate(() => { const el = document.getElementById("sat"); el.value = "0.62"; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
    await p.waitForTimeout(1200);
    await p.locator("#ptab-export").click();
    const [download] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }), p.locator("#keepFile").click()]);
    const saved = join(dir, download.suggestedFilename());
    await download.saveAs(saved);
    await p.close();

    await ctx.addInitScript(slowStorage, { slowSlice: { match: "ipskeep", ms: 14000 } });
    const q = await ctx.newPage();
    q.on("dialog", (d) => void d.accept());
    await q.goto(`${BASE}/ir.html`, { waitUntil: "load" });
    await q.evaluate(() => { window.__skipSeen = false; setInterval(() => { if (document.getElementById("busySkip")?.hidden === false) window.__skipSeen = true; }, 100); });
    await q.setInputFiles("#file", [saved]);
    await q.waitForFunction(() => document.getElementById("welcome")?.hidden && !document.getElementById("busy").open, null, { timeout: 60000 }).catch(() => {});
    await q.waitForTimeout(1500);
    await closeMasks(q); await q.locator("#ptab-basic").click().catch(() => {});
    const r = await q.evaluate(() => ({ sat: document.getElementById("sat").value, skip: window.__skipSeen, slowed: window.__slowSliced || 0 }));
    console.log(`          the head's read was slowed ${r.slowed} time(s); the card offered Skip: ${r.skip ? "yes" : "no"}; saturation on reopening ${r.sat} (saved at 0.62)`);
    check("(bb) a keep file whose head arrives late is offered, not given up on", r.slowed >= 1 && r.skip, true);
    check("(bb) ...and opens as the keep file it is, with its edit — never as its bare original", r.sat, "0.62");
  } finally {
    await ctx.close();
  }
}

/** A FILE WHOSE FIRST BYTES NEVER ARRIVE (decision 075). A cloud placeholder,
 *  or a drive gone away: the head sniff of one picked file never settles. The
 *  card must offer to skip it; skipping lists it, opens the rest, and releases
 *  the one-open guard. Counts its failures into `failed`.
 *
 *  `mode` says what happens to the clock first, and each is built so that a
 *  clock that merely PAUSES would offer inside the window checked — which is
 *  what tells the restart from a pause. The offer comes after 10 s of visible
 *  time (`SNIFF_OFFER_MS`):
 *  - "visible": nothing; the offer, its size, Skip, and the guard released.
 *  - "hidden": 7 s visible, 11 s hidden, then back. A clock that kept counting
 *    while hidden would offer while away — 11 s is past the limit even for one
 *    that started again as the page was hidden; one that only paused would
 *    offer about 3 s after the return. Neither may: time starts again on return.
 *  - "frozen": 7 s visible, then the page's main thread held for 3 s, which is
 *    what a page the system froze looks like from inside. A clock that counted
 *    the jump would offer at once. */
async function hangArm(br, dir, mode) {
  const tag = { visible: "h", hidden: "i", frozen: "j" }[mode];
  const SET = [...copies(dir, [`${tag}1.jpg`]), ...copies(dir, [`${tag}2-HANGSNIFF.jpg`], 1)];
  const LATER = copies(dir, [`${tag}3.jpg`], 2);
  console.log(`\n=== A set with one file whose first bytes never arrive${mode === "hidden" ? " · 7 s visible, then the page hidden for 11 s" : mode === "frozen" ? " · 7 s visible, then the page frozen for 3 s" : ""} ===\n`);
  const ctx = await br.newContext(VIEW);
  try {
    const { p, notes } = await armPage(ctx, { hangSniff: "HANGSNIFF" });
    if (mode === "hidden") await p.evaluate(() => {
      window.__vis = "visible";
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => window.__vis });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => window.__vis !== "visible" });
    });
    const skipUp = () => p.evaluate(() => document.getElementById("busySkip")?.hidden === false);
    const opened = () => p.evaluate(() => document.getElementById("welcome").hidden);
    await p.setInputFiles("#file", SET);
    if (mode !== "visible") {
      await p.waitForTimeout(7000);
      const early = await skipUp();
      if (mode === "hidden") {
        await p.evaluate(() => { window.__vis = "hidden"; document.dispatchEvent(new Event("visibilitychange")); });
        await p.waitForTimeout(11000);
        const whileAway = { skip: await skipUp(), opened: await opened() };
        await p.evaluate(() => { window.__vis = "visible"; document.dispatchEvent(new Event("visibilitychange")); });
        await p.waitForTimeout(5000);
        const soon = await skipUp();
        console.log(`          7 s visible: Skip offered ${early}; then 11 s hidden: Skip offered ${whileAway.skip}, anything opened ${whileAway.opened}; 5 s after returning: Skip offered ${soon}`);
        check("(cc) the instrument held: no offer after 7 s of visible time", early, false);
        check("(cc) time the page is hidden does not count: 7 s visible and 11 s away, past the 10 s limit, and nothing is offered or opened while away", !whileAway.skip && !whileAway.opened, true);
        check("(cc) ...and the clock starts again on return rather than resuming: no offer in the first 5 s back, where a paused clock offers at about 3 s", soon, false);
      } else {
        await p.evaluate(() => { const t = performance.now(); while (performance.now() - t < 3000) { /* the page, frozen */ } });
        await p.waitForTimeout(5000);
        const soon = await skipUp();
        console.log(`          7 s visible: Skip offered ${early}; then the page frozen 3 s; 5 s after: Skip offered ${soon}`);
        check("(cc) the instrument held: no offer after 7 s of visible time", early, false);
        check("(cc) a page frozen by the system starts the clock again: no offer in the 5 s after a 3 s freeze, where a clock that counted it offers at once", soon, false);
      }
    }
    const offered = await p.waitForFunction(() => document.getElementById("busySkip")?.hidden === false, null, { timeout: 20000 }).then(() => true).catch(() => false);
    // Read defensively: a build without the offer has no such button at all.
    const card = await p.evaluate(() => { const b = document.getElementById("busySkip"); const r = b?.getBoundingClientRect(); return { text: document.getElementById("busyText").textContent, label: b?.textContent ?? "", w: Math.round(r?.width ?? 0), h: Math.round(r?.height ?? 0) }; });
    console.log(`          offer: ${offered ? `"${card.text}" · "${card.label}" ${card.w}x${card.h}` : "none within 20 s"}`);
    check(`(i) a file whose first bytes never arrive is offered to be skipped, by name${mode === "visible" ? "" : mode === "hidden" ? ", once back" : ", after the freeze"}`, offered && /Still reading .*HANGSNIFF/.test(card.text), true);
    if (mode === "visible") check("(i) ...with a Skip button at least 44 px each way", card.w >= 44 && card.h >= 44, true);
    if (offered) await p.click("#busySkip");
    const came = await p.waitForFunction(() => document.getElementById("welcome").hidden && !document.getElementById("busy").open, null, { timeout: 30000 }).then(() => true).catch(() => false);
    await p.waitForTimeout(800);
    const hung = await p.evaluate(() => window.__sniffHung || 0);
    const listed = notes.some((m) => /couldn't be opened/.test(m) && /HANGSNIFF/.test(m));
    console.log(`          sniff reads left hanging: ${hung}; after Skip the rest ${came ? "opened" : "did NOT open"}; notes: ${notesSaid(notes)}`);
    check("(i) the instrument held: a sniff never finished", hung >= 1, true);
    check("(i) ...skipping it opens the rest and lists it as a file that could not be opened", came && listed, true);
    await p.setInputFiles("#file", LATER);
    // EVERY REFUSAL'S WORDS: the guard says what is opening, and a match on one
    // wording passes vacuously once the words vary.
    const refused = await waitToast(p, "Already adding photos|Already opening|Already resuming", 1500);
    check("(i) ...and the one-open guard is released: a later open is not refused", refused.found, false);
    if (await p.evaluate(() => document.getElementById("askDlg")?.open)) await p.keyboard.press("Escape");
  } finally {
    await ctx.close();
  }
}

/** A READ SLOWER THAN ITS LIMIT BUT ON ITS WAY (decision 075's review). The
 *  whole file takes 66 s to read against a limit of 61: the card offers to skip
 *  it, nobody presses, and when the bytes come the photo opens. A limit that
 *  gave up lost photographs that were still downloading. */
async function slowReadArm(br, dir) {
  const ONE = copies(dir, ["SLOWFULL-s1.jpg"])[0];
  const LATE = copies(dir, ["s2.jpg"], 1)[0];
  console.log(`\n=== One photo whose read takes longer than its limit, and finishes ===\n`);
  const ctx = await br.newContext(VIEW);
  try {
    const { p, notes } = await armPage(ctx, { slowFullRead: { match: "SLOWFULL", ms: 66000 } });
    await p.evaluate(() => { window.__skipSeen = false; setInterval(() => { if (document.getElementById("busySkip")?.hidden === false) window.__skipSeen = true; }, 200); });
    await p.setInputFiles("#file", [ONE]);
    // (jj) WHAT THE REFUSAL SAYS IS OPENING. One photo is opening; no set is
    // being added, and the refusal once said one was.
    await p.waitForFunction(() => document.getElementById("busy").open, null, { timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(2000);
    await p.setInputFiles("#file", [LATE]);
    const refusal = await waitToast(p, "^Already ", 1500);
    console.log(`          another photo dropped while this one opens: ${toastSaid(refusal)}`);
    check("(jj) a drop while one photo opens is refused in words that name no set", refusal.found && refusal.onTop && /^Already opening/.test(refusal.text) && !/\bset\b|adding/i.test(refusal.text), true);
    const came = await p.waitForFunction(() => document.getElementById("welcome").hidden && !document.getElementById("busy").open, null, { timeout: 100000 }).then(() => true).catch(() => false);
    const r = await p.evaluate(() => ({ skip: window.__skipSeen, hint: document.getElementById("hint").hidden ? "" : document.getElementById("hint").textContent }));
    console.log(`          Skip offered while it read: ${r.skip}; the photo ${came ? "opened" : "did NOT open"}; hint "${r.hint}"; notes: ${notesSaid(notes)}`);
    check("(dd) a read past its limit is offered to be skipped, not given up", r.skip, true);
    check("(dd) ...and when nobody skips it, the photo opens once its bytes arrive", came && !/Could not open/.test(r.hint), true);
  } finally {
    await ctx.close();
  }
}

/** A DROP WHILE A SESSION IS RESUMING (decision 075). The resume's read of the
 *  first photo is slowed from outside; files dropped in the meantime reached
 *  `openPicked`, asked to start a new session over the one being resumed, and
 *  could leave the editor on a photo from the session it had just forgotten.
 *  Counts its failures into `failed`. */
async function resumeArm(br, dir) {
  const SET = copies(dir, ["r1.jpg", "r2.jpg"]);
  const DROP = copies(dir, ["r3.jpg", "r4.jpg"], 1);
  console.log(`\n=== Files dropped while a session is resuming ===\n`);
  const ctx = await br.newContext(VIEW);
  try {
    await ctx.addInitScript(slowStorage, {});
    const p = await ctx.newPage();
    p.on("dialog", (d) => void d.accept());
    p.on("pageerror", (e) => console.log(`          page error: ${e.message}`));
    await p.goto(`${BASE}/ir.html`, { waitUntil: "load" });
    await p.waitForSelector("#file", { state: "attached" });
    await p.setInputFiles("#file", SET);
    await p.waitForFunction(() => { const t = [...document.querySelectorAll("#sessionThumbs .session-thumb")]; return t.length === 2 && t.every((x) => !x.disabled) && !document.getElementById("busy").open; }, null, { timeout: 120000 });
    await p.waitForTimeout(2500);
    await p.reload({ waitUntil: "load" });
    await p.waitForSelector("#resumeSession:not([hidden])", { timeout: 60000 });
    await p.evaluate(() => { window.__slowReads = 5000; });
    await p.click("#resumeSession");
    await p.waitForFunction(() => document.getElementById("busy").open, null, { timeout: 5000 }).catch(() => {});
    await p.setInputFiles("#file", DROP);
    const refused = await waitToast(p, "Already resuming", 1500);
    const askOpen = await p.evaluate(() => !!document.getElementById("askDlg")?.open);
    console.log(`          dropped during "Resuming session…": refusal toast ${toastSaid(refused)}; "a session is open" question ${askOpen ? "ASKED" : "not asked"}`);
    if (askOpen) await p.keyboard.press("Escape");
    check("(q) files dropped while a session resumes are refused with words, and no question is asked over the resume", refused.found && refused.onTop && !askOpen, true);
    await p.evaluate(() => { window.__slowReads = 0; });
    await p.waitForFunction(() => !document.getElementById("busy").open && document.getElementById("welcome").hidden, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(1000);
    const n = await tiles(p);
    const names = await storedNames(p);
    console.log(`          after the resume: ${n} tiles; stored index: ${names ? names.join(", ") : "(unreadable)"}`);
    check("(q) ...and the resumed session is intact", n === 2 && JSON.stringify(names) === JSON.stringify(["r1.jpg", "r2.jpg"]), true);
  } finally {
    await ctx.close();
  }
}

/** THE STORAGE PERMISSION NEVER ANSWERED (decision 076).
 *
 *  Takes the browser and the scratch directory. `persist()` is replaced by a
 *  promise that never settles, which is Firefox with its prompt unanswered.
 *  A keep carrying a photo it cannot add must still reach the note that says so,
 *  and a batch must get past "Processing 0". Counts failures into `failed`. */
async function persistArm(br, dir) {
  console.log("\n=== The storage permission asked and never answered ===\n");
  // A JPEG named as a raw: the Quick look previews it happily, and the keep
  // skips it as a flattened copy — which is a closing note, the thing to wait for.
  const KEEP = [["p1.jpg", 0], ["p2.jpg", 1], ["p9.dng", 2]].map(([n, i]) => { const to = join(dir, n); copyFileSync(JPG[i], to); return to; });
  const BATCH = join(dir, "b1.jpg");
  copyFileSync(JPG[0], BATCH);
  const ctx = await br.newContext(VIEW);
  try {
    await ctx.addInitScript(slowStorage, { neverPersist: true });
    const p = await ctx.newPage();
    let noted = null;
    const note = new Promise((res) => p.on("dialog", (d) => { const m = d.message(); void d.accept(); if (/couldn't be opened/.test(m)) { noted = m; res(m); } }));
    p.on("pageerror", (e) => console.log(`          page error: ${e.message}`));
    await p.goto(`${BASE}/ir.html`, { waitUntil: "load" });
    await p.waitForSelector("#file", { state: "attached" });
    await openQuick(p, KEEP);
    await p.click("#qlKeep");
    await p.waitForFunction(() => { const t = [...document.querySelectorAll("#sessionThumbs .session-thumb")]; return t.length >= 2 && t.every((x) => !x.disabled) && !document.getElementById("busy").open; }, null, { timeout: 120000 }).catch(() => {});
    await Promise.race([note, p.waitForTimeout(30000)]);
    const asked = await p.evaluate(() => window.__persistAsked || 0);
    console.log(`          persist() asked ${asked} time(s), never answered; closing note: ${noted ? `"${noted.replace(/\n/g, " / ")}"` : "none within 30 s of the set arriving"}`);
    check("(f) the instrument held: the permission was asked and left unanswered", asked >= 1, true);
    check("(f) a keep finishes and shows its closing note with the permission unanswered", !!noted && /p9\.dng/.test(noted), true);

    const q = await ctx.newPage();
    q.on("dialog", (d) => void d.accept());
    await q.goto(`${BASE}/ir.html`, { waitUntil: "load" });
    await q.click("#batchBtn");
    await q.waitForFunction(() => document.getElementById("batchDlg")?.hasAttribute("open"), null, { timeout: 60000 });
    await q.click("#bcAuto");
    await q.setInputFiles("#batchFiles", [BATCH]);
    const went = await q.waitForFunction(() => (window.__busyText || []).some((e) => /^Processing 1 \/ 1 —/.test(e.text)), null, { timeout: 30000 }).then(() => true).catch(() => false);
    const said = await q.evaluate(() => ({ asked: window.__persistAsked || 0, seen: (window.__busyText || []).map((e) => e.text) }));
    console.log(`          batch: persist() asked ${said.asked} time(s); the card said ${said.seen.map((x) => `"${x}"`).join(" → ") || "nothing"}`);
    check("(g) the instrument held: the batch asked for the permission", said.asked >= 1, true);
    check("(g) a batch starts processing with the permission unanswered", went, true);
  } finally {
    await ctx.close();
  }
}

/** A KEEP FILE TO OPEN, made through the app's own Save — once per run, on a
 *  bundled JPEG with its saturation moved, so an arm that opens one can tell it
 *  opened as a keep file. Returns its path. */
let keepMade = null;
async function aKeepFile(br, dir) {
  if (keepMade) return keepMade;
  const ctx = await br.newContext({ ...VIEW, acceptDownloads: true });
  try {
    const p = await ctx.newPage();
    p.on("dialog", (d) => void d.accept());
    await p.goto(`${BASE}/ir.html`, { waitUntil: "load" });
    await p.setInputFiles("#file", copies(dir, ["kf1.jpg"]));
    await p.waitForFunction(() => document.getElementById("welcome")?.hidden && !document.getElementById("busy").open, null, { timeout: 60000 });
    await p.waitForTimeout(800);
    await closeMasks(p); await p.locator("#ptab-basic").click();
    await p.evaluate(() => { const el = document.getElementById("sat"); el.value = "0.62"; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
    await p.waitForTimeout(1200);
    await p.locator("#ptab-export").click();
    const [download] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }), p.locator("#keepFile").click()]);
    keepMade = join(dir, download.suggestedFilename());
    await download.saveAs(keepMade);
  } finally {
    await ctx.close();
  }
  return keepMade;
}

/** A KEEP FILE DROPPED WITH PHOTOS OVER A SESSION (decision 075's review, plan
 *  item E). Opening it replaced the session without asking; the "add or start
 *  new" question was then skipped, because the session it would have asked
 *  about was gone, and the photos started a new session over it — deleting the
 *  stored photos, their edits and verdicts. The keep file must not open in a
 *  mixed drop, it must be named, and the photos must meet the question about
 *  the real session. */
async function mixedArm(br, dir) {
  const keep = await aKeepFile(br, dir);
  const SESSION = copies(dir, ["mx1.jpg", "mx2.jpg"]);
  const DROP = copies(dir, ["mx3.jpg", "mx4.jpg"], 1);
  console.log(`\n=== A keep file dropped with two photos over a session of two ===\n`);
  const ctx = await br.newContext(VIEW);
  try {
    const { p, notes } = await armPage(ctx, {});
    await p.setInputFiles("#file", SESSION);
    await p.waitForFunction(() => { const t = [...document.querySelectorAll("#sessionThumbs .session-thumb")]; return t.length === 2 && t.every((x) => !x.disabled) && !document.getElementById("busy").open; }, null, { timeout: 60000 });
    await p.waitForTimeout(1500);
    await p.setInputFiles("#file", [keep, ...DROP]);
    const asked = await p.waitForFunction(() => document.getElementById("askDlg")?.open, null, { timeout: 15000 }).then(() => true).catch(() => false);
    const question = asked ? await p.evaluate(() => document.getElementById("askTitle").textContent) : "";
    if (asked) await p.click("#askOk"); // Add to this session
    await settle(p, 4, 60000);
    await p.waitForTimeout(1500);
    const names = await storedNames(p);
    const named = notes.some((m) => m.includes(basename(keep)) && /open it on its own/.test(m));
    console.log(`          question ${asked ? `asked: "${question}"` : "NOT asked"}; stored index: ${names ? names.join(", ") : "(unreadable)"}; notes: ${notesSaid(notes)}`);
    check("(ff) a keep file dropped with photos does not replace the session: the question is asked about the session of two", asked && /A session of 2 photos/.test(question), true);
    check("(ff) ...and, added to it, the session keeps every photo it had", JSON.stringify(names), JSON.stringify(["mx1.jpg", "mx2.jpg", "mx3.jpg", "mx4.jpg"]));
    check("(ff) ...and the keep file is named, in words, as one to open on its own", named, true);
    await p.close();

    // ESCAPE ON THE QUESTION: nothing changes, and the saved photo is still named.
    const { p: q, notes: qNotes } = await anotherPage(ctx);
    const ESC = copies(dir, ["me1.jpg", "me2.jpg"], 2);
    await q.setInputFiles("#file", ESC);
    await q.waitForFunction(() => { const t = [...document.querySelectorAll("#sessionThumbs .session-thumb")]; return t.length === 2 && t.every((x) => !x.disabled) && !document.getElementById("busy").open; }, null, { timeout: 60000 });
    await q.waitForTimeout(1500);
    await q.setInputFiles("#file", [keep, ...copies(dir, ["me3.jpg", "me4.jpg"], 1)]);
    const qAsked = await q.waitForFunction(() => document.getElementById("askDlg")?.open, null, { timeout: 15000 }).then(() => true).catch(() => false);
    if (qAsked) await q.keyboard.press("Escape");
    await q.waitForFunction(() => !document.getElementById("busy").open && !document.getElementById("askDlg")?.open, null, { timeout: 15000 }).catch(() => {});
    await q.waitForTimeout(800);
    const escNamed = qNotes.some((m) => m.includes(basename(keep)) && /open it on its own/.test(m));
    const escNames = await storedNames(q);
    await q.setInputFiles("#file", copies(dir, ["me5.jpg"], 1));
    const escRefused = await waitToast(q, "^Already ", 1500);
    if (await q.evaluate(() => document.getElementById("askDlg")?.open)) await q.keyboard.press("Escape");
    console.log(`          Escape on the question: notes ${notesSaid(qNotes)}; stored ${escNames ? escNames.join(", ") : "(unreadable)"}; a later open ${escRefused.found ? "REFUSED" : "not refused"}`);
    check("(ff) Escape on the question changes nothing, and still names the saved photo as one to open on its own", qAsked && escNamed && JSON.stringify(escNames) === JSON.stringify(["me1.jpg", "me2.jpg"]) && !escRefused.found, true);
    await q.close();

    // A PHOTO THAT CANNOT BE OPENED, WITH THE SAVED PHOTO: the lone open throws,
    // and the saved photo it set aside must still be named.
    const { p: r, notes: rNotes } = await anotherPage(ctx);
    const BAD = join(dir, "mb-broken.dng");
    writeFileSync(BAD, Buffer.alloc(4096, 7));
    await r.setInputFiles("#file", [keep, BAD]);
    await r.waitForFunction(() => !document.getElementById("busy").open && !document.getElementById("hint").hidden && /Could not open/.test(document.getElementById("hint").textContent ?? ""), null, { timeout: 30000 }).catch(() => {});
    await r.waitForTimeout(800);
    const hintSaid = await r.evaluate(() => document.getElementById("hint").textContent ?? "");
    const badNamed = rNotes.some((m) => m.includes(basename(keep)) && /open it on its own/.test(m));
    console.log(`          a saved photo with a photo that cannot be opened: hint "${hintSaid}"; notes ${notesSaid(rNotes)}`);
    check("(ff) the instrument held: the photo could not be opened", /Could not open/.test(hintSaid), true);
    check("(ff) ...and the saved photo set aside with it is still named, as one to open on its own", badNamed, true);
    await r.close();

    // A DAMAGED LOOK AND A SAVED PHOTO: the drop's words about the look, and an
    // alert naming the saved photo. A reader who takes four seconds over the
    // alert must still see the look's words after it: a toast raised before an
    // alert runs out its time behind it.
    const u = await ctx.newPage();
    const uNotes = [];
    let accepted = false;
    u.on("dialog", async (d) => { uNotes.push(d.message()); await new Promise((res) => setTimeout(res, 4000)); await d.accept(); accepted = true; });
    await u.goto(`${BASE}/ir.html`, { waitUntil: "load" });
    await u.waitForSelector("#file", { state: "attached" });
    const cut = join(dir, "mcut.ipslook");
    writeFileSync(cut, '{"f":"ips-look","v":1,"name":"Cut short","look":{"tone":[0,0.25');
    await u.setInputFiles("#file", [cut, keep]);
    for (let i = 0; i < 100 && !accepted; i++) await new Promise((res) => setTimeout(res, 100));
    await u.waitForTimeout(1000);
    const after = await toastOnTop(u, "couldn't be read");
    console.log(`          a damaged look with a saved photo, the alert read for 4 s: alert ${notesSaid(uNotes)}; a second after it, ${toastSaid(after)}`);
    check("(ff) the instrument held: the alert named the saved photo and was read for four seconds", accepted && uNotes.some((m) => m.includes(basename(keep))), true);
    check("(ff) ...and the look's words are still there to be seen after it", after.found && after.onTop, true);
    await u.close();
  } finally {
    await ctx.close();
  }
}

/** SEVERAL KEEP FILES, ONE THING SAID (decision 075's review). Two dropped
 *  together: the first opens and the confirmation names it and the other, in
 *  one toast — a second toast in the same task painted over the first. And a
 *  first one that cannot be opened must never be followed by "Opened 1 of". */
async function keepsArm(br, dir) {
  const keep = await aKeepFile(br, dir);
  const KA = join(dir, "ka.ipskeep.zip"), KB = join(dir, "kb.ipskeep.zip");
  copyFileSync(keep, KA); copyFileSync(keep, KB);
  const whole = readFileSync(keep);
  const KD = join(dir, "k0-damaged.ipskeep.zip");
  writeFileSync(KD, whole.subarray(0, Math.floor(whole.length / 2)));
  console.log(`\n=== Two keep files dropped together, and a damaged one ahead of a good one ===\n`);
  const ctx = await br.newContext(VIEW);
  try {
    const { p } = await armPage(ctx, {});
    await p.setInputFiles("#file", [KA, KB]);
    await p.waitForFunction(() => document.getElementById("welcome").hidden && !document.getElementById("busy").open, null, { timeout: 60000 }).catch(() => {});
    const t = await waitToast(p, "^Opened ", 2000);
    console.log(`          two keep files: toast ${toastSaid(t)}`);
    check("(kk) two keep files dropped together: one toast, naming the one opened and the one left", t.found && t.onTop && /^Opened “.+” — open the other 1 saved photo one at a time\.$/.test(t.text ?? ""), true);

    const q = await ctx.newPage();
    q.on("dialog", (d) => void d.accept());
    await q.goto(`${BASE}/ir.html`, { waitUntil: "load" });
    await q.setInputFiles("#file", [KD, KB]);
    const notice = await q.waitForFunction(() => document.getElementById("askDlg")?.open, null, { timeout: 30000 }).then(() => true).catch(() => false);
    const said = notice ? await q.evaluate(() => `${document.getElementById("askTitle").textContent} — ${document.getElementById("askBody").textContent}`) : "";
    if (notice) await q.click("#askOk");
    const after = await waitToast(q, "^Opened ", 1500);
    console.log(`          a damaged one first: notice ${notice ? `"${said}"` : "NONE"}; then ${after.found ? `toast "${after.text}"` : "no \"Opened\" toast"}`);
    check("(kk) a damaged first keep file is explained, and says the other was not opened", notice && /could not be opened/.test(said) && /other 1 saved photo was not opened/.test(said), true);
    check("(kk) ...and nothing then says a file opened", after.found, false);
  } finally {
    await ctx.close();
  }
}

/** A LOOK OPENED ON ITS OWN (decision 075's review). The open's card now rises
 *  before the first read, which put three things wrong with an ordinary look:
 *  one that could not be read said so inside the card closing in the same task;
 *  the look dialog, opened over the card, gave the focus back to that closed
 *  card, so it fell to the page; and with photos following, the look dialog sat
 *  above the open's card for the whole open, its Try on the photo being
 *  replaced. */
async function looksArm(br, dir) {
  const good = join(dir, "own.ipslook");
  writeFileSync(good, JSON.stringify({ f: "ips-look", v: 1, name: "Own look", look: { tone: [0, 0.25, 0.5, 0.75, 1], sat: 1.2 } }));
  const bad = join(dir, "cut.ipslook");
  writeFileSync(bad, '{"f":"ips-look","v":1,"name":"Cut short","look":{"tone":[0,0.25');
  const LONE = copies(dir, ["lk0.jpg"])[0];
  const PHOTOS = copies(dir, ["SLOWFULL-lk1.jpg", "SLOWFULL-lk2.jpg"], 1);
  console.log(`\n=== A look opened on its own: damaged, dismissed, and followed by photos ===\n`);
  const ctx = await br.newContext(VIEW);
  try {
    const { p } = await armPage(ctx, { slowFullRead: { match: "SLOWFULL", ms: 4000 } });
    await p.setInputFiles("#file", [bad]);
    const t = await waitToast(p, "couldn't be read", 2500);
    console.log(`          a damaged look, nothing else open: toast ${toastSaid(t)}`);
    check("(ll) a look opened on its own that cannot be read says so where the reader can see it", t.found && t.onTop, true);
    await p.waitForTimeout(3500);

    // TWO LOOKS, THE FIRST DAMAGED: never "Opened 1 of 2" when none opened.
    await p.setInputFiles("#file", [bad, good]);
    const two = await waitToast(p, "couldn't be read", 2500);
    const twoRecv = await p.evaluate(() => document.getElementById("lookRecvDlg").open);
    console.log(`          a damaged look and a good one dropped together: toast ${toastSaid(two)}; look dialog ${twoRecv ? "OPEN" : "not open"}`);
    check("(ll) two looks, the first damaged: one toast saying it could not be read and that the other was not opened — never \"Opened\"", two.found && two.onTop && /The other 1 look file was not opened/.test(two.text ?? "") && !/Opened/.test(two.text ?? "") && !twoRecv, true);
    await p.waitForTimeout(3500);

    await p.focus("#file");
    await p.setInputFiles("#file", [good]);
    const recv = await p.waitForFunction(() => document.getElementById("lookRecvDlg")?.open && !document.getElementById("busy").open, null, { timeout: 10000 }).then(() => true).catch(() => false);
    if (recv) await p.click("#lookRecvClose");
    await p.waitForTimeout(400);
    const focus = await p.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.tagName) : "(none)"; });
    console.log(`          a look picked from the focused Open control, then "Not now": focus on ${focus}`);
    check("(ll) the instrument held: the look was received", recv, true);
    check("(ll) ...and after \"Not now\" the focus is back on the control that opened it", focus, "file");

    await p.setInputFiles("#file", [LONE]);
    await p.waitForFunction(() => document.getElementById("welcome").hidden && !document.getElementById("busy").open, null, { timeout: 60000 });
    await p.waitForTimeout(1000);
    await p.setInputFiles("#file", [good, ...PHOTOS]);
    const both = await p.waitForFunction(() => document.getElementById("busy").open && document.getElementById("lookRecvDlg").open, null, { timeout: 10000 }).then(() => true).catch(() => false);
    await p.waitForTimeout(600);
    const top = await p.evaluate(() => { const b = document.getElementById("busy"); if (!b.open) return "(no card)"; const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return hit?.closest("dialog")?.id ?? "(page)"; });
    await p.waitForFunction(() => !document.getElementById("busy").open, null, { timeout: 60000 }).catch(() => {});
    console.log(`          a look dropped with two photos: both up ${both}; on top during the open: ${top}`);
    check("(ll) photos following a look: the open's card is on top of the look dialog while they open", both && top === "busy", true);
    if (await p.evaluate(() => document.getElementById("lookRecvDlg").open)) await p.click("#lookRecvClose").catch(() => {});

    // A DAMAGED LOOK WITH A PHOTO: its words are said once the card is down,
    // where they can be seen for their whole time — not inside the card. The
    // set above finishes storing first, or this drop is refused as a second open.
    await p.waitForFunction(() => { const t = [...document.querySelectorAll("#sessionThumbs .session-thumb")]; return t.length >= 2 && t.every((x) => !x.disabled); }, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(3500);
    await p.setInputFiles("#file", [bad, copies(dir, ["lk9.jpg"], 2)[0]]);
    // The two photos above made a session, so the drop is asked about: added.
    if (await p.waitForFunction(() => document.getElementById("askDlg")?.open, null, { timeout: 5000 }).then(() => true).catch(() => false)) await p.click("#askOk");
    await p.waitForFunction(() => document.getElementById("welcome").hidden && !document.getElementById("busy").open, null, { timeout: 60000 }).catch(() => {});
    const withPhoto = await waitToast(p, "couldn't be read", 1500);
    const cardUp = await p.evaluate(() => document.getElementById("busy").open);
    console.log(`          a damaged look dropped with a photo: once the photo is on screen, toast ${toastSaid(withPhoto)}; card ${cardUp ? "up" : "down"}`);
    check("(ll) a damaged look dropped with a photo says so where it can be seen once the card is down", withPhoto.found && withPhoto.onTop && !cardUp, true);
  } finally {
    await ctx.close();
  }

  // A LOOK AND A PHOTO WHOSE HEAD NEVER ARRIVES: the card goes back over the
  // look dialog before that photo's head is read, so its Skip can be pressed.
  // The photo is over 64 KB, so the look sniff never reads it; the keep sniff
  // does, and hangs.
  const ctx2 = await br.newContext(VIEW);
  try {
    const { p } = await armPage(ctx2, { hangSniff: "HANGBIG" });
    const big = copies(dir, ["zz-HANGBIG.jpg"], 1)[0]; // hillside.jpg, 82 KB
    await p.setInputFiles("#file", [good, big]);
    const offered = await p.waitForFunction(() => document.getElementById("busySkip")?.hidden === false, null, { timeout: 20000 }).then(() => true).catch(() => false);
    const top = await p.evaluate(() => { const b = document.getElementById("busySkip"); if (!b || b.hidden) return "(no Skip)"; const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return hit === b ? "busySkip" : hit?.closest("dialog")?.id ?? hit?.tagName ?? "(nothing)"; });
    const recv = await p.evaluate(() => document.getElementById("lookRecvDlg").open);
    console.log(`          a look with a photo whose head never arrives: look dialog ${recv ? "open" : "NOT open"}; Skip ${offered ? "offered" : "NOT offered"}; on top at the Skip: ${top}`);
    check("(ll) the instrument held: the look was received and the photo's head offered for skipping", recv && offered, true);
    check("(ll) ...and that Skip is on top, where it can be pressed, not under the look dialog", top, "busySkip");
  } finally {
    await ctx2.close();
  }
}

/** FOUR STALLED READS, WATCHED TOGETHER (decision 075's review). Each needs a
 *  read to pass its limit — a minute of visible time — so they run side by
 *  side in four contexts of the one browser, and report in order:
 *  - "wait": the FIRST file's read stalls during the wait for the last
 *    session's delete, which outlasts the limit. The offer made on the open's
 *    card must survive the open raising its card again when the wait ends, or
 *    the reader is left under a modal card with nothing to press.
 *  - "failed": the editor's build fails while the first file's read is stalled.
 *    The open has ended; no offer may rise for it afterwards.
 *  - "later": the SECOND file's read stalls after the first photo is on screen.
 *    The offer is a button in the strip beside Done, the editor is never
 *    covered by a card, and a refused open names that way out.
 *  - "lands": as "wait", but the read is only slow: it lands after the delete
 *    has ended, and the card must say the open's own words, not the freeing
 *    words the offer found there when it was made. */
async function stallArm(br, dir) {
  console.log(`\n=== Stalled reads: during the delete wait (skipped, and landing), after a failed open, and after the first photo (about 100 s, side by side) ===\n`);
  const limit = (f) => 60000 + Math.ceil(statSync(f).size / 1e6) * 1000;
  const keep = await aKeepFile(br, dir);
  const HANG = 600000;
  const lines = [];
  const say = (x) => lines.push(`          ${x}`);
  const results = [];
  const want = (name, got, w) => results.push([name, got, w]);

  const wait = async () => {
    const SESSION = copies(dir, ["sw1.jpg", "sw2.jpg", "sw3.jpg", "sw4.jpg"]);
    const SET = copies(dir, ["a-STALLHEAD.jpg", "b-sw.jpg", "c-sw.jpg"], 1);
    const ctx = await br.newContext(VIEW);
    try {
      const { p, notes } = await armPage(ctx, { slow: 20000, estimate: "none", slowFullRead: { match: "STALLHEAD", ms: HANG } });
      await sessionThenDone(p, SESSION);
      await p.setInputFiles("#file", SET);
      const t0 = Date.now();
      await p.waitForFunction(() => window.__sweep.length && window.__sweep.every((e) => e.tComplete !== null), null, { timeout: 150000 }).catch(() => {});
      await p.waitForTimeout(1500);
      const st = await p.evaluate(() => ({ open: document.getElementById("busy").open, text: document.getElementById("busyText").textContent, skip: document.getElementById("busySkip")?.hidden === false }));
      const offeredDuring = await p.evaluate(() => (window.__busyText || []).some((e) => /^Still reading a-STALLHEAD/.test(e.text)));
      say(`[wait] the delete took ${Math.round((Date.now() - t0) / 1000)} s after the pick (limit ${limit(SET[0]) / 1000} s); the offer was made during it: ${offeredDuring}; once it ended the card reads "${st.text}", Skip ${st.skip ? "SHOWING" : "GONE"}`);
      want("(mm) the instrument held: the first file's read was offered for skipping during the delete wait", offeredDuring, true);
      want("(mm) the offer survives the open raising its card again when the wait ends: Skip is still there", st.open && st.skip, true);
      if (st.skip) await p.click("#busySkip");
      const came = await p.waitForFunction(() => { const t = [...document.querySelectorAll("#sessionThumbs .session-thumb")]; return document.getElementById("welcome").hidden && t.length === 2 && t.every((x) => !x.disabled) && !document.getElementById("busy").open; }, null, { timeout: 30000 }).then(() => true).catch(() => false);
      await p.waitForTimeout(800);
      say(`[wait] after Skip the rest ${came ? "opened" : "did NOT open"}; notes: ${notesSaid(notes)}`);
      want("(mm) ...and pressing it lists the file and opens the rest", came && notes.some((m) => /couldn't be opened/.test(m) && /a-STALLHEAD/.test(m)), true);
    } finally { await ctx.close(); }
  };

  const failedOpen = async () => {
    // With a saved photo in the drop, set aside as one to open on its own: the
    // editor failing before the set's loop is a way out that must still name it.
    const SET = [...copies(dir, ["a-STALLHEAD-f.jpg", "b-f.jpg"]), keep];
    const ctx = await br.newContext(VIEW);
    try {
      await ctx.addInitScript(slowBuild, { delay: 2500, par: true, fail: true });
      await ctx.addInitScript(slowStorage, { slowFullRead: { match: "STALLHEAD", ms: HANG } });
      const p = await ctx.newPage();
      const notes = [];
      p.on("dialog", (d) => { notes.push(d.message()); void d.accept(); });
      await p.goto(`${BASE}/ir.html`, { waitUntil: "commit" });
      await p.waitForFunction(() => window.__bw && window.__bw.linkAt > 0, null, { timeout: 60000 });
      await p.setInputFiles("#welcomeFile", SET);
      const t0 = Date.now();
      await p.waitForFunction(() => document.getElementById("glBroken")?.hidden === false, null, { timeout: 60000 });
      const tFail = await p.evaluate(() => performance.now());
      await p.waitForTimeout(Math.max(0, limit(SET[0]) + 8000 - (Date.now() - t0)));
      const r = await p.evaluate((t) => ({ rose: window.__dlg.filter((d) => d.t > t && d.id === "busy" && d.op === "open").map((d) => d.text), open: document.getElementById("busy").open }), tFail);
      say(`[failed] the build failed; ${Math.round((Date.now() - t0) / 1000)} s after the pick the card has risen ${r.rose.length} time(s) since${r.rose.length ? `: ${r.rose.map((x) => `"${x}"`).join(", ")}` : ""}; up now: ${r.open}`);
      want("(nn) an open that failed before its loop leaves no read behind: no card rises for it, past the read's limit", r.rose.length === 0 && !r.open, true);
      say(`[failed] notes: ${notesSaid(notes)}`);
      want("(nn) ...and still names the saved photo the drop set aside", notes.some((m) => m.includes(basename(keep)) && /open it on its own/.test(m)), true);
    } finally { await ctx.close(); }
  };

  const later = async () => {
    const SET = copies(dir, ["a-lt.jpg", "b-STALLMID.jpg", "c-lt.jpg"], 2);
    const ctx = await br.newContext(VIEW);
    try {
      const { p, notes } = await armPage(ctx, { slowFullRead: { match: "STALLMID", ms: HANG } });
      await p.setInputFiles("#file", SET);
      await p.waitForFunction(() => document.getElementById("welcome").hidden && !document.getElementById("busy").open, null, { timeout: 60000 });
      const t1 = await p.evaluate(() => performance.now());
      const offered = await p.waitForFunction(() => document.getElementById("stripSkip")?.hidden === false, null, { timeout: limit(SET[1]) + 15000 }).then(() => true).catch(() => false);
      const r = await p.evaluate((t) => { const b = document.getElementById("stripSkip"); const rc = b?.getBoundingClientRect(); return { rose: window.__dlg.filter((d) => d.t > t && d.id === "busy" && d.op === "open").map((d) => d.text), label: b?.textContent ?? "", name: b ? b.getAttribute("aria-label") ?? b.textContent : "", w: Math.round(rc?.width ?? 0), h: Math.round(rc?.height ?? 0), meta: document.getElementById("sessionMeta").textContent, tag: b?.tagName ?? "" }; }, t1);
      say(`[later] after the first photo: the card rose ${r.rose.length} time(s)${r.rose.length ? ` (${r.rose.map((x) => `"${x}"`).join(", ")})` : ""}; strip offer ${offered ? `"${r.label}" ${r.w}x${r.h}` : "none"}; strip line "${r.meta}"`);
      want("(oo) after the first photo a stalled read never raises a card over the editor", r.rose.length, 0);
      want("(oo) ...it is offered in the strip, as a button naming the file, at least 44 px each way", offered && r.tag === "BUTTON" && /b-STALLMID\.jpg/.test(r.name) && r.w >= 44 && r.h >= 44, true);
      want("(oo) ...and the strip's status line says a file is still being read", /still reading b-STALLMID\.jpg/.test(r.meta), true);
      // A REFUSAL NAMES THE WAY OUT: the strip is hidden in full view and under
      // the Quick look, which is where a refused open can still be met.
      await p.setInputFiles("#file", copies(dir, ["d-lt.jpg"], 1));
      const ref = await waitToast(p, "^Already ", 1500);
      say(`[later] a drop meanwhile: ${toastSaid(ref)}`);
      want("(oo) ...and a refused open names that way out", ref.found && ref.onTop && /Or skip b-STALLMID\.jpg — it's beside Done\./.test(ref.text ?? ""), true);
      if (offered) await p.click("#stripSkip");
      const came = await p.waitForFunction(() => { const t = [...document.querySelectorAll("#sessionThumbs .session-thumb")]; return t.length === 2 && t.every((x) => !x.disabled) && document.getElementById("stripSkip")?.hidden !== false; }, null, { timeout: 30000 }).then(() => true).catch(() => false);
      await p.waitForTimeout(800);
      say(`[later] after Skip: the rest ${came ? "arrived" : "did NOT arrive"}; notes: ${notesSaid(notes)}`);
      want("(oo) ...and pressing it lists the file and the rest of the set arrives", came && notes.some((m) => /couldn't be opened/.test(m) && /b-STALLMID/.test(m)), true);
    } finally { await ctx.close(); }
  };

  // THE READ LANDS AFTER THE DELETE HAS ENDED, with nobody pressing Skip: the
  // card must go back to the open's own sentence, never to the freeing words
  // the offer found there when it was made.
  const lands = async () => {
    const SESSION = copies(dir, ["sl1.jpg", "sl2.jpg", "sl3.jpg", "sl4.jpg"]);
    const SET = copies(dir, ["a-SLOWHEAD.jpg", "b-sl.jpg", "c-sl.jpg"], 2);
    const ctx = await br.newContext(VIEW);
    try {
      const { p } = await armPage(ctx, { slow: 20000, estimate: "none", slowFullRead: { match: "SLOWHEAD", ms: 92000 } });
      await sessionThenDone(p, SESSION);
      await p.setInputFiles("#file", SET);
      await p.waitForFunction(() => { const t = [...document.querySelectorAll("#sessionThumbs .session-thumb")]; return document.getElementById("welcome").hidden && t.length === 3 && t.every((x) => !x.disabled) && !document.getElementById("busy").open; }, null, { timeout: 150000 }).catch(() => {});
      const r = await p.evaluate((w) => {
        const end = Math.max(...window.__sweep.map((e) => e.tComplete ?? Infinity));
        const said = window.__busyText.filter((e) => e.t > end);
        const close = window.__dlg.find((d) => d.t > end && d.id === "busy" && d.op === "close");
        const last = window.__busyText.filter((e) => e.t > end && (!close || e.t <= close.t)).pop();
        return { end, offered: window.__busyText.some((e) => e.t < end && /^Still reading a-SLOWHEAD/.test(e.text)), freeingAfter: said.filter((e) => e.text === w).length, last: last?.text ?? "" };
      }, FREEING);
      say(`[lands] offered during the delete: ${r.offered}; after the delete ended the card said the freeing words ${r.freeingAfter} time(s); its last words before it closed: "${r.last}"`);
      want("(ss) the instrument held: the first file was offered for skipping during the delete, and its read landed after", r.offered && Number.isFinite(r.end), true);
      want("(ss) once the delete has ended the card never says it is freeing space again", r.freeingAfter, 0);
      want("(ss) ...and while the first photo decodes it says the open's own words", /^Adding 3 photos/.test(r.last), true);
    } finally { await ctx.close(); }
  };

  const wrap = (f, tag) => f().catch((e) => { say(`[${tag}] threw: ${e.message.split("\n")[0]}`); want(`(${tag}) ran to the end`, false, true); });
  await Promise.all([wrap(wait, "wait"), wrap(failedOpen, "failed"), wrap(later, "later"), wrap(lands, "lands")]);
  const ORDER = ["[wait]", "[failed]", "[later]", "[lands]"];
  for (const l of lines.sort((a, b) => ORDER.findIndex((x) => a.includes(x)) - ORDER.findIndex((x) => b.includes(x)))) console.log(l);
  const TAGS = ["(mm)", "(nn)", "(oo)", "(ss)"];
  for (const [n, g, w] of results.sort((a, b) => TAGS.findIndex((x) => a[0].startsWith(x)) - TAGS.findIndex((x) => b[0].startsWith(x)))) check(n, g, w);
}

/** A WRITE THAT FAILS FOR A REASON THAT IS NOT ROOM, with later photos still to
 *  be ordered (decision 075's review). The photo is dropped at the drain, and
 *  the order it was given must not be handed out again: `nextOrder--` there
 *  gave the next photo the order of the one before it, and the two swapped on
 *  resume. Nothing else reaches that line while orders are still being given. */
async function writeFailArm(br, dir) {
  const SET = copies(dir, ["wf1.jpg", "wf2.jpg", "wf3.jpg", "wf4.jpg", "wf5.jpg", "wf6.jpg"]);
  console.log(`\n=== A write that fails for a reason other than room, early in a set of six ===\n`);
  const ctx = await br.newContext(VIEW);
  try {
    const { p, notes } = await armPage(ctx, { writeFail: "wf2" });
    await p.setInputFiles("#file", SET);
    await p.waitForFunction(() => { const t = [...document.querySelectorAll("#sessionThumbs .session-thumb")]; return document.getElementById("welcome").hidden && t.length === 5 && t.every((x) => !x.disabled) && !document.getElementById("busy").open; }, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(1500);
    const failedW = await p.evaluate(() => window.__writeFailed || 0);
    const rows = await storedRows(p);
    const orders = rows ? rows.map((r) => r.order) : [];
    console.log(`          writes failed: ${failedW}; stored: ${rows ? rows.map((r) => `${r.name}@${r.order}`).join(", ") : "(unreadable)"}; notes: ${notesSaid(notes)}`);
    check("(gg) the instrument held: one write failed for a reason other than room", failedW >= 1, true);
    check("(gg) every stored photo keeps an order of its own after a write failed with later photos still to order", rows?.length === 5 && new Set(orders).size === orders.length, true);
    check("(gg) ...and the photo whose write failed is listed as not stored, never as not opened", notes.some((m) => /couldn't be stored/.test(m) && /wf2\.jpg/.test(m)) && !notes.some((m) => /couldn't be opened/.test(m)), true);
  } finally {
    await ctx.close();
  }
}

/** A SESSION WHOSE INDEX CANNOT BE CLEARED (decision 075's review). On a full
 *  disk the clear fails at its commit, which fires `abort` and nothing else.
 *  Waited on for ever at first; then swallowed, so a new set was written into
 *  the old session's index — the two came back mixed on the next resume — and
 *  Done said the photos were "cleared from this device" when nothing had been;
 *  then refused everywhere, which also stopped a lone photo and a practice
 *  photo that store nothing. A session of two is stored, then the lever is
 *  armed, and with the clear failing:
 *  - a new set over it writes nothing, leaves it open, names what the drop
 *    set aside, says why in words that do not blame room the error does not
 *    name, and releases the guard;
 *  - Done leaves it open and says so, never "cleared";
 *  - a lone photo and a practice photo still open, leaving the old session on
 *    the device, and say so in a line;
 *  - a Keep from the Quick look that stops hands the Quick look back, its
 *    picks and rejects where they were. */
async function clearAbortArm(br, dir) {
  const keep = await aKeepFile(br, dir);
  const SET = copies(dir, ["ca1.jpg", "ca2.jpg"]);
  const NEW = copies(dir, ["ca3.jpg", "ca4.jpg"], 1);
  const LATER = copies(dir, ["ca5.jpg"], 2);
  const LONE = copies(dir, ["ca6.jpg"], 1)[0];
  const QL = copies(dir, ["cq1.jpg", "cq2.jpg", "cq3.jpg"], 2);
  const OLD = JSON.stringify(["ca1.jpg", "ca2.jpg"]);
  console.log(`\n=== The session index cannot be cleared: its commit fails ===\n`);
  const ctx = await br.newContext(VIEW);
  try {
    const { p, notes } = await armPage(ctx, { clearAbort: true });
    const stripOf = () => p.evaluate(() => ({ strip: !document.getElementById("sessionStrip").hidden, tiles: document.querySelectorAll("#sessionThumbs .session-thumb").length, busy: document.getElementById("busy").open ? document.getElementById("busyText").textContent : "", editor: document.getElementById("welcome").hidden }));
    await p.setInputFiles("#file", SET);
    await p.waitForFunction(() => { const t = [...document.querySelectorAll("#sessionThumbs .session-thumb")]; return t.length === 2 && t.every((x) => !x.disabled) && !document.getElementById("busy").open; }, null, { timeout: 60000 });
    await p.waitForTimeout(1500);
    await p.evaluate(() => { window.__clearAbort = true; });

    // A NEW SET OVER IT, with a saved photo set aside in the drop: "Start a new session".
    const n0 = notes.length;
    await p.setInputFiles("#file", [keep, ...NEW]);
    const asked = await p.waitForFunction(() => document.getElementById("askDlg")?.open, null, { timeout: 15000 }).then(() => true).catch(() => false);
    if (asked) await p.click("#askCancel");
    await p.waitForFunction(() => !document.getElementById("busy").open && !document.getElementById("askDlg")?.open, null, { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(2500);
    const afterNew = await stripOf();
    const rowsNew = await storedNames(p);
    const told = notes.slice(n0).find((m) => /could not be cleared/.test(m)) ?? "";
    const keepNamed = notes.slice(n0).some((m) => m.includes(basename(keep)) && /open it on its own/.test(m));
    await p.setInputFiles("#file", LATER);
    const refused = await waitToast(p, "^Already ", 1500);
    if (await p.evaluate(() => document.getElementById("askDlg")?.open)) await p.keyboard.press("Escape");
    await p.waitForTimeout(800);
    console.log(`          a new set started over a session whose index cannot be cleared: stored ${rowsNew ? rowsNew.join(", ") : "(unreadable)"}; on screen ${afterNew.strip ? `the strip with ${afterNew.tiles} tiles` : "no strip"}${afterNew.busy ? `, the card reading "${afterNew.busy}"` : ""}; told ${notesSaid(notes.slice(n0))}; a later open ${refused.found ? `REFUSED: "${refused.text}"` : "not refused"}`);
    check("(pp) the instrument held: the question was asked and the index's clear failed at its commit", asked && (await p.evaluate(() => window.__clearAborted || 0)) >= 1, true);
    check("(pp) a new set over a session the device will not clear writes nothing into its index", JSON.stringify(rowsNew), OLD);
    check("(pp) ...leaves that session open, and says why nothing was opened — without blaming a lack of room the error does not name", afterNew.strip && afterNew.tiles === 2 && !afterNew.busy && /nothing new was opened/.test(told) && !/space|room/i.test(told), true);
    check("(pp) ...and still names the saved photo the drop set aside", keepNamed, true);
    check("(pp) ...and releases the one-open guard: a later open is not refused", refused.found, false);

    // DONE, with the clear still failing.
    await p.waitForTimeout(3500); // any toast above fades first
    await p.click("#sessionDone");
    await p.waitForFunction(() => !document.getElementById("busy").open, null, { timeout: 30000 }).catch(() => {});
    const said = await waitToast(p, "cleared", 2000);
    const afterDone = await stripOf();
    const rowsDone = await storedNames(p);
    console.log(`          Done with the clear failing: toast ${toastSaid(said)}; ${afterDone.strip ? `the session still open, ${afterDone.tiles} tiles` : "the session GONE from screen"}; stored ${rowsDone ? rowsDone.join(", ") : "(unreadable)"}`);
    check("(pp) Done that cannot clear the session leaves it open, on screen and on the device", afterDone.strip && afterDone.tiles === 2 && JSON.stringify(rowsDone) === OLD, true);
    check("(pp) ...and says so where the reader can see it — never that it was cleared", said.found && said.onTop && /could not be cleared/.test(said.text ?? "") && !/^Session ended/.test(said.text ?? ""), true);

    // A LONE PHOTO OVER IT: it stores nothing, so it opens; the old session stays.
    await p.waitForTimeout(4500);
    const n1 = notes.length;
    await p.setInputFiles("#file", [LONE]);
    if (await p.waitForFunction(() => document.getElementById("askDlg")?.open, null, { timeout: 15000 }).then(() => true).catch(() => false)) await p.click("#askCancel");
    await p.waitForFunction(() => document.getElementById("welcome").hidden && !document.getElementById("busy").open && document.getElementById("sessionStrip").hidden, null, { timeout: 30000 }).catch(() => {});
    const loneLine = await waitToast(p, "could not be cleared", 2000);
    const afterLone = await stripOf();
    const rowsLone = await storedNames(p);
    console.log(`          a lone photo over it: ${afterLone.editor && !afterLone.strip ? "OPENED on its own" : `NOT opened (${afterLone.strip ? `${afterLone.tiles} tiles still up` : "start screen"})`}; line ${toastSaid(loneLine)}; notes ${notesSaid(notes.slice(n1))}; stored ${rowsLone ? rowsLone.join(", ") : "(unreadable)"}`);
    check("(pp) a lone photo still opens while the last session cannot be cleared — it stores nothing", afterLone.editor && !afterLone.strip && !afterLone.busy && !notes.slice(n1).some((m) => /nothing new was opened/.test(m)), true);
    check("(pp) ...leaves the old session on the device, and says so in one line", JSON.stringify(rowsLone) === OLD && loneLine.found && loneLine.onTop && /still there to resume/.test(loneLine.text ?? ""), true);

    // A PRACTICE PHOTO: the same.
    await p.waitForTimeout(4500);
    const n2 = notes.length;
    await p.click("#homeBtn");
    await p.waitForFunction(() => !document.getElementById("welcome").hidden, null, { timeout: 10000 }).catch(() => {});
    await p.click("#galleryList button.gal", { timeout: 10000 });
    await p.waitForFunction(() => document.getElementById("welcome").hidden && !document.getElementById("busy").open, null, { timeout: 60000 }).catch(() => {});
    const practiceLine = await waitToast(p, "could not be cleared", 2000);
    const afterPractice = await stripOf();
    const rowsPractice = await storedNames(p);
    console.log(`          a practice photo over it: ${afterPractice.editor ? "OPENED" : "NOT opened"}; line ${toastSaid(practiceLine)}; notes ${notesSaid(notes.slice(n2))}; stored ${rowsPractice ? rowsPractice.join(", ") : "(unreadable)"}`);
    check("(pp) a practice photo still opens while the last session cannot be cleared", afterPractice.editor && !afterPractice.busy && !notes.slice(n2).some((m) => /nothing new was opened/.test(m)), true);
    check("(pp) ...leaves the old session on the device, and says so in one line", JSON.stringify(rowsPractice) === OLD && practiceLine.found && practiceLine.onTop && /still there to resume/.test(practiceLine.text ?? ""), true);

    // A KEEP FROM THE QUICK LOOK THAT STOPS: the Quick look comes back, picks intact.
    await p.waitForTimeout(4500);
    const n3 = notes.length;
    await openQuick(p, QL);
    await p.click("#qlGrid .ql-cell:nth-child(1) .ql-tile");
    await p.click("#qlGrid .ql-cell:nth-child(2) .ql-tile");
    await p.click("#qlGrid .ql-cell:nth-child(3) .ql-x");
    const marksOf = () => p.evaluate(() => ({ open: document.getElementById("quickLook").open, picked: document.querySelectorAll("#qlGrid .ql-cell.picked").length, rejected: document.querySelectorAll("#qlGrid .ql-cell.rejected").length, cells: document.querySelectorAll("#qlGrid .ql-cell").length }));
    const before = await marksOf();
    await p.click("#qlKeep");
    if (await p.waitForFunction(() => document.getElementById("askDlg")?.open, null, { timeout: 5000 }).then(() => true).catch(() => false)) await p.click("#askCancel");
    await p.waitForFunction(() => !document.getElementById("busy").open && document.getElementById("quickLook").open, null, { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(800);
    const back = await marksOf();
    const rowsQl = await storedNames(p);
    console.log(`          a Keep of 2 picks from the Quick look: before ${before.picked} picked, ${before.rejected} rejected; after ${back.open ? `the Quick look BACK, ${back.cells} cells, ${back.picked} picked, ${back.rejected} rejected` : "the Quick look GONE"}; notes ${notesSaid(notes.slice(n3))}; stored ${rowsQl ? rowsQl.join(", ") : "(unreadable)"}`);
    check("(pp) the instrument held: two picks and a reject were made, and the Keep was stopped by the clear", before.picked === 2 && before.rejected === 1 && notes.slice(n3).some((m) => /nothing new was opened/.test(m)), true);
    check("(pp) a Keep that stops before the set begins hands the Quick look back, every pick and reject where it was", back.open && back.cells === 3 && back.picked === 2 && back.rejected === 1 && JSON.stringify(rowsQl) === OLD, true);
  } finally {
    await ctx.close();
  }
}

/** THIS DEVICE'S STORAGE CANNOT BE REACHED AT ALL (decision 075's review) —
 *  WebKit's lost connection after the page sat in the background. There is
 *  nothing stored this page can clear or mix into, so a lone photo and a
 *  practice photo open as they always did, with no word about a session or
 *  about room: the refusal a failed clear earns was said here, falsely. */
async function unreachArm(br, dir) {
  const LONE = copies(dir, ["ur1.jpg"])[0];
  console.log(`\n=== This device's storage cannot be reached at all ===\n`);
  const ctx = await br.newContext(VIEW);
  try {
    const { p, notes } = await armPage(ctx, { openFail: true });
    await p.evaluate(() => { window.__openFail = true; });
    const toasts = () => p.evaluate(() => [...document.querySelectorAll("div[role=status]")].filter((d) => !d.id && d.style.opacity === "1").map((d) => d.textContent).join(" | "));
    await p.setInputFiles("#file", [LONE]);
    await p.waitForFunction(() => document.getElementById("welcome").hidden && !document.getElementById("busy").open, null, { timeout: 30000 }).catch(() => {});
    const lone = await p.evaluate(() => document.getElementById("welcome").hidden);
    const loneSaid = await toasts();
    await p.waitForTimeout(4500);
    // Home only when the lone photo opened: refused, it left the start screen up.
    if (await p.evaluate(() => document.getElementById("welcome").hidden)) await p.click("#homeBtn");
    await p.waitForFunction(() => !document.getElementById("welcome").hidden, null, { timeout: 10000 }).catch(() => {});
    await p.evaluate(() => { window.__practiceStart = performance.now(); });
    await p.click("#galleryList button.gal", { timeout: 10000 });
    await p.waitForFunction(() => window.__dlg.some((d) => d.id === "busy" && d.op === "close" && d.t > window.__practiceStart), null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(500);
    const practice = await p.evaluate(() => document.getElementById("welcome").hidden);
    const practiceSaid = await toasts();
    const failed = await p.evaluate(() => window.__openFailed || 0);
    const falseWords = [...notes, loneSaid, practiceSaid].filter((m) => /could not be cleared|still there|space|room/i.test(m));
    console.log(`          storage opens refused: ${failed}; a lone photo ${lone ? "OPENED" : "NOT opened"}; a practice photo ${practice ? "OPENED" : "NOT opened"}; notes ${notesSaid(notes)}; toasts "${loneSaid}" / "${practiceSaid}"`);
    check("(tt) the instrument held: opening the session's storage failed", failed >= 1, true);
    check("(tt) with storage unreachable a lone photo opens, as it always did", lone, true);
    check("(tt) ...and so does a practice photo", practice, true);
    check("(tt) ...and nothing speaks of a session still there, or of room", falseWords.length, 0);
  } finally {
    await ctx.close();
  }
}

/** A SET ENDS UNDER ANOTHER FLOW'S CARD (decision 075's review). After the
 *  first photo the set's card is down and the rest are still being stored; a
 *  batch started meanwhile finishes and offers its Save on its own card. When
 *  the set's last write lands, that card must still be up: the set's end closed
 *  whatever card was showing, and the batch's Save went with it. */
async function batchEndArm(br, dir) {
  const SET = copies(dir, ["be1.jpg", "be2.jpg", "be3.jpg"]);
  const BATCH = copies(dir, ["bb1.jpg"], 1);
  console.log(`\n=== A batch's finished card up when a set finishes storing ===\n`);
  const ctx = await br.newContext(VIEW);
  try {
    const { p } = await armPage(ctx, { holdWrites: 10000 });
    await p.setInputFiles("#file", SET);
    await p.waitForFunction(() => document.getElementById("welcome").hidden && !document.getElementById("busy").open, null, { timeout: 60000 });
    await p.click("#batchBtn");
    await p.waitForFunction(() => document.getElementById("batchDlg")?.hasAttribute("open"), null, { timeout: 30000 });
    await p.click("#bcAuto");
    await p.setInputFiles("#batchFiles", BATCH);
    const ready = await p.waitForFunction(() => document.getElementById("busy").open && document.getElementById("busySave")?.hidden === false && document.getElementById("busyActions")?.hidden === false, null, { timeout: 25000 }).then(() => true).catch(() => false);
    const storingThen = await p.evaluate(() => [...document.querySelectorAll("#sessionThumbs .session-thumb")].some((x) => x.disabled));
    await p.waitForFunction(() => { const t = [...document.querySelectorAll("#sessionThumbs .session-thumb")]; return t.length === 3 && t.every((x) => !x.disabled); }, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(1500);
    const st = await p.evaluate(() => ({ open: document.getElementById("busy").open, save: document.getElementById("busySave")?.hidden === false, text: document.getElementById("busyText").textContent }));
    console.log(`          the batch's card with Save ${ready ? "up" : "NEVER up"} while the set was ${storingThen ? "still being stored" : "ALREADY STORED (the instrument missed)"}; after the set's last write: card ${st.open ? `up, "${st.text}", Save ${st.save ? "showing" : "gone"}` : "CLOSED"}`);
    check("(qq) the instrument held: the batch finished while the set was still being stored", ready && storingThen, true);
    check("(qq) a set finishing leaves another flow's card alone: the batch's Save is still there", st.open && st.save, true);
  } finally {
    await ctx.close();
  }
}

/** A LOOK DROPPED WHILE A BATCH IS PROCESSING (decision 075's review). A batch
 *  holds no open guard, and a drop reaches the open through its modal card;
 *  the open took that card over and closed it, and the batch ran on with no
 *  Stop and finished with its Save in a closed dialog. The drop must be refused
 *  and the batch's card left exactly as it was. */
async function batchLookArm(br, dir) {
  const BATCH = copies(dir, ["bl1.jpg", "bl2.jpg", "bl3.jpg", "bl4.jpg", "bl5.jpg", "bl6.jpg", "bl7.jpg", "bl8.jpg"]);
  const look = join(dir, "batch.ipslook");
  writeFileSync(look, JSON.stringify({ f: "ips-look", v: 1, name: "Batch look", look: { tone: [0, 0.25, 0.5, 0.75, 1], sat: 1.2 } }));
  console.log(`\n=== A look dropped while a batch is processing ===\n`);
  const ctx = await br.newContext(VIEW);
  try {
    const { p } = await armPage(ctx, {});
    await p.click("#batchBtn");
    await p.waitForFunction(() => document.getElementById("batchDlg")?.hasAttribute("open"), null, { timeout: 30000 });
    await p.click("#bcAuto");
    await p.setInputFiles("#batchFiles", BATCH);
    const running = await p.waitForFunction(() => document.getElementById("busy").open && /^Processing \d+ \/ 8/.test(document.getElementById("busyText").textContent ?? "") && document.getElementById("busyStop")?.hidden === false, null, { timeout: 30000, polling: 20 }).then(() => true).catch(() => false);
    const t0 = await p.evaluate(() => performance.now());
    await p.setInputFiles("#file", [look]);
    const told = await waitToast(p, "^Wait for what is running to finish\\.$", 1500);
    await p.waitForTimeout(600);
    const mid = await p.evaluate((t) => ({ open: document.getElementById("busy").open, stop: document.getElementById("busyStop")?.hidden === false, text: document.getElementById("busyText").textContent, processing: /^Processing/.test(document.getElementById("busyText").textContent ?? ""), closed: window.__dlg.some((d) => d.t >= t && d.id === "busy" && d.op === "close"), recv: document.getElementById("lookRecvDlg").open }), t0);
    const ready = await p.waitForFunction(() => document.getElementById("busy").open && document.getElementById("busySave")?.hidden === false && document.getElementById("busyActions")?.hidden === false, null, { timeout: 90000 }).then(() => true).catch(() => false);
    console.log(`          dropped during "Processing": told ${toastSaid(told)}; card ${mid.open ? `up, "${mid.text}"` : "CLOSED"}${mid.closed ? " (it was closed and raised again)" : ""}; Stop ${mid.stop ? "showing" : "GONE"}; look dialog ${mid.recv ? "OPENED" : "not opened"}; at the end, Save ${ready ? "showing" : "NEVER shown"}`);
    check("(rr) the instrument held: the batch was processing when the look was dropped", running, true);
    check("(rr) a look dropped during a batch is refused in words, on the batch's card: wait for what is running", told.found && told.onTop && told.host === "busy", true);
    check("(rr) ...and leaves the batch's card alone: still up, still processing, Stop still there, nothing opened", mid.open && mid.processing && mid.stop && !mid.closed && !mid.recv, true);
    check("(rr) ...and the batch ends on its own card, with its Save", ready, true);

    // DROPPED ON THE FINISHED CARD: nothing is running — the card waits on Save.
    await p.waitForTimeout(3500);
    const t1 = await p.evaluate(() => performance.now());
    await p.setInputFiles("#file", [look]);
    const toldDone = await waitToast(p, ".", 1500);
    await p.waitForTimeout(600);
    const end = await p.evaluate((t) => ({ open: document.getElementById("busy").open, save: document.getElementById("busySave")?.hidden === false, closed: window.__dlg.some((d) => d.t >= t && d.id === "busy" && d.op === "close"), recv: document.getElementById("lookRecvDlg").open }), t1);
    console.log(`          dropped on the finished batch's card: told ${toastSaid(toldDone)}; card ${end.open ? "up" : "CLOSED"}, Save ${end.save ? "showing" : "GONE"}`);
    check("(rr) a drop on a finished batch's card is told to save the batch or close it — never to wait, when nothing is running", toldDone.found && toldDone.onTop && toldDone.text === "Save the batch first, or close it.", true);
    check("(rr) ...and that card, its Save and nothing else change", end.open && end.save && !end.closed && !end.recv, true);
  } finally {
    await ctx.close();
  }
}

const ARMS = {
  file: fileArm,
  sweep: async (br, dir) => { await sweepArm(br, dir, "spare"); await sweepArm(br, dir, "short"); },
  practice: practiceArm,
  quota: async (br, dir) => { await quotaArm(br, dir, "abort"); await quotaArm(br, dir, "request"); await quotaArm(br, dir, "full"); },
  late: lateArm, orders: ordersArm, full: fullArm, busy: busyArm, stack: stackArm, margin: marginArm,
  lookrace: lookRaceArm, keepsniff: keepSniffArm,
  hang: async (br, dir) => { await hangArm(br, dir, "visible"); await hangArm(br, dir, "hidden"); await hangArm(br, dir, "frozen"); },
  slowread: slowReadArm, resume: resumeArm, persist: persistArm,
  mixed: mixedArm, keeps: keepsArm, looks: looksArm, stall: stallArm, writefail: writeFailArm,
  clearabort: clearAbortArm, unreach: unreachArm, batchend: batchEndArm, batchlook: batchLookArm,
};
for (const a of ONLY) if (!ARMS[a]) { console.log(`no arm called "${a}" — the arms are ${Object.keys(ARMS).join(", ")}`); process.exit(2); }
const dir = mkdtempSync(join(tmpdir(), "keep-walk-"));
const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
try {
  for (const a of Object.keys(ARMS)) if (want(a)) await ARMS[a](br, dir);
} finally {
  await br.close();
  rmSync(dir, { recursive: true, force: true });
}
console.log(failed ? `\n  ${failed} check(s) failed\n` : `\n  all checks passed (${ONLY.join(", ")})\n`);
process.exit(failed ? 1 : 0);
