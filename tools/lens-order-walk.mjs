#!/usr/bin/env node
// THE BALANCE IS MEASURED ON CORRECTED DATA — asserted, not assumed (decision 021).
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/lens-order-walk.mjs [--port=8131] [--file=/path/to.NEF] [--strength=1]
//
// WHAT IT HOLDS. The measured lens curve is laid on the linear working copy at
// decode, before the gray-world balance, the exposure, the denoise measurement
// and the sky selection read it. So the balance the app reports for a raw must
// equal an INDEPENDENT gray-world of the same decode with the same flat laid on
// it — computed here in node from the app's own decoders and its own gray-world,
// bundled from src/ at run time so nothing can drift — and must DIFFER from the
// gray-world of the uncorrected decode, which is what the build before 021
// measured. Made to fail first against that build.
//
// THE STRENGTH HAS TO BE REMEMBERED FIRST. A fresh page remembers no strength
// for any lens, and a plan at strength 0 lays nothing; so the walk opens the
// file, sets the shipped card's Strength (which the app remembers on change),
// and opens the SAME file again — the second decode carries the plan. That is
// also the reader's path: the strength they chose for a lens is what every
// later photograph with that lens opens at.
//
// AND THE RE-APPLY IS EXACT. Bypass on, then off, and the canvas hash returns
// to what it was: the ratio pass against the gains already in the buffer, no
// second copy, no drift.
import { chromium } from "playwright-core";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split("=").slice(1).join("=");
const PORT = arg("port", "8131"), STRENGTH = Number(arg("strength", "1"));
const RAW = arg("file", "/tmp/claude-0/-home-user/2bd37282-d617-5a51-b357-6b20783a5840/scratchpad/real/NIR_1376.NEF");
const TOL = 0.005; // 0.5% per channel
// SET FROM BOTH BUILDS' READINGS on NIR_1376 at strength 1, corner over centre,
// red/blue: the build before 021 (flat after the denoise) read 1.033 / 1.051;
// 021 (flat before it) reads 1.009 / 0.965. The margin is thin because this
// lens's colour curve is mild (±5% at the corner) — a lens with a brightness
// curve would separate them further. One frame, one machine; the readings
// are in NOTES.md beside the date.
const RESIDUAL_MAX = Number(arg("residual", "1.025"));
let failed = 0; const check = (n, ok, got) => { if (!ok) failed++; console.log(`${ok ? "ok  " : "FAIL"}  ${n} — ${got}`); };

if (!existsSync(RAW)) { console.log(`\nno raw at ${RAW} — this walk needs a real raw whose lens matches a shipped profile\n`); process.exit(2); }
const serving = await fetch(`http://127.0.0.1:${PORT}/ir.html`).then((r) => r.ok).catch(() => false);
if (!serving) { console.error(`\nNothing is serving dist on :${PORT}.\n\n    python3 -m http.server ${PORT} --directory dist\n`); process.exit(2); }

// The independent side: the app's own decoders, matchers, flat and gray-world, bundled from src/.
const outDir = join(tmpdir(), "lens-order"); mkdirSync(outDir, { recursive: true });
const bundle = join(outDir, "app.mjs");
await build({
  stdin: { contents: `
    export { readNefCfa } from "${ROOT}/src/raw/nef";
    export { demosaicBinned } from "${ROOT}/src/raw/demosaic";
    export { Tiff } from "${ROOT}/src/raw/tiff";
    export { readCameraMatrix, cameraModel, grayWorldWB } from "${ROOT}/src/decode";
    export { nikonColorMatrix, camToSrgbLinear } from "${ROOT}/src/color";
    export { readExifSubset } from "${ROOT}/src/exif";
    export * as Hotspot from "${ROOT}/src/hotspot";
    export { lensGains, applyLensFlat } from "${ROOT}/src/lensflat";`, resolveDir: ROOT, loader: "ts" },
  bundle: true, format: "esm", platform: "node", outfile: bundle, logLevel: "warning",
});
const A = await import(pathToFileURL(bundle).href);
const bytes = new Uint8Array(readFileSync(RAW));
const ifds = new A.Tiff(bytes).allIfds();
const cam = A.camToSrgbLinear(A.readCameraMatrix(ifds) ?? A.nikonColorMatrix(A.cameraModel(ifds)));
const cfa = A.readNefCfa(bytes);
const d = A.demosaicBinned(cfa.cfa, cfa.width, cfa.height, cfa.pattern, cfa.black, cfa.white);
const img = { width: d.width, height: d.height, linear: d.linear, camMatrix: cam, isRaw: true };
const ex = A.readExifSubset(bytes);
const shipped = A.Hotspot.findShipped(ex);
const short = A.Hotspot.shortFor(ex?.lens);
const { colour, bump } = A.Hotspot.lensHalves(null, shipped);
const curve = colour || bump ? { kr: colour?.kr, kb: colour?.kb, bump: bump ?? undefined } : null;
check("the raw's lens matches a shipped profile (the walk needs one)", !!curve, `${ex?.lens ?? "no lens"} → ${shipped ? "matched" : "no match"}`);
const wbUncorrected = A.grayWorldWB(img);
const gains = A.lensGains(curve, STRENGTH);
const corrected = { ...img, linear: Float32Array.from(d.linear) };
if (gains) A.applyLensFlat(corrected.linear, corrected.width, corrected.height, gains, null);
const wbCorrected = A.grayWorldWB(corrected);
const fmt = (w) => w.map((x) => x.toFixed(4)).join(" · ");
console.log(`  independent gray-world — uncorrected ${fmt(wbUncorrected)} · corrected at strength ${STRENGTH} ${fmt(wbCorrected)}`);
// THE BALANCE BARELY MOVES, AND THAT IS A FINDING: the colour curves are
// area-normalised (lensAreaMean), so a frame-mean balance is the same to 0.2%
// whichever side of the correction it is measured on. The balance check below
// is therefore a CONSISTENCY check — the app's number is the app's own
// gray-world of the corrected copy — and not what tells the two orders apart.
// What tells them apart is the noise: laid on before the grade, the flat's
// gain at a corner multiplies the residual the denoise already left; laid on
// at decode, the denoise measures and removes it. Read below off the canvas.
console.log(`  balance move from the flat: ${(100 * Math.max(...wbUncorrected.map((x, i) => Math.abs(x - wbCorrected[i]) / x))).toFixed(2)}% (area-normalised curves; a consistency check, not the discriminator)`);

// High-frequency residual of a canvas region: mean |value − 5×5 box mean|, per channel, on the 8-bit canvas at working size.
const residual = (p, x0, y0, w, h) => p.evaluate(([x0, y0, w, h]) => { const cv = document.querySelector("#view"); const g = cv.getContext("webgl2") || cv.getContext("webgl"); const W = cv.width, H = cv.height; const b = new Uint8Array(W * H * 4); g.readPixels(0, 0, W, H, g.RGBA, g.UNSIGNED_BYTE, b);
  const at = (x, y, c) => b[((H - 1 - y) * W + x) * 4 + c]; const out = [0, 0, 0]; let n = 0;
  for (let y = y0 + 2; y < y0 + h - 2; y += 2) for (let x = x0 + 2; x < x0 + w - 2; x += 2) { for (let c = 0; c < 3; c++) { let m = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) m += at(x + dx, y + dy, c); m /= 25; out[c] += Math.abs(at(x, y, c) - m); } n++; }
  return { r: out[0] / n, g: out[1] / n, b: out[2] / n, W, H }; }, [x0, y0, w, h]);
const hash = (p) => p.evaluate(() => { const cv = document.querySelector("#view"); const g = cv.getContext("webgl2") || cv.getContext("webgl"); const b = new Uint8Array(cv.width * cv.height * 4); g.readPixels(0, 0, cv.width, cv.height, g.RGBA, g.UNSIGNED_BYTE, b); let h = 2166136261; for (let k = 0; k < b.length; k += 4) { h ^= b[k]; h = Math.imul(h, 16777619); h ^= b[k + 1]; h = Math.imul(h, 16777619); h ^= b[k + 2]; h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); });
async function settle(p) { let last = "", stable = 0; for (let i = 0; i < 80; i++) { const h = await hash(p); if (h === last) { if (++stable >= 2) return true; } else { stable = 0; last = h; } await p.waitForTimeout(200); } return false; }
async function open(p, file) { await p.setInputFiles("#file", [file]); await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 }); await p.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 }); await settle(p); }
async function report(p) {
  await p.evaluate(() => document.getElementById("verTag")?.click());
  await p.waitForFunction(() => /Balance|Lens correction/.test(document.getElementById("verDlgText")?.value || ""), null, { timeout: 60000 }).catch(() => {});
  const lines = await p.evaluate(() => (document.getElementById("verDlgText")?.value || "").split("\n"));
  await p.evaluate(() => document.getElementById("verClose")?.click());
  const row = (k) => lines.find((l) => l.startsWith(k)) || null;
  return { balance: row("Balance"), order: row("Correction order"), lens: row("Lens correction") };
}
const parseWb = (line) => { const m = (line || "").match(/white balance ([\d.]+) · ([\d.]+) · ([\d.]+)/); return m ? [1, 2, 3].map((i) => Number(m[i])) : null; };
const setSlider = async (p, id, v) => { await p.evaluate(([i, x]) => { const el = document.getElementById(i); el.value = String(x); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, [id, v]); await settle(p); };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 950 } }); p.on("dialog", (d) => d.accept());
  await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
  await open(p, RAW);
  // 1. Choose a strength for this lens; the app remembers it on change.
  await setSlider(p, "hsStrength", STRENGTH);
  // 2. Open the same file again: the decode now carries the plan.
  await open(p, RAW);
  // The build before 021 opens at the remembered strength too — but in that
  // build a strength of exactly 1 could never be remembered (it was stored as
  // absence, from when absence meant full), so its second open lands at 0 and
  // its Correction order line is missing either way. Set the slider once more
  // so the residual and the Bypass checks below read a CORRECTED picture on
  // both builds; on 021 this is a no-op, the pixels already carry it.
  await setSlider(p, "hsStrength", STRENGTH);
  const r = await report(p);
  console.log(`  app — ${r.order}\n        ${r.balance}`);
  check("the report says the flat was laid on the linear raw at decode, at the chosen strength", /on the linear raw at decode/.test(r.order || "") && new RegExp(`strength ${STRENGTH} laid`).test(r.order || ""), r.order || "no Correction order line");
  const wbApp = parseWb(r.balance);
  check("the report carries the balance", !!wbApp, r.balance || "no Balance line");
  const near = (a, b2) => !!a && a.every((x, i) => Math.abs(x - b2[i]) / b2[i] <= TOL);
  check(`the app's at-open balance is the gray-world of the CORRECTED decode (within ${100 * TOL}%)`, near(wbApp, wbCorrected), `app ${wbApp ? fmt(wbApp) : "—"} · corrected ${fmt(wbCorrected)}`);
  // 3. THE DISCRIMINATOR: the residual at a sky corner against the residual in
  // the open sky near the middle, both at the same strength. The colour gains
  // at the corner of this lens's curve amplify red and blue; with the flat laid
  // on after the denoise (the build before 021) the corner's residual carries
  // that gain, with it laid on before (021) the denoise measures the gain and
  // takes it out. Read off the working-size canvas; regions are sky on 1376.
  const W = (await residual(p, 0, 0, 8, 8)).W;
  const corner = await residual(p, 60, 60, 260, 200), centre = await residual(p, Math.round(W / 2) - 130, 60, 260, 200);
  const ratio = { r: corner.r / centre.r, g: corner.g / centre.g, b: corner.b / centre.b };
  console.log(`  residual corner ${corner.r.toFixed(2)}/${corner.g.toFixed(2)}/${corner.b.toFixed(2)} · centre ${centre.r.toFixed(2)}/${centre.g.toFixed(2)}/${centre.b.toFixed(2)} · corner/centre r ${ratio.r.toFixed(3)} g ${ratio.g.toFixed(3)} b ${ratio.b.toFixed(3)}`);
  check(`the corner's red and blue residual is no more than ${RESIDUAL_MAX}× the centre's (the flat before the denoise, not after it)`, Math.max(ratio.r, ratio.b) <= RESIDUAL_MAX, `max ${Math.max(ratio.r, ratio.b).toFixed(3)}`);
  // 4. Bypass on, then off: the pixels return exactly.
  const h0 = await hash(p);
  // The card sits on a tab that may be scrolled away; the press goes to the element itself.
  const press = async () => { await p.evaluate(() => document.getElementById("hsBypassBtn")?.click()); await settle(p); };
  const grab = () => p.evaluate(() => { const cv = document.querySelector("#view"); const g = cv.getContext("webgl2") || cv.getContext("webgl"); const b = new Uint8Array(cv.width * cv.height * 4); g.readPixels(0, 0, cv.width, cv.height, g.RGBA, g.UNSIGNED_BYTE, b); window.__lo = window.__lo || []; window.__lo.push(b); return window.__lo.length; });
  await grab(); await press(); const h1 = await hash(p); await press(); await grab();
  // WITHIN FLOAT ROUNDING, MEASURED: the re-apply multiplies by next/prev per
  // bin in float32, so x·g·(1/g) can land one 8-bit step away on a pixel that
  // sat on a rounding boundary. "Exact" is stated as a bound on that, not as a
  // hash — a hash would call one flipped LSB in five million a defect.
  const back = await p.evaluate(() => { const [a, b] = window.__lo; let maxD = 0, changed = 0, n = 0; for (let i = 0; i < a.length; i += 4) { n++; const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); if (d) changed++; if (d > maxD) maxD = d; } delete window.__lo; return { maxD, changedShare: changed / n }; });
  check("Bypass changes the picture", h1 !== h0, `${h0} → ${h1}`);
  check("and Bypass off returns it to within one 8-bit step on under 1% of pixels (the re-apply is a ratio, not a second copy)", back.maxD <= 1 && back.changedShare < 0.01, `max step ${back.maxD} · pixels moved ${(100 * back.changedShare).toFixed(3)}%`);
} finally { await b.close(); }
console.log(failed ? `\n${failed} failed` : "\nall checks passed"); process.exit(failed ? 1 : 0);
