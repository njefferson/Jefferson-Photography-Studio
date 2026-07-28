// Tier-a quality control: cheap local heuristics over the decoded RGBA pixels.
// Every threshold is per-category-overridable via the manifest's `qc` block
// (occluders/atmosphere/camera legitimately touch frame edges; footprint
// trails legitimately have several components).
//
// Reject reasons: opaque-background, coverage-out-of-range, cropped-subject,
// multiple-subjects, low-resolution. Warning (not reject): hard-cut-edges.
// Text/watermark detection is a tier-b (VLM) job — see qc-vlm.mjs.
import sharp from "sharp";
import { QC_DEFAULTS } from "./config.mjs";

const MASK = 64; // downsample size for connected-component analysis

export async function qcCheck(png, qcOpts = {}) {
  const opts = { ...QC_DEFAULTS, ...qcOpts };
  const img = sharp(png).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const n = width * height;

  let transparent = 0; // a < 10
  let opaque = 0; // a > 128
  let feather = 0; // 16 < a < 240
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    if (a < 10) transparent++;
    if (a > 128) opaque++;
    if (a > 16 && a < 240) feather++;
  }

  // Edge contact: fraction of each border row/column carrying visible alpha.
  const edgeFrac = { top: 0, bottom: 0, left: 0, right: 0 };
  const alphaAt = (x, y) => data[(y * width + x) * 4 + 3];
  for (let x = 0; x < width; x++) {
    if (alphaAt(x, 0) > 16) edgeFrac.top++;
    if (alphaAt(x, height - 1) > 16) edgeFrac.bottom++;
  }
  for (let y = 0; y < height; y++) {
    if (alphaAt(0, y) > 16) edgeFrac.left++;
    if (alphaAt(width - 1, y) > 16) edgeFrac.right++;
  }
  edgeFrac.top /= width;
  edgeFrac.bottom /= width;
  edgeFrac.left /= height;
  edgeFrac.right /= height;
  const maxEdge = Math.max(edgeFrac.top, edgeFrac.bottom, edgeFrac.left, edgeFrac.right);

  // Connected components on a nearest-sampled MASK x MASK opacity grid.
  const mask = new Uint8Array(MASK * MASK);
  for (let my = 0; my < MASK; my++)
    for (let mx = 0; mx < MASK; mx++) {
      const x = Math.min(width - 1, Math.floor(((mx + 0.5) * width) / MASK));
      const y = Math.min(height - 1, Math.floor(((my + 0.5) * height) / MASK));
      mask[my * MASK + mx] = alphaAt(x, y) > 128 ? 1 : 0;
    }
  const components = countComponents(mask);

  const coverage = opaque / n;
  const measurements = {
    width,
    height,
    coverage: round4(coverage),
    transparentFrac: round4(transparent / n),
    featherFrac: round4(feather / n),
    edgeContact: round4(maxEdge),
    components,
  };

  const reasons = [];
  const warnings = [];
  if (transparent / n < opts.minTransparentFrac) reasons.push("opaque-background");
  if (coverage < opts.minCoverage || coverage > opts.maxCoverage) reasons.push("coverage-out-of-range");
  if (!opts.allowEdgeContact && maxEdge > opts.maxEdgeContactFrac) reasons.push("cropped-subject");
  if (components > opts.maxComponents) reasons.push("multiple-subjects");
  if (Math.max(width, height) < opts.minLongEdge) reasons.push("low-resolution");
  if (feather / n < opts.minFeatherFrac) warnings.push("hard-cut-edges");

  return { pass: reasons.length === 0, reasons, warnings, measurements };
}

/** 4-connected flood fill; components smaller than max(8, 2% of opaque cells) are noise, not subjects. */
function countComponents(mask) {
  const seen = new Uint8Array(mask.length);
  const opaqueCells = mask.reduce((s, v) => s + v, 0);
  const minArea = Math.max(8, Math.floor(opaqueCells * 0.02));
  let count = 0;
  const stack = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let area = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      area++;
      const x = i % MASK;
      const y = (i / MASK) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MASK || ny >= MASK) continue;
        const j = ny * MASK + nx;
        if (mask[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    if (area >= minArea) count++;
  }
  return count;
}

function round4(v) {
  return Math.round(v * 10000) / 10000;
}
