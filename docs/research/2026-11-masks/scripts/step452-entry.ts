// Step 452 entry (MADE TO FAIL: its harness reports a planted wrong expectation as failing; nothing below is trustworthy if it does not). Re-exports the app's recipe modules by path for the bundle, so a new bundle picks up the working copy as it then stands; chooses nothing.
export { sampleMaskRenderings, sampleMaskFit, sampleMaskWeights, sampleMaskRender, sampleMaskCoverage } from "/home/user/Jefferson-Photography-Studio/src/samplemask";
export { PLACE_CUES, placeCueValues } from "/home/user/Jefferson-Photography-Studio/src/placecues";
export { PLACE_STRUCTURE_CUES, placeStructureValues } from "/home/user/Jefferson-Photography-Studio/src/placestructure";
export { placeSampleNames, placeSampleLabels } from "/home/user/Jefferson-Photography-Studio/src/placesamples";
// STEP 453 ADDS (filled from step 451's report): the new module's one exported function, and the app's import and decode calls (the pattern is scratch/step423-entry.ts), each by path.
export { placeDecode } from "/home/user/Jefferson-Photography-Studio/src/placedecode";
export { importFile } from "/home/user/Jefferson-Photography-Studio/src/import";
export { decode } from "/home/user/Jefferson-Photography-Studio/src/decode";
