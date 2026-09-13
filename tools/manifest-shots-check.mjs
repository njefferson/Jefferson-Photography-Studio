#!/usr/bin/env node
// A SCREENSHOT DECLARED AT THE WRONG SIZE IS REFUSED SILENTLY, AND THE INSTALL
// PROMPT JUST GOES QUIET.
//
// Chromium shows the richer install dialog — a picture of the app, not only its
// icon — when the manifest carries `screenshots`. Every field in that entry is
// a CLAIM: that the file is there, that it is the type it says, and that it is
// the size it says. Get one wrong and nothing errors anywhere: the browser drops
// the entry and falls back to the plain prompt, which looks exactly like never
// having added screenshots at all. Nobody notices, because the fallback is the
// thing that was there before.
//
// So this reads the JPEG/PNG bytes and compares the REAL dimensions with the
// declared ones, checks every src exists, and checks both directions — a file
// under public/screenshots that no manifest names is either a leftover or a
// wiring step that was missed, and both have happened here.
//
//   node tools/manifest-shots-check.mjs
//
// Wired into .branch-guard's `also=` list, so it runs on every commit.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(repo, "public");
const bad = [];
const seen = new Set();

/** Real pixel dimensions, read from the file's own bytes. JPEG: walk the
 *  segment chain to a start-of-frame marker (the size is not at a fixed offset,
 *  and an EXIF block sits in front of it). PNG: the IHDR is fixed. */
function dimensions(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return { type: "image/png", w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    // SOF0..SOF15, skipping the four that are not frame headers.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { type: "image/jpeg", h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue; }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

const manifests = readdirSync(pub).filter((f) => f.endsWith(".webmanifest"));
for (const name of manifests) {
  let m;
  try { m = JSON.parse(readFileSync(join(pub, name), "utf8")); }
  catch (e) { bad.push(`${name}: not valid JSON — ${e.message}`); continue; }
  const shots = m.screenshots;
  if (!shots) { console.log(`  --    ${name} declares no screenshots`); continue; }
  if (!Array.isArray(shots) || !shots.length) { bad.push(`${name}: "screenshots" is present but empty`); continue; }

  const forms = new Set();
  for (const s of shots) {
    const rel = String(s.src || "").replace(/^\.\//, "");
    const file = join(pub, rel);
    // Count the shape FIRST. Counting it at the bottom meant a missing FILE
    // also reported "no wide screenshot", which sends the reader after the
    // wrong problem — the entry was there and declared its shape correctly.
    if (s.form_factor) forms.add(s.form_factor);
    if (!rel) { bad.push(`${name}: a screenshot entry has no src`); continue; }
    seen.add(rel);
    if (!existsSync(file)) { bad.push(`${name}: ${rel} is declared and is not there`); continue; }
    const d = dimensions(readFileSync(file));
    if (!d) { bad.push(`${name}: ${rel} is neither a JPEG nor a PNG`); continue; }
    if (s.type && s.type !== d.type) bad.push(`${name}: ${rel} says "${s.type}" and the bytes are ${d.type}`);
    const real = `${d.w}x${d.h}`;
    if (!s.sizes) bad.push(`${name}: ${rel} declares no sizes (it is ${real})`);
    else if (s.sizes !== real) bad.push(`${name}: ${rel} says ${s.sizes} and is ${real}`);
    if (!s.label) bad.push(`${name}: ${rel} has no label — the dialog shows it, and a screen reader reads it`);
  }
  // Both shapes or the dialog picks badly: a wide-only set is letterboxed into
  // a phone prompt, and a narrow-only set is stretched across a desktop one.
  for (const want of ["wide", "narrow"]) {
    if (!forms.has(want)) bad.push(`${name}: no "${want}" screenshot — every manifest with screenshots owes both shapes`);
  }
  if (!bad.length) console.log(`  ok    ${name}: ${shots.length} screenshots, sizes match the bytes`);
}

// The other direction. A file nothing names is a wiring step somebody stopped
// halfway through — which is exactly how this gate came to be written.
const dir = join(pub, "screenshots");
if (existsSync(dir)) {
  for (const f of readdirSync(dir)) {
    if (!seen.has(`screenshots/${f}`)) bad.push(`public/screenshots/${f} is in the repo and no manifest names it`);
  }
}

if (!bad.length) { console.log(`  ok    manifest screenshots: ${seen.size} files, all declared correctly`); process.exit(0); }
console.error(`\n=== manifest screenshots ===\n`);
for (const b of bad) console.error(`  ${b}`);
console.error(`\n  A wrong entry is not an error anywhere: the browser drops it and shows the`);
console.error(`  plain install prompt, which is indistinguishable from having no screenshots.\n`);
process.exit(1);
