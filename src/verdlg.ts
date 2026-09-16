// THE "THIS BUILD" PANEL — what changed, and the report to send (Doctrine §7d,
// §7f). Used by the chooser and macro pages; the infrared editor carries its own
// copy inside its ⓘ dialog.
import "./verdlg.css";
import { buildDiagnostic, type DiagLine } from "./diagnostic";

declare const __APP_VERSION__: string;
declare const __CHANGELOG__: { hash: string; date: string; subject: string; version: string }[];

/** THE "THIS BUILD" PANEL — what changed, and the report to send (§7d, §7f).
 *
 *  Macro Studio had neither. One repository, two apps, and the baseline is per
 *  APP: the editor has carried a diagnostic since 1.20.0 and a changelog since
 *  the ⓘ was built, and the other app had a version stamp and nothing behind
 *  it. So the only way to ask about a stacking problem on the real device was
 *  to ask for a description of a screen, which is the thing §7f exists to stop.
 *
 *  SHARED, AND BRINGING ITS OWN LOOK, for the reason verstamp.css beside it
 *  records: `style.css` is not loaded by Macro Studio, so a panel styled there
 *  would have rendered as unstyled text in the app it was built for.
 *
 *  The changelog comes from `__CHANGELOG__`, which vite already generates from
 *  the git log at build time and the editor already renders — one source, two
 *  readers, rather than a second list that can disagree with the first.
 *
 *  NOT YET USED BY THE EDITOR, said plainly so the next session does not assume
 *  otherwise: `ir.html` carries its own `#verDlg` markup and its own wiring,
 *  with a Lens button this has no notion of. Folding that into this belongs in
 *  the next change that opens it, not in a release that is fixing something
 *  else. */
export function wireVersionDialog(opts: {
  appName: string;
  /** Lines only this app knows: what it is holding, what it last did. */
  extra?: () => DiagLine[] | Promise<DiagLine[]>;
  /** §7d's other half: what is still not right. Passed in rather than read
   *  here, so this module has no notion of which app it is serving. */
  stillWrong?: { title: string }[];
}): void {
  const tag = document.getElementById("verTag");
  if (!tag) return;

  const dlg = document.createElement("dialog");
  dlg.id = "verDlg";
  dlg.className = "verdlg";
  dlg.setAttribute("aria-labelledby", "verDlgTitle");
  dlg.innerHTML = `
    <h2 id="verDlgTitle">This build</h2>
    <p class="verdlg-ver" id="verDlgVer"></p>
    <h3 class="verdlg-h">What changed</h3>
    <ul class="verdlg-log" id="verDlgLog"></ul>
    <h3 class="verdlg-h verdlg-todo-h" id="verDlgTodoH" hidden>Not right yet</h3>
    <ul class="verdlg-log" id="verDlgTodo" hidden></ul>
    <h3 class="verdlg-h">If something is wrong</h3>
    <p class="verdlg-note">This is what to send — it says what this device is and how the app is set up here. It carries nothing about your photographs: no names, no camera data, no location.</p>
    <label class="verdlg-sr" for="verDlgText">Diagnostic report</label>
    <textarea id="verDlgText" class="verdlg-text" readonly rows="12"></textarea>
    <div class="verdlg-actions">
      <button id="verCopy" type="button" class="verdlg-primary">Copy the report</button>
      <a id="verDebug" class="verdlg-link" href="./debug.html">Test this device&hellip;</a>
    </div>
    <p class="verdlg-note">The test page measures how fast this device decodes a photo, draws a frame and saves to storage — numbers that differ on every device and cannot be guessed from a desktop.</p>
    <button id="verClose" type="button" class="verdlg-close">Close</button>`;
  document.body.append(dlg);

  (dlg.querySelector("#verDlgVer") as HTMLElement).textContent = `${opts.appName} v${__APP_VERSION__}`;

  const log = dlg.querySelector("#verDlgLog") as HTMLUListElement;
  for (const c of __CHANGELOG__) {
    const li = document.createElement("li");
    const ver = document.createElement("strong");
    ver.textContent = `v${c.version} `;
    const subject = document.createElement("span");
    // textContent, not innerHTML: a commit subject is text this app did not
    // write the escaping for, and it is rendered in two apps now.
    subject.textContent = c.subject;
    const when = document.createElement("small");
    when.textContent = ` — ${c.date}`;
    li.append(ver, subject, when);
    log.append(li);
  }
  if (!__CHANGELOG__.length) {
    const li = document.createElement("li");
    li.textContent = "No release history in this build.";
    log.append(li);
  }

  // WHAT IS STILL NOT RIGHT, beside what changed. A release note that lists
  // only improvements reads as a claim that everything else works.
  const todo = opts.stillWrong ?? [];
  if (todo.length) {
    const h = dlg.querySelector("#verDlgTodoH") as HTMLElement;
    const ul = dlg.querySelector("#verDlgTodo") as HTMLUListElement;
    h.hidden = false;
    ul.hidden = false;
    for (const t of todo) {
      const li = document.createElement("li");
      li.textContent = t.title;
      ul.append(li);
    }
  }

  const text = dlg.querySelector("#verDlgText") as HTMLTextAreaElement;
  const copyBtn = dlg.querySelector("#verCopy") as HTMLButtonElement;

  const open = async () => {
    text.value = "Gathering…";
    dlg.showModal();
    text.value = await buildDiagnostic(__APP_VERSION__, (await opts.extra?.()) ?? [], opts.appName);
  };

  tag.addEventListener("click", () => void open());
  // The ⓘ-side door: nobody with a problem thinks to press a version number.
  document.getElementById("helpDiag")?.addEventListener("click", () => {
    (document.getElementById("helpDlg") as HTMLDialogElement | null)?.close();
    void open();
  });
  dlg.querySelector("#verClose")!.addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

  copyBtn.addEventListener("click", async () => {
    const was = copyBtn.textContent;
    try {
      await navigator.clipboard.writeText(text.value);
      copyBtn.textContent = "Copied";
    } catch {
      // Refused — select it so it can still be copied by hand. Never a button
      // that looks like it worked and did not.
      text.focus();
      text.select();
      copyBtn.textContent = "Selected — press Copy";
    }
    setTimeout(() => { copyBtn.textContent = was; }, 2200);
  });
}
