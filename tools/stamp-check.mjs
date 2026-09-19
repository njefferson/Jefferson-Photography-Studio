#!/usr/bin/env node
// EVERY CREATIVE FIELD A LOOK WRITES IS IN THE TILE'S STAMP.
//
// `stampOf` in src/main.ts is described as "the part of the live creative state
// a thumbnail renders with". It is not a description — it is load-bearing in two
// places at once. `restripForGrade` compares stamps to decide which tiles are
// showing a picture the app would no longer make, and `previewKey` hashes the
// same string into the key a rendered preview is STORED under, on the device,
// across releases. A field a look writes and the stamp omits is therefore two
// defects, not one: the strip never redraws, and a warm cache hands back a tile
// rendered by a build that no longer exists.
//
// WHAT IT COST, measured 2026-09-19. Decision 019's amounts moved — the look's
// foliage from 2.0 to 1.6 and its sky saturation from 1.0 to 1.8 — and
// `gradeStamp()` returned exactly the same string as before, because neither
// `foliage` nor `skySat` was in the list. Eleven fields were missing in all:
// sky, foliage, tone, texture, skySmooth, skyDepth, skySat, grainAmt,
// grainSize, vigAmt, vigMid. PREVIEW_PIPELINE could not cover it either —
// tools/preview-version-check.mjs hashes main.ts through two named functions
// only, on purpose, because hashing the whole file would demand a version bump
// on every commit. So nothing in the repo could see a look's numbers change.
//
// It reads the two lists out of the source rather than being told them: what
// `applyLook` assigns to `params.*`, and what `stampOf` puts in its array. A
// field in the first and not the second fails, unless it is declared below as a
// deliberate exclusion with a reason.
//
// BOTH DIRECTIONS. A name in the exclusion list that `applyLook` no longer
// writes fails too, so a rename cannot silently carry its own excuse forward.
//
//   node tools/stamp-check.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");

/** THE FIELDS A LOOK WRITES THAT THE STAMP LEAVES OUT ON PURPOSE, each with the
 *  reason it is not part of "what picture is this tile showing".
 *
 *  A per-shot field belongs to the PHOTOGRAPH, not to the grade: `makeThumb`
 *  replaces every one of them with that photo's own answer before it renders,
 *  so the live value cannot make one tile differ from another's stored picture
 *  and stamping it would invalidate the whole strip whenever the open photo
 *  changed. That is the only kind of exclusion this list accepts. */
const EXCLUDED = {
  wb: "per-shot — makeThumb replaces it with the photo's own balance",
  exposure: "per-shot — makeThumb replaces it with the photo's own exposure",
  denoise: "per-shot and measured from the frame; makeThumb renders at 0",
};

const src = readFileSync(join(repo, "src/main.ts"), "utf8");

/** The body of a named top-level function, by brace matching from its opening
 *  `{`. Returns the text between the braces. Throws if the name is not there,
 *  because a gate that silently reads an empty string passes everything. */
function bodyOf(name) {
  const at = src.indexOf(`function ${name}(`);
  if (at < 0) throw new Error(`stamp gate: ${name} is not in src/main.ts — has it been renamed?`);
  let i = src.indexOf("{", at);
  if (i < 0) throw new Error(`stamp gate: no body for ${name}`);
  let depth = 0, start = i;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return src.slice(start + 1, i); }
  }
  throw new Error(`stamp gate: unbalanced braces in ${name}`);
}

const applyLook = bodyOf("applyLook");
const stampOf = bodyOf("stampOf");

// What applyLook assigns to the live params object.
const written = new Set();
for (const m of applyLook.matchAll(/\bparams\.([A-Za-z_]\w*)\s*(?:=[^=]|\+=|-=|\*=)/g)) written.add(m[1]);

// What stampOf puts in its array — `pr.x` anywhere in the body, since every
// reference there is a field being stamped.
const stamped = new Set();
for (const m of stampOf.matchAll(/\bpr\.([A-Za-z_]\w*)/g)) stamped.add(m[1]);

const problems = [];
const missing = [...written].filter((f) => !stamped.has(f) && !(f in EXCLUDED)).sort();
for (const f of missing) {
  problems.push(`  params.${f} is written by applyLook and is NOT in stampOf.
      A tile rendered under one value of it stamps the same as one rendered
      under another, so restripForGrade cannot see the change and a cached
      preview outlives it. Add pr.${f} to stampOf, bump PREVIEW_PIPELINE in
      src/previewcache.ts, or declare it in this gate's EXCLUDED with the
      reason it belongs to the photograph rather than the grade.`);
}
const stale = Object.keys(EXCLUDED).filter((f) => !written.has(f)).sort();
for (const f of stale) {
  problems.push(`  params.${f} is declared EXCLUDED here and applyLook no longer writes it.
      Remove it, so the next field with that name does not inherit its excuse.`);
}

const ok = [...written].filter((f) => stamped.has(f)).sort();
console.log(`\nstamp gate: applyLook writes ${written.size} fields; stampOf carries ${ok.length}, ${Object.keys(EXCLUDED).length} are declared per-shot.`);
console.log(`  stamped    ${ok.join(" ")}`);
for (const [f, why] of Object.entries(EXCLUDED)) console.log(`  per-shot   params.${f} — ${why}`);

if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"}:\n`);
  for (const p of problems) console.error(p + "\n");
  process.exit(1);
}
console.log("\n  every creative field a look writes is in the tile's stamp.\n");
