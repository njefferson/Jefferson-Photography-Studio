# 063 · A shared look file cannot be picked on an iPad

## Context

Found by reading, 2026-09-24, while the `.cube` picker fix was being checked.
It has not been seen on the device, and this record says so rather than
presenting an inference as a measurement.

**A shared look is written as `<name>.ipslook`** (`lookFileName` in
`src/look.ts`), a small JSON file saved through the share sheet. It is read
back three ways: by link, by pasted code, or as a file picked through any of
the five Open pickers in `ir.html`, whose `accept` lists `.ipslook`, or through
`#lookFile` in My looks, whose `accept` is `.ipslook,.json,application/json`.
The router does not trust the name: `sniffLook` reads the first bytes for the
look's magic, so what a file IS decides how it is handled.

**The file route is the one that rests on an extension nothing declares.** 056
measured the mechanism for `.cube`, and 043 measured it for `.ipskeep` before
that: iOS resolves every `accept` entry to a type identifier, an extension no
installed app declares resolves to nothing, and the file is typed `public.data`,
which matches none of the entries. So a `.ipslook` saved to Files is expected to
sit greyed out in every picker that should take it. The NOTES entry for the
look-sharing release lists the AirDrop and Files round trip as needing the
device and never records it done.

**With no photo open the file route is the only one on screen.** The Import
look file and Paste look code buttons sit in the Export panel, which needs a
photograph; with none open, a look arrives by link or by picking the file
through Open, and the second of those is the one this record expects to fail.

**The obvious remedy is blocked in one specific place.** Writing the file as
`<name>.ipslook.json` would make it a type the platform registers, as 043 did
with `.ipskeep.zip`. But `OPENABLE_EXT` in `src/main.ts` is anchored at the end
of the name, `/\.(dng|nef|zip|ipslook|ipskeep)$/i`, so a name ending `.json` is
not openable through the main pickers at all, and five `accept` attributes
repeat that list by hand. `tools/openable-check.mjs` holds the six together,
so the remedy is one list changed and the gate checks the rest.

## Looked up

**The platform behaviour is 056's research and it applies unchanged.** iOS
filters the document picker by type identifier; an undeclared extension matches
nothing; `.json` resolves to `public.json`, which `accept=".json"` and
`application/json` both match. Sources as cited in 056: betterprogramming.pub on
greyed icons in the document browser and picker; parorrey.com on the greyed-out
Safari upload control; Apple Developer Forums threads 118932 and 708303 on custom
identifiers and `UTTypeTagSpecification`.

**A web app cannot declare a type.** A type identifier comes from an installed
application's `Info.plist`, and this app has no bundle on purpose (056).

**Nothing outside bears on the naming choice beyond that**: how other editors
name their preset files (Lightroom's `.xmp`, Capture One's `.costyle`) works
because their installed apps declare those types, which is the one route closed
here.

## Weighed against

- **056, "A .cube file cannot be picked on an iPad"**, shipped the other remedy,
  taking `accept` off a picker that only ever takes colour files. Its record
  names `.ipslook` as the same exposure and leaves it as a separate item because
  its remedy has a cost; this is that item.
- **043, "A kept photograph should be a file you own"**, is where renaming to a
  registered type was measured to work, as `.ipskeep.zip`.
- **NOTES "Look sharing"**, release 1: the known limit that the import buttons
  need a photograph, and the device round trip listed as owed.

## Depends

- touches 056 — the same picker wall; 056's remedy is the one rejected below, for a reason that record did not face.
- touches 043 — the renaming remedy chosen here is 043's, and a change to how 043 names its file would move this reading.

## Options

**Write shared looks as `<name>.ipslook.json`, open `.json` everywhere a look is
read, and keep reading plain `.ipslook`.** Chosen.

- `lookFileName` writes `.ipslook.json`. The file already is JSON with
  `application/json` as its type, so the name becomes honest as well as
  selectable.
- `json` joins `OPENABLE_EXT`, and `openable-check` then refuses the commit
  until the five `accept` attributes carry `.json` too.
- The router already decides by content: a picked `.json` that is not a look is
  refused by `sniffLook` and answered in a sentence, as a non-LUT `.cube` is.
- Files already saved as `.ipslook` stay readable wherever a picker can reach
  them: by link, by code, and on any platform that does not grey them out.
- The claim is checked on the device before it is called fixed: save a look to
  Files, pick it from the start screen's Open with no photograph open, and from
  My looks.

## Rejected

- **Take `accept` off the main pickers, as 056 did**: 056's picker only ever takes colour files, so its filter was doing nothing a reader needed. The main Open is where every session starts, and its filter is what greys out everything that is not a photograph in a folder of mixed files; removing it trades that away on the most-used control to fix a secondary route.
- **Leave the name and point readers at links and codes**: the file is the route that works without a network and across AirDrop, it is the one the app itself offers in the share sheet, and a feature whose own button produces a file its own picker cannot take is the defect, not a limitation to document.
- **Declare a type for `.ipslook`**: needs an installed app with an `Info.plist`, which this app is not, by design.
- **A second picker with no filter just for looks**: two controls for one file type, and the one on the start screen would still grey it out.

## Rank

**After 053 and before 052, as a small defect with a known remedy.**

Nothing above it has to be redone once it is fixed, and it changes nothing any
of them read, so dependency does not lift it. It sits ahead of the look
population chain (052, 061, 013) because it is one list, one name and one
device check, while those are measured work that each wait on renders, and
putting a small independent fix behind them would hold it for no reason the
queue can state. It sits behind 012 and 053 because those change what a reader
sees on every photograph, and this changes one secondary route.
