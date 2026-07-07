// Macro focus-stacking engine (JPEG-first). Combines a focus-shift burst into
// one image that is sharp everywhere the stack had focus, leaving the bokeh
// smooth. Classical DSP, no ML.
//
// METHOD — depth-map selection (the "DMap" family) refined for high-contrast
// backlit subjects, reached after several tries measured on real frames
// (2026-07-06/07). Earlier attempts and why they failed: soft weighted MEAN
// veiled the subject; hard per-pixel ARGMAX was grainy on low-texture surfaces;
// a Laplacian-PYRAMID band merge rang into bright halos on thin petals; a raw
// COLOUR GUIDED-FILTER selection map still printed a bright "cut-out" rim and
// (with a detail-protect step) posterised the background.
//
// The pipeline now:
//   1. Per-pixel focus measure (RGB modified-Laplacian) → running ARGMAX gives
//      a selection map + a free argmax-stack guidance image; a running frame
//      AVERAGE is accumulated in the same pass.
//   2. A fast COLOUR guided filter refines the selection so its transitions
//      snap to real image edges (no bleed past a petal edge).
//   3. A CONFIDENCE weight (from the smoothed focus measure) gathers the crisp
//      selected pixel where there is real focus signal (the subject) and fades
//      to the frame AVERAGE where there is none (out-of-focus background). The
//      average is halo-free and constant, so the boundary can't print a bright
//      rim or per-frame bloom contours.
//   4. On real edges only, a DE-HALO pulls down transient bright overshoot and
//      a DE-FRINGE desaturates the warm/cool longitudinal-CA colour fringe.
// LIMIT: a strongly backlit, high-contrast, high-CA edge (magenta on a blown
// highlight) still leaves a faint soft rim — the automatic sharp-vs-clean floor;
// that specific case wants a manual retouch brush (desktop stacker territory).
//
// MEMORY: per-pixel throughout (no spatial pyramid), so NO tiling even at 20 MP.
// Two streaming passes, one frame decoded at a time; only whole-image maps
// (index / focus / Uint16 sums / output) stay resident. Peak RAM is independent
// of frame count.
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
function guidedDepth(gr: Uint8Array, gg: Uint8Array, gb: Uint8Array, p: Float32Array, w: number, h: number, radius: number, eps: number, s: number): Float32Array {
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
  // apply at full res with bilinear-sampled coefficients + full-res guidance
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
      out[i] = samp(maR, fx, fy) * (gr[i] / 255) + samp(maG, fx, fy) * (gg[i] / 255) + samp(maB, fx, fy) * (gb[i] / 255) + samp(mbB, fx, fy);
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
  // Running SUM of every (aligned) frame → the frame AVERAGE, used to dissolve
  // the out-of-focus background to a stable mean (kills the selection rim + the
  // per-frame bloom contours). Uint16 keeps it memory-light at 20 MP; 255·N
  // stays exact up to N=257 frames, far beyond any real macro stack.
  const sumR = new Uint16Array(n), sumG = new Uint16Array(n), sumB = new Uint16Array(n);
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
        const si = (sy * w + sx) * 4;
        sumR[o] += d[si]; sumG[o] += d[si + 1]; sumB[o] += d[si + 2];
        const e = E[sy * w + sx];
        if (f === 0 || e > bestE[o]) {
          bestE[o] = e; idx[o] = f;
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
  const gd = guidedDepth(gr, gg, gb, depth, w, h, gRadius, 1e-4, sub);
  const idxF = new Int16Array(n);
  for (let i = 0; i < n; i++) { let v = Math.round(gd[i]); idxF[i] = v < 0 ? 0 : v > total - 1 ? total - 1 : v; }

  // CONFIDENCE weight: how much real focus signal a pixel has. On the subject
  // (sharp texture / edges) the focus measure peaks high; on the flat OOF
  // background it is ~0. We smooth bestE, then map it through a resolution-scaled
  // percentile window to 0..1. In pass 2 we lerp the crisp selected pixel toward
  // the frame AVERAGE by (1-conf): the subject stays fully sharp, but the
  // background — and the thin ring just outside the subject — dissolves to a
  // stable mean, so the selection boundary can't print a bright rim or the
  // per-frame bloom contours. (This is what a hard depth-map selection alone
  // could never do; verified against the field halo, 2026-07-07.)
  const confSmR = Math.max(6, Math.round(res / 110));
  const sm = boxBlur(bestE, w, h, confSmR);
  const samp: number[] = [];
  for (let i = 0; i < n; i += 17) samp.push(sm[i]);
  samp.sort((a, b) => a - b);
  const pct = (q: number) => samp[Math.min(samp.length - 1, Math.max(0, Math.round(q * (samp.length - 1))))];
  const cLo = pct(0.50), cHi = pct(0.80), cInv = 1 / Math.max(1e-6, cHi - cLo);
  // Reuse `sm` in place as the confidence buffer (its blurred values are no
  // longer needed once mapped) — saves a full-res allocation at 20 MP.
  for (let i = 0; i < n; i++) { let t = (sm[i] - cLo) * cInv; t = t < 0 ? 0 : t > 1 ? 1 : t; sm[i] = t * t * (3 - 2 * t); }
  const conf = sm;
  const inv = 1 / total;

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
    // Edge gate scaled to resolution: the guidance gradient at a given real edge
    // is steeper per-pixel at lower working res, so a fixed gate would treat a
    // different band in the 2048 preview than in the native export. Scale it so
    // the SAME edges are treated at any res → preview matches export.
    const gGate = 40 * 5568 / res;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = y * w + x;
        if (idxF[o] !== f) continue;
        const sx = Math.min(w - 1, Math.max(0, x + dx));
        const sy = Math.min(h - 1, Math.max(0, y + dy));
        const si = (sy * w + sx) * 4;
        const c = conf[o], ic = 1 - c;
        const mr = sumR[o] * inv, mg = sumG[o] * inv, mb = sumB[o] * inv;
        let R = d[si] * c + mr * ic, G = d[si + 1] * c + mg * ic, B = d[si + 2] * c + mb * ic;
        // EDGE TREATMENT — only on real high-contrast edges (where the amplified
        // CA rim lives), gated by the guidance gradient so flat subject/background
        // is never touched.
        if (x > 0 && x < w - 1 && y > 0 && y < h - 1) {
          const grad = Math.abs(gr[o + 1] - gr[o - 1]) + Math.abs(gg[o + 1] - gg[o - 1]) + Math.abs(gb[o + 1] - gb[o - 1]) +
            Math.abs(gr[o + w] - gr[o - w]) + Math.abs(gg[o + w] - gg[o - w]) + Math.abs(gb[o + w] - gb[o - w]);
          if (grad > gGate) {
            // (1) DE-HALO: the rim is a BRIGHT OVERSHOOT vs the frame-average
            // (the bright fringe is in only a few frames). Persistent highlights
            // (dew) are bright in the average too, so they read as a small
            // overshoot and survive. Pull the large transient overshoot down.
            const ml = 0.299 * mr + 0.587 * mg + 0.114 * mb;
            const over = (0.299 * R + 0.587 * G + 0.114 * B) - ml;
            if (over > 12) {
              let t = (over - 12) / 48; t = t < 0 ? 0 : t > 1 ? 1 : t; const k = (t * t * (3 - 2 * t)) * 0.95;
              R = R * (1 - k) + mr * k; G = G * (1 - k) + mg * k; B = B * (1 - k) + mb * k;
            }
            // (2) DE-FRINGE: the CA rim is a FALSE WARM HUE — red-dominant with
            // G>B (gold/orange) — belonging to neither the magenta petal (B>G)
            // nor the neutral background. The green sepal is G-dominant, so the
            // R≥G,R≥B gate spares it. Desaturate the warm cast toward luma.
            if (R >= G && R >= B) {
              const warm = G - B;
              if (warm > 8) {
                let t = (warm - 8) / 42; t = t < 0 ? 0 : t > 1 ? 1 : t; const k = (t * t * (3 - 2 * t)) * 0.85;
                const lu = 0.299 * R + 0.587 * G + 0.114 * B;
                R = R * (1 - k) + lu * k; G = G * (1 - k) + lu * k; B = B * (1 - k) + lu * k;
              }
            } else if (B >= G && B > R + 6) {
              // The complementary COOL (blue/violet) CA fringe — B-dominant and
              // clearly bluer than red, which the magenta petal (R≥B) never is.
              const cool = B - R;
              let t = (cool - 6) / 40; t = t < 0 ? 0 : t > 1 ? 1 : t; const k = (t * t * (3 - 2 * t)) * 0.85;
              const lu = 0.299 * R + 0.587 * G + 0.114 * B;
              R = R * (1 - k) + lu * k; G = G * (1 - k) + lu * k; B = B * (1 - k) + lu * k;
            }
          }
        }
        out.data[o * 4] = R; out.data[o * 4 + 1] = G; out.data[o * 4 + 2] = B;
        out.data[o * 4 + 3] = 255;
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
