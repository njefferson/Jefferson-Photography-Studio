// Promotion: the ONLY step that touches app files, and only when invoked.
// Approved (and optionally favorited) assets are optimized and copied into
// public/stickers/<app_category>/<short-name>.png, where the app's build-time
// manifest + dynamic picker take over (zero app code). Also prints a
// ready-to-paste STICKER_META snippet — applying it to src/main.ts is a
// separate deliberate edit; the app degrades gracefully without it.
// Shipping promoted PNGs is a product change -> the normal release flow.
import sharp from "sharp";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DIRS, DATA } from "./config.mjs";
import { allRecords, readCuration, isApproved, writeRecord } from "./catalog.mjs";
import { expandAll } from "./expander.mjs";
import { slug } from "./ids.mjs";

/**
 * Options: { categories, favoritesOnly, ids, maxEdge = 512, out = DIRS.stickers, dryRun }
 * Returns { promoted: [{id, name, path, appCategory}], metaSnippet }
 */
export async function promote(opts = {}) {
  const { categories = null, favoritesOnly = false, ids = null, maxEdge = 512, out = DIRS.stickers, dryRun = false } = opts;
  const cur = readCuration();
  const entriesById = new Map(expandAll(DIRS.manifests, categories).map((e) => [e.id, e]));

  let recs = allRecords().filter((r) => ["approved", "promoted"].includes(r.status) && isApproved(r, cur));
  if (categories) recs = recs.filter((r) => categories.includes(r.category));
  if (favoritesOnly) recs = recs.filter((r) => cur.favorites.includes(r.id) || r.favorite);
  if (ids) recs = recs.filter((r) => ids.includes(r.id));

  const promoted = [];
  const usedNames = new Set();
  const metaLines = [];
  for (const rec of recs) {
    const entry = entriesById.get(rec.id);
    const appCategory = entry?.app_category ?? "other";
    const src = resolve(DATA, rec.file ?? "");
    if (!existsSync(src)) {
      console.warn(`skip ${rec.id}: file missing (${rec.file}) — regenerate first`);
      continue;
    }
    const name = pickName(rec, entry, cur, usedNames);
    const destDir = resolve(out, appCategory);
    const dest = resolve(destDir, `${name}.png`);
    if (!dryRun) {
      mkdirSync(destDir, { recursive: true });
      await sharp(readFileSync(src))
        .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toFile(dest);
      rec.status = "promoted";
      rec.promoted = { app_category: appCategory, name, path: `public/stickers/${appCategory}/${name}.png`, date: new Date().toISOString() };
      writeRecord(rec);
    }
    promoted.push({ id: rec.id, name, path: dest, appCategory });
    const label = entry?.meta_label ?? rec.name;
    const note = entry?.note ? `, note: ${JSON.stringify(entry.note)}` : "";
    metaLines.push(`  "${appCategory}/${name}": { label: ${JSON.stringify(label)}${note} },`);
  }
  const metaSnippet = metaLines.length
    ? `// Paste into STICKER_META (src/main.ts) for polished labels (optional):\n${metaLines.join("\n")}`
    : "";
  return { promoted, metaSnippet };
}

/** Short human slug: meta-label + pose, numbered on collision (bigfoot-walk-2). */
function pickName(rec, entry, cur, used) {
  if (cur.names[rec.id]) return cur.names[rec.id];
  if (rec.promoted?.name) return rec.promoted.name;
  const base = slug(`${entry?.meta_label ?? rec.subcategory}-${entry?.pose ?? ""}`);
  let name = base;
  for (let n = 2; used.has(name); n++) name = `${base}-${n}`;
  used.add(name);
  return name;
}
