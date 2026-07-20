#!/usr/bin/env node
// Asset-factory CLI. Run from anywhere: `node asset-factory/cli.mjs <command>`.
// Mock is the default provider — real (paid) providers must be named explicitly
// and confirmed with --yes. Nothing here ever touches git.
import { resolve } from "node:path";
import { existsSync, readFileSync, rmSync, renameSync, mkdirSync } from "node:fs";
import { DIRS, MAX_PER_RUN, DEFAULT_CONCURRENCY, MAX_CONCURRENCY, DEDUPE_HAMMING, DATA } from "./src/config.mjs";
import { getProvider, PROVIDER_NAMES } from "./src/providers/index.mjs";
import { planWork, runGenerate } from "./src/pipeline.mjs";
import { allRecords, readRecord, writeRecord, readCuration, writeCuration } from "./src/catalog.mjs";
import { expandAll } from "./src/expander.mjs";
import { qcCheck } from "./src/qc.mjs";
import { dhash, findDuplicate } from "./src/dedupe.mjs";
import { promote } from "./src/promote.mjs";
import { publishReview } from "./src/review.mjs";
import { mattingAvailable } from "./src/providers/matting.mjs";

const HELP = `asset-factory — manifest-driven overlay-asset pipeline

  plan      [--category X[,Y]] [--provider P] [--stale]     what work is pending/stale + cost estimate
  generate  [--category X] [--limit N] [--provider ${PROVIDER_NAMES.join("|")}]
            [--concurrency N] [--dry-run] [--yes] [--max N] [--retry-rejected]
  regen     --stale [--category X] [--limit N] [--yes]      regenerate template-stale assets
  qc        [--category X] --rerun                          re-run tier-a QC over kept assets
  dedupe    [--category X] [--hamming N]                    recompute hashes + re-cluster
  curate    (--approve|--reject|--favorite|--unfavorite) --ids a,b,c   owner-taste overrides
  promote   [--category X] [--favorites-only] [--ids a,b] [--max-edge 1280] [--out DIR] [--dry-run]
  publish-review [--category X]                             copy approved PNGs + a contact sheet into review/
  stats     [--category X]                                  per-category status table

The image library (assets/ etc.) is gitignored and regenerable; the committed
truth is manifests/ + templates/ + database/. See README.md.`;

function parseArgs(argv) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else flags[key] = true;
    } else pos.push(a);
  }
  return { cmd: pos[0], flags };
}

const { cmd, flags } = parseArgs(process.argv.slice(2));
const categories = flags.category ? String(flags.category).split(",") : null;

function num(v, dflt) {
  return v === undefined ? dflt : Number(v);
}

function fmtUSD(v) {
  return `$${v.toFixed(2)}`;
}

async function main() {
  switch (cmd) {
    case "plan": {
      const provider = getProvider(flags.provider ?? "mock");
      const w = planWork({ categories, provider, retryRejected: Boolean(flags["retry-rejected"]) });
      console.log(`entries expanded : ${w.entries.length}`);
      for (const b of ["pending", "stale", "done", "rejected", "errored", "generating"])
        console.log(`${b.padEnd(17)}: ${w[b].length}`);
      const work = w.pending.length + w.errored.length + (flags.stale ? w.stale.length : 0);
      if (provider.costPerImageUSD > 0)
        console.log(`estimated cost for ${work} pending via ${provider.name}: ~${fmtUSD(work * provider.costPerImageUSD)} (estimate)`);
      if (flags.stale && w.stale.length) {
        console.log(`\nstale ids (template/manifest/settings changed):`);
        for (const { entry } of w.stale) console.log(`  ${entry.id}`);
      }
      break;
    }

    case "generate":
    case "regen": {
      const provider = getProvider(flags.provider ?? "mock");
      const w = planWork({ categories, provider, retryRejected: Boolean(flags["retry-rejected"]) });
      let items = cmd === "regen" ? (flags.stale ? w.stale : []) : [...w.pending, ...w.errored];
      if (cmd === "regen" && !flags.stale) {
        console.error("regen requires --stale (that's the only regeneration it does)");
        process.exit(1);
      }
      const limit = num(flags.limit, Infinity);
      items = items.slice(0, limit);
      if (!items.length) {
        console.log("nothing to do");
        break;
      }
      const isPaid = provider.costPerImageUSD > 0;
      const cap = num(flags.max, MAX_PER_RUN);
      if (isPaid && items.length > cap) {
        console.error(`refusing: ${items.length} images exceeds the per-run cap of ${cap} (raise with --max N)`);
        process.exit(1);
      }
      if (flags["dry-run"]) {
        console.log(`would ${cmd === "regen" ? "regenerate" : "generate"} ${items.length} images via ${provider.name} (${provider.model})`);
        if (isPaid) console.log(`estimated cost: ~${fmtUSD(items.length * provider.costPerImageUSD)}`);
        for (const { entry, built } of items.slice(0, 3)) {
          console.log(`\n--- ${entry.id} (seed ${entry.seed}) ---\n${built.positive}\nNEGATIVE: ${built.negative}`);
        }
        break;
      }
      if (isPaid && !flags.yes) {
        console.error(
          `this will call ${provider.name} for ${items.length} images (~${fmtUSD(items.length * provider.costPerImageUSD)}). Re-run with --yes to confirm.`,
        );
        process.exit(1);
      }
      provider.preflight?.(); // e.g. refuse a keyless paid run, upfront
      // Opaque providers (Flux) need the Ideogram cutout downstream — fail fast
      // if that key is missing rather than burning the render budget first.
      if (provider.supportsAlpha === false && !mattingAvailable()) {
        console.error(
          `${provider.name} renders opaque and needs the Ideogram cutout, but IDEOGRAM_API_KEY is not set.`,
        );
        process.exit(1);
      }
      const concurrency = Math.min(MAX_CONCURRENCY, num(flags.concurrency, DEFAULT_CONCURRENCY));
      let done = 0;
      const { tally, logPath, runId } = await runGenerate({
        items,
        provider,
        concurrency,
        hamming: num(flags.hamming, DEDUPE_HAMMING),
        onEvent: (ev) => {
          if (["approve", "qc", "dedupe", "generate"].includes(ev.stage) && (ev.stage !== "generate" || !ev.ok)) return;
          done++;
          if (done % 25 === 0) console.log(`  …${done}/${items.length}`);
        },
      });
      console.log(`done: ${JSON.stringify(tally)} (log: ${logPath})`);
      // Surface provider failures AND QC rejections on stdout (the ephemeral
      // catalog is otherwise the only record) so a CI run's log explains what
      // went wrong and why an asset didn't make it to review.
      if (tally.error) {
        console.log(`\nerrors this run:`);
        for (const r of allRecords())
          if (r.run_id === runId && r.status === "error") console.log(`  ${r.id}\n    ${r.error}`);
      }
      if (tally.rejected) {
        console.log(`\nrejected this run (tier-a QC):`);
        for (const r of allRecords())
          if (r.run_id === runId && r.status === "rejected")
            console.log(`  ${r.id}\n    ${(r.qc?.reject_reasons ?? []).join(", ") || "(no reason recorded)"}`);
      }
      break;
    }

    case "qc": {
      if (!flags.rerun) {
        console.error("qc requires --rerun (QC runs inline during generate; this re-checks kept assets)");
        process.exit(1);
      }
      const entriesById = new Map(expandAll(DIRS.manifests, categories).map((e) => [e.id, e]));
      let checked = 0;
      let demoted = 0;
      for (const rec of allRecords()) {
        if (!["approved", "promoted"].includes(rec.status)) continue;
        if (categories && !categories.includes(rec.category)) continue;
        const p = resolve(DATA, rec.file ?? "");
        if (!existsSync(p)) continue;
        const entry = entriesById.get(rec.id);
        const res = await qcCheck(readFileSync(p), entry?.qc ?? {});
        checked++;
        rec.qc.tier_a = res.measurements;
        rec.qc.warnings = res.warnings;
        if (!res.pass) {
          rec.status = "rejected";
          rec.approved = false;
          rec.qc.reject_reasons = res.reasons;
          const dest = resolve(DIRS.rejected, `${rec.id}.png`);
          mkdirSync(DIRS.rejected, { recursive: true });
          if (existsSync(dest)) rmSync(dest);
          renameSync(p, dest);
          rec.file = `rejected/${rec.id}.png`;
          demoted++;
          console.log(`demoted ${rec.id}: ${res.reasons.join(",")}`);
        }
        writeRecord(rec);
      }
      console.log(`re-checked ${checked}, demoted ${demoted}`);
      break;
    }

    case "dedupe": {
      const threshold = num(flags.hamming, DEDUPE_HAMMING);
      const recs = allRecords()
        .filter((r) => ["approved", "promoted"].includes(r.status))
        .filter((r) => !categories || categories.includes(r.category))
        .sort((a, b) => (a.created < b.created ? -1 : 1)); // earliest wins
      const index = new Map();
      let dups = 0;
      for (const rec of recs) {
        const p = resolve(DATA, rec.file ?? "");
        if (!existsSync(p)) continue;
        const h = await dhash(readFileSync(p));
        rec.dhash = h;
        const dupOf = findDuplicate(h, index, threshold);
        if (dupOf) {
          rec.status = "duplicate";
          rec.approved = false;
          rec.duplicate_of = dupOf;
          const dest = resolve(DIRS.duplicates, `${rec.id}.png`);
          mkdirSync(DIRS.duplicates, { recursive: true });
          if (existsSync(dest)) rmSync(dest);
          renameSync(p, dest);
          rec.file = `duplicates/${rec.id}.png`;
          dups++;
          console.log(`duplicate ${rec.id} -> ${dupOf}`);
        } else index.set(rec.id, h);
        writeRecord(rec);
      }
      console.log(`re-hashed ${index.size + dups}, duplicates found: ${dups}`);
      break;
    }

    case "curate": {
      const ids = flags.ids ? String(flags.ids).split(",") : [];
      if (!ids.length) {
        console.error("curate needs --ids a,b,c");
        process.exit(1);
      }
      const cur = readCuration();
      for (const id of ids) {
        const rec = readRecord(id);
        if (!rec) {
          console.warn(`no such record: ${id}`);
          continue;
        }
        if (flags.approve) cur.approved[id] = true;
        if (flags.reject) cur.approved[id] = false;
        if (flags.favorite && !cur.favorites.includes(id)) cur.favorites.push(id);
        if (flags.unfavorite) cur.favorites = cur.favorites.filter((f) => f !== id);
        rec.favorite = cur.favorites.includes(id);
        writeRecord(rec);
      }
      writeCuration(cur);
      console.log(`curated ${ids.length} record(s)`);
      break;
    }

    case "promote": {
      const res = await promote({
        categories,
        favoritesOnly: Boolean(flags["favorites-only"]),
        ids: flags.ids ? String(flags.ids).split(",") : null,
        maxEdge: num(flags["max-edge"], 512),
        out: flags.out ? resolve(String(flags.out)) : undefined,
        dryRun: Boolean(flags["dry-run"]),
      });
      for (const p of res.promoted) console.log(`${flags["dry-run"] ? "would promote" : "promoted"} ${p.id} -> ${p.appCategory}/${p.name}.png`);
      if (res.metaSnippet) console.log(`\n${res.metaSnippet}`);
      console.log(`\n${res.promoted.length} asset(s). Shipping public/stickers/ changes is a product release (staging gate).`);
      break;
    }

    case "publish-review": {
      const res = await publishReview({ categories });
      console.log(`published ${res.items.length} asset(s) to review/${res.sheet ? " + contact-sheet.png" : ""}`);
      break;
    }

    case "stats": {
      const rows = {};
      for (const r of allRecords()) {
        if (categories && !categories.includes(r.category)) continue;
        rows[r.category] ??= {};
        rows[r.category][r.status] = (rows[r.category][r.status] ?? 0) + 1;
      }
      const statuses = ["approved", "promoted", "rejected", "duplicate", "error", "generating", "generated"];
      console.log(["category".padEnd(14), ...statuses.map((s) => s.padEnd(10))].join(""));
      for (const [cat, counts] of Object.entries(rows).sort())
        console.log([cat.padEnd(14), ...statuses.map((s) => String(counts[s] ?? 0).padEnd(10))].join(""));
      break;
    }

    default:
      console.log(HELP);
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => {
  console.error(e.stack ?? String(e));
  process.exit(1);
});
