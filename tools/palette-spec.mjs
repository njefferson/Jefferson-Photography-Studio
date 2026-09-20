#!/usr/bin/env node
// THE PALETTE SPEC, DERIVED FROM THE STYLESHEET THAT SHIPS.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/palette-spec.mjs > palettes/studio.json
//
// The hub's palette-check.mjs measures a JSON description of an app's colours
// against the hard floors in PALETTES.md. That description can be written by
// hand, and then it is a SECOND COPY of public/palette.css — which is the shape
// this family has been bitten by repeatedly, because the copy is what gets
// checked and the stylesheet is what ships.
//
// So it is generated: every family x theme is applied to a real document and
// the tokens are read RESOLVED, which also means an `rgba()` rail or a token
// defined through another token comes out as the value a browser computes
// rather than as the text in the file.
//
// Regenerate whenever public/palette.css changes. The output is committed
// because CI has no browser — it is an artefact, like the branch guard's hook.

import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: this renders through the build in `dist`, and a stale one
// renders the PREVIOUS build's pictures. See tools/fresh-dist.mjs.
requireFreshDist();
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { repo, surfaces } from "./surfaces.mjs";

const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const FAMILIES = [null, "paper", "mono", "soft"];
const THEMES = [null, "dawn"];
const ONE = join(repo, "public/examples/NIR_0063.dng");

  // ---- _renders: the accent-soft pairings this app ACTUALLY paints ----
  //
  // The hub's gate measures the full cross product of text roles against every
  // fill tinted with the accent wash, which is what makes a palette PORTABLE —
  // cleared against all of them it can be dropped into any app in the family.
  // Against this app it produced SEVENTEEN hard failures, and the wash would
  // have to drop from 15% to 2.9% alpha to clear them, which is not a fix but
  // the deletion of a visible state.
  //
  // `_renders` is the hub's own answer to that, and its instruction is exact:
  // the list must be MEASURED, never typed. So it is read off the real DOM —
  // every element whose own background is the accent wash and which paints
  // text, with the text colour and the ground beneath the wash each reverse
  // mapped to the role token they came from.
  //
  // AND AN INCOMPLETE LIST IS WORSE THAN NO LIST, because every pairing missing
  // from it turns a real defect into a note. The first version of this swept
  // the boot screen of one page and emitted two pairings; the same sweep
  // instrumented to report what it DROPPED found nine more elements painting
  // the wash — six `.accent-outline` buttons, the crop tools, the welcome-back
  // button and the install prompt — all measuring 0x0 because the editor had no
  // photo open. A sweep that only visits the state it happens to boot into
  // reports the states it visited, and nothing says which ones those were.
  //
  // VISIBILITY IS NOT THE TEST, THOUGH, and requiring it was a second hole.
  // What the gate needs is the triple of role tokens an element paints, and
  // `display:none` changes none of them: measured on all eight hidden wash
  // elements here, the ground each reverse-maps to while hidden is the SAME
  // one it maps to forced visible. So the colours are read whatever the
  // element's display, and the photo is opened because a state change can
  // swap a CLASS — not because a hidden element cannot be measured.
  //
  // So: every surface, a photo open on the editor, every dialog shown. And the
  // three ways a hole can open are ERRORS rather than skips —
  //
  //   * a text colour that reverse-maps to no known token,
  //   * a ground that reverse-maps to no role token or gradient stop,
  //
  // each aborts the generation and names the element, because a silently short
  // list is the fail-open this whole file exists to avoid. The accent ITSELF is
  // a known text colour here (#helpTutorials paints accent on the wash) and is
  // recorded as skipped rather than dropped: the gate forms no such pairing, so
  // it is out of scope for this list and NOT out of sight.
  //
  // Every floor OTHER than these stays hard: `floorFail` is called in exactly
  // one place in that gate, so this narrows the accent cross product and
  // nothing else.
export async function sweepRenders(b, PORT) {
  const pairs = new Set();
  const trouble = [];
  const skipped = new Set();
  for (const s of surfaces()) {
    for (const theme of THEMES) {
      const q = await b.newPage({ viewport: { width: 1100, height: 850 } });
      q.on("dialog", (d) => d.accept());
      try {
        await q.goto(`http://127.0.0.1:${PORT}/${s.file}`);
        await q.waitForTimeout(900);
        if (s.file === "ir.html") {
          await q.setInputFiles("#file", ONE);
          await q.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
          await q.waitForTimeout(2500);
        }
        const found = await q.evaluate(([theme, dialogs]) => {
          const r = document.documentElement;
          r.removeAttribute("data-palette");
          if (theme) r.setAttribute("data-theme", theme); else r.removeAttribute("data-theme");
          for (const id of dialogs) { const d = document.getElementById(id); try { if (d && !d.open) d.showModal(); } catch {} }
          const num = (c) => (c.match(/[\d.]+/g) || []).map(Number);
          const tok = (n) => { const e = document.createElement("span"); e.style.color = `var(${n})`;
            document.body.append(e); const v = num(getComputedStyle(e).color); e.remove(); return v; };
          const soft = tok("--accent-soft");
          const TEXT = [["text-1","--txt"],["text-2","--txt-2"],["text-3","--txt-3"]].map(([r2,n]) => [r2, tok(n)]);
          // Known, and deliberately NOT a text role: the gate pairs the three
          // text tokens against the wash and nothing else, so accent-on-wash
          // belongs in the report rather than in the list.
          const OFFROLE = [["accent","--accent"],["accent-soft","--accent-soft"]].map(([r2,n]) => [r2, tok(n)]);
          const GROUND = [["--page","--bg"],["--page-alt","--bg-2"],["--surface-1","--surface"],
                          ["--surface-2","--surface-2"],["--surface-3","--surface-3"]].map(([r2,n]) => [r2, tok(n)]);
          const near = (a, b, t = 3) => a.length >= 3 && b.length >= 3 &&
            Math.abs(a[0]-b[0]) < t && Math.abs(a[1]-b[1]) < t && Math.abs(a[2]-b[2]) < t;
          const nearA = (a, b) => near(a, b) && Math.abs((a[3] ?? 1) - (b[3] ?? 1)) < 0.02;
          const sel = (el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") +
            (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).join(".") : "");
          // THE GROUND CAN BE A GRADIENT, and then there is no single one. The
          // launcher paints its body `radial-gradient(..., var(--bg-2), var(--bg))`,
          // so a wash element there sits on --page-alt at the top of the screen
          // and --page at the bottom — two grounds, two contrast ratios, and
          // the honest answer is BOTH. The first version of this walked for an
          // opaque backgroundColor, found none anywhere up to <html>, and
          // dropped five real elements on the landing page.
          const groundUnder = (el) => { let n = el.parentElement;
            while (n) { const cs = getComputedStyle(n), c = num(cs.backgroundColor);
              if (c.length && (c[3] ?? 1) === 1) { const hit = GROUND.find(([, v]) => near(c, v));
                return hit ? [hit[0]] : { bad: cs.backgroundColor + " at " + sel(n) }; }
              if (cs.backgroundImage && cs.backgroundImage.includes("gradient(")) {
                const stops = (cs.backgroundImage.match(/rgba?\([^)]*\)/g) || []).map(num).filter((v) => (v[3] ?? 1) === 1);
                if (stops.length) {
                  const roles = [];
                  for (const st of stops) { const hit = GROUND.find(([, v]) => near(st, v));
                    if (!hit) return { bad: "gradient stop rgb(" + st.slice(0, 3).join(",") + ") at " + sel(n) };
                    roles.push(hit[0]); }
                  return [...new Set(roles)];
                }
              }
              n = n.parentElement; }
            return { bad: "no opaque ancestor and no gradient" }; };
          const pairs = [], trouble = [], skipped = [];
          for (const el of document.querySelectorAll("*")) {
            if (!nearA(num(getComputedStyle(el).backgroundColor), soft)) continue;
            const walk = (n) => { const got = [];
              for (const c of n.childNodes) {
                if (c.nodeType === 3 && c.textContent.trim()) got.push(n);
                else if (c.nodeType === 1) { const cb = num(getComputedStyle(c).backgroundColor); if (!(cb[3] > 0)) got.push(...walk(c)); }
              } return got; };
            const texts = [...new Set(walk(el))];
            if (!texts.length) continue;               // a wash with no text on it forms no pairing
            const ground = groundUnder(el);
            if (!Array.isArray(ground)) { trouble.push(`${sel(el)} sits on ${ground.bad}, which maps to no ground role`); continue; }
            for (const t of texts) {
              const fg = num(getComputedStyle(t).color).slice(0, 3);
              const role = TEXT.find(([, v]) => near(fg, v));
              if (role) { for (const g of ground) pairs.push(`--${role[0]} on --accent-soft over ${g}`); continue; }
              const off = OFFROLE.find(([, v]) => near(fg, v));
              if (off) { for (const g of ground) skipped.push(`--${off[0]} on --accent-soft over ${g} (${sel(t)}) — the gate forms no such pairing`); continue; }
              trouble.push(`${sel(t)} on the wash is ${getComputedStyle(t).color}, which maps to no text token`);
            }
          }
          return { pairs: [...new Set(pairs)], trouble: [...new Set(trouble)], skipped: [...new Set(skipped)] };
        }, [theme, s.dialogs]);
        for (const f of found.pairs) pairs.add(f);
        for (const f of found.skipped) skipped.add(f);
        for (const f of found.trouble) trouble.push(`${s.file} [${theme ?? "night"}] ${f}`);
      } finally { await q.close(); }
    }
  }
  return { pairs: [...pairs].sort(), trouble, skipped: [...skipped].sort() };
}

// THE SPEC CARRIES THE HASH OF WHAT IT WAS GENERATED FROM. A committed
// artefact derived from a file in the same tree is a SECOND COPY of that file,
// and the copy is what CI measures while the original is what ships — the exact
// shape this repo's header warns about and has been bitten by. Regenerating
// needs a browser and a server, so no commit hook can do it; but any hook can
// notice that the source moved and the artefact did not, which is the failure.
// tools/palette-spec-check.mjs is that hook.
const SRC = join(repo, "public/palette.css");
const out = {
  _: "GENERATED by tools/palette-spec.mjs from public/palette.css — do not hand-edit.",
  _source: { file: "public/palette.css", sha256: createHash("sha256").update(readFileSync(SRC)).digest("hex") },
  _renders: null,
};
// THE MAIN RUNS ONLY WHEN THIS FILE IS THE ENTRY POINT. tools/a11y-walk.mjs
// imports sweepRenders to re-measure the committed list against the running
// app, and an import that launched a browser and generated a whole spec would
// make that check cost more than the walk it lives in.
const b = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
  ? await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] })
  : null;
if (b) try {
  const p = await b.newPage({ viewport: { width: 1100, height: 850 } });
  await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
  await p.waitForTimeout(900);
  for (const fam of FAMILIES) for (const theme of THEMES) {
    const tokens = await p.evaluate(([fam, theme]) => {
      const r = document.documentElement;
      if (fam) r.setAttribute("data-palette", fam); else r.removeAttribute("data-palette");
      if (theme) r.setAttribute("data-theme", theme); else r.removeAttribute("data-theme");
      const read = (name) => {
        const e = document.createElement("span");
        e.style.color = `var(${name})`;
        document.body.append(e);
        const v = getComputedStyle(e).color;
        e.remove();
        return v;
      };
      const hex = (c) => {
        const m = (c.match(/[\d.]+/g) || []).map(Number);
        if (m.length >= 4 && m[3] < 1) return `rgba(${m[0]},${m[1]},${m[2]},${m[3]})`;
        return "#" + m.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
      };
      const t = {};
      for (const n of ["--bg","--bg-2","--surface","--surface-2","--surface-3","--line","--line-2","--txt","--txt-2","--txt-3","--accent","--accent-soft","--accent-ink"]) t[n] = hex(read(n));
      return t;
    }, [fam, theme]);
    const name = `${fam ?? "instrument"}-${theme ? "day" : "night"}`;
    // accentSoftAlpha comes from the accent-soft token's own alpha, so the spec
    // cannot disagree with the stylesheet about it.
    const soft = tokens["--accent-soft"].match(/[\d.]+/g);
    out[name] = {
      kind: "app",
      page: tokens["--bg"],
      pageAlt: tokens["--bg-2"],
      surfaces: [tokens["--surface"], tokens["--surface-2"], tokens["--surface-3"]],
      rail: tokens["--line-2"],
      hairline: tokens["--line"],
      text: [tokens["--txt"], tokens["--txt-2"], tokens["--txt-3"]],
      accents: { primary: tokens["--accent"] },
      // The text ON the accent fill, which is a different question from the
      // text tokens and is answered by a token of its own here. Left out, the
      // gate says so in a note and measures nothing — and this app paints it in
      // three places (#cropDone, the selected ratio chip, every .primary).
      onAccent: tokens["--accent-ink"],
      accentSoftAlpha: soft && soft.length >= 4 ? Number(soft[3]) : 0.15,
    };
  }

  const swept = await sweepRenders(b, PORT);
  if (swept.trouble.length) {
    process.stderr.write("the sweep could not account for what it saw, so the list would be short:\n");
    for (const t of swept.trouble) process.stderr.write("  " + t + "\n");
    await b.close();
    process.exit(1);
  }
  for (const k of swept.skipped) process.stderr.write("off-role, recorded not dropped: " + k + "\n");
  out._renders = swept.pairs;

  await p.close();
} finally { await b.close(); }
if (b) process.stdout.write(JSON.stringify(out, null, 1) + "\n");
