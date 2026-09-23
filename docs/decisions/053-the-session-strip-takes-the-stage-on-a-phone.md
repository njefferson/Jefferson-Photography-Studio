# 053 · The session strip takes the stage on a phone

## Context

Reported from an iPhone 2026-09-22, in the same sentence as the black screen:
"Landscape picture on a phone fails in portrait." The black screen had its own
cause — `.sw-strip` auto-placing into the implicit grid, fixed in 2.60 and held
by `tools/shell-grid-walk.mjs` — and fixing it did NOT make the photograph
usable. This record is the rest of that sentence.

**Measured at 302x656 with a perfectly healthy shell**, which is the reader's
own layout viewport (a 402px iPhone at 1.33x page zoom):

- the top bar takes **163**, having wrapped to several rows
- the panel takes **295** (`max-height: 45dvh` on a phone)
- the stage gets the remaining **198**
- `--session-h` is **138** of that stage
- so `#stage.has-session #view`'s `max-height: calc(100% - 32px - var(--session-h))`
  resolves to 198 − 32 − 138 = **28px**

A landscape photograph is height-limited, so it gets 28px of a 656px screen —
about 4%. The reader's own diagnostic shows the milder version of the same
arithmetic: 138px reserved from a 272 stage, the picture drawn 102 tall.

**The strip does not scale.** `.session-thumb` is a fixed `92px x 66px`, and the
strip adds its own header row and padding around them. It costs ~138px whether
the stage has 700px to give or 198, so the narrower the screen the larger its
share — the opposite of what it should do.

**This is not decision 012 and that record now says so in its own text.** 012 is
about the FULL VIEW and its evidence is a picture DRAWN LARGER THAN ITS STAGE
with its top and bottom cut off. This is the ordinary editor view, the shell is
correct, nothing overflows, and the picture is drawn far smaller than its box.
Same symptom in a report, different mechanism.

## Looked up

**Lightroom Classic treats a filmstrip that costs canvas as something to
dismiss, not something to shrink.** It can be hidden outright (F6, or the
show/hide control on the strip itself), and — the part that bears directly on a
small screen — it has an **Auto Hide and Show** mode set from the bar beneath
it: the strip collapses to nothing and returns when the pointer approaches the
bottom edge. Shift+Tab hides every panel at once to give the photograph the
whole window. So the reference behaviour for "the strip is eating the picture"
is a reversible disappearance, and the selection it offers is reachable on
demand rather than permanently resident.

**On phones the named convention is the bottom sheet**, whose stated property is
supplementary content that is easily accessed AND easily dismissed, and a
collapsible thumbnail filmstrip is a recognised instance of it. Immersive
screens are advised to let the image fill the canvas while controls stay inside
the safe area.

**And what no source gives is a minimum canvas size for a photo editor**, which
is worth saying rather than inventing one. The nearest thing found is one
web-based editor declaring it supports displays of at least 550x450. That is a
window minimum, not a canvas floor, and it does not answer this.

The honest summary: the field's answer is that the strip yields, by collapsing
or hiding, and comes back on demand. It is not that the thumbnails get smaller.

## Weighed against

Shares ground with **012** (rank 7), which already declares `touches 003` and
`touches 004` for the same reason: all of these are about how much of the screen
the photograph occupies, and 003 may move the stage's inset rules wholesale.

Also overlaps the top bar, which measured **163px tall** on a phone because
`.bar` wraps — that is a quarter of the viewport before the panel or strip take
anything, and it is not obviously this record's to fix. Named here so whoever
takes this does not discover it as a surprise.

**What has been done before on it**: NOTES.md "## The black screen on a phone
was the update strip, not the photograph" carries the measurement above and
explicitly records this as untouched.

## Depends

- touches 012 — both are about how much of the screen the photograph gets, and
  012 may change the `#view` inset and max-height rules this measures. Declared
  from this side only; 012 already declares its own edges to 003 and 004.

## Options

**Measure where the height goes first, at named widths with a photograph
actually open, then decide.** Chosen. The arithmetic above came from a harness
that had NO photograph on screen — it reported `0x0` for the canvas in the
healthy case too, which is why that number is absent from this record. The
measurement that matters is what the picture is actually drawn at once a file is
open, at three widths, and it does not exist yet.

The candidates it would discriminate between, none of them costed here:

2. The strip collapses on a short stage and comes back on demand — the
   reference behaviour above.
3. The strip's thumbnails scale with the stage rather than being fixed at
   92x66.
4. The panel yields instead of the strip: `45dvh` is the larger single claim on
   the viewport.
5. The bar stops wrapping to 163px on a phone.

## Rejected

**Adjust the CSS until it looks right.** This is 012's Rejected section verbatim
and it applies here for the same reason: four different tracks each take a share
of the viewport, a screenshot cannot say which one is wrong, and the rules that
would be edited may be replaced wholesale by 003.

**Shrink the thumbnails and call it done.** The cheapest change and the one the
reference behaviour argues against — Lightroom's answer is that the strip yields
entirely and returns on demand, not that it becomes a smaller permanent tax. It
also does nothing for the bar's 163px or the panel's 45dvh, so it treats the
symptom on whichever track happened to be measured.

**Treat it as 012 and close both together.** 012's own instrument has now run
and named a state 012 did not predict. Folding them would discharge 012 on
evidence that is not about it.

## Rank

Below 012 and beside it, not above. The ranking rule is that a reported defect
goes where it naturally goes and only DEPENDENCY privileges it: nothing ranked
above this needs it done first, and the dependency graph puts this ground at
012's rank rather than near the top. Being reported — and being the half of a
report whose other half was fixed — is explicitly not a reason to jump.

It sits directly after 012 so the two are read together, since whoever takes
either will be in the same rules.
