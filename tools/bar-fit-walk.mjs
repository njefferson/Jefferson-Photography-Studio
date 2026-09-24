#!/usr/bin/env node
// THE TOP BAR IS ONE ROW, AND THE START CARD SHOWS ITS PRACTICE PHOTOS.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/bar-fit-walk.mjs [--port=8131] [--shots=DIR]
//
// WHAT THIS HOLDS THE APP TO IS THE APP'S OWN STATED DESIGN, not a taste call.
// The bar was designed as one 56px row (`src/style.css`, "Top bar: 56px"), and
// its 44px buttons are justified by that height ("The bar is 56px, so the
// honest box fits"). The start card's short-screen rule exists "so the
// practice grid peeks above the fold instead of hiding entirely below it".
// Both have stopped being true and nothing measured either.
//
// WHY IT EXISTS. Reported from the device, 2026-09-24: on a landscape iPad the
// bar wraps to two rows with an empty band across the middle, and the start
// card is a list of equal-weight entries. Measured in Chromium the same day:
// the bar's right-hand group needs about 1020px and gets 736 at 1194 wide and
// 376 at 834, so portrait takes four rows and leaves the photograph 14% of the
// screen; the start card at 1180x820 under iPad emulation shows no practice
// photograph above its fold. Every other walk here runs at 1100, 1280, 900 or
// 402 wide, so none of them sat at an iPad's width.
//
// WHAT IT DOES NOT DECIDE. Which controls leave the bar, where they go, and
// what the start card becomes are choices between rendered candidates
// (record 003's rejected "single app-wide layout pass" and its list of taste
// questions not to guess). This walk only says whether a candidate meets the
// two properties above, at the widths the app is actually used at.
//
// IPAD EMULATION: iPadOS Safari reports itself as a Mac, so the start card's
// iOS-only paragraph appears only when the user agent says Mac AND the touch
// point count is above one, which is what the app itself tests. Chromium
// widths, not Safari's fonts: a pass here is necessary, not sufficient.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { requireFreshDist } from "./fresh-dist.mjs";
requireFreshDist();

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `--${n}=${d}`).split("=")[1];
const PORT = arg("port", "8131");
const SHOTS = arg("shots", "");
const URL = `http://127.0.0.1:${PORT}/ir.html`;
const DNG = "public/examples/NIR_0063.dng";
const IPAD_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
let failed = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "ok  " : "FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) failed++; };

/** Rows the bar's visible controls sit on, clustered by vertical midpoint.
 *  Takes nothing (runs in the page); gives back `{ all, actions, scrolls,
 *  barH }` where `all` and `actions` are row counts for every control in the
 *  bar and for the `.bar-actions` group, and `scrolls` is whether that group
 *  overflows sideways. A control counts only if it has a box, so a hidden one
 *  never adds a row. */
function barRows() {
  const bar = document.querySelector("header.bar");
  const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
  const rowsOf = (els) => {
    const mids = [];
    for (const el of els) {
      if (!shown(el)) continue;
      const r = el.getBoundingClientRect();
      const m = r.top + r.height / 2;
      if (!mids.some((x) => Math.abs(x - m) < 14)) mids.push(m);
    }
    return mids.length;
  };
  const acts = bar.querySelector(".bar-actions");
  const ctl = "button, a, label, .bar-sep";
  return {
    all: rowsOf(bar.querySelectorAll(ctl)),
    actions: acts ? rowsOf(acts.querySelectorAll(ctl)) : 0,
    scrolls: acts ? acts.scrollWidth > acts.clientWidth + 1 : false,
    barH: Math.round(bar.getBoundingClientRect().height),
    photoPct: (() => { const v = document.getElementById("view").getBoundingClientRect(); return Math.round((v.width * v.height) / (innerWidth * innerHeight) * 100); })(),
  };
}

/** How much of the first practice photograph the start card shows before any
 *  scrolling. Takes nothing (runs in the page); gives back the pixels of the
 *  first tile inside the card's visible box and the tile's own height, so the
 *  caller can require the whole tile rather than a sliver of it. */
function firstPracticeTile() {
  const card = document.getElementById("welcome");
  const tile = document.querySelector("#galleryList > *");
  if (!card || !tile) return { visible: 0, tileH: 0, found: false };
  const c = card.getBoundingClientRect();
  const t = tile.getBoundingClientRect();
  return { visible: Math.max(0, Math.round(Math.min(c.bottom, t.bottom) - Math.max(c.top, t.top))), tileH: Math.round(t.height), found: true };
}

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
try {
  // 1 · THE BAR, WITH A PHOTOGRAPH OPEN, at the three widths it is used at.
  // Landscape and portrait iPad take the whole bar on one row; the phone has
  // a planned identity row above its actions, so there the requirement is
  // that the actions are one row that does not scroll sideways.
  for (const [w, h, name, wantAll] of [[1194, 834, "iPad landscape", 1], [834, 1194, "iPad portrait", 1], [390, 844, "phone", 2]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, serviceWorkers: "block" });
    const p = await ctx.newPage();
    p.on("dialog", (d) => d.accept());
    await p.goto(URL);
    await p.setInputFiles("#file", DNG);
    await p.waitForFunction(() => document.getElementById("welcome")?.hidden && !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000, polling: 250 });
    await p.waitForTimeout(600);
    const r = await p.evaluate(barRows);
    check(`${name} ${w}x${h}: the bar is ${wantAll === 1 ? "one row" : "the identity row plus one row of actions"}`,
      r.all <= wantAll && r.actions === 1 && !r.scrolls,
      `${r.all} row(s) in all, ${r.actions} of actions${r.scrolls ? ", scrolling sideways" : ""} · bar ${r.barH}px · photograph ${r.photoPct}% of the screen`);
    if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: join(SHOTS, `bar-${w}x${h}.png`) }); }
    await ctx.close();
  }

  // 2 · THE START CARD ON A LANDSCAPE IPAD, as Safari presents itself.
  {
    const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, userAgent: IPAD_UA, hasTouch: true, serviceWorkers: "block" });
    await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => 5 }));
    const p = await ctx.newPage();
    await p.goto(URL);
    await p.waitForTimeout(1500);
    const t = await p.evaluate(firstPracticeTile);
    check("iPad landscape 1180x820: the first practice photograph shows whole before any scrolling",
      t.found && t.tileH > 0 && t.visible >= t.tileH,
      t.found ? `${t.visible} of its ${t.tileH}px on screen` : "no practice photograph in the card at all");
    if (SHOTS) await p.screenshot({ path: join(SHOTS, "start-1180x820.png") });
    await ctx.close();
  }
} finally {
  await b.close();
}
// RED UNTIL 060 LANDS, AND IT SAYS SO. This walk was committed failing on
// purpose, as the instrument the candidates are judged by, so `walk-all` shows
// it red until the first product change of decision 060. It still exits 1:
// a red that explains itself is not a red that is hidden.
console.log(failed
  ? `\n${failed} check(s) failed — expected until decision 060's first product change lands (docs/decisions/060-*.md)`
  : "\nthe bar is one row and the practice photographs show");
process.exit(failed ? 1 : 0);
