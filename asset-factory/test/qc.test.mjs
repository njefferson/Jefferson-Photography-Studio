import { test } from "node:test";
import assert from "node:assert/strict";
import { mockProvider } from "../src/providers/mock.mjs";
import { qcCheck } from "../src/qc.mjs";
import { QC_DEFAULTS } from "../src/config.mjs";

// Seeds chosen to hit each planted failure mode (see mock.mjs).
const SEEDS = {
  clean: 1, // not divisible by 23/19/17/13/11
  opaque: 23,
  twoBlobs: 19,
  cropped: 17,
  lowres: 13,
};

async function pngFor(seed) {
  return (await mockProvider.generate({ seed })).png;
}

test("a clean blob passes every tier-a check", async () => {
  const r = await qcCheck(await pngFor(SEEDS.clean), QC_DEFAULTS);
  assert.ok(r.pass, `expected pass, got ${r.reasons.join(",")}`);
  assert.equal(r.measurements.components, 1);
  assert.ok(r.measurements.width >= 768);
});

test("planted opaque-background is rejected", async () => {
  const r = await qcCheck(await pngFor(SEEDS.opaque), QC_DEFAULTS);
  assert.ok(!r.pass);
  assert.ok(r.reasons.includes("opaque-background"), r.reasons.join(","));
});

test("planted two-blob image is rejected as multiple-subjects", async () => {
  const r = await qcCheck(await pngFor(SEEDS.twoBlobs), QC_DEFAULTS);
  assert.ok(!r.pass);
  assert.ok(r.reasons.includes("multiple-subjects"), r.reasons.join(","));
});

test("planted edge-crossing image is rejected as cropped-subject", async () => {
  const r = await qcCheck(await pngFor(SEEDS.cropped), QC_DEFAULTS);
  assert.ok(!r.pass);
  assert.ok(r.reasons.includes("cropped-subject"), r.reasons.join(","));
});

test("planted low-resolution image is rejected", async () => {
  const r = await qcCheck(await pngFor(SEEDS.lowres), QC_DEFAULTS);
  assert.ok(!r.pass);
  assert.ok(r.reasons.includes("low-resolution"), r.reasons.join(","));
});

test("allowEdgeContact lets an edge-touching subject through", async () => {
  const strict = await qcCheck(await pngFor(SEEDS.cropped), { ...QC_DEFAULTS, allowEdgeContact: false });
  const lax = await qcCheck(await pngFor(SEEDS.cropped), { ...QC_DEFAULTS, allowEdgeContact: true });
  assert.ok(strict.reasons.includes("cropped-subject"));
  assert.ok(!lax.reasons.includes("cropped-subject"));
});
