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

/** How sharply the curve's SLOPE changes from one ring to the next — a kink
 *  rather than a bend. Steepness alone is not a fault: the outermost rings are
 *  slivers of the frame's corners and a real lens can fall away fast there.
 *  What a lens cannot do is turn a corner. */
function maxCurve(a: ArrayLike<number>): number {
  let m = 0, p2 = NaN, p1 = NaN;
  for (let i = 0; i < a.length; i++) {
    if (!Number.isFinite(a[i])) continue;
    if (Number.isFinite(p2) && Number.isFinite(p1)) m = Math.max(m, Math.abs(a[i] - 2 * p1 + p2));
    p2 = p1; p1 = a[i];
  }
  return m;
}
/** Below this mean level the frame is noise, not a flat.
 *
 *  TWO VALUES, BECAUSE THERE ARE TWO SCALES. A rendered frame arrives as sRGB
 *  and is linearised here; a raw one arrives already linear off the sensor, and
 *  the two do NOT land in the same place. Measured on sixteen frames that exist
 *  as both a NEF and the camera's JPEG of the same exposure, the raw mean is
 *  0.126 to 0.134 of the rendered mean — about 7.6x lower, and tight enough
 *  across four readings to be a scale rather than a scatter.
 *
 *  So 0.05 is a RENDERED number. Applied to raw it means 0.38 on the rendered
 *  scale, which is most of the way to mid-grey: four genuinely well-exposed raw
 *  flats were turned away as "too dark to measure (mean 4.1-4.8%)" while sitting
 *  at 31-38% of the scale that limit was set on. It could not have been caught
 *  before, because until the NEF decode was fixed nothing had ever reached this
 *  code down the raw path — every frame it had ever seen was rendered.
 *
 *  The raw floor is 0.01 rather than the 0.0066 the ratio gives, which is a
 *  deliberate margin: the ratio rests on four frames from one camera and one
 *  picture control, and under-rejecting a dark flat costs a noisy profile the
 *  reader can re-measure, while over-rejecting costs the shoot. */
const DARK_LIMIT = 0.05;
const DARK_LIMIT_RAW = 0.01;

/** How much a ring is allowed to vary AROUND itself before the frame stops
 *  being a flat and starts being a photograph. A radial profile assumes every
 *  pixel at the same distance from the centre saw the same light; a landscape
 *  breaks that assumption completely and would still produce a confident,
 *  entirely fictional profile. Clear sky measures a few percent (its own
 *  gradient, plus noise); anything with a horizon, a cloud edge or a subject
 *  in it runs several times higher. */
/** How many angular sectors a ring is split into before its spread is taken.
 *  Enough that a gradient across the frame shows up as a difference between
 *  sectors; few enough that each holds thousands of pixels to average over. */
const SECTORS = 24;
/** GREEN IS THE DENOMINATOR, AND IN INFRARED IT IS THE CHANNEL THAT GOES TO
 *  ZERO. kr and kb are red and blue AGAINST GREEN, so a frame whose green is
 *  empty cannot say anything about colour — and says it loudly rather than
 *  quietly: measured on real frames, a reference-ring green of 0.003 in linear
 *  light returned a red-to-green ratio of 37, and one frame reported 74745.
 *  The old guard was `green > 0`, which 0.003 passes.
 *
 *  In linear light, 0.003 is an 8-bit code of about 10, where a single code
 *  step is a tenth of the value — so the ratio carries 10% of quantisation
 *  error per ring, against the 5-25% effect it is trying to measure. At this
 *  floor the code is about 90 and a step is under 2%.
 *
 *  Measured across 25 frames: clean ones sit at 0.252-0.283, and the nineteen
 *  infrared frames whose ratios were nonsense at 0.003-0.038. This sits in the
 *  gap, 2.4x above the worst nonsense and 2.8x below the good. Below it the
 *  frame still measures BRIGHTNESS, which is carried by red and is unaffected;
 *  only the colour half is withheld, and the reader is told which. */
const GREEN_FLOOR = 0.09;
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
/** MEASURED ON 35 REAL PROFILES, and the first version of this was measured on
 *  27 and got it wrong. A raw step between neighbouring rings separated the two
 *  known-bad profiles from the sound ones by only 2.3x — and then a six-frame
 *  130mm f/16 arrived with a clean monotone falloff to a 0.597 corner and a
 *  colour step of 0.066 in its LAST TWO BINS, which the 0.05 limit refused.
 *  A gate that refuses good work teaches people to route around it.
 *
 *  Curvature separates 3.4x clear: sound profiles run 0.0061-0.0277, the two
 *  with something in the corner run 0.0954-0.1512. This sits in that gap, 1.8x
 *  above the worst sound one and 1.9x below the mildest bad one.
 *
 *  Reversal — the curve moving against the direction it had been going — was
 *  measured too and OVERLAPS: one of the two bad profiles reverses by 0.0035,
 *  less than a third of the sound profiles do. It is not the discriminator,
 *  which is why it is not the rule. */
const CURVE_LIMIT = 0.05;

/** What is wrong with the SHAPE of a measured profile, in words, or null.
 *
 *  Exported because measuring is not the only way a profile gets into the
 *  store: a payload can be pasted in, or restored from a backup, or handed over
 *  by somebody else, and those doors used to have no shape check behind them at
 *  all. One function, so a frame refused at the rig cannot arrive through the
 *  restore button instead.
 *
 *  Both limits are measured rather than chosen: across 27 real profiles the 25
 *  sound ones rebound 0.0000-0.0077 with colour steps at or under 0.021, and
 *  the two with something in the corner rebound 0.1178 and 0.3212 with steps at
 *  or over 0.150. These sit in the gap. */
export function shapeProblem(falloff: ArrayLike<number>, kr: ArrayLike<number>, kb: ArrayLike<number>): string | null {
  const reb = rebound(falloff);
  if (reb.rise > REBOUND_LIMIT) {
    return `the edges of this one brighten again instead of falling away — by ${(reb.rise * 100).toFixed(0)}% out past ${Math.round((reb.at / falloff.length) * 100)}% of the way to the corner. ` +
      `A lens only ever gets darker outwards, so something is in the corner of the frame: the sun creeping in, a reflection, a hood, or a finger`;
  }
  const kink = Math.max(maxCurve(kr), maxCurve(kb));
  if (kink > CURVE_LIMIT) {
    return `the colour turns a corner — it bends by ${kink.toFixed(2)} from one ring to the next, where a lens bends by a tenth of that. The outer rings of this frame have something in them that the rest does not`;
  }
  return null;
}


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
  /** Per ring: how many sectors the estimate was built from, and how many were
   *  in the frame at all. `kept < of` is contamination that was worked around
   *  rather than a frame that had to be thrown away; `kept === 0` is a radius
   *  with nothing to say, and its r/g/b are NaN. */
  keptSectors: Float64Array;
  ofSectors: Float64Array;
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
  // Per ring AND per angular sector: the sum and count inside each sector, so
  // structure can be measured on sector MEANS rather than on raw pixel spread.
  // See SECTORS below for why that is not the same question.
  const sl = new Float64Array(NBINS), sll = new Float64Array(NBINS);
  const secS = new Float64Array(NBINS * SECTORS), secN = new Float64Array(NBINS * SECTORS);
  // PER-SECTOR CHANNEL SUMS, FOR EVERY RING. A ring's mean is what the profile
  // is made of, and a plain mean over the whole ring believes whatever is in it.
  // Keeping the channels per sector is what lets a ring be estimated from the
  // sectors that are clean — see robustRing.
  const secR = new Float64Array(NBINS * SECTORS), secG = new Float64Array(NBINS * SECTORS), secB = new Float64Array(NBINS * SECTORS);
  const lin = img.linear, px = img.pixels;
  if (!lin && !px) throw new Error("decoded frame carries no pixels");
  const step = Math.max(1, Math.round(Math.sqrt((w * h) / 1e6)));

  // A SKY HAS A GRADIENT AND IT IS NOT THE LENS. Structure asks how much a ring
  // varies AROUND itself, and a smooth brightness ramp across the frame makes
  // one side of every ring read higher than the other — indistinguishable, to
  // that measure, from a branch in the corner. The wider the lens the more ramp
  // it spans: the same sky reads 27-29% at 17mm and 18-20% at 24-25mm, across
  // the whole aperture range at each, because aperture does not change what is
  // in view.
  //
  // Flat-fielding has removed the ramp before judging the frame for decades. One
  // least-squares plane, divided out — illumination is multiplicative — and a
  // plane cannot absorb a RADIAL term, so the lens's own falloff and hot-spot
  // survive it untouched. Measured across three populations: sky flats fall from
  // 5.7-46.7% to 1.6-12.5%, genuinely contaminated frames stay at 43.2-116.7%,
  // and clean synthetic controls stay at 0.0-2.9%. Worst clean against mildest
  // contaminated is 12.5 against 43.2 — they separate by 3.5x with the existing
  // limit already sitting between them.
  //
  // ONLY THE STRUCTURE READING USES IT. The radial means this returns — falloff,
  // kr, kb, the profile itself — are the measurement, and they stay exactly as
  // the sensor recorded them.
  let pn = 0, pSx = 0, pSy = 0, pSxx = 0, pSyy = 0, pSxy = 0, pSl = 0, pSxl = 0, pSyl = 0;
  const pstep = Math.max(step, Math.round(Math.sqrt((w * h) / 2e5)));
  for (let y = 0; y < h; y += pstep) for (let x = 0; x < w; x += pstep) {
    const o = (y * w + x) * 4;
    const L = lin ? (lin[o] + lin[o + 1] + lin[o + 2]) / 3
                  : (SRGB_LIN[px![o]] + SRGB_LIN[px![o + 1]] + SRGB_LIN[px![o + 2]]) / 3;
    const u = x / w - 0.5, v = y / h - 0.5;
    pn++; pSx += u; pSy += v; pSxx += u * u; pSyy += v * v; pSxy += u * v;
    pSl += L; pSxl += u * L; pSyl += v * L;
  }
  const A = [[pn, pSx, pSy], [pSx, pSxx, pSxy], [pSy, pSxy, pSyy]], rhs = [pSl, pSxl, pSyl];
  for (let i = 0; i < 3; i++) {
    let piv = i;
    for (let k = i + 1; k < 3; k++) if (Math.abs(A[k][i]) > Math.abs(A[piv][i])) piv = k;
    [A[i], A[piv]] = [A[piv], A[i]]; [rhs[i], rhs[piv]] = [rhs[piv], rhs[i]];
    for (let k = i + 1; k < 3; k++) {
      const f = A[i][i] ? A[k][i] / A[i][i] : 0;
      for (let j = i; j < 3; j++) A[k][j] -= f * A[i][j];
      rhs[k] -= f * rhs[i];
    }
  }
  const co = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let acc = rhs[i];
    for (let j = i + 1; j < 3; j++) acc -= A[i][j] * co[j];
    co[i] = A[i][i] ? acc / A[i][i] : 0;
  }
  // A frame too dark or too odd to fit falls back to no correction rather than
  // to a divide by nothing.
  const pMean = co[0] > 1e-6 ? co[0] : 0;

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
      {
        // EVERY RING NOW, not just the ones the structure check reads. The
        // atan2 was gated to the inner rings when only structure used sectors;
        // the ring ESTIMATOR uses them everywhere, so the gate would silently
        // leave the outer half of every profile on the old un-robust path.
        const a = Math.min(SECTORS - 1, (((Math.atan2(dy, dx) + Math.PI) * SECTORS) / (2 * Math.PI)) | 0);
        const k2 = i * SECTORS + a;
        secR[k2] += R; secG[k2] += G; secB[k2] += B;
        // The plane, divided out — see the fit above. This value feeds the
        // STRUCTURE reading only; `sl`/`sr`/`sg`/`sb` above are untouched.
        let flat = lum;
        if (pMean) {
          const g = (co[0] + co[1] * (x / w - 0.5) + co[2] * (y / h - 0.5)) / pMean;
          if (g > 0.05) flat = lum / g;
        }
        secS[i * SECTORS + a] += flat; secN[i * SECTORS + a]++;
      }
    }
  }
  /** ONE RING'S LEVEL, ESTIMATED FROM THE SECTORS THAT AGREE.
   *
   *  A ring's mean is what the profile is made of, and a plain mean believes
   *  whatever is in the ring: a branch in one corner raises that radius for
   *  every frame it appears in, and nothing downstream can tell. The radial
   *  model already says every sector at one radius saw the same light, so a
   *  sector that disagrees is evidence, not noise to be averaged in.
   *
   *  Two things vary around a ring and only one of them is a fault:
   *
   *  A SMOOTH ILLUMINATION RAMP is a plane, and a plane sampled on a circle is
   *  exactly `k + A cos(th) + B sin(th)` — one cycle, no more. Averaging the
   *  whole ring cancels it for free, which is why a plain mean was unbiased
   *  while every sector was present.
   *
   *  LOCALISED CONTAMINATION is a few sectors away from the rest and no cycle
   *  at all.
   *
   *  So fit the one-cycle term, call the sectors that sit far off the fit
   *  outliers, and refit without them. The answer is the fitted CONSTANT, not
   *  the mean of the survivors — because once sectors are dropped from one side
   *  the ramp no longer cancels, and a mean of what is left is biased by exactly
   *  the amount the ramp was supposed to cancel. Dropping the bright half of a
   *  ring and averaging the rest is how a robust estimator quietly becomes a
   *  wrong one.
   *
   *  The outlier mask comes from LUMA and is then applied to all three channels:
   *  cloud and foliage are not a one-channel event, and a mask fitted per
   *  channel would let a ring keep different sectors for red than for green,
   *  which is a colour ratio between two different pieces of sky.
   *
   *  Where the ring is cut by the frame edge — everything past r = 0.5547 of the
   *  half-diagonal on a 3:2 frame — only the left and right arcs survive, and
   *  the ramp's vertical component cannot be identified from them. The fit is
   *  checked for that and falls back to a constant-only estimate rather than
   *  solving a direction it cannot see. */
  const ringLevel = (i: number): { r: number; g: number; b: number; kept: number; of: number } => {
    const idx: number[] = [], th: number[] = [], lum: number[] = [];
    for (let a = 0; a < SECTORS; a++) {
      const k = i * SECTORS + a;
      if (secN[k] < 24) continue;
      idx.push(a);
      th.push(((a + 0.5) / SECTORS) * 2 * Math.PI);
      lum.push((secR[k] + secG[k] + secB[k]) / (3 * secN[k]));
    }
    const of = idx.length;
    // TOO SMALL TO SECTOR IS NOT THE SAME AS CONTAMINATED. The innermost ring is
    // a disc of a few hundred pixels on the optical centre; no sector in it
    // reaches the minimum, so `of` is 0 for a reason that has nothing to do with
    // what is in the frame. Returning "no estimate" there made the reach scan
    // stop at ring 0 and refused all sixteen good flats — caught by the corpus
    // check on its first run after the estimator landed.
    //
    // A ring that small cannot be selectively contaminated in any way that
    // matters at this scale, so its plain mean stands. kept = of = 0 records
    // that it was never sector-checked, which is a different claim from
    // "checked and clean".
    if (of === 0) {
      if (!(cnt[i] > 0)) return { r: NaN, g: NaN, b: NaN, kept: 0, of: 0 };
      return { r: sr[i] / cnt[i], g: sg[i] / cnt[i], b: sb[i] / cnt[i], kept: 0, of: 0 };
    }

    // Solve [1, cos, sin] against `vals` over `use`; returns the constant term,
    // or the plain mean when the one-cycle part is not identifiable from the
    // angles that are present.
    const solve = (vals: number[], use: boolean[]): { k: number; A: number; B: number } => {
      let n = 0, Sc = 0, Ss = 0, Scc = 0, Sss = 0, Scs = 0, Sv = 0, Svc = 0, Svs = 0;
      for (let j = 0; j < vals.length; j++) {
        if (!use[j]) continue;
        const C = Math.cos(th[j]), S = Math.sin(th[j]), v = vals[j];
        n++; Sc += C; Ss += S; Scc += C * C; Sss += S * S; Scs += C * S; Sv += v; Svc += v * C; Svs += v * S;
      }
      if (n === 0) return { k: NaN, A: 0, B: 0 };
      const mean = Sv / n;
      // Not enough angular spread to separate a ramp from a level: a clipped
      // ring is two opposite arcs, and one of the two directions is invisible.
      if (n < 5 || Scc < 1e-6 || Sss < 1e-6) return { k: mean, A: 0, B: 0 };
      const M = [[n, Sc, Ss], [Sc, Scc, Scs], [Ss, Scs, Sss]], rhs = [Sv, Svc, Svs];
      for (let a = 0; a < 3; a++) {
        let piv = a;
        for (let q = a + 1; q < 3; q++) if (Math.abs(M[q][a]) > Math.abs(M[piv][a])) piv = q;
        [M[a], M[piv]] = [M[piv], M[a]]; [rhs[a], rhs[piv]] = [rhs[piv], rhs[a]];
        if (Math.abs(M[a][a]) < 1e-9) return { k: mean, A: 0, B: 0 };
        for (let q = a + 1; q < 3; q++) {
          const f = M[q][a] / M[a][a];
          for (let j = a; j < 3; j++) M[q][j] -= f * M[a][j];
          rhs[q] -= f * rhs[a];
        }
      }
      const co = [0, 0, 0];
      for (let a = 2; a >= 0; a--) {
        let acc = rhs[a];
        for (let j = a + 1; j < 3; j++) acc -= M[a][j] * co[j];
        co[a] = acc / M[a][a];
      }
      return Number.isFinite(co[0]) ? { k: co[0], A: co[1], B: co[2] } : { k: mean, A: 0, B: 0 };
    };

    const all = idx.map(() => true);
    const f0 = solve(lum, all);
    const res = lum.map((v, j) => v - (f0.k + f0.A * Math.cos(th[j]) + f0.B * Math.sin(th[j])));
    const srt = [...res].sort((x, y) => x - y);
    const med = srt[srt.length >> 1];
    const dev = res.map((x) => Math.abs(x - med)).sort((x, y) => x - y);
    const mad = dev[dev.length >> 1];
    // A ring with no scatter at all has mad 0; everything is then an outlier by
    // any ratio, so an absolute floor relative to the ring's own level is what
    // keeps a clean ring from rejecting itself.
    const tol = Math.max(4 * mad, 0.01 * Math.abs(f0.k));
    const keep = res.map((x) => Math.abs(x - med) <= tol);
    const kept = keep.filter(Boolean).length;
    // Too little of the ring left to stand for it. NaN is the existing "this
    // radius has nothing to say" value and every reader already handles it.
    if (kept < Math.max(5, Math.ceil(of * 0.5))) return { r: NaN, g: NaN, b: NaN, kept, of };
    const chan = (sec: Float64Array) =>
      solve(idx.map((a) => sec[i * SECTORS + a] / secN[i * SECTORS + a]), keep).k;
    return { r: chan(secR), g: chan(secG), b: chan(secB), kept, of };
  };

  const lev: { r: number; g: number; b: number; kept: number; of: number }[] = [];
  for (let i = 0; i < NBINS; i++) lev.push(ringLevel(i));

  const mk = (s: Float64Array) => {
    const out = new Float64Array(NBINS);
    for (let i = 0; i < NBINS; i++) out[i] = cnt[i] > 0 ? s[i] / cnt[i] : NaN;
    return out;
  };
  // Pixel-weighted mean of each ring's own relative spread. Rings past r = 1
  // in radius are the frame's four corners and carry real azimuthal structure
  // by geometry rather than by content, so the measure stops at the inner
  // reference radius, where a ring is still a ring.
  // MEASURED ON SECTOR MEANS, BECAUSE PIXEL SPREAD IS PART NOISE. The spread of
  // a ring's PIXELS counts shot noise alongside the structure it is looking for.
  // On a bright low-ISO flat that is nothing. On a dark high-ISO one it is most
  // of the reading: a clean synthetic frame reads 0.0048 by pixel spread where
  // the truth is zero — 95% noise — and real frames at ISO 640-1400 and a mean
  // level of 0.08 carry 0.08-0.14 of pure noise, at or above STRUCTURE_LIMIT.
  // A genuinely flat frame, shot dark, was refused as "a photograph of
  // something" for being grainy.
  //
  // Averaging inside a sector kills the noise and keeps everything that varies
  // AROUND the circle — cloud, a horizon, a branch, the sun's own gradient.
  // Measured both ways on 25 frames: clean ones read 0.0002-0.0118 by sectors,
  // contaminated ones 0.4913-0.8715, so the same STRUCTURE_LIMIT separates them
  // by 3.3x.
  //
  // IT IS NOT A STRICT INEQUALITY, AND THIS SAID IT WAS. A sector mean can never
  // be noisier than the pixels it averages, so the reading falls — but the
  // sector loop also DROPS rings the old code counted: a ring broken into fewer
  // than 60% usable sectors is skipped, and if that empties the accumulator
  // `structure` falls back to 1 and the frame is refused. At real frame sizes
  // the inner rings have thousands of pixels each and it does not arise; on a
  // frame small enough it could. "Always lower" was the direction of the change
  // read as a guarantee, which it is not.
  let sp = 0, spN = 0;
  for (let i = 0; i < NBINS; i++) {
    if (binR(i) > REF_LO || cnt[i] < 32) continue;
    let n = 0, sum = 0, sum2 = 0;
    for (let a = 0; a < SECTORS; a++) {
      const k = i * SECTORS + a;
      if (secN[k] < 24) continue; // too few pixels in this sector to average
      const m = secS[k] / secN[k];
      n++; sum += m; sum2 += m * m;
    }
    if (n < SECTORS * 0.6) continue; // a ring too broken up to say anything about
    const mean = sum / n;
    const varr = Math.max(0, sum2 / n - mean * mean);
    if (mean > 1e-6) { sp += (Math.sqrt(varr) / mean) * cnt[i]; spN += cnt[i]; }
  }
  // THE RING LEVELS ARE THE MEASUREMENT NOW. `mk` divides a ring's total by its
  // pixel count and believes everything in it; `ringLevel` estimates the same
  // quantity from the sectors that agree with each other. They are identical on
  // a clean ring and differ exactly where a frame has something in it.
  const pick = (k: "r" | "g" | "b") => {
    const out = new Float64Array(NBINS);
    for (let i = 0; i < NBINS; i++) out[i] = cnt[i] > 0 ? lev[i][k] : NaN;
    return out;
  };
  const kept = new Float64Array(NBINS), ofs = new Float64Array(NBINS);
  for (let i = 0; i < NBINS; i++) { kept[i] = lev[i].kept; ofs[i] = lev[i].of; }
  void mk;
  return {
    r: pick("r"), g: pick("g"), b: pick("b"), counts: cnt,
    keptSectors: kept, ofSectors: ofs,
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
  /** False when the frame's green was too faint to divide by, so kr and kb are
   *  a flat 1 and only the brightness half of this profile means anything. */
  colour: boolean;
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
  /** HOW FAR OUT THIS FRAME COULD ACTUALLY BE MEASURED, as a fraction of the
   *  half-diagonal, and how many of its rings needed contaminated sectors
   *  dropped to get there. A frame clean to the corner reads 1; one with
   *  something along an edge reads less, and the profile past that point is
   *  NaN rather than a number nothing checked. */
  goodTo: number;
  /** Rings where the estimate came from fewer sectors than were present — the
   *  frame was rescued at that radius rather than believed. */
  rescuedRings: number;
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
  const colour = refG >= GREEN_FLOOR;
  const bad = (why: string): FrameProfile =>
    ({ falloff, kr, kb, colour, bumpRange: [NaN, NaN], falloffAtCorner: NaN, usable: false, why, clipFrac: m.clipFrac, meanLevel: m.meanLevel, structure: m.structure, linear: m.linear, goodTo: 0, rescuedRings: 0 });
  if (!(refR > 0) || !(refG > 0) || !(refB > 0)) return bad("the reference ring caught nothing to measure");
  // AND THE REFERENCE RING ITSELF HAS TO HAVE SURVIVED. Every curve here is
  // divided by the level in r 0.55-0.72, so a frame whose estimate runs out
  // before REF_HI is normalised against rings that were never established. That
  // is not a shorter profile, it is a profile on an unknown scale — and two of
  // them cannot be averaged, because each is divided by a different unknown.
  //
  // Worth knowing about that band: on a 3:2 frame the top and bottom edges are
  // at 0.5547 of the half-diagonal, so the whole reference ring is past them and
  // is sampled from the LEFT AND RIGHT ARCS ONLY — 70% of each ring on average.
  // The estimator handles the missing sectors, but a frame contaminated down one
  // side has lost a larger share of that band than the count suggests.
  {
    let reach = 0;
    for (let i = 0; i < NBINS; i++) { if (!Number.isFinite(m.r[i])) break; reach = binR(i) + 0.5 / NBINS; }
    if (reach < REF_HI)
      return bad(`only the middle of this one could be measured — out to ${(reach * 100).toFixed(0)}% of the way to the corner, and the rest has something in it`);
  }
  if (m.clipFrac > CLIP_LIMIT) return bad(`${(m.clipFrac * 100).toFixed(1)}% of it is clipped — a blown flat has stopped recording the falloff`);
  const darkFloor = m.linear ? DARK_LIMIT_RAW : DARK_LIMIT;
  if (m.meanLevel < darkFloor) return bad(`too dark to measure (mean ${(m.meanLevel * 100).toFixed(1)}% of what ${m.linear ? "a raw file" : "a rendered file"} can hold)`);
  if (m.structure > STRUCTURE_LIMIT) return bad(`this is a photograph of something, not a flat — brightness varies by ${(m.structure * 100).toFixed(0)}% around a circle, where empty sky varies by a few percent`);

  // HOW FAR OUT THIS FRAME REACHES. Rings are estimated from the sectors that
  // agree; a radius where too few agreed has no estimate at all. The frame is
  // trusted out to the last radius with an UNBROKEN run of estimates from the
  // centre — unbroken, because a gap means the rings past it were measured
  // across whatever caused the gap, and a profile with a hole in the middle of
  // it is not a profile with a shorter reach, it is a wrong one.
  let goodTo = 0, rescuedRings = 0;
  for (let i = 0; i < NBINS; i++) {
    if (!Number.isFinite(m.r[i])) break;
    goodTo = binR(i) + 0.5 / NBINS;
    if (m.keptSectors[i] < m.ofSectors[i]) rescuedRings++;
  }

  for (let i = 0; i < NBINS; i++) {
    if (!Number.isFinite(m.r[i]) || !Number.isFinite(m.g[i]) || !Number.isFinite(m.b[i])) continue;
    const nr = m.r[i] / refR, ng = m.g[i] / refG, nb = m.b[i] / refB;
    falloff[i] = (nr + ng + nb) / 3;
    kr[i] = colour ? nr / ng : 1;
    kb[i] = colour ? nb / ng : 1;
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

  const shape = shapeProblem(falloff, kr, kb);
  if (shape) return bad(shape);

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

  return { falloff, kr, kb, colour, bumpRange: [lo, hi], falloffAtCorner: corner, usable: true, why: "", clipFrac: m.clipFrac, meanLevel: m.meanLevel, structure: m.structure, linear: m.linear, goodTo, rescuedRings };
}

/** Average several frames of the same lens and focal length. Bins where a
 *  frame had nothing are skipped rather than counted as zero — a NaN averaged
 *  in as 0 would pull a real bump down toward nothing and look like a
 *  measurement rather than a gap. */
export function averageProfiles(fs: FrameProfile[]): { falloff: number[]; kr: number[]; kb: number[]; bumpRange: [number, number]; n: number; colourFrames: number } {
  const use = fs.filter((f) => f.usable);
  // A FRAME WITH NO GREEN CARRIES FLAT 1s, AND AVERAGING THEM IN IS A VOTE FOR
  // NEUTRAL. Green is the denominator of kr and kb, and an infrared frame can
  // have almost none — those frames are kept for BRIGHTNESS, which red carries
  // and which is unaffected, and marked `colour: false` with their kr and kb
  // set to a flat 1 so nothing downstream divides by nothing.
  //
  // Averaged with the rest, one such frame in six pulls the whole colour curve a
  // sixth of the way to neutral, silently: the per-frame row says that frame is
  // brightness-only, and the averaged profile that goes into the store says
  // nothing at all. Colour is averaged over the frames that measured some, and a
  // group where none did carries a flat 1 on purpose rather than by accident.
  const colourFs = use.filter((f) => f.colour);
  const avgOf = (list: FrameProfile[], pick: (f: FrameProfile) => Float64Array, fallback: number) => {
    const out: number[] = [];
    for (let i = 0; i < NBINS; i++) {
      let s = 0, n = 0;
      for (const f of list) { const v = pick(f)[i]; if (Number.isFinite(v)) { s += v; n++; } }
      out.push(n ? s / n : i > 0 ? out[i - 1] : fallback);
    }
    return out;
  };
  const avg = (pick: (f: FrameProfile) => Float64Array) => avgOf(use, pick, 0);
  const avgColour = (pick: (f: FrameProfile) => Float64Array) =>
    colourFs.length ? avgOf(colourFs, pick, 1) : new Array(NBINS).fill(1);
  const los = use.map((f) => f.bumpRange[0]).filter(Number.isFinite);
  const his = use.map((f) => f.bumpRange[1]).filter(Number.isFinite);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  return {
    falloff: avg((f) => f.falloff), kr: avgColour((f) => f.kr), kb: avgColour((f) => f.kb),
    bumpRange: [mean(los), mean(his)],
    n: use.length,
    colourFrames: colourFs.length,
  };
}

export const round5 = (xs: number[]) => xs.map((x) => Number(x.toFixed(5)));
