#!/usr/bin/env node
// THE WORDS A READER NEVER AGREED TO LEARN — one list, imported by every gate
// that checks copy the app shows. NOT a gate itself.
//
// It is one file for the reason the hub's `binary-files.mjs` is one file: two
// lists for one idea is a gate lying about its coverage (hub LESSONS §243).
// `tools/patch-note-check.mjs` holds commit subjects to it, because a subject
// IS the patch note the reader is shown, and `tools/roadmap-copy-check.mjs`
// holds the roadmap's `Shown as:` lines to it.
//
// WHY IT EXISTS, reported from the device 2026-09-22. The ⓘ dialog was showing
// "a keep file carries your photograph, not a reference to it", "a saved photo
// comes back with its masks, warp and colour LUT", and "Changed: this release
// is 2.59" — to somebody who has no idea what any of that means, and no reason
// to.
//
// NARROW BY MEASUREMENT, NOT BY TASTE, which is the only thing that makes a
// word ban usable on prose (hub LESSONS §108, and Cv-Thalweg's copy-count).
// Every entry below was checked against all 38 reader-facing commit subjects in
// this repository's history. The seven that fire, fire ONLY on lines that are
// genuinely wrong: `shader` on "the shader comment that stopped the app
// building", `LUT` and `warp` on one subject, `commit` on "Follow the hub to
// its current commit", `keep file` and `reference` on one, `aim` on "aim noise
// reduction and texture at a mask". Zero honest subjects are flagged. The rest
// have never appeared in a reader-facing subject and are here to stop the next
// one.
//
// WHAT IS DELIBERATELY ABSENT, because measuring is what tells you: `texture`,
// `mask`, `grade`, `look`, `export` and `crop` are all CONTROL NAMES this app
// puts on screen. They read as jargon and they are the reader's own vocabulary,
// and a list assembled by taste would have banned every one of them. `hub` is
// out too — it is a place the reader can actually visit.

/** The internal vocabulary, lower-case. Single words match on a word boundary;
 *  entries containing a space match as a phrase anywhere. */
export const INTERNAL_WORDS = [
  "shader", "lut", "warp", "bitmask", "sampler", "buffer", "pipeline",
  "refactor", "commit", "repo", "regex", "parser", "bitmap", "canvas",
  "keep file", "reference", "aim", "aimed", "aiming", "proxy", "worker",
  "indexeddb", "module", "hash", "array", "struct", "callback", "boolean",
  "this release is",
];

/** EVERY INTERNAL WORD IN ONE PIECE OF READER COPY.
 *
 *  Takes `text`, a single line the app shows somebody — a commit subject that
 *  becomes a patch note, or a roadmap `Shown as:` line. Returns the matching
 *  entries of `INTERNAL_WORDS`, lower-cased, in the order they are declared;
 *  an empty array means the line is clean.
 *
 *  What the caller relies on: an empty result is the ONLY passing answer, and
 *  callers report the array itself rather than a count, because "this line
 *  contains `warp`" is actionable and "1 problem" is not. */
export function internalWords(text) {
  const hay = String(text).toLowerCase();
  return INTERNAL_WORDS.filter((w) =>
    w.includes(" ") ? hay.includes(w) : new RegExp(`\\b${w}\\b`).test(hay));
}
