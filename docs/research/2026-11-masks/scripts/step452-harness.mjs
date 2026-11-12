// Child of the step 452 runner. Usage: node step452-harness.mjs <task> <way> <frame> [more].
//   masks <drawn|decode> <frame|all> [subject]    the mask of the rendering Refined to edges, carried to the frame's own size, for each subject the frame's samples name
//   copy  <drawn|decode> <frameA> <frameB>         the recipe fitted on frameA's samples, applied to frameB, for each subject both frames name
//   check <frame> <subject>                        the drawn way's mask for that frame and subject against the mask of 11 November, by overlap over union with both cut at a half
// Two ways of counting the cues, one frame each: DRAWN counts them on the kept picture as the editor opens it (exactly as 11 November); DECODE counts them through the function step 451 builds, and is
// one function of this file, countDecode, marked below, which step 453 fills. Writes under research/decode; prints and exits 0 whatever it finds.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
console.log('MADE TO FAIL: this harness ends with a plant whose expectation is known to be wrong (a subject weight expected to read exactly 1 where the record gives 201 over 202, and an overlap over union expected 0.75 where the true figure is 0.5); both must be reported as failing (known figures 0.995049 and 0.5 read)');
console.log('nothing below is trustworthy if the plant is not reported as failing');

const SCRATCH = '/tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad';
const WHOLE = SCRATCH + '/research/whole';
const D = SCRATCH + '/research/decode';
const M = await import(SCRATCH + '/scratch/step452-bundle.mjs');
const P = await import(WHOLE + '/png.mjs');
mkdirSync(D + '/masks', { recursive: true });
mkdirSync(D + '/copies', { recursive: true });

const SEP_PIXELS_MAX = 1.2e6; // the test page's constant, src/debug.ts line 3014
const LEAVE_OUT = ['height']; // MASK_LEAVE_OUT, src/debug.ts line 4231
const RENDERING = 'Refined to edges';
const samplesFile = JSON.parse(readFileSync(WHOLE + '/samples.json', 'utf8'));
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Takes a grid of w by h bytes, the step k and a picture size W by H; gives W by H bytes by bilinear interpolation, cell centres at (cell + 0.5) times k, edges clamped (the carrying of step 428, unchanged). The result lies between the grid's least and greatest value. */
function carry(grid, w, h, k, W, H) {
  const x0 = new Int32Array(W), x1 = new Int32Array(W), fx = new Float32Array(W);
  for (let X = 0; X < W; X++) {
    let g = (X + 0.5) / k - 0.5;
    if (g < 0) g = 0; if (g > w - 1) g = w - 1;
    const a = Math.floor(g); x0[X] = a; x1[X] = Math.min(w - 1, a + 1); fx[X] = g - a;
  }
  const out = new Uint8Array(W * H);
  for (let Y = 0; Y < H; Y++) {
    let g = (Y + 0.5) / k - 0.5;
    if (g < 0) g = 0; if (g > h - 1) g = h - 1;
    const b = Math.floor(g), b1 = Math.min(h - 1, b + 1), fy = g - b;
    const r0 = b * w, r1 = b1 * w;
    for (let X = 0; X < W; X++) {
      const f = fx[X];
      const top = grid[r0 + x0[X]] * (1 - f) + grid[r0 + x1[X]] * f;
      const bot = grid[r1 + x0[X]] * (1 - f) + grid[r1 + x1[X]] * f;
      out[Y * W + X] = Math.round(top * (1 - fy) + bot * fy);
    }
  }
  return out;
}

/** Takes two byte masks of one size; gives overlap over union with both cut at a half (byte 128 or more), and the counts. */
function iouAtHalf(a, b) {
  let both = 0, either = 0, onlyA = 0, onlyB = 0;
  for (let i = 0; i < a.length; i++) {
    const p = a[i] >= 128, q = b[i] >= 128;
    if (p && q) both++; if (p || q) either++; if (p && !q) onlyA++; if (q && !p) onlyB++;
  }
  return { iou: either ? both / either : 1, both, either, onlyA, onlyB };
}

// Plant first: the same disjoint pair as step 418, written out here, through the bundle just built; then the overlap count on a built-in pair.
{
  const N = 200, n = 500, labels = new Uint8Array(n);
  const cn = ['lightness', 'red against green', 'texture at 5'];
  const cues = cn.map(() => new Float32Array(n));
  for (let i = 0; i < n; i++) {
    const l = i < N ? 0 : i < 2 * N ? 1 : 2; labels[i] = l;
    cues[0][i] = l === 0 ? 0.2 : l === 1 ? 0.8 : 0.5; cues[1][i] = 0.1; cues[2][i] = 0.05;
  }
  const r = M.sampleMaskFit(cues, cn, labels, ['sky', 'foliage', 'rest'], 'sky', 'planted one', null);
  const w = typeof r === 'object' ? M.sampleMaskWeights(r, cues, cn) : null;
  const read = w ? w[0] : NaN;
  console.log('PLANT: a subject pixel expected to weigh exactly 1 (known wrong; the record gives 0.995049); read ' + read.toFixed(6) + ' ; reported as ' + (read === 1 ? 'NOT FAILING, the instrument cannot be trusted' : 'failing (as it must)'));
  const t = iouAtHalf(Uint8Array.from([255, 255, 0, 0]), Uint8Array.from([255, 0, 0, 0]));
  console.log('PLANT: an overlap over union expected 0.75 (known wrong; the true figure is 0.5); read ' + t.iou.toFixed(4) + ' ; reported as ' + (t.iou === 0.75 ? 'NOT FAILING, the instrument cannot be trusted' : 'failing (as it must)'));
}

/**
 * The DRAWN way. Takes a frame name (NIR_3705); reads the kept picture as the editor opens it, thins it by the test page's rule (every k-th pixel of every k-th row, k from the 1.2e6 cap), and counts
 * the eight cues and the two structure cues on the thinned picture exactly as the page did before step 451.
 * Gives { way, W, H, k, w, h, n, cols, rows, light, cues, cueNames }: light is the max-channel lightness of the whole frame, one byte a pixel (what Refined to edges follows), cues is a list of
 * Float32Array(n), cueNames the names in the same order. The result is the one shape both ways return; fitting and rendering read nothing else.
 */
function countDrawn(frame) {
  const im = P.readRGB(WHOLE + '/frames/' + frame + '-open.png');
  const W = im.width, H = im.height;
  const rgba = new Uint8ClampedArray(W * H * 4);
  const light = new Uint8Array(W * H);
  for (let p = 0, q = 0, s = 0; p < W * H; p++, q += 4, s += 3) {
    const r = im.data[s], g = im.data[s + 1], b = im.data[s + 2];
    rgba[q] = r; rgba[q + 1] = g; rgba[q + 2] = b; rgba[q + 3] = 255;
    light[p] = r > g ? (r > b ? r : b) : (g > b ? g : b);
  }
  const k = Math.max(1, Math.ceil(Math.sqrt((W * H) / SEP_PIXELS_MAX)));
  const w = Math.floor(W / k), h = Math.floor(H / k), n = w * h;
  const tdata = new Uint8ClampedArray(n * 4);
  const cols = new Int32Array(n), rows = new Int32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * k * W + x * k) * 4, o = (y * w + x) * 4;
    tdata[o] = rgba[s]; tdata[o + 1] = rgba[s + 1]; tdata[o + 2] = rgba[s + 2]; tdata[o + 3] = 255;
    cols[y * w + x] = x * k; rows[y * w + x] = y * k;
  }
  // no linear camera copy exists for a kept 8-bit picture: the page's own fallback, the drawn channels over 255
  const linear = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { linear[3 * i] = tdata[4 * i] / 255; linear[3 * i + 1] = tdata[4 * i + 1] / 255; linear[3 * i + 2] = tdata[4 * i + 2] / 255; }
  const eight = M.placeCueValues(tdata, linear, light, W, H, cols, rows);
  const structure = M.placeStructureValues(light, W, H, cols, rows);
  return { way: 'drawn', W, H, k, w, h, n, cols, rows, light, cues: [...eight, ...structure], cueNames: [...M.PLACE_CUES, ...M.PLACE_STRUCTURE_CUES] };
}

/**
 * THE ONE PLACE STEP 453 FILLS. The DECODE way. Takes a frame name (NIR_3705); gives the same shape countDrawn gives { way: 'decode', W, H, k, w, h, n, cols, rows, light, cues, cueNames }, with
 * the cues and the lightness counted from the photograph's decode through the function of src/placedecode.ts (new, step 451), called as its contract in progress/step-451-report.txt gives it, and
 * through nothing that takes a white balance, an exposure, a channel swap, a denoise or a look. The frame's file is reached only through the app's tool: resolve() of tools/owner-images.mjs, as
 * scratch/step423-render.mjs does. The result must hold what countDrawn's holds, W and H the frame's own size, k the same thinning rule, and a light byte for every pixel of the frame.
 * Until step 453 fills it, this function throws, and a run of the decode way stops here and says so.
 */
async function countDecode(frame) {
  // FILLED BY STEP 453 from the page's call as progress/step-451-report.txt gives it: placeDecode on the decode and the thinning grid, then placeCueValues and placeStructureValues on its result.
  const meta = JSON.parse(readFileSync(WHOLE + '/frames/' + frame + '-open.json', 'utf8'));
  const { resolve } = await import('/home/user/Jefferson-Photography-Studio/tools/owner-images.mjs');
  const path = await resolve(meta.file);
  const bytes = readFileSync(path);
  const imported = await M.importFile(new File([bytes], meta.file));
  const img = await M.decode({ ...imported, bytes: imported.bytes.slice() });
  const W = img.width, H = img.height;
  if (W !== meta.width || H !== meta.height) throw new Error('the decode of ' + frame + ' is ' + W + ' by ' + H + ' and the kept picture is ' + meta.width + ' by ' + meta.height);
  const k = Math.max(1, Math.ceil(Math.sqrt((W * H) / SEP_PIXELS_MAX)));
  const w = Math.floor(W / k), h = Math.floor(H / k), n = w * h;
  const cols = new Int32Array(n), rows = new Int32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { cols[y * w + x] = x * k; rows[y * w + x] = y * k; }
  const own = M.placeDecode(img, { w, h, k, fromW: W, fromH: H });
  if (own.light.length !== W * H) throw new Error('the decode way light is ' + own.light.length + ' long, not ' + (W * H));
  const eight = M.placeCueValues(own.pixels, own.shares, own.light, W, H, cols, rows);
  const structure = M.placeStructureValues(own.light, W, H, cols, rows);
  return { way: 'decode', W, H, k, w, h, n, cols, rows, light: own.light, cues: [...eight, ...structure], cueNames: [...M.PLACE_CUES, ...M.PLACE_STRUCTURE_CUES] };
}

/** Takes a way name and a frame; gives the counted object of that way. */
async function count(way, frame) {
  if (way === 'drawn') return countDrawn(frame);
  if (way === 'decode') return countDecode(frame);
  throw new Error('the way is drawn or decode, not ' + way);
}

/** Takes a frame; gives its first set of samples. */
function samplesOf(frame) { return samplesFile.frames[frame].sets[0].samples; }

/**
 * Takes a counted object and a frame; gives { names, subjects, labels, got } from the frame's samples: the placed names with rest last, the subject names, and the label of every counted pixel.
 */
function labelled(c, frame) {
  const samples = samplesOf(frame);
  const names = M.placeSampleNames(samples);
  const got = M.placeSampleLabels(samples, c.W, c.H, c.cols, c.rows);
  return { names, subjects: names.slice(0, names.length - 1), labels: got.labels, got };
}

/** Takes a counted object and a recipe; gives the weights of the recipe on that object's cues, a Float32Array, or a string saying why none. */
function weightsOn(c, rec) { return M.sampleMaskWeights(rec, c.cues, c.cueNames); }

/**
 * Takes a counted object and the weights of a recipe on it; gives the mask of the rendering Refined to edges as one byte a pixel at the frame's own size: the rendering at the counted grid,
 * each value written as round(255 times the value), carried to the frame by bilinear interpolation of the grid (the carrying of 11 November). The bytes are what a mask file holds.
 */
function maskOf(c, wts) {
  const v = M.sampleMaskRender(wts, RENDERING, c.light, c.W, c.H, c.cols, c.rows);
  const grid = new Uint8Array(c.w * c.h);
  for (let i = 0; i < grid.length; i++) { const val = v[i]; grid[i] = Math.round(255 * (val < 0 ? 0 : val > 1 ? 1 : val)); }
  return carry(grid, c.w, c.h, c.k, c.W, c.H);
}

/** Takes bytes; gives the share at a half or more, in percent. */
function shareAtHalf(b) { let n = 0; for (let i = 0; i < b.length; i++) if (b[i] >= 128) n++; return (n / b.length) * 100; }

const task = process.argv[2];
const a1 = process.argv[3];
const a2 = process.argv[4];
const a3 = process.argv[5];
const frames = Object.keys(samplesFile.frames);

try {
  if (task === 'masks') {
    const way = a1, which = a2 === 'all' ? frames : [a2], only = a3 || '';
    for (const frame of which) {
      const c = await count(way, frame);
      const L = labelled(c, frame);
      const index = [];
      console.log(frame + ' ' + way + ': ' + c.W + ' by ' + c.H + ', k ' + c.k + ', counted ' + c.n + ', cues ' + c.cueNames.length + '; names ' + L.names.map((nm, i) => nm + ' ' + L.got.counts[i]).join(', ') + ', overlap ' + L.got.overlap);
      for (const subject of L.subjects) {
        if (only && subject !== only) continue;
        const rec = M.sampleMaskFit(c.cues, c.cueNames, L.labels, L.names, subject, frame, LEAVE_OUT);
        if (typeof rec === 'string' || !rec) { console.log('  ' + subject + ': no recipe: ' + rec); index.push({ way, picture: frame, subject, recipe: 'none', words: String(rec) }); continue; }
        const wts = weightsOn(c, rec);
        if (typeof wts === 'string' || !wts) { console.log('  ' + subject + ': no weights: ' + wts); index.push({ way, picture: frame, subject, recipe: 'fitted', weights: 'none', words: String(wts) }); continue; }
        const bytes = maskOf(c, wts);
        const file = D + '/masks/' + way + '-' + frame + '-' + slug(subject) + '.png';
        P.writePNG(file, c.W, c.H, 1, bytes);
        index.push({ way, picture: frame, subject, rendering: RENDERING, file, against: rec.others.join('|'), atHalfPercent: Number(shareAtHalf(bytes).toFixed(2)) });
        console.log('  ' + subject + ': fitted against ' + rec.others.join(', ') + '; ' + shareAtHalf(bytes).toFixed(1) + ' percent of the frame at a half; ' + file);
      }
      writeFileSync(D + '/masks/index-' + way + '-' + frame + (only ? '-' + slug(only) : '') + '.json', JSON.stringify(index, null, 1));
    }
  } else if (task === 'copy') {
    const way = a1, A = a2, B = a3;
    const cA = await count(way, A), cB = await count(way, B);
    const LA = labelled(cA, A), LB = labelled(cB, B);
    const both = LA.subjects.filter((s) => LB.subjects.includes(s));
    const index = [];
    console.log(A + ' to ' + B + ' ' + way + ': subjects in both ' + both.join(', '));
    for (const subject of both) {
      const rec = M.sampleMaskFit(cA.cues, cA.cueNames, LA.labels, LA.names, subject, A, LEAVE_OUT);
      if (typeof rec === 'string' || !rec) { console.log('  ' + subject + ': no recipe on ' + A + ': ' + rec); index.push({ way, from: A, to: B, subject, recipe: 'none', words: String(rec) }); continue; }
      const wts = weightsOn(cB, rec);
      if (typeof wts === 'string' || !wts) { console.log('  ' + subject + ': recipe does not apply to ' + B + ': ' + wts); index.push({ way, from: A, to: B, subject, weights: 'none', words: String(wts) }); continue; }
      const bytes = maskOf(cB, wts);
      const file = D + '/copies/' + way + '-' + A + '-to-' + B + '-' + slug(subject) + '.png';
      P.writePNG(file, cB.W, cB.H, 1, bytes);
      index.push({ way, from: A, to: B, subject, rendering: RENDERING, file, atHalfPercent: Number(shareAtHalf(bytes).toFixed(2)) });
      console.log('  ' + subject + ': recipe of ' + A + ' on ' + B + '; ' + shareAtHalf(bytes).toFixed(1) + ' percent of the frame at a half; ' + file);
    }
    writeFileSync(D + '/copies/index-' + way + '-' + A + '-to-' + B + '.json', JSON.stringify(index, null, 1));
  } else if (task === 'check') {
    const frame = a1, subject = a2;
    const c = countDrawn(frame);
    const L = labelled(c, frame);
    const rec = M.sampleMaskFit(c.cues, c.cueNames, L.labels, L.names, subject, frame, LEAVE_OUT);
    if (typeof rec === 'string' || !rec) throw new Error('no recipe: ' + rec);
    const wts = weightsOn(c, rec);
    if (typeof wts === 'string' || !wts) throw new Error('no weights: ' + wts);
    const mine = maskOf(c, wts);
    const old = P.readGrey(WHOLE + '/maps-recipe/smooth/frame/recipe-refined-to-edges-open-' + frame + '-' + slug(subject) + '.png');
    if (old.width !== c.W || old.height !== c.H) throw new Error('the mask of 11 November is ' + old.width + ' by ' + old.height);
    const r = iouAtHalf(mine, old.data);
    let same = 0, maxDiff = 0, big = 0;
    for (let i = 0; i < mine.length; i++) { const d = Math.abs(mine[i] - old.data[i]); if (d === 0) same++; if (d > maxDiff) maxDiff = d; if (d > 1) big++; }
    console.log('CHECK ' + frame + ' ' + subject + ': overlap over union at a half ' + r.iou.toFixed(5) + ' ; pixels cut in only the new ' + r.onlyA + ', only the old ' + r.onlyB + ', both ' + r.both + ' ; bytes equal in ' + (same / mine.length * 100).toFixed(3) + ' percent, largest byte difference ' + maxDiff + ', pixels differing by more than 1: ' + big);
    console.log('CHECK ' + frame + ' ' + subject + ': ' + (r.iou >= 0.99 ? 'at or above 0.99' : 'UNDER 0.99, something parts them'));
    P.writePNG(D + '/masks/check-drawn-' + frame + '-' + slug(subject) + '.png', c.W, c.H, 1, mine);
  } else {
    console.log('unknown task ' + task);
  }
} catch (e) {
  console.log('stopped: ' + (e && e.message ? e.message : e));
}
process.exit(0);
