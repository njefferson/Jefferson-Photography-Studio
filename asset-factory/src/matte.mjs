// Matte finishing — the contract's #1 quality lever. Two passes over a cut-out
// RGBA PNG, applied after the background is removed and before QC:
//
//   cleanMatte  — kill low-alpha speckle to true 0, firm the near-solid interior
//                 to 255 (so light fur stops compositing as a ghost), and
//                 DECONTAMINATE the semi-transparent edge: replace each fringe
//                 pixel's colour with the subject colour bled outward from solid
//                 neighbours (alpha-weighted blur of premultiplied colour /
//                 blurred alpha). Because it only ever copies colour that exists
//                 in the subject, it removes the backdrop's coloured halo with no
//                 overshoot — unlike an algebraic C=aF+(1-a)B unmix, which divides
//                 by alpha and can explode a fringe into neon.
//
//   normalizeMargin — recanvas so the subject sits centered on a square with a
//                 consistent transparent margin. The app scales stickers by
//                 width, so uniform padding makes default drop-sizes predictable
//                 (the first hand-made examples ranged 6%–27% and dropped at
//                 inconsistent sizes).
import sharp from "sharp";
import { MATTE_SPECKLE_MAX, MATTE_SOLID_MIN, ASSET_MARGIN_FRAC, ASSET_SIZE } from "./config.mjs";

/** Separable box blur (radius r, `passes` times ≈ Gaussian) on a Float64 plane. */
function boxBlur(src, w, h, r, passes) {
  let a = Float64Array.from(src);
  const b = new Float64Array(src.length);
  const div = 2 * r + 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let s = 0;
      for (let x = -r; x <= r; x++) s += a[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        b[row + x] = s / div;
        s += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = s / div;
        s += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}

const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** Decontaminate the edge, despeckle the background, firm the interior. */
export async function cleanMatte(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const n = w * h;
  // Premultiply colour by alpha so near-transparent backdrop (α≈0) contributes
  // ~nothing to the bled colour; blur alpha alongside to re-normalize.
  const pr = new Float64Array(n), pg = new Float64Array(n), pb = new Float64Array(n), al = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = data[i * c + 3] / 255;
    pr[i] = data[i * c] * a; pg[i] = data[i * c + 1] * a; pb[i] = data[i * c + 2] * a; al[i] = a;
  }
  const r = Math.max(3, Math.round(Math.min(w, h) * 0.006));
  const br = boxBlur(pr, w, h, r, 2), bg = boxBlur(pg, w, h, r, 2), bb = boxBlur(pb, w, h, r, 2), ba = boxBlur(al, w, h, r, 2);
  for (let i = 0; i < n; i++) {
    const a8 = data[i * c + 3];
    if (a8 <= MATTE_SPECKLE_MAX) { data[i * c] = data[i * c + 1] = data[i * c + 2] = data[i * c + 3] = 0; continue; }
    if (a8 >= MATTE_SOLID_MIN) { data[i * c + 3] = 255; continue; }
    const wa = ba[i];
    if (wa > 1e-4) {
      data[i * c] = clamp8(br[i] / wa);
      data[i * c + 1] = clamp8(bg[i] / wa);
      data[i * c + 2] = clamp8(bb[i] / wa);
    }
  }
  return sharp(data, { raw: { width: w, height: h, channels: c } }).png().toBuffer();
}

/** Tight alpha bounding box (pixels with alpha above the speckle floor). */
async function alphaBBox(data, w, h, c) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * c + 3] > MATTE_SPECKLE_MAX) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  return maxX < 0 ? null : { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Center the subject on a square canvas with a uniform transparent margin. */
export async function normalizeMargin(png, marginFrac = ASSET_MARGIN_FRAC, size = ASSET_SIZE) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bbox = await alphaBBox(data, info.width, info.height, info.channels);
  if (!bbox) return png; // nothing opaque — leave as-is rather than crash
  // Fit the longer subject edge into the margin-inset content box of the square.
  const content = Math.round(size * (1 - 2 * marginFrac));
  const scale = content / Math.max(bbox.width, bbox.height);
  const rw = Math.max(1, Math.round(bbox.width * scale));
  const rh = Math.max(1, Math.round(bbox.height * scale));
  const subject = await sharp(png).ensureAlpha()
    .extract({ left: bbox.left, top: bbox.top, width: bbox.width, height: bbox.height })
    .resize(rw, rh, { fit: "fill" })
    .png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: subject, left: Math.round((size - rw) / 2), top: Math.round((size - rh) / 2) }])
    .png().toBuffer();
}

/** Full finishing pass for a cut-out asset: decontaminate then reframe. */
export async function finishMatte(png, { defringe = true } = {}) {
  const cleaned = defringe ? await cleanMatte(png) : png;
  return normalizeMargin(cleaned);
}
