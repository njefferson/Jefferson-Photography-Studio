# 043 · A kept photograph should be a file you own

## Context

Reported from the device, 2026-09-21, against the feature that is on staging
for its pass: keeping a photograph should not mean keeping it INSIDE the app.
It should be saved, and worked on later. And whatever the app writes when it
saves must never overwrite an original.

**The first half is a real bound on what 039 shipped, not a preference.** A
kept photograph today is rows in an IndexedDB database the app created. That is
storage the reader does not own: it cannot be moved to another device, it
cannot be backed up, it cannot be handed to anybody, and on iOS it can be
evicted by the browser without the app being told. `NOTES.md` "## The
measurements lived in storage the app does not own" is the same failure, once
already, with the lens measurements. So "put it down and pick it up next week"
is a promise the app cannot currently keep — it can only promise "next week, if
Safari still has it".

**The second half is a requirement with a sharp edge**, because the field's own
convention breaks it: "non-destructive" in raw processing means *does not
change the pixels*, and at least one major tool writes into the original file
anyway. This item is the other reading — the file the reader picked is never
written at all, by anything, for any reason.

## Looked up

**Lightroom Classic keeps the edit in a catalogue and, optionally, beside the
file.** Every adjustment lives in the `.lrcat` database, which cannot be turned
off; "Automatically write changes into XMP" additionally mirrors them, and for
proprietary raws — NEF, ARW, CR3 — that mirror is a small `.xmp` sidecar next
to the original. The raw's pixels are never modified; what is stored is a set
of instructions for how to render it
([helpx.adobe.com, create XMP files](https://helpx.adobe.com/lightroom-classic/help/create-xmp-acr-files.html);
[metadata basics](https://helpx.adobe.com/lightroom-classic/help/metadata-basics-actions.html)).
darktable does the same with one XMP per file.

**AND FOR DNG IT WRITES INTO THE FILE ITSELF.** Sidecars are not supported for
DNG by design: Lightroom refuses to create one and embeds the metadata and the
develop settings in the DNG, and the same is true of JPEG and HEIC, where the
XMP goes into the file's header
([Products supporting XMP within DNG](http://www.barrypearson.co.uk/articles/dng/xmp_dng.htm);
[Ask Tim Grey, XMP option for DNG](https://asktimgrey.com/2022/05/20/xmp-option-for-adobe-dng-files/)).
The pixels are untouched and the file is rewritten. **That is precisely the
behaviour this item forbids**, and naming it is the point of looking it up: the
requirement is not satisfied by being "non-destructive" in the field's sense.

**The catalogue model also needs something this app cannot have.** It holds a
PATH to the original and re-renders from it, so the original has to be findable
again. 039 already recorded why that fails here — iPad Safari cannot re-read a
picked File after a reload — and that boundary has not moved.

**Capture One's EIP is the convention that survives both constraints.** An
Enhanced Image Package is standard zip containing the original raw file
together with its settings file and its ICC and LCC profiles: one self-
contained container, made for moving an image and its adjustments between
machines, non-destructive, with the original carried rather than referenced
([EIP overview](https://support.captureone.com/hc/en-us/articles/360002478617-Enhanced-Image-Package-EIP-overview);
[self-contained EIP files](https://support.captureone.com/hc/en-us/articles/360002640118-Exporting-RAW-files-settings-and-metadata-in-self-contained-EIP-files)).
It never writes the original, because it copies it in.

**And the constraint is structural as well as chosen.** A browser page is
handed a `File` and cannot write back to it; there is no path by which this app
could overwrite a picked original even if it decided to. What it can do is
produce new bytes and hand them to the share sheet. So the promise already
printed on the Basic tab — the original file is never changed — is one the
platform enforces, and the only thing this item has to get right is not
pretending the new file is the old one.

## Built already

- **`src/lookmark.ts` is this idea at one-tenth scale, shipped.** Every exported
  JPEG already carries the look that made it as an APP11 segment — `IPSLOOK\0`
  plus the `src/look.ts` wire-format JSON, about 600 bytes — and the app reads
  it back out. A file that carries its own recipe is not a new concept here; the
  only questions are which recipe and which container.
- **`src/look.ts` is the wire format and `.ipslook` is the precedent for the
  door.** A look already travels as a tiny file the reader saves and picks
  again, so the picker already routes a non-image file to a handler rather than
  to the decoder.
- **`src/zip.ts` is a minimal ZIP reader with no dependencies** (297 lines),
  written for ZIP import. EIP's container is a zip, and the READING half of it
  is already in the app and already tested against real archives.
- **`src/keepstore.ts` and `keptEditToJson` in `src/main.ts`** are 039's store
  and its edit round-trip, including the part that matters most here: masks
  travel as RECIPES with the bitmaps stripped by `shapeOf`, so the edit JSON is
  already small and already portable.
- **`src/gps.ts` already parses an original's own bytes and produces new bytes
  from them** without touching the file it was given — the existing proof that
  deriving a file is a thing this app does and does not confuse with editing one.
- **`src/dcp.ts` already writes a binary interchange format** (a DNG camera
  profile for Lightroom and Camera Raw), so writing a byte-exact container is
  not new ground either.
- **`src/export.ts` and the share path** are how any file this produces reaches
  the reader, and the export panel is where the Keep button already lives.

What genuinely does not exist: a zip WRITER, a declared package layout, and a
path by which picking one back opens the photograph with its edit on it.

## Weighed against

**039**, on staging now, which this completes rather than replaces: the in-app
list is the right answer to "pick it up in five minutes" and the wrong one to
"pick it up next month, on the other device".

**014 and 009**, which between them own how much of a photograph the app holds
and when it gives the storage back. A kept photograph that has been written out
as a file no longer has to be held at all, so this moves what those two can
promise.

`NOTES.md` "## The measurements lived in storage the app does not own" is the
prior occurrence of exactly this failure and the reason the first half is
ranked as a bound rather than a nicety.

## Depends

- needs 039 — the name, the store and the edit round-trip this writes out are
  039's; it cannot be right until that shape has been through a device pass.
- distinct-from 011 — 011 is the EXPORT: a finished photograph drawn from the
  pipeline. A keep file renders nothing and carries the original's bytes
  unchanged beside the recipe. They look alike because both end in a file the
  reader saves through the same sheet, and they are opposites — one is the
  result, the other is the ingredients — which is exactly the pair a later
  session would collapse into "just export it".
- touches 014 — 014 owns giving storage back when a quick look ends. Once a
  kept photograph exists as a file the reader holds, what the app must keep on
  the device changes, and so does what 014 may free.

## Options

1. **A self-contained keep file: the original's own bytes and the whole edit in
   one package, saved through the share sheet and opened again by picking it.**
   Chosen — EIP's shape, for EIP's reason. A STORE-only zip, since raw bytes do
   not compress and storing them plainly means the original inside is
   byte-identical and can be taken back out by anything that opens a zip. The
   file the reader picked is never written.
2. A sidecar the reader saves beside the original and picks together with it.
3. A COPY of the original DNG with the edit written into its XMP — Lightroom's
   DNG behaviour, applied to a copy rather than to the original.
4. The edit alone as a small file, with the photograph re-picked each time.
5. Leave it as it is: the in-app list only.

## Rejected

- **2 — a sidecar beside the original.** 039 already rejected re-asking for the
  file; a sidecar is that plus a second thing to pick, in the right order, with
  nothing keeping the two together once they are in a share sheet rather than a
  folder. The convention exists because Lightroom and darktable sit beside a
  filesystem that keeps adjacent files adjacent. This does not.
- **3 — a DNG copy carrying XMP.** The edit has no XMP vocabulary. Its looks,
  its mask recipes, its measured lens profile and its sky selections have no
  Camera Raw equivalent, so a file that ANNOUNCES itself as a DNG with develop
  settings would open elsewhere as the original photograph with a handful of
  settings that are not the picture that was saved. A container that lies about
  what it carries is worse than one that makes no claim to travel. Worth
  revisiting as a SECOND, clearly-labelled export for getting a frame into
  Lightroom — never as the thing the reader's own work is kept in.
- **4 — the edit alone.** This is 039's standing boundary and it has not moved:
  the device cannot re-read a picked File after a reload, so "come back later"
  becomes "find it in Files again", which is the failure the item exists to
  remove.
- **5 — leave it.** The in-app list stays and is not in question. It cannot be
  the only place the work lives, because the reader does not own that storage
  and the app cannot tell them when the browser is about to reclaim it.
- **AND, ON THE REQUIREMENT ITSELF: writing anything at all into the file the
  reader picked.** Not the pixels, not a header, not metadata — which is what
  the field's own leading tool does to a DNG, and is therefore the thing most
  likely to arrive later as "the conventional approach". It is refused here in
  advance. Every file this app writes is a NEW file.

## Rank

**Third: directly below the two items already on staging, above 034 and 032.**

It is not above those two, which are waiting on nothing but a device pass. It
is above the rendering work because those change how a photograph LOOKS and
this changes whether the work survives the week: 039's promise is bounded by
storage the app does not own, the reader is not told when that storage is
reclaimed, and nothing goes red when it happens. `NOTES.md` records the same
failure once already with the lens measurements, which is what makes this a
bound rather than a convenience.

It sits below 039 by dependency as well as by argument — the shape it writes
out is 039's, and settling that on the device comes first.
