#!/usr/bin/env node
// THE SKY STAGE SMOOTHS; IT NEVER RECOLOURS. Measured on the EXPORT, not the
// preview, because the preview hid it: with the stage on, the exported oak
// frame carried saturated blue along every branch the soft sky mask leaked
// into and yellow-green speckle in the bright sky, while the screen looked
// fine at its scale. So this exports a practice frame with foliage against
// the sky twice through the real app — sky smoothing 1 and 0, TIFF at 25% —
// and holds the per-pixel chroma displacement between them to the mottle's
// own amplitude, over the WHOLE frame: a residual statistic on the dark third
// of the sky could not see a recolouring outside it.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/sky-stage-walk.mjs [--port=8131]
import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
import { readFileSync } from "node:fs";
const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const FILE = new URL("../public/examples/NIR_0063.dng", import.meta.url).pathname;
// The bounds. A mottled sky pixel moves by hundredths; the stage's gate stops
// at 0.25 of chroma distance, so nothing can legitimately move further than
// that, and a stage that moved nothing at all is switched off, which is the
// other failure.
const MAX_MOVE = 0.25, P999_MOVE = 0.12, MIN_MOVE = 0.004;
let failed = 0;
const check = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) failed++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}`); console.log(`        got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
const REC = [0.2126, 0.7152, 0.0722];
function readTiff16(path) { const buf = readFileSync(path); const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); const ifd = dv.getUint32(4, true), n = dv.getUint16(ifd, true); const tags = {}; for (let i = 0; i < n; i++) { const p = ifd + 2 + i * 12; const tag = dv.getUint16(p, true), typ = dv.getUint16(p + 2, true); tags[tag] = typ === 3 ? dv.getUint16(p + 8, true) : dv.getUint32(p + 8, true); } const W = tags[256], H = tags[257], off = tags[273]; return { W, H, px: new Uint16Array(buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + W * H * 6)) }; }
const hash = (p) => p.evaluate(() => { const cv = document.querySelector("#view"); const g = cv.getContext("webgl2") || cv.getContext("webgl"); const b = new Uint8Array(cv.width * cv.height * 4); g.readPixels(0, 0, cv.width, cv.height, g.RGBA, g.UNSIGNED_BYTE, b); let h = 2166136261; for (let k = 0; k < b.length; k += 4) { h ^= b[k]; h = Math.imul(h, 16777619); h ^= b[k + 1]; h = Math.imul(h, 16777619); h ^= b[k + 2]; h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); });
async function settle(p) { let last = "", stable = 0; for (let i = 0; i < 80; i++) { const h = await hash(p); if (h === last) { if (++stable >= 2) return true; } else { stable = 0; last = h; } await p.waitForTimeout(200); } return false; }
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const tiff = {};
  for (const sky of [1, 0]) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, acceptDownloads: true }); const p = await ctx.newPage(); p.on("dialog", (d) => d.accept());
    await p.goto(`http://127.0.0.1:${PORT}/ir.html`); await p.setInputFiles("#file", [FILE]);
    await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
    await p.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
    await settle(p);
    await p.evaluate(() => document.getElementById("lookEir")?.click()); await settle(p);
    await p.evaluate((v) => { const el = document.getElementById("skySmooth"); el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, sky); await settle(p);
    await p.evaluate(() => { const s = document.getElementById("exFormat"); s.value = "tiff"; s.dispatchEvent(new Event("change", { bubbles: true })); const sc = document.getElementById("exScale"); sc.value = "0.25"; sc.dispatchEvent(new Event("change", { bubbles: true })); });
    await p.click("#ptab-export");
    const dl = p.waitForEvent("download", { timeout: 600000 }); dl.catch(() => {});
    await p.click("#exBtn");
    await p.waitForFunction(() => /^Ready —/.test(document.getElementById("exportStripText")?.textContent || ""), null, { timeout: 600000 });
    await p.click("#exportSave");
    const d = await dl; tiff[sky] = readTiff16(await d.path());
    await ctx.close();
  }
  const on = tiff[1], off = tiff[0];
  check("0 both exports are the same size", [on.W, on.H], [off.W, off.H]);
  const moves = [];
  let maxMove = 0, maxAt = "";
  for (let i = 0; i < on.W * on.H; i++) {
    const c = (t) => { const r = t.px[i * 3] / 65535, g = t.px[i * 3 + 1] / 65535, bb = t.px[i * 3 + 2] / 65535; const l = REC[0] * r + REC[1] * g + REC[2] * bb; return [r - l, bb - l]; };
    const [a1, b1] = c(on), [a0, b0] = c(off); const m = Math.hypot(a1 - a0, b1 - b0); moves.push(m);
    if (m > maxMove) { maxMove = m; maxAt = `(${i % on.W},${Math.floor(i / on.W)})`; }
  }
  moves.sort((x, y) => x - y);
  const p999 = moves[Math.floor(moves.length * 0.999)], p50 = moves[Math.floor(moves.length * 0.5)];
  console.log(`        chroma displacement stage on vs off: max ${maxMove.toFixed(3)} at ${maxAt}, p99.9 ${p999.toFixed(3)}, median ${p50.toFixed(4)}`);
  check("1 no pixel is recoloured beyond the gate", maxMove <= MAX_MOVE, true);
  check("2 the tail of the displacement is the mottle's size, not a branch's", p999 <= P999_MOVE, true);
  check("3 the stage still does something", maxMove >= MIN_MOVE, true);
} finally { await b.close(); }
console.log(failed ? `\n${failed} check(s) failed` : "\nthe sky stage smooths and recolours nothing");
process.exit(failed ? 1 : 0);
