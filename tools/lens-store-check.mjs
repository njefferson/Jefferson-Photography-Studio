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
export { matchIn, withheldFor, centreProblem, saveFromPayload, listProfiles } from ${JSON.stringify(join(process.cwd(), "src/lensstore.ts"))};
export { lensHalves } from ${JSON.stringify(join(process.cwd(), "src/hotspot.ts"))};
export { NBINS } from ${JSON.stringify(join(process.cwd(), "src/lensprofile.ts"))};`);
const out = join(dir, "bundle.mjs");
await build({ entryPoints: [entry], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
// A localStorage for node, so the store's two doors can be exercised for real
// rather than read about: the same getItem/setItem the browser gives it.
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); } };
const { bumpFrom, bumpProblem, NBINS, lensHalves, matchIn, withheldFor, centreProblem, saveFromPayload, listProfiles } = await import(pathToFileURL(out).href);

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

{
  // PROVENANCE DECIDES THE COLOUR HALF.
  //
  // A profile measured on a camera-RENDERED frame measured the tone curve as
  // well as the lens. kr/kb are ratios between channels across the field, and a
  // ratio taken after the camera matrix and its tone curve is not the same
  // quantity: measured on sixteen frames, 3.5x the raw answer in red and 2.3x
  // in blue, because the camera's own green row multiplies a camera-space
  // residual by 2.7 (src/lensprofile.ts).
  //
  // This is not hypothetical and it is not the reader's fault. The rig called
  // `sniff(bytes)` without the filename; a NEF and a DNG share a TIFF magic
  // number; every NEF fell through to its embedded JPEG preview. Every profile
  // stored before that was fixed says `rendered` — including the ones measured
  // FROM RAW FILES — while the panel beside it said the raw was better. The
  // shipped table was re-measured from real raw afterwards, and the pre-fix
  // profiles still on a device were overriding it, because "the reader's own
  // supersedes the shipped one" weighed nothing but ownership.
  //
  // Measured on the 22 real profiles against their shipped counterparts: centre
  // blue up to 20.5% apart and always in the same direction, centre red 3.3%,
  // centre brightness close. So COLOUR stands down and BRIGHTNESS does not —
  // red carries the brightness half and the tone curve does not reach it.
  const raws = (o) => ({ ...prof(o), source: "raw" });
  const rend = (o) => ({ ...prof(o), source: "rendered" });
  const mineRendered = rend({ kr: KR_REAL, kb: KR_REAL, bump: BUMP2 });
  const mineRaw = raws({ kr: KR_REAL, kb: KR_REAL, bump: BUMP2 });
  const shippedRaw = raws({ kr: KR_FLAT.map((_, i) => 0.99 + i / 8000), kb: KR_FLAT.map((_, i) => 1.01 - i / 8000), bump: BUMP });
  const shippedRendered = rend({ kr: shippedRaw.kr, kb: shippedRaw.kb, bump: BUMP });

  {
    // THE REPORTED CASE.
    const h = lensHalves(mineRendered, shippedRaw);
    h.colour === shippedRaw
      ? ok("a rendered measurement does not supply colour over a raw shipped profile")
      : fail("a profile measured on a camera rendering is overriding the raw-measured table — this is the washed centre");
    h.bump === mineRendered.bump
      ? ok("...and the reader's brightness curve is still used, which the tone curve does not reach")
      : fail("brightness should still come from the reader's measurement");
  }
  {
    // A reader who measured from RAW is at least as good as the table: whole.
    const h = lensHalves(mineRaw, shippedRaw);
    h.colour === mineRaw && h.bump === mineRaw.bump
      ? ok("a raw measurement supersedes the shipped profile whole")
      : fail("a raw measurement must supply both halves");
  }
  {
    // Nothing to protect: the shipped one is rendered too.
    const h = lensHalves(mineRendered, shippedRendered);
    h.colour === mineRendered
      ? ok("rendered over rendered: the reader's own still wins, there is no better source to hold")
      : fail("a rendered shipped profile is no better than the reader's — it must not displace it");
  }
  {
    // An unknown source is not a claim of raw, and is not a reason to refuse.
    const h = lensHalves({ ...prof({ kr: KR_REAL, kb: KR_REAL }) }, shippedRaw);
    h.colour === shippedRaw
      ? ok("a profile that does not say how it was measured is treated as the weaker one")
      : fail("an unstated source must not outrank a raw measurement");
  }
  {
    const h = lensHalves(null, shippedRaw);
    h.colour === shippedRaw && h.bump === shippedRaw.bump
      ? ok("no stored profile: the shipped one supplies both halves")
      : fail("with nothing stored the shipped profile must supply both");
  }
}

{
  // A MEASUREMENT TAKEN FAR FROM THE FRAME IS NOT A MEASUREMENT OF THE FRAME.
  //
  // With one profile in the store, `matchAny` returned it whatever the frame —
  // `if (by.length === 1) return by[0]` — so a measurement at 50mm f/13 was
  // applied to a 57mm f/8 frame at full strength, while a table with 44 anchors
  // for that lens sat beside it able to interpolate to the frame exactly. The
  // panel said so in its note and applied it anyway.
  //
  // BOTH HALVES STAND DOWN HERE, unlike the provenance rule above, and the
  // shipped table says why: on the 50-250 at 50mm the centre bump is 0.0241 at
  // f/8 and 0.0502 at f/13. Brightness is MORE aperture-dependent than colour,
  // not less — a hot-spot is what stopping down does — so a curve measured a
  // stop and a half away over-corrects the middle about twofold.
  //
  // The reader keeps the benefit of the doubt: their own body and their own copy
  // of the lens are a real advantage, so this only fires when they are reaching
  // more than a stop AND the table is at least half a stop closer.
  const LENS2 = "TEST REACH 50-250mm";
  const mk = (fl, ap, o = {}) => ({
    key: `${fl}@${ap}`, model: LENS2, fl, ap, kr: KR_REAL, kb: KR_REAL,
    bump: curve2(0.05), frames: 2, source: "raw", camera: "BODY", measured: "x", ...o,
  });
  const curve2 = (peak) => Array.from({ length: NBINS }, (_, i) => Math.max(0, peak * (1 - i / 20)));
  // THE FRAME NAMES THE BODY THE PROFILES WERE MEASURED ON. The matcher
  // refuses a profile from any other make and model outright (both halves, as
  // RawTherapee's ffInfo::distance does), so a fixture whose camera string does
  // not match the one `cameraOf` builds matches nothing — which would fail
  // this case for a reason that is not the one under test. Before 2026-10-02
  // the same mismatch blanked only the colour, and it did that on this case's
  // first run too.
  const frame = (fl, ap) => ({ make: "BODY", lens: LENS2, focalLength: [fl, 1], fNumber: [ap, 1] });

  // BOTH SIDES ARE `raw` ON PURPOSE, so this is about reach and nothing else —
  // otherwise the provenance rule above would hold the colour back and the case
  // would pass for a reason it is not testing.
  const store = [mk(50, 13)];
  const table = [mk(50, 8, { key: "s50f8" }), mk(130, 8, { key: "s130f8" })];
  {
    const h = lensHalves(matchIn(store, frame(57, 8)), matchIn(table, frame(57, 8)));
    h.colour && h.colour.key !== "50@13"
      ? ok("a measurement a stop and a half away stands down to the closer table")
      : fail("a 50mm f/13 measurement is being applied to a 57mm f/8 frame — the table brackets it exactly");
    h.brightness && h.brightness.key !== "50@13"
      ? ok("...and its brightness curve stands down too, which is the more aperture-dependent half")
      : fail("the far measurement's brightness curve is still being applied");
  }
  {
    // Close enough: the reader's own body and lens copy win.
    const near = [mk(50, 9)];
    const h = lensHalves(matchIn(near, frame(52, 8)), matchIn(table, frame(52, 8)));
    h.colour && h.colour.key === "50@9"
      ? ok("a measurement within a stop is still the reader's own")
      : fail("a near measurement must not be displaced — the reader's body and lens copy are a real advantage");
  }
  {
    // Nothing closer to fall back to: keep the reader's rather than lose it.
    const far = [mk(50, 22)];
    const h = lensHalves(matchIn(far, frame(57, 8)), null);
    h.colour && h.colour.key === "50@22"
      ? ok("no table to fall back to: the far measurement is still better than nothing")
      : fail("standing down in favour of no correction at all is the worse answer");
  }
}

{
  // THE BODY HAS TO MATCH, AND THEN NEITHER HALF CROSSES (2026-10-02).
  //
  // The matcher keyed on the lens string alone and withheld only the colour,
  // only when both cameras were known and differed; the brightness half was
  // applied to any body, as lens "geometry that transfers". Kolari shows the
  // conversion making or removing the spot on the same lens, and RawTherapee's
  // ffInfo::distance returns INFINITY for another maker, model or lens.
  const LENS3 = "TEST BODY 16-50mm";
  const p3 = (fl, ap, camera) => ({
    key: `${fl}@${ap}`, model: LENS3, fl, ap, kr: KR_REAL, kb: KR_REAL,
    bump: Array.from({ length: NBINS }, (_, i) => Math.max(0, 0.2 * (1 - i / 20))), frames: 3, source: "raw", camera, measured: "x",
  });
  const table = [p3(25, 8, "MAKER BODY ONE")];
  const at = (make, model) => ({ make, model, lens: LENS3, focalLength: [25, 1], fNumber: [8, 1] });
  matchIn(table, at("MAKER", "BODY ONE"))
    ? ok("the body the profile was measured on: matched")
    : fail("a frame from the profile's own body must match");
  const other = matchIn(table, at("MAKER", "BODY TWO"));
  other === null
    ? ok("another body: nothing matched — neither the colour nor the brightness crosses")
    : fail(`another body got a profile (${other.bump ? "WITH its brightness curve" : "colour"}) — the spot depends on the conversion, and RawTherapee refuses it`);
  const unnamed = matchIn(table, { lens: LENS3, focalLength: [25, 1], fNumber: [8, 1] });
  unnamed === null
    ? ok("a frame that names no camera: nothing matched, as RawTherapee's string compare gives")
    : fail("a frame with no make or model cannot be shown to be the profile's body");
  const why = withheldFor(table, at("MAKER", "BODY TWO"));
  why && why.measuredOn === "MAKER BODY ONE" && why.frame === "MAKER BODY TWO"
    ? ok(`the withheld reason names both bodies (${why.measuredOn} / ${why.frame}), for the card`)
    : fail(`withheldFor must name the profile's body and the frame's, got ${JSON.stringify(why)}`);
  withheldFor(table, at("MAKER", "BODY ONE")) === null && withheldFor(table, { lens: "SOME OTHER LENS" }) === null
    ? ok("no withheld reason when it matched, or when the lens has no profile at all")
    : fail("withheldFor must be null for a match and for an unknown lens");
  matchIn(table, at("MAKER", "BODY TWO"), { anyBody: true })
    ? ok("a lens picked by hand crosses bodies, as RawTherapee's manual flat-field choice does")
    : fail("the manual pick must not be refused for the body");
}

{
  // THE TWO APERTURES THAT BRACKET THE FRAME ARE MIXED, IN 1/N (lensfun), AND A
  // STOP WEIGHS WHAT A DOUBLING OF FOCAL LENGTH DOES (RawTherapee).
  const LENS4 = "TEST AP 50-250mm";
  const curve = (peak) => Array.from({ length: NBINS }, (_, i) => Math.max(0, peak * (1 - i / 20)));
  const a = (fl, ap, peak, o = {}) => ({ key: `${fl}@${ap}`, model: LENS4, fl, ap, kr: KR_REAL, kb: KR_REAL, bump: curve(peak), frames: 2, source: "raw", camera: "B", measured: "x", ...o });
  const fr = (fl, ap) => ({ make: "B", lens: LENS4, focalLength: [fl, 1], fNumber: [ap, 1] });
  const m = matchIn([a(50, 8, 0.0241), a(50, 13, 0.0502)], fr(50, 10));
  // 1/N mix: t = (1/8 - 1/10) / (1/8 - 1/13) = 0.52, so 0.0241 + 0.52 * 0.0261.
  const t = (1 / 8 - 1 / 10) / (1 / 8 - 1 / 13);
  const want = 0.0241 + (0.0502 - 0.0241) * t;
  m && m.bump && Math.abs(m.bump[0] - want) < 1e-6 && m.apBlend && Math.abs(m.apBlend.t - t) < 1e-9
    ? ok(`f/10 between an f/8 and an f/13 profile: mixed in 1/N to ${m.bump[0].toFixed(4)} (t ${t.toFixed(3)})`)
    : fail(`f/10 between f/8 and f/13 should mix in 1/N to ${want.toFixed(4)}, got ${m && m.bump ? m.bump[0].toFixed(4) : "nothing"} — the nearer stop alone is what this replaced`);
  m && m.reach === 0
    ? ok("a frame bracketed in aperture and focal length reaches nothing")
    : fail(`a bracketed frame must reach 0, got ${m && m.reach}`);
  const exact = matchIn([a(50, 8, 0.0241), a(50, 13, 0.0502)], fr(50, 8));
  exact && !exact.apBlend && exact.bump && Math.abs(exact.bump[0] - 0.0241) < 1e-9
    ? ok("a frame on a measured aperture takes that profile, unblended")
    : fail("a frame on an anchor aperture must take that anchor whole");
  // A BRACKET WHOSE ENDS ARE FAR IN FOCAL LENGTH IS NOT AN INTERPOLATION OF
  // THIS FRAME (the owner's NIR_1688, 91mm f/5: f/4.5 exists only at 50mm and
  // f/5.3 only at 130mm). The nearest single set stands alone there.
  const far = matchIn([a(50, 4.5, 0.01), a(130, 5.3, 0.02), a(50, 6.3, 0.03), a(130, 6.3, 0.04)], fr(91, 5));
  far && !far.apBlend && far.key === "130@5.3"
    ? ok(`a bracket that reaches further in focal length than the nearest set loses to it (${far.key}, reach ${far.reach.toFixed(2)})`)
    : fail(`91mm f/5 should take the nearest single set, 130@5.3, got ${far && far.key}`);
  // RawTherapee's weighting: two stops away in aperture (f/16 against f/8)
  // must cost what two doublings of focal length (200mm against 50mm) do, so
  // the two candidates below tie at 2, where |ln| on both axes made a stop
  // half of a doubling.
  const r1 = matchIn([a(50, 16, 0.03)], fr(50, 8)).reach;
  const r2 = matchIn([a(200, 8, 0.03)], fr(50, 8)).reach;
  Math.abs(r1 - 2) < 1e-9 && Math.abs(r2 - 2) < 1e-9
    ? ok(`two stops and two focal doublings both reach 2 (${r1.toFixed(3)}, ${r2.toFixed(3)}), RawTherapee's units`)
    : fail(`two stops and two focal doublings must both reach 2, got ${r1} and ${r2}`);
}

{
  // THE HOT SPOT'S CENTRE: stored when the rig found one, refused when it is
  // not one, absent on every older profile — and absent is the middle.
  const LENS5 = "TEST CENTRE 16-50mm";
  const pay = (centre) => ({
    camera: "C", measured: "x", lens_map: { L5: LENS5 },
    profiles: { "L5@25@f8.0": { kr: KR_REAL, kb: KR_REAL, frames: 3, source: "raw", ...(centre === undefined ? {} : { centre }) } },
  });
  mem.clear();
  saveFromPayload(pay([0.04, -0.02]));
  const kept = listProfiles()[0];
  kept && kept.centre && kept.centre[0] === 0.04 && kept.centre[1] === -0.02
    ? ok("a measured centre is stored at the save door and comes back at the read door")
    : fail(`the centre did not survive the store: ${JSON.stringify(kept && kept.centre)}`);
  mem.clear();
  saveFromPayload(pay([0.6, 0]));
  const far = listProfiles()[0];
  far && far.centre === undefined && far.kr
    ? ok("a centre no lens has is not stored — and the profile still is, about the middle")
    : fail("an impossible centre must be dropped, not stored and not take the profile with it");
  mem.clear();
  saveFromPayload(pay(undefined));
  const old = listProfiles()[0];
  old && old.centre === undefined
    ? ok("a payload with no centre (every rig before this one) stores none — the geometric centre")
    : fail("a profile with no centre must not grow one");
  // The READ door: a stored row carrying a corrupt centre loses the centre.
  mem.set("ips-lens-profiles-v1", JSON.stringify([{ ...old, centre: ["x", 1] }]));
  const back = listProfiles()[0];
  back && back.centre === undefined && back.kr
    ? ok("a corrupt stored centre is set aside on read, the profile kept")
    : fail("read() must drop a bad centre and keep the profile");
  for (const [c, good] of [[undefined, true], [[0, 0], true], [[0.25, 0], true], [[0.26, 0], false], [[NaN, 0], false], [[0.1], false]]) {
    (centreProblem(c) === null) === good
      ? ok(`centreProblem(${JSON.stringify(c)}) ${good ? "accepts" : "refuses"}`)
      : fail(`centreProblem(${JSON.stringify(c)}) should ${good ? "accept" : "refuse"}: ${centreProblem(c)}`);
  }
  // Blended across anchors, a missing end is the middle.
  const fl = (f, c) => ({ key: `${f}`, model: LENS5, fl: f, ap: 8, kr: KR_REAL, kb: KR_REAL, frames: 1, source: "raw", camera: "C", ...(c ? { centre: c } : {}) });
  const mid = matchIn([fl(17, [0.1, 0]), fl(25, undefined)], { make: "C", lens: LENS5, focalLength: [Math.sqrt(17 * 25), 1], fNumber: [8, 1] });
  mid && mid.centre && Math.abs(mid.centre[0] - 0.05) < 1e-9
    ? ok(`a centre blends across focal lengths with a missing end read as the middle (${mid.centre[0].toFixed(3)})`)
    : fail(`a blended centre should be halfway to the middle, got ${JSON.stringify(mid && mid.centre)}`);
  mem.clear();
}

{
  // FOCUS DISTANCE, WHEN THE FILE RECORDS ONE (lensfun weighs it in reciprocal
  // distance). Two profiles of one lens and focal length, the aperture not
  // recorded on the frame so both cost the same there: the one measured at the
  // frame's distance must win, either way round, and with no distance on the
  // frame the term must change nothing.
  const LENS6 = "TEST DIST 16-50mm";
  const d = (ap, dist, peak) => ({ key: `25@${ap}`, model: LENS6, fl: 25, ap, kr: KR_REAL, kb: KR_REAL, bump: Array.from({ length: NBINS }, (_, i) => Math.max(0, peak * (1 - i / 20))), frames: 2, source: "raw", camera: "D", measured: "x", dist });
  const list = [d(8, 0.5, 0.02), d(11, 20, 0.04)];
  const at = (dist) => ({ make: "D", lens: LENS6, focalLength: [25, 1], ...(dist ? { subjectDistance: dist } : {}) });
  const near = matchIn(list, at(0.5)), far = matchIn(list, at(20)), none = matchIn(list, at(undefined));
  near && near.key === "25@8" && far && far.key === "25@11"
    ? ok(`the profile measured at the frame's focus distance wins (0.5 m -> ${near.key}, 20 m -> ${far.key})`)
    : fail(`focus distance must pick the profile measured nearest it, got ${near && near.key} at 0.5 m and ${far && far.key} at 20 m`);
  none && none.key === "25@8"
    ? ok("no distance on the frame: the term is absent and the first profile stands, as before")
    : fail(`a frame with no distance must match as it did, got ${none && none.key}`);
}

console.log(bad ? `\n${bad} failed\n` : "\nthe save door and the read door agree, and every render path takes the same halves\n");
process.exit(bad ? 1 : 0);
