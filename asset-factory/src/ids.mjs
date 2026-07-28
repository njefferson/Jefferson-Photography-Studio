// Deterministic identity: the same manifest always expands to the same ids and
// the same ids always derive the same seeds, so a library is reproducible from
// metadata alone.
import { createHash } from "node:crypto";

export function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Canonical asset id: category--family--pose--view--distance--expression--vN */
export function idFor(e) {
  return [e.category, e.family, e.pose, e.view, e.distance, e.expression]
    .map(slug)
    .join("--") + `--v${e.variant}`;
}

/** Deterministic seed derived from the id (first 4 bytes of sha256), masked to
 *  31 bits. Providers (e.g. Ideogram) cap seed at the signed-int32 max
 *  2147483647; a full uint32 rejects ~half of all ids with a 400. */
export function seedFor(id) {
  return createHash("sha256").update(id).digest().readUInt32BE(0) & 0x7fffffff;
}

/** A fresh-but-deterministic seed for the nth retry of a rejected asset. */
export function retrySeed(id, n) {
  return seedFor(`${id}:retry${n}`);
}

export function sha256Hex(s) {
  return createHash("sha256").update(s).digest("hex");
}

/** Humanize a slug for default phrases/labels: "looking-back" -> "looking back". */
export function humanize(s) {
  return String(s).replace(/[-_]+/g, " ").trim();
}
