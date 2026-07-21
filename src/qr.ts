// Minimal QR encoder — byte mode, error-correction level M, versions 1..26 —
// written from the public ISO/IEC 18004 spec, no third-party code (the app's
// no-third-party-IP stance). Used to render a look link as a scannable code;
// the phone's camera is the decoder, so this module only ENCODES.
//
// Correctness is pinned by the harness: every generated matrix is decoded
// back with an independent decoder (jsQR, dev-only) and must round-trip the
// exact input string, across payload sizes that span several versions.

const EC_M = 0; // we only emit level M (format bits below encode it)

// Level-M block structure per version 1..26:
// [ecPerBlock, group1Blocks, group1Data, group2Blocks, group2Data]
const BLOCKS_M: [number, number, number, number, number][] = [
  [10, 1, 16, 0, 0], // v1
  [16, 1, 28, 0, 0],
  [26, 1, 44, 0, 0],
  [18, 2, 32, 0, 0],
  [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
  [26, 4, 43, 1, 44], // v10
  [30, 1, 50, 4, 51],
  [22, 6, 36, 2, 37],
  [22, 8, 37, 1, 38],
  [24, 4, 40, 5, 41],
  [24, 5, 41, 5, 42],
  [28, 7, 45, 3, 46],
  [28, 10, 46, 1, 47],
  [26, 9, 43, 4, 44],
  [26, 3, 44, 11, 45],
  [26, 3, 41, 13, 42], // v20
  [26, 17, 42, 0, 0],
  [28, 17, 46, 0, 0],
  [28, 4, 47, 14, 48],
  [28, 6, 45, 14, 46],
  [28, 8, 47, 13, 48],
  [28, 19, 46, 4, 47], // v26
];

// Alignment-pattern centre coordinates per version 1..26.
const ALIGN: number[][] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62],
  [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90],
  [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114],
];

// Remainder bits after the final codeword, per version 1..26.
const REMAINDER = [0, 7, 7, 7, 7, 7, 0, 0, 0, 0, 0, 0, 0, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4];

// --- GF(256), polynomial 0x11d ---
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const gmul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** Reed–Solomon EC codewords for `data`, `n` of them. */
function rsEncode(data: Uint8Array, n: number): Uint8Array {
  // Generator polynomial of degree n.
  let gen = new Uint8Array([1]);
  for (let i = 0; i < n; i++) {
    const next = new Uint8Array(gen.length + 1);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gmul(gen[j], EXP[i]);
      next[j + 1] ^= gen[j];
    }
    gen = next;
  }
  // gen is little-endian in degree; polynomial division wants highest first.
  gen.reverse();
  const res = new Uint8Array(data.length + n);
  res.set(data, 0);
  for (let i = 0; i < data.length; i++) {
    const factor = res[i];
    if (factor === 0) continue;
    for (let j = 1; j < gen.length; j++) res[i + j] ^= gmul(gen[j], factor);
  }
  return res.slice(data.length);
}

/** BCH(15,5) format info for level M + mask, pre-masked per spec. */
function formatBits(mask: number): number {
  // Level M = 0b00 in the format field's EC bits.
  const data = (EC_M << 3) | mask;
  let v = data << 10;
  const G = 0b10100110111;
  for (let i = 14; i >= 10; i--) if ((v >> i) & 1) v ^= G << (i - 10);
  return ((data << 10) | v) ^ 0b101010000010010;
}

/** BCH(18,6) version info, versions >= 7. */
function versionBits(ver: number): number {
  let v = ver << 12;
  const G = 0b1111100100101;
  for (let i = 17; i >= 12; i--) if ((v >> i) & 1) v ^= G << (i - 12);
  return (ver << 12) | v;
}

export interface QrMatrix {
  size: number;
  /** Row-major booleans; true = dark module. */
  modules: Uint8Array;
}

/** Encode text (UTF-8, byte mode, EC level M). Throws when it doesn't fit
 *  version 26 (~1500 bytes at M) — far beyond any look link. */
export function encodeQr(text: string): QrMatrix {
  const bytes = new TextEncoder().encode(text);

  // Pick the smallest version that fits: header = 4 (mode) + count bits.
  let version = -1;
  let dataCap = 0;
  for (let v = 1; v <= 26; v++) {
    const [, g1b, g1d, g2b, g2d] = BLOCKS_M[v - 1];
    const cap = g1b * g1d + g2b * g2d;
    const countBits = v <= 9 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 <= cap * 8) {
      version = v;
      dataCap = cap;
      break;
    }
  }
  if (version < 0) throw new Error("Too much data for a QR code (fits ~1.5 KB).");

  // --- Bit stream: mode 0100, count, data, terminator, pad ---
  const bits: number[] = [];
  const push = (val: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, dataCap * 8 - bits.length)); // terminator
  while (bits.length % 8 !== 0) bits.push(0);
  const PAD = [0xec, 0x11];
  for (let i = 0; bits.length < dataCap * 8; i++) push(PAD[i % 2], 8);
  const data = new Uint8Array(dataCap);
  for (let i = 0; i < dataCap; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
    data[i] = b;
  }

  // --- Split into blocks, compute EC, interleave ---
  const [ecPer, g1b, g1d, g2b, g2d] = BLOCKS_M[version - 1];
  const blocks: Uint8Array[] = [];
  const ecs: Uint8Array[] = [];
  let off = 0;
  for (let i = 0; i < g1b; i++) { blocks.push(data.slice(off, off + g1d)); off += g1d; }
  for (let i = 0; i < g2b; i++) { blocks.push(data.slice(off, off + g2d)); off += g2d; }
  for (const blk of blocks) ecs.push(rsEncode(blk, ecPer));
  const maxLen = Math.max(g1d, g2d);
  const seq: number[] = [];
  for (let i = 0; i < maxLen; i++) for (const blk of blocks) if (i < blk.length) seq.push(blk[i]);
  for (let i = 0; i < ecPer; i++) for (const ec of ecs) seq.push(ec[i]);

  // --- Matrix ---
  const size = 17 + version * 4;
  const modules = new Uint8Array(size * size); // 0/1 = light/dark
  const reserved = new Uint8Array(size * size); // function-pattern cells
  const set = (x: number, y: number, dark: number, res = 1) => {
    modules[y * size + x] = dark;
    if (res) reserved[y * size + x] = 1;
  };

  // Finders + separators.
  const finder = (fx: number, fy: number) => {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const px = fx + x, py = fy + y;
        if (px < 0 || py < 0 || px >= size || py >= size) continue;
        const inCore = x >= 0 && x <= 6 && y >= 0 && y <= 6;
        // Ring pattern: dark on the 7x7 border and the 3x3 core, light between.
        const m = Math.max(Math.abs(x - 3), Math.abs(y - 3));
        set(px, py, inCore && (m === 3 || m <= 1) ? 1 : 0);
      }
    }
  };
  finder(0, 0);
  finder(size - 7, 0);
  finder(0, size - 7);

  // Alignment patterns (skip any overlapping a finder).
  const centers = ALIGN[version - 1];
  for (const cy of centers) {
    for (const cx of centers) {
      if ((cx <= 8 && cy <= 8) || (cx >= size - 9 && cy <= 8) || (cx <= 8 && cy >= size - 9)) continue;
      for (let y = -2; y <= 2; y++) {
        for (let x = -2; x <= 2; x++) {
          const m = Math.max(Math.abs(x), Math.abs(y));
          set(cx + x, cy + y, m === 2 || m === 0 ? 1 : 0);
        }
      }
    }
  }

  // Timing patterns.
  for (let i = 8; i < size - 8; i++) {
    if (!reserved[6 * size + i]) set(i, 6, i % 2 === 0 ? 1 : 0);
    if (!reserved[i * size + 6]) set(6, i, i % 2 === 0 ? 1 : 0);
  }

  // Dark module + reserve format-info cells (filled after masking).
  set(8, size - 8, 1);
  for (let i = 0; i < 9; i++) {
    if (i !== 6) { if (!reserved[8 * size + i]) set(i, 8, 0); if (!reserved[i * size + 8]) set(8, i, 0); }
  }
  set(8, 8, 0);
  for (let i = 0; i < 8; i++) {
    if (!reserved[8 * size + (size - 1 - i)]) set(size - 1 - i, 8, 0);
    if (i !== 7 && !reserved[(size - 1 - i) * size + 8]) set(8, size - 1 - i, 0);
  }

  // Version info (v >= 7): two 3x6 blocks.
  if (version >= 7) {
    const vb = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const bit = (vb >> i) & 1;
      const a = Math.floor(i / 3), b = size - 11 + (i % 3);
      set(a, b, bit);
      set(b, a, bit);
    }
  }

  // --- Data placement: zigzag from the bottom-right, skipping column 6 ---
  const totalBits = seq.length * 8 + REMAINDER[version - 1];
  let bitIdx = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // the vertical timing column is skipped entirely
    for (let i = 0; i < size; i++) {
      const y = upward ? size - 1 - i : i;
      for (const dx of [0, -1]) {
        const x = col + dx;
        if (reserved[y * size + x]) continue;
        let bit = 0;
        if (bitIdx < seq.length * 8) {
          bit = (seq[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1;
        }
        if (bitIdx < totalBits) {
          modules[y * size + x] = bit;
          bitIdx++;
        }
      }
    }
    upward = !upward;
  }

  // --- Mask 0: (row + col) % 2 === 0, data cells only ---
  const MASK = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!reserved[y * size + x] && (x + y) % 2 === 0) modules[y * size + x] ^= 1;
    }
  }

  // --- Format info (level M + mask 0) into the reserved cells ---
  const fb = formatBits(MASK);
  const fbit = (i: number) => (fb >> i) & 1;
  // Around the top-left finder (bit 0 first per spec figure).
  const coordsA: [number, number][] = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  // Split copy: bottom-left column + top-right row.
  const coordsB: [number, number][] = [];
  for (let i = 0; i < 7; i++) coordsB.push([8, size - 1 - i]);
  for (let i = 7; i < 15; i++) coordsB.push([size - 15 + i, 8]);
  for (let i = 0; i < 15; i++) {
    modules[coordsA[i][1] * size + coordsA[i][0]] = fbit(14 - i);
    modules[coordsB[i][1] * size + coordsB[i][0]] = fbit(14 - i);
  }

  return { size, modules };
}

/** Draw a QR matrix onto a canvas at `scale` px/module with a quiet zone. */
export function drawQr(qr: QrMatrix, canvas: HTMLCanvasElement, scale = 6, quiet = 4): void {
  const px = (qr.size + quiet * 2) * scale;
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = "#000000";
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y * qr.size + x]) ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
    }
  }
}
