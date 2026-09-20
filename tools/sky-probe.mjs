#!/usr/bin/env node
// THE SKY SELECTION, MEASURED AND DRAWN WITHOUT A BROWSER.
//
//   node tools/sky-probe.mjs [--frames=NIR_0063,NIR_1644,NIR_1651] [--out=DIR]
//
// WHY IT IS IN tools/ RATHER THAN A SCRATCHPAD, which is the whole point of
// this file existing: it has now been written THREE times. IR-SCIENCE 4b-v
// cites a scratch maskprobe for the "25 px ramp comes back 4 px wide" control
// and it died with its session; 018 wrote a second one for the same reason;
// 023 wrote a third to measure the grow. Record 023's own "Built already"
// section warns, in writing, that a fourth would get written — and then the
// session that wrote the third left it in /tmp anyway. (LESSONS 330.)
//
// WHAT IT IS FOR, and what it is NOT. It bundles the app's own decode, seed
// and grow for node with esbuild and reports the selection in SECONDS rather
// than the minutes a browser walk costs, so a constant can be swept. It also
// writes a picture per frame, because a coverage number cannot say whether an
// edge is ragged.
//
// IT IS NOT THE ACCEPTANCE INSTRUMENT. `tools/mask-truth-walk.mjs` is, and its
// edge-band coverage and spill are computed from what the READER is shown,
// against a sky truth this cannot see. Reimplementing that truth here would be
// a second instrument free to disagree with the first, which is how a repo
// ends up with two answers. Use this to narrow candidates; use the walk to
// decide.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const FRAMES = arg("frames", "NIR_0063,NIR_1644,NIR_1651").split(",").filter(Boolean);
const WHY = process.argv.includes("--why");
const OUT = arg("out", join(tmpdir(), "sky-probe"));
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const bundle = join(mkdtempSync(join(tmpdir(), "sky-probe-")), "b.mjs");
await build({
  stdin: { contents: `
    export { decode, grayWorldWB, linearAt } from "${repo}/src/decode";
    export { buildSkyMask } from "${repo}/src/sky";
    export { buildSkyGuide, refineSkyMask, growSkyByColour, skyGrowKey, skyGrowGradient, SKY_GROW_TOL, GRAD_STOP } from "${repo}/src/skyfine";
    export { BRUSH_MAX_EDGE } from "${repo}/src/pipeline";`, resolveDir: repo, loader: "ts" },
  bundle: true, format: "esm", platform: "node", outfile: bundle, logLevel: "warning",
});
const A = await import(pathToFileURL(bundle).href);

const crcT = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc = (b) => { let c = -1; for (const v of b) c = crcT[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const L = Buffer.alloc(4); L.writeUInt32BE(d.length);
  const td = Buffer.concat([Buffer.from(t, "ascii"), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([L, td, c]); };

/** Write an RGBA buffer as a PNG.
 *  Takes the path, width, height and a W*H*4 buffer; returns nothing.
 *  What it must satisfy: one IDAT, filter 0 per row — the pictures exist to be
 *  OPENED, so the encoder stays boring rather than clever. */
function png(path, W, H, rgba) {
  const rows = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) { rows[y * (W * 4 + 1)] = 0; rgba.copy(rows, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4); }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 6;
  writeFileSync(path, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ih), chunk("IDAT", deflateSync(rows, { level: 6 })), chunk("IEND", Buffer.alloc(0))]));
}

/** The seed, the guide and the grown selection for one practice frame.
 *  Takes the frame's base name; returns the guide and both bitmaps, or null
 *  when the heuristic finds no sky. The frame's own `rotate` is passed
 *  through — see the note at the call.
 *  What the result must satisfy: it is built through the app's OWN functions at
 *  the app's own default Reach and Feather, so a number here is a number the
 *  app would produce — this file measures the app, it does not model it. */
async function selectionFor(name) {
  const bytes = new Uint8Array(readFileSync(join(repo, "public/examples", `${name}.dng`)));
  const img = await A.decode({ name: `${name}.dng`, kind: "dng", bytes, looksTranscoded: false });
  const wb = A.grayWorldWB(img);
  const sample = (x, y) => A.linearAt(img, x, y);
  // THE ROTATION IS NOT OPTIONAL AND A ZERO HERE IS A DIFFERENT PHOTOGRAPH.
  // buildSkyMask measures "depth" as distance from the DISPLAY-TOP edge, which
  // is the only part of it that depends on orientation — so a hard-coded 0 on a
  // portrait frame hunts for sky along the wrong edge and grows a selection the
  // app would never produce. The first version of this file did exactly that
  // and reported NIR_1651's boundary as clean while the app was rendering a
  // different, partial selection. The decode carries `rotate`; use it.
  const seed = A.buildSkyMask(sample, img.width, img.height, img.rotate ?? 0, img.camMatrix ?? null, wb, A.BRUSH_MAX_EDGE, 1, 0.5);
  if (!seed.found) return null;
  const guide = A.buildSkyGuide(sample, img.width, img.height, wb);
  return {
    guide,
    seed: seed.mask,
    grown: A.growSkyByColour(seed.mask, guide, 1, 0.5),
    // The grow's OWN decision, from the grow's own exported function rather
    // than from a copy of it here — see skyGrowKey's contract.
    key: A.skyGrowKey(seed.mask, guide, 1),
    grad: A.skyGrowGradient(guide),
  };
}

/** Per-pixel boundary roughness: of the selected pixels that sit ON the
 *  selection's border, what share have a border neighbour that is NOT on the
 *  border. A clean contour runs as a thin connected line and scores low; a
 *  staircase breaks it up and scores high.
 *  Takes the bitmap; returns the share, 0..1, and the border pixel count.
 *  What it must satisfy: it is a POINTER at where to look, never the verdict —
 *  the picture beside it is the verdict. */
function roughness(m) {
  const { w: W, h: H, data } = m;
  const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && data[y * W + x] >= 128;
  const border = new Uint8Array(W * H);
  let n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!on(x, y)) continue;
    if (on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1)) continue;
    border[y * W + x] = 1; n++;
  }
  let kinked = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (!border[y * W + x]) continue;
    let nb = 0;
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) if (border[(y+dy)*W + x+dx]) nb++;
    if (nb > 3) kinked++;   // more than a line's worth of border neighbours
  }
  return { share: n ? kinked / n : 0, n };
}

/** WHY THE GROW STOPPED: the sky-coloured ground it never took, and whether
 *  anything the seed marked lies in the same piece of it.
 *
 *  Takes the guide, the grown selection, the grow's own key and its gradient
 *  field; returns the components of "the grow's colour test admits this and
 *  the selection does not have it", largest first, each saying whether its
 *  colour-connected component contains a seed.
 *
 *  What the result must satisfy, and it is the whole point: the two answers
 *  are exclusive and mean different things.
 *
 *    SEEDED — a path of pixels the grow's OWN colour test admits runs from the
 *      seed to this ground, so colour did not refuse it and connectivity did
 *      not sever it. The only thing left that can stop the flood is the brake:
 *      a pixel may be SELECTED on an edge and is never propagated THROUGH.
 *      That is a defect of this mechanism, with a named cause.
 *    NOT SEEDED — no such path exists. The grow is behaving exactly as it is
 *      specified to, and this ground is out of reach for anything that keeps
 *      connectivity at all. That is decision 028's territory, not 023's.
 *
 *  It works on `matches` and `seeded` ALONE and never re-runs the flood.
 *  Reconstructing the flood here to explain the flood is the second instrument
 *  free to disagree with the first, which this file's header already refuses.
 *
 *  ONE CONCESSION TO THE FEATHER. `grown` has been box-blurred after the flood
 *  (2 px at the default), so thresholding it at half puts a hairline of
 *  disagreement round the whole boundary. The selection is dilated by 3 px
 *  before the comparison, which can only UNDER-report unselected ground — a
 *  conservative direction for a diagnostic whose subject is a block of some
 *  thousands of pixels. */
function whyStopped(guide, grown, key, grad, GRAD_STOP) {
  const W = guide.w, H = guide.h, N = W * H;
  // Selected, dilated by 3 to absorb the feather's hairline.
  const sel = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (grown.data[i] >= 128) sel[i] = 1;
  for (let pass = 0; pass < 3; pass++) {
    const grow = new Uint8Array(sel);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (sel[i]) continue;
      if ((x > 0 && sel[i - 1]) || (x < W - 1 && sel[i + 1]) || (y > 0 && sel[i - W]) || (y < H - 1 && sel[i + W])) grow[i] = 1;
    }
    sel.set(grow);
  }
  // Components of everything the grow's colour test admits, and whether each
  // holds a seed. One pass over the whole frame, explicit stack.
  const comp = new Int32Array(N).fill(-1);
  const hasSeed = [], size = [];
  const stack = new Int32Array(N);
  for (let s0 = 0; s0 < N; s0++) {
    if (comp[s0] >= 0 || !key.matches(s0)) continue;
    const id = size.length; size.push(0); hasSeed.push(false);
    let sp = 0; stack[sp++] = s0; comp[s0] = id;
    while (sp) {
      const i = stack[--sp]; size[id]++;
      if (key.seeded[i]) hasSeed[id] = true;
      const x = i % W, y = (i / W) | 0;
      const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
      for (const j of nb) if (j >= 0 && comp[j] < 0 && key.matches(j)) { comp[j] = id; stack[sp++] = j; }
    }
  }
  // The unselected part of each colour component, as its own 4-connected
  // pieces — a component can be half taken and half not.
  const un = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (key.matches(i) && !sel[i]) un[i] = 1;
  const seen = new Uint8Array(N), out = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (!un[s0] || seen[s0]) continue;
    let sp = 0, n = 0, sx = 0, sy = 0, gHi = 0, gSum = 0;
    stack[sp++] = s0; seen[s0] = 1;
    const cells = [];
    while (sp) {
      const i = stack[--sp]; n++; cells.push(i);
      sx += i % W; sy += (i / W) | 0;
      gSum += grad[i]; if (grad[i] >= GRAD_STOP) gHi++;
      const x = i % W, y = (i / W) | 0;
      const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
      for (const j of nb) if (j >= 0 && un[j] && !seen[j]) { seen[j] = 1; stack[sp++] = j; }
    }
    out.push({ n, cx: sx / n / W, cy: sy / n / H, seeded: hasSeed[comp[s0]], compSize: size[comp[s0]],
               gradHi: gHi / n, gradMean: gSum / n, cells });
  }
  out.sort((a, b) => b.n - a.n);
  return out;
}

console.log(`\n=== sky selection · tolerance ${A.SKY_GROW_TOL} · ${FRAMES.length} frame(s) ===\n`);
for (const name of FRAMES) {
  const s = await selectionFor(name);
  if (!s) { console.log(`  ${name}: the heuristic found no sky`); continue; }
  const { guide, seed, grown } = s;
  const cov = (m) => { let k = 0; for (const v of m.data) if (v >= 128) k++; return 100 * k / m.data.length; };
  const seedCov = (() => { let k = 0; for (const v of seed.data) if (v >= 128) k++; return 100 * k / seed.data.length; })();
  const r = roughness(grown);
  console.log(`  ${name}  seed ${seedCov.toFixed(1)}% of frame -> grown ${cov(grown).toFixed(1)}%`
    + `   boundary roughness ${(100 * r.share).toFixed(1)}% of ${r.n} border px`);
  // The picture: the photograph in grey, the selection's INTERIOR faint and its
  // BORDER bright, because the border is the thing being judged.
  const W = guide.w, H = guide.h, rgba = Buffer.alloc(W * H * 4);
  const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && grown.data[y * W + x] >= 128;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, l = Math.round(25 + 130 * Math.min(1, guide.l[p]));
    let c = [l, l, l];
    if (on(x, y)) {
      const edge = !(on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1));
      c = edge ? [90, 240, 120] : [l * 0.5, l * 0.7, Math.min(255, l * 1.5)];
    }
    rgba[p * 4] = c[0]; rgba[p * 4 + 1] = c[1]; rgba[p * 4 + 2] = c[2]; rgba[p * 4 + 3] = 255;
  }
  if (WHY && s.key) {
    const found = whyStopped(guide, grown, s.key, s.grad, A.GRAD_STOP);
    const big = found.filter((c) => c.n >= 200).slice(0, 5);
    const total = found.reduce((a, c) => a + c.n, 0);
    console.log(`      the grow's own colour test admits ground the selection does not have:`
      + ` ${(100 * total / (W * H)).toFixed(1)}% of the guide in ${found.length} pieces`);
    if (!big.length) console.log(`      nothing above 200 px — no block to explain`);
    for (const c of big) {
      // THE DIAGNOSIS. A piece whose colour-connected component holds a seed
      // was reachable by colour and was not taken, and the brake is the only
      // thing left that can do that. A piece whose component holds none was
      // severed by the colour test itself, and no tolerance short of dropping
      // connectivity reaches it.
      console.log(`      ${String(c.n).padStart(7)} px at (${c.cx.toFixed(2)}, ${c.cy.toFixed(2)}) of the frame`
        + ` — its colour-connected component is ${c.compSize} px and ${c.seeded ? "HOLDS A SEED" : "holds NO seed"}`);
      console.log(`              ${c.seeded
        ? `colour did not refuse it and connectivity did not sever it: the BRAKE stopped the flood. ${(100 * c.gradHi).toFixed(0)}% of it sits at or above GRAD_STOP ${A.GRAD_STOP} (mean ${c.gradMean.toFixed(3)})`
        : `no path of sky-coloured pixels joins it to the seed: the grow is doing what it says, and this is decision 028's ground rather than 023's`}`);
      // Paint it, because a component the arithmetic calls large can be
      // scattered speckle and only the picture says which.
      for (const i of c.cells) {
        rgba[i * 4] = c.seeded ? 255 : 190; rgba[i * 4 + 1] = c.seeded ? 140 : 50; rgba[i * 4 + 2] = c.seeded ? 20 : 215;
      }
    }
  }
  png(join(OUT, `${name}-selection.png`), W, H, rgba);
}
console.log(`\n  pictures in ${OUT} — the border is drawn green. OPEN THEM; the`);
console.log(`  roughness figure only says which frame to open first.`);
if (WHY) console.log(`  With --why: ORANGE is sky-coloured ground the brake stopped the flood`
  + `\n  reaching, MAGENTA is ground no sky-coloured path joins to the seed at all.`);
console.log("");
process.exit(0);
