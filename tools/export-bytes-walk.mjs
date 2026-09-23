#!/usr/bin/env node
// THE OUTPUT GATE, AND THE ONE THAT MATTERS MOST. An export must produce the
// same file whether or not the reader carries on working while it runs, and the
// same file this app produced before the export stopped owning the screen. The
// hash it prints is a RECORD, not a claim, and saying so is why this sentence
// changed. It read "the claim: 602e2db1..." and that number had gone stale —
// the export is ce1c7ffc as of 2026-09-20 — so a session checking its own
// export-path change against it would read a legitimate difference as a
// regression, or a real regression as a number somebody forgot to update. The
// hash moves whenever the pipeline legitimately moves, and
// `preview-version-check` is the gate for that; what this walk ASSERTS is on
// the `check` lines below.
//
// TO USE IT AS A REGRESSION CHECK, run it on both sides of a change and compare
// the two hashes to EACH OTHER rather than to any number written here. That is
// what settled the 2026-09-20 export change: identical before and after, so
// moving the band rectangle above the format branch was inert on the JPEG path. Two plants once ran green here
// because the export had quietly used three worker threads, which get a
// structured COPY of the edit and cannot see a mid-run mutation (hub §290).
//
// MOVED IN FROM THE SESSION SCRATCHPAD, 2026-09-14. It was rebuilt there before
// each release and held nowhere, so a session that did not know it existed
// shipped without it and a container going away took it with it. Four walks were
// in this directory and roughly eighteen were not, including the export gate.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/export-bytes-walk.mjs
//
//   npm install --no-save esbuild playwright-core axe-core
//
// NOT in .branch-guard's `also=`: it drives a real browser and decodes RAW
// files. Run it before a release, or through tools/walk-all.mjs.
// THE OUTPUT GATE. An export must produce the same file whether or not the
// reader carries on working while it runs — and the same file this app produced
// before the export stopped owning the screen.
//   node export-bytes.mjs --record      (quiet run; prints a hash)
//   node export-bytes.mjs --interfere   (switch photos and edit while it runs)
import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const DIR = "/home/user/Jefferson-Photography-Studio/public/examples";
const TWO = ["canopy.dng","hillside.dng"].map(f=>`${DIR}/${f}`);
const INTERFERE = process.argv.includes("--interfere");
// GLOW IS THE ONE THE EXPORT READS LATE. Everything else is folded in before
// the per-pixel pass starts, so a mid-run change to it could not show even on a
// build that read the live object — and a plant that cannot show proves nothing.
// The map is only built when glow is already on, so it is turned on BEFORE the
// press and turned off during the run.
const GLOW = process.argv.includes("--glow");
// ONE THREAD ON PURPOSE. A parallel export hands each worker a structured COPY
// of the edit, so a mid-run mutation cannot reach it and a plant that relies on
// one proves nothing there.
//
// IT USED TO FORCE THAT BY HEALING A SPOT, because a healed frame was refused
// by the parallel path outright. 055 removed that refusal — healed frames run
// across cores now and are priced instead — so the old mechanism would have
// gone VACUOUSLY GREEN: still passing, no longer producing a single-threaded
// export, and therefore no longer testing the thing this flag exists for. That
// is the worst shape a test can take, and it would have been invisible.
//
// So it refuses the export Worker instead, which is what
// tools/tiff-threads-walk.mjs already does and is the only mechanism that
// cannot be undone by a change to what the pool accepts.
//
// AND THE HASH IS COMPARABLE NOW, which it was not before: the old mechanism
// changed the PIXELS as a side effect of forcing one thread, so a run under
// this flag could only be read against an earlier run of the same flag. The
// edit is identical either way now, so a single-threaded export must produce
// the SAME bytes as a parallel one — which is a stronger check than the one
// this replaces.
const ONE = process.argv.includes("--onethread");
let failed=0; const check=(n,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)failed++;console.log(`${ok?"ok  ":"FAIL"}  ${n}\n        got ${JSON.stringify(g)} want ${JSON.stringify(w)}`);};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on("pageerror", e => { console.log("FAIL  page error: " + e.message); failed++; });
  p.on("dialog", d => d.accept());
  if (ONE) {
    // REFUSED BEFORE ANY OF THE APP'S SCRIPT RUNS, and ONLY the export worker —
    // the decode pool keeps going, so the run differs from a plain one in
    // exactly one thing. Same trick as tools/tiff-threads-walk.mjs.
    await p.addInitScript(() => {
      const Real = window.Worker;
      window.Worker = class extends Real {
        constructor(url, opts) {
          if (String(url).includes("export")) throw new Error("export workers disabled by the walk");
          super(url, opts);
        }
      };
    });
  }
  await p.goto("http://127.0.0.1:8131/ir.html");
  await p.setInputFiles("#file", TWO);
  await p.waitForFunction((n)=>document.querySelectorAll("#sessionThumbs .session-thumb").length===n, TWO.length, {timeout:300000});
  await p.waitForFunction(()=>{const t=[...document.querySelectorAll("#sessionThumbs .session-thumb")];return t.every(x=>!x.disabled);},null,{timeout:300000});
  await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});

  const modal = await p.evaluate(() => !document.getElementById("exportStrip"));
  console.log(`        flow: ${modal ? "the old modal dialog" : "the strip beside the button"}`);

  if (GLOW) {
    await p.click("#ptab-bw").catch(async () => { await p.click("#ptab-ir"); });
    const set = await p.evaluate(() => {
      const s = document.getElementById("glow");
      if (!s) return false;
      s.value = "0.6"; s.dispatchEvent(new Event("input",{bubbles:true})); s.dispatchEvent(new Event("change",{bubbles:true}));
      return true;
    });
    check("0 glow was turned on before the press", set, true);
    await p.waitForTimeout(400);
  }
  await p.click("#ptab-export");
  const dl = p.waitForEvent("download", { timeout: 600000 });
  dl.catch(()=>{});
  const t0 = Date.now(); // a run that dies early must not raise an unhandled rejection over the real error
  await p.click("#exBtn");

  if (INTERFERE && !modal) {
    // WHILE IT RUNS: move to the other photo, turn it, grade it, and drag a
    // slider. Every one of those is something the export used to read live.
    await p.waitForFunction(()=>/Exporting/.test(document.getElementById("exportStripText")?.textContent||""),null,{timeout:60000});
    const liveDuring = await p.evaluate(() => ({
      strip: /Exporting/.test(document.getElementById("exportStripText")?.textContent || ""),
      anyDialog: !!document.querySelector("dialog[open]"),
    }));
    check("1 the export runs with no dialog over the app", [liveDuring.strip, liveDuring.anyDialog], [true, false]);
    await p.evaluate(()=>document.querySelectorAll("#sessionThumbs .session-thumb")[1].click());
    await p.waitForFunction(()=>document.querySelectorAll("#sessionThumbs .session-thumb")[1]?.classList.contains("active"),null,{timeout:300000});
    check("2 the reader moved to another photo while it ran",
      await p.evaluate(()=>/Exporting|Ready/.test(document.getElementById("exportStripText")?.textContent||"")), true);
    // Each one reported, so a control that has moved shows up as a control that
    // has moved rather than as a silent gap in the interference.
    const did = [];
    const tryDo = async (what, fn) => { try { await fn(); did.push(what); } catch (e) { did.push(`${what}:FAILED(${String(e).slice(0,40)})`); } };
    await tryDo("rotate", async () => { await p.click("#ptab-crop", {timeout:8000}); await p.click("#rotateBtn", {timeout:8000}); });
    await tryDo("look", async () => { await p.click("#ptab-ir", {timeout:8000}); await p.click("#lookRed", {timeout:8000}); });
    await tryDo("slider", async () => { await p.click("#ptab-basic", {timeout:8000}); await p.evaluate(()=>{const s=document.getElementById("expo");s.value="800";s.dispatchEvent(new Event("input",{bubbles:true}));s.dispatchEvent(new Event("change",{bubbles:true}));}); });
    if (GLOW) await tryDo("glow off", async () => { await p.evaluate(()=>{const s=document.getElementById("glow");s.value="0";s.dispatchEvent(new Event("input",{bubbles:true}));s.dispatchEvent(new Event("change",{bubbles:true}));}); });
    const still = await p.evaluate(() => document.getElementById("exportStripText")?.textContent || "");
    console.log(`        interference: ${did.join(", ")}`);
    console.log(`        ${Date.now()-t0} ms after the press, the line reads: ${still}`);
    check("4 the export was still running when the reader interfered", /Exporting/.test(still), true);
    check("3 all three kinds of interference actually happened", did.every(x=>!/FAILED/.test(x)), true);
  }

  if (modal) {
    await p.waitForSelector("#busyActions:not([hidden])", { timeout: 600000 });
    await p.click("#busySave");
  } else {
    await p.waitForFunction(()=>/^Ready —/.test(document.getElementById("exportStripText")?.textContent||""),null,{timeout:600000});
    await p.click("#exportSave");
  }
  // WHAT ACTUALLY RAN, read from the app's own profile rather than from the
  // label the strip printed: a mid-run mutation cannot reach a worker, so which
  // path ran decides what these plants can prove at all.
  await p.click("#verTag");
  await p.waitForFunction(()=>!/Gathering/.test(document.getElementById("verDlgText")?.value||""),null,{timeout:60000});
  const rep = await p.evaluate(()=>document.getElementById("verDlgText").value);
  const m = rep.match(/^Last export\s{2,}(.*)$/m);
  console.log("        last export: " + (m ? m[1] : "not reported"));
  await p.click("#verClose");
  const d = await dl;
  const path = await d.path();
  const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
  console.log(`        file: ${d.suggestedFilename()}`);
  console.log(`SHA256 ${hash}`);
  await ctx.close();
} finally { await b.close(); }
process.exit(failed?1:0);
