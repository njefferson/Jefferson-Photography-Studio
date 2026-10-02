// Minimal TIFF/DNG reader shared by the JPEG and mosaiced-raw decode paths.

function nonZero(v: number): number {
  return v === 0 ? 1 : v;
}

export class Ifd {
  constructor(
    private tiff: Tiff,
    private entries: Map<number, [number, number, number]>,
  ) {}
  /** Numeric value(s) for a tag, resolving out-of-line arrays. Empty if absent. */
  num(tag: number): number[] {
    const e = this.entries.get(tag);
    if (!e) return [];
    return this.tiff.readNumbers(e[0], e[1], e[2]);
  }
  has(tag: number): boolean {
    return this.entries.has(tag);
  }
  /**
   * The raw value bytes of a tag, uninterpreted — what an UNDEFINED-typed DNG
   * tag holds (the opcode lists, which are big-endian whatever the file's own
   * byte order, so they must not go through `num`).
   * @param tag  the TIFF tag number.
   * @returns a view into the file's bytes covering the whole value, or
   *   undefined when the tag is absent or its value runs past the end of the
   *   file. Consumer: `parseOpcodeList` in dngOpcodes.ts.
   */
  bytes(tag: number): Uint8Array | undefined {
    const e = this.entries.get(tag);
    if (!e) return undefined;
    return this.tiff.valueBytes(e[0], e[1], e[2]);
  }
  /** ASCII value for a tag (e.g. Make/Model), cut at the first NUL. BYTE is
   *  accepted too: the DNG calibration signatures may be written either way. */
  str(tag: number): string | undefined {
    const e = this.entries.get(tag);
    if (!e || (e[0] !== 2 && e[0] !== 1)) return undefined;
    const codes = this.tiff.readNumbers(e[0], e[1], e[2]);
    let s = "";
    for (const c of codes) {
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s.trim() || undefined;
  }
  subIfdOffsets(): number[] {
    return this.num(330);
  }
}

export class Tiff {
  private view: DataView;
  private le: boolean;
  constructor(private bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.le = bytes[0] === 0x49;
  }
  private u16(o: number) {
    return this.view.getUint16(o, this.le);
  }
  private u32(o: number) {
    return this.view.getUint32(o, this.le);
  }
  /** Bytes one value of a TIFF field type occupies (TIFF 6.0 section 2):
   *  SHORT/SSHORT 2, LONG/SLONG/FLOAT/IFD 4, RATIONAL/SRATIONAL/DOUBLE 8, the
   *  byte types 1. SSHORT, SLONG and DOUBLE were read as single bytes until
   *  2026-10-02, which misread every DNG tag a writer chose to store that way. */
  private static typeSize(type: number): number {
    return type === 3 || type === 8 ? 2 : type === 4 || type === 9 || type === 11 || type === 13 ? 4 : type === 5 || type === 10 || type === 12 ? 8 : 1;
  }
  readNumbers(type: number, count: number, valueOffset: number): number[] {
    const size = Tiff.typeSize(type);
    const base = size * count <= 4 ? valueOffset : this.u32(valueOffset);
    const out: number[] = [];
    if (base + size * count > this.bytes.length) return out;
    for (let i = 0; i < count; i++) {
      const p = base + i * size;
      if (type === 3) out.push(this.u16(p));
      else if (type === 4 || type === 13) out.push(this.u32(p));
      else if (type === 5) out.push(this.u32(p) / Math.max(1, this.u32(p + 4)));
      else if (type === 8) out.push(this.view.getInt16(p, this.le)); // SSHORT
      else if (type === 9) out.push(this.view.getInt32(p, this.le)); // SLONG
      else if (type === 10) out.push(this.view.getInt32(p, this.le) / nonZero(this.view.getInt32(p + 4, this.le))); // SRATIONAL
      else if (type === 11) out.push(this.view.getFloat32(p, this.le)); // FLOAT
      else if (type === 12) out.push(this.view.getFloat64(p, this.le)); // DOUBLE
      else if (type === 6) out.push(this.view.getInt8(p)); // SBYTE
      else out.push(this.view.getUint8(p));
    }
    return out;
  }
  /** The bytes of one field's value, resolving an out-of-line offset; undefined
   *  when it runs past the end of the file. */
  valueBytes(type: number, count: number, valueOffset: number): Uint8Array | undefined {
    const n = Tiff.typeSize(type) * count;
    const base = n <= 4 ? valueOffset : this.u32(valueOffset);
    if (base + n > this.bytes.length) return undefined;
    return this.bytes.subarray(base, base + n);
  }
  private parseIfd(off: number): Ifd {
    const n = this.u16(off);
    const entries = new Map<number, [number, number, number]>();
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12;
      entries.set(this.u16(e), [this.u16(e + 2), this.u32(e + 4), e + 8]);
    }
    return new Ifd(this, entries);
  }
  /** All IFDs reachable from IFD0, including SubIFDs and the IFD chain. */
  allIfds(): Ifd[] {
    const out: Ifd[] = [];
    const seen = new Set<number>();
    const walk = (off: number) => {
      if (off <= 0 || off >= this.bytes.length || seen.has(off)) return;
      seen.add(off);
      const ifd = this.parseIfd(off);
      out.push(ifd);
      for (const s of ifd.subIfdOffsets()) walk(s);
      const n = this.u16(off);
      walk(this.u32(off + 2 + n * 12));
    };
    walk(this.u32(4));
    return out;
  }
}
