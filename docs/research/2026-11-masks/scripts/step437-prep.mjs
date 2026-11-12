// step437-prep.mjs: imported by step 437's scripts, never run alone. Brings an RGB byte picture to a given size by area averaging
// (each output pixel the mean of the source area it covers, partial pixels weighted by their share) and gives the tensor DINOv2 takes:
// channels first, each value byte / 255 less the processor's mean and over its spread (preprocessor_config.json of the ONNX copy:
// mean 0.485, 0.456, 0.406; spread 0.229, 0.224, 0.225).
console.log('MADE TO FAIL (prep): the importing script plants a 4 by 2 picture of 0 and 255 in turn that must area-halve to 127.5 (known figure 127.5)');
console.log('nothing below is trustworthy unless that plant reads 127.5');

const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

/** Area weights from n source cells to m output cells: for each output, a list of [source index, weight] summing to 1. */
function weights(n, m) {
  const s = n / m, out = [];
  for (let o = 0; o < m; o++) {
    const a = o * s, b = (o + 1) * s, list = [];
    for (let i = Math.floor(a); i < Math.ceil(b) && i < n; i++) {
      const w = Math.min(b, i + 1) - Math.max(a, i);
      if (w > 0) list.push([i, w / s]);
    }
    out.push(list);
  }
  return out;
}

/** Takes { width, height, data } RGB bytes and the output size; gives { rgb: Float32Array HWC of byte values, raw: the first
 *  channel per pixel, tensor: Float32Array 3 by H by W normalised } (the tensor is left out when rawOnly is true). */
export function prep(im, W, H, rawOnly) {
  const wx = weights(im.width, W), wy = weights(im.height, H);
  const tmp = new Float32Array(im.height * W * 3);
  for (let y = 0; y < im.height; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0;
    for (const [i, w] of wx[x]) { const o = (y * im.width + i) * 3; r += w * im.data[o]; g += w * im.data[o + 1]; b += w * im.data[o + 2]; }
    const t = (y * W + x) * 3; tmp[t] = r; tmp[t + 1] = g; tmp[t + 2] = b;
  }
  const rgb = new Float32Array(H * W * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0;
    for (const [j, w] of wy[y]) { const o = (j * W + x) * 3; r += w * tmp[o]; g += w * tmp[o + 1]; b += w * tmp[o + 2]; }
    const t = (y * W + x) * 3; rgb[t] = r; rgb[t + 1] = g; rgb[t + 2] = b;
  }
  const raw = new Float32Array(H * W);
  for (let i = 0; i < H * W; i++) raw[i] = rgb[3 * i];
  if (rawOnly) return { rgb, raw };
  const plane = H * W, tensor = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) for (let c = 0; c < 3; c++) tensor[c * plane + i] = (rgb[3 * i + c] / 255 - MEAN[c]) / STD[c];
  return { rgb, raw, tensor };
}
