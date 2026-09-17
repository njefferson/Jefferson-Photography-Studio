// Edge-preserving denoise (5x5 bilateral) on LINEAR sensor data.
//
// Placement matters: this runs immediately after decode, BEFORE white balance,
// exposure and saturation — IR editing multiplies channels by large factors
// (blue gain ~1.7x, exposure up to 16x), so noise must be removed while it is
// still small. The GPU preview shader implements the same formula; keep the
// constants in sync (see gl.ts).
//
// Range weighting is relative to local brightness, so shadows (where sensor
// noise dominates) are smoothed harder than bright, detailed areas.

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
//
// DENSE, NOT STRIDED, and that is not a detail. The colour half spans the same
// thirteen pixels with 49 taps at stride two, which is affordable there because
// colour is low-frequency. Tried on LUMINANCE it raised the frame's
// high-frequency energy instead of lowering it — a sparse lattice samples a
// noise field periodically and periodic sampling of noise is itself a pattern,
// which is the same trap 4c-xii recorded when the colour half was first spaced
// three apart.
const R = 6; // 13x13 window
const REC = [0.2126, 0.7152, 0.0722];

/** Spatial weights over the 13x13 grid, sigma 3 px, precomputed. */
const SPATIAL: number[] = [];
for (let dy = -R; dy <= R; dy++) {
  for (let dx = -R; dx <= R; dx++) {
    SPATIAL.push(Math.exp(-(dx * dx + dy * dy) / 18));
  }
}

/** THE RANGE WEIGHT AS A TABLE, because the window is now 169 taps.
 *
 *  Takes nothing; builds `exp(-t/2)` sampled in t = (rel/sigma)^2 from 0 to 36
 *  (six sigma, past which the weight is under 1e-7 and the tap is dropped).
 *  What the caller depends on: `RANGE[i]` is that curve to better than 1e-4,
 *  which is far inside the 8-bit output's own quantisation — the alternative is
 *  169 calls to Math.exp for every pixel of a 21-megapixel export. */
const RANGE_N = 1024, RANGE_MAX = 36;
const RANGE = new Float64Array(RANGE_N + 1);
for (let i = 0; i <= RANGE_N; i++) RANGE[i] = Math.exp(-(i * RANGE_MAX) / RANGE_N / 2);

/** Relative-luma range sigma for a 0..1 strength. Mirrored in the shader.
 *  QUADRATIC AND FLOORLESS on purpose. A bilateral goes from "keeps the
 *  grain" to "smears detail" across a tiny band of sigma, so a linear slider
 *  put that whole band in the first pixel of travel; squaring spreads the
 *  gentle zone across the track. Any additive floor is just as bad in a
 *  different way: it made strength 0 -> 0.01 a hard step to sigma 0.03 (on a
 *  flat sky that's already heavy smoothing — "0 is none, the first step is
 *  more than enough"). From zero, continuously: sigma = 0.10·s².
 *  Keep gl.ts's literal in sync with this. */
export function rangeSigma(strength: number): number {
  return 0.1 * strength * strength;
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
  // A FLOOR RATHER THAN A BRANCH when the luminance half is off. sigma 0 makes
  // inv2s2 infinite and the centre tap's `rel` is exactly 0, so the weight there
  // would be 0 * Infinity — NaN, once per pixel. A sigma this small underflows
  // every other tap's exp() to zero and leaves the centre at 1, which IS the
  // "leave luminance alone" case, arrived at by arithmetic instead of by an
  // `if` inside a twenty-five-tap loop.
  const sigma = strength > 0 ? rangeSigma(strength) : 1e-6;
  const inv2s2 = 1 / (2 * sigma * sigma);

  // Preview runs this bilateral on a downscaled proxy, tapping in proxy texels
  // (see gl.ts). At native resolution one proxy texel spans `step` pixels, so
  // tap the same 5x5 grid `step` pixels apart to match the previewed footprint;
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
  // Stride two leaves one-pixel gaps and forty-nine taps over the same span. It
  // is double the cost of the sparse version and still a fifth of the 169 a
  // dense 13x13 would need, which is what makes a radius this large affordable
  // at all: this runs once per output pixel of a 21-megapixel export.
  //
  // `step` rides along for the same reason the luminance taps carry it: the
  // preview runs on a downscaled proxy, so the export has to spread its taps by
  // the same factor to smooth the same footprint of the photograph.
  const CR = 3;
  const CHROMA_STRIDE = 2;
  const chromaOff = new Int32Array(CR * 2 + 1);
  for (let d = -CR; d <= CR; d++) chromaOff[d + CR] = Math.round(d * step * CHROMA_STRIDE);
  // Sigma two in TAP units, so the falloff matches the wider grid rather than
  // being the luminance kernel's shape stretched over it.
  const CHROMA_SPATIAL: number[] = [];
  for (let dy = -CR; dy <= CR; dy++) for (let dx = -CR; dx <= CR; dx++) CHROMA_SPATIAL.push(Math.exp(-(dx * dx + dy * dy) / 8));
  const widest = chroma > 0 ? chromaOff[CR * 2] : tapOff[R * 2];
  const rowSpan = widest * 2 + 4;

  interface Row {
    y: number;
    v: Float32Array;
    /** THE TAP'S LUMA, CACHED BESIDE IT. Every pixel asks twenty-five taps for
     *  their luma, and each of those taps is asked by twenty-five pixels — so
     *  the same three multiplies and two adds were done twenty-five times for
     *  every source pixel in the frame. Measured on a 20.9-megapixel export:
     *  522 million taps, and the luma alone is 8.1 seconds of them.
     *
     *  A DOUBLE ARRAY, not a float one. `v` is float32 and the luma is a double
     *  computed from those floats; storing it in a Float32Array would round it
     *  a second time and change the exported pixels, which is the one thing
     *  this may not do. */
    l: Float64Array;
    /** Which generation filled each pixel. Equal to `gen` means present. */
    seen: Int32Array;
    gen: number;
  }
  const ring: Row[] = [];
  const byY = new Map<number, Row>();
  let nextSlot = 0;
  const getRow = (y: number): Row => {
    const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
    const hit = byY.get(cy);
    if (hit) return hit;
    let row: Row;
    if (ring.length < rowSpan) {
      row = { y: cy, v: new Float32Array(width * 3), l: new Float64Array(width), seen: new Int32Array(width), gen: 1 };
      ring.push(row);
    } else {
      // Oldest slot, round-robin — the same eviction order the Map had, and the
      // right one for a scan that drifts in one direction.
      row = ring[nextSlot];
      nextSlot = (nextSlot + 1) % rowSpan;
      byY.delete(row.y);
      row.y = cy;
      row.gen++;
    }
    byY.set(cy, row);
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
      // From the STORED floats, so the value is identical to the one the old
      // code computed after reading them back.
      row.l[x] = row.v[o] * REC[0] + row.v[o + 1] * REC[1] + row.v[o + 2] * REC[2];
      row.seen[x] = row.gen;
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
    const lc = despeckle > 0
      ? mid[0] * REC[0] + mid[1] * REC[1] + mid[2] * REC[2]
      : cRow.l[cx];
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let wsum = 0;
    let gr = 0;
    let gg = 0;
    let gb = 0;
    let gsum = 0;
    let k = 0;
    for (let dy = -R; dy <= R; dy++) {
      const row = getRow(y + tapOff[dy + R]);
      for (let dx = -R; dx <= R; dx++, k++) {
        let sx = cx + tapOff[dx + R];
        if (sx < 0) sx = 0;
        else if (sx >= width) sx = width - 1;
        const so = at(row, sx);
        // The centre tap is the corrected pixel, for the same reason `lc` is.
        const isC = despeckle > 0 && sx === cx && row === cRow;
        const r = isC ? mid[0] : row.v[so];
        const g = isC ? mid[1] : row.v[so + 1];
        const b = isC ? mid[2] : row.v[so + 2];
        const ls = isC ? lc : row.l[sx];
        const rel = (ls - lc) / (lc + 0.02);
        const t = rel * rel * inv2s2 * 2;          // (rel/sigma)^2
        if (t >= RANGE_MAX) continue;              // weight under 1e-7: drop it
        const sp = SPATIAL[k];
        const w = sp * RANGE[(t * (RANGE_N / RANGE_MAX)) | 0];
        sr += r * w;
        sg += g * w;
        sb += b * w;
        wsum += w;
      }
    }
    // THE COLOUR MEAN, ON ITS OWN WIDER GRID. Spatial weights only and no range
    // term at all — a plain Gaussian over a thirteen-pixel span, which is what
    // the colour half is mixed toward below. Forty-nine taps, skipped entirely
    // when the colour half is off.
    if (chroma > 0) {
      let kk = 0;
      for (let dy = -CR; dy <= CR; dy++) {
        const row = getRow(y + chromaOff[dy + CR]);
        for (let dx = -CR; dx <= CR; dx++, kk++) {
          let sx = cx + chromaOff[dx + CR];
          if (sx < 0) sx = 0;
          else if (sx >= width) sx = width - 1;
          const so = at(row, sx);
          const sp = CHROMA_SPATIAL[kk];
          gr += row.v[so] * sp;
          gg += row.v[so + 1] * sp;
          gb += row.v[so + 2] * sp;
          gsum += sp;
        }
      }
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
