import { defineConfig } from "vite";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

/** The in-app Roadmap, parsed from the "Next capability release" section of
 *  NOTES.md so that section stays the single source of truth (see the note at
 *  the top of it). Each `- [ ]`/`- [x]` bullet becomes one item; the shown
 *  title is the text up to the first " — ", stripped of markdown emphasis. */
function roadmap() {
  try {
    const notes = readFileSync(new URL("./NOTES.md", import.meta.url), "utf8");
    const lines = notes.split("\n");
    const start = lines.findIndex((l) => /^##\s+Next capability release/i.test(l));
    if (start < 0) return [];
    const items: { done: boolean; title: string }[] = [];
    for (let i = start + 1; i < lines.length; i++) {
      if (/^##\s/.test(lines[i])) break; // stop at the next section heading
      const m = lines[i].match(/^-\s+\[([ xX])\]\s+(.+)$/);
      if (!m) continue;
      // Title = the full **bold span** when the item leads with one (so an
      // em-dash INSIDE the title survives); otherwise text before " — ".
      const bold = m[2].match(/^\*\*(.+?)\*\*/);
      const title = (bold ? bold[1] : m[2].split(" — ")[0])
        .replace(/\*\*|`|_/g, "") // drop markdown emphasis
        .trim();
      if (title) items.push({ done: m[1].toLowerCase() === "x", title });
    }
    return items;
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
    rollupOptions: {
      // Three route entries. Each HTML pulls only its own bundle, so the IR
      // editor never loads the macro engine and vice-versa (route-based code
      // splitting). Cloudflare Pages serves `ir.html` at `/ir`, `macro.html`
      // at `/macro`; `index.html` is the two-door chooser.
      input: {
        chooser: resolve(__dirname, "index.html"),
        ir: resolve(__dirname, "ir.html"),
        macro: resolve(__dirname, "macro.html"),
      },
    },
  },
  define: {
    __CHANGELOG__: JSON.stringify(changelog()),
    __ROADMAP__: JSON.stringify(roadmap()),
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
});
