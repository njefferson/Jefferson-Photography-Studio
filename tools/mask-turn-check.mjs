#!/usr/bin/env node
// A RADIAL MASK TURNS (027), AND EVERY OVAL SAVED BEFORE IT STAYS WHERE IT WAS.
//
// `MaskLayer.angle` turns a radial mask's oval, and the record names the two
// ways that goes wrong without anything going red. The first is an old edit
// moving: every radial mask ever saved has no angle, and if the new arithmetic
// is not EXACTLY the old one at angle 0 every one of them shifts by a rounding
// error in every renderer — so this holds the unturned weight to the old
// formula bit for bit, written out here rather than imported, because the
// function under test is the thing that changed. The second is the turn being
// applied in uv: image uv is a different unit across than down on any
// photograph that is not square, so an oval turned in uv SHEARS instead of
// turning, and a circle stops being a circle. So the checks below run at a 3:2
// aspect, where that difference is half again, and ask the shape questions
// directly: a circle in pixels turns into itself, a quarter turn swaps the
// oval's reach across and down in pixels, half a turn is the same oval, and the
// outline `radialPoint` draws is the edge `maskWeight` weighs.
//
// And the aspect has to REACH the weight from every caller: `aimWeight`, the
// Foliage and Sky bands and `compileEdit` each pass it now, and a caller that
// dropped it would weigh a turned oval at aspect 1 — a different oval from the
// one the screen draws, on the export only. The last checks hold each of them
// to `maskWeight` at the photograph's own aspect.
//
// The shader's copy of the same arithmetic cannot be reached from node; holding
// it to these is a browser walk's job (screen against export at a point only the
// turned oval covers). This needs no browser. Bundled with esbuild so it checks
// the functions the app ships rather than a copy of them.
import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "maskturn-"));
const entry = join(dir, "entry.ts");
writeFileSync(entry, `export { maskWeight, radialLocal, radialPoint, aimWeight, foliageAt, neutralMask, compileEdit, hslDefault, TONE_DEFAULT, CROP_DEFAULT } from ${JSON.stringify(join(process.cwd(), "src/pipeline.ts"))};`);
const out = join(dir, "bundle.mjs");
await build({ entryPoints: [entry], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { maskWeight, radialLocal, radialPoint, aimWeight, foliageAt, neutralMask, compileEdit, hslDefault, TONE_DEFAULT, CROP_DEFAULT } = await import(pathToFileURL(out).href);

let bad = 0;
const check = (name, ok, detail = "") => {
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${ok || !detail ? "" : ` — ${detail}`}`);
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const A = 1.5; // a 3:2 frame, the Z 50's

// The weight as it was computed before 027, written out: axis-aligned, in uv.
const smooth01 = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0 || 1e-4))); return t * t * (3 - 2 * t); };
const oldRadial = (m, u, v) => {
  const dx = (u - m.cx) / Math.max(1e-4, m.rx);
  const dy = (v - m.cy) / Math.max(1e-4, m.ry);
  const w = 1 - smooth01(1 - m.feather, 1, Math.sqrt(dx * dx + dy * dy));
  return m.invert ? 1 - w : w;
};
const grid = [];
for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) grid.push([i / 40, j / 40]);

// 1. Nothing saved before 027 moves.
{
  const m = { ...neutralMask(0), cx: 0.43, cy: 0.61, rx: 0.21, ry: 0.13, feather: 0.37 };
  let worst = 0;
  for (const [u, v] of grid) for (const asp of [1, A, 0.75]) {
    worst = Math.max(worst, Math.abs(maskWeight(m, u, v, asp) - oldRadial(m, u, v)));
    worst = Math.max(worst, Math.abs(maskWeight({ ...m, angle: 0 }, u, v, asp) - oldRadial(m, u, v)));
  }
  check("an unturned oval weighs exactly what it weighed before 027, at any aspect, angle absent or 0", worst === 0, `worst difference ${worst}`);
  const inv = { ...m, invert: true };
  let worstInv = 0;
  for (const [u, v] of grid) worstInv = Math.max(worstInv, Math.abs(maskWeight(inv, u, v, A) - oldRadial(inv, u, v)));
  check("an inverted unturned oval likewise", worstInv === 0, `worst difference ${worstInv}`);
  const [lx, ly] = radialLocal(m, 0.7, 0.2, A);
  check("radialLocal is exactly the offset when unturned", lx === 0.7 - m.cx && ly === 0.2 - m.cy);
}

// 2. A circle IN PIXELS turns into itself. At 3:2 that circle is rx = r / A
//    across and ry = r down; turned in uv it would shear into a tilted oval.
{
  const r = 0.2;
  const circle = { ...neutralMask(0), cx: 0.5, cy: 0.5, rx: r / A, ry: r, feather: 0.3 };
  let worst = 0;
  for (const ang of [0.3, 0.9, 1.7, -2.4]) {
    const turned = { ...circle, angle: ang };
    for (const [u, v] of grid) worst = Math.max(worst, Math.abs(maskWeight(turned, u, v, A) - maskWeight(circle, u, v, A)));
  }
  check("a circle in pixels is the same circle at every turn (the turn is in pixels, not uv)", worst < 1e-9, `worst difference ${worst}`);
}

// 3. A quarter turn swaps the oval's reach across and down, IN PIXELS: an oval
//    reaching rx of the width across reaches rx * A of the height down.
{
  const m = { ...neutralMask(0), cx: 0.5, cy: 0.5, rx: 0.3, ry: 0.06, feather: 0.02, angle: Math.PI / 2 };
  const reachDown = m.rx * A; // 0.45 of the height
  check("a quarter-turned long oval covers a point down its first axis, short of its reach",
    maskWeight(m, 0.5, 0.5 + reachDown * 0.95, A) === 1, `weight ${maskWeight(m, 0.5, 0.5 + reachDown * 0.95, A)}`);
  check("and not a point past that reach", maskWeight(m, 0.5, 0.5 + reachDown * 1.05, A) === 0);
  check("and no longer covers where its first axis used to reach across", maskWeight(m, 0.5 + m.rx * 0.9, 0.5, A) === 0);
  const across = m.ry / A; // its second axis now runs across, ry of the height = ry / A of the width
  check("its second axis now runs across, at ry of the height in pixels", maskWeight(m, 0.5 + across * 0.9, 0.5, A) === 1 && maskWeight(m, 0.5 + across * 1.1, 0.5, A) === 0);
}

// 4. Half a turn is the same oval; a turn of a + pi weighs as a.
{
  const m = { ...neutralMask(0), cx: 0.4, cy: 0.55, rx: 0.25, ry: 0.08, feather: 0.4, angle: 0.6 };
  let worst = 0;
  for (const [u, v] of grid) worst = Math.max(worst, Math.abs(maskWeight(m, u, v, A) - maskWeight({ ...m, angle: 0.6 + Math.PI }, u, v, A)));
  check("half a turn on is the same oval", worst < 1e-9, `worst difference ${worst}`);
  // And the turn does something, so the three checks above are not vacuous.
  let moved = 0;
  for (const [u, v] of grid) moved = Math.max(moved, Math.abs(maskWeight(m, u, v, A) - maskWeight({ ...m, angle: 0 }, u, v, A)));
  check("a turn of 0.6 rad moves the selection (so the checks are live)", moved > 0.5, `largest change ${moved}`);
  // Positive turns the first axis from +u towards +v (clockwise as shown).
  const d = 0.2;
  const [pu, pv] = [m.cx + (Math.cos(0.6) * d) / A, m.cy + Math.sin(0.6) * d];
  check("positive turns the first axis from +u towards +v", maskWeight({ ...m, feather: 0.02 }, pu, pv, A) === 1);
}

// 5. The outline is the edge: radialPoint and radialLocal are inverses, and
//    every outline point sits at radius 1, where the weight reaches 0.
{
  const m = { ...neutralMask(0), cx: 0.45, cy: 0.5, rx: 0.22, ry: 0.11, feather: 0.5, angle: -1.1 };
  let worstInv = 0, worstEdge = 0;
  for (let k = 0; k < 64; k++) {
    const t = (k / 64) * Math.PI * 2;
    const [u, v] = radialPoint(m, t, A);
    const [lx, ly] = radialLocal(m, u, v, A);
    worstInv = Math.max(worstInv, Math.abs(lx - m.rx * Math.cos(t)), Math.abs(ly - m.ry * Math.sin(t)));
    worstEdge = Math.max(worstEdge, maskWeight(m, u, v, A));
  }
  check("radialLocal undoes radialPoint at every point round the oval", worstInv < 1e-12, `worst ${worstInv}`);
  check("every outline point is where the weight reaches 0", worstEdge < 1e-9, `largest weight on the outline ${worstEdge}`);
  const inner = radialPoint({ ...m, rx: m.rx * 0.3, ry: m.ry * 0.3 }, 1.3, A);
  check("a point well inside the turned outline is fully selected", near(maskWeight(m, inner[0], inner[1], A), 1));
}

// 6. Every caller hands the weight the photograph's aspect.
{
  const AIM = 1;
  const m = { ...neutralMask(0), cx: 0.5, cy: 0.5, rx: 0.3, ry: 0.05, feather: 0.02, angle: 0.9, aims: AIM };
  // A point inside the oval at the true aspect and outside it at aspect 1.
  let probe = null;
  for (const [u, v] of grid) if (maskWeight(m, u, v, A) === 1 && maskWeight(m, u, v, 1) === 0) { probe = [u, v]; break; }
  check("a point exists that the aspect decides (so the checks below can fail)", !!probe);
  if (probe) {
    const [u, v] = probe;
    check("aimWeight weighs a turned oval at the aspect it is given", aimWeight([[m]], AIM, u, v, A) === 1 && aimWeight([[m]], AIM, u, v, 1) === 0);
    const fol = [0, 1, 1], px = [0, 0, 0];
    foliageAt(fol, [[{ ...m, fol: [10, 0, 0] }]], u, v, px, A);
    check("the Foliage band reaches a turned oval at the aspect it is given", near(px[0], 10), `hue offset ${px[0]}`);
    // compileEdit: a head with brightness 2 over a mid-grey pixel at the probe.
    // The same plain edit join-fold-check renders through.
    const T = TONE_DEFAULT;
    const plain = () => ({ wb: [1, 1, 1], exposure: 1, swapRB: false, hue: 0, sat: 1, contrast: 1, denoise: 0, tint: [1, 1, 1], glow: 0, sky: [0, 1, 1], foliage: [0, 1, 1], tone: [...T], toneR: [...T], toneG: [...T], toneB: [...T], lum: 1, masks: [], hotspot: 0, hotspotSize: 0.5, hotspotColor: 0, vignette: 0, lensFix: 0, lensBypass: false, forceBalance: false, hsFix: 0, hsBypass: false, hsl: hslDefault(), bwOn: false, bwMix: [1, 1, 1], clarity: 0, dehaze: 0, sharpen: 0, texture: 0, spots: [], crop: { ...CROP_DEFAULT }, straighten: 0 });
    const at = (asp, masks) => { const p = plain(); p.masks = masks; const o = new Float32Array(4); compileEdit(p, undefined, asp)(0.18, 0.18, 0.18, o, 0, u, v); return o[1]; };
    const bright = { ...m, aims: 0, brightness: 2 };
    const bare = at(A, []);
    check("compileEdit applies a turned oval's adjustment at the photograph's aspect", at(A, [bright]) > bare + 0.02, `${at(A, [bright])} against ${bare}`);
    check("and not where the oval is only at aspect 1", near(at(1, [bright]), bare, 1e-6), `${at(1, [bright])} against ${bare}`);
  }
}

console.log(bad ? `\n${bad} check(s) failed` : "\na radial mask turns as a shape, in every caller, and an unturned one has not moved");
process.exit(bad ? 1 : 0);
