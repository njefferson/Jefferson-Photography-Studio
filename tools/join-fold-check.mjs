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
// Runs on every commit and needs no browser. Bundled with esbuild so it checks
// the functions the app ships rather than a copy of them.
import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "joinfold-"));
const entry = join(dir, "entry.ts");
writeFileSync(entry, `export { groupWeight, aimWeight, neutralMask } from ${JSON.stringify(join(process.cwd(), "src/pipeline.ts"))};`);
const out = join(dir, "bundle.mjs");
await build({ entryPoints: [entry], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { groupWeight, aimWeight, neutralMask } = await import(pathToFileURL(out).href);

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

console.log(bad ? `\n${bad} check(s) failed` : "\nthe three joins, and an aim through them, hold");
process.exit(bad ? 1 : 0);
