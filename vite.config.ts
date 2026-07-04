import { defineConfig } from "vite";
import { execSync } from "node:child_process";

// Offline-first PWA, no framework. Relative base so it runs from any path
// (incl. "Add to Home Screen" on the iPad).

/** Last 5 commits, injected at build time so every deploy carries its own
 *  changelog (surfaced behind the ⓘ button in the app header). Every update
 *  gets a real version number: v0.N where N is the update's sequence number
 *  since the repo began (commit count at that commit) — v1.0 and beyond are
 *  declared by git tag (see appVersion below). */
function changelog() {
  try {
    const out = execSync('git log -5 --pretty=format:"%h|%H|%ad|%s" --date=short', {
      encoding: "utf8",
    });
    return out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, full, date, ...rest] = line.split("|");
        const n = execSync(`git rev-list --count ${full}`, { encoding: "utf8" }).trim();
        return { hash, date, subject: rest.join("|"), version: `0.${n}` };
      });
  } catch {
    return [];
  }
}

/** App version: an exact git tag on HEAD wins (tag v1.0 to declare the
 *  milestone), else 0.<update number> from the commit count. */
function appVersion() {
  try {
    return execSync("git describe --tags --exact-match", { encoding: "utf8" })
      .trim()
      .replace(/^v/, "");
  } catch {
    /* no tag on HEAD — pre-1.0 scheme */
  }
  try {
    return `0.${execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim()}`;
  } catch {
    return "dev";
  }
}

export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    sourcemap: true,
  },
  define: {
    __CHANGELOG__: JSON.stringify(changelog()),
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
});
