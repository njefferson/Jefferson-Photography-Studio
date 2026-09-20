#!/usr/bin/env node
// THE SWITCH REPORT MEASURES ITSELF HONESTLY: the parts add up to the whole, and
// the reported whole fits inside the time actually spent. Driven against a
// planted delay, because a timing report that cannot detect a delay you inserted
// is not measuring anything.
//
// MOVED IN FROM THE SESSION SCRATCHPAD, 2026-09-14. It was rebuilt there before
// each release and held nowhere, so a session that did not know it existed
// shipped without it and a container going away took it with it. Four walks were
// in this directory and roughly eighteen were not, including the export gate.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/switch-instrument-walk.mjs
//
//   npm install --no-save esbuild playwright-core axe-core
//
// NOT in .branch-guard's `also=`: it drives a real browser and decodes RAW
// files. Run it before a release, or through tools/walk-all.mjs.
// DOES THE SWITCH REPORT TELL THE TRUTH?
//   node switch-instrument.mjs            — the parts must add up to the whole
//   node switch-instrument.mjs --plant    — a 400 ms delay planted in getBytes
//                                           must move ONE bucket and no other
// Needs dist/ served on :8131.
import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
const DIR = "/home/user/Jefferson-Photography-Studio/public/examples";
const SET = ["canopy.dng","hillside.dng","lodge.dng","NIR_1830.dng","NIR_1873.dng","NIR_1877.dng"].map(f=>`${DIR}/${f}`);
let failed = 0;
const check = (n,g,w)=>{const ok=g===w;if(!ok)failed++;console.log(`${ok?"ok  ":"FAIL"}  ${n}\n        got ${JSON.stringify(g)} want ${JSON.stringify(w)}`);};

const num = (re, s) => { const m = s.match(re); return m ? parseFloat(m[1]) * (/(ms)/.test(m[2] ?? m[0]) ? 1 : 1000) : null; };
/** "2.1s" / "340 ms" -> ms */
const ms = (txt) => { const m = txt.match(/([\d.]+)\s*(ms|s)\b/); return m ? parseFloat(m[1]) * (m[2] === "ms" ? 1 : 1000) : null; };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 950 } });
  p.on("pageerror", e => { console.log("FAIL  page error: " + e.message); failed++; });
  await p.goto("http://127.0.0.1:8131/ir.html");
  await p.setInputFiles("#file", SET);
  // The strip appears once two real photos are in; wait for the whole set.
  await p.waitForFunction((n) => document.querySelectorAll("#sessionThumbs .session-thumb").length === n, SET.length, { timeout: 300000 });
  await p.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });

  // SWITCH, timed from outside as well as in. The outside window must contain
  // the inside one: an instrument that reports more time than elapsed is wrong
  // in a way no internal consistency check could show.
  // A TILE IS DISABLED WHILE ITS PHOTO IS STILL BEING WRITTEN, and a disabled
  // button's click() does nothing at all — the first version of this harness
  // clicked one, waited for a dialog that never opened, and reported the
  // instrument missing when nothing had been asked of it.
  await p.waitForFunction(() => {
    const t = [...document.querySelectorAll("#sessionThumbs .session-thumb")];
    return t.length > 1 && t.every((b) => !b.disabled);
  }, null, { timeout: 300000 });
  const outside0 = Date.now();
  const target = await p.evaluate(() => {
    const tiles = [...document.querySelectorAll("#sessionThumbs .session-thumb")];
    const i = tiles.findIndex((b) => !b.classList.contains("active"));
    tiles[i].click();
    return i;
  });
  // Wait for the SWITCH, not for a dialog: the tile the reader pressed is the
  // active one when it has happened.
  await p.waitForFunction((i) => document.querySelectorAll("#sessionThumbs .session-thumb")[i]?.classList.contains("active"), target, { timeout: 300000 });
  const outside = Date.now() - outside0;

  await p.click("#verTag");
  await p.waitForFunction(() => !/Gathering/.test(document.getElementById("verDlgText")?.value || ""), null, { timeout: 60000 });
  const report = await p.evaluate(() => document.getElementById("verDlgText").value);
  // The report is COLUMN-ALIGNED, not "key: value" — the first version of this
  // harness matched a colon that is not there and found nothing on a build that
  // was reporting correctly.
  const field = (k) => { const m = report.match(new RegExp("^" + k + "\\s{2,}(.*)$", "m")); return m ? m[1].trim() : ""; };
  const line = field("Last switch");
  const held = field("Edits held in memory");
  console.log("\n" + line + "\n" + held + "\n");

  check("1 the report carries a Last switch line", !!line && !/none this session/.test(line), true);
  check("2 the report carries Edits held in memory", /^\d+ of \d+$/.test(held), true);
  if (!line) { console.log("\nno line to take apart"); process.exit(1); }

  const grab = (re) => { const m = line.match(re); return m ? ms(m[1]) : null; };
  const total   = grab(/MP in ([\d.]+\s*(?:ms|s))/);
  const reading = grab(/reading ([\d.]+\s*(?:ms|s))/);
  const waited  = grab(/decode waited ([\d.]+\s*(?:ms|s))/);
  const ran     = grab(/then ran ([\d.]+\s*(?:ms|s))/);
  const showing = grab(/showing ([\d.]+\s*(?:ms|s))/);
  const settle  = grab(/settling ([\d.]+\s*(?:ms|s))/);
  const strip   = grab(/strip ([\d.]+\s*(?:ms|s))/);
  const phases  = ["hot spot","upload","zoom","glow","local","rest"].map(k => grab(new RegExp(k.replace(" ","\\s") + " ([\\d.]+\\s*(?:ms|s))")));

  check("3 every bucket is named and parses",
    [total,reading,waited,ran,showing,settle,strip,...phases].every(v => typeof v === "number"), true);
  check("4 the context is named", /\d+ photos, \d+ thumbnails? being built, (\d+|no) decoders? running, \d+ decodes? already waiting/.test(line), true);
  check("5 first visit or not is stated", /(first visit|been here before)/.test(line), true);
  check("6 what else held the main thread is stated",
    /(other work held the main thread|cannot report what else held)/.test(line), true);

  const sum = reading + waited + ran + showing + settle + strip;
  const drift = Math.abs(sum - total) / total;
  console.log(`        parts ${sum.toFixed(0)} ms vs whole ${total.toFixed(0)} ms — ${(drift*100).toFixed(1)}% apart`);
  check("7 the parts add up to the whole within 5%", drift < 0.05, true);

  // THE TOLERANCE WAS CHASING A DEFECT IN THE INSTRUMENT, TWICE.
  //
  // This check asserted that showing's named parts add up to showing, and they
  // could not: `show` is measured across the whole of `showDecoded`, while the
  // five phases covered only its middle. The location guard, the canvas label
  // and the tool disarm run before the first phase clock starts; unhiding the
  // panel, leaving learn mode and rebuilding the zoom control run after the
  // last one stops. That head and tail is real work belonging to no phase.
  //
  // It passed on an idle machine because both are fast, and went red whenever
  // the container was loaded — which produced exactly the wrong repair each
  // time. First the tolerance went to 5%; then, when a 4.5% failure re-ran
  // green, an absolute 6 ms floor was added under a comment about millisecond
  // ROUNDING. Rounding was never the mechanism, so the floor was fitted to a
  // story rather than derived: the sweep failed again on the first full run
  // after it, and a re-run passed, which is what a tolerance covering the wrong
  // variable always does.
  //
  // The app reports `rest` now — the head and tail, measured — so six parts
  // partition the whole by construction and this is exact. The slack left is
  // the call boundary either side of `showDecoded`, sub-millisecond, and six
  // numbers each rounded to a whole millisecond: 6 ms, which is the one part of
  // the old comment that was right about its own variable.
  const phSum = phases.reduce((a,c)=>a+c,0);
  const phGap = Math.abs(phSum - showing);
  const phDrift = phGap / Math.max(1, showing);
  const phAllow = 6;  // six whole-millisecond roundings; NOT a fraction of the total any more
  console.log(`        showing's six parts ${phSum.toFixed(0)} ms vs ${showing.toFixed(0)} ms — ${phGap.toFixed(0)} ms, ${(phDrift*100).toFixed(1)}% (allowed ${phAllow.toFixed(0)} ms)`);
  check("8 showing's own six parts add up to showing, within rounding", phGap <= phAllow, true);

  console.log(`        outside the call ${outside} ms, reported ${total.toFixed(0)} ms`);
  check("9 the reported whole fits inside the time actually spent", total <= outside + 5, true);

  if (process.argv.includes("--plant")) {
    console.log(`\n        PLANTED RUN — reading was ${reading.toFixed(0)} ms`);
    check("P1 the planted 400 ms landed in the reading bucket", reading >= 380, true);
    check("P2 and nowhere else: the decode run did not move", ran < 380, true);
    check("P3 and nowhere else: showing did not move", showing < 380, true);
  }
} finally { await b.close(); }
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
