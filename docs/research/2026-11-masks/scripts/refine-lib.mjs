// refine-lib.mjs: the helpers of refine.mjs (step 436, 11 November 2026), imported by refine.mjs and step 436's scripts; never
// run by itself. Brings a coarse map to a picture's edges by one of three stages:
//   plain     the guided filter, its guide the Rec. 709 grey of the picture, a box mean cut at the picture's edge;
//   weighted  the same filter with a weight: the pixels where the coarse map is 0.9 or more, or 0.1 or less, drawn in by one cell,
//             weigh one and the band between weighs nothing; each window's line is fitted on the sure pixels it holds, and a
//             pixel's value is the mean of the lines of the windows that hold it, each window counted by the weight it holds;
//   cues      the band decided again from the picture: the app's own cue recipe (the bundle scratch/step428-bundle.mjs), fitted on
//             the thinned sure pixels with the sure regions as its two names, gives each band pixel its weight, the sure pixels
//             keep their coarse value, then a plain guided filter of a small radius over the whole.
import { distanceTo } from './edt.mjs';

console.log('MADE TO FAIL: these helpers are proved only through refine.mjs, whose plant must read 0.00 and 1.00 either side of a step (known figures 0.00 and 1.00)');
console.log('nothing below is trustworthy unless refine.mjs printed its plant lines as its MADE TO FAIL block says');

const BUNDLE = '/tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad/scratch/step428-bundle.mjs';
const SEP_PIXELS_MAX = 1.2e6; // the test page's thinning constant, as scratch/step428-harness.mjs gives it
const LEAVE_OUT = ['height']; // the cue the page's mask leaves out, as scratch/step428-harness.mjs gives it

/** The Rec. 709 grey of RGB bytes, 0 to 1, as step 427's guided filter took it. */
export function grey(rgb, W, H) {
  const n = W * H, g = new Float64Array(n);
  for (let i = 0; i < n; i++) g[i] = (0.2126 * rgb[3 * i] + 0.7152 * rgb[3 * i + 1] + 0.0722 * rgb[3 * i + 2]) / 255;
  return g;
}

/** The mean of `src` over a square window of radius r around each pixel, the window cut at the picture's edge and the mean taken over what remains; written into `out`, which is returned. */
export function boxMean(src, W, H, r, out) {
  const tmp = new Float64Array(W * H);
  const pre = new Float64Array(W + 1);
  for (let y = 0; y < H; y++) {
    const o = y * W;
    for (let x = 0; x < W; x++) pre[x + 1] = pre[x] + src[o + x];
    for (let x = 0; x < W; x++) tmp[o + x] = pre[Math.min(W, x + r + 1)] - pre[Math.max(0, x - r)];
  }
  const cx = new Float64Array(W);
  for (let x = 0; x < W; x++) cx[x] = Math.min(W, x + r + 1) - Math.max(0, x - r);
  const acc = new Float64Array(W);
  for (let y = 0; y <= Math.min(H - 1, r); y++) { const o = y * W; for (let x = 0; x < W; x++) acc[x] += tmp[o + x]; }
  for (let y = 0; y < H; y++) {
    const cy = Math.min(H, y + r + 1) - Math.max(0, y - r), o = y * W;
    for (let x = 0; x < W; x++) out[o + x] = acc[x] / (cx[x] * cy);
    const add = y + r + 1, sub = y - r;
    if (add < H) { const a = add * W; for (let x = 0; x < W; x++) acc[x] += tmp[a + x]; }
    if (sub >= 0) { const s = sub * W; for (let x = 0; x < W; x++) acc[x] -= tmp[s + x]; }
  }
  return out;
}

const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);

/** The plain guided filter of p under the guide I at radius r and regularisation eps; returns a new Float64Array held to 0 to 1. */
export function guided(I, p, W, H, r, eps) {
  const n = W * H, t = new Float64Array(n);
  const mI = boxMean(I, W, H, r, new Float64Array(n));
  const mp = boxMean(p, W, H, r, new Float64Array(n));
  for (let i = 0; i < n; i++) t[i] = I[i] * p[i];
  const mIp = boxMean(t, W, H, r, new Float64Array(n));
  for (let i = 0; i < n; i++) t[i] = I[i] * I[i];
  const mII = boxMean(t, W, H, r, new Float64Array(n));
  const a = mIp, b = mII;
  for (let i = 0; i < n; i++) {
    let v = mII[i] - mI[i] * mI[i];
    if (v < 0) v = 0;
    const ai = (mIp[i] - mI[i] * mp[i]) / (v + eps);
    a[i] = ai;
    b[i] = mp[i] - ai * mI[i];
  }
  const mA = boxMean(a, W, H, r, mI), mB = boxMean(b, W, H, r, mp);
  const q = new Float64Array(n);
  for (let i = 0; i < n; i++) q[i] = clamp01(mA[i] * I[i] + mB[i]);
  return q;
}

/** The weighted guided filter: each window's line fitted on the pixels by their weight c (0 to 1), the lines averaged at a pixel by the weight each window holds; where no window around a pixel holds any weight the pixel keeps p. Returns a new Float64Array held to 0 to 1. */
export function weightedGuided(I, p, c, W, H, r, eps) {
  const n = W * H, t = new Float64Array(n);
  const mc = boxMean(c, W, H, r, new Float64Array(n));
  for (let i = 0; i < n; i++) t[i] = c[i] * I[i];
  const mI = boxMean(t, W, H, r, new Float64Array(n));
  for (let i = 0; i < n; i++) t[i] = c[i] * p[i];
  const mp = boxMean(t, W, H, r, new Float64Array(n));
  for (let i = 0; i < n; i++) t[i] = c[i] * I[i] * p[i];
  const mIp = boxMean(t, W, H, r, new Float64Array(n));
  for (let i = 0; i < n; i++) t[i] = c[i] * I[i] * I[i];
  const mII = boxMean(t, W, H, r, new Float64Array(n));
  const wa = mIp, wb = mII; // reused: the window's weight times its line
  for (let i = 0; i < n; i++) {
    const w = mc[i];
    if (!(w > 1e-9)) { wa[i] = 0; wb[i] = 0; continue; }
    const eI = mI[i] / w, ep = mp[i] / w;
    let v = mII[i] / w - eI * eI;
    if (v < 0) v = 0;
    const ai = (mIp[i] / w - eI * ep) / (v + eps);
    wa[i] = w * ai;
    wb[i] = w * (ep - ai * eI);
  }
  const sA = boxMean(wa, W, H, r, mI), sB = boxMean(wb, W, H, r, mp), sW = boxMean(mc, W, H, r, t);
  const q = new Float64Array(n);
  for (let i = 0; i < n; i++) q[i] = sW[i] > 1e-12 ? clamp01((sA[i] * I[i] + sB[i]) / sW[i]) : clamp01(p[i]);
  return q;
}

/** The sure pixels of a coarse map p: hi where p is 0.9 or more and lo where it is 0.1 or less, each drawn in by `cell` pixels (a pixel stays sure only where every pixel within `cell` of it is on its side). Returns { hi, lo } as Uint8Arrays and the counts. */
export function sureOf(p, W, H, cell) {
  const n = W * H;
  const dh = distanceTo(W, H, (i) => !(p[i] >= 0.9));
  const dl = distanceTo(W, H, (i) => !(p[i] <= 0.1));
  const hi = new Uint8Array(n), lo = new Uint8Array(n);
  let nh = 0, nl = 0;
  for (let i = 0; i < n; i++) {
    if (dh[i] > cell) { hi[i] = 1; nh++; }
    if (dl[i] > cell) { lo[i] = 1; nl++; }
  }
  return { hi, lo, nh, nl };
}

/** The app's cues for a picture, counted on the test page's thinned grid: { cues, cueNames, k, w, h, cols, rows }. Imports the bundle of step 428. */
export async function cuesOf(rgb, W, H) {
  const M = await import(BUNDLE);
  const light = new Uint8Array(W * H);
  for (let p = 0, s = 0; p < W * H; p++, s += 3) {
    const r = rgb[s], g = rgb[s + 1], b = rgb[s + 2];
    light[p] = r > g ? (r > b ? r : b) : (g > b ? g : b);
  }
  const k = Math.max(1, Math.ceil(Math.sqrt((W * H) / SEP_PIXELS_MAX)));
  const w = Math.floor(W / k), h = Math.floor(H / k), n = w * h;
  const tdata = new Uint8ClampedArray(n * 4), cols = new Int32Array(n), rows = new Int32Array(n), linear = new Float32Array(n * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * k * W + x * k) * 3, o = y * w + x;
    tdata[4 * o] = rgb[s]; tdata[4 * o + 1] = rgb[s + 1]; tdata[4 * o + 2] = rgb[s + 2]; tdata[4 * o + 3] = 255;
    linear[3 * o] = rgb[s] / 255; linear[3 * o + 1] = rgb[s + 1] / 255; linear[3 * o + 2] = rgb[s + 2] / 255;
    cols[o] = x * k; rows[o] = y * k;
  }
  const cues = [...M.placeCueValues(tdata, linear, light, W, H, cols, rows), ...M.placeStructureValues(light, W, H, cols, rows)];
  const cueNames = [...M.PLACE_CUES, ...M.PLACE_STRUCTURE_CUES];
  return { M, cues, cueNames, k, w, h, cols, rows };
}

/** The cue stage: returns { q, reason } where q is the refined map (Float64Array, 0 to 1) or null with the fit's reason in words. */
export function cueStage(I, p, sure, cu, W, H, r, eps) {
  const { M, cues, cueNames, k, w, h } = cu;
  const n = w * h, labels = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * k * W + x * k;
    labels[y * w + x] = sure.hi[i] ? 0 : sure.lo[i] ? 1 : 2;
  }
  const rec = M.sampleMaskFit(cues, cueNames, labels, ['subject', 'other', 'rest'], 'subject', 'refine', LEAVE_OUT);
  if (typeof rec === 'string' || !rec) return { q: null, reason: String(rec) };
  const wt = M.sampleMaskWeights(rec, cues, cueNames);
  if (typeof wt === 'string' || !wt) return { q: null, reason: String(wt) };
  const N = W * H, mid = new Float64Array(N);
  for (let Y = 0; Y < H; Y++) {
    const gy = Y / k, y0 = Math.min(h - 1, Math.floor(gy)), y1 = Math.min(h - 1, y0 + 1), fy = Math.min(1, gy - y0);
    for (let X = 0; X < W; X++) {
      const i = Y * W + X;
      if (sure.hi[i] || sure.lo[i]) { mid[i] = p[i]; continue; }
      const gx = X / k, x0 = Math.min(w - 1, Math.floor(gx)), x1 = Math.min(w - 1, x0 + 1), fx = Math.min(1, gx - x0);
      const top = wt[y0 * w + x0] * (1 - fx) + wt[y0 * w + x1] * fx, bot = wt[y1 * w + x0] * (1 - fx) + wt[y1 * w + x1] * fx;
      mid[i] = top * (1 - fy) + bot * fy;
    }
  }
  return { q: guided(I, mid, W, H, r, eps), reason: '' };
}

/** A coarse map from a truth: the truth's region `value` moved `shift` pixels across and down, each cell of `cell` pixels holding the region's share of that cell, brought back to the picture's size by bilinear interpolation between the cells' centres. Returns a Float64Array, 0 to 1. */
export function coarseFromTruth(t, W, H, value, cell, shift) {
  const nx = Math.ceil(W / cell), ny = Math.ceil(H / cell);
  const sum = new Float64Array(nx * ny), cnt = new Float64Array(nx * ny);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(H - 1, Math.max(0, y - shift)), cyi = Math.floor(y / cell);
    for (let x = 0; x < W; x++) {
      const sx = Math.min(W - 1, Math.max(0, x - shift)), j = cyi * nx + Math.floor(x / cell);
      cnt[j]++;
      if (t[sy * W + sx] === value) sum[j]++;
    }
  }
  const share = new Float64Array(nx * ny);
  for (let j = 0; j < nx * ny; j++) share[j] = cnt[j] ? sum[j] / cnt[j] : 0;
  const centre = (i, len) => (i * cell + Math.min(len, (i + 1) * cell) - 1) / 2;
  const axis = (len, m) => {
    const i0 = new Int32Array(len), i1 = new Int32Array(len), f = new Float64Array(len);
    for (let q = 0; q < len; q++) {
      let a = Math.min(m - 1, Math.floor(q / cell));
      if (q < centre(a, len)) a = Math.max(0, a - 1);
      const b = Math.min(m - 1, a + 1), ca = centre(a, len), cb = centre(b, len);
      i0[q] = a; i1[q] = b; f[q] = cb > ca ? Math.min(1, Math.max(0, (q - ca) / (cb - ca))) : 0;
    }
    return { i0, i1, f };
  };
  const ax = axis(W, nx), ay = axis(H, ny), out = new Float64Array(W * H);
  for (let y = 0; y < H; y++) {
    const r0 = ay.i0[y] * nx, r1 = ay.i1[y] * nx, fy = ay.f[y];
    for (let x = 0; x < W; x++) {
      const a = ax.i0[x], b = ax.i1[x], fx = ax.f[x];
      const top = share[r0 + a] * (1 - fx) + share[r0 + b] * fx, bot = share[r1 + a] * (1 - fx) + share[r1 + b] * fx;
      out[y * W + x] = top * (1 - fy) + bot * fy;
    }
  }
  return out;
}

/** The stages and the settings this step tries, in order: [stage, radius, regularisation]. */
export const SETTINGS = [
  ['plain', 32, 0.001], ['plain', 16, 0.001], ['plain', 64, 0.001],
  ['weighted', 48, 0.001], ['weighted', 64, 0.001], ['weighted', 96, 0.001],
  ['cues', 2, 0.001], ['cues', 4, 0.001], ['cues', 8, 0.001],
];

/** Refines one coarse map by one stage. `ctx` carries { I, rgb, W, H, cell } and caches { sure, cues } between calls on one picture and one map. Returns { q, reason }. */
export async function refine(ctx, p, stage, r, eps) {
  const { I, W, H, cell } = ctx;
  if (stage === 'plain') return { q: guided(I, p, W, H, r, eps), reason: '' };
  if (!ctx.sure) ctx.sure = sureOf(p, W, H, cell);
  if (stage === 'weighted') {
    const c = new Float64Array(W * H);
    for (let i = 0; i < W * H; i++) c[i] = ctx.sure.hi[i] || ctx.sure.lo[i] ? 1 : 0;
    return { q: weightedGuided(I, p, c, W, H, r, eps), reason: '' };
  }
  if (stage === 'cues') {
    if (!ctx.cues) ctx.cues = await cuesOf(ctx.rgb, W, H);
    return cueStage(I, p, ctx.sure, ctx.cues, W, H, r, eps);
  }
  return { q: null, reason: 'no stage named ' + stage };
}

/** A map as the bytes of the mask file: round(255 times the value). */
export function toBytes(q) {
  const b = new Uint8Array(q.length);
  for (let i = 0; i < q.length; i++) b[i] = Math.round(255 * clamp01(q[i]));
  return b;
}
