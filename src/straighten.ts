// FINDING THE ANGLE A FRAME IS OFF BY.
//
// The method is the settled one and deliberately not invented here: take the
// image gradient everywhere, keep the strong edges, and ask what angle they
// agree on. A horizon, a waterline, a roofline and a fence all vote together;
// foliage and grain vote for everything equally and cancel.
//
// INFRARED HELPS RATHER THAN HURTS. The sky-to-foliage boundary is the
// strongest edge in a near-infrared frame by a distance — vegetation is bright
// and sky is dark, which is the whole look — so the thing a reader most wants
// levelled is also the thing that votes loudest. And the hot spot cannot bias
// it: a radial brightening contributes gradients pointing outward in every
// direction at once, so it adds the same weight to every angle.
//
// WHAT IT IS NOT. This is not perspective correction — no vanishing points, no
// keystone. It answers one question, "how far from level is this", and says so
// when it cannot.

/** The answer, in degrees, plus how much the frame agreed with it. */
export interface Tilt {
  /** Positive means the frame is rotated anticlockwise and wants turning back
   *  clockwise — the same sign convention as the Straighten slider. */
  degrees: number;
  /** HOW FAR THE STRONGEST LINE STANDS ABOVE AN ORDINARY ONE — the winning
   *  accumulator cell against the mean cell. One is nothing; a real horizon in
   *  a busy frame runs into the tens. Below FLOOR nothing is returned at all,
   *  because a confident quarter of a degree on a frame with no line in it is
   *  worse than an admission. */
  agreement: number;
}

/** How far from level a straighten will ever claim. Beyond this it is a
 *  rotation, not a straighten, and the slider itself stops at 45. */
const LIMIT = 15;
/** HOW LONG A LINE HAS TO BE, as a fraction of the frame's long edge, before it
 *  is worth levelling by. A quarter, from the measurements:
 *
 *    a drawn horizon across the frame        1.2 - 1.6
 *    the same under heavy noise              0.11
 *    a real infrared hillside with a horizon 0.40
 *    real woodland frames, no straight line  0.011 - 0.117
 *    pure texture                            0.024
 *
 *  So a quarter sits an order of magnitude above what a frame of leaves
 *  produces and well below a real horizon. Everything under it is declined in
 *  words rather than answered with a confident quarter of a degree. */
const FLOOR = 0.25;

/** Find the tilt of the strongest straight structure in a frame.
 *
 *  `lumaAt` is asked for gamma-ish brightness at integer pixels of a REDUCED
 *  image — the caller decides the reduction, because it already has the decoded
 *  pixels and knows how to sample them. 600-1000px on the long edge is plenty:
 *  a horizon is a low-frequency thing, and smaller is both faster and less
 *  distracted by leaves. */
export function findTilt(lumaAt: (x: number, y: number) => number, w: number, h: number): Tilt | null {
  if (w < 32 || h < 32) return null;

  // TWO box blurs first. Foliage and sensor grain are the loudest gradients in
  // an infrared frame and they carry no angle; each pass divides their vote by
  // about three while leaving a horizon — which is hundreds of pixels long —
  // exactly where it was. One pass was not enough: a frame with noise at a
  // third of the edge's own height was declined for want of agreement, which on
  // a high-ISO infrared frame is an ordinary amount of noise.
  const n = w * h;
  let blur = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) blur[y * w + x] = lumaAt(x, y);
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          for (let dx = -1; dx <= 1; dx++) {
            const xx = Math.min(w - 1, Math.max(0, x + dx));
            s += blur[yy * w + xx];
          }
        }
        out[y * w + x] = s / 9;
      }
    }
    blur = out;
  }

  // Sobel, then keep only the strong half — an edge that is barely there is
  // noise with an opinion.
  // A MARGIN, BECAUSE THE FRAME'S OWN BORDER IS NOT A LINE IN THE PHOTOGRAPH.
  // Blurring clamps at the edge, so wherever a real line meets the border it
  // leaves a short axis-aligned gradient there — an artefact that votes for
  // level. Measured: a horizon drawn at 12 degrees read 11.37 with the border
  // included and the same frame's grating equivalent, which has no ends, read
  // 11.95. The bias always points toward zero and grows with the angle, which
  // is the worst shape it could have: it under-corrects exactly the frames that
  // need correcting most.
  const margin = Math.max(2, Math.round(Math.min(w, h) * 0.02));
  const mag = new Float32Array(n);
  const ang = new Float32Array(n);
  let biggest = 0;
  for (let y = margin; y < h - margin; y++) {
    for (let x = margin; x < w - margin; x++) {
      const i = y * w + x;
      const a = blur[i - w - 1], b = blur[i - w], c = blur[i - w + 1];
      const d = blur[i - 1], f = blur[i + 1];
      const g = blur[i + w - 1], p = blur[i + w], q = blur[i + w + 1];
      const gx = (c + 2 * f + q) - (a + 2 * d + g);
      const gy = (g + 2 * p + q) - (a + 2 * b + c);
      const m = Math.hypot(gx, gy);
      mag[i] = m;
      if (m > biggest) biggest = m;
      // THE ANGLE OF THE EDGE, not of the gradient: they are ninety degrees
      // apart, and only one of them is what "level" means. A horizon varies in
      // y and not in x, so its gradient points straight down and its edge runs
      // straight across.
      ang[i] = Math.atan2(gy, gx);
    }
  }
  if (!(biggest > 0)) return null;

  // THE THRESHOLD IS RELATIVE TO THE STRONGEST EDGE, NOT TO A SHARE OF THE
  // PIXELS, and the difference is the whole thing working or not. A horizon
  // across a 900-pixel frame is about two rows of it — three parts in a
  // thousand — so "keep the strongest fifteen per cent of pixels" keeps the
  // horizon and a hundred and fifty thousand grains of noise, whose angles are
  // uniform and swamp the vote. Measured: every synthetic horizon was declined
  // for want of agreement until this changed, while a noiseless test frame
  // passed, which is exactly the shape of a threshold that only works when
  // there is nothing to reject.
  //
  // The scale is the 99.9th percentile, not the 99th and not the maximum. A
  // horizon across a 900-pixel frame is two rows of it — three parts in a
  // thousand — so the 99th percentile lands INSIDE the noise and a threshold
  // below that keeps everything. Measured: with a tenth of that noise present
  // every synthetic horizon was declined, while the same frames with no noise
  // at all were found to a tenth of a degree. A thousandth is still hundreds of
  // pixels here, so one hot pixel cannot set the scale either.
  const hist = new Float64Array(1024);
  let count = 0;
  for (let i = 0; i < n; i++) if (mag[i] > 0) { hist[Math.min(1023, Math.floor((mag[i] / biggest) * 1024))]++; count++; }
  if (!count) return null;
  let seen = 0, strong = biggest;
  for (let i = 1023; i >= 0; i--) {
    seen += hist[i];
    if (seen >= Math.max(24, count * 0.001)) { strong = ((i + 0.5) / 1024) * biggest; break; }
  }
  const keep = 0.25 * strong;
  // AND A FRAME CAN SIMPLY HAVE NO EDGES. Every threshold above is relative to
  // the frame's own strongest edge, which is what makes this work across
  // infrared exposures that vary enormously — and it means a frame of smooth
  // shading and nothing else has its faint contours promoted to "the strongest
  // edges here". Measured on a smooth gradient with no edge in it at all: it
  // came back as the most confident frame of the whole set. A real photographed
  // edge is two orders of magnitude above this floor; smooth shading is below
  // it.
  if (strong < 0.02) return null;

  // ORIENTATION ALONE CANNOT TELL A HORIZON FROM A HEDGE, and that is the
  // whole difficulty. A thousand leaf edges that happen to lie near level vote
  // exactly like one horizon does — measured on eight real infrared frames, the
  // orientation-only version scored every one of them between 0.007 and 0.012,
  // with no separation at all between frames that have a horizon and frames
  // that are nothing but foliage. It would have shipped as a coin flip.
  //
  // What separates them is COLLINEARITY: a horizon's edge pixels all lie on one
  // line, and a hedge's do not. So the votes go into (angle, offset) cells — a
  // Hough accumulator, which is the settled answer to this and has been for
  // fifty years — and the winner is one line rather than one direction.
  //
  // Horizontals and verticals are accumulated apart, because a frame tilted two
  // degrees has both and they are the same two degrees, but they are not the
  // same LINE and must not share a cell.
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  // A QUARTER OF A DEGREE PER CELL, AND NOT FINER. A tenth was tried and made
  // everything worse: a real line is not straight to a tenth of a degree, so
  // its votes spread over more cells, the peak halved, and one test frame fell
  // below the floor altogether and was declined. Resolution below the cell
  // comes from interpolating the peak instead, which costs nothing and does not
  // split it.
  const TH = 0.25;                                   // degrees per angle cell
  const cols = Math.round((LIMIT * 2) / TH) + 1;
  const RHO = 3;                                     // pixels per offset cell
  const rows = Math.ceil(Math.hypot(w, h) / RHO) + 2;
  const mid = Math.floor(rows / 2);
  const accH = new Float64Array(cols * rows);
  const accV = new Float64Array(cols * rows);
  // The same cells, counted in PIXELS as well as weight — see the strength
  // measure below, which is about how LONG the winning line is.
  const cntH = new Int32Array(cols * rows);
  const cntV = new Int32Array(cols * rows);
  let total = 0;
  for (let y = margin; y < h - margin; y++) {
    for (let x = margin; x < w - margin; x++) {
      const i = y * w + x;
      const m = mag[i];
      if (m < keep) continue;
      total += m;
      const a = ang[i];
      let deg = (a * 180) / Math.PI;
      deg = ((deg % 90) + 90) % 90;
      if (deg > 45) deg -= 90;
      if (Math.abs(deg) > LIMIT) continue;
      const col = Math.round((deg + LIMIT) / TH);
      if (col < 0 || col >= cols) continue;
      const rad = (deg * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const dx = x - cx, dy = y - cy;
      // Which family: the EDGE runs perpendicular to the gradient, so a
      // gradient pointing up or down belongs to a horizontal line.
      const horizontal = Math.abs(Math.sin(a)) >= Math.abs(Math.cos(a));
      const rho = horizontal ? dy * cos - dx * sin : dx * cos + dy * sin;
      const row = Math.round(rho / RHO) + mid;
      if (row < 0 || row >= rows) continue;
      (horizontal ? accH : accV)[col * rows + row] += m;
      (horizontal ? cntH : cntV)[col * rows + row]++;
    }
  }
  if (!(total > 0)) return null;

  // The strongest line, counted with its immediate neighbours: a real line
  // straddles two offset cells as often as it fills one, and an angle cell of a
  // quarter degree is finer than the edge itself is straight.
  let best = 0, bestCol = -1, bestRow = -1, bestAcc = accH, bestCnt = cntH;
  const families = [{ acc: accH, cnt: cntH }, { acc: accV, cnt: cntV }];
  for (const { acc, cnt } of families) {
    for (let c = 0; c < cols; c++) {
      for (let r = 1; r < rows - 1; r++) {
        const v = acc[c * rows + r - 1] + acc[c * rows + r] + acc[c * rows + r + 1];
        if (v > best) { best = v; bestCol = c; bestRow = r; bestAcc = acc; bestCnt = cnt; }
      }
    }
  }
  if (bestCol < 0 || !(best > 0)) return null;

  // THE PEAK, INTERPOLATED, so the answer is not quantised to a quarter of a
  // degree. The three cells around the winner are fitted with a parabola and
  // its vertex taken — the standard way to read a Hough peak below its own
  // resolution, and the reason the cells can stay coarse enough to hold the
  // peak together. Measured against a drawn horizon at 0.7 degrees: 0.54 from
  // the cell centre alone, 0.66 interpolated.
  //
  // The three are read over the winning line's own offset neighbourhood rather
  // than down the whole column, so a second, weaker line elsewhere in the frame
  // cannot drag the angle.
  const colAt = (c: number): number => {
    if (c < 0 || c >= cols) return 0;
    return bestAcc[c * rows + bestRow - 1] + bestAcc[c * rows + bestRow] + bestAcc[c * rows + bestRow + 1];
  };
  const y0 = colAt(bestCol - 1), y1 = colAt(bestCol), y2 = colAt(bestCol + 1);
  const denom = y0 - 2 * y1 + y2;
  const shift = denom !== 0 ? Math.max(-1, Math.min(1, (0.5 * (y0 - y2)) / denom)) : 0;
  const degrees = (bestCol + shift) * TH - LIMIT;

  // HOW LONG THE WINNING LINE IS, in frames. Two measures were tried and both
  // were useless, for opposite reasons that are worth keeping:
  //
  //   - a SHARE OF THE FRAME'S EDGE WEIGHT scored eight real woodland frames
  //     between 0.0002 and 0.003 whether or not anything in them was straight,
  //     because foliage contributes an enormous total and a horizon is one thin
  //     line across it;
  //   - a RATIO TO THE AVERAGE CELL made a smooth gradient with no edges at all
  //     the most confident frame of the lot at 140, because when almost nothing
  //     is accumulated the average cell is almost nothing.
  //
  // The question is not what share of the picture the line holds or how it
  // compares to an average. It is whether there is a long straight thing in the
  // frame — so count the pixels lying on it, against the frame's own long edge.
  // A horizon right across a frame scores about 1; a hedge scores a twentieth.
  const onLine = bestCnt[bestCol * rows + bestRow - 1] + bestCnt[bestCol * rows + bestRow] + bestCnt[bestCol * rows + bestRow + 1];
  const agreement = onLine / Math.max(w, h);
  if (agreement < FLOOR) return null; // no line dominates — say nothing rather than guess
  return { degrees, agreement };
}
