// The orchestrator: expansion -> per-asset state machine -> files + catalog.
//
//   pending -> generating -> generated -> QC tier-a --fail--> rejected/
//                                          |pass
//                                        dedupe --hit--> duplicates/
//                                          |unique
//                                        assets/<category>/<id>.png  (approved)
//
// The catalog record is atomically rewritten at EVERY transition, so a crashed
// run resumes: re-running skips ids already terminal at the current
// prompt_hash; a `generating` record older than STUCK_GENERATING_MS is treated
// as crashed mid-flight and redone. Template/manifest/setting edits change
// prompt_hash -> those ids show as stale (`plan --stale`) and regenerate via
// `regen --stale`.
import { mkdirSync, renameSync, writeFileSync, appendFileSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { DIRS, STUCK_GENERATING_MS, DEDUPE_HAMMING } from "./config.mjs";
import { expandAll } from "./expander.mjs";
import { buildPrompt, promptHash } from "./prompt.mjs";
import { readRecord, writeRecord, allRecords } from "./catalog.mjs";
import { qcCheck } from "./qc.mjs";
import { dhash, findDuplicate } from "./dedupe.mjs";
import { retrySeed } from "./ids.mjs";

/**
 * Classify every expanded entry against the catalog.
 * Returns { pending, stale, done, rejected, errored, generating } id-> {entry, built, hash, rec} buckets.
 */
export function planWork({ categories = null, provider, retryRejected = false } = {}) {
  const entries = expandAll(DIRS.manifests, categories);
  const buckets = { pending: [], stale: [], done: [], rejected: [], errored: [], generating: [] };
  for (const entry of entries) {
    const built = buildPrompt(entry);
    const hash = promptHash(built, provider);
    const rec = readRecord(entry.id);
    const item = { entry, built, hash, rec };
    if (!rec) buckets.pending.push(item);
    else if (rec.prompt_hash !== hash) buckets.stale.push(item);
    else if (rec.status === "generating") {
      const age = Date.now() - Date.parse(rec.created || 0);
      (age > STUCK_GENERATING_MS ? buckets.pending : buckets.generating).push(item);
    } else if (rec.status === "rejected")
      (retryRejected ? buckets.pending : buckets.rejected).push(item);
    else if (rec.status === "error") buckets.errored.push(item); // retried by generate
    else if (["approved", "promoted", "duplicate"].includes(rec.status)) buckets.done.push(item);
    else buckets.pending.push(item); // pending/generated leftovers -> redo
  }
  return { entries, ...buckets };
}

function ensureDirs() {
  for (const d of [DIRS.catalog, DIRS.generated, DIRS.rejected, DIRS.duplicates, DIRS.logs])
    mkdirSync(d, { recursive: true });
}

function newRunId() {
  const t = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `${t}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Serialize the catalog/dedupe critical section across the concurrency pool. */
function makeMutex() {
  let tail = Promise.resolve();
  return (fn) => {
    const p = tail.then(fn, fn);
    tail = p.then(() => {}, () => {});
    return p;
  };
}

/**
 * Generate a work list. Options:
 *   items       — [{entry, built, hash, rec}] to process (from planWork buckets)
 *   provider    — adapter object
 *   concurrency — parallel generations (API politeness)
 *   hamming     — dedupe threshold
 *   onEvent     — optional progress callback ({id, stage, ok, detail})
 * Returns tallies { approved, rejected, duplicate, error }.
 */
export async function runGenerate({ items, provider, concurrency = 2, hamming = DEDUPE_HAMMING, onEvent = null }) {
  ensureDirs();
  const runId = newRunId();
  const logPath = resolve(DIRS.logs, `${runId}.jsonl`);
  const log = (ev) => {
    appendFileSync(logPath, JSON.stringify({ ts: new Date().toISOString(), run_id: runId, ...ev }) + "\n");
    onEvent?.(ev);
  };

  // Canonical survivors are the dedupe universe; loaded once, extended as we go.
  const hashIndex = new Map();
  for (const r of allRecords())
    if (r.dhash && ["approved", "promoted"].includes(r.status)) hashIndex.set(r.id, r.dhash);

  const mutex = makeMutex();
  const tally = { approved: 0, rejected: 0, duplicate: 0, error: 0 };

  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      await processOne(item);
    }
  }

  async function processOne({ entry, built, hash, rec }) {
    const id = entry.id;
    const retryCount = rec?.status === "rejected" ? (rec.retry_count ?? 0) + 1 : (rec?.retry_count ?? 0);
    const seed = retryCount > 0 ? retrySeed(id, retryCount) : entry.seed;
    const history = rec && rec.prompt_hash !== hash ? [...(rec.history ?? []), archiveOf(rec)] : (rec?.history ?? []);
    let record = {
      id,
      name: entry.name,
      category: entry.category,
      subcategory: entry.family,
      tags: entry.tags,
      prompt: built.positive,
      negative_prompt: built.negative,
      seed,
      provider: provider.name,
      model: provider.model,
      settings: built.settings,
      template: entry.template,
      template_version: built.template_version,
      prompt_hash: hash,
      created: new Date().toISOString(),
      run_id: runId,
      status: "generating",
      transparent: false,
      approved: false,
      favorite: rec?.favorite ?? false,
      retry_count: retryCount,
      qc: { tier_a: null, tier_b: null, reject_reasons: [] },
      dhash: null,
      duplicate_of: null,
      file: null,
      promoted: rec?.promoted ?? null,
      history,
    };
    writeRecord(record);
    const t0 = Date.now();
    let png;
    try {
      ({ png } = await provider.generate({
        prompt: built.positive,
        negativePrompt: built.negative,
        seed,
        aspectRatio: built.settings.aspect_ratio ?? "1x1",
        renderingSpeed: built.settings.rendering_speed,
        styleType: built.settings.style_type,
      }));
    } catch (e) {
      record.status = "error";
      record.error = String(e.message ?? e);
      writeRecord(record);
      tally.error++;
      log({ id, stage: "generate", ok: false, ms: Date.now() - t0, detail: record.error });
      return;
    }
    const genPath = resolve(DIRS.generated, `${id}.png`);
    writeFileSync(genPath, png);
    record.status = "generated";
    writeRecord(record);
    log({ id, stage: "generate", ok: true, ms: Date.now() - t0, detail: `${png.length}b seed=${seed}` });

    // QC + dedupe + placement — serialized so the hash index never races.
    await mutex(async () => {
      const qc = await qcCheck(png, entry.qc);
      record.qc.tier_a = qc.measurements;
      record.qc.warnings = qc.warnings;
      if (!qc.pass) {
        record.status = "rejected";
        record.qc.reject_reasons = qc.reasons;
        moveTo(genPath, resolve(DIRS.rejected, `${id}.png`));
        record.file = `rejected/${id}.png`;
        writeRecord(record);
        tally.rejected++;
        log({ id, stage: "qc", ok: false, detail: qc.reasons.join(",") });
        return;
      }
      record.transparent = true;
      const h = await dhash(png);
      record.dhash = h;
      const dupOf = findDuplicate(h, hashIndex, hamming);
      if (dupOf) {
        record.status = "duplicate";
        record.duplicate_of = dupOf;
        moveTo(genPath, resolve(DIRS.duplicates, `${id}.png`));
        record.file = `duplicates/${id}.png`;
        writeRecord(record);
        tally.duplicate++;
        log({ id, stage: "dedupe", ok: false, detail: `duplicate of ${dupOf}` });
        return;
      }
      const catDir = resolve(DIRS.assets, entry.category);
      mkdirSync(catDir, { recursive: true });
      // A stale regeneration replaces its old file (regenerable build product;
      // the old record's metadata lives on in history).
      const dest = resolve(catDir, `${id}.png`);
      if (existsSync(dest)) rmSync(dest);
      moveTo(genPath, dest);
      record.status = "approved"; // tier-a auto-approve in v1; curation can override
      record.approved = true;
      record.file = `assets/${entry.category}/${id}.png`;
      hashIndex.set(id, h);
      writeRecord(record);
      tally.approved++;
      log({ id, stage: "approve", ok: true, detail: record.file });
    });
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  log({ id: null, stage: "done", ok: true, detail: JSON.stringify(tally) });
  return { runId, tally, logPath };
}

function archiveOf(rec) {
  const { history, ...rest } = rec;
  return { archived: new Date().toISOString(), ...rest };
}

function moveTo(from, to) {
  if (existsSync(to)) rmSync(to);
  renameSync(from, to);
}
