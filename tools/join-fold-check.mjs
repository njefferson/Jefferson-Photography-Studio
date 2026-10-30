#!/usr/bin/env node
// A MASK JOINS THE ONE ABOVE IT THREE WAYS, AND ALL THREE MUST SURVIVE.
//
// Decision 048 adds the union ("Add to it") beside subtract and intersect, and
// its record names the trap: `groupWeight` used to fold with
// `w *= op === 1 ? 1 - c : c`, which made INTERSECT THE DEFAULT BRANCH. A union
// written into that expression is one edit away from replacing "Only where
// both", and every edit that relies on an intersection would change meaning
// with nothing going red. So this holds all three folds on the SAME components,
// where each gives a different number, and the one case the old loop could not
// express — a union raising a zero head — because the loop used to stop at zero.
//
// It also holds decision 042's first stage at the function level: an aim on a
// head reads its group's weight, and a component's own aim reads its own shape.
// The shader's copies are held to these by tools/agreement-walk.mjs.
//
// And the export's pipeline has to KEY a colour mask that is a component, not
// only a head. `compileEdit` computed the colour key only when some group's
// FIRST mask was a colour mask, so a colour mask joined to a gradient keyed on
// black in every export while the screen keyed it correctly: the saved photo
// ignored the join. The last check holds a joined colour mask to the same
// result as the same mask on its own, where the mask it joins is full.
//
// And a mask's own colour mixer (042, stage 2b) has to mean what the switch
// says it means: offsets added to the whole photo's where the group reaches.
// So a head that is full at a pixel, carrying offsets, renders that pixel
// exactly as the same offsets on the whole photo would; a group that reaches
// nowhere there changes nothing; and a colour mask, which Foliage refuses,
// can carry them, because the mixer runs after the mask stage. The same four
// hold a mask's own grade, whose wheels add to the whole photo's. And a mask's
// own Sky band, which runs BEFORE the mask stage like Foliage: its offsets add
// the same way, and a group with a colour mask in it adds nothing, because the
// colour key does not exist that early. And a mask's own Luminance and LUT
// strength, the last two stages: the same offsets-added rule, held to the
// slider's range, with the LUT file itself staying whole-photo. And a mask's
// own curves, which do not add: they work on what the whole photo's curves
// left, blended in by the group's weight. And a mask's own Shadow colour, an
// offset on the amount taken out, added to the term a saved aim leaves.
//
// And decision 102's white balance (the last section): the Temperature and Tint sliders read the
// three gains on Adobe's scale through a camera profile, so the SDK's arithmetic, the profiles and
// the rule that picks one are held BOTH WAYS here — a white through gains and back, gains through
// a white and back, the grid move — with no ground-truth pair (there is no Lightroom DNG among the
// shared photographs) and with stand-in matrices already in src/color.ts in place of any profile.
//
// Runs on every commit and needs no browser. Bundled with esbuild so it checks
// the functions the app ships rather than a copy of them.
import { build } from "esbuild";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

// THE REPOSITORY THIS FILE SITS IN, found from the file's own location and never
// from the directory the process was started in (nothing may `cd` in the sessions
// that run these tools, so the start directory is not the repository).
const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(join(tmpdir(), "joinfold-"));
const entry = join(dir, "entry.ts");
writeFileSync(entry, [
  `export { groupWeight, aimWeight, neutralMask, compileEdit, hslDefault, TONE_DEFAULT, CROP_DEFAULT, cloneParams, screenGainsOf, screenGainsNeutral } from ${JSON.stringify(join(repo, "src/pipeline.ts"))};`,
  // 102: the white balance on Adobe's scale through a camera profile: the SDK's arithmetic, the profiles, and the store that reads and moves it on the gain track.
  `export { SDK_TABLE, KELVIN_MIN, ADOBE_KELVIN_MIN, planckLocusUv, KELVIN_MAX, TINT_MIN, TINT_MAX, xyToTempTint, tempTintToXy, illuminantToTemperature, normalizeColorMatrix, makeColourSpec, gainsToWhite, whiteToGains } from ${JSON.stringify(join(repo, "src/kelvin.ts"))};`,
  `export { cameraKey, profileProblem, readProfileFile, photoCamera, choicesFor, chooseProfile, renderedChoice, keepProfiles, loadedFor, forgetProfile, lastChoice, rememberChoice } from ${JSON.stringify(join(repo, "src/camprofile.ts"))};`,
  `export { readBalance, moveBalance, exactBalance, shownGains, readShown, screenForWhite, TEMPERATURE_MIRED_FAR, TEMPERATURE_MIRED_NEAR } from ${JSON.stringify(join(repo, "src/balancestore.ts"))};`,
  `export { WB_GAIN_LO, WB_GAIN_HI, WB_GAIN_STEPS } from ${JSON.stringify(join(repo, "src/decode.ts"))};`,
  `export { trackPos, trackVal } from ${JSON.stringify(join(repo, "src/tile.ts"))};`,
  `export { NIKON_Z50_COLOR_MATRIX, NIKON_D5300_COLOR_MATRIX } from ${JSON.stringify(join(repo, "src/color.ts"))};`,
].join("\n"));
const out = join(dir, "bundle.mjs");
await build({ entryPoints: [entry], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { groupWeight, aimWeight, neutralMask, compileEdit, hslDefault, TONE_DEFAULT, CROP_DEFAULT, cloneParams, screenGainsOf, screenGainsNeutral, SDK_TABLE, KELVIN_MIN, ADOBE_KELVIN_MIN, planckLocusUv, KELVIN_MAX, TINT_MIN, TINT_MAX, xyToTempTint, tempTintToXy, illuminantToTemperature, normalizeColorMatrix, makeColourSpec, gainsToWhite, whiteToGains, cameraKey, profileProblem, readProfileFile, photoCamera, choicesFor, chooseProfile, renderedChoice, keepProfiles, loadedFor, forgetProfile, lastChoice, rememberChoice, readBalance, moveBalance, exactBalance, shownGains, readShown, screenForWhite, TEMPERATURE_MIRED_FAR, TEMPERATURE_MIRED_NEAR, WB_GAIN_LO, WB_GAIN_HI, WB_GAIN_STEPS, trackPos, trackVal, NIKON_Z50_COLOR_MATRIX, NIKON_D5300_COLOR_MATRIX } = await import(pathToFileURL(out).href);

let bad = 0;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const check = (name, got, want) => {
  const ok = near(got, want);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}: ${got.toFixed(4)}${ok ? "" : ` (want ${want.toFixed(4)})`}`);
};

// Weights are given per mask, so the fold is tested apart from geometry.
const head = { op: 0, w: 0.6 };
const comp = (op) => ({ op, w: 0.25 });
const byW = (m) => m.w;
check("subtract folds as w * (1 - c)", groupWeight([head, comp(1)], byW), 0.6 * 0.75);
check("intersect folds as w * c", groupWeight([head, comp(2)], byW), 0.6 * 0.25);
check("union folds as w + c - w * c", groupWeight([head, comp(3)], byW), 0.6 + 0.25 - 0.6 * 0.25);
check("a union raises a head that is zero here", groupWeight([{ op: 0, w: 0 }, { op: 3, w: 0.7 }], byW), 0.7);
check("a subtract after a zero stays zero", groupWeight([{ op: 0, w: 0 }, { op: 1, w: 0.7 }], byW), 0);
check("folds apply in order: (head ∪ a) − b", groupWeight([head, { op: 3, w: 0.5 }, { op: 1, w: 0.5 }], byW), (0.6 + 0.5 - 0.3) * 0.5);
check("a group of one is its head's own weight", groupWeight([head], byW), 0.6);

// 042 stage 1: a head's aim is its group's area. Two radials, the second
// subtracted, both centred; at the centre the subtraction removes everything.
const AIM = 1;
const r1 = { ...neutralMask(0), aims: AIM };
const r2 = { ...neutralMask(0), op: 1 };
check("an aimed head's weight at its centre, alone", aimWeight([[r1]], AIM, 0.5, 0.5), 1);
check("the same head with a radial subtracted over it", aimWeight([[r1, r2]], AIM, 0.5, 0.5), 0);
const r2own = { ...r2, aims: AIM };
check("a component's own aim reads its own shape", aimWeight([[{ ...neutralMask(0) }, r2own]], AIM, 0.5, 0.5), 1);
const colour = { ...neutralMask(3), op: 1 };
check("a head a Colour mask is joined to cannot be aimed (the stage stays whole-frame)", aimWeight([[r1, colour]], AIM, 0.5, 0.5), 1);
check("nothing aimed leaves the stage whole-frame", aimWeight([[{ ...neutralMask(0) }]], AIM, 0.5, 0.5), 1);

// A colour mask joined to a gradient, in the export's pipeline. One saturated
// red pixel at v 0.3, where a gradient from v 0.6 to 0.9 is full; saturation 0
// on the group. On its own the colour mask greys that pixel, so joined to a
// gradient that is full there it has to grey it too.
const T = TONE_DEFAULT;
const plain = () => ({ wb: [1, 1, 1], exposure: 1, swapRB: false, hue: 0, sat: 1, contrast: 1, denoise: 0, tint: [1, 1, 1], glow: 0, sky: [0, 1, 1], foliage: [0, 1, 1], tone: [...T], toneR: [...T], toneG: [...T], toneB: [...T], lum: 1, masks: [], hotspot: 0, hotspotSize: 0.5, hotspotColor: 0, vignette: 0, lensFix: 0, lensBypass: false, forceBalance: false, hsFix: 0, hsBypass: false, hsl: hslDefault(), bwOn: false, bwMix: [1, 1, 1], clarity: 0, dehaze: 0, sharpen: 0, texture: 0, spots: [], crop: { ...CROP_DEFAULT }, straighten: 0 });
const rendered = (masks) => { const p = plain(); p.masks = masks; const o = new Float32Array(4); compileEdit(p, undefined, 1.5)(0.8, 0.02, 0.02, o, 0, 0.5, 0.3); return o; };
const gradient = () => ({ ...neutralMask(1), cx: 0.5, cy: 0.6, lx: 0.5, ly: 0.9, saturation: 0 });
const red = (op) => ({ ...neutralMask(3), hueTarget: 0, satTarget: 0.9, colorRange: 0.8, op, saturation: op ? 1 : 0 });
const untouched = rendered([]), alone = rendered([red(0)]), joined = rendered([gradient(), red(2)]);
check("the colour mask on its own changes the red pixel (so the case is live)", Math.abs(alone[0] - untouched[0]) > 0.1 ? 1 : 0, 1);
check("a colour mask joined to a full gradient changes it the same in the export's pipeline", Math.max(...[0, 1, 2].map((k) => Math.abs(joined[k] - alone[k]))), 0);

// 042 stage 2b: the mask's own colour mixer, in the export's pipeline. An
// orange pixel at the centre, where a radial head is full.
const px = (masks, hsl) => { const p = plain(); p.masks = masks; if (hsl) p.hsl = hsl; const o = new Float32Array(4); compileEdit(p, undefined, 1.5)(0.8, 0.35, 0.1, o, 0, 0.5, 0.5); return o; };
const off = Array.from({ length: 8 }, () => [25, 0.6, -0.2]).flat();
const whole = hslDefault().map((x, i) => x + off[i]);
const diff = (a, b) => Math.max(...[0, 1, 2].map((k) => Math.abs(a[k] - b[k])));
const bare = px([]);
check("offsets on the whole photo change the pixel (so the case is live)", diff(px([], whole), bare) > 0.02 ? 1 : 0, 1);
check("a full head's offsets render as the same offsets on the whole photo", diff(px([{ ...neutralMask(0), hsl: off }]), px([], whole)), 0);
check("offsets of zero change nothing", diff(px([{ ...neutralMask(0), hsl: new Array(24).fill(0), brightness: 1.0001 }]), px([{ ...neutralMask(0), brightness: 1.0001 }])), 0);
check("a head whose group reaches nowhere here changes nothing", diff(px([{ ...neutralMask(0), hsl: off }, { ...neutralMask(0), op: 1 }]), bare), 0);
const keyed = { ...neutralMask(3), hueTarget: 20, satTarget: 0.9, colorRange: 0.9, hsl: off };
check("a colour mask can carry the mixer's offsets", diff(px([keyed]), bare) > 0.02 ? 1 : 0, 1);

// 042 stage 2b: the mask's own grade. A full head's wheels render as the same
// wheels on the whole photo; wheels at zero, or a group that reaches nowhere,
// change nothing; a colour mask can carry them.
const pxg = (masks, grade) => { const p = plain(); p.masks = masks; if (grade) p.grade = grade; const o = new Float32Array(4); compileEdit(p, undefined, 1.5)(0.55, 0.45, 0.4, o, 0, 0.5, 0.5); return o; };
const G = [30, 0.8, 200, 0.6, 60, 0.5, 0.2];
const bareG = pxg([]);
check("a grade on the whole photo changes the pixel (so the case is live)", diff(pxg([], G), bareG) > 0.02 ? 1 : 0, 1);
check("a full head's grade renders as the same grade on the whole photo", diff(pxg([{ ...neutralMask(0), grade: G }]), pxg([], G)), 0);
check("a grade with every amount at zero changes nothing", diff(pxg([{ ...neutralMask(0), grade: [30, 0, 200, 0, 60, 0, 0.2], brightness: 1.0001 }]), pxg([{ ...neutralMask(0), brightness: 1.0001 }])), 0);
check("a head whose group reaches nowhere here changes nothing with a grade", diff(pxg([{ ...neutralMask(0), grade: G }, { ...neutralMask(0), op: 1 }]), bareG), 0);
check("a colour mask can carry a grade", diff(pxg([{ ...neutralMask(3), hueTarget: 20, satTarget: 0.3, colorRange: 0.9, grade: G }]), bareG) > 0.02 ? 1 : 0, 1);

// 042 stage 2, beside Foliage: the mask's own Sky band, on a blue pixel inside
// the sky band's hue range.
const pxs = (masks, sky) => { const p = plain(); p.masks = masks; if (sky) p.sky = sky; const o = new Float32Array(4); compileEdit(p, undefined, 1.5)(0.2, 0.35, 0.8, o, 0, 0.5, 0.5); return o; };
const SB = [20, 0.5, 0.2];
const bareS = pxs([]);
check("a Sky band on the whole photo changes the pixel (so the case is live)", diff(pxs([], [20, 1.5, 1.2]), bareS) > 0.02 ? 1 : 0, 1);
check("a full head's Sky band renders as the same offsets on the whole photo", diff(pxs([{ ...neutralMask(0), skyBand: SB }]), pxs([], [20, 1.5, 1.2])), 0);
check("a Sky band of zero changes nothing", diff(pxs([{ ...neutralMask(0), skyBand: [0, 0, 0], brightness: 1.0001 }]), pxs([{ ...neutralMask(0), brightness: 1.0001 }])), 0);
check("a head whose group reaches nowhere here changes nothing with a Sky band", diff(pxs([{ ...neutralMask(0), skyBand: SB }, { ...neutralMask(0), op: 1 }]), bareS), 0);
check("a colour mask cannot carry a Sky band (the band runs before its key exists)", diff(pxs([{ ...neutralMask(3), hueTarget: 220, satTarget: 0.7, colorRange: 0.9, skyBand: SB }]), bareS), 0);

// 042 stage 2b: the mask's own Luminance and LUT strength, the last two stages,
// both after the mask stage. A full head's offset renders as the same value on
// the whole photo; zero, or a group that reaches nowhere, changes nothing; a
// colour mask can carry them; the sum is held to the slider's range; and the
// LUT FILE stays whole-photo, so with none applied the strength offset is inert.
const pxl = (masks, edit) => { const p = plain(); p.masks = masks; Object.assign(p, edit ?? {}); const o = new Float32Array(4); compileEdit(p, undefined, 1.5)(0.55, 0.45, 0.4, o, 0, 0.5, 0.5); return o; };
const bareL = pxl([]);
check("a Luminance on the whole photo changes the pixel (so the case is live)", diff(pxl([], { lum: 1.5 }), bareL) > 0.02 ? 1 : 0, 1);
check("a full head's Luminance offset renders as the same Luminance on the whole photo", diff(pxl([{ ...neutralMask(0), lumLut: [0.5, 0] }]), pxl([], { lum: 1.5 })), 0);
check("an offset is added to the whole photo's Luminance, not put in its place", diff(pxl([{ ...neutralMask(0), lumLut: [0.25, 0] }], { lum: 1.25 }), pxl([], { lum: 1.5 })), 0);
check("a Luminance offset past the slider's end is held to the end", diff(pxl([{ ...neutralMask(0), lumLut: [5, 0] }]), pxl([], { lum: 2 })), 0);
check("Luminance and LUT-strength offsets of zero change nothing", diff(pxl([{ ...neutralMask(0), lumLut: [0, 0], brightness: 1.0001 }]), pxl([{ ...neutralMask(0), brightness: 1.0001 }])), 0);
check("a head whose group reaches nowhere here changes nothing with a Luminance", diff(pxl([{ ...neutralMask(0), lumLut: [0.5, 0] }, { ...neutralMask(0), op: 1 }]), bareL), 0);
check("a colour mask can carry a Luminance offset", diff(pxl([{ ...neutralMask(3), hueTarget: 20, satTarget: 0.3, colorRange: 0.9, lumLut: [0.5, 0] }]), bareL) > 0.02 ? 1 : 0, 1);
// A two-by-two-by-two lattice that inverts every channel, red fastest, so a LUT
// at any strength moves the pixel a long way and the strength is easy to read.
const lutData = new Float32Array(24);
for (let b = 0, k = 0; b < 2; b++) for (let g = 0; g < 2; g++) for (let r = 0; r < 2; r++, k += 3) { lutData[k] = 1 - r; lutData[k + 1] = 1 - g; lutData[k + 2] = 1 - b; }
const lutAt = (strength) => ({ lut: { id: "plant", name: "plant", size: 2, data: lutData, strength } });
check("a LUT on the whole photo changes the pixel (so the case is live)", diff(pxl([], lutAt(0.75)), bareL) > 0.02 ? 1 : 0, 1);
check("a full head's LUT-strength offset renders as the same strength on the whole photo", diff(pxl([{ ...neutralMask(0), lumLut: [0, 0.5] }], lutAt(0.25)), pxl([], lutAt(0.75))), 0);
check("a mask can turn a LUT up from a strength of zero", diff(pxl([{ ...neutralMask(0), lumLut: [0, 0.75] }], lutAt(0)), pxl([], lutAt(0.75))), 0);
check("a LUT-strength offset past 1 is held to 1", diff(pxl([{ ...neutralMask(0), lumLut: [0, 3] }], lutAt(0.25)), pxl([], lutAt(1))), 0);
check("with no LUT applied the strength offset moves nothing (the file is whole-photo)", diff(pxl([{ ...neutralMask(0), lumLut: [0, 0.5] }]), bareL), 0);
check("a colour mask can carry a LUT-strength offset", diff(pxl([{ ...neutralMask(3), hueTarget: 20, satTarget: 0.3, colorRange: 0.9, lumLut: [0, 0.5] }], lutAt(0)), pxl([], lutAt(0))) > 0.02 ? 1 : 0, 1);

// 042 stage 2b: the mask's own curves, applied after the whole photo's and
// blended in by the group's weight. A full head's master or colour-channel curve
// renders as the same curve on the whole photo; straight curves, or a group that
// reaches nowhere, change nothing; a colour mask can carry them; and a curve is
// not an offset, so it works on what the whole photo's curve left.
const S5 = [...TONE_DEFAULT];
const CM = [0.05, 0.4, 0.6, 0.8, 0.95], CR = [0, 0.15, 0.4, 0.7, 1], CG = [0.1, 0.3, 0.55, 0.7, 0.9], CB = [0, 0.35, 0.45, 0.85, 1];
const cv = (m, r, g, b) => [...m, ...r, ...g, ...b];
check("a master curve on the whole photo changes the pixel (so the case is live)", diff(pxl([], { tone: CM }), bareL) > 0.02 ? 1 : 0, 1);
check("a full head's master curve renders as the same curve on the whole photo", diff(pxl([{ ...neutralMask(0), curves: cv(CM, S5, S5, S5) }]), pxl([], { tone: CM })), 0);
check("a full head's red, green and blue curves render as the same curves on the whole photo", diff(pxl([{ ...neutralMask(0), curves: cv(S5, CR, CG, CB) }]), pxl([], { toneR: CR, toneG: CG, toneB: CB })), 0);
check("all four of a full head's curves render as the same four on the whole photo", diff(pxl([{ ...neutralMask(0), curves: cv(CM, CR, CG, CB) }]), pxl([], { tone: CM, toneR: CR, toneG: CG, toneB: CB })), 0);
check("a mask's curve works on what the whole photo's curve left", diff(pxl([{ ...neutralMask(0), curves: cv(CM, S5, S5, S5) }], { tone: CR }), pxl([], { tone: CR })) > 0.01 ? 1 : 0, 1);
check("and it is not the whole photo's curve put in its place", diff(pxl([{ ...neutralMask(0), curves: cv(CM, S5, S5, S5) }], { tone: CR }), pxl([], { tone: CM })) > 0.005 ? 1 : 0, 1);
check("straight curves change nothing", diff(pxl([{ ...neutralMask(0), curves: cv(S5, S5, S5, S5), brightness: 1.0001 }]), pxl([{ ...neutralMask(0), brightness: 1.0001 }])), 0);
check("a head whose group reaches nowhere here changes nothing with curves", diff(pxl([{ ...neutralMask(0), curves: cv(CM, CR, CG, CB) }, { ...neutralMask(0), op: 1 }]), bareL), 0);
check("a colour mask can carry curves", diff(pxl([{ ...neutralMask(3), hueTarget: 20, satTarget: 0.3, colorRange: 0.9, curves: cv(CM, CR, CG, CB) }]), bareL) > 0.02 ? 1 : 0, 1);
check("curves of the wrong length are ignored", diff(pxl([{ ...neutralMask(0), curves: [...CM], brightness: 1.0001 }]), pxl([{ ...neutralMask(0), brightness: 1.0001 }])), 0);

// 042 stage 2b: the mask's own Shadow colour, on a dark coloured pixel where the
// stage works. The offset is on the amount taken out and adds to it; a saved aim
// keeps its own rule, one weight on the whole photo's amount, and the offset is
// a second term added to what the aim leaves, so an edit with no offset renders
// as it did.
const pxh = (masks, edit) => { const p = plain(); p.masks = masks; Object.assign(p, edit ?? {}); const o = new Float32Array(4); compileEdit(p, undefined, 1.5)(0.1, 0.03, 0.015, o, 0, 0.5, 0.5); return o; };
const bareH = pxh([]);
const AIM_SHADOW_BIT = 4;
check("Shadow colour taken out on the whole photo changes a dark pixel (so the case is live)", diff(pxh([], { shadowSat: 0.8 }), bareH) > 0.02 ? 1 : 0, 1);
check("a full head's Shadow colour offset renders as the same amount on the whole photo", diff(pxh([{ ...neutralMask(0), shadow: 0.5 }]), pxh([], { shadowSat: 0.5 })), 0);
check("an offset is added to the whole photo's amount, not put in its place", diff(pxh([{ ...neutralMask(0), shadow: 0.25 }], { shadowSat: 0.25 }), pxh([], { shadowSat: 0.5 })), 0);
check("a negative offset gives colour back", diff(pxh([{ ...neutralMask(0), shadow: -0.25 }], { shadowSat: 0.5 }), pxh([], { shadowSat: 0.25 })), 0);
check("an offset past the end is held to all the colour out", diff(pxh([{ ...neutralMask(0), shadow: 3 }]), pxh([], { shadowSat: 1 })), 0);
check("an offset of zero changes nothing", diff(pxh([{ ...neutralMask(0), shadow: 0, brightness: 1.0001 }]), pxh([{ ...neutralMask(0), brightness: 1.0001 }])), 0);
check("a head whose group reaches nowhere here changes nothing with a Shadow colour offset", diff(pxh([{ ...neutralMask(0), shadow: 0.8 }, { ...neutralMask(0), op: 1 }]), bareH), 0);
check("a colour mask can carry a Shadow colour offset", diff(pxh([{ ...neutralMask(3), hueTarget: 14, satTarget: 0.7, colorRange: 0.9, shadow: 0.8 }]), bareH) > 0.02 ? 1 : 0, 1);
check("a saved aim still scales the whole photo's amount, here full", diff(pxh([{ ...neutralMask(0), aims: AIM_SHADOW_BIT }], { shadowSat: 0.5 }), pxh([], { shadowSat: 0.5 })), 0);
check("a saved aim on a mask that reaches nowhere here still takes the whole photo's amount away", diff(pxh([{ ...neutralMask(0), aims: AIM_SHADOW_BIT, cx: 0.0, cy: 0.0, rx: 0.05, ry: 0.05 }], { shadowSat: 0.5 }), bareH), 0);
check("an offset is added to the term a saved aim leaves", diff(pxh([{ ...neutralMask(0), aims: AIM_SHADOW_BIT, shadow: 0.25 }], { shadowSat: 0.5 }), pxh([], { shadowSat: 0.75 })), 0);

// ═══ 102 · THE WHITE BALANCE ON ADOBE'S SCALE, THROUGH A CAMERA PROFILE (record 102) ═══════════════════════════════════════════════════
// The Temperature and Tint sliders read the three gains as a temperature in kelvin and a tint through a camera profile's colour matrices
// (src/kelvin.ts, which is Adobe's DNG SDK), pick the profile a photograph is read through (src/camprofile.ts), and move the gains on the
// gain track (src/balancestore.ts). Nothing else asserts any of it on every commit, so this section holds the mapping BOTH WAYS, with a
// bar for each reading, and holds the rules that choose the profile. Pure functions, no browser.
//
// WHAT IT CANNOT HOLD, said plainly. There are NO GROUND-TRUTH PAIRS: step 206 found no DNG among the shared test photographs, so no
// file here has a Lightroom Temperature and Tint beside an embedded profile, and the section is held to the SDK's own points instead
// (the table's row, the standard whites as the SDK reads them, a round trip). The two Nikon Z 50 profile files this was built against are
// NOT in the repository (their terms are not settled), so the dual-calibration cases use two matrices that src/color.ts already holds, as a
// STAND-IN pair; the real profiles were checked by a scratch proof against an independent port of the same functions, and that reading is in
// the step's report and in IR-SCIENCE.md section 3. Run with a planted wrong table row, which the known-point reading refused before it was
// trusted.
{
  const within = (name, got, bar) => {
    const ok = Number.isFinite(got) && got <= bar;
    if (!ok) bad++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${name}: ${Number.isFinite(got) ? got.toFixed(4) : got} (bar ${bar})`);
  };
  const isTrue = (name, cond) => { if (!cond) bad++; console.log(`${cond ? "ok  " : "FAIL"}  ${name}`); };

  // THE SCALE IS ADOBE'S: the schema's four numbers, and the table exactly as the SDK prints it (a "correction" of one row is the thing to refuse).
  isTrue("Adobe's scale: 2000 to 50000 kelvin and minus 150 to 150 tint; this app's thumb reaches below it to 537 K (record 103, measured in step 244)", ADOBE_KELVIN_MIN === 2000 && KELVIN_MIN === 537 && KELVIN_MAX === 50000 && TINT_MIN === -150 && TINT_MAX === 150);
  isTrue("the SDK's table has 31 rows and its 325 mired row carries u of 0.24702 as printed", SDK_TABLE.length === 31 && SDK_TABLE[19][0] === 325 && SDK_TABLE[19][1] === 0.24702);
  // THE SDK'S KNOWN POINTS. The 200 mired row's own point is 5000 K on the locus; the standard whites read as the SDK's own functions read them (the values step 206's independent port printed).
  {
    const row = SDK_TABLE[14], den = row[1] - 4 * row[2] + 2;
    const a = xyToTempTint((1.5 * row[1]) / den, row[2] / den);
    within("the table's own 200 mired row reads 5000 K: miss in kelvin", Math.abs(a.kelvin - 5000), 1);
    within("the table's own 200 mired row sits on the locus: tint", Math.abs(a.tint), 0.05);
    const xy = tempTintToXy(5000, 50), back = xyToTempTint(xy.x, xy.y);
    within("a tint of 50 at 5000 K turned into an xy reads back: miss in tint", Math.abs(back.tint - 50), 0.05);
    within("a tint of 50 at 5000 K turned into an xy reads back: miss in kelvin", Math.abs(back.kelvin - 5000), 1);
    const STD = { "Standard light A": [0.4476, 0.4074, 2854.9, -0.06], D50: [0.3457, 0.3585, 5000.7, 9.56], D55: [0.3324, 0.3474, 5502.3, 9.99], D65: [0.3127, 0.329, 6503.7, 9.77], D75: [0.299, 0.3149, 7506.4, 9.75] };
    for (const [nm, [x, y, k, t]] of Object.entries(STD)) {
      const r = xyToTempTint(x, y);
      within(`${nm} reads ${k} K as the SDK reads it: miss in kelvin`, Math.abs(r.kelvin - k), 1);
      within(`${nm} reads a tint of ${t} as the SDK reads it: miss`, Math.abs(r.tint - t), 0.1);
    }
    within("D65 reads a daylight white, 6504 K: miss in kelvin", Math.abs(xyToTempTint(0.3127, 0.329).kelvin - 6504), 1);
    const cool = tempTintToXy(1500, 0), coolBack = xyToTempTint(cool.x, cool.y);
    isTrue("a white cooler than the table's last row reads back as itself from the computed rows (record 103; the SDK's own port stopped at 1667 K)", Math.abs(coolBack.kelvin - 1500) < 0.5);
    // THE COMPUTED ROWS DO NOT TOUCH THE SDK'S READINGS. The SDK's two loops are written out here over the table as printed, and from 1667 K up to 100000 K
    // every reading and every move of the app's own functions equals theirs (step 244 measured 2212 whites at a miss of 0).
    const sdkTT = (x, y) => {
      const den = 1.5 - x + 6 * y, u = (2 * x) / den, v = (3 * y) / den;
      let lastDt = 0, lastDu = 0, lastDv = 0;
      for (let index = 1; index <= 30; index++) {
        let du = 1, dv = SDK_TABLE[index][3];
        let len = Math.sqrt(1 + dv * dv); du /= len; dv /= len;
        let uu = u - SDK_TABLE[index][1], vv = v - SDK_TABLE[index][2];
        let dt = -uu * dv + vv * du;
        if (dt <= 0 || index === 30) {
          if (dt > 0) dt = 0;
          dt = -dt;
          const f = index === 1 ? 0 : dt / (lastDt + dt);
          const mired = SDK_TABLE[index - 1][0] * f + SDK_TABLE[index][0] * (1 - f);
          uu = u - (SDK_TABLE[index - 1][1] * f + SDK_TABLE[index][1] * (1 - f));
          vv = v - (SDK_TABLE[index - 1][2] * f + SDK_TABLE[index][2] * (1 - f));
          du = du * (1 - f) + lastDu * f; dv = dv * (1 - f) + lastDv * f;
          len = Math.sqrt(du * du + dv * dv); du /= len; dv /= len;
          return { kelvin: 1e6 / mired, tint: (uu * du + vv * dv) * -3000 };
        }
        lastDt = dt; lastDu = du; lastDv = dv;
      }
      return { kelvin: NaN, tint: NaN };
    };
    let worstK = 0, worstT = 0, readings = 0;
    for (let k = 1700; k <= 100000; k *= 1.05) for (const tint of [-150, -60, 0, 60, 150]) {
      const xy = tempTintToXy(k, tint), a = xyToTempTint(xy.x, xy.y), b = sdkTT(xy.x, xy.y);
      worstK = Math.max(worstK, Math.abs(a.kelvin - b.kelvin)); worstT = Math.max(worstT, Math.abs(a.tint - b.tint)); readings++;
    }
    isTrue(`${readings} whites from 1700 K to 100000 K read as the SDK's own loop reads them (largest miss ${worstK} K and ${worstT} of tint)`, readings > 100 && worstK < 1e-6 && worstT < 1e-6);
    // THE PLANCK ROWS MEET THE SDK'S TABLE: the black body summed against the observer lands within 7 units of 0.00001 on every printed row from 10 to 600 mired
    // but the one odd row, 325 (u of 0.24702 as printed, which this file does not correct), and within 6 on the rows from 400 to 600, which the computed rows continue (step 244 read 0.91 there).
    let rowMiss = 0, rowAt = 0, nearMiss = 0, nearAt = 0;
    for (const [r, u, v] of SDK_TABLE) {
      if (r < 10 || r > 600 || r === 325) continue; // 325 reads 90 units off: the SDK's one odd row, kept as printed (read in step 244)
      const p = planckLocusUv(1e6 / r), m = Math.max(Math.abs(p.u - u), Math.abs(p.v - v));
      if (m > rowMiss) { rowMiss = m; rowAt = r; }
      if (r >= 400 && m > nearMiss) { nearMiss = m; nearAt = r; }
    }
    within(`the black body lands on the SDK's printed rows (worst at ${rowAt} mired), miss in units of 0.00001`, rowMiss * 1e5, 7);
    within(`the black body lands on the SDK's printed rows from 400 to 600 mired, where the computed rows continue them (worst at ${nearAt} mired), miss in units of 0.00001`, nearMiss * 1e5, 6);
    // THE EXTENSION'S ROUND TRIP: a whole kelvin typed between the scale's cool end and 2200 K at the tints of an infrared white reads back as itself.
    let ext = 0, extBad = 0;
    for (const tint of [-90, -80, -65, 0]) for (let k = 540; k <= 2200; k += 5) {
      const xy = tempTintToXy(k, tint), r = xyToTempTint(xy.x, xy.y);
      ext++; if (Math.round(r.kelvin) !== k || Math.abs(r.tint - tint) > 0.05) extBad++;
    }
    isTrue(`${ext} whole kelvin from 540 K to 2200 K at tints minus 90, minus 80, minus 65 and 0 read back as typed (${extBad} did not)`, extBad === 0);
  }
  // THE COLOUR SPEC follows the SDK's constructor: one matrix at 5000 K when there is no second, an illuminant the SDK does not list, or two equal temperatures; otherwise the cooler calibration first.
  {
    isTrue("the SDK's temperatures for the illuminant codes: A 2850, D50 5000, D65 6500, an unlisted code 0", illuminantToTemperature(17) === 2850 && illuminantToTemperature(23) === 5000 && illuminantToTemperature(21) === 6500 && illuminantToTemperature(99) === 0 && illuminantToTemperature(undefined) === 0);
    const one = makeColourSpec(NIKON_Z50_COLOR_MATRIX, undefined, null, undefined);
    isTrue("a profile with one matrix is one matrix at 5000 K", !!one && one.t1 === 5000 && one.t2 === 5000 && one.cm1.every((v, i) => v === one.cm2[i]));
    const dual = makeColourSpec(NIKON_Z50_COLOR_MATRIX, 17, NIKON_D5300_COLOR_MATRIX, 21);
    const flip = makeColourSpec(NIKON_D5300_COLOR_MATRIX, 21, NIKON_Z50_COLOR_MATRIX, 17);
    isTrue("two calibrations are read cooler first, whichever way round the file lists them", !!dual && !!flip && dual.t1 === 2850 && dual.t2 === 6500 && flip.t1 === 2850 && flip.t2 === 6500 && dual.cm1.every((v, i) => v === flip.cm1[i]) && dual.cm2.every((v, i) => v === flip.cm2[i]));
    const odd = makeColourSpec(NIKON_Z50_COLOR_MATRIX, 99, NIKON_D5300_COLOR_MATRIX, 21);
    isTrue("an illuminant the SDK does not list makes the profile one matrix at 5000 K", !!odd && odd.t1 === 5000 && odd.t2 === 5000);
    isTrue("a matrix of eight numbers, and one of zeros, make no spec", makeColourSpec(NIKON_Z50_COLOR_MATRIX.slice(0, 8), 17, null, undefined) === null && makeColourSpec([0, 0, 0, 0, 0, 0, 0, 0, 0], 17, null, undefined) === null);
    const big = NIKON_Z50_COLOR_MATRIX.map((v) => v * 2);
    isTrue("a colour matrix whose D50 coordinate is far from 1 is scaled back before it is blended, and rounded to four places", normalizeColorMatrix(big).every((v, i) => Math.abs(v - normalizeColorMatrix(NIKON_Z50_COLOR_MATRIX)[i]) < 2e-4) && normalizeColorMatrix(big).every((v) => Math.abs(v * 10000 - Math.round(v * 10000)) < 1e-6));
  }
  // THE MAPPING BOTH WAYS, on three stand-in specs: a white through gains and back, and gains through a white and back. The pair of
  // calibrations is the stock Z 50 matrix and the same matrix with its columns scaled 0.9, 1 and 1.1, an ordinary size of difference between
  // a tungsten and a daylight calibration of one camera (the two Z 50 profiles read for record 102 differ by tens of percent); a pair of
  // two different cameras' matrices is not a profile, and the blend between them has more than one self-consistent white.
  {
    const warmCal = NIKON_Z50_COLOR_MATRIX.map((v, i) => v * [0.9, 1, 1.1][i % 3]);
    const SPECS = [
      ["one matrix (the Z 50's stock)", makeColourSpec(NIKON_Z50_COLOR_MATRIX, undefined, null, undefined)],
      ["two calibrations, cooler first (stand-in pair)", makeColourSpec(NIKON_Z50_COLOR_MATRIX, 17, warmCal, 21)],
      ["two calibrations, listed the other way round", makeColourSpec(warmCal, 21, NIKON_Z50_COLOR_MATRIX, 17)],
    ];
    for (const [name, spec] of SPECS) {
      let dm = 0, dt = 0, n = 0, ratio = 0;
      for (let k = ADOBE_KELVIN_MIN; k <= KELVIN_MAX; k *= 1.1) for (const tint of [-60, -30, 0, 30, 60]) {
        const g = whiteToGains(spec, k, tint);
        // The SDK pins a chromaticity inside the real ones (x plus y under 1) and a camera channel at a thousandth, so a white outside them is
        // not reproduced; the tint range is where the SDK's isotherms are one-to-one with the plane near the locus.
        const xy = tempTintToXy(k, tint);
        if (!g || xy.x + xy.y > 0.99 || Math.min(...g) / Math.max(...g) < 0.002) continue;
        const w = gainsToWhite(spec, g);
        if (!w) continue;
        n++; dm = Math.max(dm, Math.abs(w.mired - 1e6 / k)); dt = Math.max(dt, Math.abs(w.tint - tint));
        const u = Math.min(...g), g0 = g.map((x) => x / u);
        const g2 = whiteToGains(spec, w.kelvin, w.tint), u2 = Math.min(...g2), gb = g2.map((x) => x / u2);
        ratio = Math.max(ratio, ...gb.map((x, i) => Math.abs(x - g0[i]) / g0[i]));
      }
      isTrue(`${name}: ${n} whites across 2000 K to 50000 K had gains`, n >= 40);
      within(`${name}: a white through gains and back, miss in mired`, dm, 0.1);
      within(`${name}: a white through gains and back, miss in tint`, dt, 0.1);
      // Record 102 measured 0.008 percent at worst on 32 raws through the two real profiles; this reads the whole of Adobe's scale, edges
      // included, and measures 0.011 percent there (the edge whites are the ones the SDK's pins reach), so the bar is 0.02 percent.
      within(`${name}: gains through a white and back, miss as a fraction of a gain`, ratio, 2e-4);
    }
    // The blend between the two calibrations is the white's own temperature, linear in mired: the first matrix alone at the cool end, the second alone at the warm end, a share between.
    const [, dualSpec] = SPECS[1];
    const wt = (k) => gainsToWhite(dualSpec, whiteToGains(dualSpec, k, 0)).weight;
    isTrue("the first calibration's share is 1 at 2000 K, between 0 and 1 at 4000 K, and 0 at 9000 K", wt(2000) === 1 && wt(4000) > 0 && wt(4000) < 1 && wt(9000) === 0);
    // WHICH WAY IS WHICH, the claim the sliders' captions make: right is warmer (red up against blue), and right is more magenta (green down).
    const [, z50] = SPECS[0];
    const cool = whiteToGains(z50, 3000, 0), warm = whiteToGains(z50, 8000, 0);
    isTrue("a warmer temperature gives more red against blue", warm[0] / warm[2] > cool[0] / cool[2]);
    const green = whiteToGains(z50, 5000, -40), magenta = whiteToGains(z50, 5000, 40);
    isTrue("a more positive tint gives a smaller green gain against red and blue", magenta[1] / Math.sqrt(magenta[0] * magenta[2]) < green[1] / Math.sqrt(green[0] * green[2]));
    const sr = renderedChoice();
    within("gains of 1, 1 and 1 on a photograph the camera developed read as its own white, 6504 K: miss in kelvin", Math.abs(gainsToWhite(sr.spec, [1, 1, 1]).kelvin - 6504), 5);
    // THE GRID. A move lands on whole track positions with the start's sum, and reads back within the grid's own resolution.
    const posOf = (g) => Math.round(trackPos(g, WB_GAIN_LO, WB_GAIN_HI, WB_GAIN_STEPS));
    const snap = (g) => trackVal(posOf(g), WB_GAIN_LO, WB_GAIN_HI, WB_GAIN_STEPS);
    const from = [1, 1.884, 3.033].map(snap), sum0 = from.reduce((s, g) => s + posOf(g), 0);
    for (const [name, spec] of SPECS) {
      let dm = 0, dt = 0, drift = 0, none = 0, n = 0;
      for (let k = 3000; k <= 12000; k += 1000) for (let tint = -60; tint <= 60; tint += 20) {
        const want = { mired: 1e6 / k, tint };
        const to = moveBalance(want, from, spec);
        n++;
        if (!to) { none++; continue; }
        const r = readBalance(to, spec);
        dm = Math.max(dm, Math.abs(r.mired - want.mired)); dt = Math.max(dt, Math.abs(r.tint - want.tint));
        drift = Math.max(drift, Math.abs(to.reduce((s, g) => s + posOf(g), 0) - sum0));
      }
      isTrue(`${name}: the grid move found gains for every one of ${n} whites from 3000 K to 12000 K (${none} had none)`, none === 0);
      within(`${name}: a move then a read, miss in mired`, dm, 3);
      within(`${name}: a move then a read, miss in tint`, dt, 3);
      within(`${name}: a move leaves the sum of the three track positions where it was: largest drift`, drift, 0);
    }
  }
  // THE PAGE AS SERVED CARRIES THE SLIDERS' ENDS the store holds: four numbers in two places, held to each other here.
  {
    const html = readFileSync(join(repo, "ir.html"), "utf8");
    const range = (id) => { const m = new RegExp(`<input id="${id}" type="range" min="(-?\\d+)" max="(-?\\d+)"`).exec(html); return m ? [Number(m[1]), Number(m[2])] : null; };
    const t = range("balT"), ti = range("balTi");
    isTrue(`ir.html's Temperature slider runs ${t ? t.join(" to ") : "nowhere"}, the store's ${-TEMPERATURE_MIRED_FAR} to ${-TEMPERATURE_MIRED_NEAR}`, !!t && t[0] === -TEMPERATURE_MIRED_FAR && t[1] === -TEMPERATURE_MIRED_NEAR);
    isTrue(`ir.html's Tint slider runs ${ti ? ti.join(" to ") : "nowhere"}, Adobe's ${TINT_MIN} to ${TINT_MAX}`, !!ti && ti[0] === TINT_MIN && ti[1] === TINT_MAX);
    isTrue("the thumb's ends: the cool end is the camera's own limit, 537 K (1862 mired), and the warm end is Adobe's, 20 mired is 50000 K", TEMPERATURE_MIRED_FAR === Math.round(1e6 / KELVIN_MIN) && TEMPERATURE_MIRED_FAR === 1862 && TEMPERATURE_MIRED_NEAR === 1e6 / KELVIN_MAX);
  }
  // THE REACH BELOW ADOBE'S 2000 K (record 103, built in step 244): with no profile loaded, the camera's stock matrix, a typed number from the scale's cool end up
  // lands on the number, at every tint of an infrared white; the cool end is tight (a white a few kelvin under it is one the gains cannot express); and a typed 600 K,
  // the case that was refused, lands.
  {
    const stock = makeColourSpec(NIKON_Z50_COLOR_MATRIX, undefined, null, undefined);
    let landed = 0, asked = 0, worst = 0;
    for (const tint of [-91.4, -85, -80, -75, -70, -65.2]) for (const k of [KELVIN_MIN, 540, 600, 800, 1000, 1500, 1667, 1700, 1999, 2500, 3000]) {
      const g = whiteToGains(stock, k, tint);
      asked++;
      if (!g) continue;
      const w = gainsToWhite(stock, g);
      if (!w) continue;
      worst = Math.max(worst, Math.abs(w.kelvin - k));
      if (Math.abs(w.kelvin - k) < 0.5 && Math.abs(w.tint - tint) < 0.1) landed++;
    }
    isTrue(`${asked} typed whites from ${KELVIN_MIN} K to 3000 K at six infrared tints: ${landed} land on the number (largest miss ${worst.toFixed(4)} K)`, landed === asked);
    const under = whiteToGains(stock, KELVIN_MIN - 2.5, -91.4), underW = under ? gainsToWhite(stock, under) : null;
    isTrue("the cool end is tight: 2.5 K under it, at the tint it is dearest at (minus 91.4), the gains do not read back the white asked", !underW || Math.abs(underW.kelvin - (KELVIN_MIN - 2.5)) > 0.5);
    // A typed 600 K by the exact route, over a raw's opening gains: the box reads 600.
    const open = [1, 1.817, 2.765], gm = Math.cbrt(open[0] * open[1] * open[2]), from = open.map((v) => v / gm);
    const tintAtOpen = readBalance(from, stock).tint;
    const typed = exactBalance({ mired: 1e6 / 600, tint: tintAtOpen }, from, stock);
    isTrue("a typed 600 K over a raw's opening gains lands: the box reads 600", !!typed && Math.round(readBalance(typed, stock).kelvin) === 600);
  }
  // RECORD 104, THE SCREEN-SIDE GAINS: while the red and blue swap is on, a Temperature or Tint move is made on three gains applied after the swap, so a warmer
  // reading is a warmer picture. They are read together with the camera-space gains, move exactly (a drag and a typed number alike), and do nothing with the swap off.
  {
    const stock = makeColourSpec(NIKON_Z50_COLOR_MATRIX, undefined, null, undefined);
    const open = [1, 1.817, 2.765], gm = Math.cbrt(open[0] * open[1] * open[2]), g0 = open.map((v) => v / gm);
    const r0 = readBalance(g0, stock);
    isTrue("with no screen-side gains the reading is the gains' own reading, and with one, one, one it is the same", readShown(g0, null, stock).kelvin === r0.kelvin && readShown(g0, [1, 1, 1], stock).kelvin === r0.kelvin);
    const warmer = screenForWhite({ mired: r0.mired - 10, tint: r0.tint }, g0, stock);
    const cooler = screenForWhite({ mired: r0.mired + 10, tint: r0.tint }, g0, stock);
    isTrue("ten mired warmer gives screen-side gains that raise the screen's red against its blue, ten cooler lower it", !!warmer && !!cooler && warmer[0] / warmer[2] > 1 && cooler[0] / cooler[2] < 1);
    isTrue("screen-side gains have a product of one", Math.abs(warmer[0] * warmer[1] * warmer[2] - 1) < 1e-9 && Math.abs(cooler[0] * cooler[1] * cooler[2] - 1) < 1e-9);
    const back = readShown(g0, warmer, stock);
    // The bars are the conversion's own round trip (gainsToWhite solves for the white by iteration; step 223 measured 0.0430 K at worst on five exports), not the route's.
    within("the screen route lands: the reading after a ten mired move warmer is ten mired from where it started, miss in mired", Math.abs(back.mired - (r0.mired - 10)), 1e-3);
    within("the screen route lands: tint stays, miss in tint", Math.abs(back.tint - r0.tint), 1e-3);
    let worst600 = 0;
    for (const k of [600, 1500, 3000, 6500]) { const s = screenForWhite({ mired: 1e6 / k, tint: r0.tint }, g0, stock); worst600 = Math.max(worst600, s ? Math.abs(readShown(g0, s, stock).kelvin - k) : 1e9); }
    within("a typed 600, 1500, 3000 and 6500 K by the screen route read back as typed (the box rounds to a whole kelvin), largest miss in kelvin", worst600, 0.25);
    isTrue("the screen route keeps the gains' level: the geometric mean of the gains shown equals that of the gains", Math.abs(Math.cbrt(shownGains(g0, warmer).reduce((p, v) => p * v, 1)) - Math.cbrt(g0.reduce((p, v) => p * v, 1))) < 1e-9);
    // ten one-step moves added to the white asked for, and one ten-step move, end together
    let ten = { mired: r0.mired, tint: r0.tint };
    for (let i = 0; i < 10; i++) ten = { mired: ten.mired - 1, tint: ten.tint };
    const sTen = screenForWhite(ten, g0, stock), sOne = screenForWhite({ mired: r0.mired - 10, tint: r0.tint }, g0, stock);
    within("ten one-step moves and one ten-step move ask for the same screen-side gains, largest difference", Math.max(...sTen.map((v, i) => Math.abs(v - sOne[i]))), 1e-12);
    // the grid route: one-step moves added to the white asked for (main.ts balanceInput's rule), against one ten-step move, within one gain-track step
    const snapG = (g) => g.map((v) => trackVal(Math.round(trackPos(v, WB_GAIN_LO, WB_GAIN_HI, WB_GAIN_STEPS)), WB_GAIN_LO, WB_GAIN_HI, WB_GAIN_STEPS));
    /** The gains one gain-track step apart: red up by d positions and blue down by d, the sum of positions held. */
    const trackShift = (g, d) => { const p = g.map((v) => Math.round(trackPos(v, WB_GAIN_LO, WB_GAIN_HI, WB_GAIN_STEPS))); p[0] += d; p[2] -= d; return p.map((q) => trackVal(q, WB_GAIN_LO, WB_GAIN_HI, WB_GAIN_STEPS)); };
    const start = snapG(g0), rs = readBalance(start, stock);
    let gg = start, asked = { mired: rs.mired, tint: rs.tint };
    for (let i = 0; i < 10; i++) { asked = { mired: asked.mired - 1, tint: asked.tint }; gg = moveBalance(asked, gg, stock) || gg; }
    const oneTen = moveBalance({ mired: rs.mired - 10, tint: rs.tint }, start, stock);
    const stepMired = Math.abs(readBalance(trackShift(start, 1), stock).mired - rs.mired);
    within("the grid route: ten one-step moves and one ten-step move end within one gain-track step, difference in mired", Math.abs(readBalance(gg, stock).mired - readBalance(oneTen, stock).mired), Math.max(stepMired, 1e-9));
    // and the old way, each move added to the reading of the gains, would not have left the start (the defect step 244 found in its own first version)
    let gOld = start;
    for (let i = 0; i < 10; i++) { const c = readBalance(gOld, stock); gOld = moveBalance({ mired: c.mired - 1, tint: c.tint }, gOld, stock) || gOld; }
    isTrue("the old way, each one-step move added to the reading, ends further from the ten-step move than one gain-track step (the reason the drag keeps the white asked for)", Math.abs(readBalance(gOld, stock).mired - readBalance(oneTen, stock).mired) > stepMired);
    // pipeline: the stage is after the swap, only with the swap on, and one, one, one is no stage
    isTrue("screenGainsOf: none with the swap off, none for one, one, one, the gains with the swap on", screenGainsOf({ swapRB: false, wbScreen: [1.2, 1, 1 / 1.2] }) === null && screenGainsOf({ swapRB: true, wbScreen: [1, 1, 1] }) === null && screenGainsOf({ swapRB: true }) === null && screenGainsOf({ swapRB: true, wbScreen: [1.2, 1, 1 / 1.2] })?.[0] === 1.2 && screenGainsNeutral([1, 1, 1]) && screenGainsNeutral(undefined) && !screenGainsNeutral([1.2, 1, 1 / 1.2]));
    const pxw = (edit) => { const p = plain(); Object.assign(p, edit); const o = new Float32Array(4); compileEdit(p, undefined, 1.5)(0.5, 0.4, 0.3, o, 0, 0.5, 0.5); return o; };
    const base = pxw({ swapRB: true }), warm = pxw({ swapRB: true, wbScreen: [1.2, 1, 1 / 1.2] }), cool = pxw({ swapRB: true, wbScreen: [1 / 1.2, 1, 1.2] });
    isTrue("with the swap on, screen-side gains with more red than blue make the pixel redder against blue, and less red than blue make it bluer", warm[0] / warm[2] > base[0] / base[2] && cool[0] / cool[2] < base[0] / base[2]);
    const offA = pxw({ swapRB: false }), offB = pxw({ swapRB: false, wbScreen: [1.2, 1, 1 / 1.2] });
    isTrue("with the swap off the screen-side gains do nothing: the same pixel, to the last place", [0, 1, 2].every((k) => offA[k] === offB[k]));
    const oneA = pxw({ swapRB: true }), oneB = pxw({ swapRB: true, wbScreen: [1, 1, 1] });
    isTrue("one, one, one is no stage: the same pixel, to the last place", [0, 1, 2].every((k) => oneA[k] === oneB[k]));
    const cl = cloneParams({ ...plain(), swapRB: true, wbScreen: [1.2, 1, 1 / 1.2] });
    isTrue("cloneParams carries the screen-side gains as a copy, and a clone of an edit with none has none", Array.isArray(cl.wbScreen) && cl.wbScreen[0] === 1.2 && !("wbScreen" in cloneParams(plain())));
  }
  // THE PROFILES: reading one from a file's tags, the store, the list a photograph offers and the rule that picks one. The files are built here
  // from the stand-in matrices; no real profile is held.
  {
    const mem = new Map();
    globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); } };
    /** A small TIFF-shaped file of the listed tags, in the byte order a profile uses. Each tag is [number, "ascii" | "short" | "srational", value or values]. */
    const tiffBytes = (tags) => {
      const sorted = tags.slice().sort((a, b) => a[0] - b[0]);
      const ifdSize = 2 + sorted.length * 12 + 4;
      const body = Buffer.alloc(ifdSize);
      body.writeUInt16LE(sorted.length, 0);
      const extra = [];
      let at = 8 + ifdSize;
      sorted.forEach(([tag, type, values], i) => {
        let data, t;
        if (type === "ascii") { data = Buffer.from(values + "\0", "latin1"); t = 2; }
        else if (type === "short") { data = Buffer.alloc(values.length * 2); values.forEach((v, k) => data.writeUInt16LE(v, k * 2)); t = 3; }
        else { data = Buffer.alloc(values.length * 8); values.forEach((v, k) => { data.writeInt32LE(Math.round(v * 10000), k * 8); data.writeInt32LE(10000, k * 8 + 4); }); t = 10; }
        const e = 2 + i * 12;
        body.writeUInt16LE(tag, e); body.writeUInt16LE(t, e + 2); body.writeUInt32LE(type === "ascii" ? data.length : values.length, e + 4);
        if (data.length <= 4) data.copy(body, e + 8); else { body.writeUInt32LE(at, e + 8); extra.push(data); at += data.length; }
      });
      const head = Buffer.alloc(8);
      head.write("II", 0, "latin1"); head.writeUInt16LE(17234, 2); head.writeUInt32LE(8, 4);
      return new Uint8Array(Buffer.concat([head, body, ...extra]));
    };
    const profileFile = (o = {}) => tiffBytes([
      ...(o.camera === null ? [] : [[50708, "ascii", o.camera ?? "Test Camera One"]]),
      ...(o.noMatrix ? [] : [[50721, "srational", o.cm1 ?? NIKON_Z50_COLOR_MATRIX]]),
      [50722, "srational", o.cm2 ?? NIKON_D5300_COLOR_MATRIX], [50778, "short", [17]], [50779, "short", [21]],
      ...(o.name === null ? [] : [[50936, "ascii", o.name ?? "Test profile"]]),
    ]);
    const got = readProfileFile(profileFile(), "fallback");
    isTrue("a profile file reads as the camera it names, its own name, and both matrices and illuminants", "profile" in got && got.profile.camera === "Test Camera One" && got.profile.name === "Test profile" && got.profile.cm1.every((v, i) => Math.abs(v - NIKON_Z50_COLOR_MATRIX[i]) < 1e-4) && got.profile.cm2.every((v, i) => Math.abs(v - NIKON_D5300_COLOR_MATRIX[i]) < 1e-4) && got.profile.ill1 === 17 && got.profile.ill2 === 21 && profileProblem(got.profile) === null);
    const unnamed = readProfileFile(profileFile({ name: null }), "the file's name");
    isTrue("a profile that names itself nothing takes the file's name", "profile" in unnamed && unnamed.profile.name === "the file's name");
    isTrue("a file that names no camera, one with no colour matrix, a cut-short one, plain text and an oversized one are each refused in words", [readProfileFile(profileFile({ camera: null }), "x"), readProfileFile(profileFile({ noMatrix: true }), "x"), readProfileFile(profileFile().slice(0, 60), "x"), readProfileFile(new Uint8Array(Buffer.from("this is not a camera profile, just some plain text")), "x"), readProfileFile(new Uint8Array(2 * 1024 * 1024 + 1), "x")].every((r) => "problem" in r && r.problem.length > 20));
    isTrue("a stored profile that fails the check is refused: no name, a short matrix, a code out of range", [{ name: "", camera: "A", cm1: NIKON_Z50_COLOR_MATRIX }, { name: "N", camera: "A", cm1: [1, 2, 3] }, { name: "N", camera: "A", cm1: NIKON_Z50_COLOR_MATRIX, ill1: 999 }].every((p) => profileProblem(p) !== null) && profileProblem({ name: "N", camera: "A", cm1: NIKON_Z50_COLOR_MATRIX, cm2: null, ill1: null, ill2: null }) === null);
    isTrue("a camera's two spellings meet and two bodies do not: NIKON Z 50 and Nikon Z 50, but not a Z 50_2", cameraKey("NIKON Z 50") === "nikonz50" && cameraKey("NIKON Z 50") === cameraKey("Nikon Z 50") && cameraKey("NIKON Z 50_2") !== cameraKey("NIKON Z 50") && cameraKey(undefined) === "");
    // What a file says about its camera.
    const nef = photoCamera(true, tiffBytes([[272, "ascii", "NIKON Z 50"]]));
    isTrue("a NEF names no profile: its stock matrix is the model's, and its key is the model's", nef.embedded === null && !!nef.stock && /Nikon Z 50/.test(nef.stock.name) && nef.keys.length === 1 && nef.keys[0] === "nikonz50");
    const d5300 = photoCamera(true, tiffBytes([[272, "ascii", "NIKON D5300"]]));
    isTrue("a D5300 NEF takes the D5300's own matrix, not the Z 50's", !!d5300.stock && /D5300/.test(d5300.stock.name) && Math.abs(d5300.stock.spec.cm1[0] - normalizeColorMatrix(NIKON_D5300_COLOR_MATRIX)[0]) < 1e-9);
    const z6 = photoCamera(true, tiffBytes([[272, "ascii", "NIKON Z 6"]]));
    isTrue("a body the app holds no matrix for is said to be read through the Z 50's, in the name", !!z6.stock && /Z 50/.test(z6.stock.name) && /holds no matrix for NIKON Z 6/.test(z6.stock.words));
    const dngBytes = (model, unique, name) => tiffBytes([[272, "ascii", model], [50708, "ascii", unique], [50721, "srational", NIKON_Z50_COLOR_MATRIX], [50722, "srational", NIKON_D5300_COLOR_MATRIX], [50778, "short", [17]], [50779, "short", [21]], ...(name ? [[50936, "ascii", name]] : [])]);
    const dng = photoCamera(true, dngBytes("NIKON Z 50", "Nikon Z 50", "Infrared Temp -100"));
    isTrue("a DNG embeds its own profile, by the name it carries, and also offers the stock matrix for a body the app knows", !!dng.embedded && dng.embedded.name === "Infrared Temp -100" && !!dng.stock && dng.keys.length === 1);
    const other = photoCamera(true, dngBytes("Canon EOS R6", "Canon EOS R6", null));
    isTrue("a DNG from another body embeds its matrices (named as the file's own) and offers no stock matrix", !!other.embedded && other.embedded.name === "This file's own colour matrix" && other.stock === null && other.keys.length === 1 && other.keys[0] === "canoneosr6");
    const developed = photoCamera(false, dngBytes("NIKON Z 50", "Nikon Z 50", null));
    isTrue("a photograph the camera developed has no embedded profile and no stock matrix", developed.embedded === null && developed.stock === null && developed.isRaw === false);
    isTrue("garbage bytes and no bytes never throw, and still name a stock matrix", !!photoCamera(true, new Uint8Array(40)).stock && !!photoCamera(true, undefined).stock);
    // The list a photograph offers, and the rule that picks one.
    const loaded = (name, key = "nikonz50", cam = "Nikon Z 50") => ({ name, camera: cam, cm1: NIKON_Z50_COLOR_MATRIX.slice(), ill1: 17, cm2: NIKON_D5300_COLOR_MATRIX.slice(), ill2: 21, key, made: "" });
    const L100 = loaded("Infrared Temp -100"), L50 = loaded("Infrared Temp -50");
    const tokens = (cs) => cs.map((c) => c.token).join("|");
    isTrue("a DNG offers its own profile, then each loaded one, then the stock matrix", tokens(choicesFor(dng, [L50, L100])) === "embedded|loaded:Infrared Temp -50|loaded:Infrared Temp -100|stock");
    isTrue("a NEF offers each loaded profile and the stock matrix; a developed file offers the one rendered reading", tokens(choicesFor(nef, [L100])) === "loaded:Infrared Temp -100|stock" && tokens(choicesFor(developed, [L100])) === "rendered");
    const pick = (cam, ls, saved, held, last) => chooseProfile(choicesFor(cam, ls), saved, held, last)?.token;
    isTrue("with both of the pack's profiles loaded and nothing else deciding, the -100 is chosen", pick(nef, [L50, L100], undefined, null, null) === "loaded:Infrared Temp -100");
    isTrue("with only the -50 loaded it is chosen; with none loaded the stock matrix is", pick(nef, [L50], undefined, null, null) === "loaded:Infrared Temp -50" && pick(nef, [], undefined, null, null) === "stock");
    isTrue("the profile a file embeds is chosen before a loaded one", pick(dng, [L100], undefined, null, null) === "embedded");
    isTrue("the reader's last switch for the camera beats the file's own profile, and a held balance's choice beats the last switch", pick(dng, [L100], undefined, null, "loaded:Infrared Temp -100") === "loaded:Infrared Temp -100" && pick(dng, [L100, L50], undefined, "loaded:Infrared Temp -50", "loaded:Infrared Temp -100") === "loaded:Infrared Temp -50");
    isTrue("the choice saved with the photograph beats every other rule", pick(dng, [L100, L50], "stock", "loaded:Infrared Temp -50", "loaded:Infrared Temp -100") === "stock");
    isTrue("a choice that names nothing available now is passed over to the next rule, never an error", pick(nef, [L100], "loaded:Gone", "loaded:Also gone", "embedded") === "loaded:Infrared Temp -100");
    isTrue("nothing to choose from gives null", chooseProfile([], undefined, null, null) === null);
    // The store: kept under the camera it names, offered only for that camera, replaced by name, forgotten, and honest when the device refuses.
    const mk = (camera, name, cm1) => ({ camera, name, cm1: cm1 ?? NIKON_Z50_COLOR_MATRIX.slice(), ill1: 17, cm2: NIKON_D5300_COLOR_MATRIX.slice(), ill2: 21 });
    const kept = keepProfiles([mk("Camera One", "P1"), mk("Camera One", "P2"), mk("Camera Two", "P1")]);
    isTrue("three profiles are kept, two for one camera and one for another", kept.stored === 3 && !kept.refused && loadedFor(["cameraone"]).map((p) => p.name).join("|") === "P1|P2" && loadedFor(["cameratwo"]).length === 1 && loadedFor(["nobody"]).length === 0 && loadedFor([]).length === 0);
    keepProfiles([mk("Camera One", "P1", NIKON_D5300_COLOR_MATRIX.slice())]);
    isTrue("a profile of the same camera and name is replaced, and comes first", loadedFor(["cameraone"]).length === 2 && loadedFor(["cameraone"])[0].name === "P1" && Math.abs(loadedFor(["cameraone"])[0].cm1[0] - NIKON_D5300_COLOR_MATRIX[0]) < 1e-9);
    isTrue("a loaded profile is forgotten once, and not twice", forgetProfile("cameraone", "P2") && !forgetProfile("cameraone", "P2") && loadedFor(["cameraone"]).length === 1);
    rememberChoice(["cameraone", "alias"], "loaded:P1");
    isTrue("the last switch is remembered for the camera under each of its keys, and not for another camera", lastChoice(["alias"]) === "loaded:P1" && lastChoice(["cameratwo"]) === null && lastChoice([]) === null);
    const was = globalThis.localStorage.setItem;
    globalThis.localStorage.setItem = () => { throw new Error("quota"); };
    const refused = keepProfiles([mk("Camera One", "P9")]);
    globalThis.localStorage.setItem = was;
    isTrue("a device that refuses to keep a profile is told so, and the list is as it was", refused.refused === true && refused.stored === 0 && loadedFor(["cameraone"]).every((p) => p.name !== "P9"));
  }
  // THE FIELD, in the five places an EditParams field goes. cloneParams keeps it and lets absent stay absent; applySnapshot reads it from the snapshot directly (a merge with the live params
  // would hand a photograph that was never switched the last photograph's switch); a fresh open clears it; the input handler is the switch's own; and no look or stamp carries it.
  {
    const withP = cloneParams({ ...plain(), profile: "embedded" }), without = cloneParams(plain());
    isTrue("cloneParams keeps the profile switch and lets an unswitched edit stay without the key", withP.profile === "embedded" && !("profile" in without));
    const main = readFileSync(join(repo, "src/main.ts"), "utf8");
    const pipe = readFileSync(join(repo, "src/pipeline.ts"), "utf8");
    isTrue("EditParams declares the field as optional text, so an edit stored before it existed has none", /\n  profile\?: string;/.test(pipe));
    isTrue("applySnapshot reads the switch from the snapshot itself and clears it when the snapshot has none", /if \(s\.params\.profile\) params\.profile = s\.params\.profile; else delete params\.profile;/.test(main));
    isTrue("a fresh open clears the switch, and syncFromUI says why it does not read it back", (main.match(/delete params\.profile;/g) || []).length >= 2 && /`params\.profile` is NOT read back here/.test(main));
    isTrue("the switch has its own change handler", /balUi\.profile\.addEventListener\("change", balanceProfileInput\);/.test(main));
    const stamp = /function stampOf\([^]*?\n}/.exec(main);
    isTrue("the tile stamp does not carry the switch (it moves no pixel)", !!stamp && !/\.profile\b/.test(stamp[0]));
  }
}

console.log(bad ? `\n${bad} check(s) failed` : "\nthe three joins, an aim through them, a mask's own mixer, grade, Sky band, Luminance, LUT strength, curves and Shadow colour, and the white balance on Adobe's scale through a camera profile hold");
process.exit(bad ? 1 : 0);
