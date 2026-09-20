#!/usr/bin/env node
// A TIFF EXPORT USES EVERY CORE, AND PRODUCES THE SAME FILE EITHER WAY.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/tiff-threads-walk.mjs [--port=8131] [--plant]
//
// WHY IT EXISTS (decision 036). A TIFF export ran on one core while eight
// workers sat idle, because `canRunParallel` refused any format that was not
// JPEG. What made that refusal survive is that `BandResult` DECLARED a 16-bit
// band and nothing anywhere produced one — a type with no code behind it, which
// reads exactly like a finished feature.
//
// THE CHECK THAT MATTERS IS NOT THE CLOCK, IT IS THE BYTES. Splitting a render
// across workers is worth nothing if the seams differ, and a seam is invisible
// at a glance: the two halves of a photograph are both plausible photographs.
// So the same frame is exported twice — once across cores, once forced down the
// single-threaded loop — and the files are compared BYTE FOR BYTE. IR-SCIENCE
// section 9l-ii is why it is the exported file and never the screen: a stage
// corrupted every TIFF export once while the preview looked correct.
//
// HOW THE SINGLE-THREADED RUN IS FORCED: `Worker` is wrapped so that only the
// EXPORT worker's construction throws. The decode workers are untouched, so the
// two runs differ in one thing. Making `Worker` undefined outright would also
// move the decode onto the main thread, and a byte difference could then have
// come from either end.
//
// NATIVE SIZE, deliberately: the pool does not engage below two megapixels and
// the app offers no scale between 25% and full, so a smaller export would
// measure the single-threaded path twice and pass.
//
// --plant lets the "single-threaded" run keep its workers, so both runs are the
// same. One check must go red.
import { chromium } from "playwright-core";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
import { readFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const PLANT = process.argv.includes("--plant");
const OUT = "/tmp/tiff-threads";
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "ok  " : "FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) failed++; };

/** One export, and the thread count the app reports for it. */
async function run(b, name, noExportWorkers) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on("dialog", (d) => d.accept());
  if (noExportWorkers) {
    await p.addInitScript(() => {
      const Real = window.Worker;
      // ONLY THE EXPORT WORKER. The decode pool keeps running, so the two runs
      // of this walk differ in exactly one thing.
      window.Worker = class extends Real {
        constructor(url, opts) {
          if (String(url).includes("export")) throw new Error("export workers disabled by the walk");
          super(url, opts);
        }
      };
    });
  }
  await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
  await p.setInputFiles("#file", ["public/examples/NIR_1651.dng"]);
  await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
  await p.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
  await p.waitForTimeout(600);
  await p.click("#ptab-export");
  await p.evaluate(() => {
    for (const [id, v] of [["exFormat", "tiff"], ["exScale", "1"]]) {
      const el = document.getElementById(id);
      if (el) { el.value = v; el.dispatchEvent(new Event("change", { bubbles: true })); }
    }
  });
  // THE BANNER, SAMPLED WHILE IT RUNS, and this is the check that was missing.
  // The progress strip said "on one thread" over an export the app's own report
  // put on eight, and nothing here could see it: this walk read that same §7f
  // line for its thread count — the source the feature writes — so a SECOND
  // copy of the rule, in the strip, could contradict it forever with every
  // check green. A test that reads only what a feature reports about itself
  // cannot catch the feature disagreeing with itself.
  const banner = [];
  const sampler = setInterval(async () => {
    try {
      const t = await p.textContent("#exportStripText");
      if (t && !banner.includes(t)) banner.push(t);
    } catch { /* the page can be mid-navigation; a missed sample is not a failure */ }
  }, 400);
  const dl = p.waitForEvent("download", { timeout: 1800000 }); dl.catch(() => {});
  await p.click("#exBtn");
  await p.waitForSelector("#exportSave", { timeout: 1800000 }).catch(() => {});
  await p.click("#exportSave").catch(() => {});
  const d = await dl;
  clearInterval(sampler);
  const path = join(OUT, `${name}.tif`);
  rmSync(path, { force: true });
  await d.saveAs(path);
  // The app's own report, so the thread count is the one the export actually
  // used rather than the one this walk assumes it arranged.
  await p.click("#verTag");
  await p.waitForFunction(() => (document.getElementById("verDlgText")?.value ?? "").includes("Last export"), null, { timeout: 60000 });
  const line = (await p.inputValue("#verDlgText")).split("\n").find((l) => l.startsWith("Last export")) ?? "";
  await ctx.close();
  const threads = Number((line.match(/on (\d+) threads?/) ?? [])[1] ?? (/on one thread/.test(line) ? 1 : 0));
  return { path, threads, banner, line: line.replace(/^Last export\s+/, "") };
}

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const many = await run(b, "parallel", false);
  console.log(`\n  across cores   ${many.line}`);
  const one = await run(b, "single", PLANT ? false : true);
  console.log(`  one thread     ${one.line}\n`);

  check("a TIFF export uses more than one core", many.threads > 1, `${many.threads} thread(s)`);
  // THE BANNER AND THE REPORT ARE ONE FACT. They came from two places and said
  // two things; now they come from one.
  const saidOneThread = many.banner.some((t) => /on one thread/.test(t));
  check("and the banner does not say otherwise while it runs",
    !(many.threads > 1 && saidOneThread),
    saidOneThread
      ? `the strip said "on one thread" over a ${many.threads}-thread export`
      : `${many.banner.length} banner sample(s), none claiming one thread`);
  const oneSaidOne = one.banner.some((t) => /on one thread/.test(t));
  check("and it DOES say so when the export really is on one",
    PLANT ? true : oneSaidOne,
    oneSaidOne ? "said so" : `never said it — ${one.banner.slice(-1)[0] ?? "no samples"}`);
  check("and the forced run really used one", PLANT ? false : one.threads === 1, `${one.threads} thread(s)`);

  const A = readFileSync(many.path), B = readFileSync(one.path);
  check("both files are the same size", A.length === B.length, `${A.length} vs ${B.length} bytes`);
  let diff = -1;
  if (A.length === B.length) { diff = 0; for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) diff++; }
  // THE WHOLE POINT. A seam between two workers' bands is a plausible-looking
  // photograph, so nothing short of identity is a pass.
  check("the file is identical either way", diff === 0,
    diff < 0 ? "different sizes, not compared" : `${diff} byte(s) differ of ${A.length}`);
  check("and it is a real TIFF", A[0] === 0x49 && A[1] === 0x49, `magic ${A[0].toString(16)} ${A[1].toString(16)}`);
} finally { await b.close(); }
console.log(failed ? `\n${failed} failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
