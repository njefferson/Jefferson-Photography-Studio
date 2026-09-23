#!/usr/bin/env node
// FULL VIEW SHOWS THE PHOTOGRAPH, NOT THE MASK OVER IT.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/fullview-mask-walk.mjs [--port=8131] [--plant]
//
// WHY IT EXISTS (decision 037). Full view's whole purpose is to take everything
// away except the picture, and the mask overlay went with it: the coverage tint
// in the shader AND the dotted handle outline in the DOM. The condition that
// decides the overlay listed six things and full view was not one of them.
//
// IT READS BOTH HALVES SEPARATELY, because they live in different places and a
// fix to one is not a fix to the other. The outline is a DOM element and is
// asked directly. The TINT is in the canvas, so it is read as a share of the
// frame carrying the overlay's own colour — the same measurement mask-fix-walk
// uses, and for the same reason: the photograph's own colours cannot be
// mistaken for it.
//
// THE MASK STAYS SELECTED THROUGHOUT. A walk that found the overlay gone
// because the mask had been deselected would pass while reporting nothing, so
// the selection is asserted on the far side.
//
// --plant skips the full-view press. Two checks must go red.
import { openMasks } from "./walk-input.mjs";
import { chromium } from "playwright-core";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const PLANT = process.argv.includes("--plant");
const OUT = "/tmp/fullview-mask";
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "ok  " : "FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) failed++; };
const settle = async (p) => { await p.waitForTimeout(700); await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); };

/** The overlay, read from both places it lives. `tint` is the share of the
 *  canvas carrying the cool overlay colour; `outline` is whether the dotted
 *  handle layer is showing at all. */
const overlay = (p) => p.evaluate(() => {
  const c = document.getElementById("view");
  const oc = document.createElement("canvas"); oc.width = c.width; oc.height = c.height;
  oc.getContext("2d").drawImage(c, 0, 0);
  const d = oc.getContext("2d").getImageData(0, 0, oc.width, oc.height).data;
  let n = 0, cool = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const V = Math.max(r, g, b), m = Math.min(r, g, b);
    n++;
    if (V > 1e-4 && (V - m) / V > 0.06 && b >= g && g > r) cool++;
  }
  const ov = document.getElementById("maskOverlay");
  return {
    tint: cool / n,
    outline: !!ov && !ov.hasAttribute("hidden"),
    // THE SELECTION, not a row count. This read `#maskList .mask-row`.length,
    // which is "a mask exists" — it would have passed on a build that dropped
    // the SELECTION to make the overlay go away, which is the one fix this
    // check exists to refuse. The editor panel is only shown for a selected
    // mask, so its visibility is the honest proxy.
    selected: !!document.getElementById("skyControls") || !!document.querySelector("#maskList .mask-row.sel, #maskList .mask-row[aria-current], #maskList .mask-row.active"),
    rows: document.querySelectorAll("#maskList .mask-row").length,
    full: document.getElementById("app")?.dataset.full === "1",
    png: oc.toDataURL("image/png"),
  };
});

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage(); p.on("dialog", (d) => d.accept());
  await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
  await p.setInputFiles("#file", ["public/examples/NIR_1651.dng"]);
  await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
  await p.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
  await settle(p);
  // A RADIAL, not the sky — it is the only kind with a dotted handle outline,
  // so it is the one frame where both halves can be read at once.
  await openMasks(p); await p.click("#addRadial"); await settle(p);

  const before = await overlay(p);
  writeFileSync(join(OUT, "1-editing.png"), Buffer.from(before.png.split(",")[1], "base64"));
  check("the overlay is up while editing the mask", before.tint > 0.02 && before.outline,
    `${(100 * before.tint).toFixed(1)}% of the frame tinted, outline ${before.outline ? "showing" : "HIDDEN"}`);

  if (!PLANT) { await p.click("#fullViewBtn"); await settle(p); }
  const full = await overlay(p);
  writeFileSync(join(OUT, "2-full.png"), Buffer.from(full.png.split(",")[1], "base64"));
  check("full view is on", PLANT || full.full);
  check("full view drops the coverage tint", full.tint < before.tint / 3,
    `${(100 * before.tint).toFixed(1)}% -> ${(100 * full.tint).toFixed(1)}%`);
  check("and the dotted outline with it", !full.outline,
    full.outline ? "the outline is still showing" : "gone");
  // NOT BY DESELECTING THE MASK — that would make both checks above pass while
  // losing the reader's work, which is the fix this walk must refuse.
  check("the mask is still there", full.selected, full.selected ? "still selected" : "THE MASK WAS DROPPED");

  if (!PLANT) {
    // LEAVING IS NOT THE BUTTON. Full view hides the chrome, which is the whole
    // point of it, so the control that opened the mode is not there to close
    // it — a first version of this walk clicked it and timed out against an
    // invisible element. Escape and a tap on the photograph are the two ways
    // out, and Escape is the one a harness can be sure of.
    await p.keyboard.press("Escape"); await settle(p);
    const back = await overlay(p);
    writeFileSync(join(OUT, "3-back.png"), Buffer.from(back.png.split(",")[1], "base64"));
    check("leaving brings the overlay back", back.tint > 0.02 && back.outline,
      `${(100 * back.tint).toFixed(1)}% tinted, outline ${back.outline ? "showing" : "HIDDEN"}`);
  }

/** THE MATTE'S OWN YELLOW, which is what the sky part below turns on. The
 *  `overlay` reader above counts the COOL tint, and with the matte showing
 *  there is none — so a coverage check written with it compared 0.0% against
 *  0.0% and passed without measuring anything. Caught on this walk's own first
 *  green run; a check that cannot move is not a check. */
const matteShare = (pg) => pg.evaluate(() => {
  const c = document.getElementById("view");
  const oc = document.createElement("canvas"); oc.width = c.width; oc.height = c.height;
  oc.getContext("2d").drawImage(c, 0, 0);
  const d = oc.getContext("2d").getImageData(0, 0, oc.width, oc.height).data;
  let n = 0, y = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const V = Math.max(r, g, b); n++;
    if (g > 0.75 * r && b < 0.6 * g && V > 0.45) y++;
  }
  return y / n;
});

  // --- AN ARMED HAND CORRECTION MUST NOT FIRE IN FULL VIEW ------------------
  // The defect this exists for, found 2026-09-20 by a review and not by any
  // walk: `renderMaskOverlay` was given a full-view term and `skyFixOn` — a
  // SECOND copy of the same "is the Masks tab in front of the reader" rule —
  // was not. Full view hides the panel with CSS and never with the `hidden`
  // attribute, so `panel.hidden` stayed false and an armed correction still
  // owned the canvas.
  //
  // What that cost: the tap that LEAVES full view is one of the documented ways
  // out, and it was taken by `startFix` instead — a dab stamped and a stroke
  // recorded, with the overlay standing down so nothing on screen said so. The
  // reader came back carrying a correction to their own selection that they
  // never made.
  //
  // A SKY MASK, because the hand correction only exists on one. The radial
  // above is for the dotted outline, which a sky mask does not have.
  await p.evaluate(() => { document.querySelectorAll("#maskList .mask-del").forEach((b) => b.click()); });
  await settle(p);
  await p.click("#addSky"); await settle(p);
  await p.click("#mMatte"); await settle(p);
  const beforeFix = await matteShare(p);
  const statusBefore = (await p.textContent("#mSkyStatus")) || "";
  await p.click("#mSkyFixAdd"); await settle(p);
  const armed = (await p.getAttribute("#mSkyFixAdd", "aria-pressed")) === "true";
  check("the hand correction is armed", armed);

  if (!PLANT) { await p.click("#fullViewBtn"); await settle(p); }
  const inFull = await p.evaluate(() => document.getElementById("app")?.dataset.full === "1");
  check("full view is on with the correction still armed", PLANT || inFull);

  // THE TAP. On the photograph, which is how a reader leaves full view.
  const box = await p.locator("#view").boundingBox();
  await p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.25);
  await p.mouse.down(); await p.mouse.up();
  await settle(p);

  const afterFix = await matteShare(p);
  const statusAfter = (await p.textContent("#mSkyStatus")) || "";
  check("the tap did NOT record a hand correction", !/correction by hand/.test(statusAfter),
    statusAfter.trim().slice(0, 110));
  // ASSERTED AS A REAL NUMBER, not two zeroes: the matte has to be covering
  // something for "unchanged" to mean anything at all.
  check("the matte is actually showing a selection", beforeFix > 0.1,
    `${(100 * beforeFix).toFixed(1)}% of the frame`);
  check("and the selection is untouched", Math.abs(afterFix - beforeFix) < 0.005,
    `${(100 * beforeFix).toFixed(1)}% -> ${(100 * afterFix).toFixed(1)}%`);
  check("the status line is the one it started with", statusAfter.trim() === statusBefore.trim(),
    statusAfter.trim() === statusBefore.trim() ? "unchanged" : `was "${statusBefore.trim().slice(0, 60)}"`);

  await ctx.close();
} finally { await b.close(); }
console.log(failed ? `\n${failed} failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
