// Publish a run's approved assets for review: copy them into a non-ignored
// review/ folder and build one contact-sheet PNG so the whole batch can be
// judged at a glance. The workflow commits review/ to a throwaway branch; a
// session then reads it back over the GitHub API (which isn't proxy-blocked,
// unlike the artifact blob host) and hands the images to the owner's device.
import sharp from "sharp";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, DATA, DIRS } from "./config.mjs";
import { allRecords, readCuration, isApproved } from "./catalog.mjs";

export const REVIEW_DIR = resolve(ROOT, "review");

const TILE = 320; // contact-sheet cell (px)
const PAD = 12;
const LABEL_H = 28;
const COLS = 4;
const CHECKER = 16; // checkerboard square size, so transparency reads

/** A light checkerboard background tile, so transparent PNGs are visible. */
function checkerboard(w, h) {
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const on = (Math.floor(x / CHECKER) + Math.floor(y / CHECKER)) % 2 === 0;
      const v = on ? 235 : 205;
      const i = (y * w + x) * 3;
      buf[i] = buf[i + 1] = buf[i + 2] = v;
    }
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png();
}

function svgLabel(text, w) {
  const safe = String(text).replace(/[<&>]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${LABEL_H}">` +
      `<rect width="100%" height="100%" fill="#1a1a1e"/>` +
      `<text x="${w / 2}" y="${LABEL_H / 2 + 5}" font-family="sans-serif" font-size="14" ` +
      `fill="#f2f3f6" text-anchor="middle">${safe}</text></svg>`,
  );
}

/**
 * Select approved assets (optionally by category), copy their PNGs into review/,
 * and render review/contact-sheet.png. Returns { items:[{id,name,file}], sheet }.
 */
export async function publishReview({ categories = null } = {}) {
  const cur = readCuration();
  let recs = allRecords()
    .filter((r) => ["approved", "promoted"].includes(r.status) && isApproved(r, cur))
    .filter((r) => !categories || categories.includes(r.category))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  if (existsSync(REVIEW_DIR)) rmSync(REVIEW_DIR, { recursive: true });
  mkdirSync(REVIEW_DIR, { recursive: true });

  const items = [];
  const tiles = [];
  for (const r of recs) {
    const src = resolve(DATA, r.file ?? "");
    if (!existsSync(src)) continue;
    const outName = `${r.id}.png`;
    writeFileSync(resolve(REVIEW_DIR, outName), readFileSync(src));
    items.push({ id: r.id, name: r.name, file: `review/${outName}` });

    // One contact-sheet cell: asset centered on a checkerboard, label strip under.
    const cellH = TILE + LABEL_H;
    const bg = await checkerboard(TILE, TILE).toBuffer();
    const fitted = await sharp(src)
      .resize(TILE - 2 * PAD, TILE - 2 * PAD, { fit: "inside", withoutEnlargement: true })
      .toBuffer();
    const art = await sharp(bg).composite([{ input: fitted, gravity: "center" }]).toBuffer();
    const cell = await sharp({ create: { width: TILE, height: cellH, channels: 3, background: "#1a1a1e" } })
      .composite([
        { input: art, top: 0, left: 0 },
        { input: svgLabel(r.name, TILE), top: TILE, left: 0 },
      ])
      .png()
      .toBuffer();
    tiles.push(cell);
  }

  let sheet = null;
  if (tiles.length) {
    const cols = Math.min(COLS, tiles.length);
    const rows = Math.ceil(tiles.length / cols);
    const cellW = TILE;
    const cellH = TILE + LABEL_H;
    const sheetW = cols * cellW;
    const sheetH = rows * cellH;
    const composites = tiles.map((buf, i) => ({
      input: buf,
      left: (i % cols) * cellW,
      top: Math.floor(i / cols) * cellH,
    }));
    sheet = resolve(REVIEW_DIR, "contact-sheet.png");
    await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: "#1a1a1e" } })
      .composite(composites)
      .png()
      .toFile(sheet);
  }

  // A tiny manifest so the session knows what to fetch + send.
  writeFileSync(
    resolve(REVIEW_DIR, "index.json"),
    JSON.stringify({ count: items.length, sheet: sheet ? "review/contact-sheet.png" : null, items }, null, 2) + "\n",
  );
  return { items, sheet, dir: REVIEW_DIR };
}
