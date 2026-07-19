// Playful warp tools — Swirl / Push (liquefy) / Pinch & Bloat. A per-photo UV
// DISPLACEMENT FIELD: each output pixel at uv reads the source at uv + d(uv).
// The field is painted with finger strokes (brush-bitmap pattern) and applied
// as a source-space remap — in the shader inside fetchLin, and in the CPU
// export sampler — so preview and export agree.
//
// PARITY: both sides bilinear-sample the SAME RGBA8-encoded field (GL's
// u*size-0.5 CLAMP_TO_EDGE convention, replicated here) and decode identically,
// so the quantisation matches exactly — the brush-mask half-texel lesson,
// applied to a field that MOVES samples.

export const WARP_RES = 160; // field resolution (square, over uv [0,1]^2)
export const WARP_MAX = 0.28; // max |displacement| in uv units (encoded range)

export interface WarpField {
  res: number;
  du: Float32Array; // res*res, displacement u (uv units) — the paintable form
  dv: Float32Array;
  rgba: Uint8Array; // res*res*4, encoded (du,dv) in R,G — the SAMPLED form
  rev: number; // bumped per stroke (cheap undo equality, like brush masks)
}

export function makeWarpField(): WarpField {
  const n = WARP_RES * WARP_RES;
  const rgba = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) { rgba[i * 4] = 128; rgba[i * 4 + 1] = 128; rgba[i * 4 + 3] = 255; }
  return { res: WARP_RES, du: new Float32Array(n), dv: new Float32Array(n), rgba, rev: 0 };
}

// Encoding centres on byte 128 = EXACTLY zero displacement (scale 127), so an
// unpainted cell inside a painted field doesn't nudge the image — an offset
// encoding (0.5·255) leaves a ~1.5px residual everywhere. Shader + CPU decode
// must match: d = (byte - 128) / 127 * WARP_MAX.
/** Re-encode the paintable du/dv into the RGBA8 sample buffer. */
export function encodeWarp(f: WarpField): void {
  const n = f.res * f.res;
  if (!f.rgba || f.rgba.length !== n * 4) f.rgba = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const eu = Math.min(1, Math.max(-1, f.du[i] / WARP_MAX)) * 127 + 128;
    const ev = Math.min(1, Math.max(-1, f.dv[i] / WARP_MAX)) * 127 + 128;
    f.rgba[i * 4] = Math.min(255, Math.max(0, Math.round(eu)));
    f.rgba[i * 4 + 1] = Math.min(255, Math.max(0, Math.round(ev)));
    f.rgba[i * 4 + 3] = 255;
  }
}

export function warpIsEmpty(f: WarpField | null | undefined): boolean {
  return !f || f.rev === 0;
}

export type WarpTool = "push" | "swirl" | "pinch" | "bloat";

/** Paint one stroke step into the field. Geometry in uv; `aspect` = W/H keeps
 *  swirls/pinches round despite uv's per-axis scale. `move` is the pointer's
 *  uv delta since the last step (for push). Accumulates, then caller re-encodes.
 *  Returns true if anything changed. */
export function paintWarp(
  f: WarpField,
  tool: WarpTool,
  cx: number,
  cy: number,
  radius: number, // uv-x fraction
  strength: number, // 0..1
  aspect: number,
  move: [number, number] = [0, 0],
): boolean {
  const res = f.res;
  // Field cells within the brush (in uv, aspect-corrected so the brush is a
  // circle in pixels). radius is a uv-x fraction; the y extent scales by aspect.
  const ry = radius * aspect;
  const i0 = Math.max(0, Math.floor((cx - radius) * res));
  const i1 = Math.min(res - 1, Math.ceil((cx + radius) * res));
  const j0 = Math.max(0, Math.floor((cy - ry) * res));
  const j1 = Math.min(res - 1, Math.ceil((cy + ry) * res));
  if (i1 < i0 || j1 < j0) return false;
  let touched = false;
  const s = strength * 0.5; // tuned so full strength is lively but not instantly extreme
  for (let j = j0; j <= j1; j++) {
    const v = (j + 0.5) / res;
    for (let i = i0; i <= i1; i++) {
      const u = (i + 0.5) / res;
      // Pixel-space offset from the brush centre (aspect-corrected), normalised.
      const dxp = (u - cx), dyp = (v - cy) / aspect;
      const r = Math.hypot(dxp, dyp) / radius;
      if (r > 1) continue;
      const fall = 1 - r * r * (3 - 2 * r); // smoothstep falloff, 1 at centre
      const w = fall * s;
      const idx = j * res + i;
      let au = 0, av = 0;
      if (tool === "push") {
        au = move[0] * w * 6; av = move[1] * w * 6;
      } else if (tool === "swirl") {
        // tangential (rotate CW): (dy, -dx) in aspect-corrected pixels -> back to uv.
        au = dyp * w; av = -dxp * aspect * w;
      } else {
        // pinch pulls toward centre (source read moves outward => +radial),
        // bloat pushes away.
        const sign = tool === "bloat" ? -1 : 1;
        au = dxp * w * sign; av = dyp * aspect * w * sign;
      }
      if (au === 0 && av === 0) continue;
      f.du[idx] = Math.min(WARP_MAX, Math.max(-WARP_MAX, f.du[idx] + au));
      f.dv[idx] = Math.min(WARP_MAX, Math.max(-WARP_MAX, f.dv[idx] + av));
      touched = true;
    }
  }
  return touched;
}

/** Bilinear-sample the encoded field at uv, decode to a (du,dv) uv offset —
 *  replicating GL LINEAR + CLAMP_TO_EDGE (u*res - 0.5) so the CPU export
 *  matches the GPU preview exactly. Writes into `out`. */
export function sampleWarp(f: WarpField, u: number, v: number, out: Float32Array): void {
  const res = f.res;
  const fx = Math.min(res - 1, Math.max(0, u * res - 0.5));
  const fy = Math.min(res - 1, Math.max(0, v * res - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(res - 1, x0 + 1), y1 = Math.min(res - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const rgba = f.rgba;
  const dec = (o: number) => ((rgba[o] - 128) / 127) * WARP_MAX;
  const decv = (o: number) => ((rgba[o + 1] - 128) / 127) * WARP_MAX;
  const du00 = dec((y0 * res + x0) * 4), du10 = dec((y0 * res + x1) * 4);
  const du01 = dec((y1 * res + x0) * 4), du11 = dec((y1 * res + x1) * 4);
  const dv00 = decv((y0 * res + x0) * 4), dv10 = decv((y0 * res + x1) * 4);
  const dv01 = decv((y1 * res + x0) * 4), dv11 = decv((y1 * res + x1) * 4);
  out[0] = (du00 * (1 - tx) + du10 * tx) * (1 - ty) + (du01 * (1 - tx) + du11 * tx) * ty;
  out[1] = (dv00 * (1 - tx) + dv10 * tx) * (1 - ty) + (dv01 * (1 - tx) + dv11 * tx) * ty;
}

/** A linear source sampler (x,y integer pixels -> [r,g,b]), as export.ts uses. */
export type Sampler = (x: number, y: number) => ArrayLike<number>;

/** Wrap a source sampler with the warp remap: reading pixel (x,y) returns the
 *  source at (x,y) + displacement, BILINEAR (the displaced coord is
 *  fractional). Applied at the very top of the export chain, before denoise —
 *  mirroring the shader's fetchLin warp. */
export function warpSampler(sample: Sampler, f: WarpField, W: number, H: number): (x: number, y: number) => [number, number, number] {
  const d = new Float32Array(2);
  const clampI = (v: number, hi: number) => (v < 0 ? 0 : v > hi ? hi : v);
  return (x, y) => {
    sampleWarp(f, (x + 0.5) / W, (y + 0.5) / H, d);
    const sx = x + d[0] * W, sy = y + d[1] * H;
    const x0 = Math.floor(sx), y0 = Math.floor(sy);
    const x1 = x0 + 1, y1 = y0 + 1;
    const tx = sx - x0, ty = sy - y0;
    const a = sample(clampI(x0, W - 1), clampI(y0, H - 1));
    const b = sample(clampI(x1, W - 1), clampI(y0, H - 1));
    const c = sample(clampI(x0, W - 1), clampI(y1, H - 1));
    const e = sample(clampI(x1, W - 1), clampI(y1, H - 1));
    return [
      (a[0] * (1 - tx) + b[0] * tx) * (1 - ty) + (c[0] * (1 - tx) + e[0] * tx) * ty,
      (a[1] * (1 - tx) + b[1] * tx) * (1 - ty) + (c[1] * (1 - tx) + e[1] * tx) * ty,
      (a[2] * (1 - tx) + b[2] * tx) * (1 - ty) + (c[2] * (1 - tx) + e[2] * tx) * ty,
    ];
  };
}
