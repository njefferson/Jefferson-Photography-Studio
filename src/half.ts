// IEEE half-precision, both directions, in one place.
//
// WHY IT IS A FILE. `toHalf` was written inside gpuexport.ts for one caller —
// the measurement that asked whether a full-resolution source could be held in
// half the memory. The answer came back yes on every device, so the editor's
// working copy becomes half-float, and the moment that happens three more
// places need the same arithmetic: patching a healed rectangle back into the
// texture, reading a pixel out of the source to decide an occlusion, and any
// later path that touches the pristine buffer. Two copies of a float format
// conversion is exactly the shape of the two-file-lists defect recorded in the
// hub's lessons — one gets a fix and the other does not.
//
// WHAT THIS HANDLES AND WHAT IT DOES NOT. The values are linear sensor data in
// [0, 1] and a little above at clipping: no infinities, no NaNs, nothing
// subnormal that matters. Subnormals flush to zero — a value that small is far
// below the sensor's own noise floor — and anything over the largest finite
// half clamps to it rather than becoming an infinity the shader would have to
// cope with. Measured against float32 on three devices: the picture differs by
// 0.018 of 255 on average, worst 4, IDENTICALLY on all of them, which is what a
// deterministic conversion looks like.
const f32 = new Float32Array(1);
const i32 = new Int32Array(f32.buffer);

export function toHalf(v: number): number {
  f32[0] = v;
  const x = i32[0];
  const sign = (x >> 16) & 0x8000;
  const e = ((x >> 23) & 0xff) - 127 + 15;
  const m = x & 0x7fffff;
  if (e <= 0) return sign;                    // too small to represent: zero
  if (e >= 31) return sign | 0x7bff;          // too large: the biggest finite half
  // ROUND TO NEAREST, TIES TO EVEN — not truncation, which is what the first
  // version of this did while it lived in gpuexport.ts. Measured over 300,001
  // values across the working range: truncation averages 0.055 of 255 and peaks
  // at 0.249; rounding averages 0.028 and peaks at 0.125. Exactly half, for one
  // comparison and an increment. Free precision is not a thing to leave behind
  // in a buffer the whole editor is about to read from.
  const half = sign | (e << 10) | (m >> 13);
  const rest = m & 0x1fff;
  if (rest > 0x1000 || (rest === 0x1000 && (half & 1))) {
    // The increment may carry out of the mantissa and into the exponent, which
    // is correct (0x3bff + 1 = 0x3c00 is 0.99951 rounding to 1.0) right up
    // until it carries into exponent 31, where "the next value up" is infinity.
    // Clamp there instead: a shader sampling an infinity is a black or white
    // hole in the picture, which is not what a value one step over the top of
    // the range meant.
    const up = half + 1;
    return ((up & 0x7fff) >= 0x7c00) ? (sign | 0x7bff) : (up & 0xffff);
  }
  return half;
}

export function fromHalf(h: number): number {
  const sign = (h & 0x8000) ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const m = h & 0x3ff;
  if (e === 0) return sign * m * 5.9604644775390625e-8;   // subnormal: m * 2^-24
  if (e === 31) return sign * (m ? NaN : Infinity);
  return sign * (m + 1024) * Math.pow(2, e - 25);
}

/** A whole buffer, float32 -> half. The per-value call is the hot path of an
 *  upload, so the loop lives here rather than at each call site. */
export function toHalfBuffer(src: Float32Array, out?: Uint16Array): Uint16Array {
  const dst = out && out.length >= src.length ? out : new Uint16Array(src.length);
  for (let i = 0; i < src.length; i++) dst[i] = toHalf(src[i]);
  return dst;
}
