import { defineConfig } from "vite";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Offline-first PWA, no framework. Relative base so it runs from any path
// (incl. "Add to Home Screen" on the iPad).

function git(cmd: string): string {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

/** Declared version base from the VERSION file ("1.0"), or "" before it
 *  existed. Tags would be the usual tool, but this environment's git remote
 *  refuses tag pushes — a versioned file works everywhere. */
function versionBase(): string {
  try {
    return readFileSync(new URL("./VERSION", import.meta.url), "utf8").trim();
  } catch {
    return "";
  }
}

/** The commit that last changed VERSION (i.e. where the current base was
 *  declared), or "" if VERSION doesn't exist in history. */
function versionCommit(): string {
  try {
    return git("git log -1 --format=%H -- VERSION");
  } catch {
    return "";
  }
}

/** Version for one commit:
 *  - pre-VERSION history: 0.N (N = update sequence number = commit count);
 *  - the commit that declared the base: the base itself ("1.0");
 *  - commits after it: base.M (M = updates since the declaration) — automatic
 *    point releases: 1.0.1, 1.0.2, ... until VERSION is bumped again. */
function versionFor(fullHash: string, base: string, baseCommit: string): string {
  if (base && baseCommit) {
    if (fullHash === baseCommit) return base;
    try {
      const since = Number(git(`git rev-list --count ${baseCommit}..${fullHash}`));
      if (since > 0) return `${base}.${since}`;
    } catch {
      /* fall through to the 0.N scheme */
    }
  }
  return `0.${git(`git rev-list --count ${fullHash}`)}`;
}

/** Last 5 commits, injected at build time so every deploy carries its own
 *  changelog (surfaced behind the ⓘ button in the app header), each with its
 *  real version number. */
function changelog() {
  try {
    const base = versionBase();
    const baseCommit = versionCommit();
    const out = git('git log -5 --pretty=format:"%h|%H|%ad|%s" --date=short');
    return out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, full, date, ...rest] = line.split("|");
        return { hash, date, subject: rest.join("|"), version: versionFor(full, base, baseCommit) };
      });
  } catch {
    return [];
  }
}

function appVersion() {
  try {
    return versionFor(git("git rev-parse HEAD"), versionBase(), versionCommit());
  } catch {
    return versionBase() || "dev";
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
