#!/usr/bin/env node
// PICK AND REJECT: the words on the tiles, the counts, the keys and their guard
// set, and survival across a reload. Check 10 was intermittent for weeks and was
// written off as flaky; it was the product, and the fix is in
// tools/verdict-durability-walk.mjs beside this.
//
// MOVED IN FROM THE SESSION SCRATCHPAD, 2026-09-14. It was rebuilt there before
// each release and held nowhere, so a session that did not know it existed
// shipped without it and a container going away took it with it. Four walks were
// in this directory and roughly eighteen were not, including the export gate.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/verdicts-walk.mjs
//
//   npm install --no-save esbuild playwright-core axe-core
//
// NOT in .branch-guard's `also=`: it drives a real browser and decodes RAW
// files. Run it before a release, or through tools/walk-all.mjs.
// PICK AND REJECT ON THE SESSION — durable, painted by the reconcile, and not
// an edit. Needs dist/ served on :8131.
import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
const DIR = "/home/user/Jefferson-Photography-Studio/public/examples";
const FOUR = ["canopy.dng","hillside.dng","lodge.dng","NIR_1830.dng"].map(f=>`${DIR}/${f}`);
let failed=0;
const check=(n,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)failed++;console.log(`${ok?"ok  ":"FAIL"}  ${n}\n        got ${JSON.stringify(g)} want ${JSON.stringify(w)}`);};

const tiles = (p) => p.evaluate(() => [...document.querySelectorAll("#sessionThumbs .session-thumb")].map(b => ({
  mark: b.querySelector(".session-thumb-mark")?.textContent ?? "-",
  picked: b.classList.contains("picked"),
  rejected: b.classList.contains("rejected"),
  title: b.title,
})));
const marks = async (p) => (await tiles(p)).map(t => t.mark).join(",");
const meta = (p) => p.evaluate(() => document.getElementById("sessionMeta").textContent);
// Defensive so the run reaches the chrome-cost measurement on a build that has
// no such buttons — that build is meant to FAIL these checks, not crash them.
const btns = (p) => p.evaluate(() => [
  document.getElementById("sessionPick")?.getAttribute("aria-pressed") ?? "missing",
  document.getElementById("sessionReject")?.getAttribute("aria-pressed") ?? "missing",
].join("/"));

async function openSet(p, files) {
  await p.setInputFiles("#file", files);
  await p.waitForFunction((n)=>document.querySelectorAll("#sessionThumbs .session-thumb").length===n, files.length, {timeout:300000});
  await p.waitForFunction(()=>{const t=[...document.querySelectorAll("#sessionThumbs .session-thumb")];return t.length>1&&t.every(b=>!b.disabled);},null,{timeout:300000});
  await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});
}
async function stepTo(p, i) {
  await p.evaluate((n)=>document.querySelectorAll("#sessionThumbs .session-thumb")[n].click(), i);
  await p.waitForFunction((n)=>document.querySelectorAll("#sessionThumbs .session-thumb")[n]?.classList.contains("active"), i, {timeout:300000});
  await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});
}
/** Keys go to whatever has the focus; the photo owns them, so put the focus on
 *  the body the way a reader leaves it after tapping the picture. */
const key = async (p, k) => {
  // BLUR FIRST. A programmatic tile click does not move the focus, so after
  // touching a slider the focus is still in that slider — where the app's guard
  // correctly refuses these keys. Leaving the focus on <body> is the state a
  // reader is in after tapping the photograph.
  await p.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  await p.keyboard.press(k);
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  p.on("pageerror", e => { console.log("FAIL  page error: " + e.message); failed++; });
  p.on("dialog", d => d.accept());
  await p.goto("http://127.0.0.1:8131/ir.html");
  await openSet(p, FOUR);

  await stepTo(p, 1); await key(p, "x");
  await stepTo(p, 2); await key(p, "p");
  check("1 the words land on the right tiles", await marks(p), "-,Reject,Pick,-");
  check("2 and the tiles carry the state as class too", (await tiles(p)).map(t=>t.picked?"P":t.rejected?"R":"-").join(","), "-,R,P,-");
  check("3 the tile's tooltip says the whole sentence", (await tiles(p))[1].title.includes("— Reject"), true);
  check("4 the strip's line counts them", /1 picked/.test(await meta(p)) && /1 rejected/.test(await meta(p)), true);
  check("5 the head buttons describe the photo you are on", await btns(p), "true/false");

  // THE RECONCILE IS THE PAINTER. An arrow press rewrites every tile's class
  // and strips any tag it did not put there; a mark painted beside it would be
  // gone here.
  await key(p, "ArrowRight");
  await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});
  check("6 the marks survive a switch", await marks(p), "-,Reject,Pick,-");

  // Not an edit: an undo step must not take a verdict back.
  await p.click("#ptab-basic");
  await p.evaluate(() => { const s = document.getElementById("expo"); s.value = "600"; s.dispatchEvent(new Event("input", {bubbles:true})); s.dispatchEvent(new Event("change", {bubbles:true})); });
  await stepTo(p, 2);
  await p.keyboard.press("Meta+z");
  check("7 an undo step does not take a verdict back", await marks(p), "-,Reject,Pick,-");

  // The guard set: a key typed into a control belongs to that control.
  await p.click("#ptab-basic");
  await p.focus("#expo");
  await p.keyboard.press("x");
  check("8 X inside a slider marks nothing", await marks(p), "-,Reject,Pick,-");

  // U clears, and only the one you are on.
  await stepTo(p, 1); await key(p, "u");
  check("9 U clears the one you are on and no other", await marks(p), "-,-,Pick,-");
  await key(p, "x");

  // Durable across a reload.
  await p.reload();
  await p.waitForSelector("#resumeSession:not([hidden])", { timeout: 120000 });
  await p.click("#resumeSession");
  await p.waitForFunction((n)=>document.querySelectorAll("#sessionThumbs .session-thumb").length===n, FOUR.length, {timeout:300000});
  await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});
  check("10 both verdicts come back after a reload", await marks(p), "-,Reject,Pick,-");

  // The chrome cost of the two new buttons, at both widths.
  const h = {};
  for (const w of [430, 900]) {
    await p.setViewportSize({ width: w, height: 900 });
    await p.evaluate(()=>document.querySelectorAll("#sessionThumbs .session-thumb")[0].click());
    await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});
    h[w] = await p.evaluate(() => ({
      sessionH: getComputedStyle(document.getElementById("stage")).getPropertyValue("--session-h").trim(),
      headWraps: (() => { const el = document.querySelector(".session-head"); return el.scrollHeight > el.clientHeight + 1; })(),
      bothTagsFit: [...document.querySelectorAll("#sessionThumbs .session-thumb")].every(t => {
        const r = t.getBoundingClientRect();
        return [...t.querySelectorAll(".session-thumb-tag, .session-thumb-mark")].every(s => {
          const q = s.getBoundingClientRect();
          return q.left >= r.left - 1 && q.right <= r.right + 1 && q.top >= r.top - 1 && q.bottom <= r.bottom + 1;
        });
      }),
      verdictBtns: [...document.querySelectorAll(".session-verdict")].map(x => Math.round(x.getBoundingClientRect().height)),
    }));
  }
  console.log("        strip height 430px " + h[430].sessionH + ", 900px " + h[900].sessionH);
  check("11 the session head does not wrap at 430px", [h[430].headWraps, h[900].headWraps], [false, false]);
  check("12 every tag stays inside its tile at both widths", [h[430].bothTagsFit, h[900].bothTagsFit], [true, true]);
  // COUNTED AS WELL AS MEASURED: "every one of none clears 44px" is true, and
  // it was true against the build that had no such buttons at all.
  check("13 there are two verdict buttons and both clear 44px at both widths",
    [h[430].verdictBtns.length === 2 && h[430].verdictBtns.every(v=>v>=44),
     h[900].verdictBtns.length === 2 && h[900].verdictBtns.every(v=>v>=44)], [true, true]);
  await ctx.close();

  // --- a pick made in the quick look arrives in the session as a pick --------
  {
    const c2 = await b.newContext({ viewport: { width: 1280, height: 950 } });
    const q = await c2.newPage();
    q.on("pageerror", e => { console.log("FAIL  page error: " + e.message); failed++; });
    await q.goto("http://127.0.0.1:8131/ir.html");
    await q.setInputFiles("#quickFiles", FOUR);
    await q.waitForFunction((n)=>{const c=document.getElementById("qlCount");return !!c&&!document.getElementById("qlGrid")?.dataset.busy&&document.querySelectorAll("#qlGrid .ql-cell").length===n;}, FOUR.length, {timeout:300000});
    await q.keyboard.press("p");
    await q.keyboard.press("ArrowRight");
    await q.keyboard.press("p");
    await q.click("#qlKeep");
    await q.waitForFunction(()=>document.querySelectorAll("#sessionThumbs .session-thumb").length===2, null, {timeout:300000});
    await q.waitForFunction(()=>{const t=[...document.querySelectorAll("#sessionThumbs .session-thumb")];return t.length===2&&t.every(x=>!x.disabled);},null,{timeout:300000});
    await q.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});
    check("14 two picks in the grid open as two picks in the session", await marks(q), "Pick,Pick");
    // And durably: the verdict has to be in the row the photo was written with,
    // not written over it afterwards.
    await q.reload();
    await q.waitForSelector("#resumeSession:not([hidden])", { timeout: 120000 });
    await q.click("#resumeSession");
    await q.waitForFunction(()=>document.querySelectorAll("#sessionThumbs .session-thumb").length===2, null, {timeout:300000});
    await q.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});
    check("15 and they are still picks after a reload", await marks(q), "Pick,Pick");
    await c2.close();
  }
} finally { await b.close(); }
console.log(failed?`\n${failed} check(s) failed`:"\nall checks passed");
process.exit(failed?1:0);
