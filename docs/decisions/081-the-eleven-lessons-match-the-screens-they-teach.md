# 081 · The eleven lessons match the screens they teach

## Context

Asked 2026-09-29: the tutorials are redone where they no longer match the app.

The app carries eleven lessons (src/main.ts, `title: "Lesson 1 …"` to
`"Lesson 11 …"`), each a tab and a list of steps. They are text in the source,
written when each area was built, and nothing checks them against the screens.

The first instance was found the same day. Lesson 2 told the reader to try
"Aerochrome, Aero Red, Goldie" and to press a look twice to flip its swap. No
look has been called Aero Red for some time, and Aerochrome has no swap to
flip: its button says "film" for exactly that reason. It was corrected in the
build of record **078**, which added Bold Pink to the same list.

## Looked up

- **Diátaxis** (diataxis.fr, read 2026-09-29): a tutorial is a lesson that
  takes a learner by the hand through a learning experience, always practical,
  the learner doing something under guidance. Its steps must work exactly as
  written, because a learner who meets a step that does not match the screen
  has no way to recover and no reason to trust the next one.
- That is the standard each lesson is held to here: every step names a control
  that exists, where it says it is, and does what it says.

## Weighed against

- Record **078**: Lesson 2's list, the first instance, fixed there.
- Record **079**, the interface assessed as a whole: lessons written before it
  would be rewritten after.
- Record **082**, the practice photographs: the lessons are what a newcomer
  runs on them, so a change to what those files carry changes what the lessons
  show.

## Depends

- needs 079 — the lessons teach the screens 079 changes.
- touches 078 — Lesson 2's list, this record's first instance, was corrected
  in its build.
- touches 082 — the lessons run on the practice photographs.

## Options

1. **Walk every lesson on the tablet against the current build, rewrite what
   no longer matches, and gate the names.** Chosen.
   - Each step is done as written, by touch, on a practice photograph.
   - A step that names a control, a tab or a look is held by a check to a name
     that exists in the build, so a rename fails the commit instead of
     stranding a lesson.
   - Lessons that teach something the app no longer does are cut, not kept.
2. Rewrite all eleven from scratch.
3. Correct steps as they are reported.

## Rejected

- **2, from scratch.** Most steps still work; the audit finds the ones that do
  not.
- **3, as reported.** Lesson 2 named a look that no longer existed and nobody
  reported it; a learner who meets a wrong step stops, and does not report it.

## Rank

After the interface assessment (record 079), which it needs, beside Help
(record 080). Near the end of the list.
