# 079 · The app's screens are assessed as a whole, by a published method, on the tablet

## Context

Asked 2026-09-29: once the capability work on the roadmap is done, the
interface is assessed and optimised as a whole. Until now each screen defect
has been found one at a time, from the device, and filed as its own record:
the top bar that wraps (record **060**), the session strip on a phone (record
**053**), the export panel's two meanings of "save" (record **054**). Nothing
has ever looked at the whole app against a method, so there is no way to say
what has not been found yet.

The app is used on a tablet, by touch (Doctrine §4), and every walk here
measures conformance, which is defined for input methods in general. An
assessment that is not done by touch measures something else.

## Looked up

- **Nielsen Norman Group, "Evaluate Interface Learnability with Cognitive
  Walkthroughs"** (nngroup.com) and **MeasuringU, "What's the difference
  between a Heuristic Evaluation and a Cognitive Walkthrough?"**
  (measuringu.com, both found 2026-09-29). The two established inspection
  methods find different things. A heuristic evaluation reviews the interface
  against a set of principles, Nielsen's ten (visibility of system status,
  match with the real world, user control and freedom, consistency,
  error prevention, recognition rather than recall, flexibility, minimalist
  design, recovery from errors, help and documentation), and rates each
  problem's severity from 0 (not a problem) to 4 (a catastrophe). A cognitive
  walkthrough takes a first-time user through named tasks and asks at each
  step whether they would know what to do, and it is the method for
  learnability. Neither needs users; both are cheap.
- **"Comparison of heuristic and cognitive walkthrough usability evaluation
  methods for evaluating health information systems"** (PubMed Central,
  PMC7651936, found 2026-09-29) found the two methods overlap little, which is
  the reason to run both rather than choose.

## Weighed against

- The screen records already open: **060** (the top bar), **053** (the phone
  layout), **054** (the export panel's wording). Each is a finding an
  assessment would make; each is researched, ranked and has its own chosen
  option. They stay their own records, and the assessment starts from them
  rather than re-finding them.
- **046**, the control sweep's reach, is about a walk's coverage, not about
  what a reader meets. It is a different question that happens to be about
  controls.
- NOTES.md, "Accessibility standing rule", and its NEVER-CHURN list: the
  patterns already verified correct, which an assessment must not "fix".

## Depends

- touches 060 — the top bar is the assessment's first screen and 060 is
  already changing it.
- touches 053 — the phone layout is one of the widths the walkthrough runs at.
- touches 054 — the export panel is on the primary journey.
- distinct-from 046 — that is a walk's coverage; this is what a reader meets.

## Options

1. **Both methods, on the tablet, by touch, on the primary journey.** Chosen.
   - A cognitive walkthrough of named tasks from the start screen: open a
     photograph, apply a look, finish it, export it, run a batch, and come
     back to it after a reload.
   - A heuristic evaluation of every screen against Nielsen's ten, each
     problem rated 0 to 4.
   - Each problem rated 3 or 4 becomes its own record, ranked by what it
     would invalidate; the rest are listed in this record's Outcome.
   - Screens shown as pictures, as every look choice here is.
2. A heuristic evaluation alone.
3. A cognitive walkthrough alone.
4. Keep finding screen defects one at a time, as they are reported.

## Rejected

- **2 and 3, one method.** The two find different problems and overlap
  little; running one leaves the other half unfound.
- **4, one at a time.** That is how 060, 053 and 054 were found, and it never
  says what has not been found.

## Rank

Near the end, after the items that still change the screens. An assessment
run before them would be redone once they land. Help (record 080) and the
lessons (record 081) come after it, because they describe the screens this
changes.
