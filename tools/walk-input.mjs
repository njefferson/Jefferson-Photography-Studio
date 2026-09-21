#!/usr/bin/env node
// HOW A WALK REACHES A CONTROL, AND WHY THE TWO ROUTES ARE NOT THE SAME.
//
// Every walk in this directory had its own copy of the same four lines — set
// `.value`, dispatch `input`, dispatch `change` — and NONE of them read the
// value back. That is fine while it works and silent when it does not: a
// control whose id has been renamed, a panel that is not on screen, a slider
// whose step rejects the number, all produce the identical "ok" and a walk
// that measured the unchanged photograph.
//
// WHAT IT COST, 2026-09-21. Three rounds went into why Dehaze appeared to do
// nothing, on a harness that drove it with a real pointer drag, a click on the
// track and a focused ArrowRight. Six sliders — Saturation, Contrast, Hue,
// Exposure, Clarity, Dehaze — were unmoved by all three, with focus landing on
// each. Six for six is the INTERACTION, not six broken controls: the synthetic
// pointer in this container does not move a range input. The route that does
// work was already in the repository, in every walk here.
//
// SO THERE ARE TWO ROUTES AND THE CHOICE IS NOT TASTE.
//   setValue()  — plain VALUE controls: Exposure, Dehaze, Clarity, Contrast,
//                 Saturation, and any other slider that only carries a number.
//                 Dispatched events, value read back, throws if it did not land.
//   dragSlider() — controls with a MODE behind them: a mask's own sliders put
//                 the app into its adjusting state, where a dispatched event
//                 leaves it half-entered and the coverage overlay never comes
//                 back. Those take a real pointer gesture. Hub LESSONS §348 is
//                 the measurement: a matte read the photograph's own red-minus-
//                 blue for three rounds because the app was still in the state
//                 a dispatched event had left it in.
//
// The reading-back is the whole point. A helper that only sets is the four
// lines every walk already had.
import { strict as assert } from "node:assert";

/** SET A PLAIN VALUE CONTROL AND PROVE IT LANDED.
 *
 *  Takes `page` (a Playwright page on the app), `id` (the element id, without
 *  the `#`) and `v` (the value; numbers are stringified). Sets `.value`,
 *  dispatches `input` then `change` — the pair the app's own listeners are
 *  bound to — and reads `.value` back.
 *
 *  Returns the value the control is actually carrying afterwards, as a string.
 *  THROWS when the element is missing or the value did not land, because the
 *  caller's next measurement would otherwise be of the unchanged photograph
 *  reported as the changed one. Never use it on a mask-panel control: see the
 *  header, and dragSlider below.
 */
export async function setValue(page, id, v) {
  const want = String(v);
  const got = await page.evaluate(([i, x]) => {
    const el = document.getElementById(i);
    if (!el) return null;
    el.value = x;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return el.value;
  }, [id, want]);
  assert.notEqual(got, null, `setValue: #${id} is not in the document`);
  assert.equal(got, want, `setValue: #${id} would not take ${want} — it reads ${got}`);
  return got;
}

/** READ A CONTROL'S VALUE, with the same missing-element refusal.
 *
 *  Takes `page` and `id`. Returns the element's `.value` as a string.
 *  THROWS when the element is absent, so a walk that has drifted off a renamed
 *  id fails at the read rather than comparing `undefined` to `undefined` and
 *  calling it unchanged. */
export async function getValue(page, id) {
  const got = await page.evaluate((i) => document.getElementById(i)?.value ?? null, id);
  assert.notEqual(got, null, `getValue: #${id} is not in the document`);
  return got;
}

/** DRAG A SLIDER WITH A REAL POINTER, for controls that carry a MODE.
 *
 *  Takes `page`, `id` and `frac` (0..1 along the track). Presses on the track
 *  at that fraction and releases, so the app sees pointerdown/up and leaves its
 *  adjusting state the way a finger would.
 *
 *  Returns the value the control carries afterwards, as a string. It does NOT
 *  assert a target, because a drag lands where the track's geometry puts it —
 *  the caller checks the returned value against what it needs. Slower and less
 *  precise than setValue; use it only where the mode matters (hub §348). */
export async function dragSlider(page, id, frac) {
  const box = await (await page.waitForSelector(`#${id}`, { state: "visible" })).boundingBox();
  assert.ok(box, `dragSlider: #${id} has no box — is its panel on screen?`);
  const x = box.x + box.width * Math.max(0, Math.min(1, frac));
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y);
  await page.mouse.up();
  return getValue(page, id);
}
