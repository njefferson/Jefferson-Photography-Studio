#!/usr/bin/env node
// A QUARTER-TURN IS VIEW STATE AND HAS TO SURVIVE LEAVING THE PHOTO. It did not:
// showDecoded set rotation from EXIF on every open, so a turned portrait frame
// came back landscape. Reset must leave the turn alone — it is not part of the
// edit — and a photo never turned must open as the camera wrote it.
//
// MOVED IN FROM THE SESSION SCRATCHPAD, 2026-09-14. It was rebuilt there before
// each release and held nowhere, so a session that did not know it existed
// shipped without it and a container going away took it with it. Four walks were
// in this directory and roughly eighteen were not, including the export gate.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/rotation-walk.mjs [--port=8131] [--shots=DIR]
//
// --shots writes every picture checks 8-15 compare into DIR, so a number that
// says two pictures differ can be opened and looked at.
//
//   npm install --no-save esbuild playwright-core axe-core
//
// NOT in .branch-guard's `also=`: it drives a real browser and decodes RAW
// files. Run it before a release, or through tools/walk-all.mjs.
// A QUARTER-TURN MUST STAY TURNED. Rotation and flip are view state and were
// never stored, so leaving a photo and coming back put it back the way the
// camera wrote it — and a bulk export would then disagree with what was seen.
import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const URL_IR = `http://127.0.0.1:${PORT}/ir.html`;
const SHOTS = (process.argv.find((a) => a.startsWith("--shots=")) || "").split("=").slice(1).join("=");
const DIR = "/home/user/Jefferson-Photography-Studio/public/examples";
const THREE = ["canopy.dng","hillside.dng","lodge.dng"].map(f=>`${DIR}/${f}`);
let failed=0; const check=(n,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)failed++;console.log(`${ok?"ok  ":"FAIL"}  ${n}\n        got ${JSON.stringify(g)} want ${JSON.stringify(w)}`);};

// ─── THE LOOK'S SKY FOLLOWS WHICH WAY IS UP (decision 070) ───────────────────
// The look's own sky selection was built at turn 0 whatever the picture was
// shown at, so on a photograph turned on its side it was seeded from a side of
// the picture. A check of that needs a picture whose right answer is known on
// EVERY build, and a number the app prints would only say what the app thinks.
// So these checks compare two FILES THAT SHOW THE SAME PICTURE: NIR_1651 stored
// upright, against the same frame reached through a turn or a mirror. The
// practice DNGs are uncompressed CFA with the geometry in three tags, and the
// half-size bin a raw opens at maps each 2x2 quad onto a quad under a quarter
// turn or a mirror, so the twins decode to the same pixels turned. What is left
// between them is the app's own handling of which edge is up — which is the
// thing under test — plus grid rounding in the sky detector, measured below.
//
//   upright   the frame's pixels turned so it opens the right way up (turn 0)
//   turned    the ORIGINAL pixels, tagged to open upside down (turn 2): one
//             press of Rotate puts it the right way up by hand
//   mirrored  the upright pixels mirrored top to bottom (turn 0): one press of
//             Flip vertical puts it the right way up
//   NIR_1651  as shipped, stored turned (Orientation 8, turn 3)
//
// Built fresh from the tracked file into a temporary directory on every run and
// removed afterwards; nothing binary is committed for this.
function makeTwins(src) {
  const b = readFileSync(src);
  if (b.toString("latin1", 0, 2) !== "II") throw new Error("the twin maker reads little-endian DNGs only");
  const ifd = b.readUInt32LE(4), n = b.readUInt16LE(ifd);
  const ent = {};
  for (let i = 0; i < n; i++) { const p = ifd + 2 + i * 12; ent[b.readUInt16LE(p)] = { p, type: b.readUInt16LE(p + 2) }; }
  const want = { 256: 4, 257: 4, 259: 3, 273: 4, 274: 3, 278: 4, 279: 4, 33422: 1 };
  for (const [t, ty] of Object.entries(want)) if (ent[t]?.type !== ty) throw new Error(`the twin maker needs tag ${t} as type ${ty}; this file is not the shape it was written for`);
  const val = (t) => (ent[t].type === 3 ? b.readUInt16LE(ent[t].p + 8) : b.readUInt32LE(ent[t].p + 8));
  const W = val(256), H = val(257), off = val(273), len = val(279);
  if (val(259) !== 1 || len !== W * H * 2 || val(278) < H || W % 2 || H % 2) throw new Error("the twin maker needs one uncompressed 16-bit strip with even sides");
  const O = new Uint16Array(b.buffer.slice(b.byteOffset + off, b.byteOffset + off + len));
  const P = [...b.subarray(ent[33422].p + 8, ent[33422].p + 12)]; // [tl, tr, bl, br]
  const dir = mkdtempSync(join(tmpdir(), "rotation-walk-070-"));
  const write = (name, w, h, pat, orient, at) => {
    const out = Buffer.from(b);
    out.writeUInt32LE(w, ent[256].p + 8); out.writeUInt32LE(h, ent[257].p + 8); out.writeUInt32LE(h, ent[278].p + 8);
    out.writeUInt16LE(orient, ent[274].p + 8);
    for (let k = 0; k < 4; k++) out[ent[33422].p + 8 + k] = pat[k];
    const px = new Uint16Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = at(x, y);
    Buffer.from(px.buffer).copy(out, off);
    const path = join(dir, name);
    writeFileSync(path, out);
    return path;
  };
  // Orientation 8 shows image pixel (W-1-dy, dx) at display (dx, dy); taking
  // exactly that pixel lays the frame out upright, and the CFA phase follows it.
  const up = (dx, dy) => O[dx * W + (W - 1 - dy)];
  const Q = [0, 1, 2, 3].map((k) => { const r = k >> 1, c = k & 1; return P[c * 2 + ((W - 1 - r) & 1)]; });
  const upright = write("070a-upright.dng", H, W, Q, 1, up);
  const turned = write("070b-turned.dng", W, H, P, 3, (x, y) => O[y * W + x]);
  const QV = [0, 1, 2, 3].map((k) => { const r = k >> 1, c = k & 1; return Q[((W - 1 - r) & 1) * 2 + c]; });
  const mirrored = write("070c-mirrored.dng", H, W, QV, 1, (x, y) => up(x, W - 1 - y));
  // The upright copy again under another name, so one of the two can stay
  // unopened while the other is the reference.
  const again = write("070d-upright-again.dng", H, W, Q, 1, up);
  // A MADE FRAME WITH ONE STRAIGHT EDGE, 4 degrees off level: bright above,
  // dark below, the same value on every photosite so the CFA phase is moot.
  // SOFT, over 40 photosites: a hard edge on a pixel grid is a staircase of
  // level runs, and Level's per-pixel angle vote read that as 0 degrees (run on
  // `findTilt` directly: 0 at agreement 0.33 hard, 4.0 at 1.7 to 8.7 soft).
  const t4 = Math.tan((4 * Math.PI) / 180);
  const horizon = write("070e-horizon.dng", W, H, P, 1, (x, y) => {
    const k = Math.min(1, Math.max(0, 0.5 + (y - (H / 2 + t4 * (x - W / 2))) / 40));
    return Math.round(9000 + (2600 - 9000) * k);
  });
  return { dir, upright, turned, mirrored, again, horizon };
}
/** The picture on screen, averaged into a fixed grid of cells, read from the
 *  canvas the reader is looking at. A grid rather than pixels, so two canvases
 *  a pixel apart in size still compare cell for cell. */
const CELLS = [40, 60];
const viewGrid = (p) => p.evaluate(([C, R]) => {
  const cv = document.querySelector("#view");
  const g = cv.getContext("webgl2") || cv.getContext("webgl");
  const W = cv.width, H = cv.height, px = new Uint8Array(W * H * 4);
  g.readPixels(0, 0, W, H, g.RGBA, g.UNSIGNED_BYTE, px);
  const sum = new Float64Array(C * R * 3), n = new Float64Array(C * R);
  for (let y = 0; y < H; y++) {
    const cy = Math.min(R - 1, Math.floor(((H - 1 - y) * R) / H)); // GL rows run bottom-up
    for (let x = 0; x < W; x++) {
      const k = cy * C + Math.min(C - 1, Math.floor((x * C) / W)), i = (y * W + x) * 4;
      sum[k * 3] += px[i]; sum[k * 3 + 1] += px[i + 1]; sum[k * 3 + 2] += px[i + 2]; n[k]++;
    }
  }
  return { size: `${W}x${H}`, cells: Array.from(sum, (v, i) => v / Math.max(1, n[Math.floor(i / 3)])) };
}, CELLS);
/** The same grid over a strip tile's own picture. */
/** Coarser than the view's: a tile is 173 px across and point-sampled, so on
 *  4 px cells the two layouts' sampling lands a few source pixels apart and the
 *  foliage's texture alone read 14.7% of cells off between two tiles that look
 *  the same; on 17 px cells the same pair reads 0.0%. */
const TILE_CELLS = [10, 15];
const tileGrid = (p, i) => p.evaluate(async ([i, C, R]) => {
  const im = document.querySelectorAll("#sessionThumbs .session-thumb")[i]?.querySelector("img");
  if (!im) return null;
  await im.decode().catch(() => {});
  const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext("2d"); g.drawImage(im, 0, 0);
  const W = c.width, H = c.height, px = g.getImageData(0, 0, W, H).data;
  const png = c.toDataURL("image/png");
  const sum = new Float64Array(C * R * 3), n = new Float64Array(C * R);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = Math.min(R - 1, Math.floor((y * R) / H)) * C + Math.min(C - 1, Math.floor((x * C) / W)), q = (y * W + x) * 4;
    sum[k * 3] += px[q]; sum[k * 3 + 1] += px[q + 1]; sum[k * 3 + 2] += px[q + 2]; n[k]++;
  }
  return { size: `${W}x${H}`, src: im.getAttribute("src"), png, cells: Array.from(sum, (v, j) => v / Math.max(1, n[Math.floor(j / 3)])) };
}, [i, ...TILE_CELLS]);
/** How far apart two grids are: the share of cells whose worst channel moved
 *  by more than CELL_STEP levels, and the mean of that worst channel. */
const CELL_STEP = 12;
function gridDiff(a, b) {
  let over = 0, sum = 0;
  const N = a.cells.length / 3;
  for (let k = 0; k < N; k++) {
    const d = Math.max(Math.abs(a.cells[k * 3] - b.cells[k * 3]), Math.abs(a.cells[k * 3 + 1] - b.cells[k * 3 + 1]), Math.abs(a.cells[k * 3 + 2] - b.cells[k * 3 + 2]));
    sum += d; if (d > CELL_STEP) over++;
  }
  return { over: over / N, mean: sum / N };
}
/** Wait until the canvas stops changing: the sky worker's pair lands a moment
 *  after the picture, and a read before it measures the frame without it. */
async function settleView(p) {
  await p.waitForTimeout(1500);
  let last = "", same = 0;
  for (let i = 0; i < 80; i++) {
    const h = await p.evaluate(() => { const cv = document.querySelector("#view"); const g = cv.getContext("webgl2") || cv.getContext("webgl"); const b = new Uint8Array(cv.width * cv.height * 4); g.readPixels(0, 0, cv.width, cv.height, g.RGBA, g.UNSIGNED_BYTE, b); let h = 2166136261; for (let k = 0; k < b.length; k += 4 * 7) { h ^= b[k] ^ (b[k + 1] << 8) ^ (b[k + 2] << 16); h = Math.imul(h, 16777619); } return `${cv.width}x${cv.height}:${h >>> 0}`; });
    if (h === last) { if (++same >= 3) return true; } else { same = 0; last = h; }
    await p.waitForTimeout(300);
  }
  return false;
}
/** Keep what was compared, when --shots names a directory. */
async function keep(name, p, tile) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  if (tile?.png) writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(tile.png.split(",")[1], "base64"));
  else if (p) await p.locator("#view").screenshot({ path: join(SHOTS, `${name}.png`) });
}
/** What Restore depth wrote into the edit, off the sliders the reader has. */
const liftRead = (p) => p.evaluate(() => ["skySatSel", "folSat", "skySat"].map((id) => Number(document.getElementById(id).value)));
/** The photo's shape on screen is the honest read of a quarter turn: a turned
 *  landscape frame is taller than it is wide. Reading a renderer field would
 *  test the variable rather than the picture. */
const shape = (p) => p.evaluate(() => {
  const c = document.querySelector("#stage canvas");
  const r = c.getBoundingClientRect();
  return r.width > r.height ? "landscape" : "portrait";
});
async function openSet(p, files) {
  await p.setInputFiles("#file", files);
  await p.waitForFunction((n)=>document.querySelectorAll("#sessionThumbs .session-thumb").length===n, files.length, {timeout:300000});
  await p.waitForFunction(()=>{const t=[...document.querySelectorAll("#sessionThumbs .session-thumb")];return t.every(x=>!x.disabled);},null,{timeout:300000});
  await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});
}
async function stepTo(p, i) {
  await p.evaluate((n)=>document.querySelectorAll("#sessionThumbs .session-thumb")[n].click(), i);
  await p.waitForFunction((n)=>document.querySelectorAll("#sessionThumbs .session-thumb")[n]?.classList.contains("active"), i, {timeout:300000});
  await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});
}
/** Step to the photograph with this file name. The strip sorts a set by name,
 *  so a position is not a photograph; the name is. */
async function stepToName(p, name) {
  const i = await p.evaluate((n) => [...document.querySelectorAll("#sessionThumbs .session-thumb")].findIndex((t) => (t.title || "").startsWith(n)), name);
  if (i < 0) throw new Error(`no photograph named ${name} in the strip`);
  await stepTo(p, i);
  return i;
}
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  p.on("pageerror", e => { console.log("FAIL  page error: " + e.message); failed++; });
  p.on("dialog", d => d.accept());
  await p.goto(URL_IR);
  await openSet(p, THREE);

  const asOpened = await shape(p);
  await p.click("#ptab-crop");
  await p.click("#rotateBtn");
  await p.waitForTimeout(400);
  const turned = await shape(p);
  check("1 a quarter turn changes the shape on screen", turned !== asOpened, true);

  await stepTo(p, 1);
  await stepTo(p, 0);
  check("2 and it is still turned when you come back", await shape(p), turned);

  // A turn is view state, not an edit: it must not ride a saved look or leave
  // an undo step behind that Reset would have to undo.
  await p.click("#resetBtn").catch(()=>{});
  await p.waitForTimeout(300);
  check("3 Reset leaves the turn alone — it is not part of the edit", await shape(p), turned);

  // And a reload, which rebuilds from the stored copy rather than memory.
  await p.reload();
  await p.waitForSelector("#resumeSession:not([hidden])", { timeout: 120000 });
  await p.click("#resumeSession");
  await p.waitForFunction(()=>document.querySelectorAll("#sessionThumbs .session-thumb").length===3,null,{timeout:300000});
  await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"),null,{timeout:300000});
  check("4 and after a reload too", await shape(p), turned);

  // A photo never turned is untouched.
  await stepTo(p, 2);
  check("5 a photo you never turned opens as the camera wrote it", await shape(p), asOpened);

  // 6 — STRAIGHTEN, THEN RESET, GIVES THE PICTURE BACK. Moving the angle
  // re-fits the view to the smaller inscribed crop; Reset restored the angle
  // and the crop and left the VIEW at that zoom, so the full frame came back
  // drawn small with empty margins round it (reported from a PC with a
  // screenshot, 2026-09-19). Read as the canvas's own backing size, which is
  // what the view fit sets: armed, tilted, and back.
  const drawn = () => p.evaluate(() => { const cv = document.querySelector("#view"); return `${cv.width}x${cv.height}`; });
  await p.click("#ptab-crop");
  await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /^Straighten$/i.test((x.textContent || "").trim())); b?.click(); });
  await p.waitForFunction(() => !document.getElementById("cropTools")?.hidden, null, { timeout: 30000 });
  await p.waitForTimeout(700);
  const armedSize = await drawn();
  await p.evaluate(() => { const el = document.getElementById("straighten"); el.value = "7"; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
  await p.waitForTimeout(700);
  const tiltedSize = await drawn();
  check("6 a straighten shrinks the frame it keeps", tiltedSize !== armedSize, true);
  await p.click("#cropReset");
  await p.waitForTimeout(700);
  check("7 and Reset gives the whole picture back, not the tilted window", await drawn(), armedSize);
  await p.click("#cropDone");

  await ctx.close();

  // ─── 8–17: WHICH EDGE IS UP (decision 070) ─────────────────────────────────
  // Every picture comparison is against the upright copy opened as it is,
  // which no build has got wrong. The bounds were set by measuring the build
  // this was written against (a62f28f) and the one that fixed it, 2026-09-27:
  //   views 9, 10, 15   23.6% of cells off before, 0.0% after (mean 0.92)
  //   view 11 (flip)    30.9% before, 0.0% after (mean 0.73)
  //   tile 8            22.7% before, 0.0% after (mean 2.33)
  //   lift 16, 17       sky saturation 0 against 0.11 before, 0.09 after
  // so 3% of cells sits far from both, and 0.03 sits between 0.02 and 0.11.
  // Each picture was opened, not only counted: before the fix the flipped copy
  // showed the whole sky grey with a red blob at the foot of the tree, where
  // the look had taken the bottom of the picture as its sky.
  const VIEW_MAX = 0.03, TILE_MAX = 0.03, LIFT_TOL = 0.03;
  const tw = makeTwins(`${DIR}/NIR_1651.dng`);
  const NIR = `${DIR}/NIR_1651.dng`;
  const NU = "070a-upright.dng", NT = "070b-turned.dng", NM = "070c-mirrored.dng", NU2 = "070d-upright-again.dng", NH = "070e-horizon.dng", NN = "NIR_1651.dng";
  const resume = async (q, n) => {
    await q.reload();
    await q.waitForSelector("#resumeSession:not([hidden])", { timeout: 120000 });
    await q.click("#resumeSession");
    await q.waitForFunction((k) => document.querySelectorAll("#sessionThumbs .session-thumb").length === k, n, { timeout: 300000 });
    await q.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
  };
  const press = (q, id) => q.evaluate((i) => document.getElementById(i).click(), id);
  const thumbIndex = (q, name) => q.evaluate((n) => [...document.querySelectorAll("#sessionThumbs .session-thumb")].findIndex((t) => (t.title || "").startsWith(n)), name);
  try {
    // A — RESTORE DEPTH OFF, so two pictures differ only where the look's own
    // sky stages act, and a lift solved at one turn cannot ride into another.
    const ctxA = await b.newContext({ viewport: { width: 1280, height: 950 } });
    await ctxA.addInitScript(() => { try { localStorage.setItem("ips-autolift", "0"); } catch { /* the walk then measures with it on, and says so below */ } });
    const a = await ctxA.newPage();
    a.on("pageerror", e => { console.log("FAIL  page error: " + e.message); failed++; });
    a.on("dialog", d => d.accept());
    await a.goto(URL_IR);
    await openSet(a, [tw.upright, NIR, tw.turned, tw.mirrored, tw.again, tw.horizon]);
    console.log(`\n  070 twins in ${tw.dir}; Restore depth ${await a.evaluate(() => document.getElementById("irLift").getAttribute("aria-pressed"))} for 8-15`);
    await stepToName(a, NU);
    await press(a, "lookEir");
    await settleView(a);
    const ref = await viewGrid(a);
    await keep("09-upright-copy", a);
    const sameView = (name, got) => {
      const d = gridDiff(ref, got);
      check(`${name}\n        ${(d.over * 100).toFixed(1)}% of cells off by more than ${CELL_STEP} levels (bound ${VIEW_MAX * 100}%), mean ${d.mean.toFixed(2)}, canvas ${got.size} against ${ref.size}`, d.over <= VIEW_MAX, true);
    };

    // 8 — THE TILE. A tile is laid out at the file's own turn and is a claim
    // about what opening the photograph shows, so NIR_1651's tile has to carry
    // the sky the upright copy's does. BOTH READ BEFORE EITHER IS OPENED, so
    // both were drawn the same way — under the look just pressed, from the
    // photograph's own measurements — and the turn is the only difference.
    const i2 = await thumbIndex(a, NU2), inn = await thumbIndex(a, NN), iu = await thumbIndex(a, NU);
    let lastSrc = "", steady = 0;
    for (let i = 0; i < 120 && steady < 6; i++) {
      const s = await a.evaluate((ks) => ks.map((k) => { const t = document.querySelectorAll("#sessionThumbs .session-thumb")[k]; return `${t?.classList.contains("provisional")}|${t?.querySelector("img")?.getAttribute("src")}`; }).join(","), [i2, inn]);
      if (s === lastSrc && !s.includes("true|")) steady++; else { steady = 0; lastSrc = s; }
      await a.waitForTimeout(500);
    }
    const t0 = await tileGrid(a, i2), t1 = await tileGrid(a, inn);
    await keep("08-tile-upright-copy-unopened", null, t0);
    await keep("08-tile-nir1651-unopened", null, t1);
    await keep("08-tile-upright-copy-open", null, await tileGrid(a, iu));
    const td = t0 && t1 ? gridDiff(t0, t1) : { over: 1, mean: NaN };
    check(`8 a tile of the turned photograph shows the sky the upright copy's tile shows\n        ${(td.over * 100).toFixed(1)}% of cells off by more than ${CELL_STEP} levels (bound ${TILE_MAX * 100}%), mean ${td.mean.toFixed(2)}, tiles ${t1?.size} against ${t0?.size}${steady >= 6 ? "" : ", NEVER SETTLED"}`, steady >= 6 && td.over <= TILE_MAX, true);

    await stepToName(a, NN);
    await settleView(a);
    await keep("09-nir1651-as-stored", a);
    sameView("9 the look's sky follows the turn the file stores: NIR_1651 as shipped shows what its upright copy shows", await viewGrid(a));

    await stepToName(a, NT);
    await press(a, "rotateBtn");
    await settleView(a);
    await keep("10-turned-copy-rotated", a);
    sameView("10 and a quarter-turn by hand: the copy stored upside down, turned once, shows the same", await viewGrid(a));

    await stepToName(a, NM);
    await press(a, "flipVBtn");
    await settleView(a);
    await keep("11-mirrored-copy-flipped", a);
    sameView("11 and a vertical flip: the copy stored mirrored, flipped back, shows the same", await viewGrid(a));

    // 12 — A NEW GRADIENT STARTS AT THE TOP OF THE PICTURE AS SHOWN. Read off
    // the line the reader is shown, as a fraction of the picture.
    await stepToName(a, NN);
    await press(a, "addLinear");
    await a.waitForTimeout(500);
    const line = await a.evaluate(() => {
      const ln = document.querySelector("line.mask-line");
      const sv = ln?.ownerSVGElement?.getBoundingClientRect(), cv = document.querySelector("#view").getBoundingClientRect();
      if (!ln || !sv || !ln.getAttribute("x1")) return null;
      const at = (x, y) => [+(((sv.left + Number(ln.getAttribute(x)) - cv.left) / cv.width).toFixed(2)), +(((sv.top + Number(ln.getAttribute(y)) - cv.top) / cv.height).toFixed(2))];
      return { start: at("x1", "y1"), end: at("x2", "y2") };
    });
    check(`12 a new Gradient on the turned photograph starts at the top as shown and fades downward\n        start ${JSON.stringify(line?.start)} end ${JSON.stringify(line?.end)} (want start near [0.5, 0.12], end below it)`,
      !!line && Math.abs(line.start[0] - 0.5) < 0.05 && Math.abs(line.start[1] - 0.12) < 0.05 && Math.abs(line.end[0] - 0.5) < 0.05 && line.end[1] > line.start[1] + 0.2, true);
    await press(a, "undoBtn"); // the photograph keeps no mask it did not ask for
    await a.waitForTimeout(400);

    // 13 — LEVEL THE HORIZON UNDER A MIRROR. `findTilt` reads the file's own
    // pixels and the straighten is applied to the picture as shown, so a
    // left-right mirror has to turn the answer's sign. A CHECK ONLY: nothing in
    // decision 070 touches it. On a made frame with one straight edge 4 degrees
    // off level, because Level declines in words on a frame with no long
    // straight edge, and the practice frames tried here are all of that kind.
    await stepToName(a, NH);
    const level = async () => {
      await press(a, "levelBtn");
      await a.waitForTimeout(700);
      return a.evaluate(() => `${Number(document.getElementById("straighten").value)}° ("${document.getElementById("levelNote")?.textContent ?? ""}")`);
    };
    const unlevel = () => a.evaluate(() => { const el = document.getElementById("straighten"); el.value = "0"; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
    const lv0 = await level(); await unlevel(); await a.waitForTimeout(300);
    await press(a, "flipHBtn");
    const lv1 = await level(); await unlevel(); await a.waitForTimeout(300);
    await press(a, "flipHBtn");
    const lvA = parseFloat(lv0), lvB = parseFloat(lv1);
    check(`13 Level the horizon turns the other way on a mirrored picture\n        ${lv0} as shown\n        ${lv1} mirrored left to right (want the same size, opposite sign)`, lvA !== 0 && Math.abs(lvB + lvA) <= 0.15, true);

    // 14 — UNDO AFTER ROTATE. The re-detection a turn makes is a change to the
    // mask and settles into history; stepping back over it must not bring back
    // a sky found for the turn the picture is no longer shown at. Read off the
    // mask's own status line, which counts what the reader has selected.
    await stepToName(a, NU);
    const status = () => a.evaluate(() => document.getElementById("mSkyStatus")?.textContent ?? "");
    await press(a, "addSky");
    await a.waitForTimeout(900);
    const s0 = await status();
    await press(a, "rotateBtn");
    await a.waitForTimeout(1500); // the re-detection, then the 350 ms an edit takes to settle into history
    const s1 = await status();
    await press(a, "undoBtn");
    await a.waitForTimeout(900);
    const s2 = await status();
    await press(a, "redoBtn");
    await a.waitForTimeout(900);
    const s3 = await status();
    check(`14 Undo and Redo after Rotate keep the Sky mask found for the turn shown\n        before the turn "${s0}"\n        after it "${s1}"\n        after Undo "${s2}"\n        after Redo "${s3}"`, s1 !== s0 && s2 === s1 && s3 === s1, true);

    // 15 — A TURN THE SAVED EDIT BRINGS BACK. The copy stored upside down was
    // turned by hand in 10; after a reload it opens at the file's turn and the
    // saved edit puts the reader's turn back over it.
    await stepToName(a, NN);
    await resume(a, 6);
    await stepToName(a, NT);
    await settleView(a);
    await keep("15-turned-copy-after-reload", a);
    sameView("15 and after a reload, the turn the saved edit restores puts the look's sky at the top as well", await viewGrid(a));
    await ctxA.close();

    // B — RESTORE DEPTH ON. The lift measures the sky's colour by place and
    // writes what it solves into the edit, so the values on its sliders are
    // the honest read of which sky it measured. UNDER PINK IR, as a STANDING
    // look: Aerochrome's own Sky saturation already sits near the slider's cap
    // and the lift tops it up to the cap on this frame whichever sky it
    // measured, so it cannot show the difference; and a standing look is the
    // one a reload opens on, which Reset's target after a resume is built under.
    const ctxB = await b.newContext({ viewport: { width: 1280, height: 950 } });
    await ctxB.addInitScript(() => { try { localStorage.setItem("ips-autolift", "1"); localStorage.setItem("ips-default-look", "aero"); } catch { /* the checks below then fail and say what they read */ } });
    const q = await ctxB.newPage();
    q.on("pageerror", e => { console.log("FAIL  page error: " + e.message); failed++; });
    q.on("dialog", d => d.accept());
    await q.goto(URL_IR);
    await openSet(q, [tw.upright, NIR, tw.turned]);
    await stepToName(q, NU);
    const L0 = await liftRead(q);
    const near = (x) => x.every((v, i) => Math.abs(v - L0[i]) <= LIFT_TOL);
    await stepToName(q, NN);
    const L1 = await liftRead(q);
    check(`16 Restore depth measures the sky that is shown: NIR_1651 as shipped is lifted as its upright copy is\n        sky saturation, foliage saturation, sky band saturation ${JSON.stringify(L1)} against ${JSON.stringify(L0)} (within ${LIFT_TOL})`, near(L1), true);
    await stepToName(q, NT);
    await press(q, "rotateBtn");
    await q.waitForTimeout(600);
    await stepToName(q, NU);
    await resume(q, 3);
    await stepToName(q, NT);
    await press(q, "resetBtn");
    await q.waitForTimeout(800);
    const L2 = await liftRead(q);
    check(`17 and after a reload that restores a turn, Reset returns to a lift solved at that turn\n        ${JSON.stringify(L2)} against ${JSON.stringify(L0)} (within ${LIFT_TOL})`, near(L2), true);
    await ctxB.close();
  } finally { rmSync(tw.dir, { recursive: true, force: true }); }
} finally { await b.close(); }
console.log(failed?`\n${failed} check(s) failed`:"\nall checks passed");
process.exit(failed?1:0);
