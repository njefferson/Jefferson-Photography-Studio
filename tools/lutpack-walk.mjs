#!/usr/bin/env node
// A ZIP OF LUTs IMPORTS, AND THE DEBRIS IN IT DOES NOT.
//
//   node tools/lutpack-walk.mjs [--plant=macosx|quiet] [--pack=<a real .zip>]
//
//   npm install --no-save playwright-core
//
// NOT in .branch-guard's `also=`: it drives a real browser. Run it before a
// release, or through tools/walk-all.mjs, which finds it on disk.
//
// WHY IT BUILDS ITS OWN PACK rather than committing one. LUT packs are somebody
// else's work under somebody else's licence, and a 1.7 MB fixture in the tree to
// test a file walk is a poor trade. The pack this builds has the SHAPE of the
// real one — .cube files inside nested folders, a licence and a readme beside
// them, deflated — plus the two kinds of debris a real one acquires and the
// fixture would otherwise never carry.
//
// THE DEBRIS IS THE POINT. A reader told to zip their LUTs will most often do it
// on a Mac, whose Compress command adds a `__MACOSX/` folder holding a `._name`
// resource fork for every file. Those forks END IN .cube and are not cubes. A
// pack of eighteen would report eighteen failures beside its eighteen LUTs, and
// the reader would have no idea which half was real.
//
// CHECK 7 HAS NO SERVED PLANT, and that is a limit rather than a choice.
// Storing a re-encoding instead of the archive's bytes is a difference in what a
// variable HOLDS, not a string the minifier keeps, so there is nothing to
// substitute. It was made to fail the direct way instead: the fix reverted in
// the source, the app rebuilt, and check 7 came back red at 249 bytes against
// the archive's 252, starting TIT rather than the mark. Then restored.
//
// --plant=macosx stops the fork guard matching, so check 2 can be seen to fail,
// and --plant=quiet silences the clause that says what did not fit, so check 5
// can be. Both are applied to the SERVED bundle rather than to the tree, so
// nothing has to be put back and no run can leave a plant behind.
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, extname } from "node:path";
import { requireFreshDist } from "./fresh-dist.mjs";

requireFreshDist();
const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || "").split("=")[1] || "";
const PLANT = arg("plant");
const REAL = arg("pack");
const DIST = new URL("../dist/", import.meta.url).pathname;
const WORK = process.env.CLAUDE_SCRATCH || "/tmp/lutpack-walk";
const PORT = 8139;
let failed = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "ok  " : "FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) failed++; };

const PLANTS = {
  // THE DEBRIS GUARD, and it is the `._` half that carries the weight. The
  // first version of this plant broke only the `__MACOSX/` test and every check
  // still passed — because every file macOS puts in that folder is ALSO named
  // `._something`, so the second test caught them all. That is worth knowing
  // rather than papering over: the folder test is defence in depth and the
  // name test is the one doing the work.
  //
  // SO THIS BREAKS THE NAME TEST ONLY, and the fixture is what makes that
  // enough: one of its two forks is LOOSE, in `Infrared Creative/` rather
  // than under `__MACOSX/`, so the folder test cannot catch it. A fixture
  // carrying only the `__MACOSX/` kind would go green against a broken name
  // test, which is the shape this plant exists to refuse. An earlier draft of
  // this comment said the plant broke BOTH tests. It does not — measured
  // against the served bundle, `startsWith("._")` occurs once and both
  // `__MACOSX` tests are left standing — and the difference is the whole
  // reason the loose fork is in the pack.
  macosx: { find: 'startsWith("._")', swap: 'startsWith("\u0000")' },
  // THE CLAUSE THAT SAYS WHAT DID NOT FIT. Break it and a pack over the cap
  // still stores the right number and tells the reader nothing about the rest.
  quiet: { find: "did not fit", swap: "all fitted fine" },
};
// WHAT NO PLANT COVERS, said out loud. Check 5 has two clauses: that exactly 25
// are stored, and that the reader is told what did not fit. The second has the
// plant above. The FIRST does not, because the cap is a number the minifier
// inlines — `LUT_COUNT_CAP` does not survive into the bundle — so there is no
// string to substitute. It is a direct assertion on a count, not a plant-backed
// one, and claiming otherwise would be the appearance of coverage.
//
// AND ONE CONTRACT CLAIM IS NOT DRIVEN HERE AT ALL: that a pack never applies
// a LUT to the open photograph. No arm below opens one, so no arm could tell.
// It rests on reading instead — `applyLutToEdit` has three references in
// main.ts, its definition and two call sites, and neither call is inside
// `importLutPack` — which is evidence rather than a measurement, and is
// written here rather than left for somebody to assume the walk covered it.
if (PLANT && !PLANTS[PLANT]) {
  console.error(`unknown plant "${PLANT}" — one of: ${Object.keys(PLANTS).join(", ")}`);
  process.exit(2);
}
let planted = false;

/** A .cube a reader could really have, small enough to build by hand.
 *
 *  Takes `title`, written into the file's own TITLE line when given, and `n`,
 *  the grid size. Returns the file's text. What the caller relies on: the grid
 *  is complete — `parseCube` refuses a file with fewer rows than its header
 *  promises, so a fixture that cut the corner would test the reject path
 *  instead of the import path. */
function cube(title, n = 2) {
  const rows = [];
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
    rows.push(`${(r / (n - 1)).toFixed(6)} ${(g / (n - 1)).toFixed(6)} ${(b / (n - 1)).toFixed(6)}`);
  }
  return (title ? `TITLE "${title}"\n` : "") + `LUT_3D_SIZE ${n}\n` + rows.join("\n") + "\n";
}

/** BUILD A ZIP WITH PYTHON'S OWN WRITER, deliberately not with this repo's.
 *
 *  Takes `path` to write and `files`, a map of entry name to text. Returns
 *  nothing. What the caller relies on: the archive is DEFLATED and written by
 *  something that is not `src/zip.ts` — a fixture built by the code under test
 *  agrees with itself by construction, which is the mistake the keep-file gate
 *  records finding in its own instrument. */
function zipWith(path, files) {
  const py = `
import zipfile, json, sys
files = json.loads(sys.argv[1])
with zipfile.ZipFile(sys.argv[2], "w", zipfile.ZIP_DEFLATED) as z:
    for name, text in files.items():
        z.writestr(name, text)
`;
  execFileSync("python3", ["-c", py, JSON.stringify(files), path]);
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".dng": "application/octet-stream", ".jpg": "image/jpeg" };

/** Serve ../dist, applying the plant to the editor's bundle on its way out.
 *
 *  Takes nothing; resolves once listening, so a busy port fails before a
 *  browser exists. Returns the server. Sets `planted` when a substitution
 *  lands, which the caller asserts before trusting any red. */
function serve() {
  const s = createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${PORT}`).pathname);
    let file = p === "/" ? "index.html" : p.replace(/^\//, "");
    if (!extname(file)) file += ".html";
    try {
      let body = await readFile(join(DIST, file));
      if (PLANT && /^assets\/ir-.*\.js$/.test(file)) {
        const t = body.toString("utf8");
        const { find, swap } = PLANTS[PLANT];
        if (t.includes(find)) { body = Buffer.from(t.split(find).join(swap)); planted = true; }
      }
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch { res.writeHead(404); res.end("not found"); }
  });
  return new Promise((ok, no) => { s.once("error", no); s.listen(PORT, () => { s.removeListener("error", no); ok(s); }); });
}

/** Poll a condition in the page until it holds. `page.waitForFunction` does not
 *  await a Promise predicate — the object is truthy, so the wait passes at
 *  once — and everything below waits on IndexedDB. */
async function until(page, what, fn, arg, ms = 120000) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (await page.evaluate(fn, arg)) return;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await page.waitForTimeout(100);
  }
}

await mkdir(WORK, { recursive: true });

// THE PACK, shaped like a real one: two folders, a licence and a readme beside
// the LUTs, one LUT that names itself and one that does not, and both kinds of
// Mac debris.
const PACK = join(WORK, "pack.zip");
zipWith(PACK, {
  "license.txt": "Copyright someone.\n",
  "readme.txt": "Details somewhere.\n",
  "Infrared Color Swap/IR Hue 180.cube": cube("Hue 180 by its own title"),
  "Infrared Color Swap/IR RB Swap.cube": cube(""),
  "Infrared Creative/Au Sable.cube": cube(""),
  "Infrared Creative/Torch.cube": cube(""),
  // WITH A BYTE-ORDER MARK, on purpose. It is the cheapest thing that makes a
  // re-encode visible: TextDecoder strips it, so a stored copy built from the
  // decoded text is three bytes shorter than the file in the archive. Without
  // this entry every cube here is clean ASCII and check 7 could not tell the
  // two implementations apart.
  "Infrared Creative/Bom.cube": "\ufeff" + cube("Has a mark"),
  "__MACOSX/Infrared Creative/._Torch.cube": "Mac resource fork, not a LUT\n",
  "Infrared Creative/._Au Sable.cube": "Mac resource fork, not a LUT\n",
});

// A PACK LARGER THAN THE SHELF. 30 against a cap of 25, so the ceiling has to
// report rather than truncate in silence.
const BIG = join(WORK, "big.zip");
zipWith(BIG, Object.fromEntries(
  Array.from({ length: 30 }, (_, i) => [`Pack/L${String(i).padStart(2, "0")}.cube`, cube(`L${String(i).padStart(2, "0")}`)]),
));

// A ZIP WITH NOTHING IN IT FOR US. Not an error — a sentence.
const EMPTY = join(WORK, "empty.zip");
zipWith(EMPTY, { "readme.txt": "no luts here\n", "cover.jpg": "not a jpeg either\n" });

// WHAT THE ARCHIVE ACTUALLY HOLDS for the marked entry, counted by python
// rather than by this app, so check 7 compares against an outside answer.
const bomBytes = Number(execFileSync("python3", ["-c",
  "import zipfile,sys\nz=zipfile.ZipFile(sys.argv[1])\nprint(len(z.read('Infrared Creative/Bom.cube')))",
  PACK], { encoding: "utf8" }).trim());

const server = await serve().catch((err) => {
  console.error(`\ncannot serve on :${PORT} — ${err.code ?? err.message}; free the port and re-run.\n`);
  process.exit(2);
});
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  const toasts = [];
  p.on("dialog", async (d) => { toasts.push("ALERT: " + d.message()); await d.dismiss(); });
  await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
  await until(p, "the editor to finish loading", () => !!document.getElementById("lutFile"));

  // CATCH EVERY TOAST, INCLUDING THE SECOND ONE. It is a div[role=status] with
  // no id, created ONCE and reused — later toasts only replace its text and
  // raise its opacity. So watching for the element to be ADDED sees the first
  // message of the session and never another, and a check written that way
  // reads an empty string and passes. Two versions of check 5 did exactly that:
  // the first read a selector that never existed, the second watched addedNodes.
  // This records the text on every mutation and keeps what changed.
  //
  // AND IT IS RE-INSTALLED AFTER EVERY NAVIGATION. It lives on `window`, so a
  // reload takes it with the document — check 6 reloads to start from an empty
  // store and the next import threw on a watcher that was no longer there.
  const watchToasts = async () => p.evaluate(() => {
    if (window.__toasts) return;
    const seen = [];
    Object.defineProperty(window, "__toasts", { value: seen, configurable: true });
    const sweep = () => {
      for (const el of document.querySelectorAll('[role="status"]')) {
        const t = (el.textContent ?? "").trim();
        if (t && t !== seen[seen.length - 1]) seen.push(t);
      }
    };
    new MutationObserver(sweep).observe(document.body, { childList: true, subtree: true, characterData: true });
    sweep();
  });
  await watchToasts();

  if (PLANT && !planted) {
    console.log("FAIL  the plant did not apply — the served bundle does not contain the string it replaces");
    failed++;
  }

  /** HAND A PACK TO THE IMPORTER AND WAIT FOR IT TO BE FINISHED.
   *
   *  Takes `path` to an archive. Returns the stored LUT names.
   *
   *  IT WAITS ON THE SUMMARY, NOT ON THE COUNT, and that is the whole design.
   *  An earlier version waited for the row count to reach the number the check
   *  then asserted — so the assertion could not fail: a regression came back as
   *  a timeout that aborted the run, not as one red line among green ones. The
   *  importer always speaks when it finishes, whatever it managed, so waiting
   *  on that sentence leaves every count free to be wrong. */
  const importPack = async (path) => {
    // BLANK THE TOAST ELEMENT, not just the log. It is created once and reused,
    // so the previous summary is still in the DOM — and `sweep` dedupes only
    // against the last thing it recorded, which after a clear is nothing. The
    // next body mutation would re-push the STALE summary, the wait below would
    // match it, and the row count would be read before this import finished.
    await p.evaluate(() => {
      window.__toasts.length = 0;
      for (const el of document.querySelectorAll('[role="status"]')) {
        if (el.style.position === "fixed") el.textContent = "";
      }
    });
    toasts.length = 0;
    await p.setInputFiles("#lutFile", path);
    // IT BREAKS ON ANY ANSWER, NOT ON THE EXPECTED ONE. The importer speaks
    // through two channels — a toast when something landed, an alert when
    // nothing did — and it has three early returns whose sentences contain no
    // summary at all: an unreadable archive, one holding no .cube files, and a
    // shelf already full. Waiting for the summary phrase means any of those
    // spins for three minutes and throws, aborting the run instead of reddening
    // a line, which is the exact failure this wait was rewritten to remove. So
    // it waits for the app to SAY SOMETHING and hands the sentence back; the
    // caller asserts what it should have been, and an unexpected answer arrives
    // as a red line carrying the answer.
    const t0 = Date.now();
    for (;;) {
      const heard = [...(await p.evaluate(() => window.__toasts)), ...toasts];
      if (heard.length) break;
      if (Date.now() - t0 > 180000) throw new Error(`${path}: nothing was said at all within 180s`);
      await p.waitForTimeout(100);
    }
    // A CLOCK IS NOT A CONDITION, and this file's own comments say so
    // elsewhere. `importLutPack` toasts and THEN calls `void renderLutList()`
    // un-awaited, which itself opens IndexedDB again — so the summary can be
    // heard before the list has finished redrawing. The real condition is the
    // row count going quiet: poll it until two reads in a row agree, rather
    // than sleep a guessed interval and hope it was long enough.
    let seen = -1, stable = 0;
    const tRows = Date.now();
    while (stable < 3 && Date.now() - tRows < 20000) {
      const n = await p.$$eval("#lutList .lut-row-name", (els) => els.length);
      stable = n === seen ? stable + 1 : 0;
      seen = n;
      await p.waitForTimeout(80);
    }
    const heard = [...(await p.evaluate(() => window.__toasts)), ...toasts];
    const summary = heard.find((t) => /imported from that pack/.test(t)) ?? "";
    const rows = await p.$$eval("#lutList .lut-row-name", (els) => els.map((e) => e.textContent ?? ""));
    return { rows, summary, heard };
  };

  // 1 — EVERY .cube IN A NESTED PACK ARRIVES. Five, across two folders —
  // four ordinary and one carrying a byte-order mark for check 7.
  const { rows: names, summary: packSaid } = await importPack(PACK);
  check("1 every .cube in a nested pack imports", names.length === 5,
    `${names.length} stored: ${names.map((n) => n.split(" · ")[0]).join(", ")}`
    + (names.length === 5 ? "" : ` — the app said: ${packSaid.slice(0, 120) || "nothing"}`));

  // 2 — AND THE MAC DEBRIS DOES NOT. Two forks went in; neither is a LUT, and
  // neither may be reported as one that failed.
  // BOTH CLAUSES, AND THE SECOND READS WHERE THE APP ACTUALLY SPEAKS. A fork
  // that gets past the guard is never STORED — it fails to parse — so a check
  // on the stored names alone cannot see it. What it produces is a failure
  // count in the summary, and the first version of this check looked for that
  // in the dialog alerts instead, where it never appears. The plant passed
  // against a broken guard because of it.
  const bare = names.map((n) => n.split(" · ")[0]);
  const debris = bare.filter((n) => n.startsWith("._") || n.includes("MACOSX"));
  check("2 a Mac's resource forks are not imported and not counted as failures",
    debris.length === 0 && !/could not be read/.test(packSaid),
    debris.length ? `imported ${debris.join(", ")}` : packSaid.slice(0, 140) || "nothing was said");

  // 3 — A LUT'S OWN TITLE WINS; otherwise the name is the file's, with the
  // folder gone. "Infrared Creative/Torch.cube" is "Torch", never the path.
  check("3 a packed LUT is named by its title, or by its file with no folder",
    bare.includes("Hue 180 by its own title") && bare.includes("Torch") && !bare.some((n) => n.includes("/")),
    bare.join(", "));

  // 7 — AND WHAT WAS STORED IS THE FILE THAT WAS IN THE ARCHIVE, byte for byte.
  // `LutRecord.cube` promises the ORIGINAL bytes so that sharing a LUT re-sends
  // the exact file. An implementation that stores a re-encoding of the decoded
  // text satisfies every other check here and breaks that quietly — which is
  // what the first version of the pack importer did. The Bom.cube entry exists
  // so this can tell: its mark survives a byte copy and does not survive a
  // decode. Read straight out of IndexedDB rather than through the app, so the
  // importer cannot agree with itself.
  const stored = await p.evaluate(async () => {
    const db = await new Promise((ok, no) => {
      const rq = indexedDB.open("ips-luts", 1);
      rq.onsuccess = () => ok(rq.result); rq.onerror = () => no(rq.error);
    });
    const all = await new Promise((ok, no) => {
      const rq = db.transaction("luts").objectStore("luts").getAll();
      rq.onsuccess = () => ok(rq.result); rq.onerror = () => no(rq.error);
    });
    return all.map((r) => ({ name: r.name, bytes: r.cube?.byteLength ?? 0, head: [...new Uint8Array((r.cube ?? new Uint8Array()).slice(0, 3))] }));
  });
  const marked = stored.find((r) => r.name === "Has a mark");
  check("7 a packed LUT is stored as the bytes the archive held, mark and all",
    !!marked && marked.head.join(",") === "239,187,191" && marked.bytes === bomBytes,
    marked ? `${marked.bytes} bytes against the archive's ${bomBytes}, starting ${marked.head.join(" ")}` : "the marked LUT was not stored");

  // 4 — A ZIP WITH NO LUTs IS A SENTENCE, NOT A CRASH.
  toasts.length = 0;
  await p.setInputFiles("#lutFile", EMPTY);
  // Waits for the ALERT, which is how this path answers — not for a clock. An
  // earlier version polled a predicate of `() => true`, which returns on its
  // first evaluate and left a fixed sleep doing the real waiting.
  const tEmpty = Date.now();
  while (!toasts.some((t) => /no \.cube files/.test(t)) && Date.now() - tEmpty < 15000) await p.waitForTimeout(100);
  check("4 a zip holding no .cube files says so", toasts.some((t) => /no \.cube files/.test(t)),
    toasts.join(" | ") || "nothing was said");

  // 5 — A PACK LARGER THAN THE CAP STORES WHAT FITS AND SAYS WHAT DID NOT.
  // Five are already in (check 1's pack), so 20 of the 30 fit and 10 do not.
  const { rows: all, summary } = await importPack(BIG);
  // THE SENTENCE, NOT ANY SENTENCE. The sweep above reads every [role=status]
  // on the page — the update strip and the app's own live regions among them —
  // so "did not fit" appearing SOMEWHERE proves nothing. The summary is
  // identified by the phrase only it produces, and the two clauses have to be
  // in the SAME string or this passes on two unrelated regions.
  check("5 a pack over the cap stores what fits and says what did not",
    all.length === 25 && /did not fit/.test(summary),
    `${all.length} stored · ${summary.slice(0, 160) || "no summary was said"}`);

  // 6 — AND A REAL PACK, when one is handed over. Not committed: this is the
  // artefact the defect was reported against, and it is somebody else's work.
  if (REAL) {
    toasts.length = 0;
    // AWAITED, not fired and forgotten. deleteDatabase returns a request, not
    // a promise — the delete can still be in flight when reload() tears the
    // page down, and a lost race here shows up as "25 of 18" with nothing
    // explaining why: the shelf a moment ago had room only because the delete
    // had not actually landed.
    await p.evaluate(() => new Promise(async (ok, no) => {
      for (const k of (await indexedDB.databases?.()) ?? []) {
        if (k.name !== "ips-luts") continue;
        const rq = indexedDB.deleteDatabase(k.name);
        rq.onsuccess = () => ok(); rq.onerror = () => no(rq.error); rq.onblocked = () => ok();
        return;
      }
      ok();
    }));
    await p.reload();
    await until(p, "the editor to reload", () => !!document.getElementById("lutFile"));
    await watchToasts();
    // HOW MANY IT SHOULD HOLD, counted by something that is not this app. A
    // check asserting only "more than none" would go green on one LUT out of
    // eighteen while the record beside it says the pack imports WHOLE.
    const want = Number(execFileSync("python3", ["-c",
      "import zipfile,sys,posixpath\n"
      + "z=zipfile.ZipFile(sys.argv[1])\n"
      + "n=[x for x in z.namelist() if x.lower().endswith('.cube')"
      + " and not x.startswith('__MACOSX/') and '/__MACOSX/' not in x"
      + " and not posixpath.basename(x).startswith('._')]\n"
      + "print(len(n))", REAL], { encoding: "utf8" }).trim());
    const { rows: real, summary: realSaid } = await importPack(REAL);
    check(`6 the real pack imports whole (${REAL.split("/").pop()})`, real.length === want,
      `${real.length} of ${want}: ${real.slice(0, 3).map((n) => n.split(" · ")[0]).join(", ")}…`
      + (real.length === want ? "" : ` — the app said: ${realSaid.slice(0, 120) || "nothing"}`));
  }

  await ctx.close();
} finally {
  await b.close();
  server.close();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
