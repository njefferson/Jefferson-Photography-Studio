// The sample formula for imported .cube 3D LUTs: TETRAHEDRAL interpolation.
// This is the one implementation of the sample math — the GLSL twin in gl.ts
// (`sampleLut3d` in the fragment shader) mirrors it branch for branch via
// texelFetch, and the parity harness pins the two at ≤2 LSB. Any change here
// changes there.
//
// Why tetrahedral: the Cube LUT Specification 1.0 (Adobe, 2013) §7.1 says a 3D
// table's values "shall be set so that tetrahedral interpolation will generate
// correct output values", and §8 that "the reader should use … tetrahedral
// interpolation for three-dimensional tables". The six-tetrahedron split on the
// order of the three fractions, all sharing the cell's (0,0,0)-(1,1,1) diagonal,
// with OpenColorIO's weights (Lut3DOpGPU). A grey therefore reads only the two
// grey corners of its cell. Trilinear (until 2026-10-01) also mixed in the six
// coloured corners, which moved greys between nodes off the edit the file was
// baked from: 3.6 levels in 255 near white on an exported Saturation 2 look
// (0.58 of it as a tint), against 0.27 tetrahedral.
//
// Lattice layout: Float32Array, stride 3 (RGB), RED FASTEST —
//   idx = ((bi*N + gi)*N + ri) * 3
// matching .cube file row order and the 3D texture layout (x=r, y=g, z=b).
// Values are unit-DOMAIN but NOT clamped: the spec (§5.7) makes table values
// unconstrained, so the parser keeps them and the RESULT is clamped here.

/**
 * Tetrahedral sample of an N³ RGB lattice at display colour (r,g,b), with the
 * table's values as stored (no clamp). Index math — keep IDENTICAL to the GLSL:
 *   t  = clamp(c,0,1) * (N-1)
 *   i0 = min(floor(t), N-2)      // t == N-1 lands in the top cell, f = 1
 *   f  = t - i0
 *   then the tetrahedron by the order of f (ties broken as OpenColorIO does)
 *   and out = f2*v2 + f3*v3 + f1*v1 + f4*v4.
 * @param data  the lattice, red fastest, stride 3.
 * @param N  grid size per axis, >= 2 (the parser guarantees it).
 * @param r,g,b  the input colour; clamped to 0..1, the unit domain.
 * @param out  receives the interpolated RGB, which may lie outside 0..1.
 * @returns nothing. Holds: at a lattice node out equals that node exactly, and
 *   on the grey diagonal it is a blend of the two grey corners only. Consumers:
 *   sampleLut3d (which clamps), and cubeimport.ts's non-unit-domain resample,
 *   which needs the unclamped values so a later sample can still interpolate
 *   them.
 */
export function sampleLut3dRaw(
  data: Float32Array,
  N: number,
  r: number,
  g: number,
  b: number,
  out: Float32Array,
): void {
  const n1 = N - 1;
  const tr = (r < 0 ? 0 : r > 1 ? 1 : r) * n1;
  const tg = (g < 0 ? 0 : g > 1 ? 1 : g) * n1;
  const tb = (b < 0 ? 0 : b > 1 ? 1 : b) * n1;
  const ir = Math.min(Math.floor(tr), N - 2);
  const ig = Math.min(Math.floor(tg), N - 2);
  const ib = Math.min(Math.floor(tb), N - 2);
  const fr = tr - ir;
  const fg = tg - ig;
  const fb = tb - ib;

  const dR = 3; // step of +1 in ri
  const dG = N * 3; // step of +1 in gi
  const dB = N * N * 3; // step of +1 in bi
  const base = (ib * N + ig) * N * 3 + ir * 3;
  const o4 = base + dR + dG + dB; // the (1,1,1) corner
  // The two corners between (0,0,0) and (1,1,1), and the four weights.
  let o2: number, o3: number, f1: number, f2: number, f3: number, f4: number;
  if (fr >= fg) {
    if (fg >= fb) {        // r >= g >= b
      o2 = base + dR; o3 = base + dR + dG;
      f1 = 1 - fr; f2 = fr - fg; f3 = fg - fb; f4 = fb;
    } else if (fr >= fb) { // r >= b > g
      o2 = base + dR; o3 = base + dR + dB;
      f1 = 1 - fr; f2 = fr - fb; f3 = fb - fg; f4 = fg;
    } else {               // b > r >= g
      o2 = base + dB; o3 = base + dR + dB;
      f1 = 1 - fb; f2 = fb - fr; f3 = fr - fg; f4 = fg;
    }
  } else {
    if (fg <= fb) {        // b >= g > r
      o2 = base + dB; o3 = base + dG + dB;
      f1 = 1 - fb; f2 = fb - fg; f3 = fg - fr; f4 = fr;
    } else if (fr >= fb) { // g > r >= b
      o2 = base + dG; o3 = base + dR + dG;
      f1 = 1 - fg; f2 = fg - fr; f3 = fr - fb; f4 = fb;
    } else {               // g > b > r
      o2 = base + dG; o3 = base + dG + dB;
      f1 = 1 - fg; f2 = fg - fb; f3 = fb - fr; f4 = fr;
    }
  }
  for (let ch = 0; ch < 3; ch++) {
    out[ch] = f2 * data[o2 + ch] + f3 * data[o3 + ch] + f1 * data[base + ch] + f4 * data[o4 + ch];
  }
}

/**
 * Sample an imported LUT for display: sampleLut3dRaw, then the result clamped
 * to 0..1 — the shader's sampleLut3d does the same.
 * @param data  the lattice, red fastest, stride 3.
 * @param N  grid size per axis, >= 2.
 * @param r,g,b  the display colour to look up, 0..1.
 * @param out  receives the looked-up colour, each channel in 0..1.
 * @returns nothing. Holds: every channel of out is within 0..1, because the
 *   stages after the LUT (the strength blend, the 16-bit TIFF write, the
 *   sticker overlay) expect a display value. Consumers: compileEdit's last
 *   colour stage and the LUT list's previews in main.ts.
 */
export function sampleLut3d(
  data: Float32Array,
  N: number,
  r: number,
  g: number,
  b: number,
  out: Float32Array,
): void {
  sampleLut3dRaw(data, N, r, g, b, out);
  for (let ch = 0; ch < 3; ch++) out[ch] = out[ch] < 0 ? 0 : out[ch] > 1 ? 1 : out[ch];
}
