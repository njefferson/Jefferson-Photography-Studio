// Edge-preserving denoise (13x13 bilateral, colour on a 7x7 grid at stride 2) on LINEAR sensor data.
//
// Placement: this runs immediately after decode, BEFORE white balance, exposure
// and saturation. The GPU preview shader implements the same formula; keep the
// constants in sync (see gl.ts). What the position buys is NOT that the noise is
// "still small" (a per-channel gain scales signal, noise and a noise-scaled range
// alike). It buys a noise model that holds: in raw units every channel's noise
// is the same Poisson-Gaussian curve, variance a*y + b, because they share one
// sensor and one analogue gain (Foi et al. 2008; Liu et al. 2006, 3.1, "Note the
// linear dependence of the variance ... on the irradiance"). After the white
// balance gains each channel carries its own curve.
//
// THE EDGE GUIDE IS THE EQUAL-WEIGHT MEAN OF THE THREE CHANNELS, NOT REC.709
// LUMA (corrected 2026-10-01). Rec.709's weights belong to sRGB primaries; on
// unbalanced camera channels they made the guide whatever share of red the
// frame's balance happened to leave (26-35% on 4c-xvi's nine gray-world frames,
// 80% on the file the old comment was written from) and an edge carried by blue
// all but invisible. darktable's denoiseprofile runs after white balance with a
// guide weighted by 1/wb per channel, and its own comment says that is the same
// as equal thirds on the data before the gains, which is where this runs. So the
// result is what that reference computes, and the position no longer changes it.
//
// THE RANGE WEIGHT IS MEASURED IN NOISE UNITS, NOT RELATIVE TO BRIGHTNESS
// (2026-10-01). It used to be rel = dLuma / (lc + 0.02), which models noise whose
// spread is proportional to the signal; raw noise is Poisson-Gaussian, so one
// slider value was a growing multiple of the noise as brightness rose — at 0.45,
// 1.3x the noise at y = 0.03 and 3.3x at y = 0.5, on synthetic Poisson-Gaussian
// data through this function — and bright texture was smoothed away while dark
// grain was left. The guide now goes through the generalized Anscombe transform
// (darktable denoiseprofile.c precondition(): 2*sqrt(in/a + (b/a)^2 + 3/8)),
// written here as 2*sqrt(y + b/a) — the 3/8 term is 3a/8 in these units, under
// 1e-5 — whose noise is the same at every brightness, so a FIXED range sigma in
// that space is a fixed multiple of the local noise everywhere (Liu et al. 2006,
// 6.1, set the bilateral's range from the per-pixel noise level). Only the
// DISTANCE is taken there; the average itself stays linear, so no inverse
// transform, and none of its bias, is needed.

// THIRTEEN PIXELS ACROSS, DENSE, AND THE WIDTH IS THE WHOLE FIX.
//
// This was a 5x5 for most of the app's life, and a 5x5 cannot flatten structure
// three to five pixels across — 4c-xii made exactly that argument for the COLOUR
// half and widened it, and the luminance half was left behind. Tracing a sky
// from the photosite forward (IR-SCIENCE.md 4c-xxi, 4c-xxii) showed what that
// cost: the pale speckle people actually report is LUMINANCE mottle, a colour
// stage cannot touch it by construction, and the one filter that could was too
// narrow to see it.
//
// Measured on the reported frame's verified sky, with Colour noise at ZERO:
// radius 2 leaves 0.0313, radius 3 leaves 0.0259, radius 4 0.0165, radius 5
// 0.0109, radius 6 **0.0075** — a 76% reduction. The busiest block's own noise
// is unchanged across all of it (0.0873 to 0.0892), because the range weight is
// what protects an edge and widening the SPATIAL support does not weaken it.
// That held on that block and not on foliage: IR-SCIENCE 9i measured the oak
// canopy's fine texture at 34.11 under the 5x5 and 30.76 under this 13x13 (see
// the look's floor comment in main.ts). In a bilateral every tap within about
// one range sigma of the centre is averaged, so a wider window averages ALL
// structure below that sigma over more pixels; what protects texture below it
// is a range sigma that is a measured multiple of the noise, which is what the
// noise-unit range above is for (2026-10-01).
//
// DENSE, NOT STRIDED, and that is not a detail. The colour half spans the same
// thirteen pixels with 49 taps at stride two, which is affordable there because
// colour is low-frequency. Tried on LUMINANCE it raised the frame's
// high-frequency energy instead of lowering it — a sparse lattice samples a
// noise field periodically and periodic sampling of noise is itself a pattern,
// which is the same trap 4c-xii recorded when the colour half was first spaced
// three apart.
const R = 6; // 13x13 window
// Rec.709 weights, used ONLY where the colour mix below splits luminance from
// colour (unchanged by the 2026-10-01 guide change); the edge guide is `noiseGuide`.
const REC = [0.2126, 0.7152, 0.0722];

/** Spatial weights over the 13x13 grid, sigma 3 px, precomputed. */
const SPATIAL: number[] = [];
for (let dy = -R; dy <= R; dy++) {
  for (let dx = -R; dx <= R; dx++) {
    SPATIAL.push(Math.exp(-(dx * dx + dy * dy) / 18));
  }
}

/** THE RANGE WEIGHT AS A TABLE, because the window is 169 taps.
 *
 *  `exp(-t/2)` sampled in t = (rel/sigma)^2 from 0 to 36 (six sigma, past which
 *  the weight is under 2e-8 and the tap is dropped), READ BY LINEAR
 *  INTERPOLATION between entries. Until 2026-10-01 it was read by truncating
 *  the index, which is a staircase: up to 1.74e-2 off next to t = 0, always
 *  toward a larger weight, while the shader evaluates exp() exactly — so an
 *  export weighted neighbours up to 1.8% more than the preview did. Interpolated
 *  over 2048 steps the error is under 1e-5 (h^2/8 times the curve's largest
 *  second derivative, 1/4), which is float32 arithmetic's own scale on the GPU.
 *  The alternative is 169 calls to Math.exp for every pixel of a 21-megapixel
 *  export. Read only through `rangeWeight` below. */
const RANGE_N = 2048, RANGE_MAX = 36;
const RANGE_STEP = RANGE_N / RANGE_MAX;
const RANGE = new Float64Array(RANGE_N + 1);
for (let i = 0; i <= RANGE_N; i++) RANGE[i] = Math.exp(-(i / RANGE_STEP) / 2);

/** The range weight exp(-t/2) for t = (distance / sigma)^2.
 *
 *  Takes `t`, which must be finite and at least 0. Returns the weight, between 0
 *  and 1, within 1e-5 of Math.exp(-t / 2) for every t below 36 and exactly 0 at
 *  or above it (the true value there is under 2e-8). The bilateral below is its
 *  only caller, and the shader's exp() in gl.ts is what it has to agree with —
 *  a preview and an export of the same photograph weigh every tap the same. */
export function rangeWeight(t: number): number {
  if (t >= RANGE_MAX) return 0;
  const f = t * RANGE_STEP;
  const i = f | 0;
  const lo = RANGE[i];
  return lo + (RANGE[i + 1] - lo) * (f - i);
}

/** THE READ-NOISE KNEE OF THE NOISE MODEL, b/a in var = a*y + b.
 *
 *  Measured 2026-10-01 on the owner's six NEFs (the binned proxy the editor
 *  opens): in every brightness bin from y = 0.008 to 0.2 that held flat blocks,
 *  the equal-weight guide's variance was proportional to its level within the
 *  fit's scatter, and b/a came out between -2e-3 and +2e-3 — read noise is
 *  below what those frames can resolve. 5e-4 is inside that, small enough not
 *  to flatten the curve anywhere a photograph has detail, and it keeps the
 *  transform's slope finite at black. Mirrored as a literal in gl.ts. */
export const NOISE_KNEE = 5e-4;

/** The edge guide: the equal-weight mean of a camera-native linear pixel.
 *
 *  Takes the pixel's three channels `r`, `g` and `b`, camera-native and before
 *  white balance. Returns their mean.
 *  Equal thirds because the channels share one noise curve before the gains, and
 *  because darktable's post-balance guide (weights 1/wb) is exactly this on the
 *  pre-balance data (see the header). Consumed by the bilateral below, the
 *  shader's mirror in gl.ts, and `estimateDenoise` in main.ts, which measures
 *  the noise in the units the filter uses. */
export function noiseGuide(r: number, g: number, b: number): number {
  return (r + g + b) / 3;
}

/** THE GENERALIZED ANSCOMBE TRANSFORM of a guide value: 2*sqrt(y + knee).
 *
 *  Takes a guide value from `noiseGuide` (negative values are read as 0).
 *  Returns a number whose noise is the same at every brightness: for
 *  var(y) = a*y + b, var(2*sqrt(y + b/a)) is a. What the result must satisfy:
 *  the bilateral's range sigma is a fixed number in THESE units, so the range is
 *  the same multiple of the local noise in a shadow and a highlight; and
 *  `estimateDenoise` measures the frame's noise in these units so the at-open
 *  strength and the filter agree on what one unit is. */
export function stabilise(guide: number): number {
  return 2 * Math.sqrt((guide > 0 ? guide : 0) + NOISE_KNEE);
}

/** The slider's scale in stabilised units: sigma = RANGE_SCALE * s^2. Mirrored
 *  as a literal in gl.ts; calibrated in IR-SCIENCE 4c-xxv. */
export const RANGE_SCALE = 0.0335;
/** The slider's range sigma in stabilised (noise) units, for a 0..1 strength.
 *
 *  Takes the Noise reduction strength. Returns sigma = RANGE_SCALE * s^2, which
 *  is 0 at 0 and grows continuously. The shader computes the same with a
 *  literal (gl.ts); `estimateDenoise` inverts it to set the at-open strength.
 *
 *  QUADRATIC AND FLOORLESS on purpose, the shape the owner confirmed on device
 *  on 2026-07-12. A bilateral goes from "keeps the grain" to "smears detail"
 *  across a tiny band of sigma, so a linear slider put that whole band in the
 *  first pixel of travel; squaring spreads the gentle zone across the track. Any
 *  additive floor is just as bad in a different way: it made strength 0 -> 0.01
 *  a hard step (on a flat sky that's already heavy smoothing — "0 is none, the
 *  first step is more than enough"). Only the constant moved on 2026-10-01, with
 *  the units: it is set so a slider position smooths the owner's frames at
 *  mid-tone as hard as it did under the old relative range (IR-SCIENCE 4c-xxv). */
export function rangeSigma(strength: number): number {
  return RANGE_SCALE * strength * strength;
}

/** What the at-open strength aims the range sigma at, in multiples of the
 *  frame's measured noise. Calibrated 2026-10-01 so the opening render of the
 *  owner's frames leaves the mid-tone grain the 2026-07-12 calibration left
 *  (IR-SCIENCE 4c-xxv). */
export const AT_OPEN_RATIO = 1.06;

/** The median of |X1 - X2| for two independent N(0, s^2) samples, over s:
 *  0.6745 (the normal's median absolute value) times sqrt(2). Siril's FnNoise1
 *  and RawTherapee's MAD estimator rest on the same constant. */
const MEDIAN_ABS_DIFF = 0.6745 * Math.SQRT2;

/** AUTO NOISE REDUCTION: the strength a photograph opens with, from its own noise.
 *
 *  Takes `at`, camera-native linear RGB at an integer pixel of the working copy
 *  (before white balance and exposure, the units the filter runs in), and the
 *  copy's `width` and `height`. Returns a Noise reduction strength between 0 and
 *  0.6. Measures the noise of the STABILISED guide — the units the bilateral's
 *  range is in — as the median absolute difference of horizontal neighbours over
 *  the darkest 40% of a sampled grid, divided by 0.954 (the median of |X1 - X2|
 *  is 0.954 sigma, not the 1.35 sigma this said until 2026-10-01), then inverts
 *  `rangeSigma` so the range sigma is AT_OPEN_RATIO times that noise. Because the
 *  guide is stabilised, the same ratio holds at every brightness, so the darkest
 *  40% (where flat sky and shadow keep texture out of the median) stands for the
 *  whole frame. What the result must satisfy: the 2026-07-12 calibration — the
 *  default "barely clears the grain" and leaves the headroom above it for taste;
 *  and capped at 0.6 so detail always survives. `estimateDenoise` in main.ts is
 *  the caller, and the at-open ruling puts its result on the visible slider. */
export function measuredStrength(at: (x: number, y: number) => ArrayLike<number>, width: number, height: number): number {
  const step = Math.max(1, Math.floor(Math.min(width, height) / 200));
  const guideAt = (x: number, y: number) => {
    const p = at(x, y);
    return noiseGuide(p[0], p[1], p[2]);
  };
  const all: number[] = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) all.push(guideAt(x, y));
  }
  if (!all.length) return 0;
  all.sort((a, b) => a - b);
  const thr = all[Math.floor(all.length * 0.4)];
  const diffs: number[] = [];
  for (let y = 0; y < height - 1; y += step) {
    for (let x = 0; x < width - 1; x += step) {
      const ga = guideAt(x, y);
      const gb = guideAt(x + 1, y);
      if ((ga + gb) / 2 > thr) continue;
      diffs.push(Math.abs(stabilise(ga) - stabilise(gb)));
    }
  }
  if (!diffs.length) return 0;
  diffs.sort((a, b) => a - b);
  const noise = diffs[Math.floor(diffs.length / 2)] / MEDIAN_ABS_DIFF;
  const s = Math.sqrt((AT_OPEN_RATIO * noise) / RANGE_SCALE);
  return s < 0 ? 0 : s > 0.6 ? 0.6 : s;
}

/** MEDIAN OF NINE, and the reason there is a separate stage at all.
 *
 *  Takes nine values. Returns the fifth smallest, by a fixed network of
 *  min/max pairs rather than a sort — no branches, no allocation, and the same
 *  nineteen comparisons every time, which is what the fragment shader can also
 *  run (there is no sorting in GLSL). Consumed by `despeckleCentre` below.
 *
 *  WHY A MEDIAN AND NOT ANOTHER SMOOTHER. A bilateral's range weight is what
 *  preserves edges, and a single pixel unlike its neighbours IS an edge by that
 *  weight: its own weight stays at one while every neighbour's collapses, so the
 *  pixel keeps itself. **A bilateral preserves outliers by construction**, which
 *  is why salt-and-pepper noise is recorded in the literature as surviving
 *  bilateral filtering, and it is why neither the luminance half above nor the
 *  colour half below moved the pale pepper in a deep infrared sky at full
 *  strength. A median is a RANK statistic: it cannot be dragged by a value
 *  however extreme, which is the same arithmetic that makes a mean vulnerable to
 *  one. See IR-SCIENCE.md 4c-ix. */
function median9(v: Float64Array): number {
  // THE STANDARD NETWORK, WRITTEN OUT RATHER THAN DERIVED. Nineteen compare-and-
  // swap pairs that leave the median at index 4 — the arrangement is not
  // something to invent, and a hand-rolled one that is wrong is wrong on a
  // minority of pixels and looks fine. The same order is used in the shader,
  // where there is no sorting at all.
  const s2 = (a: number, b: number) => {
    if (v[b] < v[a]) { const t = v[a]; v[a] = v[b]; v[b] = t; }
  };
  s2(1, 2); s2(4, 5); s2(7, 8);
  s2(0, 1); s2(3, 4); s2(6, 7);
  s2(1, 2); s2(4, 5); s2(7, 8);
  s2(0, 3); s2(5, 8); s2(4, 7);
  s2(3, 6); s2(1, 4); s2(2, 5);
  s2(4, 7); s2(4, 2); s2(6, 4);
  s2(4, 2);
  return v[4];
}

/** A linear-RGB sample at an integer source pixel.
 *
 *  THE RETURNED ARRAY MAY BE REUSED BY THE NEXT CALL, and every caller here
 *  reads it immediately — destructured, copied into a row, or accumulated. An
 *  export of a 21-megapixel raw makes one of these calls per output pixel and
 *  another per source pixel, so a fresh three-element array per call is tens of
 *  millions of them for one photograph. Hold what you need, not the array. */
export type LinearSampler = (x: number, y: number) => ArrayLike<number>;

/**
 * Wraps a linear-RGB sampler with bilateral denoising. Rows are cached in a
 * small ring, so scanning exports stay close to 1x decode cost.
 *
 * THE CONTRACT. Takes `sample`, camera-native linear RGB at an integer pixel
 * (before white balance and exposure); the image's `width` and `height`;
 * `strength`, the Noise reduction slider (0..1, the range sigma through
 * `rangeSigma`); `step`, how many of these pixels one preview proxy texel spans
 * (1 when this IS the proxy), which spreads every tap so the footprint is the
 * one the reader previewed; `chroma`, how far colour is mixed toward the
 * prefiltered 13-pixel colour mean; and `despeckle`, the decision-based median
 * on the centre pixel. Returns a sampler with the same calling convention whose
 * array may be reused by the next call; with all three amounts at 0 it returns
 * `sample` itself. What the result must satisfy: it equals, to float32
 * precision, what the shader's denoise block in gl.ts computes at the same
 * texel with the same tap scale (`step`) — export.ts's computed export and the
 * live preview depend on it (tested by a headless parity harness); and
 * `chroma` 0 returns exactly the bilateral mean.
 *
 * A ROW IS FILLED WHERE IT IS READ, NOT ACROSS THE WHOLE IMAGE. It used to be
 * filled eagerly: the first tap anywhere on a source row sampled all `width`
 * pixels of it. That is exactly right for a scan that walks the source
 * top-to-bottom, which is what an export does with no straighten angle — and it
 * is catastrophic the moment the scan walks a SLANT.
 *
 * Under a straighten of a few degrees, consecutive output pixels move down the
 * source by sin(angle), so the source row changes every handful of pixels and
 * the ring evicts constantly. Each miss then paid a full image width of demosaic
 * work for the three or four pixels actually wanted.
 *
 * MEASURED, on a 6000x4000 source with denoise on, over the same 80,000 output
 * pixels: 306,000 source samples with no straighten against 36,480,000 at four
 * degrees. **119x the work for the same picture**, or 456 samples per output
 * pixel against 3.8 — which extrapolates to eleven billion samples for a full
 * frame against ninety million, and is why exporting a straightened photograph
 * took minutes longer than the same photograph untouched.
 *
 * Filling on demand makes the cost proportional to the pixels actually touched,
 * which is what a cache is for. The values are unchanged: the same sampler is
 * called for the same coordinates, so the output is bit-identical either way,
 * which the harness asserts rather than assumes.
 *
 * A GENERATION COUNTER RATHER THAN CLEARING THE FLAGS. Reusing a ring slot has
 * to forget what the old row had filled, and a fill of `width` bytes per miss
 * puts most of the thrashing cost straight back — 545 misses per output row on
 * the measured case. Each slot carries a generation instead, bumped on reuse, so
 * forgetting is one integer write.
 */
export function makeRowDenoiser(
  sample: LinearSampler,
  width: number,
  height: number,
  strength: number,
  step = 1,
  chroma = 0,
  despeckle = 0,
): LinearSampler {
  if (strength <= 0 && chroma <= 0 && despeckle <= 0) return sample;
  // WITH THE LUMINANCE HALF OFF THE BILATERAL IS SKIPPED, NOT FLOORED. It used
  // to run at sigma 1e-6, on the argument that every tap but the centre then
  // falls past the table's end. Not every one does: a neighbour whose guide
  // happens to land within a few millionths of the centre's keeps a real weight.
  // In the stabilised units (noise about 3e-3) that moved 11-12% of the pixels
  // of NIR_1688 and NIR_2920 with the luminance half "off", and float32 on the
  // GPU blended a different amount than the CPU's doubles. A branch OUTSIDE the
  // 169-tap loop costs nothing and is exact.
  const lumaOn = strength > 0;
  const sigma = lumaOn ? rangeSigma(strength) : 1;
  const invS2 = 1 / (sigma * sigma);

  // Preview runs this bilateral on a downscaled proxy, tapping in proxy texels
  // (see gl.ts). At native resolution one proxy texel spans `step` pixels, so
  // tap the same 13x13 grid `step` pixels apart to match the previewed footprint;
  // the SPATIAL weights are in tap-index units and stay identical. step === 1
  // keeps the sampling byte-identical.
  const tapOff = new Int32Array(R * 2 + 1);
  for (let d = -R; d <= R; d++) tapOff[d + R] = Math.round(d * step);
  // THE COLOUR HALF SAMPLES WIDER, AND THE WIDTH IS THE WHOLE POINT OF IT.
  //
  // The first version of the chroma mix reused the bilateral's own 5x5 because
  // that cost nothing — and it reached nothing either. The mottle in a deep
  // infrared sky is structured at three to five pixels, so a window five wide is
  // trying to flatten something that nearly fills it, and at full strength it
  // left that sky visibly unchanged (IR-SCIENCE.md 4c-xi). 4c-vi had asked for a
  // spatial chroma operation and this was not one.
  //
  // SEVEN BY SEVEN AT STRIDE TWO, and the stride is where the first attempt went
  // wrong. A 5x5 spaced THREE apart spans the same thirteen pixels for half the
  // taps, and it was tried: it removed the mottle and left a fine regular
  // cross-hatch in its place, because a sparse lattice with three-pixel gaps
  // samples a noise field periodically and periodic sampling of noise IS a
  // pattern. Visible in the picture at full strength and invisible in every
  // number the sheet reports, which is the reason the pictures are the test.
  //
  // AND EVERY TAP IS PREFILTERED BY A DENSE [1 2 1] x [1 2 1] (2026-10-01). On its
  // own a kernel supported only on even offsets has a response of exactly 1 at
  // (0.5, 0), (0, 0.5) and (0.5, 0.5) cycles per pixel, so stride two had moved
  // the stride-three pattern to the pixel Nyquist rather than removed it: period-2
  // chroma noise passed untouched, and on white noise it left 1.9x the residual of
  // a dense Gaussian over the same span, three quarters of it in those bands. An
  // a-trous cascade never meets this, because each dilated kernel only ever sees
  // the previous scale's lowpassed output (darktable eaw.c, eaw_dn_decompose);
  // the [1 2 1] is that previous scale, and its response is zero at exactly the
  // three frequencies the stride passes.
  //
  // COMPUTED AS THE ONE DENSE KERNEL THE CASCADE IS. The 7-tap stride-2 Gaussian
  // convolved with [1 2 1]/4 is a 15-tap kernel per axis, `CK` below: an even
  // offset 2d carries half of w(d), an odd one a quarter of each neighbour. It is
  // separable, so each source row's horizontal sum is cached per column (`hc`)
  // and an output pixel combines one per kernel row (fifteen at `step` 1) —
  // cheaper than 49 taps that each prefilter, and the same sum the shader runs
  // as a 15x15 loop.
  //
  // `step` rides along for the same reason the luminance taps carry it: the
  // preview runs on a downscaled proxy, so the export has to spread its taps by
  // the same factor to smooth the same footprint of the photograph. Tap n sits
  // round(n * step) away, which is where the shader puts it too.
  //
  // AND SPREAD TAPS ARE A STRIDE AGAIN, SO THE NATIVE FIELD IS PREFILTERED TOO.
  // At `step` 2 — every raw export — the fifteen taps land on even native
  // offsets only, and a kernel on even offsets passes the native pixel Nyquist
  // at exactly 1: the defect above, moved to the export. The preview never shows
  // that band, because its proxy was binned or downscaled first; the export has
  // to remove it itself. Each tap is therefore a TENT of half-width `step` over
  // the native pixels around it (1 - |j| / step, normalised): [1 2 1] / 4 at
  // `step` 2, which is the a-trous cascade's own first scale under the [1 2 1]
  // at proxy spacing that CK already carries, and the identity at `step` 1, so
  // the preview's kernel and a 1:1 export are unchanged and nothing jumps as a
  // source crosses the proxy size. A tent of half-width s is zero at every
  // multiple of 1/s cycles per pixel, which are the frequencies a lattice of
  // spacing s passes (2026-10-01).
  const CR = 3;
  const CN = CR * 2 + 1; // 7 coarse taps per axis, two apart
  const w1 = (d: number) => (d >= -CR && d <= CR ? Math.exp(-(d * d) / 8) : 0);
  // Sigma two in COARSE-TAP units, so the falloff matches the wider grid rather
  // than being the luminance kernel's shape stretched over it.
  const ckAt = (n: number) => (n % 2 === 0 ? 0.5 * w1(n / 2) : 0.25 * (w1((n - 1) / 2) + w1((n + 1) / 2)));
  const TJ = Math.ceil(step) - 1; // the tent's reach in native pixels
  const tentAt = (j: number) => Math.max(0, 1 - Math.abs(j) / step);
  let tentSum = 0;
  for (let j = -TJ; j <= TJ; j++) tentSum += tentAt(j);
  const kLo = Math.round(-CN * step) - TJ;
  const kAcc = new Float64Array(Math.round(CN * step) + TJ - kLo + 1);
  for (let n = -CN; n <= CN; n++) {
    const c = Math.round(n * step) - kLo;
    const k = ckAt(n);
    for (let j = -TJ; j <= TJ; j++) kAcc[c + j] += (k * tentAt(j)) / tentSum;
  }
  // The one separable kernel, per axis, over native offsets: 15 taps at `step`
  // 1, 31 at 2.
  const offs: number[] = [];
  const wts: number[] = [];
  for (let i = 0; i < kAcc.length; i++) if (kAcc[i] > 0) { offs.push(i + kLo); wts.push(kAcc[i]); }
  const CKN = offs.length;
  const CK = Float64Array.from(wts);
  const colOff = Int32Array.from(offs);
  let ckSum = 0;
  for (let i = 0; i < CKN; i++) ckSum += CK[i];
  const colourWeight = ckSum * ckSum; // the 2-D kernel's total, for the mean
  const widest = chroma > 0 ? Math.max(colOff[CKN - 1], -colOff[0], tapOff[R * 2]) : tapOff[R * 2];
  const rowSpan = widest * 2 + 4;

  interface Row {
    y: number;
    v: Float32Array;
    /** THE TAP'S STABILISED GUIDE, cached beside it. Every pixel asks 169 taps
     *  for it, and each of those taps is asked by 169 pixels — so computing it
     *  per tap would repeat the same mean and square root 169 times for every
     *  source pixel in the frame (the luma it replaced measured 8.1 seconds of a
     *  20.9-megapixel export that way). A double array, so the value is the one
     *  `stabilise` returns. */
    l: Float64Array;
    /** Which generation filled each pixel. Equal to `gen` means present. */
    seen: Int32Array;
    /** The colour mean's HORIZONTAL half at each column: the `CK` sum
     *  along this row around that column, its reads clamped to the row. Filled
     *  on demand like `v`. */
    hc: Float32Array;
    hcSeen: Int32Array;
    gen: number;
  }
  const ring: Row[] = [];
  // WHICH RING SLOT HOLDS EACH SOURCE ROW, as a plain array indexed by row
  // (-1 = not resident), not a Map: every output pixel resolves over 28 rows
  // when the colour half is on, and a Map lookup per row measured as most of the colour
  // half's cost on a 5-megapixel frame.
  const slotOf = new Int32Array(height).fill(-1);
  let nextSlot = 0;
  const getRow = (y: number): Row => {
    const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
    const hit = slotOf[cy];
    if (hit >= 0) return ring[hit];
    let row: Row;
    let slot: number;
    if (ring.length < rowSpan) {
      row = {
        y: cy, v: new Float32Array(width * 3), l: new Float64Array(width), seen: new Int32Array(width),
        hc: new Float32Array(chroma > 0 ? width * 3 : 0), hcSeen: new Int32Array(chroma > 0 ? width : 0), gen: 1,
      };
      slot = ring.length;
      ring.push(row);
    } else {
      // Oldest slot, round-robin — the same eviction order the Map had, and the
      // right one for a scan that drifts in one direction.
      slot = nextSlot;
      row = ring[slot];
      nextSlot = (nextSlot + 1) % rowSpan;
      slotOf[row.y] = -1;
      row.y = cy;
      row.gen++;
    }
    slotOf[cy] = slot;
    return row;
  };
  /** The pixel at x on this row, sampled now if this generation has not. */
  const at = (row: Row, x: number): number => {
    const o = x * 3;
    if (row.seen[x] !== row.gen) {
      const s = sample(x, row.y);
      row.v[o] = s[0];
      row.v[o + 1] = s[1];
      row.v[o + 2] = s[2];
      // From the STORED floats, so the value is the one every reader of the
      // row sees.
      row.l[x] = stabilise(noiseGuide(row.v[o], row.v[o + 1], row.v[o + 2]));
      row.seen[x] = row.gen;
    }
    return o;
  };
  /** Offset into `row.hc` of the horizontal colour sum at column `x` (inside
   *  the image), computed now if this generation has not. Each read clamps its
   *  own column, the way the shader's CLAMP_TO_EDGE fetch does, so the edge
   *  pixel is repeated outward and the two agree at the border. */
  const hcAt = (row: Row, x: number): number => {
    const o = x * 3;
    if (row.hcSeen[x] !== row.gen) {
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < CKN; i++) {
        let sx = x + colOff[i];
        if (sx < 0) sx = 0;
        else if (sx >= width) sx = width - 1;
        const so = at(row, sx);
        const w = CK[i];
        r += row.v[so] * w;
        g += row.v[so + 1] * w;
        b += row.v[so + 2] * w;
      }
      row.hc[o] = r;
      row.hc[o + 1] = g;
      row.hc[o + 2] = b;
      row.hcSeen[x] = row.gen;
    }
    return o;
  };

  // One array for the life of this sampler — see LinearSampler on why.
  const scratch: [number, number, number] = [0, 0, 0];
  // The centre pixel's three channels, after the despeckle decision. Held for
  // the life of the sampler so the decision does not allocate per pixel.
  const mid: [number, number, number] = [0, 0, 0];
  const win = new Float64Array(9);
  return (x, y) => {
    const cRow = getRow(y);
    const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
    const co = at(cRow, cx);
    mid[0] = cRow.v[co]; mid[1] = cRow.v[co + 1]; mid[2] = cRow.v[co + 2];
    // Everything this pixel needs from `cRow`, read NOW: any later getRow may
    // recycle its ring slot for another row, and a held reference would then
    // read that row's pixels. (Until 2026-10-01 the bilateral compared rows to
    // `cRow` to find its centre tap, and a straightened export's pixels came out
    // differing with the order they were asked for in.)
    const centreGuide = cRow.l[cx];
    // DESPECKLE THE CENTRE FIRST, BEFORE ANYTHING READS IT — and the order is
    // the whole point rather than a tidiness. `lc` below is the centre's luma
    // and every neighbour's weight is measured against it, so a centre that is
    // an impulse makes every neighbour look wrong and collapses the bilateral
    // onto the very pixel that should have gone. Correcting it here fixes the
    // dot for the one output pixel it IS the centre of, which is every dot.
    //
    // A DECISION, NOT A FILTER. The literature's decision-based median switches
    // between the identity and the median per pixel rather than medianing
    // everything, because a plain median eats fine detail wherever there is no
    // impulse to remove. Two tests have to agree before a pixel is touched: it
    // is the extreme of its own 3x3, and it sits further from that window's
    // median than the threshold allows. Detail is a run of pixels, and a run is
    // not the extreme of its own neighbourhood.
    //
    // PER CHANNEL, because the noise is per channel: an infrared conversion
    // starves one photosite, so in a deep sky that channel is recording almost
    // nothing and its shot noise is what lands as a pale dot. Restoring that
    // channel to its local median is the correction; leaving the other two
    // alone is what keeps the pixel's own colour.
    if (despeckle > 0) {
      // THE THRESHOLD, AND ITS RANGE IS MEASURED RATHER THAN CHOSEN. A pixel
      // that IS the extreme of its own window can be at most (hi - lo) from
      // that window's median, so any k at or above 1 is a slider position that
      // can never fire — the first mapping here was 0.25/s², which put
      // everything below strength 0.5 in exactly that dead zone and read as the
      // whole stage doing nothing. Linear from 0.47 down to 0.02 keeps the
      // whole travel live. Relative to the window's own spread, so it means the
      // same thing in a dark sky and a bright one.
      const k = 0.45 * (1 - despeckle) + 0.02;
      for (let ch = 0; ch < 3; ch++) {
        let n = 0, lo = Infinity, hi = -Infinity;
        for (let dy = -1; dy <= 1; dy++) {
          const row = getRow(y + tapOff[dy + R]);
          for (let dx = -1; dx <= 1; dx++) {
            let sx = cx + tapOff[dx + R];
            if (sx < 0) sx = 0;
            else if (sx >= width) sx = width - 1;
            const v = row.v[at(row, sx) + ch];
            win[n++] = v;
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
        }
        const c = mid[ch];
        const med = median9(win); // sorts `win` in place; nothing below reads it
        // Extreme of its own window, and far enough from that window's middle.
        if ((c <= lo || c >= hi) && Math.abs(c - med) > k * (hi - lo)) mid[ch] = med;
      }
    }
    // NEVER WRITTEN BACK INTO THE ROW CACHE, and that is deliberate. A corrected
    // pixel stored there would be read as a NEIGHBOUR by the next output pixel,
    // making the filter recursive and its result dependent on which rows happen
    // to be resident — the cache is an optimisation and may re-sample a row at
    // any time, so the same photograph would render differently depending on the
    // scan order. The correction belongs to the pixel being written and to
    // nothing else.
    // The centre's stabilised guide (see `stabilise`): every tap's distance is
    // measured from it in noise units.
    const lc = despeckle > 0
      ? stabilise(noiseGuide(mid[0], mid[1], mid[2]))
      : centreGuide;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let wsum = 0;
    let gr = 0;
    let gg = 0;
    let gb = 0;
    let gsum = 0;
    let k = 0;
    if (!lumaOn) {
      // Luminance left alone: the centre as despeckle left it (`mid` is the
      // centre itself when despeckle is off), as the shader does.
      sr = mid[0]; sg = mid[1]; sb = mid[2]; wsum = 1;
    }
    for (let dy = -R; dy <= R && lumaOn; dy++) {
      const row = getRow(y + tapOff[dy + R]);
      for (let dx = -R; dx <= R; dx++, k++) {
        let sx = cx + tapOff[dx + R];
        if (sx < 0) sx = 0;
        else if (sx >= width) sx = width - 1;
        const so = at(row, sx);
        // The centre tap is the corrected pixel, for the same reason `lc` is.
        // Only the centre TAP: at the frame's edge other taps clamp onto the
        // centre pixel too, and those read it as it arrived, as the shader's
        // clamped fetches do (they matched it to the corrected value until
        // 2026-10-01, and the two paths differed on every border pixel the
        // despeckle touched).
        const isC = despeckle > 0 && dx === 0 && dy === 0;
        const r = isC ? mid[0] : row.v[so];
        const g = isC ? mid[1] : row.v[so + 1];
        const b = isC ? mid[2] : row.v[so + 2];
        const ls = isC ? lc : row.l[sx];
        const rel = ls - lc;                       // in noise units
        const t = rel * rel * invS2;               // (rel/sigma)^2
        if (t >= RANGE_MAX) continue;              // weight under 2e-8: drop it
        const w = SPATIAL[k] * rangeWeight(t);
        sr += r * w;
        sg += g * w;
        sb += b * w;
        wsum += w;
      }
    }
    // THE COLOUR MEAN, ON ITS OWN WIDER GRID. Spatial weights only and no range
    // term at all — the stride-2 Gaussian over a thirteen-pixel span, its taps
    // prefiltered, as one dense separable kernel (see `CK` above): one cached
    // row sum per kernel row. This is what the colour half is mixed toward
    // below, and it is skipped entirely when the colour half is off. Each row
    // is fetched and read at once, never held across another fetch, because a
    // fetch may recycle the ring slot a held row lives in.
    if (chroma > 0) {
      for (let i = 0; i < CKN; i++) {
        const row = getRow(y + colOff[i]);
        const o = hcAt(row, cx);
        const w = CK[i];
        gr += row.hc[o] * w;
        gg += row.hc[o + 1] * w;
        gb += row.hc[o + 2] * w;
      }
      gsum = colourWeight;
    }
    // LUMINANCE FROM THE EDGE-PRESERVING MEAN, COLOUR FROM THE PLAIN ONE.
    //
    // The two are separated because they are not the same problem, which the
    // field settled long before this app existed (IR-SCIENCE.md 4c-viii): colour
    // blotches carry almost no real information, so they can be smoothed hard,
    // while luminance speckle overlaps genuine texture in foliage and needs a
    // light hand. Darktable's recipe is the same idea spelled differently — two
    // lowpass instances blending on the Lab a and b channels and leaving L.
    //
    // WHAT IT MEASURED HERE. Aerochrome multiplies colour by three on top of a
    // mixer with coefficients over 1.4, and this pipeline had no chroma stage at
    // all, so the amplification landed on chroma noise nothing had removed: a
    // 1:1 crop showed the sky peppered with speckle that the existing bilateral
    // at FULL strength did not touch.
    //
    // `chroma` 0 IS BIT-IDENTICAL TO WHAT THIS RETURNED BEFORE, and that is the
    // point of mixing from the bilateral's own chroma rather than from the
    // centre pixel's: at 0 the two halves recombine into exactly `sum / wsum`.
    const mr = sr / wsum, mg = sg / wsum, mb = sb / wsum;
    if (chroma <= 0) {
      scratch[0] = mr; scratch[1] = mg; scratch[2] = mb;
      return scratch;
    }
    const lm = REC[0] * mr + REC[1] * mg + REC[2] * mb;
    const br = gr / gsum, bg = gg / gsum, bb = gb / gsum;
    const lb = REC[0] * br + REC[1] * bg + REC[2] * bb;
    scratch[0] = lm + (mr - lm) + ((br - lb) - (mr - lm)) * chroma;
    scratch[1] = lm + (mg - lm) + ((bg - lb) - (mg - lm)) * chroma;
    scratch[2] = lm + (mb - lm) + ((bb - lb) - (mb - lm)) * chroma;
    return scratch;
  };
}
