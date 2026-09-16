#!/usr/bin/env node
// RENDER THE CANDIDATES AND SEND THE PICTURES.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/look-sheet.mjs [--port=8131] [--file=/path/to/frame] [--out=DIR]
//
// A decision about how a photograph LOOKS cannot be put in a numbered list. The
// owner is being asked to judge an appearance, and prose about hue and
// saturation is not an appearance — so this renders each candidate through the
// REAL pipeline and writes a PNG, and the comparison is the app's own output
// rather than a description of it. CLAUDE.md carries the rule.
//
// EVERY CANDIDATE IS EXPRESSED AS CONTROLS THE READER ALSO HAS. That is the
// point, not a limitation: a rendering reachable only by editing the look table
// is not something they can try, adjust or undo, and showing one would be
// offering a choice that does not exist on the device. Each step below is a tab
// press or a slider, in the order a hand would do them.
//
// It renders. It does not choose. What each candidate costs — what it does to
// the sky while it fixes the foliage — belongs in the report beside the pictures.
import { chromium } from "playwright-core";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split("=").slice(1).join("=");
const PORT = arg("port", "8131");
const BASE = `http://127.0.0.1:${PORT}`;
// A REAL RAW. The first run used a camera JPEG and answered about the wrong
// file: a JPEG takes the other side of every per-kind split in `aero` and opens
// unbalanced by design. The 44 practice DNGs are minimal hand-written files
// (IR-SCIENCE.md section 7) and are the wrong instrument for a colour question.
const FILE = arg("file", "/tmp/claude-0/-home-user/2bd37282-d617-5a51-b357-6b20783a5840/scratchpad/real/NIR_1376.NEF");
const OUT = arg("out", "/tmp/claude-0/-home-user/2bd37282-d617-5a51-b357-6b20783a5840/scratchpad/looksheet");

// Each candidate: a name, a one-line note on what it is reaching for, and the
// controls to touch. `set` writes a slider and fires the events the app listens
// for; `tap` presses a button.
const CANDIDATES = [
  { name: "0-aerochrome-button-as-is", note: "the Aerochrome look button exactly as it ships: the R/B swap, nothing else",
    steps: [["tap", "#ptab-ir"], ["tap", "#lookAero"]] },
  { name: "1-mixer-preset-labelled-Aerochrome", note: "the mixer preset CALLED Aerochrome: red<-green, green<-blue, blue<-red",
    steps: [["tap", "#ptab-ir"], ["tap", "#lookAero"], ["tap", "#ptab-color"], ["mix", "2"]] },
  { name: "2-mixer-preset-labelled-Rotate", note: "the preset called Rotate: red<-blue, green<-red, blue<-green — the matrix the two-swap recipe produces",
    steps: [["tap", "#ptab-ir"], ["tap", "#lookAero"], ["tap", "#ptab-color"], ["mix", "4"]] },
  { name: "3-rotate-without-the-look-swap", note: "the rotation alone, with the look's own R/B swap turned back off, so the rotation is not applied on top of a swap",
    steps: [["tap", "#ptab-ir"], ["tap", "#lookAero"], ["tap", "#swapBtn"], ["tap", "#ptab-color"], ["mix", "4"]] },
];


mkdirSync(OUT, { recursive: true });
if (!existsSync(FILE)) { console.log(`no frame at ${FILE}`); process.exit(1); }

const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
try {
  const p = await br.newPage({ viewport: { width: 1100, height: 900 } });
  for (const c of CANDIDATES) {
    // A FRESH PAGE PER CANDIDATE. Looks and grades persist across opens by
    // design, so running them in one session would stack candidate 3 on top of
    // candidate 2 and every picture after the first would be a lie.
    await p.goto(`${BASE}/ir.html`, { waitUntil: "load" });
    await p.setInputFiles("#file", [FILE]);
    await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
    await p.waitForTimeout(2200);
    for (const [how, sel, val] of c.steps) {
      if (how === "mix") {
        // The preset chips are built from MIX3_PRESETS at runtime and carry no
        // ids, so they are pressed by index: 0 Identity, 1 R/B swap,
        // 2 Aerochrome, 3 Copper, 4 Rotate.
        await p.evaluate((i) => document.querySelectorAll("#mix3Presets .mix-chip")[Number(i)]?.click(), sel);
      } else if (how === "tap") await p.click(sel).catch(() => {});
      else await p.evaluate(([s, v]) => {
        const el = document.querySelector(s);
        if (!el) return;
        el.value = v;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, [sel, val]);
      await p.waitForTimeout(450);
    }
    // SETTLE ON A CONDITION, NOT A CLOCK. The 900ms wait this replaces is what
    // captured the baseline mid-render, and a guessed wait is the same defect as
    // a guessed sleep: it learns nothing about the thing it waits for. Two
    // consecutive readings of the canvas that agree means the render is done.
    let last = "", settled = false;
    for (let i = 0; i < 40; i++) {
      const sig = await p.evaluate(() => {
        const cv = document.querySelector("#view");
        const g = cv.getContext("webgl2") || cv.getContext("webgl");
        const b = new Uint8Array(cv.width * cv.height * 4);
        g.readPixels(0, 0, cv.width, cv.height, g.RGBA, g.UNSIGNED_BYTE, b);
        let h = 2166136261;
        for (let k = 0; k < b.length; k += 4 * 31) { h ^= b[k]; h = Math.imul(h, 16777619); }
        return String(h >>> 0);
      });
      if (sig === last) { settled = true; break; }
      last = sig;
      await p.waitForTimeout(250);
    }
    if (!settled) console.log(`  ${c.name}: never settled — this picture is not trustworthy`);
    const path = `${OUT}/${c.name}.png`;
    await p.locator("#view").screenshot({ path });
    c.sha = createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 12);
    // The numbers beside the picture, on the populations rather than the frame:
    // a mean over a false-colour IR frame lands on grey (IR-SCIENCE section 6).
    const m = await p.evaluate(() => {
      const cv = document.querySelector("#view");
      const g = cv.getContext("webgl2") || cv.getContext("webgl");
      const b = new Uint8Array(cv.width * cv.height * 4);
      g.readPixels(0, 0, cv.width, cv.height, g.RGBA, g.UNSIGNED_BYTE, b);
      const red = [], teal = [];
      for (let i = 0; i < b.length; i += 4 * 7) {
        const r = b[i], gg = b[i + 1], bb = b[i + 2];
        if (b[i + 3] === 0) continue;
        const mx = Math.max(r, gg, bb), mn = Math.min(r, gg, bb);
        if (mx - mn < 12) continue;
        let h; const d = mx - mn;
        if (mx === r) h = ((gg - bb) / d) % 6; else if (mx === gg) h = (bb - r) / d + 2; else h = (r - gg) / d + 4;
        h = (((h * 60) % 360) + 360) % 360;
        const rec = { s: mx ? d / mx : 0, v: mx / 255 };
        if (h > 320 || h < 40) red.push(rec); else if (h > 140 && h < 220) teal.push(rec);
      }
      const avg = (a, k) => (a.length ? a.reduce((x, y) => x + y[k], 0) / a.length : 0);
      return { redN: red.length, redS: avg(red, "s"), redV: avg(red, "v"), tealN: teal.length, tealS: avg(teal, "s"), tealV: avg(teal, "v") };
    });
    console.log(`${c.name.padEnd(24)} foliage sat ${m.redS.toFixed(2)} value ${m.redV.toFixed(2)}  ·  sky sat ${m.tealS.toFixed(2)} value ${m.tealV.toFixed(2)}  — ${c.note}`);
  }
} finally { await br.close(); }

// THE SELF-CHECK, AND IT IS THE POINT OF THE TOOL. Two candidates that set
// different values must RENDER differently. The first run handed over three
// pictures that were byte-identical across three different Sky-band settings and
// said nothing — a sheet whose differences are not real is a check that passes
// against the defect, except what it misleads is a taste decision, where being
// wrong moves the answer rather than just missing it.
let twins = 0;
for (let i = 0; i < CANDIDATES.length; i++) {
  for (let j = i + 1; j < CANDIDATES.length; j++) {
    const a = CANDIDATES[i], b = CANDIDATES[j];
    if (JSON.stringify(a.steps) === JSON.stringify(b.steps)) continue; // same recipe, same picture: fine
    if (a.sha && a.sha === b.sha) {
      twins++;
      console.log(`\nIDENTICAL: "${a.name}" and "${b.name}" set different values and rendered the same picture (${a.sha}).`);
      console.log(`  Those controls are not reaching the render. The sheet is NOT valid — do not hand it over.`);
    }
  }
}
console.log(twins
  ? `\n${twins} pair(s) identical. ${OUT} is written but must not be presented as a comparison.\n`
  : `\n${CANDIDATES.length} candidates, all distinct, written to ${OUT}\n`);
process.exit(twins ? 1 : 0);
