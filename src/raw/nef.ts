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

/**
 * Full Bayer frame + metadata (for native-resolution export).
 * @param bytes  the whole NEF.
 * @returns the decoded mosaic with each photosite's own black already
 *   subtracted — the four MakerNote 0x003D values belong one to each CFA site
 *   (R, G on the red row, G on the blue row, B), as LibRaw's cblack takes them,
 *   and were averaged into one until 2026-10-02 — so `black` is 0 and `white` is
 *   the white level minus the largest of the four (DNG chapter 5's scale).
 *   When the four are equal, as on every owner file read, the values are the
 *   ones the single averaged black gave. Consumers: `decodeNef` (preview) and
 *   export.ts `getSource` (full resolution), which therefore agree.
 */
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
  // White (sensor saturation): the top of the file's own linearization curve
  // when one exists (lossy NEFs — D5300 16383), and otherwise the bit-depth
  // ceiling, (1 << bps) - 1, which is what LibRaw takes (maximum =
  // (1 << tiff_bps) - 1, no Z 50 entry). Lossless NEFs (0x46) carry no curve,
  // and the Z 50 writes only those (its manual offers a bit depth and no
  // compression choice). MEASURED on the owner's own Z 50 NEFs, 2026-10-01:
  // NIR_3716 and NIR_1688 have photosites pinned at exactly 16383 (12 and 16
  // of them), with only 6 and 7 between 15520 and 16383 — the sensor clips at
  // the ceiling, as RawTherapee's camconst.json measures it (16383, its table
  // backing off 6x read noise, 16374 at ISO 100). This was 15520 until then, a
  // value no source read gives for this body and only ever checked on
  // synthetic files, which pushed every Z 50 frame 5.6% brighter and made
  // autoRecover's 0.985 pin fire from raw 15302, below where the sensor clips. The
  // black pedestal scales with bit depth (1008 is the 14-bit convention).
  // MakerNote 0x003D is written at 14-bit scale whatever the file's depth, so a
  // 12-bit file's pedestal is a quarter of it, as LibRaw's open_datastream
  // corrects ("Adjust BL for Nikon 12bit"). Taken unscaled, a 12-bit Z 50 frame
  // (floor 250-256) lost 1008 and 77-94% of its photosites read zero.
  const curveWhite = params.curve[params.curveMax - 1] || 0;
  // One black per CFA site: [R, G on the R row, G on the B row, B].
  const siteBlacks = meta.blacks?.map((b) => (bps === 12 ? Math.round(b / 4) : b));
  const tagBlack = raw.num(50714)[0];
  const fallback = bps === 14 ? 1008 : bps === 12 ? 252 : 0;
  const sites = tagBlack !== undefined || !siteBlacks ? [0, 1, 2, 3].map(() => tagBlack ?? fallback) : [0, 1, 2, 3].map((i) => {
    const c = pattern[i];
    if (c === 0) return siteBlacks[0];
    if (c === 2) return siteBlacks[3];
    // A green on the row that holds red takes the second value, else the third.
    const rowHasRed = pattern[(i & 2)] === 0 || pattern[(i & 2) + 1] === 0;
    return rowHasRed ? siteBlacks[1] : siteBlacks[2];
  });
  const maxBlack = Math.max(...sites);
  const white =
    (raw.num(50717)[0] ??
    (params.hasCurve && curveWhite > maxBlack ? curveWhite : (1 << bps) - 1)) - maxBlack;
  for (let y = 0; y < height; y++) {
    const b0 = sites[(y & 1) * 2], b1 = sites[(y & 1) * 2 + 1];
    for (let x = 0, i = y * width; x < width; x++, i++) {
      const v = cfa[i] - (x & 1 ? b1 : b0);
      cfa[i] = v > 0 ? v : 0;
    }
  }
  // The autofocus rows are equalised on the black-subtracted values, so black
  // is 0 here and white is the subtracted ceiling.
  const model = ifds.map((d) => d.str(272)).find(Boolean) ?? "";
  if (Z50_PDAF.test(model)) equalisePdafRows(cfa, width, height, pattern, 0, white);
  return { cfa, width, height, pattern, black: 0, white };
}

/** Bodies whose phase-detect rows are known: the Z 50 and the Z fc share a
 *  sensor, and RawTherapee's camconst.json lists the same rows for both. */
const Z50_PDAF = /\bZ (50|fc)\b/i;

/**
 * THE Z 50'S AUTOFOCUS ROWS, PUT BACK IN LINE WITH THEIR NEIGHBOURS.
 *
 * Every 12th sensor row from 285 to 3441 carries the phase-detect pixels, and
 * RawTherapee's camconst.json records that their blue sites behave differently
 * ("a lower standard deviation on a black frame"). Measured 2026-10-02 on six
 * of the owner's Z 50 NEFs (NIR_1376, 3716, 1651, 1667, 1688, 2920), in smooth,
 * well-exposed areas against the same-colour rows two above and two below:
 * those blue sites read 0.36-0.53% LOWER than rows without phase-detect pixels
 * read by the same measure, and their noise is about half the control rows'. The looks multiply blue several
 * times over, which is what turns half a percent into a stripe every 12 rows.
 *
 * So the offset is measured on each photograph, the same way, and divided out
 * of those sites only. RawTherapee's own PDAF filter is built for the green
 * phase-detect pixels of other makers (it marks bright greens as bad pixels and
 * blends its line denoise toward the rows); for this body it names the rows and
 * nothing more, which is why the correction here is the measured level and
 * nothing else. The lower noise is left alone: nothing can put back noise that
 * was never recorded, and adding some would be inventing it.
 *
 * @param cfa  the Bayer frame, corrected in place.
 * @param W,H  its size in photosites.
 * @param pattern  the 2x2 CFA colours (0 R, 1 G, 2 B), row-major.
 * @param black,white  the frame's levels; a site at or above white is left
 *   alone, so a clipped highlight stays clipped.
 * @returns the ratio divided out, or 1 when nothing was changed — when the
 *   frame has no blue site on those rows, too few smooth well-exposed samples
 *   (under 2000 on either set of rows), or a ratio outside 0.97-1.0, which this defect never
 *   produced, so a scene that happens to have structure along those rows is
 *   never "corrected". The decode, the export and every tile read the frame
 *   through readNefCfa, so all of them agree.
 */
export function equalisePdafRows(cfa: Uint16Array, W: number, H: number, pattern: number[], black: number, white: number): number {
  let bRow = -1, bCol = -1;
  for (let i = 0; i < 4; i++) if (pattern[i] === 2) { bRow = i >> 1; bCol = i & 1; }
  if (bRow < 0) return 1;
  const rows: number[] = [];
  for (let r = 285; r <= 3441 && r < H - 2; r += 12) if ((r & 1) === bRow) rows.push(r);
  if (!rows.length) return 1;
  const x0 = 200 + ((bCol - 200) & 1);
  // The same reading on rows that carry no phase-detect pixels (4, 6 and 8
  // below each), because the smooth-area selection itself reads about 0.2% low
  // on a sky's curvature; the offset is the AF rows' reading over theirs.
  const reading = (list: number[]): number => {
    const ratios: number[] = [];
    for (const r of list) {
      if (r < 2 || r >= H - 2) continue;
      for (let x = x0; x < W - 200; x += 8) {
        const a = cfa[(r - 2) * W + x] - black, b = cfa[(r + 2) * W + x] - black, v = cfa[r * W + x] - black;
        const m = (a + b) / 2;
        if (m < 200 || cfa[r * W + x] >= white || Math.abs(a - b) > 0.04 * m) continue;
        ratios.push(v / m);
      }
    }
    if (ratios.length < 2000) return NaN;
    ratios.sort((p, q) => p - q);
    return ratios[ratios.length >> 1];
  };
  const ratio = reading(rows) / reading(rows.flatMap((r) => [r + 4, r + 6, r + 8]));
  if (!(ratio >= 0.97 && ratio < 1)) return 1;
  const gain = 1 / ratio;
  for (const r of rows) {
    for (let x = bCol; x < W; x += 2) {
      const o = r * W + x;
      const v = cfa[o];
      if (v <= black || v >= white) continue;
      cfa[o] = Math.min(white, Math.round(black + (v - black) * gain));
    }
  }
  return ratio;
}

interface NikonParams {
  vpred: number[][];
  curve: Uint16Array;
  curveMax: number;
  split: number;
  huff: number;
  /** True only when a real linearization table was read from the file. When
   *  false the curve is the identity DEFAULT (lossless 0x46 NEFs carry no
   *  table) and its top tells nothing about the file, so readNefCfa takes the
   *  bit-depth ceiling as white instead, as LibRaw does. (The 2026-07-25 audit
   *  read 16383 on lossless files as a regression from a "calibrated" 15520
   *  that disabled recovery; that was synthetic-verified only, and the owner's
   *  real Z 50 NEFs clip at 16383 — measured 2026-10-01.) */
  hasCurve: boolean;
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

  // LibRaw nikon_read_curve: `step = max = 1 << tiff_bps & 0x7fff`, and only a
  // grid of more than one point divides it.
  const full = (1 << bps) & 0x7fff;
  const csize = u16(p);
  p += 2;
  let max = full;
  let step = csize > 1 ? Math.floor(full / (csize - 1)) : full;

  const curve = new Uint16Array(full);
  for (let i = 0; i < full; i++) curve[i] = i; // identity default
  let split = 0;
  let hasCurve = false;

  // TWO LOSSY LAYOUTS, NOT ONE. Version 0x44 0x20 is the D5300 family's; 0x44
  // 0x40 is what the D6, D780, Z 5, Z 6, Z 6II, Z 7 and Z 7II write in their
  // lossy-compressed files (read from the MakerNote bytes of the raw.pixls.us
  // corpus). In 0x40 the grid covers a quarter of the bit-depth range, so LibRaw
  // quarters both the step and the curve's length: `if (ver0 == 0x44 && (ver1 ==
  // 0x20 || (ver1 == 0x40 && step > 3)) && step > 0) { if (ver1 == 0x40) { step
  // /= 4; max /= 4; } ...`. Both layouts carry the Huffman split row at +562
  // (nikon_load_raw reads it for either). Read as a full table instead, a 0x40
  // file's grid became the curve itself and the tree never switched at the split
  // row, so every row below it decoded as noise. The Z 50 this app is built
  // around writes neither — its files are 0x46 lossless — so this reaches a
  // reader's file only from those other bodies, and it is checked against a
  // synthetic file built from LibRaw's code, not a camera's: no owner file
  // carries this layout.
  const lossy40 = ver0 === 0x44 && ver1 === 0x40 && step > 3;
  if (ver0 === 0x44 && (ver1 === 0x20 || lossy40) && step > 0) {
    if (lossy40) {
      step = Math.floor(step / 4);
      max = Math.floor(max / 4);
    }
    // The last grid index (csize-1)*step can equal `full` — clamp the WRITE so
    // the final grid VALUE anchors the top of the curve instead of being
    // silently dropped, which left the tail ramping toward identity (dcraw
    // uses a 64K buffer for the same reason; audit find, 2026-07-25). In 0x40
    // the grid ends at the quartered `max`, inside the buffer, as in LibRaw.
    for (let i = 0; i < csize; i++) curve[Math.min(i * step, full - 1)] = u16(p + i * 2);
    for (let i = 0; i < max; i++) {
      const r = i % step;
      // Clamp the upper grid index: past the last grid point it would read out
      // of bounds (undefined -> NaN -> 0), decoding highlights to BLACK on
      // lossy-compressed NEFs (review find, 2026-07-15).
      const hi = Math.min(i - r + step, full - 1);
      curve[i] = Math.floor((curve[i - r] * (step - r) + curve[hi] * r) / step);
    }
    hasCurve = true;
  } else if (ver0 !== 0x46 && csize <= 0x4001) {
    // A 0x40 grid too coarse to quarter (step <= 3) lands here too, as it does
    // in nikon_read_curve, and is read as a whole table.
    for (let i = 0; i < csize; i++) curve[i] = u16(p + i * 2);
    max = csize;
    hasCurve = true;
  }
  // nikon_load_raw reads the split row for BOTH lossy versions, whichever way
  // the curve was read: `if (ver0 == 0x44 && (ver1 == 0x20 || ver1 == 0x40))
  // { if (ver1 == 0x40) max /= 4; fseek(ifp, meta_offset + 562, SEEK_SET);
  // split = get2(); }`.
  if (ver0 === 0x44 && (ver1 === 0x20 || ver1 === 0x40)) split = u16(off + 562);
  // nikon_load_raw trims the curve's flat top the same way for the data range.
  let curveMax = max;
  while (curveMax > 2 && curve[curveMax - 2] === curve[curveMax - 1]) curveMax--;

  return { vpred, curve, curveMax, split, huff, hasCurve };
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

/** Walk IFD0 -> EXIF IFD -> MakerNote -> LinearizationTable (0x0096), also
 *  collecting the MakerNote BlackLevel (0x003D, four u16 — one per CFA site)
 *  when present. That tag is the FILE'S OWN pedestal and varies per body:
 *  D5300 = 600, Z-series = 1008. Assuming the Z value crushed a deeply
 *  underexposed D5300 frame to near-black (owner's DSC_1709, 2026-07-25 —
 *  its Adobe DNG twin carried BlackLevel 600 and rendered fine). */
function findLinearizationTable(bytes: Uint8Array, main: Reader): { offset: number; le: boolean; blacks?: number[] } {
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
  let linOff: number | undefined;
  let blacks: number[] | undefined;
  for (let i = 0; i < mc; i++) {
    const e = mnIfd + 2 + i * 12;
    const tag = mn.u16(e);
    if (tag === 0x0096) linOff = base + mn.u32(e + 8);
    if (tag === 0x003d && mn.u16(e + 2) === 3 && mn.u32(e + 4) === 4) {
      // Four per-CFA-site shorts, R, G(R row), G(B row), B — LibRaw's
      // `FORC4 cblack[RGGB_2_RGBG(c)] = get2()`. Kept apart, never averaged.
      const vo = base + mn.u32(e + 8);
      blacks = [mn.u16(vo), mn.u16(vo + 2), mn.u16(vo + 4), mn.u16(vo + 6)];
    }
    // 0x000C (WB_RBLevels) IS IN THIS IFD AND IS DELIBERATELY NOT READ.
    // It is the camera's own white balance, [R, B, G, G], and on a visible-
    // light body it would be the right thing to open on. On an infrared
    // conversion it is not: on these files it is the 5200 K daylight default
    // the Z 50 manual gives a PRE preset slot holding no measured value
    // ("If no value currently exists for the selected preset, white balance
    // will be set to 5200 K, the same as Direct sunlight"), not a measurement of
    // the scene. Measured on this repo's own files — NIR_1376.NEF developed
    // at its own [1.8574, 1.4668, 1, 1] renders rgb(158, 0, 241), green at
    // ZERO, two hues; gray-world on the same frame gives rgb(175, 178, 178)
    // and five. Why a NEF on PRESET4 and five JPEGs on PRESET6 record that
    // identical number to four decimals: both slots were empty and fell back
    // to 5200 K. This comment read that as a clamp until 2026-10-01.
    // So the white point is found BELOW what the camera allows, from the data.
    // A session shipped it the other way round and took it back out the same
    // day; the physics and the numbers are in IR-SCIENCE.md, section 3.
  }
  if (linOff === undefined) throw new Error("NEF: no LinearizationTable (0x0096).");
  return { offset: linOff, le: mnLe, blacks };
}
