// Camera color science. Converts camera-native RGB (what our raw decoders
// produce) into linear sRGB using the camera's ColorMatrix. This is the step
// that was missing: without it, infrared chroma collapses onto a single
// (magenta) axis, so sky and foliage can't separate into different colors.

// Nikon Z 50 ColorMatrix1 (XYZ -> camera, D65), public Adobe coefficients.
export const NIKON_Z50_COLOR_MATRIX = [
  1.1853, -0.4189, -0.1024, -0.4292, 1.2041, 0.2569, -0.1336, 0.2599, 0.5824,
];

// Nikon D5300 ColorMatrix2 (XYZ -> camera, D65) as the owner's own Lightroom
// DNG exports carry it (DSC_4940/DSC_4776, 2026-07-25). NOT Adobe's stock
// D5300 calibration: Lightroom bakes the photo's ASSIGNED camera profile into
// each DNG, and these carry Rob Shea's "Infrared Temp -100" IR profile — the
// owner's standard for this full-spectrum body. A native NEF names no profile
// at all, so this is the deliberate NEF default (deviation from dcraw's stock
// matrix, reasoned in NOTES: stock matches none of the owner's real files).
// A DNG exported with a DIFFERENT profile (e.g. "Infrared Temp -50" on
// DSC_1709) renders per its own embedded matrix — an intentional difference,
// not a decode bug (NOTES, 2026-07-25 twin ledger).
export const NIKON_D5300_COLOR_MATRIX = [
  1.2101, -0.1453, -0.0262, -0.9751, 1.4074, 0.0899, -0.2572, 0.2313, 0.2688,
];

/** Matrix for a native NEF, which carries no ColorMatrix tags — chosen by the
 *  file's own Model string so a NEF and its Adobe DNG twin render alike.
 *  Fallback: Z 50, the owner's primary body. */
/**
 * The sensor's pixel pitch for a camera model, in microns — the number the
 * diffraction limit is measured against (IR-SCIENCE.md §9h: the Airy disk at
 * the longest infrared wavelength over this pitch).
 * @param model  the EXIF model string, e.g. "NIKON Z 50".
 * @returns the pitch in µm for a body on record, or undefined — NEVER a
 *   default, because the caller makes a claim about the reader's frame from
 *   it and a guessed body is a guessed claim. Values from diffraction.cam
 *   (Rob Shea), read 2026-09-18: Z 50 4.22 (5568 px over 23.5 mm), D5300 3.92.
 * Consumer: apertureDiagnostic in main.ts, which prints "not on record" when
 * this returns undefined.
 */
export function sensorPitchMicrons(model?: string): number | undefined {
  if (!model) return undefined;
  if (/Z ?50\b/i.test(model)) return 4.22;
  if (/D5300/i.test(model)) return 3.92;
  return undefined;
}

export function nikonColorMatrix(model?: string): number[] {
  if (model && /D5300/i.test(model)) return NIKON_D5300_COLOR_MATRIX;
  return NIKON_Z50_COLOR_MATRIX;
}
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

/** sRGB (D65) -> XYZ, dcraw's xyz_rgb, row-major. */
const SRGB_TO_XYZ = [
  0.412453, 0.35758, 0.180423, 0.212671, 0.71516, 0.072169, 0.019334, 0.119193, 0.950227,
];
/**
 * Camera-native RGB -> linear sRGB, built as dcraw and LibRaw build it in
 * cam_xyz_coeff: multiply out cam_rgb = ColorMatrix * xyz_rgb (sRGB -> camera),
 * divide each ROW of that by its sum so cam_rgb * (1,1,1) = (1,1,1), and
 * invert. The row sums are the camera's D65 neutral, so normalising there is
 * the same as scaling the INPUT by its white balance — the construction that is
 * exact for white-balanced data, which is what this matrix is applied to (the
 * gains run first).
 *
 * Until 2026-10-01 this inverted first and normalised the rows of the OUTPUT.
 * Both keep (1,1,1) neutral, so "neutrals survive" never chose between them,
 * and the output-side form distorts every colour that is not neutral: with the
 * Z 50 constant a D65-balanced sRGB green rendered (0.098, 1.438, 0.108) rather
 * than (0, 1, 0), and the green row read [-0.537, 2.703, -1.166] against
 * [-0.189, 1.717, -0.528] here.
 *
 * @param colorMatrix1  the camera's XYZ -> camera matrix at D65, row-major.
 * @returns a row-major 3x3 taking white-balanced camera RGB to linear sRGB;
 *   each of its rows sums to 1, so a neutral input stays neutral — the
 *   invariant tap-WB and gray-world rely on.
 */
export function camToSrgbLinear(colorMatrix1: number[]): number[] {
  const camRgb = mul3(colorMatrix1, SRGB_TO_XYZ);
  for (let r = 0; r < 3; r++) {
    const s = camRgb[r * 3] + camRgb[r * 3 + 1] + camRgb[r * 3 + 2] || 1;
    camRgb[r * 3] /= s;
    camRgb[r * 3 + 1] /= s;
    camRgb[r * 3 + 2] /= s;
  }
  return inv3(camRgb);
}
