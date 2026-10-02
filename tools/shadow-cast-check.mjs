#!/usr/bin/env node
// THE SHADOW MEASUREMENT RETURNS UNITY ON A FRAME THAT HAS NOTHING TO CORRECT.
//
//   node tools/shadow-cast-check.mjs
//
// WHY IT EXISTS (decision 034, IR-SCIENCE 9j). The obvious fix for the red cast
// in an infrared shadow — find the hue, add 180 degrees, put the complement in
// the shadows — was built and measured here. It works beautifully on the oak
// (NIR_1376) and drives 858,273 grey pixels from saturation 0.005 to 0.989 on
// the carport (NIR_3406), whose shadows are a roof rather than a tree. It is
// not shipped at any amount.
//
// SO THE CHECK THIS FEATURE TURNS ON IS NOT "does the shaded wall go neutral".
// It is the carport: a photograph whose shadows are already neutral must come
// back at UNITY and change nothing. That is the per-photograph half of the
// record's chosen option doing the work, and it is the half a constant cannot
// have.
//
// IT IS A PURE FUNCTION, SO IT IS TESTED WITHOUT A BROWSER, over synthetic
// populations with known answers. The appearance half — whether the shaded wall
// actually reads neutral — is a rendered frame that gets opened, and the real
// corpus is not in this repository (IR-SCIENCE section 7: the 44 practice DNGs
// are minimal hand-written files and cannot answer a colour question).
import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "shadowcast-"));
const entry = join(dir, "entry.ts");
writeFileSync(entry, `export { measureShadowCast, suggestedAmount } from ${JSON.stringify(join(process.cwd(), "src/shadowcast.ts"))};`);
const out = join(dir, "bundle.mjs");
await build({ entryPoints: [entry], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { measureShadowCast, suggestedAmount } = await import(pathToFileURL(out).href);

let bad = 0;
const fail = (s) => { bad++; console.log(`FAIL  ${s}`); };
const ok = (s) => console.log(`ok    ${s}`);

/** A synthetic frame: a dark half and a bright half, each a flat colour, with
 *  an optional sky band across the top. Sizes are chosen so each population
 *  clears the measurement's own floor — a smaller frame is refused, which is
 *  itself one of the cases below. */
function frame({ shade, sun, w = 400, h = 400, skyRows = 0, skyColour = [0.02, 0.05, 0.12] }) {
  const at = (x, y) => {
    if (y < skyRows) return skyColour;
    return y < (h + skyRows) / 2 ? shade : sun;
  };
  const isSky = (_x, y) => y < skyRows;
  return { at, w, h, isSky };
}
const run = (f) => measureShadowCast(f.at, f.w, f.h, f.isSky);
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ── 1 · THE CARPORT CASE. Neutral shade under a roof, neutral sun. ──────────
// The two populations differ in BRIGHTNESS and not in colour, which is the
// whole of what a shadow is when no foliage fills it.
{
  const c = run(frame({ shade: [0.04, 0.04, 0.04], sun: [0.60, 0.60, 0.60] }));
  const flat = Math.max(...c.gain.map((v) => Math.abs(v - 1)));
  if (!c.measured) fail(`neutral shade and neutral sun: not measured at all (${c.shadePx}/${c.sunPx} px)`);
  else if (flat > 0.002) fail(`neutral shade must come back at unity — gain ${c.gain.map((v) => v.toFixed(4)).join(", ")}`);
  else ok(`a frame whose shadows are neutral returns unity (spread ${c.spread.toFixed(5)})`);
  if (suggestedAmount(c) !== 0) fail(`and it must suggest nothing — suggested ${suggestedAmount(c)}`);
  else ok("...and suggests no correction at all");
}

// ── 2 · A DARKER NEUTRAL SHADE IS STILL NEUTRAL. ───────────────────────────
// Exposure is not the defect. If the measurement compared colour rather than
// CHROMATICITY, this frame's far darker shade would read as a cast.
{
  const c = run(frame({ shade: [0.005, 0.005, 0.005], sun: [0.95, 0.95, 0.95] }));
  const flat = Math.max(...c.gain.map((v) => Math.abs(v - 1)));
  if (flat > 0.002) fail(`a much darker neutral shade still must not read as a cast — gain ${c.gain.join(", ")}`);
  else ok("a shade two hundred times darker than the sun still reads as no cast");
}

// ── 3 · THE OAK CASE. A shade carrying a known warm cast is recovered. ─────
{
  const CAST = [1.18, 1.0, 0.92]; // what the bounce did to the shaded face
  // THE SUNLIT FACE IS NEUTRAL HERE ON PURPOSE. The gain carries shade onto
  // SUN, not shade onto grey, so with a tinted sun "undo the cast" is not the
  // right expectation at all — the first version of this check used a greenish
  // sun and read the code's correct answer as a failure. Keeping the sun
  // neutral makes the two the same thing, and the tinted case is asserted on
  // its own terms below.
  const sun = [0.60, 0.60, 0.60];
  const shade = [0.05 * CAST[0], 0.05 * CAST[1], 0.05 * CAST[2]];
  const c = run(frame({ shade, sun }));
  // The gain that undoes it is the reciprocal, normalised to unit luma — the
  // same normalisation the measurement applies, so the expectation is derived
  // rather than typed.
  const inv = [1 / CAST[0], 1 / CAST[1], 1 / CAST[2]];
  const gl = inv[0] * 0.2126 + inv[1] * 0.7152 + inv[2] * 0.0722;
  const want = inv.map((v) => v / gl);
  const off = Math.max(...c.gain.map((v, i) => Math.abs(v - want[i])));
  if (off > 0.01) fail(`a known cast must be recovered — got ${c.gain.map((v) => v.toFixed(3)).join(", ")}, wanted ${want.map((v) => v.toFixed(3)).join(", ")}`);
  else ok(`a known shadow cast is recovered to within ${off.toFixed(4)}`);
  if (!(suggestedAmount(c) > 0)) fail("and a real cast must suggest a real amount");
  else ok(`...and suggests ${suggestedAmount(c).toFixed(2)} of it`);
}

// ── 3b · AND WITH A TINTED SUN IT CARRIES SHADE ONTO SUN, not onto grey. ──
// The definition matters: the measurement asks how far the shaded population
// sits from the SUNLIT one, so on a frame lit by a green-ish sun a neutral
// shade is itself a cast — in the other direction.
{
  const sun = [0.55, 0.60, 0.50];
  const c = run(frame({ shade: [0.05, 0.05, 0.05], sun }));
  const sl = sun[0] * 0.2126 + sun[1] * 0.7152 + sun[2] * 0.0722;
  const want = sun.map((v) => v / sl); // shade is neutral, so the gain IS the sun's chromaticity
  const off = Math.max(...c.gain.map((v, i) => Math.abs(v - want[i])));
  if (off > 0.01) fail(`a neutral shade under a tinted sun must read as the sun's own colour — got ${c.gain.map((v) => v.toFixed(3)).join(", ")}, wanted ${want.map((v) => v.toFixed(3)).join(", ")}`);
  else ok(`a neutral shade under a tinted sun reads as that sun's colour (within ${off.toFixed(4)})`);
}

// ── 4 · THE GAIN MOVES COLOUR AND NOT BRIGHTNESS. ─────────────────────────
// Its Rec.709 luma is 1 by construction, so applying it at any strength leaves
// a neutral pixel's luminance where it was. Without this a correction and an
// exposure change would be impossible to tell apart on screen.
{
  for (const [name, f] of [
    ["an ordinary cast", frame({ shade: [0.06, 0.04, 0.03], sun: [0.5, 0.55, 0.45] })],
    // AND ON A FRAME EXTREME ENOUGH TO BE HELD, which is where the first
    // version broke it: clamping each channel to the range moved the luma to
    // 1.0198 and the correction quietly became an exposure change too.
    ["a frame extreme enough to be held", frame({ shade: [0.30, 0.01, 0.01], sun: [0.05, 0.6, 0.6] })],
  ]) {
    const c = run(f);
    const gl = c.gain[0] * 0.2126 + c.gain[1] * 0.7152 + c.gain[2] * 0.0722;
    if (!near(gl, 1, 1e-6)) fail(`${name}: the gain's luma must be 1, not ${gl}`);
    else ok(`${name}: the gain carries unit luma, so it cannot move brightness`);
  }
}

// ── 5 · THE SKY IS EXCLUDED, and that changes the answer. ─────────────────
// This is 9j's own named next piece: shadowSat is keyed on luminance alone, so
// a deep sky's dark end pays for a tree's bark. A dark blue band counted as
// shade would drag the measured cast toward the sky's colour.
{
  const shade = [0.05, 0.05, 0.05], sun = [0.6, 0.6, 0.6];
  const withSky = run(frame({ shade, sun, skyRows: 120, h: 520 }));
  const flat = Math.max(...withSky.gain.map((v) => Math.abs(v - 1)));
  if (flat > 0.002) fail(`a dark sky must not become the shadow population — gain ${withSky.gain.map((v) => v.toFixed(3)).join(", ")}`);
  else ok("a deep sky is excluded, so it cannot be mistaken for shade");
  // And the counterfactual, so the check above cannot pass by the sky simply
  // being too small to matter: counted in, the same frame reads a cast.
  const counted = measureShadowCast(frame({ shade, sun, skyRows: 120, h: 520 }).at, 520, 520, () => false);
  if (!(Math.max(...counted.gain.map((v) => Math.abs(v - 1))) > 0.01)) {
    fail("the sky band is too small to prove anything — this frame reads flat with the sky counted in too");
  } else ok(`...and counting it in DOES move the answer (spread ${counted.spread.toFixed(3)}), so the exclusion is doing work`);
}

// ── 6 · A FRAME IT CANNOT MEASURE SAYS SO, rather than guessing. ──────────
{
  const tiny = run(frame({ shade: [0.05, 0.04, 0.04], sun: [0.6, 0.6, 0.6], w: 40, h: 40 }));
  if (tiny.measured) fail("a frame too small to measure must not claim it was measured");
  else if (Math.max(...tiny.gain.map((v) => Math.abs(v - 1))) !== 0) fail("an unmeasured frame must return exact unity");
  else ok("a frame with too few pixels is refused, and returns exact unity");

  const flatFrame = run(frame({ shade: [0.3, 0.3, 0.3], sun: [0.3, 0.3, 0.3] }));
  if (Math.max(...flatFrame.gain.map((v) => Math.abs(v - 1))) > 0.002) fail("a frame with no tonal range must return unity");
  else ok("a frame with no shadow and no sun returns unity");

  const black = measureShadowCast(() => [0, 0, 0], 400, 400, () => false);
  if (black.measured || black.spread !== 0) fail("a black frame must be refused, not measured");
  else ok("a frame with no light in it at all is refused");

  const allSky = measureShadowCast(() => [0.02, 0.05, 0.12], 400, 400, () => true);
  if (allSky.measured) fail("a frame that is all sky has no populations and must be refused");
  else ok("a frame that is all sky is refused");
}

// ── 7 · NO MEASUREMENT MAY SWING A FRAME FURTHER THAN A REAL ILLUMINANT. ──
{
  const wild = run(frame({ shade: [0.30, 0.01, 0.01], sun: [0.05, 0.6, 0.6] }));
  const worst = Math.max(...wild.gain.map((v) => Math.abs(v - 1)));
  if (worst > 0.2501) fail(`a pathological frame must stay inside the held range — ${worst.toFixed(3)}`);
  else ok(`an extreme frame is held to ${worst.toFixed(3)} of unity rather than acting at full strength`);
}

// ── 8 · IT MEASURES IN LINEAR sRGB, NOT ON THE CAMERA'S CHANNELS. ──────────
// Every weight in the measurement is a Rec.709 luminance weight, which is
// luminance only on sRGB primaries. The caller hands it the camera-native
// decode WITH the balance and camera matrix that carry it there (`toDisplay`);
// it used to measure the camera-native numbers directly, where an infrared
// frame's red carries most of that "luma" and a cast known in display terms
// comes back as something else. So the fixture is built in DISPLAY space — a
// neutral sun, a shade with a known warm cast — and handed over as the camera
// would record it: through the inverse of a channel-mixing matrix and the
// inverse of a balance. Only a measurement made after converting back can
// return the reciprocal of the display cast.
{
  // A row-normalised camera matrix of the shape camToSrgbLinear produces
  // (rows sum to 1, strong off-diagonals as an infrared conversion has).
  const cam = [1.9, -0.6, -0.3, -0.4, 1.7, -0.3, -0.1, -0.7, 1.8];
  const inv3 = (m) => {
    const [a, b, c, d, e, f, g, h, i] = m;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
            B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
            C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
  };
  const camInv = inv3(cam);
  const gains = [1, 2.3, 4.1]; // an infrared-like balance, smallest gain 1
  const toCamera = (rgb) => {
    const r = camInv[0] * rgb[0] + camInv[1] * rgb[1] + camInv[2] * rgb[2];
    const g = camInv[3] * rgb[0] + camInv[4] * rgb[1] + camInv[5] * rgb[2];
    const b = camInv[6] * rgb[0] + camInv[7] * rgb[1] + camInv[8] * rgb[2];
    return [r / gains[0], g / gains[1], b / gains[2]];
  };
  const CAST = [1.18, 1.0, 0.92];
  const sunD = [0.6, 0.6, 0.6];
  const shadeD = [0.06 * CAST[0], 0.06 * CAST[1], 0.06 * CAST[2]];
  const f = frame({ shade: toCamera(shadeD), sun: toCamera(sunD) });
  const c = measureShadowCast(f.at, f.w, f.h, f.isSky, { gains, cam });
  const inv = [1 / CAST[0], 1 / CAST[1], 1 / CAST[2]];
  const gl = inv[0] * 0.2126 + inv[1] * 0.7152 + inv[2] * 0.0722;
  const want = inv.map((v) => v / gl);
  const off = Math.max(...c.gain.map((v, i) => Math.abs(v - want[i])));
  if (!c.measured) fail(`camera-native input with its conversion: not measured (${c.shadePx}/${c.sunPx} px)`);
  else if (off > 0.01) fail(`a cast known in display space must be recovered from camera-native input — got ${c.gain.map((v) => v.toFixed(3)).join(", ")}, wanted ${want.map((v) => v.toFixed(3)).join(", ")}`);
  else ok(`camera-native input is measured after its balance and matrix: the display cast comes back within ${off.toFixed(4)}`);
}

console.log(bad ? `\n${bad} failed` : "\nthe shadow measurement returns unity when there is nothing to correct.");
process.exit(bad ? 1 : 0);
