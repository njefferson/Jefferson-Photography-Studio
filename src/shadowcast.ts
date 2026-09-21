// THE SHADOW'S OWN ILLUMINANT, MEASURED FROM THIS PHOTOGRAPH (decision 034).
//
// In the near infrared the sky gives a shadow almost nothing: Rayleigh
// scattering collapses with the fourth power of wavelength, which is the same
// fact that makes an infrared sky dark. What fills the shadow instead is bounce
// off foliage, the brightest thing in an IR frame — so a shaded face is lit by
// a DIFFERENT illuminant from the sunlit face beside it, and after the channel
// swap that bounce is the red a reader takes out by hand on the Grade tab.
//
// ONE WHITE BALANCE CANNOT FIX IT. A gray-world balance solves for one
// illuminant; here there are two, and in the infrared they are further apart
// than they ever are in visible light.
//
// WHY THIS IS A MEASUREMENT AND NOT A CONSTANT. IR-SCIENCE 9j built the
// obvious answer — the subtractive complement, one hue and one amount — and it
// works beautifully on the oak (NIR_1376) and drives 858,273 grey pixels from
// saturation 0.005 to 0.989 on the carport (NIR_3406), whose shadows are a roof
// rather than a tree. A look constant is a claim about every photograph. This
// asks each photograph instead, and on a frame whose shadows are already
// neutral it returns unity and nothing happens.
//
// AND WHY IT COMPARES CHROMATICITY RATHER THAN COLOUR. Shade is darker than
// sun; that is not the defect. Dividing each pixel by its own luminance throws
// the brightness away and leaves only the direction of the colour, so what
// comes back is how far the two populations' COLOUR sits apart and not how far
// their exposure does.
//
// THE SKY IS EXCLUDED, and that is 9j's own named next piece rather than a new
// idea: `shadowSat` is keyed on luminance ALONE, so a deep sky's dark end pays
// for a tree's bark. The app already builds a sky selection for every
// photograph, so the population that must not be counted is one the caller
// already has.

/** What a photograph's own shadows say about the light that filled them. */
export interface ShadowCast {
  /** The per-channel gain that carries the shaded population's colour onto the
   *  sunlit one, normalised so it moves colour and not brightness. `[1, 1, 1]`
   *  exactly when there is nothing to correct. */
  gain: [number, number, number];
  /** How far that gain sits from unity — the largest per-channel deviation. A
   *  frame with a real cast reads a few per cent; the carport reads near zero.
   *  It is what an honest readout shows and what an opening amount is derived
   *  from, so neither is a number somebody typed. */
  spread: number;
  /** How many pixels each population was measured from. Small counts are the
   *  reason a measurement is refused rather than trusted. */
  shadePx: number;
  sunPx: number;
  /** True when the frame gave the measurement enough to work with. False means
   *  `gain` is unity and the caller must treat the photograph as having no
   *  measurable cast rather than as having none. */
  measured: boolean;
}

/** Below this many pixels in either population the answer is noise rather than
 *  a measurement. A 1024px-edge copy has around a million pixels, so two per
 *  cent of the frame is the floor. */
const MIN_POPULATION = 4000;

/** How far a measured gain may carry a channel. A shadow illuminant differing
 *  by a quarter is already an extreme frame; past that the measurement has
 *  found something other than shade — a coloured subject filling the dark end,
 *  a blown frame — and a correction should not act on it at full strength. */
const MAX_GAIN = 0.25;

/** Below this linear luminance a pixel's COLOUR is noise, and in the infrared
 *  it is worse than noise: the blue channel carries almost nothing to begin
 *  with, so dividing a near-black pixel by its own luminance produces a huge
 *  meaningless blue ratio. Measured on the real corpus — with no floor, the
 *  carport (NIR_3406), whose shadows are a roof and must read no cast at all,
 *  read 25% and pinned against the held range, and so did both camera JPEGs. */
const BLACK_FLOOR = 0.004;

/** The shaded population is a BAND rather than everything below a threshold.
 *  The very bottom of a frame is black point, sensor floor and objects that are
 *  dark rather than shaded; the band sits above that and still well inside the
 *  shadows. Percentiles of the non-sky, above-floor pixels. */
const SHADE_FROM = 0.12, SHADE_TO = 0.32, SUN_FROM = 0.67;

const LUMA_R = 0.2126, LUMA_G = 0.7152, LUMA_B = 0.0722;

/** WHAT THE SHADOWS OF THIS PHOTOGRAPH ARE LIT BY, RELATIVE TO ITS SUNLIT FACE.
 *
 *  Takes `at`, which returns the LINEAR rgb of the pixel at `x`, `y`; `w` and
 *  `h`, the copy's size; and `isSky`, which answers for an `x`, `y` whether
 *  that pixel belongs to the sky and is therefore excluded from both
 *  populations.
 *
 *  Returns a `ShadowCast`. Its `gain` is exactly `[1, 1, 1]` whenever the frame
 *  cannot be measured or the two populations agree, so a caller may apply it
 *  unconditionally.
 *
 *  THE MEASUREMENT IS ON THE LINEAR FRAME, never the displayed pixel. A shadow
 *  cast is a property of the light the photograph was taken in, so a correction
 *  keyed on the display re-keys under every look — the defect decision 032
 *  names, and the reason 034 declares `touches 032`.
 *
 *  What the caller relies on: the gain moves COLOUR and not brightness. Its
 *  Rec.709 luma is normalised to 1, so applying it at any strength leaves a
 *  neutral pixel's luminance where it was and can only rotate its hue — which
 *  is what makes it safe where the additive complement was not. Each channel is
 *  additionally held within `MAX_GAIN` of unity, so no single measurement can
 *  swing a frame further than a real shadow illuminant does. */
export function measureShadowCast(
  at: (x: number, y: number) => [number, number, number],
  w: number,
  h: number,
  isSky: (x: number, y: number) => boolean,
): ShadowCast {
  const none: ShadowCast = { gain: [1, 1, 1], spread: 0, shadePx: 0, sunPx: 0, measured: false };
  if (w < 2 || h < 2) return none;

  // ONE PASS FOR THE THRESHOLDS, over the non-sky pixels only. A histogram
  // rather than a sort: the frame can be a megapixel and the answer needs two
  // percentiles, not an ordering.
  const BINS = 256;
  const hist = new Int32Array(BINS);
  let counted = 0;
  const lum = (r: number, g: number, b: number) => r * LUMA_R + g * LUMA_G + b * LUMA_B;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isSky(x, y)) continue;
      const [r, g, b] = at(x, y);
      const L = lum(r, g, b);
      if (!(L > BLACK_FLOOR)) continue; // see BLACK_FLOOR: below it there is no colour to read
      const bin = Math.min(BINS - 1, Math.max(0, Math.round(Math.sqrt(Math.min(1, L)) * (BINS - 1))));
      hist[bin]++;
      counted++;
    }
  }
  if (counted < MIN_POPULATION * 2) return { ...none, shadePx: 0, sunPx: 0 };

  const at_pct = (p: number) => {
    let seen = 0;
    const want = counted * p;
    for (let i = 0; i < BINS; i++) { seen += hist[i]; if (seen >= want) return i; }
    return BINS - 1;
  };
  // The darkest fifth is the shade and the brightest third is the sun, with a
  // gap between them: a pixel halfway between the two is lit by both and would
  // only blur the difference the measurement exists to find.
  //
  // BOTH THRESHOLDS ARE BIN INDICES, AND THE SECOND PASS BINS EACH PIXEL THE
  // SAME WAY. The first version compared a continuous luminance against a
  // threshold reconstructed from a rounded bin, so a pixel whose own value was
  // a fraction below its bin's centre fell outside its own population — on a
  // frame of two flat tones that emptied the SUNLIT population completely and
  // the measurement refused every frame it was given. Found by the gate's
  // first run, which is what a gate written before the confidence is for.
  const shadeLo = at_pct(SHADE_FROM);
  const shadeHi = at_pct(SHADE_TO);
  const sunBin = at_pct(SUN_FROM);
  if (!(sunBin > shadeHi)) return { ...none, shadePx: 0, sunPx: 0 };

  // SECOND PASS: the two populations' mean CHROMATICITY. Each pixel is divided
  // by its own luminance first, so what accumulates is the direction of its
  // colour and not its brightness — otherwise the sunlit mean would simply be
  // the brighter one and the ratio would be an exposure difference.
  let sr = 0, sg = 0, sb = 0, sn = 0;
  let ur = 0, ug = 0, ub = 0, un = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isSky(x, y)) continue;
      const [r, g, b] = at(x, y);
      const L = lum(r, g, b);
      if (!(L > BLACK_FLOOR)) continue;
      const bin = Math.min(BINS - 1, Math.max(0, Math.round(Math.sqrt(Math.min(1, L)) * (BINS - 1))));
      if (bin >= shadeLo && bin <= shadeHi) { sr += r / L; sg += g / L; sb += b / L; sn++; }
      else if (bin >= sunBin) { ur += r / L; ug += g / L; ub += b / L; un++; }
    }
  }
  if (sn < MIN_POPULATION || un < MIN_POPULATION) {
    return { ...none, shadePx: sn, sunPx: un };
  }
  const shade = [sr / sn, sg / sn, sb / sn];
  const sun = [ur / un, ug / un, ub / un];

  // The gain that carries the shade's colour onto the sun's. A ratio of two
  // chromaticities, so it is dimensionless and a frame lit by one illuminant
  // gives unity by construction rather than by calibration.
  const raw = [0, 1, 2].map((i) => (shade[i] > 1e-6 ? sun[i] / shade[i] : 1));
  // NORMALISED TO UNIT LUMA, so the correction cannot move brightness. Without
  // this a measured gain would double as an exposure change and the two would
  // be impossible to tell apart on screen.
  const gl = raw[0] * LUMA_R + raw[1] * LUMA_G + raw[2] * LUMA_B;
  const unit = gl > 1e-6 ? raw.map((v) => v / gl) : [1, 1, 1];
  // HELD BY PULLING THE WHOLE GAIN TOWARD UNITY, never by clamping a channel.
  // Clamping each channel independently moved the gain's luma off 1 — measured
  // at 1.0198 on an extreme frame — which broke the one invariant this function
  // promises, that a correction cannot change brightness. Scaling the whole
  // deviation keeps the direction of the cast AND keeps the luma exactly 1,
  // because the unit gain's luma is 1 and so is unity's.
  const worst = Math.max(...unit.map((v) => Math.abs(v - 1)));
  const t = worst > MAX_GAIN ? MAX_GAIN / worst : 1;
  const held = unit.map((v) => 1 + (v - 1) * t) as [number, number, number];
  const spread = Math.max(...held.map((v) => Math.abs(v - 1)));
  return { gain: held, spread, shadePx: sn, sunPx: un, measured: true };
}

/** HOW MUCH OF A MEASURED CAST TO TAKE OUT BY DEFAULT.
 *
 *  Takes `cast`, a measurement. Returns an amount in 0..1.
 *
 *  Zero for a frame with no measurable cast, so the carport and every frame
 *  like it opens exactly as it does today; rising with the spread and reaching
 *  full strength at a cast of ten per cent, which is already a strongly
 *  two-illuminant frame.
 *
 *  What the caller relies on: this only ever SUGGESTS. The amount lands on a
 *  visible slider the reader can drag to zero and undo, which is what the
 *  at-open ruling requires of every automatic — the number here is a starting
 *  point, not a decision the app keeps to itself.
 *
 *  NOTHING IN THE APP CALLS IT YET, AND THAT IS DELIBERATE. Measured on the
 *  real corpus 2026-09-21, `measureShadowCast` does not yet separate a shadow a
 *  tree filled from one a roof made — the carport reads 17.6% where the whole
 *  design needs it to read nothing — so suggesting an amount would be offering
 *  a correction the measurement has not earned. It is kept, and exercised by
 *  `tools/shadow-cast-check.mjs`, because the shape is what decision 034 chose;
 *  it stays unwired until the discriminator works. IR-SCIENCE 9j-ii. */
export function suggestedAmount(cast: ShadowCast): number {
  if (!cast.measured) return 0;
  return Math.min(1, Math.max(0, cast.spread / 0.10));
}
