// The trilinear formula for imported .cube 3D LUTs. This is THE one
// implementation of the sample math — the GLSL twin in gl.ts (`sampleLut3d`
// in the fragment shader) mirrors it VERBATIM via texelFetch + mix, and the
// parity harness pins the two at ≤2 LSB. Any change here changes there.
//
// Lattice layout: Float32Array, stride 3 (RGB), RED FASTEST —
//   idx = ((bi*N + gi)*N + ri) * 3
// matching .cube file row order and the 3D texture layout (x=r, y=g, z=b).
// Values are unit-domain and clamped [0,1] by the parser (cubeimport.ts).

/** Trilinear sample of an N³ RGB lattice at display colour (r,g,b) → out.
 *  Index math — keep IDENTICAL to the GLSL:
 *    t  = clamp(c,0,1) * (N-1)
 *    i0 = min(floor(t), N-2)      // t == N-1 lands in the top cell, f = 1
 *    f  = t - i0
 *    lerp(a,b,f) = a + (b-a)*f    // == GLSL mix
 *  N >= 2 is guaranteed by the parser. */
export function sampleLut3d(
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

  const rowG = N * 3; // step of +1 in gi
  const rowB = N * N * 3; // step of +1 in bi
  const base = (ib * N + ig) * N * 3 + ir * 3;

  for (let ch = 0; ch < 3; ch++) {
    const o = base + ch;
    const c000 = data[o];
    const c100 = data[o + 3];
    const c010 = data[o + rowG];
    const c110 = data[o + rowG + 3];
    const c001 = data[o + rowB];
    const c101 = data[o + rowB + 3];
    const c011 = data[o + rowB + rowG];
    const c111 = data[o + rowB + rowG + 3];
    const c00 = c000 + (c100 - c000) * fr;
    const c10 = c010 + (c110 - c010) * fr;
    const c01 = c001 + (c101 - c001) * fr;
    const c11 = c011 + (c111 - c011) * fr;
    const c0 = c00 + (c10 - c00) * fg;
    const c1 = c01 + (c11 - c01) * fg;
    out[ch] = c0 + (c1 - c0) * fb;
  }
}
