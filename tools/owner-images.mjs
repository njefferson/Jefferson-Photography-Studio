#!/usr/bin/env node
// THE ONE DOOR TO THE OWNER'S TEST PHOTOGRAPHS.
//
//   node tools/owner-images.mjs --list [text]     what is there, from the index
//   node tools/owner-images.mjs --fetch NAME...   download, check the size, print the path
//   node tools/owner-images.mjs --summary         one paragraph, for the session brief
//
// WHAT IT EXISTS TO STOP (hub LESSONS 369). Session after session calibrated
// and judged the look on the 44 practice DNGs in public/examples/. They are
// hand-written copies with no EXIF, so the app opens them with no camera and no
// lens: no lens fix, nothing the reader's own files get. Decision 069's ten
// options were judged on them, and option 10 blamed the white balance for a
// cyan cloud on two practice frames while the one real raw in the same run,
// opened with its lens fix, had a neutral cloud. Meanwhile the owner had
// shared several hundred real files, the originals of 27 practice frames among
// them, and every session rediscovered them by searching scratch folders that
// die with the container. The same failure then went further: a session went
// looking through the owner's whole Drive for a file outside those folders.
//
// SO THE SET IS CLOSED. tools/owner-images.json lists the files in the Drive
// folders the owner shared for testing, and nothing else. `resolve` refuses a
// practice DNG and any file the index does not name. Adding a folder is the
// owner's act: they share it, and its listing is added here. Never search
// Drive for more.
import { readFileSync, existsSync, statSync, mkdirSync, createWriteStream } from "node:fs";
import { join, basename, resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import https from "node:https";

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = JSON.parse(readFileSync(join(HERE, "owner-images.json"), "utf8"));
const EXAMPLES = resolvePath(HERE, "..", "public", "examples");
/** Where fetched files live: one stable place, so nothing is searched for. */
export const CACHE = process.env.JPS_OWNER_CACHE || join(homedir(), ".cache", "jps-owner-images");

/** The index entry for a file name.
 *  @param name a file name as the index writes it, e.g. "NIR_1651.NEF".
 *  @returns the first entry with that name, or undefined when the owner has
 *    not shared it. Consumed by `resolve` and `--fetch`; a name the owner
 *    shared twice resolves to the first, and the two are the same size. */
export function entry(name) {
  return INDEX.files.find((f) => f.name === name);
}

/** Download one index entry into CACHE unless it is already there whole.
 *  @param e an entry from the index.
 *  @returns the local path, whose size equals the entry's. Throws on a short
 *    or failed download rather than returning a partial file. */
async function fetchEntry(e) {
  mkdirSync(CACHE, { recursive: true });
  const out = join(CACHE, e.name);
  if (existsSync(out) && statSync(out).size === e.size) return out;
  const get = (url, depth = 0) => new Promise((ok, no) => {
    https.get(url, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && depth < 5) {
        res.resume(); ok(get(new URL(res.headers.location, url).toString(), depth + 1)); return;
      }
      if (res.statusCode !== 200) { res.resume(); no(new Error(`${e.name}: Drive answered ${res.statusCode}`)); return; }
      const w = createWriteStream(out);
      res.pipe(w);
      w.on("finish", () => ok(out));
      w.on("error", no);
    }).on("error", no);
  });
  await get(`https://drive.usercontent.google.com/download?id=${e.id}&export=download&confirm=t`);
  const got = statSync(out).size;
  if (got !== e.size) throw new Error(`${e.name}: downloaded ${got} bytes, the index says ${e.size}`);
  return out;
}

/** THE GATE. Turn a name or path into a local copy of one of the owner's files.
 *  @param nameOrPath "NIR_1651.NEF", or a path whose file name is in the index.
 *  @returns the local path of that file, fetched from Drive if not yet cached.
 *    Throws for anything under public/examples/ and for any file the index
 *    does not name. tools/look-sheet.mjs takes its file through this, and so
 *    must every harness that renders for calibration or a record. */
export async function resolve(nameOrPath) {
  const abs = resolvePath(nameOrPath);
  if (abs.startsWith(EXAMPLES + "/") || /\.dng$/i.test(nameOrPath) && entry(basename(nameOrPath)) === undefined) {
    throw new Error(`REFUSED: ${nameOrPath} is a practice DNG. It carries no EXIF, so the app opens it with no camera and no lens fix. `
      + `Use the owner's own file: node tools/owner-images.mjs --list ${basename(nameOrPath).replace(/\.[^.]+$/, "")} (hub LESSONS 369).`);
  }
  const e = entry(basename(nameOrPath));
  if (!e) {
    throw new Error(`REFUSED: ${basename(nameOrPath)} is not in tools/owner-images.json, the files the owner shared for testing. `
      + `Choose one that is (node tools/owner-images.mjs --list); never search Drive for more (hub LESSONS 369).`);
  }
  if (existsSync(nameOrPath) && statSync(nameOrPath).size === e.size) return abs;
  return fetchEntry(e);
}

/** One paragraph on what the index holds, for tools/session-brief.mjs.
 *  @returns the lines to print; they name the door and the rule. */
export function summary() {
  const count = (ext) => INDEX.files.filter((f) => f.name.toUpperCase().endsWith(ext)).length;
  const orig = INDEX.files.filter((f) => f.practiceCopy).length;
  return [
    `THE OWNER'S TEST PHOTOGRAPHS: ${INDEX.files.length} files in ${INDEX.folders.length} shared Drive folders — ${count(".NEF")} raws, ${count(".JPG")} camera JPEGs,`,
    `  and the originals of ${orig} practice frames. tools/owner-images.json; list, fetch and resolve through`,
    `  tools/owner-images.mjs. Calibrate and judge only on these, opened in the app so the lens fix applies.`,
    `  The practice DNGs are for decode and geometry only. Never search Drive for more (hub LESSONS 369).`,
  ];
}

if (process.argv[1] && resolvePath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [flag, ...rest] = process.argv.slice(2);
  if (flag === "--summary") {
    for (const l of summary()) console.log(l);
  } else if (flag === "--list") {
    const q = (rest[0] || "").toLowerCase();
    const folder = new Map(INDEX.folders.map((f) => [f.id, f]));
    for (const f of INDEX.files.filter((f) => f.name.toLowerCase().includes(q))) {
      console.log(`${f.name.padEnd(18)} ${(f.size / 1048576).toFixed(1).padStart(6)} MB  ${folder.get(f.folder).holds.slice(0, 60)}${f.practiceCopy ? `  (original of ${f.practiceCopy})` : ""}`);
    }
  } else if (flag === "--fetch") {
    let failed = 0;
    for (const n of rest) {
      try { console.log(await resolve(n)); } catch (err) { console.log(err.message); failed++; }
    }
    process.exit(failed ? 1 : 0);
  } else {
    console.log("node tools/owner-images.mjs --list [text] | --fetch NAME... | --summary");
    process.exit(1);
  }
}
