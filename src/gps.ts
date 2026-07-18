// Location-data guard: find and remove GPS location from a photo FILE's own
// bytes — the original the user loaded, not the app's exports (exports are
// re-encoded and carry no EXIF at all today).
//
// Containers handled: JPEG (the EXIF APP1 segment, plus GPS values inside an
// XMP APP1) and the TIFF family (DNG, NEF, TIFF — all share the TIFF
// container). Everything else honestly reports "no location found".
//
// Stripping is IN-PLACE surgery on a copy: the GPSInfo pointer entry is
// renamed to a padding tag and the GPS IFD block — plus every external value
// it references — is zeroed. No offsets move, so the file stays valid for
// every reader (including our own decoders) and is bit-identical outside the
// wiped region. XMP GPS values are blanked to spaces of the same length, so
// the XML stays well-formed. All offsets are FILE-CONTROLLED: every read is
// bounds-checked, and anything out of range aborts the strip (null) rather
// than corrupting bytes — the caller treats null as "couldn't clean" and
// says so, never pretending.

const GPSINFO = 0x8825; // IFD0 pointer to the GPS IFD
const EXIFIFD = 0x8769; // IFD0 pointer to the Exif IFD (walked for coverage)
const SUBIFDS = 0x014a; // TIFF SubIFDs (DNG previews/raw live here)
const PADDING = 0xea1c; // well-known padding tag — readers skip it

// Real location = coordinates, not just an (often empty) GPS version stamp:
// GPSLatitude / GPSLongitude / GPSDestLatitude / GPSDestLongitude.
const COORD_TAGS = new Set([0x0002, 0x0004, 0x0014, 0x0016]);

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

interface GpsRef {
  entryOff: number; // absolute offset of the 12-byte GPSInfo IFD entry
  ifdOff: number;   // absolute offset of the GPS IFD it points to
}

interface TiffScan {
  refs: GpsRef[];
  hasCoords: boolean;
}

/** Walk a TIFF structure at `base` and locate every GPSInfo pointer + whether
 *  the GPS IFD(s) carry real coordinates. Throws on any out-of-bounds read —
 *  callers catch. `limit` bounds the walk against hostile IFD cycles. */
function scanTiff(v: DataView, base: number, end: number): TiffScan {
  const le = v.getUint16(base) === 0x4949;
  const u16 = (o: number) => {
    if (o < base || o + 2 > end) throw new Error("oob");
    return v.getUint16(o, le);
  };
  const u32 = (o: number) => {
    if (o < base || o + 4 > end) throw new Error("oob");
    return v.getUint32(o, le);
  };
  const refs: GpsRef[] = [];
  let hasCoords = false;
  const seen = new Set<number>();

  const readIfdChain = (off: number, depth: number) => {
    let guard = 0;
    while (off && guard++ < 64) {
      const abs = base + off;
      if (seen.has(abs) || depth > 8) return;
      seen.add(abs);
      const n = u16(abs);
      if (n > 4096) throw new Error("oob"); // absurd entry count = hostile
      for (let i = 0; i < n; i++) {
        const e = abs + 2 + i * 12;
        const tag = u16(e);
        const typ = u16(e + 2);
        const cnt = u32(e + 4);
        if (tag === GPSINFO && (typ === 4 || typ === 3)) {
          const gOff = u32(e + 8);
          refs.push({ entryOff: e, ifdOff: base + gOff });
          // Peek into the GPS IFD for real coordinates.
          const gAbs = base + gOff;
          const gn = u16(gAbs);
          if (gn <= 4096) {
            for (let k = 0; k < gn; k++) {
              if (COORD_TAGS.has(u16(gAbs + 2 + k * 12))) { hasCoords = true; break; }
            }
          }
        } else if (tag === EXIFIFD && typ === 4) {
          readIfdChain(u32(e + 8), depth + 1);
        } else if (tag === SUBIFDS && typ === 4) {
          // Count LONGs; ≤1 fits inline, else they live at the value offset.
          const at = cnt <= 1 ? e + 8 : base + u32(e + 8);
          for (let k = 0; k < Math.min(cnt, 16); k++) readIfdChain(u32(at + k * 4), depth + 1);
        }
      }
      off = u32(abs + 2 + n * 12);
    }
  };
  readIfdChain(u32(base + 4), 0);
  return { refs, hasCoords };
}

/** Zero the GPS IFD at ref.ifdOff (entries + external values + next pointer)
 *  and rename the pointing entry to a padding tag. Mutates `v` in place. */
function wipeGps(v: DataView, base: number, end: number, ref: GpsRef) {
  const le = v.getUint16(base) === 0x4949;
  const u16 = (o: number) => {
    if (o < base || o + 2 > end) throw new Error("oob");
    return v.getUint16(o, le);
  };
  const u32 = (o: number) => {
    if (o < base || o + 4 > end) throw new Error("oob");
    return v.getUint32(o, le);
  };
  const zero = (o: number, len: number) => {
    if (o < base || o + len > end) throw new Error("oob");
    for (let i = 0; i < len; i++) v.setUint8(o + i, 0);
  };
  const n = u16(ref.ifdOff);
  if (n > 4096) throw new Error("oob");
  // External values first (their offsets live in the entries we then zero).
  for (let i = 0; i < n; i++) {
    const e = ref.ifdOff + 2 + i * 12;
    const typ = u16(e + 2);
    const cnt = u32(e + 4);
    const sz = (TYPE_SIZE[typ] ?? 1) * cnt;
    if (sz > 4 && sz < 1 << 20) zero(base + u32(e + 8), sz);
  }
  zero(ref.ifdOff, 2 + n * 12 + 4); // count + entries + next-IFD pointer
  // Rename the pointer entry to padding (type UNDEFINED, count 4, value 0) so
  // readers stop finding a GPS IFD at a now-zeroed offset.
  v.setUint16(ref.entryOff, PADDING, le);
  v.setUint16(ref.entryOff + 2, 7, le);
  v.setUint32(ref.entryOff + 4, 4, le);
  v.setUint32(ref.entryOff + 8, 0, le);
}

/** JPEG APP1 segments: [absolute payload start, payload length, kind]. */
function jpegSegments(v: DataView): { at: number; len: number; kind: "exif" | "xmp" | "other" }[] {
  const out: { at: number; len: number; kind: "exif" | "xmp" | "other" }[] = [];
  let off = 2;
  while (off + 4 <= v.byteLength) {
    const marker = v.getUint16(off);
    if ((marker & 0xff00) !== 0xff00) break;
    if (marker === 0xffda) break; // start of scan — no more metadata segments
    const len = v.getUint16(off + 2);
    if (len < 2 || off + 2 + len > v.byteLength) break;
    if (marker === 0xffe1) {
      const p = off + 4;
      let kind: "exif" | "xmp" | "other" = "other";
      if (p + 6 <= v.byteLength && v.getUint32(p) === 0x45786966) kind = "exif";
      else {
        let s = "";
        for (let i = 0; i < Math.min(30, len - 2); i++) s += String.fromCharCode(v.getUint8(p + i));
        if (s.startsWith("http://ns.adobe.com/xap/1.0/")) kind = "xmp";
      }
      out.push({ at: p, len: len - 2, kind });
    }
    off += 2 + len;
  }
  return out;
}

const XMP_GPS = /exif:GPS(?:Latitude|Longitude|DestLatitude|DestLongitude)/;

/** Blank the VALUES of GPS entries in an XMP packet (attribute and element
 *  forms) with same-length spaces — XML stays well-formed, offsets stay put.
 *  Element form blanks TEXT nodes only: child markup (e.g. an rdf:Seq) keeps
 *  its tags intact, so the packet still parses. */
function blankXmpGps(text: string): string {
  const blankTextNodes = (val: string): string => {
    let out = "";
    let inTag = false;
    for (const ch of val) {
      if (ch === "<") inTag = true;
      if (inTag || /\s/.test(ch)) out += ch;
      else out += " ";
      if (ch === ">") inTag = false;
    }
    return out;
  };
  return text
    .replace(/(exif:GPS[A-Za-z]+\s*=\s*")([^"]*)(")/g, (_m, a, val: string, z) => a + " ".repeat(val.length) + z)
    .replace(/(<exif:GPS[A-Za-z]+>)([\s\S]*?)(<\/exif:GPS[A-Za-z]+>)/g, (_m, a, val: string, z) => a + blankTextNodes(val) + z);
}

/** True when the file's own bytes carry GPS coordinates (EXIF GPS IFD with
 *  latitude/longitude, or XMP exif:GPS latitude/longitude entries). Never
 *  throws — unparseable structures read as "none found". */
export function findLocation(bytes: Uint8Array): boolean {
  try {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length > 8 && (v.getUint16(0) === 0x4949 || v.getUint16(0) === 0x4d4d)) {
      return scanTiff(v, 0, bytes.byteLength).hasCoords;
    }
    if (bytes.length > 4 && v.getUint16(0) === 0xffd8) {
      for (const seg of jpegSegments(v)) {
        if (seg.kind === "exif") {
          try {
            if (scanTiff(v, seg.at + 6, seg.at + seg.len).hasCoords) return true;
          } catch { /* corrupt EXIF block — keep checking other segments */ }
        } else if (seg.kind === "xmp") {
          let s = "";
          for (let i = 0; i < seg.len; i++) s += String.fromCharCode(bytes[seg.at + i]);
          if (XMP_GPS.test(s) && /exif:GPS(?:Latitude|Longitude)[^A-Za-z]/.test(s)) {
            // An entry NAME alone isn't location; require a non-blank value.
            const cleaned = blankXmpGps(s);
            if (cleaned !== s) return true;
          }
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

/** A copy of `bytes` with GPS location removed, or null when the structure
 *  can't be cleaned safely. Callers MUST re-check with findLocation() before
 *  presenting the result as clean. */
export function stripLocation(bytes: Uint8Array): Uint8Array | null {
  try {
    const out = bytes.slice();
    const v = new DataView(out.buffer, out.byteOffset, out.byteLength);
    if (out.length > 8 && (v.getUint16(0) === 0x4949 || v.getUint16(0) === 0x4d4d)) {
      const scan = scanTiff(v, 0, out.byteLength);
      for (const ref of scan.refs) wipeGps(v, 0, out.byteLength, ref);
      return out;
    }
    if (out.length > 4 && v.getUint16(0) === 0xffd8) {
      for (const seg of jpegSegments(v)) {
        if (seg.kind === "exif") {
          const scan = scanTiff(v, seg.at + 6, seg.at + seg.len);
          for (const ref of scan.refs) wipeGps(v, seg.at + 6, seg.at + seg.len, ref);
        } else if (seg.kind === "xmp") {
          let s = "";
          for (let i = 0; i < seg.len; i++) s += String.fromCharCode(out[seg.at + i]);
          const cleaned = blankXmpGps(s);
          if (cleaned !== s) {
            for (let i = 0; i < seg.len; i++) out[seg.at + i] = cleaned.charCodeAt(i) & 0xff;
          }
        }
      }
      return out;
    }
    return null; // format we can't clean — be honest, don't guess
  } catch {
    return null;
  }
}
