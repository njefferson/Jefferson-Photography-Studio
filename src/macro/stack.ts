// Macro focus-stacking engine (JPEG-first). Combines a focus-shift burst into
// one image that is sharp everywhere the stack had focus, leaving the bokeh
// smooth. Classical DSP, no ML.
//
// MEMORY IS THE BINDING CONSTRAINT (iPad Safari): a 20 MP × 11-frame stack is
// ~900 MB if fully decoded, which crashes the tab. So we STREAM — decode one
// frame at a time at the working resolution, fold it into running accumulators,
// and release it before the next. Peak memory is a handful of full-frame
// float buffers, independent of frame count.
//
// Method (per-pixel max-sharpness selection):
//   sharpness Sᵢ = box-summed squared Laplacian of luma (the "modified
//   Laplacian" focus measure) — high where a frame is in focus, ~0 in bokeh.
//   For each pixel we keep the RGB of the frame with the HIGHEST Sᵢ seen so far
//   (a streaming argmax). Focus stacking is winner-take-all, not an average —
//   a soft weighted mean pulls in the 10 defocused frames and veils the whole
//   subject (measured on the real set, 2026-07-06: the average read softer than
//   a single frame). Where every frame is flat (bokeh) the Sᵢ are all ~0 and the
//   incumbent (frame 0) is kept — and the bokeh is near-identical across frames,
//   so it stays clean. (A Laplacian-pyramid blend would further soften the
//   selection seams; noted as the next refinement.)
//
// Alignment: a coarse integer translation per frame vs. the reference (frame 0),
// estimated on a downsampled luma by SSD search. Focus-shift bursts are usually
// tripod-steady (the bundled set measured ≈0 drift), but handheld sets need it.
// Rotation / breathing-scale are deferred (noted honestly) until a real set
// needs them.

export interface StackFrame {
  /** Something decodable to pixels at a target size. */
  blob: Blob;
  name: string;
}

export interface StackOptions {
  /** Longest output edge in px (working/preview resolution). */
  longEdge: number;
  /** Enable coarse translation alignment vs the first frame. */
  align?: boolean;
  onProgress?: (done: number, total: number, phase: string) => void;
}

export interface StackResult {
  image: ImageData;
  /** Per-frame estimated shift (px at working res), for diagnostics/UI. */
  shifts: { name: string; dx: number; dy: number }[];
  width: number;
  height: number;
}

/** Decode a blob to RGBA at a bounded size (longest edge = longEdge), using the
 *  browser's native JPEG decoder with resize so we never hold the full 20 MP. */
async function decodeAt(blob: Blob, longEdge: number): Promise<ImageData> {
  // First a tiny probe to read the natural size, so we can pick the resize dims
  // preserving aspect. createImageBitmap with resizeWidth/Height decodes+scales
  // in one native step.
  const probe = await createImageBitmap(blob);
  const nw = probe.width, nh = probe.height;
  const scale = Math.min(1, longEdge / Math.max(nw, nh));
  const w = Math.max(1, Math.round(nw * scale));
  const h = Math.max(1, Math.round(nh * scale));
  probe.close();
  const bmp = await createImageBitmap(blob, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" });
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return ctx.getImageData(0, 0, w, h);
}

function luma(img: ImageData): Float32Array {
  const { data, width, height } = img;
  const L = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    L[i] = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
  }
  return L;
}

/** Modified-Laplacian focus measure, box-summed over radius r. */
function sharpness(L: Float32Array, w: number, h: number, r = 4): Float32Array {
  const lap = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = 4 * L[i] - L[i - 1] - L[i + 1] - L[i - w] - L[i + w];
      lap[i] = v * v;
    }
  }
  return boxBlur(lap, w, h, r);
}

/** Separable box blur (sum then normalize), edge-clamped. */
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const inv = 1 / ((2 * r + 1) * (2 * r + 1));
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = s;
      const xa = Math.min(w - 1, x + r + 1), xb = Math.max(0, x - r);
      s += src[y * w + xa] - src[y * w + xb];
    }
  }
  const out = new Float32Array(w * h);
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s * inv;
      const ya = Math.min(h - 1, y + r + 1), yb = Math.max(0, y - r);
      s += tmp[ya * w + x] - tmp[yb * w + x];
    }
  }
  return out;
}

/** Coarse integer translation of L vs ref, minimizing SSD on a downsampled
 *  copy over a small search window. Returns [dx, dy] in full-working px. */
function estimateShift(ref: Float32Array, L: Float32Array, w: number, h: number): [number, number] {
  const tw = 240;
  const s = Math.min(1, tw / w);
  const dw = Math.max(1, Math.round(w * s)), dh = Math.max(1, Math.round(h * s));
  const down = (src: Float32Array) => {
    const o = new Float32Array(dw * dh);
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) o[y * dw + x] = src[Math.floor(y / s) * w + Math.floor(x / s)];
    return o;
  };
  const a = down(ref), b = down(L);
  const R = 10;
  let best: [number, number] = [0, 0], bestS = Infinity;
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      let sum = 0, n = 0;
      for (let y = R; y < dh - R; y += 2) {
        for (let x = R; x < dw - R; x += 2) {
          const d = a[y * dw + x] - b[(y + dy) * dw + (x + dx)];
          sum += d * d; n++;
        }
      }
      sum /= n;
      if (sum < bestS) { bestS = sum; best = [dx, dy]; }
    }
  }
  return [Math.round(best[0] / s), Math.round(best[1] / s)];
}

export async function stackFocus(frames: StackFrame[], opts: StackOptions): Promise<StackResult> {
  const { longEdge, align = true, onProgress } = opts;
  const total = frames.length;
  if (!total) throw new Error("No frames to stack.");

  // Reference frame fixes the output geometry + alignment anchor, and seeds the
  // running selection (so bokeh, where no frame ever wins, keeps its pixels).
  onProgress?.(0, total, "decoding");
  const first = await decodeAt(frames[0].blob, longEdge);
  const w = first.width, h = first.height, N = w * h;
  const refL = luma(first);

  const out = new ImageData(w, h);
  const bestS = new Float32Array(N); // highest focus measure seen per pixel
  const shifts: { name: string; dx: number; dy: number }[] = [];

  // Fold a frame in: wherever it is sharper than the incumbent, it wins the
  // pixel. `dx,dy` register the frame to the reference.
  const fold = (img: ImageData, dx: number, dy: number, seed: boolean) => {
    const S = sharpness(luma(img), w, h);
    const data = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = y * w + x;
        const sx = Math.min(w - 1, Math.max(0, x + dx));
        const sy = Math.min(h - 1, Math.max(0, y + dy));
        const si = sy * w + sx;
        if (seed || S[si] > bestS[o]) {
          bestS[o] = S[si];
          out.data[o * 4] = data[si * 4];
          out.data[o * 4 + 1] = data[si * 4 + 1];
          out.data[o * 4 + 2] = data[si * 4 + 2];
          out.data[o * 4 + 3] = 255;
        }
      }
    }
  };

  fold(first, 0, 0, true);
  shifts.push({ name: frames[0].name, dx: 0, dy: 0 });

  for (let f = 1; f < total; f++) {
    onProgress?.(f, total, "stacking");
    const img = await decodeAt(frames[f].blob, longEdge);
    if (img.width !== w || img.height !== h) throw new Error("Frames are not the same size — is this one focus-shift set?");
    let dx = 0, dy = 0;
    if (align) [dx, dy] = estimateShift(refL, luma(img), w, h);
    shifts.push({ name: frames[f].name, dx, dy });
    fold(img, dx, dy, false);
  }

  onProgress?.(total, total, "compositing");
  return { image: out, shifts, width: w, height: h };
}
