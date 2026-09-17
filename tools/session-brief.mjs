#!/usr/bin/env node
// WHAT A SESSION MUST NOT RE-DERIVE ABOUT THIS APP.
//
// The hub's session-brief.mjs covers the family: which branch, whether the
// doctrine moved, the repo map, the lessons index. This covers THIS APP, and
// every line in it is here because a session re-derived it by grepping — most
// of them in one evening, some of them twice.
//
// EVERYTHING BELOW IS GENERATED. Not a summary somebody keeps current: the
// pipeline order is read out of pipeline.ts's own stated order, the gates out
// of .branch-guard, the walks out of tools/. A brief that can go stale is the
// document problem again, one level up.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const at = process.argv.indexOf("--repo");
const repo = resolve(at >= 0 ? process.argv[at + 1] : ".");
const read = (p) => { try { return readFileSync(join(repo, p), "utf8"); } catch { return ""; } };
const say = (s = "") => console.log(s);

say(`\n=== this app · ${repo.split("/").pop()} ===\n`);

// 1. THE PIPELINE ORDER. Grepped for twice in one evening.
const pipe = read("src/pipeline.ts").split("\n").slice(0, 12)
  .find((l) => l.includes("Order:"));
if (pipe) say(`PIPELINE: ${pipe.replace(/^\s*\/\/\s?/, "").trim()}\n  The per-colour HSL bands are the LAST thing that moves hue. src/pipeline.ts`);

// 2. THE FOUR ASSEMBLERS. The defect class this app keeps having: there is no
//    value meaning "how photograph X renders", only one mutable `params`
//    meaning "how the OPEN photograph renders", so every other path that
//    renders some other photograph reconstructs the at-open ruling by hand.
const main = read("src/main.ts");
const assemblers = ["establishFreshEdit", "makeThumb", "batchParamsFor", "openPhotoExportJob"]
  .filter((f) => main.includes(`function ${f}`) || main.includes(`${f} =`));
say(`\nFOUR PATHS RENDER A PHOTOGRAPH AND EACH REBUILDS THE AT-OPEN RULING:`);
for (const a of assemblers) say(`  ${a}`);
say(`  freshBaseline() is meant to be the ONE copy of that ruling. They still`);
say(`  disagree — tools/agreement-walk.mjs measures it, and two arms are red.`);

// 3. ADDING AN EditParams FIELD. Five places, and undo breaks silently on a miss.
const five = ["cloneParams", "applySnapshot", "syncFromUI", "syncToUI"].filter((f) => main.includes(f));
say(`\nADDING AN EditParams FIELD touches ${five.length + 1} places: ${five.join(", ")}, and the`);
say(`  input-listener array. applySnapshot restores fields INDIVIDUALLY, so one`);
say(`  missed there is dropped by Undo and Reset with nothing going red.`);

// 4. THE MODULE MAP — generated, gated, and the answer to "where does X happen".
const arch = read("docs/ARCHITECTURE.md");
const mods = (arch.match(/^- \*\*`src\//gm) || []).length;
if (mods) say(`\nMODULE MAP: ${mods} modules, docs/ARCHITECTURE.md — generated from each file's own\n  opening comment and held to it by tools/architecture-check.mjs. Read it\n  instead of grepping; it cannot be out of date.`);

// 5. THE GATES THAT REFUSE A COMMIT, from the declaration rather than memory.
const gates = (read(".branch-guard").match(/^also=(.+)$/gm) || []).map((l) => l.slice(5));
say(`\nEVERY COMMIT RUNS ${gates.length} GATES: ${gates.map((g) => g.replace("tools/", "").replace(".mjs", "")).join(", ")}`);

// 6. THE WALKS. Browser runs, not in the commit hook — a release sweep.
const tools = existsSync(join(repo, "tools")) ? readdirSync(join(repo, "tools")) : [];
const walks = tools.filter((f) => f.endsWith("-walk.mjs")).sort();
say(`\n${walks.length} WALKS (browser; not on commit). One command: node tools/walk-all.mjs`);
for (const w of walks) {
  const first = read(`tools/${w}`).split("\n").find((l) => /^\/\/ ?[A-Z]/.test(l)) || "";
  say(`  ${w.replace("-walk.mjs", "").padEnd(22)} ${first.replace(/^\/\/ ?/, "").slice(0, 78)}`);
}

// 6b. WHAT IS ON THE SCHEDULE, IN RANK ORDER, WITH ITS REASONING.
//
// An idea arriving in discussion has to be comparable against what is already
// scheduled and against what was decided before. That is only possible if a
// session KNOWS the schedule at the moment the idea arrives, which it did not:
// the roadmap is 250 lines deep in a 15,000-line file and nothing opened it.
// Titles and record paths only — the records themselves are read when an idea
// actually touches one.
const roadmapLines = read("NOTES.md").split("\n");
const rStart = roadmapLines.findIndex((l) => /^##\s+Next capability release/i.test(l));
const items = [];
if (rStart >= 0) {
  for (let i = rStart + 1; i < roadmapLines.length; i++) {
    if (/^##\s/.test(roadmapLines[i])) break;
    const m = roadmapLines[i].match(/^-\s+\[([ xX])\]\s+(.+)$/);
    if (!m) continue;
    const key = (m[2].match(/<!--\s*decision:\s*(\d{3})\s*-->/) ?? [])[1];
    const title = (m[2].match(/\*\*(.+?)\*\*/) ?? [, m[2].slice(0, 60)])[1];
    items.push({ key, title });
  }
}
if (items.length) {
  say(`\nTHE SCHEDULE — ${items.length} open, in RANK ORDER (file order is the rank):`);
  items.forEach((it, i) => say(`  ${String(i + 1).padStart(2)}. ${it.key ?? "---"}  ${it.title.slice(0, 68)}`));
  say(`  Each is docs/decisions/<key>-*.md — what was researched, what it was`);
  say(`  weighed against, what was REJECTED and why, and where it ranks. A new`);
  say(`  idea gets compared against these BEFORE it is judged, and a roadmap item`);
  say(`  without a record is refused by tools/decisions-check.mjs on commit.`);
}

// 7. THE RESEARCH FILE. The domain is looked up, never derived (Doctrine §11e).
say(`\nDOMAIN: IR-SCIENCE.md is the research file and the domain is LOOKED UP, not`);
say(`  derived — Doctrine §11e. A measurement of this app's own output cannot`);
say(`  tell you what the output should be.`);
say();
