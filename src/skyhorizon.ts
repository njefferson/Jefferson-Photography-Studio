// Where the sky ENDS, as a horizon line the photograph itself draws — one
// border depth per display column, found by the published method rather than
// invented here. Shen and Wang, "Sky Region Detection in a Single Image for
// Autonomous Ground Robot Navigation", International Journal of Advanced
// Robotic Systems 10(10), 2013 (doi 10.5772/56884). IR-SCIENCE.md §9o carries
// the physics, the adaptation and what each constant had to become.
//
// The idea in one sentence: a sky border position function b(a) says, for each
// column, the depth at which the first edge stronger than t appears; sweeping t
// over the gradient image's own quantiles and keeping whichever b maximises an
// energy function that rewards a HOMOGENEOUS sky against a VARIED ground gives
// the horizon without ever asking what colour a sky is.
//
// Why that is the right instrument here and a colour model is not. `sky.ts`
// learned the sky's colour from a strip at the top of the frame and grew down
// while pixels matched it. Three things it cannot do, each measured on real
// frames on 2026-09-20: a frame whose top strip is smooth grey flower stems
// gets a model and grows through 76.4% of a macro with no sky in it; a frame
// whose top strip is cloud deck learns cloud and refuses a band of clear sky
// lower in the same picture; and a playhouse wall that matches the model is
// taken because nothing in a colour test knows where the ground is. The border
// function knows only place and edge strength, so none of those three is
// expressible: it answers "how far down does this column stay smooth", the
// no-sky test (§2.3.1 of the paper) answers "is any of this a sky at all", and
// the column refinement (§2.3.2) answers "is this column's smooth top actually
// a building".
//
// What it is NOT: this does not replace the colour grow, it SEEDS it. The
// border is blunt by construction — it stops at the first twig — so the region
// above it becomes the seed the existing robust model is fitted to and the
// existing edge-aware fill grows from. The seed is then drawn from the whole
// sky rather than a 6% strip, which is the other half of why the cloud frame
// failed.
//
// Everything here reads the gray-world-balanced camera-matrix LINEAR frame, the
// same data `buildSkyMask` works in: before the grade, before the channel swap,
// before the look. The horizon a photograph gets cannot move when it is graded.

/** Emphasis on homogeneity in the sky region, the paper's γ in its equation 6.
 *  Its value there is 2, chosen experimentally; it is kept because the channels
 *  below are scaled into the same numeric range the paper's were. */
export const SKY_ENERGY_GAMMA = 2;

/** How many thresholds the sweep tries. The paper searches 120 sample points
 *  (its equation 11: thresh_min 5, thresh_max 600, step 5). The count carries
 *  over; where the thresholds themselves come from does not — see
 *  SKY_T_QUANTILE_LO. */
export const SKY_T_STEPS = 120;

/** The sweep's thresholds are QUANTILES of this photograph's own gradient
 *  magnitudes, not fixed numbers. The paper's 5..600 is a range in the units of
 *  an OpenCV Sobel on an 8-bit greyscale image, whose theoretical maximum it
 *  states as 1443; this app's gradient is a central difference on luma
 *  normalised to the frame's own 95th percentile, so a fixed range transplanted
 *  from there would mean something different on every frame. Quantiles say the
 *  same thing scale-free: run from "most of the frame is an edge" to "almost
 *  nothing is", and let the energy function pick. */
export const SKY_T_QUANTILE_LO = 0.5;
/** The top of that sweep. Past this every column runs to the bottom of the
 *  frame and b(a) stops changing — the paper's own observation that Jn(t) is
 *  nearly constant once t exceeds 600. */
export const SKY_T_QUANTILE_HI = 0.999;

/** The paper's thresh1 for "this photograph has no sky", as a fraction of the
 *  frame's depth: the detected sky occupies less than a thirtieth of it. Its
 *  equation 15 gives H/30 directly. */
export const SKY_NO_SKY_AVE = 1 / 30;
/** THE PAPER'S SECOND CLAUSE IS MEASURED AND DELIBERATELY NOT USED TO REFUSE.
 *  Its equation 14 also calls a photograph sky-less when the border sits above
 *  a quarter of the depth AND zigzags — average absolute step over thresh3,
 *  which it sets to 5 pixels. Wired up as written it refused NIR_0063, which
 *  has real sky in it: an oak fills the top-left of that frame, so the border
 *  is high on the left and low on the right and steps hard in between, which is
 *  what a canopy IS rather than a sign there is no sky.
 *  The priority here is not the paper's. A robot that mistakes a wall for sky
 *  drives into it; this app's ranking, stated 2026-09-20, is that a photograph
 *  WITH sky must have all of it selected and no more, and a photograph with no
 *  sky selecting one is not a failure — the reader turns the mask off. So the
 *  jagged clause is computed and reported (`jagged`) and never refuses. */
export const SKY_NO_SKY_AVE_JAGGED = 1 / 4;
export const SKY_NO_SKY_JAGGED = 1 / 100;
/** The paper's thresh4: a single column-to-column step larger than a third of
 *  the depth means some columns hold no sky at all and the refinement runs.
 *  Measured against running it always — see the note at the call. */
export const SKY_PARTIAL_STEP = 1 / 3;

/** A SECOND "there is no sky here", and it is not the paper's — it comes out of
 *  the shape of Jn rather than the shape of the border, and it is the one that
 *  fires on the frames this app actually meets.
 *  The paper assumes the optimum is INTERIOR: its own words are that Jn(t) is
 *  nearly constant once t exceeds 600, so the sweep runs past the peak and
 *  comes back. Measured on the 44 practice frames, a photograph with a sky
 *  gives exactly that — NIR_1651's Jn rises to 1.13e-8 at the 97th sample and
 *  falls away after it. A photograph without one gives a curve that RISES
 *  MONOTONICALLY to the last sample, because the best separation available is
 *  "call the whole frame sky": hillside, a hillside of conifers with a sliver
 *  of sky along the top, runs 5.05e-10 to 5.08e-9 without ever turning over.
 *  An argmax at the end of the search space is not an optimum, it is the search
 *  failing to find one. */
export const SKY_BOUNDARY_K = 1;
// (see `boundary` in skyHorizon: the comparison is against the LAST CANDIDATE
//  threshold, not the last sample, since the shallow ones are skipped.)

/** Lloyd iterations in the two-cluster split the column refinement uses. The
 *  reference implementation runs 10 with random restarts; the initialisation
 *  here is deterministic (see `refineColumns`), because a mask that came out
 *  differently on two openings of the same photograph would be a defect. */
const KMEANS_ITERS = 10;

/** Fewest pixels a region may hold before its covariance is meaningless and the
 *  threshold is skipped. Three channels need more than three points. */
const MIN_REGION = 64;

/** The border, and everything the two post-processing tests concluded about it. */
export interface SkyHorizon {
  /** Border depth per display column, 0..d. Sky in column a is depth [0, b[a]);
   *  b[a] === 0 means the column holds no sky. */
  b: Int32Array;
  /** Number of display columns (b.length). */
  cols: number;
  /** Depth extent — how far a column runs from the display-top edge. */
  rows: number;
  /** The gradient threshold the energy optimum chose, in the units of the `g`
   *  passed in. */
  t: number;
  /** Jn at that threshold, the paper's equation 6. Zero when no threshold in
   *  the sweep produced two regions big enough to measure. */
  energy: number;
  /** The paper's §2.3.1 verdict, FIRST CLAUSE ONLY: the border sits so near the
   *  top edge that there is no sky here. */
  noSky: boolean;
  /** The paper's second clause, measured and reported but never a refusal —
   *  see SKY_NO_SKY_AVE_JAGGED. A canopy frame trips it honestly. */
  jagged: boolean;
  /** Jn never turned over: its maximum is at the end of the search space, so
   *  the border is the sweep running out rather than a horizon, and the caller
   *  must not seed from it — see SKY_BOUNDARY_K. It is NOT a no-sky verdict:
   *  it says this published method does not apply to this photograph, which is
   *  a different claim and has a different remedy. */
  boundary: boolean;
  /** The paper's §2.3.2 verdict: some columns held no sky and were cleared. */
  refined: boolean;
  /** Largest column-to-column step in the border, in depth texels. The column
   *  refinement runs when it exceeds SKY_PARTIAL_STEP of the depth. */
  partialStep: number;
  /** Share of the frame above the border after refinement, 0..1. */
  share: number;
  /** The thresholds the sweep tried, and Jn at each — the method's whole
   *  decision, kept because a border that looks wrong is answered by the shape
   *  of this curve and by nothing else. 120 numbers. */
  sweepT: Float64Array;
  sweepJ: Float64Array;
  /** Share above the border BEFORE the column refinement ran. Equal to `share`
   *  when it did not. The pair is what says whether a thin selection came from
   *  the energy optimum or from the refinement taking columns away — one
   *  number cannot, and a walk that reads only `share` cannot tell a frame the
   *  border never reached from a frame the refinement emptied. */
  shareRaw: number;
}

/**
 * Map a display column and depth to an index in the image-oriented grid.
 * @param w,h  grid dimensions in image orientation.
 * @param rotate  display rotation in 90° CW steps (0..3).
 * @returns `{ cols, rows, at }` — the number of display columns, the depth
 *   extent, and `at(a, d)` giving the image-grid index of column `a` at depth
 *   `d` from the display-top edge.
 * What the result must satisfy: `at` is a bijection from `[0,cols)×[0,rows)`
 * onto `[0, w*h)`, and `at(a, 0)` lies on the edge `buildSkyMask`'s `depthOf`
 * calls depth 0 — the two must agree about which edge is up or the border is
 * measured down the wrong axis.
 */
export function skyAxes(
  w: number,
  h: number,
  rotate: number,
): { cols: number; rows: number; at: (a: number, d: number) => number } {
  const rot = ((rotate % 4) + 4) % 4;
  const cols = rot % 2 === 0 ? w : h;
  const rows = rot % 2 === 0 ? h : w;
  const at =
    rot === 1
      ? (a: number, d: number) => a * w + d
      : rot === 2
        ? (a: number, d: number) => (h - 1 - d) * w + (w - 1 - a)
        : rot === 3
          ? (a: number, d: number) => (h - 1 - a) * w + (w - 1 - d)
          : (a: number, d: number) => d * w + a;
  return { cols, rows, at };
}

/** Running first and second moments of a three-channel region, enough to build
 *  its 3×3 covariance without a second pass over the pixels. */
interface Moments {
  n: number;
  s: [number, number, number];
  q: [number, number, number, number, number, number]; // xx yy zz xy xz yz
}

const zeroMoments = (): Moments => ({ n: 0, s: [0, 0, 0], q: [0, 0, 0, 0, 0, 0] });

function addMoment(m: Moments, x: number, y: number, z: number): void {
  m.n++;
  m.s[0] += x; m.s[1] += y; m.s[2] += z;
  m.q[0] += x * x; m.q[1] += y * y; m.q[2] += z * z;
  m.q[3] += x * y; m.q[4] += x * z; m.q[5] += y * z;
}

/** Covariance as [xx, yy, zz, xy, xz, yz] from running moments, or null when
 *  the region is too small to describe. */
function covOf(m: Moments): number[] | null {
  if (m.n < MIN_REGION) return null;
  const n = m.n;
  const mx = m.s[0] / n, my = m.s[1] / n, mz = m.s[2] / n;
  return [
    m.q[0] / n - mx * mx,
    m.q[1] / n - my * my,
    m.q[2] / n - mz * mz,
    m.q[3] / n - mx * my,
    m.q[4] / n - mx * mz,
    m.q[5] / n - my * mz,
  ];
}

/** Determinant of a symmetric 3×3 held as [xx, yy, zz, xy, xz, yz]. */
function det3(c: number[]): number {
  const [a, b, d, e, f, g] = c; // [[a,e,f],[e,b,g],[f,g,d]]
  return a * (b * d - g * g) - e * (e * d - g * f) + f * (e * g - b * f);
}

/**
 * Largest eigenvalue of a symmetric 3×3 matrix.
 * @param c  the matrix as [xx, yy, zz, xy, xz, yz].
 * @returns the largest eigenvalue, by the closed-form trigonometric solution
 *   for symmetric 3×3 matrices.
 * What the result must satisfy: it is real and never below trace/3, which is
 * what `energyOf` relies on to keep the paper's λ1 term positive — an
 * eigenvalue solver that returned the smallest root instead would make Jn
 * reward exactly the wrong border.
 */
export function largestEigenvalue(c: number[]): number {
  const [a, b, d, e, f, g] = c;
  const p1 = e * e + f * f + g * g;
  const q = (a + b + d) / 3;
  if (p1 <= 1e-30) return Math.max(a, b, d);
  const p2 = (a - q) * (a - q) + (b - q) * (b - q) + (d - q) * (d - q) + 2 * p1;
  const p = Math.sqrt(p2 / 6);
  if (!(p > 0)) return q;
  const inv = 1 / p;
  const B = [(a - q) * inv, (b - q) * inv, (d - q) * inv, e * inv, f * inv, g * inv];
  let r = det3(B) / 2;
  r = Math.max(-1, Math.min(1, r));
  const phi = Math.acos(r) / 3;
  return q + 2 * p * Math.cos(phi);
}

/** The paper's equation 6: Jn = 1 / (γ|Σs| + |Σg| + γ|λ1s| + |λ1g|). Zero when
 *  either region is too small to have a covariance. */
function energyOf(sky: Moments, ground: Moments): number {
  const cs = covOf(sky), cg = covOf(ground);
  if (!cs || !cg) return 0;
  const ds = Math.max(0, det3(cs)), dg = Math.max(0, det3(cg));
  const ls = Math.max(0, largestEigenvalue(cs)), lg = Math.max(0, largestEigenvalue(cg));
  const denom = SKY_ENERGY_GAMMA * ds + dg + SKY_ENERGY_GAMMA * ls + lg;
  return denom > 1e-30 ? 1 / denom : 0;
}

/** Invert a symmetric 3×3 held as [xx, yy, zz, xy, xz, yz], with a ridge on the
 *  diagonal so a degenerate cluster still yields a usable metric. Returns the
 *  inverse in the same packing, or null if it is singular even then. */
function invSym3(c: number[]): number[] | null {
  const tr = Math.abs(c[0]) + Math.abs(c[1]) + Math.abs(c[2]);
  const ridge = Math.max(1e-9, tr * 1e-3);
  const a = c[0] + ridge, b = c[1] + ridge, d = c[2] + ridge, e = c[3], f = c[4], g = c[5];
  const det = a * (b * d - g * g) - e * (e * d - g * f) + f * (e * g - b * f);
  if (!(Math.abs(det) > 1e-30)) return null;
  const i = 1 / det;
  return [
    (b * d - g * g) * i,
    (a * d - f * f) * i,
    (a * b - e * e) * i,
    (f * g - e * d) * i,
    (e * g - b * f) * i,
    (e * f - a * g) * i,
  ];
}

/** Squared Mahalanobis distance of (x,y,z) from mean `mu` under `inv`, a
 *  symmetric inverse covariance packed as [xx, yy, zz, xy, xz, yz]. */
function mahal2(
  x: number, y: number, z: number,
  mu: [number, number, number],
  inv: number[],
): number {
  const dx = x - mu[0], dy = y - mu[1], dz = z - mu[2];
  return (
    inv[0] * dx * dx + inv[1] * dy * dy + inv[2] * dz * dz +
    2 * (inv[3] * dx * dy + inv[4] * dx * dz + inv[5] * dy * dz)
  );
}

/**
 * Find the sky border position function for one photograph.
 * @param c0,c1,c2  the three channels the regions are described by, each
 *   `w*h` in the image-oriented grid and each already scaled into a comparable
 *   numeric range (see IR-SCIENCE.md §9o — Jn mixes a determinant with an
 *   eigenvalue and is therefore NOT scale-free, so the caller owns this).
 * @param g  gradient magnitude in the same grid; the sweep's thresholds are its
 *   own quantiles.
 * @param w,h  grid dimensions.
 * @param rotate  display rotation in 90° CW steps — which edge the sky is at.
 * @param margin  border texels to skip before looking for the first edge, so a
 *   dark demosaic rim cannot set the border at depth zero.
 * @returns the border and both post-processing verdicts (see `SkyHorizon`).
 * What the result must satisfy: `b[a] <= rows` for every column, and `share` is
 * the region above the border as a fraction of the frame — an UPPER BOUND on
 * what `buildSkyMask` seeds from, which drops a `margin`-wide rim at the
 * frame's edges as well. The caller counts its own seeds before deciding a
 * photograph has a sky; this number is for the walks, the probe and the status
 * line, and it must never be read as the seed count itself.
 */
export function skyHorizon(
  c0: Float32Array,
  c1: Float32Array,
  c2: Float32Array,
  g: Float32Array,
  w: number,
  h: number,
  rotate: number,
  margin: number,
): SkyHorizon {
  const { cols, rows, at } = skyAxes(w, h, rotate);
  const n = w * h;
  const lo = Math.min(margin, Math.max(0, rows - 1));

  // Thresholds: quantiles of this frame's own gradient magnitudes.
  const sorted = Float32Array.from(g).sort();
  const quant = (f: number) => sorted[Math.max(0, Math.min(n - 1, Math.floor(f * (n - 1))))];
  const ts = new Float64Array(SKY_T_STEPS);
  for (let k = 0; k < SKY_T_STEPS; k++) {
    const f = SKY_T_QUANTILE_LO + ((SKY_T_QUANTILE_HI - SKY_T_QUANTILE_LO) * k) / (SKY_T_STEPS - 1);
    ts[k] = quant(f);
  }

  // Total moments, fixed: ground = total - sky, so each pixel is visited once
  // for the whole sweep instead of once per threshold.
  const total = zeroMoments();
  for (let p = 0; p < n; p++) addMoment(total, c0[p], c1[p], c2[p]);

  const b = new Int32Array(cols);
  const sky = zeroMoments();
  for (let a = 0; a < cols; a++) {
    b[a] = lo;
    for (let d = 0; d < lo; d++) { const p = at(a, d); addMoment(sky, c0[p], c1[p], c2[p]); }
  }

  const ground = zeroMoments();
  const groundFrom = (s: Moments): Moments => {
    ground.n = total.n - s.n;
    for (let i = 0; i < 3; i++) ground.s[i] = total.s[i] - s.s[i];
    for (let i = 0; i < 6; i++) ground.q[i] = total.q[i] - s.q[i];
    return ground;
  };

  let best: Int32Array | null = null;
  let bestT = ts[0];
  let bestJ = 0;
  let bestK = -1;
  let lastK = -1;
  const sweepJ = new Float64Array(SKY_T_STEPS);
  const minBorder = rows * SKY_NO_SKY_AVE;
  let borderSum = cols * lo;
  // b(a) is monotone non-decreasing in t, so the sweep advances each column's
  // pointer rather than rescanning the column: O(w*h) for the whole search.
  //
  // A THRESHOLD WHOSE BORDER IS TOO SHALLOW TO BE A SKY IS NOT A CANDIDATE.
  // The paper applies its equation 15 bar — the border averages less than a
  // thirtieth of the depth, so there is no sky — AFTER the search, to the
  // winner. Applied only there it arrives too late: at the bottom of the sweep
  // every column stops at its first faint edge, the sky region is a few rows
  // of one colour, γ|Σs| vanishes and Jn settles at 1/(|Σ| + λ1) of the WHOLE
  // FRAME. That is a floor, not a hypothesis about where a sky ends, and a
  // photograph whose real sky is not uniform enough to beat it loses to it.
  // Measured 2026-09-20: NIR_1667 — two conifers, a wide sky, one big white
  // cloud in it — peaked honestly at the 108th sample and was beaten by 22% by
  // the floor at the very first, and came back "no clear sky found" with 55% of
  // the frame sky. NIR_1688 the same. The paper's own thresh_min of 5 rather
  // than 0 is the same guard, one step weaker.
  // So the bar is applied INSIDE the search, and `noSky` then means what it
  // ought to: no threshold anywhere in the sweep put a sky-sized region above
  // the border.
  for (let k = 0; k < SKY_T_STEPS; k++) {
    const t = ts[k];
    for (let a = 0; a < cols; a++) {
      let d = b[a];
      while (d < rows && g[at(a, d)] <= t) {
        const p = at(a, d);
        addMoment(sky, c0[p], c1[p], c2[p]);
        d++;
        borderSum++;
      }
      b[a] = d;
    }
    const j = energyOf(sky, groundFrom(sky));
    sweepJ[k] = j;
    if (borderSum / cols < minBorder) continue;
    lastK = k;
    if (j > bestJ) { bestJ = j; bestT = t; bestK = k; best = Int32Array.from(b); }
  }
  const bopt = best ?? b;

  // §2.3.1 — is any of this a sky at all?
  let sum = 0, jag = 0;
  for (let a = 0; a < cols; a++) sum += bopt[a];
  for (let a = 1; a < cols; a++) jag += Math.abs(bopt[a] - bopt[a - 1]);
  const borderAve = sum / cols;
  const asadsbp = cols > 1 ? jag / (cols - 1) : 0;
  const noSky = bestK < 0;
  const boundary = !noSky && bestK >= lastK - (SKY_BOUNDARY_K - 1);
  const jagged =
    borderAve < rows * SKY_NO_SKY_AVE_JAGGED && asadsbp > Math.max(2, rows * SKY_NO_SKY_JAGGED);

  // §2.3.2 — do some columns hold no sky at all?
  let rawShare = 0;
  {
    let above = 0;
    for (let a = 0; a < cols; a++) above += Math.max(0, bopt[a] - Math.min(margin, bopt[a]));
    rawShare = above / n;
  }
  // THE PAPER'S STEP GATE IS KEPT, AND IT WAS MEASURED BEFORE IT WAS. Running
  // the column refinement on every photograph looks safer than it is — the
  // ground test inside it is a real gate — and it costs the frame this work
  // exists for: NIR_1651 fell from 52.2% of the frame to 34.6%, half its sky
  // going with the columns (2026-09-20). A sky with a bright cloud deck in it
  // splits in two under k-means whatever the gate says afterwards, and on a
  // frame with no intruding object there is nothing to be gained by asking.
  // So the paper's equation 17 stands: run it only where the border STEPS.
  // What that misses is recorded rather than papered over. A tree TRUNK is
  // smooth down its length — the gradient across its edges is high and along
  // its interior is not — so a column down the middle of one carries the
  // border deep with no step from its neighbours to announce it, and NIR_1638
  // keeps a vertical band of selection down each trunk. 11.1% of that frame,
  // against 7.8% before this work and 37.1% at the worst point during it.
  let refined = false;
  let step = 0;
  for (let a = 1; a < cols; a++) step = Math.max(step, Math.abs(bopt[a] - bopt[a - 1]));
  if (!noSky && !boundary && step > rows * SKY_PARTIAL_STEP) {
    refined = refineColumns(bopt, c0, c1, c2, cols, rows, at);
  }

  const shareOf = (bb: Int32Array) => {
    let above = 0;
    for (let a = 0; a < cols; a++) above += Math.max(0, bb[a] - Math.min(margin, bb[a]));
    return above / n;
  };
  return {
    b: bopt, cols, rows, t: bestT, energy: bestJ, noSky, jagged, boundary, refined,
    partialStep: step,
    sweepT: ts, sweepJ, share: shareOf(bopt), shareRaw: rawShare,
  };
}

/** How close a cluster's mean may sit to the GROUND population before it is
 *  taken to be part of it. Squared Mahalanobis distance under the ground's own
 *  covariance; a three-dimensional Gaussian puts 95% of itself inside 7.81
 *  (the χ²₃ point), so a mean inside that is not distinguishable from ground.
 *  The reference implementation makes no such test — it always names one of the
 *  two clusters the fake sky and clears against it, which on a photograph whose
 *  sky is simply GRADED from horizon to zenith names half the real sky as
 *  ground. Measured 2026-09-20: wired that way it took hillside from 90% of the
 *  frame to 0.1%, NIR_1667 from 47.3% to 1.1% and cleared columns on 24 of 44
 *  practice frames. A two-cluster split always returns two clusters; something
 *  has to ask whether either of them is actually the ground. */
export const SKY_GROUND_CHI2 = 7.81;

/**
 * Clear the columns whose smooth top is a ground object rather than sky.
 * @param b  the border, modified IN PLACE — a cleared column becomes 0.
 * @param c0,c1,c2  the same three channels `skyHorizon` measured.
 * @param cols,rows,at  the display axes from `skyAxes`.
 * @returns true when at least one column was cleared.
 * What the result must satisfy: it only ever REMOVES sky, and it removes none
 * at all unless one of the two clusters above the border is statistically part
 * of the ground (SKY_GROUND_CHI2). Nothing here may raise a border: the border
 * above it was chosen by the energy optimum and this pass has no standing to
 * overrule that.
 */
function refineColumns(
  b: Int32Array,
  c0: Float32Array,
  c1: Float32Array,
  c2: Float32Array,
  cols: number,
  rows: number,
  at: (a: number, d: number) => number,
): boolean {
  const skyPx: number[] = [];
  const gm = zeroMoments();
  for (let a = 0; a < cols; a++) {
    for (let d = 0; d < rows; d++) {
      const p = at(a, d);
      if (d < b[a]) skyPx.push(p);
      else addMoment(gm, c0[p], c1[p], c2[p]);
    }
  }
  if (skyPx.length < MIN_REGION * 2) return false;
  const gcov = covOf(gm);
  if (!gcov) return false;
  const ginv = invSym3(gcov);
  if (!ginv) return false;
  const gmu: [number, number, number] = [gm.s[0] / gm.n, gm.s[1] / gm.n, gm.s[2] / gm.n];

  // Two clusters over the sky region. The initial centres are the 10th and 90th
  // percentile of the region's FIRST channel — deterministic on purpose, where
  // the reference implementation restarts from random centres: the same
  // photograph opened twice has to produce the same mask, and a building
  // intruding into a sky differs from it in luminance before it differs in
  // anything else.
  const key = Float64Array.from(skyPx, (p) => c0[p]);
  const ks = Float64Array.from(key).sort();
  let ca: [number, number, number] = [0, 0, 0], cb: [number, number, number] = [0, 0, 0];
  {
    const plo = skyPx[indexOfNearest(key, ks[Math.floor(ks.length * 0.1)])];
    const phi = skyPx[indexOfNearest(key, ks[Math.floor(ks.length * 0.9)])];
    ca = [c0[plo], c1[plo], c2[plo]];
    cb = [c0[phi], c1[phi], c2[phi]];
  }
  const label = new Uint8Array(skyPx.length);
  for (let it = 0; it < KMEANS_ITERS; it++) {
    let moved = 0;
    for (let i = 0; i < skyPx.length; i++) {
      const p = skyPx[i];
      const x = c0[p], y = c1[p], z = c2[p];
      const da = (x - ca[0]) ** 2 + (y - ca[1]) ** 2 + (z - ca[2]) ** 2;
      const db = (x - cb[0]) ** 2 + (y - cb[1]) ** 2 + (z - cb[2]) ** 2;
      const l = db < da ? 1 : 0;
      if (l !== label[i]) { label[i] = l; moved++; }
    }
    const ma = zeroMoments(), mb = zeroMoments();
    for (let i = 0; i < skyPx.length; i++) addMoment(label[i] ? mb : ma, c0[skyPx[i]], c1[skyPx[i]], c2[skyPx[i]]);
    if (!ma.n || !mb.n) return false;
    ca = [ma.s[0] / ma.n, ma.s[1] / ma.n, ma.s[2] / ma.n];
    cb = [mb.s[0] / mb.n, mb.s[1] / mb.n, mb.s[2] / mb.n];
    if (!moved) break;
  }

  // IS EITHER CLUSTER THE GROUND? Both distances are taken under the GROUND's
  // covariance — one metric, asked of both — rather than under each cluster's
  // own, which is what the reference does and what made this destructive. A
  // sky cluster's own covariance is tiny, so a Mahalanobis distance measured
  // under it is enormous for anything a little off it, and "is this pixel more
  // like the sky or the ground" came back "the ground" for real sky on every
  // frame with a gradient in it.
  const da = mahal2(ca[0], ca[1], ca[2], gmu, ginv);
  const db = mahal2(cb[0], cb[1], cb[2], gmu, ginv);
  if (Math.min(da, db) > SKY_GROUND_CHI2) return false; // both are sky — nothing to clear
  if (Math.max(da, db) <= SKY_GROUND_CHI2) return false; // both read as ground — the split says nothing
  const fake = da < db ? ca : cb;
  const real = da < db ? cb : ca;

  // A column goes when most of what sits above its border is nearer the ground
  // cluster than the sky one, in the plain geometry the split was made in.
  let cleared = false;
  for (let a = 0; a < cols; a++) {
    const top = b[a];
    if (top <= 0) continue;
    let bad = 0;
    for (let d = 0; d < top; d++) {
      const p = at(a, d);
      const x = c0[p], y = c1[p], z = c2[p];
      const df = (x - fake[0]) ** 2 + (y - fake[1]) ** 2 + (z - fake[2]) ** 2;
      const dr = (x - real[0]) ** 2 + (y - real[1]) ** 2 + (z - real[2]) ** 2;
      if (df < dr) bad++;
    }
    if (bad > top / 2) { b[a] = 0; cleared = true; }
  }
  return cleared;
}

/** Index of the entry in `a` closest to `v`. */
function indexOfNearest(a: Float64Array, v: number): number {
  let best = 0, bd = Infinity;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - v);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
