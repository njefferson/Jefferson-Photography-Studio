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
import { mkdirSync, existsSync } from "node:fs";
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split("=").slice(1).join("=");
const PORT = arg("port", "8131");
const BASE = `http://127.0.0.1:${PORT}`;
const FILE = arg("file", "/tmp/claude-0/-home-user/2bd37282-d617-5a51-b357-6b20783a5840/scratchpad/real/NIR_2821.JPG");
const OUT = arg("out", "/tmp/claude-0/-home-user/2bd37282-d617-5a51-b357-6b20783a5840/scratchpad/looksheet");

// Each candidate: a name, a one-line note on what it is reaching for, and the
// controls to touch. `set` writes a slider and fires the events the app listens
// for; `tap` presses a button.
const CANDIDATES = [
  { name: "0-as-it-ships", note: "Aerochrome exactly as it is today — the baseline every other frame is judged against",
    steps: [["tap", "#ptab-ir"], ["tap", "#lookAero"]] },
  { name: "1-value-from-the-look", note: "the red taken DOWN in brightness, which is where the film's crimson lives",
    steps: [["tap", "#ptab-ir"], ["tap", "#lookAero"], ["tap", "#ptab-color"], ["set", "#skyLum", "0.72"]] },
  { name: "2-saturation-only", note: "the band pushed to its ceiling and nothing else — what the slider alone can reach",
    steps: [["tap", "#ptab-ir"], ["tap", "#lookAero"], ["tap", "#ptab-color"], ["set", "#skySat", "2"]] },
  { name: "3-both", note: "saturation up and value down together, since the two are not independent",
    steps: [["tap", "#ptab-ir"], ["tap", "#lookAero"], ["tap", "#ptab-color"], ["set", "#skySat", "2"], ["set", "#skyLum", "0.72"]] },
  { name: "4-contrast-instead", note: "depth from global contrast rather than from the band — cheaper, and it moves the sky too",
    steps: [["tap", "#ptab-ir"], ["tap", "#lookAero"], ["tap", "#ptab-color"], ["set", "#con", "1.45"]] },
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
      if (how === "tap") await p.click(sel).catch(() => {});
      else await p.evaluate(([s, v]) => {
        const el = document.querySelector(s);
        if (!el) return;
        el.value = v;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, [sel, val]);
      await p.waitForTimeout(450);
    }
    await p.waitForTimeout(900);
    const path = `${OUT}/${c.name}.png`;
    await p.locator("#view").screenshot({ path });
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
console.log(`\n${CANDIDATES.length} candidates written to ${OUT}\n`);
