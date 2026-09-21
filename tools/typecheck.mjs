#!/usr/bin/env node
// DOES THE APP STILL COMPILE? Every other gate in this repository's commit
// chain is a TEXT check, and not one of them builds anything.
//
// WHAT THAT COST, 2026-09-21. A comment was added inside the WebGL shader in
// `src/gl.ts`, which is a JavaScript template literal — and the comment quoted
// three identifiers in backticks. The first backtick ENDED the literal and the
// rest of the shader was parsed as TypeScript. All seventeen commit gates went
// green, the commit landed, and it was pushed to the session branch. It does
// not build. Nothing between typing it and the remote could have said so.
//
// The file already warned about it, in its own header, in capitals: a backtick
// in a comment ends the shader. It was read and it happened anyway, which is
// this family's standing evidence that an instruction in a file never once
// refused the commit it forbade.
//
// IT IS `tsc --noEmit`, which is the first half of `npm run build` and nothing
// new — about five seconds. The two slow hub gates were deliberately left out
// of this chain on the grounds that half a minute per commit gets routed
// around; five seconds to know the thing compiles is not that trade.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const repo = process.argv.find((a) => a.startsWith("--repo="))?.slice(7) ?? ".";
const tsc = `${repo}/node_modules/typescript/bin/tsc`;

console.log("\n=== typecheck · does it compile ===\n");
// A MISSING COMPILER IS A FAILURE, NEVER A SKIP — the same rule the branch
// guard applies to every check it is told to run. A gate that quietly stops
// running is the fail-open this whole chain exists to prevent.
if (!existsSync(tsc)) {
  console.error("  FAIL  typescript is not installed here — run `npm ci` first.");
  console.error("        A gate that cannot run is not a gate that passed.\n");
  process.exit(1);
}
try {
  execFileSync(process.execPath, [tsc, "--noEmit", "-p", `${repo}/tsconfig.json`], { stdio: "pipe", encoding: "utf8" });
} catch (e) {
  console.error("  FAIL  the app does not compile.\n");
  console.error((e.stdout || e.message).split("\n").slice(0, 40).map((l) => `        ${l}`).join("\n"));
  console.error("");
  process.exit(1);
}
console.log("  ok    tsc --noEmit is clean\n");
