// .cube (Adobe/Resolve 3D LUT) IMPORT parser. The app's own .cube WRITER
// lives in lut.ts (generateCube); this reads the same format back — including
// files from anywhere else on the internet, so every reject path speaks a
// user-facing sentence and nothing is trusted.
//
// Output contract (what the rest of the app relies on):
//  - `data` is Float32Array, stride 3 (RGB), RED FASTEST (.cube row order:
//    idx = ((bi*N + gi)*N + ri) * 3) — the layout lut3d.ts samples.
//  - Unit domain: a non-unit DOMAIN_MIN/MAX is resolved HERE, at parse time,
//    by resampling the grid onto [0,1]³ — so downstream there is exactly one
//    sample formula and no domain uniforms. (Non-unit domains are essentially
//    log/HDR LUTs, which our display-referred [0,1] pipeline cannot honour;
//    clamped resampling is the honest best effort.) Resolve's own spelling of
//    the same thing, LUT_3D_INPUT_RANGE MIN MAX, is read as DOMAIN_MIN MIN MIN
//    MIN and DOMAIN_MAX MAX MAX MAX, as OpenColorIO's Resolve reader applies it
//    (it was ignored until 2026-10-01, so such a file was looked up as if its
//    grid covered 0..1).
//  - Values AS THE FILE HAS THEM, not clamped: the Cube specification §5.7
//    says table values "are unconstrained", and clamping a node is not the
//    same as clamping what is interpolated from it (a 17-point LUT of 1.25x
//    gave 0.9875 at grey 0.80 where the file means 1.0). The sampler clamps
//    its RESULT instead (lut3d.ts sampleLut3d, and the shader's twin), which
//    is what the 16-bit TIFF write and the GPU framebuffer need. Until
//    2026-10-01 the values were clamped here.

import { sampleLut3dRaw } from "./lut3d";

export interface ParsedCube {
  /** From TITLE "…", if present. Caller cleans it (look.ts cleanName). */
  name?: string;
  /** Grid size N per axis, 2..65. */
  size: number;
  /** N³ RGB triples, red fastest, unit domain, values as the file gives them
   *  (only the sampler's result is clamped). */
  data: Float32Array;
}

export const CUBE_SIZE_MAX = 65;
export const CUBE_FILE_MAX = 8 * 1024 * 1024;

const FLOAT_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

const num = (tok: string): number => (FLOAT_RE.test(tok) ? Number(tok) : NaN);
/** The Cube specification's number range (§5.4): no number beyond ±1e37,
 *  which keeps every value finite in the Float32Array it is stored in. */
const CUBE_NUM_MAX = 1e37;

/**
 * Parse .cube text (Adobe Cube LUT 1.0, plus Resolve's LUT_3D_INPUT_RANGE).
 * @param text  the whole file, decoded as text.
 * @returns the LUT's name (from TITLE, if any), its grid size N (2..65) and its
 *   lattice, red fastest, resampled onto the unit domain when the file
 *   declares another one, with the table's values kept as the file gives them.
 *   Holds: data.length === N³·3 and every value is finite, so lut3d.ts can
 *   sample it and gl.ts can upload it as RGBA32F; consumers are the LUT import
 *   paths in main.ts and luts.ts getLut, which re-reads stored files with it.
 * @throws Error with a user-facing sentence for anything it will not read.
 */
export function parseCube(text: string): ParsedCube {
  if (text.length > CUBE_FILE_MAX) {
    throw new Error("That .cube file is too large — files up to 8 MB (grid size 65) are supported.");
  }
  const lines = text.split(/\r?\n/);
  let name: string | undefined;
  let size = 0;
  let domMin: [number, number, number] | null = null;
  let domMax: [number, number, number] | null = null;
  let data: Float32Array | null = null;
  let filled = 0;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].trim();
    if (!line || line.startsWith("#")) continue;

    if (/^[A-Za-z_]/.test(line)) {
      // Keyword line. After data has started, a keyword means a malformed file.
      if (filled > 0) throw new Error(`That .cube file has a header line in the middle of its data (line ${li + 1}).`);
      const [kw, ...rest] = line.split(/\s+/);
      const KW = kw.toUpperCase();
      if (KW === "TITLE") {
        const m = line.match(/^TITLE\s+"(.*)"\s*$/i);
        name = m ? m[1] : rest.join(" ");
      } else if (KW === "LUT_3D_SIZE") {
        if (size) throw new Error("That .cube file declares LUT_3D_SIZE more than once.");
        const n = Number(rest[0]);
        if (!Number.isInteger(n)) throw new Error("That .cube file's LUT_3D_SIZE isn't a whole number.");
        if (n < 2) throw new Error("That .cube file's grid is too small to be a 3D LUT (LUT_3D_SIZE must be at least 2).");
        if (n > CUBE_SIZE_MAX) throw new Error(`Grids above ${CUBE_SIZE_MAX} aren't supported (this one is ${n}).`);
        size = n;
      } else if (KW === "LUT_1D_SIZE") {
        throw new Error("1D LUTs aren't supported — this app applies 3D colour looks (.cube with LUT_3D_SIZE).");
      } else if (KW === "DOMAIN_MIN" || KW === "DOMAIN_MAX") {
        if (rest.length !== 3) throw new Error(`That .cube file's ${KW} doesn't have three values.`);
        const v = rest.map(num) as [number, number, number];
        if (v.some((x) => !isFinite(x))) throw new Error(`That .cube file's ${KW} has an unreadable value.`);
        if (KW === "DOMAIN_MIN") domMin = sameRange(domMin, v);
        else domMax = sameRange(domMax, v);
      } else if (KW === "LUT_3D_INPUT_RANGE") {
        // Resolve's input range: the same bounds on all three channels.
        if (rest.length !== 2) throw new Error("That .cube file's LUT_3D_INPUT_RANGE doesn't have two values.");
        const [lo, hi] = rest.map(num);
        if (!isFinite(lo) || !isFinite(hi)) throw new Error("That .cube file's LUT_3D_INPUT_RANGE has an unreadable value.");
        domMin = sameRange(domMin, [lo, lo, lo]);
        domMax = sameRange(domMax, [hi, hi, hi]);
      }
      // Any other keyword (vendor extras like LUT_IN_VIDEO_RANGE): ignored.
      continue;
    }

    // Data row: exactly three floats.
    if (!size) throw new Error("That .cube file starts its data before declaring LUT_3D_SIZE.");
    if (!data) data = new Float32Array(size * size * size * 3);
    if (filled >= size * size * size) {
      throw new Error(`That .cube file has more data rows than its ${size}³ grid holds (extra row at line ${li + 1}).`);
    }
    const toks = line.split(/\s+/);
    if (toks.length !== 3) throw new Error(`Line ${li + 1} of that .cube file doesn't have three values.`);
    const r = num(toks[0]), g = num(toks[1]), b = num(toks[2]);
    if (!isFinite(r) || !isFinite(g) || !isFinite(b)) {
      throw new Error(`Line ${li + 1} of that .cube file has an unreadable value.`);
    }
    if (Math.abs(r) > CUBE_NUM_MAX || Math.abs(g) > CUBE_NUM_MAX || Math.abs(b) > CUBE_NUM_MAX) {
      throw new Error(`Line ${li + 1} of that .cube file has a value too large to be a colour.`);
    }
    const o = filled * 3; // sequential append == red-fastest .cube row order
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    filled++;
  }

  if (!size) throw new Error("That file doesn't look like a 3D LUT — no LUT_3D_SIZE found.");
  if (!data || filled < size * size * size) {
    throw new Error(`That .cube file ends early — it has ${filled} of the ${size}³ = ${size ** 3} entries its header promises.`);
  }

  // Resolve a non-unit domain by resampling onto [0,1]³ (see header).
  const min = domMin ?? [0, 0, 0];
  const max = domMax ?? [1, 1, 1];
  if (min.some((m, i) => m >= max[i])) throw new Error("That .cube file's DOMAIN is invalid (min must be below max).");
  const unitDomain = min.every((m, i) => Math.abs(m) < 1e-6 && Math.abs(max[i] - 1) < 1e-6);
  if (!unitDomain) {
    const res = new Float32Array(size * size * size * 3);
    const tmp = new Float32Array(3);
    const n1 = size - 1;
    for (let bi = 0; bi < size; bi++) {
      for (let gi = 0; gi < size; gi++) {
        for (let ri = 0; ri < size; ri++) {
          // The unit lattice point, mapped into the file's declared domain
          // coordinate, then sampled from the original grid (input clamped to
          // the grid; values NOT clamped, so the final sample can still
          // interpolate them).
          const cr = (ri / n1 - min[0]) / (max[0] - min[0]);
          const cg = (gi / n1 - min[1]) / (max[1] - min[1]);
          const cb = (bi / n1 - min[2]) / (max[2] - min[2]);
          sampleLut3dRaw(data, size, cr, cg, cb, tmp);
          const o = ((bi * size + gi) * size + ri) * 3;
          res[o] = tmp[0];
          res[o + 1] = tmp[1];
          res[o + 2] = tmp[2];
        }
      }
    }
    data = res;
  }

  return { name, size, data };
}

/** One input range, given once or twice the same way. Takes what is already
 *  set (null when nothing is) and what this line gives; returns the range.
 *  Holds: a file that gives its bounds twice with different values (DOMAIN_MIN/
 *  MAX against LUT_3D_INPUT_RANGE, or either one repeated) is refused rather
 *  than read one way or the other. */
function sameRange(prev: [number, number, number] | null, next: [number, number, number]): [number, number, number] {
  if (prev && prev.some((v, i) => Math.abs(v - next[i]) > 1e-6)) {
    throw new Error("That .cube file gives its input range twice, with different values (DOMAIN_MIN/MAX or LUT_3D_INPUT_RANGE).");
  }
  return next;
}
