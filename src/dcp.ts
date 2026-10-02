// DNG Camera Profile (.dcp) export for Lightroom / Camera Raw.
//
// Encodes the creative look (channel swap + hue + saturation, plus a tone curve
// for contrast) as a ProfileHueSatMap, and embeds the camera's ColorMatrix —
// the one the app rendered with, under the illuminant its file names, with its
// white point MOVED to the infrared neutral this photograph was balanced to.
//
// WHY THE WHITE POINT MOVES (2026-10-02). White balance stays the reader's
// per-shot adjustment in Lightroom, but Lightroom's Temp slider runs 2,000 to
// 50,000 K, and an ordinary visible-light matrix puts an infrared white point
// below that floor (IR-SCIENCE.md section 3): the reader could not neutralise
// the frame the swap is then applied to. Infrared camera profiles exist for
// exactly this — they recentre white balance by changing the colour matrix
// (Rob Shea's Temp -100 profiles; DNG Profile Editor's White Balance
// Calibration). This one scales the camera side of the matrix so the app's own
// balance (the gains in `params.wb`) reads as daylight, D65.
//
// WHERE LIGHTROOM APPLIES THE TABLE (2026-10-02). DNG 1.7.1.0, "Applying the
// Hue/Saturation/Value Mapping Table": after camera -> XYZ (D50), "the XYZ (D50)
// values are converted to linear RGB coordinates, using the ProPhoto RGB
// primaries", and the table works in the HSV of THAT. The app's look works in
// linear RGB with sRGB primaries, so until this date the table carried a
// ProPhoto R/B swap, which lands on different colours. Each node is now taken
// from ProPhoto to the app's space, through the app's own steps, and back.
//
// IMPORTANT: the .cube path is verified numerically here; a .dcp's *colour*
// can only be confirmed inside Lightroom/ACR (not available in this build env),
// so this is a v1 to validate in Lightroom. Structure is validated against a
// TIFF/DNG reader.

import { mix3IsIdentity, MIX3_DEFAULT, hueRotate, type EditParams } from "./pipeline";
import { Tiff, type Ifd } from "./raw/tiff";
import { nikonColorMatrix } from "./color";
import { cameraModel, readCameraMatrixTagged } from "./decode";
import { srgbToLinear, srgbFromLinear } from "./icc";

// The Nikon Z 50 fallback matrix is color.ts's NIKON_Z50_COLOR_MATRIX, reached
// through nikonColorMatrix exactly as the decode reaches it — this file kept its
// own copy until 2026-10-02, which is one rule in two places.

// 360 hue divisions, one a degree (2026-10-02; 36 before). A swap shifts hue by
// 240 - 2h, which wraps past +-180 twice round the circle, and every reader
// interpolates the stored shifts STRAIGHT THROUGH a wrap (RawTherapee's
// hsdApply, ported from Adobe's reference: hue_shift0 = h_fract0 * a + h_fract1
// * b) — so the cell holding a wrap renders hues near +180 and -180 as their
// average, about 0. With 36 divisions two 10-degree bands of the swap were
// wrong (hue 35 rendered near 25 instead of 205); with 360 the two unavoidable
// cells are one degree each. Within one hue node the wrap is made to fall on
// the same side at every saturation and value (unwrapHueColumn), so no cell
// interpolates across it in those two directions at all.
const HUE_DIVS = 360;
const SAT_DIVS = 8;
// VALUE DIVISIONS, sRGB-encoded, so the app's shadow fade survives: a
// saturation boost fades out below luma 0.20 (smoothstep 0.02-0.20) in both the
// CPU and GPU paths, and a table with one value division is constant in value
// (DNG: "If the division count in a dimension is 1, then the table is constant
// for that dimension"), which gave dark saturated colours the full boost the
// app withholds. sRGB encoding (ProfileHueSatMapEncoding = 1) puts most of the
// nodes where the fade is, which is what the spec offers it for: "additional
// table precision to dark (shadow) image values".
const VAL_DIVS = 8;

const TYPE = { ASCII: 2, SHORT: 3, LONG: 4, SRATIONAL: 10, FLOAT: 11 } as const;

interface Entry {
  tag: number;
  type: number;
  count: number;
  bytes: Uint8Array; // raw value bytes (little-endian)
}

/**
 * Build a DNG camera profile carrying this edit's look.
 * @param params       the edit: its swap, mixer, hue, saturation (with the
 *   app's shadow fade) go into the hue/sat/value table, its contrast into the
 *   tone curve, and its white balance `wb` into the matrix's white point.
 * @param sourceBytes  the original file, for the matrix the render used, its
 *   illuminant and the camera's name; undefined falls back to the Z 50.
 * @param name         ProfileName, as Lightroom lists it.
 * @param raw          true when the app rendered this photograph through a
 *   camera matrix with `params.wb` as raw gains — only then are those gains a
 *   camera neutral the matrix can be recentred on. False (a camera JPEG or
 *   PNG, an embedded preview) writes the matrix unshifted. Every DNG raw image
 *   is camera-native now, lossy LinearRaw included, and passes true.
 * @returns the .dcp file (TIFF structure, magic 0x4352).
 * What the result must satisfy (DNG 1.7.1.0): ColorMatrix1 is the matrix the
 *   decode rendered with (readCameraMatrixTagged, else nikonColorMatrix) and
 *   CalibrationIlluminant1 is the one its file names — absent when it names
 *   none, never a guessed D65; ForwardMatrix1 is present exactly when that
 *   set carries one, because then the decode rendered through it
 *   (color.ts dngCameraToSrgb: CameraToXYZ_D50 = FM * D) and a reader given
 *   the ColorMatrix alone takes the other route (until 2026-10-02 it was
 *   never written, and a profile made from a ForwardMatrix DNG rendered
 *   colours nowhere near the app's in a spec reader); UniqueCameraModel names the camera that matrix
 *   belongs to; every zero-saturation table entry is [0, 1, 1] ("All zero input
 *   saturation entries are required to have a value scale factor of 1.0");
 *   ProfileEmbedPolicy is 0, "allow copying" — a profile meant to be shared,
 *   where 1 ("embed if used") forbids copying it out of a DNG for any other
 *   image. Consumer: the Export .dcp button in main.ts.
 */
export function generateDcp(params: EditParams, sourceBytes: Uint8Array | undefined, name = "IPS IR Look", raw = true): ArrayBuffer {
  const src = profileSource(sourceBytes);
  const colorMatrix = raw ? recentreOnNeutral(src.matrix, params.wb) : src.matrix;
  const hsm = buildHueSatMap(params);
  const tone = buildToneCurve(params.contrast);

  const entries: Entry[] = [
    asciiEntry(50708, src.model), // UniqueCameraModel
    srationalEntry(50721, colorMatrix), // ColorMatrix1
    // ForwardMatrix1, when the source's own set has one: it is the route the
    // decode rendered through, and the recentred ColorMatrix above then only
    // turns a white balance into a camera neutral, as the spec gives it.
    ...(src.forward ? [srationalEntry(50964, src.forward)] : []),
    asciiEntry(50936, name), // ProfileName
    longEntry(50937, [HUE_DIVS, SAT_DIVS, VAL_DIVS]), // ProfileHueSatMapDims
    floatEntry(50938, hsm), // ProfileHueSatMapData1
    floatEntry(50940, tone), // ProfileToneCurve
    longEntry(50941, [0]), // ProfileEmbedPolicy = 0, "allow copying"
    asciiEntry(50942, "Generated by Infrared Photography Studio"), // ProfileCopyright
    longEntry(51107, [1]), // ProfileHueSatMapEncoding = 1, sRGB (see VAL_DIVS)
  ];
  // CalibrationIlluminant1 ONLY WHEN THE FILE NAMED ONE. Until 2026-10-02 this
  // wrote 21 (D65) beside whatever matrix it found — in an Adobe two-matrix DNG
  // the first one it found was the tungsten (A) calibration. The spec default,
  // 0, is "unknown", which is the truth for a file that names nothing.
  if (src.illuminant !== undefined) entries.push(shortEntry(50778, [src.illuminant]));
  entries.sort((a, b) => a.tag - b.tag);

  return assembleTiff(entries);
}

// --- the matrix, its illuminant, and the camera's name ---

/** D65's XYZ as the app's own sRGB matrix implies it (the rows of dcraw's
 *  xyz_rgb summed) — the white camToSrgbLinear normalises the camera to, so the
 *  neutral this file's matrix is recentred from is the one the app used. */
const D65_XYZ = [0.950456, 1.0, 1.088754];
/** D50, the PCS white, as ProPhoto's own primaries sum to it. */
const D50_XYZ = [0.96422, 1.0, 0.82521];

/** The matrix the decode rendered with, the same set's ForwardMatrix when it
 *  has one, the illuminant its file names for it, and the UniqueCameraModel a
 *  reader indexes profiles by. Mirrors decode.ts:
 *  readCameraMatrixTagged first, then nikonColorMatrix by the Model string,
 *  whose two constants are both Adobe-converter ColorMatrix2 values (D65). */
function profileSource(sourceBytes: Uint8Array | undefined): { matrix: number[]; forward?: number[]; illuminant: number | undefined; model: string } {
  let ifds: Ifd[] = [];
  try {
    if (sourceBytes && (sourceBytes[0] === 0x49 || sourceBytes[0] === 0x4d)) ifds = new Tiff(sourceBytes).allIfds();
  } catch {
    ifds = [];
  }
  const tagged = ifds.length ? readCameraMatrixTagged(ifds) : undefined;
  const body = cameraModel(ifds);
  const matrix = tagged?.matrix ?? nikonColorMatrix(body);
  const illuminant = tagged ? tagged.illuminant : 21;
  return { matrix, forward: tagged?.forward, illuminant, model: uniqueCameraModel(ifds) ?? "Nikon Z 50" };
}

/** UniqueCameraModel for the profile: a DNG's own (tag 50708) when it carries
 *  one — that is the string its reader will look a profile up by — else the
 *  EXIF Make's first word in title case and the Model without the maker
 *  repeated ("NIKON CORPORATION" + "NIKON Z 50" -> "Nikon Z 50"). Not verified
 *  against a Lightroom install here: the form is the one Adobe's own profile
 *  names use, and no Adobe-converted DNG among the owner's files carries 50708
 *  to check it against. Until 2026-10-02 every profile said "NIKON Z 50",
 *  including one carrying a D5300's matrix. */
function uniqueCameraModel(ifds: Ifd[]): string | undefined {
  let make: string | undefined;
  let model: string | undefined;
  for (const d of ifds) {
    const u = d.str(50708);
    if (u && u.trim()) return u.trim();
    make ??= d.str(271);
    model ??= d.str(272);
  }
  if (!model || !model.trim()) return undefined;
  const brand = (make ?? "").trim().split(/\s+/)[0] ?? "";
  let m = model.trim();
  if (brand && m.toUpperCase().startsWith(brand.toUpperCase() + " ")) m = m.slice(brand.length + 1).trim();
  const title = brand ? brand[0].toUpperCase() + brand.slice(1).toLowerCase() : "";
  return title ? `${title} ${m}` : m;
}

/** The matrix with its white point moved to the app's infrared neutral.
 *
 *  The app renders camera RGB c as camToSrgbLinear(CM) . diag(wb) . c, and
 *  camToSrgbLinear normalises the camera to n65 = CM . D65 — so the app's
 *  rendering is sRGB-from-XYZ . inverse(CM) . diag(n65 / nIR) . c, with
 *  nIR = 1 / wb the camera neutral it balanced to. Scaling the CAMERA side,
 *  CM' = diag(nIR / n65) . CM, makes CM' . D65 = nIR: Lightroom then reads the
 *  infrared neutral as D65, and at that white balance its camera -> XYZ (D50)
 *  is the Bradford D65 -> D50 of exactly the app's XYZ. Normalised so the
 *  largest component of the neutral is 1, the scale Adobe's profiles use. */
function recentreOnNeutral(cm: number[], wb: readonly number[]): number[] {
  const n65 = [0, 1, 2].map((r) => cm[r * 3] * D65_XYZ[0] + cm[r * 3 + 1] * D65_XYZ[1] + cm[r * 3 + 2] * D65_XYZ[2]);
  const nIR = [0, 1, 2].map((r) => 1 / Math.max(1e-6, wb[r] ?? 1));
  const top = Math.max(nIR[0], nIR[1], nIR[2]);
  const out: number[] = [];
  for (let r = 0; r < 3; r++) {
    const k = nIR[r] / top / (Math.abs(n65[r]) > 1e-9 ? n65[r] : 1);
    out.push(cm[r * 3] * k, cm[r * 3 + 1] * k, cm[r * 3 + 2] * k);
  }
  return out;
}

// --- look table ---

/** Creative transform in LINEAR space (no gamma, no WB) — for HSV deltas. */
function creativeLinear(r: number, g: number, b: number, p: EditParams): [number, number, number] {
  if (p.swapRB) {
    const t = r;
    r = b;
    b = t;
  }
  // Custom 3×3 mixer (after swap, before hue) — mirrors compileEdit, so the
  // .dcp hue-sat map carries the false-colour remix too (best-effort: a mixer
  // that changes luminance per hue only approximates in a hue-sat-value map).
  if (!mix3IsIdentity(p.mix3)) {
    const m = p.mix3 ?? MIX3_DEFAULT;
    const xr = m[0] * r + m[1] * g + m[2] * b;
    const xg = m[3] * r + m[4] * g + m[5] * b;
    const xb = m[6] * r + m[7] * g + m[8] * b;
    r = xr; g = xg; b = xb;
  }
  // The same luminance-keeping hue rotation as compileEdit (hueRotate).
  const a = (p.hue * Math.PI) / 180;
  const t = new Float64Array(3);
  hueRotate(r, g, b, Math.cos(a), Math.sin(a), t);
  let nr = t[0], ng = t[1], nb = t[2];
  const luma = nr * 0.2126 + ng * 0.7152 + nb * 0.0722;
  nr = luma + (nr - luma) * p.sat;
  ng = luma + (ng - luma) * p.sat;
  nb = luma + (nb - luma) * p.sat;
  return [nr, ng, nb];
}

/** The app's colour steps WITH its shadow fade: creativeLinear's swap, mixer
 *  and hue at saturation 1, then the saturation the way compileEdit and the
 *  shader apply it — a boost (sat > 1) fading out below luma 0.20,
 *  smoothstep(0.02, 0.20, luma), so it does not amplify chroma noise. */
function creativeWithFade(r: number, g: number, b: number, p: EditParams): [number, number, number] {
  const [nr, ng, nb] = creativeLinear(r, g, b, p.sat === 1 ? p : { ...p, sat: 1 });
  const luma = nr * 0.2126 + ng * 0.7152 + nb * 0.0722;
  let satEff = p.sat;
  if (p.sat > 1) {
    const t = Math.min(1, Math.max(0, (luma - 0.02) / 0.18));
    satEff = 1 + (p.sat - 1) * t * t * (3 - 2 * t);
  }
  return [luma + (nr - luma) * satEff, luma + (ng - luma) * satEff, luma + (nb - luma) * satEff];
}

// --- ProPhoto, where a DNG reader applies the table ---

function mul3(a: number[], b: number[]): number[] {
  const o = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return o;
}
function inv3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g);
  const G = b * f - c * e, H = -(a * f - c * d), I = a * e - b * d;
  const det = a * A + b * B + c * C || 1;
  return [A / det, D / det, G / det, B / det, E / det, H / det, C / det, F / det, I / det];
}
function apply3(m: number[], r: number, g: number, b: number): [number, number, number] {
  return [m[0] * r + m[1] * g + m[2] * b, m[3] * r + m[4] * g + m[5] * b, m[6] * r + m[7] * g + m[8] * b];
}

/** Linear ProPhoto (ROMM) RGB -> XYZ D50 (Lindbloom). */
const PROPHOTO_TO_XYZ = [0.7976749, 0.1351917, 0.0313534, 0.2880402, 0.7118741, 0.0000857, 0, 0, 0.82521];
/** Linear sRGB -> XYZ D65: dcraw's xyz_rgb, the matrix color.ts builds the
 *  camera's sRGB transform from, so "the app's space" is exactly that one. */
const SRGB_TO_XYZ = [0.412453, 0.35758, 0.180423, 0.212671, 0.71516, 0.072169, 0.019334, 0.119193, 0.950227];

/** Linear Bradford adaptation between two XYZ whites — the method the DNG
 *  spec recommends for the camera -> XYZ (D50) step. */
function bradford(from: number[], to: number[]): number[] {
  const M = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296];
  const s = apply3(M, from[0], from[1], from[2]);
  const d = apply3(M, to[0], to[1], to[2]);
  return mul3(inv3(M), mul3([d[0] / s[0], 0, 0, 0, d[1] / s[1], 0, 0, 0, d[2] / s[2]], M));
}

/** ProPhoto linear -> the app's linear working space (sRGB primaries, D65),
 *  through XYZ D50 and Bradford to D65 — the inverse of what Lightroom does to
 *  the app's colours at a D65 white (see recentreOnNeutral). Each row is
 *  renormalised to sum to 1 so a ProPhoto neutral is EXACTLY an app neutral;
 *  the published constants round, and a profile must not tint grey. */
const PROPHOTO_TO_APP = (() => {
  const m = mul3(inv3(SRGB_TO_XYZ), mul3(bradford(D50_XYZ, D65_XYZ), PROPHOTO_TO_XYZ));
  for (let r = 0; r < 3; r++) {
    const k = m[r * 3] + m[r * 3 + 1] + m[r * 3 + 2];
    m[r * 3] /= k; m[r * 3 + 1] /= k; m[r * 3 + 2] /= k;
  }
  return m;
})();
const APP_TO_PROPHOTO = inv3(PROPHOTO_TO_APP);

/** One table node: the app's look at a ProPhoto HSV point, as the DNG reader
 *  will apply it — [hueShiftDeg, satScale, valScale], valScale on the
 *  sRGB-ENCODED value (ProfileHueSatMapEncoding 1: "Apply color table result
 *  to the encoded values"). `vLin` is the node's linear value. */
function nodeShift(p: EditParams, hue: number, sat: number, vLin: number): [number, number, number] {
  const [r, g, b] = hsv2rgb(hue, sat, vLin);
  const [ar, ag, ab] = apply3(PROPHOTO_TO_APP, r, g, b);
  const [cr, cg, cb] = creativeWithFade(ar, ag, ab, p);
  const [pr, pg, pb] = apply3(APP_TO_PROPHOTO, cr, cg, cb);
  const [oh, os, ov] = rgb2hsv(pr, pg, pb);
  let dh = oh - hue;
  while (dh > 180) dh -= 360;
  while (dh < -180) dh += 360;
  const vScale = ov > 0 ? srgbFromLinearUnclamped(ov) / srgbFromLinearUnclamped(vLin) : 0;
  return [dh, Math.min(8, Math.max(0, os / sat)), clampScale(vScale)];
}

/** The sRGB encoding curve without the clamp at 1 (a node's output value can
 *  exceed it), linear below the knee as the curve is. */
function srgbFromLinearUnclamped(v: number): number {
  if (v <= 1) return srgbFromLinear(v);
  return 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

/** Put a hue node's wrap on ONE side. Shifts close to +180 and -180 are the
 *  same rotation, but a reader interpolating between a +179.9 and a -179.9
 *  renders about 0; flipping the minority by 360 keeps every saturation and
 *  value of the node on the majority's side (at most a hair past 180, which
 *  every reader wraps once after adding). Zero-saturation entries are not
 *  rotations and are left alone. */
function unwrapHueColumn(shifts: number[]): void {
  let pos = 0, neg = 0;
  for (const d of shifts) { if (d > 90) pos++; else if (d < -90) neg++; }
  if (!pos || !neg) return;
  for (let i = 0; i < shifts.length; i++) {
    if (pos >= neg && shifts[i] < -90) shifts[i] += 360;
    else if (pos < neg && shifts[i] > 90) shifts[i] -= 360;
  }
}

/** ProfileHueSatMapData1: per (value, hue, sat) -> [hueShiftDeg, satScale,
 *  valScale], in the spec's nested order — "value divisions in the outer
 *  loop, the hue divisions in the middle loop, and the saturation divisions
 *  in the inner loop". Nodes sit at hue h * 360 / HUE_DIVS, saturation
 *  s / (SAT_DIVS - 1) and sRGB-encoded value v / (VAL_DIVS - 1). */
function buildHueSatMap(p: EditParams): number[] {
  const n = HUE_DIVS * SAT_DIVS * VAL_DIVS;
  const data = new Array<number>(n * 3);
  const at = (v: number, h: number, s: number) => ((v * HUE_DIVS + h) * SAT_DIVS + s) * 3;
  for (let v = 0; v < VAL_DIVS; v++) {
    // The black node has no colour to measure: it is evaluated just above
    // black, where the app's fade has already turned any boost off, so the
    // cell between it and the next node interpolates the look a near-black
    // colour actually gets.
    const enc = VAL_DIVS > 1 ? v / (VAL_DIVS - 1) : 0.5;
    const vLin = Math.max(1e-4, srgbToLinear(enc));
    for (let h = 0; h < HUE_DIVS; h++) {
      const hue = (h * 360) / HUE_DIVS;
      for (let s = 0; s < SAT_DIVS; s++) {
        const sat = SAT_DIVS > 1 ? s / (SAT_DIVS - 1) : 0;
        const i = at(v, h, s);
        if (sat < 1e-4) {
          // REQUIRED by the spec, not a choice: "All zero input saturation
          // entries are required to have a value scale factor of 1.0". A grey
          // has no hue to shift and no saturation to scale either.
          data[i] = 0; data[i + 1] = 1; data[i + 2] = 1;
          continue;
        }
        const [dh, ss, vs] = nodeShift(p, hue, sat, vLin);
        data[i] = dh; data[i + 1] = ss; data[i + 2] = vs;
      }
    }
  }
  // One hue node at a time, across every saturation and value it holds.
  for (let h = 0; h < HUE_DIVS; h++) {
    const idx: number[] = [];
    for (let v = 0; v < VAL_DIVS; v++) for (let s = 1; s < SAT_DIVS; s++) idx.push(at(v, h, s));
    const col = idx.map((i) => data[i]);
    unwrapHueColumn(col);
    idx.forEach((i, k) => { data[i] = col[k]; });
  }
  return data;
}

/** How many points of the curve sit below TONE_TOP; one more, (1, 1), ends it. */
const TONE_POINTS = 33;
/** The last point taken from the app's own curve; above it the curve runs to
 *  the pinned (1, 1), the one interval the nine-point curve also had there. */
const TONE_TOP = 0.875;

/**
 * ProfileToneCurve: the app's contrast about 18% grey and its highlight
 * shoulder, as they act on a neutral — the same two formulas as contrastGain
 * and shoulderGain in pipeline.ts — with the last point pinned to (1, 1) so a
 * profile's white stays white.
 *
 * THIRTY-THREE POINTS EVENLY SPACED IN sRGB-ENCODED x up to TONE_TOP, not nine
 * evenly spaced in linear x. A reader runs a cubic spline through the stored
 * points (RawTherapee's DCT_Spline over ProfileToneCurve; Adobe's own default
 * curve is stored as 1,025), and contrast about 18% grey is a power curve whose
 * bend is in the deep shadows — where nine linear points put one point, at
 * 0.125. At contrast 1.35 that spline rendered linear 0.011 at 0.0084 against
 * the app's 0.0041, nine levels of 255 too bright on screen, which is the
 * crushed-or-lifted shadow the 18% fulcrum was introduced to stop. Spaced in
 * the encoded value the points follow the bend, and the spline stays within
 * about one level of the app below TONE_TOP (2026-10-02).
 * @param contrast  the edit's contrast, 1 = none.
 * @returns the curve as x, y pairs, x rising from 0 to 1, y from 0 to 1.
 * What the result must satisfy: below TONE_TOP every point is exactly the app's
 *   neutral response, and the last point is (1, 1). Consumer: generateDcp.
 */
function buildToneCurve(contrast: number): number[] {
  const response = (x: number): number => {
    let y = x > 0 ? 0.1845 * Math.pow(x / 0.1845, contrast) : 0;
    if (y > 0.8) y = 0.8 + 0.2 * (1 - Math.exp(-(y - 0.8) / 0.2));
    return Math.min(1, Math.max(0, y));
  };
  const top = srgbFromLinear(TONE_TOP);
  const pts: number[] = [];
  for (let i = 0; i < TONE_POINTS; i++) {
    const x = i === TONE_POINTS - 1 ? TONE_TOP : srgbToLinear((i / (TONE_POINTS - 1)) * top);
    pts.push(x, response(x));
  }
  pts.push(1, 1);
  return pts;
}

function clampScale(v: number): number {
  return Math.min(8, Math.max(0.01, v));
}

// --- HSV helpers ---

function hsv2rgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const hh = h / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hh < 1) [r, g, b] = [c, x, 0];
  else if (hh < 2) [r, g, b] = [x, c, 0];
  else if (hh < 3) [r, g, b] = [0, c, x];
  else if (hh < 4) [r, g, b] = [0, x, c];
  else if (hh < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = v - c;
  return [r + m, g + m, b + m];
}

function rgb2hsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-9) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max < 1e-9 ? 0 : d / max, max];
}

// --- TIFF assembly ---

function assembleTiff(entries: Entry[]): ArrayBuffer {
  const n = entries.length;
  const ifdStart = 8;
  const ifdSize = 2 + n * 12 + 4;
  let extOffset = ifdStart + ifdSize;
  const externals: { at: number; bytes: Uint8Array }[] = [];
  for (const e of entries) {
    if (e.bytes.length > 4) {
      if (extOffset & 1) extOffset++; // word align
      externals.push({ at: extOffset, bytes: e.bytes });
      (e as Entry & { _off?: number })._off = extOffset;
      extOffset += e.bytes.length;
    }
  }
  const buf = new ArrayBuffer(extOffset);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  dv.setUint16(0, 0x4949, true); // little-endian
  // DCP magic is 0x4352 ("CR"), NOT TIFF's 42 — Adobe's dng_camera_profile
  // rejects a profile with plain-TIFF magic outright (review find, 2026-07-15).
  dv.setUint16(2, 0x4352, true);
  dv.setUint32(4, ifdStart, true);
  dv.setUint16(ifdStart, n, true);

  let p = ifdStart + 2;
  for (const e of entries) {
    dv.setUint16(p, e.tag, true);
    dv.setUint16(p + 2, e.type, true);
    dv.setUint32(p + 4, e.count, true);
    if (e.bytes.length <= 4) {
      u8.set(e.bytes, p + 8);
    } else {
      dv.setUint32(p + 8, (e as Entry & { _off: number })._off, true);
    }
    p += 12;
  }
  dv.setUint32(p, 0, true); // next IFD
  for (const ext of externals) u8.set(ext.bytes, ext.at);
  return buf;
}

function asciiEntry(tag: number, s: string): Entry {
  const bytes = new Uint8Array(s.length + 1);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return { tag, type: TYPE.ASCII, count: bytes.length, bytes };
}

function shortEntry(tag: number, vals: number[]): Entry {
  const bytes = new Uint8Array(vals.length * 2);
  const dv = new DataView(bytes.buffer);
  vals.forEach((v, i) => dv.setUint16(i * 2, v, true));
  return { tag, type: TYPE.SHORT, count: vals.length, bytes };
}

function longEntry(tag: number, vals: number[]): Entry {
  const bytes = new Uint8Array(vals.length * 4);
  const dv = new DataView(bytes.buffer);
  vals.forEach((v, i) => dv.setUint32(i * 4, v, true));
  return { tag, type: TYPE.LONG, count: vals.length, bytes };
}

function floatEntry(tag: number, vals: number[]): Entry {
  const bytes = new Uint8Array(vals.length * 4);
  const dv = new DataView(bytes.buffer);
  vals.forEach((v, i) => dv.setFloat32(i * 4, v, true));
  return { tag, type: TYPE.FLOAT, count: vals.length, bytes };
}

function srationalEntry(tag: number, vals: number[]): Entry {
  const bytes = new Uint8Array(vals.length * 8);
  const dv = new DataView(bytes.buffer);
  vals.forEach((v, i) => {
    dv.setInt32(i * 8, Math.round(v * 10000), true);
    dv.setInt32(i * 8 + 4, 10000, true);
  });
  return { tag, type: TYPE.SRATIONAL, count: vals.length, bytes };
}
