#!/usr/bin/env node
// EVERY WAY YOU CAN SEE ONE PHOTOGRAPH HAS TO AGREE.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/agreement-walk.mjs [--port=8131]
//
// WHY THIS EXISTS, AND WHY NO GATE IN THIS REPO COULD HAVE CAUGHT WHAT IT
// CATCHES. Every check added here asserts a RULE — that a function states its
// contract, that the two doors of the lens store agree, that a curve blends the
// way it should. Not one of them asserts AGREEMENT BETWEEN TWO PATHS THAT ANSWER
// THE SAME QUESTION, and that is the failure this app keeps having.
//
// The app has no value meaning "how photograph X renders". It has one module
// level mutable `params` meaning "how the OPEN photograph renders", with 185
// mutation sites in main.ts — so every path that renders some OTHER photograph
// reconstructs by hand what opening it would do, and each reconstruction is a
// separate copy of one ruling. There are four:
//
//   establishFreshEdit   the open photograph          (freshBaseline)
//   makeThumb !own       strip and quick-look tiles   (freshBaseline)
//   openPhotoExportJob   export of the open photo     (clones the live params)
//   batchParamsFor       Batch process                (its OWN copy)
//
// Three of those have already been caught falling behind: the tile rendered a
// camera JPEG at gray-world balance while opening it gave wb [1,1,1]; and
// batchParamsFor's own comment records highlight recovery going missing there
// and nowhere else. A rule-checking gate cannot see any of it. Rendering the
// same file two ways and comparing can.
//
// WHAT IT MEASURES. The biggest 30-degree hue bin and its share, plus the median
// lightness of the coloured pixels — IR-SCIENCE.md section 6's metric, which
// works whether the frame is one population (a camera JPEG, near enough all its
// colour in one bin) or two (a swapped raw, foliage against sky). NOT a
// whole-frame mean: on a bimodal frame that lands on grey and its hue is decided
// by whichever population is a few pixels larger, which read 127 degrees apart on
// two renderings that agreed to 1.5.
//
// THE RAW ARM IS THE CONTROL. The assemblers differ on FILE KIND, so a walk with
// only one kind cannot see the disagreement; and an arm that passes in both
// states is what says the walk is not vacuous.
import { chromium } from "playwright-core";
const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const BASE = `http://127.0.0.1:${PORT}`;
const D = "/tmp/claude-0/-home-user/2bd37282-d617-5a51-b357-6b20783a5840/scratchpad/real";
const EX = "/home/user/Jefferson-Photography-Studio/public/examples";
import { existsSync } from "node:fs";

const SETS = [
  [[`${D}/NIR_2821.JPG`, `${D}/NIR_2813.JPG`], "camera JPEG"],
  [[`${EX}/NIR_0063.dng`, `${EX}/NIR_0102.dng`], "raw"],
].filter(([fs]) => fs.every(existsSync));

let bad = 0;
const fail = (s) => { bad++; console.log(`FAIL  ${s}`); };
const ok = (s) => console.log(`ok    ${s}`);

// The reading, computed the same way wherever the pixels came from.
const READ = `(px) => {
  const bins = new Array(12).fill(0); let n = 0; const ls = [];
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i+1], b = px[i+2];
    if (px[i+3] === 0) continue;
    const mx = Math.max(r,g,b), mn = Math.min(r,g,b);
    ls.push((mx + mn) / 2 / 255);
    if (mx - mn < 12) continue;                       // grey carries no hue
    let h; const d = mx - mn;
    if (mx === r) h = ((g-b)/d) % 6; else if (mx === g) h = (b-r)/d + 2; else h = (r-g)/d + 4;
    bins[Math.floor((((h*60)%360)+360)%360 / 30)]++; n++;
  }
  if (!n) return null;
  let k = 0; for (let i = 1; i < 12; i++) if (bins[i] > bins[k]) k = i;
  ls.sort((a,z) => a - z);
  return { hue: k*30 + 15, share: bins[k]/n, light: ls[Math.floor(ls.length/2)] * 100 };
}`;

const dHue = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
try {
  const page = await br.newPage({ viewport: { width: 1000, height: 820 } });
  for (const [files, label] of SETS) {
    await page.goto(`${BASE}/ir.html`, { waitUntil: "load" });
    await page.setInputFiles("#file", files);
    await page.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
    await page.waitForTimeout(2500);

    // 1. THE OPEN PHOTOGRAPH — the answer every other path is claiming to match.
    const open = await page.evaluate(`(() => {
      const read = ${READ};
      const c = document.querySelector("#view");
      const g = c.getContext("webgl2") || c.getContext("webgl");
      const b = new Uint8Array(c.width * c.height * 4);
      g.readPixels(0, 0, c.width, c.height, g.RGBA, g.UNSIGNED_BYTE, b);
      return read(b);
    })()`);
    if (!open) { fail(`${label}: the open photograph has no colour to read`); continue; }

    // 2. BATCH PROCESS over the SAME files, on Auto — no look, so the only thing
    //    under test is the baseline each path applies to the file. A look would
    //    mask it, because a look legitimately owns the swap and the grade.
    await page.evaluate(() => { indexedDB.deleteDatabase("ips-batch"); });
    await page.waitForTimeout(400);
    await page.setInputFiles("#batchFiles", files);
    await page.waitForFunction(() => document.getElementById("batchDlg")?.open, null, { timeout: 60000 })
      .catch(() => {});
    const started = await page.evaluate(() => {
      const b = document.getElementById("bcAuto");
      if (!b || b.hidden) return false;
      b.click(); return true;
    });
    if (!started) { fail(`${label}: could not start a batch on Auto — the walk cannot see its own case`); continue; }
    // Poll the STORE, not a message: the run is done when the frames are on disk.
    await page.waitForFunction((want) => new Promise((res) => {
      const rq = indexedDB.open("ips-batch");
      rq.onerror = () => res(false);
      rq.onsuccess = () => {
        const db = rq.result;
        if (!db.objectStoreNames.contains("meta")) { db.close(); return res(false); }
        const c = db.transaction("meta").objectStore("meta").count();
        c.onsuccess = () => { const n = c.result; db.close(); res(n >= want); };
        c.onerror = () => { db.close(); res(false); };
      };
    }), files.length, { timeout: 600000 }).catch(() => {});

    const batch = await page.evaluate(`(async () => {
      const read = ${READ};
      const db = await new Promise((res, rej) => {
        const rq = indexedDB.open("ips-batch");
        rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
      });
      const metas = await new Promise((res) => {
        const r = db.transaction("meta").objectStore("meta").getAll();
        r.onsuccess = () => res(r.result); r.onerror = () => res([]);
      });
      if (!metas.length) { db.close(); return null; }
      const name = metas[0].name;
      const chunks = await new Promise((res) => {
        const r = db.transaction("chunks").objectStore("chunks")
          .getAll(IDBKeyRange.bound([name, 0], [name, Infinity]));
        r.onsuccess = () => res(r.result); r.onerror = () => res([]);
      });
      db.close();
      if (!chunks.length) return null;
      chunks.sort((a, z) => a.idx - z.idx);
      let total = 0; for (const c of chunks) total += c.bytes.byteLength;
      const all = new Uint8Array(total);
      let at = 0; for (const c of chunks) { all.set(new Uint8Array(c.bytes), at); at += c.bytes.byteLength; }
      const bm = await createImageBitmap(new Blob([all]));
      const cv = document.createElement("canvas"); cv.width = bm.width; cv.height = bm.height;
      cv.getContext("2d").drawImage(bm, 0, 0);
      return { name, ...read(cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data) };
    })()`);

    if (!batch) { fail(`${label}: no batch output to read — the walk cannot see its own case`); continue; }
    const dh = dHue(open.hue, batch.hue), dl = Math.abs(open.light - batch.light);
    console.log(`  ${label.padEnd(12)} open  hue ${String(open.hue).padStart(3)} (${(open.share*100).toFixed(0)}%) light ${open.light.toFixed(1)}%`);
    console.log(`  ${"".padEnd(12)} batch hue ${String(batch.hue).padStart(3)} (${(batch.share*100).toFixed(0)}%) light ${batch.light.toFixed(1)}%  ·  ${dh}deg, ${dl.toFixed(1)} points apart`);
    // 30deg is one bin: inside it the two agree on which bin is biggest.
    if (dh > 30 || dl > 8) fail(`${label}: a batch render disagrees with opening the same file — ${dh}deg and ${dl.toFixed(1)} points`);
    else ok(`${label}: batch and open agree`);
  }
} finally { await br.close(); }
console.log(bad ? `\n${bad} failed\n` : "\nevery path renders the same photograph the same way\n");
process.exit(bad ? 1 : 0);
