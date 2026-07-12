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
 *  QUADRATIC on purpose: a bilateral goes from "keeps the grain" to "smears
 *  detail" across a tiny band of sigma, so a linear slider put that whole band
 *  in the first pixel of travel. Squaring the strength spreads the gentle
 *  low-sigma zone — where you actually dial noise — across most of the track,
 *  with a low 0.15 ceiling so the top is still safe. Keep gl.ts in sync. */
export function rangeSigma(strength: number): number {
  return 0.03 + 0.12 * strength * strength;
}

export type LinearSampler = (x: number, y: number) => [number, number, number];

/**
 * Wraps a linear-RGB sampler with bilateral denoising. Rows are computed once
 * and cached (small ring), so scanning exports stay close to 1x decode cost.
 */
export function makeRowDenoiser(
  sample: LinearSampler,
  width: number,
  height: number,
  strength: number,
): LinearSampler {
  if (strength <= 0) return sample;
  const sigma = rangeSigma(strength);
  const inv2s2 = 1 / (2 * sigma * sigma);

  const rows = new Map<number, Float32Array>();
  const getRow = (y: number): Float32Array => {
    const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
    let row = rows.get(cy);
    if (!row) {
      row = new Float32Array(width * 3);
      for (let x = 0; x < width; x++) {
        const [r, g, b] = sample(x, cy);
        row[x * 3] = r;
        row[x * 3 + 1] = g;
        row[x * 3 + 2] = b;
      }
      rows.set(cy, row);
      // Keep the cache a small ring; exports scan top-to-bottom.
      while (rows.size > 8) {
        rows.delete(rows.keys().next().value!);
      }
    }
    return row;
  };

  return (x, y) => {
    const cRow = getRow(y);
    const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
    const cr = cRow[cx * 3];
    const cg = cRow[cx * 3 + 1];
    const cb = cRow[cx * 3 + 2];
    const lc = cr * REC[0] + cg * REC[1] + cb * REC[2];
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let wsum = 0;
    let k = 0;
    for (let dy = -R; dy <= R; dy++) {
      const row = getRow(y + dy);
      for (let dx = -R; dx <= R; dx++, k++) {
        let sx = cx + dx;
        if (sx < 0) sx = 0;
        else if (sx >= width) sx = width - 1;
        const r = row[sx * 3];
        const g = row[sx * 3 + 1];
        const b = row[sx * 3 + 2];
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
