// The colour panel's keying (record 084): where the Sky and Foliage bands centre on a photograph, read from its sky selection and the rest.
//
// WHAT IT READS: the photograph's own pixels, at the place the bands act, split by the sky selection and by what the selection leaves out.
//
// WHY A MODULE, AND WHY A PROBE. The bands (pipeline.ts compileEdit, gl.ts) read the hue of the colour after the swap, the mixer, the hue turn, the screen-side gains and the saturation, in LINEAR light, before contrast, gamma and the eight-band mixer. A hue read off the finished picture is a different hue (gamma moves it). So the keying runs the SAME compiled edit with its probe argument, which stops at the band stage's door and hands back that colour's hue, saturation and value: one copy of those stages, so the keying cannot drift from the render (hub lesson 362: a derivation built from part of what its consumer reads fails silently).
//
// THE MEASURE IT RESTS ON is the places measure of 8 November 2026 (IR-SCIENCE.md, record 084): the sky against the conifers sat near 175 degrees apart at the opening balance with the swap on, the conifers against the broadleaf 5 to 9 degrees, so a box keyed on the selection and a box keyed on what the selection leaves out cover the two populations. The labelling rule that measure also tried (a vegetation threshold) put 72.8 to 78.0 percent of the conifers under neutral, so it is NOT used: the complement of the selection replaces it.
//
// THE CENTRES TRAVEL ON THE EDIT as `EditParams.panelCentres` (runtime-only), set by main.ts wherever the editor hands a photograph to a renderer, so the screen, the tiles, the batch, the exports and the test page's row read one value by one route.
import { compileEdit, sampleBrush, type BrushMask, type EditParams, type PanelCentres, type SourceFlat } from "./pipeline";
import { linearAt, type DecodedImage } from "./decode";

/** The saturation floor: a pixel below it carries no colour worth a hue. It is the places measure's floor of 8 November 2026 (the test page's Separation check prints the same number); it is deliberately its own constant and not `SAT_GUARD_LO`, so retuning the boost guard cannot move the keying. */
export const PANEL_SAT_FLOOR = 0.13;
/** The colourless share: a population with fewer than this fraction of its sampled pixels at or above the floor is left to key by name (the places measure of 8 November 2026: the test page's `SEP_COLOURLESS_SHARE`). */
export const PANEL_COLOURLESS_SHARE = 0.01;
/** The sky weight at or above which a sampled pixel belongs to the selection; below it, to what the selection leaves out (the places measure of 8 November 2026 and the selection's own threshold: the test page's `SEP_SKY_WEIGHT`). */
export const PANEL_SKY_WEIGHT = 0.5;
/** About how many pixels a sample holds (the places measure of 8 November 2026 sampled about this many). */
export const PANEL_SAMPLE_PIXELS = 8000;

/** One photograph's sample for the keying: about `PANEL_SAMPLE_PIXELS` of its linear pixels with their positions and the sky selection's weight at each. */
export interface PanelSample {
  /** How many pixels the sample holds. */
  n: number;
  /** Linear red, green and blue, as `linearAt` gives them. */
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  /** Each pixel's image uv. */
  u: Float32Array;
  v: Float32Array;
  /** The sky selection's weight 0..1 at each pixel, or null when no selection was given. */
  w: Float32Array | null;
  /** The turn the selection was found at (0..3), kept so the sample says which bitmap it used. */
  turn: number;
}

/** The keyed centres with where each came from. */
export interface PanelKeyed extends PanelCentres {
  /** "photograph": the centre is the circular mean hue of this photograph's population; "name": it could not be computed and the box keeps the centre the app gives it (30 degrees under the swap with an identity mixer, 210 otherwise). */
  skySource: "photograph" | "name";
  foliageSource: "photograph" | "name";
}

/** Whether an edit moves the Sky or the Foliage box.
 *  @param p  the edit; only its `sky` and `foliage` boxes ([hueShiftDeg, satScale, lumScale], neutral [0, 1, 1]) are read.
 *  @returns true where either box's hue shift, saturation or lightness differs from neutral, false otherwise (a missing box reads neutral).
 *  What the result must satisfy: it is the one test of "this edit reads a keyed centre" for the page (the open photograph, the batch, the export) and the tile's render in the decode worker alike, so they cannot disagree on when a photograph is keyed; where it is false no sky bitmap is asked for and no centre is carried. */
export function panelBoxMoved(p: EditParams): boolean {
  const moved = (b: readonly number[] | undefined): boolean => !!b && (b[0] !== 0 || b[1] !== 1 || b[2] !== 1);
  return moved(p.sky) || moved(p.foliage);
}

/** Take the keying's sample from a photograph, once.
 *  @param img  the decoded photograph; its linear copy (a raw) or its 8-bit pixels are read through `linearAt`.
 *  @param sky  the photograph's sky selection as a bitmap at the turn shown, or null when none was found; read at each pixel by `sampleBrush`, so the weight is the one the renderers see.
 *  @param turn  the turn (0..3) the bitmap was found at, kept on the sample. The turn picks WHICH EDGE IS UP when the selection is found (sky.ts buildSkyMask), and the bitmap stays in the image's own frame, so a pixel's place in it is its own image uv under every turn, as the compile's sky stage reads it (`sampleBrush(skyFine, u, v)` at the image uv) and as `skyMaskFor` hands it back: nothing here applies a turn to a uv.
 *  @returns about 8000 pixels, every k-th pixel of every k-th row with k set from the image's size, each with its linear colour, its image uv and (when a bitmap was given) its sky weight.
 *  What the result must satisfy: it is taken once per photograph and handed to `keyPanelCentres` as it is, whatever the edit; it holds pixels of the photograph and never of a drawn frame, which has already been through the swap and the mixer; the consumers are main.ts (the screen, the tiles, the batch and the exports) and the test page's Separation check. */
export function takePanelSample(img: DecodedImage, sky: BrushMask | null, turn: number): PanelSample {
  const k = Math.max(1, Math.floor(Math.sqrt((img.width * img.height) / PANEL_SAMPLE_PIXELS)));
  const nx = Math.max(1, Math.ceil(img.width / k));
  const ny = Math.max(1, Math.ceil(img.height / k));
  const cap = nx * ny;
  const s: PanelSample = {
    n: 0,
    r: new Float32Array(cap), g: new Float32Array(cap), b: new Float32Array(cap),
    u: new Float32Array(cap), v: new Float32Array(cap),
    w: sky ? new Float32Array(cap) : null,
    turn,
  };
  let n = 0;
  for (let y = Math.min(img.height - 1, k >> 1); y < img.height; y += k) {
    for (let x = Math.min(img.width - 1, k >> 1); x < img.width; x += k) {
      if (n >= cap) break;
      const [r, g, b] = linearAt(img, x, y);
      const u = (x + 0.5) / img.width, v = (y + 0.5) / img.height;
      s.r[n] = r; s.g[n] = g; s.b[n] = b; s.u[n] = u; s.v[n] = v;
      if (s.w && sky) s.w[n] = sampleBrush(sky, u, v);
      n++;
    }
  }
  s.n = n;
  return s;
}

/** Key the Sky and Foliage boxes' centres on a photograph.
 *  @param sample  the photograph's sample (`takePanelSample`).
 *  @param p  the edit as it stands; its balance, swap, mixer at its own Strength, hue turn and saturation decide the hue each pixel has at the band stage. Its Sky and Foliage boxes are taken as nothing here (the boxes neutral), because a move of a box must not move where the box is keyed; its Strength is kept, because the bands meet the mixer at that Strength.
 *  @param cam  camera-native to linear sRGB 3x3 for a raw, undefined for a display-referred source, as `compileEdit` takes it.
 *  @param aspect  the source's width over height.
 *  @param srcFlat  the lens flat already in a raw's source pixels, or null, as `compileEdit` takes it.
 *  @returns the Sky centre (the circular mean hue, in degrees 0..360, of the sampled pixels with sky weight at or above `PANEL_SKY_WEIGHT` and saturation at or above `PANEL_SAT_FLOOR`) and the Foliage centre (the same for the pixels under that weight), each with its source. A centre is null, with source "name", where no selection was given, where the selection covers none of the sample, or where fewer than `PANEL_COLOURLESS_SHARE` of that population's pixels are at or above the floor; a number never stands in for a centre that could not be computed.
 *  What the result must satisfy: with no sky found both are null (a photograph with no sky renders as it does today); each degree is the hue the band stage reads, in the units its `bandWeight` takes, so it goes on `EditParams.panelCentres` as it is (main.ts sets it; compileEdit and the shader read it). */
export function keyPanelCentres(sample: PanelSample, p: EditParams, cam: number[] | undefined, aspect: number, srcFlat: SourceFlat | null): PanelKeyed {
  const none: PanelKeyed = { sky: null, foliage: null, skySource: "name", foliageSource: "name" };
  const w = sample.w;
  if (!w || sample.n === 0) return none;
  // The boxes neutral and no carried centres, the Strength the edit's own: the bands meet the colour after the mixer at the edit's Strength (panelMix3Of), so the hue read here is the hue they act on, at every Strength.
  const q: EditParams = { ...p, sky: [0, 1, 1], foliage: [0, 1, 1], panelCentres: null };
  const probe = new Float64Array(3);
  const edit = compileEdit(q, cam, aspect, undefined, null, null, null, srcFlat, probe);
  const out = new Float32Array(3);
  let nSky = 0, nFol = 0, kSky = 0, kFol = 0;
  let cSky = 0, sSky = 0, cFol = 0, sFol = 0;
  for (let i = 0; i < sample.n; i++) {
    edit(sample.r[i], sample.g[i], sample.b[i], out, 0, sample.u[i], sample.v[i], sample.u[i], sample.v[i]);
    const hue = probe[0], sat = probe[1];
    if (!Number.isFinite(hue) || !Number.isFinite(sat)) continue;
    const isSky = w[i] >= PANEL_SKY_WEIGHT;
    if (isSky) nSky++; else nFol++;
    if (sat < PANEL_SAT_FLOOR) continue;
    const a = (hue * Math.PI) / 180;
    if (isSky) { kSky++; cSky += Math.cos(a); sSky += Math.sin(a); }
    else { kFol++; cFol += Math.cos(a); sFol += Math.sin(a); }
  }
  // No sky found: both boxes key by name.
  if (nSky === 0) return none;
  const mean = (k: number, n: number, c: number, s: number): number | null => {
    if (k === 0 || k < n * PANEL_COLOURLESS_SHARE) return null;
    if (c === 0 && s === 0) return null;
    return (((Math.atan2(s, c) * 180) / Math.PI) % 360 + 360) % 360;
  };
  const sky = mean(kSky, nSky, cSky, sSky);
  const foliage = mean(kFol, nFol, cFol, sFol);
  return { sky, foliage, skySource: sky === null ? "name" : "photograph", foliageSource: foliage === null ? "name" : "photograph" };
}
