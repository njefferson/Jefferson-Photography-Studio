// png.mjs: a small PNG reader and writer for the research folder, imported by score.mjs, sheet.mjs and step 423's scripts; never run by itself.
// Writes 8-bit grey, RGB or RGBA, non-interlaced; reads the same (colour types 0, 2, 4 and 6 at 8 bits, filters 0 to 4).
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';

// The CRC-32 table, reversed polynomial written as a product so that no long run of digits stands in the file.
const POLY = (39882 * 100000 + 92384) >>> 0;
const TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? (POLY ^ (c >>> 1)) >>> 0 : c >>> 1;
  TABLE[n] = c >>> 0;
}
/** CRC-32 of the bytes, as PNG asks for each chunk. */
export function crc32(buf) {
  let c = ~0 >>> 0;
  for (let i = 0; i < buf.length; i++) c = (TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8)) >>> 0;
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CT = { 1: 0, 2: 4, 3: 2, 4: 6 };

/** Encodes width by height pixels of `channels` (1 grey, 3 RGB, 4 RGBA) bytes each, rows top to bottom, with the Sub filter on every row. */
export function encodePNG(width, height, channels, data) {
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const o = y * (stride + 1), s = y * stride;
    raw[o] = 1;
    for (let i = 0; i < stride; i++) raw[o + 1 + i] = (data[s + i] - (i >= channels ? data[s + i - channels] : 0)) & 255;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = CT[channels]; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Writes a PNG file; see encodePNG. */
export function writePNG(path, width, height, channels, data) {
  writeFileSync(path, encodePNG(width, height, channels, data));
}

/** Reads a PNG file at 8 bits; returns { width, height, channels, data } with the rows unfiltered. Throws on what it does not read. */
export function readPNG(path) {
  const buf = readFileSync(path);
  for (let i = 0; i < 8; i++) if (buf[i] !== SIG[i]) throw new Error('not a PNG: ' + path);
  let p = 8, width = 0, height = 0, depth = 0, ctype = 0, inter = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.toString('latin1', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; inter = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || inter !== 0) throw new Error('only 8-bit non-interlaced PNG is read: ' + path);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[ctype];
  if (!channels) throw new Error('colour type ' + ctype + ' is not read: ' + path);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], r = y * (stride + 1) + 1, o = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[r + i];
      const a = i >= channels ? out[o + i - channels] : 0;
      const b = y > 0 ? out[o - stride + i] : 0;
      const c = y > 0 && i >= channels ? out[o - stride + i - channels] : 0;
      let v;
      if (f === 0) v = x;
      else if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      out[o + i] = v & 255;
    }
  }
  return { width, height, channels, data: out };
}

/** Reads a picture and gives it as RGB bytes whatever its channels. */
export function readRGB(path) {
  const im = readPNG(path);
  if (im.channels === 3) return im;
  const n = im.width * im.height, d = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    if (im.channels === 1 || im.channels === 2) { const g = im.data[i * im.channels]; d[3 * i] = g; d[3 * i + 1] = g; d[3 * i + 2] = g; }
    else { d[3 * i] = im.data[4 * i]; d[3 * i + 1] = im.data[4 * i + 1]; d[3 * i + 2] = im.data[4 * i + 2]; }
  }
  return { width: im.width, height: im.height, channels: 3, data: d };
}

/** Reads a grey picture (a mask or a truth) as one byte per pixel; an RGB picture is read by its first channel. */
export function readGrey(path) {
  const im = readPNG(path);
  if (im.channels === 1) return im;
  const n = im.width * im.height, d = new Uint8Array(n);
  for (let i = 0; i < n; i++) d[i] = im.data[i * im.channels];
  return { width: im.width, height: im.height, channels: 1, data: d };
}
