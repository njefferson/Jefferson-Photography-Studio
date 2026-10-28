// A white as Adobe's raw editors name it, a temperature in kelvin and a tint, read through a camera profile's colour matrices, and the three channel gains that make such a white neutral. Pure arithmetic: no page, no file, no store.
//
// THE CONVENTION IS ADOBE'S DNG SDK (version 1.4), and this file is a port of the functions it names, nothing added (record 102; IR-SCIENCE.md section 3 lists every source and how each was read). From `dng_temperature.cpp`: the 31-row table from Wyszecki and Stiles AS ADOBE PRINTS IT, row 325 included, the tint scale of minus 3000 per unit of distance in CIE 1960 uv, `Set_xy_coord` and `Get_xy_coord`. From `dng_color_spec.cpp`: the colour matrix blended between the profile's two calibrations by the white's own temperature (`FindXYZtoCamera`), a camera neutral turned into an xy by up to thirty passes from D50 (`NeutralToXY`), and an xy turned into a neutral (`SetWhiteXY`). From `dng_camera_profile.cpp`: the temperatures its illuminant codes stand for and the way a colour matrix is normalised. From `dng_xy_coord.cpp`: the pins on an xy.
//
// WHAT IS NOT DONE, ON PURPOSE. No locus is computed below the table (the SDK keeps a white cooler than 1667 K at 1667 K and carries the rest in the tint, and says so in `xyToTempTint`), the table's one odd row is not corrected, and nothing here is read off any photograph: the scale is the schema's (`KELVIN_MIN` to `KELVIN_MAX`, `TINT_MIN` to `TINT_MAX`) and it is the caller's to rest a control at an end for a white outside it. That the shipped converter of Adobe's editors is this arithmetic is not shown by anything read; it is the SDK's sample code of 2012.

/** The coolest and warmest temperature of Adobe's scale, in kelvin: crs:Temperature in Adobe's XMP Camera Raw namespace, "Range 2000 to 50000". */
export const KELVIN_MIN = 2000;
export const KELVIN_MAX = 50000;
/** The tint range of the same namespace, crs:Tint, "Range -150 to 150". A positive tint is a white on the green side of the locus, which the editors' help describes as the slider's magenta end. */
export const TINT_MIN = -150;
export const TINT_MAX = 150;

/** One row of the SDK's isotemperature table: inverse temperature in mired, the locus point in CIE 1960 uv, and the slope of the line across the locus there. */
type TableRow = readonly [number, number, number, number];

/** The table exactly as `dng_temperature.cpp` prints it (Wyszecki and Stiles, Color Science, second edition, page 228). Row 325 carries u of 0.24702 as printed; the digits of that one row are not corrected. */
export const SDK_TABLE: ReadonlyArray<TableRow> = [
  [0, 0.18006, 0.26352, -0.24341],
  [10, 0.18066, 0.26589, -0.25479],
  [20, 0.18133, 0.26846, -0.26876],
  [30, 0.18208, 0.27119, -0.28539],
  [40, 0.18293, 0.27407, -0.3047],
  [50, 0.18388, 0.27709, -0.32675],
  [60, 0.18494, 0.28021, -0.35156],
  [70, 0.18611, 0.28342, -0.37915],
  [80, 0.1874, 0.28668, -0.40955],
  [90, 0.1888, 0.28997, -0.44278],
  [100, 0.19032, 0.29326, -0.47888],
  [125, 0.19462, 0.30141, -0.58204],
  [150, 0.19962, 0.30921, -0.70471],
  [175, 0.20525, 0.31647, -0.84901],
  [200, 0.21142, 0.32312, -1.0182],
  [225, 0.21807, 0.32909, -1.2168],
  [250, 0.22511, 0.33439, -1.4512],
  [275, 0.23247, 0.33904, -1.7298],
  [300, 0.2401, 0.34308, -2.0637],
  [325, 0.24702, 0.34655, -2.4681],
  [350, 0.25591, 0.34951, -2.9641],
  [375, 0.264, 0.352, -3.5814],
  [400, 0.27218, 0.35407, -4.3633],
  [425, 0.28039, 0.35577, -5.3762],
  [450, 0.28863, 0.35714, -6.7262],
  [475, 0.29685, 0.35823, -8.5955],
  [500, 0.30505, 0.35907, -11.324],
  [525, 0.3132, 0.35968, -15.628],
  [550, 0.32129, 0.36011, -23.325],
  [575, 0.32931, 0.36038, -40.77],
  [600, 0.33724, 0.36051, -116.45],
];

/** One unit of tint is this many units of uv distance, the other way round: the SDK's `kTintScale`. */
const TINT_SCALE = -3000;
/** D50, the SDK's PCS white: where a neutral's search for its xy starts, and what an empty XYZ falls back to. */
const D50_X = 0.3457;
const D50_Y = 0.3585;
/** How many passes the SDK gives a neutral to settle on its xy, and how small a step counts as settled. */
const MAX_PASSES = 30;
const SETTLED = 1e-7;

/** A 3x3 times a 3-vector. @param m  row-major. @param v  three numbers. @returns the product. */
function mulMV(m: ReadonlyArray<number>, v: ReadonlyArray<number>): number[] {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}

/** The inverse of a 3x3. @param m  row-major. @returns the inverse, row-major, or null when the matrix is singular or holds a number that is not finite. */
function inv3(m: ReadonlyArray<number>): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

/** A chromaticity as XYZ with Y of 1, after the SDK's pins (`XYtoXYZ`): x and y held inside the range of real chromaticities and their sum under one.
 *  @param x  CIE 1931 x.
 *  @param y  CIE 1931 y.
 *  @returns the XYZ triple. What it must satisfy: the SDK's own pins, so an extreme temperature and tint cannot make a negative or infinite white. */
function xyToXYZ(x: number, y: number): number[] {
  let px = Math.min(Math.max(1e-6, x), 0.999999), py = Math.min(Math.max(1e-6, y), 0.999999);
  if (px + py > 0.999999) { const s = 0.999999 / (px + py); px *= s; py *= s; }
  return [px / py, 1, (1 - px - py) / py];
}

/** A temperature and a tint for a chromaticity: the SDK's `Set_xy_coord`, line for line.
 *  @param x  CIE 1931 x of the white.
 *  @param y  its y.
 *  @returns `kelvin`, `mired` (a million over the kelvin figure) and `tint`; NaN in all three for a chromaticity with no uv.
 *  What it must satisfy: a white on the 200-mired row's own point reads 5000 K and a tint of 0; a tint that `tempTintToXy` made reads back as it was; and past the table's cool end (a white cooler than 1667 K) the temperature stays at the last row's and the rest is carried in the tint, exactly as the SDK's loop does, so the two directions are not mirror images there. Consumers: `gainsToWhite` and the calibration weight. */
export function xyToTempTint(x: number, y: number): { kelvin: number; mired: number; tint: number } {
  const den = 1.5 - x + 6 * y;
  const u = (2 * x) / den, v = (3 * y) / den;
  let lastDt = 0, lastDu = 0, lastDv = 0;
  for (let index = 1; index <= 30; index++) {
    let du = 1, dv = SDK_TABLE[index][3];
    let len = Math.sqrt(1 + dv * dv);
    du /= len; dv /= len;
    let uu = u - SDK_TABLE[index][1], vv = v - SDK_TABLE[index][2];
    let dt = -uu * dv + vv * du;
    if (dt <= 0 || index === 30) {
      if (dt > 0) dt = 0;
      dt = -dt;
      const f = index === 1 ? 0 : dt / (lastDt + dt);
      const mired = SDK_TABLE[index - 1][0] * f + SDK_TABLE[index][0] * (1 - f);
      uu = u - (SDK_TABLE[index - 1][1] * f + SDK_TABLE[index][1] * (1 - f));
      vv = v - (SDK_TABLE[index - 1][2] * f + SDK_TABLE[index][2] * (1 - f));
      du = du * (1 - f) + lastDu * f;
      dv = dv * (1 - f) + lastDv * f;
      len = Math.sqrt(du * du + dv * dv);
      du /= len; dv /= len;
      return { kelvin: 1e6 / mired, mired, tint: (uu * du + vv * dv) * TINT_SCALE };
    }
    lastDt = dt; lastDu = du; lastDv = dv;
  }
  return { kelvin: NaN, mired: NaN, tint: NaN };
}

/** A chromaticity for a temperature and a tint: the SDK's `Get_xy_coord`, line for line.
 *  @param kelvin  the temperature, above 0 (the SDK's table runs to 10 mired, so a figure past 100000 K reads as 100000 K's row extended).
 *  @param tint  the tint in the SDK's units.
 *  @returns CIE 1931 `x` and `y`; NaN for a temperature that is not above 0.
 *  What it must satisfy: `xyToTempTint` of the result gives back the same kelvin and tint wherever the table covers the white (a temperature above 1667 K). Consumers: `whiteToGains`. */
export function tempTintToXy(kelvin: number, tint: number): { x: number; y: number } {
  if (!(kelvin > 0)) return { x: NaN, y: NaN };
  const r = 1e6 / kelvin;
  const offset = tint * (1 / TINT_SCALE);
  for (let index = 0; index <= 29; index++) {
    if (r < SDK_TABLE[index + 1][0] || index === 29) {
      const f = (SDK_TABLE[index + 1][0] - r) / (SDK_TABLE[index + 1][0] - SDK_TABLE[index][0]);
      let u = SDK_TABLE[index][1] * f + SDK_TABLE[index + 1][1] * (1 - f);
      let v = SDK_TABLE[index][2] * f + SDK_TABLE[index + 1][2] * (1 - f);
      let uu1 = 1, vv1 = SDK_TABLE[index][3], uu2 = 1, vv2 = SDK_TABLE[index + 1][3];
      const len1 = Math.sqrt(1 + vv1 * vv1), len2 = Math.sqrt(1 + vv2 * vv2);
      uu1 /= len1; vv1 /= len1; uu2 /= len2; vv2 /= len2;
      let uu3 = uu1 * f + uu2 * (1 - f), vv3 = vv1 * f + vv2 * (1 - f);
      const len3 = Math.sqrt(uu3 * uu3 + vv3 * vv3);
      uu3 /= len3; vv3 /= len3;
      u += uu3 * offset; v += vv3 * offset;
      return { x: (1.5 * u) / (u - 4 * v + 2), y: v / (u - 4 * v + 2) };
    }
  }
  return { x: NaN, y: NaN };
}

/** The temperature an illuminant code stands for, as the SDK's `IlluminantToTemperature` has it.
 *  @param code  the EXIF LightSource code a profile's CalibrationIlluminant tag holds (17 is Standard light A, 21 is D65), or undefined when the profile names none.
 *  @returns kelvin: 2850 for 17 and 3, 3200 for 24, 5000 for 23, 5500 for 20, 1, 9, 4 and 18, 6500 for 21, 19 and 10, 7500 for 22 and 11, the midpoint of the fluorescent ranges for 12 to 16 and 2, and 0 for any code the SDK does not list. */
export function illuminantToTemperature(code: number | undefined): number {
  switch (code) {
    case 17: case 3: return 2850;
    case 24: return 3200;
    case 23: return 5000;
    case 20: case 1: case 9: case 4: case 18: return 5500;
    case 21: case 19: case 10: return 6500;
    case 22: case 11: return 7500;
    case 12: return (5700 + 7100) * 0.5;
    case 13: return (4600 + 5500) * 0.5;
    case 14: case 2: return (3800 + 4500) * 0.5;
    case 15: return (3250 + 3800) * 0.5;
    case 16: return (2600 + 3250) * 0.5;
    default: return 0;
  }
}

/** A colour matrix as the SDK normalises it on load (`NormalizeColorMatrix`).
 *  @param m  nine numbers, row-major, XYZ to camera.
 *  @returns the matrix scaled so its greatest coordinate for the D50 white is 1 when that coordinate falls outside 0.99 to 1.01, then rounded to four places. What it must satisfy: two matrices that differ only by a common scale come out the same when the scale moves the coordinate outside the band, so the blend between a profile's two calibrations weighs them alike. */
export function normalizeColorMatrix(m: ReadonlyArray<number>): number[] {
  const white = xyToXYZ(D50_X, D50_Y);
  const top = Math.max(...mulMV(m, white));
  const out = top > 0 && (top < 0.99 || top > 1.01) ? m.map((x) => x / top) : m.slice();
  return out.map((x) => Math.round(x * 10000) / 10000);
}

/** What a white is read through: the camera profile's two calibrations, cooler first. `t1` and `t2` are the calibration temperatures in kelvin and `cm1` and `cm2` the colour matrices (XYZ to camera, row-major, already normalised and with the analog balance folded in). A profile with one matrix has `t1` and `t2` both 5000 and `cm2` equal to `cm1`, as the SDK treats it. */
export interface ColourSpec { t1: number; t2: number; cm1: ReadonlyArray<number>; cm2: ReadonlyArray<number> }

/** A colour spec from a profile's tags, the way the SDK's `dng_color_spec` constructor builds one.
 *  @param cm1  ColorMatrix1, nine numbers, or null when the profile has none.
 *  @param ill1  CalibrationIlluminant1, or undefined.
 *  @param cm2  ColorMatrix2, nine numbers, or null when the profile has one matrix only.
 *  @param ill2  CalibrationIlluminant2, or undefined.
 *  @param fold  a 3x3, row-major, multiplied on the left of each matrix after it is normalised (the file's analog balance times its camera calibration, when the gains act on the raw values); identity when omitted.
 *  @returns the spec, or null when `cm1` is absent, is not nine finite numbers, or any matrix is singular.
 *  What it must satisfy: a profile with no second matrix, or with an illuminant the SDK does not list, or two equal temperatures, is one matrix at 5000 K; otherwise the cooler calibration is first. Consumers: `gainsToWhite` and `whiteToGains`. */
export function makeColourSpec(cm1: ReadonlyArray<number> | null, ill1: number | undefined, cm2: ReadonlyArray<number> | null, ill2: number | undefined, fold?: ReadonlyArray<number>): ColourSpec | null {
  const ok = (m: ReadonlyArray<number> | null): m is ReadonlyArray<number> => !!m && m.length === 9 && m.every((x) => Number.isFinite(x));
  if (!ok(cm1)) return null;
  const f = fold && fold.length === 9 ? fold : [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const times = (m: ReadonlyArray<number>): number[] => {
    const o = new Array<number>(9).fill(0);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c] += f[r * 3 + k] * m[k * 3 + c];
    return o;
  };
  let t1 = illuminantToTemperature(ill1), t2 = illuminantToTemperature(ill2);
  let a = times(normalizeColorMatrix(cm1));
  if (!inv3(a)) return null;
  if (!ok(cm2) || t1 <= 0 || t2 <= 0 || t1 === t2) return { t1: 5000, t2: 5000, cm1: a, cm2: a };
  let b = times(normalizeColorMatrix(cm2));
  if (!inv3(b)) return null;
  if (t1 > t2) { [t1, t2] = [t2, t1]; [a, b] = [b, a]; }
  return { t1, t2, cm1: a, cm2: b };
}

/** The colour matrix for a white, blended between the two calibrations by the white's own temperature: the SDK's `FindXYZtoCamera`.
 *  @param spec  the profile's calibrations.
 *  @param x  CIE 1931 x of the white.
 *  @param y  its y.
 *  @returns `cm`, the blended matrix, and `weight`, the first calibration's share: 1 at or below its temperature, 0 at or above the second's, and linear in mired between.
 *  What it must satisfy: a spec with one matrix gives that matrix whatever the white is. */
function matrixFor(spec: ColourSpec, x: number, y: number): { cm: number[]; weight: number } {
  const t = xyToTempTint(x, y).kelvin;
  let g: number;
  if (t <= spec.t1) g = 1;
  else if (t >= spec.t2) g = 0;
  else g = (1 / t - 1 / spec.t2) / (1 / spec.t1 - 1 / spec.t2);
  const cm = g >= 1 ? spec.cm1.slice() : g <= 0 ? spec.cm2.slice() : spec.cm1.map((v, i) => g * v + (1 - g) * spec.cm2[i]);
  return { cm, weight: g };
}

/** A camera neutral as a chromaticity: the SDK's `NeutralToXY`.
 *  @param spec  the profile's calibrations.
 *  @param neutral  the camera's response to the white, three numbers above 0 at any common scale.
 *  @returns the white's `x` and `y`, found in at most thirty passes starting from D50 (the average of the last two when it does not settle), and `passes`; null when a matrix cannot be inverted.
 *  What it must satisfy: scaling the neutral changes nothing. */
function neutralToXy(spec: ColourSpec, neutral: ReadonlyArray<number>): { x: number; y: number; passes: number } | null {
  let lx = D50_X, ly = D50_Y;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const inv = inv3(matrixFor(spec, lx, ly).cm);
    if (!inv) return null;
    const xyz = mulMV(inv, neutral);
    const total = xyz[0] + xyz[1] + xyz[2];
    let nx = total > 0 ? xyz[0] / total : D50_X, ny = total > 0 ? xyz[1] / total : D50_Y;
    if (Math.abs(nx - lx) + Math.abs(ny - ly) < SETTLED) return { x: nx, y: ny, passes: pass + 1 };
    if (pass === MAX_PASSES - 1) { nx = (lx + nx) * 0.5; ny = (ly + ny) * 0.5; }
    lx = nx; ly = ny;
  }
  return { x: lx, y: ly, passes: MAX_PASSES };
}

/** The white a set of gains stands for, read through a profile.
 *  @param spec  the profile's calibrations (`makeColourSpec`).
 *  @param gains  red, green and blue, each above 0, at any common level; the camera's neutral is their reciprocals.
 *  @returns `kelvin`, `mired`, `tint`, the chromaticity `x` and `y`, `weight` (the first calibration's share) and `passes`; or null when a gain is not above 0, a matrix cannot be inverted, or the white has no uv.
 *  What it must satisfy: it depends on the ratios between the gains only; `whiteToGains` of the result gives the same ratios back to within a hundredth of a percent wherever the table covers the white (above 1667 K); and a kelvin figure outside `KELVIN_MIN` to `KELVIN_MAX` is returned as it is, for the caller to rest a control at an end and print the figure. Consumers: the Temperature and Tint sliders, their typed boxes, the report. */
export function gainsToWhite(spec: ColourSpec, gains: ArrayLike<number>): { kelvin: number; mired: number; tint: number; x: number; y: number; weight: number; passes: number } | null {
  if (!(gains[0] > 0 && gains[1] > 0 && gains[2] > 0)) return null;
  const xy = neutralToXy(spec, [1 / gains[0], 1 / gains[1], 1 / gains[2]]);
  if (!xy) return null;
  const t = xyToTempTint(xy.x, xy.y);
  if (!Number.isFinite(t.kelvin) || !Number.isFinite(t.tint)) return null;
  return { kelvin: t.kelvin, mired: t.mired, tint: t.tint, x: xy.x, y: xy.y, weight: matrixFor(spec, xy.x, xy.y).weight, passes: xy.passes };
}

/** The gains that make a white neutral, read through a profile: the SDK's `SetWhiteXY` for the camera white, then its reciprocals.
 *  @param spec  the profile's calibrations (`makeColourSpec`).
 *  @param kelvin  the temperature, above 0.
 *  @param tint  the tint in the SDK's units.
 *  @returns red, green and blue gains whose product is 1 (the white's level is the caller's), or null when the white gives a channel no light or a number is not finite.
 *  What it must satisfy: the SDK pins each channel of the camera white to 0.001 to 1 before taking reciprocals, so a white that gives a channel less than a thousandth of the largest is not exactly reproduced; for every other white, `gainsToWhite` of the result reads back the kelvin and tint asked for. Consumers: the Temperature and Tint sliders' moves. */
export function whiteToGains(spec: ColourSpec, kelvin: number, tint: number): [number, number, number] | null {
  const xy = tempTintToXy(kelvin, tint);
  if (!Number.isFinite(xy.x) || !Number.isFinite(xy.y)) return null;
  const { cm } = matrixFor(spec, xy.x, xy.y);
  const w = mulMV(cm, xyToXYZ(xy.x, xy.y));
  const top = Math.max(...w);
  if (!(top > 0) || !w.every((v) => Number.isFinite(v))) return null;
  const n = w.map((v) => Math.min(Math.max(0.001, v / top), 1));
  const g = n.map((v) => 1 / v);
  const level = Math.cbrt(g[0] * g[1] * g[2]);
  return [g[0] / level, g[1] / level, g[2] / level];
}
