#!/usr/bin/env node
// A MASK CAN POINT A WHOLE-PHOTO TOOL AT ONE PART OF THE PICTURE (decision 030).
//
// Four aims shipped — Dehaze, Clarity, the shadow tint and the IR lens hot-spot
// fix — and nothing asserted any of them. This drives two of them through the
// real app on a practice frame with a sky and a tree in it, and holds the
// mechanism to four statements that are true of every aim or of none:
//
//   1. AIMING NOTHING CHANGES NOTHING. A Sky mask with a neutral adjustment and
//      no aim pressed renders BYTE-IDENTICAL to no mask at all. This is the one
//      that protects every edit ever saved: `maskIsActive` returns true for a
//      mask that only aims, and the same list has to reach the shader.
//   2. The stage does something whole-frame to begin with.
//   3. The aim HOLDS SOMETHING BACK: aimed differs from whole-frame.
//   4. The aim still DOES something: aimed differs from the baseline.
//
// And one number, printed rather than bounded: the share of the frame the aimed
// arm moved, beside the share the Sky mask says it covers. They should be close;
// they will not be equal, because the mask's edge is feathered and the stage is
// not linear in the weight.
//
// WHAT THIS WALK'S OWN FIRST RUN CAUGHT, which is why check 1 is first. A fresh
// Sky mask is NOT neutral: `addMask` gives it Saturation 1.3 on purpose, so a
// new mask does something visible. An earlier version of this comparison left it
// there and reported the aim moving half the frame — which was 30% of extra
// chroma over 54% of the picture and nothing whatever to do with the aim.
//
// A NOTE ON DRIVING THE CONTROLS, because it cost three rounds. Plain value
// sliders take `setValue` from tools/walk-input.mjs — dispatched events, value
// read back. A real pointer drag moves no range input in this container: six
// sliders were driven three ways each and not one moved. Mask-panel controls
// that carry a MODE are the exception (hub LESSONS §348); this walk turns the
// coverage tint off explicitly and never reads it, and check 1 is what says so
// if that reasoning is wrong.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/aim-walk.mjs [--port=8131] [--shots=DIR]
import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
import { requireFreshDist } from "./fresh-dist.mjs";
requireFreshDist();
import { setValue, getValue } from "./walk-input.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join } from "node:path";

const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const SHOTS = process.argv.find((a) => a.startsWith("--shots="))?.split("=")[1] ?? "";
const FILE = new URL("../public/examples/NIR_1651.dng", import.meta.url).pathname;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}`); if (detail) console.log(`        ${detail}`); };

/** RGBA rows, top-down, to a PNG file. Only for --shots; the checks read the
 *  same buffer, so a picture and a number can never come from two reads. */
function writePng(path, w, h, px) {
  const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, "ascii"), data]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, cr]); };
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]));
}

// The hash is computed IN THE PAGE and comes back as a string. An earlier
// version handed 4.8 million array elements across the debug protocol per
// settle step and produced no number at all in several minutes.
const hashIn = (p) => p.evaluate(() => {
  const cv = document.querySelector("#view");
  const g = cv.getContext("webgl2") || cv.getContext("webgl");
  const b = new Uint8Array(cv.width * cv.height * 4);
  g.readPixels(0, 0, cv.width, cv.height, g.RGBA, g.UNSIGNED_BYTE, b);
  let h = 2166136261;
  for (let k = 0; k < b.length; k += 4) { h ^= b[k]; h = Math.imul(h, 16777619); h ^= b[k + 1]; h = Math.imul(h, 16777619); h ^= b[k + 2]; h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
});
async function settle(p) { let last = "", stable = 0; for (let i = 0; i < 80; i++) { const h = await hashIn(p); if (h === last) { if (++stable >= 2) return true; } else { stable = 0; last = h; } await p.waitForTimeout(200); } return false; }

/** The canvas once, top-down — readPixels is bottom-up and the picture is not. */
async function readFrame(p) {
  const { w, h, b64 } = await p.evaluate(() => {
    const cv = document.querySelector("#view");
    const g = cv.getContext("webgl2") || cv.getContext("webgl");
    const b = new Uint8Array(cv.width * cv.height * 4);
    g.readPixels(0, 0, cv.width, cv.height, g.RGBA, g.UNSIGNED_BYTE, b);
    let s = ""; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
    return { w: cv.width, h: cv.height, b64: btoa(s) };
  });
  const src = Buffer.from(b64, "base64"), out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) src.copy(out, y * w * 4, (h - 1 - y) * w * 4, (h - y) * w * 4);
  return { w, h, px: out };
}

/** Mean absolute RGB difference and the share of pixels that moved at all. */
function diff(a, b) {
  if (a.w !== b.w || a.h !== b.h) return { mean: NaN, moved: NaN, same: false };
  let sum = 0, moved = 0;
  for (let i = 0; i < a.px.length; i += 4) {
    const d = Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i + 1] - b.px[i + 1]) + Math.abs(a.px[i + 2] - b.px[i + 2]);
    sum += d; if (d) moved++;
  }
  return { mean: sum / (3 * (a.px.length / 4)), moved: moved / (a.px.length / 4), same: moved === 0 };
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  /** One arm: open the frame, run `prep`, read the canvas once. */
  async function arm(name, prep) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
    const p = await ctx.newPage(); p.on("dialog", (d) => d.accept());
    await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
    await p.setInputFiles("#file", [FILE]);
    await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
    await p.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
    await settle(p);
    const notes = await prep(p);
    await settle(p);
    const f = await readFrame(p);
    if (SHOTS) writePng(join(SHOTS, `${name}.png`), f.w, f.h, f.px);
    await ctx.close();
    return { f, notes };
  }

  /** A Sky mask with NOTHING of its own to do, optionally aiming one stage.
   *  Takes the page and the aim button's id (or null). Returns what the panel
   *  reads back, which the caller asserts before trusting any pixel. */
  async function neutralSky(p, aimId) {
    await p.click("#ptab-masks");
    await p.click("#addSky");
    await settle(p);
    // The coverage tint is drawn ON THE CANVAS: leaving it on would compare a
    // photograph against a photograph with a yellow wash over half of it.
    await p.click("#mOutline"); await settle(p);
    await setValue(p, "mSat", "1"); // see the header: a fresh Sky mask is 1.3
    const own = await p.evaluate(() => ["mBrightness", "mContrast", "mSat", "mHue", "mWarmth"].map((i) => document.getElementById(i).value).join(","));
    if (aimId) { await p.click(`#${aimId}`); await settle(p); }
    return {
      own,
      outline: await p.getAttribute("#mOutline", "aria-pressed"),
      aim: aimId ? await p.getAttribute(`#${aimId}`, "aria-pressed") : "n/a",
      sky: ((await p.textContent("#mSkyStatus")) || "").trim(),
    };
  }

  /** One stage, four arms, the four statements. `tab`/`id`/`value` name the
   *  whole-frame slider; `aimId` names the toggle on the mask panel. */
  async function stage(label, tab, id, value, aimId) {
    console.log(`\n${label}  —  #${id} = ${value}, aimed with #${aimId}`);
    const setIt = async (p) => { await p.click(`#${tab}`); return setValue(p, id, value); };
    const base = await arm(`${label}-1-baseline`, async () => ({}));
    const whole = await arm(`${label}-2-whole-frame`, async (p) => ({ v: await setIt(p) }));
    const off = await arm(`${label}-3-control-aim-off`, async (p) => { const v = await setIt(p); return { v, after: await getValue(p, id), ...(await neutralSky(p, null)) }; });
    const aimed = await arm(`${label}-4-aimed`, async (p) => { const v = await setIt(p); return { v, after: await getValue(p, id), ...(await neutralSky(p, aimId)) }; });

    check(`${label}: the mask's own adjustment is neutral in both mask arms`, off.notes.own === "1,1,1,0,0" && aimed.notes.own === "1,1,1,0,0", `${off.notes.own} / ${aimed.notes.own}`);
    check(`${label}: the coverage tint is off in both mask arms`, off.notes.outline === "false" && aimed.notes.outline === "false", `${off.notes.outline} / ${aimed.notes.outline}`);
    check(`${label}: the slider holds the same value across all three`, whole.notes.v === value && off.notes.after === value && aimed.notes.after === value, `${whole.notes.v} / ${off.notes.after} / ${aimed.notes.after}`);
    check(`${label}: the aim reads pressed`, aimed.notes.aim === "true", aimed.notes.aim);

    const dOff = diff(whole.f, off.f);
    check(`${label}: 1 · aiming nothing changes nothing — a neutral, non-aiming Sky mask renders identically`, dOff.same, `moved ${(dOff.moved * 100).toFixed(3)}%, mean |RGB| ${dOff.mean.toFixed(3)}`);
    const dWhole = diff(base.f, whole.f);
    check(`${label}: 2 · the stage does something whole-frame`, !dWhole.same, `moved ${(dWhole.moved * 100).toFixed(2)}%, mean |RGB| ${dWhole.mean.toFixed(3)}`);
    const dHeld = diff(whole.f, aimed.f);
    check(`${label}: 3 · the aim holds something back`, !dHeld.same, `moved ${(dHeld.moved * 100).toFixed(2)}%, mean |RGB| ${dHeld.mean.toFixed(3)}`);
    const dAimed = diff(base.f, aimed.f);
    check(`${label}: 4 · the aim still does something`, !dAimed.same, `moved ${(dAimed.moved * 100).toFixed(2)}%, mean |RGB| ${dAimed.mean.toFixed(3)}`);
    // REPORTED, NOT BOUNDED. The mask's edge is feathered and no stage is
    // linear in the weight, so these two are near neighbours rather than equal.
    console.log(`        aimed arm moved ${(dAimed.moved * 100).toFixed(1)}% of the frame · ${aimed.notes.sky}`);
  }

  await stage("dehaze", "ptab-color", "dehaze", "0.8", "mAimDehaze");
  await stage("hotspot", "ptab-corrections", "hotspot", "0.8", "mAimLens");

  if (SHOTS) console.log(`\n  shots in ${SHOTS} — the verification of an appearance is the photographs, not these numbers.`);
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
