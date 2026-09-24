# 058 · A LUT said nothing about itself

## Context

Asked in chat: what happens when Aerochrome and an imported LUT are both
applied, should Looks and LUTs group, are IR recipes the same thing as a
LUT, and — the reader wants to add Rob Shea's LUT pack with attribution —
what's the convention. Answering the first three (recorded in this
session's chat, not repeated here) surfaced two silences, both found while
tracing `updateLookUI()` and the (i) dialog rather than something either
question asked for directly:

**A LUT stacked on a Look was invisible where a Look is pressed.** Built-in
Looks compose fully and correctly with an imported LUT — the LUT is the
literal last stage in both `compileEdit` (CPU) and the shader (GPU), after
everything a Look sets. But pressing a Look never reads or writes
`params.lut` (confirmed by reading `updateLookUI()`, `src/main.ts`, in
full), unlike loading a *saved* look, which explicitly manages it because a
saved look is defined as "the whole creative grade." So if a LUT is already
applied and a reader presses a built-in Look, the LUT stays on, unchanged,
and the only place that becomes visible is the Grade tab's `#lutActive`
strip — a full scroll from the Looks row on IR.

**Nothing in the app named where a LUT could come from.** The (i) dialog
has no Sources/Credits section (Doctrine §7e wants one, generally, for
"every feed and dataset, with its terms or attribution" — not built here,
see Rejected). A reader who wants to try the LUT feature has no pointer to
a real pack.

The reader's follow-up made both calls: **link to recommend Rob Shea's
pack (don't bundle it), and give the stacked LUT a badge — that's this
app's own convention already** (`.lut-badge`, used on the Grade tab's
`#lutActive` strip).

## Looked up

**Rob Shea's site, before writing any in-app copy** (this repo's "go and
read about it first" cadence). The pack already in the reader's uploads
(`license.txt`: MIT, Copyright 2024 Robert C. Shea; `readme.txt`: "Color
Infrared LUTs for Video and Photography," pointing to `https://590.red/dl`)
resolves through Rob Shea's own short-link domain to
`robsheaphotography.com`, an infrared-photography education site (tutorials,
a book, courses). Its own announcement page
(`robsheaphotography.com/2021/08/15/update-color-infrared-luts.html`)
states plainly "The LUTs are free to download," and lists six treatments as
.cube files: IR RB Swap, IR RB Swap G to R, IR RB Swap G Split, IR RB Swap G
to B, **IR Invert**, IR Hue 180 — "IR Invert" is the exact file 057 already
tested and cited, confirming this is the same pack. `590.red/lut2` is that
page's own "This Page" short link — the pack's specific landing page, not
the general downloads hub `590.red/dl` forwards to, which also lists two
**paid** products on the same site (a $49 Lightroom-specific Enhanced
Profiles pack, and a 270-LUT "PRO" pack). Linking to the specific free
page avoids a reader landing on either by mistake.

**Whether the badge or clearing `params.lut` matches this app's own
pattern for "a Look changed under you."** No other Look-adjacent mutation
clears state silently — Undo/Reset restore individual fields
(`applySnapshot`), and a saved look's own LUT-clearing is stated as part of
what a saved look explicitly IS ("the whole creative grade"), not a general
rule about built-in Looks. `.lut-badge` already exists, is already the
"a LUT is doing something here" convention on the Grade tab, and costs
nothing to reuse.

## Weighed against

**056** built the zip-import feature specifically so a reader could bring
Rob Shea's pack in themselves, and states outright: "the pack is somebody
else's work and is deliberately not in the tree, so a default run never
touches it." **This does not reopen that.** No files enter the repository,
nothing is redistributed, and the MIT notice-inclusion obligation never
triggers because no copy of the licensed material is being made — a link is
not a copy. 056's ruling against bundling stands; this closes the adjacent
gap it left open (a reader had no way to know what pack to go get).

**057** relocated the LUT panel next to the mixer's R⇄B swap chip on Grade,
specifically because Looks and LUTs are different KINDS of thing —
transparent/parametric vs. opaque/third-party — and should not be merged.
This record doesn't merge them either: the badge is a state indicator on
the Looks row, not a control, and the recommend-link sits with the app's
other credit/informational links (Accessibility, Licence), not inside the
Looks or LUT panels.

## Depends

- touches 056 — does not reopen its bundling rejection; a link recommends,
  it does not redistribute.
- touches 057 — same subject area, LUT/Looks interaction, argued from the
  same "different kinds of thing" reasoning without merging the two.

## Options

**Credit Rob Shea's LUTs with a link, no files bundled.** Chosen. One
`<p class="note">` plus one `<p class="more-row">` link in the (i) dialog,
matching the existing link convention exactly. Closes the "what pack"
gap at markup-only cost, with no redistribution risk and no license text
to maintain in this repo.

2. Bundle the pack with a `LICENSE` scope block. Rejected below.
3. Leave it as bring-your-own, unchanged from 056. Rejected below.

**Badge the active Look when a LUT is stacked on it, reusing `.lut-badge`.**
Chosen. `updateLookUI()` appends the existing badge markup to the active
Look button's `.look-sub` when `params.lut` is set; `applyLutToEdit()` and
the `lutRemoveBtn` handler each gained one call to `updateLookUI()` so the
badge tracks LUT apply/remove live.

4. Clear `params.lut` when a built-in Look is pressed, mirroring saved-look
   behaviour. Rejected below.

## Looked at

**Rendered headless and OPENED**, not inferred from the CSS numbers alone —
the stated risk was whether `.lut-badge`'s pill (border, 6px horizontal
padding) would fit inside `.look-sub`'s tight, single-line space, and that
is a question about appearance, not arithmetic.

- **NIR_0063.dng** — an infrared frame, opened through the app's own
  importer with the real Rob Shea pack zip imported and one of its LUTs
  applied via the "Apply" button (not a synthetic LUT record), then "Pink
  IR" (`lookAero`) pressed — the worst case, because that Look's
  `.look-sub` already carries a two-segment `norm`/`R⇄B` toggle before the
  badge is added. Screenshotted at 402px and 900px, both themes (four
  renders total). In every one, the button read `norm` / `R⇄B` (active,
  filled) / `LUT` on one line, legible against the active button's accent
  fill, no wrap and no clipping. The fallback design (a persistent note
  line under the Looks grid, for if the inline tag crowded) was not
  needed.

## Rejected

**2, bundle with a license scope block.** This is exactly what 056 already
weighed and declined — the pack is someone else's copyrighted work, and
redistributing it means keeping the notice correct if the pack is ever
updated, for a gap (unknown provenance) a link closes for free.

**3, leave it as bring-your-own with no pointer.** Answers "can a LUT be
imported" but not "whose LUT, from where" — the reader asked for exactly
this pointer, and 056's own reasoning for not bundling (this is somebody
else's material) applies equally to not naming it, which was never the
intent — 056 built zip-import assuming a reader would already know to go
get Rob Shea's pack specifically.

**4, clear `params.lut` on Look-press.** Silent, undoable-feeling data loss
for something the reader may have deliberately layered on — pressing a
Look to preview a different grade shouldn't cost the LUT if the reader
meant to keep it. A badge costs nothing and loses nothing; if a reader
wants the LUT off, `lutRemoveBtn` already exists and is one tap away on
Grade.

## Rank

Shipped immediately alongside this session's other work. Both halves are
reported/asked in chat, with cause and fix already established while
answering the question that raised them — the ranking question the queue
exists to answer (would anything above this have to be redone) does not
arise; nothing above it in the queue touches the Looks row, the (i)
dialog's link list, or LUT state.

## Outcome

Shipped in the same session. `ir.html`: the Aerochrome/Pink IR paragraph's
stale "Colour tab"/"mixer preset called Aerochrome" corrected to "Grade
tab"/"Film rotation" (separately tracked, same commit); one `<p
class="note">` + `<p class="more-row">` pair added between the Licence
link and the coffee/tip row, linking `https://590.red/lut2`. `src/main.ts`:
`updateLookUI()` appends `<span class="lut-badge">LUT</span>` to the active
Look's `.look-sub` when `params.lut` is set; `applyLutToEdit()` and the
`lutRemoveBtn` click handler each call `updateLookUI()` so the badge tracks
LUT state live.

**Verified, not assumed — this is a visual change.** The stated risk going
in was whether `.lut-badge`'s pill (border, 6px horizontal padding) would
fit inside `.look-sub`'s tight, single-line space, worst case on a
swap-type Look whose `.look-sub` already holds a two-segment norm/R⇄B
toggle. Rendered headless against a real photograph (`NIR_0063.dng`) with
the actual Rob Shea pack zip imported through the app's own importer and
applied via its "Apply" button — not a synthetic LUT record — on the "Pink
IR" (`lookAero`, swap-type) button, at 402px and 900px, both themes. The
badge fits on one line in every combination (`norm` / `R⇄B` (active) /
`LUT`), legible against the active button's accent background in both
themes; no wrap, no clipping. The fallback design (a persistent note line)
was not needed. The (i) dialog's new link renders identically to the
existing `more-row` links and is reachable by scroll at both widths.

`tools/control-walk.mjs`'s failure count is unchanged at 54 — the same
pre-existing backlog 057 recorded, confirming this added no new
unreachable control. `tools/a11y-walk.mjs` passes in full, both themes,
both widths, including the (i) dialog's hit-area sweep over the new link
and the Looks-row buttons carrying the new badge.

**What cannot be verified here, and is not claimed to be.** Whether
`590.red/lut2` stays live is Rob Shea's to maintain, not this app's — the
link was correct as of 2026-09-24. A reader following it to confirm the
pack is still free and still what this record describes is a check this
record cannot perform on their behalf, on an ongoing basis.
