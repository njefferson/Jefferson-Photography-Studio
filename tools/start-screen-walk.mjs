#!/usr/bin/env node
// THE START SCREEN AND THE EDITOR DRAWER ARE NEVER BOTH ON SCREEN.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/start-screen-walk.mjs [--port=8131] [--shots=DIR]
//
// WHY IT EXISTS. Reported from an iPhone, 2026-09-21: pressing Home after
// editing a photograph does not dismiss the menu, and the start screen arrives
// looking wrong. The screenshot shows the start card squeezed into a short box
// with its own scroll cue showing, and the whole editor drawer — twelve tab
// buttons and the Basic section — stacked underneath it.
//
// ONE CAUSE, BOTH SYMPTOMS, AND THE DIAGNOSTIC CARRIES IT. `#welcome` is
// absolutely positioned inside the stage at `max-height: 92%`, so the card can
// only ever be as tall as the stage. The report says "inside a stage of
// 402x272" on a window of 402x812: the drawer had two thirds of the screen, so
// the card had 250px and clipped. Hide the drawer and the stage takes the
// window, which is what the cold start has always done.
//
// WHY THE DRAWER WAS THERE AT ALL: `goHome` calls `disarmPictureTools()`,
// which calls `setGeoMode(null)`, whose last act is `else if (current)
// panel.hidden = false` — the line that UN-TUCKS the drawer when a geometry
// tool exits. Leaving a photograph therefore re-showed the drawer every time.
//
// THIS IS MEASURED AT PHONE METRICS ON PURPOSE. On a wide window the drawer is
// a side column and the stage keeps its height, so the card never clips and
// the defect is invisible — every walk in this directory before this one ran
// at 1100px or wider.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { requireFreshDist } from "./fresh-dist.mjs";
requireFreshDist();

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `--${n}=${d}`).split("=")[1];
const PORT = arg("port", "8131");
const SHOTS = arg("shots", "");
let failed = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "ok  " : "FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) failed++; };
const settle = async (p) => { await p.waitForTimeout(350); await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); };

/** What is actually on screen, measured rather than inferred from an attribute:
 *  an element with no `offsetParent` and no box is not drawn, however it was
 *  hidden — the `hidden` attribute, `display:none` on an ancestor, or a CSS
 *  rule. `masksTabInFront`'s own contract records what it cost to read one of
 *  those and not the others. */
const onScreen = (p, id) => p.evaluate((i) => {
  const el = document.getElementById(i);
  if (!el) return { exists: false, shown: false, h: 0 };
  const r = el.getBoundingClientRect();
  return { exists: true, shown: !!(el.offsetParent || r.height > 0) && r.height > 0 && r.width > 0, h: Math.round(r.height), top: Math.round(r.top) };
}, id);

/** Is the start card showing all of itself, or is it a scroll box? This is the
 *  half a reader sees first: the card in the report was cut off mid-sentence
 *  with a cue pointing down. */
const cardFits = (p) => p.evaluate(() => {
  const w = document.getElementById("welcome");
  const cue = document.getElementById("welcomeCue");
  return {
    clipped: w.scrollHeight > w.clientHeight + 2,
    scrollH: w.scrollHeight, clientH: w.clientHeight,
    cueShown: !!cue && !cue.hidden,
    stageH: Math.round(document.getElementById("stage").getBoundingClientRect().height),
    winH: window.innerHeight,
  };
});

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
try {
  // The reported window, exactly: iPhone at 402x812 with the app installed.
  const ctx = await b.newContext({ viewport: { width: 402, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on("dialog", (d) => d.accept());
  await p.goto(`http://127.0.0.1:${PORT}/ir.html`);

  // 1 · THE COLD START IS THE REFERENCE, AND IT IS A MEASUREMENT RATHER THAN A
  // JUDGEMENT. This check first asserted the card was not a scroll box and went
  // red on a cold start: 1703px of content in a 641px box. That is not a defect
  // — the start card carries the tagline, Open, the iCloud note, Quick look,
  // the tutorials and the resume row, which is more than a phone screen holds,
  // and `#welcomeCueUp`/`#welcomeCue` exist precisely to say so. What the
  // reported defect actually is, is the card being given a THIRD of the room
  // the cold start gives it. So the cold start's stage height is recorded here
  // and the check after Home is held against it.
  await settle(p);
  const coldPanel = await onScreen(p, "panel");
  const cold = await cardFits(p);
  check("a cold start shows the start card with no drawer under it",
    !coldPanel.shown,
    `drawer ${coldPanel.shown ? "on screen" : "away"} · card ${cold.scrollH}px of content in ${cold.clientH}px · stage ${cold.stageH} of ${cold.winH}`);

  await p.setInputFiles("#file", ["public/examples/NIR_1651.dng"]);
  await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
  await p.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
  await settle(p);

  // 2 · WITH A PHOTOGRAPH OPEN THE DRAWER IS ON SCREEN. The check above and
  // this one are the two directions, so a walk that simply never finds the
  // drawer cannot pass.
  const editing = await onScreen(p, "panel");
  check("with a photograph open, the drawer is on screen", editing.shown, `${editing.h}px tall`);

  // ...and an edit is made, because that is what was reported: pressing Home
  // AFTER editing.
  // EXPOSURE IS 0..1000 IN WHOLE STEPS, not a stop value. The first version of
  // this walk drove it to "0.35", which clamps to 0 — and then read 0 back
  // after the round trip and reported the edit as LOST. The app was right and
  // the instrument was wrong; the probe that settled it set a real value and
  // watched it survive.
  const openedAt = Number(await p.getAttribute("#expo", "value"));
  const edited = String(Math.min(1000, openedAt + 90));
  await p.evaluate((v) => { const el = document.getElementById("expo"); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, edited);
  await settle(p);
  check("the edit took", (await p.evaluate(() => document.getElementById("expo").value)) === edited, `exposure ${openedAt} -> ${edited}`);
  if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: join(SHOTS, "01-editing.png") }); }

  // 3 · PRESS HOME.
  await p.click("#homeBtn");
  await settle(p);
  if (SHOTS) await p.screenshot({ path: join(SHOTS, "02-after-home.png"), fullPage: true });
  const home = await onScreen(p, "panel");
  const card = await cardFits(p);
  check("pressing Home tucks the editor drawer away",
    !home.shown, home.shown ? `the drawer is still ${home.h}px tall at y=${home.top}` : "away");
  check("...so the start card gets the same room the cold start gives it",
    card.stageH >= cold.stageH - 2,
    `stage ${card.stageH} of ${card.winH}, against ${cold.stageH} cold · card ${card.scrollH}px of content in ${card.clientH}px · cue ${card.cueShown ? "showing" : "hidden"}`);

  // 4 · AND BACK AGAIN, because a tuck that does not come back is a worse
  // defect than the one being fixed.
  await p.click("#welcomeBack");
  await settle(p);
  const back = await onScreen(p, "panel");
  const stillEdited = await p.evaluate(() => document.getElementById("expo")?.value ?? "");
  check("Back to your photo brings the drawer back, with the edit still on it",
    back.shown && stillEdited === edited,
    `drawer ${back.h}px · exposure ${stillEdited}, set to ${edited}`);
  if (SHOTS) await p.screenshot({ path: join(SHOTS, "03-back-to-the-photo.png") });

  // 5 · AND THE TAB THE READER WAS ON SURVIVES THE ROUND TRIP, since the drawer
  // is being hidden and shown rather than rebuilt.
  await p.click("#ptab-masks");
  await settle(p);
  await p.click("#homeBtn");
  await settle(p);
  await p.click("#welcomeBack");
  await settle(p);
  const tab = await p.getAttribute("#ptab-masks", "aria-selected");
  check("the tab you were on is still the tab you come back to", tab === "true", `masks aria-selected=${tab}`);

  if (SHOTS) console.log(`\n  shots in ${SHOTS} — OPEN THEM. The numbers say the drawer is away; only the picture says the card looks right.\n`);
} finally { await b.close(); }
console.log(failed ? `\n${failed} failed` : "\nthe start screen and the editor drawer are never both on screen");
process.exit(failed ? 1 : 0);
