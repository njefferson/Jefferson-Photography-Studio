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
export { lensHalves } from ${JSON.stringify(join(process.cwd(), "src/hotspot.ts"))};
export { NBINS } from ${JSON.stringify(join(process.cwd(), "src/lensprofile.ts"))};`);
const out = join(dir, "bundle.mjs");
await build({ entryPoints: [entry], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { bumpFrom, bumpProblem, NBINS, lensHalves } = await import(pathToFileURL(out).href);

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


// ---------------------------------------------------------------------------
// WHICH PROFILE SUPPLIES WHICH HALF, AND EVERY RENDER PATH AGREEING ON IT.
//
// The reader's measurement and the shipped table are two profiles for the same
// frame, and the rule for combining them was written out three times in three
// functions. Two of them said "the reader's colour, the shipped brightness";
// the third said "the reader's profile whole". A reader whose measurement had
// no brightness curve — the ordinary case, because a measured `bump` comes back
// as a RANGE rather than a correction — got a corrected hot-spot in the strip of
// thumbnails and an uncorrected one in the photograph above it. The app's own
// diagnostic printed both answers, one line apart, and disagreed with itself.
//
// `lensHalves` is the one rule now. These cases are its contract.
const KR_FLAT = Array.from({ length: NBINS }, () => 1);
const KR_REAL = Array.from({ length: NBINS }, (_, i) => 0.95 + (i / NBINS) * 0.1);
const BUMP = Array.from({ length: NBINS }, (_, i) => Math.max(0, 0.3 * (1 - i / 20)));
const BUMP2 = Array.from({ length: NBINS }, (_, i) => Math.max(0, 0.1 * (1 - i / 20)));
const prof = (o) => ({ key: "k", model: "m", fl: 50, ap: 8, kr: KR_FLAT, kb: KR_FLAT, ...o });

const mineNoBump = prof({ kr: KR_REAL, kb: KR_REAL });
const mineWithBump = prof({ kr: KR_REAL, kb: KR_REAL, bump: BUMP2 });
const shippedBoth = prof({ kr: KR_REAL, kb: KR_REAL, bump: BUMP });
const shippedBumpOnly = prof({ bump: BUMP });

{
  // THE REPORTED DEFECT. A measurement with colour and no brightness curve must
  // not take the shipped brightness correction away — that is the hot-spot.
  const h = lensHalves(mineNoBump, shippedBoth);
  h.colour === mineNoBump
    ? ok("measurement with no brightness curve: colour is the reader's")
    : fail("measurement with no brightness curve: colour should be the reader's");
  h.bump === shippedBoth.bump
    ? ok("measurement with no brightness curve: brightness falls back to the shipped profile")
    : fail(`measurement with no brightness curve: brightness was ${h.bump ? "some other curve" : "DROPPED"} — this is the hot-spot going missing on the open photograph`);
}
{
  // ONE PROFILE, WHOLE. A measurement that HAS a brightness curve supersedes the
  // shipped one in full — never half of each, which is two ideas of the centre.
  const h = lensHalves(mineWithBump, shippedBoth);
  h.colour === mineWithBump && h.bump === mineWithBump.bump
    ? ok("measurement with a brightness curve supersedes the shipped profile whole")
    : fail("measurement with a brightness curve must supply BOTH halves");
}
{
  // No measurement at all: the shipped profile supplies both.
  const h = lensHalves(null, shippedBoth);
  h.colour === shippedBoth && h.bump === shippedBoth.bump
    ? ok("no measurement: the shipped profile supplies both halves")
    : fail("no measurement: the shipped profile must supply both halves");
}
{
  // A shipped profile with a flat colour curve knows no colour, and saying it
  // corrects colour would be a claim the reader cannot check.
  const h = lensHalves(null, shippedBumpOnly);
  h.colour === null && h.bump === shippedBumpOnly.bump
    ? ok("shipped profile with flat colour: brightness only, colour withheld")
    : fail("a flat colour curve must be withheld, not applied as a correction");
}
{
  const h = lensHalves(null, null);
  h.colour === null && h.bump === null
    ? ok("nothing matched: no correction at all")
    : fail("nothing matched should yield no correction");
}
{
  // THE HALVES MUST BE THE SAME LENGTH OR THE PIPELINE DROPS THE BRIGHTNESS
  // SILENTLY (`lengthsAgree` in compileEdit). A fallback across two profiles is
  // exactly where a length mismatch would arrive, so it is asserted here rather
  // than discovered as a second silent absence.
  const h = lensHalves(mineNoBump, shippedBoth);
  const cn = h.colour ? h.colour.kr.length : 0;
  const bn = h.bump ? h.bump.length : 0;
  !cn || !bn || cn === bn
    ? ok(`fallback halves agree in length (${cn} colour, ${bn} brightness)`)
    : fail(`fallback halves are ${cn} and ${bn} bands — compileEdit drops the brightness half without a word`);
}

{
  // THE REPORT MUST NAME THE PROFILE THE RENDER USED. The diagnostic worked the
  // brightness source out for itself and named the shipped profile while the
  // render used the reader's — two lines of one report, disagreeing, both
  // printed as facts. `brightness` and `bump` come out of one call now, so a
  // report that names a source is naming the curve that landed.
  const a = lensHalves(mineWithBump, shippedBoth);
  const b = lensHalves(mineNoBump, shippedBoth);
  const c = lensHalves(null, null);
  a.brightness === mineWithBump && a.bump === a.brightness.bump
    ? ok("the named brightness source is the reader's when the reader measured one")
    : fail("named brightness source disagrees with the curve that lands");
  b.brightness === shippedBoth && b.bump === b.brightness.bump
    ? ok("the named brightness source is the shipped profile when it is the fallback")
    : fail("named brightness source disagrees with the curve that lands on the fallback");
  c.brightness === null && c.bump === null
    ? ok("no brightness curve names no source")
    : fail("a report must not name a source for a curve that is not there");
}

console.log(bad ? `\n${bad} failed\n` : "\nthe save door and the read door agree, and every render path takes the same halves\n");
process.exit(bad ? 1 : 0);
