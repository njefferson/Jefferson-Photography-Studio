// Keeping the screen awake while a long job runs.
//
// WHY. An iPad on its own auto-lock timer sleeps in the middle of measuring
// ninety frames or opening a large set, and the work stops. Nothing in a web
// page can turn off Auto-Lock; the Screen Wake Lock API is the one lever there
// is, and Safari has had it since 16.4.
//
// THREE THINGS ABOUT IT THAT MATTER, all of them ways to hold it wrong:
//
//  1. The browser RELEASES IT whenever the document is hidden — switching apps,
//     the system file picker taking over, the screen locking for any other
//     reason. It does not come back on its own. So it has to be re-taken on
//     visibilitychange while anything still wants it, or the lock silently
//     covers only the first part of the job.
//  2. It is a REQUEST. Older Safari has no API at all, a low battery can refuse
//     it, and it can be revoked at any moment. `granted()` reports what actually
//     happened so the app can tell the reader to set Auto-Lock to Never rather
//     than implying the problem is handled.
//  3. Overlapping jobs. Opening a set can start while a measurement is still
//     going, so this counts holders and only lets go when the last one does.

let holders = 0;
let lock: WakeLockSentinel | null = null;
let ok: boolean | null = null; // null = never asked

async function take(): Promise<void> {
  if (lock || !holders) return;
  try {
    if (!navigator.wakeLock?.request) { ok = false; return; }
    lock = await navigator.wakeLock.request("screen");
    ok = true;
    // Revoked by the system, or released by the page going hidden. Drop the
    // handle so the next visibility change can ask again.
    lock.addEventListener("release", () => { lock = null; });
  } catch {
    ok = false; // refused: an old Safari, a low battery, or a policy
    lock = null;
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void take();
  });
}

/** Hold the screen awake until the returned function is called. Safe to nest —
 *  the screen is let go when the last holder does. */
export function keepAwake(): () => void {
  holders++;
  void take();
  let done = false;
  return () => {
    if (done) return; // a caller releasing twice must not free somebody else's
    done = true;
    holders = Math.max(0, holders - 1);
    if (!holders && lock) {
      const l = lock;
      lock = null;
      void l.release().catch(() => { /* already gone; nothing to undo */ });
    }
  };
}

/** What the browser actually did: true held, false refused or unsupported,
 *  null never asked. Never a promise about what will happen next — a lock can
 *  be revoked at any time. */
export function granted(): boolean | null {
  return ok;
}

/** Whether this browser has the API at all, for telling a reader that the only
 *  remedy on their device is Settings. */
export function supported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.wakeLock?.request;
}
