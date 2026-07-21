// Per-lens IR hot-spot correction (measured radial profiles). A SEPARATE,
// earlier correction from the existing manual `hotspot`/`hotspotSize` slider
// in pipeline.ts/gl.ts: this one is auto-selected from EXIF (or a manual
// lens+focal-length pick) and applied ONCE to the decoded gamma-encoded
// pixel buffer, before it ever reaches white balance / channel swap /
// grading — so the false-color pipeline downstream sees an already-flat
// frame. Profiles are bump-only (vignette excluded), so they compose safely
// with the existing `vignette` slider.
//
// Ported from the 2026-07-10 measurement handoff; the embedded profile data
// and the EXIF/apply algorithms are unchanged from the source module.

import { HOTSPOT_PROFILE_DATA as DATA } from "./hotspotProfiles";

export interface ExifInfo {
  lens: string | null;
  fl: number | null;
  ap: number | null;
  profileKey: string | null;
}

// --- minimal EXIF parser: LensModel 0xA434, FocalLength 0x920A, FNumber 0x829D ---
// Wrapped in try/catch by fromExif: EXIF offsets are file-controlled, and a
// corrupt file must degrade to "no lens info" (the manual prompt), never fail
// the whole photo open.
function parseExif(buf: ArrayBufferLike): { lens?: string; fl?: number; ap?: number } | null {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null; // not a JPEG (SOI)
  let off = 2;
  while (off < v.byteLength - 4) {
    const marker = v.getUint16(off);
    if (marker === 0xffe1) {
      const start = off + 4;
      if (v.getUint32(start) !== 0x45786966) {
        // A non-Exif APP1 (usually XMP) — skip it and keep scanning; some
        // cameras/editors write XMP first and the Exif segment after it.
        off += 2 + v.getUint16(off + 2);
        continue;
      }
      const t = start + 6;
      const le = v.getUint16(t) === 0x4949;
      const g16 = (o: number) => v.getUint16(t + o, le);
      const g32 = (o: number) => v.getUint32(t + o, le);
      const out: { lens?: string; fl?: number; ap?: number } = {};
      (function readIFD(o: number) {
        const n = g16(o);
        for (let i = 0; i < n; i++) {
          const e = o + 2 + i * 12, tag = g16(e), typ = g16(e + 2), cnt = g32(e + 4);
          let vo = e + 8;
          const sz = (typ === 3 ? 2 : typ === 5 ? 8 : 1) * cnt;
          if (sz > 4) vo = g32(e + 8);
          if (tag === 0x8769) readIFD(g32(e + 8));
          if (tag === 0x920a && typ === 5) out.fl = g32(vo) / g32(vo + 4);
          if (tag === 0x829d && typ === 5) out.ap = g32(vo) / g32(vo + 4);
          if (tag === 0xa434 && typ === 2) {
            let s = "";
            for (let j = 0; j < cnt - 1; j++) {
              const c = v.getUint8(t + vo + j);
              if (c) s += String.fromCharCode(c);
            }
            out.lens = s.trim();
          }
        }
      })(g32(4));
      return out;
    }
    if ((marker & 0xff00) !== 0xff00) return null;
    off += 2 + v.getUint16(off + 2);
  }
  return null;
}

function nearestFL(lensShort: string, fl: number): number {
  const a = DATA.fl_anchors[lensShort];
  return a.reduce((x, y) => (Math.abs(y - fl) < Math.abs(x - fl) ? y : x));
}

/** Read EXIF straight from the imported file's bytes. Returns null when the
 *  file has no parseable EXIF (e.g. it isn't a JPEG, or the EXIF block is
 *  corrupt — offsets are file-controlled and can point past the end) — the
 *  caller must treat that the same as an unrecognized lens (see needsPrompt)
 *  and ask, never guess. */
export function fromExif(arrayBuffer: ArrayBufferLike): ExifInfo | null {
  let ex: { lens?: string; fl?: number; ap?: number } | null;
  try {
    ex = parseExif(arrayBuffer);
  } catch {
    return null; // corrupt EXIF must never fail the photo open
  }
  if (!ex) return null;
  const short = ex.lens ? DATA.lens_map[ex.lens] : null;
  const profileKey = short && ex.fl ? short + "@" + nearestFL(short, ex.fl) : null;
  return { lens: ex.lens ?? null, fl: ex.fl ?? null, ap: ex.ap ?? null, profileKey };
}

export function needsPrompt(exifResult: ExifInfo | null): boolean {
  return !exifResult || !exifResult.profileKey;
}

export function keyFor(lensShort: string, fl: number): string {
  return lensShort + "@" + nearestFL(lensShort, fl);
}

export function lensNames(): string[] {
  return Object.keys(DATA.fl_anchors);
}

export function flAnchors(lensShort: string): number[] {
  return DATA.fl_anchors[lensShort] ?? [];
}

export interface ApplyTarget {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Apply the inverse-gain correction in place. Caller must run this on the
 *  still gamma-encoded DECODED pixels (DecodedImage.pixels), before white
 *  balance / channel swap / grading — correcting after the false-color swap
 *  would distort the color, not just the luminance. */
export function apply(imageData: ApplyTarget, profileKey: string, strength = 1.0): ApplyTarget {
  const p = DATA.profiles[profileKey];
  if (!p) throw new Error("unknown hot-spot profile: " + profileKey);
  const { width: w, height: h, data: px } = imageData;
  const nb = p.length, cx = w / 2, cy = h / 2, Rd = Math.hypot(cx, cy);
  const lut = new Float32Array(nb);
  for (let i = 0; i < nb; i++) lut[i] = 1 / (1 + p[i] * strength);
  for (let y = 0; y < h; y++) {
    const dy = y - cy;
    for (let x = 0; x < w; x++) {
      const rn = Math.hypot(x - cx, dy) / Rd;
      const g = lut[Math.min(nb - 1, (rn * nb) | 0)];
      const o = (y * w + x) * 4;
      px[o] = px[o] * g;
      px[o + 1] = px[o + 1] * g;
      px[o + 2] = px[o + 2] * g;
    }
  }
  return imageData;
}
