import { test } from "node:test";
import assert from "node:assert/strict";
import { mockProvider } from "../src/providers/mock.mjs";
import { dhash, hamming, findDuplicate } from "../src/dedupe.mjs";

test("dhash is stable for identical bytes", async () => {
  const png = (await mockProvider.generate({ seed: 7 })).png;
  assert.equal(await dhash(png), await dhash(png));
});

test("planted duplicates collide within the threshold; distinct blobs do not", async () => {
  // seeds 11 and 22 both hit the %11 planted-duplicate path -> same canonical
  // composition; seed 7 is an unrelated clean blob.
  const dupA = await dhash((await mockProvider.generate({ seed: 11 })).png);
  const dupB = await dhash((await mockProvider.generate({ seed: 22 })).png);
  const other = await dhash((await mockProvider.generate({ seed: 7 })).png);
  assert.ok(hamming(dupA, dupB) <= 6, `planted dupes should be near: ${hamming(dupA, dupB)}`);
  assert.ok(hamming(dupA, other) > 6, `distinct blobs should differ: ${hamming(dupA, other)}`);
});

test("findDuplicate returns the colliding id or null", async () => {
  const dupA = await dhash((await mockProvider.generate({ seed: 11 })).png);
  const dupB = await dhash((await mockProvider.generate({ seed: 22 })).png);
  const index = new Map([["first", dupA]]);
  assert.equal(findDuplicate(dupB, index, 6), "first");
  assert.equal(findDuplicate(await dhash((await mockProvider.generate({ seed: 7 })).png), index, 6), null);
});
