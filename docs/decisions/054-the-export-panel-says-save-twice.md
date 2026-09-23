# 054 · The export panel says "save" twice and means two different things

## Context

Reported from the device 2026-09-23: the wording on the export panel is confusing
as to why there is a save-this-file and an export-this-file, and users will not
understand.

**Four controls on one panel, and the words do not separate them.**

- `#keepFile` — "Save this photo as a file". Writes an `.ipskeep`: the original
  photograph exactly as it came, with the edit alongside it, reopenable in this
  app. 043's work.
- `#exBtn` — "Export & Save", the primary. Writes a finished JPEG or TIFF.
- `#exportPickedBtn` — "Export all".
- `#exportWaitingSave` — "Save them all".

Three of the four carry "Save" and two carry "Export", and both words are used
for both jobs. `#keepFile`'s explanatory note runs forty words before the
difference becomes clear, which is forty words after the reader has had to
choose.

**The distinction the labels are failing to carry is a working file versus a
finished picture.** The keep file is work you come back to: it holds the
original, it reopens here, it is a project. The export is a picture you send: it
is finished, it goes everywhere else, and it cannot be reopened as an edit.
Nothing in either label says which is which, and "Save" appearing on both is
what makes them read as two routes to the same place.

## Looked up

**The convention exists, it is nearly universal, and this app already follows
it — then breaks it in one word.**

Affinity Photo draws exactly this line: **Save** preserves the native format and
**Export** is what you choose for any other file type — to get a TIFF out you
must Export rather than Save. That is the same split this app has: `.ipskeep` is
the native thing you reopen, JPEG and TIFF are what you export.

Photoshop (`.psd`), Capture One (Sessions and Catalogs) and Lightroom (the
catalog) all keep the same shape: a native container that holds your work and
reopens, and a separate verb for producing a deliverable.

**So the reported confusion is not caused by having two controls.** Two controls
is right and is what every editor in the field ships. It is caused by
`#exBtn` reading "Export **& Save**" — putting the word the convention reserves
for the native file onto the control that produces the deliverable. A reader who
knows any other editor is told, by that one word, that both buttons save.

Sources: Affinity Photo's save-versus-export behaviour as described in
blog.thomasfitzgeraldphotography.com's Capture One and Affinity workflow notes;
Capture One's own Complete Guide to Using Catalogs (support.captureone.com) for
Sessions versus Catalogs; photographylife.com and shotkit.com for how switchers
describe the two models.

## Weighed against

**043, "A kept photograph should be a file you own"**, built the keep file and
named it. This record does not reopen what that file IS, only what the control
that writes it is called.

**051** removed the in-app kept list, which is why the keep file is now reached
only from this panel — so the panel is the whole surface for it, and the label
carries more weight than it did when a list also existed.

Nothing else on the schedule touches export copy.

## Depends

- touches 043 — that record named the keep file and shipped it; this is what the
  control writing it is called, so a change here should not contradict the words
  043 chose for the thing itself.
- touches 051 — that removed the in-app kept list, so this panel became the only
  surface the keep file is reached from; its label carries the weight the list
  used to share.

## Options

**Rename so each label says what the file is FOR, and take "Save" off the
export.** Chosen in direction, not in wording — the words themselves are the
owner's and are deliberately not settled here. What the evidence supports is
narrower than a rewrite: the panel already matches the field's convention in
substance, so the change is to stop breaking it, which is principally the "&
Save" on `#exBtn`. A later session renders the panel and looks at it before
claiming the words read better.

2. Leave the labels and lengthen the explanatory notes. Rejected below.
3. Collapse to one control with a format chooser that includes `.ipskeep`.
4. Rename only the keep file and leave the export alone.

## Rejected

**2, explain harder.** The note under `#keepFile` is already forty words and the
report came from somebody who had it in front of them. A label that needs a
paragraph is the defect; more paragraph is not the fix.

**3, one control with `.ipskeep` as a format.** It reads tidy and it is wrong:
the two produce different KINDS of thing, not different encodings of one thing.
A format list that mixes "JPEG, TIFF, and also a container holding your original
plus the edit" hides the only distinction that matters, and it would make the
keep file — the thing that protects the reader's original — a menu item three
taps in.

**4, rename only the keep file.** The word doing the damage is on the OTHER
control. "Export & Save" is what tells a reader who knows any editor that both
buttons save; renaming `#keepFile` around it leaves that intact.

**Copying Affinity's exact words.** The convention is worth following and the
vocabulary is not automatically transferable: this app has no document model, no
layers, and its native file is a zip holding an untouched original — which is a
stronger promise than `.afphoto` makes and is worth saying rather than inheriting.

## Rank

**Held, and ranked below the near-term queue.** Nothing above it depends on it:
it changes no behaviour, blocks no other item, and invalidates nothing already
built. A defect reported from the device goes where it naturally goes, and being
reported is not what privileges an item — dependency is.

It ranks above nothing urgent and below the mask and rendering work, because it
costs a reader a wrong press and a moment of confusion rather than costing them
their photograph or their time. Recorded now at the owner's instruction so the
reasoning is not re-derived when it comes up.
