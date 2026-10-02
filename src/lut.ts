// 3D LUT (.cube) export. Bakes the *creative* part of the look — channel swap,
// hue, saturation, contrast — as an Adobe/Resolve-compatible 3D LUT for
// Photoshop (Color Lookup), DaVinci, Premiere, etc.
//
// White balance is intentionally NOT baked in by default: it is a per-shot,
// raw-domain operation, so a reusable creative LUT should sit on top of an
// already-white-balanced image. (includeWB bakes the current WB anyway, for
// reproducing one specific frame's full look elsewhere.)

import { compileEdit, type EditParams } from "./pipeline";
import { srgbToLinear } from "./icc";

export interface CubeOptions {
  size?: number; // grid per axis (default 33)
  includeWB?: boolean;
  title?: string;
}

/**
 * Bake the creative grade into a .cube 3D LUT.
 * @param params  the edit; WB and exposure are neutralised unless includeWB.
 * @param opts  grid size (default 33), includeWB, and the title — the photo's
 *   name as the reader has it, any script or symbol.
 * @returns the file's text. Holds: it is a valid Cube LUT 1.0 file — every line
 *   is ASCII and under the spec's 250 bytes, in particular the TITLE, whose
 *   text the spec (§4, §5.6) limits to printable Basic Latin without '"'
 *   (cubeTitle) — so Photoshop, Resolve and this app's own parseCube read it.
 */
export function generateCube(params: EditParams, opts: CubeOptions = {}): string {
  const N = opts.size ?? 33;
  const p: EditParams = opts.includeWB ? params : { ...params, wb: [1, 1, 1], exposure: 1 };
  const edit = compileEdit(p);
  const out = new Float32Array(3);

  const lines: string[] = [
    `TITLE "${cubeTitle(opts.title)}"`,
    `LUT_3D_SIZE ${N}`,
    "DOMAIN_MIN 0.0 0.0 0.0",
    "DOMAIN_MAX 1.0 1.0 1.0",
  ];
  // .cube ordering: red varies fastest, then green, then blue.
  for (let bi = 0; bi < N; bi++) {
    for (let gi = 0; gi < N; gi++) {
      for (let ri = 0; ri < N; ri++) {
        // Input is display (gamma) RGB; the creative transform runs in linear.
        edit(g2l(ri / (N - 1)), g2l(gi / (N - 1)), g2l(bi / (N - 1)), out);
        lines.push(`${f(out[0])} ${f(out[1])} ${f(out[2])}`);
      }
    }
  }
  return lines.join("\n") + "\n";
}

/** The longest TITLE text that keeps `TITLE "…"` within the spec's 250-byte
 *  line (§5.3): 250 less the keyword, the space and the two quotes. */
const TITLE_MAX = 250 - 'TITLE ""'.length;

/** A name as Cube TITLE text: accents taken off their letters (é -> e, by
 *  Unicode decomposition), then anything outside printable ASCII 0x20-0x7E
 *  and the '"' delimiter dropped, whitespace collapsed, and the result cut to
 *  TITLE_MAX. Takes the name (or nothing); returns "IPS Look" when nothing
 *  printable survives. Until 2026-10-01 only the quote was removed, so a
 *  photo named in any non-Latin script wrote multi-byte UTF-8 into TITLE. */
function cubeTitle(name: string | undefined): string {
  const t = (name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/"/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TITLE_MAX)
    .trim();
  return t || "IPS Look";
}

function g2l(v: number): number {
  return srgbToLinear(v);
}

function f(v: number): string {
  return Math.min(1, Math.max(0, v)).toFixed(6);
}
