// Keep the honest EXIF subset in exports: capture date/time, camera and lens,
// and the exposure triangle — read from the ORIGINAL file and written into
// exported JPEG/TIFF as a freshly BUILT block. Never copied wholesale, so
// nothing unvetted can ride along: no GPS (the location guard owns that and
// this builder simply has no field for it), no Orientation (export pixels are
// already rotated — a copied flag would double-rotate in viewers), no maker
// notes, no embedded thumbnails.
//
// Reading mirrors gps.ts: every offset is file-controlled and bounds-checked;
// anything unparseable degrades to "no EXIF kept", never a failed export.

export interface ExifSubset {
  make?: string;
  model?: string;
  /** "YYYY:MM:DD HH:MM:SS" — DateTimeOriginal (0x9003, capture time), and
   *  ONLY from the source's own 0x9003. A source's IFD0 DateTime (0x0132) is
   *  when that FILE was last changed — a Lightroom export's is the export — so
   *  it is never promoted into this field (Exif: DateTime "is the date and time
   *  the file was changed"; DateTimeOriginal "when the original image data was
   *  generated", Exiv2 tags_int.cpp, copied from the standard). */
  dateTime?: string;
  /** "YYYY:MM:DD HH:MM:SS" — when the EXPORT was written, for IFD0 DateTime
   *  (0x0132). Never read from a source; the writers fill in the time they
   *  build the block when it is absent, so a test can pin it. */
  changed?: string;
  /** Rationals kept as raw [numerator, denominator] so 1/320 s round-trips
   *  exactly instead of decaying through a float. */
  exposureTime?: [number, number];
  fNumber?: [number, number];
  iso?: number;
  focalLength?: [number, number];
  lens?: string;
  /** A JPEG's IFD0 Orientation (1..8), READ ONLY: never written into an
   *  export (the writers below build their tags from the other fields by
   *  name). A browser turns a camera JPEG upright by it as it decodes, so the
   *  lens correction needs it to find the hot spot's centre in the turned
   *  pixels (lensflat.ts `turnOfOrientation`). ABSENT for a TIFF-family file
   *  (NEF, DNG): its decoder keeps the sensor's axes and carries the tag as a
   *  display rotation (decode.ts `orientationToRotate`), and a raw's embedded
   *  preview is decoded from a bitstream that does not carry it — so the field
   *  means "the turn already in the decoded pixels" and nothing else. */
  orientation?: number;
  /** SubjectDistance (0x9206) in metres, READ ONLY, when the camera wrote one:
   *  absent for 0 (unknown) and for 0xFFFFFFFF (infinity, which the lens match
   *  reads the same as no distance). The lens match uses it beside focal length
   *  and aperture, as lensfun does (lensstore.ts `matchIn`). The Nikon Z 50
   *  does not write it. */
  subjectDistance?: number;
}

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

/** Read the subset from a JPEG (EXIF APP1) or TIFF-family (DNG/NEF) file.
 *  @param bytes  the whole file, or its head (the lens rig reads 256 KB).
 *  @returns the fields found — the first occurrence of each tag wins, so IFD0's
 *    Orientation is read before a thumbnail IFD's — or null when the file
 *    carries none of the exported fields. Throws only on bytes it cannot walk.
 *  What the result must satisfy: `orientation` is present only for a JPEG,
 *    being the turn the browser lays on its pixels; it and `subjectDistance`
 *    are READ ONLY — `ifd0ExtraEntries` and `exifIfdEntries` never write them, so an
 *    export's EXIF stays the honest subset; consumers are the lens match
 *    (lensstore.ts), the lens correction's turn (lensflat.ts) and the exports'
 *    EXIF writers. */
export function readExifSubset(bytes: Uint8Array): ExifSubset | null {
  try {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length > 8 && (v.getUint16(0) === 0x4949 || v.getUint16(0) === 0x4d4d)) {
      // A raw's Orientation turns no pixels at decode (see `orientation`).
      const s = readTiffSubset(v, bytes, 0, bytes.length);
      if (s) delete s.orientation;
      return s;
    }
    if (bytes.length > 4 && v.getUint16(0) === 0xffd8) {
      let off = 2;
      while (off + 4 <= bytes.length) {
        const marker = v.getUint16(off);
        if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
        const len = v.getUint16(off + 2);
        if (len < 2 || off + 2 + len > bytes.length) break;
        if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) {
          return readTiffSubset(v, bytes, off + 10, off + 2 + len);
        }
        off += 2 + len;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function readTiffSubset(v: DataView, bytes: Uint8Array, base: number, end: number): ExifSubset | null {
  const le = v.getUint16(base) === 0x4949;
  const u16 = (o: number) => {
    if (o < base || o + 2 > end) throw new Error("oob");
    return v.getUint16(o, le);
  };
  const u32 = (o: number) => {
    if (o < base || o + 4 > end) throw new Error("oob");
    return v.getUint32(o, le);
  };
  const out: ExifSubset = {};

  const readEntry = (e: number) => {
    const tag = u16(e);
    const typ = u16(e + 2);
    const cnt = u32(e + 4);
    const sz = (TYPE_SIZE[typ] ?? 1) * cnt;
    const vo = sz <= 4 ? e + 8 : base + u32(e + 8);
    const ascii = () => {
      if (typ !== 2 || cnt > 512 || vo + cnt > end) return undefined;
      let s = "";
      for (let i = 0; i < cnt - 1; i++) {
        const c = bytes[vo + i];
        if (c) s += String.fromCharCode(c);
      }
      return s.trim() || undefined;
    };
    const rational = (): [number, number] | undefined => {
      if (typ !== 5 || vo + 8 > end) return undefined;
      return [u32(vo), u32(vo + 4)];
    };
    if (tag === 0x010f) out.make ??= ascii();
    else if (tag === 0x0110) out.model ??= ascii();
    else if (tag === 0x9003) out.dateTime ??= ascii();
    else if (tag === 0x829a) out.exposureTime ??= rational();
    else if (tag === 0x829d) out.fNumber ??= rational();
    else if (tag === 0x8827 && (typ === 3 || typ === 4)) out.iso ??= typ === 3 ? u16(vo) : u32(vo);
    else if (tag === 0x920a) out.focalLength ??= rational();
    else if (tag === 0xa434) out.lens ??= ascii();
    else if (tag === 0x0112 && typ === 3) out.orientation ??= u16(vo);
    else if (tag === 0x9206) {
      const d = rational();
      if (d && d[1] && d[0] && d[0] !== 0xffffffff) out.subjectDistance ??= d[0] / d[1];
    }
    return { tag, typ };
  };

  const seen = new Set<number>();
  const walkIfd = (off: number, depth: number) => {
    let guard = 0;
    while (off && guard++ < 32) {
      const abs = base + off;
      if (seen.has(abs) || depth > 6) return;
      seen.add(abs);
      const n = u16(abs);
      if (n > 4096) throw new Error("oob");
      for (let i = 0; i < n; i++) {
        const e = abs + 2 + i * 12;
        const { tag, typ } = readEntry(e);
        if (tag === 0x8769 && typ === 4) walkIfd(u32(e + 8), depth + 1); // Exif IFD
        else if (tag === 0x014a && typ === 4) {
          const cnt = u32(e + 4);
          const at = cnt <= 1 ? e + 8 : base + u32(e + 8);
          for (let k = 0; k < Math.min(cnt, 8); k++) walkIfd(u32(at + k * 4), depth + 1);
        }
      }
      off = u32(abs + 2 + n * 12);
    }
  };
  walkIfd(u32(base + 4), 0);

  const any = out.dateTime || out.make || out.model || out.lens || out.exposureTime || out.fNumber || out.iso || out.focalLength;
  return any ? out : null;
}

// --- Building: a fresh, minimal little-endian TIFF block from the subset. ---

export interface TiffEntry {
  tag: number;
  typ: number;
  cnt: number;
  /** Inline value, or bytes to place out-of-line. */
  inline?: number;
  data?: number[];
}

function asciiEntry(tag: number, s: string): TiffEntry {
  const data = [];
  for (let i = 0; i < Math.min(s.length, 255); i++) data.push(s.charCodeAt(i) & 0x7f);
  data.push(0);
  return { tag, typ: 2, cnt: data.length, data };
}
function rationalEntry(tag: number, [n, d]: [number, number]): TiffEntry {
  const data = [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff, d & 0xff, (d >>> 8) & 0xff, (d >>> 16) & 0xff, (d >>> 24) & 0xff];
  return { tag, typ: 5, cnt: 1, data };
}

/**
 * An Exif date string for a moment, in the camera's convention: local time,
 * no zone, "YYYY:MM:DD HH:MM:SS".
 * @param d  the moment — the writers pass the time the export is built.
 * @returns the 19-character string Exif's DateTime fields hold.
 * Consumer: ifd0ExtraEntries, for DateTime (0x0132) when `changed` is absent.
 */
export function exifDateTime(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getFullYear(), 4)}:${p(d.getMonth() + 1)}:${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * The IFD0-level tags (camera identity, Software, and the file's own date),
 * sorted by tag. Shared by the JPEG APP1 builder and the TIFF export writer.
 * @param s  the subset read from the original.
 * @returns entries for Make, Model, Software and DateTime, ascending by tag.
 * What the result must satisfy: DateTime (0x0132) is ALWAYS the export's own
 *   time (`s.changed`, else now) — never the capture time, which goes only into
 *   DateTimeOriginal in the Exif IFD — because Exif defines 0x0132 as when the
 *   file was changed, and this file was changed when it was exported.
 */
export function ifd0ExtraEntries(s: ExifSubset): TiffEntry[] {
  const out: TiffEntry[] = [];
  if (s.make) out.push(asciiEntry(0x010f, s.make));
  if (s.model) out.push(asciiEntry(0x0110, s.model));
  out.push(asciiEntry(0x0131, "Photography Studio")); // Software — honest provenance
  out.push(asciiEntry(0x0132, s.changed ?? exifDateTime(new Date()))); // DateTime: when THIS file was written
  return out.sort((a, b) => a.tag - b.tag);
}

/**
 * The Exif-IFD tags (version, capture settings, colour space, lens), sorted by
 * tag.
 * @param s  the subset read from the original.
 * @returns entries ascending by tag; never empty, because ExifVersion and
 *   ColorSpace are written whatever the source carried.
 * What the result must satisfy: ExifVersion (0x9000) is "0232" — Exif says its
 *   absence means non-conformance — and ColorSpace (0xA001) is 0xFFFF,
 *   Uncalibrated, because neither export is sRGB: the JPEG is Display P3 and
 *   the TIFF is gamma 2.2 on sRGB primaries, and Exif reserves 1 for sRGB and
 *   says "if a color space other than sRGB is used, Uncalibrated is set". The
 *   embedded ICC profile is what names the space. DateTimeOriginal (0x9003)
 *   appears only when the source had its own.
 */
export function exifIfdEntries(s: ExifSubset): TiffEntry[] {
  const out: TiffEntry[] = [];
  if (s.exposureTime) out.push(rationalEntry(0x829a, s.exposureTime));
  if (s.fNumber) out.push(rationalEntry(0x829d, s.fNumber));
  if (s.iso) out.push({ tag: 0x8827, typ: 3, cnt: 1, inline: Math.min(0xffff, s.iso) });
  out.push({ tag: 0x9000, typ: 7, cnt: 4, data: [0x30, 0x32, 0x33, 0x32] }); // ExifVersion "0232", UNDEFINED
  if (s.dateTime) out.push(asciiEntry(0x9003, s.dateTime));
  if (s.focalLength) out.push(rationalEntry(0x920a, s.focalLength));
  out.push({ tag: 0xa001, typ: 3, cnt: 1, inline: 0xffff }); // ColorSpace: Uncalibrated
  if (s.lens) out.push(asciiEntry(0xa434, s.lens));
  return out.sort((a, b) => a.tag - b.tag);
}

/** Bytes the entries' out-of-line values need (each padded to even). */
export function externSize(entries: TiffEntry[]): number {
  let n = 0;
  for (const e of entries) if (e.data && e.data.length > 4) n += e.data.length + (e.data.length % 2);
  return n;
}

/** Serialize IFD0 + Exif IFD (little-endian TIFF, offsets relative to the
 *  block start). Returns the whole TIFF block (starting "II*\0"). */
export function buildExifTiff(s: ExifSubset): Uint8Array {
  const ifd0 = ifd0ExtraEntries(s);
  const exif = exifIfdEntries(s);
  if (exif.length) ifd0.push({ tag: 0x8769, typ: 4, cnt: 1, inline: 0 /* patched below */ });
  ifd0.sort((a, b) => a.tag - b.tag);

  const ifd0Size = 2 + ifd0.length * 12 + 4;
  const exifOff = 8 + ifd0Size;
  const exifSize = exif.length ? 2 + exif.length * 12 + 4 : 0;
  let dataOff = exifOff + exifSize;

  const out: number[] = [];
  const p16 = (v: number) => out.push(v & 0xff, (v >>> 8) & 0xff);
  const p32 = (v: number) => out.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  p16(0x4949);
  p16(42);
  p32(8);

  const extern: number[] = [];
  const writeIfd = (entries: TiffEntry[]) => {
    p16(entries.length);
    for (const e of entries) {
      p16(e.tag);
      p16(e.typ);
      p32(e.cnt);
      if (e.tag === 0x8769) p32(exifOff);
      else if (e.data && e.data.length > 4) {
        p32(dataOff);
        extern.push(...e.data);
        dataOff += e.data.length;
        if (e.data.length % 2) { extern.push(0); dataOff++; } // keep offsets even
      } else if (e.data) {
        const b = [...e.data];
        while (b.length < 4) b.push(0);
        out.push(...b);
      } else {
        // Inline scalar: SHORT sits in the low half, zero-padded.
        if (e.typ === 3) { p16(e.inline ?? 0); p16(0); } else p32(e.inline ?? 0);
      }
    }
    p32(0); // next IFD
  };
  writeIfd(ifd0);
  if (exif.length) writeIfd(exif);
  out.push(...extern);
  return new Uint8Array(out);
}

/** A complete JPEG APP1 EXIF segment for the subset. */
export function buildExifApp1(s: ExifSubset): Uint8Array {
  const tiff = buildExifTiff(s);
  const payloadLen = 2 + 6 + tiff.length;
  const seg = new Uint8Array(2 + payloadLen);
  seg[0] = 0xff;
  seg[1] = 0xe1;
  seg[2] = (payloadLen >> 8) & 0xff;
  seg[3] = payloadLen & 0xff;
  seg.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4); // "Exif\0\0"
  seg.set(tiff, 10);
  return seg;
}

/** Insert the EXIF APP1 right after SOI (skipping a leading JFIF APP0), i.e.
 *  BEFORE the ICC APP2 when called after embedIccInJpeg — the conventional
 *  segment order. Not-a-JPEG or oversized → unchanged. */
export function embedExifInJpeg(jpeg: Uint8Array, seg: Uint8Array): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || seg.length > 65535) return jpeg;
  let insertAt = 2;
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0) {
    insertAt = 4 + ((jpeg[4] << 8) | jpeg[5]);
  }
  const out = new Uint8Array(jpeg.length + seg.length);
  out.set(jpeg.subarray(0, insertAt), 0);
  out.set(seg, insertAt);
  out.set(jpeg.subarray(insertAt), insertAt + seg.length);
  return out;
}
