#!/usr/bin/env node
// THE SKY MASK, READ FROM THE READER'S SIDE — the instrument that was missing
// when a tablet showed a Sky mask leaving a rim round every object and no sky
// between the branches (decision 023). Every sky instrument here reads
// population MEANS on the look's stages; a rim moves a mean and sky missed
// between twigs does not, so nothing measured what a hand on the Masks tab
// sees. This does, with the reader's own two tools held against each other:
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/mask-truth-walk.mjs [--port=8131] [--frames=a.dng,b.NEF] [--reach=1] [--out=DIR]
//
// Per frame: open, add a Sky mask at its defaults (Reach 1, Feather 0.5, or
// --reach), set its Saturation to 1 so the mask changes nothing, and read the
// canvas twice — with the coverage overlay shown and hidden. The overlay is
// `mix(outside, inside, cov)` per pixel (gl.ts), and both `inside` and
// `outside` are functions of the plain colour, so the two reads solve for cov:
// the TRUE post-invert coverage of the mask, feather and all, exactly what the
// reader is shown. Then the sky's own colour is the mean chroma of the pixels
// the mask fully covers — the field's dragged-box average, taken from inside
// the selection — and every pixel is keyed against it with the Colour mask's
// own arithmetic (colorMaskWeight: chroma distance normalised by the target's
// saturation, Range 0.5, Feather 0.5, the defaults). A pixel the key calls sky
// that the mask does not cover, inside the rows the mask reaches, is MISSED
// SKY; a pixel the mask covers that the key calls nothing like the sky is a
// LEAK. Missed share is the bound. The leak is reported, not bounded: a cloud
// is a leak to the key and sky to the reader.
//
// MADE TO FAIL FIRST: the bound is 023's target, and the build this was
// written against reads far above it on every frame with a crown or a
// roofline — red is the expected reading until 023 lands, and this number
// crossing the bound is 023's acceptance, not a sheet. The instrument's own
// sanity check is --reach: a mask grown eagerly must miss less, one shrunk
// must miss more, or the number is not reading the mask.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split("=").slice(1).join("=");
const PORT = arg("port", "8131"), REACH = Number(arg("reach", "1")), OUT = arg("out", join(tmpdir(), "mask-truth"));
const DIR = "/home/user/Jefferson-Photography-Studio/public/examples";
const FRAMES = arg("frames", ["NIR_0063", "NIR_1644", "NIR_1651"].map((n) => `${DIR}/${n}.dng`).join(",")).split(",");
// 023's targets, and the readings this was written against (Aerochrome on,
// Reach 1, Feather 0.5, the 2800 px working copy): the mask covers open sky
// nearly whole and its edge band poorly — the rim the tablet showed.
const EDGE_COV_MIN = 0.85; // mean coverage of sky within EDGE of something that is not sky
const OPEN_COV_MIN = 0.97; // mean coverage of sky farther from an edge than that
const SKY_SAT_FLOOR = 0.12; // below this a pixel is grey, not sky: the pale sky beside a crown reads 0.15–0.25 on 1376, a cyan cast on dry grass under 0.1
const HUE_HALF_RAD = (25 * Math.PI) / 180; // the sky's hue band, either side of its circular mean
const EDGE_FRAC = 20 / 2800; // the edge band: 20 px on the 2800 px working copy, scaled to the canvas
mkdirSync(OUT, { recursive: true });
let failed = 0; const check = (n, ok, got) => { if (!ok) failed++; console.log(`${ok ? "ok  " : "FAIL"}  ${n} — ${got}`); };
const hash = (p) => p.evaluate(() => { const cv = document.querySelector("#view"); const g = cv.getContext("webgl2") || cv.getContext("webgl"); const b = new Uint8Array(cv.width * cv.height * 4); g.readPixels(0, 0, cv.width, cv.height, g.RGBA, g.UNSIGNED_BYTE, b); let h = 2166136261; for (let k = 0; k < b.length; k += 4) { h ^= b[k]; h = Math.imul(h, 16777619); h ^= b[k + 1]; h = Math.imul(h, 16777619); h ^= b[k + 2]; h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); });
async function settle(p) { let last = "", stable = 0; for (let i = 0; i < 80; i++) { const h = await hash(p); if (h === last) { if (++stable >= 2) return true; } else { stable = 0; last = h; } await p.waitForTimeout(200); } return false; }
const setSlider = async (p, id, v) => { await p.evaluate(([i, x]) => { const el = document.getElementById(i); el.value = String(x); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, [id, v]); await settle(p); };
// The measurement, in the page: two reads, the coverage solved, the key applied.
// One read of the canvas into the page's own memory, under the name given.
const readInto = (p, key) => p.evaluate((k) => { const cv = document.querySelector("#view"); const g = cv.getContext("webgl2") || cv.getContext("webgl"); const b = new Uint8Array(cv.width * cv.height * 4); g.readPixels(0, 0, cv.width, cv.height, g.RGBA, g.UNSIGNED_BYTE, b); window.__mt = window.__mt || {}; window.__mt[k] = b; return [cv.width, cv.height]; }, key);
const solve = (p) => p.evaluate(([SAT_FLOOR, HUE_HALF, EDGE_FRAC]) => {
  const A = window.__mt.A, B = window.__mt.B; const cv = document.querySelector("#view"); const W = cv.width, H = cv.height, N = W * H;
  const CY = [0.20, 0.85, 1.0], LW = [0.2126, 0.7152, 0.0722];
  // 1. coverage, solved from the two reads
  const cov = new Float32Array(N);
  for (let i = 0; i < N; i++) { const o = i * 4; if (B[o + 3] === 0) { cov[i] = -1; continue; } let best = 0, bd = 0;
    const b = [B[o] / 255, B[o + 1] / 255, B[o + 2] / 255]; const l = b[0] * LW[0] + b[1] * LW[1] + b[2] * LW[2];
    for (let c = 0; c < 3; c++) { const inside = b[c] + 0.32 * (CY[c] - b[c]); const outside = (0.5 * l + 0.5 * b[c]) * 0.5; const d = inside - outside; if (Math.abs(d) > Math.abs(bd)) { bd = d; best = (A[o + c] / 255 - outside) / d; } }
    cov[i] = Math.min(1, Math.max(0, best)); }
  // 2. the sky's colour: circular mean hue over what the mask fully covers (chromaVec, pipeline.ts)
  const chroma = (o) => { const r = B[o] / 255, gg = B[o + 1] / 255, bb = B[o + 2] / 255; const V = Math.max(r, gg, bb); if (V <= 1e-6) return [0, 0]; return [(r - 0.5 * (gg + bb)) / V, (0.8660254037844386 * (gg - bb)) / V]; };
  let tx = 0, ty = 0, tn = 0, tsat = 0; for (let i = 0; i < N; i++) if (cov[i] >= 0.9) { const [x, y] = chroma(i * 4); const s = Math.hypot(x, y); if (s < 1e-6) continue; tx += x / s; ty += y / s; tsat += s; tn++; }
  if (!tn) return { covered: 0 };
  const hue0 = Math.atan2(ty, tx); tsat /= tn;
  // 3. sky by colour: the sky's hue band (the film instrument's split, not the Colour mask's Range, which drops the paler sky next to a crown) above a saturation floor
  // ...and only in the rows the mask reaches (plus the edge band below its
  // lowest covered row): the first map keyed a cyan cast on the dry grass at
  // the bottom of 1376 as sky, and the biggest "gap" was a field.
  let rowLo = H, rowHi = -1; for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) if (cov[y * W + x] >= 0.5) { rowLo = Math.min(rowLo, y); rowHi = Math.max(rowHi, y); break; } }
  const EDGE = Math.max(4, Math.round(EDGE_FRAC * Math.max(W, H)));
  const rLo = Math.max(0, rowLo - EDGE), rHi = Math.min(H - 1, rowHi + EDGE); // WebGL rows run bottom-up; both bounds are widened
  const sky = new Uint8Array(N); let skyPx = 0;
  for (let y = rLo; y <= rHi; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (cov[i] < 0) continue; const [cx, cy] = chroma(i * 4); const s = Math.hypot(cx, cy); if (s < SAT_FLOOR) continue; let dh = Math.abs(Math.atan2(cy, cx) - hue0); if (dh > Math.PI) dh = 2 * Math.PI - dh; if (dh <= HUE_HALF) { sky[i] = 1; skyPx++; } }
  // 4. distance from each sky pixel to the nearest non-sky pixel (chamfer, two passes)
  const BIG = 1e9, dist = new Float32Array(N); for (let i = 0; i < N; i++) dist[i] = sky[i] ? BIG : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!sky[i]) continue; let d = dist[i]; if (x > 0) d = Math.min(d, dist[i - 1] + 1); if (y > 0) { d = Math.min(d, dist[i - W] + 1); if (x > 0) d = Math.min(d, dist[i - W - 1] + 1.414); if (x < W - 1) d = Math.min(d, dist[i - W + 1] + 1.414); } dist[i] = d; }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (!sky[i]) continue; let d = dist[i]; if (x < W - 1) d = Math.min(d, dist[i + 1] + 1); if (y < H - 1) { d = Math.min(d, dist[i + W] + 1); if (x < W - 1) d = Math.min(d, dist[i + W + 1] + 1.414); if (x > 0) d = Math.min(d, dist[i + W - 1] + 1.414); } dist[i] = d; }
  // 5. the numbers: coverage of sky at the edge (the rim), of open sky (the gaps), and spill onto what is not sky beside it
  let eN = 0, eCov = 0, oN = 0, oCov = 0, soft = 0, hard = 0; const missed = new Uint8Array(N);
  for (let i = 0; i < N; i++) { if (!sky[i]) continue; const c = cov[i]; soft += 1 - c; if (c < 0.5) { hard++; missed[i] = 1; } if (dist[i] <= EDGE) { eN++; eCov += c; } else { oN++; oCov += c; } }
  // spill: coverage of non-sky pixels within EDGE of a sky pixel (distance the other way, one cheap pass: any sky within EDGE in a cross)
  let sN = 0, sCov = 0; const R = EDGE;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const i = y * W + x; if (sky[i] || cov[i] < 0) continue; let near = false; for (let k = 1; k <= R && !near; k += 2) { if (x - k >= 0 && sky[i - k]) near = true; else if (x + k < W && sky[i + k]) near = true; else if (y - k >= 0 && sky[i - k * W]) near = true; else if (y + k < H && sky[i + k * W]) near = true; } if (near) { sN++; sCov += cov[i]; } }
  // largest hard-missed component, 4-connected
  const seen = new Uint8Array(N); let largest = 0; const stack = new Int32Array(N);
  for (let s0 = 0; s0 < N; s0++) { if (!missed[s0] || seen[s0]) continue; let sp = 0, size = 0; stack[sp++] = s0; seen[s0] = 1;
    while (sp) { const i = stack[--sp]; size++; const x = i % W, y = (i / W) | 0; const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]; for (const j of nb) if (j >= 0 && missed[j] && !seen[j]) { seen[j] = 1; stack[sp++] = j; } }
    largest = Math.max(largest, size); }
  // the map: sky = blue by coverage (dark = uncovered), uncovered sky = red, spill onto non-sky = yellow tint, else grey
  const oc = document.createElement("canvas"); oc.width = W; oc.height = H; const ctx = oc.getContext("2d"); const img = ctx.createImageData(W, H);
  for (let i = 0; i < N; i++) { const o = i * 4; const l = (0.2126 * B[o] + 0.7152 * B[o + 1] + 0.0722 * B[o + 2]) * 0.55; let r = l, gg = l, bb = l; const c = Math.max(0, cov[i]);
    if (sky[i]) { if (c >= 0.5) { r = l * 0.5; gg = l * 0.6 + 60 * c; bb = l * 0.6 + 120 * c; } else { r = 220; gg = 40; bb = 40; } }
    else if (c >= 0.5) { r = l + 90 * c; gg = l + 80 * c; bb = l * 0.5; }
    img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = bb; img.data[o + 3] = 255; }
  const flipped = ctx.createImageData(W, H); for (let y = 0; y < H; y++) flipped.data.set(img.data.subarray(y * W * 4, (y + 1) * W * 4), (H - 1 - y) * W * 4); ctx.putImageData(flipped, 0, 0);
  delete window.__mt;
  let coveredPx = 0; for (let i = 0; i < N; i++) if (cov[i] >= 0.5) coveredPx++;
  return { W, H, rows: [H - 1 - rHi, H - 1 - rLo], covered: coveredPx, skyPx, edgePx: EDGE, edgeN: eN, edgeCov: eN ? eCov / eN : NaN, openN: oN, openCov: oN ? oCov / oN : NaN, softMissed: skyPx ? soft / skyPx : NaN, hardMissed: skyPx ? hard / skyPx : NaN, largest, spillN: sN, spill: sN ? sCov / sN : NaN, target: { hue: ((hue0 * 180) / Math.PI + 360) % 360, sat: tsat }, png: oc.toDataURL("image/png") };
}, [SKY_SAT_FLOOR, HUE_HALF_RAD, EDGE_FRAC]);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const results = {};
try {
  for (const file of FRAMES) {
    const name = file.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
    const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } }); const p = await ctx.newPage(); p.on("dialog", (d) => d.accept());
    await p.goto(`http://127.0.0.1:${PORT}/ir.html`); await p.setInputFiles("#file", [file]);
    await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
    await p.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
    await settle(p);
    // UNDER THE LOOK, because that is where the reader works and where the
    // key can see. Ungraded, an infrared sky is within 0.001 of grey (its
    // blue is 1.4% of the sensor's range, IR-SCIENCE 4c-xi), the key's
    // normalisation floors at 0.08, and every grey thing in the frame reads
    // as sky: the first run of this walk measured the apron and the cars as
    // "sky" and reported nothing missed. The report that prompted this
    // instrument was made with Aerochrome on.
    await p.evaluate(() => document.getElementById("lookEir")?.click()); await settle(p);
    await p.click("#ptab-masks"); await p.click("#addSky"); await settle(p);
    if (REACH !== 1) await setSlider(p, "mSkyReach", REACH);
    // THE OVERLAY'S STATE IS NOT THE BUTTON'S. Dragging a mask slider steps
    // the coverage tint aside (maskAdjusting) while the Show mask button keeps
    // saying pressed, and pressing it then brings the tint back rather than
    // toggling. So the two reads are taken by the code's own sequence, not by
    // reading the button: a slider move hides the tint (the plain read), and
    // one press of Show mask afterwards restores it (the overlaid read). The
    // first version of this walk read the button and measured two overlaid
    // frames against each other.
    // A MASK WITH NOTHING TO DO IS NOT DRAWN: maskIsActive drops a mask whose
    // every adjustment is neutral before the shader sees it, slot, tint and
    // all — so setting Saturation to exactly 1 to make the mask "change
    // nothing" removed it, and two runs of this walk read an empty coverage
    // and called every frame skyless. 1.01 keeps it active and moves the
    // covered chroma by one part in a hundred, well inside the key's Range.
    await setSlider(p, "mSat", 1.01); // as good as nothing, and still a mask — and the tint steps aside
    await readInto(p, "B");
    await p.click("#mOutline"); await settle(p); // brings the tint back
    await readInto(p, "A");
    const m = await solve(p);
    if (!m.covered) { check(`${name}: the Sky mask found no sky`, true, "no coverage — nothing to measure"); results[name] = { covered: 0 }; await ctx.close(); continue; }
    // The key discriminates only when the sky has colour to key on.
    check(`${name}: the sky's colour is keyable (sat > 0.08)`, m.target.sat > 0.08, `mean sat ${m.target.sat.toFixed(3)} at hue ${m.target.hue.toFixed(0)}°`);
    writeFileSync(join(OUT, `${name}-missed.png`), Buffer.from(m.png.split(",")[1], "base64"));
    await p.locator("#view").screenshot({ path: join(OUT, `${name}-overlay.png`) });
    results[name] = { ...m, png: undefined };
    const line = `edge (≤${m.edgePx} px) ${(100 * m.edgeCov).toFixed(0)}% of ${m.edgeN} px · open ${(100 * m.openCov).toFixed(1)}% of ${m.openN} px · uncovered ${(100 * m.hardMissed).toFixed(1)}% of ${m.skyPx} sky px (largest gap ${m.largest} px) · spill onto non-sky beside it ${(100 * m.spill).toFixed(0)}% of ${m.spillN} · ${m.W}×${m.H}`;
    check(`${name}: sky is covered up to its edges (edge coverage ≥ ${EDGE_COV_MIN})`, m.edgeCov >= EDGE_COV_MIN, line);
    check(`${name}: open sky is covered (≥ ${OPEN_COV_MIN})`, m.openCov >= OPEN_COV_MIN, `${(100 * m.openCov).toFixed(1)}%`);
    await ctx.close();
  }
} finally { await b.close(); }
writeFileSync(join(OUT, "measure.json"), JSON.stringify({ reach: REACH, results }, null, 1));
console.log(`\nmissed maps and overlays in ${OUT}`);
if (failed) console.log(`${failed} failed — the Sky mask misses sky its own colour key reaches; decision 023 (the mask reads the sky's colour as well as its place) is what turns this green`);
else console.log("all checks passed");
process.exit(failed ? 1 : 0);
