# ACCESSIBILITY.md — Jefferson Photography Studio

Append-only register. Rows are **never deleted and never silently edited**. A
fixed row keeps its number and gains a resolution line naming the release that
fixed it. Doctrine §4 governs; this file records how it is applied here, and
every finding as it is found.

Target: **WCAG 2.2 AA**, on a tablet, by touch.

**Started 2026-09-14, and late.** This app has shipped for months under a
standing owner mandate that colour-blind-inconsiderate design is a fail state,
with the register §12 asks for absent — so the design-time statements below were
reconstructed from the code and the notes rather than written before the code,
which is the wrong order and is recorded as such. Everything in Part 2 is
measured; nothing in it is asserted from a palette file.

---

## Part 1 — Design-time bindings

Doctrine §4 requires the non-hue channel to be **stated before the code is
written**. These are the encodings this app ships today.

### B-01 · A verdict on a photo
Pick and Reject are carried by **three** channels, of which hue is the least
important.

- **Text** — the word "Pick" or "Reject" is printed on the tile. It is the
  primary carrier and it survives everything.
- **Line style** — a rejected tile's border is **dashed** where a picked one's
  is solid. A style difference reads with no colour perception at all and
  survives a grayscale render.
- **A pressed control** — the head button carries `aria-pressed`, so the state
  reaches an assistive technology without reference to appearance.

Hue reinforces and never carries. The accent fill on a pressed verdict button is
the *reinforcement*; `tools/a11y-verdicts-walk.mjs` asserts the fill IS the
accent rather than merely different from its neighbour, because a faint accent
over a light ground lands on a mid-grey that differs from everything and reads as
on nothing (hub §293).

### B-02 · Which photo you are looking at
Position in the strip, plus **an offset ring the active tile alone carries**. The
ring is a shape difference, not a hue. It exists because a picked tile once wore
the same accent border as the active one and the reader could not tell which
photo they were on — the two states had been encoded in the same channel.

### B-03 · A provisional thumbnail
The word **"preview"** on a badge, and the tile's own tooltip says the rest. It
read "cam" once, which is not a word — it was an abbreviation of a sentence
nobody had been told.

### B-04 · The build stamp
Dimmed with the `--txt-3` **token** and never with `opacity`, because a stamp is
quiet by design and that is exactly why it gets dimmed the lazy way — an opacity
is invisible to a contrast gate (§7b). Selectable, so a version can be pasted
rather than transcribed. See F-04.

### B-05 · Every target a finger takes is 44px
Measured by **reachable area**, not bounding box: a control can extend its own
with a pseudo-element, and a range input's box is its track while the thing a
finger has to hit is the thumb. `tools/a11y-walk.mjs` measures every page and
every dialog at 430px and 900px. The one exception is a target **inline in a
sentence**, which SC 2.5.8 excepts because enlarging a link mid-paragraph breaks
the paragraph — five such elements exist across seven pages and every one is
printed on every run.

---

## Part 2 — Measured, 2026-09-14

Text contrast, composited against what is actually behind each element, at
v2.46.9. Read composited rather than declared, because `getComputedStyle` hands
back the rgba as written and a translucent fill over a dark ground is not the
colour it says it is.

- **the tool name on the app ground** — 9.45:1 dark, 12.84:1 light
- **the build stamp, `--txt-3`** — 6.32:1 dark, 7.79:1 light
- **the session strip's line, `--txt-2`** — 11.62:1 dark, 5.55:1 light
- **a panel tab** — 9.54:1 dark, 9.19:1 light
- **a look button** — 8.49:1 dark, 13.57:1 light
- **the info button** — 6.75:1 dark, 11.13:1 light
- **Restore depth, unpressed** — 9.54:1 dark, 9.19:1 light
- **a verdict button, unpressed** — 8.49:1 dark, 13.57:1 light
- **Done** — 8.49:1 dark, 13.57:1 light

Lowest measured pair: **5.55:1**, against a 4.5:1 floor. Every page and every
dialog is axe-clean for serious and critical in both themes.

---

## Part 3 — Findings

### F-01 · Six dialog buttons under the touch floor — FIXED (2026-09-14)
`#locDlg`'s four buttons and `#askDlg`'s two measured **35px** against a 44px
floor, on two screens that ask the reader to make a decision. The 44px rule had
been scoped to one dialog under a stylesheet comment reading *every other
dialog's buttons are a measured, shipped surface* — they had never been
measured: the sweep opened three of fifteen dialogs and ran axe on one of seven
pages. Fixed by making the floor generic; `min-height` only raises, so it reached
exactly the controls that were short.
**Resolution:** the floor is generic, and `tools/surfaces.mjs` now refuses a
surface that ships undeclared, in both directions, checked against the build.

### F-02 · The quick-look grid handed back tiles under the wrong grade — FIXED (2026-09-14)
Not a conformance failure and recorded here anyway, because the grid is how a
reader decides and a tile is a claim about what opening the photo will show.
Kept previews came back under whatever look they were first scanned with.
**Resolution:** the grade is in the cache key; `tools/tile-truth-walk.mjs` holds
it, with eight checks red against the build before.

### F-03 · A verdict pressed as the tab went away could be lost — FIXED (2026-09-14)
Always the last one pressed. iPadOS discards background tabs and reloads them, so
this was ordinary use on the target device, and a verdict that does not survive is
a highlight rather than a decision.
**Resolution:** the intent is recorded synchronously before the durable write
starts. `tools/verdict-durability-walk.mjs` closes the page mid-write, which is
what a discarded tab does; a first version that merely reloaded passed against the
defect.

### F-04 · Macro Studio shipped with no build stamp — FIXED (2026-09-14)
Doctrine §7b, non-negotiable per app from the first deploy. One repository, two
apps; the editor had carried one since its first release and the other never had.
A screenshot of a stacking problem could not say which build made it.
**Resolution:** `src/verstamp.ts` writes it at boot for both apps and brings its
own CSS, because the first fix rendered at the inherited colour and size — the
class lived in a stylesheet Macro Studio does not load.

### F-05 · This register did not exist — OPEN until it has a second entry
Recorded as its own finding rather than quietly started. §12 asks for it in any
repo with a UI; months of releases went without one, which means every design
decision above was reconstructed rather than stated first. The test of whether
this file is real is whether the NEXT UI change adds a row before the code is
written.

### F-06 · No palette JSON, so the colour-floor gate has never run — OPEN
`gates.yml` passes no `palette-path`, so `palette-check.mjs` is skipped on every
run. The numbers in Part 2 were taken by hand today; nothing holds them. Closing
this needs a palette JSON in the shape `PALETTES.md` describes, which is its own
piece of work and is named here so it stays visible rather than comfortable.

### F-06 · No palette JSON, so the colour-floor gate has never run — FIXED (2026-09-14)
`palettes/studio.json` is generated by `tools/palette-spec.mjs` from
`public/palette.css`, read RESOLVED out of a real browser rather than typed as a
second copy, and `gates.yml` now passes `palette-path: palettes/studio.json`.
All eight palettes clear every hard floor. Two checks hold the artefact to the
app instead of to itself: `tools/palette-spec-check.mjs` pins it to the sha256
of the stylesheet and runs in the commit hook with no browser, and section 4 of
`tools/a11y-walk.mjs` re-measures the `_renders` list against the running app
and fails in BOTH directions. Three findings came out of the wiring, below.

### F-07 · The crop bar was half a glass HUD — FIXED (2026-09-14)
`#cropTools` floats over the photo and took its fill from `--accent-soft`, which
follows the theme, while every control inside it painted `--glass-txt`, which is
theme-invariant by design. In the night theme that near-white on the dark wash
measured 14.16:1 and looked deliberate. In the day theme the same near-white
landed on a LIGHT wash: **1.56:1** — the ratio chips, Reset and the straighten
nudges were effectively gone for anyone using the day theme.
**Resolution:** the bar is `--glass-bg` with a blur, like `#zoomCtl`; its label,
readout and buttons take `--glass-txt`; the accent stays as the border and the
Done button's fill, which is what was carrying the "crop is active" signal.
Re-measured over the worst case a photo can be (glass over a white frame,
rgb(96,96,98)): **5.67:1**.
Two things it cost on the way. The first version wrote the button treatment as
`#cropTools button`, which outranks both `#cropDone` and
`.ratio-chip[aria-pressed="true"]` on id specificity alone and silently deleted
the accent fill from the two controls whose job is to look filled; the two
`:not()`s in the shipped rule are load-bearing. And the first re-measurement came
back at 1.56:1 unchanged — the probe's ancestor walk stepped past `#cropTools`
once its fill became `rgba` glass and measured against the stage behind the HUD.

### F-08 · Control rails on glass were 1.44:1 — FIXED (2026-09-14)
`.ratio-chip` used `rgba(255,255,255,0.35)` and `#zoomCtl button`
`rgba(150,150,170,0.35)`. Against the HUD fill over a bright frame those are
**2.17:1 and 1.44:1**, under the 3:1 a control edge has to clear.
**Resolution:** both take `var(--glass-txt-2)`, the token already meaning
"second-rank mark on glass" — **3.85:1** at the same worst case. A one-off alpha
was what made these invisible; a calibrated token is what the standing rule asks
for.

### F-09 · Accent-coloured labels on the accent wash — FIXED (2026-09-14)
`.accent-outline` (six panel buttons), `.welcome-back`, `.help-tutorials` and the
active icon card's badge all painted `color: var(--accent)` on
`background: var(--accent-soft)`. A wash made FROM the accent moves the ground
toward the accent, so the text loses contrast in proportion to how visible the
state is. Measured across the four families in both themes: the accent on the
PLAIN ground clears everywhere (worst 4.87), the same accent on its own 12–15%
wash falls to **4.13** and is under 4.5 in six of the twenty-four ground x
palette pairs.
**Resolution:** the label is `--txt`, which clears everywhere (worst 6.33). The
accent border and the tint still carry the state, so colour is not the only
carrier — nothing about the control changes except the part that was failing.

### F-10 · Three declarations named a token nothing defines — FIXED (2026-09-14)
`#cropTools`, `.crop-lbl` and `#straightenVal` declared `color: var(--txt-1)`.
No stylesheet in this repo has ever defined `--txt-1`; the eighty real tokens are
`--txt`, `--txt-2`, `--txt-3`. CSS does not warn: the declaration is invalid at
computed-value time and an inherited property INHERITS, so the elements rendered
a plausible colour and every sweep that reads the DOM agreed with them.
**Resolution:** all three now take `--glass-txt`, and `tools/token-check.mjs`
refuses any commit where a bare `var()` names a property nothing defines. It is
in `.branch-guard`'s `also=` and was planted red before being trusted.
