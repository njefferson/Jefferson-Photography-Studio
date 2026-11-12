// Child of the step 428 runner (send 2). Usage: node step428-compose.mjs [limit]. For every frame and subject of the smoothly carried masks (research/whole/maps-recipe/index/index-smooth-<input>-frames.json) composes two pictures under research/whole/maps-recipe/compose/:
//   contact-<frame>-<subject>.png  six titled panels, the three renderings (Weight, Cut at a half, Refined to edges) on the open input in the top row and on the natural-hue input in the bottom row, each the whole frame at a quarter of its size under a title, the mask as a magenta tint by weight and its outline at a half in yellow;
//   crops-<frame>-<subject>.png    six titled windows of 400 by 400 at full size, one for each of the same six masks, each the window of the 200-pixel grid holding the most outline of that mask.
// Prints each picture's panel shares and crop places and writes them to research/whole/maps-recipe/compose/compose-raw.txt. Exits 0 whatever it finds.
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
console.log('MADE TO FAIL: a built-in 200 by 100 mask with its left half on must read a share of 50.0 percent and 200 outline pixels (known figures 50.0 and 200)');
console.log('nothing below is trustworthy unless the plant line reads 50.0 percent and 200');

const WHOLE = '/tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad/research/whole';
const OUT = WHOLE + '/maps-recipe/compose';
const P = await import(WHOLE + '/png.mjs');
const D = await import(WHOLE + '/draw.mjs');
const TINT = [255, 0, 200], LINE = [255, 230, 0], Q = 4, CROP = 400, GAP = 12;

/** Takes a mask's bytes, its width and height; gives { e, n }, e marking every pixel whose cut at 128 differs from a 4-neighbour's and n their count. */
function edgeOf(w, width, height) {
  const e = new Uint8Array(width * height);
  let n = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, v = w[i] >= 128;
    if ((x > 0 && (w[i - 1] >= 128) !== v) || (x < width - 1 && (w[i + 1] >= 128) !== v) || (y > 0 && (w[i - width] >= 128) !== v) || (y < height - 1 && (w[i + width] >= 128) !== v)) { e[i] = 1; n++; }
  }
  return { e, n };
}
{
  const W = 200, H = 100, w = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) w[y * W + x] = x < 100 ? 255 : 0;
  let on = 0; for (let i = 0; i < W * H; i++) if (w[i] >= 128) on++;
  console.log('plant: ' + ((on / (W * H)) * 100).toFixed(1) + ' percent, ' + edgeOf(w, W, H).n);
}

/** Takes a frame and a mask of one size and a factor q; gives the quarter-size panel: box averages of the frame and mask, the tint by weight and the outline at a half drawn 2 pixels wide. */
function panelOf(f, m, q) {
  const w = Math.floor(f.width / q), h = Math.floor(f.height / q);
  const pic = { width: w, height: h, data: new Uint8Array(w * h * 3) };
  const mk = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let dy = 0; dy < q; dy++) for (let dx = 0; dx < q; dx++) {
      const s = ((y * q + dy) * f.width + (x * q + dx));
      r += f.data[3 * s]; g += f.data[3 * s + 1]; b += f.data[3 * s + 2]; a += m.data[s];
    }
    const n = q * q, wt = a / n / 255, o = (y * w + x) * 3;
    mk[y * w + x] = Math.round(a / n);
    const t = 0.55 * wt;
    pic.data[o] = Math.round((r / n) * (1 - t) + TINT[0] * t);
    pic.data[o + 1] = Math.round((g / n) * (1 - t) + TINT[1] * t);
    pic.data[o + 2] = Math.round((b / n) * (1 - t) + TINT[2] * t);
  }
  const { e } = edgeOf(mk, w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (e[y * w + x]) for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) D.put(pic, x + dx, y + dy, LINE);
  return pic;
}

/** Takes a frame, a mask, the mask's outline marks, a window's corner; gives the 400 by 400 window of the tinted frame with the outline 3 pixels wide, as sheet.mjs draws it. */
function windowOf(f, m, e, x0, y0) {
  const win = { width: CROP, height: CROP, data: new Uint8Array(CROP * CROP * 3) };
  for (let y = 0; y < CROP; y++) for (let x = 0; x < CROP; x++) {
    const s = (y0 + y) * f.width + (x0 + x), o = (y * CROP + x) * 3, t = 0.55 * (m.data[s] / 255);
    for (let c = 0; c < 3; c++) win.data[o + c] = Math.round(f.data[3 * s + c] * (1 - t) + TINT[c] * t);
  }
  for (let y = -1; y <= CROP; y++) for (let x = -1; x <= CROP; x++) {
    const X = x0 + x, Y = y0 + y;
    if (X < 0 || Y < 0 || X >= f.width || Y >= f.height || !e[Y * f.width + X]) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) D.put(win, x + dx, y + dy, LINE);
  }
  return win;
}

const limit = Number(process.argv[2] || 100000);
const RENDERINGS = ['Weight', 'Cut at a half', 'Refined to edges'];
const SHORT = ['WEIGHT', 'CUT', 'REFINED'];
const idx = { open: JSON.parse(readFileSync(WHOLE + '/maps-recipe/index/index-smooth-open-frames.json', 'utf8')), natural: JSON.parse(readFileSync(WHOLE + '/maps-recipe/index/index-smooth-natural-frames.json', 'utf8')) };
const combos = [];
for (const e of idx.open) if (e.file && e.rendering === 'Weight') combos.push({ picture: e.picture, subject: e.subject });
mkdirSync(OUT, { recursive: true });
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const raw = [];
let made = 0;
for (const c of combos) {
  if (made >= limit) break;
  const frames = { open: P.readRGB(WHOLE + '/frames/' + c.picture + '-open.png'), natural: P.readRGB(WHOLE + '/frames/' + c.picture + '-natural.png') };
  const W = frames.open.width, H = frames.open.height, pw = Math.floor(W / Q), ph = Math.floor(H / Q);
  const TIT = 44, contact = D.blank(3 * pw + 4 * GAP, 60 + 2 * (ph + TIT + GAP), [20, 20, 20]);
  const crops = D.blank(3 * CROP + 4 * GAP, 60 + 2 * (CROP + TIT + GAP), [20, 20, 20]);
  const head = c.picture + '. SUBJECT ' + c.subject + '. 2.79 RECIPE. ';
  D.text(contact, 10, 10, head + 'WHOLE FRAME AT A QUARTER. TOP ROW OPEN INPUT, BOTTOM ROW NATURAL HUE', 3, [255, 255, 255]);
  D.text(crops, 10, 10, c.picture + '. ' + c.subject + '. CROPS AT FULL SIZE. TOP OPEN, BOTTOM NATURAL', 2, [255, 255, 255]);
  raw.push('### ' + c.picture + ' | ' + c.subject);
  ['open', 'natural'].forEach((input, row) => {
    RENDERINGS.forEach((rendering, col) => {
      const ent = idx[input].find((e) => e.picture === c.picture && e.subject === c.subject && e.rendering === rendering);
      if (!ent || !ent.file) { raw.push(input + ' | ' + rendering + ' | no mask'); return; }
      const m = P.readGrey(ent.file);
      let on = 0; for (let i = 0; i < m.data.length; i++) if (m.data[i] >= 128) on++;
      const share = (on / m.data.length) * 100;
      const { e, n } = edgeOf(m.data, W, H);
      // contact panel
      const pan = panelOf(frames[input], m, Q);
      const px = GAP + col * (pw + GAP), py = 60 + row * (ph + TIT + GAP);
      D.text(contact, px, py + 6, rendering + '. ' + input + '. ' + share.toFixed(1) + '% AT A HALF', 2, [255, 255, 255]);
      D.paste(contact, pan, 0, 0, pw, ph, px, py + TIT);
      // crop: the window of the 200 grid holding the most outline
      let best = null;
      for (let y0 = 0; y0 + CROP <= H; y0 += 200) for (let x0 = 0; x0 + CROP <= W; x0 += 200) {
        let cnt = 0;
        for (let y = y0; y < y0 + CROP; y += 2) for (let x = x0; x < x0 + CROP; x += 2) cnt += e[y * W + x];
        if (!best || cnt > best[2]) best = [x0, y0, cnt];
      }
      const cx = GAP + col * (CROP + GAP), cy = 60 + row * (CROP + TIT + GAP);
      if (best && best[2] > 0) {
        D.text(crops, cx, cy + 6, SHORT[col] + ' ' + input + ' ' + best[0] + ',' + best[1], 2, [255, 255, 255]);
        D.paste(crops, windowOf(frames[input], m, e, best[0], best[1]), 0, 0, CROP, CROP, cx, cy + TIT);
      } else D.text(crops, cx, cy + 6, SHORT[col] + ' ' + input + ' NO EDGE', 2, [255, 255, 255]);
      raw.push(input + ' | ' + rendering + ' | ' + share.toFixed(1) + ' percent at a half | outline pixels ' + n + ' | crop at ' + (best && best[2] > 0 ? best[0] + ',' + best[1] : 'none'));
    });
  });
  const base = c.picture + '-' + slug(c.subject);
  P.writePNG(OUT + '/contact-' + base + '.png', contact.width, contact.height, 3, contact.data);
  P.writePNG(OUT + '/crops-' + base + '.png', crops.width, crops.height, 3, crops.data);
  console.log('composed ' + base + ' (contact ' + contact.width + ' by ' + contact.height + ', crops ' + crops.width + ' by ' + crops.height + ')');
  made++;
}
writeFileSync(OUT + '/compose-raw.txt', raw.join('\n') + '\n');
console.log(made + ' frame and subject pairs composed; figures in compose-raw.txt');
process.exit(0);
