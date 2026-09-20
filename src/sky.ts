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
//     0.1–0.4 for foliage.
//   - Colour coherence: whatever the sky's colour, it is one tight cluster. The
//     model is LEARNED, never assumed, so it works whether the sky is
//     bright-cyan, dark-olive or near-black.
//
// TWO STAGES, and the order is the whole design (2026-09-20).
//   1. WHERE THE SKY ENDS — `skyhorizon.ts`, the published border-position
//      method (Shen and Wang 2013; IR-SCIENCE.md §9o). One border depth per
//      display column, chosen by an energy function that rewards a homogeneous
//      sky against a varied ground, plus that paper's two post-processing
//      tests: this photograph has no sky at all, and these columns hold no sky.
//      It never asks what colour a sky is, which is why it can answer both.
//   2. WHICH PIXELS ARE IT — this file. The region above the border is the
//      seed; the robust colour model is fitted to it and the edge-aware fill
//      carries the selection down to the treeline and in through the branches,
//      which a per-column border cannot do because it stops at the first twig.
//
// The stages were the other way round until 2026-09-20 and stage 1 did not
// exist: a strip 6% deep at the top of the frame was the seed. Three measured
// defects came out of that one choice, and each is a thing a colour model is
// structurally unable to do rather than a constant tuned wrong — a macro of a
// flower spike with no sky in it took 76.4% of the frame, a frame whose top
// strip is cloud deck learned cloud and refused a band of clear sky lower in
// the same picture, and a playhouse wall that matched the model was taken
// because nothing in a colour test knows where the ground is.
//
// Everything works in the IMAGE-oriented grid (so the output bitmap samples
// directly in image-uv like a brush mask); only the choice of which edge is
// "up" depends on the display rotation.

import { chromaVec, type BrushMask } from "./pipeline";
import { skyAxes, skyHorizon, type SkyHorizon } from "./skyhorizon";

const REC = [0.2126, 0.7152, 0.0722];

/** Below this share of the frame there is no usable sky — the same bar the
 *  editor's status line applies when it decides whether to say "No clear sky
 *  found", kept here so the flag and the words agree. */
export const SKY_MIN_COVERAGE = 0.005;

/** How much further the fill may drift from the seed luminance when the pixel's
 *  colour still sits dead on the learned cluster. Squared falloff, so it is the
 *  centre of the cluster that earns the extra room and the edge earns none.
 *  Calibrated over the 44 practice frames — see NOTES. */
const SKY_LUMA_STRETCH = 6;

/** Most pixels the robust model fit sorts. The seed set is now the whole region
 *  above the horizon rather than a strip at the top of the frame, so it can be
 *  a third of the picture; a median of a third of the picture, three channels,
 *  twice over, is a sort nobody needs. A sky's median and MAD are stable long
 *  before this many samples. */
const SKY_FIT_SAMPLE = 20000;

/** The fallback seed band, as a fraction of the frame's depth, and the
 *  gradient a pixel in it must stay under to be a seed, and the share of the
 *  band that must qualify before the frame is taken to have a sky at all.
 *  These three were this file's ONLY seeding until 2026-09-20 and are now what
 *  it falls back to when the energy function never turns over — unchanged, so
 *  a frame that lands on this path gets exactly the selection it always got. */
/** Border texels skipped before the first edge is looked for, so a dark
 *  demosaic rim cannot put the horizon at depth zero. */
const SKY_MARGIN = 3;
const SKY_TOP_BAND = 0.06;
const SKY_TOP_BAND_SMOOTH = 0.045;
const SKY_TOP_BAND_SHARE = 0.12;


/** The two stages of the selection that depend on the PHOTOGRAPH ALONE — the
 *  small grid and the horizon drawn on it. Neither reads Reach or Feather, so a
 *  caller holding one of these can redraw the mask at a new Reach without
 *  paying for the border search again. */
export interface SkyPrep {
  fields: SkyFields;
  horizon: SkyHorizon;
}

/**
 * Do the photograph-only half of the selection once.
 * @param sample  linear camera-native RGB at full-res image pixel (x, y).
 * @param srcW,srcH  full image dimensions.
 * @param rotate  display rotation in 90° CW steps — which edge the sky is at.
 * @param cam  camera-native -> linear sRGB 3x3 row-major, or null.
 * @param wb  gray-world gains — AUTO, never the live edit.
 * @param maxEdge  working resolution cap on the longer edge.
 * @returns the grid and the horizon, for `buildSkyMask`'s last argument.
 * What the result must satisfy: it is a function of the photograph, the
 * rotation and `maxEdge` and of NOTHING ELSE — a caller caching one against an
 * image must invalidate it when the rotation changes, because the border is
 * measured down from the display's top edge.
 */
export function skyPrepare(
  sample: (x: number, y: number) => [number, number, number],
  srcW: number,
  srcH: number,
  rotate: number,
  cam: number[] | null,
  wb: [number, number, number],
  maxEdge: number,
): SkyPrep {
  const fields = skyFields(sample, srcW, srcH, cam, wb, maxEdge);
  const N = fields.w * fields.h;
  // The channels are scaled to 0..255 and the luminance is GAMMA-ENCODED AND
  // CLAMPED first. Both halves are load-bearing. Jn mixes a covariance
  // DETERMINANT (units of value³) with an EIGENVALUE (units of value¹), so it
  // is not scale-free and its γ was chosen on 8-bit data; and the 8-bit data it
  // was chosen on is BOUNDED, where `ln` is scene-linear normalised to the
  // frame's own 95th percentile and runs freely past 1 on anything specular.
  // Gamma is also what `buildSkyGuide` encodes its own luma with one module
  // over, so the two instruments mean the same thing by the word.
  const S0 = new Float32Array(N), S1 = new Float32Array(N), S2 = new Float32Array(N);
  for (let p = 0; p < N; p++) {
    S0[p] = Math.pow(Math.min(1, Math.max(0, fields.ln[p])), 1 / 2.2) * 255;
    S1[p] = fields.cx[p] * 255;
    S2[p] = fields.cy[p] * 255;
  }
  const horizon = skyHorizon(S0, S1, S2, fields.g, fields.w, fields.h, rotate, SKY_MARGIN);
  return { fields, horizon };
}

export interface SkyResult {
  mask: BrushMask;
  /** false when too little smooth sky touches the top edge — the caller keeps
   *  the label honest ("no clear sky found") and the mask stays inert. */
  found: boolean;
  /** fraction of the frame selected (0..1), for the status line. */
  coverage: number;
  /** the border the selection was seeded from, for the walks and the probe —
   *  null when the photograph was refused before one was measured. */
  horizon: SkyHorizon | null;
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
 * @param prep  the photograph-only half from `skyPrepare`, when the caller is
 *   holding one; omitted, it is built here.
 * @returns the bitmap, whether a sky was found, its coverage, and the horizon
 *   the selection was seeded from.
 * What the result must satisfy — and it is a REAL hazard rather than a
 * formality: a `prep` passed in must have been built with the SAME `rotate`,
 * `cam`, `wb` and `maxEdge` as this call. The border it carries is measured
 * down from the display's top edge, and `depthOf` below measures depth from
 * that same edge using the `rotate` argument; hand it a prep from a quarter
 * turn ago and the two disagree about which edge is up, silently, with a
 * plausible-looking mask as the result.
 */
/** The photograph as the sky stages read it: one small grid, three channels
 *  and their gradient, built once and shared by the border search and the
 *  colour fill so the two cannot disagree about what the picture is. */
export interface SkyFields {
  w: number;
  h: number;
  /** Luma normalised to the frame's own 95th percentile — unbounded above. */
  ln: Float32Array;
  /** Chroma, `chromaVec`: cx is red against the mean of green and blue. */
  cx: Float32Array;
  cy: Float32Array;
  /** Gradient magnitude of `ln`, central differences. */
  g: Float32Array;
}

/**
 * Reduce a photograph to the small grid every sky stage works in.
 * @param sample  linear camera-native RGB at full-res image pixel (x, y).
 * @param srcW,srcH  full image dimensions.
 * @param cam  camera-native -> linear sRGB 3x3 row-major, or null.
 * @param wb  gray-world gains — AUTO, never the live edit.
 * @param maxEdge  working resolution cap on the longer edge.
 * @returns the grid and its four channels (see `SkyFields`).
 * What the result must satisfy: it depends on the photograph and on nothing
 * the reader has done to it. Every sky stage downstream inherits that, which
 * is the property the whole selection rests on — a mask that moved as the
 * photograph was graded would change what a look is looking at while the look
 * ran.
 */
export function skyFields(
  sample: (x: number, y: number) => [number, number, number],
  srcW: number,
  srcH: number,
  cam: number[] | null,
  wb: [number, number, number],
  maxEdge: number,
): SkyFields {
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
  return { w: W, h: H, ln: Ln, cx: CX, cy: CY, g: G };
}

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
  prep?: SkyPrep,
): SkyResult {
  const { fields, horizon } = prep ?? skyPrepare(sample, srcW, srcH, rotate, cam, wb, maxEdge);
  const { w: W, h: H, ln: Ln, cx: CX, cy: CY, g: G } = fields;
  const N = W * H;

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
  const margin = SKY_MARGIN;
  const median = (a: number[]) => { const t = [...a].sort((x, y) => x - y); return t[Math.floor(t.length / 2)]; };
  const empty = (hz: SkyHorizon | null = null): SkyResult =>
    ({ mask: { w: W, h: H, data: new Uint8Array(N) }, found: false, coverage: 0, horizon: hz });

  // --- where the sky ENDS: the published border-position method (skyhorizon.ts;
  // Shen and Wang 2013; IR-SCIENCE.md §9o). It replaced the top-band seeding
  // this file used to do, and it is the whole of the fix for three measured
  // defects: a frame with no sky could not say so, a frame whose top band is
  // cloud learned cloud and refused clear sky lower down, and a building that
  // matched the learned colour was taken because a colour test cannot know
  // where the ground is. Computed by `skyPrepare`, which the caller may cache
  // per photograph — the border does not read Reach or Feather. ---
  if (horizon.noSky) return empty(horizon);

  // --- seeds: everything above the horizon. The model is therefore fitted to
  // the WHOLE sky rather than to a strip 6% deep at the top of it, which is the
  // other half of the cloud-deck failure: a seed drawn only from the top of
  // NIR_1651 is 100% cloud, so the band of clear sky below the cloud edge in
  // the same photograph never matched it.
  //
  // UNLESS THE ENERGY FUNCTION NEVER TURNED OVER, in which case the border is
  // the sweep running out rather than a horizon (`horizon.boundary`) and the
  // seed comes from the top band instead — which is what this file did before
  // the horizon existed, and it is the RIGHT instrument on exactly this frame
  // because it asks a different question: not "where does the picture stop
  // being smooth" but "is the strip along the display's top edge smooth".
  // hillside is the case, and it is one frame in the 44. It is a hillside of
  // conifers with a sliver of sky along the top: 90% of the picture is one
  // texture, so the separation the energy function is built to find is not
  // there to find, its argmax sits at the last sample of the sweep, and
  // "everything is sky" is what that argmax means. The top-band seed selects
  // the sliver correctly and always did (10.0% of the frame, measured before
  // and after).
  // This is a FALLBACK and not a refusal on purpose. The ranking stated
  // 2026-09-20 is that a photograph with sky in it must have all of it
  // selected; refusing hillside for the honest reason that the published
  // method does not apply to it would have cost a selection the app was
  // already making correctly. ---
  const seeds: number[] = [];
  if (horizon.boundary) {
    const perp = rotate % 2 === 0 ? H : W;
    const seedDepth = Math.max(3, Math.round(perp * SKY_TOP_BAND));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (x < margin || x >= W - margin || y < margin || y >= H - margin) continue;
        const d = depthOf(x, y);
        if (d >= margin && d < seedDepth && G[y * W + x] < SKY_TOP_BAND_SMOOTH) seeds.push(y * W + x);
      }
    }
    const seedBandArea = seedDepth * (rotate % 2 === 0 ? W : H);
    if (seeds.length < seedBandArea * SKY_TOP_BAND_SHARE) return empty(horizon);
  } else {
    const { cols, rows, at } = skyAxes(W, H, rotate);
    for (let a = 0; a < cols; a++) {
      const top = Math.min(rows, horizon.b[a]);
      for (let d = margin; d < top; d++) {
        const p = at(a, d);
        const y = (p / W) | 0, x = p - y * W;
        if (x < margin || x >= W - margin || y < margin || y >= H - margin) continue;
        seeds.push(p);
      }
    }
  }
  if (seeds.length < N * SKY_MIN_COVERAGE) return empty(horizon);

  // --- learn the sky model robustly: median + MAD, reject outliers, refit once
  // (a treeline's own edge mixes sky with dark twigs; the dominant cluster
  // wins). The rejection shapes the MODEL only — every pixel above the horizon
  // is selected regardless, because the horizon is what decided it is sky and a
  // colour fitted to it has no standing to overrule it. The model's job starts
  // BELOW the horizon: it is what carries the selection down to the treeline
  // and in through the branches. Fitted on a subsample, since the seed set is
  // now a whole sky rather than a strip and each median sorts a copy. ---
  //
  // AND IT IS FITTED TO THE LARGEST CONNECTED PIECE of the seed, not to all of
  // it. The region above the border is not always one thing: on a frame whose
  // top corners are dark branches, each corner is its own island above its own
  // shallow border, and a median-and-MAD taken over the union describes
  // neither the sky nor the branches. Measured on NIR_1638, a river between
  // pale conifers with a strip of sky at the top: the union's chroma MAD came
  // out at 0.470, which pins the fill's tolerance at its own 0.15 ceiling —
  // while the distance from that frame's sky to its ground is 0.106. A
  // tolerance wider than the distance to the thing it is meant to exclude is
  // not a tolerance, and the fill took the forest (7.8% of the frame selected
  // before this work, 37.1% after the wider seed, 2026-09-20).
  // Every seed pixel is still SELECTED. Only the model is fitted to one piece.
  const fitSample = (a: number[]) =>
    a.length > SKY_FIT_SAMPLE ? a.filter((_, i) => i % Math.ceil(a.length / SKY_FIT_SAMPLE) === 0) : a;
  // ...and only on the horizon path. The fallback's seed is a strip along one
  // edge, which this file has always fitted whole, and the promise made at the
  // fallback is that a frame landing there gets exactly the selection it always
  // got. Fitting hillside's strip to its largest piece alone took it from 10.0%
  // of the frame to 6.3% (2026-09-20).
  let fit = fitSample(horizon.boundary ? seeds : largestPiece(seeds, W, H));
  let mL = 0, mcx = 0, mcy = 0, sdL = 0, sdC = 0;
  for (let iter = 0; iter < 2; iter++) {
    mL = median(fit.map((p) => Ln[p]));
    mcx = median(fit.map((p) => CX[p]));
    mcy = median(fit.map((p) => CY[p]));
    const dl = fit.map((p) => Math.abs(Ln[p] - mL));
    const dc = fit.map((p) => Math.hypot(CX[p] - mcx, CY[p] - mcy));
    sdL = 1.4826 * median(dl);
    sdC = 1.4826 * median(dc);
    const kept = fit.filter((_, i) => dl[i] < Math.max(0.03, 3 * sdL) && dc[i] < Math.max(0.03, 3 * sdC));
    if (kept.length < fit.length * 0.4) break; // cluster too weak — keep all
    fit = kept;
  }

  // tolerances: proportional to the seed spread, floored AND capped, then scaled
  // by Reach so the user can loosen/tighten the grow.
  let tolC = Math.min(0.15, Math.max(0.06, 4 * sdC)) * reach;
  let tolL = Math.min(0.25, Math.max(0.08, 4 * sdL)) * reach;
  const tolEdge = 0.10 * reach;   // gradient a fill may cross
  const tolAdj = 0.06 * reach;    // adjacent-luma continuity (lets gradients pass)

  // --- flood fill from the seeds: stay near the model, follow slow gradients,
  // don't cross hard edges. 4-connectivity is orientation-free.
  //
  // It runs TWICE. The model is learned from a strip 6% deep at the top of the
  // frame, and a big sky is not that strip: by the horizon it is brighter,
  // hazier and less saturated, so the fill would reach a boundary that is not
  // an edge in the picture — just the far end of what a thin strip could
  // describe. Measured on the largest sky in the practice set, the frontier's
  // rejections split model 38% / edge 33% / chroma 29%, with nothing dominant:
  // the sky had genuinely left the seed cluster on both axes at once. So after
  // the first pass the model is re-fitted to the sky ACTUALLY FOUND and the
  // fill continues from there. Two passes, not a loop — one re-fit lets a
  // gradient be described, while an unbounded chain of them would let the
  // cluster walk off into the foliage one small step at a time. ---
  const mask = new Float32Array(N); // 0..1
  const fillFrom = (start: number[]) => {
  const stack = [...start];
  for (const p of start) mask[p] = 1;
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
      // The model's LUMINANCE bound is what stops a deep sky being followed all
      // the way down: a sky darkens from horizon to zenith by far more than a
      // band learned from a thin strip at the top allows, so the fill walked a
      // gradient it was built to walk and then ran into a flat cap (measured:
      // the largest sky in the practice set caught to about half its depth).
      // Its COLOUR barely moves over the same span — that is the whole premise
      // of the model, stated at the top of this file: whatever the sky's
      // colour, it is one tight cluster. So the luminance bound opens up in
      // proportion to how well the colour still matches, and stays where it was
      // for anything whose colour has drifted. Foliage and ground do not sneak
      // in on this: they fail `cd` long before they reach the wider bound.
      const chromaFit = 1 - Math.min(1, cd / Math.max(1e-6, tolC)); // 1 = dead on the cluster
      const modelBound = tolL * (2.5 + SKY_LUMA_STRETCH * chromaFit * chromaFit);
      if (G[q] < tolEdge && cd < tolC && ldAdj < tolAdj && ldMod < modelBound) {
        mask[q] = 1;
        stack.push(q);
      }
    }
  }
  };
  fillFrom(seeds);

  // Re-fit to what was found, then carry on from its whole frontier. The refit
  // uses the same robust median + MAD as the seed fit, so a few stray pixels
  // cannot drag the cluster.
  {
    const found: number[] = [];
    for (let p = 0; p < N; p++) if (mask[p]) found.push(p);
    if (found.length > seeds.length) {
      const sample = found.length > 20000
        ? found.filter((_, i) => i % Math.ceil(found.length / 20000) === 0)
        : found;
      mL = median(sample.map((p) => Ln[p]));
      mcx = median(sample.map((p) => CX[p]));
      mcy = median(sample.map((p) => CY[p]));
      const dl = sample.map((p) => Math.abs(Ln[p] - mL));
      const dc = sample.map((p) => Math.hypot(CX[p] - mcx, CY[p] - mcy));
      sdL = 1.4826 * median(dl);
      sdC = 1.4826 * median(dc);
      tolC = Math.min(0.15, Math.max(0.06, 4 * sdC)) * reach;
      tolL = Math.min(0.25, Math.max(0.08, 4 * sdL)) * reach;
      fillFrom(found);
    }
  }

  // --- hole fill: ENCLOSED pixels matching the model — sky glimpsed through
  // branches, sky around a horizon object.
  //
  // "Enclosed" is now tested rather than assumed, and that is the whole of the
  // fix for the worst over-selection in the set. This stage used to apply its
  // colour and luma test to EVERY unselected pixel above the deepest one the
  // fill reached, with no connectivity of any kind — so one column of sky
  // running a third of the way down the frame licensed every pixel in every
  // other column above that depth whose colour was near enough. On IR-bright
  // conifers, whose colour is near enough, that is the forest: NIR_1827 came
  // out at 79.5% of the frame and NIR_1638's river valley at 51%, both with
  // the trees and the banks in the selection (measured 2026-09-20).
  // A hole is a component of the UNSELECTED region that does not touch the
  // frame's edge. A cloud deck surrounded by sky is one, and it is the case
  // this stage has to keep working for: a cloud's own boundary is a gradient,
  // so the fill cannot cross into it, and the selection would otherwise stop
  // at the cloud and leave a hole in the middle of the sky (NIR_1701,
  // NIR_1703). A forest running to the bottom of the frame is not a hole and
  // never was. ---
  const outside = new Uint8Array(N);
  {
    const stack: number[] = [];
    const push = (p: number) => { if (!mask[p] && !outside[p]) { outside[p] = 1; stack.push(p); } };
    for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
    while (stack.length) {
      const p = stack.pop()!;
      const y = (p / W) | 0, x = p - y * W;
      if (x > 0) push(p - 1);
      if (x < W - 1) push(p + 1);
      if (y > 0) push(p - W);
      if (y < H - 1) push(p + W);
    }
  }
  let maxDepth = 0;
  for (let p = 0; p < N; p++) {
    if (mask[p]) {
      const y = (p / W) | 0, x = p - y * W;
      const d = depthOf(x, y);
      if (d > maxDepth) maxDepth = d;
    }
  }
  for (let p = 0; p < N; p++) {
    if (mask[p] || outside[p]) continue;
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
  const coverage = selected / N;
  // `found` is about the RESULT, not about how the search started. It used to
  // be a literal `true` here, decided a hundred lines earlier by the seed test
  // alone — "at least a tenth of the top band is smooth" — so a frame whose top
  // edge happened to hold a smooth patch reported a sky found however little
  // the fill went on to select, up to and including nothing at all. Nothing in
  // the app read it (the status line recomputes coverage off the bitmap, which
  // is why no reader was ever misled), but a documented flag that cannot say
  // "no" is a trap for whatever reads it next. Same threshold the status line
  // uses, so the two cannot disagree.
  return { mask: { w: W, h: H, data }, found: coverage >= SKY_MIN_COVERAGE, coverage, horizon };
}

/**
 * Keep only the largest 4-connected piece of a set of pixels.
 * @param px  pixel indices into a W*H grid; not modified.
 * @param W,H  grid dimensions.
 * @returns the indices of the biggest connected component, or `px` unchanged
 *   when it holds fewer than two pixels.
 * What the result must satisfy: it is a SUBSET of the input and it is
 * connected. `buildSkyMask` fits the sky's colour model to it, so a caller
 * that passed a set with two equal halves would get one of them — which is the
 * point: a median over two populations describes neither.
 */
function largestPiece(px: number[], W: number, H: number): number[] {
  if (px.length < 2) return px;
  const inSet = new Uint8Array(W * H);
  for (const p of px) inSet[p] = 1;
  const seen = new Uint8Array(W * H);
  let best: number[] = [];
  const stack: number[] = [];
  for (const start of px) {
    if (seen[start]) continue;
    const piece: number[] = [];
    seen[start] = 1;
    stack.length = 0;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      piece.push(p);
      const y = (p / W) | 0, x = p - y * W;
      const step = (q: number) => { if (inSet[q] && !seen[q]) { seen[q] = 1; stack.push(q); } };
      if (x > 0) step(p - 1);
      if (x < W - 1) step(p + 1);
      if (y > 0) step(p - W);
      if (y < H - 1) step(p + W);
    }
    if (piece.length > best.length) best = piece;
  }
  return best;
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
