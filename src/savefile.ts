// GETTING A FILE OUT OF THE APP, and the one decision that governs it.
//
// This is its own module rather than a corner of export.ts because THREE
// surfaces need it — the Studio's export, the Macro stacker's save, and
// anything that follows — and the Macro app should not have to pull in a JPEG
// encoder and an ICC profile writer to put a blob on disk. It was importing
// export.ts for exactly that, which also split a 50 kB chunk out of the app's
// main bundle as a side effect.
//
// Two copies of this decision already existed and one of them was wrong. A
// THIRD had grown by the time the device question was consolidated; all of
// them ask src/platform.ts now.
import { isIOS } from "./platform";

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** WHERE A PLAIN DOWNLOAD DOES NOT WORK, which is not the same question as
 *  where a share sheet exists.
 *
 *  The share sheet is here because the installed iOS app has no other save
 *  path: a bare `a[download]` silently does nothing there. But the test for it
 *  was `canShare`, and Chrome and Edge on WINDOWS answer yes — so Export on a
 *  PC opened the Windows share sheet, from which the file cannot simply be
 *  saved to disk. A capability that exists was standing in for a capability
 *  that is missing.
 *
 *  iPadOS Safari reports itself as macOS, so the browser string alone cannot
 *  tell an iPad from a Mac; `maxTouchPoints` is what does (Doctrine 7f, and the
 *  reason the diagnostic prints it). */
function downloadIsUseless(): boolean {
  // Only iOS and iPadOS. Android's browsers download properly, and so does
  // every desktop one — including the Windows Chrome and Edge that answer
  // `canShare` with yes and then open a share sheet a file cannot be saved
  // from, which is the bug the paragraph above is about.
  return isIOS();
}

/** Save a file the way that actually works on the device in hand: the share
 *  sheet only where a download would do nothing, a plain download everywhere
 *  else. "cancelled" = the user closed the sheet on purpose; callers should
 *  treat that as "keep waiting", not "saved". */
export async function saveBlob(blob: Blob, name: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (downloadIsUseless() && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] } as ShareData);
      return "shared";
    } catch (err) {
      if ((err as Error).name === "AbortError") return "cancelled"; // user closed the sheet
      // Fall through to a plain download on any other failure.
    }
  }
  download(blob, name);
  return "downloaded";
}
