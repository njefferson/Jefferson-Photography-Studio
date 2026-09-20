#!/usr/bin/env node
// THE TWO WAITS ON THE QUICK LOOK PATH, MEASURED ON THE APP ITSELF.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/quicklook-speed-walk.mjs [--port=8131] [--files=8] [--plant]
//
// WHY IT EXISTS (decision 033). Two delays were reported from the device — a
// long wait before any thumbnail appears on the pick/reject sheet, and a long
// wait after Keep before the editor arrives — and nothing in the app could say
// which of the five stages behind the first, or the four behind the second,
// owned the seconds. This drives the real grid with real practice raws and
// reads the app's own instrumentation back out of the §7f diagnostic.
//
// IT ASSERTS SHAPE, NOT WALL CLOCK. A container draws through a software
// rasteriser and decodes a raw several times faster than the tablet does
// (decision 008 measured 43 ms here against 180 on an 8-core iPad), so an
// absolute threshold measured here would be a threshold about this machine.
// What DOES carry across is the shape: whether anything is on screen before a
// decode has finished, whether more than one decode is in flight, and whether
// the keep decodes a file the grid already decoded. Those are true or false
// on any device.
//
// THE DECODE COUNT IS TAKEN AT THE WORKER DOOR, not from the tiles. Decision
// 008's own Rejected section records why: without an in-flight guard two lanes
// take the same photo and both write the same correct tile, so a grid that
// looks perfect can be decoding everything three times. `postMessage` is
// patched before the app boots and every job that reaches a decoder is counted
// by file name.
//
// THE CHECKS ARE RATIOS AND COUNTS, chosen so each is true or false on any
// machine. "Tiles are up front" is the grid's own child count at the instant
// the first decode is handed to a worker. "The lanes are full" is the SUM of
// the awaited decode durations against the run's wall clock: a strictly serial
// loop can never sum to more than its own total, and overlapping decodes
// always do. Neither needs a threshold in milliseconds.
//
// --plant makes the shape checks read the WRONG source — the tile count after
// the run in place of the count at the first decode, the whole-run total in
// place of the time to the first picture (in BOTH passes), a tile read as
// carrying no camera picture, and the refused decode read as not refused.
// FOUR checks must go red, and that number was verified by running it rather
// than by counting the `PLANT ?` expressions — the comment here said three and
// the plant produced two, which is the same defect one level up: a claim about
// an instrument that nobody ran the instrument to check.
import { chromium } from "playwright-core";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split("=").slice(1).join("=");
const PORT = arg("port", "8131");
const N = Number(arg("files", "8"));
const PLANT = process.argv.includes("--plant");
const OUT = "/tmp/quicklook-speed";
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "ok  " : "FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) failed++; };
const settle = async (p) => { await p.waitForTimeout(400); await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); };

const files = readdirSync("public/examples").filter((f) => f.endsWith(".dng")).sort().slice(0, N)
  .map((f) => join("public/examples", f));
if (files.length < 2) { console.log("FAIL  not enough practice raws"); process.exit(1); }

/** A TIFF THAT CARRIES A CAMERA PREVIEW, because none of the 44 practice DNGs
 *  does — measured, 0 preview bytes in all eight of the first of them. They are
 *  converted files with their previews stripped, so a run against them can
 *  never exercise the path that puts the camera's own picture in a tile, and
 *  shipping that path on the strength of "it works for the strip" is exactly
 *  the shape of an unmeasured surface.
 *
 *  The minimum `pickLargestPreview` accepts, read out of its own source: an
 *  IFD carrying 256/257 for the area it sorts on and 513/514 pointing at bytes
 *  that begin ff d8. The payload is a real JPEG from tools/fixtures, so the
 *  browser can actually draw it. Nothing here is a raw image, so the decode
 *  that follows fails — which is itself worth asserting: a tile that has the
 *  camera's picture must NOT fall back to the broken-file placeholder. */
function previewTiff(jpeg) {
  const IFD = 8, ENTRIES = 4;
  const jpegAt = IFD + 2 + ENTRIES * 12 + 4;
  const buf = new Uint8Array(jpegAt + jpeg.length);
  const dv = new DataView(buf.buffer);
  buf.set([0x49, 0x49, 0x2a, 0x00], 0);          // "II*\0"
  dv.setUint32(4, IFD, true);
  dv.setUint16(IFD, ENTRIES, true);
  let at = IFD + 2;
  const entry = (tag, type, count, value) => {
    dv.setUint16(at, tag, true); dv.setUint16(at + 2, type, true);
    dv.setUint32(at + 4, count, true); dv.setUint32(at + 8, value, true);
    at += 12;
  };
  entry(256, 4, 1, 1200);            // ImageWidth
  entry(257, 4, 1, 800);             // ImageLength
  entry(513, 4, 1, jpegAt);          // JPEGInterchangeFormat
  entry(514, 4, 1, jpeg.length);     // JPEGInterchangeFormatLength
  dv.setUint32(at, 0, true);         // no next IFD
  buf.set(jpeg, jpegAt);
  return buf;
}
const jpegBytes = new Uint8Array(readFileSync("tools/fixtures/camera-ir-a.jpg"));
const fixtures = ["a", "b", "fail"].map((k) => {
  const path = join(OUT, `preview-${k}.dng`);
  writeFileSync(path, previewTiff(jpegBytes));
  return path;
});
// THE THIRD ONE'S DECODE IS BROKEN ON PURPOSE, in the walk rather than in the
// file, and this is the correction of an assumption that stood for as long as
// this walk has existed. The builder's own comment said "nothing here is a raw
// image, so the decode that follows fails" — it does not. Measured 2026-09-20:
// both fixtures finish with a real picture, `provisional` false and no
// placeholder, because the app is content to use the embedded JPEG as the
// photograph. So the check that a failed decode keeps the camera's picture was
// green in every run it has ever made WITHOUT A SINGLE DECODE HAVING FAILED.
// The app's rule is that a tile becomes the broken-file placeholder only when
// it has no picture at all; reaching that branch needs a decode that throws
// while a preview is already in the tile, and no file content produces it.
const FAIL_NAME = "preview-fail.dng";

/** One line out of the §7f diagnostic, by its key. The report is the app's own
 *  instrument; reading it here rather than reaching into module state is what
 *  keeps the walk measuring the thing the reader would paste. */
const diagLine = async (p, key) => {
  await p.click("#verTag");
  await p.waitForSelector("#verDlgText", { state: "attached", timeout: 30000 });
  await p.waitForFunction(() => (document.getElementById("verDlgText")?.value ?? "").includes("Last quick look"), null, { timeout: 60000 });
  const text = await p.inputValue("#verDlgText");
  await p.evaluate(() => document.querySelector("dialog[open]")?.close());
  await settle(p);
  const row = text.split("\n").find((l) => l.startsWith(key));
  return row ? row.slice(key.length).trim() : "";
};
// "336 ms" and "2.5s" both appear in the line. Test for the MILLISECOND unit
// first: " ms" contains an "s", so a seconds-test that runs first reads every
// millisecond figure as a thousand times itself — which is what the first
// version of this parser did, turning 336 ms into 336000 and passing a check
// it should have failed.
const num = (s, re) => { const m = s.match(re); if (!m) return NaN; return /ms/.test(m[1]) ? parseFloat(m[1]) : parseFloat(m[1]) * 1000; };
const t = (s, label) => num(s, new RegExp(`${label} (\\d+(?:\\.\\d+)? ?m?s)`));

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  p.on("dialog", (d) => d.accept());
  // COUNTED AT THE DOOR, before the app boots, so nothing it does can be missed.
  await p.addInitScript((failName) => {
    window.__decodes = [];
    window.__failed = 0;
    const mp = Worker.prototype.postMessage;
    // ONE FILE'S DECODE THROWS, through the app's own error channel. The job is
    // never forwarded; the worker's own `onmessage` is called with the shape
    // the decode client reports a failure in, so the app takes the path it
    // takes for a corrupt file rather than one the walk invented.
    Worker.prototype.postMessage = function (msg, ...rest) {
      if (msg && msg.file && msg.file.name === failName && typeof msg.id !== "undefined") {
        window.__failed++;
        setTimeout(() => this.onmessage?.({ data: { id: msg.id, error: "planted decode failure" } }), 0);
        return;
      }
      return mp.call(this, msg, ...rest);
    };
    const counted = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (msg, ...rest) {
      const n = msg && msg.file && msg.file.name;
      if (n) {
        if (window.__cellsAtFirstDecode < 0) {
          window.__cellsAtFirstDecode = document.getElementById("qlGrid")?.children.length ?? 0;
        }
        window.__decodes.push(n);
      }
      return counted.call(this, msg, ...rest);
    };
    // HOW MUCH OF THE GRID WAS DRAWN WHEN THE FIRST DECODE STARTED. This is
    // the whole of "every tile up front", and it is a count rather than a
    // clock, so it means the same thing on a tablet and in a container.
    window.__cellsAtFirstDecode = -1;
  }, FAIL_NAME);
  await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
  await p.waitForSelector("#quickFiles", { state: "attached", timeout: 60000 });

  // --- the camera's own picture ---------------------------------------------
  // Run first and on its own, so it cannot move the measurement below.
  // CAUGHT WHILE IT IS TRUE, not after the run. The provisional state is by
  // design a state the tile LEAVES: the app's own render replaces the camera's
  // picture as soon as it exists. A first version of this check read the cell
  // after the run finished and found a finished tile, which is the feature
  // working, and called it a failure.
  await p.setInputFiles("#quickFiles", fixtures);
  await p.waitForFunction(() => !!document.querySelector("#qlGrid .ql-cell.provisional"), null, { timeout: 120000 })
    .catch(() => {});
  const prov = await p.evaluate(() => {
    const cell = document.querySelector("#qlGrid .ql-cell.provisional") ?? document.querySelector("#qlGrid .ql-cell");
    const badge = cell?.querySelector(".ql-prov");
    const img = cell?.querySelector(".ql-tile img");
    return {
      provisional: !!cell?.classList.contains("provisional"),
      badge: badge && !badge.hidden ? (badge.textContent ?? "") : "",
      hasImage: !!img && !!img.getAttribute("src"),
      bad: !!cell?.querySelector(".ql-bad-mark"),
      title: cell?.querySelector(".ql-tile")?.getAttribute("title") ?? "",
    };
  });
  await p.screenshot({ path: join(OUT, "0-camera-preview.png") });
  check("the camera's own picture goes in the tile", PLANT ? false : prov.hasImage && prov.provisional,
    `image ${prov.hasImage ? "yes" : "NO"}, marked provisional ${prov.provisional ? "yes" : "NO"}`);
  // TEXT, NEVER THE DIMMING ALONE — the accessibility mandate, and the reason
  // the strip's own badge exists.
  check("and the tile says in words whose picture it is", prov.badge.trim() === "Preview" && /camera/i.test(prov.title),
    `badge "${prov.badge.trim()}", title "${prov.title}"`);

  // AFTER THE RUN, NOT DURING IT. The snapshot above is taken the moment the
  // tile turns provisional, which is BEFORE the decode it is waiting on has had
  // a chance to fail — so reading `bad` from it asked whether a decode that had
  // not finished had already gone wrong, and the answer was no every time, for
  // any build. These fixtures are a preview wrapped in a stub: the decode is
  // MEANT to fail, and the claim is that the camera's picture survives it.
  await p.waitForFunction(() => !document.getElementById("qlGrid")?.dataset.busy, null, { timeout: 120000 });
  const after = await p.evaluate(() => {
    const cells = [...document.querySelectorAll("#qlGrid .ql-cell")];
    return cells.map((c) => ({
      name: c.querySelector(".ql-tile")?.getAttribute("title")?.split(" — ")[0] ?? "",
      hasImage: !!c.querySelector(".ql-tile img")?.getAttribute("src"),
      bad: !!c.querySelector(".ql-bad-mark"),
      provisional: c.classList.contains("provisional"),
    }));
  });
  const refused = await p.evaluate(() => window.__failed ?? 0);
  const failTile = after.find((c) => c.name === "preview-fail.dng");
  check("one decode really was refused", PLANT ? false : refused > 0,
    `${refused} decode job(s) answered with an error`);
  // THE CLAIM, AND IT IS NOT THE ONE THIS CHECK USED TO MAKE. The app marks a
  // tile as the broken-file placeholder only when it has NO picture at all, so
  // a file whose preview landed before its decode failed must keep that picture
  // and stay marked Preview — never fall back. Reading the `bad` mark was the
  // wrong test twice over: it was read from a snapshot taken before the decode
  // had had time to fail, and no decode was failing in the first place.
  check("a failed decode does not take the camera's picture away",
    !!failTile && failTile.hasImage && !failTile.bad && failTile.provisional,
    failTile
      ? `picture ${failTile.hasImage ? "kept" : "LOST"}, placeholder ${failTile.bad ? "SHOWN" : "not shown"}, still marked Preview ${failTile.provisional ? "yes" : "NO"}`
      : "the planted file is not in the grid");
  check("and the files that decoded fine finished",
    after.filter((c) => c.name !== "preview-fail.dng").every((c) => c.hasImage && !c.bad && !c.provisional),
    `${after.length - 1} of ${after.length} tile(s) reached a rendered picture`);

  // THE HEADLINE CLAIM, MEASURED HERE AND NOWHERE ELSE. It is that a picture
  // reaches the screen in less than one decode, and the main pass below CANNOT
  // measure it: the practice corpus carries no embedded preview, so its first
  // picture is a full render by definition. That pass used to print a sentence
  // saying so and move on, which left the walk's own headline unmeasured in
  // every run it has ever made. These fixtures DO carry one, so it is measured
  // on the only files that can carry it.
  // THE GRID HAS TO GO FIRST: the version tag that opens the report sits behind
  // this modal dialog, and a click on it is swallowed. Nothing is lost here —
  // the fixture pass makes no picks, which is exactly why the main pass below
  // cannot do the same and reads its lines after its own keep.
  await p.evaluate(() => document.getElementById("qlClose")?.click());
  await settle(p);
  const fx = await diagLine(p, "Last quick look");
  console.log(`\n  fixture pass     ${fx}\n`);
  const fxPreviewed = Number((fx.match(/, (\d+) showed the camera's own picture/) ?? [])[1] ?? 0);
  const fxFirstPic = PLANT ? t(fx, "in") : t(fx, "first picture");
  const fxDecode = t(fx, "decode");
  if (fxPreviewed === 0) {
    check("a picture is on screen in less than one decode", false,
      "the fixtures reported no camera picture — the one pass that can measure this did not");
  } else {
    check("a picture is on screen in less than one decode", fxFirstPic > 0 && fxFirstPic < fxDecode,
      `first picture ${Math.round(fxFirstPic)} ms against ${Math.round(fxDecode)} ms of decoding` +
      ` (${fxPreviewed} of ${fixtures.length} showed the camera's picture)`);
  }
  await settle(p);

  // --- the grid -------------------------------------------------------------
  await p.evaluate(() => { window.__cellsAtFirstDecode = -1; window.__decodes = []; });
  await p.setInputFiles("#quickFiles", files);
  // A tile before the whole run finishes is the point; wait for the first one
  // by polling synchronous DOM state, never a Promise predicate.
  await p.waitForFunction(() => (document.getElementById("qlGrid")?.children.length ?? 0) > 0, null, { timeout: 300000 });
  // THE GRID IS FULL OF CELLS IMMEDIATELY NOW, so a cell count is no longer a
  // finished run — the first version of this wait used one and pressed Keep
  // with three of eight files read. The app's own header is the signal: it
  // carries "Reading n / N…" while the run is going and the plain counts when
  // it is done.
  await p.waitForFunction(() => !document.getElementById("qlGrid")?.dataset.busy, null, { timeout: 900000 });
  await settle(p);
  const gridDecodes = await p.evaluate(() => window.__decodes.slice());
  const cellsAtFirstDecode = await p.evaluate(() => window.__cellsAtFirstDecode);
  await p.screenshot({ path: join(OUT, "1-grid.png") });

  // --- the keep -------------------------------------------------------------
  const beforeKeep = await p.evaluate(() => window.__decodes.length);
  await p.click("#qlKeep");
  // The editor arriving IS the thing being timed; poll the spinner going away.
  await p.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 600000 });
  await settle(p);
  await p.screenshot({ path: join(OUT, "2-editor.png") });
  const keepDecodes = await p.evaluate((n) => window.__decodes.slice(n), beforeKeep);

  // BOTH LINES READ HERE, after the grid's modal dialog has gone: the version
  // tag that opens the report sits behind it, and the grid's profile is module
  // state that survives the close. Reading it before the keep would mean
  // closing the grid, which throws away the picks the keep is about.
  const ql = await diagLine(p, "Last quick look");
  const kp = await diagLine(p, "Last keep");
  console.log(`\n  Last quick look  ${ql}`);
  console.log(`  Last keep        ${kp}\n`);
  const total = t(ql, "in");
  const firstTile = t(ql, "first tile");
  const firstPicture = PLANT ? total : t(ql, "first picture");
  const decodeSum = t(ql, "decode");
  const reused = Number((ql.match(/; (\d+) of \d+ came back already rendered/) ?? [])[1] ?? 0);

  // EVERY TILE UP FRONT: the grid is already drawn when the first decode is
  // handed to a worker. A count, not a clock.
  const cells = PLANT ? 0 : cellsAtFirstDecode;
  check("the whole set is on screen before the first decode starts", cells >= files.length,
    `${cells} of ${files.length} cells drawn when the first file went to a decoder` +
    ` (first tile at ${Math.round(firstTile)} ms of a ${Math.round(total)} ms run)`);

  // A PICTURE FASTER THAN A DECODE, where the files carry one. The practice
  // corpus does not, which the app's own line now reports rather than leaving
  // it to be inferred; the fixture pass above is what measures the path.
  const previewed = Number((ql.match(/, (\d+) showed the camera's own picture/) ?? [])[1] ?? 0);
  const rendered = Math.max(1, files.length - reused);
  const perDecode = decodeSum / rendered;
  if (previewed === 0) {
    console.log(`      a picture is on screen in less than one decode — NOT MEASURED HERE:` +
      ` none of these ${files.length} practice files carries an embedded preview,` +
      ` so the first picture waited for a full render (${Math.round(firstPicture)} ms).` +
      ` The fixture pass above measures that path.`);
  } else {
    check("a picture is on screen in less than one decode", firstPicture < perDecode,
      `first picture ${Math.round(firstPicture)} ms against ${Math.round(perDecode)} ms per decode` +
      ` (${previewed} showed the camera's picture, ${rendered} decoded, ${reused} reused)`);
  }

  // THE LANES ARE FULL. Overlapping decodes sum to more than the wall clock
  // they ran in; a strictly serial loop never can.
  // THE LANES ARE FULL. The per-file stages are awaited one after another
  // INSIDE each file, so a strictly serial run can never sum to more than its
  // own wall clock; overlapping files always do. A first version compared the
  // decode stage alone against the total and called a 2.7x overlap serial,
  // because the total also contains every other stage.
  const stageSum = t(ql, "store lookup") + t(ql, "reading") + decodeSum + t(ql, "rendering");
  check("the decode lanes are kept full", stageSum > total * 1.2,
    `${Math.round(stageSum)} ms of per-file work inside a ${Math.round(total)} ms run` +
    ` — ${(stageSum / total).toFixed(1)}x overlap`);

  const dupes = gridDecodes.filter((n, i) => gridDecodes.indexOf(n) !== i);
  check("no file is decoded twice inside the grid", dupes.length === 0,
    `${gridDecodes.length} decode(s) for ${files.length} files${dupes.length ? `; repeated: ${[...new Set(dupes)].join(", ")}` : ""}`);


  check("the keep reports its stages", /kept in/.test(kp), kp || "(nothing)");
  const carried = Number((kp.match(/(\d+) of \d+ arrived with a picture/) ?? [])[1] ?? -1);
  check("every kept photo arrives with a picture already rendered", carried === files.length,
    `${carried} of ${files.length}`);
  // ONE DECODE, FOR THE ONE PHOTOGRAPH BEING SHOWN. Decision 033 rejected
  // carrying the grid's decode across: holding a full decoded frame for the
  // length of a browsing session to save a stage measured at 119 ms of a
  // 462 ms keep is spending a memory ceiling on something that was never the
  // wait. What the keep must not do is decode the REST of the set to get one
  // photograph on screen, which is the failure this counts.
  check("the keep decodes only the photograph it shows", keepDecodes.length <= 1,
    `${keepDecodes.length} decode(s) after Keep for ${files.length} kept photographs`);
  // The head start overlaps the first file's read and decode with the previous
  // session's delete. That delete is what scales with the set being replaced,
  // and in a fresh container there is nothing to delete — so the gain is zero
  // here by construction and the device's own report is where it shows.
  const sweep = t(kp, "waiting on its delete");
  if (!(sweep > 20)) {
    console.log(`      the read and decode overlap the previous session's delete — NOT MEASURED HERE:` +
      ` the delete took ${Math.round(sweep)} ms in this container, so there was nothing to overlap.`);
  }

  await ctx.close();
} finally { await b.close(); }
console.log(failed ? `\n${failed} failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
