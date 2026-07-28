// Prompt assembly: templates + global constraint blocks + an entry's slots.
// Prompts are NEVER hand-written — editing a template (or a manifest phrase, or
// provider settings) changes prompt_hash, which is the single staleness signal
// that lets the whole library regenerate.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { DIRS } from "./config.mjs";
import { sha256Hex } from "./ids.mjs";

let cache = null;

export function loadTemplates(dir = DIRS.templates) {
  if (cache && cache.dir === dir) return cache;
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const templates = {};
  let global = { blocks: {}, negative: "" };
  for (const f of files) {
    const t = JSON.parse(readFileSync(resolve(dir, f), "utf8"));
    if (f === "global.json") global = t;
    else templates[t.id] = t;
  }
  cache = { dir, templates, global };
  return cache;
}

export function clearTemplateCache() {
  cache = null;
}

/** Fill {slot} and {global.block} references in one template line. */
function fill(line, slots, global) {
  return line.replace(/\{([a-z0-9_.]+)\}/gi, (_, key) => {
    if (key.startsWith("global.")) {
      const block = global.blocks[key.slice("global.".length)];
      if (block === undefined) throw new Error(`unknown global block: {${key}}`);
      return block;
    }
    if (key === "global_negative") return global.negative;
    const v = slots[key];
    if (v === undefined) throw new Error(`unfilled slot: {${key}}`);
    return v;
  });
}

/**
 * Assemble the final prompt for an expanded entry.
 * Returns { positive, negative, settings, template_version }.
 */
export function buildPrompt(entry, dir = DIRS.templates) {
  const { templates, global } = loadTemplates(dir);
  const t = templates[entry.template];
  if (!t) throw new Error(`unknown template "${entry.template}" for ${entry.id}`);
  const positive = t.positive
    .map((line) => fill(line, entry.slots, global))
    .map((line) => line.replace(/\s+/g, " ").replace(/\s+,/g, ",").trim())
    .filter(Boolean)
    .join("\n");
  const negative = t.negative
    .map((line) => fill(line, entry.slots, global))
    .filter(Boolean)
    .join(", ");
  return {
    positive,
    negative,
    settings: t.settings ?? {},
    template_version: t.version ?? 1,
  };
}

/**
 * The staleness key: everything that changes the produced image. A catalog
 * record whose stored hash differs from this is stale and regenerable.
 */
export function promptHash(built, provider) {
  return (
    "sha256:" +
    sha256Hex(
      JSON.stringify([built.positive, built.negative, built.settings, provider.name, provider.model]),
    )
  );
}
