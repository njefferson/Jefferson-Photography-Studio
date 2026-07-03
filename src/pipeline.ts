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
): (r: number, g: number, b: number, out: Float32Array, glow?: number) => void {
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

  return (r, g, b, out, glow = 0) => {
    r *= wr;
    g *= wg;
    b *= wb;
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
    // Tone tint (sepia etc.) after saturation so it survives mono looks.
    nr *= tr;
    ng *= tg;
    nb *= tb;
    // Halation glow: scattered light adds in LINEAR, before contrast/gamma.
    nr += glow;
    ng += glow;
    nb += glow;
    out[0] = toGamma((nr - 0.5) * con + 0.5);
    out[1] = toGamma((ng - 0.5) * con + 0.5);
    out[2] = toGamma((nb - 0.5) * con + 0.5);
  };
}

function toGamma(v: number): number {
  return Math.pow(Math.min(1, Math.max(0, v)), 1 / 2.2);
}

/** Linearize an 8-bit gamma-encoded value (matches the shader's toLinear). */
export function toLinear8(v: number): number {
  return Math.pow(v / 255, 2.2);
}
