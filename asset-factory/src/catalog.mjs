// The catalog IS the durable library: one small JSON record per asset under
// database/catalog/ (committed; the gitignored PNGs are regenerable from it).
// Records are written atomically (tmp + rename) at every state transition so a
// crashed run resumes cleanly.
//
// Record shape (the owner's required metadata plus pipeline state):
// { id, name, category, subcategory, tags, prompt, negative_prompt, seed,
//   provider, model, settings, template, template_version, prompt_hash,
//   created, run_id, status, transparent, approved, favorite,
//   qc: { tier_a, tier_b, reject_reasons }, dhash, duplicate_of, file,
//   promoted, history }
// status: pending|generating|generated|rejected|duplicate|approved|promoted|error
import { readFileSync, writeFileSync, readdirSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { DIRS } from "./config.mjs";

export function recordPath(id, dir = DIRS.catalog) {
  return resolve(dir, `${id}.json`);
}

export function readRecord(id, dir = DIRS.catalog) {
  const p = recordPath(id, dir);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

export function writeRecord(rec, dir = DIRS.catalog) {
  mkdirSync(dir, { recursive: true });
  const p = recordPath(rec.id, dir);
  const tmp = p + ".tmp";
  writeFileSync(tmp, JSON.stringify(rec, null, 2) + "\n");
  renameSync(tmp, p); // atomic on the same filesystem
  return rec;
}

export function allRecords(dir = DIRS.catalog) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(resolve(dir, f), "utf8")));
}

// ---- curation: the owner-taste layer, kept OUT of the regenerable records so a
// full regeneration never destroys his decisions.
// { approved: {id: true|false}, favorites: [id], names: {id: "display-name"} }
export function readCuration(path = DIRS.curation) {
  if (!existsSync(path)) return { approved: {}, favorites: [], names: {} };
  const c = JSON.parse(readFileSync(path, "utf8"));
  return { approved: c.approved ?? {}, favorites: c.favorites ?? [], names: c.names ?? {} };
}

export function writeCuration(cur, path = DIRS.curation) {
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(cur, null, 2) + "\n");
  renameSync(tmp, path);
}

/** Effective approval: curation override wins over the record's own flag. */
export function isApproved(rec, cur) {
  if (rec.id in cur.approved) return cur.approved[rec.id];
  return rec.approved === true;
}
