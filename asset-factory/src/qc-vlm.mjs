// Tier-b quality control — VLM review. INTERFACE STUB in v1 (phase 3 work).
//
// The plan: batch approved-by-tier-a images to a vision model (Anthropic API)
// with this rubric, expecting a strict JSON verdict per image:
//   - exactly one subject, nothing else in frame?
//   - photorealistic (not cartoon/illustration/3d-render)?
//   - any text, watermark, border, or sticker-sheet framing?
//   - subject fully inside the frame, natural lighting, believable shadows?
//   -> { verdict: "pass" | "reject", reasons: string[], confidence: 0..1 }
// Verdicts land in the catalog record's qc.tier_b slot; a reject flips the
// record to rejected exactly like tier a.
//
// v1 behavior: returns null (recorded as "tier_b not run") — with or without a
// key — so the pipeline shape is stable before the stage exists.
import { env } from "./config.mjs";

export function vlmAvailable() {
  return Boolean(env.anthropicKey());
}

export async function vlmReview(_png, _entry) {
  return null; // phase 3: implement against the rubric above
}
