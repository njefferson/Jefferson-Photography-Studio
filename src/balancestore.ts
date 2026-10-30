// Kept white balances, and the Temperature and Tint that read and move a balance on Adobe's scale without changing how bright the picture is.
//
// ADOBE'S SCALE, THROUGH THE CAMERA'S PROFILE (record 102; IR-SCIENCE.md section 3). The two numbers are what Lightroom shows for a raw file: Temperature in kelvin from 2000 to 50000 and Tint from minus 150 to 150, read from the three gains through a camera profile's colour matrices by the conversion Adobe's DNG SDK defines (src/kelvin.ts). This app's Temperature reaches below Adobe's 2000 K, to the lowest white the camera's gains can show (record 103), by Planck's law where the SDK's table stops. Which profile is the photograph's own business (src/camprofile.ts lists them and picks one); this file takes the profile as a colour spec and neither knows nor stores which. An infrared white sits inside the scale under a profile made for infrared, and may sit past an end of it under the camera's stock matrix, where the thumb rests at the end and the typed box reads the figure.
//
//   Temperature  the white's colour temperature. Right is warmer: a higher temperature, a bluer white, red up against blue.
//   Tint         the white's offset across the locus. Right is more magenta in the photograph (a white on the green side of the locus).
//
// THE TEMPERATURE THUMB IS SPACED IN MIRED. A kelvin figure is not a uniform scale (200 K is a small step at 6000 K and a large one at 2000 K), and the SDK works in mired (a million over the kelvin figure) throughout: its table, its interpolation and the weight it gives a profile's two calibrations. So the thumb stands where the white's mired figure puts it between the schema's two ends, one step to a mired, and the number beside it is the kelvin figure. No source read says how Lightroom spaces its own thumb; this spacing is this app's choice, it moves no figure, and the ends and every number are Adobe's.
//
// ONE STATE, THREE GAINS. Nothing here is stored as a Temperature or a Tint. They are views of the three gains, read by `readBalance`, moved by `moveBalance` (a slider's drag) and set by `exactBalance` (a number typed into a box), and the only things kept are gains. Either way the geometric mean of the gains is left alone, so a move changes the white point and not the overall level (the exposure is not touched).
//
// TWO ROUTES, AND WHY. A slider's drag lands on whole track positions of the gain sliders (1300 equal ratio steps up from 0.02, `WB_GAIN_*` in decode.ts), so the gains it writes are the ones the gain sliders can show and read back, and a later press on any other slider rounds nothing (the rule `snapGain` in tile.ts keeps for every writer of a balance). A TYPED NUMBER LANDS ON THE NUMBER. Landing it on that grid too read back as much as 34 K from a Lightroom figure typed in (8634 K for a typed 8600; measured on 28 October against five Lightroom exports of one photograph, IR-SCIENCE.md section 3), because the grid is coarser than a whole kelvin or a whole unit of tint wherever the scale is steep. So `exactBalance` hands back the SDK's own gains for the typed pair, not rounded to the track; the gain sliders rest at their nearest positions, and main.ts keeps those exact gains (it remembers that it made them) until a gain slider is itself moved, when the balance takes the sliders' whole steps as it always did.
//
// A kept or held balance stores whatever gains it is given as numbers, so it renders exactly as before and reads out as a temperature and a tint through whichever profile the photograph is read through. What main.ts hands it (the hold passes the gains put on the grid) is main.ts's.
//
// WHAT IS KEPT. A kept balance is a name, three gains and, optionally, the profile choice its reader had on when it was kept (so it reads out under the same profile at the next photograph), in localStorage the way a lens profile is kept (lensstore.ts): it survives a reload, a new session and a different memory card, because none of them depends on the photograph it was made on. One kept balance at a time can be HELD, and the page opens every raw at the held gains instead of the gray-world ones. This file only keeps and moves numbers; opening and applying are main.ts's.

import { WB_GAIN_LO, WB_GAIN_HI, WB_GAIN_STEPS } from "./decode";
import { trackPos, trackVal } from "./tile";
import { KELVIN_MAX, KELVIN_MIN, gainsToWhite, whiteToGains, type ColourSpec } from "./kelvin";

/** Red, green and blue gains, as `EditParams.wb` holds them. */
export type Gains = [number, number, number];

/** A balance read as the two numbers: `kelvin` and `mired` are the temperature (one is a million over the other) and `tint` is the offset across the locus, in the SDK's units. */
export interface BalanceReading { kelvin: number; mired: number; tint: number }

/** The balance as the two sliders ask for it: `mired` is the temperature's inverse in millions, `tint` the offset. */
export interface BalanceWant { mired: number; tint: number }

/** A balance kept under a name. `gains` are on the gain sliders' track; `made` is when it was kept, as the device's own clock wrote it; `profile` is the profile choice token its reader had on (src/camprofile.ts), absent for a balance kept before profiles existed. */
export interface KeptBalance { id: string; name: string; gains: Gains; made: string; profile?: string }

/** THE SLIDERS' ENDS ARE THE SCALE'S, not the data's. The Temperature thumb's value is MINUS the mired figure, so right is warmer: it runs from `TEMPERATURE_MIRED_FAR` (1862 mired, `KELVIN_MIN` of 537 K, the lowest white this camera's gains can show, the left end; Adobe's own scale stops at 2000 K, `ADOBE_KELVIN_MIN`, and the line under the sliders says when a white sits between) to `TEMPERATURE_MIRED_NEAR` (20 mired, 50000 K, Adobe's warm end, the right end). The Tint slider runs from `TINT_MIN` to `TINT_MAX` of src/kelvin.ts. A white beyond them still reads and still moves; the thumb waits at the end and the typed number says where it really is. ir.html carries the same four numbers for the page as served, and tools/join-fold-check.mjs holds the two to each other. */
export const TEMPERATURE_MIRED_FAR = Math.round(1e6 / KELVIN_MIN);
export const TEMPERATURE_MIRED_NEAR = Math.round(1e6 / KELVIN_MAX);

const LN_SPAN = Math.log(WB_GAIN_HI / WB_GAIN_LO);

/** A gain's place on the white-balance track, not rounded.
 *  @param g  a gain; clamped into the track first.
 *  @returns its position in steps from the track's low end, 0 to `WB_GAIN_STEPS`.
 *  What it must satisfy: for a gain `trackVal` made, it equals the whole position `trackVal` was given. */
function placeOf(g: number): number {
  const v = Math.min(WB_GAIN_HI, Math.max(WB_GAIN_LO, g));
  return (WB_GAIN_STEPS * Math.log(v / WB_GAIN_LO)) / LN_SPAN;
}

/** The white a set of gains stands for, as the two sliders show it.
 *  @param gains  red, green and blue, from the open photograph's `params.wb` or from a kept balance.
 *  @param spec  what the gains are read through: the photograph's profile or matrix (`ProfileChoice.spec` in camprofile.ts).
 *  @returns the temperature in kelvin and in mired and the tint, not rounded; or null when the gains describe no white (a channel that no white can give), which the page shows as an empty number and an unmoved thumb.
 *  What it must satisfy: it depends on the ratios between the gains only, so two sets that differ by a common factor read the same, and `readBalance(moveBalance(w, g, s), s)` is within a few mired and a few units of tint of `w` for any `w` the gain track can reach (the track's own grid; tools/join-fold-check.mjs measures it). Consumers: the two sliders and their typed numbers (main.ts `updateBalanceUI`) and the report's balance and held-balance rows. */
export function readBalance(gains: Gains, spec: ColourSpec): BalanceReading | null {
  const w = gainsToWhite(spec, gains);
  return w ? { kelvin: w.kelvin, mired: w.mired, tint: w.tint } : null;
}

/** The geometric mean of three gains, the overall level a Temperature or Tint move holds.
 *  @param g  red, green and blue gains.
 *  @returns the cube root of their product.
 *  What it must satisfy: `moveBalance` returns gains whose geometric mean equals this one's for the gains it was given, to the last place a float keeps, because both are the same sum of track positions. Consumers: the exposure carried over when a balance is put on a photograph that is not open (`levelHeldExposure`). */
export function geometricMean(g: Gains): number {
  return Math.cbrt(g[0] * g[1] * g[2]);
}

/** The gains for a wanted temperature and tint, at the level the starting gains have.
 *  @param want  the temperature (as its inverse, `mired`) and the tint asked for.
 *  @param from  the gains the move starts from; their track positions are rounded first, so an unrounded balance (a tap on foliage, the IR tab's Auto) moves from the nearest place the sliders can show.
 *  @param spec  what the gains are read through.
 *  @returns gains on the track's whole positions with the SAME sum of positions as `from`, so the same geometric mean, whose reading is the nearest to the wanted pair among the grid points around the ideal (the error is counted in mired and tint units together, the two numbers the reader sees); when two grid points are as near, the one that moves the three gains least. Null when the wanted white gives a channel no light (no gains can balance it) or no grid point near it lies inside the track.
 *  What it must satisfy: every gain it returns is a value `snapGain` would leave unchanged; the sum of the three track positions is the start's, so the exposure needs no change; and the reading of the result is the grid's honest nearest to `want`, which the page shows because the box is read back from the gains. */
export function moveBalance(want: BalanceWant, from: Gains, spec: ColourSpec): Gains | null {
  const ideal = whiteToGains(spec, 1e6 / want.mired, want.tint);
  if (!ideal) return null;
  const p0 = from.map((g) => trackPos(g, WB_GAIN_LO, WB_GAIN_HI, WB_GAIN_STEPS));
  const sum = p0[0] + p0[1] + p0[2];
  const top = WB_GAIN_STEPS;
  // The ideal gains' places on the track, moved together until they have the start's sum (the same geometric mean).
  const q = ideal.map(placeOf);
  const shift = (sum - (q[0] + q[1] + q[2])) / 3;
  const r0 = Math.round(q[0] + shift), g0 = Math.round(q[1] + shift);
  let best: { p: [number, number, number]; err: number; move: number } | null = null;
  for (let pr = r0 - 2; pr <= r0 + 2; pr++) {
    for (let pg = g0 - 2; pg <= g0 + 2; pg++) {
      const pb = sum - pr - pg;
      if (pr < 0 || pr > top || pg < 0 || pg > top || pb < 0 || pb > top) continue;
      const w = gainsToWhite(spec, [trackVal(pr, WB_GAIN_LO, WB_GAIN_HI, WB_GAIN_STEPS), trackVal(pg, WB_GAIN_LO, WB_GAIN_HI, WB_GAIN_STEPS), trackVal(pb, WB_GAIN_LO, WB_GAIN_HI, WB_GAIN_STEPS)]);
      if (!w) continue;
      const err = (w.mired - want.mired) ** 2 + (w.tint - want.tint) ** 2;
      const move = Math.abs(pr - p0[0]) + Math.abs(pg - p0[1]) + Math.abs(pb - p0[2]);
      if (!best || err < best.err - 1e-9 || (Math.abs(err - best.err) <= 1e-9 && move < best.move)) best = { p: [pr, pg, pb], err, move };
    }
  }
  if (!best) return null;
  const p = best.p;
  return [trackVal(p[0], WB_GAIN_LO, WB_GAIN_HI, WB_GAIN_STEPS), trackVal(p[1], WB_GAIN_LO, WB_GAIN_HI, WB_GAIN_STEPS), trackVal(p[2], WB_GAIN_LO, WB_GAIN_HI, WB_GAIN_STEPS)];
}

/** The gains for a typed temperature and tint, EXACTLY, at the overall level the starting gains have.
 *  @param want  the temperature (as its inverse, `mired`) and the tint asked for.
 *  @param from  the gains the number is typed over; only their overall level (the geometric mean) is read, at full precision and not rounded to the track, so typing again and again cannot walk the brightness. For gains already on the track it is the level `moveBalance` holds.
 *  @param spec  what the gains are read through.
 *  @returns the SDK's gains for the wanted white (`whiteToGains`) scaled by one common factor to the level of `from`, NOT put on the track's grid; null when the wanted white gives a channel no light, `from` is not three positive finite gains, or a scaled gain falls outside the track `WB_GAIN_LO`..`WB_GAIN_HI`, where the sliders cannot show it and `balanceProblem` would refuse a kept copy.
 *  What it must satisfy: `readBalance` of the result gives back the wanted kelvin and tint to the conversion's own round trip (step 223 measured 0.0430 K and 0.0000 of tint at worst on the five Lightroom exports), so a whole number typed in reads back as itself in the box; the geometric mean of the result is that of `from`, so the exposure needs no change and the picture is as bright as it was. The result is off the grid on purpose: the gain sliders show `snapGain` of each gain (the nearest position), and a caller that stores it must keep it against a later read of the sliders (main.ts `syncFromUI`). Consumers: main.ts `balanceInput`, for a number typed into either box; a slider's drag takes `moveBalance`, which keeps the grid. */
export function exactBalance(want: BalanceWant, from: Gains, spec: ColourSpec): Gains | null {
  if (!from.every((g) => Number.isFinite(g) && g > 0)) return null;
  const ideal = whiteToGains(spec, 1e6 / want.mired, want.tint);
  if (!ideal) return null;
  const k = geometricMean(from) / geometricMean(ideal);
  const out: Gains = [ideal[0] * k, ideal[1] * k, ideal[2] * k];
  if (!out.every((g) => Number.isFinite(g) && g >= WB_GAIN_LO && g <= WB_GAIN_HI)) return null;
  return out;
}

/** Red, green and blue screen-side gains, product one: what a Temperature or Tint move changes while the red and blue swap is on (`EditParams.wbScreen`, record 104). */
export type ScreenGains = [number, number, number];

/** The gains the Temperature and Tint are read from, and moved through, while the swap is on (record 104).
 *  @param gains  the camera-space gains, `params.wb`.
 *  @param screen  the screen-side gains in force (`screenGainsOf` of the edit), or null when there are none to apply (the swap is off, or they are one, one, one).
 *  @returns the gains themselves when `screen` is null; otherwise the gains multiplied by the screen-side gains element by element, in screen order against camera order (the screen's red gain on the red gain, which is the reading that makes a warmer picture read as a warmer white), and scaled by one common factor back to the gains' own geometric mean.
 *  What it must satisfy: with `screen` null or one, one, one the result equals `gains`, so the box reads at open what record 103's reading gives; the geometric mean of the result is that of `gains`, so `readBalance` of it depends on the ratios alone; and raising the screen's red against its blue raises the result's red against its blue, which `readBalance` reads as a warmer white. Consumers: main.ts `updateBalanceUI` and `balanceInput`, the report's balance rows. */
export function shownGains(gains: Gains, screen: ScreenGains | null): Gains {
  if (!screen) return [gains[0], gains[1], gains[2]];
  const c: Gains = [gains[0] * screen[0], gains[1] * screen[1], gains[2] * screen[2]];
  const k = geometricMean(gains) / geometricMean(c);
  return [c[0] * k, c[1] * k, c[2] * k];
}

/** The white the open picture shows, as the two numbers: the gains and the screen-side gains read together through the profile.
 *  @param gains  the camera-space gains.
 *  @param screen  the screen-side gains in force, or null (see `shownGains`).
 *  @param spec  what the gains are read through.
 *  @returns `readBalance` of `shownGains`, or null when they describe no white.
 *  What it must satisfy: with `screen` null it is `readBalance(gains, spec)` exactly; with the swap on and a Temperature move made by `screenForWhite`, it reads back the white that was asked for. Consumers: main.ts `updateBalanceUI`, `balanceInput` and the report's balance rows. */
export function readShown(gains: Gains, screen: ScreenGains | null, spec: ColourSpec): BalanceReading | null {
  return readBalance(shownGains(gains, screen), spec);
}

/** The screen-side gains that make the picture show a wanted white, EXACTLY, with the camera-space gains left where they are (record 104).
 *  @param want  the temperature (as its inverse, `mired`) and the tint asked for, a slider's drag and a typed number alike.
 *  @param gains  the camera-space gains, which stay: only their overall level is read, at full precision.
 *  @param spec  what the gains are read through.
 *  @returns three gains with product one, such that `readShown(gains, result, spec)` reads the wanted white (the SDK's own gains for it, divided by the camera-space gains, element by element, and scaled to product one); null when the wanted white gives a channel no light, `gains` is not three positive finite numbers, or a result is not finite and above zero.
 *  What it must satisfy: nothing is rounded to the gain track's grid, so a typed number reads back as itself and ten one-step moves land where one ten-step move lands; there is no bound but finite and positive, because these are not stored as a gain slider's position; with a white the same as the camera-space gains' own it returns one, one, one. Consumers: main.ts `balanceInput`, while the swap is on. */
export function screenForWhite(want: BalanceWant, gains: Gains, spec: ColourSpec): ScreenGains | null {
  if (!gains.every((g) => Number.isFinite(g) && g > 0)) return null;
  const ideal = whiteToGains(spec, 1e6 / want.mired, want.tint);
  if (!ideal) return null;
  const k = geometricMean(gains) / geometricMean(ideal);
  const s = [ideal[0] * k / gains[0], ideal[1] * k / gains[1], ideal[2] * k / gains[2]];
  const m = Math.cbrt(s[0] * s[1] * s[2]);
  if (!(m > 0) || !Number.isFinite(m)) return null;
  const out: ScreenGains = [s[0] / m, s[1] / m, s[2] / m];
  return out.every((v) => Number.isFinite(v) && v > 0) ? out : null;
}

/** The exposure that keeps a photograph's overall level when its gains change, for a photograph that is not open and so cannot be measured.
 *  @param was  the gains the photograph has.
 *  @param exposure  the exposure it has.
 *  @param next  the gains it is about to take.
 *  @returns `exposure` scaled by the ratio of the geometric means, so gain times exposure keeps its geometric mean across the three channels. It is not clamped to the exposure slider's range; the caller clamps and puts the result on the slider's grid.
 *  What it must satisfy: for `next` and `was` of one geometric mean the result is `exposure` itself. Consumers: main.ts, when a held balance is put on the other photographs of a set (`rewriteBalance`). */
export function levelHeldExposure(was: Gains, exposure: number, next: Gains): number {
  return exposure * (geometricMean(was) / geometricMean(next));
}

/** A name for a balance nobody named: the device's own date and time.
 *  @param now  the moment, normally `new Date()`.
 *  @returns something like "Balance 24 Oct, 14:05" in the device's own language and clock.
 *  What it must satisfy: it is never empty and never longer than `NAME_MAX`. */
export function defaultBalanceName(now: Date): string {
  const day = now.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const time = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `Balance ${day}, ${time}`.slice(0, NAME_MAX);
}

/** The longest name a kept balance can have. The panel's text box carries the same number as its `maxlength`. */
export const NAME_MAX = 40;
/** The most balances kept at once; the oldest goes when a new one would pass it. */
export const KEPT_MAX = 30;
/** The longest profile choice token a kept balance carries ("loaded:" and a profile's name). */
const PROFILE_TOKEN_MAX = 80;

const KEY = "ips-balances-v1";
const HELD_KEY = "ips-balance-held-v1";

/** How many stored balances the last read had to set aside as unusable, for the report. A balance that vanishes without a word is the
 *  defect this counter is here to make visible. */
export let droppedBalances = 0;

/** Whether a stored balance is one this version can put on a photograph.
 *  @param b  the candidate as read from storage.
 *  @returns null when it is usable, or a sentence naming what is wrong.
 *  What it must satisfy: `read` and `keepBalance` apply it to the same records, so a balance is never stored at one door and refused at the other. A usable balance has an id and a name that are text, a name of at most `NAME_MAX` characters, three finite gains inside the gain sliders' track, and a profile choice that is absent or text of at most `PROFILE_TOKEN_MAX` characters. */
export function balanceProblem(b: unknown): string | null {
  const o = b as Partial<KeptBalance> | null;
  if (!o || typeof o !== "object") return "it is not a record";
  if (typeof o.id !== "string" || !o.id) return "it has no id";
  if (typeof o.name !== "string" || !o.name.trim() || o.name.length > NAME_MAX) return "its name is empty or too long";
  if (!Array.isArray(o.gains) || o.gains.length !== 3) return "it does not carry three gains";
  for (const v of o.gains) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < WB_GAIN_LO * 0.999 || v > WB_GAIN_HI * 1.001) return "a gain is outside the track the sliders have";
  }
  if (o.profile !== undefined && (typeof o.profile !== "string" || o.profile.length > PROFILE_TOKEN_MAX)) return "its profile choice is not short text";
  return null;
}

/** Every balance kept on this device that this version can use.
 *  @returns the list newest first. A record that fails `balanceProblem` is left out and counted in `droppedBalances`; a private window or
 *  cleared storage reads as an empty list. */
function read(): KeptBalance[] {
  droppedBalances = 0;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    const out: KeptBalance[] = [];
    for (const b of v) {
      if (balanceProblem(b)) { droppedBalances++; continue; }
      const rec: KeptBalance = { id: b.id, name: b.name, gains: [b.gains[0], b.gains[1], b.gains[2]], made: typeof b.made === "string" ? b.made : "" };
      if (typeof b.profile === "string" && b.profile) rec.profile = b.profile;
      out.push(rec);
    }
    return out;
  } catch {
    return [];
  }
}

/** Write the list back. @param list  the balances to keep. @returns true when storage took it, false when storage refused (out of room, or
 *  a window that keeps nothing), so the caller can say so. */
function write(list: KeptBalance[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Every kept balance, newest first.
 *  @returns the usable ones from `read`. Callers may rely on three finite gains inside the track and a name of 1 to `NAME_MAX` characters. */
export function listBalances(): KeptBalance[] {
  return read();
}

/** Keep a balance under a name, replacing a kept one of the same name.
 *  @param name  what the reader called it; trimmed and cut to `NAME_MAX`. An empty name is the caller's to fill (`defaultBalanceName`).
 *  @param gains  the gains to keep, on the track.
 *  @param profile  the profile choice token the reader had on (src/camprofile.ts), or undefined to keep none.
 *  @returns the record as stored, or null when the name is empty, a gain is unusable, or storage refused.
 *  What it must satisfy: the record passes `balanceProblem`, and afterwards `listBalances` has it first. */
export function keepBalance(name: string, gains: Gains, profile?: string): KeptBalance | null {
  const clean = name.trim().slice(0, NAME_MAX);
  const rec: KeptBalance = { id: `b${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, name: clean, gains: [gains[0], gains[1], gains[2]], made: new Date().toISOString() };
  if (profile) rec.profile = profile.slice(0, PROFILE_TOKEN_MAX);
  if (balanceProblem(rec)) return null;
  const list = [rec, ...read().filter((x) => x.name !== clean)].slice(0, KEPT_MAX);
  return write(list) ? rec : null;
}

/** Forget one kept balance.
 *  @param id  the record's id. If it is the held one, the hold ends with it.
 *  Writes the list back without it; returns nothing. */
export function removeBalance(id: string): void {
  write(read().filter((x) => x.id !== id));
  if (heldId() === id) setHeld(null);
}

/** The id of the balance every raw opens at, or null when none is held.
 *  @returns the stored id; it can name a balance that is gone, which `heldBalance` treats as no hold. */
export function heldId(): string | null {
  try {
    return localStorage.getItem(HELD_KEY) || null;
  } catch {
    return null;
  }
}

/** Hold a kept balance, or end the hold.
 *  @param id  the id of a kept balance, or null to end the hold.
 *  Writes the choice; returns nothing. A refused write leaves the hold as it was, which the next read shows. */
export function setHeld(id: string | null): void {
  try {
    if (id) localStorage.setItem(HELD_KEY, id);
    else localStorage.removeItem(HELD_KEY);
  } catch {
    /* a window that keeps nothing holds nothing */
  }
}

/** The balance every raw opens at.
 *  @returns the kept balance `heldId` names, or null when none is held or the one named is gone.
 *  What it must satisfy: a non-null result passes `balanceProblem`, so the open path can put its gains straight on a photograph. */
export function heldBalance(): KeptBalance | null {
  const id = heldId();
  return id ? read().find((x) => x.id === id) ?? null : null;
}
