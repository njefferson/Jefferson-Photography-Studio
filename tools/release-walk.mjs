#!/usr/bin/env node
// A DECIDED PHOTO LETS GO OF ITS WORKING STATE, and a photo with brush masks
// does not. The release is attached AFTER activateCurrent rather than beside the
// capture, because the durable write settles long before the decode and the
// guard would otherwise see the leaving photo still active.
//
// MOVED IN FROM THE SESSION SCRATCHPAD, 2026-09-14. It was rebuilt there before
// each release and held nowhere, so a session that did not know it existed
// shipped without it and a container going away took it with it. Four walks were
// in this directory and roughly eighteen were not, including the export gate.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/release-walk.mjs
//
//   npm install --no-save esbuild playwright-core axe-core
//
// NOT in .branch-guard's `also=`: it drives a real browser and decodes RAW
// files. Run it before a release, or through tools/walk-all.mjs.
// A VERDICT LETS THE APP PUT THE PHOTO DOWN — and says so.
// Needs dist/ served on :8131.
import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
const DIR = "/home/user/Jefferson-Photography-Studio/public/examples";
const SIX = ["canopy.dng","hillside.dng","lodge.dng","NIR_1830.dng","NIR_1873.dng","NIR_1877.dng"].map(f=>`${DIR}/${f}`);
let failed=0;
const check=(n,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)failed++;console.log(`${ok?"ok  ":"FAIL"}  ${n}\n        got ${JSON.stringify(g)} want ${JSON.stringify(w)}`);};

/** "N of M" out of the version report — the only window onto what is held. */
async function heldCount(p) {
  await p.click("#verTag");
  await p.waitForFunction(()=>!/Gathering/.test(document.getElementById("verDlgText")?.value||""),null,{timeout:60000});
  const txt = await p.evaluate(()=>document.getElementById("verDlgText").value);
  await p.click("#verClose");
  await p.waitForFunction(()=>!document.getElementById("verDlg")?.hasAttribute("open"),null,{timeout:30000});
  const m = txt.match(/^Edits held in memory\s{2,}(\d+) of (\d+)$/m);
  return m ? [Number(m[1]), Number(m[2])] : null;
}
const meta = (p) => p.evaluate(() => document.getElementById("sessionMeta").textContent);
const undoOff = (p) => p.evaluate(() => document.getElementById("undoBtn").disabled);
// READ STRAIGHT AWAY, ON PURPOSE. An earlier version of this walk waited up to
// fifteen seconds for the title to change, which made a red check green on an
// idle machine and left it red under load — because the title was not late, it
// was never going to arrive: the release ran in a promise and nothing redrew
// the strip afterwards. Waiting cannot produce a repaint that nothing
// schedules. A check that has to wait for a repaint is usually telling you the
// repaint is missing, and this one was.
const tileTitle = (p, i) => p.evaluate((n)=>document.querySelectorAll("#sessionThumbs .session-thumb")[n].title, i);
const expo = (p) => p.evaluate(() => Number(document.getElementById("expo").value));
const key = async (p, k) => { await p.evaluate(()=>(document.activeElement instanceof HTMLElement?document.activeElement.blur():undefined)); await p.keyboard.press(k); };

async function openSet(p, files) {
  await p.setInputFiles("#file", files);
  await p.waitForFunction((n)=>document.querySelectorAll("#sessionThumbs .session-thumb").length===n, files.length, {timeout:300000});
  await p.waitForFunction(()=>{const t=[...document.querySelectorAll("#sessionThumbs .session-thumb")];return t.length>1&&t.every(x=>!x.disabled);},null,{timeout:300000});
  await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});
}
async function stepTo(p, i) {
  await p.evaluate((n)=>document.querySelectorAll("#sessionThumbs .session-thumb")[n].click(), i);
  await p.waitForFunction((n)=>document.querySelectorAll("#sessionThumbs .session-thumb")[n]?.classList.contains("active"), i, {timeout:300000});
  await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});
}
async function setExpo(p, v) {
  await p.click("#ptab-basic");
  await p.evaluate((val)=>{const s=document.getElementById("expo");s.value=String(val);s.dispatchEvent(new Event("input",{bubbles:true}));s.dispatchEvent(new Event("change",{bubbles:true}));}, v);
  await p.waitForTimeout(400); // the edit record settles on a timer
}

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  p.on("pageerror", e => { console.log("FAIL  page error: " + e.message); failed++; });
  p.on("dialog", d => d.accept());
  await p.goto("http://127.0.0.1:8131/ir.html");
  await openSet(p, SIX);

  // Photo 2: edit it, decide on it, walk away.
  await stepTo(p, 1);
  await setExpo(p, 640);
  const edited = await expo(p);
  await key(p, "p");
  await stepTo(p, 2);
  // THE TILE FIRST, BEFORE ANYTHING ELSE TOUCHES THE PAGE. `heldCount` opens
  // and closes the version dialog, and that round trip is itself a repaint plus
  // the better part of a second — long enough for an incidental redraw to
  // correct a stale strip before the check that is supposed to catch it looks.
  // Read in this order the walk passed on a build with no repaint at the
  // release at all; read in the other it caught it. What the reader sees is the
  // strip the moment they land on the next photo, so that is the moment to
  // read.
  // WAIT FOR THE RELEASE, WHICH IS NOW A THING THAT HAPPENS.
  //
  // Yesterday this read straight away, and that was right: the release landed
  // and nothing redrew the strip, so waiting could not produce a repaint that
  // nothing scheduled, and a wait would only have turned a fast failure into a
  // slow one. The repaint exists now — updateSessionStrip runs in the save's
  // `then` — so the remaining gap is the save itself, which under load has
  // genuinely not resolved when the reader lands on the next photo.
  //
  // Waiting for something that WILL happen is not the same as waiting for
  // something that never will, and the difference is testable rather than a
  // matter of judgement: with the repaint taken back out, this check still
  // fails, because then the title never changes however long it is given. That
  // control is what keeps the wait honest.
  // BOTH FACTS IN ONE READ, because a gap between them is where this check kept
  // going wrong. "The tile still says held" has two causes — the save has not
  // landed, or it landed and nothing redrew — and telling them apart needs the
  // release count and the tile sampled in the SAME turn of the page.
  //
  // Two earlier shapes failed, each in an instructive way. Reading the tile
  // straight away detects the missing repaint but races the save, so it was
  // green alone and red under load. Waiting for the release first fixes the
  // race and destroys the detection: the wait is long enough for an incidental
  // repaint to correct the tile, and the control — the repaint deliberately
  // removed — went green.
  //
  // Sampled together, the race is gone: nothing can repaint between reading the
  // counter and reading the title, so this is stable under load.
  //
  // WHAT IT STILL CANNOT DO, and a claim to the contrary stood here for a day.
  // It does not prove the explicit repaint is what corrected the tile. With
  // `updateSessionStrip()` deliberately removed from the release, this check
  // stays GREEN — every poll is a round trip to the page, and an incidental
  // repaint reliably lands inside one. The control was run three ways (read
  // immediately, wait then read, sample together) and only the first ever went
  // red, which on the evidence was luck rather than a property of the test.
  //
  // So this asserts the OUTCOME a reader sees — leave a decided photo and its
  // tile says it reopens from the saved copy — and attributes it to nothing.
  // The repaint stays in the app because it removes the dependence on an
  // accident, not because this can see it.
  let tileAfterLeaving = null;
  for (let i = 0; i < 600 && tileAfterLeaving === null; i++) {
    const r = await p.evaluate(() => {
      const strip = document.getElementById("sessionThumbs");
      return {
        released: Number(strip?.dataset.released ?? 0),
        title: strip?.querySelectorAll(".session-thumb")[1]?.title ?? "",
      };
    });
    if (r.released > 0) tileAfterLeaving = r.title;
  }
  if (tileAfterLeaving === null) { console.log("FAIL  the app never released the photo we left"); failed++; tileAfterLeaving = ""; }
  const afterLeaving = await heldCount(p);
  // Photo 1 was decided and let go of; photo 0 never was, so it is still held.
  // The claim is that moving on did not ADD one, which is what an undecided
  // photo does (check 5).
  check("1 a decided photo is not still holding its working state", afterLeaving, [2, 6]);
  // Read from where the reader is STANDING: the photo you are on is held by
  // definition, so its tile must not claim to have been let go of.
  check("1b the tile of the photo you left says it reopens from the saved copy",
    tileAfterLeaving.includes("reopens from the saved copy"), true);
  check("1c the tile you are ON does not say that", (await tileTitle(p, 2)).includes("reopens"), false);

  // Coming back: the picture, the look and the sliders return; the history does not.
  await stepTo(p, 1);
  check("2 the sliders come back exactly", await expo(p), edited);
  check("3 and there is no undo history to take back", await undoOff(p), true);
  check("4 and back on it, the tile no longer claims it is put away",
    (await tileTitle(p, 1)).includes("reopens from the saved copy"), false);

  // An undecided photo keeps everything, exactly as before.
  await stepTo(p, 3);
  await setExpo(p, 300);
  await stepTo(p, 4);
  const undecided = await heldCount(p);
  check("5 an undecided photo is still held, as it always was", undecided[0] >= 3, true);

  // Walking a whole set, deciding as you go.
  for (let i = 0; i < 6; i++) { await stepTo(p, i); await key(p, "p"); }
  await stepTo(p, 0);
  const walked = await heldCount(p);
  console.log(`        after walking all six and deciding on each: ${walked[0]} of ${walked[1]} held`);
  check("6 deciding on every photo leaves at most two holding state", walked[0] <= 2, true);

  // RESET on a photo that was let go of and come back to: it returns to how the
  // photo opens, not to the edit that was restored on top of it.
  await stepTo(p, 1);
  const restored = await expo(p);
  await p.click("#resetBtn");
  await p.waitForTimeout(300);
  const afterReset = await expo(p);
  check("7 Reset on a photo you came back to returns to how it opens",
    [restored === 640, afterReset !== 640], [true, true]);

  // A photo the saved copy CANNOT describe is kept, and the strip says why.
  await stepTo(p, 3);
  await p.click("#ptab-masks");
  await p.evaluate(() => {
    const b = [...document.querySelectorAll("#sec-masks button")].find(x => /brush/i.test(x.textContent || ""));
    b?.click();
  });
  await p.waitForTimeout(500);
  // ENSURE the verdict rather than toggling it: P on a photo that is already
  // picked takes the pick OFF, and this photo was picked by the walk above — so
  // pressing it here left the photo undecided and the check was measuring
  // nothing. Same trap the app's own toggle is meant to be.
  const alreadyPicked = await p.evaluate(() =>
    document.querySelectorAll("#sessionThumbs .session-thumb")[3]?.classList.contains("picked"));
  if (!alreadyPicked) await key(p, "p");
  check("8a the masked photo really is picked before we leave it",
    await p.evaluate(() => document.querySelectorAll("#sessionThumbs .session-thumb")[3]?.classList.contains("picked")), true);
  const heldBefore = await heldCount(p);
  await stepTo(p, 4);
  const heldAfter = await heldCount(p);
  const said = await meta(p);
  console.log(`        held ${heldBefore[0]} -> ${heldAfter[0]} after leaving a masked photo; strip said: ${said}`);
  check("8 a decided photo with brush masks is kept in memory", heldAfter[0] > heldBefore[0] - 1, true);
  check("9 and the strip says so, in words", /kept in memory — it has brush masks/.test(said), true);
  await ctx.close();
} finally { await b.close(); }
console.log(failed?`\n${failed} check(s) failed`:"\nall checks passed");
process.exit(failed?1:0);
