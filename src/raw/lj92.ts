// Lossless JPEG (ITU-T T.81, process 14 / SOF3) decoder — pure TypeScript.
//
// This is what DNG uses to compress mosaiced (Bayer) raw, e.g. Lightroom's
// "Convert to DNG". Verified bit-exact against LibRaw on the project's real
// files. Handles N components (DNG packs Bayer columns as interleaved
// components), 16-bit precision, predictors 1-7, byte-stuffing and restart
// markers.

export interface Lj92Image {
  width: number; // X (per-component width)
  height: number; // Y
  components: number; // Nf
  /** Samples, interleaved per pixel: [y*width + x]*components + c. */
  data: Uint16Array;
}

class BitReader {
  private byte = 0;
  private bitsLeft = 0;
  /** True once a marker (other than a stuffed FF00) was hit. */
  marker = 0;

  constructor(private d: Uint8Array, private pos: number) {}

  bit(): number {
    if (this.bitsLeft === 0) {
      let v = this.d[this.pos++];
      if (v === 0xff) {
        const next = this.d[this.pos++];
        if (next !== 0x00) {
          // Marker: remember it and feed zeros (caller handles restart/EOI).
          this.marker = next;
          this.pos -= 2;
          v = 0;
        }
      }
      this.byte = v;
      this.bitsLeft = 8;
    }
    this.bitsLeft--;
    return (this.byte >> this.bitsLeft) & 1;
  }

  bits(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | this.bit();
    return v;
  }

  /** Align to a byte boundary and consume an expected RSTn marker. */
  restart() {
    this.bitsLeft = 0;
    this.marker = 0;
    // Skip fill bytes up to and including the FF Dx restart marker.
    while (this.pos + 1 < this.d.length) {
      if (this.d[this.pos] === 0xff && this.d[this.pos + 1] >= 0xd0 && this.d[this.pos + 1] <= 0xd7) {
        this.pos += 2;
        return;
      }
      this.pos++;
    }
  }
}

interface HuffTable {
  // Canonical decode: for code length L, mincode/maxcode and value pointer.
  maxcode: Int32Array;
  mincode: Int32Array;
  valptr: Int32Array;
  values: Uint8Array;
}

function buildHuff(counts: number[], values: Uint8Array): HuffTable {
  const maxcode = new Int32Array(18).fill(-1);
  const mincode = new Int32Array(18);
  const valptr = new Int32Array(18);
  let code = 0;
  let k = 0;
  for (let l = 1; l <= 16; l++) {
    if (counts[l - 1] > 0) {
      valptr[l] = k;
      mincode[l] = code;
      code += counts[l - 1];
      maxcode[l] = code - 1;
      k += counts[l - 1];
    } else {
      maxcode[l] = -1;
    }
    code <<= 1;
  }
  return { maxcode, mincode, valptr, values };
}

function huffDecode(br: BitReader, t: HuffTable): number {
  let code = 0;
  for (let l = 1; l <= 16; l++) {
    code = (code << 1) | br.bit();
    if (t.maxcode[l] >= 0 && code <= t.maxcode[l]) {
      return t.values[t.valptr[l] + (code - t.mincode[l])];
    }
  }
  return 0;
}

function extend(v: number, t: number): number {
  return v < 1 << (t - 1) ? v - (1 << t) + 1 : v;
}

export function decodeLJ92(j: Uint8Array): Lj92Image {
  const be16 = (o: number) => (j[o] << 8) | j[o + 1];
  let p = 2; // skip SOI (FFD8)
  let precision = 0;
  let Y = 0;
  let X = 0;
  let Nf = 0;
  let predictor = 1;
  let pointTransform = 0;
  let restartInterval = 0;
  const huff: Record<number, HuffTable> = {};
  const compTable: number[] = [];

  while (p < j.length) {
    if (j[p] !== 0xff) {
      p++;
      continue;
    }
    const m = j[p + 1];
    if (m === 0xd8 || m === 0xd9) {
      p += 2;
      continue;
    }
    const L = be16(p + 2);
    if (m === 0xc3) {
      // SOF3
      precision = j[p + 4];
      Y = be16(p + 5);
      X = be16(p + 7);
      Nf = j[p + 9];
    } else if (m === 0xc4) {
      // DHT (possibly several tables in one segment)
      let q = p + 4;
      const end = p + 2 + L;
      while (q < end) {
        const th = j[q] & 0x0f;
        q++;
        const counts: number[] = [];
        let total = 0;
        for (let i = 0; i < 16; i++) {
          counts.push(j[q + i]);
          total += j[q + i];
        }
        q += 16;
        huff[th] = buildHuff(counts, j.subarray(q, q + total));
        q += total;
      }
    } else if (m === 0xdd) {
      restartInterval = be16(p + 4);
    } else if (m === 0xda) {
      // SOS
      const ns = j[p + 4];
      for (let i = 0; i < ns; i++) compTable[i] = j[p + 5 + i * 2 + 1] >> 4;
      const ss = p + 4 + 1 + ns * 2;
      predictor = j[ss];
      pointTransform = j[ss + 2] & 0x0f;
      p = p + 2 + L;
      break;
    }
    p += 2 + L;
  }

  const br = new BitReader(j, p);
  const planes: Int32Array[] = [];
  for (let c = 0; c < Nf; c++) planes.push(new Int32Array(X * Y));
  const def = 1 << (precision - pointTransform - 1);

  let mcu = 0;
  let restartCountdown = restartInterval;
  for (let y = 0; y < Y; y++) {
    for (let x = 0; x < X; x++) {
      for (let c = 0; c < Nf; c++) {
        const t = huffDecode(br, huff[compTable[c]]);
        let diff: number;
        if (t === 0) diff = 0;
        else if (t === 16) diff = 32768;
        else diff = extend(br.bits(t), t);

        const plane = planes[c];
        let px: number;
        if (x === 0 && y === 0) px = def;
        else if (y === 0) px = plane[y * X + x - 1]; // first line: Ra
        else if (x === 0) px = plane[(y - 1) * X + x]; // line start: Rb
        else {
          const ra = plane[y * X + x - 1];
          const rb = plane[(y - 1) * X + x];
          const rc = plane[(y - 1) * X + x - 1];
          px =
            predictor === 1 ? ra
            : predictor === 2 ? rb
            : predictor === 3 ? rc
            : predictor === 4 ? ra + rb - rc
            : predictor === 5 ? ra + ((rb - rc) >> 1)
            : predictor === 6 ? rb + ((ra - rc) >> 1)
            : (ra + rb) >> 1; // 7
        }
        plane[y * X + x] = (px + diff) & 0xffff;
      }
      if (restartInterval > 0 && --restartCountdown === 0) {
        br.restart();
        restartCountdown = restartInterval;
      }
      mcu++;
    }
  }

  const data = new Uint16Array(X * Y * Nf);
  for (let c = 0; c < Nf; c++) {
    const plane = planes[c];
    for (let i = 0; i < X * Y; i++) data[i * Nf + c] = plane[i];
  }
  return { width: X, height: Y, components: Nf, data };
}
