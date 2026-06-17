// Minimal TIFF/DNG reader shared by the JPEG and mosaiced-raw decode paths.

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
  readNumbers(type: number, count: number, valueOffset: number): number[] {
    const size = type === 3 ? 2 : type === 4 || type === 11 ? 4 : type === 5 ? 8 : 1;
    const base = size * count <= 4 ? valueOffset : this.u32(valueOffset);
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      const p = base + i * size;
      if (type === 3) out.push(this.u16(p));
      else if (type === 4) out.push(this.u32(p));
      else if (type === 5) out.push(this.u32(p) / Math.max(1, this.u32(p + 4)));
      else out.push(this.view.getUint8(p));
    }
    return out;
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
