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
// AND heal.ts, because the heal term is part of the budget now. It is bundled
// rather than re-derived here for the same reason the byte weight is read out
// of the allocation: a check that recomputed `spotRect`'s area would agree with
// a defect in `spotRect` on the day it shipped.
const healOut = join(dir, "heal.mjs");
const bundle = (src, dest) => execFileSync(join(repo, "node_modules", ".bin", "esbuild"),
  [join(repo, "src", src), "--bundle", "--format=esm", "--platform=neutral", `--outfile=${dest}`],
  { stdio: ["ignore", "ignore", "pipe"] });
try {
  bundle("exportparallel.ts", out);
  bundle("heal.ts", healOut);
} catch (e) {
  console.error(`  could not bundle the export modules: ${String(e.stderr ?? e).slice(0, 400)}`);
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
const { healPatchBytes } = await import(`file://${healOut}`);

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
// HEALED SPOTS ARE A MEMORY TERM NOW, NOT A BLANKET REFUSAL (055). Until that
// change `canRunParallel` refused any frame with a spot on it, so this file
// tested with an empty list and said in a comment that heal's refusal "is not
// about memory". It is entirely about memory now, and a frame with forty large
// spots must come back with a SMALLER pool rather than none at all.
//
// The two populated cases are the ends of the real range: a few dust marks off
// a stopped-down infrared frame, which is what the report that started this was
// about, and the most the app will let a reader place at the largest radius it
// allows. One is a rounding error and the other is 75 MB a worker.
const SPOTS = [
  { name: "none", spots: [] },
  { name: "three dust marks", spots: Array(3).fill({ x: 0.5, y: 0.5, r: 0.01, dx: 0.05, dy: 0.05 }) },
  { name: "forty, largest radius", spots: Array(40).fill({ x: 0.5, y: 0.5, r: 0.035, dx: 0.1, dy: 0.1 }) },
];
// Did billing heal ever actually change an answer? If not, the term is inert
// and this whole check would pass with `healBytes` ignored.
let healBit = null;
const baseline = new Map();

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
    // A 3:2 FRAME, because `spotRect` works in pixels and a spot's radius is a
    // fraction of the WIDTH — so the heal term needs dimensions, not an area.
    const srcW = Math.round(Math.sqrt(px * 1.5));
    const srcH = Math.round(px / srcW);
    for (const sc of SPOTS) {
      const healBytes = healPatchBytes(sc.spots, srcW, srcH);
      const job = { fileBytes: 26e6, srcPixels: px, outPixels: px, healBytes };
      const params = { spots: sc.spots, stickers: [] };
      for (const format of FORMATS) {
        const opts = { format };
        const approved = approvedWorkers(job, opts);
        // THE WHOLE CHECK: the pool the app starts must be the pool the band's
        // real weight buys. These are two different routes to one number.
        const byMeasured = workerCount(job, real[format]);
        if (approved !== byMeasured) {
          fail(`${d.name}, ${mp} MP ${format}, ${sc.name}: the app would start ${approved} worker(s), but ${real[format]} bytes a pixel only pays for ${byMeasured}`);
        }
        // ...and the gate must not disagree with the spawn about whether to run
        // at all. What it still refuses outright — stickers, a warp, a band, an
        // output under MIN_PIXELS — is not about memory. Healed spots WERE on
        // that list until 055 and are not any more: they are priced instead.
        const gate = canRunParallel(params, opts, job);
        const wantGate = approved >= 2 && px >= 2e6;
        if (gate !== wantGate) {
          fail(`${d.name}, ${mp} MP ${format}, ${sc.name}: canRunParallel says ${gate} while the pool is ${approved}`);
        }
        const key = `${d.name}|${mp}|${format}`;
        if (sc.spots.length === 0) baseline.set(key, approved);
        else {
          const none = baseline.get(key);
          if (none !== undefined && approved < none && !healBit) {
            healBit = `${d.name}, ${mp} MP ${format}: ${none} worker(s) clean, ${approved} with ${sc.name} (${(healBytes / 1e6).toFixed(1)} MB a worker)`;
          }
          if (none !== undefined && approved > none) {
            fail(`${d.name}, ${mp} MP ${format}, ${sc.name}: healing made the pool BIGGER (${none} to ${approved}) — the heal term is signed wrong`);
          }
        }
        if (VERBOSE) console.log(`  ${d.name.padEnd(24)} ${String(mp).padStart(5)} MP ${format.padEnd(5)} ${sc.name.padEnd(22)} -> ${approved} worker(s), gate ${gate ? "yes" : "no "}`);
      }
    }
  }
}
// THE TERM MUST BE ABLE TO BITE. Everything above would pass unchanged if
// `healBytes` were dropped on the floor — every spot case would simply agree
// with the clean one. This is the line that says the billing is load-bearing,
// and the line that fails if a later change stops threading it through.
if (!healBit) {
  fail("billing healed patches never changed the pool anywhere in this matrix — the heal term is inert, so nothing above is testing it");
} else {
  console.log(`  ok    healed patches are priced, and the price bites\n        ${healBit}`);
}

rmSync(dir, { recursive: true, force: true });

if (!failed) console.log(`  ok    ${DEVICES.length * MP.length * FORMATS.length * SPOTS.length} combinations: the pool never outruns what a band actually weighs\n`);
else console.error(`\n${failed} combination(s) size the pool for a band weight that is not the band's.\n`);
process.exit(failed ? 1 : 0);
