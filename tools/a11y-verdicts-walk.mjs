#!/usr/bin/env node
// THE VERDICT COLOURS, READ COMPOSITED (hub §293). The pressed button filled
// with the accent at 15% and measured rgb(30,34,42) against an unpressed
// rgb(65,65,65) — darker than the control it was meant to stand out from — while
// a check comparing the two DECLARATIONS passed. A picked tile must not borrow
// the active tile's border either.
//
// MOVED IN FROM THE SESSION SCRATCHPAD, 2026-09-14. It was rebuilt there before
// each release and held nowhere, so a session that did not know it existed
// shipped without it and a container going away took it with it. Four walks were
// in this directory and roughly eighteen were not, including the export gate.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/a11y-verdicts-walk.mjs
//
//   npm install --no-save esbuild playwright-core axe-core
//
// NOT in .branch-guard's `also=`: it drives a real browser and decodes RAW
// files. Run it before a release, or through tools/walk-all.mjs.
// The two verdict buttons and the marked tiles: axe, grayscale survival, both themes.
import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
const AXE = "/home/user/Jefferson-Photography-Studio/node_modules/axe-core/axe.min.js";
const DIR = "/home/user/Jefferson-Photography-Studio/public/examples";
const SET = ["canopy.dng","hillside.dng","lodge.dng"].map(f=>`${DIR}/${f}`);
let failed=0; const check=(n,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)failed++;console.log(`${ok?"ok  ":"FAIL"}  ${n}\n        got ${JSON.stringify(g)} want ${JSON.stringify(w)}`);};
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
try {
  for (const theme of ["dawn","dark"]) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
    const p = await ctx.newPage();
    p.on("pageerror", e => { console.log(`FAIL [${theme}] ${e.message}`); failed++; });
    await p.addInitScript((t)=>{try{localStorage.setItem("studio-theme",t);}catch{}}, theme);
    await p.goto("http://127.0.0.1:8131/ir.html");
    await p.setInputFiles("#file", SET);
    await p.waitForFunction((n)=>document.querySelectorAll("#sessionThumbs .session-thumb").length===n, SET.length, {timeout:300000});
    await p.waitForFunction(()=>{const t=[...document.querySelectorAll("#sessionThumbs .session-thumb")];return t.length>1&&t.every(x=>!x.disabled);},null,{timeout:300000});
    await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});
    await p.click("#sessionPick");
    await p.evaluate(()=>document.querySelectorAll("#sessionThumbs .session-thumb")[1].click());
    await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});
    await p.click("#sessionReject");

    const st = await p.evaluate(() => {
      const pick = document.getElementById("sessionPick"), rej = document.getElementById("sessionReject");
      const t = [...document.querySelectorAll("#sessionThumbs .session-thumb")];
      return {
        realButtons: pick.tagName === "BUTTON" && rej.tagName === "BUTTON",
        labels: [pick.textContent.trim(), rej.textContent.trim()],
        pressed: [pick.getAttribute("aria-pressed"), rej.getAttribute("aria-pressed")],
        // MEANING SURVIVES GRAYSCALE: every marked tile carries a word and a
        // border STYLE, not a tint on its own.
        wordsOnTiles: t.map(x => x.querySelector(".session-thumb-mark")?.textContent ?? "-"),
        borderStyles: t.map(x => getComputedStyle(x).borderStyle),
        // The state is announced through a live region that already existed.
        meta: document.getElementById("sessionMeta").textContent,
        metaLive: document.getElementById("sessionMeta").getAttribute("aria-live"),
      };
    });
    check(`[${theme}] real buttons, labelled in words`, [st.realButtons, st.labels], [true, ["Pick","Reject"]]);
    check(`[${theme}] the one you are on reads as pressed`, st.pressed, ["false","true"]);
    check(`[${theme}] the verdict is a word on the tile, not a tint`, st.wordsOnTiles, ["Pick","Reject","-"]);
    check(`[${theme}] a rejected tile differs by line style too`, st.borderStyles[1], "dashed");
    check(`[${theme}] the counts are announced through a live region`,
      [/1 picked/.test(st.meta) && /1 rejected/.test(st.meta), st.metaLive], [true, "polite"]);
    await p.addScriptTag({ path: AXE });
    const v = await p.evaluate(async()=>{const r=await window.axe.run(document.getElementById("sessionStrip"),{resultTypes:["violations"]});
      return r.violations.filter(x=>x.impact==="serious"||x.impact==="critical").map(x=>`${x.id}(${x.impact}) x${x.nodes.length}`);});
    check(`[${theme}] axe: nothing serious or critical in the strip`, v.join("; "), "");

    // THE PRESSED BUTTON MUST READ AS ON. It filled with the accent at 15%,
    // which over the strip's own surface is FAINTER than the unpressed button
    // beside it — so the one that was on looked like the one that was off.
    const buttons = await p.evaluate(() => {
      // COMPOSITED, NOT DECLARED. getComputedStyle hands back the rgba as
      // written, so a 15%-alpha accent reads as a bright colour here while the
      // reader sees it almost entirely as the surface underneath. Checking the
      // declared value passed against the very build that shipped the defect.
      const parse = (c) => { const v = (c.match(/[\d.]+/g) || [0,0,0,0]).map(Number); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
      const over = (el) => {
        let cur = parse(getComputedStyle(el).backgroundColor);
        let node = el.parentElement;
        while (cur.a < 1 && node) {
          const under = parse(getComputedStyle(node).backgroundColor);
          if (under.a > 0) {
            cur = { r: cur.r*cur.a + under.r*(1-cur.a), g: cur.g*cur.a + under.g*(1-cur.a), b: cur.b*cur.a + under.b*(1-cur.a), a: cur.a + under.a*(1-cur.a) };
          }
          node = node.parentElement;
        }
        return cur;
      };
      const lum = (c) => 0.2126*c.r + 0.7152*c.g + 0.0722*c.b;
      const on = over(document.getElementById("sessionReject"));
      const off = over(document.getElementById("sessionPick"));
      // THE TOKEN IS A HEX STRING and the digit regex above turned #9fc2f5 into
      // rgb(9,2,5). Let the browser normalise it: set it on a probe and read the
      // computed colour back.
      const probe = document.createElement("span");
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
      document.body.appendChild(probe);
      const accent = parse(getComputedStyle(probe).color);
      probe.remove();
      const near = (a, b) => Math.abs(a.r-b.r) + Math.abs(a.g-b.g) + Math.abs(a.b-b.b) < 24;
      return {
        onBg: `${Math.round(on.r)},${Math.round(on.g)},${Math.round(on.b)}`,
        offBg: `${Math.round(off.r)},${Math.round(off.g)},${Math.round(off.b)}`,
        declaredOn: getComputedStyle(document.getElementById("sessionReject")).backgroundColor,
        declaredOff: getComputedStyle(document.getElementById("sessionPick")).backgroundColor,
        differ: Math.round(Math.abs(lum(on) - lum(off))),
        accent: `${Math.round(accent.r)},${Math.round(accent.g)},${Math.round(accent.b)}`,
        // THE CLAIM IS "IT IS FILLED WITH THE ACCENT", not "it differs from its
        // neighbour". The broken build differed by 167 in the light theme — a
        // 12% accent over cream lands on a mid-grey, which is different from
        // everything and reads as on nothing — and in the dark theme it landed
        // DARKER than the unpressed button beside it.
        filled: near(on, accent),
      };
    });
    console.log(`        [${theme}] pressed rgb(${buttons.onBg}) vs unpressed rgb(${buttons.offBg}), accent rgb(${buttons.accent}); declared ${buttons.declaredOn} / ${buttons.declaredOff}`);
    check(`[${theme}] the pressed verdict button is filled with the accent`,
      [buttons.filled, buttons.onBg !== buttons.offBg], [true, true]);

    // AND A PICKED TILE MUST NOT LOOK LIKE THE ONE YOU ARE VIEWING. Both wore
    // the accent border, so a strip with several picks had several tiles that
    // read as active — and in grayscale they were the same tile.
    const tiles = await p.evaluate(() => {
      const all = [...document.querySelectorAll("#sessionThumbs .session-thumb")];
      const act = all.find(t => t.classList.contains("active"));
      const pick = all.find(t => t.classList.contains("picked") && !t.classList.contains("active"));
      const plain = all.find(t => !t.classList.contains("active") && !t.classList.contains("picked") && !t.classList.contains("rejected"));
      const read = (el) => el ? { border: getComputedStyle(el).borderColor, shadow: getComputedStyle(el).boxShadow } : null;
      return { act: read(act), pick: read(pick), plain: read(plain) };
    });
    check(`[${theme}] a picked tile does not borrow the active tile's border`,
      !!tiles.act && !!tiles.pick && tiles.pick.border !== tiles.act.border, true);
    check(`[${theme}] the active tile carries a ring nothing else has`,
      [tiles.act.shadow !== "none", tiles.pick.shadow === tiles.plain?.shadow], [true, true]);
    await ctx.close();
  }
} finally { await b.close(); }
console.log(failed?`\n${failed} failed`:"\nall checks passed"); process.exit(failed?1:0);
