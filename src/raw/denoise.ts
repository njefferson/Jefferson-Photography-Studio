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

const R = 2; // 5x5 window
const REC = [0.2126, 0.7152, 0.0722];

/** exp(-(dx^2+dy^2) / (2 * 1.5^2)) spatial weights, precomputed. */
const SPATIAL: number[] = [];
for (let dy = -R; dy <= R; dy++) {
  for (let dx = -R; dx <= R; dx++) {
    SPATIAL.push(Math.exp(-(dx * dx + dy * dy) / 4.5));
  }
}

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

export type LinearSampler = (x: number, y: number) => [number, number, number];

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
): LinearSampler {
  if (strength <= 0) return sample;
  const sigma = rangeSigma(strength);
  const inv2s2 = 1 / (2 * sigma * sigma);

  // Preview runs this bilateral on a downscaled proxy, tapping in proxy texels
  // (see gl.ts). At native resolution one proxy texel spans `step` pixels, so
  // tap the same 5x5 grid `step` pixels apart to match the previewed footprint;
  // the SPATIAL weights are in tap-index units and stay identical. step === 1
  // keeps the sampling byte-identical.
  const tapOff = new Int32Array(R * 2 + 1);
  for (let d = -R; d <= R; d++) tapOff[d + R] = Math.round(d * step);
  const rowSpan = tapOff[R * 2] * 2 + 4;

  interface Row {
    y: number;
    v: Float32Array;
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
      row = { y: cy, v: new Float32Array(width * 3), seen: new Int32Array(width), gen: 1 };
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
      const [r, g, b] = sample(x, row.y);
      row.v[o] = r;
      row.v[o + 1] = g;
      row.v[o + 2] = b;
      row.seen[x] = row.gen;
    }
    return o;
  };

  return (x, y) => {
    const cRow = getRow(y);
    const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
    const co = at(cRow, cx);
    const cr = cRow.v[co];
    const cg = cRow.v[co + 1];
    const cb = cRow.v[co + 2];
    const lc = cr * REC[0] + cg * REC[1] + cb * REC[2];
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let wsum = 0;
    let k = 0;
    for (let dy = -R; dy <= R; dy++) {
      const row = getRow(y + tapOff[dy + R]);
      for (let dx = -R; dx <= R; dx++, k++) {
        let sx = cx + tapOff[dx + R];
        if (sx < 0) sx = 0;
        else if (sx >= width) sx = width - 1;
        const so = at(row, sx);
        const r = row.v[so];
        const g = row.v[so + 1];
        const b = row.v[so + 2];
        const ls = r * REC[0] + g * REC[1] + b * REC[2];
        const rel = (ls - lc) / (lc + 0.02);
        const w = SPATIAL[k] * Math.exp(-rel * rel * inv2s2);
        sr += r * w;
        sg += g * w;
        sb += b * w;
        wsum += w;
      }
    }
    return [sr / wsum, sg / wsum, sb / wsum];
  };
}
