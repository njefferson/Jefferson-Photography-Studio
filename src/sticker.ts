// Sticker compositing — rhymes with heal.ts (src/heal.ts): stickers are baked
// INTO the linear source (pre-pipeline), so each one inherits the channel
// swap / WB / looks / grade / grain and lands in the IR palette. Geometry is
// image-uv (tracks crop/rotate/zoom); pixels are recomputed from the pristine
// source every bake, exactly like heal spots.
//
// EVERYTHING composites in LINEAR light — the 8-bit bake lifts the source to
// linear, composites, and re-gammas; the float bake and the export sampler are
// already linear. That single rule is what keeps the preview texture and the
// CPU export bit-for-bit consistent per source (the parity the walk checks).
import type { Sticker } from "./pipeline";

const REC709 = [0.2126, 0.7152, 0.0722];
const toLin = (v: number) => Math.pow(v / 255, 2.2);
const toGam = (v: number) => Math.pow(Math.min(1, Math.max(0, v)), 1 / 2.2);

/** What the occlusion "bright/dark" threshold reads: the DISPLAY luminance the
 *  user sees, not the raw source value. The source is camera-native for RAW
 *  (dim until WB + the colour matrix lift it) — so occlusion must run the base
 *  pixel through the same first pipeline steps (exposure×WB, then the camera
 *  matrix) to know how bright the scene will actually look there. 8-bit sources
 *  pass wb=[1,1,1] and no matrix (they're already ~display). */
export interface OcclusionCtx {
  wb: [number, number, number]; // WB gains with exposure folded in
  cam?: number[] | null; // camera-native -> linear sRGB (RAW only)
}

function displayLuma(r: number, g: number, b: number, occ?: OcclusionCtx): number {
  if (!occ) return r * REC709[0] + g * REC709[1] + b * REC709[2];
  let xr = r * occ.wb[0], xg = g * occ.wb[1], xb = b * occ.wb[2];
  const c = occ.cam;
  if (c) {
    const nr = c[0] * xr + c[1] * xg + c[2] * xb;
    const ng = c[3] * xr + c[4] * xg + c[5] * xb;
    const nb = c[6] * xr + c[7] * xg + c[8] * xb;
    xr = nr; xg = ng; xb = nb;
  }
  return xr * REC709[0] + xg * REC709[1] + xb * REC709[2];
}

/** A rasterised sticker asset: gamma sRGB RGBA plus a cached linear-RGB copy
 *  (alpha stays linear). Built once per asset from its PNG. */
export interface StickerAsset {
  key: string;
  w: number;
  h: number;
  lin: Float32Array; // w*h*4 — linear RGB + alpha (0..1)
  mean: [number, number, number]; // alpha-weighted mean linear RGB (for auto-match)
  /** Bounding box of the OPAQUE content in asset-uv [0,1] (u0,v0 = top-left,
   *  u1,v1 = bottom-right). Lets a cast shadow pivot on the real feet, not the
   *  transparent padding around them. Full [0,0,1,1] if the asset has no alpha. */
  opaque: { u0: number; v0: number; u1: number; v1: number };
}

export interface Rect {
  x0: number;
  y0: number;
  w: number;
  h: number;
}

/** Build a StickerAsset from gamma sRGB RGBA bytes (e.g. canvas getImageData). */
export function makeStickerAsset(key: string, w: number, h: number, rgba: Uint8ClampedArray): StickerAsset {
  const lin = new Float32Array(w * h * 4);
  let mr = 0, mg = 0, mb = 0, aw = 0;
  let x0 = w, y0 = h, x1 = -1, y1 = -1; // opaque bbox in pixels
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const r = toLin(rgba[i * 4]), g = toLin(rgba[i * 4 + 1]), b = toLin(rgba[i * 4 + 2]);
      const a = rgba[i * 4 + 3] / 255;
      lin[i * 4] = r; lin[i * 4 + 1] = g; lin[i * 4 + 2] = b; lin[i * 4 + 3] = a;
      mr += r * a; mg += g * a; mb += b * a; aw += a;
      if (a > 0.05) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  const d = Math.max(1e-4, aw);
  const opaque = x1 < x0
    ? { u0: 0, v0: 0, u1: 1, v1: 1 }
    : { u0: x0 / w, v0: y0 / h, u1: (x1 + 1) / w, v1: (y1 + 1) / h };
  return { key, w, h, lin, mean: [mr / d, mg / d, mb / d], opaque };
}

const clampI = (v: number, hi: number) => (v < 0 ? 0 : v > hi ? hi : v);

/** The 4 sticker corners in SOURCE PIXELS (order TL, TR, BR, BL), when a
 *  perspective skew is set — base rect corner + its offset, rotated + placed.
 *  Null when the sticker is a plain scale+rot rect. */
export function stickerWorldCorners(s: Sticker, W: number, H: number, asset: StickerAsset, dispRotDeg = 0): [number, number][] | null {
  const co = s.corners;
  if (!co || co.length !== 4) return null;
  const hw = (s.scale * W) / 2, hh = hw * (asset.h / asset.w);
  const a = ((s.rot - dispRotDeg) * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
  const cx = s.x * W, cy = s.y * H;
  const base: [number, number][] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  return base.map(([bx, by], k) => {
    const lx = bx + co[k][0] * hw, ly = by + co[k][1] * hh;
    return [cx + lx * cs - ly * sn, cy + lx * sn + ly * cs] as [number, number];
  });
}

/** Homography mapping the asset unit square (0,0)/(1,0)/(1,1)/(0,1) to the four
 *  image-pixel corners P (same order), 3×3 row-major (Heckbert square→quad). */
function squareToQuad(P: [number, number][]): number[] {
  const [x0, y0] = P[0], [x1, y1] = P[1], [x2, y2] = P[2], [x3, y3] = P[3];
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let a: number, b: number, d: number, e: number, g: number, h: number;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    a = x1 - x0; b = x3 - x0; d = y1 - y0; e = y3 - y0; g = 0; h = 0; // affine (parallelogram)
  } else {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
    a = x1 - x0 + g * x1; b = x3 - x0 + h * x3;
    d = y1 - y0 + g * y1; e = y3 - y0 + h * y3;
  }
  return [a, b, x0, d, e, y0, g, h, 1];
}

/** Inverse of a 3×3 (row-major), or null if singular. */
function invert3x3(m: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const iv = 1 / det;
  return [
    A * iv, (c * h - b * i) * iv, (b * f - c * e) * iv,
    B * iv, (a * i - c * g) * iv, (c * d - a * f) * iv,
    C * iv, (b * g - a * h) * iv, (a * e - b * d) * iv,
  ];
}

/** The inverse homography (image px → asset uv) for a skewed sticker, or null
 *  for a plain rect. Precompute ONCE per sticker per bake and hand to
 *  compositePixel so the per-pixel cost is a single mat-vec. */
export function stickerXform(s: Sticker, W: number, H: number, asset: StickerAsset, dispRotDeg = 0): number[] | null {
  const P = stickerWorldCorners(s, W, H, asset, dispRotDeg);
  if (!P) return null;
  return invert3x3(squareToQuad(P));
}

/** A sticker's destination bounding box in source pixels (covers rotation and,
 *  when set, the perspective quad). */
export function stickerRect(s: Sticker, W: number, H: number, asset: StickerAsset, dispRotDeg = 0): Rect {
  const P = stickerWorldCorners(s, W, H, asset, dispRotDeg);
  if (P) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(W, Math.ceil(x1)); y1 = Math.min(H, Math.ceil(y1));
    return { x0, y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
  }
  const hw = (s.scale * W) / 2;
  const hh = hw * (asset.h / asset.w);
  const cx = s.x * W, cy = s.y * H;
  const a = ((s.rot - dispRotDeg) * Math.PI) / 180;
  const c = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a));
  const bw = hw * c + hh * sn, bh = hw * sn + hh * c;
  const x0 = Math.max(0, Math.floor(cx - bw));
  const y0 = Math.max(0, Math.floor(cy - bh));
  const x1 = Math.min(W, Math.ceil(cx + bw));
  const y1 = Math.min(H, Math.ceil(cy + bh));
  return { x0, y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/** Bilinear sample of a linear asset at texcoord (tx,ty) in [0,1]; out-of-range
 *  returns alpha 0. Writes [r,g,b,a] into `out`. */
function sampleAsset(asset: StickerAsset, tx: number, ty: number, out: Float32Array): void {
  if (tx < 0 || tx > 1 || ty < 0 || ty > 1) { out[3] = 0; return; }
  const fx = tx * (asset.w - 1), fy = ty * (asset.h - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(asset.w - 1, x0 + 1), y1 = Math.min(asset.h - 1, y0 + 1);
  const dx = fx - x0, dy = fy - y0;
  const L = asset.lin;
  for (let k = 0; k < 4; k++) {
    const a = L[(y0 * asset.w + x0) * 4 + k], b = L[(y0 * asset.w + x1) * 4 + k];
    const c = L[(y1 * asset.w + x0) * 4 + k], d = L[(y1 * asset.w + x1) * 4 + k];
    out[k] = (a * (1 - dx) + b * dx) * (1 - dy) + (c * (1 - dx) + d * dx) * dy;
  }
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0 || 1e-4)));
  return t * t * (3 - 2 * t);
};

/** Bilinear sample of a single-channel 0..255 mask at (u,v) → 0..1, replicating
 *  GL LINEAR + CLAMP_TO_EDGE (u*size−0.5). A verbatim twin of pipeline.ts's
 *  sampleBrush (that one is module-private; the sticker mask is CPU-only). */
function sampleMask(b: { w: number; h: number; data: Uint8Array }, u: number, v: number): number {
  const fx = Math.min(1, Math.max(0, u)) * b.w - 0.5;
  const fy = Math.min(1, Math.max(0, v)) * b.h - 0.5;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  const cx = (i: number) => Math.max(0, Math.min(b.w - 1, i));
  const cy = (i: number) => Math.max(0, Math.min(b.h - 1, i));
  const x0 = cx(ix), x1 = cx(ix + 1), y0 = cy(iy), y1 = cy(iy + 1);
  const s = (x: number, y: number) => b.data[y * b.w + x];
  const top = s(x0, y0) * (1 - tx) + s(x1, y0) * tx;
  const bot = s(x0, y1) * (1 - tx) + s(x1, y1) * tx;
  return (top * (1 - ty) + bot * ty) / 255;
}

const MATCH_MID = 0.18; // linear mid-grey the sticker contrast pivots about

/** Apply a sticker's match adjustments to its (linear) asset colour IN PLACE.
 *  First the "blend to match" per-channel SOURCE gain (matchGain × matchAmt,
 *  which lands the sticker on the scene's colour after the pipeline), THEN the
 *  manual scalars: brightness, contrast (about mid grey), warmth (R↑/B↓),
 *  saturation (toward luma). Cheap per pixel — nothing set = the raw asset. */
function matchAsset(c: Float32Array, s: Sticker, skipGain = false): void {
  const amt = s.matchAmt ?? 0;
  // The source-space match gain only makes sense for a sticker that then goes
  // THROUGH the pipeline (in-look). An on-top sticker keeps its own colour, so
  // its gain is skipped — only the manual bright/contrast/warmth/sat apply.
  const gain = !skipGain && amt > 0 ? s.matchGain : null;
  const br = s.bright ?? 0, con = s.contrast ?? 0, wm = s.warmth ?? 0, sa = s.sat ?? 0;
  if (!gain && br === 0 && con === 0 && wm === 0 && sa === 0) return;
  let r = c[0], g = c[1], b = c[2];
  if (gain) { r *= 1 + amt * (gain[0] - 1); g *= 1 + amt * (gain[1] - 1); b *= 1 + amt * (gain[2] - 1); }
  if (br !== 0) { const k = 1 + br; r *= k; g *= k; b *= k; }
  if (con !== 0) { const cf = 1 + con; r = (r - MATCH_MID) * cf + MATCH_MID; g = (g - MATCH_MID) * cf + MATCH_MID; b = (b - MATCH_MID) * cf + MATCH_MID; }
  if (wm !== 0) { r *= 1 + wm * 0.4; b *= 1 - wm * 0.4; }
  if (sa !== 0) { const L = r * 0.2126 + g * 0.7152 + b * 0.0722; const k = 1 + sa; r = L + (r - L) * k; g = L + (g - L) * k; b = L + (b - L) * k; }
  c[0] = Math.max(0, r); c[1] = Math.max(0, g); c[2] = Math.max(0, b);
}

/** Composite the sticker list over one linear-RGB base pixel IN PLACE
 *  (`px`,`py` = source pixel centre coords; `base` = [r,g,b] linear). Painter's
 *  order (last sticker on top). Occlusion holds the sticker back where the
 *  scene luminance is on the chosen side of the threshold. */
function compositePixel(
  base: Float32Array,
  px: number,
  py: number,
  W: number,
  H: number,
  stickers: Sticker[],
  assets: Record<string, StickerAsset>,
  tmp: Float32Array,
  occ?: OcclusionCtx,
  xforms?: (number[] | null)[], // per-sticker inverse homography (skewed), else null
  dispRotDeg = 0, // photo's display rotation (EXIF orientation), so the sticker reads upright on screen
): void {
  for (let si = 0; si < stickers.length; si++) {
    const s = stickers[si];
    const asset = assets[s.asset];
    if (!asset) continue;
    const hw = (s.scale * W) / 2;
    const hh = hw * (asset.h / asset.w);
    if (hw <= 0 || hh <= 0) continue;
    let tx: number, ty: number;
    const minv = xforms ? xforms[si] : null;
    if (minv) {
      // Perspective: image px → asset uv via the inverse homography.
      const X = px + 0.5, Y = py + 0.5;
      const u = minv[0] * X + minv[1] * Y + minv[2];
      const v = minv[3] * X + minv[4] * Y + minv[5];
      const w = minv[6] * X + minv[7] * Y + minv[8];
      if (w === 0) continue;
      tx = u / w; ty = v / w;
    } else {
      const dx = px + 0.5 - s.x * W;
      const dy = py + 0.5 - s.y * H;
      // Counter the photo's display rotation (dispRotDeg = EXIF orientation, in
      // 90° steps) so the sticker reads upright on the DISPLAYED photo, not on
      // the un-rotated sensor buffer it bakes into (owner-caught: stickers came
      // out rotated on portrait/orientation-8 practice photos, 2026-07-20).
      const a = (-(s.rot - dispRotDeg) * Math.PI) / 180; // inverse rotation
      const cs = Math.cos(a), sn = Math.sin(a);
      const lx = dx * cs - dy * sn;
      const ly = dx * sn + dy * cs;
      tx = lx / (2 * hw) + 0.5;
      ty = ly / (2 * hh) + 0.5;
    }
    sampleAsset(asset, tx, ty, tmp);
    let alpha = tmp[3];
    if (alpha <= 0) continue;
    // Per-sticker erase/restore mask (asset-local): 0 hides, 1 shows.
    if (s.mask) alpha *= sampleMask(s.mask, tx, ty);
    if (alpha <= 0) continue;
    // Match adjustments recolour the asset before it composites in.
    matchAsset(tmp, s);
    if (s.occlude > 0) {
      // The base is the SOURCE pixel, whose scale differs by source kind
      // (camera-native linear for RAW, ~display for 8-bit). Fold it through a
      // soft saturating curve so "bright" and "dark" mean the same perceptual
      // thing regardless — bright IR foliage lands near 1, dark trunks near 0.
      const Lb = displayLuma(base[0], base[1], base[2], occ);
      const norm = 1 - Math.exp(-3 * Math.max(0, Lb));
      const w = s.occludeBright
        ? smooth(s.occludeLuma - 0.15, s.occludeLuma + 0.15, norm)
        : 1 - smooth(s.occludeLuma - 0.15, s.occludeLuma + 0.15, norm);
      alpha *= 1 - s.occlude * w;
    }
    base[0] = base[0] * (1 - alpha) + tmp[0] * alpha;
    base[1] = base[1] * (1 - alpha) + tmp[1] * alpha;
    base[2] = base[2] * (1 - alpha) + tmp[2] * alpha;
  }
}

/** Composite stickers over an already-healed rect of gamma-RGBA bytes IN PLACE
 *  (8-bit preview). The buffer is the heal bake's output for `rect`; each pixel
 *  is lifted to linear, composited, re-gamm'd — so stickers layer ON TOP of
 *  heals exactly as they will in the export sampler. */
export function compositeStickersIntoRect8(
  buf: Uint8Array,
  rect: Rect,
  W: number,
  H: number,
  stickers: Sticker[],
  assets: Record<string, StickerAsset>,
  occ?: OcclusionCtx,
  dispRotDeg = 0,
): void {
  if (!stickers.length) return;
  const xforms = stickers.map((s) => { const a = assets[s.asset]; return a ? stickerXform(s, W, H, a, dispRotDeg) : null; });
  const base = new Float32Array(3), tmp = new Float32Array(4);
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const o = (y * rect.w + x) * 4;
      base[0] = toLin(buf[o]); base[1] = toLin(buf[o + 1]); base[2] = toLin(buf[o + 2]);
      compositePixel(base, rect.x0 + x, rect.y0 + y, W, H, stickers, assets, tmp, occ, xforms, dispRotDeg);
      buf[o] = toGam(base[0]) * 255 + 0.5;
      buf[o + 1] = toGam(base[1]) * 255 + 0.5;
      buf[o + 2] = toGam(base[2]) * 255 + 0.5;
    }
  }
}

/** Composite stickers over an already-healed rect of linear-RGBA floats IN
 *  PLACE (RAW preview). */
export function compositeStickersIntoRectF32(
  buf: Float32Array,
  rect: Rect,
  W: number,
  H: number,
  stickers: Sticker[],
  assets: Record<string, StickerAsset>,
  occ?: OcclusionCtx,
  dispRotDeg = 0,
): void {
  if (!stickers.length) return;
  const xforms = stickers.map((s) => { const a = assets[s.asset]; return a ? stickerXform(s, W, H, a, dispRotDeg) : null; });
  const base = new Float32Array(3), tmp = new Float32Array(4);
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const o = (y * rect.w + x) * 4;
      base[0] = buf[o]; base[1] = buf[o + 1]; base[2] = buf[o + 2];
      compositePixel(base, rect.x0 + x, rect.y0 + y, W, H, stickers, assets, tmp, occ, xforms, dispRotDeg);
      buf[o] = Math.fround(base[0]);
      buf[o + 1] = Math.fround(base[1]);
      buf[o + 2] = Math.fround(base[2]);
    }
  }
}

/** A linear sampler (x,y) -> [r,g,b], as export.ts uses. */
export type Sampler = (x: number, y: number) => [number, number, number] | Float32Array;

export interface StickerPatch extends Rect {
  data: Float32Array; // linear RGB, 3 per pixel — the wrapWithPatches shape
}

/** Build export patches: composite the stickers over a LINEAR base sampler
 *  (the already-healed source), one patch per sticker. Reuses heal's
 *  wrapWithPatches downstream (each patch holds the final composited pixels). */
export function stickerPatches(
  sample: Sampler,
  W: number,
  H: number,
  stickers: Sticker[],
  assets: Record<string, StickerAsset>,
  occ?: OcclusionCtx,
  dispRotDeg = 0,
): StickerPatch[] {
  const patches: StickerPatch[] = [];
  const base = new Float32Array(3), tmp = new Float32Array(4);
  for (const s of stickers) {
    const asset = assets[s.asset];
    if (!asset) continue;
    const rect = stickerRect(s, W, H, asset, dispRotDeg);
    if (rect.w <= 0 || rect.h <= 0) continue;
    const xf = [stickerXform(s, W, H, asset, dispRotDeg)];
    const data = new Float32Array(rect.w * rect.h * 3);
    for (let y = 0; y < rect.h; y++) {
      for (let x = 0; x < rect.w; x++) {
        const sx = clampI(rect.x0 + x, W - 1), sy = clampI(rect.y0 + y, H - 1);
        const b = sample(sx, sy);
        base[0] = b[0]; base[1] = b[1]; base[2] = b[2];
        compositePixel(base, rect.x0 + x, rect.y0 + y, W, H, [s], assets, tmp, occ, xf, dispRotDeg);
        const o = (y * rect.w + x) * 3;
        data[o] = base[0]; data[o + 1] = base[1]; data[o + 2] = base[2];
      }
    }
    patches.push({ ...rect, data });
  }
  return patches;
}

// ============================================================================
// ON-TOP stickers — composited AFTER the whole pipeline, so they keep their own
// colours (owner: a sticker is a different kind of picture; it can't sit under
// the infrared filters). Both the preview (a source-space overlay TEXTURE the
// shader blends over the finished pixel) and the export (a per-pixel sampler
// blended into the finished pixel) run this SAME math, so they stay in parity.
// Occlusion + mask + perspective + the manual adjust sliders all still apply;
// only the source-space match gain is dropped (it was a pre-pipeline trick).
// ============================================================================

/** Composite the on-top sticker stack at one source pixel into a STRAIGHT-alpha
 *  GAMMA sRGB result `out` = [r,g,b,a] (0..1). Transparent (a=0) where no sticker
 *  covers it. Painter's order (last sticker on top), premultiplied-linear accum
 *  then un-premultiplied + gamma-encoded, so the shader/export can `mix(pixel,
 *  rgb, a)` in display space. */
function overlayPixel(
  px: number,
  py: number,
  W: number,
  H: number,
  stickers: Sticker[],
  assets: Record<string, StickerAsset>,
  tmp: Float32Array,
  out: Float32Array,
  occ: OcclusionCtx | undefined,
  xforms: (number[] | null)[],
  dispRotDeg: number,
  occBase?: Float32Array, // linear scene RGB under this pixel, for peek-behind luma
): void {
  let ar = 0, ag = 0, ab = 0, aa = 0; // premultiplied linear
  for (let si = 0; si < stickers.length; si++) {
    const s = stickers[si];
    const asset = assets[s.asset];
    if (!asset) continue;
    const hw = (s.scale * W) / 2;
    const hh = hw * (asset.h / asset.w);
    if (hw <= 0 || hh <= 0) continue;
    let tx: number, ty: number;
    const minv = xforms[si];
    if (minv) {
      const X = px + 0.5, Y = py + 0.5;
      const u = minv[0] * X + minv[1] * Y + minv[2];
      const v = minv[3] * X + minv[4] * Y + minv[5];
      const w = minv[6] * X + minv[7] * Y + minv[8];
      if (w === 0) continue;
      tx = u / w; ty = v / w;
    } else {
      const dx = px + 0.5 - s.x * W;
      const dy = py + 0.5 - s.y * H;
      const a = (-(s.rot - dispRotDeg) * Math.PI) / 180;
      const cs = Math.cos(a), sn = Math.sin(a);
      const lx = dx * cs - dy * sn;
      const ly = dx * sn + dy * cs;
      tx = lx / (2 * hw) + 0.5;
      ty = ly / (2 * hh) + 0.5;
    }
    sampleAsset(asset, tx, ty, tmp);
    let alpha = tmp[3];
    if (alpha <= 0) continue;
    if (s.mask) alpha *= sampleMask(s.mask, tx, ty);
    if (alpha <= 0) continue;
    if (s.shadow) {
      // A cast shadow: flat near-black silhouette. Black over the scene == Multiply,
      // so it darkens the ground like a real shadow. No colour match, no adjust.
      tmp[0] = 0; tmp[1] = 0; tmp[2] = 0;
      alpha *= s.shadowOpacity ?? 0.45;
    } else {
      // "Match the photo's colours": shift the sticker's own mean toward the scene's
      // displayed mean (both LINEAR), keeping the sticker's internal variation — so
      // it takes on the infrared palette without being cooked by the pipeline.
      const mAmt = s.matchAmt ?? 0;
      const mScene = s.matchScene;
      if (mAmt > 0 && mScene) {
        tmp[0] = Math.max(0, tmp[0] + mAmt * (mScene[0] - asset.mean[0]));
        tmp[1] = Math.max(0, tmp[1] + mAmt * (mScene[1] - asset.mean[1]));
        tmp[2] = Math.max(0, tmp[2] + mAmt * (mScene[2] - asset.mean[2]));
      }
      matchAsset(tmp, s, true); // manual bright/contrast/warmth/sat on top (source gain skipped)
    }
    if (s.occlude > 0) {
      const b = occBase ?? tmp; // caller may pass the scene under the pixel
      const Lb = occBase ? displayLuma(b[0], b[1], b[2], occ) : 0;
      const norm = 1 - Math.exp(-3 * Math.max(0, Lb));
      const w = s.occludeBright
        ? smooth(s.occludeLuma - 0.15, s.occludeLuma + 0.15, norm)
        : 1 - smooth(s.occludeLuma - 0.15, s.occludeLuma + 0.15, norm);
      alpha *= 1 - s.occlude * w;
    }
    // 'over' — this sticker on top of the accumulated stack (premultiplied).
    ar = tmp[0] * alpha + ar * (1 - alpha);
    ag = tmp[1] * alpha + ag * (1 - alpha);
    ab = tmp[2] * alpha + ab * (1 - alpha);
    aa = alpha + aa * (1 - alpha);
  }
  if (aa <= 1e-6) { out[3] = 0; return; }
  out[0] = toGam(ar / aa); out[1] = toGam(ag / aa); out[2] = toGam(ab / aa); out[3] = aa;
}

/** Build the on-top overlay for a rect into an RGBA8 buffer (gamma sRGB colour +
 *  straight coverage alpha) — the preview uploads it as a texture the shader
 *  blends over the finished pixel. `occBaseAt` supplies the LINEAR scene colour
 *  under a source pixel (for peek-behind luma); pass null to skip occlusion. */
export function compositeStickersOverlay8(
  buf: Uint8Array,
  rect: Rect,
  W: number,
  H: number,
  stickers: Sticker[],
  assets: Record<string, StickerAsset>,
  occ: OcclusionCtx | undefined,
  dispRotDeg: number,
  occBaseAt?: (sx: number, sy: number, into: Float32Array) => void,
): void {
  const xforms = stickers.map((s) => { const a = assets[s.asset]; return a ? stickerXform(s, W, H, a, dispRotDeg) : null; });
  const tmp = new Float32Array(4), out = new Float32Array(4), base = new Float32Array(3);
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const sx = rect.x0 + x, sy = rect.y0 + y;
      if (occBaseAt) occBaseAt(sx, sy, base);
      overlayPixel(sx, sy, W, H, stickers, assets, tmp, out, occ, xforms, dispRotDeg, occBaseAt ? base : undefined);
      const o = (y * rect.w + x) * 4;
      if (out[3] <= 0) { buf[o] = 0; buf[o + 1] = 0; buf[o + 2] = 0; buf[o + 3] = 0; continue; }
      buf[o] = out[0] * 255 + 0.5;
      buf[o + 1] = out[1] * 255 + 0.5;
      buf[o + 2] = out[2] * 255 + 0.5;
      buf[o + 3] = out[3] * 255 + 0.5;
    }
  }
}

/** A per-pixel on-top overlay sampler for export: `(sx,sy,out)` fills `out` with
 *  [r,g,b,a] gamma sRGB (a=0 where clear). Precomputes each sticker's inverse
 *  homography once. `occBaseAt` supplies the linear scene under a source pixel
 *  for peek-behind (matching the preview's occ), or null to skip. */
export function makeStickerOverlaySampler(
  W: number,
  H: number,
  stickers: Sticker[],
  assets: Record<string, StickerAsset>,
  occ: OcclusionCtx | undefined,
  dispRotDeg: number,
  occBaseAt?: (sx: number, sy: number, into: Float32Array) => void,
): (sx: number, sy: number, out: Float32Array) => void {
  const xforms = stickers.map((s) => { const a = assets[s.asset]; return a ? stickerXform(s, W, H, a, dispRotDeg) : null; });
  const tmp = new Float32Array(4), base = new Float32Array(3);
  return (sx: number, sy: number, out: Float32Array) => {
    if (occBaseAt) occBaseAt(sx, sy, base);
    overlayPixel(sx, sy, W, H, stickers, assets, tmp, out, occ, xforms, dispRotDeg, occBaseAt ? base : undefined);
  };
}
