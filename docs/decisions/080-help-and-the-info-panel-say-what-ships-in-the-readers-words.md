# 080 · Help and the ⓘ say what ships, in the reader's words

## Context

Asked 2026-09-29: before the app is called finished, every Help file is
current and written for the person holding the app.

The first instance was found the same day. Help's paragraph on the looks
called Aerochrome "deep magenta foliage over a teal sky", which is what the
look was before its colour mix and sky stages; as it ships the foliage is red
and the sky blue. Nothing noticed, because nothing holds Help to what renders.
It was corrected in the build of record **078**, which added Bold Pink, the
look that sentence actually described.

Help is long (ir.html's Help dialog) and has been written piece by piece, a
paragraph per release, often by the session that built the feature and in its
terms. The ⓘ panel and the roadmap's `Shown as:` lines already have a gate
that makes each line say something to a reader (`tools/roadmap-copy-check.mjs`);
Help has none.

## Looked up

- **Diátaxis** (diataxis.fr, read 2026-09-29). Documentation serves four
  different needs and each needs its own form: a tutorial is a lesson that
  takes a learner by the hand through doing something; a how-to guide
  addresses a real goal for someone already competent; reference is the
  accurate, complete description of the thing; explanation is context and the
  why. Mixing them is the common failure, and the framework is used to decide
  where a new or corrected piece belongs.
- Read against it, the app's lessons are the tutorial form (record 081), and
  Help today mixes the other three: how to do a thing, what each control does,
  and why infrared behaves as it does.

## Weighed against

- Record **078**: Help's Aerochrome sentence, the first instance, fixed there.
- Record **079**, the interface assessed as a whole: it changes screens that
  Help describes, so Help rewritten before it would be rewritten again.
- NOTES.md, "Accessibility standing rule": Help is a dialog and its structure
  (headings, the order a screen reader meets it) is already measured by the
  accessibility walk.

## Depends

- needs 079 — Help describes the screens 079 changes; written before it, it is
  written twice.
- touches 078 — its Help correction is this record's first instance.
- touches 081 — the lessons are the tutorial form and Help the other three;
  one sentence belongs in one of them, not both.

## Options

1. **Audit every Help section against what ships, sort it by the four forms,
   and rewrite it for the reader.** Chosen.
   - Each paragraph of Help, and each panel of the ⓘ (what the app is, what it
     is not, installing it, what changed, where the data comes from, reporting
     a problem), is checked against the build: every control it names exists
     under that name, and every picture it describes is what renders.
   - Each is sorted into how-to, reference or explanation, and moved where it
     belongs; tutorial steps go to the lessons.
   - Rewritten in the reader's words: what they see and what to press, never
     the pipeline's names.
   - A check that every control Help names by label exists in the build, so
     a rename cannot leave Help pointing at nothing.
2. Rewrite Help from scratch.
3. Correct sentences as they are reported.

## Rejected

- **2, from scratch.** Much of Help is right and hard-won (the infrared
  explanations especially); a rewrite throws that away to fix what an audit
  would find.
- **3, as reported.** That is how the Aerochrome sentence survived: nothing
  looks until someone notices.

## Rank

After the interface assessment (record 079), which it needs, and beside the
lessons (record 081). Near the end of the list.
