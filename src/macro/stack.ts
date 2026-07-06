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

// --- Full-resolution TILED export -----------------------------------------
// The preview stacks at ~2048 px because a full-res in-memory pyramid over all
// frames would blow the iPad RAM budget. For export we keep full resolution but
// tile the output: each tile runs the SAME pyramid blend over just its own
// region (plus a halo), so peak memory is one tile's pyramid, not the whole
// frame. The halo (≥ the base band's spatial support) makes adjacent tiles
// agree at their shared border, so the cores butt together seam-free without a
// feather pass. Frames are decoded per tile at full res, cropped to the tile —
// N×tiles decodes, the price of never holding a full-res frame set.

export interface FullResOptions {
  align?: boolean;
  /** Core tile edge in px (halo added around it). Smaller = less peak RAM. */
  tile?: number;
  halo?: number;
  onProgress?: (done: number, total: number, phase: string) => void;
}

async function naturalSize(blob: Blob): Promise<[number, number]> {
  const b = await createImageBitmap(blob);
  const s: [number, number] = [b.width, b.height];
  b.close();
  return s;
}

/** Decode a full-width strip [rows sy..sy+vh) of a frame at full res to ImageData. */
async function decodeStrip(blob: Blob, sy: number, vh: number, natW: number): Promise<ImageData> {
  const bmp = await createImageBitmap(blob, 0, sy, natW, vh);
  const c = new OffscreenCanvas(natW, vh);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return ctx.getImageData(0, 0, natW, vh);
}

export async function stackFocusFullRes(frames: StackFrame[], opts: FullResOptions = {}): Promise<StackResult> {
  const { align = true, tile = 1536, halo = 256, onProgress } = opts;
  const total = frames.length;
  if (!total) throw new Error("No frames to stack.");

  const [natW, natH] = await naturalSize(frames[0].blob);

  // Estimate each frame's integer shift ONCE, cheaply, on a downscaled luma, and
  // scale it to full-res pixels (reused for every tile).
  onProgress?.(0, 1, "aligning");
  const alignEdge = 480;
  const ref = await decodeAt(frames[0].blob, alignEdge);
  const refLo = luma(ref);
  const loW = ref.width, loH = ref.height;
  const scale = natW / loW;
  const shifts: { name: string; dx: number; dy: number }[] = [{ name: frames[0].name, dx: 0, dy: 0 }];
  for (let f = 1; f < total; f++) {
    if (align) {
      const lo = await decodeAt(frames[f].blob, alignEdge);
      if (lo.width !== loW || lo.height !== loH) throw new Error("Frames are not the same size — is this one focus-shift set?");
      const [dx, dy] = estimateShift(refLo, luma(lo), loW, loH);
      shifts.push({ name: frames[f].name, dx: Math.round(dx * scale), dy: Math.round(dy * scale) });
    } else {
      shifts.push({ name: frames[f].name, dx: 0, dy: 0 });
    }
  }

  const out = new ImageData(natW, natH);
  const cols = Math.ceil(natW / tile), rows = Math.ceil(natH / tile);
  const steps = rows * total;
  let step = 0;

  // Process a ROW of tiles at a time, decoding each frame's strip ONCE for the
  // row and fanning it out to that row's column tiles — so a full-res frame is
  // decoded rows× (not tiles×) times, while only one row of tile pyramids is
  // ever resident.
  for (let ty = 0; ty < rows; ty++) {
    const coreY = ty * tile, coreH = Math.min(tile, natH - coreY);
    const py0 = Math.max(0, coreY - halo), pye = Math.min(natH, coreY + coreH + halo);
    const ph = pye - py0;

    const colTiles = [];
    for (let tx = 0; tx < cols; tx++) {
      const coreX = tx * tile, coreW = Math.min(tile, natW - coreX);
      const px0 = Math.max(0, coreX - halo), pxe = Math.min(natW, coreX + coreW + halo);
      colTiles.push({ coreX, coreW, px0, pw: pxe - px0, blender: new PyramidBlender(pxe - px0, ph) });
    }

    for (let f = 0; f < total; f++) {
      onProgress?.(step++, steps, `row ${ty + 1}/${rows}`);
      const { dx, dy } = shifts[f];
      const sy = Math.min(natH - 1, Math.max(0, py0 + dy));
      const syE = Math.min(natH, Math.max(1, pye + dy));
      const vh = Math.max(1, syE - sy);
      const strip = await decodeStrip(frames[f].blob, sy, vh, natW);
      const sdata = strip.data;
      for (const ct of colTiles) {
        const R = new Float32Array(ct.pw * ph), G = new Float32Array(ct.pw * ph), B = new Float32Array(ct.pw * ph);
        for (let oy = 0; oy < ph; oy++) {
          const gyy = Math.min(sy + vh - 1, Math.max(sy, py0 + dy + oy)) - sy;
          for (let ox = 0; ox < ct.pw; ox++) {
            const sxx = Math.min(natW - 1, Math.max(0, ct.px0 + ox + dx));
            const si = (gyy * natW + sxx) * 4, o = oy * ct.pw + ox;
            R[o] = sdata[si]; G[o] = sdata[si + 1]; B[o] = sdata[si + 2];
          }
        }
        ct.blender.add(R, G, B);
      }
    }

    for (const ct of colTiles) {
      const tileImg = ct.blender.finish();
      const ox0 = ct.coreX - ct.px0, oy0 = coreY - py0;
      for (let y = 0; y < coreH; y++) {
        const src = ((oy0 + y) * ct.pw + ox0) * 4;
        const dst = ((coreY + y) * natW + ct.coreX) * 4;
        out.data.set(tileImg.data.subarray(src, src + ct.coreW * 4), dst);
      }
    }
  }

  onProgress?.(steps, steps, "done");
  return { image: out, shifts, width: natW, height: natH };
}
