// WHAT IS ACTUALLY IN FRONT OF THE PERSON — asked once, in one place.
//
// This app was built on an iPad and its words followed its author rather than
// its reader: copy that any browser on any machine can load said "the iPad",
// flatly, to everybody. Some of that copy is just using a noun, and the honest
// noun there is "device". The rest genuinely changes what the reader should DO,
// and there the answer is to look.
//
// THE ONE FACT EVERYTHING HERE TURNS ON: iPadOS Safari reports itself as macOS.
// `navigator.platform` is "MacIntel" and the browser string says Macintosh, on
// purpose, since iPadOS 13 — so any test that reads only those calls every iPad
// a Mac. A Mac reports 0 touch points and an iPad reports 5, and that is the
// whole of the difference. (Doctrine §7f is why the diagnostic prints it.)
//
// This exists because THREE separate answers to that one question had grown in
// this app — the install prompt's own `isIOS`, the export path's
// `downloadIsUseless`, and the diagnostic's `deviceLine` — each written from
// scratch, each slightly different, and no two of them wrong in the same way.
// (The hub's LESSONS §243 is the same shape: two lists for one idea, and
// neither was right.) Everything asks here now.

export type Family = "ios" | "android" | "mac" | "windows" | "linux" | "chromeos" | "unknown";
export type Browser = "safari" | "chrome" | "edge" | "firefox" | "other";

export interface Device {
  family: Family;
  browser: Browser;
  /** A touch screen is present at all — not the same question as `family`. A
   *  Windows laptop with a touchscreen is still a PC; an iPad in desktop mode
   *  is still an iPad. */
  touch: boolean;
  /** iPad or iPhone specifically, where the two want different words. */
  handheld: boolean;
  /** What to CALL it in a sentence, with no article: "iPad", "Android phone",
   *  "PC". Falls back to "device", which is always true and never wrong. */
  noun: string;
}

function read(): Device {
  const ua = navigator.userAgent || "";
  const plat = navigator.platform || "";
  const touchPoints = navigator.maxTouchPoints || 0;
  const touch = touchPoints > 0;

  // Order matters in every one of these. Edge's browser string contains
  // "Chrome", Chrome's contains "Safari", and on iOS every browser is WebKit
  // wearing a different name, so the most specific marker has to be tested
  // first or everything matches the loosest one.
  const browser: Browser = /Edg[A-Z]?\//.test(ua)
    ? "edge"
    : /(Chrome|CriOS|Chromium)\//.test(ua)
      ? "chrome"
      : /(Firefox|FxiOS)\//.test(ua)
        ? "firefox"
        : /Safari\//.test(ua)
          ? "safari"
          : "other";

  // iPhone and iPod still say so. An iPad says so ONLY in mobile mode; in
  // desktop mode — which is the default on a large iPad — it is indisputably a
  // Mac by every string it offers, and only the touch screen gives it away.
  const saysIPhone = /iPhone|iPod/.test(ua);
  const saysIPad = /iPad/.test(ua);
  const macString = /Mac/.test(plat) || /Macintosh/.test(ua);
  const iPadInDesktopMode = macString && touchPoints > 1 && !saysIPhone;

  if (saysIPhone) return { family: "ios", browser, touch, handheld: true, noun: "iPhone" };
  if (saysIPad || iPadInDesktopMode) return { family: "ios", browser, touch, handheld: true, noun: "iPad" };
  if (macString) return { family: "mac", browser, touch, handheld: false, noun: "Mac" };

  // Android says "Mobile" on a phone and leaves it out on a tablet. That is the
  // documented difference and it is the only one available; a maker who breaks
  // it lands on the plain noun, which is not wrong.
  if (/Android/.test(ua)) {
    const phone = /Mobile/.test(ua);
    return { family: "android", browser, touch, handheld: phone, noun: phone ? "Android phone" : "Android tablet" };
  }
  if (/CrOS/.test(ua)) return { family: "chromeos", browser, touch, handheld: false, noun: "Chromebook" };
  if (/Win/.test(plat) || /Windows/.test(ua)) return { family: "windows", browser, touch, handheld: false, noun: "PC" };
  if (/Linux/.test(plat) || /X11/.test(ua)) return { family: "linux", browser, touch, handheld: false, noun: "computer" };
  return { family: "unknown", browser, touch, handheld: false, noun: "device" };
}

// Read ONCE. Nothing here can change while the page is open — unlike whether
// the app is installed, which is read fresh every time on purpose because it
// can and does change mid-session.
let cached: Device | null = null;
export function device(): Device {
  if (!cached) cached = read();
  return cached;
}

/** The noun for this device, for a sentence that just needs to name it.
 *  Deliberately NOT capitalised and NOT articled — callers write "on your
 *  ${deviceNoun()}" or "the ${deviceNoun()}". */
export function deviceNoun(): string {
  return device().noun;
}

/** True on iPad and iPhone, including an iPad pretending to be a Mac. This is
 *  the test every "does the share sheet / Files picker / home-screen install
 *  behave differently here" question actually wants. */
export function isIOS(): boolean {
  return device().family === "ios";
}

/** Mark the entry in a platform list that matches the device in hand.
 *
 *  The LIST STAYS WHOLE. Showing only the matching row would be the obvious
 *  move and it is wrong twice over: a reader is often setting up a different
 *  machine than the one they are reading on, and a detection that is wrong
 *  then hides the correct answer instead of sitting next to it. So every
 *  platform is still there and one is marked.
 *
 *  The mark is TEXT, not a colour or a fill — the marked row reads "you're on
 *  this" in words, which is what the accessibility rule here requires and also
 *  what makes it survive being read aloud. */
export function markPlatformList(root: ParentNode = document): void {
  const d = device();
  for (const li of Array.from(root.querySelectorAll<HTMLElement>("li[data-plat]"))) {
    const families = (li.dataset.plat || "").split(/\s+/).filter(Boolean);
    const browsers = (li.dataset.browser || "").split(/\s+/).filter(Boolean);
    const familyMatches = families.includes(d.family);
    // A row may also name a browser ("Mac — Safari"), and then BOTH have to
    // match: on a Mac running Chrome, the Safari row is not the reader's row.
    const matches = familyMatches && (!browsers.length || browsers.includes(d.browser));
    li.classList.toggle("plat-you", matches);
    const had = li.querySelector(".plat-you-mark");
    if (matches && !had) {
      const mark = document.createElement("span");
      mark.className = "plat-you-mark";
      mark.textContent = ` — you're on this`;
      li.appendChild(mark);
    } else if (!matches && had) {
      had.remove();
    }
  }
}

/** Replace `<span data-device-noun></span>` with the device's own noun, so the
 *  markup can stay readable prose instead of being assembled in script. The
 *  element keeps whatever it already said as its fallback: if this never runs
 *  — a script error, an old build — the sentence still reads correctly, which
 *  is why the HTML ships with "device" in it rather than empty. */
export function fillDeviceNouns(root: ParentNode = document): void {
  const noun = deviceNoun();
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-device-noun]"))) {
    el.textContent = noun;
  }
}

/** Reveal copy that is only true on one kind of device.
 *
 *  `data-only-plat` names one or more families ("ios", "windows mac linux").
 *  The element SHIPS HIDDEN and is revealed on a match, never the other way
 *  round. Shipping it visible and hiding it would flash the wrong paragraph at
 *  everyone it does not apply to, which is the defect this is here to fix; and
 *  if the script never runs, a missing platform note costs a reader nothing —
 *  every one of them is also in Help, in full, for every platform.
 *
 *  Do NOT hide anything a reader might need for a device they are not holding.
 *  This is for "what is happening on THIS screen right now" copy — the Files
 *  picker stalling in front of them — not for reference material. */
export function applyPlatformVisibility(root: ParentNode = document): void {
  const d = device();
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-only-plat]"))) {
    const want = (el.dataset.onlyPlat || "").split(/\s+/).filter(Boolean);
    el.hidden = !want.includes(d.family);
  }
}

/** Everything the copy needs, in one call: the nouns, the platform-only notes,
 *  and the marked row in each platform list. Pages call this once at startup —
 *  a page that calls only one of the three is how a surface ends up half
 *  device-aware, which is harder to notice than not doing it at all. */
export function wireDeviceCopy(root: ParentNode = document): void {
  fillDeviceNouns(root);
  applyPlatformVisibility(root);
  markPlatformList(root);
}
