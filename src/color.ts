// Camera color science. Converts camera-native RGB (what our raw decoders
// produce) into linear sRGB using the camera's ColorMatrix. This is the step
// that was missing: without it, infrared chroma collapses onto a single
// (magenta) axis, so sky and foliage can't separate into different colors.

// Nikon Z 50 ColorMatrix (XYZ -> camera, D65): Adobe DNG Converter's, the
// ColorMatrix2 its DNGs carry, as LibRaw's colordata.cpp ("Z 50") and
// RawTherapee's camconst.json both list it, /10000. Until 2026-10-01 this was
// 1.1853, -0.4189, -0.1024, -0.4292, 1.2041, 0.2569, -0.1336, 0.2599, 0.5824
// under a label calling it Adobe's, which it is not; no source for those
// numbers was ever recorded, and no Z 50 DNG among the owner's files carries
// them. The practice DNGs in public/examples were written with the old numbers
// and keep them in their own tags.
export const NIKON_Z50_COLOR_MATRIX = [
  1.164, -0.4829, -0.1079, -0.5107, 1.3006, 0.2325, -0.0972, 0.1711, 0.738,
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

/** The D50 white the DNG spec's ForwardMatrix maps a unit camera vector to
 *  (xy 0.3457, 0.3585, Y = 1). */
const D50_XYZ = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];

/** Bradford cone response (Lam 1985), the chromatic adaptation the DNG spec
 *  recommends ("linear Bradford"). */
const BRADFORD = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296];

/** XYZ (D50) -> linear sRGB: Bradford-adapted to the D65 white that
 *  SRGB_TO_XYZ itself implies (its row sums), then inverted sRGB. Built here
 *  rather than copied so D50 white lands on (1, 1, 1) to rounding. */
const XYZ_D50_TO_SRGB = (() => {
  const d65 = [0, 1, 2].map((r) => SRGB_TO_XYZ[r * 3] + SRGB_TO_XYZ[r * 3 + 1] + SRGB_TO_XYZ[r * 3 + 2]);
  const src = [0, 1, 2].map((r) => BRADFORD[r * 3] * D50_XYZ[0] + BRADFORD[r * 3 + 1] * D50_XYZ[1] + BRADFORD[r * 3 + 2] * D50_XYZ[2]);
  const dst = [0, 1, 2].map((r) => BRADFORD[r * 3] * d65[0] + BRADFORD[r * 3 + 1] * d65[1] + BRADFORD[r * 3 + 2] * d65[2]);
  const scale = [dst[0] / src[0], 0, 0, 0, dst[1] / src[1], 0, 0, 0, dst[2] / src[2]];
  const adapt = mul3(inv3(BRADFORD), mul3(scale, BRADFORD));
  return mul3(inv3(SRGB_TO_XYZ), adapt);
})();

type Matrixish = { num(tag: number): number[]; str(tag: number): string | undefined };

/**
 * The camera -> linear sRGB matrix for a DNG, as DNG 1.7.1.0 chapter 6 builds
 * it, for the calibration this app renders from (the daylight one: the ranking
 * readCameraMatrix in decode.ts uses).
 * @param ifds  every IFD of the file. The colour tags live in IFD 0.
 * @returns undefined when the file carries no ColorMatrix (the caller falls
 *   back to the per-model NEF default); otherwise `cam`, a row-major 3x3 the
 *   pipeline applies AFTER its own camera-space white balance, and, rarely,
 *   `pre`, a 3x3 that must be applied to the camera values BEFORE that balance
 *   (RawCfa.post.matrix).
 *
 *   With ForwardMatrix tags the spec's transform is CameraToXYZ_D50 = FM * D *
 *   Inverse(AB * CC), D the diagonal that takes the camera neutral to the unit
 *   vector. The app's white-balance gains ARE that diagonal, applied in camera
 *   space, so `cam` is XYZ(D50)->sRGB times FM alone. The ColorMatrix's only
 *   job on this route is the spec's: turning a white-balance xy into a camera
 *   neutral — and this app finds its neutral from the data (gray-world, tap-WB,
 *   the sliders), never from an xy, so it takes no part. The NEF default for
 *   the D5300 (NIKON_D5300_COLOR_MATRIX above) is unchanged: a NEF names no
 *   profile and carries no ForwardMatrix, and that matrix still means what it
 *   meant, the "-100" profile's ColorMatrix from the owner's Lightroom DNGs.
 *   Inverse(AB * CC) is diagonal for every calibration
 *   written as gains and then folds into the gains too; when it is not, it is
 *   returned as `pre`, which puts the data in the reference camera's space so
 *   the gains act there, exactly as the spec's D does. FM maps (1,1,1) to D50
 *   white, which this matrix maps to (1,1,1), so a neutral stays neutral to
 *   the file's own rounding without any row normalisation.
 *
 *   Without ForwardMatrix tags it is camToSrgbLinear of XYZtoCamera = AB * CC *
 *   CM, LibRaw's construction.
 *
 *   This matters for infrared because a ColorMatrix in an IR profile is a
 *   white-balance calibration: the two Rob Shea profiles in the owner's
 *   Lightroom DNGs ("Infrared Temp -100" and "-50") carry the same
 *   ForwardMatrix and different ColorMatrices, so through this they are the
 *   same colour transform, as the spec intends. CameraCalibration is used only
 *   when CameraCalibrationSignature equals ProfileCalibrationSignature (both
 *   empty counts as equal, as in Adobe's SDK); otherwise identity.
 *   Consumers: decode.ts (camMatrix at open) and export.ts getSource, so the
 *   preview and the export render through the same matrix.
 */
export function dngCameraToSrgb(ifds: Matrixish[]): { cam: number[]; pre?: number[] } | undefined {
  const rank = (ill: number | undefined) =>
    ill === 21 ? 0 : ill === 20 ? 1 : ill === 22 ? 2 : ill === 23 ? 3 : ill === 1 || ill === 9 ? 4 : ill === undefined ? 5 : 6;
  // [ColorMatrix, CalibrationIlluminant, CameraCalibration, ForwardMatrix] per set.
  const sets = [
    [50722, 50779, 50724, 50965],
    [50721, 50778, 50723, 50964],
    [52531, 52529, 52530, 52532],
  ] as const;
  let best: { d: Matrixish; set: (typeof sets)[number] } | undefined;
  let bestRank = Infinity;
  for (const d of ifds) {
    for (const set of sets) {
      if (d.num(set[0]).length !== 9) continue;
      const r = rank(d.num(set[1])[0]);
      if (r < bestRank) {
        bestRank = r;
        best = { d, set };
      }
    }
  }
  if (!best) return undefined;
  const { d, set } = best;
  const cm = d.num(set[0]);
  const ab = d.num(50727);
  const AB = [ab[0] ?? 1, 0, 0, 0, ab[1] ?? 1, 0, 0, 0, ab[2] ?? 1];
  const ccTag = d.num(set[2]);
  const sigOk = (d.str(50931) ?? "") === (d.str(50932) ?? "");
  const CC = ccTag.length === 9 && sigOk ? ccTag : [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const ABCC = mul3(AB, CC);
  const fm = d.num(set[3]);
  if (fm.length !== 9) return { cam: camToSrgbLinear(mul3(ABCC, cm)) };

  const cam = mul3(XYZ_D50_TO_SRGB, fm);
  const K = inv3(ABCC);
  const offDiag = Math.max(...[1, 2, 3, 5, 6, 7].map((i) => Math.abs(K[i])));
  if (offDiag < 1e-9) return { cam };
  // A calibration that mixes channels cannot fold into diagonal gains: it is
  // applied to the camera values first, so gray-world, tap-WB and the sliders
  // all balance in the reference camera's space, which is where D acts.
  return { cam, pre: K };
}
