// The sky's colour, smoothed AFTER the look has amplified it — a small map
// rebuilt per edit, blended back in by the sky's own selection. IR-SCIENCE.md
// section 4c-xxi named this the one untested direction and its cost; section
// 9k measured why the cost vanishes inside a sky mask.
//
// THE MECHANISM, read out of the file rather than derived. An infrared frame's
// colour is a 1–3% residual between nearly identical channels. The denoiser
// takes four fifths of the noise out of that residual and the look then
// multiplies what survives by thirteen (4c-xxi) — every remedy before this one
// worked on the small number. This works on the large one: it smooths the
// RENDERED chroma. The stated cost of doing that — "the thing being smoothed is
// the look's real colour as well as its noise" — is real everywhere except in a
// sky, which has no real colour detail. So the smooth is confined to the sky's
// own bitmap and costs the rest of the frame nothing.
//
// MEASURED 2026-09-17 on the frames that have the defect, dark third of the
// sky, chroma residual at the artefact's own 12 px scale: Aerochrome 15.9 →
// 4.7 on the reported frame (Pink IR reads 8.7), 4.4 → 1.7 and 8.7 → 3.4 on
// two more, with the mean chroma held to 0% and luma changed by exactly zero.
// A sky mask's saturation, the obvious alternative, cut the residual 73% and
// took the blue with it (mean 36.9 → 10.9) — the same quantity, scaled.
//
// THE SHAPE IS THE LOCAL-MAP PATTERN (localmap.ts): a coarse map the GPU
// samples as a texture and the CPU export samples bilinearly, so both sides
// blend toward the SAME bytes and stay within filtering error of each other.
// Two differences, both deliberate. It is rebuilt PER EDIT rather than per
// image, because it is a map of the output — which is why it stays small. And
// the downsample IS the smooth: at 128 texels across, one texel averages a
// 20–25 px footprint of a 2800 px frame, which is the measured radius, so no
// further pass is needed and a strided kernel — the lattice trap 4c-xii and
// 4c-xxii both record — never enters it.
import { compileEdit, SKY_CHROMA_RANGE, smooth01, rgb2hsv, type EditParams, type BrushMask, type LensCurve, type LocalMap, type SkyMap } from "./pipeline";
export { sampleSkyMap, decSkyChroma, type SkyMap } from "./pipeline";

const REC = [0.2126, 0.7152, 0.0722];
/** Map width in texels. One texel of a 2800 px frame is ~22 px, which is the
 *  measured smoothing radius; smaller would blur the sky's real gradient,
 *  larger would leave the patches. */
export const SKY_MAP_W = 128;
/** Sub-samples per texel edge. A texel's footprint is box-averaged from this
 *  many PRE-PASSED samples on each axis — four, not the ~480 in the footprint,
 *  because each sample already carries the denoiser's own average, the texel's
 *  average is smoothed again by bilinear upsampling, and the sky is smooth by
 *  nature. Dense within the texel, never strided across it. Four is what
 *  keeps a rebuild per edit affordable once the sampler is the denoiser. */
const SUB = 2;

/** The DEPTH's keying window on a texel's mean rendered chroma (HSV max−min
 *  of the mask-weighted mean colour, display space): no depth below LO, full
 *  above HI. Measured 2026-09-18 with the aqua and blue saturation the look
 *  ships: an overcast sky (NIR_2082) reads 0.27, a frame with no sky whose
 *  bitmap fires anyway (NIR_0627) 0.31, the clear skies 0.43–0.57. The film
 *  does not darken an overcast sky — white light records through every layer —
 *  so this is physics before it is taste; and it lives HERE, per texel, rather
 *  than per pixel, so a hazy sky's pixels stay pale together instead of half
 *  of them: keyed per pixel, NIR_2082 snowed (IR-SCIENCE 4b-iv). */
export const SKY_DEPTH_CHROMA_LO = 0.32;
export const SKY_DEPTH_CHROMA_HI = 0.42;
/** And on the texel's hue — the sky's band, 175–245° fading over 25° each
 *  side — so a bitmap that fired on a blurred red background keys to nothing. */
const hueWeight = (h: number) => smooth01(150, 175, h) * (1 - smooth01(245, 270, h));

const encC = (v: number) => Math.round(((Math.min(SKY_CHROMA_RANGE, Math.max(-SKY_CHROMA_RANGE, v)) / SKY_CHROMA_RANGE) * 0.5 + 0.5) * 255);

/**
 * Build the sky chroma map for one edit.
 * @param sample  linear RGB at full-res image pixel (x,y) AFTER THE PRE-PASS —
 *                the denoised, detailed sampler the pixels this map is blended
 *                into came through. MEASURED, not assumed: built from the raw
 *                source instead, the map targeted a sky 16% more saturated
 *                than the rendered one (mean chroma 27.4 → 31.8), because the
 *                bilateral lowers a noisy sky's chroma and the raw render does
 *                not know that. Same pre-pass in, same sky out.
 * @param srcW,srcH  full image dimensions.
 * @param p  the edit — rendered with `skySmooth` forced to 0, so the map is
 *           built from the look's own output and never from itself.
 * @param cam,aspect,local,lens  exactly what compileEdit takes, passed through.
 * @param sky  the sky bitmap built once per image by buildSkyMask.
 * @returns the map, or null when the bitmap selects nothing. Four bytes per
 *   texel: encoded chroma a and b, the bitmap's mean weight, and the depth
 *   key — SKY_DEPTH_CHROMA_LO/HI on the texel's mean rendered chroma times
 *   the hue band, 0 wherever the texel has no sky sample.
 * What the result must satisfy: every texel's (a, b) is the MASK-WEIGHTED
 * mean chroma of the rendered sky over that texel's footprint with luma
 * discarded and non-finite samples dropped, so blending a pixel's chroma
 * toward it preserves the sky's mean colour by construction — the control
 * that the saturation route failed (9k) — and a texel on the canopy's edge
 * carries the sky's colour, not the leaves'. `weight` is the mean mask weight
 * of the texel's samples and is 0 wherever the bitmap is, so `compileEdit` and
 * the shader leave every non-sky pixel byte-identical; what they do with a
 * pixel the soft mask leaks onto is their gate's business (SKY_GATE_LO/HI).
 */
export function buildSkyMap(
  sample: (x: number, y: number) => ArrayLike<number>,
  srcW: number,
  srcH: number,
  p: EditParams,
  cam: number[] | undefined,
  aspect: number,
  local: LocalMap | undefined,
  lens: LensCurve | null | undefined,
  sky: BrushMask,
): SkyMap | null {
  const W = SKY_MAP_W;
  const H = Math.max(8, Math.round((W * srcH) / srcW));
  // NO SKY, NO MAP — and a map of zeros would still cost a texture upload and
  // a blend per pixel for nothing.
  let any = false;
  for (let i = 0; i < sky.data.length; i++) if (sky.data[i] > 8) { any = true; break; }
  if (!any) return null;
  // Rendered WITHOUT this stage. compileEdit reads `skySmooth` from the params
  // it is given, so the copy here is what stops the map depending on itself.
  const edit = compileEdit({ ...p, skySmooth: 0, skyDepth: 0 }, cam, aspect, local, lens);
  const out = new Float32Array(3);
  const rgba = new Uint8Array(W * H * 4);
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      const o = (ty * W + tx) * 4;
      // Average the texel's footprint AFTER rendering each sub-sample — the
      // quantity averaged is the OUTPUT chroma, after the look has amplified
      // it, which is the whole point of the stage (4c-xxi) — and WEIGHT EACH
      // SAMPLE BY THE MASK AT ITS OWN POSITION. A texel straddling the edge of
      // a canopy used to average leaves into the sky's target; measured on an
      // export, the sky beside the crown went pink toward it. A sample the
      // pipeline cannot render (not a number) is not a sample. The texel's own
      // weight is the mean of its samples' mask weights, which is what the
      // shader and compileEdit blend by.
      let sa = 0, sb = 0, wsum = 0, wall = 0, n = 0, mr = 0, mg = 0, mb = 0;
      for (let j = 0; j < SUB; j++) {
        const sy = Math.min(srcH - 1, Math.floor(((ty + (j + 0.5) / SUB) * srcH) / H));
        for (let i = 0; i < SUB; i++) {
          const sx = Math.min(srcW - 1, Math.floor(((tx + (i + 0.5) / SUB) * srcW) / W));
          const wgt = brushAt(sky, (sx + 0.5) / srcW, (sy + 0.5) / srcH);
          n++; wall += wgt;
          if (wgt < 1 / 255) continue;
          const s = sample(sx, sy);
          edit(s[0], s[1], s[2], out, 0, (sx + 0.5) / srcW, (sy + 0.5) / srcH);
          const L = out[0] * REC[0] + out[1] * REC[1] + out[2] * REC[2];
          const a = out[0] - L, b = out[2] - L;
          if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
          sa += a * wgt; sb += b * wgt; wsum += wgt;
          mr += out[0] * wgt; mg += out[1] * wgt; mb += out[2] * wgt;
        }
      }
      if (wsum <= 0) { rgba[o] = encC(0); rgba[o + 1] = encC(0); rgba[o + 2] = 0; rgba[o + 3] = 0; continue; }
      rgba[o] = encC(sa / wsum);
      rgba[o + 1] = encC(sb / wsum);
      rgba[o + 2] = Math.round((wall / n) * 255);
      // The depth key, from the texel's MEAN rendered colour: is this a blue
      // sky at all. Clamped to the display range first — the mean of clamped
      // samples is what the eye averages.
      const cr = Math.min(1, Math.max(0, mr / wsum)), cg = Math.min(1, Math.max(0, mg / wsum)), cb = Math.min(1, Math.max(0, mb / wsum));
      const [hh] = rgb2hsv(cr, cg, cb);
      const chroma = Math.max(cr, cg, cb) - Math.min(cr, cg, cb);
      rgba[o + 3] = Math.round(255 * smooth01(SKY_DEPTH_CHROMA_LO, SKY_DEPTH_CHROMA_HI, chroma) * hueWeight(hh));
    }
  }
  return { width: W, height: H, rgba };
}

/** The sky bitmap's weight at image-uv, the same bilinear-on-texel-centres
 *  read the pipeline's brush sampler makes. Kept here rather than imported so
 *  this module does not reach into pipeline.ts's private helpers; the arithmetic
 *  is the documented one (pipeline.ts sampleBrush) and must stay so, or the map's
 *  weight and the shader's mask read would disagree at a feathered edge. */
function brushAt(b: BrushMask, u: number, v: number): number {
  const fx = Math.min(1, Math.max(0, u)) * b.w - 0.5;
  const fy = Math.min(1, Math.max(0, v)) * b.h - 0.5;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  const cx = (i: number) => Math.max(0, Math.min(b.w - 1, i));
  const cy = (i: number) => Math.max(0, Math.min(b.h - 1, i));
  const x0 = cx(ix), x1 = cx(ix + 1), y0 = cy(iy), y1 = cy(iy + 1);
  const s = (x: number, y: number) => b.data[y * b.w + x];
  const top = s(x0, y0) * (1 - tx) + s(x1, y0) * tx;
  const bot = s(x0, y1) * (1 - tx) + s(x1, y1) * tx;
  return (top * (1 - ty) + bot * ty) / 255;
}
