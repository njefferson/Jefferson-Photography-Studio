# 101 · The balance the camera applied cannot be read from its raw file

## Context

A raw opens on a white balance the app finds from the photograph's own pixels
(gray-world, applied in camera space before the colour matrix; IR-SCIENCE.md section 3).
The camera's recorded balance is not used, because on these files it is the preset's
daylight default and not a measurement: developed at it, a raw renders a magenta wall
with the green channel at zero. That conclusion rested on one raw on slot four. The
question this record asks is the next one: does any tag in a Z 50 NEF carry a balance the
camera MEASURED, so that opening could offer the camera's own choice beside the app's?

Measured 2026-10-23 on four raws from the reader's shared zip of 2026-10-17, read three
ways (the figures and sources are in IR-SCIENCE.md section 3, last subsection):

- **The plain tag.** NIR_3762, NIR_3738, NIR_3736 and NIR_3735 all record slot six with
  fine-tune 0 and 0, and tag 12 reads red 1.8574 and blue 1.4668 on every one: the pair
  the earlier raw on slot four records. Five raws on two slots, one pair.
- **The encrypted block, with the maintained tool.** ExifTool 13.59.3 reads the
  colour-balance block (tag 151, 3316 bytes on all four, version 0801) and names it
  unknown for this body: its table for versions opening 08 defines the version field and
  nothing else, so no red or blue levels are decoded, with or without the two keys the
  tool uses for the blocks it can decode. The tool's auto colour temperature, tag 79,
  reads 0 on all four.
- **The camera's own previews.** The embedded full-size JPEG of each raw reads red over
  green 2.3 to 3.5 and blue over green 1.2 to 1.5, over the whole frame and over the
  middle half, and opened they are one coral-red rendering with nothing neutral in any of
  them. That is the daylight pair applied to a raw whose red channel carries the infrared
  flood, and not a balance taken on foliage.

So nothing reachable in these files carries a measured balance. What is not known, and
is the whole of what is left: whether the camera can store an infrared measurement in a
preset slot at all. None of the five raws read was shot on a slot known to hold one.

## Looked up

Everything below is also listed, with how it was read, in IR-SCIENCE.md section 3.

- **ExifTool 13.59.3**, npm package `exiftool-vendored.pl`
  (https://www.npmjs.com/package/exiftool-vendored.pl). Fetched and run on the four raws;
  its Nikon module and its main module read as text in the unpacked package. Tag 151's
  conditions send versions opening 08 to `ColorBalanceUnknown2`, a one-field table. The
  decrypting entries are for D-series versions. The decryption keys are the camera's
  serial number and its shutter count, read from the same maker note; neither value is
  recorded anywhere in this repository.
- **jpeg-js 0.4.4** (https://www.npmjs.com/package/jpeg-js), a pure JavaScript decoder,
  run on the four previews by a scratch script made to fail on planted images of known
  ratios before any reading was taken.
- **The tool's own tag documentation for Nikon**
  (https://exiftool.sourceforge.net/TagNames/Nikon.html) and **the exiftool.org forum
  thread on an unknown Nikon body's encrypted maker notes**: both named by one web search
  on 2026-10-23, neither fetched, the plan recording both hosts as denied in this
  container. The search result says the serial number and the shutter count are the
  decryption keys and that the colour-balance block has several versions with an unknown
  one. The module's source is what was read in their place.
- **Earlier, in IR-SCIENCE.md section 3:** the Z 50 Online Manual's sentence that an
  empty preset slot falls back to 5200 K, and darktable's Z 50 Direct Sunlight preset,
  which the pair sits within a few percent of.
- **Not read:** any raw shot on a slot known to hold a measurement; any version of the
  tool later than 13.59.3; Adobe's pages (HTTP 403 in an earlier run).

## Built already

Do not write a second one of any of these.

- **The balance found from the data is `grayWorldWB` in `src/decode.ts`.** It takes the
  decoded image and returns the three gains, the gray-world mean of the camera's own
  linear values with sensor-clipped samples left out. The shader applies them in camera
  space (`u_wb` in `src/gl.ts`), before the lens correction and the colour matrix. That is
  what this record keeps as the default; nothing here replaces it.
- **The maker-note walker is `findLinearizationTable` in `src/raw/nef.ts`.** It already
  navigates to the directory that holds tags 12 and 61 on a Z 50 NEF, reads tag 61 only
  when its type is short and its count is four, and carries a comment saying tag 12 is in
  that directory and is deliberately not read. A reading of tag 12 in the app would be
  written beside that comment, and the comment's reason is IR-SCIENCE.md section 3.
- **The research is in `IR-SCIENCE.md` section 3**, now with the 2026-10-23 subsection:
  the plain tag on five raws, the tool's reading of the encrypted block, the previews'
  ratios, and every source with how it was read.
- **The shared test photographs are listed by `tools/owner-images.mjs --list`.** A raw shot
  on a measured preset slot would arrive by being shared and then read the same three
  ways; none of the four raws read here is in that list (Q-JPS-99).
- **The instruments of 2026-10-23 live in the session scratchpad and are not committed**:
  a parser for tags 5, 11, 12 and 61, the maintained tool unpacked from its package, and
  a script for a preview's channel ratios. They are small and each was made to fail on a
  plant first; the next reading rebuilds or reuses them rather than writing a fourth.

## Weighed against

- **085, the lens correction whitens bright centre foliage** (open). Its colour readings
  (the correction cutting blue against red at the centre; neutral things moving toward
  the frame's edge) are all made on frames opened at the app's balance. If the camera's
  measured balance could be had, those readings would be taken against a different one.
- **066, Aerochrome rendered from a model of the film** (open), and IR-SCIENCE.md 9u. The
  white balance removes four fifths of every population's colour, and what survives is
  all the look has to work with; 9u measured that a white point taken from the clear sky
  raises lit foliage chroma 1.1 to 3.5 times (Q-JPS-82). The film model's inputs sit
  after the balance.
- **029, the sky mask claims things that are not sky** (archived). `buildSkyMask` and the
  sky guide are built at the gray-world gains (`src/sky.ts` takes them as `wb`;
  `src/skyfine.ts` reads three channels of the gray-world-balanced frame). A different
  balance at open would change what the selection keys on.
- **Done before on this ground:** IR-SCIENCE.md section 3's correction of 2026-10-01 (two
  slots record one number because both hold nothing, which the manual explains) and its
  measurement of 2026-10-06; and NOTES.md, the staging entry "Is a raw still
  white-balanced right when it opens, under v2.65.3's colour conversion", which found the
  balance right and the matrix the thing that turned the picture.

## Options

1. **Keep the balance found from the data, change nothing at open, and get the one
   reading that is missing.** Done as far as it can go, and still the default: a raw
   opens at the balance found from its data unless one is held (see Outcome). The one
   missing reading is not taken: NIR_4027 was read the same three ways and was shot on
   slot one with nothing known to be stored there. One raw is shot on a preset slot set
   from a foliage measurement in sunlight, and read the same three ways as the four
   here: the plain tag, the tool's block, the preview's ratios. Then:
   - If tag 12 differs from the daylight pair on that raw, a measured balance does reach
     the file. The next record offers it at open as a visible, undoable choice beside the
     data-found one, never as the default, and starts from that raw's numbers.
   - If tag 12 still reads the pair, the camera does not write its measurement where any
     tool reads it, and this record closes as not owed.
   Nothing in the app changes first, because every reading so far says the file carries
   no measured balance and a change made now would be made on no data.
2. **A per-channel gain control that takes a number.** Built, beneath the new sliders:
   the three gain sliders already took the gains and are the exact state; Temperature and
   Tint are two more readings of them, defined on the camera's own channels (see
   Outcome). It serves a reader with a balance in mind, whatever the file says, and does
   not wait on the camera. It is a control with a visible value and one undo step.
3. **A named balance that applies to a set across sessions and cards.** Chosen, and built
   on staging (see Outcome). It is option 2's gains kept under a name, with a hold that
   makes every raw open at them, a control that puts them on the photographs already
   open, and a way back to the automatic.

## Rejected

- **Decrypting the colour-balance block by hand, in the app or in a scratch parser.** The
  maintained tool names this block unknown for this body, so no layout for version 0801
  is written down in the version read. A decryptor needs the two keys and a layout; with
  the layout missing, any levels it printed would be guesses with good prose on them. A
  later version of the tool that defines the block would reopen this, and it is the first
  thing to check when one exists.
- **Opening raws at the plain tag's levels.** IR-SCIENCE.md section 3 measured the result
  (a magenta wall, green at zero) and five raws on two slots now give the same pair,
  which the manual says is what an empty slot falls back to. A session once shipped this
  reading as "open as shot" and took it out the same day.
- **Matching the previews.** A preview carries the camera's matrix, tone curve and
  Picture Control, and a frame's mean depends on its scene. They are also the
  daylight-pair rendering, so matching them reproduces the look the app exists to leave.
- **Reading tag 79 as a temperature.** It reads 0 on all four, the table gives it no
  meaning and the module marks its source as another body.
- **A gain control, a saved balance or a decoder change inside the research.** The
  research was the step; the options above are what the next plan chooses from.

## Rank

**First, above 085.** The queue's test is whether work ranked below would have to be
redone once this is answered, and 085's colour readings, 066's film model inputs and 029's
sky keying are all made at the balance the app opens with. The measurement that decides
whether that balance can ever be the camera's own costs one raw and three reads, and it is
cheap beside re-tuning colour work against a balance that then moves. Nothing in the app
is blocked on it today, because option 1 changes nothing until the reading arrives; the
rank is about doing the cheap question before more colour work is tuned, and not about
severity, since no reader sees a defect from it.

## Outcome

Built and on staging for a device pass on 24 October 2026; nothing is promoted.

**What NIR_4027 read.** It was shot on preset slot one. Its plain white balance tag reads
the daylight pair again to four places (red 1.8574, blue 1.4668), the maintained tool and
both published raw readers decode no levels from the colour-balance block for this body,
its auto colour temperature reads 0, and its embedded preview is the same coral-crimson
rendering of that pair, redder than the other four (red over green 5.467 and blue over
green 1.886 over the whole frame). Nothing in the file carries a measured balance, and
the file cannot say whether slot one held one when it was shot. So option 1's one missing
reading is still not taken, the camera side stays open, and a raw opens at the balance
found from its data unless one is held.

**The option built is the third, with the second beneath it.** Above the three gain
sliders the Basic tab gains Temperature and Tint, each with a number that can be typed.
They are the same three gains read two more ways, on the camera's own channels and never
Kelvin: Temperature is half the gap between the red and blue gains' places on the gain
sliders' own track and Tint is a third of how far the red and blue places' mean sits above
green's. Moving either lands on the nearest balance the track has with the sum of the
three places unchanged, which is the gains' geometric mean, so a move changes the white
point and not the overall level. Hold keeps the open raw's balance under a name, and
every raw opened afterwards starts at it in place of its own automatic balance, on the
five sliders, undoable, with Reset going back to where the photograph opened; one control
puts the held balance on the photographs already in the set, as one undo step on each,
and one control returns the open photograph to its automatic balance and ends the hold.
The names are kept on this device (a store modelled on the lens profiles') so a reload, a
new session or another card can use one. Camera-developed files are never touched.
NIR_4027 at its own balance reads Temperature -72.5 and Tint -5.2 in that scale, and NIR_3762
at its own reads -86.5 and -2.8; held at the foliage-tapped balance (Temperature -62.6, Tint
-5.7) NIR_3762 opened at the held gains and not at its own.

**Changed 27 October 2026 (record 102, on staging):** the Temperature and Tint sliders and
boxes described above no longer count steps of the gain track; they read the same three gains
on Lightroom's scale (Temperature 2000 to 50000, Tint minus 150 to 150) through the camera's
profile, and the hold, the kept names and Reset are untouched.

The commit is the staging commit of this plan, whose subject opens New and reads: a white
balance you set once now holds for every photo that follows, can be put on the whole set and
kept under a name, with Temperature and Tint sliders above the gains.

**What turned out wrong on the way.** A first slider handler asked for the thumb's new
whole number outright and moved nothing when the reading sat half a track step from the
thumb (Temperature is a half step wherever the red and blue places differ by an odd number);
a slider now moves the balance by how far the thumb moved. A tap on a cloud of NIR_4027
barely moves the balance because gray-world has already made a cloud nearly neutral. The
tiles of photographs not yet opened are still drawn at their own automatic balance, because
the tile worker is untouched; opening one lands it at the held balance. The first build put the
line that says a balance is held inside the Basic tab, where none of the other tabs and not the
stage could show it, and a state that changes what every raw opens at is not standing if it is
visible from one tab of twelve; it has a row of its own under the top bar now, the update
strip's precedent, with the way back to the automatic beside it, and the accessibility walk
reads it with another tab open.

## Depends

- touches 085 — its centre colour readings are taken at the balance the app opens with, so a camera balance that could be had would change what they are measured against.
- touches 066 — the film model's inputs come after the balance, and a white point taken from the clear sky moved lit foliage chroma 1.1 to 3.5 times in 9u.
- touches 029 — the sky mask and its guide are built at the gray-world gains, so a different balance at open changes what the selection keys on.

## Looked at

The four raws are the reader's own, from the shared zip of 2026-10-17, and NIR_4027 is the
reader's own from the shared folder. None is in an entry of `tools/owner-images.json`, so
each entry below names its frame by number in the body and not as a listed file. Each
preview was extracted from its raw and OPENED whole before any line of this record or of
IR-SCIENCE.md was written about it, and NIR_4027's renderings in the app were opened whole
before the Outcome was written; the ratios beside each are a pointer to where to look, and
the picture is what was read.

- The bird in flight over a conifer slope, with a branch across the right, NIR_3762: the
  preview is a coral-red sky, pale pink conifers running to white at their brightest
  and deep crimson shadows; the bird is dark against the sky. Nothing in it is neutral,
  blue or green. Red over green 3.274 and blue over green 1.329 whole frame.
- The lake shore under a clear sky, NIR_3738: a saturated red sky over a pale pink
  conifer slope, a light pink spit of bare ground and deep crimson water. The sky has no
  trace of blue. Red over green 2.868 and blue over green 1.201 whole frame.
- The wooded shore with a boat dock, NIR_3736: tall conifers pale pink to white in the
  light and dark crimson in shade, light pink bare ground, crimson water, boats and docks
  pink to white. The whole frame is one red-pink cast. Red over green 3.283 and blue over
  green 1.335 whole frame.
- A closer crop of the same shore, NIR_3735: the lit tree and bare ground at the middle
  are pale pink to white, the shade is deep red, the water crimson, and a small piece of
  coral sky shows at the top. The same rendering as the three above. Red over green 3.478
  and blue over green 1.452 whole frame.

- A cloud sky over conifers and bare trees above a car park, NIR_4027: not a preview but
  the app's own rendering of the raw, opened whole through the page in the container's
  software graphics and then compared with itself after a tap. At the balance it opens at
  (red 0.9985, green 1.7981, blue 2.6320) the clouds run white to grey over a slate sky,
  the lit foliage is cream with a faint peach-pink cast, the tarmac is blue-grey and
  nothing is strongly red or saturated. After a tap on foliage (Temperature -72.5 to
  -62.6, Tint -5.2 to -5.7) the same frame is plainly cooler: the clouds read bluer white,
  the sky slate-teal, the foliage nearer a neutral grey-cream and the tarmac bluer. A tap
  on a cloud barely moved it (Temperature -72.5 to -70.8), and the two pictures cannot be
  told apart, which is why the picture of a tap is the foliage one. The same balance
  held on NIR_3762 draws a cyan-blue sky over silver-white conifers with the bird dark;
  its own automatic balance was a different one (Temperature -86.5, Tint -2.8).

None of the four previews looks like a balance taken on foliage, which would bring the
foliage toward neutral and the sky toward blue. All four look like the preset's daylight
pair applied to an infrared raw.
