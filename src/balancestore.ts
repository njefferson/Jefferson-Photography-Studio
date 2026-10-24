// Kept white balances, and the Temperature and Tint scale that reads and moves a balance without changing how bright the picture is.
//
// WHY A SCALE OF ITS OWN. A raw from this camera needs gains far outside what a Kelvin slider can reach: the floor of every stock profile
// is 1500 to 2000 K, and an infrared white point is below it (IR-SCIENCE.md section 3). So the two numbers here are the app's own and are
// never called Kelvin. They are read off the three gain sliders' own track, which is 1300 equal ratio steps up from 0.02 (`WB_GAIN_*` in
// decode.ts), so a step of either one is a whole move on a track the reader already has:
//
//   Temperature  half the gap between the red gain's track position and the blue gain's. Right is more red against blue.
//   Tint         a third of how far the red and blue positions' mean sits above the green gain's. Right is more magenta, less green.
//
// ONE STATE, THREE GAINS. Nothing here is stored as a Temperature or a Tint. They are views of the three gains, read by `readBalance` and
// moved by `moveBalance`, and the only things kept are gains. Moving either number leaves the SUM of the three track positions alone,
// which is exactly the geometric mean of the gains, so a move changes the white point and not the overall level (the exposure is not
// touched). Because the move lands on whole track positions, the gains it writes are the ones the gain sliders can show and read back, so
// a later press on any other slider rounds nothing (the rule `snapGain` in tile.ts keeps for every writer of a balance).
//
// WHAT IS KEPT. A kept balance is a name and three gains in localStorage, the way a lens profile is kept (lensstore.ts): it survives a
// reload, a new session and a different memory card, because none of the three depends on the photograph it was made on. One kept
// balance at a time can be HELD, and the page opens every raw at the held gains instead of the gray-world ones. This file only keeps
// and moves numbers; opening and applying are main.ts's.

import { WB_GAIN_LO, WB_GAIN_HI, WB_GAIN_STEPS } from "./decode";
import { trackPos, trackVal } from "./tile";

/** Red, green and blue gains, as `EditParams.wb` holds them. */
export type Gains = [number, number, number];

/** A balance read as the two numbers: `t` is Temperature and `ti` is Tint, both in track steps (see the header). */
export interface BalanceReading { t: number; ti: number }

/** A balance kept under a name. `gains` are on the gain sliders' track; `made` is when it was kept, as the device's own clock wrote it. */
export interface KeptBalance { id: string; name: string; gains: Gains; made: string }

/** The Temperature slider runs from minus this to plus this, and the Tint slider likewise. A balance beyond them still reads and still
 *  moves; the thumb waits at the end and the typed number says where it really is. */
export const TEMPERATURE_LIMIT = 300;
export const TINT_LIMIT = 200;

const LN_SPAN = Math.log(WB_GAIN_HI / WB_GAIN_LO);

/** A gain's place on the white-balance track, not rounded.
 *  @param g  a gain; clamped into the track first.
 *  @returns its position in steps from the track's low end, 0 to `WB_GAIN_STEPS`.
 *  What it must satisfy: for a gain `trackVal` made, it equals the whole position `trackVal` was given. */
function placeOf(g: number): number {
  const v = Math.min(WB_GAIN_HI, Math.max(WB_GAIN_LO, g));
  return (WB_GAIN_STEPS * Math.log(v / WB_GAIN_LO)) / LN_SPAN;
}

/** The two numbers a set of gains stands for.
 *  @param gains  red, green and blue, from the open photograph's `params.wb` or from a kept balance.
 *  @returns Temperature and Tint in track steps, not rounded.
 *  What it must satisfy: it depends on the ratios between the gains only, so two sets that differ by a common factor read the same, and
 *  `readBalance(moveBalance(r, g))` is within one step of `r` for any `r` the track can reach. Consumers: the two sliders and their
 *  typed numbers (main.ts `updateBalanceUI`) and the report's held-balance row. */
export function readBalance(gains: Gains): BalanceReading {
  const r = placeOf(gains[0]);
  const g = placeOf(gains[1]);
  const b = placeOf(gains[2]);
  return { t: (r - b) / 2, ti: ((r + b) / 2 - g) / 3 };
}

/** The geometric mean of three gains, the overall level a Temperature or Tint move holds.
 *  @param g  red, green and blue gains.
 *  @returns the cube root of their product.
 *  What it must satisfy: `moveBalance` returns gains whose geometric mean equals this one's for the gains it was given, to the last
 *  place a float keeps, because both are the same sum of track positions. Consumers: the exposure carried over when a balance is put on
 *  a photograph that is not open (`levelHeldExposure`). */
export function geometricMean(g: Gains): number {
  return Math.cbrt(g[0] * g[1] * g[2]);
}

/** The gains for a wanted Temperature and Tint, at the level the starting gains have.
 *  @param want  the Temperature and Tint asked for, in track steps (a slider's whole number or a typed one).
 *  @param from  the gains the move starts from; their track positions are rounded first, so an unrounded balance (a tap on foliage, the
 *  IR tab's Auto) moves from the nearest place the sliders can show.
 *  @returns gains on the track's whole positions with the SAME sum of positions as `from`, so the same geometric mean, nearest to the
 *  wanted pair in ratio terms; when two grid points are as near, the one that moves the three gains least. A pair the track cannot reach
 *  gives the nearest point it can.
 *  What it must satisfy: a Temperature asked one more than the start's, with Tint unchanged, moves the red gain up one track step and
 *  the blue gain down one and leaves green alone, exactly; every gain it returns is a value `snapGain` would leave unchanged. */
export function moveBalance(want: BalanceReading, from: Gains): Gains {
  const p0 = from.map((g) => trackPos(g, WB_GAIN_LO, WB_GAIN_HI, WB_GAIN_STEPS));
  const sum = p0[0] + p0[1] + p0[2];
  const top = WB_GAIN_STEPS;
  // Green's position when red and blue carry the wanted Tint: Tint = (sum / 6) - (green / 2), solved for green.
  const idealGreen = sum / 3 - 2 * want.ti;
  const g0 = Math.min(top, Math.max(0, Math.round(idealGreen)));
  let best: { p: [number, number, number]; err: number; move: number } | null = null;
  for (let pg = g0 - 2; pg <= g0 + 2; pg++) {
    if (pg < 0 || pg > top) continue;
    const rem = sum - pg; // red plus blue
    const lo = Math.max(0, rem - top), hi = Math.min(top, rem);
    if (lo > hi) continue;
    const r0 = Math.min(hi, Math.max(lo, Math.round((rem + 2 * want.t) / 2)));
    for (let pr = r0 - 1; pr <= r0 + 1; pr++) {
      if (pr < lo || pr > hi) continue;
      const pb = rem - pr;
      const t = (pr - pb) / 2;
      const ti = ((pr + pb) / 2 - pg) / 3;
      const err = (2 * (t - want.t)) ** 2 + (3 * (ti - want.ti)) ** 2;
      const move = Math.abs(pr - p0[0]) + Math.abs(pg - p0[1]) + Math.abs(pb - p0[2]);
      if (!best || err < best.err - 1e-9 || (Math.abs(err - best.err) <= 1e-9 && move < best.move)) best = { p: [pr, pg, pb], err, move };
    }
  }
  const p = best ? best.p : (p0 as [number, number, number]);
  return [trackVal(p[0], WB_GAIN_LO, WB_GAIN_HI, WB_GAIN_STEPS), trackVal(p[1], WB_GAIN_LO, WB_GAIN_HI, WB_GAIN_STEPS), trackVal(p[2], WB_GAIN_LO, WB_GAIN_HI, WB_GAIN_STEPS)];
}

/** The exposure that keeps a photograph's overall level when its gains change, for a photograph that is not open and so cannot be measured.
 *  @param was  the gains the photograph has.
 *  @param exposure  the exposure it has.
 *  @param next  the gains it is about to take.
 *  @returns `exposure` scaled by the ratio of the geometric means, so gain times exposure keeps its geometric mean across the three
 *  channels. It is not clamped to the exposure slider's range; the caller clamps and puts the result on the slider's grid.
 *  What it must satisfy: for `next` and `was` of one geometric mean the result is `exposure` itself. Consumers: main.ts, when a held
 *  balance is put on the other photographs of a set (`rewriteBalance`). */
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

const KEY = "ips-balances-v1";
const HELD_KEY = "ips-balance-held-v1";

/** How many stored balances the last read had to set aside as unusable, for the report. A balance that vanishes without a word is the
 *  defect this counter is here to make visible. */
export let droppedBalances = 0;

/** Whether a stored balance is one this version can put on a photograph.
 *  @param b  the candidate as read from storage.
 *  @returns null when it is usable, or a sentence naming what is wrong.
 *  What it must satisfy: `read` and `keepBalance` apply it to the same records, so a balance is never stored at one door and refused at
 *  the other. A usable balance has an id and a name that are text, a name of at most `NAME_MAX` characters, and three finite gains inside
 *  the gain sliders' track. */
export function balanceProblem(b: unknown): string | null {
  const o = b as Partial<KeptBalance> | null;
  if (!o || typeof o !== "object") return "it is not a record";
  if (typeof o.id !== "string" || !o.id) return "it has no id";
  if (typeof o.name !== "string" || !o.name.trim() || o.name.length > NAME_MAX) return "its name is empty or too long";
  if (!Array.isArray(o.gains) || o.gains.length !== 3) return "it does not carry three gains";
  for (const v of o.gains) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < WB_GAIN_LO * 0.999 || v > WB_GAIN_HI * 1.001) return "a gain is outside the track the sliders have";
  }
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
      out.push({ id: b.id, name: b.name, gains: [b.gains[0], b.gains[1], b.gains[2]], made: typeof b.made === "string" ? b.made : "" });
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
 *  @returns the record as stored, or null when the name is empty, a gain is unusable, or storage refused.
 *  What it must satisfy: the record passes `balanceProblem`, and afterwards `listBalances` has it first. */
export function keepBalance(name: string, gains: Gains): KeptBalance | null {
  const clean = name.trim().slice(0, NAME_MAX);
  const rec: KeptBalance = { id: `b${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, name: clean, gains: [gains[0], gains[1], gains[2]], made: new Date().toISOString() };
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
