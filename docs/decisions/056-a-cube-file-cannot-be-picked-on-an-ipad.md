# 056 · A .cube file cannot be picked on an iPad

## Context

Reported from the device 2026-09-23 with a screenshot of the Files panel open
over **Import .cube LUT…**: six `.cube` files in an iCloud folder, every one
greyed out, none selectable. The control is reachable, the panel opens, and
nothing can be chosen through it. Importing a colour file has been unavailable
on the target device for the whole life of the feature, and this is the only
route it has — unlike a look, which also travels by link and by code.

**The line was `ir.html`'s LUT picker**, `accept=".cube,text/plain"`.

**The cause was already measured in this repository and did not need
rediscovering.** `src/keepfile.ts:27` records the identical symptom for a
different file type: a keep file named `.ipskeep`, 27.9 MB, named correctly,
greyed out and unselectable, because iOS filters that picker by type identifier
and an extension registered to nothing matches no allowed type — the failure
sitting upstream of every line of routing. An earlier draft of this work was
going to build a probe on the test page to establish what the codebase had
already written down.

## Looked up

**iOS resolves every `accept` entry to a type identifier and greys out anything
that does not match.** A bare extension no installed app has declared resolves
to nothing, so `.cube` matched nothing. `text/plain` resolves to
`public.plain-text`, and a file whose extension nothing declares is typed
`public.data`, which is not a subtype of it — so the second entry could not
match either. The behaviour is reported repeatedly against Files and Safari,
including the case where one extension resolves differently depending on which
apps are installed, which is why it reproduces for one reader and not another.

Sources: betterprogramming.pub, "How to Fix Greyed Icons on iOS Document Browser
and Picker"; parorrey.com on the greyed-out Safari upload control; Apple
Developer Forums threads 118932 and 708303 on custom identifiers and
`UTTypeTagSpecification`.

**There is no narrow fix available to a web app.** A type identifier is declared
by an installed application's `Info.plist`. This app has no bundle, and that is a
product value rather than an oversight, so the one route that would let the
picker filter correctly is closed by what the app IS.

## Weighed against

**043, "A kept photograph should be a file you own"**, met this exact wall and
solved it by renaming: a keep file IS a zip, so `.ipskeep.zip` is honest as well
as selectable. That remedy is not available here, because the reader brings a
`.cube` from elsewhere rather than the app writing it.

**The look-sharing work** left the same exposure on `.ipslook`, and NOTES.md
still lists its Files round-trip as owed from that release. That is a separate
item rather than this one, because its remedy has a cost this one does not.

## Depends

- touches 043 — that record is where the finding this rests on was measured, and
  where the renaming remedy comes from; a change to either moves the reading of
  the other.

## Options

**Take the `accept` attribute off and let the parser do the refusing.** Chosen.

Anything that makes a `.cube` selectable makes everything selectable, because
the system cannot type a `.cube` at all — so the honest markup is no filter
rather than one that pretends. Nothing is lost: the size cap runs first, and
`parseCube` already refuses non-LUT text with sentences written for a reader, so
a picked JPEG is answered with "That file doesn't look like a 3D LUT — no
LUT_3D_SIZE found." rather than anything silent. The button beside the picker
says what is wanted, which is where a reader reads it.

**And a pack arrives as one file.** Added after the first half was built,
and it is the same finding used the other way round: `.zip` IS a type the
platform registers, which is why the keep file ends in one. LUTs are published
as packs — the one this was built against holds eighteen `.cube` files in two
folders beside a licence and a readme — so importing them one at a time is
eighteen trips through the Files browser, and on an iPad the zip is the route
that cannot be greyed out whatever else changes.

Nothing new was needed to read it: `src/zip.ts` already inflates deflate entries
and indexes from the central directory. The one extension is the uncompressed
size in `ZipIndexEntry`, so the 8 MB per-LUT ceiling is checked BEFORE inflating
— a deflate stream can expand about a thousand to one, so checking afterwards is
checking too late.

2. Add `application/octet-stream` to the existing list. Rejected below.
3. Ask the reader to rename the file. Rejected below.
4. Declare the type properly and keep the filter. Rejected below.
5. Make the reader zip every LUT, single files included. Rejected below.

## Rejected

**2, widen with `application/octet-stream`.** It resolves to `public.data`, the
root every file descends from, so it makes everything selectable — the same
outcome as removing the attribute, reached by a line that reads like a narrow
fix and would be maintained as though it were one. If the true answer is that
this picker cannot filter, the markup should say so rather than dress it up.

**3, ask the reader to rename or re-export.** It cannot work: the extension is
exactly the thing with no registered type, so renaming to anything else makes
the file less likely to be recognised, not more. It also asks somebody to work
around the app on a device where their file is already correct.

**4, declare the type and keep the filter.** A type identifier is declared by an
installed app's `Info.plist`. This app has no bundle by design, so this option
does not exist for it.

**5, require a zip for everything.** The pack work began on the premise that a
zip was the only way in, and with the `accept` list gone that is no longer true
— a single `.cube` is selectable. Copy saying otherwise
would be false on the device it is written for, and a reader with one file would
be sent to make an archive for no reason. What is true either way, and what the
panel says, is that a zip brings a whole pack and is the route that always
works.

## Rank

Shipped immediately rather than queued. It is a defect whose cause was
already established in the repository, whose fix is one attribute, and which
needs no measurement — so the ranking question the queue exists to answer did
not arise. Nothing above it in the queue reads the picker and nothing above it
would have to be redone.

**The picker fix alone would have been an increment. The pack importer is not**,
and the taxonomy is explicit that a feature never is. So the release carrying
both owes a middle-number bump, riding whichever commit turns out to be its
last — which is not this one while two of the plan's items are still open. Worth
writing down because nothing enforces it: no gate in this repository reads
VERSION at all, so shipping the pack importer under a 2.61 increment would go
green everywhere and show only in the app.

## Outcome

Shipped in the commit removing `accept` from `ir.html`'s LUT picker, with the
finding and the reason carried in the markup beside it so the attribute cannot
come back as a tidy-up.

**What cannot be verified here, and was not claimed to be.** Chromium does not
reproduce type-identifier filtering, so no walk and no headless run can tell a
fixed picker from a broken one. The only real test is on the iPad itself.

**What the fix does not cover, found while making it.** The same defect is
latent on `.ipslook`, whose remedy is not free — renaming it the way 043 renamed
the keep file would break the drop route, because `OPENABLE_EXT` anchors at the
end of the name and would no longer match. That trade is its own item.

**The pack importer, measured rather than asserted.**
`tools/lutpack-walk.mjs` builds its own archive — nested folders, a licence and
a readme, a LUT that names itself and one that does not, one carrying a
byte-order mark, and both kinds of resource-fork debris a Mac's Compress command
adds — and drives the real importer. Six checks green on the final build without
arguments, re-run after the last fix rather than cited from an earlier pass.

A seventh check runs only with `--pack=` pointed at a real archive: the real
eighteen-LUT pack imports whole — eighteen of eighteen, counted out of the
archive by something that is not this app, with the licence and readme ignored
and every name taken from the file rather than its path. **That arm is
conditional on purpose: the pack is somebody else's work and is deliberately not
in the tree, so a default run never touches it and no later run reproduces this
result without being handed the same archive.**

Three plants, each seen to turn its own check red: two applied to the served
bundle, and one — the byte-fidelity check — done by reverting the fix in the
source and rebuilding, because storing a re-encoding rather than the archive's
bytes is a difference in what a variable holds and leaves no string to
substitute.

**What the plants do not cover, said rather than implied.** The cap check has
two clauses; a plant covers the one that tells the reader what did not fit, and
the one asserting exactly 25 are stored has none, because the cap is inlined by
the minifier and there is no string to substitute. Nor does anything here drive
the contract's claim that a pack never applies a LUT to the open photograph —
no arm opens one — so that rests on reading the two call sites rather than on a
measurement, and the walk's header says so.

**A stated invariant this work broke, which nothing green could see.**
`LutRecord.cube` says it holds "the ORIGINAL file bytes, so 'share this LUT'
re-sends the exact file", and the single-file path honours it with the picked
file's own buffer. The pack path stored a re-encoding of the decoded text, which
is not the same bytes: a byte-order mark is stripped and every invalid byte
becomes U+FFFD, so a LUT taken out of a pack would have been re-shared as
something the archive never held. Every check passed throughout, because every
fixture was clean ASCII. The walk now carries a marked file for exactly this,
and reads the store straight out of IndexedDB rather than through the app, so
the importer cannot agree with itself.

**Three defects in the importer's own summary, found by review rather than by
running it.** A device that refused the write reported the LUTs as unreadable,
sending the reader to check the wrong thing; the count of what "did not fit" was
taken against the slots ATTEMPTED rather than the slots FILLED, so two failures
made the shelf look full when it was not; and a lying central directory could
buy an unbounded inflate, because only its claim was checked and never the bytes
that came back. The loop now stops when the shelf is full rather than after a
fixed number of tries, storage failure has its own sentence, and the ceiling is
enforced on both the claim and the result.

**And three in the instrument, two of which made a check unable to fail.** The
harness waited for the stored-row count to reach the number it was about to
assert, so a regression arrived as a timeout rather than a red line; the real
pack's check asserted only that something imported, while the record beside it
said the pack imports WHOLE; and the empty-pack check polled a predicate of
`true`. The waits now key on the importer's own summary sentence, and the real
pack is held to a count taken from the archive by something that is not this
app — eighteen of eighteen.

**And the first plant found a defect in itself before it found one in the code.**
Breaking the `__MACOSX/` guard changed nothing, because every file macOS writes
into that folder is also named `._` and the second guard caught them all — so
the folder test is defence in depth and the name test does the work. Then
breaking the name test still passed, because the check was reading dialog alerts
for a failure count the app reports in a toast. Both are fixed; the walk's
comments carry why.

**And nothing yet refuses the class.** It has now appeared three times — fixed
once by renaming, fixed once by widening, latent once — with the reasoning
written in comments each time and no check anywhere. A comment has never once
refused the thing it forbade in this repository.
