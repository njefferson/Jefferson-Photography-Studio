#!/usr/bin/env node
// THE AEROCHROME BUTTON SHIPS WHAT WAS APPROVED, STATED AS A TEST.
//
// The look was chosen off rendered sheets, and the sheets were NOT made by
// pressing this button. They were made by pressing Pink IR and then writing a
// solved nine-number matrix into the channel-mixer sliders. Everything between
// that recipe and `LOOKS.eir` is an opportunity to ship a different photograph
// under the approved name, and three of those opportunities are real:
//
//  - THE SWAP. The matrix was solved against anchors measured POST-SWAP, so it
//    is the second half of a two-step mapping. The look that preceded it -- the
//    film's bare three-channel rotation -- needed the swap OFF, and that is the
//    value `LOOKS.eir` carried. Flip it and the nine numbers act on an input
//    they were never solved for, with nothing going red.
//  - THE STEP. The mixer sliders are `min -2 max 2 step 0.01`, so writing
//    0.991 into one leaves 0.99 behind. The sheets came through those sliders,
//    so the SNAPPED numbers are the approved ones. Check 2 reads the nine
//    values back out of the DOM rather than trusting the spec about that.
//  - THE DENOISE. It is a per-shot correction that no look had ever touched,
//    and it is a FLOOR over the photograph's own measurement rather than a
//    setting. Checks 5-6 cover the floor and both directions of leaving it,
//    ON A FRAME THE FLOOR BINDS ON -- see FLOOR_RAW, which is the thing this
//    walk got wrong: it compared the frame's measurement against its own copy
//    of the floor, so when the floor moved below that measurement the control
//    kept printing ok while the check under it asserted nothing.
//  - THE LOCAL CONTRAST. The other half of the same decision: the floor cleans
//    the sky and flattens the canopy, so the look brings a mid-frequency
//    contrast amount to give the modelling back. Checks 4a-d cover it in both
//    directions, and check 7's recipe arm drives it through the reader's own
//    slider, which is what makes the equivalence a real claim.
//
// Checks 10a-c are now the ones that matter most: the look's two populations
// land on the angles measured off real Aerochrome (IR-SCIENCE.md 4b-iii), and
// stay apart. 10c looks redundant and is not -- a global hue shift puts the
// foliage exactly on target and MERGES the populations, so a check on position
// alone would pass the one candidate that is most obviously not the film.
//
// Checks 7 and 8 render the shipped look, hash the canvas, then reproduce the
// whole recipe BY HAND on a second page and hash again. The recipe now includes
// the eight band shifts, driven through the reader's own chips and slider --
// which is also how check 11's claim is earned rather than asserted.
//
// WITH RESTORE DEPTH OFF THEY ARE BYTE-IDENTICAL, and that is check 7 -- the
// mapping, the swap and the denoise floor all ship exactly as they were
// approved.
//
// WITH IT ON THEY MUST NOT BE, and that is check 8, which looks backwards and
// is not. `applyLook` re-solves the lift against the look now on the frame --
// deliberately, so Aerochrome looks like Aerochrome on a frame with no sky in
// it without a second press -- and the recipe route never re-solved it, because
// writing numbers into the mixer sliders is not pressing a look. So the
// approved sheets carry a lift solved for PINK IR while the shipped button
// carries one solved for the matrix. Two consequences, both stated rather than
// assumed: the shipped look is not pixel-for-pixel the sheet, which is why it
// was re-rendered and shown again; and a build where these two hashes MATCHED
// would be one where the re-solve had stopped happening, which is the
// regression this check exists to catch.
//
// Check 9 asserts that leaving the look on a photograph you have come back to
// hands back THAT photograph's measurement, not the one before it -- with 9a as
// the control that the two frames measure differently enough (0.46 and 0.22,
// the widest gap on the practice shelf) for 9b to mean anything.
//
// IT DOES NOT PROVE THE SNAPSHOT CARRY, AND THAT IS SAID HERE BECAUSE IT WAS
// ASSUMED ONCE. `restoreLiveEdit` restores a photograph's live edit WITHOUT
// re-running `establishFreshEdit`, so the remembered measurement can belong to
// whichever frame was last opened fresh; the two denoise facts now ride the
// snapshot beside the look's white balance, which rides it for the same reason.
// The plant that removes that restore from the built bundle leaves this check
// GREEN -- on the route below the app takes the fresh-open branch and
// re-measures anyway. So the carry is a correctness fix with a comment and no
// test, and the route that would exercise it has not been found yet.
//
// NOT COVERED HERE: the batch path's floor (`batchParamsFor`). It is not
// reachable from the page, and the comparison that would reach it -- batch
// output against the screen -- differs for a second reason already on the
// books, the unconditional gray-world balance. Said out loud rather than
// asserted weakly.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/aerochrome-walk.mjs
//
// Drives a real browser and decodes a RAW, so it is not in .branch-guard's
// `also=`. Run it before a release, or through tools/walk-all.mjs.
import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";

const PORT = (process.argv.find(a => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const EX = "/home/user/Jefferson-Photography-Studio/public/examples/";
const RAW = EX + "NIR_0063.dng";
// TWO FRAMES FOR CHECK 9, and check 9a is the control that says they are
// different enough for it to mean anything.
// Measured across the ten bundled practice raws: 0.46 and 0.22, the widest gap
// on the shelf. NIR_0102 was the first pick and reads 0.55 -- close enough to
// 0.46 that a stepTo which had not actually moved yet looked like agreement.
const PAIR = [EX + "NIR_0063.dng", EX + "NIR_0627.dng"];

// The approved arm, exactly as it was driven on the sheets.
const MATRIX = [0.99, -0.06, 0.07, -1.44, 1.37, 1.02, -0.47, 0.81, 0.65];
// The denoise floor and the local contrast that gives back what the floor
// costs. Two halves of one decision, so they are read as a pair: 0.80 flattened
// the canopy (texture 30.78 against 40.15 with the denoiser off) and 0.45 with
// 0.25 of mid-frequency contrast recovers 48% of that for 6.2% of the sky's
// speckle gain. See Look.texture in src/main.ts.
const FLOOR = 0.45;
const TEXTURE = 0.25;
// The sky's colour smoothing the look carries — the one stage that acts
// AFTER the amplification and only inside the sky (IR-SCIENCE 4c-xxi's open
// question, 9k's measurement). Measured on the frames that have the defect:
// Aerochrome's sky 15.9 -> 4.7 where Pink IR reads 8.7, mean colour held.
const SKY = 1;
// AND THE SKY'S DEPTH — the value half of the same solve (IR-SCIENCE 4b-iv,
// 4b-v): one luma multiplier through the sky bitmap refined to the
// photograph's edges and the map's own keying, so a grey, a cloud, the ground
// and an overcast sky are left alone. THE LOOK SHIPS IT AT 0 (decision 017,
// outcome part three): judged on the device, a daylight sky taken to the
// film's value reads as night. The slider stays, and 10e proves it still works.
const DEPTH = 0;
// 10e: the Sky depth slider, set to DEPTH_TRY after the Look press, must take
// the sky's mean HSV value (the population 10b measures) down by at least
// SKY_VAL_DROP_MIN. MADE TO FAIL FIRST, 2026-09-18: on this frame the value
// reads 0.878 at depth 0 and 0.500 at 0.5, a drop of 0.378; the floor sits
// well under that and far above the 0.000 a build whose stage has gone
// inert would read (the depth keys on the sky's rendered chroma, and a look
// that moves that chroma out of the key's window silences the stage).
const DEPTH_TRY = 0.5;
const SKY_VAL_DROP_MIN = 0.25;
// THE FLOOR CHECKS NEED A FRAME THE FLOOR ACTUALLY BINDS ON, which is why they
// do not use RAW. NIR_0063 measures 0.46 -- above the floor -- so `max(measured,
// FLOOR)` is just the measurement there and checks 4 and 5 would assert nothing
// while printing ok. That is exactly how this walk stayed green through the
// floor moving: check 0b compared the measurement against the walk's own stale
// constant. 0.22 is the lowest of the ten bundled practice raws.
const FLOOR_RAW = EX + "NIR_0627.dng";
// The film's own angles, measured off the source article's photographs
// (IR-SCIENCE.md 4b-iii). Check 10 holds the look to them.
const FILM = { fol: 6.2, sky: 204.0, sep: 197.8 };
const TOL = 12;      // degrees; hold-one-out worst error on the solve was 8
const MIN_SEP = 150; // a global hue shift collapses the two into one bin
// The eight band TRIPLETS the look declares — [hue shift, saturation, luminance]
// in HSL_CENTERS order (red, orange, yellow, green, aqua, blue, purple,
// magenta). Hue was solved onto the film's angles (IR-SCIENCE 4b-iii).
// Saturation and luminance are 1 in every band: the aqua and blue saturation
// power of 2 that 4b-iv put here (2.50.10) came off again in 019, because a
// power curve lifts the palest pixels most and coloured what had no colour.
// The look's saturation is the two per-colour bands below.
const BANDS = [[7, 1, 1], [0, 1, 1], [0, 1, 1], [54, 1, 1], [35, 1, 1], [0, 1, 1], [1, 1, 1], [43, 1, 1]];
const NEUTRAL = (t) => t[0] === 0 && t[1] === 1 && t[2] === 1;
// The reader's own sliders: Hue -60..60, Saturation 0..2, Luminance 0.3..1.7
// (ir.html). Every value the look declares must be reachable by hand.
const HUE_LIMIT = 60, SAT_RANGE = [0, 2], LUM_RANGE = [0.3, 1.7];
// 019: THE LOOK'S SATURATION BY POPULATION. Global Saturation 1 — the 3.0
// that used to colour every pixel is gone. The foliage's amount is the
// Colour tab's Foliage band (a population by what it is), a boost that
// pipeline.ts bandGain gates on the pixel's own chroma; the sky's amount is
// the Sky saturation slider beside Sky depth — where the sky IS, through
// the selection built at open, gated the same way so a cloud stays grey.
// Nothing without colour gains any. The amounts were chosen from rendered
// sheets (IR-SCIENCE 4b-vi). Sliders: Saturation 0..3, Foliage band 0..2,
// Sky saturation 0..2.
const GLOBAL_SAT = 1.0;
const FOL_SAT = 2.0;
const SKY_SAT = 1.0;
const GLOBAL_SAT_RANGE = [0, 3], BAND_SAT_RANGE = [0, 2];
// 10d: the sky's saturation on RAW after the Look press, mean HSV saturation of
// the same population 10b measures the angle of. MADE TO FAIL FIRST, 2026-09-18:
// the 2.50.7 look (both bands at saturation 1) read 0.393 here and the solved
// look reads 0.570; the floor sits 0.04 under the solved reading, so a band
// quietly reset to 1 fails this check while still passing 10b's angle.
// RE-MEASURED for 019's look (global saturation 1, the sky's amount on the sky
// saturation stage at 1.0, Restore depth OFF so the reading is the look's own):
// NIR_0063 reads 0.332 on the 2026-09-18 build with the bands aimed right, so
// the floor is 0.29 — 0.04 under it, as before. The 0.53 that stood here was
// the reading under global saturation 3 and went red the first time the walk
// ran on the new look, which is the check doing its job.
const SKY_SAT_MIN = 0.29;
// 10f: NOTHING WITHOUT COLOUR TAKES ANY (019). A pixel whose HSV saturation
// under the look's bare mapping (Sky and Foliage bands at 1) is under COL_LO
// must still read under COL_VISIBLE under the whole look, for all but
// COL_VISIBLE_MAX of them. MADE TO FAIL FIRST on the 2.50.10 build (global
// saturation 3 and the aqua/blue power curve): see the reading beside the
// check. Same two thresholds as the population instrument that chose them.
const COL_LO = 0.06, COL_VISIBLE = 0.15, COL_VISIBLE_MAX = 0.01;

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}`);
  console.log(`        got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  // A PAGE WITH A PHOTOGRAPH ON IT, from a clean context every time: the
  // session look is seeded out of localStorage, and a walk that inherited one
  // would be pressing a second look on top of a first.
  const open = async (file = RAW) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
    const p = await ctx.newPage();
    p.on("dialog", d => d.accept());
    await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
    await p.setInputFiles("#file", [file]);
    await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
    await p.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
    await settle(p);
    return { p, ctx };
  };

  // SETTLE ON THE PIXELS, never on a clock. Hash the canvas until two reads
  // agree; a timer would be a guess about a decode whose cost is the file's.
  async function settle(p) {
    let last = "", stable = 0;
    for (let i = 0; i < 80; i++) {
      const h = await hash(p);
      if (h === last) { if (++stable >= 2) return true; } else { stable = 0; last = h; }
      await p.waitForTimeout(200);
    }
    console.log("        (never settled -- the reading below is not trustworthy)");
    return false;
  }
  const hash = (p) => p.evaluate(() => {
    const cv = document.querySelector("#view");
    const g = cv.getContext("webgl2") || cv.getContext("webgl");
    const buf = new Uint8Array(cv.width * cv.height * 4);
    g.readPixels(0, 0, cv.width, cv.height, g.RGBA, g.UNSIGNED_BYTE, buf);
    let h = 2166136261;
    for (let k = 0; k < buf.length; k += 4) { h ^= buf[k]; h = Math.imul(h, 16777619); h ^= buf[k + 1]; h = Math.imul(h, 16777619); h ^= buf[k + 2]; h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  });

  // READ THE CONTROLS, not the internals: what the sliders hold is what the
  // reader can see and what the render is made of.
  const mixer = (p) => p.evaluate(() =>
    [...document.querySelectorAll("#mix3Grid input[type=range]")].map(e => Number(e.value)));
  const dn = (p) => p.evaluate(() => Number(document.getElementById("dn").value));
  const tex = (p) => p.evaluate(() => Number(document.getElementById("texture").value));
  const skyv = (p) => p.evaluate(() => Number(document.getElementById("skySmooth").value));
  const swap = (p) => p.evaluate(() =>
    document.getElementById("swapBtn")?.getAttribute("aria-pressed") === "true");
  const press = async (p, id) => {
    await p.evaluate(t => document.getElementById(t)?.click(), id);
    await settle(p);
  };
  const setSlider = async (p, id, v) => {
    await p.evaluate(([i, x]) => {
      const el = document.getElementById(i);
      el.value = String(x);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, [id, v]);
    await settle(p);
  };
  const setDn = (p, v) => setSlider(p, "dn", v);
  const setTex = (p, v) => setSlider(p, "texture", v);
  const setSky = (p, v) => setSlider(p, "skySmooth", v);
  const setDepth = (p, v) => setSlider(p, "skyDepth", v);
  const depthv = (p) => p.evaluate(() => Number(document.getElementById("skyDepth").value));
  const satv = (p) => p.evaluate(() => Number(document.getElementById("sat").value));
  const folv = (p) => p.evaluate(() => Number(document.getElementById("folSat").value));
  const skyBv = (p) => p.evaluate(() => Number(document.getElementById("skySatSel").value));

  // ---- 0. THE CONTROL. Without this every check below could pass on an
  // instrument that reads the same nine numbers whatever is pressed.
  const a = await open();
  const measured = await dn(a.p);
  check("0a  a fresh raw opens with the mixer at identity",
    await mixer(a.p), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  check("0b  its denoise is measured, and no look has touched it",
    measured > 0, true);
  check("0b2 ...and it opens with no local contrast on it", await tex(a.p), 0);

  await press(a.p, "lookAero");
  check("0c  Pink IR carries no mixer of its own",
    await mixer(a.p), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  check("0d  ...and does not touch the measured denoise", await dn(a.p), measured);
  check("0d2 ...nor the local contrast", await tex(a.p), 0);

  // ---- 1-3. THE SHIPPED LOOK.
  await press(a.p, "lookEir");
  check("1   Aerochrome turns the R<->B swap ON, which the matrix needs", await swap(a.p), true);
  check("2   the nine mixer values read back off the DOM as declared",
    await mixer(a.p), MATRIX);
  check("3   ...so every one of them survives the slider's 0.01 step",
    MATRIX.every(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9), true);
  check("4a  the look brings its local contrast with it", await tex(a.p), TEXTURE);
  check("4a2 ...and its sky colour smoothing", await skyv(a.p), SKY);
  check("4a3 ...and its sky depth", await depthv(a.p), DEPTH);
  // THE LOOK'S OWN AMOUNTS, read with Restore depth OFF: with it on, the lift
  // starts from these and tops them up per frame (019), so the slider can
  // read higher than the look declares and still be right.
  await press(a.p, "irLift");
  check("4a4 ...its global saturation of 1 (the colour goes where the colour is)", await satv(a.p), GLOBAL_SAT);
  check("4a5 ...the foliage band's own amount", await folv(a.p), FOL_SAT);
  check("4a6 ...and the sky's own amount, through the selection", await skyBv(a.p), SKY_SAT);
  await press(a.p, "lookAero");
  check("4b  ...and leaving it puts the photograph back to none", await tex(a.p), 0);
  check("4b2 ...the sky smoothing too", await skyv(a.p), 0);
  check("4b3 ...the sky depth too", await depthv(a.p), 0);
  check("4b4 ...the foliage band and the sky's amount too", [await folv(a.p), await skyBv(a.p)], [1, 0]);

  // A VALUE THE READER SET IS NOT OURS TO THROW AWAY, in either direction --
  // the same pair of claims the denoise floor carries below, and the reason
  // both use half a slider step rather than the 0.01 the slider moves in.
  await setTex(a.p, 0.6);
  await press(a.p, "lookEir");
  check("4c  a texture set by hand is not overwritten by the look", await tex(a.p), 0.6);
  await press(a.p, "lookAero");
  check("4d  ...and is not thrown away by leaving it either", await tex(a.p), 0.6);
  await a.ctx.close();

  // ---- 4-6. THE FLOOR, ON A FRAME IT BINDS ON. See FLOOR_RAW.
  const f = await open(FLOOR_RAW);
  const measuredFloor = await dn(f.p);
  check("5a  the floor frame measures BELOW the floor, or nothing below means anything",
    measuredFloor > 0 && measuredFloor < FLOOR, true);
  await press(f.p, "lookEir");
  check("5b  denoise is raised to the floor", await dn(f.p), Math.max(measuredFloor, FLOOR));
  await press(f.p, "lookAero");
  check("5c  leaving it puts the photograph's own measurement back", await dn(f.p), measuredFloor);

  // THE READER'S OWN VALUE IS NOT OURS TO THROW AWAY. One slider step away from
  // the measurement, which is the smallest deliberate move there is and the one
  // a 0.01 tolerance would have eaten.
  const byHand = Math.round((measuredFloor + 0.01) * 100) / 100;
  await setDn(f.p, byHand);
  await press(f.p, "lookEir");
  check("6a  a denoise set by hand is not raised by the look", await dn(f.p), byHand);
  await press(f.p, "lookAero");
  check("6b  ...and is not thrown away by leaving it either", await dn(f.p), byHand);
  await f.ctx.close();

  // ---- 7, 8. THE EQUIVALENCE, both ways round.
  //
  // The two arms differ by ONE act: one presses the button, the other presses
  // Pink IR and writes the nine numbers into the mixer by hand, which is
  // exactly how the sheets were made.
  const armShipped = async (liftOn) => {
    const { p, ctx } = await open();
    if (!liftOn) await press(p, "irLift");
    await press(p, "lookEir");
    await setDn(p, Math.max(measured, FLOOR));
    const h = await hash(p);
    await ctx.close();
    return h;
  };
  const armRecipe = async (liftOn) => {
    const { p, ctx } = await open();
    if (!liftOn) await press(p, "irLift");
    await press(p, "lookAero");
    await p.evaluate((m) => {
      const sl = document.querySelectorAll("#mix3Grid input[type=range]");
      m.forEach((v, i) => { const el = sl[i]; if (!el) return; el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true })); });
    }, MATRIX);
    await settle(p);
    // AND THE EIGHT BANDS, driven through the reader's own chips and slider.
    // Two things at once: the equivalence below stays a real claim now that the
    // look carries bands, AND every value the look declares is proved reachable
    // by hand. A look that puts the app somewhere its own controls cannot reach
    // is a state nobody can undo or understand.
    for (let b = 0; b < 8; b++) {
      if (NEUTRAL(BANDS[b])) continue;
      await p.evaluate((i) => document.querySelectorAll("#hslChips button")[i].click(), b);
      await p.evaluate((t) => {
        for (const [id, v] of [["hslHue", t[0]], ["hslSat", t[1]], ["hslLum", t[2]]]) {
          const el = document.getElementById(id);
          el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }, BANDS[b]);
    }
    await settle(p);
    // AND THE LOCAL CONTRAST, driven through the reader's own slider. Same two
    // claims the bands carry: the equivalence stays real now that the look
    // brings a texture amount, and that amount is proved reachable by hand.
    await setTex(p, TEXTURE);
    await setSky(p, SKY);
    await setDepth(p, DEPTH);
    // AND THE SATURATION, through the reader's own three sliders (019): the
    // global amount and the two bands. Pink IR left global saturation at 3.
    await setSlider(p, "sat", GLOBAL_SAT);
    await setSlider(p, "folSat", FOL_SAT);
    await setSlider(p, "skySatSel", SKY_SAT);
    await setDn(p, Math.max(measured, FLOOR));
    const h = await hash(p);
    await ctx.close();
    return h;
  };

  const bareShipped = await armShipped(false);
  const bareRecipe = await armRecipe(false);
  check("7   with Restore depth off, the button IS the approved recipe, byte for byte",
    bareShipped, bareRecipe);
  console.log(`        (canvas hash ${bareShipped})`);

  // ---- 10. THE TWO POPULATIONS LAND ON THE FILM. The check the whole band
  // solve exists to satisfy, and the one a global hue shift fails even while
  // putting the foliage exactly on target.
  {
    const { p, ctx } = await open();
    await press(p, "lookEir");
    const measurePops = (p) => p.evaluate(() => {
      const cv = document.querySelector("#view");
      const g = cv.getContext("webgl2") || cv.getContext("webgl");
      const W = cv.width, H = cv.height, b = new Uint8Array(W * H * 4);
      g.readPixels(0, 0, W, H, g.RGBA, g.UNSIGNED_BYTE, b);
      const fol = [], sky = [], skyS = [], skyV = [];
      const step = Math.max(1, Math.floor(Math.min(W, H) / 300));
      for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
        const i = ((H - 1 - y) * W + x) * 4, r = b[i], gg = b[i + 1], bb = b[i + 2];
        const mx = Math.max(r, gg, bb), mn = Math.min(r, gg, bb), d = mx - mn;
        if (mx < 26 || d / mx < 0.18) continue;
        let h; if (mx === r) h = ((gg - bb) / d) % 6; else if (mx === gg) h = (bb - r) / d + 2; else h = (r - gg) / d + 4;
        h = (((h * 60) % 360) + 360) % 360;
        if (h >= 300 || h < 60) fol.push(h); else if (h >= 140 && h <= 260) { sky.push(h); skyS.push(d / mx); skyV.push(mx / 255); }
      }
      const circ = (a) => {
        let sx = 0, cx = 0;
        for (const h of a) { sx += Math.sin(h * Math.PI / 180); cx += Math.cos(h * Math.PI / 180); }
        return (Math.atan2(sx / a.length, cx / a.length) * 180 / Math.PI + 360) % 360;
      };
      return { fol: fol.length ? circ(fol) : null, sky: sky.length ? circ(sky) : null,
               skySat: skyS.length ? skyS.reduce((a, c) => a + c, 0) / skyS.length : null,
               skyVal: skyV.length ? skyV.reduce((a, c) => a + c, 0) / skyV.length : null,
               nf: fol.length, ns: sky.length };
    });
    const m = await measurePops(p);
    await setDepth(p, DEPTH_TRY);
    const m2 = await measurePops(p);
    await ctx.close();
    const off = (a, b) => { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
    check("10a the foliage lands on the film's angle",
      m.fol != null && off(m.fol, FILM.fol) <= TOL, true);
    console.log(`        (foliage ${m.fol == null ? "none" : m.fol.toFixed(1)}, film ${FILM.fol}, n=${m.nf})`);
    check("10b the sky lands on the film's angle",
      m.sky != null && off(m.sky, FILM.sky) <= TOL, true);
    console.log(`        (sky ${m.sky == null ? "none" : m.sky.toFixed(1)}, film ${FILM.sky}, n=${m.ns})`);
    check("10c ...and the two stay apart, which is what the film IS",
      m.fol != null && m.sky != null && ((m.sky - m.fol + 360) % 360) >= MIN_SEP, true);
    if (m.fol != null && m.sky != null)
      console.log(`        (separation ${((m.sky - m.fol + 360) % 360).toFixed(1)}, film ${FILM.sep})`);
    check("10d the sky is as saturated as the solve made it (the film reads 0.66)",
      m.skySat != null && m.skySat >= SKY_SAT_MIN, true);
    console.log(`        (sky saturation ${m.skySat == null ? "none" : m.skySat.toFixed(3)}, floor ${SKY_SAT_MIN}, n=${m.ns})`);
    check("10e the Sky depth slider still deepens the sky (the look ships it at 0)",
      m.skyVal != null && m2.skyVal != null && m.skyVal - m2.skyVal >= SKY_VAL_DROP_MIN, true);
    console.log(`        (sky value ${m.skyVal == null ? "none" : m.skyVal.toFixed(3)} at depth ${DEPTH}, ${m2.skyVal == null ? "none" : m2.skyVal.toFixed(3)} at ${DEPTH_TRY}; drop floor ${SKY_VAL_DROP_MIN}, n=${m.ns})`);
  }

  // ---- 10f. NOTHING WITHOUT COLOUR TAKES ANY. The look's bare mapping (the
  // Foliage band at 1, Sky saturation at 0) says which pixels have no colour;
  // the whole look must leave them that way. Read on the same canvas, pixel for pixel, so the two
  // renders are compared where they are drawn.
  {
    const { p, ctx } = await open();
    await press(p, "lookEir");
    await setSlider(p, "folSat", 1);
    await setSlider(p, "skySatSel", 0);
    await p.evaluate((lo) => {
      const cv = document.querySelector("#view");
      const g = cv.getContext("webgl2") || cv.getContext("webgl");
      const W = cv.width, H = cv.height, b = new Uint8Array(W * H * 4);
      g.readPixels(0, 0, W, H, g.RGBA, g.UNSIGNED_BYTE, b);
      const col = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) {
        const r = b[i * 4], gg = b[i * 4 + 1], bb = b[i * 4 + 2], a = b[i * 4 + 3];
        const mx = Math.max(r, gg, bb), mn = Math.min(r, gg, bb);
        if (a && mx >= 13 && (mx - mn) / mx < lo) col[i] = 1;
      }
      window.__colourless = col;
    }, COL_LO);
    await press(p, "lookEir");
    const r = await p.evaluate((vis) => {
      const cv = document.querySelector("#view");
      const g = cv.getContext("webgl2") || cv.getContext("webgl");
      const W = cv.width, H = cv.height, b = new Uint8Array(W * H * 4);
      g.readPixels(0, 0, W, H, g.RGBA, g.UNSIGNED_BYTE, b);
      const col = window.__colourless; let n = 0, gained = 0;
      for (let i = 0; i < W * H; i++) {
        if (!col[i]) continue; n++;
        const r = b[i * 4], gg = b[i * 4 + 1], bb = b[i * 4 + 2];
        const mx = Math.max(r, gg, bb), mn = Math.min(r, gg, bb);
        if (mx > 0 && (mx - mn) / mx > vis) gained++;
      }
      return { n, share: n ? gained / n : 0 };
    }, COL_VISIBLE);
    await ctx.close();
    check("10f a pixel the mapping leaves colourless stays colourless under the whole look",
      r.n > 0 && r.share <= COL_VISIBLE_MAX, true);
    console.log(`        (${(100 * r.share).toFixed(2)}% of ${r.n} colourless pixels took visible colour; ceiling ${(100 * COL_VISIBLE_MAX).toFixed(0)}%)`);
  }

  check("11  every band the look declares is reachable on the reader's own sliders",
    BANDS.every((t) => Math.abs(t[0]) <= HUE_LIMIT && t[1] >= SAT_RANGE[0] && t[1] <= SAT_RANGE[1] && t[2] >= LUM_RANGE[0] && t[2] <= LUM_RANGE[1]), true);
  console.log(`        (largest hue ${Math.max(...BANDS.map((t) => Math.abs(t[0])))} of ${HUE_LIMIT}, saturation ${Math.min(...BANDS.map((t) => t[1]))}..${Math.max(...BANDS.map((t) => t[1]))} of ${SAT_RANGE.join("..")}, luminance ${Math.min(...BANDS.map((t) => t[2]))}..${Math.max(...BANDS.map((t) => t[2]))} of ${LUM_RANGE.join("..")})`);
  check("11b ...and so are the global and the two band saturations",
    GLOBAL_SAT >= GLOBAL_SAT_RANGE[0] && GLOBAL_SAT <= GLOBAL_SAT_RANGE[1] && [FOL_SAT, SKY_SAT].every((v) => v >= BAND_SAT_RANGE[0] && v <= BAND_SAT_RANGE[1]), true);

  // 12 — THE LOOK'S OWN FINISHING PANEL (decision 022): it opens on the press,
  // its controls are the tabs' own (a drag on the mirror moves the real slider
  // and the picture), and it closes leaving a way back. MADE TO FAIL FIRST
  // against the build before the panel existed.
  {
    const { p, ctx } = await open();
    await press(p, "lookEir");
    check("12a the finishing panel opens on Aerochrome", await p.evaluate(() => !document.getElementById("finishPanel")?.hidden), true);
    const before = await hash(p);
    await setSlider(p, "finish-skySatSel", 0.5);
    check("12b ...and its Sky saturation moves the real slider", await p.evaluate(() => Number(document.getElementById("skySatSel")?.value)), 0.5);
    check("12c ...and the picture", (await hash(p)) !== before, true);
    await setSlider(p, "skySatSel", 1.2);
    check("12d ...and the real slider moves the mirror back", await p.evaluate(() => Number(document.getElementById("finish-skySatSel")?.value)), 1.2);
    await press(p, "finishClose");
    check("12e ...and it closes, leaving a way back under the looks", await p.evaluate(() => !!document.getElementById("finishPanel")?.hidden && !document.getElementById("finishOpen")?.hidden), true);
    await press(p, "lookAero");
    check("12f ...and a look without steps offers no panel", await p.evaluate(() => !!document.getElementById("finishPanel")?.hidden && !!document.getElementById("finishOpen")?.hidden), true);
    await ctx.close();
  }

  const liftShipped = await armShipped(true);
  const liftRecipe = await armRecipe(true);
  check("8   ...and with it on they differ, because the look re-solves the lift",
    liftShipped !== liftRecipe, true);
  console.log(`        (button ${liftShipped}, recipe ${liftRecipe})`);

  // ---- 9. THE MEASUREMENT FOLLOWS THE PHOTOGRAPH, not the session.
  const two = await b.newContext({ viewport: { width: 1280, height: 950 } });
  const q = await two.newPage();
  q.on("dialog", d => d.accept());
  await q.goto(`http://127.0.0.1:${PORT}/ir.html`);
  await q.setInputFiles("#file", PAIR);
  await q.waitForFunction((n) => document.querySelectorAll("#sessionThumbs .session-thumb").length === n, PAIR.length, { timeout: 300000 });
  await q.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
  await settle(q);
  // WAIT FOR THE TILE TO BE ACTIVE FIRST. Settling on the canvas is not enough
  // on its own: if the click has not started the decode yet the canvas is
  // already stable AT THE OLD PHOTOGRAPH, so settle returns at once and every
  // reading below belongs to the frame you were trying to leave. That is what
  // made the first version of check 9a report one frame's denoise twice.
  // WAIT ON THE PIXELS CHANGING, not on a class and not on a clock.
  //
  // Settling alone is not enough: if the click has not started the decode yet
  // the canvas is already stable AT THE OLD PHOTOGRAPH, so settle returns at
  // once and every reading below belongs to the frame you were trying to leave.
  // That is what made the first version of 9a report one frame's denoise twice.
  //
  // Waiting for the tile to carry `active` is not enough either -- it timed out
  // for five minutes here, so whatever marks the active tile in this strip is
  // not that, and a walk should not encode a guess about someone else's class
  // names. The canvas changing IS the event: a different photograph is on
  // screen exactly when the pixels are no longer the ones that were there.
  const stepTo = async (i) => {
    const before = await hash(q);
    // A REAL MOUSE CLICK, not `element.click()` in an evaluate. The strip's
    // tiles are <button>s that listen on pointer events, so a synthetic click
    // dispatches and nothing happens -- measured: the denoise slider stayed on
    // the first frame's 0.46 through a hundred seconds of polling, and moved to
    // the second frame's 0.22 the moment a real click landed.
    const tiles = await q.$$("#sessionThumbs .session-thumb");
    if (!tiles[i]) { failed++; console.log(`FAIL  step to photo ${i}: no such tile`); return; }
    await tiles[i].scrollIntoViewIfNeeded();
    await tiles[i].click();
    let moved = false;
    for (let k = 0; k < 400; k++) {
      if (await hash(q) !== before) { moved = true; break; }
      await q.waitForTimeout(250);
    }
    if (!moved) { failed++; console.log(`FAIL  step to photo ${i}: the canvas never changed`); }
    await q.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 120000 });
    await settle(q);
  };
  const dnA = await dn(q);
  await stepTo(1);
  const dnB = await dn(q);
  check("9a  the two frames measure different denoise, so 9b is not vacuous",
    Math.abs(dnA - dnB) > 0.005, true);
  console.log(`        (first ${dnA}, second ${dnB})`);

  await stepTo(0);
  await press(q, "lookEir");
  await stepTo(1);          // a fresh open, which is what overwrote the memory
  await stepTo(0);          // ...and back, by the live-edit path
  await press(q, "lookAero");
  check("9b  leaving the look on a revisited photo restores ITS OWN measurement",
    await dn(q), dnA);
  await two.close();
} finally {
  await b.close();
}
console.log(failed ? `\n${failed} FAILED` : "\nthe Aerochrome button ships what was approved");
process.exit(failed ? 1 : 0);
