#!/usr/bin/env node
// THE EXPORT LINE FLOATS OVER THE PHOTO AND SURVIVES A PANEL TAB CHANGE. It used
// to live inside the Export tab, so changing tabs hid both the progress and the
// finished file and the reader could not reach Save.
//
// MOVED IN FROM THE SESSION SCRATCHPAD, 2026-09-14. It was rebuilt there before
// each release and held nowhere, so a session that did not know it existed
// shipped without it and a container going away took it with it. Four walks were
// in this directory and roughly eighteen were not, including the export gate.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/export-ui-walk.mjs
//
//   npm install --no-save esbuild playwright-core axe-core
//
// NOT in .branch-guard's `also=`: it drives a real browser and decodes RAW
// files. Run it before a release, or through tools/walk-all.mjs.
// The export line: what it says when things go wrong, and whether it is usable.
import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
const AXE = "/home/user/Jefferson-Photography-Studio/node_modules/axe-core/axe.min.js";
const DIR = "/home/user/Jefferson-Photography-Studio/public/examples";
const TWO = ["canopy.dng","hillside.dng"].map(f=>`${DIR}/${f}`);
const FAIL_MODE = process.argv.includes("--expect-failure");
let failed=0; const check=(n,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)failed++;console.log(`${ok?"ok  ":"FAIL"}  ${n}\n        got ${JSON.stringify(g)} want ${JSON.stringify(w)}`);};
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
try {
  for (const theme of ["dawn","dark"]) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, acceptDownloads: true });
    const p = await ctx.newPage();
    p.on("pageerror", e => { console.log(`FAIL [${theme}] ${e.message}`); failed++; });
    p.on("dialog", d => d.accept());
    await p.addInitScript((t)=>{try{localStorage.setItem("studio-theme",t);}catch{}}, theme);
    await p.goto("http://127.0.0.1:8131/ir.html");
    await p.setInputFiles("#file", TWO);
    await p.waitForFunction((n)=>document.querySelectorAll("#sessionThumbs .session-thumb").length===n, TWO.length, {timeout:300000});
    await p.waitForFunction(()=>{const t=[...document.querySelectorAll("#sessionThumbs .session-thumb")];return t.every(x=>!x.disabled);},null,{timeout:300000});
    await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});
    await p.click("#ptab-export");
    await p.click("#exBtn");

    if (FAIL_MODE) {
      await p.waitForFunction(()=>/failed/i.test(document.getElementById("exportStripText")?.textContent||""),null,{timeout:120000});
      const st = await p.evaluate(() => ({
        text: document.getElementById("exportStripText").textContent,
        retry: !document.getElementById("exportRetry").hidden,
        save: !document.getElementById("exportSave").hidden,
        btnBack: !document.getElementById("exBtn").disabled,
      }));
      check(`[${theme}] a failed export explains itself and offers a way forward`,
        [/Export failed/.test(st.text), st.retry, st.save, st.btnBack], [true, true, false, true]);
      // And it is KEPT, not shown once and lost.
      await p.click("#verTag");
      await p.waitForFunction(()=>!/Gathering/.test(document.getElementById("verDlgText")?.value||""),null,{timeout:60000});
      const rep = await p.evaluate(()=>document.getElementById("verDlgText").value);
      check(`[${theme}] and the report remembers it`, /^Last failure\s{2,}(?!none this session).+$/m.test(rep), true);
      await p.click("#verClose");
    } else {
      await p.waitForFunction(()=>/^Ready —/.test(document.getElementById("exportStripText")?.textContent||""),null,{timeout:600000});
      const st = await p.evaluate(() => {
        const s = document.getElementById("exportStrip");
        const btns = [...document.querySelectorAll(".export-hud-actions button")].filter(x=>!x.hidden);
        const r = s.getBoundingClientRect();
        return {
          onTop: getComputedStyle(s).position === "absolute",
          inView: r.top >= 0 && r.left >= 0 && r.right <= innerWidth + 1,
          live: document.getElementById("exportStripText").getAttribute("aria-live"),
          labels: btns.map(x=>x.textContent.trim()),
          heights: btns.map(x=>Math.round(x.getBoundingClientRect().height)),
          // The point of the whole stage: it is reachable from any tab.
          visibleFromAnotherTab: null,
        };
      });
      check(`[${theme}] the finished file is announced through a live region`, st.live, "polite");
      // ONE finished export offers ONE way to save it. "Save all" appears only
      // once there is something waiting besides the file on offer — otherwise
      // it is a second button for the same file.
      check(`[${theme}] one finished export offers one Save, and Dismiss`,
        [st.labels, st.heights.every(h=>h>=44)], [["Save image","Dismiss"], true]);
      check(`[${theme}] it floats over the photo and is on screen`, [st.onTop, st.inView], [true, true]);
      await p.click("#ptab-basic");
      check(`[${theme}] and it is still there after changing panel tab`,
        await p.evaluate(()=>{const s=document.getElementById("exportStrip");return !s.hidden && s.getBoundingClientRect().height>0;}), true);
      await p.addScriptTag({ path: AXE });
      const v = await p.evaluate(async()=>{const r=await window.axe.run(document.getElementById("exportStrip"),{resultTypes:["violations"]});
        return r.violations.filter(x=>x.impact==="serious"||x.impact==="critical").map(x=>`${x.id}(${x.impact}) x${x.nodes.length}`);});
      check(`[${theme}] axe: nothing serious or critical on the export line`, v.join("; "), "");
    }
    await ctx.close();
  }
} finally { await b.close(); }
console.log(failed?`\n${failed} failed`:"\nall checks passed"); process.exit(failed?1:0);
