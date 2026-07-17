import { defineConfig, type Plugin } from "vite";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
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

/** Internal housekeeping commits (planning notes, docs, CI) are real history
 *  but not user-facing changes — they must not read as "What's new". */
const INTERNAL_SUBJECT = /^(Roadmap|Notes|Docs|Internal|Chore):/i;

/** The last `want` USER-FACING commits (internal subjects filtered out), each
 *  with its real version number. Shared by the in-app changelog and the public
 *  notes.html page. Reads extra history so the filter can't starve the list. */
function filteredLog(want: number) {
  try {
    const base = versionBase();
    const baseCommit = versionCommit();
    const out = git(`git log -${want * 2 + 10} --pretty=format:"%h|%H|%ad|%s" --date=short`);
    return out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, full, date, ...rest] = line.split("|");
        return { hash, date, subject: rest.join("|"), version: versionFor(full, base, baseCommit) };
      })
      .filter((c) => !INTERNAL_SUBJECT.test(c.subject))
      .slice(0, want);
  } catch {
    return [];
  }
}

/** Last 5 user-facing commits, injected at build time so every deploy carries
 *  its own changelog (surfaced behind the ⓘ button in the app header). */
function changelog() {
  return filteredLog(5);
}

/** Checkbox bullets under a `## ` heading of NOTES.md. Each `- [ ]`/`- [x]`
 *  bullet becomes one item; the shown title is the full **bold span** when the
 *  item leads with one (so an inner em-dash survives), else text before " — ",
 *  stripped of markdown emphasis. */
function checklist(headingRe: RegExp) {
  try {
    const notes = readFileSync(new URL("./NOTES.md", import.meta.url), "utf8");
    const lines = notes.split("\n");
    const start = lines.findIndex((l) => headingRe.test(l));
    if (start < 0) return [];
    const items: { done: boolean; title: string }[] = [];
    for (let i = start + 1; i < lines.length; i++) {
      if (/^##\s/.test(lines[i])) break; // stop at the next section heading
      const m = lines[i].match(/^-\s+\[([ xX])\]\s+(.+)$/);
      if (!m) continue;
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

/** The in-app Roadmap: the OPEN queue of the "Next capability release" section
 *  (its source-of-truth note explains the format). Shipped items live in the
 *  "## Shipped (roadmap archive)" section, rendered only on notes.html. */
function roadmap() {
  return checklist(/^##\s+Next capability release/i);
}

function appVersion() {
  try {
    return versionFor(git("git rev-parse HEAD"), versionBase(), versionCommit());
  } catch {
    return versionBase() || "dev";
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Emit `dist/notes.html` — the PUBLIC "What's new & roadmap" page the ⓘ
 *  dialog's "More" links point at (the repo is private, so GitHub links 404
 *  for everyone; this page is the shareable home for update history). All
 *  content is build-time-derived: the filtered git log plus the two NOTES.md
 *  checklist sections. MUST be listed before precacheManifest() in `plugins`
 *  so the file is on disk when the precache manifest walks dist (guaranteed
 *  anyway by that plugin's enforce:"post", but keep the order honest). */
function notesPage(): Plugin {
  return {
    name: "notes-page",
    apply: "build",
    closeBundle() {
      const version = appVersion();
      const log = filteredLog(50);
      const coming = checklist(/^##\s+Next capability release/i).filter((i) => !i.done);
      const shipped = checklist(/^##\s+Shipped \(roadmap archive\)/i)
        .filter((i) => i.done)
        .reverse() // NOTES keeps newest last; readers want newest first
        .slice(0, 12);
      const li = (s: string) => `      <li>${s}</li>`;
      const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#0b0c0f" />
    <meta name="description" content="What's new in Photography Studio — release notes and what's coming next. Free, on-device photo tools." />
    <link rel="icon" type="image/png" sizes="192x192" href="./icons/icon-192-light.png" />
    <title>What's new — Photography Studio</title>
    <style>
      :root { --bg: #0b0c0f; --bg-2: #0f1014; --txt: #eef0f3; --txt-2: #a3a7b2; --txt-3: #9095a1; --line: rgba(255,255,255,0.09); --accent: #6ea0ff; }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 2rem 1.2rem 4rem; background: radial-gradient(120% 90% at 50% 0%, var(--bg-2), var(--bg)); min-height: 100vh; color: var(--txt); font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
      main { max-width: 620px; margin: 0 auto; }
      a { color: var(--accent); text-decoration: none; }
      a:hover { text-decoration: underline; }
      h1 { font-size: 1.6rem; margin: 0.4rem 0 0.2rem; letter-spacing: -0.02em; }
      h2 { font-size: 1.05rem; margin: 2.2rem 0 0.6rem; padding-top: 1.2rem; border-top: 1px solid var(--line); }
      .ver { color: var(--txt-2); font-size: 0.9rem; margin: 0 0 1.6rem; }
      ul { list-style: none; margin: 0; padding: 0; }
      li { padding: 0.45rem 0; border-bottom: 1px solid var(--line); color: var(--txt); }
      li small { display: block; color: var(--txt-3); font-variant-numeric: tabular-nums; }
      li.coming::before { content: "→ "; color: var(--accent); }
      li.shipped::before { content: "✓ "; color: var(--txt-3); }
      footer { margin-top: 2.6rem; color: var(--txt-3); font-size: 0.85rem; }
    </style>
  </head>
  <body>
    <main>
      <a href="./index.html">&#8249; Studio</a>
      <h1>What's new</h1>
      <p class="ver">Photography Studio — currently version ${esc(version)}. Free, on-device photo tools: nothing you open ever leaves your device.</p>
      <ul>
${log.map((c) => li(`${esc(c.subject)}<small>v${esc(c.version)} · ${esc(c.date)}</small>`)).join("\n")}
      </ul>
      <h2 id="roadmap">Coming next</h2>
      <ul>
${coming.map((i) => li(`<span class="coming-t">${esc(i.title)}</span>`)).join("\n").replace(/<li>/g, '<li class="coming">')}
      </ul>
      <h2>Recently shipped</h2>
      <ul>
${shipped.map((i) => li(esc(i.title))).join("\n").replace(/<li>/g, '<li class="shipped">')}
      </ul>
      <footer><a href="./index.html">Open the Studio</a> · <a href="./privacy.html">Privacy — everything stays on your device</a></footer>
    </main>
  </body>
</html>
`;
      writeFileSync(resolve(__dirname, "dist", "notes.html"), html);
    },
  };
}

/** Inject the built app-shell file list into the service worker so a new
 *  release precaches itself at install time and works offline immediately
 *  (see public/sw.js). Runs in `closeBundle`, after Vite has copied publicDir
 *  into dist, so it sees BOTH the hashed bundles and the static shell (fonts,
 *  icons, manifests). Excludes the huge practice-photo `examples/` tree and
 *  sourcemaps — examples load on demand into their own version-stable cache. */
function precacheManifest(): Plugin {
  return {
    name: "precache-manifest",
    apply: "build",
    enforce: "post",
    closeBundle() {
      const dist = resolve(__dirname, "dist");
      const swPath = resolve(dist, "sw.js");
      const rel = (readdirSync(dist, { recursive: true, encoding: "utf8" }) as string[]).map((p) =>
        p.split("\\").join("/"),
      );
      const shell = rel
        .filter((p) => !p.startsWith("examples/")) // practice photos: on-demand, own cache
        .filter((p) => p !== "sw.js" && !p.endsWith(".map"))
        .filter((p) => statSync(resolve(dist, p)).isFile()) // drop directory entries
        .map((p) => "./" + p);
      // The chooser PWA launches at "./" (start_url in manifest.webmanifest), so
      // cache the root route too — "./index.html" answers "/index.html" but not "/".
      if (shell.includes("./index.html")) shell.unshift("./");
      const list = JSON.stringify([...new Set(shell)]);
      const sw = readFileSync(swPath, "utf8");
      const out = sw.replace("[/* __PRECACHE_MANIFEST__ */]", list);
      // Fail the build loudly — a shipped-but-unpopulated SW would silently
      // reintroduce the offline blackout this plugin exists to prevent.
      if (out === sw) throw new Error("precache-manifest: placeholder not found in dist/sw.js");
      writeFileSync(swPath, out);
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [notesPage(), precacheManifest()],
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
        privacy: resolve(__dirname, "privacy.html"),
      },
    },
  },
  define: {
    __CHANGELOG__: JSON.stringify(changelog()),
    __ROADMAP__: JSON.stringify(roadmap()),
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
});
