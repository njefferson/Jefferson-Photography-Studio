# 062 · Choosing a colour file means leaving the photograph, eighteen times

## Context

Reported from the device, 2026-09-24. The LUT manager that 059 shipped is a
full-screen list of name, size and Apply, Share and Delete. Comparing eighteen
colour files in it means Apply, close, look at the photograph, and reopen,
eighteen times. It was built to hold files, not to choose between looks. The
report asked what the convention is, whether each file can show a thumbnail,
live or from a sample, and whether choosing can be a list you tap through
while watching the photograph rather than a setting deep in an admin screen.

**What the app does today, measured by reading the code.**

- Pressing Apply commits through `flushRecord` twice. Tapping through eighteen
  files would add eighteen undo steps, and the stack holds 100 and drops the
  oldest, so real edits would be pushed out. Each step holds its lattice, which
  is about 3.3MB at 65³.
- A LUT does not survive the iPad closing the tab: `editToJson` strips it, and
  Help says so. Saved looks already keep `{lutId, lutStrength}` and look the
  file up again, which is the pattern that fixes this.
- `listLuts()` reads every lattice and every original file into memory at
  boot. With 25 files at 65³ that is about 270MB, on a device that reports no
  memory figure at all.
- Strength carries over between files. At 0 it makes every later tap look
  dead, because both render paths treat 0 as no LUT.
- The list is sorted newest first, and a pack is stored in pack order, so a
  pack displays in reverse.

## Looked up

The browsers that exist for this all share one shape.

- **Lightroom on iPad**, profiles and presets: a strip of thumbnails you tap.
  Each tap applies to the photograph straight away, and it stays on screen.
  Tapping the selected thumbnail again opens its Amount slider. Import, hide
  and favourites sit behind a More menu, not in the strip.
- **Lightroom Classic's Profile Browser** replaces the panel stack in place,
  beside the photograph, with list, grid and large-thumbnail views and a Close
  that returns to the panels. Management is a separate dialog.
- **Apple Photos filters**: a strip under the photograph, with Original first.
  A tap applies live, then a slider sets strength. There is nothing to manage.
- **Instagram**: a strip of filters with a Manage button at the END, which
  opens a separate screen for reordering and hiding.
- **VSCO and Snapseed**: tap applies live, and tapping again sets strength.
  These are secondary sources only.

Sources: helpx.adobe.com pages on profiles, presets and managing them (search
summaries only, because the host answered 403); support.apple.com pages on
editing photos (search summaries, because the host is blocked by egress);
lightroomqueen.com, mastering-lightroom.com, imore.com and macrumors.com
(secondary). The hosts that refused are listed in the plan and were asked for
on 2026-09-24.

**Where the convention does not reach this app.**

- It assumes hover on desktop. On a tablet the tap is the commit, which is
  why browsing has to be one undo step.
- Its thumbnails are drawn from the open photograph. Here that is also the
  only honest source. A pack's swap-type files undo the app's own red-blue
  swap, and only a tile from the reader's photo shows that truthfully; a
  sample in some other state would mislead.
- With no photograph open there is no tile source. The practice photos are
  not precached, so a fresh offline install may have no sample either. Tiles
  have to say in words what tapping does.

## Weighed against

- **059, a colour file is not a photograph.** It chose one shared dialog for
  managing files, opened from three places, and it chose that Apply closes the
  dialog. That second choice is the reported defect, and it is what this
  record revisits. Its Rejected 4 (two copies of the list with two render
  paths) still holds, so the browser is one element with one render function.
- **058, a LUT said nothing about itself.** Its Rejected 4: pressing a Look
  must never drop the LUT. A row mixing Looks and files must keep two
  selections.
- **057, imported LUTs were on the wrong tab.** Its Rejected 2: no second
  swap control inside the browser.
- **060, the top bar and the start card.** Where the browser's door sits on
  the start card waits on 060's layout.
- **042, masks.** What a tap does while a mask is targeted: the file stays
  whole-photo and its strength may go per mask (042's stage 2).
- **053, the session strip on a phone.** A strip over the photograph would
  compete with it for the same height.

## Depends

- touches 059 — revisits its "Apply closes the dialog" and keeps its one-list rule.
- touches 058 — a Look press must not drop the file, so a merged row keeps two selections.
- touches 057 — no swap control inside the browser.
- touches 060 — the start card's door for this waits on 060's layout.
- touches 042 — a tap while a mask is targeted changes the file for the whole photo; the strength may go per mask.
- touches 053 — a strip over the photograph competes with the session strip for height.
- touches 003 — anything floating over the photograph is 003's question.

## Options

**The convention's shape, in whichever layout is chosen from pictures.**
Chosen for the parts every candidate shares:

- The browser sits beside the photograph and stays open.
- Each tap applies live.
- None comes first.
- Tapping the chosen file again shows its strength.
- Tiles are drawn from the reader's own photograph. With none open they say
  in words that a photograph is needed to preview.
- Browsing commits as ONE undo step, when the browser closes or the reader
  moves on.
- A file survives the tab closing, by keeping `{lutId, strength}` as saved
  looks already do.
- Strength resets to full on a new file.
- Import, Share and Delete stay in the 059 dialog, behind "Manage…" at the
  end of the browser.

**The layouts to render and choose between:**

- a grid on the Grade tab;
- a LUT place in the panel column, the Lightroom Profile Browser shape: None,
  pinned strength, Import… and Manage…, Done;
- a "Your LUTs" strip directly under the Looks on the IR tab;
- a step-through with ‹ name › and no thumbnails.

Each is rendered at iPad landscape and portrait, in both themes, with tiles
from the reader's photograph beside a sample and a chart.

**Chosen 2026-09-24 from the rendered layouts: a grid on the Grade tab.** None
is the first tile, each stored file follows as a tile drawn from the open
photograph, and Manage… is the last. The strength row under it stays where it
is, and tapping the chosen tile again takes the reader to it.

## Rejected

- **Keeping Apply-and-close as it is and adding thumbnails to the rows**: the round trip is the defect; thumbnails in a dialog that closes on every choice still hide the photograph behind the chooser.
- **Each tap as its own undo step**: eighteen taps would push real edits off a 100-step stack, and hold 18 lattices in memory.
- **Tiles from a bundled sample image**: a swap-type file shows the opposite of what it will do to the reader's photograph; the sample would mislead exactly where it matters.
- **A second copy of the list for browsing**: 059's Rejected 4, two render paths kept in sync by hand.
- **One selection shared by Looks and files in a merged row**: 058's Rejected 4, pressing a Look would drop the file.
- **Tap the chosen file again to remove it**: an accidental double tap drops it; the convention is strength, and None removes.

## Rank

Directly below 060, because its door on the start card waits on 060's
layout, and above 012, because 012 does not touch it. It does not block 042,
and it must not claim the panel column as a second place before 042's stage 2
shape is chosen.

**The grid does not wait on 060.** Only the start card's door to this
browser does, and until 060's layout is chosen that door stays 059's "Manage
your LUTs" button, unchanged. The grid lives inside the Grade tab and claims no
second place in the panel column, so it touches neither 060's bar nor 042's
stage 2.
