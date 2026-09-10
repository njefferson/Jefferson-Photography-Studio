// Measuring an IR lens's hot-spot ON THE DEVICE, from flat frames, per channel.
//
// WHY THIS EXISTS. The profiles this app ships (src/hotspotProfiles.ts) were
// measured from 26 flat-field frames in 2026-07 and then COLLAPSED TO A SCALAR
// — one gain per radius bin, multiplied into R, G and B alike. An IR-converted
// lens does not only brighten the centre, it tints it, and a scalar can never
// move a colour. The per-channel information was measured and thrown away.
//
// It cannot simply be re-measured off-device: a flat is a 25 MB raw file and
// the frames live on the photographer's tablet. A profile is 240 numbers. So
// the rig runs HERE, on the decoded frame, and emits the numbers.
//
// WHAT IT COMPUTES, and why it is shaped this way.
//
// Every channel is first normalised by its OWN value in a reference ring well
// outside any plausible hot-spot (REF_LO..REF_HI). That one step makes every
// number below invariant to white balance and to exposure, which is what lets
// a raw frame (un-white-balanced sensor values, red-flooded) and a camera JPEG
// (already balanced and gamma-encoded) be measured by the same code and
// averaged together.
//
//   n_c[i] = f_c[i] / f_c[ref]                         per channel, = 1 at ref
//   L[i]   = mean(n_r, n_g, n_b)                       achromatic falloff
//   kr[i]  = n_r[i] / n_g[i]   kb[i] = n_b[i] / n_g[i] colour, = 1 at ref
//
// L still carries BOTH the central hot-spot and the lens's own vignette, and
// SEPARATING THEM FROM ONE FLAT FRAME IS NOT POSSIBLE. That is measured, not
// assumed. A baseline has to be fitted to the outer radii and extrapolated
// inward, and the answer is set by the functional form assumed for the
// falloff. Against frames carrying a KNOWN 12% hot-spot:
//
//   baseline model        quadratic vignette    cos^4 vignette
//   1 + a·r² + b·r⁴       0.130 (+0.010)        0.184 (+0.065)
//   cos⁴(atan(k·r))       0.097 (-0.024)        0.120 (+0.000)
//
// Each model is near-exact on the falloff it matches and wrong by more than
// half the bump on the other — and a real lens is cos⁴-ish with mechanical
// vignetting on top, so neither is right. An earlier version of this file
// shipped the polynomial and set its inner radius from a sweep against
// polynomial synthetics: the instrument agreeing with itself. On real frames
// that setting read a 0.121 bump as 0.088, and moved by 0.007 between four
// frames of the same sky.
//
// SO THIS DOES NOT SEPARATE THEM. It emits what the flat actually says:
//
//   falloff[i] = L[i]                    the whole radial profile, = 1 at ref
//   kr[i] = n_r[i]/n_g[i]                red against green
//   kb[i] = n_b[i]/n_g[i]                blue against green
//
// `falloff` is the flat-field measurement itself, model-free and free of any
// extrapolation. The two bump estimates are still computed, but only to be
// REPORTED AS A RANGE — the honest width of what one flat can say — and never
// as a profile to correct with.
//
// THE COLOUR HALF IS IMMUNE TO ALL OF IT, which is the part that matters here.
// kr and kb are ratios between channels: an achromatic falloff divides out of
// them exactly, whatever its shape, so no baseline is fitted and none can be
// got wrong. Across every frame measured — ideal, cos⁴, noisy, 8-bit, JPEG —
// they moved by at most 0.01, and that from 8-bit quantisation rather than
// from the model. A vignette that is NOT achromatic stays in, which is
// correct: a corner that goes a different colour is the same defect as a
// centre that does, and nobody asked for either.
//
// Reference note: the radial models the raw formats carry are all scalar (the
// DNG spec's FixVignetteRadial opcode, Adobe's LCP vignette model), because in
// visible light the centre and the corners are the same colour. The field's
// answer to colour non-uniformity is flat-field correction — dividing by a
// blurred photograph of a uniform field, per channel — which is exactly what
// `falloff`, `kr` and `kb` are.

import type { DecodedImage } from "./decode";

/** Radial bins, 0 at the centre and 1 at the frame CORNER (half-diagonal),
 *  matching hotspot.ts's `Rd = Math.hypot(cx, cy)`. */
export const NBINS = 80;

/** The ring every channel is normalised against. Outside any plausible
 *  hot-spot, and inside the radii where a ring is only frame corners. On a 3:2
 *  frame the short edge sits at r = 0.55 and the long edge at r = 0.83, so a
 *  ring beyond ~0.55 is already clipped by the top and bottom of the frame;
 *  past ~0.83 only the corners remain. Rings here are the most complete ones
 *  that are still safely outside the bump. */
const REF_LO = 0.55, REF_HI = 0.72;

/** Where the two bracketing baseline models are fitted from. Both use the
 *  same window so their disagreement is about the MODEL and nothing else. */
const BASE_RMIN = 0.45;

/** A flat with more than this fraction of clipped pixels has stopped
 *  recording the falloff it is supposed to be measuring. */
const CLIP_LIMIT = 0.02;

/** The lowest point of a curve, and how far it climbs again after it. */
function rebound(a: ArrayLike<number>): { rise: number; at: number } {
  let lo = Infinity, at = 0;
  for (let i = 0; i < a.length; i++) if (Number.isFinite(a[i]) && a[i] < lo) { lo = a[i]; at = i; }
  let rise = 0;
  for (let i = at; i < a.length; i++) if (Number.isFinite(a[i]) && a[i] - lo > rise) rise = a[i] - lo;
  return { rise: Number.isFinite(lo) ? rise : 0, at };
}

/** The largest step between neighbouring bins. */
function maxStep(a: ArrayLike<number>): number {
  let m = 0, prev = NaN;
  for (let i = 0; i < a.length; i++) {
    // A bin with nothing in it is a GAP, not a step: comparing across one would
    // invent a jump where the flat simply had no pixels in that ring.
    if (Number.isFinite(a[i])) {
      if (Number.isFinite(prev)) m = Math.max(m, Math.abs(a[i] - prev));
      prev = a[i];
    }
  }
  return m;
}
/** Below this mean level the frame is noise, not a flat. */
const DARK_LIMIT = 0.05;

/** How much a ring is allowed to vary AROUND itself before the frame stops
 *  being a flat and starts being a photograph. A radial profile assumes every
 *  pixel at the same distance from the centre saw the same light; a landscape
 *  breaks that assumption completely and would still produce a confident,
 *  entirely fictional profile. Clear sky measures a few percent (its own
 *  gradient, plus noise); anything with a horizon, a cloud edge or a subject
 *  in it runs several times higher. */
const STRUCTURE_LIMIT = 0.15;

/** How far the falloff may turn back UP on its way to the corner.
 *
 *  A lens gets darker away from the centre and keeps getting darker. A profile
 *  whose outer bins climb again is not describing the lens: the outermost rings
 *  of a rectangular frame contain only the four CORNERS, so they hold few pixels
 *  and anything at the edge of the shot — the sun creeping in, a reflection, a
 *  hood, a finger — lands there with nothing to average it away.
 *
 *  BOTH NUMBERS ARE MEASURED, not chosen. Across 27 real profiles from two
 *  lenses: 25 that look right rebound by 0.0000 to 0.0077 and jump between
 *  neighbouring colour bins by at most 0.021; the two that are visibly wrong
 *  rebound by 0.118 and 0.321 and jump by 0.150 and 0.186. The limits sit about
 *  four times above the worst good one and four times below the best bad one,
 *  in a gap fifteen times wide. */
const REBOUND_LIMIT = 0.03;
const JUMP_LIMIT = 0.05;

/** sRGB inverse EOTF, 8-bit in. Camera JPEGs are sRGB; the raw path arrives
 *  linear already and skips this entirely. */
const SRGB_LIN = (() => {
  const t = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return t;
})();

export interface RadialMeans {
  /** Per-channel linear mean per bin; NaN where a bin caught no pixels. */
  r: Float64Array;
  g: Float64Array;
  b: Float64Array;
  counts: Float64Array;
  clipFrac: number;
  meanLevel: number;
  /** Mean within-ring relative spread — near zero for a flat, large for a
   *  photograph of something. */
  structure: number;
  pixels: number;
  /** True when the source was linear sensor data rather than 8-bit sRGB. */
  linear: boolean;
}

/** Walk the decoded frame and accumulate per-channel linear means by radius.
 *
 *  THIS IS THE COST OF MEASURING A FRAME, not the decode. Timed on a binned
 *  20 MP raw (2784x1856, which is what the raw path actually hands over):
 *  310 ms here against 95 ms to decode the file in the first place. Two things
 *  were paying for that and neither bought anything:
 *
 *  `Math.hypot` — correct, and it guards against overflow that cannot happen
 *  with pixel coordinates. Measured over every pixel of that frame: 145 ms,
 *  against 12 ms for `sqrt(dx*dx + dy*dy)`. Twelve times, for a safety margin
 *  on numbers that never exceed a few thousand.
 *
 *  The stride targeted four million sampled pixels, which is 50,000 a bin.
 *  A quarter of that is still thousands in the thinnest ring — bin 0 spans a
 *  21-pixel radius on that frame and keeps ~350 samples — and the profile does
 *  not move. One million is the target now. */
export function radialMeans(img: DecodedImage): RadialMeans {
  const w = img.width, h = img.height;
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const Rd = Math.hypot(cx, cy);
  const sr = new Float64Array(NBINS), sg = new Float64Array(NBINS), sb = new Float64Array(NBINS);
  const cnt = new Float64Array(NBINS);
  // Sum and sum-of-squares of each pixel's brightness, per ring, for the
  // within-ring spread that tells a flat from a photograph.
  const sl = new Float64Array(NBINS), sll = new Float64Array(NBINS);
  const lin = img.linear, px = img.pixels;
  if (!lin && !px) throw new Error("decoded frame carries no pixels");
  const step = Math.max(1, Math.round(Math.sqrt((w * h) / 1e6)));
  let clipped = 0, seen = 0, sum = 0;
  for (let y = 0; y < h; y += step) {
    const dy = y - cy, dy2 = dy * dy;
    for (let x = 0; x < w; x += step) {
      const o = (y * w + x) * 4;
      let R: number, G: number, B: number;
      if (lin) { R = lin[o]; G = lin[o + 1]; B = lin[o + 2]; }
      else { R = SRGB_LIN[px![o]]; G = SRGB_LIN[px![o + 1]]; B = SRGB_LIN[px![o + 2]]; }
      const peak = R > G ? (R > B ? R : B) : (G > B ? G : B);
      if (peak >= 0.99) clipped++;
      seen++;
      sum += peak;
      const dx = x - cx;
      const rn = Math.sqrt(dx * dx + dy2) / Rd;
      const i = Math.min(NBINS - 1, (rn * NBINS) | 0);
      sr[i] += R; sg[i] += G; sb[i] += B; cnt[i]++;
      const lum = (R + G + B) / 3;
      sl[i] += lum; sll[i] += lum * lum;
    }
  }
  const mk = (s: Float64Array) => {
    const out = new Float64Array(NBINS);
    for (let i = 0; i < NBINS; i++) out[i] = cnt[i] > 0 ? s[i] / cnt[i] : NaN;
    return out;
  };
  // Pixel-weighted mean of each ring's own relative spread. Rings past r = 1
  // in radius are the frame's four corners and carry real azimuthal structure
  // by geometry rather than by content, so the measure stops at the inner
  // reference radius, where a ring is still a ring.
  let sp = 0, spN = 0;
  for (let i = 0; i < NBINS; i++) {
    if (binR(i) > REF_LO || cnt[i] < 32) continue;
    const mean = sl[i] / cnt[i];
    const varr = Math.max(0, sll[i] / cnt[i] - mean * mean);
    if (mean > 1e-6) { sp += (Math.sqrt(varr) / mean) * cnt[i]; spN += cnt[i]; }
  }
  return {
    r: mk(sr), g: mk(sg), b: mk(sb), counts: cnt,
    clipFrac: seen ? clipped / seen : 1,
    meanLevel: seen ? sum / seen : 0,
    structure: spN ? sp / spN : 1,
    pixels: seen,
    linear: !!lin,
  };
}

/** Bin centre in normalised radius. */
export const binR = (i: number) => (i + 0.5) / NBINS;

function ringMean(v: Float64Array, lo: number, hi: number, counts: Float64Array): number {
  let s = 0, n = 0;
  for (let i = 0; i < NBINS; i++) {
    const r = binR(i);
    if (r < lo || r > hi || !Number.isFinite(v[i])) continue;
    s += v[i] * counts[i]; n += counts[i];
  }
  return n > 0 ? s / n : NaN;
}

/** Least squares of L against [1, r^2, r^4] over the outer bins, weighted by
 *  how many pixels each bin actually caught. Even in r because a lens falloff
 *  is. This is ONE of the two bracketing models — see the header; it is exact
 *  on a quadratic falloff and over-states the bump on a cos^4 one.
 *
 *  NOT ITERATED, and the reason is worth keeping: dividing the bump estimate
 *  out of L and refitting is a NO-OP, because wherever the estimate is above
 *  zero, L/(1+est) is identically the fitted curve — so the refit returns the
 *  curve it was given and the bias survives untouched. It was written, run,
 *  and moved the answer by 0.0002. */
function fitVignette(L: Float64Array, counts: Float64Array, rmin: number): (r: number) => number {
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const y = [0, 0, 0];
  for (let i = 0; i < NBINS; i++) {
    const r = binR(i);
    if (r < rmin || !Number.isFinite(L[i]) || counts[i] <= 0) continue;
    const wgt = counts[i];
    const b = [1, r * r, r * r * r * r];
    for (let a = 0; a < 3; a++) {
      for (let c = 0; c < 3; c++) A[a][c] += wgt * b[a] * b[c];
      y[a] += wgt * b[a] * L[i];
    }
  }
  // 3x3 solve by Gaussian elimination with partial pivoting.
  const M = [[...A[0], y[0]], [...A[1], y[1]], [...A[2], y[2]]];
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let rI = c + 1; rI < 3; rI++) if (Math.abs(M[rI][c]) > Math.abs(M[p][c])) p = rI;
    if (Math.abs(M[p][c]) < 1e-12) return () => 1; // degenerate — no baseline
    [M[c], M[p]] = [M[p], M[c]];
    for (let rI = 0; rI < 3; rI++) {
      if (rI === c) continue;
      const f = M[rI][c] / M[c][c];
      for (let k = c; k < 4; k++) M[rI][k] -= f * M[c][k];
    }
  }
  const a0 = M[0][3] / M[0][0], a1 = M[1][3] / M[1][1], a2 = M[2][3] / M[2][2];
  return (r: number) => {
    const v = a0 + a1 * r * r + a2 * r * r * r * r;
    // Extrapolating a fit inward can run away; a vignette baseline outside
    // this range is not a baseline, it is the fit having failed.
    return Math.min(5, Math.max(0.2, v));
  };
}

/** The other bracket: the cos^4 falloff a lens actually has, with one shape
 *  parameter and its scale solved in closed form for each candidate. Exact on
 *  a cos^4 falloff and under-states the bump on a quadratic one. Golden-section
 *  over k because the fit is one-dimensional once the scale is eliminated. */
function fitCos4(L: Float64Array, counts: Float64Array, rmin: number): (r: number) => number {
  const shape = (k: number, r: number) => Math.pow(Math.cos(Math.atan(k * r)), 4);
  const at = (k: number) => {
    let sxy = 0, sxx = 0;
    for (let i = 0; i < NBINS; i++) {
      const r = binR(i);
      if (r < rmin || !Number.isFinite(L[i]) || counts[i] <= 0) continue;
      const b = shape(k, r);
      sxy += counts[i] * b * L[i]; sxx += counts[i] * b * b;
    }
    const scale = sxx > 0 ? sxy / sxx : 1;
    let e = 0;
    for (let i = 0; i < NBINS; i++) {
      const r = binR(i);
      if (r < rmin || !Number.isFinite(L[i]) || counts[i] <= 0) continue;
      const d = L[i] - scale * shape(k, r);
      e += counts[i] * d * d;
    }
    return { e, scale };
  };
  let lo = 0, hi = 3;
  for (let it = 0; it < 60; it++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (at(m1).e < at(m2).e) hi = m2; else lo = m1;
  }
  const k = (lo + hi) / 2, { scale } = at(k);
  return (r) => Math.min(5, Math.max(0.2, scale * shape(k, r)));
}

export interface FrameProfile {
  /** THE MEASUREMENT: the whole achromatic radial profile — hot-spot, vignette
   *  and all — normalised to 1 in the reference ring. No model, no
   *  extrapolation. Divide by this and the frame is flat. */
  falloff: Float64Array;
  /** Red and blue relative to green, = 1 in the reference ring.
   *  Applied as r /= kr[i], b /= kb[i]. */
  kr: Float64Array;
  kb: Float64Array;
  /** The two bracketing estimates of the CENTRAL BUMP alone, for reporting.
   *  Their gap is the honest width of what one flat frame can say; neither is
   *  a profile to correct with. */
  bumpRange: [number, number];
  /** What the flat itself says the corner keeps, relative to the ring. Not a
   *  fit — the measured value. */
  falloffAtCorner: number;
  usable: boolean;
  why: string;
  clipFrac: number;
  meanLevel: number;
  structure: number;
  linear: boolean;
}

/** One flat frame -> one profile. */
export function profileFrame(img: DecodedImage): FrameProfile {
  const m = radialMeans(img);
  const falloff = new Float64Array(NBINS).fill(NaN);
  const kr = new Float64Array(NBINS).fill(NaN);
  const kb = new Float64Array(NBINS).fill(NaN);
  const refR = ringMean(m.r, REF_LO, REF_HI, m.counts);
  const refG = ringMean(m.g, REF_LO, REF_HI, m.counts);
  const refB = ringMean(m.b, REF_LO, REF_HI, m.counts);
  const bad = (why: string): FrameProfile =>
    ({ falloff, kr, kb, bumpRange: [NaN, NaN], falloffAtCorner: NaN, usable: false, why, clipFrac: m.clipFrac, meanLevel: m.meanLevel, structure: m.structure, linear: m.linear });
  if (!(refR > 0) || !(refG > 0) || !(refB > 0)) return bad("the reference ring caught nothing to measure");
  if (m.clipFrac > CLIP_LIMIT) return bad(`${(m.clipFrac * 100).toFixed(1)}% of it is clipped — a blown flat has stopped recording the falloff`);
  if (m.meanLevel < DARK_LIMIT) return bad(`too dark to measure (mean ${(m.meanLevel * 100).toFixed(1)}%)`);
  if (m.structure > STRUCTURE_LIMIT) return bad(`this is a photograph of something, not a flat — brightness varies by ${(m.structure * 100).toFixed(0)}% around a circle, where empty sky varies by a few percent`);

  for (let i = 0; i < NBINS; i++) {
    if (!Number.isFinite(m.r[i]) || !Number.isFinite(m.g[i]) || !Number.isFinite(m.b[i])) continue;
    const nr = m.r[i] / refR, ng = m.g[i] / refG, nb = m.b[i] / refB;
    falloff[i] = (nr + ng + nb) / 3;
    kr[i] = ng > 0 ? nr / ng : NaN;
    kb[i] = ng > 0 ? nb / ng : NaN;
  }

  // THE SHAPE OF WHAT CAME OUT, not just the frame that went in. Everything
  // above asks whether the PHOTOGRAPH looks like a flat; this asks whether the
  // PROFILE looks like a lens, which is a different question and the one that
  // let two contaminated frames through into a set the reader was told was good.
  //
  // It has to run HERE, after the loop above fills them. Placed with the other
  // checks it read eighty NaNs and passed everything — the arrays exist from the
  // top of the function and are empty until this point.

  // A GUARD FOR "NOTHING WAS MEASURED" WAS WRITTEN HERE AND TAKEN OUT AGAIN.
  // It counted the rings that caught pixels and refused a frame with fewer than
  // half. Measured across frame sizes, it can never fire: at 60x40 pixels 78 of
  // 80 rings are already filled, and every frame small enough to empty a ring is
  // stopped first by the reference-ring check or by the structure check. An
  // unreachable guard is worse than none — it answers "have we handled this?"
  // for everyone who reads it afterwards, without having handled anything.

  const reb = rebound(falloff);
  if (reb.rise > REBOUND_LIMIT) {
    return bad(
      `the edges of this one brighten again instead of falling away — by ${(reb.rise * 100).toFixed(0)}% out past ${Math.round((reb.at / NBINS) * 100)}% of the way to the corner. ` +
      `A lens only ever gets darker outwards, so something is in the corner of the frame: the sun creeping in, a reflection, a hood, or a finger`,
    );
  }
  const jump = Math.max(maxStep(kr), maxStep(kb));
  if (jump > JUMP_LIMIT) {
    return bad(`the colour jumps by ${jump.toFixed(2)} between one ring and the next, which a lens does not do — the outer rings of this frame have something in them that the rest does not`);
  }

  // Both baselines, only so the gap between them can be reported. Neither
  // result is written into the profile — see the header for why.
  const centre = falloff[0];
  const poly = fitVignette(falloff, m.counts, BASE_RMIN)(binR(0));
  const cos4 = fitCos4(falloff, m.counts, BASE_RMIN)(binR(0));
  const lo = Math.max(0, centre / Math.max(poly, cos4) - 1);
  const hi = Math.max(0, centre / Math.min(poly, cos4) - 1);

  // The corner value comes from the DATA, not from either fit: the outermost
  // bin that actually caught pixels. An earlier version reported a fitted
  // V(1) here, which is a model's opinion about a place the flat has measured
  // directly.
  let corner = NaN;
  for (let i = NBINS - 1; i >= 0; i--) if (Number.isFinite(falloff[i]) && m.counts[i] >= 32) { corner = falloff[i]; break; }

  return { falloff, kr, kb, bumpRange: [lo, hi], falloffAtCorner: corner, usable: true, why: "", clipFrac: m.clipFrac, meanLevel: m.meanLevel, structure: m.structure, linear: m.linear };
}

/** Average several frames of the same lens and focal length. Bins where a
 *  frame had nothing are skipped rather than counted as zero — a NaN averaged
 *  in as 0 would pull a real bump down toward nothing and look like a
 *  measurement rather than a gap. */
export function averageProfiles(fs: FrameProfile[]): { falloff: number[]; kr: number[]; kb: number[]; bumpRange: [number, number]; n: number } {
  const use = fs.filter((f) => f.usable);
  const avg = (pick: (f: FrameProfile) => Float64Array) => {
    const out: number[] = [];
    for (let i = 0; i < NBINS; i++) {
      let s = 0, n = 0;
      for (const f of use) { const v = pick(f)[i]; if (Number.isFinite(v)) { s += v; n++; } }
      out.push(n ? s / n : i > 0 ? out[i - 1] : 0);
    }
    return out;
  };
  const los = use.map((f) => f.bumpRange[0]).filter(Number.isFinite);
  const his = use.map((f) => f.bumpRange[1]).filter(Number.isFinite);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  return {
    falloff: avg((f) => f.falloff), kr: avg((f) => f.kr), kb: avg((f) => f.kb),
    bumpRange: [mean(los), mean(his)],
    n: use.length,
  };
}

export const round5 = (xs: number[]) => xs.map((x) => Number(x.toFixed(5)));
