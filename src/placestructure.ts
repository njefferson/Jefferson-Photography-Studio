// The structure cues of the test page's Separation check when its regions are named by samples: for each counted pixel, how far the lightness gradient in a square window around it runs along one line (the structure tensor's coherence), at two window sizes. Pure functions on plain arrays: it reads no file, draws nothing and holds no page code, so the container can prove it with planted arrays. It chooses nothing: each value is printed with its definition and what it could not tell is stated beside it.

/** The structure cues in order, as the report prints them: edge alignment over a window of 15 pixels and over a window of 45. A cue's place in this list is its place in the arrays placeStructureValues gives. */
export const PLACE_STRUCTURE_CUES: readonly string[] = ["edge alignment at 15", "edge alignment at 45"];

/** The half-width of each cue's square window, in the order of PLACE_STRUCTURE_CUES: 7 for a window of 15 pixels and 22 for a window of 45. */
const HALF: readonly number[] = [7, 22];

/**
 * Reads the structure cues off the counted pixels.
 * The derivatives at a pixel of the whole frame are the centred differences: the lightness one pixel to the right less the lightness one pixel to the left, and the lightness one pixel below less the lightness one pixel above, a neighbour past the frame's edge taken as the nearest pixel inside it. For each window, a square centred on the counted pixel's place in the whole frame and clipped at the frame's edge, every pixel inside weighted alike, three sums are taken exactly: of the squared horizontal derivative (a), of the squared vertical derivative (b) and of their product (c). The value is ((a less b) squared plus 4 c squared) over (a plus b) squared, and 0 where a plus b is 0.
 * @param light the drawn lightness of the whole frame as one byte to a pixel, row by row, width times height long.
 * @param width the frame's width in pixels.
 * @param height the frame's height in pixels.
 * @param cols each counted pixel's column in the full frame.
 * @param rows each counted pixel's row in the full frame.
 * @returns two Float32Arrays in the order of PLACE_STRUCTURE_CUES, one value for each counted pixel, each from 0 to 1 and never not a number: 1 where every derivative in the window lies along one line, falling toward 0 as their directions spread, and 0 where the window's lightness is constant. Both are on the scale from 0 to 1, which the cue module bins by its scale for an unnamed cue; the windowed sums come from summed-area arrays, three the size of the frame, so the time does not grow with the window.
 */
export function placeStructureValues(light: ArrayLike<number>, width: number, height: number, cols: ArrayLike<number>, rows: ArrayLike<number>): Float32Array[] {
  const n = Math.min(cols.length, rows.length);
  const out: Float32Array[] = [];
  for (let c = 0; c < PLACE_STRUCTURE_CUES.length; c++) out.push(new Float32Array(n));
  if (!(width >= 1) || !(height >= 1)) return out;
  const W1 = width + 1;
  const sa = new Float64Array(W1 * (height + 1));
  const sb = new Float64Array(W1 * (height + 1));
  const sc = new Float64Array(W1 * (height + 1));
  for (let y = 0; y < height; y++) {
    const up = (y > 0 ? y - 1 : 0) * width;
    const down = (y < height - 1 ? y + 1 : y) * width;
    const here = y * width;
    let ra = 0, rb = 0, rc = 0;
    for (let x = 0; x < width; x++) {
      const gx = light[here + (x < width - 1 ? x + 1 : x)] - light[here + (x > 0 ? x - 1 : 0)];
      const gy = light[down + x] - light[up + x];
      ra += gx * gx; rb += gy * gy; rc += gx * gy;
      const i = (y + 1) * W1 + x + 1, j = y * W1 + x + 1;
      sa[i] = sa[j] + ra; sb[i] = sb[j] + rb; sc[i] = sc[j] + rc;
    }
  }
  for (let k = 0; k < n; k++) {
    let cx = cols[k], cy = rows[k];
    cx = cx < 0 ? 0 : cx > width - 1 ? width - 1 : cx;
    cy = cy < 0 ? 0 : cy > height - 1 ? height - 1 : cy;
    for (let w = 0; w < HALF.length; w++) {
      const half = HALF[w];
      const x0 = cx - half > 0 ? cx - half : 0, x1 = cx + half < width - 1 ? cx + half : width - 1;
      const y0 = cy - half > 0 ? cy - half : 0, y1 = cy + half < height - 1 ? cy + half : height - 1;
      const p = (y1 + 1) * W1 + x1 + 1, q = y0 * W1 + x1 + 1, r = (y1 + 1) * W1 + x0, s = y0 * W1 + x0;
      const a = sa[p] - sa[q] - sa[r] + sa[s];
      const b = sb[p] - sb[q] - sb[r] + sb[s];
      const c = sc[p] - sc[q] - sc[r] + sc[s];
      const t = a + b;
      let v = 0;
      if (t > 0) {
        const d = a - b;
        v = (d * d + 4 * c * c) / (t * t);
        v = v > 1 ? 1 : v < 0 ? 0 : v;
      }
      out[w][k] = v;
    }
  }
  return out;
}
