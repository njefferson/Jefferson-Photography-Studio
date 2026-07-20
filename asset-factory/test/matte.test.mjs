import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { cleanMatte, normalizeMargin } from "../src/matte.mjs";

// Build a raw RGBA PNG from a per-pixel painter fn(x,y) -> [r,g,b,a].
async function makePng(w, h, paint) {
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = paint(x, y);
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
    }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

async function raw(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, at: (x, y) => data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4) };
}

function bbox(data, w, h) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 15) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

test("cleanMatte kills low-alpha speckle to a truly clear background", async () => {
  // Solid red subject block, faint green speckle everywhere else.
  const png = await makePng(64, 64, (x, y) => {
    const inBlock = x >= 20 && x < 44 && y >= 20 && y < 44;
    return inBlock ? [255, 0, 0, 255] : [0, 200, 0, 8];
  });
  const { at } = await raw(await cleanMatte(png));
  assert.equal(at(2, 2)[3], 0, "corner speckle should become fully transparent");
});

test("cleanMatte decontaminates a coloured edge toward the subject colour", async () => {
  // Red block with a one-pixel green mid-alpha fringe directly above it.
  const png = await makePng(64, 64, (x, y) => {
    if (x >= 20 && x < 44 && y >= 20 && y < 44) return [255, 0, 0, 255]; // subject
    if (x >= 20 && x < 44 && y === 19) return [0, 220, 0, 120]; // contaminated fringe
    return [0, 220, 0, 6]; // backdrop speckle
  });
  const before = await raw(png);
  assert.ok(before.at(32, 19)[1] > before.at(32, 19)[0], "fringe starts green-dominant");
  const after = await raw(await cleanMatte(png));
  const p = after.at(32, 19);
  assert.ok(p[3] > 0, "fringe keeps its coverage");
  assert.ok(p[0] > p[1], `fringe should bleed to red (subject), got [${p[0]},${p[1]},${p[2]}]`);
});

test("normalizeMargin centers the subject with the target margin", async () => {
  // 8x8 opaque block jammed in the top-left corner of a 40x40 canvas.
  const png = await makePng(40, 40, (x, y) => (x >= 2 && x < 10 && y >= 2 && y < 10 ? [255, 255, 255, 255] : [0, 0, 0, 0]));
  const out = await normalizeMargin(png, 0.1, 100);
  const { data, w, h } = await raw(out);
  assert.equal(w, 100); assert.equal(h, 100);
  const bb = bbox(data, w, h);
  // Square subject -> ~80px content, ~10px margin each side, centered.
  assert.ok(bb.minX >= 8 && bb.minX <= 12, `left margin ~10, got ${bb.minX}`);
  assert.ok(100 - 1 - bb.maxX >= 8 && 100 - 1 - bb.maxX <= 12, `right margin ~10, got ${100 - 1 - bb.maxX}`);
  assert.ok(Math.abs(bb.minX - (99 - bb.maxX)) <= 2, "horizontally centered");
  assert.ok(Math.abs(bb.minY - (99 - bb.maxY)) <= 2, "vertically centered");
});
