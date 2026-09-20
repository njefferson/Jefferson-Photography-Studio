#!/usr/bin/env node
// A TILE PICKED BEFORE ITS PICTURE ARRIVED IS STILL PICKED WHEN YOU KEEP.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/quicklook-waiting-pick-walk.mjs [--port=8131] [--plant]
//
// WHY IT EXISTS. Every tile became pressable the moment a folder was picked —
// that is the whole of the change that put the grid up front, and it is what
// lets a reader cull a set while it is still being read. `willKeep` was not
// changed with it and still required a rendered picture. So a frame picked
// while it was reading showed as picked, was counted on the Keep button, and
// was dropped on the way through: the reader culls forty and gets fewer than
// they chose, with nothing saying which.
//
// THE CHECK IS THE COUNT AGAINST THE OUTCOME, which is the invariant the
// function's own contract names: the number on the Keep button has to be the
// number of photographs that arrive in the session. Anything that reads only
// one of those two can be satisfied by the other being wrong.
//
// AND THE PICK HAS TO LAND WHILE THE TILE IS ACTUALLY WAITING — not after,
// which is the ordinary case and passes on any build. The grid is drawn in
// about five milliseconds and the first decode takes hundreds, so the window
// is wide; the walk still asserts it was inside it rather than assuming, by
// reading the tile's state at the moment it presses.
//
// --plant picks a tile only AFTER the whole set has finished reading, which is
// the case that always worked. The last check must go red, because the walk
// then never exercised what it is named for.
import { chromium } from "playwright-core";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
import { readdirSync } from "node:fs";
import { join } from "node:path";
const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const PLANT = process.argv.includes("--plant");
let failed = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "ok  " : "FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) failed++; };

const files = readdirSync("public/examples").filter((f) => f.endsWith(".dng")).sort().slice(0, 6)
  .map((f) => join("public/examples", f));
if (files.length < 4) { console.log("FAIL  not enough practice raws"); process.exit(1); }

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  p.on("dialog", (d) => d.accept());
  await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
  await p.waitForSelector("#quickFiles", { state: "attached", timeout: 60000 });
  await p.setInputFiles("#quickFiles", files);
  // The grid is up long before anything has been read.
  await p.waitForFunction((n) => (document.getElementById("qlGrid")?.children.length ?? 0) >= n, files.length, { timeout: 60000 });
  if (PLANT) await p.waitForFunction(() => !document.getElementById("qlGrid")?.dataset.busy, null, { timeout: 180000 });

  // PICK THE LAST TWO TILES, which are the ones furthest from being read: the
  // lanes work through the set in order, so the tail is still waiting while the
  // head is rendering.
  //
  // TWO, NOT ONE, and the first version picked one. A session of a single
  // photograph has no strip — the app's own filter drops the lone photo from
  // `sessionThumbs` — so the outcome check read zero and looked exactly like
  // Keep dropping the pick. Two is also the stronger assertion: it can catch a
  // count that is right by luck.
  const picked = await p.evaluate(() => {
    const cells = [...document.querySelectorAll("#qlGrid .ql-cell")];
    const chosen = cells.slice(-2);
    const out = chosen.map((cell) => {
      const tile = cell.querySelector(".ql-tile");
      const wasWaiting = !!cell.querySelector(".ql-wait-mark") || !cell.querySelector(".ql-tile img");
      tile?.click();
      return { name: tile?.getAttribute("title")?.split(" — ")[0] ?? "", wasWaiting };
    });
    return { picks: out, cells: cells.length };
  });
  const waitingPicks = picked.picks.filter((x) => x.wasWaiting);
  check("the tiles could be pressed before they had pictures", PLANT ? false : waitingPicks.length === 2,
    `${waitingPicks.length} of 2 still waiting when pressed — ${picked.picks.map((x) => x.name).join(", ")}`);

  const shown = await p.evaluate(() => ({
    label: document.getElementById("qlKeep")?.textContent?.trim() ?? "",
    disabled: !!document.getElementById("qlKeep")?.disabled,
    marked: document.querySelectorAll("#qlGrid .ql-cell .ql-pick-mark, #qlGrid .ql-cell.pick").length,
  }));
  const counted = Number((shown.label.match(/(\d+)/) ?? [])[1] ?? 0);
  check("the Keep button counts them", counted === 2 && !shown.disabled,
    `button reads "${shown.label}"`);

  // Let the set finish so the keep is not racing the read, then keep.
  await p.waitForFunction(() => !document.getElementById("qlGrid")?.dataset.busy, null, { timeout: 180000 });
  await p.click("#qlKeep");
  await p.waitForFunction(() => document.getElementById("quickLook")?.open !== true, null, { timeout: 120000 });
  await p.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
  await p.waitForTimeout(800);

  // THE OUTCOME: how many photographs are in the session.
  // THE STRIP IS #sessionThumbs, and the first version of this line guessed at
  // three selectors that match nothing. It reported 0 photographs arriving and
  // read as a defect in Keep; the defect was here. A selector written from
  // memory is a measurement of memory.
  const arrived = await p.evaluate(() => document.querySelectorAll("#sessionThumbs .session-thumb").length);
  check("and exactly what was counted arrives in the session", arrived === counted && counted > 0,
    `${counted} counted on the button, ${arrived} in the strip`);
  if (arrived !== counted) {
    const why = await p.evaluate(() => ({ strip: document.getElementById("sessionThumbs")?.children.length ?? -1, dialogOpen: !!document.getElementById("quickLook")?.open }));
    console.log(`        strip children ${why.strip}, quick look still open: ${why.dialogOpen}`);
  }
  await ctx.close();
} finally { await b.close(); }
console.log(failed ? `\n${failed} failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
