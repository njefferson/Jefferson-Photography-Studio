#!/usr/bin/env node
// FINISHED EXPORTS COLLECT INTO ONE HANDOVER — the image itself when there is
// one, a zip when there are more — and they are kept APART from Batch, so saving
// a batch cannot sweep a morning's keepers.
//
// MOVED IN FROM THE SESSION SCRATCHPAD, 2026-09-14. It was rebuilt there before
// each release and held nowhere, so a session that did not know it existed
// shipped without it and a container going away took it with it. Four walks were
// in this directory and roughly eighteen were not, including the export gate.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/collect-walk.mjs
//
//   npm install --no-save esbuild playwright-core axe-core
//
// NOT in .branch-guard's `also=`: it drives a real browser and decodes RAW
// files. Run it before a release, or through tools/walk-all.mjs.
// FINISHED EXPORTS COLLECT, and hand over in one press.
import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
import { readFileSync } from "node:fs";
const DIR = "/home/user/Jefferson-Photography-Studio/public/examples";
const TWO = ["canopy.dng","hillside.dng"].map(f=>`${DIR}/${f}`);
let failed=0; const check=(n,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)failed++;console.log(`${ok?"ok  ":"FAIL"}  ${n}\n        got ${JSON.stringify(g)} want ${JSON.stringify(w)}`);};
const dbCount = (p, name) => p.evaluate((n) => new Promise((res) => {
  const rq = indexedDB.open(n, 2);
  rq.onsuccess = () => { const db = rq.result;
    if (!db.objectStoreNames.contains("meta")) { db.close(); res(0); return; }
    const c = db.transaction("meta").objectStore("meta").count();
    c.onsuccess = () => { const v = c.result; db.close(); res(v); }; c.onerror = () => { db.close(); res(-1); }; };
  rq.onerror = () => res(-1);
}), name);
const strip = (p) => p.evaluate(()=>document.getElementById("exportStripText")?.textContent||"");

async function exportOne(p) {
  await p.click("#ptab-export");
  await p.click("#exBtn");
  await p.waitForFunction(()=>/^Ready —/.test(document.getElementById("exportStripText")?.textContent||""),null,{timeout:600000});
}
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on("pageerror", e => { console.log("FAIL  page error: " + e.message); failed++; });
  p.on("dialog", d => d.accept());
  await p.goto("http://127.0.0.1:8131/ir.html");
  await p.setInputFiles("#file", TWO);
  await p.waitForFunction((n)=>document.querySelectorAll("#sessionThumbs .session-thumb").length===n, TWO.length, {timeout:300000});
  await p.waitForFunction(()=>{const t=[...document.querySelectorAll("#sessionThumbs .session-thumb")];return t.every(x=>!x.disabled);},null,{timeout:300000});
  await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});

  await exportOne(p);
  // Kept in the store — and NOT announced twice: the file on offer is the same
  // one, so a "1 exported, not yet saved" line beside "Ready — …" would be the
  // app counting one file as two.
  check("1 the first export is kept, and not counted twice on the line",
    [await dbCount(p,"ips-exports"), /exported, not yet saved/.test(await strip(p))], [1, false]);
  // The second photo, undecided on purpose: a verdict is a separate fact.
  await p.evaluate(()=>document.querySelectorAll("#sessionThumbs .session-thumb")[1].click());
  await p.waitForFunction(()=>document.querySelectorAll("#sessionThumbs .session-thumb")[1]?.classList.contains("active"),null,{timeout:300000});
  await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});
  await exportOne(p);
  check("2 two exports are kept, picked or not", /2 exported, not yet saved/.test(await strip(p)), true);
  check("3 they are in their own database, not the batch one",
    [await dbCount(p,"ips-exports"), await dbCount(p,"ips-batch")], [2, 0]);

  // A reload must not lose them, and must say so in its own words.
  await p.reload();
  await p.waitForFunction(()=>{const e=document.getElementById("exportStrip");return e && !e.hidden;},null,{timeout:60000});
  check("4 after a reload they are still offered", /2 exported, not yet saved/.test(await strip(p)), true);
  check("5 and the batch recovery offer stays out of it",
    await p.evaluate(()=>document.getElementById("recoverBtn")?.hidden ?? "no such button"), "no such button");

  // Two or more hand over as one zip.
  const dl = p.waitForEvent("download", { timeout: 300000 }); dl.catch(()=>{});
  await p.click("#exportSaveAll");
  const d = await dl;
  const bytes = readFileSync(await d.path());
  check("6 two exports hand over as one zip", /\.zip$/.test(d.suggestedFilename()), true);
  check("7 and it really is a zip holding two files",
    [bytes[0], bytes[1], (bytes.toString("latin1").match(/PK\x03\x04/g)||[]).length], [0x50, 0x4b, 2]);
  await p.waitForFunction(()=>{const e=document.getElementById("exportStrip");return !e || e.hidden;},null,{timeout:60000});
  check("8 saving them clears the collection", await dbCount(p,"ips-exports"), 0);

  // One on its own hands over as the file, never a zip of one. The reload above
  // left the start screen showing — the session is offered, not resumed — so the
  // editor has to be put back before anything can be exported from it.
  await p.click("#resumeSession");
  await p.waitForFunction(()=>document.querySelectorAll("#sessionThumbs .session-thumb").length===2,null,{timeout:300000});
  await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});
  await exportOne(p);
  // Dismiss puts the LINE away — all of it, which is what the button says — and
  // KEEPS the file. The way back is the row in the Export panel, which is the
  // one surface that does not go away when the floating line is dismissed.
  await p.click("#exportDismiss");
  await p.waitForFunction(()=>{const s=document.getElementById("exportStrip");return !s || s.hidden;},null,{timeout:30000});
  await p.click("#ptab-export");
  await p.waitForFunction(()=>{const r=document.getElementById("exportWaitingRow");return r && !r.hidden;},null,{timeout:30000});
  check("8a Dismiss hides the line, keeps the file, and the panel offers it",
    [await dbCount(p,"ips-exports"),
     await p.evaluate(()=>document.getElementById("exportWaitingText").textContent.trim())],
    [1, "1 export is waiting to be saved."]);
  const dl2 = p.waitForEvent("download", { timeout: 300000 }); dl2.catch(()=>{});
  await p.click("#exportWaitingSave");
  const d2 = await dl2;
  check("9 one export hands over as the image, not a zip of one",
    [/\.zip$/.test(d2.suggestedFilename()), /\.(jpg|jpeg|tif|tiff)$/i.test(d2.suggestedFilename())], [false, true]);
  // THE SAME PHOTO TWICE. The store outlives the session, so a second export of
  // a photo exported yesterday would hit the meta store's unique key and abort
  // the whole write — throwing finished bytes away with it.
  await exportOne(p);
  await exportOne(p);
  const names = await p.evaluate(() => new Promise((res) => {
    const rq = indexedDB.open("ips-exports", 2);
    rq.onsuccess = () => { const db = rq.result; const g = db.transaction("meta").objectStore("meta").getAll();
      g.onsuccess = () => { const v = g.result.map(m => m.name).sort(); db.close(); res(v); }; };
    rq.onerror = () => res(["error"]);
  }));
  check("10 the same photo exported twice is kept twice, under different names",
    [names.length, new Set(names).size], [2, 2]);

  // A BATCH SAVE MUST NOT SWEEP THEM. Batch clears the store it bundled; these
  // live in another one, and that is the whole reason it is another one.
  const survived = await p.evaluate(async () => {
    const clear = (name) => new Promise((res) => {
      const rq = indexedDB.open(name, 2);
      rq.onsuccess = () => { const db = rq.result; const t = db.transaction(["meta","chunks"], "readwrite");
        t.oncomplete = () => { db.close(); res(true); }; t.onerror = () => { db.close(); res(false); };
        t.objectStore("meta").clear(); t.objectStore("chunks").clear(); };
      rq.onerror = () => res(false);
    });
    await clear("ips-batch"); // what saving a batch does
    return true;
  });
  check("11 clearing the batch store leaves the exports alone",
    [survived, await dbCount(p, "ips-exports")], [true, 2]);
  await ctx.close();
} finally { await b.close(); }
console.log(failed?`\n${failed} check(s) failed`:"\nall checks passed"); process.exit(failed?1:0);
