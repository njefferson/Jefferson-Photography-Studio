import { defineConfig } from "vite";
import { execSync } from "node:child_process";

// Offline-first PWA, no framework. Relative base so it runs from any path
// (incl. "Add to Home Screen" on the iPad).

/** Last 5 commits, injected at build time so every deploy carries its own
 *  changelog (surfaced behind the ⓘ button in the app header). */
function changelog() {
  try {
    const out = execSync('git log -5 --pretty=format:"%h|%ad|%s" --date=short', {
      encoding: "utf8",
    });
    return out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, date, ...rest] = line.split("|");
        return { hash, date, subject: rest.join("|") };
      });
  } catch {
    return [];
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
  },
});
