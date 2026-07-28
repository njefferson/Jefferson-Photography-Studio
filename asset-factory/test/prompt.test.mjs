import { test } from "node:test";
import assert from "node:assert/strict";
import { expandAll } from "../src/expander.mjs";
import { buildPrompt, promptHash } from "../src/prompt.mjs";
import { mockProvider } from "../src/providers/mock.mjs";

function entry(category) {
  return expandAll(undefined, [category])[0];
}

test("every expanded entry assembles without unfilled slots", () => {
  for (const e of expandAll()) {
    const built = buildPrompt(e);
    assert.doesNotMatch(built.positive, /\{[a-z0-9_.]+\}/i, `unfilled slot in ${e.id}`);
    assert.doesNotMatch(built.negative, /\{[a-z0-9_.]+\}/i, `unfilled negative in ${e.id}`);
    assert.ok(built.positive.length > 40);
  }
});

test("the constraint suite lands in the assembled prompt", () => {
  const built = buildPrompt(entry("bigfoot"));
  assert.match(built.positive, /transparent background/i);
  assert.match(built.positive, /[Ee]xactly one/);
  assert.match(built.positive, /[Nn]o text/);
  assert.match(built.negative, /white background/);
  assert.match(built.negative, /sticker sheet/);
});

test("the subject and pose phrases from the manifest are present", () => {
  const e = entry("bigfoot");
  const built = buildPrompt(e);
  assert.ok(built.positive.includes(e.slots.subject_phrase));
  assert.ok(built.positive.includes(e.slots.pose_phrase));
});

test("prompt_hash is stable for the same inputs and changes with the prompt", () => {
  const e = entry("ufo");
  const built = buildPrompt(e);
  const h1 = promptHash(built, mockProvider);
  const h2 = promptHash(built, mockProvider);
  assert.equal(h1, h2);
  const mutated = { ...built, positive: built.positive + " extra" };
  assert.notEqual(promptHash(mutated, mockProvider), h1);
});

test("prompt_hash changes when the provider/model changes", () => {
  const built = buildPrompt(entry("ufo"));
  const h = promptHash(built, mockProvider);
  const other = { ...mockProvider, name: "ideogram", model: "ideogram-v3" };
  assert.notEqual(promptHash(built, other), h);
});
