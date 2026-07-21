// The traveling recipe: every exported JPEG can carry the look that made it,
// as an APP11 segment ("IPSLOOK\0" + the look.ts wire-format JSON, ~600
// bytes). Opening such a JPEG offers its look through the same receive dialog
// as links/files/codes — every photo you share becomes a shareable preset.
//
// Same splice technique as icc.ts's APP2 ICC_PROFILE segment. APP11 keeps
// clear of APP0/JFIF, APP1/EXIF+XMP, APP2/ICC and APP13/Photoshop
// conventions. HONESTY: recompression (iOS Photos edits, Messages image
// optimization, social-media uploads) strips APP segments — Files/AirDrop
// round-trips keep them; Help says so.

import { LOOK_JSON_MAX } from "./look";

const ID = "IPSLOOK\0";

/** Insert the recipe segment after the leading APPn run (SOI, then any
 *  APP0/APP2/etc. we or the encoder already wrote). Not-a-JPEG → unchanged. */
export function embedLookInJpeg(jpeg: Uint8Array, payloadJson: string): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;
  const body = new TextEncoder().encode(payloadJson);
  if (body.length + ID.length + 2 > 65533) return jpeg; // can't fit one segment — never true for real looks
  // Skip SOI, then every consecutive APPn (0xE0..0xEF) segment.
  let at = 2;
  while (at + 4 <= jpeg.length && jpeg[at] === 0xff && jpeg[at + 1] >= 0xe0 && jpeg[at + 1] <= 0xef) {
    at += 2 + ((jpeg[at + 2] << 8) | jpeg[at + 3]);
  }
  const payloadLen = 2 + ID.length + body.length;
  const seg = new Uint8Array(2 + payloadLen);
  seg[0] = 0xff;
  seg[1] = 0xeb; // APP11
  seg[2] = (payloadLen >> 8) & 0xff;
  seg[3] = payloadLen & 0xff;
  for (let i = 0; i < ID.length; i++) seg[4 + i] = ID.charCodeAt(i);
  seg.set(body, 4 + ID.length);

  const out = new Uint8Array(jpeg.length + seg.length);
  out.set(jpeg.subarray(0, at), 0);
  out.set(seg, at);
  out.set(jpeg.subarray(at), at + seg.length);
  return out;
}

/** Scan a JPEG's header segments for an embedded recipe; returns the payload
 *  JSON, or null. Stops at SOS (entropy-coded data) — segments can't follow
 *  it without a parser; ours never puts them there. Caps the payload read at
 *  LOOK_JSON_MAX so a hostile file can't make us decode megabytes. */
export function extractLookFromJpeg(bytes: Uint8Array): string | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null; // lost sync — treat as no recipe
    const marker = bytes[at + 1];
    if (marker === 0xda || marker === 0xd9) return null; // SOS / EOI — done
    const len = (bytes[at + 2] << 8) | bytes[at + 3];
    if (len < 2 || at + 2 + len > bytes.length) return null;
    if (marker === 0xeb && len >= 2 + ID.length + 2) {
      let match = true;
      for (let i = 0; i < ID.length; i++) {
        if (bytes[at + 4 + i] !== ID.charCodeAt(i)) { match = false; break; }
      }
      if (match) {
        const body = bytes.subarray(at + 4 + ID.length, at + 2 + len);
        if (body.length > LOOK_JSON_MAX) return null;
        try {
          return new TextDecoder("utf-8", { fatal: false }).decode(body);
        } catch {
          return null;
        }
      }
    }
    at += 2 + len;
  }
  return null;
}
