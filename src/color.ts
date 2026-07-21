// Camera color science. Converts camera-native RGB (what our raw decoders
// produce) into linear sRGB using the camera's ColorMatrix. This is the step
// that was missing: without it, infrared chroma collapses onto a single
// (magenta) axis, so sky and foliage can't separate into different colors.

// Nikon Z 50 ColorMatrix1 (XYZ -> camera, D65), public Adobe coefficients.
export const NIKON_Z50_COLOR_MATRIX = [
  1.1853, -0.4189, -0.1024, -0.4292, 1.2041, 0.2569, -0.1336, 0.2599, 0.5824,
];

const XYZ_TO_SRGB = [
  3.2406, -1.5372, -0.4986, -0.9689, 1.8758, 0.0415, 0.0557, -0.204, 1.057,
];

function inv3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g);
  const G = b * f - c * e, H = -(a * f - c * d), I = a * e - b * d;
  const det = a * A + b * B + c * C || 1;
  return [A / det, D / det, G / det, B / det, E / det, H / det, C / det, F / det, I / det];
}

function mul3(m: number[], n: number[]): number[] {
  const o = new Array(9).fill(0);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      for (let k = 0; k < 3; k++) o[r * 3 + c] += m[r * 3 + k] * n[k * 3 + c];
  return o;
}

/**
 * camera-native RGB -> linear sRGB, row-normalized so neutral (gray) is
 * preserved (white balance keeps working) while chroma is expanded.
 * Returns a row-major 3x3.
 */
export function camToSrgbLinear(colorMatrix1: number[]): number[] {
  const m = mul3(XYZ_TO_SRGB, inv3(colorMatrix1));
  for (let r = 0; r < 3; r++) {
    const s = m[r * 3] + m[r * 3 + 1] + m[r * 3 + 2] || 1;
    m[r * 3] /= s;
    m[r * 3 + 1] /= s;
    m[r * 3 + 2] /= s;
  }
  return m;
}
