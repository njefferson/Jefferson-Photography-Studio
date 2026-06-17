// CPU version of the GPU edit pipeline, kept numerically identical to the
// fragment shader in gl.ts so exports match the on-screen preview exactly.
// Order: white balance -> channel swap -> hue -> saturation -> contrast -> gamma.

export interface EditParams {
  wb: [number, number, number];
  swapRB: boolean;
  hue: number; // degrees
  sat: number;
  contrast: number;
}

const REC709 = [0.2126, 0.7152, 0.0722];

/**
 * @param r,g,b linear input (raw is already linear; 8-bit sources must be
 *              linearized by the caller first).
 * @returns gamma-encoded RGB in 0..1.
 */
export function applyEdit(r: number, g: number, b: number, p: EditParams): [number, number, number] {
  // White balance.
  r *= p.wb[0];
  g *= p.wb[1];
  b *= p.wb[2];

  // Channel swap.
  if (p.swapRB) {
    const t = r;
    r = b;
    b = t;
  }

  // Hue rotation (same matrix as the shader).
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
  let nr = c00 * r + c10 * g + c20 * b;
  let ng = c01 * r + c11 * g + c21 * b;
  let nb = c02 * r + c12 * g + c22 * b;

  // Saturation around luma.
  const luma = nr * REC709[0] + ng * REC709[1] + nb * REC709[2];
  nr = luma + (nr - luma) * p.sat;
  ng = luma + (ng - luma) * p.sat;
  nb = luma + (nb - luma) * p.sat;

  // Contrast around mid grey.
  nr = (nr - 0.5) * p.contrast + 0.5;
  ng = (ng - 0.5) * p.contrast + 0.5;
  nb = (nb - 0.5) * p.contrast + 0.5;

  return [toGamma(nr), toGamma(ng), toGamma(nb)];
}

/**
 * Precompute the edit for export: trig and the hue matrix are computed once,
 * not per pixel. Returns a function writing gamma RGB (0..1) into `out`.
 */
export function compileEdit(p: EditParams): (r: number, g: number, b: number, out: Float32Array) => void {
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
  const [wr, wg, wb] = p.wb;
  const swap = p.swapRB;
  const sat = p.sat;
  const con = p.contrast;

  return (r, g, b, out) => {
    r *= wr;
    g *= wg;
    b *= wb;
    if (swap) {
      const t = r;
      r = b;
      b = t;
    }
    let nr = c00 * r + c10 * g + c20 * b;
    let ng = c01 * r + c11 * g + c21 * b;
    let nb = c02 * r + c12 * g + c22 * b;
    const luma = nr * REC709[0] + ng * REC709[1] + nb * REC709[2];
    nr = luma + (nr - luma) * sat;
    ng = luma + (ng - luma) * sat;
    nb = luma + (nb - luma) * sat;
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
