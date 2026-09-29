#!/usr/bin/env node
// THE REPORT'S CENTRE GAINS ARE THE GAINS THAT LAND.
//
// The diagnostic report's "Centre gains" line answers the one question a
// hot-spot raises — what is the correction doing to the middle of the frame —
// and it worked the answer out for itself, from the stored bins through
// `lensGain`. The renderers do not apply the stored bins: since 2026-09-17 every
// colour curve is multiplied by its area mean first (`lensAreaMean`, decision
// 015), and a brightness half whose length disagrees with the colour half is
// dropped (`lensGainsFor`). So the report described a correction nothing
// applies, on every matched photograph, while the card beside it — which read
// `lensGains` — gave different numbers for the same frame.
//
// The line is now `lensCentreLine` in src/lensflat.ts and reads `lensGains`.
// This holds every gain it prints to `lensGains` at the centre bin, to the three
// decimals it prints, over every shipped profile at four strengths, plus two
// curves built to separate the two formulas: one whose anchor cancels it
// entirely and one whose brightness half is the wrong length.
//
// Needs no browser. Bundled with esbuild, as lens-store-check is, so it checks
// the functions the app ships rather than a copy.
import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

console.log("MADE TO FAIL: lensCentreLine reverted to reading the stored bins through lensGain failed 215 of 290 cases, both made-up curves among them (2026-09-29); the 72 at strength 0 cannot tell the two apart.");

const dir = mkdtempSync(join(tmpdir(), "lensdiag-"));
const entry = join(dir, "entry.ts");
const src = (f) => JSON.stringify(join(process.cwd(), f));
writeFileSync(entry, `export { lensCentreLine, lensGains } from ${src("src/lensflat.ts")};
export { lensHalves } from ${src("src/hotspot.ts")};
export { SHIPPED_PROFILES } from ${src("src/hotspotProfiles.ts")};`);
const out = join(dir, "bundle.mjs");
await build({ entryPoints: [entry], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { lensCentreLine, lensGains, lensHalves, SHIPPED_PROFILES } = await import(pathToFileURL(out).href);

let bad = 0, cases = 0;
const fail = (s) => { bad++; console.log(`FAIL  ${s}`); };

// What the line prints, read back out of its own text.
function printed(line) {
  const m = /^red ([\d.]+)x · blue ([\d.]+)x · brightness ([\d.]+)x/.exec(line);
  if (m) return { gr: m[1], gb: m[2], gg: m[3] };
  const b = /^brightness only · centre ([\d.]+)x/.exec(line);
  if (b) return { gg: b[1] };
  return null;
}

function check(label, curve, s) {
  cases++;
  const line = lensCentreLine(curve, s);
  const got = printed(line);
  if (!got) { fail(`${label} at ${s}: the line has neither shape — "${line}"`); return; }
  const g = lensGains(curve, s);
  const want = { gr: g ? g.gr[0] : 1, gb: g ? g.gb[0] : 1, gg: g ? g.gg[0] : 1 };
  const off = Object.keys(got).filter((k) => got[k] !== want[k].toFixed(3));
  if (off.length) fail(`${label} at ${s}: prints ${off.map((k) => `${k} ${got[k]}x`).join(", ")}; lensGains lands ${off.map((k) => `${want[k].toFixed(3)}x`).join(", ")} — "${line}"`);
}

// The curve a shipped profile becomes, by the route main.ts's currentLensCurve
// takes with no measurement of the reader's own.
const strengths = [0, 0.25, 1, 1.5];
for (const p of SHIPPED_PROFILES) {
  const { colour, bump } = lensHalves(null, p);
  if (!colour && !bump) continue;
  const curve = { kr: colour?.kr, kb: colour?.kb, bump: bump ?? undefined };
  for (const s of strengths) check(p.key, curve, s);
}

// Two curves built to separate the formulas. A flat 0.9 red curve is cancelled
// by its own area mean, so what lands is 1.000x where the stored bin reads
// 1.111x. A 40-bin brightness half beside 80-bin colour is dropped by the
// renderers, so what lands on brightness is 1.000x where bump[0] reads more.
const N = 80;
check("made-up: anchor cancels a flat red curve", { kr: new Array(N).fill(0.9), kb: new Array(N).fill(1) }, 1);
check("made-up: brightness half of the wrong length", { kr: new Array(N).fill(1), kb: new Array(N).fill(1.1), bump: new Array(40).fill(0.2) }, 1);

console.log(bad ? `${bad} FAIL of ${cases} cases` : `ok    ${cases} cases: every gain the report's centre line prints is the gain lensGains lands (${SHIPPED_PROFILES.length} shipped profiles at ${strengths.join(", ")}, and 2 made-up curves)`);
process.exit(bad ? 1 : 0);
