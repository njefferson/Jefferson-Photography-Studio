#!/usr/bin/env node
// A HAND CORRECTION HAS TO REACH THE EXPORTED FILE, AND ONLY WHERE IT WAS PUT.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/mask-fix-export-walk.mjs [--port=8131] [--plant]
//
// WHY IT EXISTS, and it is a defect that was designed out rather than found.
// The preview is the GPU shader; the export is `compileEdit` on the CPU,
// rendered from `cloneParams(params)`. A mask's corrected composite is a
// derived bitmap, and stripping a derived bitmap from the clone to save undo
// memory reads as prudent — it is the obvious optimisation, and it would put
// the corrected mask on screen and the UNCORRECTED one in the saved file. The
// agreement walk would catch it only if it drove a corrected mask, which is
// the one arm nobody would think to add.
//
// It exports the same photograph twice, with and without one take-out stroke,
// and compares the app's own uncompressed 16-bit TIFF. Two assertions, and the
// second is the one that says the correction is a correction rather than a
// re-render: the stroke's band must move, and everything else must not.
//
// --plant skips the arming press; the first assertion must then go red.
import { openMasks } from "./walk-input.mjs";
import { chromium } from "playwright-core";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
import { mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
const PORT = (process.argv.find(a=>a.startsWith("--port="))||"--port=8131").split("=")[1];
const PLANT = process.argv.includes("--plant");
const OUT = "/tmp/mask-fix-export";
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (n, ok, d="") => { console.log(`${ok?"ok  ":"FAIL"}  ${n}${d?" — "+d:""}`); if(!ok) failed++; };
const settle = async (p) => { await p.waitForTimeout(700); await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))); };

// The app's own export is an UNCOMPRESSED 16-bit RGB TIFF — which is what it
// writes by default, so this reads what the reader actually gets rather than
// asking the app for a format it would not normally produce.
function readTiff(buf){
  if (buf.readUInt16LE(0) !== 0x4949) throw new Error("not a little-endian TIFF");
  const ifd = buf.readUInt32LE(4), n = buf.readUInt16LE(ifd), tag = {};
  for (let i=0;i<n;i++){ const e=ifd+2+i*12; tag[buf.readUInt16LE(e)] = buf.readUInt32LE(e+8); }
  const W = tag[256], H = tag[257], samples = tag[277] ?? 3, off = tag[273];
  if (tag[259] !== 1) throw new Error(`compression ${tag[259]} not handled`);
  const expect = W * H * samples * 2;
  if (tag[279] !== expect) throw new Error(`strip ${tag[279]} != ${expect} (not 16-bit?)`);
  return { W, H, samples, off, buf };
}
// One sample, 0..65535, at a pixel.
const at = (t, x, y, s) => t.buf.readUInt16LE(t.off + ((y * t.W + x) * t.samples + s) * 2);

// 16-BIT TIFF AND A QUARTER-SIZE FRAME, both set explicitly. The format is a
// remembered preference, so a walk that takes whatever is selected reads a
// JPEG on one run and a TIFF on the next and dies in its own decoder on
// whichever it did not expect — which is what the first version did. TIFF
// because it is uncompressed and this walk compares PIXELS: a JPEG's own
// quantisation would move bytes everywhere and drown the thing being measured.
// Quarter size because the CPU path is the same path at any scale.
const doExport = async (p, name) => {
  await p.click("#ptab-export");
  await p.evaluate(() => {
    for (const [id, v] of [["exFormat", "tiff"], ["exScale", "0.25"]]) {
      const el = document.getElementById(id);
      if (el) { el.value = v; el.dispatchEvent(new Event("change", { bubbles: true })); }
    }
  });
  const dl = p.waitForEvent("download", { timeout: 600000 }); dl.catch(()=>{});
  await p.click("#exBtn");
  await p.waitForSelector("#exportSave", { timeout: 600000 }).catch(()=>{});
  await p.click("#exportSave").catch(()=>{});
  const d = await dl;
  const path = join(OUT, `${name}.tif`);
  // CHECK WHAT ARRIVED, and say so in a sentence rather than in a stack trace.
  // The Format control is a remembered preference, so before this file pinned
  // it a run could export a JPEG and the comparison below would die inside its
  // own TIFF reader with "not a little-endian TIFF" and no clue which of the
  // two exports was wrong or why. Removing the file first is belt and braces
  // for the same reason: these are fixed names in a directory nothing clears,
  // so a failed run's output must not be able to stand in for this one's.
  rmSync(path, { force: true });
  await d.saveAs(path);
  const magic = readFileSync(path).subarray(0, 2);
  if (magic[0] !== 0x49 || magic[1] !== 0x49) {
    throw new Error(`${name}: the export is not a little-endian TIFF — the Format control did not take`);
  }
  return path;
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, acceptDownloads: true });
  const p = await ctx.newPage(); p.on("dialog", d=>d.accept());
  await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
  await p.setInputFiles("#file", ["public/examples/NIR_1651.dng"]);
  await p.waitForFunction(()=>document.getElementById("welcome")?.hidden, null, {timeout:300000});
  await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"), null, {timeout:300000});
  await settle(p);
  await openMasks(p); await p.click("#addSky"); await settle(p);
  // A mask that does something visible: take the sky's brightness right down.
  await p.evaluate(() => { const el = document.getElementById("mBrightness");
    el.value = "0.35"; el.dispatchEvent(new Event("input",{bubbles:true})); el.dispatchEvent(new Event("change",{bubbles:true})); });
  await settle(p);
  const a = await doExport(p, "before");

  await openMasks(p); await settle(p);
  if (!PLANT) { await p.click("#mSkyFixCut"); await settle(p); }
  const box = await p.locator("#view").boundingBox();
  const X = f => box.x + box.width*f, Y = f => box.y + box.height*f;
  await p.mouse.move(X(0.10), Y(0.18)); await p.mouse.down();
  for (let i=1;i<=8;i++) await p.mouse.move(X(0.10+0.80*i/8), Y(0.18));
  await p.mouse.up(); await settle(p);
  const fixN = await p.textContent("#mSkyStatus");
  check("the correction was recorded", PLANT ? !/by hand/.test(fixN||"") : /1 correction by hand/.test(fixN||""), (fixN||"").trim());
  const c = await doExport(p, "after");

  const A = readTiff(readFileSync(a)), B = readTiff(readFileSync(c));
  check("both exports are the same size", A.W===B.W && A.H===B.H, `${A.W}x${A.H} vs ${B.W}x${B.H}`);
  const moveShare = (y0f, y1f) => {
    let moved = 0, n = 0, maxd = 0;
    const y0 = Math.floor(A.H*y0f), y1 = Math.floor(A.H*y1f);
    for (let y = y0; y < y1; y += 2) for (let x = 0; x < A.W; x += 2) {
      n++;
      let d = 0;
      for (let s = 0; s < 3; s++) d = Math.max(d, Math.abs(at(A,x,y,s) - at(B,x,y,s)));
      if (d > 2048) moved++; if (d > maxd) maxd = d;   // 2048/65535 is about 8/255
    }
    return { share: moved/n, maxd };
  };
  const band = moveShare(0.10, 0.28);   // the stroke ran across the top fifth
  check("the correction reached the exported file", PLANT ? band.share < 0.02 : band.share > 0.20,
    `${(100*band.share).toFixed(1)}% of the stroke's band moved, largest change ${band.maxd}/65535`);
  const rest = moveShare(0.60, 1.0);
  check("and nothing outside it moved", rest.share < 0.02, `${(100*rest.share).toFixed(2)}% of the lower frame`);

  await ctx.close();
} finally { await b.close(); }
console.log(failed ? `\n${failed} failed` : "\nall checks passed");
process.exit(failed?1:0);
