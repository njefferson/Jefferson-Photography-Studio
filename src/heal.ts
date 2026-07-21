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
 * Find dust-like blobs on a THREE-LEVEL PYRAMID: the full plane for small
 * sharp motes and hot pixels, and 2×/4× downsampled planes (dark-only) for
 * the big soft smudges real sensor dust makes at small apertures — the
 * owner's obvious spot measured rBlob ≈ 50-80 preview px at ~6% depth, far
 * beyond anything a full-res pass can hold in its high-pass. Downsampling
 * turns a huge faint smudge into a small strong blob (and averages noise
 * down), so each level runs the SAME cheap pass.
 *
 * Specificity comes from PER-BLOB tests, not global thresholds (a global
 * noise floor reads scene TEXTURE on a busy frame — it inflated the
 * threshold ~15× over the real smudge on the owner's lakeside NEF):
 *  - dust is ROUND: eccentricity from the blob's second moments rejects twig
 *    fragments and bark striations (which ring tests miss when the twig is
 *    isolated against sky);
 *  - dust STANDS OUT of a calm surround: the blob's peak must clear the
 *    ring's own roughness by a healthy factor (local SNR) — texture specks
 *    sit barely above their busy surround, a faint smudge towers over quiet
 *    sky;
 *  - the ring itself must be MOSTLY calm (majority rule, not every-sample —
 *    a big smudge's ring legitimately clips the odd ripple or branch).
 * Classical only: box-blur high-pass, flood-fill, moments.
 */
export function detectSpots(
  luma: (x: number, y: number) => number,
  W: number,
  H: number,
  opts: { maxSpots?: number; maxRadiusPx?: number } = {},
): DetectedSpot[] {
  const maxSpots = opts.maxSpots ?? 40;
  const fineR = opts.maxRadiusPx ?? Math.max(6, Math.round(W * 0.008));
  const L1 = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) L1[y * W + x] = luma(x, y);
  const [L2, W2, H2] = downsample2(L1, W, H);
  const [L4, W4, H4] = downsample2(L2, W2, H2);
  // BUSY MAP (the owner's uniform-area rule, 2026-07-14, as load-bearing
  // structure): gradient-magnitude outliers over the frame's calm-area grain.
  // Gradients are purely local (no blur halo), light up twigs/bark/sparkle,
  // and stay blind to a soft smudge's shallow ramp. ABSOLUTE bar: the luma
  // planes are sqrt-encoded, so sensor noise is variance-stabilized — a
  // relative bar made dark sky read 10× busier than bright ice.
  const busy1 = new Float32Array(W * H);
  {
    const grad = new Float32Array(W * H);
    for (let y = 0; y < H - 1; y++) {
      for (let x = 0; x < W - 1; x++) {
        const i = y * W + x;
        grad[i] = Math.abs(L1[i + 1] - L1[i]) + Math.abs(L1[i + W] - L1[i]);
      }
    }
    const sample: number[] = [];
    for (let i = 0; i < grad.length; i += 97) sample.push(grad[i]);
    sample.sort((a, b) => a - b);
    const noiseRef = sample[Math.floor(sample.length * 0.25)] || 0.5;
    const busyPix = Math.max(2, 4 * noiseRef);
    for (let i = 0; i < grad.length; i++) busy1[i] = grad[i] > busyPix ? 1 : 0;
  }
  // Downsampling the busy map gives per-block busy DENSITY at each level.
  const [B2] = downsample2(busy1, W, H);
  const [B4] = downsample2(B2, W2, H2);
  // The high-pass blur must sit ~2× ABOVE the level's largest target blob or
  // it tracks the blob and erases it from its own high-pass (measured twice:
  // 20-24px smudges at blurR≈maxR never crossed threshold; the same failure
  // returned at the top of each pyramid level's size band).
  const base = { blurR: Math.max(6, fineR * 2), maxR: fineR };
  const out: DetectedSpot[] = [
    // Fine, full res: sharp motes + hot pixels. The only pass that accepts
    // (tiny) BRIGHT blobs, and the only one with a σ-scaled threshold.
    ...detectPass(L1, W, H, { ...base, floor: 0.035, sigmaK: 6, darkOnly: false, minN: 3, compact: 1.1, ecc: 2.6, snr: 1.5, busyFrac: 0.06 }).map(scaleSpot(1)),
    // Mid (2×) and coarse (4×): soft dark smudges. Fixed floors — the
    // per-blob tests carry the specificity. The floors sit just under HALF
    // the depth of the owner's real smudge (~4.5-5%): low enough for real
    // dust with margin, high enough that the ~2% compression mottle in
    // smooth JPEG skies (invisible to the eye) stays un-flagged.
    // The smudge passes seed AND grow only through calm blocks (growable):
    // on a busy frame the canopy's wide-blur halo is one giant connected
    // over-threshold region that bled across the sky and swallowed smudge
    // seeds into rejected mega-blobs. Busy country is a wall now. (The fine
    // pass stays ungated — a sharp mote's own edges are busy pixels, and its
    // σ-scaled threshold already keeps seeds rare on busy frames.)
    ...detectPass(L2, W2, H2, { ...base, floor: 0.03, sigmaK: 0, darkOnly: true, minN: 6, compact: 0.9, ecc: 2.2, snr: 1.5, busyFrac: 0.2, growable: B2 }).map(scaleSpot(2)),
    ...detectPass(L4, W4, H4, { ...base, floor: 0.028, sigmaK: 0, darkOnly: true, minN: 6, compact: 0.9, ecc: 2.2, snr: 1.5, busyFrac: 0.25, growable: B4 }).map(scaleSpot(4)),
  ];
  // Strengths are peak-over-floor ratios, so the sort is scale-comparable.
  // Drop near-duplicates (the same mote seen at two levels, or two blobs of
  // one big smudge), keeping the strongest.
  out.sort((a, b) => b.strength - a.strength);
  let kept: DetectedSpot[] = [];
  for (const s of out) {
    if (kept.some((k) => Math.hypot(k.x - s.x, k.y - s.y) < (k.rPx + s.rPx) * 0.9)) continue;
    kept.push(s);
  }
  // DUST DOESN'T SWARM: finds packed tightly together are a shimmering
  // surface (the owner's lake pushed ~30 sparkle blobs from one patch of
  // water — and their sheer count then made the crowd rule below execute the
  // real smudge). Drop any find with more than 3 neighbours nearby. This
  // runs on the RAW merged set — pruning by any other test first thins a
  // swarm below the neighbour bound and lets its survivors through.
  const clusterR = W * 0.05;
  kept = kept.filter((s) => kept.filter((k) => k !== s && Math.hypot(k.x - s.x, k.y - s.y) < clusterR).length <= 3);
  // The uniform-area rule, applied at FULL RESOLUTION to every find from
  // every level (downsampling averages thin branches into invisibility, so
  // the coarse passes seeded on a bramble junction the eye reads instantly).
  // The statistic is BUSY-PIXEL DENSITY: a pixel is busy when its high-pass
  // deviation clears a noise-scaled bar (the frame's own calm-sky grain sets
  // the bar — a dark RAW's sky is far noisier than a teaching JPEG's); a
  // region is uniform when almost none of its pixels are busy. Density
  // COUNTS sparse structure that averages hide: two 2px twigs barely move a
  // 67px window's mean deviation (measured 0.013 — "uniform") yet every twig
  // pixel is an outlier the density sees. A soft dust smudge's shallow
  // gradient never clears a noise bar, so it stays invisible to its own test.
  {
    // Small window on purpose: the ring below must clear the find itself by
    // winR + rPx, and a wide window pushed that ring out of narrow sky bands
    // (recall died on a thin strip of sky over forest — twice, at two window
    // sizes). A twig crossing an 11px window still lights ~18% of it — far
    // over the 3% calm bound; sky noise stays well under 1%.
    const winR = 5;
    const density = boxBlur(busy1, W, H, winR);
    const calm = (x: number, y: number) =>
      density[Math.min(H - 1, Math.max(0, Math.round(y))) * W + Math.min(W - 1, Math.max(0, Math.round(x)))] < 0.03;
    kept = kept.filter((s) => {
      // Ring-only, and far enough out that the density window can't see the
      // find itself — a sharp mote's own pixels are legitimately busy (they
      // ARE the defect) and a closer test made every planted mote fail its
      // own calmness. A twig fragment still fails: the twig CONTINUES into
      // the ring windows; dust just... stops.
      // 1.3× + margin: a sharp mote's busy EDGE annulus reaches past rPx,
      // and windows that graze it cost ~2.5% density — right at the bound
      // (the strongest planted mote kept losing itself by one ring point).
      const ringDist = s.rPx * 1.3 + winR + 4;
      let ok = 0;
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        if (calm(s.x + Math.cos(ang) * ringDist, s.y + Math.sin(ang) * ringDist)) ok++;
      }
      return ok >= 7;
    });
  }
  // A sensor carries a handful of motes; a CROWD of similar-strength "finds"
  // is the frame's own noise floor pretending to be dust (the magenta D5300
  // sky mottle produced 40 of them). When the scan comes back crowded, keep
  // only clear outliers standing well above that crowd.
  if (kept.length > 15) {
    const med = [...kept].sort((a, b) => a.strength - b.strength)[kept.length >> 1].strength;
    kept = kept.filter((k) => k.strength >= med * 1.8);
  }
  return kept.slice(0, maxSpots);
}

/** 2× box downsample (mean of each 2×2). */
function downsample2(src: Float32Array, W: number, H: number): [Float32Array, number, number] {
  const w = W >> 1, h = H >> 1;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * 2) * W + x * 2;
      out[y * w + x] = (src[i] + src[i + 1] + src[i + W] + src[i + W + 1]) * 0.25;
    }
  }
  return [out, w, h];
}

/** Map a pass's blob back to full-plane coordinates. */
function scaleSpot(k: number): (s: DetectedSpot) => DetectedSpot {
  return (s) => ({ x: s.x * k + (k - 1) / 2, y: s.y * k + (k - 1) / 2, rPx: s.rPx * k, strength: s.strength });
}

interface PassOpts {
  blurR: number;
  maxR: number;
  floor: number;
  /** 0 = fixed floor; otherwise floor rises to sigmaK × median |high-pass|. */
  sigmaK: number;
  darkOnly: boolean;
  minN: number;
  compact: number;
  /** Max blob eccentricity (major/minor axis ratio) — dust is round. */
  ecc: number;
  /** Blob peak must be ≥ snr × the ring's own roughness (its MAD). */
  snr: number;
  /** Max fraction of ring samples allowed to be busy (majority-calm rule). */
  busyFrac: number;
  /** Per-block busy density at this level; blocks ≥ 0.25 are walls the flood
   *  fill neither seeds in nor grows through. */
  growable?: Float32Array;
}

function detectPass(L: Float32Array, W: number, H: number, o: PassOpts): DetectedSpot[] {
  const { blurR, maxR, minN } = o;
  // Background estimate. The dark smudge passes use a BOTTOM-HAT (morphological
  // closing): it erases any dark blob smaller than its window from the
  // background — no matter how faint — yet FOLLOWS brightness boundaries. A
  // mean blur does neither: it tracks big smudges out of their own high-pass,
  // and near a bright treeline it painted a whole narrow sky band
  // over-threshold, one giant connected region that swallowed every smudge
  // seed (the third such boundary failure in tuning; the closing ends them).
  // The fine pass keeps the mean blur: its σ-scaled threshold is calibrated
  // to it, and sharp motes are far above any halo.
  const blur = o.darkOnly ? morphClose(L, W, H, maxR + 2) : boxBlur(boxBlur(L, W, H, blurR), W, H, blurR);
  const hp = new Float32Array(W * H);
  for (let i = 0; i < L.length; i++) hp[i] = (L[i] - blur[i]) / (blur[i] + 4);
  let thresh = o.floor;
  if (o.sigmaK > 0) {
    const sampleAbs: number[] = [];
    for (let i = 0; i < hp.length; i += 97) sampleAbs.push(Math.abs(hp[i]));
    sampleAbs.sort((a, b) => a - b);
    thresh = Math.max(o.sigmaK * (sampleAbs[sampleAbs.length >> 1] || 1e-4), o.floor);
  }
  // Ring test, applied to a finished blob: a DENSE ring of RAW luma just
  // outside it. Returns the ring's roughness (MAD of relative deviations) for
  // the SNR test, or null when the ring is too busy/clipped to be dust.
  const ringStats = (cx: number, cy: number, rBlob: number): number | null => {
    const ringR = rBlob * 2 + 3;
    const steps = Math.max(20, Math.round(Math.PI * ringR)); // ~2px spacing
    const vals: number[] = [];
    for (let a = 0; a < steps; a++) {
      const x = Math.round(cx + ringR * Math.cos((a / steps) * Math.PI * 2));
      const y = Math.round(cy + ringR * Math.sin((a / steps) * Math.PI * 2));
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      vals.push(L[y * W + x]);
    }
    if (vals.length < steps * 0.7) return null; // too clipped to judge
    const sorted = [...vals].sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    const devs = vals.map((v) => Math.abs(v - med) / (med + 4));
    const mad = [...devs].sort((a, b) => a - b)[devs.length >> 1];
    // Majority-calm: dust floats in a quiet surround. The busy bound is
    // ABSOLUTE on purpose — scaling it with the ring's own roughness lets a
    // busy surround excuse itself (measured on the owner's NEF: forest holes
    // ring 81-92% busy at 3.5%, the real smudge 0%; an adaptive bound passed
    // the forest). A fraction, not "every": a big smudge may legitimately
    // clip the odd ripple or branch.
    const busyBound = 0.035;
    let busy = 0;
    for (const d of devs) if (d > busyBound) busy++;
    if (busy > devs.length * o.busyFrac) return null;
    return mad;
  };
  // Flood-fill connected over-threshold pixels into blobs (4-connected),
  // accumulating second moments for the roundness test.
  const seen = new Uint8Array(W * H);
  const out: DetectedSpot[] = [];
  const stack: number[] = [];
  const blobPx: number[] = [];
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const i = y * W + x;
      if (seen[i] || Math.abs(hp[i]) < thresh) continue;
      if (o.growable && o.growable[i] >= 0.25) continue;
      const sign = Math.sign(hp[i]);
      let n = 0, peak = 0;
      stack.length = 0;
      blobPx.length = 0;
      stack.push(i);
      seen[i] = 1;
      while (stack.length) {
        const j = stack.pop()!;
        const jx = j % W;
        n++;
        blobPx.push(j);
        const a = Math.abs(hp[j]);
        if (a > peak) peak = a;
        if (n > maxR * maxR * 10) break; // runaway region — cap the walk
        for (const k of [j - 1, j + 1, j - W, j + W]) {
          const kx = k % W;
          if (k < 0 || k >= hp.length || seen[k] || Math.abs(kx - jx) > 1) continue;
          if (Math.abs(hp[k]) >= thresh * 0.55 && Math.sign(hp[k]) === sign && (!o.growable || o.growable[k] < 0.25)) {
            seen[k] = 1;
            stack.push(k);
          }
        }
      }
      // Measure size/shape from the HALF-PEAK CORE, not the grown skirt: the
      // wide smudge blur leaves a sprawling faint skirt above the growth
      // bound, and skirt-measured blobs blew past the size cap (and the
      // runaway cap) while their actual cores fit the level comfortably.
      const coreBar = Math.max(thresh * 0.55, peak * 0.45);
      let nC = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
      let minX = x, maxX = x, minY = y, maxY = y;
      for (const j of blobPx) {
        if (Math.abs(hp[j]) < coreBar) continue;
        const jx = j % W, jy = (j / W) | 0;
        nC++;
        sx += jx; sy += jy;
        sxx += jx * jx; syy += jy * jy; sxy += jx * jy;
        if (jx < minX) minX = jx; if (jx > maxX) maxX = jx;
        if (jy < minY) minY = jy; if (jy > maxY) maxY = jy;
      }
      const n2 = nC;
      const w = maxX - minX + 1, h = maxY - minY + 1;
      const rBlob = Math.max(w, h) / 2;
      // Keep: dust-sized, roughly compact — and DARK, unless hot-pixel tiny:
      // sensor dust shadows the sensor, while the small BRIGHT things in a
      // sky are cloud wisps (real content — the teaching cloudscapes were
      // full of them, field-found 2026-07-14).
      if (n2 < minN || rBlob > maxR || n2 < rBlob * rBlob * o.compact) continue;
      if (sign > 0 && (o.darkOnly || rBlob > 2.5)) continue;
      // ROUND: eigen-ratio of the blob's covariance. Twig fragments and bark
      // striations are lines (high ratio) even when their surround is calm.
      const mx = sx / n2, my = sy / n2;
      const cxx = sxx / n2 - mx * mx + 0.25, cyy = syy / n2 - my * my + 0.25, cxy = sxy / n2 - mx * my;
      const tr = cxx + cyy, det = cxx * cyy - cxy * cxy;
      const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
      const lMaj = tr / 2 + disc, lMin = Math.max(tr / 2 - disc, 1e-3);
      if (Math.sqrt(lMaj / lMin) > o.ecc) continue;
      const mad = ringStats(mx, my, rBlob);
      if (mad === null) continue;
      // LOCAL SNR: the blob must tower over its surround's own roughness —
      // texture specks sit barely above theirs (bark/water field-found on the
      // owner's NEF); a faint smudge over quiet sky clears easily.
      if (peak < Math.max(o.snr * mad, o.floor)) continue;
      out.push({ x: mx, y: my, rPx: Math.max(2, rBlob * 1.7), strength: peak / o.floor });
    }
  }
  return out;
}

/** Separable sliding-window extremum (monotonic deque), window 2r+1. */
function slideExtremum(src: Float32Array, W: number, H: number, r: number, mx: boolean): Float32Array {
  const out = new Float32Array(W * H);
  const tmp = new Float32Array(W * H);
  const idx = new Int32Array(Math.max(W, H));
  const better = mx ? (a: number, b: number) => a >= b : (a: number, b: number) => a <= b;
  // Horizontal.
  for (let y = 0; y < H; y++) {
    const row = y * W;
    let head = 0, tail = 0;
    for (let x = 0; x < W + r; x++) {
      if (x < W) {
        const v = src[row + x];
        while (tail > head && better(v, src[row + idx[tail - 1]])) tail--;
        idx[tail++] = x;
      }
      const o = x - r;
      if (o >= 0) {
        while (idx[head] < o - r) head++;
        tmp[row + o] = src[row + idx[head]];
      }
    }
  }
  // Vertical.
  for (let x = 0; x < W; x++) {
    let head = 0, tail = 0;
    for (let y = 0; y < H + r; y++) {
      if (y < H) {
        const v = tmp[y * W + x];
        while (tail > head && better(v, tmp[idx[tail - 1] * W + x])) tail--;
        idx[tail++] = y;
      }
      const o = y - r;
      if (o >= 0) {
        while (idx[head] < o - r) head++;
        out[o * W + x] = tmp[idx[head] * W + x];
      }
    }
  }
  return out;
}

/** Morphological closing (dilate, then erode) with a square window. */
function morphClose(src: Float32Array, W: number, H: number, r: number): Float32Array {
  return slideExtremum(slideExtremum(src, W, H, r, true), W, H, r, false);
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
