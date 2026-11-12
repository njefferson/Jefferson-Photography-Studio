// step437-fit.mjs: fits two classifiers to the samples on a picture's DINOv2 small features and writes each subject's coarse mask.
// Use: node step437-fit.mjs <input>     (open, natural or bright: every picture on that input, then the carried pairs on it)
// Second send of step 437, under the rule the plan settled after the first send's eject (11 November, 14:00):
//   A sample is a circle. A patch whose cell centre (of the 67 by 100 grid, in the picture's own pixels) falls inside circles of one
//   name only is a sample patch of that name; one inside circles of two names is a sample patch of neither. Features are made unit length.
//   likeness(q, n): the mean cosine likeness of patch q to the 3 nearest sample patches of name n (fewer where n has fewer).
//   NEAR fit: each patch is given to the name it is most like (the highest likeness).
//   LINEAR fit: for each name a logistic classifier of that name against the rest, on the features standardised by the fitting picture's
//     own mean and spread for each feature, the two sides weighted equally, ridge 0.01, 300 steps of Adam at 0.05; each patch is given
//     to the name it scores highest.
//   REACH, circle by circle: for each sample patch p of a name, its likeness to the sample patches of that name lying in no circle p
//     lies in, so to that name's other circles alone.
//   THRESHOLD: for a name with a reach, the fifth part in a hundred from the bottom of its reaches over all its circles. A name with no
//     reach (one circle on the picture) takes the lowest threshold among the picture's names that have one; where no name has one, no
//     patch is refused a subject.
//   NO SUBJECT, under either fit: a patch whose likeness to the name it is given is under that name's threshold takes no subject.
//   A subject's coarse weight is 1 on the patches given to it and 0 elsewhere, brought to the picture's size by bilinear interpolation
//   between cell centres (edges held) and written as an 8-bit grey PNG, byte round(255 x weight); the no-subject patches are written
//   the same way under nosubject. No edge stage is run here.
// Carried: the fit made on the first picture of a pair (its sample patches, its thresholds, its standardisation, its classifiers) is
// applied to the second picture's own features on the same input, with nothing else carried, and a mask is written for each subject
// both pictures' samples name.
// Writes masks under research/whole/maps-features/masks, .../carried and .../nosubject, and a part file for the input. Exits 0 whatever it finds.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

console.log('MADE TO FAIL: on a planted 4 by 6 grid of three kinds with two circles on each of two names, a left patch outside the circles must read NEAR 1.0000 and LINEAR 1.0000 (known figure 1.0000)');
console.log('MADE TO FAIL: on that grid the third kind, unlike every sample, must take no subject, a share of 0.3333 of the patches under each fit (known figure 0.3333)');
console.log('MADE TO FAIL: with one circle on the right name its threshold must read the left name\'s 0.8000 (known figure 0.8000), and with one circle on each name the share with no subject must read 0.0000');
console.log('MADE TO FAIL: a 1 by 2 grid of 0 and 1 brought to 56 by 28 must read 0.5 at the column midway between the two cell centres (known figure 0.5)');
console.log('nothing below is trustworthy unless the plant lines read 1.0000, 1.0000, 0.3333, 0.3333, 0.8000, 0.0000 and 0.5');

const SCRATCH = '/tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad';
const R = SCRATCH + '/research/whole';
const MF = R + '/maps-features';
const { writePNG } = await import(R + '/png.mjs');
for (const d of ['masks', 'carried', 'nosubject']) mkdirSync(MF + '/' + d, { recursive: true });

const D = 384, K = 3, PCT = 0.05;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

function unit(f, n) {
  const x = new Float32Array(n * D);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let d = 0; d < D; d++) s += f[i * D + d] * f[i * D + d];
    const k = 1 / Math.sqrt(s || 1);
    for (let d = 0; d < D; d++) x[i * D + d] = f[i * D + d] * k;
  }
  return x;
}

/** The sample patches of a picture: { names, idx (patch indices), lab (name index), bits (the circles holding each), counts, circles, dropped }. */
function samplePatches(samples, rows, cols, W, H) {
  if (samples.length > 30) throw new Error('more than 30 samples on one picture: ' + samples.length);
  const names = [...new Set(samples.map((s) => s.name))];
  const short = Math.min(W, H), cw = W / cols, ch = H / rows;
  const owner = new Int32Array(rows * cols).fill(-1), circ = new Int32Array(rows * cols);
  let dropped = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const cx = (c + 0.5) * cw, cy = (r + 0.5) * ch, hit = new Set();
    let bits = 0;
    samples.forEach((s, si) => {
      if (Math.hypot(cx - s.x * W, cy - s.y * H) <= s.r * short) { hit.add(names.indexOf(s.name)); bits |= 1 << si; }
    });
    if (hit.size === 1) { owner[r * cols + c] = [...hit][0]; circ[r * cols + c] = bits; }
    else if (hit.size > 1) dropped++;
  }
  const idx = [], lab = [], bits = [];
  for (let i = 0; i < rows * cols; i++) if (owner[i] >= 0) { idx.push(i); lab.push(owner[i]); bits.push(circ[i]); }
  const counts = names.map((_, k) => lab.filter((l) => l === k).length);
  const circles = names.map((_, k) => samples.filter((s, si) => s.name === names[k] && bits.some((b, j) => lab[j] === k && (b & (1 << si)))).length);
  return { names, idx, lab, bits, counts, circles, dropped };
}

/** likeness of each query row of Q to each name: the mean of the K highest cosines to that name's rows of S. */
function likeness(Q, nq, S, lab, nNames) {
  const ns = lab.length, out = new Float32Array(nq * nNames);
  const top = Array.from({ length: nNames }, () => new Float64Array(K));
  const cnt = new Int32Array(nNames);
  for (let q = 0; q < nq; q++) {
    for (let k = 0; k < nNames; k++) { top[k].fill(-2); cnt[k] = 0; }
    for (let j = 0; j < ns; j++) {
      let s = 0;
      const a = q * D, b = j * D;
      for (let d = 0; d < D; d++) s += Q[a + d] * S[b + d];
      const t = top[lab[j]];
      cnt[lab[j]]++;
      if (s > t[K - 1]) { let p = K - 1; while (p > 0 && t[p - 1] < s) { t[p] = t[p - 1]; p--; } t[p] = s; }
    }
    for (let k = 0; k < nNames; k++) {
      const m = Math.min(K, cnt[k]);
      let s = 0;
      for (let p = 0; p < m; p++) s += top[k][p];
      out[q * nNames + k] = m ? s / m : -1;
    }
  }
  return out;
}

/** The reach of every sample patch, circle by circle: its likeness to its name's sample patches that share no circle with it. Gives a list per name. */
function reaches(S, sp) {
  const ns = sp.idx.length, per = sp.names.map(() => []);
  const t = new Float64Array(K);
  for (let j = 0; j < ns; j++) {
    const k = sp.lab[j];
    t.fill(-2);
    let cnt = 0;
    for (let q = 0; q < ns; q++) {
      if (sp.lab[q] !== k || (sp.bits[j] & sp.bits[q]) !== 0) continue;
      let s = 0;
      for (let d = 0; d < D; d++) s += S[j * D + d] * S[q * D + d];
      cnt++;
      if (s > t[K - 1]) { let p = K - 1; while (p > 0 && t[p - 1] < s) { t[p] = t[p - 1]; p--; } t[p] = s; }
    }
    if (!cnt) continue;
    const m = Math.min(K, cnt);
    let s = 0;
    for (let p = 0; p < m; p++) s += t[p];
    per[k].push(s / m);
  }
  return per;
}

/** Fits both classifiers and the thresholds on one picture's unit features X (n rows). */
function fit(X, n, sp) {
  const nNames = sp.names.length, ns = sp.idx.length;
  const S = new Float32Array(ns * D);
  sp.idx.forEach((p, j) => S.set(X.subarray(p * D, p * D + D), j * D));
  const per = reaches(S, sp);
  const thr = new Array(nNames).fill(null), how = new Array(nNames).fill('none');
  per.forEach((list, k) => {
    if (!list.length) return;
    const s = list.slice().sort((a, b) => a - b);
    thr[k] = s[Math.min(s.length - 1, Math.floor(PCT * s.length))];
    how[k] = 'own';
  });
  const owned = thr.filter((v) => v !== null);
  const low = owned.length ? Math.min(...owned) : -Infinity;
  for (let k = 0; k < nNames; k++) if (thr[k] === null) { thr[k] = low; how[k] = owned.length ? 'borrowed' : 'none'; }
  // Standardisation from the fitting picture's own patches.
  const mean = new Float64Array(D), sd = new Float64Array(D);
  for (let i = 0; i < n; i++) for (let d = 0; d < D; d++) mean[d] += X[i * D + d];
  for (let d = 0; d < D; d++) mean[d] /= n;
  for (let i = 0; i < n; i++) for (let d = 0; d < D; d++) { const v = X[i * D + d] - mean[d]; sd[d] += v * v; }
  for (let d = 0; d < D; d++) sd[d] = Math.sqrt(sd[d] / n) || 1;
  const Z = new Float64Array(ns * D);
  for (let j = 0; j < ns; j++) for (let d = 0; d < D; d++) Z[j * D + d] = (S[j * D + d] - mean[d]) / sd[d];
  const lin = [];
  for (let k = 0; k < nNames; k++) {
    const pos = sp.lab.filter((l) => l === k).length, neg = ns - pos;
    const w = new Float64Array(D + 1), m1 = new Float64Array(D + 1), m2 = new Float64Array(D + 1), g = new Float64Array(D + 1);
    if (!pos || !neg) { lin.push({ w, ok: false, acc: 0 }); continue; }
    for (let it = 1; it <= 300; it++) {
      g.fill(0);
      for (let j = 0; j < ns; j++) {
        let z = w[D];
        for (let d = 0; d < D; d++) z += w[d] * Z[j * D + d];
        const y = sp.lab[j] === k ? 1 : 0, wt = y ? 0.5 / pos : 0.5 / neg;
        const e = (1 / (1 + Math.exp(-z)) - y) * wt;
        for (let d = 0; d < D; d++) g[d] += e * Z[j * D + d];
        g[D] += e;
      }
      for (let d = 0; d < D; d++) g[d] += 0.01 * w[d];
      for (let d = 0; d <= D; d++) {
        m1[d] = 0.9 * m1[d] + 0.1 * g[d]; m2[d] = 0.999 * m2[d] + 0.001 * g[d] * g[d];
        const a = m1[d] / (1 - Math.pow(0.9, it)), b = m2[d] / (1 - Math.pow(0.999, it));
        w[d] -= 0.05 * a / (Math.sqrt(b) + 1e-8);
      }
    }
    let right = 0;
    for (let j = 0; j < ns; j++) {
      let z = w[D];
      for (let d = 0; d < D; d++) z += w[d] * Z[j * D + d];
      if ((z >= 0) === (sp.lab[j] === k)) right++;
    }
    lin.push({ w, ok: true, acc: right / ns });
  }
  return { names: sp.names, S, lab: sp.lab, thr, how, reachCounts: per.map((l) => l.length), mean, sd, lin };
}

/** Applies a fit to unit features X of n patches. Gives, for each fit, a 0 or 1 grid per name, the no-subject grid and its share. */
function apply(m, X, n) {
  const nNames = m.names.length;
  const L = likeness(X, n, m.S, m.lab, nNames);
  const out = {};
  for (const f of ['near', 'linear']) out[f] = { grids: m.names.map(() => new Float32Array(n)), none: new Float32Array(n), gated: 0 };
  for (let i = 0; i < n; i++) {
    let kn = 0;
    for (let k = 1; k < nNames; k++) if (L[i * nNames + k] > L[i * nNames + kn]) kn = k;
    let kl = -1, best = -Infinity;
    for (let k = 0; k < nNames; k++) {
      if (!m.lin[k].ok) continue;
      const w = m.lin[k].w;
      let z = w[D];
      for (let d = 0; d < D; d++) z += w[d] * ((X[i * D + d] - m.mean[d]) / m.sd[d]);
      if (z > best) { best = z; kl = k; }
    }
    if (kl < 0) kl = kn;
    for (const [f, k] of [['near', kn], ['linear', kl]]) {
      if (L[i * nNames + k] < m.thr[k]) { out[f].none[i] = 1; out[f].gated++; }
      else out[f].grids[k][i] = 1;
    }
  }
  for (const f of ['near', 'linear']) out[f].gated /= n;
  return out;
}

/** Brings a rows by cols grid to W by H by bilinear interpolation between cell centres, edges held; gives bytes. */
function upsample(g, rows, cols, W, H) {
  const out = new Uint8Array(W * H), cw = W / cols, ch = H / rows;
  const xs = new Int32Array(W), xf = new Float32Array(W);
  for (let x = 0; x < W; x++) { let u = (x + 0.5) / cw - 0.5; u = Math.max(0, Math.min(cols - 1, u)); xs[x] = Math.min(cols - 2, Math.floor(u)); xf[x] = u - xs[x]; if (cols === 1) { xs[x] = 0; xf[x] = 0; } }
  for (let y = 0; y < H; y++) {
    let v = (y + 0.5) / ch - 0.5; v = Math.max(0, Math.min(rows - 1, v));
    let r0 = Math.min(rows - 2, Math.floor(v)), fy = v - r0;
    if (rows === 1) { r0 = 0; fy = 0; }
    const r1 = rows === 1 ? 0 : r0 + 1;
    for (let x = 0; x < W; x++) {
      const c0 = xs[x], c1 = cols === 1 ? 0 : c0 + 1, fx = xf[x];
      const a = g[r0 * cols + c0] * (1 - fx) + g[r0 * cols + c1] * fx, b = g[r1 * cols + c0] * (1 - fx) + g[r1 * cols + c1] * fx;
      out[y * W + x] = Math.round(255 * Math.max(0, Math.min(1, a * (1 - fy) + b * fy)));
    }
  }
  return out;
}

{
  // The plant: 4 rows by 6 columns, 600 by 400 pixels, cells of 100. Columns 0 and 1 one kind, 2 and 3 a second, 4 and 5 a third that
  // no sample holds; every patch also carries a small part of its own, larger on the sample patches.
  const rows = 4, cols = 6, n = 24;
  const at = (r, c) => r * cols + c;
  const sampleCells = new Set([at(0, 0), at(3, 0), at(0, 3), at(3, 3)]);
  const F = new Float32Array(n * D);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = at(r, c);
    F[i * D + (c < 2 ? 0 : c < 4 ? 1 : 2)] = 1;
    F[i * D + 10 + i] = sampleCells.has(i) ? 0.5 : 0.2;
  }
  const X = unit(F, n);
  const L1 = { name: 'Left', x: 50 / 600, y: 50 / 400, r: 0.1 }, L2 = { name: 'Left', x: 50 / 600, y: 350 / 400, r: 0.1 };
  const R1 = { name: 'Right', x: 350 / 600, y: 50 / 400, r: 0.1 }, R2 = { name: 'Right', x: 350 / 600, y: 350 / 400, r: 0.1 };
  const run = (samples) => { const sp = samplePatches(samples, rows, cols, 600, 400); const m = fit(X, n, sp); return { sp, m, a: apply(m, X, n) }; };
  const A = run([L1, L2, R1, R2]);
  console.log('plant: NEAR ' + A.a.near.grids[0][at(1, 1)].toFixed(4) + ', LINEAR ' + A.a.linear.grids[0][at(1, 1)].toFixed(4) + ' (sample patches ' + A.sp.counts.join(' and ') + ', thresholds ' + A.m.thr.map((v) => v.toFixed(4)).join(' and ') + ')');
  console.log('plant: no subject NEAR ' + A.a.near.gated.toFixed(4) + ', LINEAR ' + A.a.linear.gated.toFixed(4));
  const B = run([L1, L2, R1]);
  console.log('plant: right threshold with one circle ' + B.m.thr[1].toFixed(4) + ' (' + B.m.how[1] + ')');
  const C = run([L1, R1]);
  console.log('plant: no subject with one circle on each name NEAR ' + C.a.near.gated.toFixed(4) + ', LINEAR ' + C.a.linear.gated.toFixed(4));
  const up = upsample(new Float32Array([0, 1]), 1, 2, 56, 28);
  console.log('plant: midway ' + ((up[27] + up[28]) / 2 / 255).toFixed(1));
}

const input = process.argv[2];
if (!input) { console.log('no input named; the plant alone was run'); process.exit(0); }
const SAMPLES = JSON.parse(readFileSync(R + '/samples.json', 'utf8'));
const FRAMES = ['NIR_3461', 'NIR_3466', 'NIR_1827', 'NIR_1651', 'NIR_3742', 'NIR_3705', 'NIR_3710', 'NIR_1873'];
const PLANTED = ['plant-straight', 'plant-stepped', 'plant-curved', 'plant-three', 'plant-shore', 'plant-built-foliage', 'plant-island'];
const PAIRS = [['NIR_3705', 'NIR_3710'], ['NIR_3461', 'NIR_3466'], ['NIR_3742', 'NIR_1873']];
const rowsOut = [], carriedOut = [], stats = [], shares = [];

function load(pic) {
  const j = JSON.parse(readFileSync(MF + '/features/' + pic + '-' + input + '.json', 'utf8'));
  const F = new Float32Array(readFileSync(MF + '/features/' + pic + '-' + input + '.f32').buffer.slice(0));
  const n = j.rows * j.cols;
  return { j, X: unit(F, n), n };
}
const samplesOf = (pic) => (pic.startsWith('plant-') ? SAMPLES.planted[pic] : SAMPLES.frames[pic]).sets[0].samples;

const fits = {};
for (const pic of [...FRAMES, ...PLANTED]) {
  const t0 = Date.now();
  const { j, X, n } = load(pic);
  const [W, H] = j.size;
  const sp = samplePatches(samplesOf(pic), j.rows, j.cols, W, H);
  const m = fit(X, n, sp);
  fits[pic] = m;
  const a = apply(m, X, n);
  for (const f of ['near', 'linear']) {
    m.names.forEach((name, k) => {
      const file = MF + '/masks/features-' + f + '-' + input + '-' + pic + '-' + slug(name) + '.png';
      writePNG(file, W, H, 1, upsample(a[f].grids[k], j.rows, j.cols, W, H));
      rowsOut.push({ file, kind: 'dinov2-small', variant: f, input, picture: pic, subject: name });
    });
    writePNG(MF + '/nosubject/features-' + f + '-' + input + '-' + pic + '.png', W, H, 1, upsample(a[f].none, j.rows, j.cols, W, H));
    shares.push({ picture: pic, input, fit: f, noSubject: a[f].gated });
  }
  const line = pic + ' ' + input + ': ' + m.names.map((nm, k) => nm + ' ' + sp.counts[k] + ' sample patches in ' + sp.circles[k] + ' circles, ' + m.reachCounts[k] + ' reaches, threshold ' + (Number.isFinite(m.thr[k]) ? m.thr[k].toFixed(4) : 'none') + ' (' + m.how[k] + ')').join('; ') + '; ' + sp.dropped + ' patches in two names left out; no subject NEAR ' + (100 * a.near.gated).toFixed(1) + ' percent, LINEAR ' + (100 * a.linear.gated).toFixed(1) + ' percent of patches; linear fits right on their own samples ' + m.lin.map((l) => (100 * l.acc).toFixed(1)).join(', ') + ' percent; ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s';
  stats.push(line);
  console.log(line);
}

for (const [from, to] of PAIRS) {
  const m = fits[from];
  const { j, X, n } = load(to);
  const [W, H] = j.size;
  const toNames = new Set(samplesOf(to).map((s) => s.name));
  const a = apply(m, X, n);
  const parts = [];
  for (const f of ['near', 'linear']) {
    let elsewhere = 0;
    m.names.forEach((name, k) => {
      if (!toNames.has(name)) { for (let i = 0; i < n; i++) elsewhere += a[f].grids[k][i]; return; }
      const file = MF + '/carried/features-' + f + '-' + input + '-' + from + '-to-' + to + '-' + slug(name) + '.png';
      writePNG(file, W, H, 1, upsample(a[f].grids[k], j.rows, j.cols, W, H));
      carriedOut.push({ file, kind: 'dinov2-small', variant: f + ' carried from ' + from, input, picture: to, subject: name, from });
    });
    writePNG(MF + '/nosubject/features-' + f + '-' + input + '-' + from + '-to-' + to + '.png', W, H, 1, upsample(a[f].none, j.rows, j.cols, W, H));
    shares.push({ picture: to, from, input, fit: f, noSubject: a[f].gated, toNameNotHeld: elsewhere / n });
    parts.push(f.toUpperCase() + ' no subject ' + (100 * a[f].gated).toFixed(1) + ' percent, given a name the second does not hold ' + (100 * elsewhere / n).toFixed(1) + ' percent');
  }
  const line = 'carried ' + from + ' to ' + to + ' ' + input + ': names of the fit ' + m.names.join(', ') + '; held by both ' + m.names.filter((x) => toNames.has(x)).join(', ') + '; ' + parts.join('; ') + ' of the second picture\'s patches';
  stats.push(line);
  console.log(line);
}

writeFileSync(MF + '/part-' + input + '.json', JSON.stringify({ rows: rowsOut, carried: carriedOut, stats, shares }, null, 1));
console.log('masks ' + rowsOut.length + ', carried ' + carriedOut.length);
process.exit(0);
