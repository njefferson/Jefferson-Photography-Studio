// Embed a colour profile in every export so files are never emitted untagged
// (untagged JPEG/TIFF is a real-world failure: viewers guess the colour space).
//
// The profile is a minimal, valid ICC v2 DISPLAY profile that describes what the
// pipeline actually writes: sRGB / Rec.709 primaries encoded at GAMMA 2.2 (the
// pipeline's toGamma is pow(1/2.2), not the sRGB piecewise curve), PCS D50. The
// colorant XYZ are the standard D65->D50 (Bradford) adapted sRGB values used by
// lcms and the IEC sRGB profile, so colour-managed apps read it as sRGB.
//
// ICC is big-endian. Built once at module load.

const p16 = (a: number[], v: number) => a.push((v >>> 8) & 0xff, v & 0xff);
const p32 = (a: number[], v: number) => a.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
const pStr = (a: number[], s: string) => { for (let i = 0; i < s.length; i++) a.push(s.charCodeAt(i)); };
const s15 = (x: number): number => Math.round(x * 65536) | 0; // s15Fixed16

function xyzType(x: number, y: number, z: number): number[] {
  const b: number[] = [];
  pStr(b, "XYZ ");
  p32(b, 0);
  p32(b, s15(x));
  p32(b, s15(y));
  p32(b, s15(z));
  return b;
}

// curveType with one entry = a pure gamma; value is u8Fixed8 (gamma * 256).
function curvGamma(gamma: number): number[] {
  const b: number[] = [];
  pStr(b, "curv");
  p32(b, 0);
  p32(b, 1);
  p16(b, Math.round(gamma * 256));
  return b;
}

function textType(s: string): number[] {
  const b: number[] = [];
  pStr(b, "text");
  p32(b, 0);
  pStr(b, s);
  b.push(0);
  return b;
}

// textDescriptionType (ICC v2): ASCII invariant part + empty Unicode/Mac parts.
function descType(s: string): number[] {
  const b: number[] = [];
  pStr(b, "desc");
  p32(b, 0);
  p32(b, s.length + 1); // ASCII count incl. NUL
  pStr(b, s);
  b.push(0);
  p32(b, 0); // Unicode language code
  p32(b, 0); // Unicode count
  p16(b, 0); // ScriptCode
  b.push(0); // Mac description length
  for (let i = 0; i < 67; i++) b.push(0); // Mac description buffer
  return b;
}

function buildSrgbIcc(): Uint8Array {
  // Unique data blocks (rTRC/gTRC/bTRC share one curve block).
  const desc = descType("IPS sRGB (Gamma 2.2)");
  const cprt = textType("Public Domain");
  const wtpt = xyzType(0.9642, 1.0, 0.82491); // D50 white
  const rXYZ = xyzType(0.43607, 0.22249, 0.01392); // sRGB colorants, D50-adapted
  const gXYZ = xyzType(0.38515, 0.71687, 0.09708);
  const bXYZ = xyzType(0.14307, 0.06061, 0.7141);
  const trc = curvGamma(2.2);

  type Blk = { data: number[]; off: number; size: number };
  const blocks: Blk[] = [desc, cprt, wtpt, rXYZ, gXYZ, bXYZ, trc].map((data) => ({ data, off: 0, size: data.length }));
  const [bDesc, bCprt, bWtpt, bRxyz, bGxyz, bBxyz, bTrc] = blocks;

  // Tag table: 9 tags (three TRC tags share bTrc's offset).
  const tags: { sig: string; blk: Blk }[] = [
    { sig: "desc", blk: bDesc },
    { sig: "wtpt", blk: bWtpt },
    { sig: "rXYZ", blk: bRxyz },
    { sig: "gXYZ", blk: bGxyz },
    { sig: "bXYZ", blk: bBxyz },
    { sig: "rTRC", blk: bTrc },
    { sig: "gTRC", blk: bTrc },
    { sig: "bTRC", blk: bTrc },
    { sig: "cprt", blk: bCprt },
  ];

  const headerSize = 128;
  const tableSize = 4 + tags.length * 12;
  let cursor = headerSize + tableSize;
  for (const blk of blocks) {
    blk.off = cursor;
    cursor += blk.size;
    while (cursor % 4 !== 0) cursor++; // 4-byte align each block
  }
  const total = cursor;

  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);

  // --- Header (128 bytes) ---
  dv.setUint32(0, total); // profile size
  writeAscii(out, 8, "\x02\x10\x00\x00"); // version 2.1
  writeAscii(out, 12, "mntr"); // device class: display
  writeAscii(out, 16, "RGB "); // data colour space
  writeAscii(out, 20, "XYZ "); // PCS
  writeAscii(out, 36, "acsp"); // signature
  dv.setUint32(64, 0); // rendering intent: perceptual
  dv.setInt32(68, s15(0.9642)); // PCS illuminant = D50
  dv.setInt32(72, s15(1.0));
  dv.setInt32(76, s15(0.82491));

  // --- Tag table ---
  let p = headerSize;
  dv.setUint32(p, tags.length);
  p += 4;
  for (const t of tags) {
    writeAscii(out, p, t.sig);
    dv.setUint32(p + 4, t.blk.off);
    dv.setUint32(p + 8, t.blk.size);
    p += 12;
  }

  // --- Data blocks ---
  for (const blk of blocks) out.set(blk.data, blk.off);

  return out;
}

function writeAscii(out: Uint8Array, at: number, s: string) {
  for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i);
}

/** The sRGB profile, built once. */
export const SRGB_ICC: Uint8Array = buildSrgbIcc();

/**
 * Insert an ICC profile into a JPEG as an APP2 `ICC_PROFILE` segment. Our
 * profile fits in a single segment (well under the 65 519-byte data cap), so we
 * emit exactly one chunk (1 of 1). The segment goes right after the APP0/JFIF
 * block if present, else right after SOI.
 */
export function embedIccInJpeg(jpeg: Uint8Array, icc: Uint8Array = SRGB_ICC): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg; // not a JPEG — leave as-is
  // Find the insertion point: after SOI, skipping a leading APP0 (JFIF) if any.
  let insertAt = 2;
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0) {
    const len = (jpeg[4] << 8) | jpeg[5]; // APP0 length (incl. the 2 length bytes)
    insertAt = 4 + len;
  }
  const id = "ICC_PROFILE\0";
  const payloadLen = 2 /*length field*/ + id.length + 2 /*seq + count*/ + icc.length;
  const seg = new Uint8Array(2 + payloadLen); // marker + payload
  seg[0] = 0xff;
  seg[1] = 0xe2; // APP2
  seg[2] = (payloadLen >> 8) & 0xff;
  seg[3] = payloadLen & 0xff;
  let o = 4;
  for (let i = 0; i < id.length; i++) seg[o++] = id.charCodeAt(i);
  seg[o++] = 1; // chunk sequence number (1-based)
  seg[o++] = 1; // total chunks
  seg.set(icc, o);

  const out = new Uint8Array(jpeg.length + seg.length);
  out.set(jpeg.subarray(0, insertAt), 0);
  out.set(seg, insertAt);
  out.set(jpeg.subarray(insertAt), insertAt + seg.length);
  return out;
}
