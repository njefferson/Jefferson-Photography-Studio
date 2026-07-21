// Classical sky detection (mask type 4). NO machine learning — the whole
// heuristic is per-image DSP that runs once in JS and bakes its result into a
// bitmap, which the pipeline then samples through the existing brush-mask path
// (see gl.ts / pipeline.ts). Connectivity — "the sky touches the top edge",
// flood-fill down to the horizon, re-adding sky seen through branches — cannot
// be expressed as a per-pixel weight function, so it happens HERE, not in the
// shader. The shader stays untouched; GPU==CPU parity is automatic because both
// sides read the same baked bitmap.
//
// What actually separates sky from ground on IR frames (measured on the bundled
// canopy / lodge / hillside examples, 2026-07-06):
//   - Brightness is NOT a usable prior. In linear IR the sunlit FOLIAGE is the
//     brightest thing; lodge's sky is the DARKEST region in the frame. So the
//     old "sky is bright" assumption is dropped entirely.
//   - Smoothness IS the strong signal: sky gradient magnitude ~0.004–0.03 vs
//     0.1–0.4 for foliage. Seeds are the smooth pixels along the display-top.
//   - Colour coherence: whatever the sky's colour, it is one tight cluster. The
//     model is LEARNED from the seeds (robust median + MAD), never assumed, so
//     it works whether the sky is bright-cyan, dark-olive or near-black.
//
// Everything works in the IMAGE-oriented grid (so the output bitmap samples
// directly in image-uv like a brush mask); only the choice of which edge is
// "up" depends on the display rotation.

import { chromaVec, type BrushMask } from "./pipeline";

const REC = [0.2126, 0.7152, 0.0722];

export interface SkyResult {
  mask: BrushMask;
  /** false when too little smooth sky touches the top edge — the caller keeps
   *  the label honest ("no clear sky found") and the mask stays inert. */
  found: boolean;
  /** fraction of the frame selected (0..1), for the status line. */
  coverage: number;
}

/**
 * Build a sky-weight bitmap for one image.
 * @param sample  linear camera-native RGB at full-res image pixel (x,y).
 * @param srcW,srcH  full image dimensions.
 * @param rotate  display rotation in 90° CW steps (0..3) — picks the top edge.
 * @param cam  camera-native -> linear sRGB 3x3 row-major (or null for already-
 *             profiled sources; then the raw channels are used directly).
 * @param wb  gray-world white-balance gains (auto, NOT the user's live WB — the
 *            mask must not drift as the photo is graded).
 * @param maxEdge  working/output resolution cap (share BRUSH_MAX_EDGE so the
 *            bitmap packs with brush masks, which must all be one size).
 * @param reach  growth aggressiveness (1 = calibrated default).
 * @param feather  0..1 soft-edge width (blurs the final bitmap).
 */
export function buildSkyMask(
  sample: (x: number, y: number) => [number, number, number],
  srcW: number,
  srcH: number,
  rotate: number,
  cam: number[] | null,
  wb: [number, number, number],
  maxEdge: number,
  reach: number,
  feather: number,
): SkyResult {
  const s = Math.min(1, maxEdge / Math.max(srcW, srcH));
  const W = Math.max(1, Math.round(srcW * s));
  const H = Math.max(1, Math.round(srcH * s));
  const N = W * H;

  // --- sample into the image-oriented grid, WB + camera-matrix into display-
  // linear RGB, with a light box average to suppress demosaic grain (so the
  // gradient map measures structure, not noise) ---
  const L = new Float32Array(N);
  const CX = new Float32Array(N);
  const CY = new Float32Array(N);
  const box = Math.max(1, Math.round(srcW / W / 2));
  for (let y = 0; y < H; y++) {
    const iy = Math.min(srcH - 1, Math.floor(((y + 0.5) * srcH) / H));
    for (let x = 0; x < W; x++) {
      const ix = Math.min(srcW - 1, Math.floor(((x + 0.5) * srcW) / W));
      let ar = 0, ag = 0, ab = 0, c = 0;
      for (let oy = -box; oy <= box; oy += box) {
        for (let ox = -box; ox <= box; ox += box) {
          const sx = Math.max(0, Math.min(srcW - 1, ix + ox));
          const sy = Math.max(0, Math.min(srcH - 1, iy + oy));
          const [pr, pg, pb] = sample(sx, sy);
          ar += pr; ag += pg; ab += pb; c++;
        }
      }
      let r = (ar / c) * wb[0], g = (ag / c) * wb[1], b = (ab / c) * wb[2];
      if (cam) {
        const cr = cam[0] * r + cam[1] * g + cam[2] * b;
        const cg = cam[3] * r + cam[4] * g + cam[5] * b;
        const cb = cam[6] * r + cam[7] * g + cam[8] * b;
        r = Math.max(0, cr); g = Math.max(0, cg); b = Math.max(0, cb);
      }
      const p = y * W + x;
      L[p] = r * REC[0] + g * REC[1] + b * REC[2];
      const [vx, vy] = chromaVec(r, g, b);
      CX[p] = vx; CY[p] = vy;
    }
  }

  // luma normalised by its own bright end so thresholds are exposure-agnostic
  const sortedL = Float32Array.from(L).sort();
  const p95 = Math.max(1e-4, sortedL[Math.floor(N * 0.95)]);
  const Ln = new Float32Array(N);
  for (let p = 0; p < N; p++) Ln[p] = L[p] / p95;

  // gradient magnitude of normalised luma (central differences)
  const G = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      const gx = Ln[y * W + Math.min(W - 1, x + 1)] - Ln[y * W + Math.max(0, x - 1)];
      const gy = Ln[Math.min(H - 1, y + 1) * W + x] - Ln[Math.max(0, y - 1) * W + x];
      G[p] = Math.hypot(gx, gy);
    }
  }

  // "depth" = distance in texels from the display-top edge (the sky edge). Only
  // this depends on rotation; adjacency and gradient are orientation-free.
  const depthOf = (x: number, y: number): number => {
    switch (((rotate % 4) + 4) % 4) {
      case 1: return x;              // display-top ↔ image left
      case 2: return H - 1 - y;      // display-top ↔ image bottom
      case 3: return W - 1 - x;      // display-top ↔ image right
      default: return y;             // display-top ↔ image top
    }
  };
  const perp = rotate % 2 === 0 ? H : W; // dimension along depth
  const margin = 3;                       // skip the dark demosaic border
  const seedDepth = Math.max(3, Math.round(perp * 0.06));

  // --- seeds: smooth pixels in the top band ---
  let seeds: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x < margin || x >= W - margin || y < margin || y >= H - margin) continue;
      const d = depthOf(x, y);
      if (d >= margin && d < seedDepth && G[y * W + x] < 0.045) seeds.push(y * W + x);
    }
  }
  const seedBandArea = seedDepth * (rotate % 2 === 0 ? W : H);
  const empty = (): SkyResult => ({ mask: { w: W, h: H, data: new Uint8Array(N) }, found: false, coverage: 0 });
  if (seeds.length < seedBandArea * 0.12) return empty();

  // --- learn the sky model robustly: median + MAD, reject outliers, refit once
  // (hillside's top edge mixes sky with dark twigs; the dominant cluster wins) ---
  const median = (a: number[]) => { const t = [...a].sort((x, y) => x - y); return t[Math.floor(t.length / 2)]; };
  let mL = 0, mcx = 0, mcy = 0, sdL = 0, sdC = 0;
  for (let iter = 0; iter < 2; iter++) {
    mL = median(seeds.map((p) => Ln[p]));
    mcx = median(seeds.map((p) => CX[p]));
    mcy = median(seeds.map((p) => CY[p]));
    const dl = seeds.map((p) => Math.abs(Ln[p] - mL));
    const dc = seeds.map((p) => Math.hypot(CX[p] - mcx, CY[p] - mcy));
    sdL = 1.4826 * median(dl);
    sdC = 1.4826 * median(dc);
    const kept = seeds.filter((_, i) => dl[i] < Math.max(0.03, 3 * sdL) && dc[i] < Math.max(0.03, 3 * sdC));
    if (kept.length < seeds.length * 0.4) break; // cluster too weak — keep all
    seeds = kept;
  }

  // tolerances: proportional to the seed spread, floored AND capped, then scaled
  // by Reach so the user can loosen/tighten the grow.
  const tolC = Math.min(0.15, Math.max(0.06, 4 * sdC)) * reach;
  const tolL = Math.min(0.25, Math.max(0.08, 4 * sdL)) * reach;
  const tolEdge = 0.10 * reach;   // gradient a fill may cross
  const tolAdj = 0.06 * reach;    // adjacent-luma continuity (lets gradients pass)

  // --- flood fill from the seeds: stay near the model, follow slow gradients,
  // don't cross hard edges. 4-connectivity is orientation-free. ---
  const mask = new Float32Array(N); // 0..1
  const stack = [...seeds];
  for (const p of seeds) mask[p] = 1;
  while (stack.length) {
    const p = stack.pop()!;
    const y = (p / W) | 0, x = p - y * W;
    const Lp = Ln[p];
    for (let n = 0; n < 4; n++) {
      let q = -1;
      if (n === 0 && x > 0) q = p - 1;
      else if (n === 1 && x < W - 1) q = p + 1;
      else if (n === 2 && y > 0) q = p - W;
      else if (n === 3 && y < H - 1) q = p + W;
      if (q < 0 || mask[q]) continue;
      const cd = Math.hypot(CX[q] - mcx, CY[q] - mcy);
      const ldAdj = Math.abs(Ln[q] - Lp);       // continuity to THIS pixel (gradients pass)
      const ldMod = Math.abs(Ln[q] - mL);        // still within reach of the model
      if (G[q] < tolEdge && cd < tolC && ldAdj < tolAdj && ldMod < tolL * 2.5) {
        mask[q] = 1;
        stack.push(q);
      }
    }
  }

  // --- hole fill: enclosed pixels matching the model, no deeper than the sky
  // already reaches (sky glimpsed through branches / around a horizon object) ---
  let maxDepth = 0;
  for (let p = 0; p < N; p++) {
    if (mask[p]) {
      const y = (p / W) | 0, x = p - y * W;
      const d = depthOf(x, y);
      if (d > maxDepth) maxDepth = d;
    }
  }
  for (let p = 0; p < N; p++) {
    if (mask[p]) continue;
    const y = (p / W) | 0, x = p - y * W;
    if (depthOf(x, y) > maxDepth) continue;
    const cd = Math.hypot(CX[p] - mcx, CY[p] - mcy);
    const ld = Math.abs(Ln[p] - mL);
    if (cd < tolC * 0.8 && ld < tolL) mask[p] = 1;
  }

  // --- feather: soften the edge with a small separable gaussian ---
  const sigma = 1 + feather * 6;
  gaussianBlur(mask, W, H, sigma);

  const data = new Uint8Array(N);
  let selected = 0;
  for (let p = 0; p < N; p++) {
    const v = Math.round(Math.min(1, Math.max(0, mask[p])) * 255);
    data[p] = v;
    if (v > 127) selected++;
  }
  return { mask: { w: W, h: H, data }, found: true, coverage: selected / N };
}

/** In-place separable gaussian with edge clamping (same shape as glow/localmap). */
function gaussianBlur(buf: Float32Array, W: number, H: number, sigma: number) {
  if (sigma <= 0.01) return;
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel: number[] = [];
  let ksum = 0;
  for (let i = -radius; i <= radius; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(w);
    ksum += w;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= ksum;
  const tmp = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.max(0, Math.min(W - 1, x + k));
        acc += buf[y * W + xx] * kernel[k + radius];
      }
      tmp[y * W + x] = acc;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.max(0, Math.min(H - 1, y + k));
        acc += tmp[yy * W + x] * kernel[k + radius];
      }
      buf[y * W + x] = acc;
    }
  }
}
