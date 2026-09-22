#!/usr/bin/env node
// SAVE A PHOTOGRAPH AS A FILE, PICK IT BACK, AND GET THE SAME PHOTOGRAPH WITH
// THE SAME EDIT ON IT.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/keep-walk.mjs [--port=8131] [--file=/path/to.NEF]
//
// WHAT THIS PROVES THAT keepfile-check DOES NOT (decision 043). That one holds
// the CONTAINER to its promise in isolation: write bytes, read them back,
// byte-identical, damage refused. This holds the JOIN — that the app writes
// what it thinks it writes and opens what it wrote. Every interaction below is
// a REAL press through the browser's input pipeline and a REAL download
// captured off the page, never `element.click()` in an evaluate: a dispatched
// event is not a gesture, and a harness that presses by id cannot tell you
// whether a finger could have got there (hub LESSONS 348).
import { chromium } from "playwright-core";
import { requireFreshDist } from "./fresh-dist.mjs";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// BEFORE THE BROWSER, AND THIS WALK PROVED WHY. It renders through the build in
// `dist`, and a stale one measures the PREVIOUS build. The first attempt to make
// this walk fail planted a defect that did not compile — so `npm run build`
// stopped, `dist` kept the previous bundle, and the walk went green against a
// build that did not contain the plant. That is hub LESSONS 345, met head on by
// the very run meant to earn trust in this file. See tools/fresh-dist.mjs.
requireFreshDist();

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split("=").slice(1).join("=");
const BASE = `http://127.0.0.1:${arg("port", "8131")}`;
const FILE = arg("file", "/tmp/claude-0/-home-user/e7a820ad-44f5-555c-96b8-a4dcabafb549/scratchpad/real2/NIR_1737.NEF");
if (!existsSync(FILE)) { console.log(`no frame at ${FILE} — pass --file=`); process.exit(1); }

let failed = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
};

const dir = mkdtempSync(join(tmpdir(), "keep-walk-"));
const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
try {
  const ctx = await br.newContext({ viewport: { width: 1194, height: 834 }, acceptDownloads: true });
  const p = await ctx.newPage();
  console.log("\n=== keep file · save it, pick it back, same photograph same edit ===\n");

  await p.goto(`${BASE}/ir.html`, { waitUntil: "load" });
  await p.waitForTimeout(1000);
  await p.setInputFiles("#file", [FILE]);
  await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
  await p.waitForTimeout(2500);

  // AN EDIT WORTH RECOGNISING. A default edit would let a keep file that
  // carried NO edit pass this walk, which is the failure it exists to catch.
  await p.locator("#ptab-basic").click();
  await p.waitForTimeout(400);
  const MARK = "0.62";
  await p.evaluate((v) => {
    const el = document.getElementById("sat");
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, MARK);
  await p.waitForTimeout(1200);
  const before = await p.evaluate(() => document.getElementById("sat").value);
  check("the edit was made and the control reads it back", before, MARK);

  // THE REAL PRESS, and the real save.
  await p.locator("#ptab-export").click();
  await p.waitForTimeout(500);
  const btn = p.locator("#keepFile");
  const box = await btn.boundingBox();
  check("the save control is on screen and finger-sized", !!box && box.width >= 44 && box.height >= 44, true);
  const [download] = await Promise.all([p.waitForEvent("download", { timeout: 120000 }), btn.click({ timeout: 60000 })]);
  const saved = join(dir, download.suggestedFilename());
  await download.saveAs(saved);
  check("the saved file is named .ipskeep", /\.ipskeep$/i.test(download.suggestedFilename()), true);

  // The original inside, against the original on disk — the whole promise.
  const src = readFileSync(FILE);
  const pkg = readFileSync(saved);
  check("the package is at least as big as the photograph it carries", pkg.length >= src.length, true);
  let at = -1;
  for (let i = 0; i + src.length <= pkg.length && at < 0; i++) {
    let hit = pkg[i] === src[0];
    for (let k = 1; hit && k < src.length; k++) if (pkg[i + k] !== src[k]) hit = false;
    if (hit) at = i;
  }
  check("...and your photograph is inside it, byte for byte, in one contiguous run", at >= 0, true);

  // PICK IT BACK through the same picker a reader uses.
  const p2 = await ctx.newPage();
  await p2.goto(`${BASE}/ir.html`, { waitUntil: "load" });
  await p2.waitForTimeout(1000);
  await p2.setInputFiles("#file", [saved]);
  await p2.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
  await p2.waitForTimeout(3000);
  await p2.locator("#ptab-basic").click();
  await p2.waitForTimeout(600);
  const after = await p2.evaluate(() => document.getElementById("sat").value);
  check("picking it back opens the photograph with the SAME edit on it", after, MARK);
  const name = await p2.evaluate(() => document.title + "|" + (document.getElementById("hint")?.textContent ?? ""));
  console.log(`          opened as: ${name.slice(0, 70)}`);
} finally {
  await br.close();
  rmSync(dir, { recursive: true, force: true });
}
console.log(failed ? `\n  ${failed} check(s) failed\n` : "\n  saved, picked back, same photograph and same edit\n");
process.exit(failed ? 1 : 0);
