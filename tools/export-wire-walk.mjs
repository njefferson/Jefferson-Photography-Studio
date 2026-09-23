#!/usr/bin/env node
// EVERYTHING HANDED TO AN EXPORT WORKER HAS TO BE COPYABLE, AND NOTHING SAID SO.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/export-wire-walk.mjs [--port=8131]
//
//   npm install --no-save esbuild playwright-core
//
// NOT in .branch-guard's `also=`: it drives a real browser. Run it before a
// release, or through tools/walk-all.mjs, which picks up every *-walk.mjs here.
//
// WHY IT EXISTS. `exportBands` sends the photograph to each worker with
// `postMessage`, which structured-clones it — a WHOLE-OBJECT operation that
// throws on the first thing it cannot copy. The decoded image grew a
// `skySelReady`, a Promise, and developing a set handed that object straight
// over: every post threw `DataCloneError`, `Promise.all` rejected, and the
// catch around the pool wrote a line to a console that does not exist on a
// tablet and exported on one thread. Nothing was red. The thread count the app
// reported was honest — it really was one — so the app was telling the truth
// about a number nobody had a reason to disbelieve.
//
// AND IT ASSERTS THE GENERAL PROPERTY, NOT THE LAST BUG. Checking for
// `skySelReady` by name would pass the day somebody adds the next uncopyable
// field. This wraps `Worker.postMessage` from OUTSIDE the app and tries to
// structured-clone every photograph that goes over the wire, which is the same
// thing the browser is about to do — so it fails on a field that does not exist
// yet.
//
// IT DRIVES THE SET PATH ON PURPOSE. Exporting the open photograph posts a
// narrowed copy and was never affected; `runBatch` posts the decoded image
// itself, and that is the path the defect was on. A walk aimed at the wrong one
// of those two passes while the defect ships — which is exactly what the first
// attempt at this did.
import { chromium } from "playwright-core";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requireFreshDist } from "./fresh-dist.mjs";

requireFreshDist();
const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
let failed = 0;
const check = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${n}\n        got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  // The wrap goes in before any of the app's script runs, so nothing the app
  // does can be posted behind it.
  await ctx.addInitScript(() => {
    window.__wire = [];
    const orig = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (msg, ...rest) {
      try {
        if (msg && typeof msg === "object" && "current" in msg) {
          let clone = null;
          try { structuredClone(msg.current); } catch (e) { clone = `${e.name}: ${e.message}`; }
          window.__wire.push({ fields: Object.keys(msg.current || {}), clone });
        }
      } catch { /* never break the app in order to watch it */ }
      return orig.call(this, msg, ...rest);
    };
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => { console.log("FAIL  page error: " + e.message); failed++; });
  p.on("dialog", (d) => d.accept());

  // A PHOTOGRAPH BIG ENOUGH TO BE WORTH SPLITTING. The bundled practice JPEGs
  // are 0.2 MP, under the pool's 2 MP floor, so a walk built on them would
  // never reach the code it is testing — it would pass by never asking.
  const dataUrl = await p.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 3200; c.height = 2400;
    const g = c.getContext("2d");
    for (let y = 0; y < 2400; y += 8) for (let x = 0; x < 3200; x += 8) {
      g.fillStyle = `rgb(${(x * 7 + y * 3) % 256},${(y * 5) % 256},${(x * 11) % 256})`;
      g.fillRect(x, y, 8, 8);
    }
    return c.toDataURL("image/jpeg", 0.92);
  });
  const big = join(mkdtempSync(join(tmpdir(), "wire-")), "big.jpg");
  writeFileSync(big, Buffer.from(dataUrl.split(",")[1], "base64"));

  await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
  // Develop a set: the grade dialog, a grade, then the files — choosing the
  // files is what starts the run.
  await p.click("#batchBtn");
  await p.waitForFunction(() => document.getElementById("batchDlg")?.hasAttribute("open"), null, { timeout: 60000 });
  await p.click("#bcAuto");
  await p.setInputFiles("#batchFiles", [big]);
  // Poll SYNCHRONOUS state — something reaching the wire — never a promise.
  await p.waitForFunction(() => (window.__wire || []).length > 0, null, { timeout: 600000 });

  const wire = await p.evaluate(() => window.__wire);
  const broken = wire.filter((w) => w.clone);
  console.log(`\n  ${wire.length} photograph(s) went to an export worker`);
  console.log(`  fields on the wire: ${wire[0]?.fields.join(", ") || "none"}\n`);
  check("1 a set actually reached the export workers", wire.length > 0, true);
  check("2 every photograph on the wire can be copied", broken.map((w) => w.clone), []);
  await ctx.close();
} finally { await b.close(); }
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
