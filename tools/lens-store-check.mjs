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
export { matchIn } from ${JSON.stringify(join(process.cwd(), "src/lensstore.ts"))};
export { lensHalves } from ${JSON.stringify(join(process.cwd(), "src/hotspot.ts"))};
export { NBINS } from ${JSON.stringify(join(process.cwd(), "src/lensprofile.ts"))};`);
const out = join(dir, "bundle.mjs");
await build({ entryPoints: [entry], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { bumpFrom, bumpProblem, NBINS, lensHalves, matchIn } = await import(pathToFileURL(out).href);

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

{
  // A FOCAL LENGTH BETWEEN TWO ANCHORS, ONE OF WHICH MEASURED NO HOT-SPOT.
  //
  // The shipped table stores NOTHING for a setting where the rig found no
  // hot-spot — `bumpFrom` returns undefined at a range of zero, and the
  // generator's own note says a lens with no hot-spot applies no brightness
  // correction rather than a flat zero curve. So a missing bump in that table
  // is a measured ZERO, not an unknown, and the aperture ordering across all 44
  // profiles of the 50-250mm says the same thing: the curve appears as the lens
  // stops down and is absent wide open, which is how hot-spots behave.
  //
  // The blend refused to interpolate unless BOTH ends carried a curve, for fear
  // of halving the correction. Refusing removes ALL of it. A frame at 57mm f/8
  // sits 14% of the way from a 50mm anchor with a real hot-spot to a 130mm
  // anchor with none, and got no correction at all.
  const LENS = "TEST 50-250mm";
  const curve = (peak) => Array.from({ length: NBINS }, (_, i) => Math.max(0, peak * (1 - i / 20)));
  const anchor = (fl, ap, peak) => ({
    key: `${fl}@${ap}`, model: LENS, fl, ap, kr: KR_REAL, kb: KR_REAL,
    ...(peak === null ? {} : { bump: curve(peak) }), frames: 1, source: "raw",
  });
  const ex = (fl, ap) => ({ lens: LENS, focalLength: [fl, 1], fNumber: [ap, 1] });
  const peakOf = (p) => (p && p.bump ? p.bump[0] : null);

  const hot50 = anchor(50, 8, 0.0241), cold130 = anchor(130, 8, null);
  const m = matchIn([hot50, cold130], ex(57, 8));
  const got = peakOf(m);
  // 57mm is log(57/50)/log(130/50) = 0.137 of the way, so 0.0241 -> ~0.0208.
  got !== null && Math.abs(got - 0.0208) < 0.0006
    ? ok(`57mm between a 50mm hot-spot and a 130mm with none: blended to ${got.toFixed(4)}`)
    : fail(`57mm between a 50mm hot-spot and a 130mm with none: got ${got === null ? "NO CURVE — the whole correction dropped" : got.toFixed(4)}, expected ~0.0208`);

  // The far end of the same bracket must go the other way: near the anchor that
  // measured nothing, there must be almost nothing left.
  const far = peakOf(matchIn([hot50, cold130], ex(125, 8)));
  far !== null && far < 0.0241 * 0.1
    ? ok(`125mm, next to the anchor with no hot-spot: blended down to ${far.toFixed(4)}`)
    : fail(`125mm should blend almost to nothing, got ${far === null ? "NO CURVE" : far.toFixed(4)}`);

  // Symmetric: the curve on the FAR anchor rather than the near one.
  const rev = peakOf(matchIn([anchor(50, 8, null), anchor(130, 8, 0.05)], ex(57, 8)));
  rev !== null && rev > 0 && rev < 0.05 * 0.3
    ? ok(`a hot-spot on the long anchor only, blended up from zero: ${rev.toFixed(4)}`)
    : fail(`a curve on the long anchor only should blend up from zero, got ${rev === null ? "NO CURVE" : rev.toFixed(4)}`);

  // Both ends measured no hot-spot: there is nothing to apply, and inventing a
  // flat zero curve would make the report claim a correction that does nothing.
  peakOf(matchIn([anchor(50, 8, null), anchor(130, 8, null)], ex(57, 8))) === null
    ? ok("neither anchor measured a hot-spot: no brightness curve at all")
    : fail("two anchors with no hot-spot must not produce a curve");

  // Unchanged behaviour where both ends carry one.
  const both = peakOf(matchIn([anchor(50, 8, 0.02), anchor(130, 8, 0.06)], ex(57, 8)));
  both !== null && both > 0.02 && both < 0.06
    ? ok(`both anchors carry a hot-spot: blended between them (${both.toFixed(4)})`)
    : fail(`both anchors carrying a curve must still blend, got ${both === null ? "NO CURVE" : both.toFixed(4)}`);
}

console.log(bad ? `\n${bad} failed\n` : "\nthe save door and the read door agree, and every render path takes the same halves\n");
process.exit(bad ? 1 : 0);
