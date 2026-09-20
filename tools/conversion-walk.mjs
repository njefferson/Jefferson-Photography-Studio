#!/usr/bin/env node
// WHAT THE CONVERSION LEFT IN THE FILE, ASSERTED RATHER THAN RE-DERIVED.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/conversion-walk.mjs [--port=8131] [--file=/path/to.NEF]
//
// WHY IT EXISTS. On 2026-09-16 three separate scratch probes measured this
// camera's channel separation and all three died with their /tmp files, so the
// fourth session would have measured it again. The reading is in the diagnostic
// now (`conversionDiagnostic` in src/main.ts) and this holds it to a number, so
// a change to decode or to the raw levels that moves it is visible instead of
// silent.
//
// WHAT IT ASSERTS, and what it deliberately does NOT. The two ratios are facts
// about the file and are checked against a band. The BRACKET sentence is a
// coarse reading calibrated against no known conversion at all, so this asserts
// only that it is one of the three and that it MOVES when the file changes — a
// sentence that is a constant is not a measurement, which is the shape of defect
// this repository keeps paying for.
import { chromium } from "playwright-core";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
import { existsSync } from "node:fs";

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split("=").slice(1).join("=");
const PORT = arg("port", "8131");
const BASE = `http://127.0.0.1:${PORT}`;
const RAW = arg("file", "/tmp/claude-0/-home-user/2bd37282-d617-5a51-b357-6b20783a5840/scratchpad/real/NIR_1376.NEF");
// The control: a bundled practice DNG. Its channel content differs from the real
// frame's, so it is what proves the reading is not a constant.
const CONTROL = new URL("../dist/examples/NIR_0063.dng", import.meta.url).pathname;

let bad = 0;
let lastAperture = null; // set by readConversion, per file
const check = (name, got, want) => {
  const ok = typeof want === "function" ? want(got) : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}`);
  console.log(`        got ${JSON.stringify(got)}`);
};

const serving = await fetch(`${BASE}/ir.html`).then((r) => r.ok).catch(() => false);
if (!serving) {
  console.error(`\nNothing is serving dist on :${PORT}.\n\n    python3 -m http.server ${PORT} --directory dist\n`);
  process.exit(2);
}

/** The Conversion line of the diagnostic for one file.
 *
 *  Takes a browser and an absolute path to an image the app can open.
 *  Returns the line's text, or null when the file could not be opened or the row
 *  is absent. Both callers below treat null as a failure: a walk that cannot see
 *  its own case must say so rather than pass.  */
async function readConversion(br, file) {
  const p = await br.newPage({ viewport: { width: 1100, height: 900 } });
  try {
    await p.goto(`${BASE}/ir.html`, { waitUntil: "load" });
    await p.setInputFiles("#file", [file]);
    await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
    await p.waitForTimeout(2500);
    // By id. The version tag opens the report; the label on it is a version
    // number and changes every release.
    await p.evaluate(() => document.getElementById("verTag")?.click());
    await p.waitForFunction(() => (document.getElementById("verDlgText")?.value || "").includes("Conversion"), null, { timeout: 60000 })
      .catch(() => {});
    const line = await p.evaluate(() =>
      (document.getElementById("verDlgText")?.value || "").split("\n").find((l) => l.startsWith("Conversion")) || null);
    // The Aperture row beside it: the frame's ƒ-number against the body's
    // diffraction limit (apertureDiagnostic, IR-SCIENCE.md §9h). Read here
    // because this walk already opens a real raw and a practice DNG, which are
    // exactly the line's two branches — an aperture on record, and none.
    lastAperture = await p.evaluate(() =>
      (document.getElementById("verDlgText")?.value || "").split("\n").find((l) => l.startsWith("Aperture")) || null);
    return line;
  } finally {
    await p.close();
  }
}

const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  if (!existsSync(RAW)) {
    console.log(`\nno raw at ${RAW} — this walk needs a real raw and the practice DNGs are not one (IR-SCIENCE.md section 7)\n`);
    process.exit(2);
  }
  const real = await readConversion(br, RAW);
  const realAperture = lastAperture;
  console.log(`\n  real raw   ${real}\n             ${realAperture}\n`);
  check("the report carries a Conversion line at all", !!real, true);
  // APERTURE, the real raw: an ƒ-number from the file, a verdict against the
  // body's limit, and the three thresholds the calculator gives the Z 50 —
  // safe to ƒ/5, caution to ƒ/6.3, visible softening from ƒ/8 (4.22 µm pitch at
  // 1000 nm). Made to fail first against the build before the row existed.
  check("the Aperture line reads the frame's ƒ-number and a verdict", realAperture,
    (l) => /^Aperture\s+ƒ\/[\d.]+ · (inside|in the caution band of|past) the Nikon Z 50's infrared diffraction limit/.test(l || ""));
  check("and names the Z 50's three thresholds from the calculator", realAperture,
    (l) => /safe to ƒ\/5, caution to ƒ\/6\.3, visible softening from ƒ\/8/.test(l || ""));
  const nums = (real || "").match(/correlation ([\d.]+) .* red\/green ([\d.]+) .* red\/blue ([\d.]+)/);
  check("it reports all three correlations", !!nums, true);
  if (nums) {
    const [gb, rg, rb] = nums.slice(1).map(Number);
    // Bands, not point values. A correlation is scale-free, so a decode change
    // that alters the per-channel GAIN must not move these at all — that is the
    // whole reason this measures correlation rather than means. One that alters
    // the INFORMATION should.
    check("every correlation is a correlation", [gb, rg, rb], (v) => v.every((x) => x >= -1 && x <= 1));
    // WHAT THIS CAMERA ACTUALLY MEASURES, and it is not what a session assumed.
    // An assertion here read "red stands further off than green and blue do from
    // each other" and FAILED: red/green is 0.993, the HIGHEST of the three. All
    // three channels track the infrared flood together. The false colour these
    // files can carry lives in the one to two per cent that is NOT shared,
    // amplified about threefold by a look's saturation — which is why the mixer
    // route grains (it amplifies residuals, and residuals are where the noise
    // is), why the hue route stays pale, and why no 3x3 can place three targets.
    // One number under three separate findings.
    check("every pair is near-perfectly correlated — one signal across all three", [gb, rg, rb], (v) => v.every((x) => x > 0.9));
    check("and the reading says so rather than promising colour that is not there",
      (real || "").includes("little false colour to find"), true);
  }
  check("it refuses to name a cutoff", (real || "").includes("not which cutoff"), true);

  if (existsSync(CONTROL)) {
    const other = await readConversion(br, CONTROL);
    // APERTURE, the practice DNG: hand-written, no EXIF aperture — the line must
    // say so in words rather than guess a body or an ƒ-number.
    check("the Aperture line says the practice DNG carries no aperture", lastAperture,
      (l) => /^Aperture\s+not in the file/.test(l || ""));
    console.log(`\n  control    ${other}\n`);
    check("a different file reads differently — the line is a measurement, not a constant", other !== real, true);
  } else {
    console.log("  (no bundled practice file to use as the control)");
  }
} finally {
  await br.close();
}
console.log(bad ? `\n${bad} failed\n` : "\nthe conversion reading is there, is bracketed, and moves with the file\n");
process.exit(bad ? 1 : 0);
