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
// Method: Laplacian-pyramid focus blend (see pyramid.ts). Each frame is
//   decomposed into frequency bands; at every band + pixel the coefficient from
//   the frame with the most local contrast wins; the pyramid is collapsed back.
//   Per-band selection dissolves the seams a raw per-pixel argmax leaves in
//   low-contrast transitions. (Earlier tries, for the record: a soft weighted
//   MEAN veiled the subject — it pulls in the 10 defocused frames — and a hard
//   per-pixel argmax was sharp but left grain in low-contrast transitions;
//   measured on the real set, 2026-07-06.)
//
// Alignment: a coarse integer translation per frame vs. the reference (frame 0),
// estimated on a downsampled luma by SSD search. Focus-shift bursts are usually
// tripod-steady (the bundled set measured ≈0 drift), but handheld sets need it.
// Rotation / breathing-scale are deferred (noted honestly) until a real set
// needs them.

import { PyramidBlender } from "./pyramid";

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

  const blender = new PyramidBlender(w, h);
  const shifts: { name: string; dx: number; dy: number }[] = [];

  // Split an aligned frame into R/G/B float planes (applying the integer shift
  // so it registers to the reference) and fold it into the pyramid blend.
  const fold = (img: ImageData, dx: number, dy: number) => {
    const data = img.data;
    const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = y * w + x;
        const sx = Math.min(w - 1, Math.max(0, x + dx));
        const sy = Math.min(h - 1, Math.max(0, y + dy));
        const si = (sy * w + sx) * 4;
        R[o] = data[si]; G[o] = data[si + 1]; B[o] = data[si + 2];
      }
    }
    blender.add(R, G, B);
  };

  fold(first, 0, 0);
  shifts.push({ name: frames[0].name, dx: 0, dy: 0 });

  for (let f = 1; f < total; f++) {
    onProgress?.(f, total, "stacking");
    const img = await decodeAt(frames[f].blob, longEdge);
    if (img.width !== w || img.height !== h) throw new Error("Frames are not the same size — is this one focus-shift set?");
    let dx = 0, dy = 0;
    if (align) [dx, dy] = estimateShift(refL, luma(img), w, h);
    shifts.push({ name: frames[f].name, dx, dy });
    fold(img, dx, dy);
  }

  onProgress?.(total, total, "compositing");
  return { image: blender.finish(), shifts, width: w, height: h };
}
