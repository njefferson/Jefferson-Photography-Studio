// Procedural grounding-shadow generator for the sticker library.
//
//   node asset-factory/tools/make-shadows.mjs
//
// Writes soft, dark-on-transparent shadow PNGs to public/stickers/shadows/.
// Shadows are better made procedurally than by an image model: exact softness,
// exact density falloff, perfectly neutral, no stray artifacts. They read as a
// shadow under normal alpha compositing (a dark shape darkens the photo under
// it) and would read even better under a Multiply blend if the app adds one.
// Tune COL / maxA / gamma below and re-run to restyle the whole set.
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../public/stickers/shadows");
const S = 1024;
const COL = [16, 17, 20]; // near-black, a hair cool (daylight skylight fill)
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function build(alphaFn) {
  const buf = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      buf[i] = COL[0]; buf[i + 1] = COL[1]; buf[i + 2] = COL[2];
      buf[i + 3] = Math.round(255 * clamp(alphaFn(x, y), 0, 1));
    }
  return sharp(buf, { raw: { width: S, height: S, channels: 4 } }).png();
}

// Soft ellipse: peaks at maxA in the middle, falls to 0 at the rim.
function ellipse({ cx = S / 2, cy = S / 2, rx, ry, maxA, gamma = 1.7 }) {
  return (x, y) => maxA * Math.pow(clamp(1 - Math.hypot((x - cx) / rx, (y - cy) / ry), 0, 1), gamma);
}

// Directional cast shadow: densest at the root (left), fading to the tip
// (right). Rotate/scale it in-app for any sun angle.
function cast({ len, wid, maxA, tipA = 0.12, gamma = 1.9 }) {
  const cx = S / 2, cy = S / 2, rootX = cx - len;
  return (x, y) => {
    const across = clamp(1 - Math.abs((y - cy) / wid), 0, 1);
    const u = clamp((x - rootX) / (2 * len), 0, 1);
    if (u >= 1) return 0;
    const along = (1 - u) * (1 - u) * (1 - tipA) + tipA * (1 - u);
    return maxA * Math.pow(across, gamma) * along;
  };
}

const jobs = [
  ["contact-oval",     ellipse({ rx: 360, ry: 150, maxA: 0.58, gamma: 1.7 })], // foreshortened, general use
  ["contact-round",    ellipse({ rx: 250, ry: 225, maxA: 0.52, gamma: 1.7 })], // near top-down
  ["contact-tight",    ellipse({ rx: 210, ry: 100, maxA: 0.72, gamma: 2.3 })], // small object sitting flat
  ["contact-soft",     ellipse({ rx: 430, ry: 200, maxA: 0.34, gamma: 1.4 })], // big faint ambient puddle
  ["cast-directional", cast({ len: 330, wid: 150, maxA: 0.60 })],              // rotate for sun angle
  ["cast-long",        cast({ len: 460, wid: 130, maxA: 0.50, tipA: 0.08 })],  // low sun, long throw
];

mkdirSync(OUT, { recursive: true });
for (const [name, fn] of jobs) {
  const raw = await build(fn).toBuffer();
  const trimmed = await sharp(raw).trim({ threshold: 1 }).toBuffer(); // crop the empty canvas to the shadow
  const m = await sharp(trimmed).metadata();
  const pad = Math.round(Math.max(m.width, m.height) * 0.06);
  await sharp(trimmed)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(resolve(OUT, `${name}.png`));
  console.log(`wrote shadows/${name}.png  ${m.width + 2 * pad}x${m.height + 2 * pad}`);
}
