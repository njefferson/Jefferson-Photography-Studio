// Deterministic local provider: renders a feathered organic blob from the seed
// (SVG -> sharp -> RGBA PNG), no network, no key, zero cost. It exists so the
// ENTIRE pipeline — QC, dedupe, catalog, resume — is verifiable end-to-end in
// any session.
//
// It deliberately PLANTS failure modes keyed off the seed so the QC and dedupe
// stages get exercised for real (checked in this order; first match wins):
//   seed % 23 === 0 -> opaque white background   (QC: opaque-background)
//   seed % 19 === 0 -> two separated blobs       (QC: multiple-subjects)
//   seed % 17 === 0 -> blob crosses the frame    (QC: cropped-subject)
//   seed % 13 === 0 -> 300x300 output            (QC: low-resolution)
//   seed % 11 === 0 -> near-copy of a canonical  (dedupe: duplicate)
//                      composition
// PLANT=nofail disables all planted modes (the fail-first control: QC/dedupe
// tests must FAIL under it, proving they actually see the planted images).
import sharp from "sharp";

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One irregular closed blob path around (cx, cy). */
function blobPath(rng, cx, cy, baseR) {
  const n = 10;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const r = baseR * (0.7 + rng() * 0.6);
    pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
  }
  // Smooth: quadratic curves through midpoints.
  let d = "";
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    d += i === 0 ? `M ${mx} ${my} ` : "";
    const [nx, ny] = pts[(i + 1) % n];
    const [mx2, my2] = [(nx + pts[(i + 2) % n][0]) / 2, (ny + pts[(i + 2) % n][1]) / 2];
    d += `Q ${nx} ${ny} ${mx2} ${my2} `;
  }
  return d + "Z";
}

function blobSvg({ artSeed, size, opaque, twoBlobs, cropped, offset }) {
  const rng = mulberry32(artSeed);
  const hue = Math.floor(rng() * 360);
  const cx = cropped ? 60 : 512 + (rng() - 0.5) * 120 + offset;
  const cy = 512 + (rng() - 0.5) * 120 + offset;
  const r = 190 + rng() * 70;
  let shapes = `<path d="${blobPath(rng, cx, cy, r)}" fill="hsl(${hue} 45% 45%)" filter="url(#soft)"/>`;
  if (twoBlobs)
    shapes += `<path d="${blobPath(rng, 790, 800, 110)}" fill="hsl(${(hue + 90) % 360} 45% 45%)" filter="url(#soft)"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">` +
    `<defs><filter id="soft" x="-20%" y="-20%" width="140%" height="140%">` +
    `<feGaussianBlur stdDeviation="6"/></filter></defs>` +
    (opaque ? `<rect width="1024" height="1024" fill="white"/>` : "") +
    shapes +
    `</svg>`
  );
}

export const mockProvider = {
  name: "mock",
  model: "mock-1",
  supportsAlpha: true,
  costPerImageUSD: 0,
  async generate({ seed }) {
    const plant = process.env.PLANT !== "nofail";
    const opaque = plant && seed % 23 === 0;
    const twoBlobs = plant && !opaque && seed % 19 === 0;
    const cropped = plant && !opaque && !twoBlobs && seed % 17 === 0;
    const lowres = plant && !opaque && !twoBlobs && !cropped && seed % 13 === 0;
    const dup = plant && !opaque && !twoBlobs && !cropped && !lowres && seed % 11 === 0;
    const svg = blobSvg({
      // Duplicates all render the SAME canonical composition, nudged ~2px by
      // their own seed — near-identical dHash, first one in wins.
      artSeed: dup ? 424242 : seed,
      size: lowres ? 300 : 1024,
      opaque,
      twoBlobs,
      cropped,
      offset: dup ? (seed % 5) - 2 : 0,
    });
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return { png, seed, model: "mock-1", providerMeta: { opaque, twoBlobs, cropped, lowres, dup } };
  },
};
