#!/usr/bin/env node
// THE FILM REFERENCE — Aerochrome developed OUTSIDE the app's pipeline, from
// the raw, so the app has something to be compared AGAINST that is not its own
// output. It renders. It is not a candidate for the app: its colour is
// IMPOSED by population membership, which the film did optically and a
// converted sensor cannot do (IR-SCIENCE.md 4b-vii).
//
//   node tools/film-reference.mjs [--frames=a.NEF,b.dng] [--out=DIR] [--no-sheet]
//
// Defaults: the four practice frames the solve used (0627, 0063, 1644, 1651)
// under public/examples; the real NEFs are not in the repository. Output: one
// PNG per frame and filter (Y yellow, R red), a contact sheet, measure.json —
// each render read with the same film instrument the app's renders are read
// with (hue-split populations, circular mean, mean sat and value, colourless
// share), so the two columns of a sheet are one number apart, not two methods.
//
// WHAT THE DATA CONTAINS, and the whole basis of the mapping (4c-i, measured):
// after white balance the green and blue channels agree within 0.6% in every
// population — both record infrared, their visible passbands lie below the
// filter's cut — so the sensor carries ONE chromatic axis: red-plus-infrared
// against infrared. SIGN MEASURED: infrared-bright foliage has MORE green-and-
// blue than red (visible red dilutes the infrared in the red channel), so
// t = ((G+B)/2 − R) / mean is positive toward foliage. The first run had it
// the other way and rendered a blue tree under a red sky.
//
// THE NEUTRAL IS THE GROUND'S gray-world, not the frame's: over the whole
// frame it lands inside the sky on a sky-dominated frame (3406: 28% sky, its
// sky's t within 0.06 of zero). The sky is what the field separates by a
// SELECTION, so it is the app's own selection here (skyfine.ts, coarse mask
// refined to the picture's edges — the 384-texel mask alone left a white halo
// round every crown), gated by the sky being infrared-POOR: 0627 has no sky
// and the selection took its dark blurred background (58% of the frame, median
// t +0.07); every real sky read −0.04 (overcast) to −0.17. The per-pixel guard
// keeps an infrared-bright thing inside the selection (a cloud, a crown) white.
//
// The decoders are the app's own, bundled at run time by esbuild from src/, so
// this cannot drift from what the app decodes.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split("=").slice(1).join("=");
const OUT = arg("out", join(tmpdir(), "film-reference")); mkdirSync(OUT, { recursive: true });
const FRAMES = arg("frames", ["NIR_0627", "NIR_0063", "NIR_1644", "NIR_1651"].map((n) => `public/examples/${n}.dng`).join(",")).split(",").map((p) => resolve(p));
const SHEET = !process.argv.includes("--no-sheet");

// The app's decode and selection, bundled from the source tree into a temp file.
const bundle = join(OUT, "app-decode.mjs");
await build({
  stdin: { contents: `
    export { readNefCfa } from "${ROOT}/src/raw/nef";
    export { demosaicBinned } from "${ROOT}/src/raw/demosaic";
    export { decodeMosaicedDng } from "${ROOT}/src/raw/dngRaw";
    export { Tiff } from "${ROOT}/src/raw/tiff";
    export { readCameraMatrix, cameraModel } from "${ROOT}/src/decode";
    export { nikonColorMatrix, camToSrgbLinear } from "${ROOT}/src/color";
    export { prepareSkySource, buildSkySelectionFrom } from "${ROOT}/src/skyfine";`, resolveDir: ROOT, loader: "ts" },
  bundle: true, format: "esm", platform: "node", outfile: bundle, logLevel: "warning",
});
const { readNefCfa, demosaicBinned, decodeMosaicedDng, Tiff, readCameraMatrix, cameraModel, nikonColorMatrix, camToSrgbLinear, prepareSkySource, buildSkySelectionFrom } = await import(pathToFileURL(bundle).href);

// The film, measured (4b-iii). Values: foliage 0.77 and sky 0.32 under both filters.
const FILM = {
  Y: { folHue: 6.2, folSat: 0.60, skyHue: 204.0, skySat: 0.66, label: "yellow filter (lighter)" },
  R: { folHue: 9.0, folSat: 0.78, skyHue: 217.1, skySat: 0.92, label: "red filter (darker)" },
};
const SKY_VALUE = 0.32, FOL_VALUE = 0.77;
// Fitted constants, each from a reading named in 4b-vii.
const FOL_LO = 0.03, FOL_HI = 0.12;          // foliage membership on t: knee above the axis noise (±0.02 after the blur), full by a foliage frame's 90th percentile
const SKY_KEY_LO = 0.00, SKY_KEY_HI = 0.04;  // frame key on −(selection median t): a sky is infrared-poor
const SKY_GUARD_LO = 0.04, SKY_GUARD_HI = -0.02; // per pixel: t above +0.04 inside the selection is infrared-bright, not sky
const CHROMA_RADIUS = 2;                     // box radius on t, binned pixels, BEFORE any mapping
const smooth01 = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

function decodeRaw(path) {
  const bytes = new Uint8Array(readFileSync(path)); const ifds = new Tiff(bytes).allIfds();
  const cam = camToSrgbLinear(readCameraMatrix(ifds) ?? nikonColorMatrix(cameraModel(ifds)));
  const o = ifds[0]?.num(274)[0]; const rot = o === 6 ? 1 : o === 3 ? 2 : o === 8 ? 3 : 0; // decode.ts orientationToRotate
  if (/\.nef$/i.test(path)) { const cfa = readNefCfa(bytes); const d = demosaicBinned(cfa.cfa, cfa.width, cfa.height, cfa.pattern, cfa.black, cfa.white); return { W: d.width, H: d.height, linear: d.linear, cam, rot }; }
  const cfaRaw = ifds.find((d) => d.num(254)[0] === 0 && d.num(262)[0] === 32803 && (d.num(259)[0] === 7 || d.num(259)[0] === 1));
  const img = decodeMosaicedDng(bytes, cfaRaw); return { W: img.width, H: img.height, linear: img.linear, cam, rot };
}
function boxBlur(src, W, H, r) {
  if (r <= 0) return src;
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H), n = 2 * r + 1;
  for (let y = 0; y < H; y++) { let s = 0; const row = y * W; for (let x = -r; x <= r; x++) s += src[row + Math.min(W - 1, Math.max(0, x))]; for (let x = 0; x < W; x++) { tmp[row + x] = s / n; s += src[row + Math.min(W - 1, x + r + 1)] - src[row + Math.max(0, x - r)]; } }
  for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.min(H - 1, Math.max(0, y)) * W + x]; for (let y = 0; y < H; y++) { out[y * W + x] = s / n; s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]; } }
  return out;
}
function weight(bm, u, v) { const fx = Math.min(bm.w - 1, Math.max(0, u * bm.w - 0.5)), fy = Math.min(bm.h - 1, Math.max(0, v * bm.h - 0.5)); const x0 = fx | 0, y0 = fy | 0, x1 = Math.min(bm.w - 1, x0 + 1), y1 = Math.min(bm.h - 1, y0 + 1); const tx = fx - x0, ty = fy - y0, g = (x, y) => bm.data[y * bm.w + x] / 255; return g(x0, y0) * (1 - tx) * (1 - ty) + g(x1, y0) * tx * (1 - ty) + g(x0, y1) * (1 - tx) * ty + g(x1, y1) * tx * ty; }
const hsv2rgb = (h, s, v) => { const c = v * s, hp = (((h % 360) + 360) % 360) / 60, x = c * (1 - Math.abs((hp % 2) - 1)), m = v - c; let r, g, b; if (hp < 1) [r, g, b] = [c, x, 0]; else if (hp < 2) [r, g, b] = [x, c, 0]; else if (hp < 3) [r, g, b] = [0, c, x]; else if (hp < 4) [r, g, b] = [0, x, c]; else if (hp < 5) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x]; return [r + m, g + m, b + m]; };
// The film instrument on 8-bit RGB — the same arithmetic as the in-page version the app's renders are read with.
function measure(rgb, n) {
  const fol = { x: 0, y: 0, n: 0, s: 0, v: 0 }, sky = { x: 0, y: 0, n: 0, s: 0, v: 0 }; let colourless = 0, all = 0;
  for (let i = 0; i < n * 3; i += 3) { all++; const r = rgb[i], gg = rgb[i + 1], bb = rgb[i + 2]; const mx = Math.max(r, gg, bb), mn = Math.min(r, gg, bb), dd = mx - mn; if (dd < 12) { colourless++; continue; }
    let h; if (mx === r) h = ((gg - bb) / dd) % 6; else if (mx === gg) h = (bb - r) / dd + 2; else h = (r - gg) / dd + 4; h = (((h * 60) % 360) + 360) % 360; const s = dd / mx, v = mx / 255;
    const pop = (h > 320 || h < 40) ? fol : (h > 140 && h < 240) ? sky : null; if (!pop) continue; const rad = h * Math.PI / 180; pop.x += Math.cos(rad); pop.y += Math.sin(rad); pop.n++; pop.s += s; pop.v += v; }
  const fin = (q) => q.n ? { hue: (((Math.atan2(q.y, q.x) * 180) / Math.PI) + 360) % 360, sat: q.s / q.n, val: q.v / q.n, share: q.n / all } : null;
  return { fol: fin(fol), sky: fin(sky), colourless: colourless / all };
}
// Minimal PNG writer: 8-bit RGB, filter 0, one IDAT.
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) { const t = Buffer.from(type, "latin1"), len = Buffer.alloc(4); len.writeUInt32BE(data.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, crc]); }
function rotateRgb(rgb, W, H, rot) {
  if (!rot) return { rgb, W, H };
  const W2 = rot % 2 ? H : W, H2 = rot % 2 ? W : H, out = new Uint8Array(W2 * H2 * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let nx, ny; if (rot === 1) { nx = H - 1 - y; ny = x; } else if (rot === 2) { nx = W - 1 - x; ny = H - 1 - y; } else { nx = y; ny = W - 1 - x; }
    const a = (y * W + x) * 3, b = (ny * W2 + nx) * 3; out[b] = rgb[a]; out[b + 1] = rgb[a + 1]; out[b + 2] = rgb[a + 2]; }
  return { rgb: out, W: W2, H: H2 };
}
function writePng(path, rgb, W, H) {
  const raw = Buffer.alloc((W * 3 + 1) * H); for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; raw.set(rgb.subarray(y * W * 3, (y + 1) * W * 3), y * (W * 3 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]));
}

const out = {}, TW = 640, tiles = [];
console.log(`film reference → ${OUT}\nwindows: foliage t ${FOL_LO}→${FOL_HI} · sky key −t50 ${SKY_KEY_LO}→${SKY_KEY_HI} · guard t ${SKY_GUARD_HI}→${SKY_GUARD_LO} · chroma box radius ${CHROMA_RADIUS}`);
for (const file of FRAMES) {
  const name = file.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, ""), t0 = Date.now();
  const { W, H, linear, cam, rot } = decodeRaw(file);
  const sel = buildSkySelectionFrom(prepareSkySource({ width: W, height: H, linear, camMatrix: cam }));
  const bm = sel.fine ?? sel.mask; const N = W * H, WS = new Float32Array(N);
  if (bm) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) WS[y * W + x] = weight(bm, (x + 0.5) / W, (y + 0.5) / H);
  let gr = 0, gg = 0, gb = 0, gn = 0; const st = Math.max(1, Math.floor(Math.min(W, H) / 256));
  for (let y = 0; y < H; y += st) for (let x = 0; x < W; x += st) { const i = y * W + x; if (WS[i] > 0.2) continue; gr += linear[i * 4]; gg += linear[i * 4 + 1]; gb += linear[i * 4 + 2]; gn++; }
  gr = Math.max(1e-4, gr / gn); gg = Math.max(1e-4, gg / gn); gb = Math.max(1e-4, gb / gn); const gm = (gr + gg + gb) / 3; const wb = [gm / gr, gm / gg, gm / gb];
  const L = new Float32Array(N), T = new Float32Array(N);
  for (let i = 0; i < N; i++) { const r = linear[i * 4] * wb[0], g = linear[i * 4 + 1] * wb[1], b = linear[i * 4 + 2] * wb[2]; const m = (r + g + b) / 3; L[i] = m; T[i] = m > 1e-4 ? ((g + b) / 2 - r) / m : 0; }
  const Ts = boxBlur(T, W, H, CHROMA_RADIUS);
  const sorted = Float32Array.from(L).sort(); const p995 = sorted[Math.floor(0.995 * (N - 1))] || 1; const gain = 0.85 / p995; // the bright end to 0.85, the app's own aim
  const gt = [], skt = []; for (let i = 0; i < N; i += 7) (WS[i] > 0.5 ? skt : gt).push(Ts[i]); gt.sort((a, b) => a - b); skt.sort((a, b) => a - b);
  const pq = (arr, q) => arr.length ? arr[Math.floor(q * (arr.length - 1))] : NaN;
  const tstats = { p05: pq(gt, 0.05), p50: pq(gt, 0.5), p90: pq(gt, 0.9), p95: pq(gt, 0.95), skyShare: skt.length / (gt.length + skt.length), skyT50: pq(skt, 0.5) };
  const skyKey = skt.length ? smooth01(SKY_KEY_LO, SKY_KEY_HI, -tstats.skyT50) : 0; tstats.skyKey = skyKey;
  for (const tag of Object.keys(FILM)) {
    const F = FILM[tag]; const rgb = new Uint8Array(N * 3);
    for (let i = 0; i < N; i++) {
      const t = Ts[i], ws = WS[i] * skyKey * smooth01(SKY_GUARD_LO, SKY_GUARD_HI, t), wf = smooth01(FOL_LO, FOL_HI, t) * (1 - ws);
      const vlin = Math.pow(Math.min(1, L[i] * gain), 1 / 2.2);
      const v = vlin * (1 - ws) + Math.min(vlin, SKY_VALUE + (vlin - SKY_VALUE) * 0.35) * ws;
      const vv = v * (1 - wf) + (vlin * 0.85 + FOL_VALUE * 0.15) * wf;
      const [r, g, b] = hsv2rgb(wf >= ws ? F.folHue : F.skyHue, Math.min(1, wf * F.folSat + ws * F.skySat), Math.min(1, vv));
      rgb[i * 3] = Math.round(255 * r); rgb[i * 3 + 1] = Math.round(255 * g); rgb[i * 3 + 2] = Math.round(255 * b);
    }
    const m = measure(rgb, N); m.tstats = tstats; out[`${name}-${tag}`] = m;
    const w2 = W >> 1, h2 = H >> 1, small = new Uint8Array(w2 * h2 * 3);
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) for (let c = 0; c < 3; c++) { const a = ((2 * y) * W + 2 * x) * 3 + c; small[(y * w2 + x) * 3 + c] = (rgb[a] + rgb[a + 3] + rgb[a + W * 3] + rgb[a + W * 3 + 3]) >> 2; }
    const R = rotateRgb(small, w2, h2, rot); writePng(join(OUT, `${name}-${tag}.png`), R.rgb, R.W, R.H);
    if (SHEET) { const sc = R.W / TW, th = Math.round(R.H / sc), tile = new Uint8Array(TW * th * 3);
      for (let y = 0; y < th; y++) for (let x = 0; x < TW; x++) { const sx = Math.min(R.W - 1, Math.floor(x * sc)), sy = Math.min(R.H - 1, Math.floor(y * sc)); for (let c = 0; c < 3; c++) tile[(y * TW + x) * 3 + c] = R.rgb[(sy * R.W + sx) * 3 + c]; }
      tiles.push({ name, tag, tile, th }); }
    console.log(`  ${name}-${tag}: sky ${m.sky ? `${m.sky.hue.toFixed(1)}° sat ${m.sky.sat.toFixed(2)} val ${m.sky.val.toFixed(2)} (${(100 * m.sky.share).toFixed(0)}%)` : "none"} · foliage ${m.fol ? `${m.fol.hue.toFixed(1)}° sat ${m.fol.sat.toFixed(2)} val ${m.fol.val.toFixed(2)} (${(100 * m.fol.share).toFixed(0)}%)` : "none"} · colourless ${(100 * m.colourless).toFixed(1)}% · ground t p05/p50/p90 ${tstats.p05.toFixed(2)}/${tstats.p50.toFixed(2)}/${tstats.p90.toFixed(2)} · sky sel ${(100 * tstats.skyShare).toFixed(0)}% t50 ${tstats.skyT50.toFixed(2)} key ${skyKey.toFixed(2)} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
}
writeFileSync(join(OUT, "measure.json"), JSON.stringify(out, null, 1));
if (SHEET && tiles.length) {
  const names = [...new Set(tiles.map((t) => t.name))], tags = Object.keys(FILM), G = 8;
  const rowH = names.map((n) => Math.max(...tiles.filter((t) => t.name === n).map((t) => t.th)));
  const SW = tags.length * TW + (tags.length + 1) * G, SH = rowH.reduce((a, b) => a + b + G, G), sheet = new Uint8Array(SW * SH * 3).fill(24);
  let y0 = G; names.forEach((n, ri) => { tags.forEach((tag, ci) => { const t = tiles.find((q) => q.name === n && q.tag === tag); if (!t) return; const x0 = G + ci * (TW + G);
    for (let y = 0; y < t.th; y++) sheet.set(t.tile.subarray(y * TW * 3, (y + 1) * TW * 3), ((y0 + y) * SW + x0) * 3); }); y0 += rowH[ri] + G; });
  writePng(join(OUT, "contact.png"), sheet, SW, SH); console.log(`contact sheet ${SW}×${SH}: rows ${names.join(", ")}; columns ${tags.join(", ")}`);
}
console.log("film (4b-iii): Y sky 204.0° sat 0.66 val 0.32 · foliage 6.2° sat 0.60 val 0.77 · colourless 13.8% | R sky 217.1° sat 0.92 · foliage 9.0° sat 0.78 · colourless 3.6%");
process.exit(0);
