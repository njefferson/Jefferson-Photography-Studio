// Per-image reference maps for Clarity and Dehaze (glow-map pattern: built
// once per image from LINEAR source data, sampled as a texture by the GPU and
// bilinearly by the CPU export).
//
//   R = blurred LUMINANCE — clarity's "local mean": pixels brighter than their
//       neighbourhood get pushed up, darker pushed down (ratio-based, so the
//       result is exposure/WB-invariant). Sqrt-encoded under `scale` exactly as
//       the 8-bit map always was (the stored number is the old byte / 255).
//   G, B = DEHAZE: the guided filter's coefficients (a, b) for the refined dark
//       channel, which the pixel itself completes at full resolution as
//       a * g + b, g = mean_c(I^c / A^c) — He, Sun and Tang's guided filter
//       (TPAMI 2013) run the "fast" way (He and Sun 2015): solved on this
//       coarse grid, applied with the full-resolution guide, so the
//       transmission's edges are the picture's own and not this grid's.
//
// THE DEHAZE MODEL IS HE, SUN AND TANG'S (TPAMI 2011), as darktable's
// hazeremoval implements it, and it replaced a luminance veil subtraction on
// 2026-10-02. Two things were wrong with that:
//
// 1. Its "dark channel" was a Gaussian MEAN of one point sample's min(r,g,b)
//    per cell. He's dark channel is the MINIMUM over a patch of the channel
//    minimum (eq. 5: "a minimum filter"), which is at most each pixel's own
//    minimum, so the recovery can never drive a pixel below zero. A mean sits
//    above any dark pixel beside bright ones — infrared foliage is bright in
//    every channel, so the canopy inflated the veil around it and the shadows
//    inside the crown crushed to black (decision 030's own render of NIR_1651).
//    Here: the minimum of a SUB x SUB grid of samples per texel, then an
//    erosion over the neighbouring texels, then the guided filter — the
//    edge-aware refinement that removes the minimum filter's blocks and halos
//    (He section 4.2; darktable refines with `guided_filter`).
// 2. The airlight was fixed at sensor white and the cut taken on luminance, so
//    t stayed near 1 and the stage was a brightness cut that kept the haze's
//    tint. The airlight is now ESTIMATED PER CHANNEL from the picture (He 4.3:
//    the brightest pixel among the top 0.1% of the dark channel) and the
//    recovery is per channel: J = (I - A) / max(t, t0) + A with
//    t = 1 - omega * strength * D, omega 0.95 and t0 0.1 as the paper fixes
//    them.
//
// AND THE REFINED DARK CHANNEL NEVER EXCEEDS THE PIXEL'S OWN min_c(I^c/A^c).
// That bound is the definition — the patch minimum around x includes x — and
// it is what guarantees J >= 0 (He: J^c >= (1 - omega) I^c / t). The guided
// filter's regularisation lets its output bleed across a strong edge, and on a
// shadow beside bright infrared foliage that bleed alone was enough to drive
// the shadow to black at Dehaze 0.8 (measured, tools harness LT1). So the
// pixel caps it at its own bound, in compileEdit and the shader alike.
//
// THE STAGE STAYS BEFORE WHITE BALANCE, and that is now safe rather than a
// hazard. The comment it replaced warned that an EQUAL cut on camera-native
// channels shifts hue once the white-balance gains amplify it (field bug
// 2026-07-05) — true of an equal cut. He's model normalises each channel by ITS
// OWN airlight: t reads min_c(I^c / A^c) and the recovery is (I^c - A^c)/t +
// A^c. The airlight is estimated here in the SAME camera-native space the stage
// runs in, so a per-channel gain g^c applied afterwards scales I^c and A^c
// alike: t is unchanged and g^c * J^c is exactly what dehazing the balanced
// picture would give. The camera matrix after it is linear too, and the
// recovery is linear in (I, A) for a fixed t, so it commutes with that as well.

import type { LocalMap } from "./pipeline";
import { toHalf } from "./half";

/** Linear RGB at an integer source pixel — raw/denoise's LinearSampler by
 *  structure. Named so a signature does not read as this module's own (x, y). */
type MapSampler = (x: number, y: number) => ArrayLike<number>;

const MAP_W = 256;
const REC = [0.2126, 0.7152, 0.0722];

// omega and t0 live beside the recovery that uses them: HAZE_OMEGA and HAZE_T0
// in pipeline.ts, mirrored as literals in gl.ts.
/** Samples per texel side for the dark channel's block minimum. */
const SUB = 4;
/** The erosion after the block minimum, in texels: 3x3 texels is about 1.2% of
 *  the frame's width, where He's 15-pixel patch on a 600-pixel image is 2.5%. */
const ERODE_R = 1;
/** The guided filter's window radius in texels, and darktable's regulariser
 *  (eps = sqrt(0.025)^2) for a guide normalised to the airlight. */
const GF_R = 4;
const GF_EPS = 0.025;
/** He 4.3: the airlight comes from the top 0.1% of the dark channel. */
const TOP_FRAC = 0.001;

/**
 * Build the per-image map from a linear sampler.
 *
 * @param sample linear RGB at an integer source pixel; see LinearSampler in
 *               raw/denoise — the array may be reused, so it is read at once.
 * @param srcW   the source's width in pixels.
 * @param srcH   the source's height in pixels.
 * @returns the map: half-float RGBA texels (see LocalMap) plus the luma scale
 *          and the airlight.
 *
 * What the result must satisfy: the preview (main.ts, from the decode) and the
 * export (export.ts, from the full-resolution sensor data) sample the SAME uv
 * positions, so the two maps describe the same scene; `sampleLocalMap` and the
 * shader's `u_localTex` read the same half-float numbers; `air` is positive in
 * every channel, so the shader and compileEdit can divide by it.
 */
export function buildLocalMap(
  sample: MapSampler,
  srcW: number,
  srcH: number,
): LocalMap {
  const W = MAP_W;
  const H = Math.max(8, Math.round((W * srcH) / srcW));
  const N = W * H;
  const luma = new Float32Array(N);
  const minC = new Float32Array(N * 3);
  const mean = new Float32Array(N * 3);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(srcH - 1, Math.floor(((y + 0.5) * srcH) / H));
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      // Clarity's luma: the one centre sample it has always read.
      const sx = Math.min(srcW - 1, Math.floor(((x + 0.5) * srcW) / W));
      const s = sample(sx, sy);
      luma[i] = s[0] * REC[0] + s[1] * REC[1] + s[2] * REC[2];
      // Dehaze: the block minimum per channel, and the block mean colour.
      let m0 = Infinity, m1 = Infinity, m2 = Infinity, a0 = 0, a1 = 0, a2 = 0;
      for (let j = 0; j < SUB; j++) {
        const yy = Math.min(srcH - 1, Math.floor(((y + (j + 0.5) / SUB) * srcH) / H));
        for (let k = 0; k < SUB; k++) {
          const xx = Math.min(srcW - 1, Math.floor(((x + (k + 0.5) / SUB) * srcW) / W));
          const q = sample(xx, yy);
          const r = q[0], g = q[1], b = q[2];
          if (r < m0) m0 = r;
          if (g < m1) m1 = g;
          if (b < m2) m2 = b;
          a0 += r; a1 += g; a2 += b;
        }
      }
      const n = SUB * SUB;
      minC[i * 3] = m0; minC[i * 3 + 1] = m1; minC[i * 3 + 2] = m2;
      mean[i * 3] = a0 / n; mean[i * 3 + 1] = a1 / n; mean[i * 3 + 2] = a2 / n;
    }
  }

  // Clarity wants a broad local mean (~3.5% of the frame).
  gaussianBlur(luma, W, H, W * 0.035);

  // THE AIRLIGHT (He 4.3): the brightest texel — by r+g+b, darktable's measure
  // of brightness — among the top 0.1% of the eroded dark channel.
  const dark = new Float32Array(N);
  for (let i = 0; i < N; i++) dark[i] = Math.min(minC[i * 3], minC[i * 3 + 1], minC[i * 3 + 2]);
  const darkE = erode(dark, W, H, ERODE_R);
  const order = Array.from({ length: N }, (_, i) => i).sort((p, q) => darkE[q] - darkE[p]);
  const top = Math.max(1, Math.floor(N * TOP_FRAC));
  let best = order[0], bestI = -Infinity;
  for (let k = 0; k < top; k++) {
    const i = order[k];
    const it = mean[i * 3] + mean[i * 3 + 1] + mean[i * 3 + 2];
    if (it > bestI) { bestI = it; best = i; }
  }
  const air: [number, number, number] = [
    Math.max(1e-6, mean[best * 3]),
    Math.max(1e-6, mean[best * 3 + 1]),
    Math.max(1e-6, mean[best * 3 + 2]),
  ];

  // THE NORMALISED DARK CHANNEL (He eq. 12): min over the patch of
  // min_c(I^c / A^c). The minimum over the patch and over the channels commute,
  // so the per-channel block minima divided by A^c give it exactly.
  const d0 = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    d0[i] = Math.min(minC[i * 3] / air[0], minC[i * 3 + 1] / air[1], minC[i * 3 + 2] / air[2]);
  }
  const dn = erode(d0, W, H, ERODE_R);

  // THE GUIDE: the texel's mean colour, each channel over its own airlight,
  // averaged — the same quantity the pixel computes from itself at full
  // resolution. Normalised per channel rather than a luminance, so a
  // per-channel gain applied to the picture (white balance) leaves it, and so
  // the whole transmission, unchanged.
  const guide = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    guide[i] = (mean[i * 3] / air[0] + mean[i * 3 + 1] / air[1] + mean[i * 3 + 2] / air[2]) / 3;
  }
  const [ga, gb] = guidedCoefficients(guide, dn, W, H, GF_R, GF_EPS);

  // Shared sqrt encoding for the luma, scaled to its own bright end so typical
  // local means land mid-encode.
  const sorted = Float32Array.from(luma).sort();
  const scale = Math.max(1e-4, sorted[Math.floor(sorted.length * 0.995)]);
  const rgba = new Uint16Array(N * 4);
  for (let i = 0; i < N; i++) {
    rgba[i * 4] = toHalf(enc(luma[i], scale) / 255);
    rgba[i * 4 + 1] = toHalf(ga[i]);
    rgba[i * 4 + 2] = toHalf(gb[i]);
    rgba[i * 4 + 3] = 0;
  }
  return { width: W, height: H, rgba, scale, air };
}

function enc(v: number, scale: number): number {
  return Math.round(Math.sqrt(Math.min(1, Math.max(0, v / scale))) * 255);
}

/** A square minimum filter (erosion) of half-width r, clamped at the edges,
 *  run separably. Takes the map, its size and r; returns a new map. */
function erode(src: Float32Array, W: number, H: number, r: number): Float32Array {
  const tmp = new Float32Array(W * H);
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let m = Infinity;
      for (let k = -r; k <= r; k++) {
        const xx = x + k < 0 ? 0 : x + k >= W ? W - 1 : x + k;
        const v = src[y * W + xx];
        if (v < m) m = v;
      }
      tmp[y * W + x] = m;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let m = Infinity;
      for (let k = -r; k <= r; k++) {
        const yy = y + k < 0 ? 0 : y + k >= H ? H - 1 : y + k;
        const v = tmp[yy * W + x];
        if (v < m) m = v;
      }
      out[y * W + x] = m;
    }
  }
  return out;
}

/** Box mean of half-width r with the window clipped at the frame's edge and
 *  divided by the pixels it actually covers — the box He's guided filter uses.
 *  Takes the map, its size and r; returns a new map. */
function boxMean(src: Float32Array, W: number, H: number, r: number): Float32Array {
  const tmp = new Float32Array(W * H);
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0, n = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(W - 1, x + r); k++) { s += src[y * W + k]; n++; }
      tmp[y * W + x] = s / n;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0, n = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(H - 1, y + r); k++) { s += tmp[k * W + x]; n++; }
      out[y * W + x] = s / n;
    }
  }
  return out;
}

/** The grey guided filter's averaged coefficients (He, Sun, Tang, TPAMI 2013,
 *  Algorithm 1): a = cov(I, p) / (var(I) + eps), b = mean(p) - a mean(I), each
 *  then box-averaged, so the filter's output at a pixel is mean_a * I + mean_b.
 *  Takes the guide I, the input p, the grid size, the radius and eps; returns
 *  [mean_a, mean_b]. Returning the COEFFICIENTS rather than the output is what
 *  lets the pixel apply them with its own full-resolution I (He and Sun 2015). */
function guidedCoefficients(I: Float32Array, p: Float32Array, W: number, H: number, r: number, eps: number): [Float32Array, Float32Array] {
  const N = W * H;
  const Ip = new Float32Array(N), II = new Float32Array(N);
  for (let i = 0; i < N; i++) { Ip[i] = I[i] * p[i]; II[i] = I[i] * I[i]; }
  const mI = boxMean(I, W, H, r), mp = boxMean(p, W, H, r);
  const mIp = boxMean(Ip, W, H, r), mII = boxMean(II, W, H, r);
  const a = new Float32Array(N), b = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const cov = mIp[i] - mI[i] * mp[i];
    const v = mII[i] - mI[i] * mI[i];
    a[i] = cov / (v + eps);
    b[i] = mp[i] - a[i] * mI[i];
  }
  return [boxMean(a, W, H, r), boxMean(b, W, H, r)];
}

/** In-place separable gaussian with edge clamping (same shape as glow.ts). */
function gaussianBlur(buf: Float32Array, W: number, H: number, sigma: number) {
  const radius = Math.ceil(sigma * 3);
  const kernel: number[] = [];
  let ksum = 0;
  for (let i = -radius; i <= radius; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(w);
    ksum += w;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= ksum;
  const tmp = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) {
        let xx = x + k;
        if (xx < 0) xx = 0;
        else if (xx >= W) xx = W - 1;
        s += buf[y * W + xx] * kernel[k + radius];
      }
      tmp[y * W + x] = s;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) {
        let yy = y + k;
        if (yy < 0) yy = 0;
        else if (yy >= H) yy = H - 1;
        s += tmp[yy * W + x] * kernel[k + radius];
      }
      buf[y * W + x] = s;
    }
  }
}
