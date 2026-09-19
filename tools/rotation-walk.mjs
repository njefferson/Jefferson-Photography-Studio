#!/usr/bin/env node
// A QUARTER-TURN IS VIEW STATE AND HAS TO SURVIVE LEAVING THE PHOTO. It did not:
// showDecoded set rotation from EXIF on every open, so a turned portrait frame
// came back landscape. Reset must leave the turn alone — it is not part of the
// edit — and a photo never turned must open as the camera wrote it.
//
// MOVED IN FROM THE SESSION SCRATCHPAD, 2026-09-14. It was rebuilt there before
// each release and held nowhere, so a session that did not know it existed
// shipped without it and a container going away took it with it. Four walks were
// in this directory and roughly eighteen were not, including the export gate.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/rotation-walk.mjs
//
//   npm install --no-save esbuild playwright-core axe-core
//
// NOT in .branch-guard's `also=`: it drives a real browser and decodes RAW
// files. Run it before a release, or through tools/walk-all.mjs.
// A QUARTER-TURN MUST STAY TURNED. Rotation and flip are view state and were
// never stored, so leaving a photo and coming back put it back the way the
// camera wrote it — and a bulk export would then disagree with what was seen.
import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
const DIR = "/home/user/Jefferson-Photography-Studio/public/examples";
const THREE = ["canopy.dng","hillside.dng","lodge.dng"].map(f=>`${DIR}/${f}`);
let failed=0; const check=(n,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)failed++;console.log(`${ok?"ok  ":"FAIL"}  ${n}\n        got ${JSON.stringify(g)} want ${JSON.stringify(w)}`);};
/** The photo's shape on screen is the honest read of a quarter turn: a turned
 *  landscape frame is taller than it is wide. Reading a renderer field would
 *  test the variable rather than the picture. */
const shape = (p) => p.evaluate(() => {
  const c = document.querySelector("#stage canvas");
  const r = c.getBoundingClientRect();
  return r.width > r.height ? "landscape" : "portrait";
});
async function openSet(p, files) {
  await p.setInputFiles("#file", files);
  await p.waitForFunction((n)=>document.querySelectorAll("#sessionThumbs .session-thumb").length===n, files.length, {timeout:300000});
  await p.waitForFunction(()=>{const t=[...document.querySelectorAll("#sessionThumbs .session-thumb")];return t.every(x=>!x.disabled);},null,{timeout:300000});
  await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});
}
async function stepTo(p, i) {
  await p.evaluate((n)=>document.querySelectorAll("#sessionThumbs .session-thumb")[n].click(), i);
  await p.waitForFunction((n)=>document.querySelectorAll("#sessionThumbs .session-thumb")[n]?.classList.contains("active"), i, {timeout:300000});
  await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});
}
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  p.on("pageerror", e => { console.log("FAIL  page error: " + e.message); failed++; });
  p.on("dialog", d => d.accept());
  await p.goto("http://127.0.0.1:8131/ir.html");
  await openSet(p, THREE);

  const asOpened = await shape(p);
  await p.click("#ptab-crop");
  await p.click("#rotateBtn");
  await p.waitForTimeout(400);
  const turned = await shape(p);
  check("1 a quarter turn changes the shape on screen", turned !== asOpened, true);

  await stepTo(p, 1);
  await stepTo(p, 0);
  check("2 and it is still turned when you come back", await shape(p), turned);

  // A turn is view state, not an edit: it must not ride a saved look or leave
  // an undo step behind that Reset would have to undo.
  await p.click("#resetBtn").catch(()=>{});
  await p.waitForTimeout(300);
  check("3 Reset leaves the turn alone — it is not part of the edit", await shape(p), turned);

  // And a reload, which rebuilds from the stored copy rather than memory.
  await p.reload();
  await p.waitForSelector("#resumeSession:not([hidden])", { timeout: 120000 });
  await p.click("#resumeSession");
  await p.waitForFunction(()=>document.querySelectorAll("#sessionThumbs .session-thumb").length===3,null,{timeout:300000});
  await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});
  check("4 and after a reload too", await shape(p), turned);

  // A photo never turned is untouched.
  await stepTo(p, 2);
  check("5 a photo you never turned opens as the camera wrote it", await shape(p), asOpened);

  // 6 — STRAIGHTEN, THEN RESET, GIVES THE PICTURE BACK. Moving the angle
  // re-fits the view to the smaller inscribed crop; Reset restored the angle
  // and the crop and left the VIEW at that zoom, so the full frame came back
  // drawn small with empty margins round it (reported from a PC with a
  // screenshot, 2026-09-19). Read as the canvas's own backing size, which is
  // what the view fit sets: armed, tilted, and back.
  const drawn = () => p.evaluate(() => { const cv = document.querySelector("#view"); return `${cv.width}x${cv.height}`; });
  await p.click("#ptab-crop");
  await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /^Straighten$/i.test((x.textContent || "").trim())); b?.click(); });
  await p.waitForFunction(() => !document.getElementById("cropTools")?.hidden, null, { timeout: 30000 });
  await p.waitForTimeout(700);
  const armedSize = await drawn();
  await p.evaluate(() => { const el = document.getElementById("straighten"); el.value = "7"; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
  await p.waitForTimeout(700);
  const tiltedSize = await drawn();
  check("6 a straighten shrinks the frame it keeps", tiltedSize !== armedSize, true);
  await p.click("#cropReset");
  await p.waitForTimeout(700);
  check("7 and Reset gives the whole picture back, not the tilted window", await drawn(), armedSize);
  await p.click("#cropDone");
  await ctx.close();
} finally { await b.close(); }
console.log(failed?`\n${failed} check(s) failed`:"\nall checks passed");
process.exit(failed?1:0);
