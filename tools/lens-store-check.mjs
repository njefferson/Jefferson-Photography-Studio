#!/usr/bin/env node
// THE TWO DOORS OF THE LENS PROFILE STORE MUST AGREE.
//
// A stored profile's brightness curve is DERIVED on save by `bumpFrom` and
// JUDGED on read by `bumpProblem`. Nothing held those two to each other, and
// they disagreed: `bumpFrom` accepts any falloff of two bands or more and
// returns a curve of THAT length, while the reader refuses anything that is not
// exactly NBINS. A payload whose falloff was not 80 bands long — an older rig,
// which the same function deliberately tolerates elsewhere — saved cleanly and
// was then refused on every read.
//
// It was refused WHOLESALE, taking the colour curves with it. Colour is the
// half lensstore's own header calls well determined and applied; bump is the
// half it calls a range rather than a correction. So a fault in the part that
// is not applied by default destroyed the part that is, silently, and a
// measured lens simply stopped working with nothing said.
//
// This runs on every commit and needs no browser: both functions are pure.
// Bundled with esbuild rather than imported directly: the source uses
// extensionless imports that Node will not resolve, and bundling also means
// this checks the REAL functions the app ships rather than a copy of them.
import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "lensstore-"));
const entry = join(dir, "entry.ts");
writeFileSync(entry, `export { bumpFrom, bumpProblem } from ${JSON.stringify(join(process.cwd(), "src/lensstore.ts"))};
export { NBINS } from ${JSON.stringify(join(process.cwd(), "src/lensprofile.ts"))};`);
const out = join(dir, "bundle.mjs");
await build({ entryPoints: [entry], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { bumpFrom, bumpProblem, NBINS } = await import(pathToFileURL(out).href);

let bad = 0;
const fail = (s) => { bad++; console.log(`FAIL  ${s}`); };
const ok = (s) => console.log(`ok    ${s}`);

// Whatever bumpFrom hands back, the reader must accept — at every falloff
// length a payload could plausibly carry, not just the current one.
for (const n of [2, 16, 32, 48, 64, NBINS, 96, 128]) {
  const falloff = Array.from({ length: n }, (_, i) => 1 + 0.3 * (1 - i / n));
  const got = bumpFrom(falloff, [0.12, 0.2]);
  if (got === undefined) { ok(`falloff of ${n}: no curve derived, nothing to disagree about`); continue; }
  const why = bumpProblem(got, NBINS);
  if (why) fail(`falloff of ${n}: bumpFrom returned a curve the reader refuses — ${why}`);
  else ok(`falloff of ${n}: derived curve is one the reader accepts (${got.length} bands)`);
}

// And the shapes that must simply not produce a curve.
for (const [label, falloff, range] of [
  ["no falloff", undefined, [0.12, 0.2]],
  ["one band", [1.2], [0.12, 0.2]],
  ["no range", [1.2, 1.1], undefined],
  ["zero range", [1.2, 1.1], [0, 0]],
  ["flat falloff", [1, 1, 1], [0.12, 0.2]],
]) {
  const got = bumpFrom(falloff, range);
  if (got !== undefined) fail(`${label}: derived a curve where there is nothing to derive one from`);
  else ok(`${label}: no curve, as it should be`);
}

console.log(bad ? `\n${bad} check(s) failed` : "\nthe save door and the read door agree");
process.exit(bad ? 1 : 0);
