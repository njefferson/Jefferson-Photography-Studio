#!/usr/bin/env node
// THE COLOUR ANCHORS, ACROSS A SET OF FRAMES RATHER THAN ONE.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/anchor-sweep.mjs --dir=/path/with/raws [--port=8131]
//
// WHY IT EXISTS. Every colour number derived on 2026-09-16 — the Aerochrome
// matrix, its band shift, the channel correlations — was fitted to ONE raw,
// because one raw was all that was on disk. A matrix fitted to one photograph is
// fitted to that photograph. This measures the same quantities across a set, so
// a solve can be made against all of them and the SPREAD is visible instead of
// assumed.
//
// It is a measurement instrument, not a pass/fail walk, so it is deliberately
// not named `*-walk.mjs`: walk-all must not spend minutes per frame on it.
//
// TWO QUANTITIES, MEASURED IN THE TWO PLACES THEY MEAN SOMETHING.
//
//   The ANCHORS are read after white balance and the swap, per population,
//   because that is the state the colour mixer actually operates on and those
//   are the vectors a matrix solve takes as input (IR-SCIENCE.md section 4c-i).
//
//   The CORRELATIONS are read from the app's own Conversion line, which measures
//   the DECODE, because correlation is scale-free and a pre-balance ratio is
//   dominated by gain (section 4c-iv). Two different questions, two places.
import { chromium } from "playwright-core";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split("=").slice(1).join("=");
const PORT = arg("port", "8131");
const BASE = `http://127.0.0.1:${PORT}`;
const DIR = arg("dir", "");

if (!DIR || !existsSync(DIR)) {
  console.error(`\nGive me a directory of raws: --dir=/path\n`);
  process.exit(2);
}
const files = readdirSync(DIR).filter((f) => /\.(nef|dng)$/i.test(f)).sort().map((f) => join(DIR, f));
if (!files.length) { console.error(`no raws in ${DIR}`); process.exit(2); }

const serving = await fetch(`${BASE}/ir.html`).then((r) => r.ok).catch(() => false);
if (!serving) {
  console.error(`\nNothing is serving dist on :${PORT}.\n\n    python3 -m http.server ${PORT} --directory dist\n`);
  process.exit(2);
}

// The three populations, in the state the mixer sees, linearised back out of the
// canvas. Same hue split tools/look-sheet.mjs and tools/agreement-walk.mjs use,
// so the three tools cannot disagree about what "foliage" means.
const READ = `(() => {
  const cv = document.querySelector("#view");
  const g = cv.getContext("webgl2") || cv.getContext("webgl");
  const b = new Uint8Array(cv.width * cv.height * 4);
  g.readPixels(0, 0, cv.width, cv.height, g.RGBA, g.UNSIGNED_BYTE, b);
  const lin = (u) => { const c = u / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const acc = { foliage: [0,0,0,0], sky: [0,0,0,0], neutral: [0,0,0,0] };
  for (let i = 0; i < b.length; i += 4) {
    if (!b[i+3]) continue;
    const r = b[i], gg = b[i+1], bb = b[i+2];
    const mx = Math.max(r,gg,bb), mn = Math.min(r,gg,bb), d = mx - mn, s = mx ? d/mx : 0;
    let k = null;
    if (s < 0.10 && mx > 40 && mx < 230) k = "neutral";
    else if (d >= 12) {
      let h; if (mx===r) h=((gg-bb)/d)%6; else if (mx===gg) h=(bb-r)/d+2; else h=(r-gg)/d+4;
      h = (((h*60)%360)+360)%360;
      if (h > 320 || h < 40) k = "foliage"; else if (h > 140 && h < 220) k = "sky";
    }
    if (!k) continue;
    const t = acc[k];
    t[0] += lin(r); t[1] += lin(gg); t[2] += lin(bb); t[3]++;
  }
  const m = (t) => t[3] ? { rgb: [t[0]/t[3], t[1]/t[3], t[2]/t[3]], share: t[3] / (b.length/4) } : null;
  return { foliage: m(acc.foliage), sky: m(acc.sky), neutral: m(acc.neutral) };
})()`;

const rows = [];
const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
try {
  for (const f of files) {
    const p = await br.newPage({ viewport: { width: 1100, height: 900 } });
    try {
      await p.goto(`${BASE}/ir.html`, { waitUntil: "load" });
      await p.setInputFiles("#file", [f]);
      await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
      await p.waitForTimeout(2500);
      // The app's own reading of the decode, by id — a label is product copy.
      await p.evaluate(() => document.getElementById("verTag")?.click());
      await p.waitForFunction(() => (document.getElementById("verDlgText")?.value || "").includes("Conversion"), null, { timeout: 60000 }).catch(() => {});
      const conv = await p.evaluate(() =>
        (document.getElementById("verDlgText")?.value || "").split("\n").find((l) => l.startsWith("Conversion")) || "");
      await p.evaluate(() => document.querySelector("dialog[open]")?.close());
      // Everything after the mixer to identity, so the canvas IS its input.
      await p.evaluate(() => {
        const l = document.getElementById("irLift");
        if (l && l.getAttribute("aria-pressed") === "true") l.click();
        for (const [id, v] of [["sat","1"],["con","1"]]) {
          const el = document.getElementById(id);
          if (!el) continue;
          el.value = v;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
      await p.waitForTimeout(2500);
      const a = await p.evaluate(READ);
      const c = (conv.match(/correlation ([\d.]+) .* red\/green ([\d.]+) .* red\/blue ([\d.]+)/) || []).slice(1).map(Number);
      rows.push({ name: f.split("/").pop(), a, c });
    } finally { await p.close(); }
  }
} finally { await br.close(); }

const f3 = (v) => v.map((x) => x.toFixed(4)).join(" ");
console.log(`\n=== anchors across ${rows.length} frames ===\n`);
for (const r of rows) {
  console.log(`  ${r.name}`);
  for (const k of ["foliage","sky","neutral"]) {
    const v = r.a[k];
    console.log(`     ${k.padEnd(8)} ${v ? f3(v.rgb) + `   ${(v.share*100).toFixed(1)}% of frame` : "none found"}`);
  }
  if (r.c.length === 3) console.log(`     corr     g/b ${r.c[0].toFixed(3)}  r/g ${r.c[1].toFixed(3)}  r/b ${r.c[2].toFixed(3)}`);
}

// THE SPREAD IS THE POINT. A mean across frames hides whether they agree, and
// whether they agree is the whole question a one-frame fit could not answer.
console.log(`\n=== spread ===\n`);
for (const k of ["foliage","sky","neutral"]) {
  const got = rows.map((r) => r.a[k]).filter(Boolean);
  if (!got.length) { console.log(`  ${k}: found in no frame`); continue; }
  const mean = [0,1,2].map((i) => got.reduce((z,v) => z + v.rgb[i], 0) / got.length);
  const sd = [0,1,2].map((i) => Math.sqrt(got.reduce((z,v) => z + (v.rgb[i]-mean[i])**2, 0) / got.length));
  console.log(`  ${k.padEnd(8)} mean ${f3(mean)}`);
  console.log(`  ${"".padEnd(8)} sd   ${f3(sd)}   (${got.length} of ${rows.length} frames)`);
}
const cs = rows.map((r) => r.c).filter((c) => c.length === 3);
if (cs.length) {
  const lbl = ["green/blue","red/green","red/blue"];
  console.log("");
  for (let i = 0; i < 3; i++) {
    const v = cs.map((c) => c[i]);
    console.log(`  ${lbl[i].padEnd(10)} ${Math.min(...v).toFixed(3)} to ${Math.max(...v).toFixed(3)} across ${v.length} frames`);
  }
}
console.log("");
