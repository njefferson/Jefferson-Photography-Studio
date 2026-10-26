#!/usr/bin/env node
// EVERY CONTROL IN THE APP, WITH WHAT IT SAYS AND WHAT IT PROMISES.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/control-walk.mjs [--port=8131] [--list]
//
// WHY IT EXISTS. On 2026-09-16 four controls were reported in one sitting,
// by hand, from the device: a "Share" button in the bar beside the photograph
// that shared the APP; a "Tutorials" button that left you on the landing screen;
// "Batch process", whose two words describe what Quick look does; and "Measure
// lens" sitting in a row of things you do to the open photograph. Nothing in
// this repository could have found any of them. The accessibility walk measures
// CONFORMANCE — contrast, hit area, a name being present — and every one of
// those four passed it, because each had a name and the name was simply wrong.
//
// So this asks the question no conformance check asks: DOES THE VISIBLE LABEL
// SAY WHAT THE CONTROL DOES? Half of that is taste and cannot be parsed. The
// other half is mechanical, and it is the half that produced three of the four:
//
//   THE TOOLTIP RULE. A `title` is a HOVER. There is no hover on a tablet, so
//   anything a title says and the visible label does not is a sentence the
//   reader this app is built for will never see. "Share" + title "Share this
//   app or copy its link" reads, on the device, as one word — and the word was
//   wrong. Measured when this was written: 43 of 268 controls carried a title,
//   and the rule is not "no titles" (a title that RESTATES the label is a
//   desktop nicety and harmless) but "no title that carries what the label
//   lacks".
//
// AND THE OTHER DIRECTION, WHICH IS DECISION 024. The tooltip rule above can
// only refuse a sentence that is in the WRONG PLACE. It has nothing to say
// about a control with no sentence anywhere — which is the half the record
// asked for: "a list of which controls still have nothing to say for
// themselves". Three places count, and they are the three the app actually
// uses: a permanent `.note` under the control, an `aria-describedby` pointing
// at one, or a toggletip the reader can press (src/toggletip.ts).
//
//   WHAT THAT LIST CANNOT SEE, said out loud rather than discovered later. It
//   reads POSITION, not aboutness. A note sitting after a run of four sliders
//   is credited to the LAST of them, because that is the only one it is
//   adjacent to — and a note that happens to sit there while being about
//   something else is credited just the same. No parser tells a sentence about
//   this control from a sentence about the next one. So this is a LIST and not
//   a refusal: it names what to go and look at, and the looking is a person's.
//
//   SCOPED TO LABELLED INPUT CONTROLS — sliders, selects, checkboxes. A
//   button's label is a verb phrase and is usually the whole sentence ("Reset
//   black & white"); a slider's is a noun that names a quantity and often is
//   not ("Strength", "Hot-spot size"). Widening this to every button would
//   bury the finding in four hundred rows of controls that are fine, and the
//   record's own measurement counts labelled sliders.
//
// The toggletip WIRING is a refusal, both ways, because it is mechanical: a
// trigger whose body is not in the page opens onto nothing, and a body no
// trigger names is a sentence with no route to it.
//
// It also PRINTS THE INVENTORY, grouped by surface, so reviewing every control
// in the app is one read of one page rather than a person tapping through it.
//
// AND IT PRESSES ITS WAY TO THE CONTROLS THE MARKUP ONLY SHOWS AFTER A PRESS
// (decision 046). A control that exists in the page and is not on screen until
// something is done is not looked at by a sweep that only looks, and the coverage
// section at the bottom is what said so: 60 of them, at the audit commit. Each
// was judged on its own. Where a plain press, a typed name, a small file or the
// browser's own window events puts the control on screen, this walk does that and
// samples what it finds, in the states below; where the state needs something a
// page cannot make for itself (an installed app, a second service worker, a file
// that carries a lens, a read that stalls) the control is declared in
// `.control-allow` with the state that would show it. Nothing is declared to get
// green: a declared control that a state here now reaches FAILS until its line is
// deleted, which is how the list only shrinks.
//
//   editorStates       one photograph open: the held balance, the straighten arm,
//                      the finishing panel, the panel scrolled, a sticker placed,
//                      a lens picked by hand, a healed spot, a LUT, a saved look's
//                      share dialog and its QR, the start screen with a
//                      photograph behind it
//   jpegSetStates      two camera JPEGs open (the one-band notice, a pick, the
//                      export row), a small export, and the graphics lost
//   stripStates        six frames at phone width, the strip scrolled away, and the
//                      start screen after a reload with that set left open
//   quickLookStates    a folder of two photographs, a pick, a second run
//   quickLookStopStates  a folder of twelve, caught while it builds and the Stop
//                      pressed, and the grid it leaves
//   lessonStates       a practice tile and its lesson card
//   padStates          the start screen as an iPad shows it
//   batchStates        a batch of four small frames, stopped after the first, and
//                      the leftovers it keeps
//   macroStates        two frames stacked
//   debugStates        a test run
//
// `.control-allow` declares the honest exceptions, one `page#id` per line with
// a reason after `—`, checked BOTH WAYS and printed on every run: a list that
// hides what it excuses is a list nobody audits.
import { chromium } from "playwright-core";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: this renders through the build in `dist`, and a stale one
// renders the PREVIOUS build's pictures. See tools/fresh-dist.mjs.
requireFreshDist();
import { readFileSync, existsSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PAGES, repo } from "./surfaces.mjs";

const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const BASE = `http://127.0.0.1:${PORT}`;
const LIST = process.argv.includes("--list");
const ALLOW = join(repo, ".control-allow");
// A bundled practice frame, so the editor is actually up when ir.html is swept.
const OPEN_WITH = "NIR_0063.dng";

/** The declared exceptions as a Map of `page#id` to its stated reason.
 *
 *  Takes nothing; reads `.control-allow` beside the repo root.
 *  Returns an empty Map when the file is absent, which is the state a repo
 *  adopting this gate starts in. Every key it returns is printed by the run and
 *  is asserted to still exist in the app, so the file can only shrink by
 *  somebody deleting a line — never by a control quietly going away. */
function allowList() {
  if (!existsSync(ALLOW)) return new Map();
  const out = new Map();
  for (const raw of readFileSync(ALLOW, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [key, ...why] = line.split("—");
    out.set(key.trim(), why.join("—").trim() || "(no reason given)");
  }
  return out;
}

/** Every control on whatever is currently on screen, read from the live DOM.
 *
 *  Takes `page`, a Playwright page, and `where`, the surface label to stamp on
 *  each row.
 *  Returns one row per control: its id, its VISIBLE text, its aria-label, its
 *  title and the surface. Scoped to the open dialog when there is one, because
 *  a modal's backdrop makes everything behind it unreachable and counting it
 *  would report controls the reader cannot touch. The tooltip rule below is its
 *  only consumer and reads `text`, `aria` and `title`. */
async function controlsOn(page, where) {
  return page.evaluate((w) => {
    const root = document.querySelector("dialog[open]") || document;
    const sel = "button, [role=button], summary, a[href], input[type=button], input[type=submit]";
    const out = [];
    for (const el of root.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;                 // not on screen at all
      if (el.closest("[hidden]") || el.hidden) continue;
      // `innerText` IS THE RENDERED TEXT, and a <summary> inside a collapsed
      // <details> renders as nothing — so the Help dialog's nested sections came
      // back nameless and the gate reported a defect that was its own. Fall back
      // to textContent, which is the label the DOM actually carries. Suspect the
      // instrument first (CLAUDE.md), and this is the third time that sentence
      // has paid for itself in this file's lifetime of one afternoon.
      const own = (el.innerText || el.textContent || el.value || "").replace(/\s+/g, " ").trim();
      // A BUTTON WHOSE CONTENT IS A PICTURE IS NAMED BY THE PICTURE'S alt, which is
      // what the browser's own name computation reads and innerText skips: a strip
      // thumbnail with its picture drawn read here as a control with no name, and
      // was not one. The alt is added only where the text does not already say it.
      const alts = [...el.querySelectorAll("img[alt]")].map((i) => (i.getAttribute("alt") || "").trim()).filter((a) => a && !own.includes(a));
      const text = [own, ...alts].join(" ").trim();
      out.push({
        where: w,
        id: el.id || "",
        tag: el.tagName.toLowerCase(),
        text,
        aria: (el.getAttribute("aria-label") || "").trim(),
        title: (el.getAttribute("title") || "").trim(),
      });
    }
    return out;
  }, where);
}

/** Every LABELLED INPUT CONTROL on whatever is currently on screen, with where
 *  its explanation lives — the decision-024 direction.
 *
 *  Takes `page`, a Playwright page, and `where`, the surface label to stamp on
 *  each row.
 *  Returns one row per visible control: its id, its label text, and `says` —
 *  the routes to an explanation that actually resolve, out of `describedby`,
 *  `toggletip` and `note`. An empty `says` is a control with nothing to say for
 *  itself anywhere, which is what the inventory below names. Read from the live
 *  DOM, so a `hidden` tab's controls are correctly absent rather than counted
 *  as fine. */
async function explainedOn(page, where) {
  return page.evaluate((w) => {
    const root = document.querySelector("dialog[open]") || document;
    const out = [];
    for (const el of root.querySelectorAll("input[type=range], input[type=checkbox], input[type=number], select")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (el.closest("[hidden]") || el.hidden) continue;
      const lab = el.closest("label");
      let name = "";
      if (lab) {
        for (const n of lab.childNodes) {
          if (n.nodeType === Node.TEXT_NODE) name += n.textContent || "";
          else if (n.nodeType === Node.ELEMENT_NODE && n.tagName === "SMALL") name += " " + (n.textContent || "");
        }
      }
      name = (name || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();

      const says = [];
      const desc = (el.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
      if (desc.some((id) => (document.getElementById(id)?.textContent || "").trim())) says.push("describedby");
      if (el.id && document.querySelector(`button[data-tip-for="${CSS.escape(el.id)}"]`)) says.push("toggletip");
      // THE ELEMENT IMMEDIATELY AFTER THE LABEL, and nothing further. Reaching
      // past one sibling is how a note four controls away gets credited to a
      // control it says nothing about, which would make this list agree with
      // the app about nothing at all.
      const after = (lab || el).nextElementSibling;
      if (after && (after.classList.contains("note") || after.classList.contains("tip-body") || after.classList.contains("note-more"))) {
        if ((after.textContent || "").trim()) says.push("note");
      }
      out.push({ where: w, id: el.id || "", tag: el.tagName.toLowerCase(), name, says });
    }
    return out;
  }, where);
}

/** The toggletip wiring on this page, read from the markup rather than from a
 *  press.
 *
 *  Takes `page`, a Playwright page.
 *  Returns `{ triggers, bodies }`: one row per `button[data-tip]` with the ids
 *  it names and whether each resolves, and the id of every `.tip-body` in the
 *  document with the count of triggers naming it. The caller refuses a trigger
 *  that opens onto nothing and a body no trigger can reach; both directions,
 *  because a sentence with no route to it is the same defect facing the other
 *  way. Reads the whole document, not the visible part: the panel is `hidden`
 *  until a photograph opens and the wiring is a fact about the markup. */
async function toggletipsOn(page) {
  return page.evaluate(() => {
    const triggers = [...document.querySelectorAll("button[data-tip]")].map((b) => {
      const bodyId = b.dataset.tip || "";
      const body = bodyId ? document.getElementById(bodyId) : null;
      const forId = b.dataset.tipFor || "";
      const ctl = forId ? document.getElementById(forId) : null;
      return {
        bodyId,
        forId,
        hasBody: !!body,
        bodyText: (body?.textContent || "").trim().length,
        hasControl: !!ctl,
        described: (ctl?.getAttribute("aria-describedby") || "").split(/\s+/).includes(bodyId),
      };
    });
    const bodies = [...document.querySelectorAll(".tip-body")].map((el) => ({
      id: el.id,
      named: document.querySelectorAll(`button[data-tip="${CSS.escape(el.id)}"]`).length,
    }));
    return { triggers, bodies };
  });
}

// Words the label is not required to repeat: they carry no meaning on their own.
const STOP = new Set(["the","a","an","and","or","to","of","it","its","this","that","is","for","with","on","in","from","your","you","as","at","by","one","all","no","not","be","into","when","what","which","so","if","up","out","then","there","here","also","just","every","each","any","use","used","like","than","only","still","them","they"]);
const words = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w));

/** The words a control's title says that its own visible label and aria-label
 *  do not.
 *
 *  Takes a row from `controlsOn`.
 *  Returns the array of uncovered words — empty when the title merely restates
 *  what is already readable, which is the passing case. The caller treats a
 *  non-empty result as a FAIL unless the control is declared in
 *  `.control-allow`; nothing else reads it. */
function uncovered(row) {
  if (!row.title) return [];
  const have = new Set([...words(row.text), ...words(row.aria)]);
  return words(row.title).filter((w) => !have.has(w));
}

// ===== THE STATES THE MARKUP ONLY SHOWS AFTER A PRESS (decision 046) ====================
//
// Each function below brings a page to a state a reader reaches by pressing, typing a
// name, choosing a small file or having the browser take something away, and SAMPLES
// what is on screen there exactly as the sweep above samples a tab: the same two
// readers, into the same two lists. A state that cannot be reached prints that, once,
// and the controls it would have shown stay unreached, which the coverage section then
// refuses by name — a walk that cannot do what it says must not go quiet about it.

/** Everything on screen now, as one more surface. Takes `page` and `where`, a label that
 *  opens with the page's file name and ` · ` (the dedup and the allow list key on it).
 *  Returns nothing; pushes into `rows` and `ctlRows`, the two lists every other sample
 *  fills, so a control seen only here is counted, named and held to the same rules. */
async function sample(page, where) {
  rows.push(...(await controlsOn(page, where)));
  ctlRows.push(...(await explainedOn(page, where)));
}

/** Press a control by id and give the page a moment. Takes `page`, the id and the wait in
 *  milliseconds. Returns nothing. A synthetic click, like the tab presses above: what
 *  matters here is that the state arrives, and each state's own sample says whether it did. */
async function press(page, id, wait = 250) {
  await page.evaluate((i) => document.getElementById(i)?.click(), id);
  await page.waitForTimeout(wait);
}

/** Run one state, and say so when it cannot be reached. Takes a name and an async function.
 *  Returns nothing and never throws: a state that fails leaves its controls unreached,
 *  which the coverage section fails by name, so nothing is lost by carrying on. */
async function attempt(name, fn) {
  try { await fn(); } catch (e) {
    console.log(`  (${name}: could not be reached — ${String((e && e.message) || e).split("\n")[0].slice(0, 160)}; what it shows stays unreached in this run)`);
  }
}

const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const FIXTURES = join(repo, "tools", "fixtures");
/** A 2-point 3D LUT, the smallest .cube there is: eight lines of red, green and blue. */
const CUBE = 'TITLE "Walk"\nLUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n';
/** `n` copies of a camera JPEG under different names, as file objects a picker can take.
 *  Takes the count. Returns the list `setInputFiles` wants. The names differ so that a
 *  set of them is a set of photographs and not one photograph asked for `n` times. */
function frames(n) {
  const bytes = readFileSync(join(FIXTURES, "camera-ir-a.jpg"));
  return Array.from({ length: n }, (_, i) => ({ name: `frame-${i + 1}.jpg`, mimeType: "image/jpeg", buffer: bytes }));
}

/** A context of its own with one page of the app open. Takes the browser, the context
 *  options, the page file and an async function of the page. Returns when the function
 *  has finished; the context is closed in a finally whatever happens. Service workers
 *  are blocked, as in the phone state above: these states are about the page's controls,
 *  not the offline shell, and a worker installing in the background would only be noise. */
async function inPage(br, opts, file, fn) {
  const ctx = await br.newContext({ serviceWorkers: "block", ...opts });
  try {
    const page = await ctx.newPage();
    page.on("dialog", (d) => d.accept());
    await page.goto(`${BASE}/${file}`, { waitUntil: "load" });
    await page.waitForTimeout(700);
    await fn(page);
  } finally { await ctx.close(); }
}

/** The editor with a practice raw open and the mask place left as the sweep above left it.
 *  Takes the page. Returns nothing. Every press here is undone before the next, so the
 *  states do not lean on each other. */
async function editorStates(page) {
  const at = (name) => sample(page, `ir.html · ${name}`);
  await press(page, "maskPlaceClose", 300);
  await press(page, "ptab-basic", 150);

  await attempt("ir.html, a balance held", async () => {
    // A NAME OF OUR OWN: the default is the date and time, which would put a clock
    // into the key of the list row this state shows. Typed and pressed in one task,
    // so nothing between the two can put the default back.
    await page.evaluate(() => {
      const box = document.getElementById("balName");
      if (box) { box.value = "Walk balance"; box.dispatchEvent(new Event("input", { bubbles: true })); }
      document.getElementById("balHoldBtn")?.click();
    });
    await page.waitForTimeout(300);
    const rowsKept = await page.evaluate(() => [...document.querySelectorAll("#balKept button.mask-pick")].map((b) => (b.textContent || "").trim()));
    // The declared key in .control-allow reads this row's text; say so when it is not the name typed.
    if (!rowsKept.includes("Held · Walk balance")) console.log(`  (ir.html, a balance held: the kept list reads ${JSON.stringify(rowsKept)}, not the name typed, so its row's key in .control-allow will not match)`);
    await at("a balance held");
    await press(page, "balBack", 300);
  });
  // THE OTHER ARM of the geometry tools, which the crop sweep above does not press:
  // #straightenBtn arms the line and the level and the nudges that crop's arm leaves
  // display:none.
  await attempt("ir.html, the straighten arm", async () => {
    await press(page, "ptab-crop", 200);
    await press(page, "straightenBtn", 400);
    await at("straighten armed");
    await press(page, "straightenBtn", 300);
  });
  await attempt("ir.html, the finishing panel", async () => {
    await press(page, "ptab-ir", 200);
    await press(page, "lookEir", 800);
    await at("Aerochrome pressed, its finishing panel up");
    await press(page, "finishClose", 300);
    await at("the finishing panel put away");
    await press(page, "lookNone", 600);
  });
  await attempt("ir.html, the panel scrolled", async () => {
    await page.evaluate(() => { const b = document.getElementById("panelBody"); if (b) { b.scrollTop = 400; b.dispatchEvent(new Event("scroll")); } });
    await page.waitForTimeout(300);
    await at("the panel scrolled down");
    await page.evaluate(() => { const b = document.getElementById("panelBody"); if (b) { b.scrollTop = 0; b.dispatchEvent(new Event("scroll")); } });
  });
  await attempt("ir.html, a sticker placed", async () => {
    await press(page, "ptab-stickers", 400);
    await page.evaluate(() => document.querySelector("#stickerAdd button")?.click());
    await page.waitForTimeout(800);
    await at("a sticker placed");
    await press(page, "stkClear", 400);
  });
  // A practice raw carries no lens in its EXIF, so the card asks for one; picking it by
  // hand is the route a reader takes and it turns the correction on.
  await attempt("ir.html, a lens picked by hand and a healed spot", async () => {
    await press(page, "ptab-corrections", 300);
    await page.evaluate(() => { const s = document.getElementById("hsLens"); if (s && s.options.length > 1) { s.selectedIndex = 1; s.dispatchEvent(new Event("change", { bubbles: true })); } });
    await page.waitForTimeout(200);
    await page.evaluate(() => { const s = document.getElementById("hsFL"); if (s && s.options.length > 1) { s.selectedIndex = 1; s.dispatchEvent(new Event("change", { bubbles: true })); } });
    await press(page, "hsApplyManual", 1200);
    await at("a lens picked by hand");
    await press(page, "healBtn", 300);
    const box = await page.evaluate(() => { const r = (document.getElementById("view") || document.querySelector("canvas")).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await page.mouse.click(box.x + box.w * 0.5, box.y + box.h * 0.5);
    await page.waitForTimeout(1500);
    await at("Heal armed, a spot healed");
    await press(page, "healClear", 300);
    await press(page, "healBtn", 300);
  });
  // A LUT, a saved look that carries it, and that look's share dialog. The QR needs a
  // name typed first: the first press with none only asks for one.
  await attempt("ir.html, a LUT and a saved look's share dialog", async () => {
    await press(page, "ptab-grade", 300);
    await page.setInputFiles("#lutFile", { name: "walk.cube", mimeType: "text/plain", buffer: Buffer.from(CUBE) });
    await page.waitForTimeout(1500);
    await at("a LUT on the photograph");
    await page.evaluate(() => document.querySelector(".slot-save")?.click());
    await page.waitForTimeout(600);
    await page.evaluate(() => document.querySelector(".slot-more")?.click());
    await page.waitForTimeout(600);
    await at("a saved look that carries a LUT, its share dialog");
    await page.fill("#lookName", "Walk look");
    await press(page, "lookShowQr", 800);
    await at("the share dialog, the QR shown");
    await press(page, "lookDlgClose", 300);
    await press(page, "lutRemoveBtn", 300);
  });
  await attempt("ir.html, the start screen with a photograph behind it", async () => {
    await press(page, "homeBtn", 600);
    await at("the start screen, a photograph behind it");
    await press(page, "welcomeBack", 400);
  });
}

/** Two camera JPEGs open: the one-band notice under a colour look, a pick, the Export
 *  tab's row for the picks, two small exports and the line they leave, and the graphics
 *  taken away last (the page cannot draw after it). Takes the browser. Returns nothing.
 *  Camera JPEGs of 1400 by 932, so an export is seconds and not a full-resolution encode. */
async function jpegSetStates(br) {
  await attempt("ir.html, two camera JPEGs", () => inPage(br, { viewport: { width: 900, height: 900 } }, "ir.html", async (page) => {
    const at = (name) => sample(page, `ir.html · ${name}`);
    await page.setInputFiles("#file", [join(FIXTURES, "camera-ir-a.jpg"), join(FIXTURES, "camera-ir-b.jpg")]);
    await page.waitForFunction(() => document.getElementById("welcome")?.hidden && document.querySelectorAll("#sessionThumbs .session-thumb").length === 2, null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    await press(page, "ptab-ir", 300);
    await press(page, "lookAero", 2000);
    await at("two camera JPEGs, a colour look on");
    await press(page, "sessionPick", 400);
    await press(page, "ptab-export", 400);
    await at("a pick made, the Export tab");
    const strip = (re) => page.waitForFunction((s) => new RegExp(s).test(document.getElementById("exportStripText")?.textContent || ""), re, { timeout: 120000 });
    await press(page, "exBtn", 100);
    await strip("^Ready —");
    await at("an export finished");
    await press(page, "exBtn", 100);
    await strip("^Ready —[\\s\\S]*exported, not yet saved");
    await at("two exports waiting");
    await press(page, "exportDismiss", 400);
    await at("the export line put away, the panel's row left");
    await page.evaluate(() => { const c = document.getElementById("view") || document.querySelector("canvas"); const g = c && (c.getContext("webgl2") || c.getContext("webgl")); g?.getExtension("WEBGL_lose_context")?.loseContext(); });
    await page.waitForTimeout(1500);
    await at("the graphics lost");
  }));
}

/** Six frames at phone width, and the strip scrolled away from the photograph being
 *  viewed: the way back to it only exists while the strip is overflowing and the photo
 *  is out of its window; then the page reloaded with the set still open. Takes the
 *  browser. Returns nothing. */
async function stripStates(br) {
  await attempt("ir.html, six frames at phone width", () => inPage(br, { viewport: { width: 302, height: 656 }, hasTouch: true }, "ir.html", async (page) => {
    await page.setInputFiles("#file", frames(6));
    await page.waitForFunction(() => document.getElementById("welcome")?.hidden && document.querySelectorAll("#sessionThumbs .session-thumb").length === 6, null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { const s = document.getElementById("sessionThumbs"); s.scrollLeft = s.scrollWidth; });
    await page.waitForTimeout(800);
    await sample(page, "ir.html · six frames at phone width, the strip scrolled away from the photograph");
    // AND THE SAME SET LEFT BEHIND BY A RELOAD: a session in storage is what puts
    // "Resume session" on the start screen, so the page is reloaded with the set open.
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(1500);
    await sample(page, "ir.html · the start screen after a set was left open");
  }));
}

/** Quick look on a folder of two practice raws, a pick made with the key every culling
 *  tool uses, and the same folder again (the second run comes back from the device, which
 *  is what puts "Build these again" on screen). Takes the browser. Returns nothing. */
async function quickLookStates(br) {
  const two = [join(repo, "dist", "examples", OPEN_WITH), join(repo, "dist", "examples", "NIR_0102.dng")];
  await attempt("ir.html, quick look", () => inPage(br, { viewport: { width: 900, height: 900 } }, "ir.html", async (page) => {
    const counted = () => page.waitForFunction(() => /^2 photos/.test(document.getElementById("qlCount")?.textContent || ""), null, { timeout: 240000 });
    const opened = () => page.waitForFunction(() => document.getElementById("quickLook")?.open, null, { timeout: 60000 });
    await page.setInputFiles("#quickFiles", two);
    await opened();
    await counted();
    await page.waitForTimeout(800);
    await sample(page, "ir.html · quick look, two photographs");
    await page.locator("#qlGrid .ql-tile").first().focus();
    await page.keyboard.press("p");
    await page.waitForTimeout(400);
    await sample(page, "ir.html · quick look, a pick made");
    await press(page, "qlClose", 400);
    await page.setInputFiles("#quickFiles", two);
    await opened();
    await counted();
    await page.waitForTimeout(800);
    await sample(page, "ir.html · quick look, the same folder again");
  }));
}

/** A quick look caught while its grid builds, "Stop building" pressed, and the grid it leaves.
 *  Takes the browser. Returns nothing. Twelve practice raws, so the build is still running when
 *  the walk looks; the button is waited for by itself at animation-frame polling and sampled the
 *  moment it is on screen, then pressed, and the state after it sampled again. If the build
 *  finishes before the walk can see the button, the state says so and `#qlStop` stays
 *  unreached, which the coverage section below then refuses by name. */
async function quickLookStopStates(br) {
  const many = readdirSync(join(repo, "dist", "examples")).filter((f) => f.endsWith(".dng")).sort().slice(0, 12).map((f) => join(repo, "dist", "examples", f));
  await attempt("ir.html, a quick look stopped part-way", () => inPage(br, { viewport: { width: 900, height: 900 } }, "ir.html", async (page) => {
    await page.setInputFiles("#quickFiles", many);
    await page.waitForFunction(() => { const b = document.getElementById("qlStop"); return !!b && !b.hidden && b.getBoundingClientRect().width > 0; }, null, { timeout: 60000, polling: "raf" });
    await sample(page, "ir.html · quick look, still building");
    await press(page, "qlStop", 100);
    await page.waitForFunction(() => document.getElementById("qlStop")?.hidden, null, { timeout: 120000 });
    await page.waitForTimeout(600);
    await sample(page, "ir.html · quick look, stopped part-way");
  }));
}

/** A practice tile on the start screen and the lesson card it opens. Takes the browser.
 *  Returns nothing. The card's other control, the floating "?", is shown only by "Got it"
 *  with learn mode off, and no state has the card open with learn mode off. */
async function lessonStates(br) {
  await attempt("ir.html, a practice photograph", () => inPage(br, { viewport: { width: 900, height: 900 } }, "ir.html", async (page) => {
    await page.evaluate(() => document.querySelector("#galleryList button.gal:not(.gal-library)")?.click());
    await page.waitForFunction(() => document.getElementById("lesson") && !document.getElementById("lesson").hidden, null, { timeout: 120000 });
    await page.waitForTimeout(800);
    await sample(page, "ir.html · a practice photograph, its lesson card");
  }));
}

/** The start screen as an iPad shows it: the app teaches Add to Home Screen there, since
 *  iOS has no install prompt. The user agent is what the app reads (src/platform.ts). */
async function padStates(br) {
  await attempt("ir.html, an iPad start screen", () => inPage(br, { viewport: { width: 820, height: 1180 }, userAgent: IPAD, hasTouch: true }, "ir.html", async (page) => {
    await sample(page, "ir.html · the start screen as an iPad shows it");
  }));
}

/** A batch of four small frames from the start screen, stopped after the first: the card
 *  while it runs, the card once it has stopped, and the start screen after a reload, where
 *  the finished frame it leaves behind is offered back. Takes the browser. Returns nothing.
 *  The look is the first the chooser lists; the frames are the camera JPEG fixture. */
async function batchStates(br) {
  await attempt("ir.html, a batch of four frames", () => inPage(br, { viewport: { width: 900, height: 900 } }, "ir.html", async (page) => {
    await press(page, "batchBtn", 300);
    await page.waitForFunction(() => document.getElementById("batchDlg")?.open, null, { timeout: 20000 });
    const chooser = page.waitForEvent("filechooser", { timeout: 20000 });
    await page.evaluate(() => document.querySelector("#bcLooks button")?.click());
    await (await chooser).setFiles(frames(4));
    const shown = (id) => page.waitForFunction((i) => { const b = document.getElementById(i); return !!b && !b.hidden && b.getBoundingClientRect().width > 0; }, id, { timeout: 180000, polling: "raf" });
    await shown("busyStop");
    await sample(page, "ir.html · a batch running");
    await press(page, "busyStop", 100);
    await shown("busySave");
    await sample(page, "ir.html · a batch stopped after its first frame");
    await press(page, "busyClose", 600);
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(1500);
    await sample(page, "ir.html · the start screen after a batch left unfinished");
  }));
}

/** Macro Studio with two frames loaded and stacked. Takes the page (macro.html, open).
 *  Returns nothing. The page takes JPEG and PNG, so the camera JPEG fixture stands in for a
 *  focus-shift burst; the result's controls exist only once a stack has finished. */
async function macroStates(page) {
  await attempt("macro.html, two frames stacked", async () => {
    await page.setInputFiles("#files", frames(2));
    await page.waitForFunction(() => !document.getElementById("work")?.hidden, null, { timeout: 60000 });
    await page.waitForTimeout(1200);
    await sample(page, "macro.html · two frames loaded");
    await press(page, "stackBtn", 100);
    await page.waitForFunction(() => !document.getElementById("compareBtn")?.hidden, null, { timeout: 180000 });
    await page.waitForTimeout(600);
    await sample(page, "macro.html · the frames stacked");
  });
}

/** The test page after one of its tests has run: "Copy the results" appears only then.
 *  Takes the page (debug.html, open). Returns nothing. The test chosen is the shortest,
 *  reading one photograph out of a big stored session. */
async function debugStates(page) {
  await attempt("debug.html, a test run", async () => {
    await press(page, "dBigRead", 100);
    await page.waitForFunction(() => !document.getElementById("dCopyAll")?.hidden, null, { timeout: 240000 });
    await sample(page, "debug.html · a test run");
  });
}

const served = await fetch(`${BASE}/ir.html`).then((r) => r.ok).catch(() => false);
if (!served) {
  console.error(`\nNothing is serving dist on :${PORT}.\n\n    python3 -m http.server ${PORT} --directory dist\n`);
  process.exit(2);
}

const allow = allowList();
const rows = [];
// The decision-024 direction, collected at exactly the same moments as `rows`:
// a labelled control is only visible on the tab it lives on, so a sweep that
// looks once looks at one tab in twelve.
const ctlRows = [];
const tipWiring = new Map();
const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  for (const s of PAGES) {
    const page = await br.newPage({ viewport: { width: 900, height: 900 } });
    page.on("dialog", (d) => d.accept());
    await page.goto(`${BASE}/${s.file}`, { waitUntil: "load" });
    await page.waitForTimeout(700);
    // COLD FIRST, WHERE THERE IS A COLD STATE. Opening a photograph is what
    // makes the editor exist — and it HIDES the start screen, so doing only that
    // traded one blind spot for another and lost the welcome card's five
    // controls while gaining the panel's. A page can have more than one resting
    // state, and sweeping one of them is not sweeping the page.
    if (s.file === "ir.html") {
      rows.push(...(await controlsOn(page, `${s.file} · start screen`)));
      ctlRows.push(...(await explainedOn(page, `${s.file} · start screen`)));
    }
    // A PHOTOGRAPH FIRST, OR THE EDITOR IS NOT THERE. Measured the day this was
    // written: with nothing open, #panel is `hidden` and the bar's edit actions
    // lay out at 0x0 — so a cold sweep of ir.html misses every panel control and
    // the Hold buttons, and reports green having looked at none of them. That is
    // the shape of gate this repository keeps paying for, and the coverage check
    // at the bottom is the half that can refuse.
    //
    // ONLY WHERE THERE IS SOMETHING TO OPEN, AND ON A BOUNDED WAIT. The first
    // version did this on every page: five of the seven have no `#file` and no
    // `#welcome`, so `setInputFiles` threw into a swallowing catch and then the
    // walk waited 300 SECONDS EACH for a condition that could never become true
    // — half an hour of a sweep that had already finished its work. A wait whose
    // condition cannot be reached is the same defect as a guessed sleep, one
    // layer down.
    const openable = await page.$("#file");
    if (openable && existsSync(join(repo, "dist", "examples", OPEN_WITH))) {
      await page.setInputFiles("#file", join(repo, "dist", "examples", OPEN_WITH)).catch(() => {});
      const up = await page
        .waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 90000 })
        .then(() => true)
        .catch(() => false);
      // SAY SO RATHER THAN SWEEP AN EMPTY EDITOR. Falling through quietly is how
      // the first version reported green over a page it never opened.
      if (!up) console.log(`  (${s.file}: the practice frame never opened — the editor's controls are not in this run)`);
      await page.waitForTimeout(1500);
    }
    {
      const w = s.file === "ir.html" ? `${s.file} · with a photo open` : s.file;
      rows.push(...(await controlsOn(page, w)));
      ctlRows.push(...(await explainedOn(page, w)));
      // ONCE PER PAGE, AFTER THE APP HAS BOOTED. src/toggletip.ts appends each
      // trigger's accessible name at wire time, so reading before boot reads a
      // page the reader never sees.
      tipWiring.set(s.file, await toggletipsOn(page));
    }
    // Every panel tab on ir.html is its own set of controls and only one is on
    // screen at a time — a sweep of the page at rest sees one of eleven.
    //
    // AND THE MASK PLACE, which is not a tab (decision 042). Masks left the
    // strip in 2.60, so this enumeration stopped reaching the five mask
    // adjustments, the six aim toggles, the selection controls, the join radios
    // and the add buttons — every one of them would have become an unreached,
    // undeclared control while this walk went on printing the same coverage
    // number. The record warned about exactly this by name: "a new panel is NOT
    // automatically swept."
    const tabs = await page.evaluate(() =>
      [...document.querySelectorAll("#panelTabs .ptab")].map((t) => t.id).filter(Boolean));
    tabs.push("maskPlaceOpen");
    for (const t of tabs) {
      await page.evaluate((i) => document.getElementById(i)?.click(), t);
      await page.waitForTimeout(120);
      // The mask editor only exists once there IS a mask, and its groups are
      // <details> — a collapsed one hides its controls from this sweep exactly
      // as a closed tab does. Make one and open them all.
      if (t === "maskPlaceOpen") {
        // ONE MASK OF EACH KIND THAT CARRIES ITS OWN CONTROLS. #colorControls
        // and #brushControls exist only while a Color or a Brush mask is
        // selected, so a sweep that makes a Radial and stops leaves
        // #mColorPick, #mPaint, #mErase and #mClearBrush declared in the markup
        // and never reached — excused by unreachability rather than measured.
        // Each kind is added and then SELECTED, because the editor shows the
        // selected mask's controls and adding leaves the newest one selected.
        // addSky is in the list for the same reason as the other two, and it
        // is the slow one: the sky is DETECTED, so the controls arrive when the
        // detection lands rather than on a clock. Without it #mSkyByColour,
        // #mSkyFixAdd, #mSkyFixCut and #mSkyFixClear stay unreached — four more
        // controls excused by unreachability, which is the thing this branch
        // exists to stop.
        for (const add of ["addRadial", "addColor", "addBrush", "addSky"]) {
          await page.evaluate((a) => document.getElementById(a)?.click(), add);
          if (add === "addSky") {
            await page.waitForFunction(() => !document.getElementById("skyControls")?.hidden, null, { timeout: 180000 })
              .catch(() => console.log(`  (the sky never resolved, so ${s.file} sky controls stay unmeasured)`));
          }
          await page.waitForTimeout(500);
          // The groups are <details>; a collapsed one hides its controls from
          // this sweep exactly as a closed tab does.
          await page.evaluate(() => document.querySelectorAll(".mask-group").forEach((d) => { d.open = true; }));
          await page.waitForTimeout(150);
          rows.push(...(await controlsOn(page, `${s.file} · ${t} · ${add}`)));
          ctlRows.push(...(await explainedOn(page, `${s.file} · ${t} · ${add}`)));
        }
        // AND WITH THE LAST ONE PICKED AND THE PLACE CLOSED (042, stage 2). The
        // chip row, the Editing line with Back to whole photo, and Warmth in
        // place of the three gains exist only in this state, so a sweep of the
        // open place leaves them declared and never reached. The place is
        // opened again so the lines below see what they always saw.
        await page.evaluate(() => document.getElementById("maskPlaceClose")?.click());
        await page.waitForTimeout(300);
        await page.evaluate(() => document.getElementById("ptab-basic")?.click());
        await page.waitForTimeout(150);
        rows.push(...(await controlsOn(page, `${s.file} · a mask picked`)));
        ctlRows.push(...(await explainedOn(page, `${s.file} · a mask picked`)));
        // AND ITS TONE TAB (042, stage 2b). While a mask is picked the curve on this
        // tab is THE MASK'S OWN curve, and "Reset this mask's curve" is shown with it
        // and in no other state, so a sweep that looks at the tab with nothing picked
        // leaves it declared and never reached.
        await page.evaluate(() => document.getElementById("ptab-tone")?.click());
        await page.waitForTimeout(150);
        rows.push(...(await controlsOn(page, `${s.file} · a mask picked, the Tone tab`)));
        ctlRows.push(...(await explainedOn(page, `${s.file} · a mask picked, the Tone tab`)));
        await page.evaluate(() => document.getElementById("ptab-basic")?.click());
        await page.waitForTimeout(100);
        await page.evaluate(() => document.getElementById("maskPlaceOpen")?.click());
        await page.waitForTimeout(150);
      }
      rows.push(...(await controlsOn(page, `${s.file} · ${t}`)));
      ctlRows.push(...(await explainedOn(page, `${s.file} · ${t}`)));
      // AND THE TOOLS THAT ARM, which are not a tab and are not on screen at
      // rest. The crop bar floats over the photograph and only exists while the
      // tool is armed — five controls the coverage check below found missing,
      // reachable with one press. Everything else still unreached is genuinely
      // state-dependent (a waiting update, a file with GPS in it, a finished
      // export) and is declared in .control-allow with what would make it
      // appear, rather than quietly counted as looked at.
      if (t === "ptab-crop") {
        await page.evaluate(() => document.getElementById("cropBtn")?.click());
        await page.waitForTimeout(250);
        rows.push(...(await controlsOn(page, `${s.file} · crop armed`)));
        ctlRows.push(...(await explainedOn(page, `${s.file} · crop armed`)));
        await page.evaluate(() => document.getElementById("cropBtn")?.click());
        await page.waitForTimeout(150);
      }
    }
    for (const id of s.dialogs) {
      const opened = await page.evaluate((i) => {
        const d = document.getElementById(i);
        if (!d) return false;
        try { if (!d.open) d.showModal(); } catch { return false; }
        return true;
      }, id);
      if (!opened) continue;
      await page.waitForTimeout(150);
      rows.push(...(await controlsOn(page, `${s.file} · ${id}`)));
      ctlRows.push(...(await explainedOn(page, `${s.file} · ${id}`)));
      await page.evaluate(() => document.querySelector("dialog[open]")?.close());
    }
    // THE STATES THAT NEED A PRESS, last, because they change the edit and put it back.
    if (s.file === "ir.html") await editorStates(page);
    if (s.file === "macro.html") await macroStates(page);
    if (s.file === "debug.html") await debugStates(page);
    await page.close();
  }
  // AND THE WAY BACK TO THE WHOLE PHOTOGRAPH (053), which exists only on a
  // phone-sized screen where the strip of photos leaves the photograph no
  // room. #viewEscape is `hidden` in every state the 900px sweep above reaches,
  // so 2.65 added it and the coverage check below refused it, correctly. The
  // state is the one tools/stage-share-walk.mjs measures: two practice frames
  // open at 302x656, an iPhone at 1.33x page zoom. Waited on by the button
  // itself, bounded, and said out loud when it does not come.
  {
    const ctx = await br.newContext({ viewport: { width: 302, height: 656 }, hasTouch: true, serviceWorkers: "block" });
    const page = await ctx.newPage();
    page.on("dialog", (d) => d.accept());
    await page.goto(`${BASE}/ir.html`, { waitUntil: "load" });
    await page.setInputFiles("#file", [OPEN_WITH, "NIR_0102.dng"].map((f) => join(repo, "dist", "examples", f))).catch(() => {});
    const up = await page.waitForFunction(() => !document.getElementById("viewEscape")?.hidden, null, { timeout: 180000 })
      .then(() => true).catch(() => false);
    if (!up) console.log("  (ir.html: Show the whole photo never appeared at 302x656 with two photographs open, so it stays unreached in this run)");
    else {
      rows.push(...(await controlsOn(page, "ir.html · a phone, the strip leaving the photograph no room")));
      ctlRows.push(...(await explainedOn(page, "ir.html · a phone, the strip leaving the photograph no room")));
    }
    await ctx.close();
  }
  // AND THE STATES THAT NEED A CONTEXT OF THEIR OWN (decision 046), cheapest first.
  await padStates(br);
  await lessonStates(br);
  await stripStates(br);
  await jpegSetStates(br);
  await batchStates(br);
  await quickLookStates(br);
  await quickLookStopStates(br);
} finally { await br.close(); }

// ONE ROW PER CONTROL, and the dedup key is the CONTROL rather than the place
// it was seen. Keying on the surface counted the top bar once per panel tab and
// once per dialog — eleven tabs and fifteen dialogs on ir.html alone — which
// turned 5 real findings into 50 identical lines and a control count of 526.
// The instrument was wrong before the finding was; a repeated failure is the
// shape that says so.
//
// A control with no id keeps its surface in the key: those are built in script,
// many to a grid, and two of them on different surfaces are genuinely two.
const seen = new Map();
for (const r of rows) {
  const page = r.where.split(" \u00b7 ")[0];
  const k = r.id ? `${page}|${r.id}` : `${r.where}|${r.text}|${r.title}`;
  if (!seen.has(k)) seen.set(k, r);
}
const all = [...seen.values()];
const key = (r) => `${r.where.split(" · ")[0]}#${r.id || r.text.slice(0, 24)}`;

if (LIST) {
  const lines = all.filter((r) => uncovered(r).length).map((r) => `${key(r)} — WHY`);
  writeFileSync(ALLOW + ".seed", [...new Set(lines)].sort().join("\n") + "\n");
  console.log(`seed written to ${ALLOW}.seed`);
}

console.log(`\n=== every control in the app · ${all.length} on ${PAGES.length} pages ===\n`);
let last = "";
for (const r of all) {
  if (r.where !== last) { console.log(`\n  ${r.where}`); last = r.where; }
  const name = r.text || r.aria || "(no name)";
  const t = r.title ? `   [title: ${r.title}]` : "";
  console.log(`    ${(r.id || "-").padEnd(20)} ${name.slice(0, 54)}${t}`);
}

let failed = 0;
const fail = (s) => { failed++; console.log(`  FAIL  ${s}`); };

console.log(`\n=== the tooltip rule: a hover is not a label on a touch screen ===\n`);
const used = new Set();
const bad = [];
for (const r of all) {
  const miss = uncovered(r);
  if (!miss.length) continue;
  const k = key(r);
  if (allow.has(k)) { used.add(k); continue; }
  bad.push([k, r, miss]);
}
for (const [k, r, miss] of bad) {
  fail(`${k}: the label reads "${r.text || r.aria}" and only the tooltip says ${JSON.stringify(miss.join(" "))}`);
}
if (!bad.length) console.log("  ok    no control hides its meaning in a tooltip");

console.log(`\n=== every control with no name at all ===\n`);
// The same declarations cover this rule: #askOk and #askCancel have no label
// until whatever is asking writes one, and that is a fact about the control
// rather than about which rule caught it.
const nameless = all.filter((r) => !r.text && !r.aria && !(allow.has(key(r)) && used.add(key(r))));
for (const r of nameless) fail(`${key(r)}: a ${r.tag} with no visible text and no aria-label`);
if (!nameless.length) console.log("  ok    every control has a name");

// ===== DECISION 024, BOTH HALVES =====================================
//
// The wiring half REFUSES, because it is mechanical and cannot be a matter of
// opinion. The inventory half PRINTS, because deciding whether a control needs
// a sentence is the judgement the record left to a person — and a gate that
// failed on all of them would be a red light nobody could turn off honestly.
console.log(`\n=== the toggletip wiring: a press opens something, and every sentence has a press ===\n`);
let tipCount = 0;
for (const [file, w] of tipWiring) {
  for (const t of w.triggers) {
    tipCount++;
    if (!t.hasBody) fail(`${file}: a toggletip names data-tip="${t.bodyId}" and nothing in the page has that id — the press opens onto nothing`);
    else if (!t.bodyText) fail(`${file}: the toggletip body #${t.bodyId} is empty — the press opens onto nothing`);
    if (!t.forId) fail(`${file}: the toggletip for #${t.bodyId} names no control (data-tip-for) — its accessible name cannot carry which control it is about`);
    else if (!t.hasControl) fail(`${file}: a toggletip claims data-tip-for="${t.forId}" and no such control exists`);
    else if (!t.described) fail(`${file}: #${t.forId} does not point at #${t.bodyId} with aria-describedby — a screen reader is told only if it finds the button`);
  }
  for (const b of w.bodies) {
    if (b.named === 0) fail(`${file}: #${b.id} is a toggletip body no trigger names — a sentence with no route to it`);
    if (b.named > 1) fail(`${file}: ${b.named} triggers name #${b.id} — one sentence, one press`);
  }
}
console.log(`  ${tipCount} toggletip${tipCount === 1 ? "" : "s"} across ${tipWiring.size} page(s)`);

console.log(`\n=== decision 024: labelled controls with nothing to say for themselves ===\n`);
// One row per CONTROL, like the inventory above: a slider lives on one tab but
// is read again on every dialog sweep of the same page.
const ctlSeen = new Map();
for (const r of ctlRows) {
  const page = r.where.split(" · ")[0];
  const k = r.id ? `${page}|${r.id}` : `${r.where}|${r.name}`;
  if (!ctlSeen.has(k) || (ctlSeen.get(k).says.length === 0 && r.says.length)) ctlSeen.set(k, r);
}
const labelled = [...ctlSeen.values()];
// Its own key: `key` above reads `r.text`, which is the BUTTON inventory's
// field. Sharing it read undefined and threw — two row shapes, one accessor.
const ctlKey = (r) => `${r.where.split(" · ")[0]}#${r.id || r.name.slice(0, 24)}`;
// A declaration in `.control-allow` excuses a control here too, and is MARKED
// USED — the file is checked both ways, so an excuse that stops being consulted
// has to stop being an excuse.
const silent = labelled.filter((r) => {
  if (r.says.length) return false;
  const k = ctlKey(r);
  if (allow.has(k)) { used.add(k); return false; }
  return true;
});
let lastWhere = "";
for (const r of silent) {
  if (r.where !== lastWhere) { console.log(`\n  ${r.where}`); lastWhere = r.where; }
  console.log(`    ${(r.id || "-").padEnd(20)} ${r.name.slice(0, 54)}`);
}
console.log(
  `\n  ${silent.length} of ${labelled.length} labelled controls say nothing for themselves in any of the three places.` +
  `\n  ${labelled.length - silent.length} do: a note beside them, an aria-describedby, or a toggletip.` +
  `\n  This is a LIST, not a refusal — see the header for what it cannot see.\n`,
);

console.log(`\n=== coverage: every control the markup declares was reached ===\n`);
const reached = new Set(all.map((r) => r.id).filter(Boolean));
for (const s of PAGES) {
  const html = readFileSync(join(repo, "dist", s.file), "utf8");
  const declared = [...html.matchAll(/<(?:button|summary|a)\s[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
  const missed = declared.filter((id) => !reached.has(id));
  const excused = missed.filter((id) => allow.has(`${s.file}#${id}`));
  excused.forEach((id) => used.add(`${s.file}#${id}`));
  const real = missed.filter((id) => !allow.has(`${s.file}#${id}`));
  console.log(`    ${s.file.padEnd(24)} ${declared.length - missed.length}/${declared.length} reached${excused.length ? `, ${excused.length} declared unreachable` : ""}`);
  for (const id of real) fail(`${s.file}#${id}: declared in the markup and never reached by this sweep`);
}

// LAST, BECAUSE `used` IS NOT COMPLETE UNTIL THE COVERAGE PASS HAS RUN. This
// block sat above it and reported every coverage declaration as unnecessary —
// 79 failures, none of them real, from a gate checking its own bookkeeping
// before the bookkeeping was done.
if (allow.size) {
  console.log(`\n=== declared exceptions · ${allow.size} ===\n`);
  for (const [k, why] of allow) {
    console.log(`    ${k} — ${why}`);
    if (!used.has(k)) fail(`${k} is declared in .control-allow and no longer needs to be — delete the line`);
  }
}

// EVERY CONTROL THE MARKUP DECLARES HAS TO HAVE BEEN LOOKED AT.
//
// This is the half that makes the rest mean something. A sweep can only refuse
// what it reached, and "reached" is invisible from the output: the first version
// of this file reported green over a top bar whose edit actions were laid out at
// 0x0 and a panel that was `hidden`, having never opened a photograph. Both
// directions, like tools/surfaces.mjs: an id in the built page that the sweep
// never saw FAILS, and a declaration for a control that no longer exists FAILS
// too. Read from `dist/`, not the source tree, for the same reason surfaces.mjs
// does — a page can be generated at build time.
console.log(failed ? `\n  ${failed} control(s) to answer for\n` : `\n  every control says what it does, in words the reader can see\n`);
process.exit(failed ? 1 : 0);
