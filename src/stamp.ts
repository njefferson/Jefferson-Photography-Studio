// ONE HASH, BECAUSE THE SECOND COPY IS WHERE THE TWO ANSWERS COME FROM.
//
// Two stores on this device are keyed on "has the thing this was made from
// changed": the lens profiles behind every rendered preview, and the creative
// grade a quick-look tile is a picture of. Both need the same thing — a short,
// stable fingerprint of a string that is far too long to be a key — and the
// first of them had it written inline.
//
// The hub's binary-files.mjs exists for exactly this shape: one idea, two
// copies, and the copies were not the same. Writing a second FNV-1a here rather
// than importing this one would be that failure by hand, a week early.
//
// FNV-1a, 32 bits, with the input's LENGTH appended. The length is not
// decoration: a 32-bit hash has collisions, and two strings that collide AND
// share a length are what it takes to serve the wrong picture — a much smaller
// target than a bare hash.

/** A short fingerprint of `raw`, stable across reloads and builds. */
export function fnv1a(raw: string): string {
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36) + "." + raw.length.toString(36);
}
