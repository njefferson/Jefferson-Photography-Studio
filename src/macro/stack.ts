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

/** Modified-Laplacian focus measure over all THREE channels, box-blurred by `r`.
 *  Per-channel (not luma) because a saturated subject over a bright background —
 *  a magenta petal on blown cream — has strong CHROMATIC edges but weak LUMA
 *  contrast, so a luma-only measure under-reads the subject. */
function focusMeasure(data: Uint8ClampedArray, w: number, h: number, r: number): Float32Array {
  const e = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, p = i * 4;
      const lr = 4 * data[p] - data[p - 4] - data[p + 4] - data[p - w * 4] - data[p + w * 4];
      const lg = 4 * data[p + 1] - data[p - 3] - data[p + 5] - data[p - w * 4 + 1] - data[p + w * 4 + 1];
      const lb = 4 * data[p + 2] - data[p - 2] - data[p + 6] - data[p - w * 4 + 2] - data[p + w * 4 + 2];
      e[i] = lr * lr + lg * lg + lb * lb;
    }
  }
  return boxBlur(e, w, h, r);
}

/**
 * COLOR guided filter of a depth/selection map `p`, guided by the stacked RGB
 * image, so the depth's transitions snap to real image edges (in ANY channel —
 * the magenta/green chroma edges a luma guide misses). This is what kills the
 * bright "cut-out" rim: the sharp-frame selection can no longer bleed a few px
 * past the true petal edge (field fix IMG_5958, 2026-07-07).
 *
 * FAST guided filter (He & Sun 2015): the coefficients a,b are solved on a
 * SUBSAMPLED image (cheap + memory-safe at 20 MP), then applied with the
 * FULL-RES guidance — so the output edges stay full-res crisp. Guidance is
 * 0..255 bytes; `eps` is in normalised (0..1)² units.
 */
function guidedDepth(gr: Uint8Array, gg: Uint8Array, gb: Uint8Array, p: Float32Array, w: number, h: number, radius: number, eps: number, s: number, dpLo: number, dpHi: number): Float32Array {
  const lw = Math.max(1, Math.ceil(w / s)), lh = Math.max(1, Math.ceil(h / s)), ln = lw * lh;
  const lr = new Float32Array(ln), lg = new Float32Array(ln), lb = new Float32Array(ln), lp = new Float32Array(ln), cnt = new Float32Array(ln);
  // box-average downsample guidance (→0..1) and depth
  for (let y = 0; y < h; y++) {
    const ly = Math.min(lh - 1, (y / s) | 0);
    for (let x = 0; x < w; x++) {
      const lx = Math.min(lw - 1, (x / s) | 0), li = ly * lw + lx, i = y * w + x;
      lr[li] += gr[i] / 255; lg[li] += gg[i] / 255; lb[li] += gb[i] / 255; lp[li] += p[i]; cnt[li]++;
    }
  }
  for (let i = 0; i < ln; i++) { const c = cnt[i] || 1; lr[i] /= c; lg[i] /= c; lb[i] /= c; lp[i] /= c; }
  const rl = Math.max(1, Math.round(radius / s));
  const bm = (a: Float32Array) => boxBlur(a, lw, lh, rl);
  const mr = bm(lr), mg = bm(lg), mb = bm(lb), mp = bm(lp);
  const mul = (a: Float32Array, b: Float32Array) => { const t = new Float32Array(ln); for (let i = 0; i < ln; i++) t[i] = a[i] * b[i]; return bm(t); };
  const crp = mul(lr, lp), cgp = mul(lg, lp), cbp = mul(lb, lp);
  const vrr = mul(lr, lr), vrg = mul(lr, lg), vrb = mul(lr, lb), vgg = mul(lg, lg), vgb = mul(lg, lb), vbb = mul(lb, lb);
  const aR = new Float32Array(ln), aG = new Float32Array(ln), aB = new Float32Array(ln), bB = new Float32Array(ln);
  for (let i = 0; i < ln; i++) {
    const covr = crp[i] - mr[i] * mp[i], covg = cgp[i] - mg[i] * mp[i], covb = cbp[i] - mb[i] * mp[i];
    const a = vrr[i] - mr[i] * mr[i] + eps, b = vrg[i] - mr[i] * mg[i], c = vrb[i] - mr[i] * mb[i];
    const d = vgg[i] - mg[i] * mg[i] + eps, e = vgb[i] - mg[i] * mb[i], f = vbb[i] - mb[i] * mb[i] + eps;
    const A = d * f - e * e, B = c * e - b * f, C = b * e - c * d, D = a * f - c * c, E = b * c - a * e, Ff = a * d - b * b;
    let det = a * A + b * B + c * C; if (det > -1e-12 && det < 1e-12) det = 1e-12;
    const id = 1 / det;
    aR[i] = (A * covr + B * covg + C * covb) * id;
    aG[i] = (B * covr + D * covg + E * covb) * id;
    aB[i] = (C * covr + E * covg + Ff * covb) * id;
    bB[i] = mp[i] - aR[i] * mr[i] - aG[i] * mg[i] - aB[i] * mb[i];
  }
  const maR = bm(aR), maG = bm(aG), maB = bm(aB), mbB = bm(bB);
  // apply at full res with bilinear-sampled coefficients + full-res guidance.
  // DETAIL-PROTECT: where the full-res guidance has genuine local structure (a
  // real petal edge / texture — high per-pixel colour gradient), snap the depth
  // back to the crisp raw selection `p`; only in flat regions (bokeh, blown
  // background, and the thin ring of background just outside a petal — all low
  // gradient) does the smoothed guided depth win. A per-pixel (unblurred)
  // gradient separates a petal surface from the flat background one step outside
  // it, so the finest petals stay sharp while the rim stays clean.
  const out = new Float32Array(w * h);
  const samp = (arr: Float32Array, fx: number, fy: number) => {
    const x0 = Math.min(lw - 1, Math.max(0, fx | 0)), y0 = Math.min(lh - 1, Math.max(0, fy | 0));
    const x1 = Math.min(lw - 1, x0 + 1), y1 = Math.min(lh - 1, y0 + 1);
    const tx = fx - (fx | 0), ty = fy - (fy | 0);
    const a = arr[y0 * lw + x0], b = arr[y0 * lw + x1], c = arr[y1 * lw + x0], d = arr[y1 * lw + x1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
  for (let y = 0; y < h; y++) {
    const fy = (y + 0.5) / s - 0.5;
    for (let x = 0; x < w; x++) {
      const fx = (x + 0.5) / s - 0.5, i = y * w + x;
      let g = samp(maR, fx, fy) * (gr[i] / 255) + samp(maG, fx, fy) * (gg[i] / 255) + samp(maB, fx, fy) * (gb[i] / 255) + samp(mbB, fx, fy);
      if (x > 0 && x < w - 1 && y > 0 && y < h - 1) {
        const grad = (Math.abs(gr[i + 1] - gr[i - 1]) + Math.abs(gg[i + 1] - gg[i - 1]) + Math.abs(gb[i + 1] - gb[i - 1]) +
          Math.abs(gr[i + w] - gr[i - w]) + Math.abs(gg[i + w] - gg[i - w]) + Math.abs(gb[i + w] - gb[i - w])) / 255;
        let t = (grad - dpLo) / (dpHi - dpLo); t = t < 0 ? 0 : t > 1 ? 1 : t; t = t * t * (3 - 2 * t);
        g = p[i] * t + g * (1 - t);
      }
      out[i] = g;
    }
  }
  return out;
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
  // Running argmax-stack RGB = the guidance image for the guided filter (built
  // free during pass 1, no extra decode). Bytes to keep it light at 20 MP.
  const gr = new Uint8Array(n), gg = new Uint8Array(n), gb = new Uint8Array(n);
  const shifts: { name: string; dx: number; dy: number }[] = [];
  const kept: (Uint8ClampedArray | null)[] = hold ? [] : [];
  const res = Math.max(w, h);
  // Measure smoothing scaled to resolution; kept modest so edges stay tight (the
  // guided filter, not this blur, does the spatial coherence).
  const fmR = Math.max(2, Math.round(res / 1600));

  // Pass 1: selection map + guidance (+ keep frames when hold).
  for (let f = 0; f < total; f++) {
    onProgress?.(step++, steps, "analysing");
    const img = f === 0 ? first : await decodeAt(frames[f].blob, longEdge);
    if (img.width !== w || img.height !== h) throw new Error("Frames are not the same size — is this one focus-shift set?");
    const [dx, dy] = f === 0 || !align ? [0, 0] : estimateShift(refL, luma(img.data, n), w, h);
    shifts.push({ name: frames[f].name, dx, dy });
    if (hold) kept.push(img.data);
    const E = focusMeasure(img.data, w, h, fmR);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = y * w + x;
        const sx = Math.min(w - 1, Math.max(0, x + dx));
        const sy = Math.min(h - 1, Math.max(0, y + dy));
        const e = E[sy * w + sx];
        if (f === 0 || e > bestE[o]) {
          bestE[o] = e; idx[o] = f;
          const si = (sy * w + sx) * 4;
          gr[o] = d[si]; gg[o] = d[si + 1]; gb[o] = d[si + 2];
        }
      }
    }
  }

  // Refine the selection with a COLOR guided filter: snaps depth transitions to
  // real image edges so the sharp-frame selection can't bleed past a petal edge
  // (no bright rim), while keeping the subject crisp.
  onProgress?.(step++, steps, "cleaning");
  const depth = new Float32Array(n);
  for (let i = 0; i < n; i++) depth[i] = idx[i];
  const gRadius = Math.max(6, Math.round(res / 200));
  const sub = Math.max(2, Math.round(res / 900));
  // Detail-protect gradient thresholds (normalised 0..1 colour-gradient units):
  // below dpLo → fully smoothed guided depth (bokeh/rim stays clean), above dpHi
  // → fully crisp raw selection (finest petals stay sharp), smoothstep between.
  // The per-pixel gradient at a given real edge is STEEPER at lower working res
  // (the same edge spans fewer pixels), so a fixed threshold over-fires on the
  // 2048 px preview and drags the argmax rim/grain back in — even though the
  // native-res export is clean. Scale the thresholds inversely with res
  // (calibrated at ~5.5k px long edge) so preview and export behave identically.
  const dpk = 5568 / res;
  const gd = guidedDepth(gr, gg, gb, depth, w, h, gRadius, 1e-4, sub, 0.10 * dpk, 0.24 * dpk);
  const idxF = new Int16Array(n);
  for (let i = 0; i < n; i++) { let v = Math.round(gd[i]); idxF[i] = v < 0 ? 0 : v > total - 1 ? total - 1 : v; }

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
