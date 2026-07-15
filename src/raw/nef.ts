// Nikon NEF (Compression 34713) decoder — pure TypeScript.
//
// Implements Nikon's compressed-raw scheme (the one dcraw/LibRaw call
// nikon_load_raw): a predefined Huffman tree selects a difference magnitude,
// a 2-back predictor seeded per row-parity reconstructs samples, and an
// optional linearization curve maps them. Verified bit-exact against LibRaw on
// the project's real NEFs.

import { Tiff } from "./tiff";
import { demosaicBinned, type LinearImage, type RawCfa } from "./demosaic";

// Predefined Huffman trees (dcraw `nikon_tree`): first 16 bytes are the count of
// codes per bit-length, the rest are the symbol values (symbol = shl<<4 | len).
const NIKON_TREE: number[][] = [
  [0, 1, 5, 1, 1, 1, 1, 1, 1, 2, 0, 0, 0, 0, 0, 0, 5, 4, 3, 6, 2, 7, 1, 0, 8, 9, 11, 10, 12], // 12-bit lossy
  [0, 1, 5, 1, 1, 1, 1, 1, 1, 2, 0, 0, 0, 0, 0, 0, 0x39, 0x5a, 0x38, 0x27, 0x16, 5, 4, 3, 2, 1, 0, 11, 12, 12], // 12-bit lossy after split
  [0, 1, 4, 2, 3, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 4, 6, 3, 7, 2, 8, 1, 9, 0, 10, 11, 12], // 12-bit lossless
  [0, 1, 4, 3, 1, 1, 1, 1, 1, 2, 0, 0, 0, 0, 0, 0, 5, 6, 4, 7, 8, 3, 9, 2, 1, 0, 10, 11, 12, 13, 14], // 14-bit lossy
  [0, 1, 5, 1, 1, 1, 1, 1, 1, 1, 2, 0, 0, 0, 0, 0, 8, 0x5c, 0x4b, 0x3a, 0x29, 7, 6, 5, 4, 3, 2, 1, 0, 13, 14], // 14-bit lossy after split
  [0, 1, 4, 2, 2, 3, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 7, 6, 8, 5, 9, 4, 10, 3, 11, 12, 2, 0, 1, 13, 14], // 14-bit lossless
];

class Reader {
  constructor(
    public view: DataView,
    public le: boolean,
  ) {}
  u16(o: number) {
    return this.view.getUint16(o, this.le);
  }
  u32(o: number) {
    return this.view.getUint32(o, this.le);
  }
}

interface HuffLut {
  sym: Uint8Array; // decoded symbol per maxlen-bit prefix
  len: Uint8Array; // code length consumed
  maxlen: number;
}

function buildHuffLut(tree: number[]): HuffLut {
  const counts = tree.slice(0, 16);
  const symbols = tree.slice(16);
  let maxlen = 0;
  for (let l = 1; l <= 16; l++) if (counts[l - 1]) maxlen = l;
  const lut = 1 << maxlen;
  const sym = new Uint8Array(lut);
  const len = new Uint8Array(lut);
  let code = 0;
  let k = 0;
  for (let l = 1; l <= maxlen; l++) {
    for (let i = 0; i < counts[l - 1]; i++) {
      const s = symbols[k++];
      const base = code << (maxlen - l);
      for (let j = 0; j < 1 << (maxlen - l); j++) {
        sym[base + j] = s;
        len[base + j] = l;
      }
      code++;
    }
    code <<= 1;
  }
  return { sym, len, maxlen };
}

/** Demosaiced half-res linear proxy for live editing. */
export function decodeNef(bytes: Uint8Array): LinearImage {
  const c = readNefCfa(bytes);
  return demosaicBinned(c.cfa, c.width, c.height, c.pattern, c.black, c.white);
}

/** Full Bayer frame + metadata (for native-resolution export). */
export function readNefCfa(bytes: Uint8Array): RawCfa {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const main = new Reader(view, bytes[0] === 0x49);

  // Raw CFA IFD (Compression 34713, Photometric 32803 = CFA).
  const ifds = new Tiff(bytes).allIfds();
  const raw = ifds.find((d) => d.num(259)[0] === 34713 && d.num(262)[0] === 32803);
  if (!raw) throw new Error("No Nikon compressed raw IFD found.");
  const width = raw.num(256)[0];
  const height = raw.num(257)[0];
  const bps = raw.num(258)[0] || 14;
  const dataOffset = raw.num(273)[0]; // StripOffsets

  const meta = findLinearizationTable(bytes, main);
  const params = readNikonParams(bytes, meta.offset, meta.le, bps);

  const cfa = nikonDecode(bytes, dataOffset, width, height, params);

  const pat = raw.num(33422);
  const pattern = pat.length === 4 ? pat : [0, 1, 1, 2];
  // NEF has no DNG level tags; these are the Z-series values LibRaw reports for
  // these files (black 1008, white 15520 at 14-bit). Tap-WB absorbs the rest.
  const black = raw.num(50714)[0] ?? 1008;
  const white = raw.num(50717)[0] ?? (bps === 14 ? 15520 : (1 << bps) - 1);
  return { cfa, width, height, pattern, black, white };
}

interface NikonParams {
  vpred: number[][];
  curve: Uint16Array;
  curveMax: number;
  split: number;
  huff: number;
}

function readNikonParams(bytes: Uint8Array, off: number, le: boolean, bps: number): NikonParams {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (o: number) => view.getUint16(o, le);
  const ver0 = bytes[off];
  const ver1 = bytes[off + 1];
  let p = off + 2;
  if (ver0 === 0x49 || ver1 === 0x58) p += 2110;

  let huff = 0;
  if (ver0 === 0x46) huff = 2;
  if (bps === 14) huff += 3;

  const vpred = [
    [u16(p), u16(p + 2)],
    [u16(p + 4), u16(p + 6)],
  ];
  p += 8;

  const max = (1 << bps) & 0x7fff;
  const csize = u16(p);
  p += 2;
  const step = csize > 1 ? Math.floor(max / (csize - 1)) : 0;

  const curve = new Uint16Array(max);
  for (let i = 0; i < max; i++) curve[i] = i; // identity default
  let curveMax = max;
  let split = 0;

  if (ver0 === 0x44 && ver1 === 0x20 && step > 0) {
    for (let i = 0; i < csize; i++) curve[i * step] = u16(p + i * 2);
    for (let i = 0; i < max; i++) {
      const r = i % step;
      // Clamp the upper grid index: past the last grid point it would read out
      // of bounds (undefined -> NaN -> 0), decoding highlights to BLACK on
      // lossy-compressed NEFs (review find, 2026-07-15).
      const hi = Math.min(i - r + step, max - 1);
      curve[i] = Math.floor((curve[i - r] * (step - r) + curve[hi] * r) / step);
    }
    split = u16(off + 562);
  } else if (ver0 !== 0x46 && csize <= 0x4001) {
    for (let i = 0; i < csize; i++) curve[i] = u16(p + i * 2);
    curveMax = csize;
  }
  while (curveMax > 2 && curve[curveMax - 2] === curve[curveMax - 1]) curveMax--;

  return { vpred, curve, curveMax, split, huff };
}

function nikonDecode(bytes: Uint8Array, dataOffset: number, width: number, height: number, prm: NikonParams): Uint16Array {
  const cfa = new Uint16Array(width * height);
  let lut = buildHuffLut(NIKON_TREE[prm.huff]);

  let acc = 0;
  let nbits = 0;
  let pos = dataOffset;
  const fill = () => {
    while (nbits <= 24 && pos < bytes.length) {
      acc = (acc << 8) | bytes[pos++];
      nbits += 8;
    }
  };
  const getbits = (n: number): number => {
    if (n === 0) return 0;
    fill();
    nbits -= n;
    return (acc >>> nbits) & ((1 << n) - 1);
  };

  const vpred = [prm.vpred[0].slice(), prm.vpred[1].slice()];
  const hpred = [0, 0];
  const clipMax = prm.curve.length - 1;

  for (let row = 0; row < height; row++) {
    if (prm.split && row === prm.split) lut = buildHuffLut(NIKON_TREE[prm.huff + 1]);
    for (let col = 0; col < width; col++) {
      fill();
      // Out of data with pixels still to decode: fail honestly instead of
      // shifting garbage into the remaining rows (review find, 2026-07-15).
      if (nbits <= 0) throw new Error("This NEF's raw data ends early — the file looks damaged or incomplete.");
      const peek = (acc >>> (nbits - lut.maxlen)) & ((1 << lut.maxlen) - 1);
      const symbol = lut.sym[peek];
      nbits -= lut.len[peek];

      const len = symbol & 15;
      const shl = symbol >> 4;
      let diff = ((getbits(len - shl) << 1) + 1) << shl >> 1;
      if ((diff & (1 << (len - 1))) === 0) diff -= (1 << len) - (shl ? 0 : 1);

      let pred: number;
      if (col < 2) {
        vpred[row & 1][col] += diff;
        pred = vpred[row & 1][col];
        hpred[col] = pred;
      } else {
        hpred[col & 1] += diff;
        pred = hpred[col & 1];
      }
      const idx = pred < 0 ? 0 : pred > clipMax ? clipMax : pred;
      cfa[row * width + col] = prm.curve[idx];
    }
  }
  return cfa;
}

/** Walk IFD0 -> EXIF IFD -> MakerNote -> LinearizationTable (0x0096). */
function findLinearizationTable(bytes: Uint8Array, main: Reader): { offset: number; le: boolean } {
  const u32 = (o: number) => main.u32(o);
  const u16 = (o: number) => main.u16(o);
  const tagVal = (ifd: number, tag: number): number | undefined => {
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (u16(e) === tag) return u32(e + 8);
    }
    return undefined;
  };
  const exif = tagVal(u32(4), 0x8769);
  if (exif === undefined) throw new Error("NEF: no EXIF IFD.");
  // MakerNote tag 0x927C value offset.
  const n = u16(exif);
  let mnOff: number | undefined;
  for (let i = 0; i < n; i++) {
    const e = exif + 2 + i * 12;
    if (u16(e) === 0x927c) {
      mnOff = u32(e + 8);
      break;
    }
  }
  if (mnOff === undefined) throw new Error("NEF: no MakerNote.");

  // "Nikon\0" + version(2) + "\0\0" then an internal TIFF (its own byte order).
  const base = mnOff + 10;
  const mnLe = bytes[base] === 0x49;
  const mn = new Reader(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), mnLe);
  const mnIfd = base + mn.u32(base + 4);
  const mc = mn.u16(mnIfd);
  for (let i = 0; i < mc; i++) {
    const e = mnIfd + 2 + i * 12;
    if (mn.u16(e) === 0x0096) {
      return { offset: base + mn.u32(e + 8), le: mnLe };
    }
  }
  throw new Error("NEF: no LinearizationTable (0x0096).");
}
