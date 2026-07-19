import { test } from "node:test";
import assert from "node:assert/strict";
import { expandAll, expandSpec } from "../src/expander.mjs";
import { idFor, seedFor } from "../src/ids.mjs";

test("expansion is deterministic across runs", () => {
  const a = expandAll().map((e) => `${e.id}:${e.seed}`);
  const b = expandAll().map((e) => `${e.id}:${e.seed}`);
  assert.deepEqual(a, b);
});

test("every id is unique across the whole library", () => {
  const ids = expandAll().map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("ids and seeds derive from the axis values, not insertion order", () => {
  const e = expandAll({ categories: ["bigfoot"] } ? undefined : undefined, ["bigfoot"])[0];
  assert.equal(e.seed, seedFor(e.id));
  assert.equal(
    e.id,
    idFor({ category: e.category, family: e.family, pose: e.pose, view: e.view, distance: e.distance, expression: e.expression, variant: e.variant }),
  );
});

test("the library is a meaningful size (~250 combos across 14 categories)", () => {
  const all = expandAll();
  assert.ok(all.length >= 240, `expected ~250 entries, got ${all.length}`);
  assert.equal(new Set(all.map((e) => e.category)).size, 14);
});

test("pose overrides family overrides category defaults for axes", () => {
  const spec = {
    category: "t",
    template: "creature-photoreal",
    defaults: { views: ["front"], distances: ["mid"], variants: 1 },
    families: [
      {
        family: "f",
        subject_phrase: "x",
        views: ["side"],
        poses: [
          { pose: "a", pose_phrase: "aa" }, // inherits family view "side"
          { pose: "b", pose_phrase: "bb", views: ["back"] }, // own view wins
        ],
      },
    ],
  };
  const out = expandSpec(spec);
  assert.equal(out.find((e) => e.pose === "a").view, "side");
  assert.equal(out.find((e) => e.pose === "b").view, "back");
});

test("neutral expression yields no clause; a named one does", () => {
  const spec = {
    category: "t",
    template: "creature-photoreal",
    defaults: { views: ["front"], distances: ["mid"], expressions: ["neutral"], variants: 1 },
    families: [{ family: "f", subject_phrase: "x", poses: [{ pose: "p", pose_phrase: "pp", expressions: ["neutral", "snarling"] }] }],
  };
  const out = expandSpec(spec);
  assert.equal(out.find((e) => e.expression === "neutral").slots.expression_clause, "");
  assert.match(out.find((e) => e.expression === "snarling").slots.expression_clause, /snarling/);
});
