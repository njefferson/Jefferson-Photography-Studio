#!/usr/bin/env node
// A LOOK PRESSED TWICE IS THE SAME PHOTOGRAPH BOTH TIMES.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/look-roundtrip-walk.mjs [--port=8131] [--plant]
//
//   npm install --no-save esbuild playwright-core
//
// WHY IT EXISTS. NOTES carried "switching a look away and back does not return
// the same photograph" as an open defect for a day, on one pair of framebuffer
// hashes taken by a walk that was then DELETED for being unable to isolate its
// claim. The claim outlived its instrument, and nothing left in the repository
// could say whether it was still true — or had ever been true. It was not: the
// round trip is exact, on every look, with and without a Sky mask, and over ten
// cycles. This is the instrument that says so, kept so the answer cannot go
// missing the same way twice.
//
// WHAT IT ASSERTS, and why each part is separate:
//   1. Every look, there and back through B&W IR, renders pixel for pixel what
//      it rendered the first time. Hashing the whole framebuffer, not a
//      statistic of it: a look that came back nearly right is a defect.
//   2. The same with a Sky mask on. The selection is built from the frame AS
//      GRADED, so a look switch is an opportunity for the SELECTION to come
//      back different, which check 1 cannot see.
//   3. Ten Aerochrome/B&W cycles leave the render and the white balance where
//      they started. `applyLook` strips the previous look's bias by DIVISION
//      and re-multiplies the new one, and `(w * b) / b` is not `w` in floating
//      point — so residue, if any, accumulates, and one cycle would hide it.
//      (It does not accumulate: syncToUI/syncFromUI puts every value through
//      the stepped slider on the way past, and a value already on a step is a
//      fixed point of that. The check exists to keep it that way.)
//
// It also prints, per look, HOW MANY controls separate it from B&W IR — the
// instrument's own control. A walk that reads nothing cannot tell two looks
// apart, and would report every round trip clean.
//
// `--plant` presses a DIFFERENT look as the second application and requires the
// walk to go red. A round-trip check that cannot tell two looks apart is not
// checking the round trip.
//
// The first plant moved one slider a step between the two applications, and the
// walk passed with it in — correctly, because a look SETS contrast, so pressing
// the look again erased the plant before the hash was taken. A plant in ground
// the thing under test is entitled to overwrite proves nothing about the test.
//
// NOT in .branch-guard's `also=`: it drives a real browser and decodes a RAW.
// Run it before a release, or through tools/walk-all.mjs.
import { openMasks, closeMasks, setMaskValue } from "./walk-input.mjs";
import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();

const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const PLANT = process.argv.includes("--plant");
const FRAME = "NIR_1644";
const RAW = `/home/user/Jefferson-Photography-Studio/public/examples/${FRAME}.dng`;
// B&W IR is the one to pass through: it is the furthest from every other look
// and the look the original observation used.
const VIA = "lookMono";
const LOOKS = ["lookAero", "lookEir", "lookHie", "lookGoldie", "lookRed", "lookSepia", "lookNatural"];
const CYCLES = 10;

let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}`);
  if (detail) console.log(`        ${detail}`);
};

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  /** The whole framebuffer as one FNV-1a over RGB. Takes the page; gives back a
   *  hex string. What it must satisfy: two calls on an unchanged canvas are
   *  equal, which is what `settle` below depends on. */
  const hash = (p) => p.evaluate(() => {
    const cv = document.querySelector("#view");
    const g = cv.getContext("webgl2") || cv.getContext("webgl");
    const buf = new Uint8Array(cv.width * cv.height * 4);
    g.readPixels(0, 0, cv.width, cv.height, g.RGBA, g.UNSIGNED_BYTE, buf);
    let h = 2166136261;
    for (let k = 0; k < buf.length; k += 4) {
      h ^= buf[k]; h = Math.imul(h, 16777619);
      h ^= buf[k + 1]; h = Math.imul(h, 16777619);
      h ^= buf[k + 2]; h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  });

  /** Waits until the canvas stops changing. Takes the page; gives back true if
   *  it settled. Settling on the PIXELS and never on a clock: a timer would be
   *  a guess about a decode whose cost belongs to the file. */
  async function settle(p) {
    let last = "", stable = 0;
    for (let i = 0; i < 80; i++) {
      const h = await hash(p);
      if (h === last) { if (++stable >= 2) return true; } else { stable = 0; last = h; }
      await p.waitForTimeout(200);
    }
    console.log("        (never settled — the reading below is not trustworthy)");
    return false;
  }

  /** Every named control in the document, plus every pressed state. Takes the
   *  page; gives back an object keyed by id (or by position under the nearest
   *  identified ancestor, which is what the channel mixer's rows are). What it
   *  must satisfy: it separates two different looks — the per-look count
   *  printed below is that assertion, and a zero fails the walk. */
  const dump = (p) => p.evaluate(() => {
    const out = {};
    for (const e of document.querySelectorAll("input, select")) {
      if (e.type === "file") continue;
      let key = e.id;
      if (!key) {
        const path = [];
        let n = e;
        while (n && n !== document.body) {
          const sibs = [...(n.parentElement?.children ?? [])].filter((s) => s.tagName === n.tagName);
          path.unshift(n.id ? `#${n.id}` : `${n.tagName.toLowerCase()}[${sibs.indexOf(n)}]`);
          if (n.id) break;
          n = n.parentElement;
        }
        key = path.join(">");
      }
      out[key] = e.type === "checkbox" || e.type === "radio" ? String(e.checked) : e.value;
    }
    for (const e of document.querySelectorAll("[aria-pressed]")) {
      if (e.id) out[`${e.id}@pressed`] = e.getAttribute("aria-pressed");
    }
    return out;
  });

  const press = async (p, id) => {
    await p.evaluate((t) => document.getElementById(t)?.click(), id);
    await settle(p);
  };

  /** A page with the frame open on it, from a clean context: the session look
   *  is seeded out of localStorage, and a walk that inherited one would be
   *  pressing a second look on top of a first. Takes whether to add a Sky
   *  mask; gives back the page and its context, with the canvas settled. */
  const open = async (withMask) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
    const p = await ctx.newPage();
    p.on("dialog", (d) => d.accept());
    p.on("pageerror", (e) => { console.log(`FAIL  page error: ${e.message}`); failed++; });
    await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
    await p.setInputFiles("#file", [RAW]);
    await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
    await p.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
    await settle(p);
    if (withMask) {
      await press(p, "lookEir");
      await openMasks(p);
      await p.click("#addSky");
      await settle(p);
      // A MASK THAT RENDERS. A new mask starts at no change and the renderer
      // drops a mask that changes nothing, so the arm gives it the saturation a
      // new Sky mask used to arrive with; otherwise "with a Sky mask" would be
      // the no-mask arm again.
      await setMaskValue(p, "saturation", "1.3");
      // BACK TO THE WHOLE PHOTO, as the arm stood before: with the mask picked
      // the controls this walk reads show the MASK'S values (Contrast among
      // them, the one control Sepia and B&W IR differ by), and the walk went
      // blind on that pair.
      await closeMasks(p);
      await p.click("#maskTargetBack");
      await openMasks(p);
      await settle(p);
    }
    return { p, ctx };
  };

  for (const withMask of [false, true]) {
    const label = withMask ? "with a Sky mask" : "no mask";
    const { p, ctx } = await open(withMask);
    console.log(`\n--- ${FRAME}, ${label} ---`);
    for (const L of LOOKS) {
      await press(p, L);
      const a1 = { h: await hash(p), c: await dump(p) };
      await press(p, VIA);
      const via = { h: await hash(p), c: await dump(p) };
      // COMING BACK TO A DIFFERENT LOOK. Every row below must go red.
      await press(p, PLANT ? (L === "lookNatural" ? "lookRed" : "lookNatural") : L);
      const a2 = { h: await hash(p), c: await dump(p) };

      const keys = [...new Set([...Object.keys(a1.c), ...Object.keys(a2.c)])].sort();
      const reach = keys.filter((k) => a1.c[k] !== via.c[k]);
      const moved = keys.filter((k) => a1.c[k] !== a2.c[k]);
      const name = L.slice(4);
      check(`${name} comes back the same photograph (${label})`, a1.h === a2.h,
        `${a1.h} → ${via.h} → ${a2.h}` + (moved.length ? `\n        moved: ${moved.map((k) => `${k} ${JSON.stringify(a1.c[k])}→${JSON.stringify(a2.c[k])}`).join(", ")}`
          : a1.h === a2.h ? "" : "\n        nothing a reader can see moved — the difference is in state no control carries"));
      check(`${name} and B&W IR are told apart by the controls this walk reads`, reach.length > 0,
        `${reach.length} differ: ${reach.join(" ") || "NONE — this walk is blind and its clean result above means nothing"}`);
    }
    await ctx.close();
  }

  // ACCUMULATION. One there-and-back says the look is restored; it does not say
  // the restoration is exact enough to survive ten.
  {
    const { p, ctx } = await open(false);
    console.log(`\n--- ${FRAME}, ${CYCLES} Aerochrome/B&W cycles ---`);
    const seen = [];
    for (let i = 0; i < CYCLES; i++) {
      await press(p, VIA);
      await press(p, "lookAero");
      seen.push({
        h: await hash(p),
        wb: await p.evaluate(() => ["wbR", "wbG", "wbB"].map((i) => document.getElementById(i).value).join(",")),
      });
    }
    const renders = [...new Set(seen.map((s) => s.h))];
    const balances = [...new Set(seen.map((s) => s.wb))];
    check(`the ${CYCLES}th Aerochrome is the first, pixel for pixel`, renders.length === 1, renders.join(" "));
    check("the white balance does not creep across the cycles", balances.length === 1, balances.join("  |  "));
    await ctx.close();
  }
} finally {
  await b.close();
}

if (PLANT) {
  const caught = failed > 0;
  console.log(`\n--plant: ${caught ? "ok   the walk saw that a different look came back" : "FAIL  a different look came back and the walk called it the same photograph"}`);
  process.exit(caught ? 0 : 1);
}
console.log(failed ? `\n${failed} failing` : "\nall green — every look comes back the same photograph");
process.exit(failed ? 1 : 0);
