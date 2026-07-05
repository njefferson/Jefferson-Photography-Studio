// CPU version of the GPU edit pipeline, kept numerically identical to the
// fragment shader in gl.ts so exports match the on-screen preview exactly.
// Order: white balance -> channel swap -> hue -> saturation -> contrast -> gamma.

export interface EditParams {
  wb: [number, number, number];
  exposure: number;
  swapRB: boolean;
  hue: number; // degrees
  sat: number;
  contrast: number;
  /** 0..1 bilateral strength, applied to LINEAR data BEFORE everything else
   *  (see raw/denoise.ts) — not part of compileEdit's per-pixel math. */
  denoise: number;
  /** Per-channel tone tint applied after saturation (e.g. sepia over mono).
   *  [1,1,1] = none. */
  tint: [number, number, number];
  /** 0..1 HIE halation strength. Spatial (uses the per-image glow map); the
   *  per-pixel amount is passed into the compiled edit as `glow`. */
  glow: number;
  /** Per-colour band adjustments: [hueShiftDeg, satScale, lumScale].
   *  The two bands split the whole hue circle: sky takes one half, foliage
   *  the complement — every colour on screen answers to exactly one box, no
   *  dead zone. The bands FOLLOW THE SUBJECT through a channel swap: with
   *  swap off, sky = the cool half (centred 210°); with swap on, the swap has
   *  reflected every hue (h -> 240 - h), so the sky band re-centres on 30° to
   *  keep pointing at the same real-world subject. Labels stay honest.
   *  Neutral = [0, 1, 1]. */
  sky: [number, number, number];
  foliage: [number, number, number];
  /** Tone curve control-point outputs at inputs [0,.25,.5,.75,1]:
   *  blacks, shadows, midtones, whites, highlights. Identity = TONE_DEFAULT.
   *  Applied per channel in display (gamma) space, after everything else. */
  tone: [number, number, number, number, number];
  /** Global luminance: one overall lift/drop that rides ON TOP of the tone
   *  curve. Applied per channel in display (gamma) space as the very last
   *  step: out = pow(out, 1/lum). >1 brightens the body, <1 darkens; the 0/1
   *  endpoints stay pinned so it lifts shadows/midtones without clipping.
   *  Neutral = 1. Same math in the shader (u_lum). */
  lum: number;
  /** Local masks (radial / linear gradient), each carrying a few local
   *  adjustments applied weighted by the mask, in linear space before global
   *  contrast/gamma. Spatial (they read the pixel's image-uv), so — like
   *  denoise and glow — they are NOT baked into the .cube LUT. Max MAX_MASKS. */
  masks: MaskLayer[];
  /** IR lens corrections — a radial LUMINANCE gain in linear space, just after
   *  white balance (a flat-field correction). Spatial (needs image-uv), so
   *  skipped in the .cube LUT like masks/denoise/glow.
   *  - hotspot 0..0.8: darkens the centre to cancel the IR hot-spot.
   *  - hotspotSize 0.15..1: radial extent of the hot-spot region.
   *  - vignette -1..1: + brightens corners (correct falloff), - darkens them. */
  hotspot: number;
  hotspotSize: number;
  vignette: number;
}

export const MAX_MASKS = 4;

/** A painted brush mask: a single-channel 0..255 weight bitmap at a small
 *  working resolution (bilinearly sampled). `rev` bumps on each stroke so undo
 *  equality can compare cheaply without serialising the pixels. */
export interface BrushMask {
  w: number;
  h: number;
  data: Uint8Array;
}

/** A local-adjustment mask. `type` 0 = radial, 1 = linear gradient, 2 = brush.
 *  Geometry is in image-uv [0..1] so it anchors to the photo through
 *  rotation/zoom. */
export interface MaskLayer {
  type: 0 | 1 | 2;
  cx: number; // radial: centre x; linear: start x
  cy: number; // radial: centre y; linear: start y
  rx: number; // radial: x radius (uv fraction)
  ry: number; // radial: y radius (uv fraction)
  feather: number; // radial: 0..1 soft edge
  lx: number; // linear: end x
  ly: number; // linear: end y
  invert: boolean;
  brush?: BrushMask; // type 2 only
  rev?: number; // bumps on each brush stroke (undo equality)
  // Local adjustments — neutral = brightness/contrast/saturation 1, hue/warmth 0.
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number; // degrees
  warmth: number; // -1..1, + warmer
}

export function neutralMask(type: 0 | 1 | 2): MaskLayer {
  const base = { cx: 0.5, cy: 0.5, rx: 0.35, ry: 0.35, feather: 0.5, lx: 0.5, ly: 0.85, invert: false, brightness: 1, contrast: 1, saturation: 1, hue: 0, warmth: 0 };
  if (type === 1) return { ...base, type, cx: 0.5, cy: 0.12, lx: 0.5, ly: 0.5 };
  if (type === 2) return { ...base, type, rev: 0 };
  return { ...base, type };
}

export function maskIsActive(m: MaskLayer): boolean {
  return m.brightness !== 1 || m.contrast !== 1 || m.saturation !== 1 || m.hue !== 0 || m.warmth !== 0;
}

function smooth01(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1e-4)));
  return t * t * (3 - 2 * t);
}

/** Bilinear sample of a brush bitmap (0..1) at image-uv. Matches the GPU's
 *  LINEAR texture sampling of the packed brush texture. */
function sampleBrush(b: BrushMask, u: number, v: number): number {
  const fx = Math.min(1, Math.max(0, u)) * (b.w - 1);
  const fy = Math.min(1, Math.max(0, v)) * (b.h - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(b.w - 1, x0 + 1), y1 = Math.min(b.h - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const s = (x: number, y: number) => b.data[y * b.w + x];
  const top = s(x0, y0) * (1 - tx) + s(x1, y0) * tx;
  const bot = s(x0, y1) * (1 - tx) + s(x1, y1) * tx;
  return (top * (1 - ty) + bot * ty) / 255;
}

/** Mask weight 0..1 at image-uv (u,v). Kept numerically identical to the shader. */
export function maskWeight(m: MaskLayer, u: number, v: number): number {
  let w: number;
  if (m.type === 0) {
    const dx = (u - m.cx) / Math.max(1e-4, m.rx);
    const dy = (v - m.cy) / Math.max(1e-4, m.ry);
    const r = Math.sqrt(dx * dx + dy * dy);
    w = 1 - smooth01(1 - m.feather, 1, r); // 1 in the core, 0 past the edge
  } else if (m.type === 1) {
    const gx = m.lx - m.cx, gy = m.ly - m.cy;
    const len2 = gx * gx + gy * gy || 1e-4;
    const t = ((u - m.cx) * gx + (v - m.cy) * gy) / len2;
    w = 1 - Math.min(1, Math.max(0, t)); // full at the start point, 0 at the end
  } else {
    w = m.brush ? sampleBrush(m.brush, u, v) : 0;
  }
  return m.invert ? 1 - w : w;
}

export const TONE_X = [0, 0.25, 0.5, 0.75, 1] as const;
export const TONE_DEFAULT: [number, number, number, number, number] = [0, 0.25, 0.5, 0.75, 1];

export function toneIsIdentity(y: readonly number[]): boolean {
  return y.every((v, i) => Math.abs(v - TONE_DEFAULT[i]) < 1e-4);
}

/**
 * Monotone cubic (Fritsch–Carlson) through the five fixed-x control points —
 * smooth, and never overshoots between points. Same curve drives the GPU LUT,
 * the CPU export and the on-screen widget.
 */
export function toneEvaluator(y: readonly number[]): (v: number) => number {
  const x = TONE_X;
  const n = 5;
  const d: number[] = [];
  const m: number[] = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (v: number) => {
    if (v <= 0) return y[0];
    if (v >= 1) return y[4];
    let i = 3;
    if (v < x[1]) i = 0;
    else if (v < x[2]) i = 1;
    else if (v < x[3]) i = 2;
    const h = x[i + 1] - x[i];
    const t = (v - x[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const out =
      y[i] * (2 * t3 - 3 * t2 + 1) +
      m[i] * h * (t3 - 2 * t2 + t) +
      y[i + 1] * (-2 * t3 + 3 * t2) +
      m[i + 1] * h * (t3 - t2);
    return Math.min(1, Math.max(0, out));
  };
}

/** Radial IR-lens correction gain at image-uv (u,v). Elliptical to the frame
 *  (a circle in uv), so no aspect term is threaded through. Kept numerically
 *  identical to the shader. 1 = no change. */
export function radialGain(hotspot: number, hotspotSize: number, vignette: number, u: number, v: number): number {
  const ex = (u - 0.5) * 2, ey = (v - 0.5) * 2;
  const r = Math.sqrt(ex * ex + ey * ey); // 0 centre, 1 edge-mid, ~1.414 corner
  const gVig = 1 + vignette * 0.85 * smooth01(0.1, 1.4142, r);
  const gHot = 1 - hotspot * (1 - smooth01(0, Math.max(1e-3, hotspotSize), r));
  return Math.max(0, gVig * gHot);
}

// --- HSV helpers shared by the per-colour bands (mirrored in the shader) ---

function rgb2hsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-9) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max < 1e-9 ? 0 : d / max, max];
}

function hsv2rgb(h: number, s: number, v: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [r + m, g + m, b + m];
}

/** Band weight: 1 inside the plateau, smoothstep falloff to 0. */
function bandWeight(hue: number, center: number, plateau: number, edge: number): number {
  let d = Math.abs(hue - center);
  if (d > 180) d = 360 - d;
  if (d <= plateau) return 1;
  if (d >= edge) return 0;
  const t = (d - plateau) / (edge - plateau);
  return 1 - t * t * (3 - 2 * t);
}

const REC709 = [0.2126, 0.7152, 0.0722];

// (The per-pixel edit lives in compileEdit below; the GPU shader in gl.ts is
// kept numerically identical to it.)

/**
 * Precompute the edit for export: trig and the hue matrix are computed once,
 * not per pixel. Returns a function writing gamma RGB (0..1) into `out`.
 */
export function compileEdit(
  p: EditParams,
  cam?: number[],
): (r: number, g: number, b: number, out: Float32Array, glow?: number, u?: number, v?: number) => void {
  const a = (p.hue * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const c00 = 0.299 + 0.701 * cos + 0.168 * sin;
  const c01 = 0.587 - 0.587 * cos + 0.33 * sin;
  const c02 = 0.114 - 0.114 * cos - 0.497 * sin;
  const c10 = 0.299 - 0.299 * cos - 0.328 * sin;
  const c11 = 0.587 + 0.413 * cos + 0.035 * sin;
  const c12 = 0.114 - 0.114 * cos + 0.292 * sin;
  const c20 = 0.299 - 0.3 * cos + 1.25 * sin;
  const c21 = 0.587 - 0.588 * cos - 1.05 * sin;
  const c22 = 0.114 + 0.886 * cos - 0.203 * sin;
  // Fold exposure into the WB gains (both linear; order commutes).
  const ex = p.exposure;
  const wr = p.wb[0] * ex, wg = p.wb[1] * ex, wb = p.wb[2] * ex;
  const swap = p.swapRB;
  const sat = p.sat;
  const con = p.contrast;
  const [tr, tg, tb] = p.tint;
  const toneFn = toneIsIdentity(p.tone) ? null : toneEvaluator(p.tone);
  // Global luminance rides on top of the tone curve: pow in display space,
  // endpoints pinned. exponent = 1/lum (lum>1 brightens). 1 = neutral.
  const lumExp = p.lum && p.lum !== 1 ? 1 / p.lum : 0;
  const sky = p.sky;
  const fol = p.foliage;
  const bandsActive =
    sky[0] !== 0 || sky[1] !== 1 || sky[2] !== 1 || fol[0] !== 0 || fol[1] !== 1 || fol[2] !== 1;
  const masks = (p.masks ?? []).filter(maskIsActive).slice(0, MAX_MASKS);
  const lensOn = (p.hotspot ?? 0) !== 0 || (p.vignette ?? 0) !== 0;

  return (r, g, b, out, glow = 0, u, v) => {
    r *= wr;
    g *= wg;
    b *= wb;
    // IR lens correction: radial luminance gain after WB (spatial -> skipped in
    // the LUT bake where u/v are absent), matching the shader.
    if (lensOn && u !== undefined && v !== undefined) {
      const gain = radialGain(p.hotspot, p.hotspotSize, p.vignette, u, v);
      r *= gain; g *= gain; b *= gain;
    }
    // Camera-native -> linear sRGB (after WB, before swap), matching the shader.
    if (cam) {
      const cr = cam[0] * r + cam[1] * g + cam[2] * b;
      const cg = cam[3] * r + cam[4] * g + cam[5] * b;
      const cb = cam[6] * r + cam[7] * g + cam[8] * b;
      r = cr;
      g = cg;
      b = cb;
    }
    if (swap) {
      const t = r;
      r = b;
      b = t;
    }
    let nr = c00 * r + c10 * g + c20 * b;
    let ng = c01 * r + c11 * g + c21 * b;
    let nb = c02 * r + c12 * g + c22 * b;
    const luma = nr * REC709[0] + ng * REC709[1] + nb * REC709[2];
    // Match the shader: saturation boosts fade out in deep shadows
    // (smoothstep(0.02, 0.20, luma)) so they don't amplify chroma noise.
    let satEff = sat;
    if (sat > 1) {
      const t = Math.min(1, Math.max(0, (luma - 0.02) / 0.18));
      satEff = 1 + (sat - 1) * t * t * (3 - 2 * t);
    }
    nr = luma + (nr - luma) * satEff;
    ng = luma + (ng - luma) * satEff;
    nb = luma + (nb - luma) * satEff;
    // Per-colour bands (complementary cool/warm halves), matching the shader:
    // hue shift, sat scale and lum scale weighted by hue distance to the band.
    if (bandsActive) {
      const cr = Math.max(0, nr);
      const cg = Math.max(0, ng);
      const cb = Math.max(0, nb);
      let [h, s, v] = rgb2hsv(cr, cg, cb);
      // R<->B swap reflects hue (h -> 240 - h); re-centre so the sky band
      // stays glued to the same subject in both swap states.
      const wS = bandWeight(h, swap ? 30 : 210, 55, 105);
      const wF = 1 - wS;
      h += sky[0] * wS + fol[0] * wF;
      s = Math.min(1, s * (1 + (sky[1] - 1) * wS) * (1 + (fol[1] - 1) * wF));
      v = v * (1 + (sky[2] - 1) * wS) * (1 + (fol[2] - 1) * wF);
      [nr, ng, nb] = hsv2rgb(h, s, v);
    }
    // Tone tint (sepia etc.) after saturation so it survives mono looks.
    nr *= tr;
    ng *= tg;
    nb *= tb;
    // Halation glow: scattered light adds in LINEAR, before contrast/gamma.
    nr += glow;
    ng += glow;
    nb += glow;
    // Local masks: each adjustment weighted by the mask, in linear space before
    // global contrast/gamma. Spatial (needs image-uv), so skipped when u/v are
    // absent (e.g. the .cube LUT bake) — matching denoise/glow.
    if (masks.length && u !== undefined && v !== undefined) {
      for (const m of masks) {
        const w = maskWeight(m, u, v);
        if (w <= 0) continue;
        // warmth (linear temp shift)
        nr *= 1 + 0.5 * m.warmth * w;
        nb *= 1 - 0.5 * m.warmth * w;
        // brightness (linear multiply)
        const bf = 1 + (m.brightness - 1) * w;
        nr *= bf; ng *= bf; nb *= bf;
        // saturation (luma-based, matches the global sat model)
        const L = nr * REC709[0] + ng * REC709[1] + nb * REC709[2];
        const sf = 1 + (m.saturation - 1) * w;
        nr = L + (nr - L) * sf; ng = L + (ng - L) * sf; nb = L + (nb - L) * sf;
        // hue rotate by hue*w degrees (same matrix as the global hue)
        if (m.hue !== 0) {
          const a = (m.hue * Math.PI) / 180 * w;
          const cs = Math.cos(a), sn = Math.sin(a);
          const k00 = 0.299 + 0.701 * cs + 0.168 * sn, k01 = 0.587 - 0.587 * cs + 0.33 * sn, k02 = 0.114 - 0.114 * cs - 0.497 * sn;
          const k10 = 0.299 - 0.299 * cs - 0.328 * sn, k11 = 0.587 + 0.413 * cs + 0.035 * sn, k12 = 0.114 - 0.114 * cs + 0.292 * sn;
          const k20 = 0.299 - 0.3 * cs + 1.25 * sn, k21 = 0.587 - 0.588 * cs - 1.05 * sn, k22 = 0.114 + 0.886 * cs - 0.203 * sn;
          const rr = k00 * nr + k10 * ng + k20 * nb;
          const gg = k01 * nr + k11 * ng + k21 * nb;
          const bb = k02 * nr + k12 * ng + k22 * nb;
          nr = rr; ng = gg; nb = bb;
        }
        // contrast (linear, around mid grey)
        const cf = 1 + (m.contrast - 1) * w;
        nr = (nr - 0.5) * cf + 0.5; ng = (ng - 0.5) * cf + 0.5; nb = (nb - 0.5) * cf + 0.5;
      }
    }
    out[0] = toGamma((nr - 0.5) * con + 0.5);
    out[1] = toGamma((ng - 0.5) * con + 0.5);
    out[2] = toGamma((nb - 0.5) * con + 0.5);
    if (toneFn) {
      out[0] = toneFn(out[0]);
      out[1] = toneFn(out[1]);
      out[2] = toneFn(out[2]);
    }
    // Global luminance — the very last step, matching the shader's u_lum.
    if (lumExp) {
      out[0] = Math.pow(out[0], lumExp);
      out[1] = Math.pow(out[1], lumExp);
      out[2] = Math.pow(out[2], lumExp);
    }
  };
}

function toGamma(v: number): number {
  return Math.pow(Math.min(1, Math.max(0, v)), 1 / 2.2);
}

/** Linearize an 8-bit gamma-encoded value (matches the shader's toLinear). */
export function toLinear8(v: number): number {
  return Math.pow(v / 255, 2.2);
}
