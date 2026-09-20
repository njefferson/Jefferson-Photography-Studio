#!/usr/bin/env node
// WHAT THE EXPORT PANEL SAYS, EXACTLY ONCE. It counted one waiting file as two
// because the same sentence was appended twice, and Dismiss put the panel
// straight back.
//
// MOVED IN FROM THE SESSION SCRATCHPAD, 2026-09-14. It was rebuilt there before
// each release and held nowhere, so a session that did not know it existed
// shipped without it and a container going away took it with it. Four walks were
// in this directory and roughly eighteen were not, including the export gate.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/export-report-walk.mjs
//
//   npm install --no-save esbuild playwright-core axe-core
//
// NOT in .branch-guard's `also=`: it drives a real browser and decodes RAW
// files. Run it before a release, or through tools/walk-all.mjs.
// THE SEQUENCE A READER ACTUALLY PERFORMED, on Windows, against v2.45:
// export, save, and find the panel claiming one file twice, a Dismiss that does
// not dismiss, and a second copy of a file already on disk.
import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
const DIR = "/home/user/Jefferson-Photography-Studio/public/examples";
const TWO = ["canopy.dng","hillside.dng"].map(f=>`${DIR}/${f}`);
let failed=0; const check=(n,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)failed++;console.log(`${ok?"ok  ":"FAIL"}  ${n}\n        got ${JSON.stringify(g)} want ${JSON.stringify(w)}`);};
const panel = (p) => p.evaluate(() => {
  const s = document.getElementById("exportStrip");
  return { hidden: !!s?.hidden, text: s?.hidden ? "" : (document.getElementById("exportStripText")?.textContent || "") };
});
/** How many times the panel says a file is waiting. One file, one sentence. */
const waitingLines = (t) => (t.match(/exported, not yet saved/g) || []).length;
const dbCount = (p, name) => p.evaluate((n) => new Promise((res) => {
  const rq = indexedDB.open(n, 2);
  rq.onsuccess = () => { const db = rq.result;
    if (!db.objectStoreNames.contains("meta")) { db.close(); res(0); return; }
    const c = db.transaction("meta").objectStore("meta").count();
    c.onsuccess = () => { const v = c.result; db.close(); res(v); }; c.onerror = () => { db.close(); res(-1); }; };
  rq.onerror = () => res(-1);
}), name);
async function exportOne(p) {
  await p.click("#ptab-export");
  await p.click("#exBtn");
  await p.waitForFunction(()=>/^Ready —/m.test(document.getElementById("exportStripText")?.textContent||""),null,{timeout:600000});
}
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on("pageerror", e => { console.log("FAIL  page error: " + e.message); failed++; });
  p.on("dialog", d => d.accept());
  const saved = [];
  p.on("download", d => saved.push(d.suggestedFilename()));
  await p.goto("http://127.0.0.1:8131/ir.html");
  await p.setInputFiles("#file", TWO);
  await p.waitForFunction((n)=>document.querySelectorAll("#sessionThumbs .session-thumb").length===n, TWO.length, {timeout:300000});
  await p.waitForFunction(()=>{const t=[...document.querySelectorAll("#sessionThumbs .session-thumb")];return t.every(x=>!x.disabled);},null,{timeout:300000});
  await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});

  // --- export one, save it ------------------------------------------------
  await exportOne(p);
  await p.click("#exportSave");
  await p.waitForFunction(()=>!/^Ready —/m.test(document.getElementById("exportStripText")?.textContent||""),null,{timeout:60000}).catch(()=>{});
  const after = await panel(p);
  check("1 saving the file takes it out of the collection", await dbCount(p,"ips-exports"), 0);
  check("2 nothing is left offering it a second time",
    await p.evaluate(()=>document.getElementById("exportSaveAll")?.hidden ?? "gone"), true);
  check("3 the panel never says one file is waiting twice", waitingLines(after.text), 0);
  check("4 and only one file reached the disk", saved.length, 1);

  // --- export again, and press Dismiss ------------------------------------
  await exportOne(p);
  const before = await panel(p);
  check("5 a finished export says it is ready, once", [/^Ready —/m.test(before.text), waitingLines(before.text)], [true, 0]);
  await p.click("#exportDismiss");
  const dismissed = await panel(p);
  check("6 Dismiss dismisses", dismissed.hidden, true);
  check("7 and keeps the file", await dbCount(p,"ips-exports"), 1);

  // --- and there is a way back to it --------------------------------------
  await p.click("#ptab-export");
  const back = await p.evaluate(() => {
    const row = document.getElementById("exportWaitingRow");
    if (!row || row.hidden) return "no route back";
    const btn = row.querySelector("button");
    return { text: row.textContent.replace(/\s+/g," ").trim(), tall: Math.round(btn?.getBoundingClientRect().height ?? 0) };
  });
  check("8 the Export panel offers the waiting export", typeof back === "object" && /1/.test(back.text) && back.tall >= 44, true);
  await ctx.close();
} finally { await b.close(); }
console.log(failed?`\n${failed} check(s) failed`:"\nall checks passed");
process.exit(failed?1:0);
