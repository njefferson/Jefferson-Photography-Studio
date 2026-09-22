// A CONTROL'S OWN SENTENCE, REACHED BY A FINGER — the toggletip of decision 024.
//
// A `title` is a HOVER and there is no hover on a tablet, which is the rule
// `tools/control-check.mjs` already refuses against: anything a title says that
// the visible label does not is a sentence this app's reader will never see.
// The field separates two answers and only one of them is reachable here. A
// TOOLTIP is hover-or-focus and describes its trigger; a TOGGLETIP is a real
// BUTTON the reader presses, which reveals its text and announces it through a
// live region. This is the toggletip.
//
// WHY MOST CONTROLS DO NOT GET ONE, and this is the load-bearing half. The
// permanent note beside a control is this app's majority answer — 112 of them
// against 71 labelled sliders — and a short sentence that fits on screen is
// better visible than hidden behind a press. Nothing here replaces a note. This
// is for the controls where the sentence would push the panel apart: a run of
// five tone points that would cost five paragraphs between the curve and the
// reader, and a one-word "Strength" whose honest explanation is a paragraph.
//
// NOTHING IS WRITTEN TWICE. The sentence lives once, in the revealed element.
// The trigger's accessible name is built HERE from the control's own label, so
// renaming a slider renames every mention of it; and the control points at the
// same element with `aria-describedby`, so a screen reader is told without
// having to find the button at all.
//
// THE STATE IS IN THE WORDS. The marker turns, but the label changes too
// ("What this does" / "Hide this") — a rotation alone is a shape, and shape
// alone carries meaning no better than colour alone does.

/** The word on a closed trigger, and on an open one. They must differ: the
 *  marker's rotation is a second cue and never the only one. */
const SHUT_WORD = "What this does";
const OPEN_WORD = "Hide this";

/** The visible name of the control a trigger belongs to, read from the app
 *  rather than repeated in the trigger's markup.
 *
 *  Takes `id`, the id a trigger's `data-tip-for` names.
 *  Returns the control's own label text — the `<label>` that wraps it, minus
 *  the control itself — or its `aria-label`, or "" when the id names nothing.
 *  The caller appends this to the trigger's accessible name, so a trigger whose
 *  control is renamed is renamed with it; "" is why a missing control leaves
 *  the trigger reading "What this does" rather than a stale name. */
function labelFor(id: string): string {
  const el = id ? document.getElementById(id) : null;
  if (!el) return "";
  const lab = el.closest("label");
  let text = "";
  if (lab) {
    for (const node of Array.from(lab.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? "";
      else if (node instanceof Element && node.tagName === "SMALL") text += " " + (node.textContent ?? "");
    }
  }
  if (!text.trim()) text = el.getAttribute("aria-label") ?? "";
  return text.replace(/\s+/g, " ").trim();
}

/** Wire every toggletip trigger under `root` and hand each one its live region.
 *
 *  Takes `root`, the subtree to wire (default: the whole document), and
 *  `liveId`, the id of the ONE `role="status"` region this app announces
 *  through — present from parse, never created here, because a live region
 *  added at press time is not reliably announced.
 *  Returns how many triggers were wired.
 *
 *  What the result must satisfy: it equals the number of `button[data-tip]`
 *  elements under `root`. A shortfall means a trigger names a body that is not
 *  in the page — the defect `tools/control-check.mjs` refuses in both
 *  directions, so it cannot ship; the count is how a caller sees it anyway.
 *  Consumers: `src/main.ts`, once, after the panel exists. */
export function wireToggletips(root: ParentNode = document, liveId = "tipLive"): number {
  const live = document.getElementById(liveId);
  const triggers = Array.from(root.querySelectorAll<HTMLButtonElement>("button[data-tip]"));
  const pairs: { btn: HTMLButtonElement; body: HTMLElement; name: string }[] = [];

  for (const btn of triggers) {
    const body = document.getElementById(btn.dataset.tip ?? "");
    // NOT A SILENT SKIP WITH A CONSEQUENCE. A trigger whose body is missing is
    // left exactly as the markup wrote it and is NOT counted, so the returned
    // number falls short and says so. Hiding it here would turn a wiring defect
    // into a control that quietly does nothing, which is the failure this whole
    // item is about.
    if (!body) continue;
    const name = labelFor(btn.dataset.tipFor ?? "");
    if (name) {
      const who = document.createElement("span");
      who.className = "sr-only";
      who.textContent = ` — ${name}`;
      btn.appendChild(who);
    }
    btn.setAttribute("aria-controls", body.id);
    btn.setAttribute("aria-expanded", "false");
    body.hidden = true;
    pairs.push({ btn, body, name });
  }

  const say = (text: string) => {
    if (live) live.textContent = text;
  };

  /** Open one and close the rest. ONE AT A TIME, because the whole promise of
   *  this mechanism is that it does not push the controls apart when it is not
   *  wanted — and three left open is three notes nobody asked to keep. */
  const show = (target: { btn: HTMLButtonElement; body: HTMLElement; name: string } | null) => {
    for (const p of pairs) {
      const on = p === target;
      p.body.hidden = !on;
      p.btn.setAttribute("aria-expanded", String(on));
      const txt = p.btn.querySelector(".toggletip-txt");
      if (txt) txt.textContent = on ? OPEN_WORD : SHUT_WORD;
    }
    if (!target) return say("");
    const sentence = (target.body.textContent ?? "").replace(/\s+/g, " ").trim();
    say(target.name ? `${target.name}: ${sentence}` : sentence);
  };

  for (const p of pairs) {
    p.btn.addEventListener("click", () => {
      show(p.btn.getAttribute("aria-expanded") === "true" ? null : p);
    });
    // Escape dismisses, the way it does for the tooltip this is the touch
    // answer to. Focus stays on the trigger when it opens, so the trigger is
    // where the key arrives; nothing is bound to the document, which would
    // reach across the app's dialogs and the full-view escape.
    p.btn.addEventListener("keydown", (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" || p.btn.getAttribute("aria-expanded") !== "true") return;
      ev.stopPropagation();
      show(null);
    });
  }

  return pairs.length;
}
