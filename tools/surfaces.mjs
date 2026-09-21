#!/usr/bin/env node
// WHAT THIS APP IS MADE OF, IN ONE PLACE, AND HELD TO THE BUILD.
//
//   node tools/surfaces.mjs          print the list and check it both ways
//
// Imported by tools/a11y-walk.mjs and tools/class-width-walk.mjs, so the two
// cannot disagree about which pages and dialogs exist. class-width-walk carried
// its own hardcoded list of four pages while seven deploy; that is the drift
// half this family's lessons are about, and one enumeration is the answer.
//
// WHY IT READS `dist/` AND NOT THE SOURCE TREE. `notes.html` does not exist as
// a file — vite generates it at build time from the git log and two NOTES.md
// sections. A list built from the repository would therefore be missing a page
// that ships, which is exactly the failure this file exists to refuse.
//
// THE COMMENT THIS REPLACES. The accessibility sweep carried, in its own words:
//
//     A NEW SURFACE JOINS THIS LIST IN THE SAME COMMIT THAT CREATES IT, or it
//     ships unmeasured — which is how .ql-btn stayed 34px for as long as it did.
//
// It was true and it refused nothing. Measured the day this was written:
// ir.html declares FOURTEEN dialogs and the sweep visited three; the axe pass
// ran on ir.html alone while seven pages deploy. An instruction in a file has
// never once stopped a commit in this family — branch-guard and plan-guard are
// both the same escalation — so the list is an assertion now. Both directions:
// a page or dialog that ships and is not declared FAILS, and a declaration that
// no longer exists FAILS too, because a removed surface leaves its entry behind
// and the next reader trusts it.
//
// A dialog that genuinely cannot be opened cold is declared in `.a11y-allow`
// with its reason, and EVERY REASON PRINTS ON EVERY RUN — the shape
// `.example-allow`, `.copy-allow` and `.quote-allow` already use here and in
// the hub. A list that hides what it excuses is a list nobody audits.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

export const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(repo, "dist");

/** Every page that deploys, and every dialog declared in it. Keyed by page,
 *  because `helpDlg` exists in two of them and they are not the same surface. */
export const PAGES = [
  { file: "index.html", dialogs: ["welcomeDlg"] },
  { file: "ir.html", dialogs: [
      "verDlg", "busy", "library", "qlCompareDlg", "quickLook", "batchDlg",
      "ratioDlg", "lookDlg", "lookPasteDlg", "lookRecvDlg", "infoDlg",
      "lensDlg", "askDlg", "locDlg", "helpDlg", "keptDlg",
    ] },
  // verDlg is BUILT IN SCRIPT, not written in macro.html — src/verdlg.ts appends
  // it at boot. A surface the markup does not mention is exactly the kind that
  // ships unmeasured, so it is declared here in the same commit that creates it
  // (hub LESSONS §28, which cost a release when it was learned).
  { file: "macro.html", dialogs: ["helpDlg", "verDlg"] },
  { file: "debug.html", dialogs: [] },
  { file: "notes.html", dialogs: [] },
  { file: "privacy.html", dialogs: [] },
  { file: "conveyor-status.html", dialogs: [] },
];

/** What is in the build right now: page -> the dialog ids its markup declares. */
export function fromBuild(dist = DIST) {
  if (!existsSync(dist)) throw new Error(`no build at ${dist} — run \`npm run build\` first`);
  const out = new Map();
  for (const name of readdirSync(dist).sort()) {
    if (!name.endsWith(".html")) continue;
    const src = readFileSync(join(dist, name), "utf8");
    const ids = [...src.matchAll(/<dialog\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
    // A dialog with no id cannot be opened by the walk and cannot be declared,
    // so it is its own failure rather than something to count past.
    const total = (src.match(/<dialog\b/g) || []).length;
    out.set(name, { ids, unnamed: total - ids.length });
  }
  return out;
}

/** Dialogs the walk deliberately does not open, each with its reason. */
export function allowed() {
  const file = join(repo, ".a11y-allow");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [where, ...why] = l.split("—");
      return { where: where.trim(), why: why.join("—").trim() };
    });
}

/** Both directions, plus the unnamed check. Returns a list of failures. */
export function check(dist = DIST) {
  const built = fromBuild(dist);
  const bad = [];
  const declared = new Set(PAGES.map((p) => p.file));
  /** Does any built script create an element with this id? Deliberately a plain
   *  substring of the emitted bundles: minification renames variables, never a
   *  string literal, so `dlg.id = "verDlg"` survives as the text `"verDlg"`. */
  const inScripts = (id) => {
    const dir = join(repo, "dist/assets");
    let files;
    try { files = readdirSync(dir).filter((f) => f.endsWith(".js")); } catch { return false; }
    return files.some((f) => readFileSync(join(dir, f), "utf8").includes(`"${id}"`));
  };

  for (const name of built.keys()) {
    if (!declared.has(name)) bad.push(`${name} deploys and is not in PAGES — it would ship unmeasured.`);
  }
  for (const p of PAGES) {
    if (!built.has(p.file)) { bad.push(`PAGES lists ${p.file}, which no longer deploys — a removed page leaves its entry behind.`); continue; }
    const { ids, unnamed } = built.get(p.file);
    if (unnamed > 0) bad.push(`${p.file} has ${unnamed} <dialog> with no id — it cannot be opened or declared.`);
    for (const id of ids) {
      if (!p.dialogs.includes(id)) bad.push(`${p.file} declares <dialog id="${id}"> and PAGES does not list it.`);
    }
    for (const id of p.dialogs) {
      // A DIALOG CAN BE BUILT IN SCRIPT, and this check could only see markup.
      // src/verdlg.ts appends its <dialog> at boot, so macro.html's markup does
      // not mention it and the declaration read as a stale entry — the gate
      // telling the truth about what it could see, and the wrong answer.
      //
      // The verifiable fact for a scripted surface is that the code creating it
      // SHIPS: if no page declares the id, the bundles must. That keeps both
      // directions of the check — a declaration still has to correspond to
      // something that deploys, and it still cannot be satisfied by nothing.
      if (!ids.includes(id) && !inScripts(id)) {
        bad.push(`PAGES lists ${p.file} #${id}, which is in neither the built markup nor any built script.`);
      }
    }
  }
  return bad;
}

/** The surfaces a walk should actually visit: every page, and for each the
 *  dialogs that are not excused. */
export function surfaces(dist = DIST) {
  const skip = new Set(allowed().map((a) => a.where));
  return PAGES.map((p) => ({
    file: p.file,
    dialogs: p.dialogs.filter((id) => !skip.has(`${p.file} #${id}`)),
  }));
}

if (basename(process.argv[1] || "") === "surfaces.mjs") {
  console.log("\n=== surfaces · Jefferson-Photography-Studio ===\n");
  const built = fromBuild();
  for (const p of PAGES) {
    const n = built.get(p.file)?.ids.length ?? 0;
    console.log(`  ${p.file.padEnd(24)} ${n} dialog${n === 1 ? "" : "s"}${p.dialogs.length ? ": " + p.dialogs.join(" ") : ""}`);
  }
  const ex = allowed();
  console.log(ex.length ? "\n  not opened, and why:" : "\n  nothing excused.");
  for (const a of ex) console.log(`    ${a.where} — ${a.why}`);
  const bad = check();
  if (bad.length) {
    console.error("\nFAIL");
    for (const b of bad) console.error("  " + b);
    process.exit(1);
  }
  console.log(`\nok — ${PAGES.length} pages and ${PAGES.reduce((n, p) => n + p.dialogs.length, 0)} dialogs, declared both ways.\n`);
}
