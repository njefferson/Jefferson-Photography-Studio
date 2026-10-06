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
//   node switch-instrument.mjs --plant-sky — the sky worker's answer held 30 s
//                                           (from outside, in the page) must land
//                                           in the selection's wait, and nowhere in
//                                           the switch's own parts
// Needs dist/ served on :8131.
//
// THE LOOK'S SKY IS PART OF THE LINE NOW (the open-and-strip plan, step 4). The
// switch's own parts end when the picture is up; what comes after it — the wait
// for the sky worker's selection, the second solve of the lift, the first sky map
// build — runs beside the switch and past its end, so it is NOT in the whole the
// first seven checks hold the parts to. It is held to something else, which is
// the point of checks 10 to 20: settling's two parts add up to settling; the sky's
// parts fit inside the time the walk itself watched pass; and the reported wait is
// no longer than the window the worker's own messages show from outside, which the
// page's Worker is wrapped to stamp. The session wears Aerochrome here, because a
// photograph with no look has no second solve and no sky map to report.
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
/** How far a printed time can be from the number it was rounded from: half a
 *  millisecond when it is in ms, half a tenth of a second when it is in seconds
 *  (the report prints "1.4s" above a second). A check that adds printed times
 *  has to allow for this or it fails on a slow machine and passes on a fast one. */
const unit = (txt) => (txt === null || txt === undefined ? 0 : /ms\b/.test(txt) ? 0.5 : 50);
const sleep = (n) => new Promise((r) => setTimeout(r, n));

const PLANT_SKY = process.argv.includes("--plant-sky");
// THIRTY SECONDS, because a short hold does not discriminate: in this container
// the unplanted selection already waits five to twelve seconds (the page, three
// decode lanes and a software rasteriser share the cores), so a hold of three
// seconds is read back as "at least three" by a build that holds nothing.
const HOLD = PLANT_SKY ? 30000 : 0;

/** Runs in the page before anything else. The session wears Aerochrome (the
 *  look keyed `eir`; `aero` is Pink IR, which carries no sky stage of its own and
 *  so has no sky map to build) with Restore depth on, so the look has a sky stage;
 *  and the sky worker is wrapped so that the page-side clock stamps the first
 *  request after a reset and the first answer handed back. Only the sky worker is
 *  touched, and only its message delivery is delayed: by `planted` ms once the
 *  walk resets the stamps for the switch (so the first photograph's own answer
 *  is never held), and by nothing before that. */
function INIT(planted) {
  try { localStorage.setItem("ips-autolift", "1"); localStorage.setItem("ips-default-look", "eir"); } catch { /* the checks below then say what they read */ }
  const M = (window.__sky = { asked: null, delivered: null, hold: 0, planted });
  const W = window.Worker;
  window.Worker = function (url, opts) {
    const w = new W(url, opts);
    if (/sky\.worker/.test(String(url))) {
      const post = w.postMessage.bind(w);
      w.postMessage = (...a) => { if (M.asked === null) M.asked = performance.now(); return post(...a); };
      let fn = null;
      Object.defineProperty(w, "onmessage", { configurable: true, get() { return fn; }, set(f) { fn = f; } });
      w.addEventListener("message", (e) => {
        setTimeout(() => { if (fn) fn.call(w, e); if (M.asked !== null && M.delivered === null) M.delivered = performance.now(); }, M.hold);
      });
    }
    return w;
  };
  window.Worker.prototype = W.prototype;
}

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 950 } });
  p.on("pageerror", e => { console.log("FAIL  page error: " + e.message); failed++; });
  await p.addInitScript(INIT, HOLD);
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
  // THE FIRST PHOTOGRAPH'S OWN SELECTION IS LET THROUGH BEFORE THE CLOCK STARTS.
  // The wrapped worker stamps the first request and first answer after a reset,
  // so the first photograph's answer must have been handed back before it, or it
  // would be taken for the switch's. The hold is planted at the same reset.
  await p.waitForFunction(() => window.__sky && window.__sky.delivered !== null, null, { timeout: 120000 });
  await p.evaluate(() => { window.__sky.asked = null; window.__sky.delivered = null; window.__sky.hold = window.__sky.planted; });
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
  // WHETHER THE SKY WORKER'S ANSWER HAD BEEN HANDED BACK YET when the switch was
  // seen to be done — read here, before anything else is asked of the page.
  const deliveredAtActive = await p.evaluate(() => window.__sky.delivered);

  const readReport = async () => {
    await p.click("#verTag");
    await p.waitForFunction(() => !/Gathering/.test(document.getElementById("verDlgText")?.value || ""), null, { timeout: 60000 });
    return p.evaluate(() => document.getElementById("verDlgText").value);
  };
  const report = await readReport();
  // The report is COLUMN-ALIGNED, not "key: value" — the first version of this
  // harness matched a colon that is not there and found nothing on a build that
  // was reporting correctly.
  const fieldOf = (rep, k) => { const m = rep.match(new RegExp("^" + k + "\\s{2,}(.*)$", "m")); return m ? m[1].trim() : ""; };
  const field = (k) => fieldOf(report, k);
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

  // --- SETTLING'S TWO PARTS: the lift's first solve is inside it -------------------------------------------
  // The first visit solves the lift once, without the sky if the sky is still on its
  // way, inside `activateCurrent` — which is what `settling` measures. The line
  // says how much of it that was, and the rest, and the two must add up to it.
  const sb = line.match(/settling ([\d.]+\s*(?:ms|s)) \((?:first lift solve ([\d.]+\s*(?:ms|s))|no lift solve), otherwise ([\d.]+\s*(?:ms|s))\)/);
  check("10 settling names its two parts, the lift's first solve and the rest, and they parse", !!sb, true);
  if (sb) {
    const [, sTxt, lTxt, oTxt] = sb;
    const sParts = (lTxt ? ms(lTxt) : 0) + ms(oTxt);
    const sGap = Math.abs(sParts - ms(sTxt));
    const sAllow = unit(sTxt) + unit(lTxt) + unit(oTxt) + 1;
    console.log(`        settling's parts ${sParts.toFixed(0)} ms vs ${ms(sTxt).toFixed(0)} ms — ${sGap.toFixed(0)} ms apart (allowed ${sAllow.toFixed(1)} ms)`);
    check("11 settling's own two parts add up to settling, within the rounding of what was printed", sGap <= sAllow, true);
    check("12 a first visit under a look solves the lift, and the line says so", !!lTxt && /first visit/.test(line), true);
  }

  // --- THE LOOK'S SKY, which comes after the picture ----------------------------------------------------------
  // Beside the switch and past its end, so it is not in the whole checks 1 to 9 hold
  // the parts to: the wait for the sky worker's selection, the second solve of the
  // lift (made when the selection lands), and the first sky map build. The answers
  // land AFTER the switch, so the first read says "still on its way" and the line is
  // read again until it says what happened.
  const MARK = "after the picture, the look's sky: ";
  const skyOf = (ln) => { const i = ln.indexOf(MARK); return i < 0 ? "" : ln.slice(i + MARK.length); };
  const NUM = "([\\d.]+\\s*(?:ms|s))";
  const first = (re, s) => { const m = s.match(re); return m ? m[1] : null; };
  const skyState = (txt) => {
    const how = /^selection still on its way/.test(txt) ? "waiting"
      : /^selection from the worker, waited/.test(txt) ? "worker"
      : /^selection already in hand/.test(txt) ? "held"
      : /^selection built on the page/.test(txt) ? "page"
      : /^the worker gave no selection/.test(txt) ? "none"
      : /^selection had not arrived/.test(txt) ? "left" : "?";
    const waitTxt = how === "worker" ? first(new RegExp(`waited ${NUM}`), txt) : how === "none" ? first(new RegExp(`after waiting ${NUM}`), txt) : null;
    const liftTxt = first(/second lift solve (none made|[\d.]+\s*(?:ms|s))/, txt);
    const mapTxt = first(/sky map (none built yet|[\d.]+\s*(?:ms|s))/, txt);
    const val = (t) => (t === null || /^none/.test(t) ? null : ms(t));
    return { how, waitTxt, wait: how === "held" ? 0 : waitTxt === null ? null : ms(waitTxt), liftTxt, lift: val(liftTxt), mapTxt, map: val(mapTxt) };
  };
  let rep = report;
  let sky = skyState(skyOf(line));
  const reread = async () => { await p.click("#verClose"); await sleep(750); rep = await readReport(); sky = skyState(skyOf(fieldOf(rep, "Last switch"))); };
  const poll0 = Date.now();
  while (sky.how === "waiting" && Date.now() - poll0 < 240000) await reread();
  // Then the map and a drawn tile: the map is built by the first draw after the
  // selection is in hand and the tile by the strip pass, and neither is owed to
  // any particular moment — a minute is allowed for them and the checks say what
  // was read if they have not come.
  const poll1 = Date.now();
  while ((sky.mapTxt === null || sky.mapTxt === "none built yet" || /^none this session/.test(fieldOf(rep, "Last strip tile"))) && Date.now() - poll1 < 60000) await reread();
  const settledAt = Date.now();
  const skyLine = fieldOf(rep, "Last switch");
  console.log(`\n        the look's sky, as last read: ${skyOf(skyLine)}`);
  check("13 the look's sky is on the line, says how the selection arrived, and its later two parts parse",
    ["worker", "held", "page", "none"].includes(sky.how) && sky.liftTxt !== null && sky.mapTxt !== null, true);
  check("14 the selection came from the sky worker and not from the page", sky.how === "worker" || sky.how === "held", true);
  const skySum = (sky.wait ?? 0) + (sky.lift ?? 0) + (sky.map ?? 0);
  const skyAllow = unit(sky.waitTxt) + unit(sky.liftTxt) + unit(sky.mapTxt) + 5;
  const watched = settledAt - outside0;
  console.log(`        the sky's parts ${skySum.toFixed(0)} ms (wait ${sky.wait}, second lift ${sky.lift}, map ${sky.map}); the walk watched ${watched} ms from the press to the last read`);
  check("15 the sky's parts fit inside the time actually spent", skySum <= watched + skyAllow, true);
  // AN INDEPENDENT CLOCK FOR THE WAIT. The wrapped worker stamped the request and the
  // answer from outside the app's own instrument. The page asks for the selection
  // a little AFTER the worker is first sent the copy (the decode's answer starts the
  // build; `showDecoded` asks when the picture is up), so the wait it reports can
  // be shorter than the worker's window by that gap and never longer than it:
  // within a second below, and no more than the stamps' own jitter above. A wait
  // that did not follow the window — stuck at zero, or measured from the press —
  // fails one side or the other.
  const ref = await p.evaluate(() => ({ asked: window.__sky.asked, delivered: window.__sky.delivered }));
  if (sky.how === "worker") {
    const win = ref.delivered - ref.asked;
    console.log(`        the worker's own window, stamped from outside: ${win.toFixed(0)} ms; the page reported ${sky.wait.toFixed(0)} ms (${(win - sky.wait).toFixed(0)} ms of the window had gone before the page asked)`);
    check("16 the reported wait is no longer than the window the worker's own messages show",
      ref.asked !== null && ref.delivered !== null && sky.wait <= win + unit(sky.waitTxt) + 15, true);
    check("16b and not more than a second shorter: the wait follows the window",
      ref.asked !== null && ref.delivered !== null && sky.wait >= win - 1000 - unit(sky.waitTxt), true);
  } else {
    console.log("        16 not run: the selection was not waited for here, so there is no window to hold the wait to");
  }

  // --- THE LAST STRIP TILE, drawn in a decode lane ---------------------------------------------------------------
  const tile = fieldOf(rep, "Last strip tile");
  console.log(`\n${tile}\n`);
  const tm = tile.match(new RegExp(`^drawn (in a decode worker|on the page), ${NUM} in all — decode ${NUM}, selection ${NUM}, lift ${NUM}, pixels ${NUM}, encode ${NUM}, rest ${NUM}$`));
  check("17 the report carries a Last strip tile line that says where it was drawn and gives its six parts", !!tm, true);
  if (tm) {
    const [, where, ...txts] = tm;
    const [tTotal, tDec, tSel, tLift, tPix, tEnc, tRest] = txts.map(ms);
    const tParts = tDec + tSel + tLift + tPix + tEnc + tRest;
    const tAllow = txts.reduce((a, x) => a + unit(x), 0) + 1;
    console.log(`        the tile's six parts ${tParts.toFixed(0)} ms vs whole ${tTotal.toFixed(0)} ms — ${Math.abs(tParts - tTotal).toFixed(0)} ms apart (allowed ${tAllow.toFixed(1)} ms)`);
    check("18 the tile's six parts add up to its whole, within the rounding of what was printed", Math.abs(tParts - tTotal) <= tAllow, true);
    check("19 the strip's tiles are drawn in a decode worker here", where === "in a decode worker", true);
    check("20 a tile's decode and its pixels are measured, not zero", tDec > 0 && tPix > 0, true);
  }
  // NOTHING THE READER WROTE: neither new line may carry a file's name.
  const names = SET.map((f) => f.split("/").pop().replace(/\.[^.]+$/, "").toLowerCase());
  check("21 neither new line names a file", names.some((n) => (skyLine + "\n" + tile).toLowerCase().includes(n)), false);

  if (PLANT_SKY) {
    console.log(`\n        PLANTED RUN — the sky worker's answer held ${HOLD} ms; the page reported a wait of ${sky.wait === null ? "none" : sky.wait.toFixed(0) + " ms"} and a switch of ${total.toFixed(0)} ms`);
    check("S1 the planted hold landed in the selection's wait", sky.how === "worker" && sky.wait >= HOLD * 0.93, true);
    check("S2 and the picture did not wait for it: the switch was done while the answer was still held", deliveredAtActive === null, true);
    check("S3 and nowhere in the switch's own whole", total < HOLD * 0.1, true);
  }

  if (process.argv.includes("--plant")) {
    console.log(`\n        PLANTED RUN — reading was ${reading.toFixed(0)} ms`);
    check("P1 the planted 400 ms landed in the reading bucket", reading >= 380, true);
    check("P2 and nowhere else: the decode run did not move", ran < 380, true);
    check("P3 and nowhere else: showing did not move", showing < 380, true);
  }
} finally { await b.close(); }
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
