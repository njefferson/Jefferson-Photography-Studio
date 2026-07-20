// Central paths + limits. Everything resolves relative to asset-factory/ so the
// CLI works from any cwd.
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = resolve(ROOT, "..");

// manifests/ + templates/ are the committed inputs and always live in-repo.
// The writable outputs (catalog, images, logs) root under AF_DATA_DIR when set,
// so tests and CI can run against a scratch area without touching database/.
export const DATA = process.env.AF_DATA_DIR ? resolve(process.env.AF_DATA_DIR) : ROOT;

export const DIRS = {
  manifests: resolve(ROOT, "manifests"),
  templates: resolve(ROOT, "templates"),
  catalog: resolve(DATA, "database", "catalog"),
  curation: resolve(DATA, "database", "curation.json"),
  assets: resolve(DATA, "assets"),
  generated: resolve(DATA, "generated"),
  rejected: resolve(DATA, "rejected"),
  duplicates: resolve(DATA, "duplicates"),
  logs: resolve(DATA, "logs", "runs"),
  // Promotion target inside the app (overridable with --out).
  stickers: resolve(REPO_ROOT, "public", "stickers"),
};

// Cost/politeness guardrails for real (non-mock) providers.
export const MAX_PER_RUN = 200; // hard cap unless --max raises it explicitly
export const DEFAULT_CONCURRENCY = 2;
export const MAX_CONCURRENCY = 4;
export const MIN_REQUEST_GAP_MS = 500; // between request STARTS, on top of concurrency

// A record stuck in "generating" longer than this is treated as a crash and redone.
export const STUCK_GENERATING_MS = 10 * 60 * 1000;

// QC defaults — every one overridable per category via the manifest's `qc` block.
export const QC_DEFAULTS = {
  allowEdgeContact: false,
  maxComponents: 1,
  minCoverage: 0.02,
  maxCoverage: 0.95,
  minLongEdge: 768,
  // Fraction of pixels that must be fully transparent for the background to count
  // as transparent at all (an opaque card fails this).
  minTransparentFrac: 0.05,
  // Fraction of any one edge's pixels allowed to carry alpha before the subject
  // counts as cropped.
  maxEdgeContactFrac: 0.005,
  // Fraction of pixels with intermediate alpha below which edges look hard-cut
  // (warning only in v1).
  minFeatherFrac: 0.005,
};

// Dedupe: dHash Hamming distance at or below this = duplicate composition.
export const DEDUPE_HAMMING = 6;

// Matte finishing (src/matte.mjs). Alpha at/below SPECKLE_MAX is snapped to a
// fully-clear background; at/above SOLID_MIN is snapped to a fully-solid subject;
// the band between is the feathered edge that gets colour-decontaminated.
export const MATTE_SPECKLE_MAX = 15;
export const MATTE_SOLID_MIN = 250;
// Framing: a square asset with this fraction of transparent margin on every side
// (contract: ~8–12%), rendered at this canvas size.
export const ASSET_MARGIN_FRAC = 0.1;
export const ASSET_SIZE = 1024;

export const env = {
  ideogramKey: () => process.env.IDEOGRAM_API_KEY ?? "",
  anthropicKey: () => process.env.ANTHROPIC_API_KEY ?? "",
};
