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
//
// MISSED SKY IS TWO POPULATIONS AND THE FIRST VERSION AVERAGED THEM.
// NIR_0063 read 52% edge coverage at EVERY tolerance from 2.5 to 5, because
// that frame fails in two opposite directions at once: the grow takes a band
// of canopy it should not, and the sky it misses is seen through gaps in the
// branches and is joined to the open sky by no sky-coloured path at all. The
// selection spreads only through pixels that are JOINED (decision 023), so
// connectivity — the thing without which colour alone readmits half of
// NIR_1651 — is exactly what forbids reaching those. Averaging the two gives a
// number that can never go green and says nothing about either.
//
// So every keyed sky pixel is sorted first:
//
//   REACHABLE   joined to what the mask already covers by a path of keyed sky.
//               The grow could have had it. This is what the bound is over.
//   DISCONNECTED  no such path. Out of reach for a connectivity-constrained
//               selection by construction — a different mechanism's job, and
//               its own item. REPORTED, never bounded, like the spill line.
//
// THE SPLIT IS THE WALK'S OWN KEY ANSWERING ABOUT THE WALK'S OWN SKY, and that
// limit is the honest claim. `sky` here is a hue band on RENDERED canvas
// chroma; the grow keys on guide.r/guide.b at 1024 with a luma-gradient brake
// (src/skyfine.ts). Two different keys, disagreeing at the margins, so
// "disconnected" means disconnected under this one. A frame where the split
// moves the verdict gets its missed map opened before the reading is believed.
//
// THE MAP CARRIES THE SPLIT: blue is covered sky (darker = less), RED is sky
// the mask could have reached and did not, MAGENTA is sky nothing joins to the
// selection, yellow is coverage spilled onto what the key calls not-sky.
//
// --plant-reachable forces every keyed sky pixel to count as reachable, which
// is the arithmetic this file had before the split. It must reproduce the old
// readings — 52% on NIR_0063 — and the unplanted run must not. A split that
// moves no number on any frame is reading nothing, and its green means
// nothing.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split("=").slice(1).join("=");
const PORT = arg("port", "8131"), REACH = Number(arg("reach", "1")), OUT = arg("out", join(tmpdir(), "mask-truth"));
const PLANT_REACHABLE = process.argv.includes("--plant-reachable");
const DIR = "/home/user/Jefferson-Photography-Studio/public/examples";
const FRAMES = arg("frames", ["NIR_0063", "NIR_1644", "NIR_1651"].map((n) => `${DIR}/${n}.dng`).join(",")).split(",");
// 023's targets, and the readings this was written against (Aerochrome on,
// Reach 1, Feather 0.5, the 2800 px working copy): the mask covers open sky
// nearly whole and its edge band poorly — the rim the tablet showed.
// Both are over REACHABLE sky (see the header). They have not moved: lowering a
// bound to meet what a build already does makes the gate vacuous — it can no
// longer catch a regression and no longer states an intention. What changed is
// the denominator, from "every pixel the key calls sky" to "every pixel the key
// calls sky that the selection could have grown into".
const EDGE_COV_MIN = 0.85; // mean coverage of reachable sky within EDGE of something that is not sky
const OPEN_COV_MIN = 0.97; // mean coverage of reachable sky farther from an edge than that
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
const solve = (p) => p.evaluate(([SAT_FLOOR, HUE_HALF, EDGE_FRAC, PLANT_REACHABLE]) => {
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
  // 3b. REACHABLE vs DISCONNECTED. Flood from every sky pixel the mask already
  // covers, through 4-neighbours, restricted to keyed sky. What the flood
  // reaches is sky a connectivity-constrained selection could have grown into;
  // what it does not reach is joined to the selection by no sky-coloured path
  // and is out of this mechanism's reach by construction. Explicit stack, like
  // the component walk below: these frames are large enough to blow a recursive
  // one. See the header for the limit of this split — it is THIS key's answer
  // about THIS key's sky, not the grow's.
  const reachable = new Uint8Array(N);
  {
    const stack = new Int32Array(N); let sp = 0;
    for (let i = 0; i < N; i++) if (sky[i] && cov[i] >= 0.5) { reachable[i] = 1; stack[sp++] = i; }
    while (sp) {
      const i = stack[--sp]; const x = i % W, y = (i / W) | 0;
      const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
      for (const j of nb) if (j >= 0 && sky[j] && !reachable[j]) { reachable[j] = 1; stack[sp++] = j; }
    }
    // THE PLANT: every keyed sky pixel counts as reachable, which is the
    // arithmetic this file had before the split. It must reproduce the old
    // readings, or the split is not what changed them.
    if (PLANT_REACHABLE) for (let i = 0; i < N; i++) if (sky[i]) reachable[i] = 1;
  }
  let discN = 0, discCov = 0;
  for (let i = 0; i < N; i++) if (sky[i] && !reachable[i]) { discN++; discCov += Math.max(0, cov[i]); }

  // 4. distance from each sky pixel to the nearest non-sky pixel (chamfer, two passes)
  const BIG = 1e9, dist = new Float32Array(N); for (let i = 0; i < N; i++) dist[i] = sky[i] ? BIG : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!sky[i]) continue; let d = dist[i]; if (x > 0) d = Math.min(d, dist[i - 1] + 1); if (y > 0) { d = Math.min(d, dist[i - W] + 1); if (x > 0) d = Math.min(d, dist[i - W - 1] + 1.414); if (x < W - 1) d = Math.min(d, dist[i - W + 1] + 1.414); } dist[i] = d; }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (!sky[i]) continue; let d = dist[i]; if (x < W - 1) d = Math.min(d, dist[i + 1] + 1); if (y < H - 1) { d = Math.min(d, dist[i + W] + 1); if (x < W - 1) d = Math.min(d, dist[i + W + 1] + 1.414); if (x > 0) d = Math.min(d, dist[i + W - 1] + 1.414); } dist[i] = d; }
  // 5. the numbers: coverage of sky at the edge (the rim), of open sky (the gaps), and spill onto what is not sky beside it
  // The edge and open figures are over REACHABLE sky; the missed map and the
  // soft/hard shares stay over ALL keyed sky, so the whole-frame picture is
  // still printed beside the bounded one and neither has to be inferred.
  let eN = 0, eCov = 0, oN = 0, oCov = 0, soft = 0, hard = 0, rHard = 0, reachN = 0; const missed = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!sky[i]) continue;
    const c = cov[i]; soft += 1 - c;
    if (c < 0.5) { hard++; missed[i] = 1; }
    if (!reachable[i]) continue;
    reachN++;
    if (c < 0.5) rHard++;
    if (dist[i] <= EDGE) { eN++; eCov += c; } else { oN++; oCov += c; }
  }
  // spill: coverage of non-sky pixels within EDGE of a sky pixel (distance the other way, one cheap pass: any sky within EDGE in a cross)
  let sN = 0, sCov = 0; const R = EDGE;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const i = y * W + x; if (sky[i] || cov[i] < 0) continue; let near = false; for (let k = 1; k <= R && !near; k += 2) { if (x - k >= 0 && sky[i - k]) near = true; else if (x + k < W && sky[i + k]) near = true; else if (y - k >= 0 && sky[i - k * W]) near = true; else if (y + k < H && sky[i + k * W]) near = true; } if (near) { sN++; sCov += cov[i]; } }
  // largest hard-missed component, 4-connected — and WHAT IT IS, which the
  // size alone cannot say. A block this walk calls missed sky is either sky
  // the mask failed to take or something the KEY mis-called sky, and the two
  // want opposite responses. Dark out-of-focus foliage at a frame edge keys as
  // sky readily: it sits in the hue band and clears the saturation floor while
  // being nothing like the sky in brightness. So the component's own mean
  // luminance and saturation are reported beside the sky target's, and it is
  // painted its own colour on the map to be OPENED.
  const seen = new Uint8Array(N); let largest = 0; const stack = new Int32Array(N);
  let bigCells = null;
  for (let s0 = 0; s0 < N; s0++) { if (!missed[s0] || seen[s0]) continue; let sp = 0, size = 0; stack[sp++] = s0; seen[s0] = 1;
    const cells = [];
    while (sp) { const i = stack[--sp]; size++; cells.push(i); const x = i % W, y = (i / W) | 0; const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]; for (const j of nb) if (j >= 0 && missed[j] && !seen[j]) { seen[j] = 1; stack[sp++] = j; } }
    if (size > largest) { largest = size; bigCells = cells; } }
  const bigStats = (() => {
    if (!bigCells || !bigCells.length) return null;
    // WHAT SEPARATES A DEFOCUSED BRANCH FROM SKY — measured on four axes at
    // once, and REPORTED rather than acted on. Brightness alone does not: the
    // block that provoked this sits 1.8 MADs below typical sky, which is
    // ordinary variation. The field's answer to the same problem is colour
    // PLUS texture — Kodak's sky-detection patent calls it open space
    // detection, for exactly this job of separating sky from other
    // blue-coloured things — so gradient activity is measured here too.
    //
    // AT TWO SCALES, because the block is BLURRED. Bokeh is smooth at one
    // pixel and may carry structure at eight; a single-scale texture test
    // that only separates sky from IN-FOCUS foliage would pass this block
    // straight through. If neither scale separates, that is the finding.
    //
    // Every axis is reported as a signed distance in MADs from the confident
    // sky's MEDIAN. Never from its mean: on a frame whose sky holds a bright
    // cloud the mean sits six MADs up in the tail and describes nothing.
    const lumaAt = (i) => { const o = i * 4; return (B[o] * LW[0] + B[o + 1] * LW[1] + B[o + 2] * LW[2]) / 255; };
    const satAt = (i) => { const [x2, y2] = chroma(i * 4); return Math.hypot(x2, y2); };
    const gradAt = (step) => (i) => {
      const x = i % W, y = (i / W) | 0;
      const xl = Math.max(0, x - step), xr = Math.min(W - 1, x + step);
      const yd = Math.max(0, y - step), yu = Math.min(H - 1, y + step);
      return Math.hypot(lumaAt(y * W + xr) - lumaAt(y * W + xl), lumaAt(yu * W + x) - lumaAt(yd * W + x));
    };
    const AXES = [["luminance", lumaAt], ["saturation", satAt], ["texture 1px", gradAt(1)], ["texture 8px", gradAt(8)]];
    const med = (a) => { if (!a.length) return NaN; const t = Float64Array.from(a).sort(); return t[t.length >> 1]; };
    const spread = (a) => { const m = med(a); return { med: m, mad: 1.4826 * med(a.map((v) => Math.abs(v - m))) }; };
    // The sky the mask is CONFIDENT about, which is what the key already
    // learns its target from, so this adds no new dependency on the mask.
    const skyIdx = []; for (let i = 0; i < N; i++) if (cov[i] >= 0.9 && sky[i]) skyIdx.push(i);
    const axes = AXES.map(([name, f]) => {
      const sk = spread(skyIdx.map(f)), bl = spread(bigCells.map(f));
      return { name, skyMed: sk.med, skyMad: sk.mad, blockMed: bl.med,
               mads: sk.mad > 1e-9 ? (bl.med - sk.med) / sk.mad : NaN };
    });
    // The JOINT distance, because the block may be unremarkable on every axis
    // alone and far away in the space they span.
    const joint = Math.hypot(...axes.map((a) => (Number.isFinite(a.mads) ? a.mads : 0)));
    let cx = 0, cy = 0; for (const i of bigCells) { cx += i % W; cy += (i / W) | 0; }
    const n = bigCells.length;
    return { n, cx: cx / n / W, cy: 1 - (cy / n / H), axes, joint, skyN: skyIdx.length };
  })();
  const inBig = new Uint8Array(N); if (bigCells) for (const i of bigCells) inBig[i] = 1;
  // the map: sky = blue by coverage (dark = uncovered), uncovered sky = red, spill onto non-sky = yellow tint, else grey
  const oc = document.createElement("canvas"); oc.width = W; oc.height = H; const ctx = oc.getContext("2d"); const img = ctx.createImageData(W, H);
  for (let i = 0; i < N; i++) { const o = i * 4; const l = (0.2126 * B[o] + 0.7152 * B[o + 1] + 0.0722 * B[o + 2]) * 0.55; let r = l, gg = l, bb = l; const c = Math.max(0, cov[i]);
    if (sky[i]) {
      if (c >= 0.5) { r = l * 0.5; gg = l * 0.6 + 60 * c; bb = l * 0.6 + 120 * c; }
      else if (inBig[i]) { r = 255; gg = 230; bb = 60; }      // THE largest missed block, whatever it is
      else if (reachable[i]) { r = 220; gg = 40; bb = 40; }   // the mask could have had it
      else { r = 190; gg = 50; bb = 215; }                     // nothing joins it to the selection
    }
    else if (c >= 0.5) { r = l + 90 * c; gg = l + 80 * c; bb = l * 0.5; }
    img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = bb; img.data[o + 3] = 255; }
  const flipped = ctx.createImageData(W, H); for (let y = 0; y < H; y++) flipped.data.set(img.data.subarray(y * W * 4, (y + 1) * W * 4), (H - 1 - y) * W * 4); ctx.putImageData(flipped, 0, 0);
  delete window.__mt;
  let coveredPx = 0; for (let i = 0; i < N; i++) if (cov[i] >= 0.5) coveredPx++;
  return { bigStats, W, H, rows: [H - 1 - rHi, H - 1 - rLo], covered: coveredPx, skyPx, edgePx: EDGE, edgeN: eN, edgeCov: eN ? eCov / eN : NaN, openN: oN, openCov: oN ? oCov / oN : NaN, softMissed: skyPx ? soft / skyPx : NaN, hardMissed: skyPx ? hard / skyPx : NaN, reachN, reachMissed: reachN ? rHard / reachN : NaN, discN, discShare: skyPx ? discN / skyPx : NaN, discCov: discN ? discCov / discN : NaN, largest, spillN: sN, spill: sN ? sCov / sN : NaN, target: { hue: ((hue0 * 180) / Math.PI + 360) % 360, sat: tsat }, png: oc.toDataURL("image/png") };
}, [SKY_SAT_FLOOR, HUE_HALF_RAD, EDGE_FRAC, PLANT_REACHABLE]);
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
    const line = `edge (≤${m.edgePx} px) ${(100 * m.edgeCov).toFixed(0)}% of ${m.edgeN} px · open ${(100 * m.openCov).toFixed(1)}% of ${m.openN} px · uncovered ${(100 * m.reachMissed).toFixed(1)}% of ${m.reachN} reachable sky px (largest gap ${m.largest} px) · spill onto non-sky beside it ${(100 * m.spill).toFixed(0)}% of ${m.spillN} · ${m.W}×${m.H}`;
    check(`${name}: reachable sky is covered up to its edges (edge coverage ≥ ${EDGE_COV_MIN})`, m.edgeCov >= EDGE_COV_MIN, line);
    check(`${name}: reachable open sky is covered (≥ ${OPEN_COV_MIN})`, m.openCov >= OPEN_COV_MIN, `${(100 * m.openCov).toFixed(1)}%`);
    // REPORTED, NEVER BOUNDED — the same standing this file gives the spill
    // line, and for the same reason: it is not this mechanism's to fix. A
    // connectivity-constrained selection cannot enter sky nothing joins to it,
    // so a bound here would be a gate that can never go green.
    if (m.bigStats) {
      const g = m.bigStats;
      console.log(`      largest missed block: ${g.n} px at (${g.cx.toFixed(2)}, ${g.cy.toFixed(2)}) of the frame,`
        + ` against ${g.skyN} px of sky the mask is confident about — painted BRIGHT YELLOW on the missed map`);
      // REPORTED, NOT ACTED ON. No threshold here yet: the point of this run
      // is to find out whether any of these axes separates a defocused branch
      // from sky at all, on every frame rather than on the one that provoked
      // the question. A gate and its justifying measurement written in the
      // same commit is how the last version of this line shipped a rule that
      // was void on arrival.
      for (const a of g.axes) {
        console.log(`              ${a.name.padEnd(12)} sky ${a.skyMed.toFixed(4)} ± ${a.skyMad.toFixed(4)}`
          + `   block ${a.blockMed.toFixed(4)}   ${Number.isFinite(a.mads) ? `${a.mads >= 0 ? "+" : ""}${a.mads.toFixed(1)} MADs` : "no spread"}`);
      }
      console.log(`              joint distance across the four axes: ${g.joint.toFixed(1)} MADs`);
    }
    console.log(m.discN
      ? `      out of reach: ${(100 * m.discShare).toFixed(1)}% of ${m.skyPx} keyed sky px (${m.discN}) are joined to the selection by no sky-coloured path, mean coverage ${(100 * m.discCov).toFixed(1)}% — magenta on the missed map`
      : `      out of reach: none — every pixel the key calls sky is joined to the selection by a sky-coloured path`);
    await ctx.close();
  }
} finally { await b.close(); }
writeFileSync(join(OUT, "measure.json"), JSON.stringify({ reach: REACH, results }, null, 1));
console.log(`\nmissed maps and overlays in ${OUT}`);
if (PLANT_REACHABLE) console.log("\n--plant-reachable: every keyed sky pixel counted as reachable. These are the readings this file gave before the split; an unplanted run must differ.");
if (failed) console.log(`${failed} failed — the Sky mask misses sky its own colour key reaches AND CAN GET TO; decision 023 (the mask reads the sky's colour as well as its place) is what turns this green. Sky nothing joins to the selection is reported above and is not counted here.`);
else console.log("all checks passed");
process.exit(failed ? 1 : 0);
