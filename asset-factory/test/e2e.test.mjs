import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = resolve(ROOT, "cli.mjs");

function run(dataDir, args, extraEnv = {}) {
  return execFileSync("node", [CLI, ...args], {
    env: { ...process.env, AF_DATA_DIR: dataDir, ...extraEnv },
    encoding: "utf8",
  });
}

function records(dataDir) {
  const dir = resolve(dataDir, "database", "catalog");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(resolve(dir, f), "utf8")));
}

test("mock generate places files by QC/dedupe outcome, resumes, and regenerates when stale", () => {
  const data = mkdtempSync(resolve(tmpdir(), "af-e2e-"));

  // Generate a bigfoot slice with the mock provider (planted failures included).
  run(data, ["generate", "--category", "bigfoot", "--provider", "mock", "--concurrency", "3"]);
  const recs = records(data);
  assert.ok(recs.length > 0, "expected catalog records");

  const byStatus = (s) => recs.filter((r) => r.status === s);
  assert.ok(byStatus("approved").length > 0, "some assets should be approved");

  // Each terminal status must have its file in the matching directory.
  for (const r of recs) {
    if (["approved", "rejected", "duplicate"].includes(r.status)) {
      assert.ok(r.file, `${r.id} has no file`);
      assert.ok(existsSync(resolve(data, r.file)), `${r.id} file missing at ${r.file}`);
      const bucket = r.status === "approved" ? "assets/" : r.status === "rejected" ? "rejected/" : "duplicates/";
      assert.ok(r.file.startsWith(bucket), `${r.id} (${r.status}) filed under ${r.file}`);
    }
    if (r.status === "rejected") assert.ok(r.qc.reject_reasons.length > 0, `${r.id} rejected with no reason`);
    if (r.status === "duplicate") assert.ok(r.duplicate_of, `${r.id} duplicate with no source`);
    if (r.status === "approved") assert.equal(r.transparent, true);
  }

  // RESUME: an immediate re-run generates nothing new (all ids terminal at the
  // current prompt_hash).
  const plan1 = run(data, ["plan", "--category", "bigfoot", "--provider", "mock"]);
  assert.match(plan1, /pending {2,}: 0/);
  const before = records(data).map((r) => r.run_id);
  run(data, ["generate", "--category", "bigfoot", "--provider", "mock"]);
  const after = records(data).map((r) => r.run_id);
  assert.deepEqual(after, before, "resume should not re-generate anything");

  // STALENESS: bump the (copied) global template version -> all bigfoot ids stale.
  // We point templates at a scratch copy so the committed template is untouched.
  const built = run(data, ["plan", "--category", "bigfoot", "--provider", "mock", "--stale"]);
  assert.match(built, /stale {2,}: 0/); // nothing stale yet

  // Emulate a template edit by changing provider (part of the hash): the
  // ideogram provider name changes prompt_hash for every id without a key call
  // path being reached (plan only computes hashes).
  const planIdeo = run(data, ["plan", "--category", "bigfoot", "--provider", "ideogram"]);
  assert.match(planIdeo, /stale {2,}: \d+/);
  const staleCount = Number(planIdeo.match(/stale {2,}: (\d+)/)[1]);
  assert.ok(staleCount > 0, "changing the provider should mark ids stale");
});

test("ideogram generate without a key refuses clearly", () => {
  const data = mkdtempSync(resolve(tmpdir(), "af-e2e-nokey-"));
  let msg = "";
  try {
    run(data, ["generate", "--category", "folklore", "--provider", "ideogram", "--limit", "1", "--yes"], { IDEOGRAM_API_KEY: "" });
  } catch (e) {
    msg = String(e.stderr ?? e.stdout ?? e.message);
  }
  assert.match(msg, /IDEOGRAM_API_KEY/);
});
