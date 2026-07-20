// Axis-spec manifests -> concrete generation entries. Pure and deterministic:
// the same manifests always yield the same ids, seeds and slots (unit-tested).
// Entries are never persisted — the catalog is the persistence; this expansion
// is recomputed every run and diffed against it.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { DIRS, QC_DEFAULTS } from "./config.mjs";
import { idFor, seedFor, slug, humanize } from "./ids.mjs";

// Shared vocabulary: axis token -> prompt phrase. A token not listed here is
// used verbatim (humanized), so manifests may use free phrases as axis values.
const VIEW_PHRASES = {
  front: "seen directly from the front",
  side: "seen in full side profile",
  "three-quarter": "seen from a three-quarter angle",
  back: "seen from behind",
  above: "seen from slightly above",
  below: "seen from slightly below",
  bottom: "seen from directly underneath",
  tilted: "tilted at a slight angle",
  banking: "banking into a turn",
};
const DISTANCE_PHRASES = {
  full: "the entire subject filling the frame",
  mid: "photographed from a moderate distance",
  far: "small in frame as if photographed from far away",
  close: "photographed close up",
};

function phraseFor(table, token) {
  return table[token] ?? humanize(token);
}

/** Normalize a pose that may be a bare string or an object. */
function normPose(p) {
  return typeof p === "string" ? { pose: p } : p;
}

function axis(poseVal, familyVal, defaultsVal, fallback) {
  return poseVal ?? familyVal ?? defaultsVal ?? fallback;
}

/** Expand one category spec into concrete entries. */
export function expandSpec(spec) {
  const out = [];
  const d = spec.defaults ?? {};
  for (const fam of spec.families) {
    for (const rawPose of fam.poses) {
      const p = normPose(rawPose);
      const views = axis(p.views, fam.views, d.views, ["front"]);
      const distances = axis(p.distances, fam.distances, d.distances, ["mid"]);
      const expressions = axis(p.expressions, fam.expressions, d.expressions, ["neutral"]);
      const variants = axis(p.variants, fam.variants, d.variants, 1);
      for (const view of views)
        for (const distance of distances)
          for (const expression of expressions)
            for (let variant = 1; variant <= variants; variant++) {
              const base = {
                category: slug(spec.category),
                family: slug(fam.family),
                pose: slug(p.pose),
                view: slug(view),
                distance: slug(distance),
                expression: slug(expression),
                variant,
              };
              const id = idFor(base);
              out.push({
                ...base,
                id,
                seed: seedFor(id),
                template: spec.template,
                // App sticker folder (public/stickers/<app_category>/). A
                // factory category can split across app folders, so pose >
                // family > category, defaulting to the "other" (❓ New) bucket.
                app_category: p.app_category ?? fam.app_category ?? spec.app_category ?? "other",
                qc: { ...QC_DEFAULTS, ...(spec.qc ?? {}), ...(fam.qc ?? {}), ...(p.qc ?? {}) },
                tags: [...(spec.tags ?? []), ...(fam.tags ?? []), ...(p.tags ?? [])],
                meta_label: fam.meta_label ?? humanize(fam.family),
                // Honesty note (shown as grayscale-safe text in the app): pose
                // overrides family overrides the whole category.
                note: p.note ?? fam.note ?? spec.note,
                name: buildName(fam, p, view, distance, variant, variants),
                slots: {
                  subject_phrase: fam.subject_phrase,
                  pose_phrase: p.pose_phrase ?? humanize(p.pose),
                  view_phrase: phraseFor(VIEW_PHRASES, view),
                  distance_phrase: phraseFor(DISTANCE_PHRASES, distance),
                  // Neutral is the silent default; anything else becomes a clause.
                  expression_clause:
                    expression === "neutral" ? "" : `, with a ${humanize(expression)} expression`,
                  // Force whole-figure framing unless the pose is deliberately a
                  // bust/head/hand/partial crop — Ideogram otherwise defaults a
                  // "walking"/"standing" subject to a centered portrait.
                  framing_clause: framingClause(p),
                },
              });
            }
    }
  }
  return out;
}

// Poses that are intentionally NOT a whole figure (a bust, a head, a hand, a
// footprint, a peek). Everything else must show the full body head-to-toe.
const PARTIAL_POSE = /(head|bust|eyes?|hand|half|face|foot|print|peek|silhouette|shadow|track|hair|feather|sample)/i;
function framingClause(p) {
  const pose = `${p.pose} ${p.pose_phrase ?? ""}`;
  if (PARTIAL_POSE.test(pose)) return "";
  return "The entire subject is shown in full within the frame, head to toe and top to bottom, complete and uncropped — NOT a bust, headshot, or close portrait.";
}

function buildName(fam, p, view, distance, variant, variants) {
  const label = fam.meta_label ?? humanize(fam.family);
  const bits = [label, humanize(p.pose), `(${humanize(view)}, ${humanize(distance)})`];
  if (variants > 1) bits.push(`v${variant}`);
  return bits.join(" ");
}

/** Load every committed manifest (sorted for determinism) and expand them all. */
export function expandAll(dir = DIRS.manifests, categories = null) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const out = [];
  for (const f of files) {
    const spec = JSON.parse(readFileSync(resolve(dir, f), "utf8"));
    if (categories && !categories.includes(spec.category)) continue;
    out.push(...expandSpec(spec));
  }
  // Guard the invariant the whole catalog keys off.
  const seen = new Set();
  for (const e of out) {
    if (seen.has(e.id)) throw new Error(`duplicate expanded id: ${e.id}`);
    seen.add(e.id);
  }
  return out;
}
