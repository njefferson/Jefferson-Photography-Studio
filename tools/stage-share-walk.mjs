#!/usr/bin/env node
// WHERE THE SCREEN'S HEIGHT GOES ON A PHONE, WITH A PHOTOGRAPH ACTUALLY OPEN.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/stage-share-walk.mjs [--port=8131] [--shots=DIR]
//
// THE INSTRUMENT DECISION 053 CHOSE (docs/decisions/053-*.md, "Measure where
// the height goes first, at named widths with a photograph actually open, then
// decide"). Reported from an iPhone 2026-09-22: a landscape photograph on a
// phone held in portrait is drawn a sliver tall. The arithmetic in that record
// — bar 163, panel 295, stage 198, strip 138, so `#view`'s max-height resolves
// to 28px — came from a harness with NO PHOTOGRAPH ON SCREEN, which reported a
// 0x0 canvas even in the healthy case. This one opens real files first and
// refuses to report a number from a canvas that is not drawn.
//
// WHAT IT READS, at each named size, in two states of the same photograph:
//   - ONE photograph open, so there is no session strip;
//   - TWO open, the same photograph active, so the strip is on screen.
// For each: every track of the shell's grid (bar, update strip, stage, panel),
// what the stage gives the strip (`--session-h` and the strip's own parts),
// the box `#view` is fitted into, and what the photograph is DRAWN at — its
// share of the screen and whether its height or its width is what limits it.
// Then the claims on the height, largest first, which is the question that
// tells the record's candidates apart: the strip collapsing (2), its thumbnails
// scaling (3), the panel yielding (4), or the bar not wrapping (5).
//
// WHAT IT DOES NOT DECIDE. Which candidate is built is the record's call, made
// from these numbers AND from the pictures `--shots` writes, opened and looked
// at (CLAUDE.md, "This is a visual app, not a math app"). Nor does it hold the
// photograph to a minimum share: no source gives a minimum canvas for an
// editor, the record says so rather than inventing one, and so does this.
// It exits 1 only when it could not measure — no photograph drawn, no strip
// when two are open, a portrait file where the report was about a landscape
// one — or when its MADE TO FAIL block (printed before any result) does not
// reproduce what is already known, because a number from a broken instrument
// is worse than no number.
//
// The practice DNGs carry no EXIF and are for decode and geometry only; layout
// is geometry. Chromium widths and fonts, not Safari's: the device's own
// diagnostic ("Strip reserves", "Canvas") is the cross-check on a real phone.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `--${n}=${d}`).split("=")[1];
const PORT = arg("port", "8131");
const SHOTS = arg("shots", "");
const PAGE = `http://127.0.0.1:${PORT}/ir.html`;
const EX = new URL("../public/examples/", import.meta.url).pathname;
// The ACTIVE photograph in both states is the first of these, so the two states
// differ by the strip and nothing else.
const ONE = join(EX, "NIR_0063.dng");
const TWO = [ONE, join(EX, "NIR_0102.dng")];

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1";
const IPAD_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

// The reader's own layout viewport from the report (a 402px iPhone at 1.33x
// page zoom), the same phone unzoomed, and a tall screen past the 760px phone
// breakpoint — the record's claim that the strip costs the same ~138px "whether
// the stage has 700 to give or 198" is checked by the third.
const SIZES = [
  [302, 656, "iPhone at 1.33x page zoom (the reader's own layout viewport)", IPHONE_UA],
  [402, 874, "iPhone, no page zoom", IPHONE_UA],
  [834, 1194, "iPad portrait, past the 760px phone breakpoint", IPAD_UA],
];

let failed = 0;
const fail = (s) => { failed++; console.log(`FAIL  ${s}`); };

/** Every height on the screen that bears on the photograph, in one layout pass.
 *  Takes nothing (runs in the page); gives back integer CSS pixels for the
 *  viewport, each grid track of `#app`, the strip's parts and the drawn canvas,
 *  plus the canvas's intrinsic size and whether the strip is on the stage.
 *  Hidden elements read 0 rather than being skipped, so `tracksSum` is always
 *  comparable with `vh` and an unaccounted remainder is visible. The caller
 *  relies on `drawnW`/`drawnH` being the canvas's on-screen box, not its pixel
 *  buffer: the buffer is `pxW`/`pxH`. */
function readHeights() {
  const h = (el) => (el && !el.hidden ? Math.round(el.getBoundingClientRect().height) : 0);
  const stage = document.getElementById("stage");
  const view = document.getElementById("view");
  const strip = document.getElementById("sessionStrip");
  const thumb = document.querySelector("#sessionThumbs .session-thumb");
  const st = stage.getBoundingClientRect();
  const vr = view.getBoundingClientRect();
  const bar = h(document.querySelector("header.bar"));
  const sw = h(document.getElementById("swStrip"));
  const panel = h(document.getElementById("panel"));
  const sessionVar = getComputedStyle(stage).getPropertyValue("--session-h").trim();
  return {
    vw: innerWidth, vh: innerHeight,
    bar, sw, stage: Math.round(st.height), stageW: Math.round(st.width), panel,
    tracksSum: bar + sw + Math.round(st.height) + panel,
    hasSession: stage.classList.contains("has-session"),
    sessionVar,
    stripH: h(strip),
    headH: strip && !strip.hidden ? h(strip.querySelector(".session-head")) : 0,
    thumbsH: strip && !strip.hidden ? h(document.getElementById("sessionThumbs")) : 0,
    thumb: thumb ? `${Math.round(thumb.getBoundingClientRect().width)}x${Math.round(thumb.getBoundingClientRect().height)}` : "none",
    pxW: view.width, pxH: view.height,
    drawnW: Math.round(vr.width), drawnH: Math.round(vr.height),
    label: view.getAttribute("aria-label") || "",
    panelHidden: document.getElementById("panel")?.hidden ?? true,
  };
}

/** Wait until the layout has stopped moving: the canvas has a box, and two
 *  reads 300ms apart agree on the stage, the strip and the drawn photograph.
 *  Takes the page; gives back true when settled, false after ~15s of motion.
 *  The caller reports an unsettled read as an instrument failure rather than
 *  taking a number off a layout still landing (thumbnails arriving change the
 *  strip's height, and `--session-h` is written after them). */
async function settleLayout(p) {
  let last = "";
  for (let i = 0; i < 50; i++) {
    const r = await p.evaluate(readHeights);
    const key = `${r.stage}|${r.stripH}|${r.sessionVar}|${r.drawnW}x${r.drawnH}|${r.panel}|${r.bar}`;
    if (r.drawnW > 0 && r.drawnH > 0 && key === last) return true;
    last = key;
    await p.waitForTimeout(300);
  }
  return false;
}

/** Open `files` in a fresh page at one size and wait for the photograph.
 *  Takes the browser, the size row from SIZES and the file list; gives back the
 *  page and its context, which the CALLER closes. With two files it also waits
 *  for both tiles to be ready and for the first to be the active one, so the
 *  photograph measured is the same file in both states. */
async function openAt(b, [w, h, , ua], files) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, userAgent: ua, hasTouch: true, serviceWorkers: "block" });
  if (ua === IPAD_UA) await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => 5 }));
  const p = await ctx.newPage();
  p.on("dialog", (d) => d.accept());
  await p.goto(PAGE);
  await p.setInputFiles("#file", files);
  await p.waitForFunction(() => document.getElementById("welcome")?.hidden && !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000, polling: 250 });
  if (files.length > 1) {
    await p.waitForFunction((n) => { const t = [...document.querySelectorAll("#sessionThumbs .session-thumb")]; return t.length === n && t.every((x) => !x.disabled); }, files.length, { timeout: 300000, polling: 250 });
    const first = await p.evaluate(() => document.querySelectorAll("#sessionThumbs .session-thumb")[0]?.classList.contains("active"));
    if (!first) {
      await p.evaluate(() => document.querySelectorAll("#sessionThumbs .session-thumb")[0].click());
      await p.waitForFunction(() => document.querySelectorAll("#sessionThumbs .session-thumb")[0]?.classList.contains("active"), null, { timeout: 300000, polling: 250 });
    }
    await p.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000, polling: 250 });
  }
  return { ctx, p };
}

/** One state's lines, printed. Takes the size label, the state's name and its
 *  readHeights result; prints the shell's tracks, the stage's inside and the
 *  photograph, and returns nothing. Percentages are of the viewport's height,
 *  because height is what a landscape photograph on a portrait phone runs out
 *  of; the drawn AREA share is printed beside it for the width-limited case. */
function report(state, r) {
  const pc = (n) => `${Math.round((n / r.vh) * 100)}%`;
  const unacc = r.vh - r.tracksSum;
  console.log(`  ${state}`);
  console.log(`    shell: bar ${r.bar} (${pc(r.bar)}) · update strip ${r.sw} · stage ${r.stage} (${pc(r.stage)}) · panel ${r.panel} (${pc(r.panel)})${r.panelHidden ? " [hidden]" : ""}${unacc ? ` · unaccounted ${unacc}` : ""}`);
  if (r.hasSession) {
    console.log(`    stage: session strip ${r.stripH} (head ${r.headH}, thumbs row ${r.thumbsH}, one thumb ${r.thumb}) reserved as --session-h ${r.sessionVar || "unset"}`);
    console.log(`           #view's box by its own rule: ${r.stage} - 32 - ${parseInt(r.sessionVar, 10) || 0} = ${r.stage - 32 - (parseInt(r.sessionVar, 10) || 0)} tall`);
  } else {
    console.log(`    stage: no session strip`);
  }
  const limitedBy = r.drawnW >= r.stageW - 40 ? "WIDTH-limited" : "HEIGHT-limited";
  const area = Math.round(((r.drawnW * r.drawnH) / (r.vw * r.vh)) * 1000) / 10;
  console.log(`    photograph: ${r.pxW}x${r.pxH} pixels drawn at ${r.drawnW}x${r.drawnH} — ${limitedBy} — ${pc(r.drawnH)} of the screen's height, ${area}% of its area`);
}

// EVERY READ IS TAKEN FIRST, and printed only after the MADE TO FAIL block
// below has checked the instrument against what is already known.
const runs = [];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
try {
  for (const size of SIZES) {
    const [w, h] = size;
    for (const [state, files] of [["one photograph, no strip", [ONE]], ["two photographs, the strip on screen", TWO]]) {
      const { ctx, p } = await openAt(b, size, files);
      try {
        const settled = await settleLayout(p);
        const r = await p.evaluate(readHeights);
        // THE INSTRUMENT FIRST. Every number from a state like these is
        // meaningless, and the record's own arithmetic was taken from exactly
        // such a state (a 0x0 canvas with no photograph open).
        if (!settled) fail(`${w}x${h} ${state}: the layout never stopped moving, so no read was taken from it`);
        else if (r.pxW === 0 || r.pxH === 0 || r.drawnW === 0 || r.drawnH === 0 || /no photo open/.test(r.label)) fail(`${w}x${h} ${state}: no photograph is drawn (${r.pxW}x${r.pxH} drawn at ${r.drawnW}x${r.drawnH}) — this is the 0x0 state the record's arithmetic came from`);
        else if (r.pxW <= r.pxH) fail(`${w}x${h} ${state}: the photograph is ${r.pxW}x${r.pxH}, not landscape — the report is about a landscape photograph`);
        else if (files.length > 1 && !r.hasSession) fail(`${w}x${h} ${state}: two photographs are open and the stage has no session strip`);
        else if (files.length === 1 && r.hasSession) fail(`${w}x${h} ${state}: one photograph is open and the stage still carries a session strip`);
        else runs.push({ size, state, n: files.length, r });
        if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: join(SHOTS, `stage-${w}x${h}-${files.length === 1 ? "one" : "strip"}.png`) }); }
      } finally {
        await ctx.close();
      }
    }
  }
} finally {
  await b.close();
}

// MADE TO FAIL — three quantities this instrument must reproduce from things
// already known, printed before any result. If any is absent, NOTHING BELOW IS
// TRUSTWORTHY: the walk is reading a different shell, a stale strip, or boxes
// that do not add up to the screen, and its percentages would be confident and
// wrong.
//   1. At 302x656 with the strip on screen the panel is 295px tall: the
//      record's measured figure, and `max-height: 45dvh` of 656 (295.2).
//   2. `--session-h` equals the strip's own measured height in every strip
//      state, because updateSessionStrip writes it from the strip's
//      offsetHeight; a disagreement means the read caught a strip mid-change.
//   3. The shell's tracks (bar, update strip, stage, panel) sum to the
//      viewport's height within 1px in every state, or a track is missing
//      from the account and the "largest claim" below is not the largest.
console.log("\nMADE TO FAIL — known quantities the instrument must reproduce:");
let known = 0;
const knownCheck = (ok, s) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${s}`); if (!ok) { known++; failed++; } };
const reader = runs.find((x) => x.size[0] === 302 && x.n === 2);
knownCheck(!!reader && reader.r.panel === 295, `302x656, strip on screen: panel ${reader ? reader.r.panel : "not measured"}px, want 295 (the record's figure; 45dvh of 656)`);
for (const x of runs.filter((y) => y.n === 2)) {
  knownCheck(parseInt(x.r.sessionVar, 10) === x.r.stripH, `${x.size[0]}x${x.size[1]}: --session-h ${x.r.sessionVar || "unset"} against the strip's measured ${x.r.stripH}px`);
}
for (const x of runs) {
  knownCheck(Math.abs(x.r.vh - x.r.tracksSum) <= 1, `${x.size[0]}x${x.size[1]}, ${x.state}: the shell's tracks sum to ${x.r.tracksSum} of ${x.r.vh}`);
}
if (known) console.log(`  ${known} known quantit${known === 1 ? "y was" : "ies were"} not reproduced — NOTHING BELOW IS TRUSTWORTHY until that is explained`);

for (const size of SIZES) {
  const [w, h, name] = size;
  console.log(`\n${w}x${h} · ${name}`);
  const a = runs.find((x) => x.size === size && x.n === 1);
  const s = runs.find((x) => x.size === size && x.n === 2);
  if (a) report(a.state, a.r);
  if (s) report(s.state, s.r);
  // WHAT THE STRIP COSTS THE PHOTOGRAPH, measured as the difference between
  // the two states rather than derived from the CSS rule, and the claims on
  // the height in the strip state, largest first.
  if (a && s) {
    console.log(`  the strip costs the photograph ${a.r.drawnH - s.r.drawnH}px of drawn height (${a.r.drawnH} -> ${s.r.drawnH}), against --session-h ${s.r.sessionVar}`);
    const claims = [["bar", s.r.bar], ["panel", s.r.panel], ["session strip", s.r.stripH], ["update strip", s.r.sw], ["photograph", s.r.drawnH]]
      .filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]);
    console.log(`  claims on ${s.r.vh}px of height, largest first: ${claims.map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  }
}
console.log(failed
  ? `\n${failed} check(s) failed — the measurement is incomplete or the instrument is wrong; read the lines above before any number`
  : `\nmeasured at ${SIZES.length} sizes${SHOTS ? `; screenshots in ${SHOTS} — open them before reading the numbers` : ""}`);
process.exit(failed ? 1 : 0);
