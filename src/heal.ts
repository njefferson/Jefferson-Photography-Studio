// Dust & spot healing: a per-photo list of feathered clone spots that REWRITES
// THE SOURCE — each spot copies a clean patch from a nearby offset over the
// defect, blended by a radial feather.
//
// GPU/CPU strategy (deliberately NOT a shader uniform loop): denoise and
// sharpen sample the source texture with 25/49 neighbourhood taps, so an
// in-shader heal is either invisible to them (taps read the unhealed texel) or
// costs taps × spots per pixel. Instead the heal is BAKED: the preview patches
// the GPU texture (texSubImage2D of the rects below, recomputed from the
// pristine decode on every spot change), and the export applies the identical
// math to the same source bytes. Both sides run THIS code on the SAME data, so
// GPU==CPU parity is by construction — every downstream consumer (denoise
// taps, clarity, histogram, colour picks) sees healed pixels automatically.
//
// Spots always read the ORIGINAL (pre-heal) source: within a rebaked rect each
// pixel starts from the pristine value and the spots mix over it in list
// order — deterministic, order-stable, and idempotent under partial rebakes.
//
// Geometry lives in image-uv so a spot anchors to the photo across the preview
// proxy and the full-res export; the radius is a fraction of the image WIDTH
// (spots are round in pixels, and width is the shared scale of both axes).

export interface HealSpot {
  /** Destination centre, image-uv. */
  x: number;
  y: number;
  /** Destination radius as a fraction of the image width. */
  r: number;
  /** Offset to the clean source patch, image-uv (source centre = x+dx, y+dy). */
  dx: number;
  dy: number;
}

/** Feather start: weight is 1 inside HEAL_CORE·r, easing to 0 at r. */
export const HEAL_CORE = 0.45;

/** Spot radius bounds, as fractions of image width (UI slider + auto-detect). */
export const SPOT_R_MIN = 0.002;
export const SPOT_R_MAX = 0.035;
export const SPOT_R_DEFAULT = 0.008;

export interface Rect {
  x0: number;
  y0: number;
  w: number;
  h: number;
}

function smooth01(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1e-4)));
  return t * t * (3 - 2 * t);
}

/** Integer pixel bbox of a spot's destination disc at a given resolution. */
export function spotRect(s: HealSpot, W: number, H: number): Rect {
  const rPx = Math.max(1, s.r * W);
  const cx = s.x * W - 0.5;
  const cy = s.y * H - 0.5;
  const x0 = Math.max(0, Math.floor(cx - rPx - 1));
  const y0 = Math.max(0, Math.floor(cy - rPx - 1));
  const x1 = Math.min(W - 1, Math.ceil(cx + rPx + 1));
  const y1 = Math.min(H - 1, Math.ceil(cy + rPx + 1));
  return { x0, y0, w: Math.max(0, x1 - x0 + 1), h: Math.max(0, y1 - y0 + 1) };
}

/** Per-spot constants at a resolution, precomputed once per bake/scan. */
interface SpotPx {
  cx: number;
  cy: number;
  rPx: number;
  offX: number; // whole-pixel source offset (no resampling)
  offY: number;
}

function toPx(spots: readonly HealSpot[], W: number, H: number): SpotPx[] {
  return spots.map((s) => ({
    cx: s.x * W - 0.5,
    cy: s.y * H - 0.5,
    rPx: Math.max(1, s.r * W),
    offX: Math.round(s.dx * W),
    offY: Math.round(s.dy * H),
  }));
}

/** Feather weight 0..1 of one spot at pixel (px,py). */
function weightAt(s: SpotPx, px: number, py: number): number {
  const d = Math.hypot(px - s.cx, py - s.cy) / s.rPx;
  return 1 - smooth01(HEAL_CORE, 1, d);
}

const clampI = (v: number, hi: number) => (v < 0 ? 0 : v > hi ? hi : v);

/**
 * Bake a rect of HEALED 8-bit RGBA from pristine gamma bytes. Returns a tightly
 * packed RGBA patch (for texSubImage2D and for the export's patch overlay).
 * Accumulates in float across overlapping spots, quantizes ONCE at the end —
 * the export reads these exact bytes back, so both paths stay bit-identical.
 */
export function bakeRgba8(
  src: Uint8ClampedArray,
  W: number,
  H: number,
  spots: readonly HealSpot[],
  rect: Rect,
): Uint8Array {
  const sp = toPx(spots, W, H);
  const out = new Uint8Array(rect.w * rect.h * 4);
  for (let y = 0; y < rect.h; y++) {
    const py = rect.y0 + y;
    for (let x = 0; x < rect.w; x++) {
      const px = rect.x0 + x;
      const si = (py * W + px) * 4;
      let r = src[si], g = src[si + 1], b = src[si + 2];
      for (const s of sp) {
        const w = weightAt(s, px, py);
        if (w <= 0) continue;
        const qx = clampI(px + s.offX, W - 1);
        const qy = clampI(py + s.offY, H - 1);
        const qi = (qy * W + qx) * 4;
        r += (src[qi] - r) * w;
        g += (src[qi + 1] - g) * w;
        b += (src[qi + 2] - b) * w;
      }
      const o = (y * rect.w + x) * 4;
      out[o] = Math.round(r);
      out[o + 1] = Math.round(g);
      out[o + 2] = Math.round(b);
      out[o + 3] = src[si + 3];
    }
  }
  return out;
}

/**
 * Bake a rect of HEALED linear-float RGBA from a pristine linear buffer (the
 * RAW preview texture). Float32Array storage rounds to f32 exactly like the
 * RGBA32F texture upload, keeping the export mirror within float epsilon.
 */
export function bakeRgbaF32(
  src: Float32Array,
  W: number,
  H: number,
  spots: readonly HealSpot[],
  rect: Rect,
): Float32Array {
  const sp = toPx(spots, W, H);
  const out = new Float32Array(rect.w * rect.h * 4);
  for (let y = 0; y < rect.h; y++) {
    const py = rect.y0 + y;
    for (let x = 0; x < rect.w; x++) {
      const px = rect.x0 + x;
      const si = (py * W + px) * 4;
      let r = src[si], g = src[si + 1], b = src[si + 2];
      for (const s of sp) {
        const w = weightAt(s, px, py);
        if (w <= 0) continue;
        const qx = clampI(px + s.offX, W - 1);
        const qy = clampI(py + s.offY, H - 1);
        const qi = (qy * W + qx) * 4;
        r += (src[qi] - r) * w;
        g += (src[qi + 1] - g) * w;
        b += (src[qi + 2] - b) * w;
      }
      const o = (y * rect.w + x) * 4;
      out[o] = Math.fround(r);
      out[o + 1] = Math.fround(g);
      out[o + 2] = Math.fround(b);
      out[o + 3] = src[si + 3];
    }
  }
  return out;
}

// --- Export-side overlay: healed patches over a linear sampler ---------------

export type Rgb = [number, number, number];
export type Sampler = (x: number, y: number) => Rgb;

export interface HealPatch extends Rect {
  /** Linear RGB, 3 floats per pixel, row-major within the rect. */
  data: Float32Array;
}

/**
 * Healed patches for a full-res 8-bit source: the SAME quantized bytes the
 * preview bakes (bakeRgba8), lifted to linear with the caller's transfer
 * function — so the CPU export reads exactly what the GPU texture holds.
 */
export function healPatches8(
  pixels: Uint8ClampedArray,
  W: number,
  H: number,
  spots: readonly HealSpot[],
  toLinear: (v: number) => number,
): HealPatch[] {
  return spots.map((s) => {
    const rect = spotRect(s, W, H);
    const bytes = bakeRgba8(pixels, W, H, spots, rect);
    const data = new Float32Array(rect.w * rect.h * 3);
    for (let p = 0, n = rect.w * rect.h; p < n; p++) {
      data[p * 3] = toLinear(bytes[p * 4]);
      data[p * 3 + 1] = toLinear(bytes[p * 4 + 1]);
      data[p * 3 + 2] = toLinear(bytes[p * 4 + 2]);
    }
    return { ...rect, data };
  });
}

/**
 * Healed patches computed through a linear sampler (the RAW export path, where
 * the full-res image only exists as an on-demand demosaic). Mirrors
 * bakeRgbaF32: same mix math, f32-rounded like the preview texture.
 */
export function healPatchesFromSampler(
  sample: Sampler,
  W: number,
  H: number,
  spots: readonly HealSpot[],
): HealPatch[] {
  const sp = toPx(spots, W, H);
  return spots.map((s) => {
    const rect = spotRect(s, W, H);
    const data = new Float32Array(rect.w * rect.h * 3);
    for (let y = 0; y < rect.h; y++) {
      const py = rect.y0 + y;
      for (let x = 0; x < rect.w; x++) {
        const px = rect.x0 + x;
        let [r, g, b] = sample(px, py);
        for (const c of sp) {
          const w = weightAt(c, px, py);
          if (w <= 0) continue;
          const [qr, qg, qb] = sample(clampI(px + c.offX, W - 1), clampI(py + c.offY, H - 1));
          r += (qr - r) * w;
          g += (qg - g) * w;
          b += (qb - b) * w;
        }
        const o = (y * rect.w + x) * 3;
        data[o] = Math.fround(r);
        data[o + 1] = Math.fround(g);
        data[o + 2] = Math.fround(b);
      }
    }
    return { ...rect, data };
  });
}

/**
 * Wrap a linear sampler so pixels inside a healed patch read the patch.
 * Row-bucketed so the common pixel (no spot anywhere near) pays one array read.
 */
export function wrapWithPatches(sample: Sampler, patches: HealPatch[], H: number): Sampler {
  if (!patches.length) return sample;
  const rows: HealPatch[][] = new Array(H);
  for (const p of patches) {
    for (let y = p.y0; y < p.y0 + p.h && y < H; y++) (rows[y] ??= []).push(p);
  }
  return (x, y) => {
    const cy = clampI(y, H - 1);
    const bucket = rows[cy];
    if (bucket) {
      // Later patches win where rects overlap — they were baked with the full
      // spot list, so any overlapping patch holds the same composite values.
      for (let i = bucket.length - 1; i >= 0; i--) {
        const p = bucket[i];
        const cx = x < p.x0 ? -1 : x >= p.x0 + p.w ? -1 : x;
        if (cx >= 0) {
          const o = ((cy - p.y0) * p.w + (cx - p.x0)) * 3;
          return [p.data[o], p.data[o + 1], p.data[o + 2]];
        }
      }
    }
    return sample(x, y);
  };
}

// --- Auto source pick: the "best clean patch a short search away" ------------

/** Luma accessor over either preview buffer shape (gamma bytes or linear). */
export function lumaAccessor(
  src: { pixels?: Uint8ClampedArray; linear?: Float32Array },
  W: number,
): (x: number, y: number) => number {
  if (src.pixels) {
    const p = src.pixels;
    return (x, y) => {
      const i = (y * W + x) * 4;
      return (p[i] * 54 + p[i + 1] * 183 + p[i + 2] * 19) >> 8;
    };
  }
  const l = src.linear!;
  // sqrt ≈ perceptual: linear IR data is wildly skewed, and a linear-domain SAD
  // would let a few bright pixels dominate the match.
  return (x, y) => {
    const i = (y * W + x) * 4;
    return 255 * Math.sqrt(Math.max(0, l[i] * 0.2126 + l[i + 1] * 0.7152 + l[i + 2] * 0.0722));
  };
}

/**
 * Pick the clone source for a spot at (cx,cy), radius rPx (all in pixels of the
 * given buffer): search a ring of candidate offsets and score each by how well
 * the candidate's SURROUND matches the destination's surround (the annulus just
 * outside the spot — the spot itself holds the defect, so it can't vote), plus
 * a smoothness penalty inside the candidate disc (don't clone an edge onto a
 * sky). Returns the offset in PIXELS, or null when nothing usable fits.
 */
export function findHealSource(
  luma: (x: number, y: number) => number,
  W: number,
  H: number,
  cx: number,
  cy: number,
  rPx: number,
): { offX: number; offY: number } | null {
  const step = Math.max(1, Math.round(rPx / 4));
  // Sample offsets: annulus ring (match surround) + inner disc (smoothness).
  const ring: [number, number][] = [];
  const disc: [number, number][] = [];
  const R = Math.ceil(rPx * 1.5);
  for (let dy = -R; dy <= R; dy += step) {
    for (let dx = -R; dx <= R; dx += step) {
      const d = Math.hypot(dx, dy) / rPx;
      if (d > 1.05 && d <= 1.5) ring.push([dx, dy]);
      else if (d <= 0.9) disc.push([dx, dy]);
    }
  }
  if (!ring.length || !disc.length) return null;
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  // Destination surround values (skip out-of-frame samples symmetrically).
  const destRing = ring.map(([dx, dy]) => (inBounds(cx + dx, cy + dy) ? luma(cx + dx, cy + dy) : NaN));

  let best: { offX: number; offY: number; score: number } | null = null;
  const ANGLES = 16;
  for (const mult of [2.4, 3.4, 4.6]) {
    const dist = rPx * mult;
    for (let a = 0; a < ANGLES; a++) {
      const ang = (a / ANGLES) * Math.PI * 2;
      const offX = Math.round(Math.cos(ang) * dist);
      const offY = Math.round(Math.sin(ang) * dist);
      const sx = cx + offX;
      const sy = cy + offY;
      // The whole candidate disc must be in frame (its ring may clip).
      if (!inBounds(sx - rPx, sy - rPx) || !inBounds(sx + rPx, sy + rPx)) continue;
      // Surround match: SAD over the annulus.
      let sad = 0;
      let n = 0;
      for (let i = 0; i < ring.length; i++) {
        const dv = destRing[i];
        if (Number.isNaN(dv)) continue;
        const [dx, dy] = ring[i];
        if (!inBounds(sx + dx, sy + dy)) continue;
        sad += Math.abs(luma(sx + dx, sy + dy) - dv);
        n++;
      }
      if (n < ring.length * 0.6) continue; // too clipped to judge
      // Candidate smoothness: mean abs deviation inside the disc.
      let mean = 0;
      for (const [dx, dy] of disc) mean += luma(sx + dx, sy + dy);
      mean /= disc.length;
      let dev = 0;
      for (const [dx, dy] of disc) dev += Math.abs(luma(sx + dx, sy + dy) - mean);
      dev /= disc.length;
      const score = sad / n + dev * 0.75;
      if (!best || score < best.score) best = { offX, offY, score };
    }
  }
  return best && { offX: best.offX, offY: best.offY };
}

// --- Auto-detect: dust blobs on a luminance high-pass, smooth regions only ---

export interface DetectedSpot {
  x: number; // pixel centre
  y: number;
  rPx: number;
  strength: number;
}

/**
 * Find dust-like blobs: small connected regions whose luminance departs from a
 * local blur, restricted to SMOOTH neighbourhoods (dust reads worst — and
 * detection stays honest — in flat skies; in busy foliage a high-pass is all
 * texture). Classical only: box-blur high-pass, MAD noise floor, flood-fill.
 */
export function detectSpots(
  luma: (x: number, y: number) => number,
  W: number,
  H: number,
  opts: { maxSpots?: number; maxRadiusPx?: number } = {},
): DetectedSpot[] {
  const maxSpots = opts.maxSpots ?? 40;
  const maxR = opts.maxRadiusPx ?? Math.max(6, Math.round(W * 0.008));
  const blurR = Math.max(3, Math.round(maxR * 0.9));
  // Luma plane + two-pass box blur (≈ gaussian) at a dust-sized radius.
  const L = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) L[y * W + x] = luma(x, y);
  const blur = boxBlur(boxBlur(L, W, H, blurR), W, H, blurR);
  // Relative high-pass + noise floor from the median abs deviation (sampled).
  const hp = new Float32Array(W * H);
  for (let i = 0; i < L.length; i++) hp[i] = (L[i] - blur[i]) / (blur[i] + 4);
  const sampleAbs: number[] = [];
  for (let i = 0; i < hp.length; i += 97) sampleAbs.push(Math.abs(hp[i]));
  sampleAbs.sort((a, b) => a - b);
  const noise = sampleAbs[Math.floor(sampleAbs.length / 2)] || 1e-4;
  const thresh = Math.max(6 * noise, 0.035);
  // Isolation test, applied to a finished blob: a DENSE ring of RAW luma just
  // outside the mote must be uniform. Dust floats in clean sky, so its ring is
  // flat; a twig tip's branch has to CROSS the ring somewhere (strong local
  // deviation), and foliage is busy all round — both are rejected. (Testing
  // the blurred plane instead is a trap twice over: the mote depresses its own
  // blur, and blur averages a thin branch away entirely — field-found on the
  // teaching JPEGs, where a sparse blur-ring test happily "healed" twig tips.)
  const ringOk = (cx: number, cy: number, rBlob: number): boolean => {
    const ringR = rBlob * 2 + 3;
    const steps = Math.max(20, Math.round(Math.PI * ringR)); // ~2px spacing
    const vals: number[] = [];
    for (let a = 0; a < steps; a++) {
      const x = Math.round(cx + ringR * Math.cos((a / steps) * Math.PI * 2));
      const y = Math.round(cy + ringR * Math.sin((a / steps) * Math.PI * 2));
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      vals.push(L[y * W + x]);
    }
    if (vals.length < steps * 0.7) return false; // too clipped to judge
    const sorted = [...vals].sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    // FIXED bound on purpose: the global `noise` reads scene TEXTURE on a busy
    // frame (median |high-pass| of foliage is huge), and scaling by it once let
    // every foliage speck through. 7% of level clears real sky noise easily.
    return vals.every((v) => Math.abs(v - med) / (med + 4) < 0.07);
  };
  // Flood-fill connected over-threshold pixels into blobs (4-connected).
  const seen = new Uint8Array(W * H);
  const out: DetectedSpot[] = [];
  const stack: number[] = [];
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const i = y * W + x;
      if (seen[i] || Math.abs(hp[i]) < thresh) continue;
      const sign = Math.sign(hp[i]);
      let n = 0, sx = 0, sy = 0, peak = 0, minX = x, maxX = x, minY = y, maxY = y;
      stack.length = 0;
      stack.push(i);
      seen[i] = 1;
      while (stack.length) {
        const j = stack.pop()!;
        const jx = j % W, jy = (j / W) | 0;
        n++;
        sx += jx;
        sy += jy;
        peak = Math.max(peak, Math.abs(hp[j]));
        if (jx < minX) minX = jx; if (jx > maxX) maxX = jx;
        if (jy < minY) minY = jy; if (jy > maxY) maxY = jy;
        if (n > maxR * maxR * 4) break; // runaway region — not a dust spot
        for (const k of [j - 1, j + 1, j - W, j + W]) {
          const kx = k % W;
          if (k < 0 || k >= hp.length || seen[k] || Math.abs(kx - jx) > 1) continue;
          if (Math.abs(hp[k]) >= thresh * 0.55 && Math.sign(hp[k]) === sign) {
            seen[k] = 1;
            stack.push(k);
          }
        }
      }
      const w = maxX - minX + 1, h = maxY - minY + 1;
      const rBlob = Math.max(w, h) / 2;
      // Keep: dust-sized, roughly compact, in a smooth neighbourhood — and
      // DARK, unless hot-pixel tiny: sensor dust shadows the sensor, while the
      // small BRIGHT things in a sky are cloud wisps (real content — the
      // teaching cloudscapes were full of them, field-found 2026-07-14).
      if (n < 3 || rBlob > maxR || n < rBlob * rBlob * 1.1) continue;
      if (sign > 0 && rBlob > 2.5) continue;
      const cx = sx / n, cy = sy / n;
      if (!ringOk(cx, cy, rBlob)) continue;
      out.push({ x: cx, y: cy, rPx: Math.max(2, rBlob * 1.7), strength: peak });
    }
  }
  out.sort((a, b) => b.strength - a.strength);
  // Drop near-duplicates (two blobs of one big mote), keep the strongest.
  const kept: DetectedSpot[] = [];
  for (const s of out) {
    if (kept.some((k) => Math.hypot(k.x - s.x, k.y - s.y) < (k.rPx + s.rPx) * 0.9)) continue;
    kept.push(s);
    if (kept.length >= maxSpots) break;
  }
  return kept;
}

function boxBlur(src: Float32Array, W: number, H: number, r: number): Float32Array {
  const tmp = new Float32Array(W * H);
  const out = new Float32Array(W * H);
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[row + clampI(x, W - 1)];
    for (let x = 0; x < W; x++) {
      tmp[row + x] = acc * inv;
      acc += src[row + clampI(x + r + 1, W - 1)] - src[row + clampI(x - r, W - 1)];
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[clampI(y, H - 1) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = acc * inv;
      acc += tmp[clampI(y + r + 1, H - 1) * W + x] - tmp[clampI(y - r, H - 1) * W + x];
    }
  }
  return out;
}
