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
// can carry them, because the mixer runs after the mask stage.
//
// Runs on every commit and needs no browser. Bundled with esbuild so it checks
// the functions the app ships rather than a copy of them.
import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "joinfold-"));
const entry = join(dir, "entry.ts");
writeFileSync(entry, `export { groupWeight, aimWeight, neutralMask, compileEdit, hslDefault, TONE_DEFAULT, CROP_DEFAULT } from ${JSON.stringify(join(process.cwd(), "src/pipeline.ts"))};`);
const out = join(dir, "bundle.mjs");
await build({ entryPoints: [entry], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { groupWeight, aimWeight, neutralMask, compileEdit, hslDefault, TONE_DEFAULT, CROP_DEFAULT } = await import(pathToFileURL(out).href);

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

console.log(bad ? `\n${bad} check(s) failed` : "\nthe three joins, an aim through them, and a mask's own mixer hold");
process.exit(bad ? 1 : 0);
