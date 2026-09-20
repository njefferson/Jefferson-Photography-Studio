#!/usr/bin/env node
// ONE CLASS, TWO SHAPES — the defect that looks like a design decision.
//
//   node tools/class-width-walk.mjs            (needs dist/ served on :8131)
//
// The pages it walks come from tools/surfaces.mjs, not from a list in here.
//
// NOT in .branch-guard's `also=`: it drives a real browser against a real
// build, which is seconds, not milliseconds. Run it before a UI release,
// beside the a11y walk.
//
// IT LIVES IN THE REPO RATHER THAN THE SCRATCHPAD ON PURPOSE. It took four
// attempts to get right and it is the only instrument that can answer its
// question; a scratchpad copy is gone with the container, and the next session
// to meet this defect would build it again from nothing.
//
// WHAT IT LOOKS FOR, and why a grep cannot. The base rule in style.css is
// `select, button { width: 100% }`, keyed on the TAG. A class shared by a
// <button> and an <a>, or by a <button> and a <label> — the only way a file
// picker can be styled at all — therefore produces two shapes from one
// declaration. Whether the tag rule or the class rule wins is a cascade
// question, so this renders the pages and measures.
//
// MEASURED INSTANCES, both directions, both shipped:
//   .dbg-btn   labels 163px against buttons 293px
//   .ver-link  an <a> 141px against a <button> 604px, side by side in one row
//
// Plant to prove it still works: delete `width: auto` from `.ver-link` in
// style.css, rebuild, and this prints a 463px spread.

import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
// THE PAGE LIST IS NOT THIS FILE'S TO KEEP. It carried four page names, hard
// coded, while SEVEN deploy — so notes.html, privacy.html and the status page
// were never walked, and nothing said so. tools/surfaces.mjs is the one
// enumeration, checked both ways against the build, and importing it is the
// only way two walks cannot disagree about what this app is made of.
import { PAGES, check as checkSurfaces } from "./surfaces.mjs";
const bad = checkSurfaces();
if (bad.length) { for (const x of bad) console.error("FAIL  " + x); process.exit(1); }
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
let found = 0;
try {
  for (const page of PAGES.map((p) => p.file)) {
    const p = await b.newPage({ viewport: { width: 1280, height: 950 } });
    await p.goto(`http://127.0.0.1:8131/${page}`);
    await p.waitForTimeout(1200);
    const rows = await p.evaluate(() => {
      // Open every dialog so its contents are laid out.
      for (const d of document.querySelectorAll("dialog")) { try { if (!d.open) d.showModal(); } catch {} }
      const byKey = new Map();
      for (const el of document.querySelectorAll("button, a, label, select, input[type=button]")) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        for (const c of el.classList) {
          // Group by class AND by the parent, so two rows of the same class in
          // different places are not compared with each other.
          const key = c + " @ " + (el.parentElement?.id || el.parentElement?.className || "?");
          if (!byKey.has(key)) byKey.set(key, []);
          byKey.get(key).push({ tag: el.tagName, id: el.id, w: Math.round(r.width) });
        }
      }
      const out = [];
      for (const [key, list] of byKey) {
        if (list.length < 2) continue;
        const tags = new Set(list.map((x) => x.tag));
        if (tags.size < 2) continue;              // one tag, one shape: nothing to see
        const ws = list.map((x) => x.w);
        const spread = Math.max(...ws) - Math.min(...ws);
        if (spread > 60) out.push({ key, spread, list });
      }
      for (const d of document.querySelectorAll("dialog[open]")) { try { d.close(); } catch {} }
      return out.sort((a, b) => b.spread - a.spread);
    });
    for (const r of rows) {
      found++;
      console.log(`  ${page}  .${r.key}  spread ${r.spread}px`);
      for (const x of r.list) console.log(`       ${x.tag}${x.id ? "#" + x.id : ""} ${x.w}px`);
    }
    await p.close();
  }
} finally { await b.close(); }
console.log(found ? `\n${found} place(s) where one class produced two shapes` : `\nno class produces two shapes across the ${PAGES.length} pages`);
process.exit(0);
