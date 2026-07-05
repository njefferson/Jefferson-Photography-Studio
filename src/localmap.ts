// Per-image reference maps for Clarity and Dehaze (glow-map pattern: built
// once per image from LINEAR source data, sampled as a texture by the GPU and
// bilinearly by the CPU export).
//
//   R = blurred LUMINANCE  — clarity's "local mean": pixels brighter than their
//       neighbourhood get pushed up, darker pushed down (ratio-based, so the
//       result is exposure/WB-invariant).
//   G = blurred DARK CHANNEL (min of r,g,b) — the classic haze prior: haze
//       lifts even the darkest channel, so this approximates the local veil.
//
// Both are sqrt-encoded into one RG8 buffer with a shared linear scale so the
// shader and compileEdit decode identical bytes (see sampleLocalMap).

import type { LocalMap } from "./pipeline";

const MAP_W = 256;
const REC = [0.2126, 0.7152, 0.0722];

export function buildLocalMap(
  sample: (x: number, y: number) => [number, number, number],
  srcW: number,
  srcH: number,
): LocalMap {
  const W = MAP_W;
  const H = Math.max(8, Math.round((W * srcH) / srcW));
  const luma = new Float32Array(W * H);
  const dark = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(srcH - 1, Math.floor(((y + 0.5) * srcH) / H));
    for (let x = 0; x < W; x++) {
      const sx = Math.min(srcW - 1, Math.floor(((x + 0.5) * srcW) / W));
      const [r, g, b] = sample(sx, sy);
      luma[y * W + x] = r * REC[0] + g * REC[1] + b * REC[2];
      dark[y * W + x] = Math.min(r, g, b);
    }
  }

  // Clarity wants a broad local mean (~3.5% of the frame); the veil is a
  // slightly tighter field so dehaze tracks haze pockets.
  gaussianBlur(luma, W, H, W * 0.035);
  gaussianBlur(dark, W, H, W * 0.02);

  // Shared sqrt encoding. Scale to the luma's own bright end so typical local
  // means land mid-encode (dark channel is ≤ luma, so it fits under the same
  // scale).
  const sorted = Float32Array.from(luma).sort();
  const scale = Math.max(1e-4, sorted[Math.floor(sorted.length * 0.995)]);
  const rg = new Uint8Array(W * H * 2);
  for (let i = 0; i < W * H; i++) {
    rg[i * 2] = enc(luma[i], scale);
    rg[i * 2 + 1] = enc(dark[i], scale);
  }
  return { width: W, height: H, rg, scale };
}

function enc(v: number, scale: number): number {
  return Math.round(Math.sqrt(Math.min(1, Math.max(0, v / scale))) * 255);
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
