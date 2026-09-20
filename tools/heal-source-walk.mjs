#!/usr/bin/env node
// DOES THE HEAL PICK THE BEST SOURCE AVAILABLE TO IT?
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/heal-source-walk.mjs [--port=8131]
//
// NOT in .branch-guard's `also=`: it drives a real browser and decodes RAW.
//
// THE QUESTION, AND WHY THIS ONE RATHER THAN THE OBVIOUS ONE. `findHealSource`
// scores candidate patches on LUMA alone — a surround SAD over the annulus plus
// a smoothness term inside the disc, with no colour anywhere. That is a
// visible-light assumption, and in a channel-swapped infrared frame brightness
// is nearly independent of hue, so the worry is real: it could clone a
// chromatically opposite patch and score it well.
//
// So measure the GAP, not the result. For each spot: the colour distance of the
// patch the app's own 48 offsets make it choose, against the best colour match
// available in those same 48, against the best available in a set twelve times
// larger. A gap between the first two means the SCORING is wrong. A gap between
// the second and third means the CANDIDATE SET is too small. No gap means the
// search is doing as well as it can and the colour term nobody added would have
// bought nothing.
//
// WHAT IT MEASURED WHEN IT WAS WRITTEN, on the reader's own NIR_1376 and on the
// practice frames: the app picks 0.000-0.005 everywhere, the best available is
// 0.000-0.001, and the wide set finds 0.000. There is no gap. The search is
// already choosing what a colour-aware search would choose.
//
// THIS FILE REPLACES A WALK THAT REPORTED A DEFECT THAT DID NOT EXIST, and that
// is the reason it is written this way. The first version compared a healed
// disc against a ring 1.6-2.6 radii out, on the canvas, after the full pipeline
// — a neighbourhood far wider than the 1.05-1.5 annulus the search actually
// matches on. On a frame with structure at that scale it reported 0.150 and a
// failing check, and two speculative fixes went into the pipeline on the
// strength of it. Both were reverted. A measurement has to ask the question the
// code is answering, or it invents work.

import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();

const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const BASE = `http://127.0.0.1:${PORT}`;
const DIR = "/home/user/Jefferson-Photography-Studio/public/examples";
const FRAMES = ["NIR_0063.dng", "NIR_0102.dng"];
const TAPS = [[0.25, 0.80], [0.45, 0.86], [0.62, 0.90], [0.18, 0.74], [0.60, 0.30], [0.75, 0.55]];

let failed = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
};

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
let worstGap = 0, worstPick = 0, measured = 0;
try {
  for (const frame of FRAMES) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => { console.log(`FAIL  page error: ${e.message}`); failed++; });
    await page.goto(`${BASE}/ir.html`);
    await page.waitForSelector("#welcomeFile", { state: "attached" });
    await page.setInputFiles("#welcomeFile", `${DIR}/${frame}`);
    await page.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
    await page.waitForTimeout(2500);

    const out = await page.evaluate((TAPS) => {
      const cv = document.getElementById("view");
      const g = cv.getContext("webgl2") || cv.getContext("webgl");
      const W = cv.width, H = cv.height, buf = new Uint8Array(W * H * 4);
      g.readPixels(0, 0, W, H, g.RGBA, g.UNSIGNED_BYTE, buf);
      const at = (x, y) => { const i = ((H - 1 - y) * W + x) * 4; return [buf[i], buf[i + 1], buf[i + 2]]; };
      const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
      const luma = (x, y) => { const c = at(x, y); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
      const frac = (c) => { const t = Math.max(1, c[0] + c[1] + c[2]); return [c[0] / t, c[1] / t, c[2] / t]; };
      // THE APP'S OWN GEOMETRY, copied deliberately: default spot radius 0.008
      // of width, annulus 1.05..1.5 r, sample step r/4. Measuring on any other
      // neighbourhood asks a question findHealSource never answers.
      const rPx = Math.max(4, Math.round(W * 0.008));
      const step = Math.max(1, Math.round(rPx / 4));
      const ring = [];
      const R = Math.ceil(rPx * 1.5);
      for (let dy = -R; dy <= R; dy += step) for (let dx = -R; dx <= R; dx += step) {
        const d = Math.hypot(dx, dy) / rPx;
        if (d > 1.05 && d <= 1.5) ring.push([dx, dy]);
      }
      const score = (cx, cy, sx, sy) => {
        let sad = 0, n = 0, dr = [0, 0, 0], sr = [0, 0, 0], m = 0;
        for (const [dx, dy] of ring) {
          if (!inB(cx + dx, cy + dy) || !inB(sx + dx, sy + dy)) continue;
          sad += Math.abs(luma(sx + dx, sy + dy) - luma(cx + dx, cy + dy)); n++;
          const a = at(cx + dx, cy + dy), c = at(sx + dx, sy + dy);
          for (let k = 0; k < 3; k++) { dr[k] += a[k]; sr[k] += c[k]; }
          m++;
        }
        if (!n || !m) return null;
        const A = frac(dr.map((v) => v / m)), B = frac(sr.map((v) => v / m));
        return { sad: sad / n, chroma: (Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]) + Math.abs(A[2] - B[2])) / 2 };
      };
      const gen = (mults, angles) => {
        const o = [];
        for (const mu of mults) for (let a = 0; a < angles; a++) {
          const t = (a / angles) * Math.PI * 2;
          o.push([Math.round(Math.cos(t) * rPx * mu), Math.round(Math.sin(t) * rPx * mu)]);
        }
        return o;
      };
      const APP = gen([2.4, 3.4, 4.6], 16);
      const WIDE = gen([2, 2.4, 3, 3.4, 4, 4.6, 6, 8, 11, 15, 20, 28], 48);
      const rows = [];
      for (const [fx, fy] of TAPS) {
        const cx = Math.round(W * fx), cy = Math.round(H * fy);
        const run = (set) => {
          let byLuma = null, byChroma = null;
          for (const [ox, oy] of set) {
            const sx = cx + ox, sy = cy + oy;
            if (!inB(sx - rPx, sy - rPx) || !inB(sx + rPx, sy + rPx)) continue;
            const s = score(cx, cy, sx, sy); if (!s) continue;
            if (!byLuma || s.sad < byLuma.sad) byLuma = s;
            if (!byChroma || s.chroma < byChroma.chroma) byChroma = s;
          }
          return { byLuma, byChroma };
        };
        const a = run(APP), w = run(WIDE);
        if (!a.byLuma || !a.byChroma || !w.byChroma) continue;
        rows.push({ at: `${fx},${fy}`, pick: +a.byLuma.chroma.toFixed(3),
                    bestHere: +a.byChroma.chroma.toFixed(3), bestAnywhere: +w.byChroma.chroma.toFixed(3) });
      }
      return { rPx, rows };
    }, TAPS);

    console.log(`\n        ${frame} · spot radius ${out.rPx}px · 48 offsets against 576`);
    for (const r of out.rows) {
      measured++;
      const gap = Math.max(r.pick - r.bestHere, r.bestHere - r.bestAnywhere);
      if (gap > worstGap) worstGap = gap;
      if (r.pick > worstPick) worstPick = r.pick;
      console.log(`        ${r.at.padEnd(11)} picks ${String(r.pick).padStart(6)} · best of its own ${String(r.bestHere).padStart(6)} · best anywhere ${String(r.bestAnywhere).padStart(6)}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
check("enough spots were measurable to say anything", measured >= 6, true);
// 0.02 on either leg. Measured when written: every pick 0.000-0.005 and every
// gap under 0.005, on two frames and the reader's own file. A threshold at ten
// times the observed noise still catches a search that starts choosing badly or
// a candidate set that stops reaching a good patch.
check("the heal picks a source as good in colour as any it can see", worstGap < 0.02, true);
check("and the patch it picks matches its surround", worstPick < 0.02, true);
console.log(failed ? `\n${failed} check(s) failed` : `\nall checks passed — worst pick ${worstPick.toFixed(3)}, worst gap ${worstGap.toFixed(3)}`);
process.exit(failed ? 1 : 0);
