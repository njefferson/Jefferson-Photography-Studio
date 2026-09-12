#!/usr/bin/env node
// A CACHE KEYED ON A NUMBER NOBODY REMEMBERS TO BUMP SERVES THE WRONG PICTURE
// FOR EVER.
//
// Quick-look previews are kept on the device and come back instead of being
// rendered again (src/previewcache.ts). Everything that SHOULD make a kept
// picture wrong is in its key — the file's own identity, the reader's lens
// profiles, the preview size — except one: the app's own rendering. There is no
// way to derive that from data, so it is declared, as PREVIEW_PIPELINE.
//
// This is the gate that holds the declaration to the code. It hashes the
// sources a preview is actually made of and refuses a commit that changes any
// of them without moving the number. Not a reminder in a comment: the comment
// was written first and this exists because a comment cannot refuse anything.
//
//   node tools/preview-version-check.mjs            check (exit 1 on drift)
//   node tools/preview-version-check.mjs --record   accept the current sources,
//                                                   which requires the number
//                                                   to have moved first
//
// Wired into .branch-guard's `also=` list, so it runs on every commit.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const RECORD = join(repo, "tools", ".preview-pipeline");

/** WHAT A PREVIEW IS MADE OF. Whole files where the whole file matters, and one
 *  named function where it does not: main.ts changes every day for reasons that
 *  have nothing to do with a rendered picture, so hashing all of it would demand
 *  a version bump on every commit and teach everyone to bump it without
 *  thinking, which is the same as not having a gate. */
const WHOLE = [
  "src/previewcache.ts",   // the key and the store
  "src/decode.ts",         // what a file decodes to
  "src/pipeline.ts",       // the edit applied to it
  "src/lensstore.ts",      // which correction matches a photograph
  "src/hotspotProfiles.ts",// and the profiles that ship with the app
];
const DIRS = ["src/raw"];  // the raw decoders, every file
const REGIONS = [
  ["src/main.ts", "async function makeThumb("],   // the picture itself
  ["src/main.ts", "function lensCurveFor("],      // which correction it is rendered through
];

/** The function that starts at `marker`, to its matching closing brace. */
function region(text, marker) {
  const at = text.indexOf(marker);
  if (at < 0) return null;
  const open = text.indexOf("{", at);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (!depth) return text.slice(at, i + 1);
    }
  }
  return null;
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const h = createHash("sha256");
const covered = [];
for (const rel of WHOLE) {
  const p = join(repo, rel);
  if (!existsSync(p)) {
    console.error(`\n  preview pipeline: ${rel} is named in this gate and is not in the repo.`);
    console.error("  A file that quietly stops being hashed is the failure this gate is about.\n");
    process.exit(1);
  }
  h.update(rel).update(readFileSync(p));
  covered.push(rel);
}
for (const dir of DIRS) {
  for (const p of walk(join(repo, dir))) {
    const rel = p.slice(repo.length + 1);
    h.update(rel).update(readFileSync(p));
    covered.push(rel);
  }
}
for (const [rel, marker] of REGIONS) {
  const text = readFileSync(join(repo, rel), "utf8");
  const body = region(text, marker);
  if (!body) {
    console.error(`\n  preview pipeline: could not find \`${marker}\` in ${rel}.`);
    console.error("  It was renamed or moved. Point this gate at it rather than dropping it.\n");
    process.exit(1);
  }
  h.update(rel + "#" + marker).update(body);
  covered.push(`${rel} · ${marker.replace(/[(]$/, "")}`);
}
const hash = h.digest("hex").slice(0, 16);

const src = readFileSync(join(repo, "src/previewcache.ts"), "utf8");
const m = /export const PREVIEW_PIPELINE\s*=\s*(\d+)/.exec(src);
if (!m) {
  console.error("\n  preview pipeline: src/previewcache.ts declares no PREVIEW_PIPELINE.\n");
  process.exit(1);
}
const version = Number(m[1]);

let was = { version: 0, hash: "" };
if (existsSync(RECORD)) {
  for (const line of readFileSync(RECORD, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) was[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  was.version = Number(was.version);
}

const record = () => {
  writeFileSync(RECORD, `# Written by tools/preview-version-check.mjs --record. Not hand-edited.\nversion=${version}\nhash=${hash}\n`);
  console.log(`\n  preview pipeline: recorded version ${version} at ${hash}\n`);
};

if (process.argv.includes("--record")) {
  if (hash === was.hash) { console.log(`\n  preview pipeline: already recorded (version ${version}, ${hash})\n`); process.exit(0); }
  if (!(version > was.version)) {
    console.error(`\n  preview pipeline: the sources changed but PREVIEW_PIPELINE is still ${version}.`);
    console.error("  Move it first — recording without moving it is the same as not having a gate.\n");
    process.exit(1);
  }
  record();
  process.exit(0);
}

if (hash === was.hash) {
  console.log(`  ok    preview pipeline unchanged (version ${version}, ${hash}, ${covered.length} sources)`);
  process.exit(0);
}

console.error(`\n=== preview pipeline · ${covered.length} sources ===\n`);
console.error(`  The code a quick-look preview is made of has CHANGED: ${was.hash || "(nothing recorded)"} -> ${hash}`);
console.error(`  PREVIEW_PIPELINE is ${version}${was.version ? `, recorded at ${was.version}` : ""}.\n`);
console.error("  Previews are kept on the device and come back without being rendered again.");
console.error("  A change here means the picture that comes back is not the picture this build");
console.error("  would make, and nothing else in the key can see that.\n");
console.error("  So: raise PREVIEW_PIPELINE in src/previewcache.ts, then\n");
console.error("      node tools/preview-version-check.mjs --record\n");
console.error("  and commit the record beside the change.\n");
process.exit(1);
