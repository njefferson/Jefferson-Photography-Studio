// Decode a mosaiced (Bayer) DNG whose raw image is lossless-JPEG compressed
// (Compression 7, PhotometricInterpretation 32803 = CFA). This is what
// Lightroom's "Convert to DNG" produces. Returns a linear, demosaiced proxy.

import type { Ifd } from "./tiff";
import { decodeLJ92 } from "./lj92";
import { demosaicBinned, type LinearImage, type RawCfa } from "./demosaic";

const T_IMAGE_WIDTH = 256;
const T_IMAGE_LENGTH = 257;
const T_CFA_PATTERN = 33422;
const T_STRIP_OFFSETS = 273;
const T_STRIP_BYTECOUNTS = 279;
const T_ROWS_PER_STRIP = 278;
const T_TILE_WIDTH = 322;
const T_TILE_LENGTH = 323;
const T_TILE_OFFSETS = 324;
const T_TILE_BYTECOUNTS = 325;
const T_BLACK_LEVEL = 50714;
const T_WHITE_LEVEL = 50717;

/** Demosaiced half-res linear proxy for live editing. */
export function decodeMosaicedDng(bytes: Uint8Array, raw: Ifd): LinearImage {
  const c = readMosaicedCfa(bytes, raw);
  return demosaicBinned(c.cfa, c.width, c.height, c.pattern, c.black, c.white);
}

/** Full Bayer frame + metadata (for native-resolution export). */
export function readMosaicedCfa(bytes: Uint8Array, raw: Ifd): RawCfa {
  const width = raw.num(T_IMAGE_WIDTH)[0];
  const height = raw.num(T_IMAGE_LENGTH)[0];
  const cfa = new Uint16Array(width * height);

  const tileOffsets = raw.num(T_TILE_OFFSETS);
  if (tileOffsets.length) {
    const tileW = raw.num(T_TILE_WIDTH)[0];
    const tileH = raw.num(T_TILE_LENGTH)[0];
    const counts = raw.num(T_TILE_BYTECOUNTS);
    const across = Math.ceil(width / tileW);
    for (let i = 0; i < tileOffsets.length; i++) {
      placeTile(cfa, width, height, bytes, tileOffsets[i], counts[i], (i % across) * tileW, Math.floor(i / across) * tileH);
    }
  } else {
    // Single-strip or multi-strip LJ92.
    const stripOffsets = raw.num(T_STRIP_OFFSETS);
    const stripCounts = raw.num(T_STRIP_BYTECOUNTS);
    const rowsPerStrip = raw.num(T_ROWS_PER_STRIP)[0] || height;
    for (let i = 0; i < stripOffsets.length; i++) {
      placeTile(cfa, width, height, bytes, stripOffsets[i], stripCounts[i], 0, i * rowsPerStrip);
    }
  }

  // CFAPattern: 4 bytes (0=R,1=G,2=B); default RGGB.
  const pat = raw.num(T_CFA_PATTERN);
  const pattern = pat.length === 4 ? pat : [0, 1, 1, 2];

  const black = raw.num(T_BLACK_LEVEL)[0] ?? 0;
  const white = raw.num(T_WHITE_LEVEL)[0] ?? 65535;

  return { cfa, width, height, pattern, black, white };
}

/** LJ92-decode one tile/strip and write its Bayer samples into the full CFA. */
function placeTile(
  cfa: Uint16Array,
  width: number,
  height: number,
  bytes: Uint8Array,
  offset: number,
  length: number,
  col: number,
  row: number,
) {
  const img = decodeLJ92(bytes.subarray(offset, offset + length));
  const { width: X, height: Y, components: Nf, data } = img;
  // DNG packs adjacent Bayer columns as interleaved JPEG components, so the
  // tile's CFA column for (x,c) is x*Nf + c.
  for (let y = 0; y < Y; y++) {
    const gy = row + y;
    if (gy >= height) break;
    for (let x = 0; x < X; x++) {
      for (let c = 0; c < Nf; c++) {
        const gx = col + x * Nf + c;
        if (gx >= width) continue;
        cfa[gy * width + gx] = data[(y * X + x) * Nf + c];
      }
    }
  }
}
