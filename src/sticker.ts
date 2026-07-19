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
  for (let i = 0; i < w * h; i++) {
    const r = toLin(rgba[i * 4]), g = toLin(rgba[i * 4 + 1]), b = toLin(rgba[i * 4 + 2]);
    const a = rgba[i * 4 + 3] / 255;
    lin[i * 4] = r; lin[i * 4 + 1] = g; lin[i * 4 + 2] = b; lin[i * 4 + 3] = a;
    mr += r * a; mg += g * a; mb += b * a; aw += a;
  }
  const d = Math.max(1e-4, aw);
  return { key, w, h, lin, mean: [mr / d, mg / d, mb / d] };
}

const clampI = (v: number, hi: number) => (v < 0 ? 0 : v > hi ? hi : v);

/** A sticker's destination bounding box in source pixels (covers rotation). */
export function stickerRect(s: Sticker, W: number, H: number, asset: StickerAsset): Rect {
  const hw = (s.scale * W) / 2;
  const hh = hw * (asset.h / asset.w);
  const cx = s.x * W, cy = s.y * H;
  const a = (s.rot * Math.PI) / 180;
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
 *  Brightness (multiply), contrast (about mid grey), warmth (R↑/B↓), saturation
 *  (toward luma). Cheap scalars read per pixel — all-0 = the raw asset. */
function matchAsset(c: Float32Array, s: Sticker): void {
  const br = s.bright ?? 0, con = s.contrast ?? 0, wm = s.warmth ?? 0, sa = s.sat ?? 0;
  if (br === 0 && con === 0 && wm === 0 && sa === 0) return;
  let r = c[0], g = c[1], b = c[2];
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
): void {
  for (const s of stickers) {
    const asset = assets[s.asset];
    if (!asset) continue;
    const hw = (s.scale * W) / 2;
    const hh = hw * (asset.h / asset.w);
    if (hw <= 0 || hh <= 0) continue;
    const dx = px + 0.5 - s.x * W;
    const dy = py + 0.5 - s.y * H;
    const a = (-s.rot * Math.PI) / 180; // inverse rotation
    const cs = Math.cos(a), sn = Math.sin(a);
    const lx = dx * cs - dy * sn;
    const ly = dx * sn + dy * cs;
    const tx = lx / (2 * hw) + 0.5;
    const ty = ly / (2 * hh) + 0.5;
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
): void {
  if (!stickers.length) return;
  const base = new Float32Array(3), tmp = new Float32Array(4);
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const o = (y * rect.w + x) * 4;
      base[0] = toLin(buf[o]); base[1] = toLin(buf[o + 1]); base[2] = toLin(buf[o + 2]);
      compositePixel(base, rect.x0 + x, rect.y0 + y, W, H, stickers, assets, tmp, occ);
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
): void {
  if (!stickers.length) return;
  const base = new Float32Array(3), tmp = new Float32Array(4);
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const o = (y * rect.w + x) * 4;
      base[0] = buf[o]; base[1] = buf[o + 1]; base[2] = buf[o + 2];
      compositePixel(base, rect.x0 + x, rect.y0 + y, W, H, stickers, assets, tmp, occ);
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
): StickerPatch[] {
  const patches: StickerPatch[] = [];
  const base = new Float32Array(3), tmp = new Float32Array(4);
  for (const s of stickers) {
    const asset = assets[s.asset];
    if (!asset) continue;
    const rect = stickerRect(s, W, H, asset);
    if (rect.w <= 0 || rect.h <= 0) continue;
    const data = new Float32Array(rect.w * rect.h * 3);
    for (let y = 0; y < rect.h; y++) {
      for (let x = 0; x < rect.w; x++) {
        const sx = clampI(rect.x0 + x, W - 1), sy = clampI(rect.y0 + y, H - 1);
        const b = sample(sx, sy);
        base[0] = b[0]; base[1] = b[1]; base[2] = b[2];
        compositePixel(base, rect.x0 + x, rect.y0 + y, W, H, [s], assets, tmp, occ);
        const o = (y * rect.w + x) * 3;
        data[o] = base[0]; data[o + 1] = base[1]; data[o + 2] = base[2];
      }
    }
    patches.push({ ...rect, data });
  }
  return patches;
}
