#!/usr/bin/env node
// A KEEP FILE GIVES BACK EXACTLY THE PHOTOGRAPH IT WAS GIVEN.
//
//   node tools/keepfile-check.mjs
//
// WHY IT EXISTS (decision 043). The whole promise of a keep file is that the
// original is carried rather than referenced, byte for byte, so the reader owns
// their photograph rather than renting it from a database the browser may
// reclaim. That promise is one CRC away from being false in a way nothing would
// show: a picture that decodes from slightly wrong bytes is still a picture.
//
// So this asserts the round trip through the repository's OWN zip reader rather
// than through a second implementation written to agree with the writer — and
// it asserts the properties the format is chosen for, not just that it survives
// a lap: every entry STORED, the archive deterministic for a given timestamp,
// and every kind of damage REFUSED rather than half-opened.
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(join(tmpdir(), "keepfile-"));
const out = join(dir, "keepfile.mjs");
const outZip = join(dir, "zip.mjs");
await build({ entryPoints: [join(repo, "src/keepfile.ts")], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
// THE READER IS BUNDLED SEPARATELY AND ON PURPOSE. Reading the archive back
// through `src/zip.ts` — the same reader the app opens a picked zip with —
// is what makes this a round trip rather than a writer agreeing with itself.
await build({ entryPoints: [join(repo, "src/zip.ts")], bundle: true, format: "esm", outfile: outZip, logLevel: "silent" });
const K = await import(pathToFileURL(out).href);
const Z = await import(pathToFileURL(outZip).href);

let failed = 0;
const check = (name, got, want) => {
  const ok = Object.is(got, want);
  if (!ok) failed++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
};

console.log("\n=== keep file · the photograph comes back byte for byte ===\n");

// A stand-in for a raw: incompressible bytes, so STORE is doing real work.
const original = new Uint8Array(64 * 1024);
for (let i = 0; i < original.length; i++) original[i] = (i * 2654435761) >>> 24;
const NAME = "NIR_1737.NEF";
const EDIT = JSON.stringify({ exposure: 0.42, masks: [{ type: 4, op: 2 }] });
const WHEN = new Date("2026-09-22T12:00:00Z");

// THE PARTS: everything in an edit that is bytes rather than numbers — a
// painted mask's bitmap, the warp's two displacement fields, a LUT lattice.
// Filled with a pattern rather than zeroes, because a writer that lost a part
// and a reader that zero-filled one would both pass against zeroes.
const part = (n, seed) => {
  const u = new Uint8Array(n);
  for (let i = 0; i < n; i++) u[i] = (i * 2246822519 + seed * 374761393) >>> 24;
  return u;
};
const PARTS = new Map([
  ["mask-0.bin", part(384 * 256, 1)],
  ["warp-du.bin", part(33 * 33 * 4, 2)],
  ["lut.bin", part(17 * 17 * 17 * 3 * 4, 3)],
]);
const NO_PARTS = new Map();

// A SNAPSHOT TAKEN BEFORE THE WRITE, and it is load-bearing. Comparing against
// `original` itself lets a writer that corrupts its input IN PLACE pass: both
// sides of the comparison change together. A planted one-byte flip proved
// exactly that and went green here before this line existed. It also asserts
// the property the app needs anyway — the bytes handed in are the reader's
// picked file, shared with the decode path, and this module must not touch them.
const pristine = Uint8Array.from(original);
const blob = K.writeKeepFile(original, NAME, EDIT, PARTS, "Lakeshore", "2.58.1", WHEN);
const buf = await blob.arrayBuffer();
const got = await K.readKeepFile(buf);

check("the photograph comes back the same length", got.original.length, pristine.length);
let same = got.original.length === pristine.length;
for (let i = 0; same && i < pristine.length; i++) if (got.original[i] !== pristine[i]) same = false;
check("...and byte for byte identical to what went in", same, true);

// The input itself is untouched: 043's whole requirement, one level down.
let untouched = original.length === pristine.length;
for (let i = 0; untouched && i < pristine.length; i++) if (original[i] !== pristine[i]) untouched = false;
check("...and the bytes handed in were never written to", untouched, true);
check("the edit comes back unchanged", got.editJson, EDIT);
check("the manifest carries the original's name", got.manifest.original, NAME);
check("the manifest records the reader's name", got.manifest.name, "Lakeshore");
check("the manifest records the size actually written", got.manifest.size, original.length);

// STORED, never deflated — the property that lets anything open it.
const idx = await Z.readZipIndex(blob);
check("every entry is STORED (method 0)", idx.every((e) => e.method === 0), true);
check("...and the photograph is one contiguous run of its own length",
  idx.find((e) => e.name.endsWith(NAME))?.compSize, original.length);

// Deterministic: this module never reads the clock.
const again = await K.writeKeepFile(original, NAME, EDIT, PARTS, "Lakeshore", "2.58.1", WHEN).arrayBuffer();
const a = new Uint8Array(buf), b = new Uint8Array(again);
let identical = a.length === b.length;
for (let i = 0; identical && i < a.length; i++) if (a[i] !== b[i]) identical = false;
check("the same inputs write the same bytes (no hidden clock)", identical, true);

// --- REFUSALS. Each one is a picture that would otherwise open slightly wrong.
const refuses = async (what, mutate) => {
  const bytes = new Uint8Array(buf.slice(0));
  mutate(bytes);
  let threw = "";
  try { await K.readKeepFile(bytes.buffer); } catch (e) { threw = String(e.message || e); }
  check(`refuses ${what}`, threw !== "", true);
  if (threw) console.log(`          said: ${threw.slice(0, 74)}`);
};

// Flip a byte deep inside the stored photograph. The zip's own CRC would catch
// this too; the manifest's copy is what survives a repack that recomputes them.
await refuses("a photograph whose bytes were altered", (bytes) => {
  const at = bytes.length - Math.floor(original.length / 2);
  bytes[at] ^= 0xff;
});

const missing = (path) => async () => {
  const b2 = K.writeKeepFile(original, NAME, EDIT, NO_PARTS, "x", "2.58.1", WHEN);
  const buf2 = await b2.arrayBuffer();
  const u = new Uint8Array(buf2);
  // Corrupt the entry NAME in both headers so the reader cannot find that part.
  const enc = new TextEncoder().encode(path);
  for (let i = 0; i + enc.length <= u.length; i++) {
    let hit = true;
    for (let k = 0; k < enc.length; k++) if (u[i + k] !== enc[k]) { hit = false; break; }
    if (hit) u[i] = 0x7a; // rename it out of the way
  }
  let threw = "";
  try { await K.readKeepFile(u.buffer); } catch (e) { threw = String(e.message || e); }
  check(`refuses an archive with no ${path}`, threw !== "", true);
  if (threw) console.log(`          said: ${threw.slice(0, 74)}`);
};
await missing(K.KEEP_PATHS.manifest)();
await missing(K.KEEP_PATHS.edit)();

// A format from the future is refused rather than guessed at.
{
  const future = K.writeKeepFile(original, NAME, EDIT, NO_PARTS, "x", "2.58.1", WHEN);
  const u = new Uint8Array(await future.arrayBuffer());
  const enc = new TextEncoder().encode(`"format": ${K.KEEP_FORMAT}`);
  const rep = new TextEncoder().encode(`"format": ${K.KEEP_FORMAT + 8}`);
  for (let i = 0; i + enc.length <= u.length; i++) {
    let hit = true;
    for (let k = 0; k < enc.length; k++) if (u[i + k] !== enc[k]) { hit = false; break; }
    if (hit) { u.set(rep, i); break; }
  }
  let threw = "";
  try { await K.readKeepFile(u.buffer); } catch (e) { threw = String(e.message || e); }
  check("refuses a file written by a newer version", threw !== "", true);
  if (threw) console.log(`          said: ${threw.slice(0, 74)}`);
}

check("isKeepName accepts the extension, any case", K.isKeepName("a" + K.KEEP_EXT.toUpperCase()), true);
check("...and rejects a photograph", K.isKeepName("NIR_1737.NEF"), false);

// --- THE NAME MUST END IN A TYPE THE PLATFORM KNOWS. The first version used
// `.ipskeep`, and an iPad's Files picker greyed the saved file out: 27.9 MB,
// named correctly, unselectable, because iOS filters that picker by UTI and an
// extension registered to nothing matches no allowed type. A keep file IS a
// zip, so ending in `.zip` is honest as well as selectable.
check("the extension ends in a type the platform registers", K.KEEP_EXT.endsWith(".zip"), true);

// --- AND ROUTING ASKS THE BYTES, NOT THE NAME. Two reasons, both paid for: the
// name had to change once already, and a reader may rename a file they own.
const head = new Uint8Array(buf.slice(0, K.KEEP_SNIFF_BYTES));
// Renaming cannot affect this and there is nothing to assert about it:
// `sniffKeep` takes BYTES and never sees a name. A check comparing the same
// call to itself would pass forever and say nothing, which is worse than no
// check because it reads like coverage.
check("a keep file is recognised from its first bytes alone", K.sniffKeep(head), true);

// A PLAIN ZIP OF RAWS MUST NOT BE MISTAKEN FOR ONE. This is the check that
// earns the sniff: a keep file is a valid zip, so the discriminator has to be
// the first entry's NAME rather than the archive's signature.
const decoy = Z.writeZip(
  [{ name: "NIR_0001.NEF", size: original.length, crc: Z.crc32(original), data: original }],
  WHEN,
);
const decoyHead = new Uint8Array((await decoy.arrayBuffer()).slice(0, K.KEEP_SNIFF_BYTES));
check("an ordinary zip of raws is NOT a keep file", K.sniffKeep(decoyHead), false);
check("...and neither is a raw itself", K.sniffKeep(original.slice(0, K.KEEP_SNIFF_BYTES)), false);
check("...nor anything too short to be a zip", K.sniffKeep(new Uint8Array(8)), false);

// --- THE EDIT'S BYTES COME BACK TOO. This is what makes a kept photograph one
// you can actually resume: a painted selection is nothing but its bitmap, a
// warp is nothing but its displacement field, and an edit that arrives without
// them is not the edit that was saved. They were left out of the first version
// of this format by inheriting the mask LIBRARY's rule — which is about
// applying a mask to OTHER photographs, a question a keep file never asks.
check("every part written comes back", got.parts.size, PARTS.size);
for (const [key, want] of PARTS) {
  const have = got.parts.get(key);
  let ok = !!have && have.length === want.length;
  for (let i = 0; ok && i < want.length; i++) if (have[i] !== want[i]) ok = false;
  check(`...${key} byte for byte`, ok, true);
}
check("the parts are STORED as well (method 0)",
  idx.filter((e) => e.name.startsWith(K.KEEP_PATHS.partDir)).every((e) => e.method === 0), true);
check("...and there are as many part entries as parts",
  idx.filter((e) => e.name.startsWith(K.KEEP_PATHS.partDir)).length, PARTS.size);

// An edit with no bytes in it yields no parts — not an absent map the caller
// has to test for.
{
  const bare = await K.readKeepFile(await K.writeKeepFile(original, NAME, EDIT, NO_PARTS, "x", "2.58.1", WHEN).arrayBuffer());
  check("an edit with no bytes yields an empty map, never undefined", bare.parts.size, 0);
}

rmSync(dir, { recursive: true, force: true });
console.log(failed ? `\n  ${failed} check(s) failed\n` : "\n  a keep file gives back exactly the photograph it was given\n");
process.exit(failed ? 1 : 0);
