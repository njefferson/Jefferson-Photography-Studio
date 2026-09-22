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
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const BASE = `http://127.0.0.1:${PORT}`;
const D = "/tmp/claude-0/-home-user/2bd37282-d617-5a51-b357-6b20783a5840/scratchpad/real";
const EX = "/home/user/Jefferson-Photography-Studio/public/examples";
import { existsSync, readFileSync } from "node:fs";
// The frame arm 4 aims a mask on: a conifer against a deep teal sky, which is
// the one decision 030's own render was opened on, so a reader comparing the
// two is looking at the same picture.
const AIM_FILE = `${EX}/NIR_1651.dng`;

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

    // WHICH PHOTOGRAPH IS ON THE CANVAS. The batch store is keyed on name, so
    // getAll() comes back in filename order, which is not the order the session
    // opens in — and nothing here ever checked that the frame being compared
    // was the frame being shown. It happened to be the same file; a walk that
    // is right by luck is a walk that will be wrong silently.
    const openName = await page.evaluate(
      () => document.querySelector(".session-thumb.active")?.getAttribute("title") || "",
    );
    if (!openName) { fail(`${label}: cannot tell which photograph is on the canvas`); continue; }
    // The tile's title is the filename plus, sometimes, a status the strip is
    // showing ("— still saving"). Cut that before the extension, or the stem is
    // right only while the suffix happens to carry no dot of its own.
    const stem = (n) => n.split(" \u2014 ")[0].trim().replace(/\.[^.]+$/, "");

    // 2. BATCH PROCESS over the SAME files, ON AUTO AND ON "copy the current
    //    edit" — two grades, because they are two different rulings and this
    //    walk used to run NEITHER of them knowingly.
    //
    //    THE ORDER IS THE TEST. `pickGrade` sets the chosen grade and THEN opens
    //    the file picker; writing to #batchFiles first runs the picker callback
    //    with no grade chosen, and it falls back to { kind: "look", look:
    //    currentLook() } whenever a photograph is open. So this walk spent its
    //    whole life reporting an Auto batch while running a look grade — which
    //    is also why a fix to the Auto assembly measured as changing nothing:
    //    the branch it changed was never reached. Open the dialog, press the
    //    grade, then hand over the files, exactly as a reader does.
    for (const [gradeId, gradeLabel] of [["bcAuto", "Auto"], ["bcCurrent", "copy the current edit"]]) {
      await page.evaluate(() => { indexedDB.deleteDatabase("ips-batch"); });
      await page.waitForTimeout(600);
      await page.evaluate(() => document.getElementById("batchBtn")?.click());
      await page.waitForFunction(() => document.getElementById("batchDlg")?.open, null, { timeout: 30000 })
        .catch(() => {});
      const started = await page.evaluate((id) => {
        const b = document.getElementById(id);
        if (!b || b.hidden) return false;
        b.click(); return true;
      }, gradeId);
      if (!started) { fail(`${label} / ${gradeLabel}: could not choose that grade — the walk cannot see its own case`); continue; }
      await page.setInputFiles("#batchFiles", files);

      // POLL THE STORE, and poll it from a place that can actually await. A
      // Promise handed to waitForFunction is never awaited — the object itself
      // is truthy, so such a poll passes on its first tick and the store gets
      // read before the batch has written anything. page.evaluate DOES await,
      // so the count is asked for there and the waiting is done out here.
      let have = 0;
      for (let i = 0; i < 600; i++) {
        have = await page.evaluate(() => new Promise((res) => {
          const rq = indexedDB.open("ips-batch");
          rq.onerror = () => res(0);
          rq.onsuccess = () => {
            const db = rq.result;
            if (!db.objectStoreNames.contains("meta")) { db.close(); return res(0); }
            const c = db.transaction("meta").objectStore("meta").count();
            c.onsuccess = () => { const n = c.result; db.close(); res(n); };
            c.onerror = () => { db.close(); res(0); };
          };
        }));
        if (have >= files.length) break;
        await page.waitForTimeout(1000);
      }

      const batch = await page.evaluate(`(async (want) => {
        const read = ${READ};
        const db = await new Promise((res, rej) => {
          const rq = indexedDB.open("ips-batch");
          rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
        });
        const metas = await new Promise((res) => {
          const r = db.transaction("meta").objectStore("meta").getAll();
          r.onsuccess = () => res(r.result); r.onerror = () => res([]);
        });
        const stem = (n) => n.replace(/\\.[^.]+$/, "");
        const m = metas.find((x) => stem(x.name) === want);
        if (!m) { db.close(); return { missing: metas.map((x) => x.name) }; }
        const chunks = await new Promise((res) => {
          const r = db.transaction("chunks").objectStore("chunks")
            .getAll(IDBKeyRange.bound([m.name, 0], [m.name, Infinity]));
          r.onsuccess = () => res(r.result); r.onerror = () => res([]);
        });
        db.close();
        if (!chunks.length) return { missing: [m.name + " (no chunks)"] };
        chunks.sort((a, z) => a.idx - z.idx);
        let total = 0; for (const c of chunks) total += c.bytes.byteLength;
        const all = new Uint8Array(total);
        let at = 0; for (const c of chunks) { all.set(new Uint8Array(c.bytes), at); at += c.bytes.byteLength; }
        const bm = await createImageBitmap(new Blob([all]));
        const cv = document.createElement("canvas"); cv.width = bm.width; cv.height = bm.height;
        cv.getContext("2d").drawImage(bm, 0, 0);
        return { name: m.name, ...read(cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data) };
      })(${JSON.stringify(stem(openName))})`);

      if (!batch || batch.missing) {
        fail(`${label} / ${gradeLabel}: no batch frame for ${openName} — the store holds ${JSON.stringify(batch?.missing ?? [])}`);
        continue;
      }
      const dh = dHue(open.hue, batch.hue), dl = Math.abs(open.light - batch.light);
      console.log(`  ${label.padEnd(12)} open  ${openName} hue ${String(open.hue).padStart(3)} (${(open.share*100).toFixed(0)}%) light ${open.light.toFixed(1)}%`);
      console.log(`  ${"".padEnd(12)} batch ${batch.name} hue ${String(batch.hue).padStart(3)} (${(batch.share*100).toFixed(0)}%) light ${batch.light.toFixed(1)}%  ·  ${gradeLabel} · ${dh}deg, ${dl.toFixed(1)} points apart`);
      // 30deg is one bin: inside it the two agree on which bin is biggest.
      if (dh > 30 || dl > 8) fail(`${label} / ${gradeLabel}: a batch render disagrees with opening the same file — ${dh}deg and ${dl.toFixed(1)} points`);
      else ok(`${label} / ${gradeLabel}: batch and open agree`);
    }
  }

  // 3. A TILE FOR A PHOTOGRAPH NOBODY HAS OPENED, UNDER THE LOOK THE SET WEARS.
  //
  //    Arm 2 runs on Auto on purpose, so the only thing under test there is the
  //    baseline. THAT IS ALSO ITS BLIND SPOT, and this arm is the blind spot's
  //    shape: the tile path reconstructs the LOOK as well as the baseline, and
  //    it was reconstructing half of it. `makeThumb` took the channel swap from
  //    `freshBaseline` and the mixer from whatever was live, while
  //    `establishFreshEdit` takes both from the session look -- so under any look
  //    whose mapping differs from the file kind's default, the tile stated an
  //    open that will not happen. It went unseen because until `eir` the only
  //    looks that clear the swap on a raw are the ones with saturation 0, where
  //    a swap has nothing to move.
  //
  //    Pressed by ID. A label is product copy and moves; `Aerochrome` named a
  //    different button the day a second look shipped under that name.
  for (const [files, label] of SETS) {
    if (files.length < 2) { console.log(`  ${label.padEnd(12)} tile arm skipped — needs two files`); continue; }
    const page = await br.newPage({ viewport: { width: 1000, height: 820 } });
    try {
      await page.goto(`${BASE}/ir.html`, { waitUntil: "load" });
      await page.setInputFiles("#file", files);
      await page.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
      await page.waitForFunction(() => document.querySelectorAll("#sessionThumbs .session-thumb img[src^='blob:']").length >= 2, null, { timeout: 300000 });
      await page.waitForTimeout(2000);
      const was = await page.evaluate(() => document.querySelectorAll("#sessionThumbs .session-thumb img")[1]?.getAttribute("src") || "");

      const pressed = await page.evaluate(() => {
        document.getElementById("ptab-ir")?.click();
        const b = document.getElementById("lookEir");
        if (!b) return false;
        b.click(); return true;
      });
      if (!pressed) { fail(`${label}: no #lookEir button — the walk cannot see its own case`); continue; }
      // The strip re-renders every tile under a new look. Wait for the SECOND
      // tile's picture to actually be a different one, not for a clock.
      await page.waitForFunction((prev) => {
        const im = document.querySelectorAll("#sessionThumbs .session-thumb img")[1];
        const src = im?.getAttribute("src") || "";
        return src.startsWith("blob:") && src !== prev;
      }, was, { timeout: 300000 });
      await page.waitForTimeout(1200);

      // A TILE SHOWS THE CAMERA'S OWN PREVIEW UNTIL THIS APP HAS RENDERED ITS
      // OWN, and the wait above cannot tell the two apart: it only asks that the
      // blob URL changed, which a re-issued provisional picture satisfies too.
      // Decision 007 records a number published from exactly that mistake — it
      // came out 0.2726 and 0.2730 on two different photographs, which is what a
      // measurement of the camera's rendering looks like rather than of this
      // app's. The strip already says which it is, in a class.
      const settled = await page
        .waitForFunction(
          () => {
            const el = document.querySelectorAll("#sessionThumbs .session-thumb")[1];
            return !!el && !el.className.includes("provisional");
          },
          null,
          { timeout: 300000 },
        )
        .then(() => true)
        .catch(() => false);
      if (!settled) {
        fail(`${label}: the second tile never stopped being the camera's provisional picture — nothing below it would be about this app`);
        continue;
      }
      await page.waitForTimeout(600);

      // AND IT HAS TO BE THE PHOTOGRAPH THAT GETS OPENED. Index 1 is used for
      // both, so this holds today; it is asserted because arm 2 spent its whole
      // life pairing by two different orderings and nothing said so.
      const tileName = await page.evaluate(
        () => document.querySelectorAll("#sessionThumbs .session-thumb")[1]?.getAttribute("title") || "",
      );

      const tile = await page.evaluate(`(async () => {
        const read = ${READ};
        const el = document.querySelectorAll("#sessionThumbs .session-thumb")[1];
        if (el && el.className.includes("provisional")) return null;
        const im = document.querySelectorAll("#sessionThumbs .session-thumb img")[1];
        const src = im?.getAttribute("src") || "";
        if (!src.startsWith("blob:")) return null;
        const bm = await createImageBitmap(await (await fetch(src)).blob());
        const cv = document.createElement("canvas");
        cv.width = bm.width; cv.height = bm.height;
        cv.getContext("2d").drawImage(bm, 0, 0);
        return read(cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data);
      })()`);
      if (!tile) { fail(`${label}: the second tile has no picture to read`); continue; }

      // NOW OPEN THE PHOTOGRAPH THE TILE WAS CLAIMING ABOUT.
      await page.evaluate(() => document.querySelectorAll("#sessionThumbs .session-thumb")[1].click());
      await page.waitForFunction(() => document.querySelectorAll("#sessionThumbs .session-thumb")[1]?.classList.contains("active"), null, { timeout: 300000 });
      await page.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
      await page.waitForTimeout(2500);
      const openName = await page.evaluate(
        () => document.querySelector(".session-thumb.active")?.getAttribute("title") || "",
      );
      const stem = (n) => n.split(" \u2014 ")[0].trim();
      if (stem(tileName) !== stem(openName)) {
        fail(`${label}: the tile read was ${tileName} and the photograph opened was ${openName} — the arm is comparing two different files`);
        continue;
      }
      const opened = await page.evaluate(`(() => {
        const read = ${READ};
        const c = document.querySelector("#view");
        const g = c.getContext("webgl2") || c.getContext("webgl");
        const b = new Uint8Array(c.width * c.height * 4);
        g.readPixels(0, 0, c.width, c.height, g.RGBA, g.UNSIGNED_BYTE, b);
        return read(b);
      })()`);
      if (!opened) { fail(`${label}: opening the second photograph gave no colour to read`); continue; }

      const dh = dHue(tile.hue, opened.hue), dl = Math.abs(tile.light - opened.light);
      console.log(`  ${label.padEnd(12)} tile  hue ${String(tile.hue).padStart(3)} (${(tile.share*100).toFixed(0)}%) light ${tile.light.toFixed(1)}%   [Aerochrome, never opened]`);
      console.log(`  ${"".padEnd(12)} open  hue ${String(opened.hue).padStart(3)} (${(opened.share*100).toFixed(0)}%) light ${opened.light.toFixed(1)}%  \u00b7  ${dh}deg, ${dl.toFixed(1)} points apart`);
      // A tile is 260px, nearest-sampled and JPEG-compressed against a full
      // render, so the bars are looser than arm 2's: one bin of hue still, and
      // twice the lightness slack.
      if (dh > 30 || dl > 16) fail(`${label}: a tile under a look disagrees with opening the same file — ${dh}deg and ${dl.toFixed(1)} points`);
      else ok(`${label}: tile and open agree under a look`);
    } finally { await page.close(); }
  }

  // 4. AN AIMED MASK, PREVIEW AGAINST EXPORT — the two paths that write the
  //    same blend in two languages.
  //
  //    Decision 030's spatial half is the first thing here that is implemented
  //    TWICE and differently on purpose: the shader scales its own local gain,
  //    `src/export.ts` mixes a sampler's output, and they are equal only because
  //    mix(c, c*g, w) == c * mix(1, g, w). Nothing else in this repo asserted
  //    that. `aim-walk` reads the preview canvas, so it measures the shader
  //    alone; `export-bytes-walk` asserts the export is DETERMINISTIC, not that
  //    it agrees with what the reader was shown. Arms 1-3 above use no mask at
  //    all, so they prove the unaimed path is untouched and nothing more.
  //
  //    So this is the arm that would find the halves apart, and it is written
  //    because the change it covers was made without it existing.
  {
    const label = "aimed";
    const page = await br.newPage({ viewport: { width: 1000, height: 820 }, acceptDownloads: true });
    try {
      await page.goto(`${BASE}/ir.html`, { waitUntil: "load" });
      await page.setInputFiles("#file", [AIM_FILE]);
      await page.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
      await page.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
      await page.waitForTimeout(2500);

      // Denoise hard, then a Sky mask that aims it and does nothing else. The
      // mask's own adjustment is neutralised for aim-walk's reason: a fresh Sky
      // mask arrives at Saturation 1.3, and an arm that leaves it there is
      // measuring chroma over half the picture and calling it the aim.
      await page.click("#ptab-basic");
      await page.evaluate(() => {
        const d = document.getElementById("dn");
        d.value = "0.9";
        d.dispatchEvent(new Event("input", { bubbles: true }));
        d.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await page.waitForTimeout(1200);
      await page.click("#ptab-masks");
      await page.click("#addSky");
      await page.waitForFunction(() => !document.getElementById("skyControls")?.hidden, null, { timeout: 120000 });
      await page.waitForTimeout(1500);
      await page.click("#mOutline"); // the coverage tint is drawn ON the canvas
      await page.evaluate(() => {
        const sv = document.getElementById("mSat");
        sv.value = "1";
        sv.dispatchEvent(new Event("input", { bubbles: true }));
        sv.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await page.waitForTimeout(800);
      await page.click("#mAimNoise");
      await page.waitForTimeout(1500);
      const armed = await page.getAttribute("#mAimNoise", "aria-pressed");
      if (armed !== "true") { fail(`${label}: the aim did not arm, so nothing below measures it`); throw new Error("not armed"); }

      // READ THE PREVIEW THROUGH A 2D CANVAS, not readPixels, because the other
      // side of THIS comparison is a decoded JPEG read that way — and the two
      // routes do not agree about channel order. Measured: with no mask and no
      // aim at all, readPixels against a JPEG decode reads 180 degrees apart in
      // hue with lightness matching to 0.2 points, which is red and blue
      // swapped and nothing to do with any edit. Arms 1-3 compare readPixels
      // with readPixels, so it cancels there and never showed. It does not
      // cancel here, and taken at face value it accused this walk's own subject
      // of a defect it does not have.
      const shown = await page.evaluate(`(() => {
        const read = ${READ};
        const c = document.querySelector("#view");
        const o = document.createElement("canvas");
        o.width = c.width; o.height = c.height;
        o.getContext("2d").drawImage(c, 0, 0);
        return read(o.getContext("2d").getImageData(0, 0, o.width, o.height).data);
      })()`);
      if (!shown) { fail(`${label}: the preview has no colour to read`); throw new Error("no preview"); }

      // A FINISHED EXPORT COLLECTS; IT DOES NOT FALL OUT OF THE PRESS. The first
      // version of this arm waited on a download straight after #exBtn and timed
      // out at ten minutes while the strip had read "Ready" since twenty
      // seconds in. Wait for Ready, then hand it over — the shape
      // tools/collect-walk.mjs already uses, which is where this was read from
      // rather than guessed at.
      await page.click("#ptab-export");
      await page.click("#exBtn");
      await page.waitForFunction(
        () => /^Ready \u2014/.test(document.getElementById("exportStripText")?.textContent || ""),
        null, { timeout: 600000 },
      );
      // ONE export hands over as the image itself through #exportSave;
      // #exportSaveAll is for two or more and stays hidden here, which is why
      // clicking it waited on an element that was never going to appear.
      await page.waitForFunction(
        () => { const a = document.getElementById("exportStripActions"); return a && !a.hidden; },
        null, { timeout: 120000 },
      );
      const dl = page.waitForEvent("download", { timeout: 120000 });
      dl.catch(() => {});
      await page.click("#exportSave");
      const file = await (await dl).path();
      const b64 = readFileSync(file).toString("base64");
      const saved = await page.evaluate(`(async () => {
        const read = ${READ};
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = "data:image/jpeg;base64," + ${JSON.stringify(b64)}; });
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        return read(c.getContext("2d").getImageData(0, 0, c.width, c.height).data);
      })()`);
      if (!saved) { fail(`${label}: the exported file has no colour to read`); throw new Error("no export"); }

      const dh = dHue(shown.hue, saved.hue), dl2 = Math.abs(shown.light - saved.light);
      console.log(`  ${label.padEnd(12)} shown hue ${String(shown.hue).padStart(3)} (${(shown.share*100).toFixed(0)}%) light ${shown.light.toFixed(1)}%   [denoise 0.9 aimed at a Sky mask]`);
      console.log(`  ${"".padEnd(12)} saved hue ${String(saved.hue).padStart(3)} (${(saved.share*100).toFixed(0)}%) light ${saved.light.toFixed(1)}%  \u00b7  ${dh}deg, ${dl2.toFixed(1)} points apart`);
      // The export is full resolution against a screen-sized preview and is
      // JPEG-compressed, so the bars match arm 2's rather than being tighter.
      if (dh > 30 || dl2 > 8) fail(`${label}: the preview and the export disagree with a mask aiming a spatial stage — ${dh}deg and ${dl2.toFixed(1)} points. The shader scales its gain and export.ts mixes a sampler; those two have drifted.`);
      else ok(`${label}: preview and export agree with a spatial stage aimed`);
    } catch (e) {
      if (!/not armed|no preview|no export/.test(String(e && e.message))) fail(`${label}: the arm could not run — ${e}`);
    } finally { await page.close(); }
  }
} finally { await br.close(); }
console.log(bad ? `\n${bad} failed\n` : "\nevery path renders the same photograph the same way\n");
process.exit(bad ? 1 : 0);
