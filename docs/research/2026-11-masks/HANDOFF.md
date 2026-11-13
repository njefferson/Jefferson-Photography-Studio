# Handoff, 12 November 2026: the mask made from samples

Read this first. It says where the work stands, what was learned, and what comes next. The notes, reports and scripts beside it are the evidence.

## Where the app stands
- Staging is at 2.79.1, the commit whose subject opens "Fixed: on the test page a mask from your samples is made from the photograph itself". Main is at 2.71. The builds 2.72.1 to 2.79.1 wait on a device pass and the go for promotion.
- On the test page (`debug.html`, `src/debug.ts`) a person places named samples on a photograph and a mask is made for each name by the app's own recipe (`src/samplemask.ts`), a fit on ten cues.
- Since 2.79.1 those cues, and the lightness a mask's edge follows, are counted from the photograph's own decode through the function placeDecode in `src/placedecode.ts`, which calls the Sky mask's own guide (buildSkyGuide in `src/skyfine.ts`) and takes no edit. A mask or a Separation selection kept before 2.79.1 is listed as made from the drawn picture and is not applied.
- The rule this follows is in the app's CLAUDE.md under the heading A MASK AND EVERY SELECTION READ THE PHOTOGRAPH'S OWN DATA, and in decision record 032.
- The notes' section On staging, waiting on a device pass has no entry for 2.76 to 2.79 (queue key Q-JPS-339).

## The result the work serves
Samples placed on a photograph make a mask from what they hold. The mask copies to other photographs, showing what it would take before it is applied. Where it is wrong, it is put right by placing samples there.

## The bar a mask is held to
No connected region wrongly taken, and none wrongly left, larger than one hundredth of the frame; and the mask's edge within four pixels of the thing's own edge at each crop looked at. A mask is judged over the whole photograph, from an opened picture, by an agent that did not make it. A share of the pixels inside samples is never a measure of a mask.

## What was measured, and what it showed
- 11 November, by day (decision record 111 and the science file's section headed A MASK MADE FROM SAMPLES, JUDGED OVER WHOLE PHOTOGRAPHS). Four kinds of selection over eight whole photographs. Every one was fed the picture as it opens, after the balance, the exposure, the channel swap and the denoise, and none was fed the decode, so the figures describe each method on an edited picture.
  - The app's recipe: the largest wrong regions.
  - A scene-labelling model: failed; its cells are about 29 pixels and its classes are fixed.
  - Click-prompted models, MobileSAM and SlimSAM, given each subject's sample centres as inside points and the other names' as outside points in one prompt: MobileSAM came closest. It follows tree lines, tower tops and roof lines, leaves parts of a subject that hold no sample, fills the open air in pylon lattices, and its edges lie 5 to 45 pixels off.
  - A classifier fitted to the samples on a learned model's features (DINOv2 small): blob-shaped edges 30 to 200 pixels off; a fit carried to a photograph of another scene took a quarter or less of what that photograph's own fit takes.
  - Edge stages, measured alone: none brought a right coarse map to four pixels. The stage that fits the app's cues near the edge was the only one that followed real tree lines, to about 5 to 10 pixels.
- 11 November, evening. The app's recipe made two ways on the same photographs and samples, from the drawn picture and from the decode, on 22 frame-subjects: the decode way better on 5, the same on 12, worse on 5, broken on none. A recipe copied to a second photograph, 8 cases: better 4, same 2, worse 2. No mask by either way meets the bar. The faults both ways share are queue keys Q-JPS-344 to Q-JPS-349: overcast sky and cloud taken as built things, a beach and plant stems taken as built things, sky left out between towers, a road taken as sky, shore rocks taken as foliage, crowns cut, and edges landing inside gaps in branches.
- 12 November: the click-prompted models fed the photograph's own decode (queue key Q-JPS-352). What was fed: `placeDecode` called on a grid the size of the guide itself, 1,024 by 682 on every frame, whose pixels gave a colour picture and whose light gave a grey one, with no resize because the longer side was already 1,024. The prompts: one joint prompt for each subject, that subject's sample centres inside and every other name's centres outside, the first sample set only. The five entries: the app's recipe from the decode (the 22 masks of 11 November), MobileSAM on the colour picture, MobileSAM on the grey picture, SlimSAM on the colour picture and SlimSAM on the grey picture. Two judges that built none of it opened a whole picture and an edges picture of each of the 22 frame-subjects over the eight photographs (notes/points-decode-judgement-first.md for 10 of them and notes/points-decode-judgement-second.md for 12; how to run it again is in notes/points-decode-how-to-run.md).
  - How the two files count an Uncertain mark. The first file counts it under its plain mark and names those marks at its foot. The second counts an Uncertain clause apart, in neither the met count nor the not-met reading, and lists it at its foot. So a figure below is the first file's plus the second file's plain marks, and the second file's Uncertain clauses are not in it.
  - The recipe: region clause met on 6 plus 4, which is 10 of 22; edge clause met on 3 plus 0, which is 3; both met on 2 plus 0, which is 2.
  - MobileSAM on the colour picture: region clause met on 9 plus 9, which is 18; edge clause on 2 plus 0, which is 2; both on 2 plus 0, which is 2.
  - MobileSAM on the grey picture: region clause met on 9 plus 7, which is 16; edge clause on 1 plus 0, which is 1; both on 1 plus 0, which is 1.
  - SlimSAM on the colour picture: region clause met on 4 plus 4, which is 8; edge clause on 0 plus 0, which is 0; both on 0 plus 0, which is 0.
  - SlimSAM on the grey picture: region clause met on 4 plus 6, which is 10; edge clause on 0 plus 0, which is 0; both on 0 plus 0, which is 0.
  - Against the recipe, better, same, worse, broken, each as the first file's figures plus the second's. MobileSAM on the colour picture: 4 plus 6, 1 plus 4, 5 plus 2, 0 plus 0, which is 10, 5, 7, 0. MobileSAM on the grey picture: 4 plus 5, 1 plus 5, 5 plus 2, 0 plus 0, which is 9, 6, 7, 0. SlimSAM on the colour picture: 3 plus 3, 0 plus 1, 7 plus 8, 0 plus 0, which is 6, 1, 15, 0. SlimSAM on the grey picture: 3 plus 4, 0 plus 2, 7 plus 6, 0 plus 0, which is 7, 2, 13, 0.
  - What it showed. No entry meets both clauses on most of the 22 frame-subjects: the most is 2 (the recipe on NIR_1651 Foliage and Sky; MobileSAM on the colour picture on NIR_3466 Built things and Foliage, each with an edge mark near the four-pixel limit). MobileSAM is nearer than the recipe on regions and further on edges: its line on tree lines and crowns (NIR_1827, NIR_1651, the Sky of NIR_3742 and NIR_3705) lies about 10 to 40 pixels off, with one place at 60 or more on NIR_1827 Sky, where the recipe's lies about 3 to 12, bar one place of about 40 in open sky on NIR_3705 Sky. It cuts lattice pylons as solid shapes and leaves halos of sky round distant pylons. SlimSAM, from the three-mask file run with the best-scored mask taken, takes regions of another kind of about 25 to 40 hundredths of the frame on several frame-subjects and stipples open sky. The colour and the grey picture gave MobileSAM nearly the same marks. The findings are queue keys Q-JPS-353 onward.
- 12 November, evening: MobileSAM's masks on the colour picture with the recipe's cues at the edge. Every setting was fixed before any mask was made. The coarse map is MobileSAM's mask on the colour picture from the afternoon. In a band of 48 pixels each side of its edge the band is decided again by the recipe's cues counted on the decode, by the fit with the cue named height left out, in two ways: way one, the fit reads every sure pixel of the frame; way two, the fit reads only the sure pixels within 144 pixels of the edge. The last step is the plain guided filter of radius 8 and regularisation 0.001, guided by the decode's lightness. 44 masks were made for the 22 frame-subjects (none lacked a recipe). Four masks of each frame-subject were judged, the recipe, MobileSAM as it is, way one and way two, by two judges that built none of it, from a whole picture and an edges picture of each (notes/cue-edge-judgement-first.md for 10 frame-subjects and notes/cue-edge-judgement-second.md for 12; how to run it again is in notes/cue-edge-how-to-run.md).
  - How the two files count. Both count an Uncertain clause apart, in neither the met count nor the not-met reading. So each figure below is the first file's plain count plus the second file's, and the Uncertain counts are beside it, counted the same way.
  - The recipe: region clause met on 5 plus 3, which is 8 of 22, Uncertain on 2 plus 4, which is 6; edge clause met on 0 plus 0, which is 0, Uncertain on 3 plus 1, which is 4; both met on 0.
  - MobileSAM as it is: region clause met on 7 plus 7, which is 14, Uncertain on 1 plus 3, which is 4; edge clause met on 0 plus 0, which is 0, Uncertain on 2 plus 1, which is 3; both met on 0.
  - Way one: region clause met on 7 plus 9, which is 16, Uncertain on 2 plus 1, which is 3; edge clause met on 0 plus 0, which is 0, Uncertain on 2 plus 0, which is 2; both met on 0.
  - Way two: region clause met on 7 plus 7, which is 14, Uncertain on 2 plus 2, which is 4; edge clause met on 0 plus 0, which is 0, Uncertain on 2 plus 2, which is 4; both met on 0.
  - Words, better, same, worse, broken, each as the first file's figures plus the second's. Way one against MobileSAM as it is: 6 plus 4, 2 plus 4, 2 plus 4, 0 plus 0, which is 10, 6, 6, 0. Way one against the recipe: 3 plus 8, 4 plus 2, 3 plus 2, 0 plus 0, which is 11, 6, 5, 0. Way two against MobileSAM as it is: 6 plus 6, 1 plus 3, 3 plus 3, 0 plus 0, which is 12, 4, 6, 0. Way two against the recipe: 3 plus 7, 4 plus 5, 3 plus 0, 0 plus 0, which is 10, 9, 3, 0.
  - What it showed. First, neither way meets both clauses plainly on any of the 22, and no mask of the four meets the edge clause plainly on any; both judges wrote distances of about 4 to 8 pixels as Uncertain, so the zero is partly the limit of reading a distance by eye. Second, the stage brings MobileSAM's line nearer on tree lines and crowns (NIR_1827 Sky from about 25, 45 and 45 pixels to about 5, 6 and 10 by way one; NIR_3742 Sky from about 40, 40 and 15 to 20 to about 5, 4 and 6 by way two). Third, it does worse than MobileSAM as it is on hard-edged built things where MobileSAM's line was already near (NIR_3466 Built things), and where another kind of a like tone lies within the band (the tall conifer by the shore taken into NIR_3742 Built things; rock patches taken into NIR_3710 Foliage). It does not mend a wrong region. The findings are queue keys Q-JPS-364 onward. Neither way is chosen by it.
- 12 November, late evening: the evening's masks read again with the edges magnified. What was read: the evening's 88 masks (the recipe, MobileSAM as it is, way one and way two on 22 frame-subjects), and no new mask. Each mask's three places of the evening were drawn magnified three times, with a band of four pixels either side of the mask's line, in one picture of 1,484 by 1,599 pixels for each frame-subject (22 pictures). The instrument was fixed before any picture was made, and two judges that built none of it each judged all 22 frame-subjects, apart and at the same time, each from a whole picture of the evening and the magnified picture (notes/fine-judgement-one.md and notes/fine-judgement-two.md; how to run it again is in notes/fine-read-how-to-run.md; the counts are in reports/fine-read-step-3-report.txt). Both files count an Uncertain clause apart. The counts are the files' own marks, counted again from their MARK and PLACE lines.
  - Each mask's counts by each judge, judge one then judge two. The recipe: region clause met on 9 and 9, edge clause met on 5 and 7 (Uncertain on 4 and 0), both met on 4 and 6. MobileSAM as it is: region met on 17 and 15, edge met on 5 and 4 (Uncertain on 0 and 1), both met on 5 and 3. Way one: region met on 16 and 15, edge met on 5 and 5 (Uncertain on 3 and 1), both met on 5 and 5. Way two: region met on 16 and 14, edge met on 7 and 11 (Uncertain on 2 and 1), both met on 7 and 10.
  - Agreement. The two judges gave the same word on 147 of the 176 marks: region clause 78 of 88 and edge clause 69 of 88. By mask, region and edge: the recipe 19 and 17 of 22, MobileSAM as it is 19 and 20, way one 21 and 16, way two 19 and 16. On places they gave the same word on 201 of the 264: the recipe 51 of 66, MobileSAM as it is 51, way one 49, way two 50. They agree least on the edge clause of way one and of way two, 16 of 22 each. Of the 29 marks on which they differ, 18 have an Uncertain word on one side and 11 are a plain met against a plain not met.
  - The bar. On how many frame-subjects both judges mark both clauses met, and on how many at least one judge does: the recipe 4 and 6, MobileSAM as it is 3 and 5, way one 4 and 6, way two 7 and 10. No mask meets both clauses on most of the 22 by either judge.
  - Way two's tree lines. Of the ten frame-subjects whose subject meets a line of trees or bushes against the sky (NIR_1827, NIR_3742, NIR_1651, NIR_3705 and NIR_3710, Sky and Foliage of each; the grouping is made in the report and is not a reading of the pictures), judge one marks way two's edge clause met on 6, judge two on 7, and both on 6: the Sky of NIR_1827, NIR_3742, NIR_1651, NIR_3705 and NIR_3710, and the Foliage of NIR_3705. The Foliage of NIR_3742 and NIR_1651 is not met by either, and the Foliage of NIR_1827 and NIR_3710 is read differently.
  - The evening's uncertain edge marks. The evening's two files mark the edge clause Uncertain on 13 masks. Judge one marks 9 of them met, 2 not met and leaves 2 Uncertain; judge two marks 10 met and 3 not met and leaves none Uncertain. So the magnified pictures settled 11 of the 13 for judge one and all 13 for judge two.
  - Where the two judges differ in kind. Some differences are of what a thing is, which the bar does not settle: the road along the bottom of NIR_3466 as a built thing (judge two reads it as one, judge one leaves it Uncertain), the disguised towers of NIR_3705 and NIR_3710 and the dark forest crops of NIR_3742 Foliage and NIR_3710 Foliage (Uncertain on either side), the open lattice of the pylons of NIR_3461 Sky (judge one counts the sky seen through the big pylon as wrongly taken or left, judge two reads the bars as left out and the sky between them as rightly taken), and the water behind the near pines of NIR_1873 (met or not met on the region clause by whether it counts as water). A line that runs on the frame's bottom border in open field, water or foliage was called out by both judges, and judge one names that call as one that could be made the other way. The other differences are calls at the band's limit, which both files say can be read the other way: judge two names the corner and the shed roof of NIR_3466 Sky for way two as at the band's limit, and reads them in, where judge one reads the line across the arched roof as outside the band. Neither way is chosen by this.
- 12 November, night: the correction route the result above names, tested. What was done: nine samples were placed by a session on the five regions both fine-read judges named wrong for way two (two on the bright tree of the island on NIR_3742 as Foliage, two on the sky inside the big left pylon of NIR_3461 and one on the flap of cloud by its right pylon as Sky, two on the foreground pine of NIR_1873 as Foliage, two on the stony ground of NIR_3710 under a new name, Ground), each marked as placed by a session and kept apart from the originals (notes/samples-session-placed.json; the originals were not changed). MobileSAM on the colour picture and way two were made again on those four frames with the added samples, with no prompt, model, stage or setting changed. Two judges that built and placed nothing judged the 12 frame-subjects of the four frames, apart and at the same time, from a whole picture and a magnified picture of each (notes/correction-judgement-one.md and notes/correction-judgement-two.md; how to run it again is in notes/correction-how-to-run.md; the counts are in reports/correction-step-3-report.txt). The samples are prompts and never a truth.
  - Each region's fate, judge one then judge two. Region 1, the island tree on NIR_3742 Built things: shrank and shrank for MobileSAM, and no way two mask. Region 2, the lattice sky of the left pylon on NIR_3461: on Sky, MobileSAM shrank and gone, way two shrank and shrank; on Built things, shrank and shrank for both. Region 3, the flap of cloud on NIR_3461 Built things: MobileSAM gone and grew, way two grew and stayed. Region 4, the pine on NIR_1873 Foliage: MobileSAM shrank and gone, way two shrank and shrank. Region 5, the stony ground on NIR_3710 Foliage: MobileSAM grew and grew, way two stayed and stayed. So no region is gone by both judges for both masks; the stony ground was not taken out of Foliage by either judge for either mask.
  - The bar. On how many of the 12 frame-subjects both judges mark both clauses met, and on how many at least one does, before and after. MobileSAM: before 0 and 1, after 1 and 2. Way two: before 2 and 3, after 1 and 3. The before judges and the after judges are different agents, so a change in a count mixes the masks' change with the reading's. By each judge, after: MobileSAM 2 for judge one and 1 for judge two, way two 3 for judge one and 1 for judge two.
  - Each judge's after counts. MobileSAM after: region clause met on 9 and 8, edge clause met on 2 and 3, both met on 2 and 1. Way two after (11 masks): region met on 7 and 6, edge met on 4 and 3, both met on 3 and 1. Words against the before mask, better, same, worse: MobileSAM after 4, 7, 1 and 5, 6, 1; way two after 2, 6, 3 and 2, 8, 1.
  - Agreement. The two judges gave the same word on 38 of the 48 marks, on 60 of the 72 places, on 21 of the 24 words and on 8 of the 12 region lines. They agree least on the region and edge clauses of MobileSAM after, 8 of 12 each. A line along the frame's bottom edge in open water or field was marked in by judge two in two places (NIR_1873 Water and NIR_3461 Foliage, MobileSAM after), where the rule as written marks it out; read out, the agreement is 39 of 48 marks and 62 of 72 places and the bar counts do not move.
  - The new wrong regions both judges named. On NIR_3710 Foliage, MobileSAM after takes faint specks of the stony ground, together under one hundredth, where it was clean before, and way two after still takes the stony ground in patches, one of about one to one and a half hundredths at the lower left. On NIR_3461 Built things the left pylon is taken only in part by MobileSAM after and largely left out by way two after, and cloud by the right pylon is taken in streaks by MobileSAM after and in patches of about two hundredths by way two after.
  - NIR_3742 Built things has no way two mask after. The stage's fixed rule needs 50 or more counted pixels on each side of its fit, and the subject holds 2 counted pixels (21 sure pixels), so the stage made neither way one nor way two. Nothing was changed to give it one.
  - What this shows, without choosing. The route mended parts of what it was placed on, mostly by shrinking the wrong regions and not by removing them, and moved other things in the same frames, some better and some worse. No method is chosen by it.

## What comes next, in order
1. The click-prompted models run on the photograph's own data. This was measured on 12 November; the entry under What was measured, and what it showed says what was fed, the counts and what they show (queue key Q-JPS-352). The design it followed: the model's picture is placeDecode called with a grid the size of the guide itself (w and h the guide's width and height, k of 1, fromW and fromH the same), whose pixels give a colour picture and whose light gives a grey one, each at most 1,024 pixels on its longer side, which is the size these models take. Prompts as on 11 November. The masks are set beside the recipe's masks from the decode on the same 22 frame-subjects and judged by two agents that built nothing, as on the evening of 11 November. About an hour.
2. The model that does best goes onto the test page, with the page's layout put right. notes/build-ground.md and notes/build-brief.md say what that build meets: every file the build emits goes into the service worker's install list with no test of size, so a model file needs a route of its own; the host's limit is 25 MiB for one file; MobileSAM's encoder, at 28,157,093 bytes, is over it and SlimSAM's files fit; nothing in the app loads WebAssembly or a model today. The layout's faults are in part five of build-ground.md: the results print above the work, and the three presses of the repeated loop sit far apart. The device's speed and memory for a model are unknown and are measured on the test page. Record 111's chosen option holds a method off the test page until its masks meet the bar on most subjects, no entry measured does, and whether this item goes ahead is not decided in this folder.
3. Edges, once regions are right. The cue stage in a narrow band beside the edge is the lead; notes/edge-notes.md has the figures. The cue stage was measured on MobileSAM's masks on 12 November: it brought the line nearer on most tree lines and met the edge clause plainly on none of the 22 frame-subjects; the entry above has the figures.
4. Carrying a mask to another photograph. Matched features that give points on the second photograph are the lead; notes/notes-features.md has the reading.
5. Then the editor's own mask.

## What is not in this folder, and how to get it again
- The models. SlimSAM's ONNX files from Xenova/slimsam-77-uniform on Hugging Face, in its folder named onnx. MobileSAM's ONNX encoder and single-mask decoder from the copy kept by Acly. DINOv2 small from Xenova/dinov2-small, the file onnx/model_q4f16.onnx, 12,917,198 bytes, which runs at 224 by 224 only. They ran in node through onnxruntime-node 1.31.1, installed with no install script. The model files come from the host us.aws.cdn.hf.co, which the session's network must allow. reports/ holds the addresses and the handling.
- The eight photographs: NIR_3461, NIR_3466, NIR_1827, NIR_1651, NIR_3742, NIR_3705, NIR_3710 and NIR_1873, reached only through `tools/owner-images.mjs`. notes/inputs.md says how each frame was made and notes/samples.json holds the samples.
- The masks and pictures. The scripts remake them.
- The scripts carry the old session's scratch paths. Point them at the new session's scratch folder before running them.

## What is in this folder
HANDOFF.md is this page.

### notes/
- `notes/build-brief.md`: The build brief for a learned selection on the test page (step 444); it chooses no method.
- `notes/build-ground.md`: What putting a model on the test page meets in the app: the build, the service worker, the host limits, the layout.
- `notes/compare-entries.md`: The entries of the side-by-side comparison, fixed by figures.
- `notes/compare-how-to-run.md`: How to run the comparison scripts again.
- `notes/compare-planted-scores.md`: Scores of planted masks, which show the scorer reads known faults.
- `notes/correction-how-to-run.md`: How to run the correction route again: the added samples, the masks made again and the pictures.
- `notes/correction-judgement-one.md`: Judgement of the correction route's MobileSAM after and way two after masks on the 12 frame-subjects of NIR_3742, NIR_3461, NIR_1873 and NIR_3710, with the five regions, by a judge that built and placed nothing.
- `notes/correction-judgement-two.md`: Judgement of the same 12 frame-subjects by a second judge in the same way.
- `notes/cue-edge-how-to-run.md`: How to run the cue stage on MobileSAM's masks again.
- `notes/cue-edge-judgement-first.md`: Judgement of NIR_3461, NIR_3466, NIR_1827 and NIR_1651 (10 frame-subjects), the recipe, MobileSAM as it is and the two ways of the cue stage, from opened pictures by a judge that built none of it.
- `notes/cue-edge-judgement-second.md`: Judgement of NIR_3742, NIR_3705, NIR_3710 and NIR_1873 (12 frame-subjects), by a second judge in the same way.
- `notes/decode-how-to-run.md`: How to run the decode comparison again.
- `notes/decode-index.md`: Index of the decode comparison pictures and masks by step.
- `notes/decode-judgement-454.md`: Judgement of step 454: the recipe from the drawn picture against the decode, per frame-subject.
- `notes/decode-judgement-455.md`: Judgement of step 455 over NIR_3742, NIR_3705, NIR_3710 and NIR_1873 and the three copied recipes.
- `notes/edge-chosen.txt`: The edge stage and setting chosen by step 436's rule (plain, radius 16, regularisation 0.001), with the rule.
- `notes/edge-notes.md`: Notes on the edge stages measured alone.
- `notes/edge-scores.md`: Scores of the edge stages.
- `notes/fine-judgement-one.md`: Judgement of the evening's 88 masks read again with the edges magnified three times, all 22 frame-subjects, by a judge that built none of it.
- `notes/fine-judgement-two.md`: Judgement of the same 88 masks and 22 frame-subjects by a second judge in the same way.
- `notes/fine-read-how-to-run.md`: How to make the magnified pictures of the fine read again.
- `notes/inputs.md`: How each of the eight frames was made, and the fetch handling.
- `notes/judgement-441.md`: Judgement of step 441 over NIR_3461, NIR_3466 and NIR_1827, from opened pictures by an agent that built no map.
- `notes/judgement-442.md`: Judgement of step 442 over NIR_1651, NIR_3742 and NIR_3705, by the same method.
- `notes/judgement-443.md`: Judgement of step 443 over NIR_3710 and NIR_1873, the planted scores and the carried masks.
- `notes/maps-classes-notes.md`: Notes on the scene-labelling model and its class maps.
- `notes/maps-classes-scores-natural.txt`: Scores of the scene-labelling model's class maps for the natural input (the picture as it opens), one line per subject and class, model size then guided.
- `notes/maps-classes-scores-open.txt`: Scores of the same class maps for the open input, one line per subject and class, model size then guided.
- `notes/maps-features-notes.md`: Notes on the classifier fitted on learned features (DINOv2 small).
- `notes/maps-features-scores.md`: Scores of that classifier.
- `notes/maps-points-notes.md`: Notes on the click-prompted models (MobileSAM, SlimSAM).
- `notes/maps-points-scores.md`: Scores of the click-prompted models.
- `notes/notes-device.md`: Reading on learned selections a device can run, with sources and speeds.
- `notes/notes-editors.md`: Reading on how other editors make masks and selections.
- `notes/notes-features.md`: Reading on matched features for carrying a mask to another photograph.
- `notes/points-decode-how-to-run.md`: How to run the click-prompted models on the photograph's own decode again.
- `notes/points-decode-judgement-first.md`: Judgement of NIR_3461, NIR_3466, NIR_1827 and NIR_1651 (10 frame-subjects), the recipe and four model masks fed the decode, from opened pictures by a judge that built none of it.
- `notes/points-decode-judgement-second.md`: Judgement of NIR_3742, NIR_3705, NIR_3710 and NIR_1873 (12 frame-subjects), by a second judge in the same way.
- `notes/samples-session-placed.json`: The nine samples a session placed on the five regions of the correction route, by frame, each marked as placed by a session; prompts and never a truth.
- `notes/samples.json`: The samples placed on the eight frames, by name, place and size.

### reports/
- `reports/correction-step-1-report.txt`: Report of step 1 of the correction route: the nine samples, the masks made again and the pictures.
- `reports/correction-step-2-one-report.txt`: Report of the first judge of step 2 of the correction route.
- `reports/correction-step-2-two-report.txt`: Report of the second judge of step 2 of the correction route.
- `reports/correction-step-3-report.txt`: Report of step 3 of the correction route: the counts of each judge, of agreement, of the bar before and after and of the frame's bottom edge, and the commit.
- `reports/cue-edge-step-1-report.txt`: Report of step 1 of the cue stage on MobileSAM's masks: the stage, the 44 masks and the pictures.
- `reports/cue-edge-step-2-first-report.txt`: Report of the first judge of step 2.
- `reports/cue-edge-step-2-second-report.txt`: Report of the second judge of step 2.
- `reports/cue-edge-step-3-report.txt`: Report of step 3: the record and the commit.
- `reports/fine-read-step-1-report.txt`: Report of step 1 of the fine read: the 22 magnified pictures and the plant lines.
- `reports/fine-read-step-2-one-report.txt`: Report of the first judge of step 2 of the fine read.
- `reports/fine-read-step-2-two-report.txt`: Report of the second judge of step 2 of the fine read.
- `reports/fine-read-step-3-report.txt`: Report of step 3 of the fine read: the counts of each judge, of agreement and of the bar, and the commit.
- `reports/points-decode-step-1-report.txt`: Report of step 1 of the click-prompted models on the decode: ground and the recipe's masks.
- `reports/points-decode-step-2-report.txt`: Report of step 2: the input pictures, the 88 model masks and the 44 pictures.
- `reports/points-decode-step-3-first-report.txt`: Report of the first judge of step 3.
- `reports/points-decode-step-3-second-report.txt`: Report of the second judge of step 3.
- `reports/points-decode-step-4-report.txt`: Report of step 4: the record and the commit.
- `reports/step-423-2-report.txt`: Report of step 423, send 2.
- `reports/step-423-report.txt`: Report of step 423.
- `reports/step-424-2-report.txt`: Report of step 424, send 2.
- `reports/step-424-report.txt`: Report of step 424.
- `reports/step-425-report.txt`: Report of step 425.
- `reports/step-426-report.txt`: Report of step 426.
- `reports/step-427-report.txt`: Report of step 427.
- `reports/step-428-2-report.txt`: Report of step 428, send 2.
- `reports/step-428-report.txt`: Report of step 428.
- `reports/step-434-report.txt`: Report of step 434.
- `reports/step-435-report.txt`: Report of step 435.
- `reports/step-436-report.txt`: Report of step 436.
- `reports/step-437-2-report.txt`: Report of step 437, send 2.
- `reports/step-437-report.txt`: Report of step 437.
- `reports/step-438-report.txt`: Report of step 438.
- `reports/step-439-report.txt`: Report of step 439.
- `reports/step-440-report.txt`: Report of step 440.
- `reports/step-441-report.txt`: Report of step 441.
- `reports/step-442-report.txt`: Report of step 442.
- `reports/step-443-2-report.txt`: Report of step 443, send 2.
- `reports/step-443-report.txt`: Report of step 443.
- `reports/step-444-report.txt`: Report of step 444.
- `reports/step-445-report.txt`: Report of step 445.
- `reports/step-446-report.txt`: Report of step 446.
- `reports/step-451-2-report.txt`: Report of step 451, send 2.
- `reports/step-451-design.txt`: Design note of step 451.
- `reports/step-451-report.txt`: Report of step 451.
- `reports/step-452-report.txt`: Report of step 452.
- `reports/step-453-report.txt`: Report of step 453.
- `reports/step-454-report.txt`: Report of step 454.
- `reports/step-455-report.txt`: Report of step 455.
- `reports/step-456-report.txt`: Report of step 456.
- `reports/step-457-2-report.txt`: Report of step 457, send 2.
- `reports/step-457-report.txt`: Report of step 457.

### scripts/
- `scripts/compare-classes.mjs`: Draws the scene-class masks from the kept class maps.
- `scripts/compare-compose-comparison.mjs`: Comparison picture of one frame and one subject.
- `scripts/compare-compose-crops.mjs`: Crops picture of one frame and one subject.
- `scripts/compare-count.mjs`: Independent count of a mask against a truth.
- `scripts/compare-entries.mjs`: Fixes the comparison entries from the map folders' index files.
- `scripts/compare-index-md.mjs`: Writes the comparison index.
- `scripts/compare-lib.mjs`: Helpers the comparison scripts share.
- `scripts/compare-planted-scores.mjs`: Scores planted masks with the scorer.
- `scripts/correction-compose.mjs`: Whole picture of one frame for MobileSAM and way two before and after, with the frame's samples and the added ones marked.
- `scripts/correction-crop.mjs`: Look aid that crops a window of a frame with a grid in frame coordinates, to choose where a sample goes.
- `scripts/correction-fine.mjs`: Magnified picture of one frame for the two after masks, three places each.
- `scripts/correction-index.mjs`: Joins the per-frame parts of those pictures and counts the frame-subjects, added samples and regions.
- `scripts/correction-models.mjs`: Runs MobileSAM on the colour picture of one frame with the added samples, one joint prompt for each name.
- `scripts/correction-samples.mjs`: Writes the added samples file beside the original, checks the originals stand unchanged and draws the sample pictures.
- `scripts/correction-shares.mjs`: Prints the share at a half of every mask made again beside the share before.
- `scripts/correction-stage.mjs`: Makes the two ways of the cue stage on MobileSAM's new masks for one frame.
- `scripts/cue-edge-compose.mjs`: Whole and edges pictures of one frame for the recipe, MobileSAM as it is and the two ways of the cue stage.
- `scripts/cue-edge-index.mjs`: Merges the per-frame index parts of those pictures and of the stage's masks and counts the frame-subjects.
- `scripts/cue-edge-stage.mjs`: Decodes one frame and makes the two ways of the cue stage on MobileSAM's mask for each subject.
- `scripts/decode-compose-comparison.mjs`: Comparison picture, drawn picture against decode.
- `scripts/decode-compose-copied.mjs`: Picture of a copied recipe for a pair of frames.
- `scripts/decode-index-md.mjs`: Merges the harness index files for the decode comparison.
- `scripts/decode-lib.mjs`: Helpers of the decode composing scripts.
- `scripts/draw.mjs`: Draws rectangles, circles and letters on RGB byte pictures.
- `scripts/edt.mjs`: Exact Euclidean distance transform.
- `scripts/fine-read-index.mjs`: Merges the per-frame index parts of the magnified pictures and counts the frame-subjects and places.
- `scripts/fine-read-pictures.mjs`: Magnified edges picture of one frame: for each mask's three places the context crop, the bare crop at three times and the banded crop.
- `scripts/png.mjs`: Small PNG reader and writer.
- `scripts/points-decode-compose.mjs`: Whole and edges pictures of one frame for the recipe and the four model masks fed the decode.
- `scripts/points-decode-index.mjs`: Merges the per-frame index parts of those pictures and counts the frame-subjects.
- `scripts/points-decode-inputs.mjs`: Writes the colour and the grey picture of one frame from `placeDecode` on the guide-sized grid.
- `scripts/points-decode-models.mjs`: Runs MobileSAM or SlimSAM on the colour and grey pictures of one frame, one joint prompt for each subject.
- `scripts/refine-lib.mjs`: Helpers of refine.mjs.
- `scripts/refine.mjs`: Brings a coarse map to a picture's edges by one stage.
- `scripts/score.mjs`: Scores one mask against one planted truth over every pixel.
- `scripts/sheet.mjs`: Draws a mask over its frame with full-size edge crops.
- `scripts/step399-runner.mjs`: Runner that leaves out the lines of a transcript that hold messages, from an earlier step.
- `scripts/step400-runner.mjs`: Same filter runner, as used at step 400.
- `scripts/step420-runner.mjs`: Same filter runner, as used at step 420.
- `scripts/step423-2-build.mjs`: Bundles the render entry for node (step 423, second send).
- `scripts/step423-2-runner.mjs`: Runner of step 423, second send.
- `scripts/step423-entry.ts`: Entry that re-exports the app's read, decode and develop modules.
- `scripts/step423-hue.mjs`: Natural-hue re-mapping of one frame.
- `scripts/step423-marks.mjs`: Draws every sample over its frame.
- `scripts/step423-plant.mjs`: Makes the planted pictures from windows of real frames.
- `scripts/step423-render.mjs`: Renders one frame as the editor opens it, on the CPU route.
- `scripts/step423-runner.mjs`: Runner of step 423.
- `scripts/step423-samples.mjs`: Reads the samples placed on the test page from a session record.
- `scripts/step423-trial.mjs`: Tries the scorer and sheet on a mask built wrong by known amounts.
- `scripts/step425-fetch.mjs`: Fetcher for step 425; takes a label and asks each address once.
- `scripts/step428-build.mjs`: Bundles the four recipe modules for node.
- `scripts/step428-compose.mjs`: Composes pictures of the smoothly carried masks.
- `scripts/step428-digest.mjs`: Digests the scorer's raw output.
- `scripts/step428-entry.ts`: Entry that re-exports the four recipe modules.
- `scripts/step428-harness.mjs`: Makes the recipe's renderings for every picture.
- `scripts/step428-runner.mjs`: Runner of step 428.
- `scripts/step428-score.mjs`: Scores planted-picture masks.
- `scripts/step428-score2.mjs`: Scores the smoothly carried masks.
- `scripts/step428-sheets.mjs`: Draws every mask of a real frame.
- `scripts/step428-smooth.mjs`: Carries masks smoothly.
- `scripts/step435-contact.mjs`: Contact pictures per frame for the click-prompted models.
- `scripts/step435-fetch.mjs`: Fetcher for step 435; takes a label.
- `scripts/step435-maps.mjs`: Runs the click-prompted models from ONNX files in node.
- `scripts/step435-probe.mjs`: Opens each model file and prints its size and inputs.
- `scripts/step435-runner.mjs`: Runner of step 435.
- `scripts/step437-contact.mjs`: Contact pictures for step 437.
- `scripts/step437-features.mjs`: Makes and keeps DINOv2 small features.
- `scripts/step437-fetch.mjs`: Fetcher for step 437.
- `scripts/step437-fit.mjs`: Fits two classifiers to the samples on those features.
- `scripts/step437-ortcheck.mjs`: Checks the ONNX file of DINOv2 small loads in node.
- `scripts/step437-prep.mjs`: Resizing helper imported by step 437 scripts.
- `scripts/step437-runner.mjs`: Labelled runner of step 437.
- `scripts/step437-scores.mjs`: Joins step 437 part files into an index.
- `scripts/step452-build.mjs`: Bundles the step 452 entry for node.
- `scripts/step452-entry.ts`: Entry that re-exports the app's recipe modules.
- `scripts/step452-harness.mjs`: Counts the cues two ways on one frame, drawn picture and decode.
- `scripts/step452-job.json`: Job list for the step 452 runner.
- `scripts/step452-runner.mjs`: Runner of step 452.
- `scripts/step453-job.json`: Job list for the step 453 runner.
- `scripts/step453-runner.mjs`: Runner of step 453.
