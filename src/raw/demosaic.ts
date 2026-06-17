// Bayer demosaic + black/white-level normalization -> linear RGB.
//
// For the live editing proxy we use 2x2-quad binning: each Bayer quad collapses
// to one linear RGB pixel (R, average of the two greens, B). This demosaics for
// free, halves each dimension (keeping GPU memory sane on the iPad), and is
// artifact-free. Full-resolution bilinear demosaic is for the export path.

export interface LinearImage {
  width: number;
  height: number;
  /** RGBA float, row-major, linear, normalized to ~0..1 (may exceed 1 at clipping). */
  linear: Float32Array;
}

/**
 * @param cfa     full-frame single-channel sensor values
 * @param pattern 2x2 color indices [tl,tr,bl,br], 0=R 1=G 2=B
 * @param black   black level (subtracted)
 * @param white   white level (maps to 1.0)
 */
export function demosaicBinned(
  cfa: Uint16Array,
  width: number,
  height: number,
  pattern: number[],
  black: number,
  white: number,
): LinearImage {
  const ow = width >> 1;
  const oh = height >> 1;
  const out = new Float32Array(ow * oh * 4);
  const scale = 1 / Math.max(1, white - black);
  // Where each color sits in the 2x2 quad (indices 0..3 = tl,tr,bl,br).
  const quadOffset = [0, 1, width, width + 1];
  const rPos = pattern.indexOf(0);
  const bPos = pattern.indexOf(2);
  const gPos: number[] = [];
  for (let i = 0; i < 4; i++) if (pattern[i] === 1) gPos.push(i);

  const norm = (v: number) => Math.max(0, (v - black) * scale);

  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const base = (y * 2) * width + x * 2;
      const r = norm(cfa[base + quadOffset[rPos]]);
      const b = norm(cfa[base + quadOffset[bPos]]);
      const g = (norm(cfa[base + quadOffset[gPos[0]]]) + norm(cfa[base + quadOffset[gPos[1]]])) * 0.5;
      const o = (y * ow + x) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = 1;
    }
  }
  return { width: ow, height: oh, linear: out };
}
