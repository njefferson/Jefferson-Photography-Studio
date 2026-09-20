#!/usr/bin/env node
// THE POOL IS SIZED FOR WHAT A BAND ACTUALLY WEIGHS.
//
//   node tools/pool-budget-check.mjs [--repo .] [--verbose]
//
// WHY IT EXISTS, and why tools/one-pool-check.mjs beside it is not enough.
// That one refuses a SECOND caller of `workerCount`, which is the shape the
// 2026-09-20 defect took: the gate approving an export at six bytes a pixel
// while the code starting the workers used the four-byte default, so the spawn
// could only ever exceed what had been approved — 629 MB against a 600 MB
// ceiling on a tablet-class device at ~31 MP, and a tablet kills the tab
// rather than swapping.
//
// A shape check proves there is ONE decider. It says nothing about whether
// that decider is told the truth. If `bytesPerPixel` ever returns 4 for a
// format whose band is a Uint16Array, every call site agrees with every other
// and all of them are wrong together — and the ceiling is breached in silence
// again, by one function instead of two.
//
// SO THIS COMPARES THE POOL AGAINST THE ALLOCATION ITSELF. The real weight is
// read out of src/export.ts, from the arrays a band is actually built from —
// `new Uint8ClampedArray(bandW * bandH * 4)` is four bytes a pixel and
// `new Uint16Array(bandW * bandH * 3)` is six — and the pool the app would
// start is then required to equal the pool those bytes would buy. Nothing here
// re-derives the memory model: it calls the app's own exported functions, one
// with the format's declared weight and one with its measured one, because a
// check that recomputed the arithmetic would have agreed with the defect on
// the day it shipped.
//
// It is arithmetic, no browser, so it runs in milliseconds and sits in
// .branch-guard's `also=` beside the other per-commit checks.
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = process.argv.find((a) => a.startsWith("--repo="))?.split("=")[1] ?? ".";
const VERBOSE = process.argv.includes("--verbose");
let failed = 0;
const fail = (m) => { console.error(`  FAIL  ${m}`); failed++; };

/** WHAT ONE PIXEL OF A BAND REALLY COSTS, per format, read from the allocation.
 *
 *  Takes `root`, the repository root. Returns `{ jpeg, tiff }` in bytes per
 *  pixel, parsed from the two typed arrays `src/export.ts` builds a band from.
 *  Throws when either allocation is not found, because a silent default here
 *  would be this check agreeing with the thing it exists to catch.
 *
 *  What the caller relies on: these are the bytes the export ACTUALLY spends,
 *  independent of anything `exportparallel.ts` believes about them. */
export function measuredBytesPerPixel(root = ".") {
  const src = readFileSync(join(root, "src", "export.ts"), "utf8");
  const grab = (ctor, width) => {
    const m = src.match(new RegExp(`new ${ctor}\\(bandW \\* bandH \\* (\\d+)\\)`));
    if (!m) throw new Error(`src/export.ts no longer builds a band with ${ctor}(bandW * bandH * N) — this check reads the real byte weight from there on purpose, so fix the reader rather than guessing a number here`);
    return Number(m[1]) * width;
  };
  return { jpeg: grab("Uint8ClampedArray", 1), tiff: grab("Uint16Array", 2) };
}

// The module's imports are all `import type`, so it bundles with no runtime
// dependencies and can be called directly.
const dir = mkdtempSync(join(tmpdir(), "poolbudget-"));
const out = join(dir, "ep.mjs");
try {
  execFileSync(join(repo, "node_modules", ".bin", "esbuild"),
    [join(repo, "src", "exportparallel.ts"), "--bundle", "--format=esm", "--platform=neutral", `--outfile=${out}`],
    { stdio: ["ignore", "ignore", "pipe"] });
} catch (e) {
  console.error(`  could not bundle src/exportparallel.ts: ${String(e.stderr ?? e).slice(0, 400)}`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(2);
}

const real = measuredBytesPerPixel(repo);
console.log(`\n=== pool budget · a band weighs ${real.jpeg} bytes a pixel as JPEG, ${real.tiff} as TIFF ===\n`);

// `canRunParallel` opens with `typeof Worker === "undefined"`, which is the
// right answer in a browser without workers and the wrong one here: Node has
// no `Worker` global, so without this every gate row reads false and the gate
// half of this check measures nothing. It is never constructed — the functions
// under test only ask whether the name exists.
if (typeof globalThis.Worker === "undefined") {
  Object.defineProperty(globalThis, "Worker", { configurable: true, value: class {} });
}

const mod = await import(`file://${out}`);
const { approvedWorkers, workerCount, canRunParallel } = mod;

// The three device classes the budget itself distinguishes, plus the case that
// matters most: no `deviceMemory` at all, which is every Safari and therefore
// every iPad. That one must land on the tablet numbers.
const DEVICES = [
  { name: "iPad / Safari (no hint)", mem: undefined, cores: 8 },
  { name: "4 GB, 6 cores", mem: 4, cores: 6 },
  { name: "8 GB, 8 cores", mem: 8, cores: 8 },
  { name: "32 GB, 12 cores", mem: 32, cores: 12 },
];
const MP = [2, 5.2, 12, 20.9, 31, 45, 61];
const FORMATS = ["jpeg", "tiff"];
const params = { spots: [], stickers: [] };

for (const d of DEVICES) {
  // `globalThis.navigator` is a getter-only property on Node 22, so it is
  // redefined rather than assigned. The app reads `navigator.deviceMemory` and
  // `navigator.hardwareConcurrency` and nothing else off it.
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { hardwareConcurrency: d.cores, ...(d.mem === undefined ? {} : { deviceMemory: d.mem }) },
  });
  for (const mp of MP) {
    const px = Math.round(mp * 1e6);
    const job = { fileBytes: 26e6, srcPixels: px, outPixels: px };
    for (const format of FORMATS) {
      const opts = { format };
      const approved = approvedWorkers(job, opts);
      // THE WHOLE CHECK: the pool the app starts must be the pool the band's
      // real weight buys. These are two different routes to one number.
      const byMeasured = workerCount(job, real[format]);
      if (approved !== byMeasured) {
        fail(`${d.name}, ${mp} MP ${format}: the app would start ${approved} worker(s), but ${real[format]} bytes a pixel only pays for ${byMeasured}`);
      }
      // ...and the gate must not disagree with the spawn about whether to run
      // at all. Everything else it refuses (healed spots, stickers, a warp, a
      // band, an output under MIN_PIXELS) is not about memory.
      const gate = canRunParallel(params, opts, job);
      const wantGate = approved >= 2 && px >= 2e6;
      if (gate !== wantGate) {
        fail(`${d.name}, ${mp} MP ${format}: canRunParallel says ${gate} while the pool is ${approved}`);
      }
      if (VERBOSE) console.log(`  ${d.name.padEnd(24)} ${String(mp).padStart(5)} MP ${format.padEnd(5)} → ${approved} worker(s), gate ${gate ? "yes" : "no "}`);
    }
  }
}
rmSync(dir, { recursive: true, force: true });

if (!failed) console.log(`  ok    ${DEVICES.length * MP.length * FORMATS.length} combinations: the pool never outruns what a band actually weighs\n`);
else console.error(`\n${failed} combination(s) size the pool for a band weight that is not the band's.\n`);
process.exit(failed ? 1 : 0);
