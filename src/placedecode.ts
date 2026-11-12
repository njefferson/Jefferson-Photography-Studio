// The data the test page's cues and a sample mask's edge are counted on, taken from the photograph's own decode and never from a picture an edit has drawn. Record 032 holds that a mask keys the photograph and not the grade, and the editor's Sky mask already reads its key that way, so this module builds the same guide the Sky mask's refinement reads (`buildSkyGuide` in skyfine.ts: red share, blue share and gamma lightness under the gray-world gains the file itself gives) and reads it at the counted pixels and at every pixel of the frame. It takes no white balance, exposure, channel swap, denoise or look and reads none, so what it gives is the same whatever the photograph is set to. It reads no page element and no graphics context, so the test page and a node harness call the same code.
import { buildSkyGuide } from "./skyfine";
import { grayWorldWB, linearAt, type DecodedImage } from "./decode";

/** The grid of counted pixels as the test page takes it: `w` by `h` counted pixels, every `k`-th pixel of every `k`-th row of a frame
 *  `fromW` by `fromH` laid over the whole photograph at turn zero, so counted pixel (x, y) is frame pixel (x times k, y times k). */
export interface PlaceGrid { w: number; h: number; k: number; fromW: number; fromH: number }

/** What the cues and the edge are counted on. `shares` is three floats for each counted pixel in grid order (row by row): the red, green
 *  and blue shares of the gray-world-balanced linear decode, adding to one. `pixels` is four bytes for each counted pixel: each share over
 *  the largest share, times the lightness, times 255, and 255 for the fourth, so the largest of the three is the lightness in 255ths.
 *  `light` is one byte for each pixel of the frame, row by row, `fromW` times `fromH` long: the lightness times 255. The lightness is the
 *  guide's own: gamma luma of the balanced linear decode over the frame's 99.5th percentile of it, from 0 to 1. `gains` are the gray-world
 *  gains the guide was built at, read from the file, and `guideW` by `guideH` is the guide's size. */
export interface PlaceDecoded {
  shares: Float32Array;
  pixels: Uint8ClampedArray;
  light: Uint8Array;
  gains: [number, number, number];
  guideW: number;
  guideH: number;
}

/**
 * Counts what the test page's cues and a sample mask's edge are read from, from the photograph's own decode.
 * The gains are `grayWorldWB` of the decode and the guide is `buildSkyGuide` over `linearAt` of the decode at those gains, the call the
 * editor's Sky mask makes for its own guide; nothing of either is copied here. The guide is at most 1024 pixels on its longer side (the
 * Sky mask's own working size), so it is read at each place by bilinear interpolation between its pixel centres, each neighbour clamped to
 * the guide's edge as `sampleBrush` in pipeline.ts reads a bitmap; a place is the centre of a frame pixel as a fraction of the frame's
 * width and height, so a frame of another size than the decode reads the same places of the photograph.
 * @param img the decoded photograph with its pixels present (a raw's linear copy, or an 8-bit picture read through `linearAt`), at turn
 *   zero as the test page draws it.
 * @param grid the grid of counted pixels (`PlaceGrid`): its size, its stride and the size of the frame it was taken from.
 * @returns a `PlaceDecoded`: the shares and the bytes of each counted pixel and the lightness of every frame pixel, as that type states.
 * What the result must satisfy: it reads the decode and nothing else, takes no edit and reads none, so it is the same for one photograph
 * whatever its white balance, exposure, channel swap, denoise or look; every share is from 0 to 1, the three of a pixel add to one and
 * none is not a number; the largest byte of a counted pixel equals that pixel's byte in `light`. Consumers: the test page's places part
 * (`src/debug.ts`), which counts the eight cues on `pixels`, `shares` and `light` (`placeCueValues`), the structure cues on `light`
 * (`placeStructureValues`) and keeps `light` for the mask's Refined to edges (`sampleMaskRender`); and the node harness that sets the
 * masks made this way beside the masks made from the drawn picture.
 */
export function placeDecode(img: DecodedImage, grid: PlaceGrid): PlaceDecoded {
  const gains = grayWorldWB(img);
  const guide = buildSkyGuide((x, y) => linearAt(img, x, y), img.width, img.height, gains);
  const gw = guide.w, gh = guide.h;
  const { w, h, k, fromW, fromH } = grid;

  // The two guide columns (or rows) a place reads and the weight of the second, for the centre of every frame column (or row): the place
  // is (column plus one half) over the frame's width, read at guide texel coordinate place times guide width less one half.
  const taps = (size: number, from: number) => {
    const lo = new Int32Array(from), hi = new Int32Array(from), t = new Float32Array(from);
    for (let i = 0; i < from; i++) {
      const f = ((i + 0.5) / from) * size - 0.5;
      const fl = Math.floor(f);
      lo[i] = Math.max(0, Math.min(size - 1, fl));
      hi[i] = Math.max(0, Math.min(size - 1, fl + 1));
      t[i] = f - fl;
    }
    return { lo, hi, t };
  };
  const tx = taps(gw, fromW), ty = taps(gh, fromH);
  const read = (ch: Float32Array, x: number, y: number): number => {
    const a = tx.t[x], b = ty.t[y];
    const r0 = ty.lo[y] * gw, r1 = ty.hi[y] * gw;
    const top = ch[r0 + tx.lo[x]] * (1 - a) + ch[r0 + tx.hi[x]] * a;
    const bot = ch[r1 + tx.lo[x]] * (1 - a) + ch[r1 + tx.hi[x]] * a;
    return top * (1 - b) + bot * b;
  };

  const light = new Uint8Array(fromW * fromH);
  for (let y = 0; y < fromH; y++) {
    for (let x = 0; x < fromW; x++) light[y * fromW + x] = Math.round(255 * Math.min(1, Math.max(0, read(guide.l, x, y))));
  }

  const n = w * h;
  const shares = new Float32Array(n * 3);
  const pixels = new Uint8ClampedArray(n * 4);
  for (let gy = 0; gy < h; gy++) {
    for (let gx = 0; gx < w; gx++) {
      const i = gy * w + gx;
      const x = Math.min(fromW - 1, gx * k), y = Math.min(fromH - 1, gy * k);
      const r = Math.min(1, Math.max(0, read(guide.r, x, y)));
      const b = Math.min(1, Math.max(0, read(guide.b, x, y)));
      const g = Math.max(0, 1 - r - b);
      shares[3 * i] = r; shares[3 * i + 1] = g; shares[3 * i + 2] = b;
      const top = Math.max(r, g, b);
      const v = light[y * fromW + x];
      pixels[4 * i] = top > 0 ? Math.round((v * r) / top) : 0;
      pixels[4 * i + 1] = top > 0 ? Math.round((v * g) / top) : 0;
      pixels[4 * i + 2] = top > 0 ? Math.round((v * b) / top) : 0;
      pixels[4 * i + 3] = 255;
    }
  }
  return { shares, pixels, light, gains, guideW: gw, guideH: gh };
}
