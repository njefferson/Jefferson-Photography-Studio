import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = resolve(ROOT, "cli.mjs");
const REVIEW = resolve(ROOT, "review");

function run(dataDir, args) {
  return execFileSync("node", [CLI, ...args], { env: { ...process.env, AF_DATA_DIR: dataDir }, encoding: "utf8" });
}

test("publish-review copies approved PNGs and builds a valid contact sheet", async () => {
  const data = mkdtempSync(resolve(tmpdir(), "af-review-"));
  // Generate a mock bigfoot slice so there are approved assets to publish.
  run(data, ["generate", "--category", "bigfoot", "--provider", "mock", "--concurrency", "3"]);
  run(data, ["publish-review", "--category", "bigfoot"]);

  assert.ok(existsSync(resolve(REVIEW, "index.json")), "index.json written");
  const index = JSON.parse(readFileSync(resolve(REVIEW, "index.json"), "utf8"));
  assert.ok(index.count > 0, "some approved assets published");

  // Every listed item exists on disk as a real PNG.
  const pngs = readdirSync(REVIEW).filter((f) => f.endsWith(".png") && f !== "contact-sheet.png");
  assert.equal(pngs.length, index.count, "one review PNG per published item");

  // The contact sheet is a valid PNG whose height grows with the row count.
  assert.ok(existsSync(resolve(REVIEW, "contact-sheet.png")), "contact sheet exists");
  const meta = await sharp(resolve(REVIEW, "contact-sheet.png")).metadata();
  assert.equal(meta.format, "png");
  const rows = Math.ceil(index.count / 4);
  assert.equal(meta.height, rows * (320 + 28), "sheet height matches row count");
});
