#!/usr/bin/env node
// THE PRIMARY PATH, END TO END: start screen, open a set, make a verdict, move,
// export, save the file, Done. Nothing here is subtle and that is the point — a
// release can pass every targeted walk and still not open.
//
// MOVED IN FROM THE SESSION SCRATCHPAD, 2026-09-14. It was rebuilt there before
// each release and held nowhere, so a session that did not know it existed
// shipped without it and a container going away took it with it. Four walks were
// in this directory and roughly eighteen were not, including the export gate.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/journey-walk.mjs
//
//   npm install --no-save esbuild playwright-core axe-core
//
// NOT in .branch-guard's `also=`: it drives a real browser and decodes RAW
// files. Run it before a release, or through tools/walk-all.mjs.
// THE WHOLE JOURNEY from the start screen, once, before a handover.
import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
const DIR = "/home/user/Jefferson-Photography-Studio/public/examples";
const SET = ["canopy.dng","hillside.dng","lodge.dng"].map(f=>`${DIR}/${f}`);
let failed=0; const check=(n,g,w)=>{const ok=g===w;if(!ok)failed++;console.log(`${ok?"ok  ":"FAIL"}  ${n} — got ${JSON.stringify(g)}`);};
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 950 } });
  p.on("pageerror", e => { console.log("FAIL  page error: " + e.message); failed++; });
  p.on("dialog", d => d.accept());
  await p.goto("http://127.0.0.1:8131/ir.html");
  check("the start screen is there", await p.isVisible("#welcome"), true);
  await p.setInputFiles("#file", SET);
  await p.waitForFunction((n)=>document.querySelectorAll("#sessionThumbs .session-thumb").length===n, SET.length, {timeout:300000});
  await p.waitForFunction(()=>{const t=[...document.querySelectorAll("#sessionThumbs .session-thumb")];return t.every(x=>!x.disabled);},null,{timeout:300000});
  await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});
  check("a session opened", await p.isVisible("#sessionStrip"), true);
  await p.evaluate(()=>(document.activeElement instanceof HTMLElement?document.activeElement.blur():undefined));
  await p.keyboard.press("p");
  check("a verdict landed", await p.evaluate(()=>!!document.querySelector(".session-thumb.picked")), true);
  await p.keyboard.press("ArrowRight");
  await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});
  check("and survived a move", await p.evaluate(()=>!!document.querySelector(".session-thumb.picked")), true);
  // Export one, the old modal way, end to end.
  await p.click("#ptab-export");
  await p.evaluate(()=>{ window.__saved = null; });
  const dl = p.waitForEvent("download", { timeout: 300000 }).catch(()=>null);
  await p.click("#exBtn");
  await p.waitForFunction(()=>/^Ready —/.test(document.getElementById("exportStripText")?.textContent||""),null,{timeout:600000});
  check("an export finished and offered to save", /Ready —/.test(await p.textContent("#exportStripText")), true);
  await p.click("#exportSave");
  const d = await dl;
  check("and the file came out", !!d && /\.(jpg|jpeg|tif|tiff)$/i.test(d.suggestedFilename()), true);

  await p.click("#sessionDone");
  await p.waitForFunction(()=>document.getElementById("sessionStrip").hidden, null, {timeout:120000});
  check("Done returned to the start screen", await p.isVisible("#welcome"), true);
  // AND THE STAGE BEHIND IT IS EMPTY. The last photograph used to stay drawn
  // under the start screen (decision 020). The canvas keeps its drawing buffer,
  // so the read-back is the picture itself: the alpha sum of an emptied stage
  // is 0, and a photograph left behind is millions. Made to fail first against
  // the build before the clear.
  const stage = await p.evaluate(() => { const cv = document.getElementById("view"); const g = cv.getContext("webgl2") || cv.getContext("webgl"); if (!g || !cv.width) return 0; const px = new Uint8Array(cv.width * cv.height * 4); g.readPixels(0, 0, cv.width, cv.height, g.RGBA, g.UNSIGNED_BYTE, px); let s = 0; for (let i = 3; i < px.length; i += 4) s += px[i]; return s; });
  check("and the stage behind it is empty", stage, 0);
  // AND A PHOTOGRAPH OPENS AGAIN AFTER DONE. The clear that empties the stage
  // zeroes the renderer's image size, and every draw path returns early on a
  // zero size until the next upload sets it — so the case the clear created is
  // "open after Done", which this walk had never done. The read-back is the
  // same alpha sum: a drawn photograph is millions.
  await p.setInputFiles("#file", [SET[0]]);
  await p.waitForFunction(()=>document.getElementById("welcome")?.hidden, null, {timeout:300000});
  await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});
  const again = await p.evaluate(() => { const cv = document.getElementById("view"); const g = cv.getContext("webgl2") || cv.getContext("webgl"); if (!g || !cv.width) return 0; const px = new Uint8Array(cv.width * cv.height * 4); g.readPixels(0, 0, cv.width, cv.height, g.RGBA, g.UNSIGNED_BYTE, px); let s = 0; for (let i = 3; i < px.length; i += 4) s += px[i]; return s; });
  check("a photograph opens again after Done and is drawn", again > 1000000, true);
} finally { await b.close(); }
console.log(failed?`\n${failed} failed`:"\nall checks passed"); process.exit(failed?1:0);
