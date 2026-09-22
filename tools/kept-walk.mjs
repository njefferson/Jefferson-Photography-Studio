#!/usr/bin/env node
// A PHOTOGRAPH YOU PUT DOWN, AND PICK UP AGAIN.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/kept-walk.mjs [--port=8131]
//
// WHY IT EXISTS (decision 039). Reported from the device: there is no way to
// save the photograph being worked on and come back to edit it more later. A
// SET opens as a session, which is persisted and resumable; a single
// photograph goes down `openSingle`, which is ephemeral by design — and that
// is the case a reader is in most often.
//
// WHAT IS ASSERTED AND WHY EACH.
//
//   1. With nothing kept, the start screen does not offer a list. A control
//      that is always there and usually empty teaches the reader to ignore it.
//   2. A kept photograph survives a FRESH LOAD — a new page in the same
//      browser context, which is what coming back next week looks like from
//      the app's side. Not a fresh CONTEXT: IndexedDB is per-origin and shared
//      across a context's pages but not across contexts, and a walk that opens
//      one reports the empty list as the app failing.
//   3. THE CHECK THE FEATURE TURNS ON: the EDIT comes back, not just the
//      photograph. It cannot be written as "did the photo reopen" — it would,
//      with every slider at its default, and that is precisely the failure. So
//      an unmistakable saturation and a Sky mask go on before keeping, and both
//      are read back after.
//   4. And the masks come back REGENERATED. They are stored as recipes with no
//      bitmaps (the shape decision 040 shipped), so a restore that forgot to
//      re-detect would come back with a mask selecting nothing. The sky's own
//      percentage is what tells those apart.
//   5. The boundary: ending a SESSION does not touch a kept photograph.
//      `keepstore.ts` is its own database for exactly this reason, and 039's
//      rejected "make it a session of one" is asserted here rather than
//      promised.
//   6. The DIAGNOSTIC report says the device is holding one. That report
//      enumerates a declared list of databases, so a new store is invisible
//      in it until somebody names it — which is how a store nobody can see
//      the size of gets shipped, one surface over from the list that does.
//   7. Forgetting one empties the list and takes the offer away with it.
import { chromium } from "playwright-core";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
let failed = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "ok  " : "FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) failed++; };
const settle = async (p) => { await p.waitForTimeout(350); await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); };
const openPhoto = async (p, files) => {
  await p.setInputFiles("#file", files);
  await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
  await p.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
  await settle(p);
};
const skyPct = (p) => p.evaluate(() => {
  const t = document.getElementById("mSkyStatus")?.textContent ?? "";
  return Number((t.match(/(\d+)% of the frame/) ?? [])[1] ?? -1);
});
const keptRows = (p) => p.evaluate(() => [...document.querySelectorAll("#keptList .kept-row")].map((r) => ({
  label: r.querySelector(".kept-open")?.textContent ?? "",
})));

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
try {
  // AT THE READER'S OWN GEOMETRY, not the driver's default. This walk used to
  // call newContext() with no options at all, which is Playwright's 1280x720 —
  // a number nobody chose, on a walk that is entirely about whether a
  // photograph can be put down and picked up again from a list on the start
  // screen. That list is one of the surfaces the start card holds, and the
  // start card is where a phone-width defect lived unseen (hub LESSONS 347).
  const ctx = await b.newContext({ viewport: { width: 402, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on("dialog", (d) => d.accept());
  await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
  await settle(p);

  // 1 · NOTHING KEPT, NOTHING OFFERED.
  check("with nothing kept, the start screen does not offer a list",
    await p.evaluate(() => !!document.getElementById("keptOpen")?.hidden));

  // 2 · AN EDIT WORTH COMING BACK TO. A saturation nobody would arrive at by
  // accident, and a Sky mask — the app's own centrepiece and the one thing a
  // session restore has never carried.
  await openPhoto(p, ["public/examples/NIR_1651.dng"]);
  await p.click("#ptab-color");
  await p.fill("#sat", "2.4");
  await settle(p);
  await p.click("#ptab-masks");
  await p.click("#addSky");
  await p.waitForFunction(() => !document.getElementById("skyControls")?.hidden, null, { timeout: 120000 });
  await settle(p);
  const satBefore = await p.evaluate(() => document.getElementById("sat")?.value ?? "");
  const pctBefore = await skyPct(p);
  check("the photograph has an edit worth keeping",
    satBefore === "2.4" && pctBefore > 0, `saturation ${satBefore}, sky ${pctBefore}%`);

  // 3 · KEEP IT, from the panel a reader already opens to finish.
  //
  // THIS PATH NO LONGER EXISTS AND THIS WALK IS HONEST ABOUT IT (decision 043,
  // 2026-09-22). `#keepPhoto` put a photograph into IndexedDB and was retired:
  // it and "Save this photo as a file" were two buttons for one idea, and that
  // storage is not the reader's to keep. The STORE and its list remain,
  // read-and-open-only, so what is still worth testing is that an
  // already-kept photograph opens — which needs a row seeded some other way,
  // because nothing in the app can create one now.
  //
  // Failing loudly beats timing out on a selector that is gone, and beats
  // quietly measuring nothing. Rewriting this walk to seed the store directly
  // is its own item; until then the round trip below is UNMEASURED.
  await p.click("#ptab-export");
  await settle(p);
  if (!(await p.$("#keepPhoto"))) {
    console.log("\n  FAIL  #keepPhoto is gone (decision 043 retired the in-app Keep as a writer).");
    console.log("        Nothing in the app can create a kept row, so this round trip cannot be");
    console.log("        driven through the UI. Seed the store directly, or retire this walk with");
    console.log("        the store. It is NOT passing and must not be read as passing.\n");
    process.exit(1);
  }
  await p.click("#keepPhoto");
  await p.waitForSelector("#askInput", { state: "visible", timeout: 20000 });
  await p.fill("#askInput", "Barn at dusk");
  await p.click("#askOk");
  await p.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 120000 });
  await settle(p);

  // 4 · COME BACK. A new page in the SAME context is what a later visit looks
  // like from the app's side; see the header for why not a new context.
  const p2 = await ctx.newPage();
  p2.on("dialog", (d) => d.accept());
  await p2.goto(`http://127.0.0.1:${PORT}/ir.html`);
  await settle(p2);
  const offer = await p2.evaluate(() => {
    const el = document.getElementById("keptOpen");
    return { shown: !!el && !el.hidden, label: el?.textContent ?? "" };
  });
  check("a kept photograph is offered on a fresh load",
    offer.shown && /1/.test(offer.label), offer.label || "nothing offered");

  await p2.click("#keptOpen");
  await settle(p2);
  const rows = await keptRows(p2);
  check("and it is listed under the name it was given",
    rows.length === 1 && rows[0].label.startsWith("Barn at dusk"),
    rows.map((r) => r.label.split("\n")[0]).join(" | ") || "the list is empty");
  const held = await p2.evaluate(() => document.getElementById("keptHeld")?.textContent ?? "");
  check("the list says what it is costing the device",
    /\d+\s*of\s*\d+\s*kept/.test(held) && /MB|GB/.test(held), held || "no total shown");

  // 5 · THE CHECK THE FEATURE TURNS ON.
  await p2.click("#keptList .kept-open");
  await p2.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
  await p2.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
  await settle(p2);
  const satAfter = await p2.evaluate(() => {
    document.getElementById("ptab-color")?.click();
    return document.getElementById("sat")?.value ?? "";
  });
  check("the EDIT came back, not just the photograph",
    satAfter === satBefore, `saturation ${satAfter} against ${satBefore} when it was kept`);

  const after = await p2.evaluate(() => {
    document.getElementById("ptab-masks")?.click();
    return [...document.querySelectorAll("#maskList .mask-row")].length;
  });
  await settle(p2);
  check("and the masks came back with it", after === 1, `${after} mask row(s)`);
  // GUARDED, because the check below cannot run without a mask and a walk that
  // THROWS is a worse instrument than one that fails: the first plant against
  // this file left no mask to select, and a stack trace took the place of both
  // this finding and the two sections after it.
  let pctAfter = -1;
  if (after === 1) {
    // Select the mask so its editor — and its status line — are on screen.
    await p2.click("#maskList .mask-row .mask-pick");
    await p2.waitForFunction(() => !document.getElementById("skyControls")?.hidden, null, { timeout: 120000 })
      .catch(() => {});
    await settle(p2);
    pctAfter = await skyPct(p2);
  }
  console.log(`\n  sky when kept ${pctBefore}%   sky after coming back ${pctAfter < 0 ? "no mask to read" : pctAfter + "%"}\n`);
  check("the sky mask was FOUND AGAIN, not restored as an empty selection",
    pctAfter > 0 && Math.abs(pctAfter - pctBefore) <= 2,
    after === 1 ? `${pctAfter}% against ${pctBefore}% when it was kept`
                : `no mask came back, so there was nothing to re-detect`);

  // 6 · AND THE APP SAYS IT IS HOLDING IT, where a reader looks when something
  // is wrong. The list's own total is one place; the diagnostic report (§7f) is
  // the one that gets copied and sent, and it enumerates a DECLARED list of
  // databases — so a new store is invisible there until it is named. It was.
  const report = await p2.evaluate(async () => {
    document.getElementById("verTag")?.click();
    for (let i = 0; i < 80; i++) {
      const t = document.getElementById("verDlgText");
      if (t && /App is holding/.test(t.value ?? "")) return t.value;
      await new Promise((r) => setTimeout(r, 100));
    }
    return document.getElementById("verDlgText")?.value ?? "";
  });
  await p2.evaluate(() => document.getElementById("verClose")?.click());
  await settle(p2);
  check("the diagnostic report says the device is holding a kept photo",
    /kept photo/.test(report),
    (report.match(/App is holding.*/) ?? ["no holdings line in the report"])[0]);

  // 7 · ENDING A SESSION IS NOT FORGETTING A KEPT PHOTOGRAPH.
  await p2.setInputFiles("#file", ["public/examples/NIR_0063.dng", "public/examples/NIR_0102.dng"]);
  await p2.waitForFunction(() => (document.querySelectorAll("#sessionThumbs .session-thumb").length >= 2), null, { timeout: 300000 });
  await p2.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
  await settle(p2);
  await p2.click("#sessionDone");
  await p2.waitForFunction(() => !document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
  await p2.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
  await settle(p2);
  const survived = await p2.evaluate(() => {
    const el = document.getElementById("keptOpen");
    return { shown: !!el && !el.hidden, label: el?.textContent ?? "" };
  });
  check("ending a session does not forget a kept photograph",
    survived.shown && /1/.test(survived.label), survived.label || "the offer is gone");

  // 8 · AND FORGETTING ONE TAKES THE OFFER WITH IT.
  await p2.click("#keptOpen");
  await settle(p2);
  await p2.click("#keptList .kept-del");
  await p2.waitForFunction(() => document.querySelectorAll("#keptList .kept-row").length === 0, null, { timeout: 20000 });
  await settle(p2);
  const gone = await p2.evaluate(() => ({
    rows: document.querySelectorAll("#keptList .kept-row").length,
    offered: !document.getElementById("keptOpen")?.hidden,
    said: document.getElementById("keptHeld")?.textContent ?? "",
  }));
  check("forgetting one empties the list and takes the offer away",
    gone.rows === 0 && !gone.offered && /Nothing kept/i.test(gone.said),
    `${gone.rows} row(s), offered ${gone.offered}, "${gone.said}"`);
  await p2.close();
} finally { await b.close(); }
console.log(failed ? `\n${failed} failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
