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
//    clamped resampling is the honest best effort.)
//  - Values clamped to [0,1]: the 8-bit GPU framebuffer clamps anyway, but
//    the CPU 16-bit TIFF path (out*65535+0.5 into a Uint16Array) would WRAP
//    on >1 values — clamping once here keeps sample math identical everywhere.

import { sampleLut3d } from "./lut3d";

export interface ParsedCube {
  /** From TITLE "…", if present. Caller cleans it (look.ts cleanName). */
  name?: string;
  /** Grid size N per axis, 2..65. */
  size: number;
  /** N³ RGB triples, red fastest, unit domain, clamped [0,1]. */
  data: Float32Array;
}

export const CUBE_SIZE_MAX = 65;
export const CUBE_FILE_MAX = 8 * 1024 * 1024;

const FLOAT_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

const num = (tok: string): number => (FLOAT_RE.test(tok) ? Number(tok) : NaN);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Parse .cube text. Throws Error with an honest, user-facing message. */
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
        if (KW === "DOMAIN_MIN") domMin = v;
        else domMax = v;
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
    const o = filled * 3; // sequential append == red-fastest .cube row order
    data[o] = clamp01(r);
    data[o + 1] = clamp01(g);
    data[o + 2] = clamp01(b);
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
          // coordinate, then sampled from the original grid (clamped).
          const cr = (ri / n1 - min[0]) / (max[0] - min[0]);
          const cg = (gi / n1 - min[1]) / (max[1] - min[1]);
          const cb = (bi / n1 - min[2]) / (max[2] - min[2]);
          sampleLut3d(data, size, cr, cg, cb, tmp);
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
