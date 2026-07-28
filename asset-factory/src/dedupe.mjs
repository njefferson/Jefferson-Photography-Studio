// Duplicate detection: 64-bit dHash over the image composited onto 50% gray
// (shape-dominant — alpha is what matters for composition), Hamming-compared
// against every non-rejected catalog record. Intentional near-poses across
// DIFFERENT manifest entries survive; genuine composition clones don't.
import sharp from "sharp";

/** 9x8 grayscale difference hash -> 16-char hex string. */
export async function dhash(png) {
  const { data } = await sharp(png)
    .flatten({ background: { r: 128, g: 128, b: 128 } })
    .greyscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let bits = 0n;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      bits <<= 1n;
      if (data[y * 9 + x] > data[y * 9 + x + 1]) bits |= 1n;
    }
  return bits.toString(16).padStart(16, "0");
}

export function hamming(hexA, hexB) {
  let x = BigInt("0x" + hexA) ^ BigInt("0x" + hexB);
  let d = 0;
  while (x) {
    d += Number(x & 1n);
    x >>= 1n;
  }
  return d;
}

/**
 * Find the first existing hash within `threshold` of `hash`.
 * `index` is a Map(id -> dhash hex). Returns the colliding id or null.
 */
export function findDuplicate(hash, index, threshold) {
  for (const [id, h] of index) {
    if (hamming(hash, h) <= threshold) return id;
  }
  return null;
}
