#!/usr/bin/env node
// THE SCROLL CUES DO NOT LAND ON A CONTROL, ON ANY TAB, AT EITHER END.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/scroll-cue-walk.mjs [--port=8131] [--plant]
//
// WHY IT EXISTS, reported from the device 2026-09-20 as "a weird scroll
// artifact on the export window when trying to export a tiff". It is not a
// rendering artefact. `.scroll-cue` floats over the panel — `height: 0` on
// purpose so it takes no space in the flow — and the up cue's top is the
// heading's height plus four, which on the Export tab is exactly where the
// Format select begins. Scroll twelve pixels and a 44x27 pill is drawn across
// the top-right corner of the control you came to the tab to use.
//
// NO GATE HERE COULD SEE IT, and NOTES.md already wrote down why on 2026-09-15:
// the cue is `pointer-events: none` with no role and no accessible name, so
// every instrument in this repo — hit area, accessible name, role, contrast —
// samples a population it is not in. Marking something decorative removes it
// from everything that measures. This walk measures GEOMETRY instead, which
// does not care whether a box is decorative.
//
// IT SWEEPS EVERY TAB, not the one that was reported. The cue's position is a
// property of the panel and the tab under it is whatever the reader opened, so
// a fix verified on Export alone says nothing about Masks. The same rule as
// tools/surfaces.mjs: the list is read from the page, so a tab added later is
// swept with nothing to remember.
import { chromium } from "playwright-core";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const PLANT = process.argv.includes("--plant");
let failed = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "ok  " : "FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) failed++; };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  // WIDE, because the sub-line and therefore the heading's full height only
  // exist above 760px — and the report came from a desktop browser. The narrow
  // layout is swept too, below.
  for (const width of [1180, 420]) {
    const ctx = await b.newContext({ viewport: { width, height: 900 } });
    const p = await ctx.newPage();
    p.on("dialog", (d) => d.accept());
    await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
    await p.setInputFiles("#file", ["public/examples/NIR_1651.dng"]);
    await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
    await p.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
    await p.waitForTimeout(500);
    if (PLANT) {
      // THE DEFECT AS IT SHIPPED, rebuilt: the two pills, with the geometry the
      // stylesheet gave them — floating over the scroller at height 0, the up
      // one four pixels below the pinned heading, the down one ten above the
      // bottom, both 44px wide against the right edge. The elements were
      // deleted by the fix, so restyling is not a plant; this recreates them.
      await p.addStyleTag({ content: `
        .plant-cue { position: sticky; display: flex; justify-content: flex-end;
          align-items: flex-start; padding-right: 8px; height: 0; overflow: visible;
          z-index: 6; pointer-events: none; }
        .plant-cue span { display: inline-block; background: var(--surface-3);
          border: 1px solid var(--line-2); border-radius: 999px; padding: 4px 0;
          width: 44px; text-align: center; font-size: 0.75rem; color: var(--txt); }
        .plant-cue.up { top: 66px; z-index: 4; }
        .plant-cue.down { bottom: 10px; }
        .plant-cue.down span { transform: translateY(-100%); }` });
      await p.evaluate(() => {
        const body = document.getElementById("panelBody");
        const mk = (cls, ch) => { const d = document.createElement("div"); d.className = `plant-cue ${cls}`; d.id = `panel${cls === "up" ? "Up" : "Down"}`; d.innerHTML = `<span>${ch}</span>`; return d; };
        body.prepend(mk("up", "\u25B2"));
        body.append(mk("down", "\u25BC"));
      });
    }
    // The mask place joins the tabs here (decision 042). It is not a .ptab, and
    // with its groups open it is the longest panel content in the app — which
    // is precisely the case a scroll-cue walk exists to measure.
    const tabs = await p.$$eval(".ptab", (els) => els.map((e) => e.id));
    tabs.push("maskPlaceOpen");
    const hits = [];
    for (const id of tabs) {
      await p.click(`#${id}`);
      await p.waitForTimeout(120);
      for (const [where, to] of [["scrolled from the top", 20], ["at the bottom", 1e7]]) {
        await p.evaluate((v) => { const b = document.getElementById("panelBody"); b.scrollTop = v; b.dispatchEvent(new Event("scroll")); }, to);
        await p.waitForTimeout(120);
        const found = await p.evaluate(() => {
          const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
          const shown = (e) => e && !e.hidden && getComputedStyle(e).display !== "none" && getComputedStyle(e).visibility !== "hidden";
          const cues = [];
          for (const cid of ["panelUp", "panelDown"]) {
            const host = document.getElementById(cid);
            if (!shown(host)) continue;
            const glyph = host.querySelector("span") ?? host;   // the pill is the span; the host is height 0 by design
            const g = box(glyph);
            if (g.w < 1 || g.h < 1) continue;
            cues.push({ cid, g });
          }
          const controls = [...document.querySelectorAll("#panelBody button, #panelBody select, #panelBody input, #panelBody a, #panelBody textarea")]
            .filter((e) => shown(e) && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0)
            .map((e) => ({ id: e.id || e.className || e.tagName, ...box(e) }));
          const over = (a, c) => !(a.x + a.w <= c.x || c.x + c.w <= a.x || a.y + a.h <= c.y || c.y + c.h <= a.y);
          const out = [];
          for (const { cid, g } of cues) for (const c of controls) {
            if (!over(g, c)) continue;
            const ox = Math.min(g.x + g.w, c.x + c.w) - Math.max(g.x, c.x);
            const oy = Math.min(g.y + g.h, c.y + c.h) - Math.max(g.y, c.y);
            out.push({ cid, control: c.id, px: Math.round(ox * oy), ox: Math.round(ox), oy: Math.round(oy) });
          }
          return out;
        });
        for (const f of found) hits.push({ width, tab: id.replace("ptab-", ""), where, ...f });
      }
    }
    check(`${width}px · no scroll cue is drawn over a control`, hits.filter((h) => h.width === width).length === 0,
      hits.filter((h) => h.width === width).length
        ? hits.filter((h) => h.width === width).map((h) => `${h.cid} over ${h.control} on ${h.tab} ${h.where} (${h.ox}x${h.oy}px)`).slice(0, 6).join("; ")
        : `${tabs.length} tab(s), both ends`);
    await ctx.close();
  }
} finally { await b.close(); }
console.log(failed ? `\n${failed} failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
