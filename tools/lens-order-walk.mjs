#!/usr/bin/env node
// THE BALANCE IS MEASURED ON CORRECTED DATA — asserted, not assumed (decision 021).
// AND A MATCHED LENS OPENS CORRECTED, AT FULL STRENGTH, EVERY TIME (015, 085).
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/lens-order-walk.mjs [--port=8131] [--file=A.NEF] [--second=B.NEF] [--third=C.NEF] [--chosen=0.3]
//
// Three raws from ONE lens that matches a shipped profile. They are the owner's
// photographs and are NOT in the
// repository: they are taken BY NAME through tools/owner-images.mjs, which
// fetches them from the folders shared for testing and caches them (hub
// LESSONS 369). The defaults are from a NIKKOR Z DX 50-250mm (NIR_3703.NEF
// f/5, NIR_3697.NEF f/5.3, NIR_3700.NEF f/8). If they cannot be fetched the
// walk exits 2 — "did not run", never a pass. Until 2026-09-29 the defaults
// were paths into one earlier session's scratchpad, so in every container
// after that one this walk exited 2 and held nothing.
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
// (a) A FRESH PAGE'S FIRST OPEN IS CORRECTED. Nothing is remembered on a fresh
// page, and a matched lens with nothing remembered opens at full strength
// (decision 015, reversed 2026-09-26) — so the very first decode lays strength
// 1 on the pixels, and the report's "Correction order" line says so. From
// 2026-09-17 until then a fresh page laid nothing, which is why this walk used
// to set the slider and open the same file twice before it could measure
// anything. Red on that build.
//
// (b) A STRENGTH CHOSEN ON ONE FRAME DOES NOT REACH THE NEXT (decision 085,
// 2026-09-30). Until then the strength last set was remembered per lens and
// became the one every later frame of that lens opened at, so a slider left
// high washed out the middle of every photograph after it. Now the next frame
// of the lens opens at full, laid at decode. Red on the build that remembered.
//
// (c) NOT EVEN 0: a lens turned off on one frame opens at full on the next.
// Red on the build that remembered, which carried the 0.
//
// (c2) AN OLD STORED STRENGTH IS REMOVED AND DECIDES NOTHING. Planted in a
// fresh browser, the way a build that remembered left it, then the app is
// loaded: the entry is gone and the first open lays full. A browser of its own,
// so no edit from the frames above can answer for it. Red on the build that
// remembered, which opened at the planted 0.4.
//
// (d) A DOUBLE TAP PUTS THE STRENGTH BACK TO FULL, the opening default, not to
// the last position set, and it is one undo step. Red on the build that
// remembered, whose double tap went to the remembered strength. On a fresh open
// the default captured at open is 1 as well, so (d) cannot tell the tap-time
// target from the captured one; (d2) can.
//
// (d2) THE SAME TAP ON AEROCHROME'S FINISHING COPY OF THE SLIDER. The copy is
// built when the look is picked, after the open captured its defaults, so no
// captured default holds a place for it to go back to: without the tap-time
// target (`lensStrengthTarget`) the tap does nothing. Red on the build before
// it, where it left the strength where it was set.
//
// THE SLIDER'S OTHER PATHS (085's follow-through, 2026-09-30). Each of these
// was found while building 085 and shipped as found and not fixed; each fix's
// own check failed on production's build, 3bb7e37, before the fix. The check
// that Undo redraws the tile was added after a review and was made to fail by
// planting its fix out instead.
//
// (e) A LENS PICKED BY HAND IS PART OF THE PHOTOGRAPH'S EDIT. On a practice
// frame, which carries no lens and so matches nothing: Undo takes the pick back
// to no lens at 0, Redo brings it back at 1, Reset returns to how the photo
// opened, a return to the photograph keeps the pick and its strength, and so
// does a reload and resume. Until then the pick lived beside the edit, so Undo
// and Reset left it picked and a return asked for the lens again.
//
// (e2) AFTER RESET, A DOUBLE TAP AGREES WITH IT. Reset left the pick in place
// at 0, so a double tap then went to 1.
//
// (f) THE TILE FOLLOWS THE LENS. Picking a lens, and moving Strength alone,
// redraw the photograph's tile, and the tile at 1 carries the picked lens's
// correction. The tile's stamp did not carry the strength, so it never
// redrew, and a tile drawn from the edit took the lens from the file's EXIF,
// which names no lens here.
//
// (g) AEROCHROME'S FINISHING COPY DRIVES THE CARD THAT OWNS THE CORRECTION.
// With the reader's own profile planted for the frame, moving the copy moves
// the own card's Strength and the picture, and a double tap on the copy puts
// the own card back to 1. The copy was wired to the shipped card, which is
// superseded while an own profile matches, so it moved nothing.
//
// (h) A DOUBLE TAP AFTER A RETURN GOES TO THIS PHOTOGRAPH'S OPENING VALUE.
// Exposure opens per frame; after opening two frames and returning to the
// first, a double tap on Exposure went to the second frame's opening value,
// because the defaults were captured only on a fresh open.
//
// AND THE CARD SAYS WHAT THE PROFILE KNOWS: "colour only" for a profile with no
// brightness curve, "brightness and colour" only when it has both. It said the
// second of every colour profile. The expectation is read off the same matched
// profile in node.
//
// AND THE RE-APPLY IS EXACT. Bypass on, then off, and the canvas hash returns
// to what it was: the ratio pass against the gains already in the buffer, no
// second copy, no drift.
import { chromium } from "playwright-core";
import { requireFreshDist } from "./fresh-dist.mjs";
import { resolve as ownerImage } from "./owner-images.mjs";
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
const PORT = arg("port", "8131");
// The strength a matched lens opens at, always.
const STRENGTH = 1;
// What the reader chooses on the first frame, for (b) and (d). Not 1 and not
// 0, so it cannot be mistaken for either.
const CHOSEN = Number(arg("chosen", "0.3"));
// Names, not paths: anything not in tools/owner-images.json is refused there.
let RAW, RAW2, RAW3;
try {
  RAW = await ownerImage(arg("file", "NIR_3703.NEF"));
  RAW2 = await ownerImage(arg("second", "NIR_3697.NEF"));
  RAW3 = await ownerImage(arg("third", "NIR_3700.NEF"));
} catch (e) {
  console.log(`\ncould not fetch the owner's raws (${e.message}) — this walk needs three real raws from one lens that matches a shipped profile\n`);
  process.exit(2);
}
const TOL = 0.005; // 0.5% per channel
// SET FROM BOTH BUILDS' READINGS on NIR_1376 at strength 1, corner over centre,
// red/blue: the build before 021 (flat after the denoise) read 1.033 / 1.051;
// 021 (flat before it) reads 1.009 / 0.965. The margin is thin because this
// lens's colour curve is mild (±5% at the corner) — a lens with a brightness
// curve would separate them further. One frame, one machine; the readings
// are in NOTES.md beside the date.
const RESIDUAL_MAX = Number(arg("residual", "1.025"));
let failed = 0; const check = (n, ok, got) => { if (!ok) failed++; console.log(`${ok ? "ok  " : "FAIL"}  ${n} — ${got}`); };

for (const f of [RAW, RAW2, RAW3]) if (!existsSync(f)) { console.log(`\nno raw at ${f} — this walk needs three real raws from one lens that matches a shipped profile\n`); process.exit(2); }
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
// THE OTHER TWO FRAMES: the same lens, or (b) and (c) say nothing about it.
const exOf = (f) => A.readExifSubset(new Uint8Array(readFileSync(f)));
const fOf = (e) => (e?.fNumber ? e.fNumber[0] / e.fNumber[1] : NaN);
const ex2 = exOf(RAW2), ex3 = exOf(RAW3);
const sameLens = [ex2, ex3].every((e) => A.Hotspot.shortFor(e?.lens) === short && !!A.Hotspot.findShipped(e));
console.log(`  frames — ${RAW.split("/").pop()} f/${fOf(ex).toFixed(1)} · ${RAW2.split("/").pop()} f/${fOf(ex2).toFixed(1)} · ${RAW3.split("/").pop()} f/${fOf(ex3).toFixed(1)} · lens ${short}`);
if (!sameLens) { console.log(`\nthe three raws must share one matched lens (same lens ${sameLens}) — the walk cannot see its own case\n`); process.exit(2); }
// What the card should say each profile knows: both halves asked, the same
// tests the report and the reader's own card use.
const knows = (e) => { const p = A.Hotspot.findShipped(e); const c = A.Hotspot.hasColour(p); const b = !!p?.bump?.some((v) => v > 0); return c && b ? "brightness and colour" : c ? "colour only" : b ? "brightness only" : "nothing on this frame"; };
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
const card = (p) => p.evaluate(() => ({ status: document.getElementById("hsStatus")?.textContent || "", strength: document.getElementById("hsStrength")?.value ?? "", shown: !document.getElementById("hsCard")?.hidden }));
const laid = (order) => { const m = (order || "").match(/strength ([\d.]+) laid on the pixels/); return m ? Number(m[1]) : (/nothing laid on the pixels/.test(order || "") ? 0 : null); };
const setSlider = async (p, id, v) => { await p.evaluate(([i, x]) => { const el = document.getElementById(i); el.value = String(x); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, [id, v]); await settle(p); };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 950 } }); p.on("dialog", (d) => d.accept());
  await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
  // (a) A FRESH PAGE, THE FIRST OPEN, NOTHING CHOSEN. The browser is new, so
  // nothing is remembered for any lens; the decode must lay full strength.
  await open(p, RAW);
  const r = await report(p);
  const c1 = await card(p);
  console.log(`  app — ${r.order}\n        ${r.balance}\n        card: ${c1.status} · Strength ${c1.strength}`);
  check(`(a) a fresh page's first open lays strength ${STRENGTH} on the linear raw at decode, with nothing chosen`, /on the linear raw at decode/.test(r.order || "") && laid(r.order) === STRENGTH, r.order || "no Correction order line");
  check(`(a) and the shipped card's Strength says ${STRENGTH}`, c1.shown && Number(c1.strength) === STRENGTH, `card ${c1.shown ? "shown" : "hidden"}, Strength ${c1.strength}`);
  check(`the card says what the profile knows: "${knows(ex)}"`, c1.status.includes(` · ${knows(ex)}`), c1.status || "no status");
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

  // (b) CHOOSE A STRENGTH ON THIS FRAME, THEN OPEN THE NEXT FRAME OF THE LENS.
  // Set as a finger sets it, `input` then `change` on lifting.
  await setSlider(p, "hsStrength", CHOSEN);
  await open(p, RAW2);
  const r2 = await report(p), c2 = await card(p);
  console.log(`  app — ${RAW2.split("/").pop()}: ${r2.order}\n        card: ${c2.status} · Strength ${c2.strength}`);
  check(`(b) ${CHOSEN} chosen on one frame does not reach the next: it lays ${STRENGTH} at decode`, laid(r2.order) === STRENGTH, r2.order || "no Correction order line");
  check(`(b) and its Strength opens at ${STRENGTH}`, Number(c2.strength) === STRENGTH, `Strength ${c2.strength}`);

  // (c) CHOOSE 0 — THE LENS OFF — ON THIS FRAME, THEN OPEN A THIRD.
  await setSlider(p, "hsStrength", 0);
  await open(p, RAW3);
  const r3 = await report(p), c3 = await card(p);
  console.log(`  app — ${RAW3.split("/").pop()}: ${r3.order}\n        card: ${c3.status} · Strength ${c3.strength}`);
  check(`(c) a chosen 0 does not reach the next frame: it lays ${STRENGTH} at decode`, laid(r3.order) === STRENGTH, r3.order || "no Correction order line");
  check(`(c) and its Strength opens at ${STRENGTH}`, Number(c3.strength) === STRENGTH, `Strength ${c3.strength}`);
  check(`the card says what this frame's profile knows too: "${knows(ex3)}"`, c3.status.includes(` · ${knows(ex3)}`), c3.status || "no status");

  // (c2) A STORED STRENGTH FROM A BUILD THAT REMEMBERED, IN A FRESH BROWSER.
  const ctx2 = await b.newContext({ viewport: { width: 1280, height: 950 } });
  try {
    const q = await ctx2.newPage(); q.on("dialog", (d) => d.accept());
    await q.goto(`http://127.0.0.1:${PORT}/ir.html`);
    await q.evaluate((s) => localStorage.setItem("ips-lens-strength", JSON.stringify({ [`shipped:${s}`]: 0.4 })), short);
    await q.goto(`http://127.0.0.1:${PORT}/ir.html`);
    const stale = await q.evaluate(() => localStorage.getItem("ips-lens-strength"));
    check("(c2) an old stored strength is removed when the app starts", stale === null, `stored ${stale ?? "nothing"}`);
    await open(q, RAW);
    const r6 = await report(q), c6 = await card(q);
    console.log(`  app — ${RAW.split("/").pop()} in a fresh browser with 0.4 planted: ${r6.order}\n        card: ${c6.status} · Strength ${c6.strength}`);
    check(`(c2) the planted 0.4 decides nothing: the first open lays ${STRENGTH} at decode`, laid(r6.order) === STRENGTH, r6.order || "no Correction order line");
    check(`(c2) and its Strength opens at ${STRENGTH}`, Number(c6.strength) === STRENGTH, `Strength ${c6.strength}`);
  } finally { await ctx2.close(); }

  // (d) MOVE THE SLIDER, THEN DOUBLE-TAP IT: back to full, one undo step. The
  // double tap is the panel's `dblclick` on the slider itself, as a mouse sends it.
  await setSlider(p, "hsStrength", CHOSEN);
  await p.evaluate(() => document.getElementById("hsStrength")?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true })));
  await settle(p);
  const c4 = await card(p);
  check(`(d) a double tap after ${CHOSEN} puts the Strength back to ${STRENGTH}`, Number(c4.strength) === STRENGTH, `Strength ${c4.strength}`);
  await p.evaluate(() => document.getElementById("undoBtn")?.click());
  await settle(p);
  const c5 = await card(p);
  check(`(d) and one Undo returns it to ${CHOSEN}: the double tap was one step`, Number(c5.strength) === CHOSEN, `Strength ${c5.strength}`);

  // (d2) PICK AEROCHROME, MOVE ITS FINISHING COPY, THEN DOUBLE-TAP THE COPY.
  await p.evaluate(() => document.getElementById("lookEir")?.click());
  await settle(p);
  const hasCopy = await p.evaluate(() => !!document.getElementById("finish-hsStrength"));
  check("(d2) Aerochrome's finishing panel carries a copy of the Strength slider", hasCopy, hasCopy ? "finish-hsStrength present" : "no finish-hsStrength");
  await setSlider(p, "finish-hsStrength", CHOSEN);
  const c6 = await card(p);
  // A PRECONDITION, not a finding: the copy's own listener writes the Strength,
  // so this holds whenever the copy exists. It is here so that the tap below is
  // measured from 0.3 rather than from a Strength that was already 1.
  check(`(d2) precondition: the copy moved the Strength to ${CHOSEN}, so the tap below starts away from ${STRENGTH}`, Number(c6.strength) === CHOSEN, `Strength ${c6.strength}`);
  await p.evaluate(() => document.getElementById("finish-hsStrength")?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true })));
  await settle(p);
  const c7 = await card(p);
  check(`(d2) a double tap on the copy puts the Strength back to ${STRENGTH}`, Number(c7.strength) === STRENGTH, `Strength ${c7.strength}`);

  // ── THE SLIDER'S OTHER PATHS: (e) to (h), each in a browser of its own ──
  const freshCtx = async () => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
    const q = await ctx.newPage(); q.on("dialog", (d) => d.accept());
    await q.goto(`http://127.0.0.1:${PORT}/ir.html`);
    return { ctx, q };
  };
  const idle = (q) => q.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
  // A SET through the app's own front door, every tile a real render.
  async function openSet(q, files) {
    await q.setInputFiles("#welcomeFile", files);
    await q.waitForFunction((n) => { const t = [...document.querySelectorAll("#sessionThumbs .session-thumb")]; return t.length === n && t.every((x) => !x.classList.contains("provisional") && !x.classList.contains("saving") && !!x.querySelector("img")); }, files.length, { timeout: 600000 });
    await idle(q); await settle(q);
  }
  async function goTo(q, i) {
    await q.evaluate((k) => document.querySelectorAll("#sessionThumbs .session-thumb")[k]?.click(), i);
    await q.waitForFunction((k) => !!document.querySelectorAll("#sessionThumbs .session-thumb")[k]?.classList.contains("active"), i, { timeout: 300000 });
    await idle(q); await settle(q);
  }
  const pickState = (q) => q.evaluate(() => ({ status: document.getElementById("hsStatus")?.textContent || "", strength: document.getElementById("hsStrength")?.value ?? "", asks: !document.getElementById("hsPrompt")?.hidden }));
  const picked = (s) => / · manual · /.test(s.status) && !s.asks;
  const unpicked = (s) => s.asks && !/ · manual · /.test(s.status);
  const say = (s) => `${s.asks ? "asks for a lens" : "no prompt"} · ${s.status || "no status"} · Strength ${s.strength}`;
  const pick = async (q) => { await q.evaluate(() => document.getElementById("hsApplyManual")?.click()); await settle(q); };
  const tap = async (q, id) => { await q.evaluate((i) => document.getElementById(i)?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true })), id); await settle(q); };
  const pressId = async (q, id) => { await q.evaluate((i) => document.getElementById(i)?.click(), id); await settle(q); };
  // A TILE IS REDRAWN BY REPLACING ITS PICTURE (tile-truth-walk.mjs): read the
  // src, and wait for a different one. The redraw waits for the reader to stop
  // (THUMB_IDLE_MS) and the open-tile check's debounce (restripOpen), so the
  // wait is generous.
  const tileSrc = (q, i) => q.evaluate((k) => document.querySelectorAll("#sessionThumbs .session-thumb")[k]?.querySelector("img")?.getAttribute("src") || "", i);
  const tileRedrawn = (q, i, before) => q.waitForFunction(([k, s]) => { const im = document.querySelectorAll("#sessionThumbs .session-thumb")[k]?.querySelector("img"); return !!im && (im.getAttribute("src") || "") !== s && im.complete; }, [i, before], { timeout: 30000 }).then(() => true, () => false);
  const tileSig = (q, i) => q.evaluate(async (k) => { const im = document.querySelectorAll("#sessionThumbs .session-thumb")[k]?.querySelector("img"); if (!im) return null; await im.decode().catch(() => {}); const c = document.createElement("canvas"); c.width = 32; c.height = 32; const g = c.getContext("2d"); g.drawImage(im, 0, 0, 32, 32); return [...g.getImageData(0, 0, 32, 32).data]; }, i);
  const sigDiff = (a, z) => { if (!a || !z) return NaN; let s = 0, n = 0; for (let k = 0; k < a.length; k += 4) for (let c = 0; c < 3; c++) { s += Math.abs(a[k + c] - z[k + c]); n++; } return s / n; };
  // Practice frames: no lens, no focal length, no aperture, so no profile
  // matches and the card asks for one. Behaviour only; nothing is calibrated on them.
  const EXDIR = join(ROOT, "public", "examples");
  const SET = [join(EXDIR, "NIR_0063.dng"), join(EXDIR, "NIR_0102.dng")];
  for (const f of SET) if (!existsSync(f)) { console.log(`\nno practice frame at ${f}\n`); process.exit(2); }

  const S = await freshCtx();
  try {
    const s = S.q;
    await openSet(s, SET);
    const expo1 = await s.evaluate(() => document.getElementById("expo")?.value ?? "");
    const e0 = await pickState(s);
    console.log(`  ${SET[0].split("/").pop()} opened in a set: ${say(e0)}`);
    check("(e) precondition: the practice frame matches no lens, so the card asks for one at 0", unpicked(e0) && Number(e0.strength) === 0, say(e0));
    // (f) FIRST, from the tile as the photograph opened: the pick, then
    // Strength alone, each redraw it. First because each check needs a tile
    // drawn for a different state from the one it moves to; a pick repeated
    // into a state the tile was already drawn for redraws nothing, rightly.
    const before = await tileSrc(s, 0);
    await pick(s);
    const e1 = await pickState(s);
    check(`(e) precondition: a pick names the lens and lands at ${STRENGTH}`, picked(e1) && Number(e1.strength) === STRENGTH, say(e1));
    const f1 = await tileRedrawn(s, 0, before);
    check("(f) picking a lens redraws the photograph's tile", f1, f1 ? "redrawn" : "the same picture after 30 s");
    const sigOn = await tileSig(s, 0);
    const before2 = await tileSrc(s, 0);
    await setSlider(s, "hsStrength", 0);
    const f2 = await tileRedrawn(s, 0, before2);
    check("(f) moving Strength alone redraws the tile", f2, f2 ? "redrawn" : "the same picture after 30 s");
    const dTile = sigDiff(sigOn, await tileSig(s, 0));
    check(`(f) and the tile at ${STRENGTH} carries the picked lens's correction: it differs from the tile at 0`, dTile > 0.5, `mean difference ${Number.isNaN(dTile) ? "—" : dTile.toFixed(2)} levels on a 32×32 reading`);

    // (f) AND UNDO REDRAWS IT TOO: the tile is a claim about the edit, and
    // Undo changes the edit (a review finding, 2026-09-30).
    const before3 = await tileSrc(s, 0);
    await pressId(s, "undoBtn");
    const f3 = await tileRedrawn(s, 0, before3);
    check("(f) Undo of the Strength move redraws the tile too", f3, f3 ? "redrawn" : "the same picture after 30 s");

    // (e) Undo, Redo, Reset. The history held the pick (one step) and the
    // Strength move (one step, undone just above): one more Undo goes back
    // past the pick.
    await pressId(s, "undoBtn");
    const e2 = await pickState(s);
    check("(e) Undo takes the pick back: the card asks for a lens again, at 0", unpicked(e2) && Number(e2.strength) === 0, say(e2));
    await pressId(s, "redoBtn");
    const e3 = await pickState(s);
    check(`(e) Redo brings the pick back, at ${STRENGTH}`, picked(e3) && Number(e3.strength) === STRENGTH, say(e3));
    await pressId(s, "resetBtn");
    const e4 = await pickState(s);
    check("(e) Reset returns to how the photo opened: no lens, at 0", unpicked(e4) && Number(e4.strength) === 0, say(e4));
    await tap(s, "hsStrength");
    const e5 = await pickState(s);
    check("(e2) and a double tap after Reset agrees with it: 0", Number(e5.strength) === 0, say(e5));
    await pick(s);

    // (e) A return, then (h) the double tap after it, then (e) a reload and resume.
    await setSlider(s, "hsStrength", CHOSEN);
    await goTo(s, 1);
    const expo2 = await s.evaluate(() => document.getElementById("expo")?.value ?? "");
    await goTo(s, 0);
    const e6 = await pickState(s);
    check(`(e) a return to the photograph keeps the pick and its Strength, ${CHOSEN}`, picked(e6) && Number(e6.strength) === CHOSEN, say(e6));
    check("(h) precondition: the two frames open at different Exposure", expo1 !== "" && expo2 !== "" && expo1 !== expo2, `first ${expo1}, second ${expo2}`);
    const moved = String(Number(expo1) + (Number(expo1) > 500 ? -100 : 100));
    await setSlider(s, "expo", moved);
    await tap(s, "expo");
    const expoBack = await s.evaluate(() => document.getElementById("expo")?.value ?? "");
    check("(h) after a return, a double tap on Exposure goes back to THIS photograph's opening value", expoBack === expo1, `opened at ${expo1}, the other frame at ${expo2}, moved to ${moved}, tapped to ${expoBack}`);
    await s.waitForTimeout(1600); // the open edit is written a second after a change (077)
    await s.reload();
    await s.waitForSelector("#resumeSession:not([hidden])", { timeout: 60000 });
    await s.evaluate(() => document.getElementById("resumeSession")?.click());
    await s.waitForFunction(() => !!document.querySelector("#sessionThumbs .session-thumb.active"), null, { timeout: 300000 });
    await idle(s); await settle(s);
    const e7 = await pickState(s);
    check(`(e) after a reload and resume the pick and its Strength, ${CHOSEN}, are still there`, picked(e7) && Number(e7.strength) === CHOSEN, say(e7));
  } finally { await S.ctx.close(); }

  // (g) The reader's own profile, planted for the frame: the shipped profile
  // that matches it, stored as theirs, before the app loads.
  const G = await freshCtx();
  try {
    const q = G.q;
    const own = { ...shipped, key: "walk-own", builtIn: undefined, source: "planted by lens-order-walk", frames: 1 };
    await q.evaluate((p) => localStorage.setItem("ips-lens-profiles-v1", JSON.stringify([p])), own);
    await q.goto(`http://127.0.0.1:${PORT}/ir.html`);
    await open(q, RAW);
    const ownOf = () => q.evaluate(() => ({ card: !document.getElementById("myLensCard")?.hidden, strength: document.getElementById("myLensStrength")?.value ?? "", shipped: !document.getElementById("hsCard")?.hidden, copy: document.getElementById("finish-hsStrength")?.value ?? null }));
    const g0 = await ownOf();
    check(`(g) precondition: the planted own profile matches, its card is shown at ${STRENGTH} and the shipped card is not`, g0.card && Number(g0.strength) === STRENGTH && !g0.shipped, JSON.stringify(g0));
    await pressId(q, "lookEir");
    const hBefore = await hash(q);
    await setSlider(q, "finish-hsStrength", CHOSEN);
    const g1 = await ownOf();
    const hAfter = await hash(q);
    check(`(g) moving Aerochrome's finishing copy moves the own card's Strength to ${CHOSEN}`, Number(g1.strength) === CHOSEN, JSON.stringify(g1));
    check("(g) and the picture changes with it", hAfter !== hBefore, `${hBefore} → ${hAfter}`);
    await tap(q, "finish-hsStrength");
    const g2 = await ownOf();
    check(`(g) a double tap on the copy puts the own card back to ${STRENGTH}, and the copy shows it`, Number(g2.strength) === STRENGTH && Number(g2.copy) === STRENGTH, JSON.stringify(g2));
  } finally { await G.ctx.close(); }
} finally { await b.close(); }
console.log(failed ? `\n${failed} failed` : "\nall checks passed"); process.exit(failed ? 1 : 0);
