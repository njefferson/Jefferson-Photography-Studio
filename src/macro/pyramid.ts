// Laplacian-pyramid focus blend. The gold-standard focus-stacking merge:
// decompose each frame into frequency bands (a Laplacian pyramid), and at every
// band + pixel keep the coefficient from the frame with the most LOCAL CONTRAST
// there, then collapse. Because the choice is per frequency band (not one hard
// per-pixel winner), the seams a raw argmax leaves in low-contrast transitions
// dissolve — the bands blend across the boundary at their own scale.
//
// Streaming: frames fold in ONE AT A TIME via add() (build its pyramid, merge,
// discard), so peak memory is the running merged pyramid + one frame's pyramid,
// independent of frame count — the iPad constraint holds.
//
// Selection is driven by a single LUMA contrast measure per band, so all three
// channels take their coefficient from the same frame at a pixel (no colour
// fringing). The base (lowest-frequency residual) is AVERAGED across frames —
// it carries overall tone, which is near-identical between frames, and
// selecting it would add low-frequency mottling.

const REC = [0.2126, 0.7152, 0.0722];

interface Dim { w: number; h: number; }

/** Gaussian 5-tap reduce (blur + ½ subsample). */
function reduce(src: Float32Array, w: number, h: number): { data: Float32Array; w: number; h: number } {
  const dw = Math.max(1, Math.ceil(w / 2)), dh = Math.max(1, Math.ceil(h / 2));
  const k = [1, 4, 6, 4, 1];
  const tmp = new Float32Array(dw * h);
  for (let y = 0; y < h; y++) {
    for (let dx = 0; dx < dw; dx++) {
      const sx = dx * 2;
      let s = 0;
      for (let m = -2; m <= 2; m++) s += k[m + 2] * src[y * w + Math.min(w - 1, Math.max(0, sx + m))];
      tmp[y * dw + dx] = s / 16;
    }
  }
  const out = new Float32Array(dw * dh);
  for (let dy = 0; dy < dh; dy++) {
    const sy = dy * 2;
    for (let x = 0; x < dw; x++) {
      let s = 0;
      for (let m = -2; m <= 2; m++) s += k[m + 2] * tmp[Math.min(h - 1, Math.max(0, sy + m)) * dw + x];
      out[dy * dw + x] = s / 16;
    }
  }
  return { data: out, w: dw, h: dh };
}

/** Gaussian expand to an explicit target size (upsample ×2 + blur, gain 4). */
function expand(src: Float32Array, w: number, h: number, tw: number, th: number): Float32Array {
  const k = [1, 4, 6, 4, 1];
  // upsample rows to tw
  const tmp = new Float32Array(tw * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < tw; x++) {
      // contributing source samples are those whose *2 lands near x
      let s = 0;
      for (let m = -2; m <= 2; m++) {
        const sx = x + m;
        if (sx & 1) continue; // only even output positions carry a sample
        const src_x = sx >> 1;
        s += k[m + 2] * src[y * w + Math.min(w - 1, Math.max(0, src_x))];
      }
      tmp[y * tw + x] = (s / 16) * 2;
    }
  }
  const out = new Float32Array(tw * th);
  for (let x = 0; x < tw; x++) {
    for (let y = 0; y < th; y++) {
      let s = 0;
      for (let m = -2; m <= 2; m++) {
        const sy = y + m;
        if (sy & 1) continue;
        const src_y = sy >> 1;
        s += k[m + 2] * tmp[Math.min(h - 1, Math.max(0, src_y)) * tw + x];
      }
      out[y * tw + x] = (s / 16) * 2;
    }
  }
  return out;
}

function boxBlur3(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const inv = 1 / ((2 * r + 1) * (2 * r + 1));
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x <= r; x++) s += src[y * w + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { tmp[y * w + x] = s; s += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)]; } }
  const out = new Float32Array(w * h);
  for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { out[y * w + x] = s * inv; s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
  return out;
}

export class PyramidBlender {
  private dims: Dim[] = [];
  private nLap: number;
  private mLapR: Float32Array[] = [];
  private mLapG: Float32Array[] = [];
  private mLapB: Float32Array[] = [];
  private bestE: Float32Array[] = [];
  private baseR!: Float32Array;
  private baseG!: Float32Array;
  private baseB!: Float32Array;
  private baseCount = 0;

  constructor(w: number, h: number) {
    // pyramid dims down to a small base
    let cw = w, ch = h;
    this.dims.push({ w: cw, h: ch });
    while (Math.min(cw, ch) > 16) {
      cw = Math.ceil(cw / 2); ch = Math.ceil(ch / 2);
      this.dims.push({ w: cw, h: ch });
    }
    this.nLap = this.dims.length - 1; // detail levels 0..nLap-1; last = base
    for (let k = 0; k < this.nLap; k++) {
      const n = this.dims[k].w * this.dims[k].h;
      this.mLapR.push(new Float32Array(n));
      this.mLapG.push(new Float32Array(n));
      this.mLapB.push(new Float32Array(n));
      this.bestE.push(new Float32Array(n)); // starts 0 → any real contrast wins
    }
    const bn = this.dims[this.nLap].w * this.dims[this.nLap].h;
    this.baseR = new Float32Array(bn);
    this.baseG = new Float32Array(bn);
    this.baseB = new Float32Array(bn);
  }

  private gauss(plane: Float32Array): { data: Float32Array; w: number; h: number }[] {
    const out = [{ data: plane, w: this.dims[0].w, h: this.dims[0].h }];
    for (let k = 1; k < this.dims.length; k++) out.push(reduce(out[k - 1].data, out[k - 1].w, out[k - 1].h));
    return out;
  }

  /** Fold one frame (aligned R/G/B planes at the base working size) into the blend. */
  add(R: Float32Array, G: Float32Array, B: Float32Array) {
    const gR = this.gauss(R), gG = this.gauss(G), gB = this.gauss(B);
    for (let k = 0; k < this.nLap; k++) {
      const { w, h } = this.dims[k];
      const eR = expand(gR[k + 1].data, this.dims[k + 1].w, this.dims[k + 1].h, w, h);
      const eG = expand(gG[k + 1].data, this.dims[k + 1].w, this.dims[k + 1].h, w, h);
      const eB = expand(gB[k + 1].data, this.dims[k + 1].w, this.dims[k + 1].h, w, h);
      const n = w * h;
      const lapR = new Float32Array(n), lapG = new Float32Array(n), lapB = new Float32Array(n);
      const eLum = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const lr = gR[k].data[i] - eR[i], lg = gG[k].data[i] - eG[i], lb = gB[k].data[i] - eB[i];
        lapR[i] = lr; lapG[i] = lg; lapB[i] = lb;
        const l = REC[0] * lr + REC[1] * lg + REC[2] * lb;
        eLum[i] = l * l; // luma band energy = local contrast measure
      }
      // Smooth the measure so selection is spatially coherent (no per-pixel noise).
      const meas = boxBlur3(eLum, w, h, 2);
      const bE = this.bestE[k], mR = this.mLapR[k], mG = this.mLapG[k], mB = this.mLapB[k];
      for (let i = 0; i < n; i++) {
        if (meas[i] > bE[i]) { bE[i] = meas[i]; mR[i] = lapR[i]; mG[i] = lapG[i]; mB[i] = lapB[i]; }
      }
    }
    // Average the base residual.
    const bl = this.nLap;
    const bR = gR[bl].data, bG = gG[bl].data, bB = gB[bl].data;
    for (let i = 0; i < this.baseR.length; i++) { this.baseR[i] += bR[i]; this.baseG[i] += bG[i]; this.baseB[i] += bB[i]; }
    this.baseCount++;
  }

  /** Collapse the merged pyramid into the final RGBA image. */
  finish(): ImageData {
    const c = this.baseCount || 1;
    let R = new Float32Array(this.baseR.length), G = new Float32Array(this.baseR.length), B = new Float32Array(this.baseR.length);
    for (let i = 0; i < R.length; i++) { R[i] = this.baseR[i] / c; G[i] = this.baseG[i] / c; B[i] = this.baseB[i] / c; }
    let cw = this.dims[this.nLap].w, ch = this.dims[this.nLap].h;
    for (let k = this.nLap - 1; k >= 0; k--) {
      const { w, h } = this.dims[k];
      const uR = expand(R, cw, ch, w, h), uG = expand(G, cw, ch, w, h), uB = expand(B, cw, ch, w, h);
      const n = w * h;
      R = new Float32Array(n); G = new Float32Array(n); B = new Float32Array(n);
      const mR = this.mLapR[k], mG = this.mLapG[k], mB = this.mLapB[k];
      for (let i = 0; i < n; i++) { R[i] = uR[i] + mR[i]; G[i] = uG[i] + mG[i]; B[i] = uB[i] + mB[i]; }
      cw = w; ch = h;
    }
    const { w, h } = this.dims[0];
    const out = new ImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      out.data[i * 4] = clamp8(R[i]); out.data[i * 4 + 1] = clamp8(G[i]); out.data[i * 4 + 2] = clamp8(B[i]); out.data[i * 4 + 3] = 255;
    }
    return out;
  }
}

function clamp8(v: number): number { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }
