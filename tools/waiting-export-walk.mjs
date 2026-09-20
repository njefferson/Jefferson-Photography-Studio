#!/usr/bin/env node
// THE WAITING-EXPORTS LINE: SAID ONCE, AND STAYING DISMISSED.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/waiting-export-walk.mjs [--port=8131]
//
// Two faults, reported from the device on the same screenshot.
//
// SAID TWICE. `showExportStrip` builds the waiting sentence itself from
// `exportCount`, and says so in capitals directly above itself — "no caller may
// pass it in", with the note that one already had and the line was printed
// twice. The start-up caller then did exactly that again. A rule written in a
// comment stopped nothing; this is the version that refuses.
//
// SAID EVERY LAUNCH. Dismiss hid the line for the session only, so an export
// left unsaved re-announced itself on every open, over the start screen, on top
// of the button that opens a photo. It is remembered now, keyed to how many are
// waiting — and a NEW export still comes back, because dismissing a line is not
// an instruction to hide a file the reader has never seen. That third case is
// the one worth keeping: the easy fix hides it for ever.
//
// The store is planted directly rather than by exporting a real photo: the
// schema is `ips-exports` v2, `meta` keyed on `name`, which is what frameCount
// counts. A guess at that schema made this walk pass vacuously the first time.
import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
let bad=0; const fail=s=>{bad++;console.log("FAIL  "+s);}; const ok=s=>console.log("ok    "+s);
const PORT=(process.argv.find(a=>a.startsWith("--port="))||"--port=8131").split("=")[1];
const BASE=`http://127.0.0.1:${PORT}`;
const br=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
try{
  const ctx=await br.newContext({viewport:{width:900,height:760}});
  const page=await ctx.newPage();
  // plant one unsaved export in the store the app reads at start-up
  await page.goto(`${BASE}/ir.html`,{waitUntil:"load"});
  const plant = (name) => page.evaluate(async (n) => {
    await new Promise((res, rej) => {
      const rq = indexedDB.open("ips-exports", 2);
      rq.onupgradeneeded = () => { const d = rq.result;
        if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", { keyPath: "name" });
        if (!d.objectStoreNames.contains("chunks")) d.createObjectStore("chunks", { keyPath: ["frame", "idx"] }); };
      rq.onsuccess = () => { const d = rq.result;
        const tx = d.transaction("meta", "readwrite");
        tx.objectStore("meta").put({ name: n, type: "image/jpeg", size: 3, at: Date.now() });
        tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); };
      rq.onerror = () => rej(rq.error);
    });
  }, name);
  await plant("NIR_0001.jpg");

  const read=async()=>{
    await page.goto(`${BASE}/ir.html`,{waitUntil:"load"});
    await page.waitForTimeout(1500);
    return page.evaluate(()=>{
      const el=document.getElementById("exportStripText");
      const strip=document.getElementById("exportStrip");
      return { shown: strip ? !strip.hidden : false,
               text: (el?.textContent||"").trim(),
               lines: (el?.textContent||"").trim().split("\n").filter(Boolean) };
    });
  };
  const first=await read();
  console.log(`  launch 1: shown ${first.shown}, ${first.lines.length} line(s) — ${JSON.stringify(first.lines)}`);
  if(!first.shown) fail("an unsaved export is not mentioned at all");
  else if(first.lines.length!==1) fail(`the line is printed ${first.lines.length} times`);
  else ok("one unsaved export is mentioned once");
  // dismiss it, then come back
  await page.evaluate(()=>document.getElementById("exportDismiss")?.click());
  await page.waitForTimeout(400);
  const second=await read();
  console.log(`  launch 2 after Dismiss: shown ${second.shown}`);
  if(second.shown) fail("Dismiss does not survive a relaunch — it nags every time the app opens");
  else ok("Dismiss survives the relaunch");
  // a NEW export is news and must come back
  await plant("NIR_0002.jpg");
  const third=await read();
  console.log(`  launch 3 with a second export: shown ${third.shown} — ${JSON.stringify(third.lines)}`);
  if(!third.shown) fail("a NEW export stayed hidden behind an old dismissal");
  else if(third.lines.length!==1) fail(`the line is printed ${third.lines.length} times`);
  else ok("a new export brings the line back, once");
}finally{await br.close();}
console.log(bad?`\n${bad} failed`:"\npassed");
process.exit(bad?1:0);
