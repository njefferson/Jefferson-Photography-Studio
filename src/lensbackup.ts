// HAS ANY OF THIS EVER LEFT THE DEVICE — its own file, deliberately.
//
// This began inside lensstore.ts and the repo's own preview gate refused the
// commit, which was the right call twice over. A quick-look preview is rendered
// THROUGH the reader's lens correction, so lensstore.ts is one of the files
// PREVIEW_PIPELINE hashes; adding backup bookkeeping to it would have demanded
// a version bump, and a bump throws away every preview every reader has cached
// — for a change that cannot alter a single pixel.
//
// The file it came out of says what it is for in its own header: it only keeps
// and matches. Whether a copy of what it keeps exists somewhere else is a
// different question, asked by a different part of the screen, and it belongs
// beside rather than inside.

import { listProfiles, profilesStamp } from "./lensstore";

/* ---- HAS ANY OF THIS EVER LEFT THE DEVICE ----------------------------------
 *
 *  The panel already says where profiles live and what the browser has decided
 *  about keeping them, and it offers a backup. What it could not say is the one
 *  thing the reader actually wants to know: whether the measurements ON THIS
 *  DEVICE RIGHT NOW have ever been saved anywhere else.
 *
 *  "Save a backup" printed on every visit is wallpaper — it says the same thing
 *  to somebody who backed up five minutes ago and to somebody who has measured
 *  eleven lenses and never once taken a copy. Those are different situations
 *  and only one of them is urgent.
 *
 *  It records the STAMP, not a date and not a flag. profilesStamp() hashes the
 *  stored text, so a stamp that still matches means the file the reader holds
 *  is the file that is on the device — and the moment they measure anything new
 *  it stops matching, by itself, with nothing to remember to update. A boolean
 *  would say "backed up" for ever after one press. */
const BACKUP_KEY = "ips-lens-backup-v1";

export type BackupState =
  | { kind: "empty" }                                    // nothing to lose yet
  | { kind: "never"; count: number }                     // measured, never saved
  | { kind: "stale"; count: number; when: string }       // saved, then changed
  | { kind: "current"; count: number; when: string };    // the file matches

/** Remember that everything currently stored has just left the device. Called
 *  by whatever actually hands the reader a copy — a saved file or a clipboard
 *  they pasted somewhere — never by merely offering one. */
export function markBackedUp(): void {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ stamp: profilesStamp(), at: new Date().toISOString() }));
  } catch {
    /* A browser that will not store this is exactly the browser whose profiles
       are least safe. Nothing to do about it here; the state simply reads
       "never", which is the honest answer when nothing can be recorded. */
  }
}

export function backupState(): BackupState {
  const count = listProfiles().length;
  if (!count) return { kind: "empty" };
  let rec: { stamp?: string; at?: string } | null = null;
  try {
    rec = JSON.parse(localStorage.getItem(BACKUP_KEY) || "null");
  } catch {
    rec = null;
  }
  if (!rec || !rec.stamp) return { kind: "never", count };
  // Day precision. The reader is deciding whether to take a fresh copy, and to
  // the minute is a number that invites being read as more exact than it is.
  const when = rec.at ? new Date(rec.at).toLocaleDateString() : "an earlier session";
  return rec.stamp === profilesStamp() ? { kind: "current", count, when } : { kind: "stale", count, when };
}

/** One sentence for whichever of those it is. Separate from the rendering so
 *  the same words can be used in the panel and after a run without a second
 *  copy drifting from the first. */
export function backupSentence(st: BackupState): string {
  switch (st.kind) {
    case "empty": return "";
    case "never": return st.count === 1
      ? "The one profile on this device has never been saved anywhere else."
      : `The ${st.count} profiles on this device have never been saved anywhere else.`;
    case "stale": return `Your last backup was ${st.when}, and what is on this device has changed since — that file is now out of date.`;
    case "current": return `Your backup from ${st.when} matches what is on this device.`;
  }
}
