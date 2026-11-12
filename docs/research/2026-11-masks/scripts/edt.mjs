// edt.mjs: the exact Euclidean distance transform (Felzenszwalb and Huttenlocher, 2012), imported by score.mjs and step 423's
// planting script; never run by itself.

const INF = 1e20;

function dt1(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** For every pixel, the distance in pixels to the nearest pixel where `seed` is true (0 on a seed). `seed(i)` takes the pixel index. */
export function distanceTo(width, height, seed) {
  const g = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) g[i] = seed(i) ? 0 : INF;
  const n = Math.max(width, height);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = g[y * width + x];
    dt1(f, height, d, v, z);
    for (let y = 0; y < height; y++) g[y * width + x] = d[y];
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = g[y * width + x];
    dt1(f, width, d, v, z);
    for (let x = 0; x < width; x++) g[y * width + x] = Math.sqrt(d[x]);
  }
  return g;
}
