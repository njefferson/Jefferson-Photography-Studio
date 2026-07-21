// HIE-style halation glow. Kodak HIE's signature came from the film lacking an
// anti-halation layer: bright (IR-hot) areas scattered light into their
// surroundings, so foliage and skies bloomed softly.
//
// We reproduce it with a low-res highlight map: scene luminance (normalised to
// its own 99th percentile, so it is independent of the exposure/WB sliders),
// soft-thresholded, then gaussian-blurred wide. The map is built once per
// image; the GPU preview samples it as a texture and the CPU export samples it
// bilinearly, and both add it in LINEAR light before contrast/gamma.

export interface GlowMap {
  width: number;
  height: number;
  /** 0..1 blurred highlight intensity, row-major. */
  data: Float32Array;
}

/** Shared scale between shader and export: glowAdd = strength * GLOW_GAIN * map. */
export const GLOW_GAIN = 0.7;

const MAP_W = 192;
const REC = [0.2126, 0.7152, 0.0722];

export function buildGlowMap(
  sample: (x: number, y: number) => [number, number, number],
  srcW: number,
  srcH: number,
): GlowMap {
  const W = MAP_W;
  const H = Math.max(8, Math.round((W * srcH) / srcW));
  const luma = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(srcH - 1, Math.floor(((y + 0.5) * srcH) / H));
    for (let x = 0; x < W; x++) {
      const sx = Math.min(srcW - 1, Math.floor(((x + 0.5) * srcW) / W));
      const [r, g, b] = sample(sx, sy);
      luma[y * W + x] = r * REC[0] + g * REC[1] + b * REC[2];
    }
  }

  // Normalise to the scene's own bright end (99th percentile).
  const sorted = Float32Array.from(luma).sort();
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || 1;

  // Soft threshold: only genuinely bright areas glow.
  const hi = new Float32Array(W * H);
  for (let i = 0; i < luma.length; i++) {
    const t = Math.min(1, Math.max(0, (luma[i] / p99 - 0.5) / 0.5));
    hi[i] = t * t * (3 - 2 * t);
  }

  // Separable gaussian, sigma ~2.5% of width — the wide, soft halation falloff.
  const sigma = W * 0.025;
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
        s += hi[y * W + xx] * kernel[k + radius];
      }
      tmp[y * W + x] = s;
    }
  }
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) {
        let yy = y + k;
        if (yy < 0) yy = 0;
        else if (yy >= H) yy = H - 1;
        s += tmp[yy * W + x] * kernel[k + radius];
      }
      out[y * W + x] = s;
    }
  }
  return { width: W, height: H, data: out };
}

/** Bilinear sample at normalised (u, v) in 0..1. */
export function sampleGlow(m: GlowMap, u: number, v: number): number {
  const x = Math.min(m.width - 1.001, Math.max(0, u * m.width - 0.5));
  const y = Math.min(m.height - 1.001, Math.max(0, v * m.height - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * m.width + x0;
  const a = m.data[i];
  const b = m.data[i + 1];
  const c = m.data[i + m.width];
  const d = m.data[i + m.width + 1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
