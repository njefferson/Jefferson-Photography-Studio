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
import { chromium } from "playwright-core";
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
    selected: (document.querySelectorAll("#maskList .mask-row").length > 0),
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
  await p.click("#ptab-masks"); await p.click("#addRadial"); await settle(p);

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
  await ctx.close();
} finally { await b.close(); }
console.log(failed ? `\n${failed} failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
