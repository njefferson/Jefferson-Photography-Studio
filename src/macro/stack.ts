// Macro focus-stacking engine (JPEG-first). Combines a focus-shift burst into
// one image that is sharp everywhere the stack had focus, leaving the bokeh
// smooth. Classical DSP, no ML.
//
// METHOD — depth-map selection (the "PMax/DMap" family), reached after three
// tries measured on real frames (2026-07-06):
//   1. soft weighted MEAN — veiled the subject (the 10 defocused frames leak in).
//   2. hard per-pixel ARGMAX — sharp, but grainy: on low-texture surfaces the
//      focus measure is ~equal across frames, so the winner flickers per pixel.
//   3. Laplacian-PYRAMID band merge — killed the grain but RANG: mixing bands
//      overshoots at strong edges, so thin petals over a blown background got
//      bright halos (field bug IMG_0934).
// This one: pick, per pixel, the frame with the highest (smoothed) focus measure
// — a SELECTION MAP — then MODE-FILTER that map (majority vote in a small window)
// to erase the isolated flips that caused the grain, then GATHER the actual
// pixels from the chosen frames. Selecting whole pixels can't overshoot (no
// halos) and never averages (no veil); mode-filtering the map removes the grain
// without softening detail (edges/regions survive a mode filter). Bokeh, where
// every measure is ~0, resolves to a near-constant frame and stays smooth.
//
// MEMORY: selection + gather are per-pixel (+ a tiny window), NOT spatial like a
// pyramid — so NO tiling is needed even at full 20 MP. Two streaming passes over
// the frames, one frame decoded at a time; only whole-image index/energy maps
// (a few bytes/px) and the output stay resident. Peak RAM is independent of
// frame count.
//
// Alignment: coarse integer translation per frame vs frame 0 (SSD on downsampled
// luma). Rotation / breathing-scale deferred until a set needs them.

export interface StackFrame {
  blob: Blob;
  name: string;
}

export interface StackOptions {
  /** Longest working edge in px (preview). Use a huge value for full-res. */
  longEdge: number;
  align?: boolean;
  onProgress?: (done: number, total: number, phase: string) => void;
}

export interface FullResOptions {
  align?: boolean;
  onProgress?: (done: number, total: number, phase: string) => void;
}

export interface StackResult {
  image: ImageData;
  shifts: { name: string; dx: number; dy: number }[];
  width: number;
  height: number;
}

/** Decode a blob to RGBA at a bounded size (longest edge = longEdge). */
async function decodeAt(blob: Blob, longEdge: number): Promise<ImageData> {
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

function luma(data: Uint8ClampedArray, n: number): Float32Array {
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
  return L;
}

/** Coarse integer translation of L vs ref (SSD on a downsampled copy). */
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
      let sum = 0, nn = 0;
      for (let y = R; y < dh - R; y += 2) for (let x = R; x < dw - R; x += 2) { const d = a[y * dw + x] - b[(y + dy) * dw + (x + dx)]; sum += d * d; nn++; }
      sum /= nn;
      if (sum < bestS) { bestS = sum; best = [dx, dy]; }
    }
  }
  return [Math.round(best[0] / s), Math.round(best[1] / s)];
}

/** Modified-Laplacian focus measure, box-blurred by `r` so the selection is
 *  coherent before the mode filter. `r` scales with resolution (see stackSelect)
 *  so preview and full-res smooth the measure by the same image fraction — vital
 *  in flat bokeh, where too small an `r` leaves the measure noisy and the
 *  selection picks frames at random, printing the frames' subtle bokeh
 *  differences as speckle. */
function focusMeasure(L: Float32Array, w: number, h: number, r: number): Float32Array {
  const e = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = 4 * L[i] - L[i - 1] - L[i + 1] - L[i - w] - L[i + w];
      e[i] = v * v;
    }
  }
  return boxBlur(e, w, h, r);
}

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src;
  const inv = 1 / (2 * r + 1);
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x <= r; x++) s += src[y * w + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { tmp[y * w + x] = s * inv; s += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)]; } }
  const out = new Float32Array(w * h);
  for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { out[y * w + x] = s * inv; s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
  return out;
}

/** Majority-vote (mode) filter of a selection-index map over a (2r+1)² window —
 *  erases isolated selection flips (the grain) while region boundaries survive.
 *  nFrames is small, so a per-pixel count array is cheap. */
function modeFilter(idx: Int16Array, w: number, h: number, nFrames: number, r: number): Int16Array {
  if (r < 1) return idx;
  const out = new Int16Array(w * h);
  const cnt = new Int32Array(nFrames);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      cnt.fill(0);
      let best = idx[y * w + x], bc = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy)) * w;
        for (let dx = -r; dx <= r; dx++) {
          const v = idx[yy + Math.min(w - 1, Math.max(0, x + dx))];
          const c = ++cnt[v];
          if (c > bc) { bc = c; best = v; }
        }
      }
      out[y * w + x] = best;
    }
  }
  return out;
}

/**
 * Focus-stack a set at working resolution `longEdge` (pass a huge value for
 * full native resolution). Two streaming passes: (1) decode each frame, build
 * its focus measure, keep the running argmax → a selection map; mode-filter it;
 * (2) decode each frame again and gather its selected pixels.
 */
async function stackSelect(frames: StackFrame[], longEdge: number, align: boolean, hold: boolean, onProgress?: StackOptions["onProgress"]): Promise<StackResult> {
  const total = frames.length;
  if (!total) throw new Error("No frames to stack.");
  // `hold` (preview): keep every decoded frame so gather needs no second decode
  // — the small preview frames fit in RAM. Full-res sets hold=false and instead
  // re-decodes in pass 2, so it never holds more than one 20 MP frame at once.
  const steps = total * (hold ? 1 : 2) + 1;
  let step = 0;

  const first = await decodeAt(frames[0].blob, longEdge);
  const w = first.width, h = first.height, n = w * h;
  const refL = luma(first.data, n);

  const bestE = new Float32Array(n);
  const idx = new Int16Array(n);
  const shifts: { name: string; dx: number; dy: number }[] = [];
  const kept: (Uint8ClampedArray | null)[] = hold ? [] : [];
  // Smoothing scaled to the ACTUAL resolution (not the longEdge cap), so the
  // selection field has the same coherence at preview and full-res.
  const res = Math.max(w, h);
  const fmR = Math.max(3, Math.round((4 * res) / 2048));

  // Pass 1: selection map (+ keep frames when hold).
  for (let f = 0; f < total; f++) {
    onProgress?.(step++, steps, "analysing");
    const img = f === 0 ? first : await decodeAt(frames[f].blob, longEdge);
    if (img.width !== w || img.height !== h) throw new Error("Frames are not the same size — is this one focus-shift set?");
    const [dx, dy] = f === 0 || !align ? [0, 0] : estimateShift(refL, luma(img.data, n), w, h);
    shifts.push({ name: frames[f].name, dx, dy });
    if (hold) kept.push(img.data);
    const E = focusMeasure(luma(img.data, n), w, h, fmR);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = y * w + x;
        const sx = Math.min(w - 1, Math.max(0, x + dx));
        const sy = Math.min(h - 1, Math.max(0, y + dy));
        const e = E[sy * w + sx];
        if (f === 0 || e > bestE[o]) { bestE[o] = e; idx[o] = f; }
      }
    }
  }

  onProgress?.(step++, steps, "cleaning");
  const r = Math.max(2, Math.min(8, Math.round((2 * res) / 2048)));
  const idxF = modeFilter(idx, w, h, total, r);

  // Pass 2: gather the selected pixels (from kept frames, or re-decode).
  const out = new ImageData(w, h);
  for (let f = 0; f < total; f++) {
    let d: Uint8ClampedArray;
    if (hold) {
      d = kept[f]!;
    } else {
      onProgress?.(step++, steps, "compositing");
      d = (await decodeAt(frames[f].blob, longEdge)).data;
    }
    const { dx, dy } = shifts[f];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = y * w + x;
        if (idxF[o] !== f) continue;
        const sx = Math.min(w - 1, Math.max(0, x + dx));
        const sy = Math.min(h - 1, Math.max(0, y + dy));
        const si = (sy * w + sx) * 4;
        out.data[o * 4] = d[si]; out.data[o * 4 + 1] = d[si + 1]; out.data[o * 4 + 2] = d[si + 2]; out.data[o * 4 + 3] = 255;
      }
    }
  }

  onProgress?.(steps, steps, "done");
  return { image: out, shifts, width: w, height: h };
}

export function stackFocus(frames: StackFrame[], opts: StackOptions): Promise<StackResult> {
  // Preview: hold the small frames in RAM for a single decode pass.
  return stackSelect(frames, opts.longEdge, opts.align ?? true, true, opts.onProgress);
}

export function stackFocusFullRes(frames: StackFrame[], opts: FullResOptions = {}): Promise<StackResult> {
  // Full native resolution (1e9 px cap => no downscale); memory-bounded two-pass.
  return stackSelect(frames, 1e9, opts.align ?? true, false, opts.onProgress);
}
