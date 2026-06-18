// 3D LUT (.cube) export. Bakes the *creative* part of the look — channel swap,
// hue, saturation, contrast — as an Adobe/Resolve-compatible 3D LUT for
// Photoshop (Color Lookup), DaVinci, Premiere, etc.
//
// White balance is intentionally NOT baked in by default: it is a per-shot,
// raw-domain operation, so a reusable creative LUT should sit on top of an
// already-white-balanced image. (includeWB bakes the current WB anyway, for
// reproducing one specific frame's full look elsewhere.)

import { compileEdit, type EditParams } from "./pipeline";

export interface CubeOptions {
  size?: number; // grid per axis (default 33)
  includeWB?: boolean;
  title?: string;
}

export function generateCube(params: EditParams, opts: CubeOptions = {}): string {
  const N = opts.size ?? 33;
  const p: EditParams = opts.includeWB ? params : { ...params, wb: [1, 1, 1], exposure: 1 };
  const edit = compileEdit(p);
  const out = new Float32Array(3);

  const lines: string[] = [
    `TITLE "${(opts.title ?? "IPS Look").replace(/"/g, "")}"`,
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

function g2l(v: number): number {
  return Math.pow(v, 2.2);
}

function f(v: number): string {
  return Math.min(1, Math.max(0, v)).toFixed(6);
}
