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
const OUT = arg("out", join(tmpdir(), "sky-probe"));
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const bundle = join(mkdtempSync(join(tmpdir(), "sky-probe-")), "b.mjs");
await build({
  stdin: { contents: `
    export { decode, grayWorldWB, linearAt } from "${repo}/src/decode";
    export { buildSkyMask } from "${repo}/src/sky";
    export { buildSkyGuide, refineSkyMask, growSkyByColour, SKY_GROW_TOL } from "${repo}/src/skyfine";
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
  return { guide, seed: seed.mask, grown: A.growSkyByColour(seed.mask, guide, 1, 0.5) };
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
  png(join(OUT, `${name}-selection.png`), W, H, rgba);
}
console.log(`\n  pictures in ${OUT} — the border is drawn green. OPEN THEM; the`);
console.log(`  roughness figure only says which frame to open first.\n`);
process.exit(0);
