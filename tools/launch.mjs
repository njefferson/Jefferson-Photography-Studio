#!/usr/bin/env node
// ONE LAUNCH MODULE FOR THE PICTURE WALKS (record 107).
//
//   node tools/launch.mjs --serve=8131      a static server over dist, for one walk run by hand
//   node tools/walk-all.mjs                 starts and stops that server itself
//
// WHAT IT HOLDS. Everything the walks used to repeat, so that a machine is named in
// one place: the browser for this machine, the launch flags, the playwright-core
// import (resolved from this checkout's own node_modules, never by an absolute path),
// a static server over `dist` that it starts and stops through its own child handle,
// the Playwright version the machine installs with `npx playwright install`, and the
// renderer check.
//
// THE BROWSER AND THE FLAGS. On Windows the browser is the one Playwright installed
// and found, named by no path, headed, with no flag that names a software renderer, so
// the chip is left to the browser's own default. Everywhere else it is the one
// executable this container has, with the flags the walks passed before this module
// existed, unchanged, so the walks that run in the container run as they did.
//
// THE RENDERER CHECK. A working WebGL context is no proof of a chip. The picture walks
// read the drawn picture, and the container draws through a software renderer, which is
// neither the chip nor the browser a reader uses. So a picture walk declares itself to
// this module as its first act, the module reads the unmasked renderer string in a page
// it opens, prints it as the walk's first output line, and refuses SwiftShader, WARP,
// llvmpipe and the other software names, printing the name and exiting non-zero before
// the walk asserts anything. A run that fell back to software can print no verdict.
// There is no switch that turns the refusal off.
//
// WHAT IT DOES NOT DO. It changes no walk's assertion, bar or plant flag, and it is no
// proof for the iPad: Playwright's WebKit is not the iPad's Safari on an Apple chip.
import { createServer } from "node:http";
import { createReadStream, statSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join, extname, normalize, basename, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { REPO_ROOT } from "./fresh-dist.mjs";

export { REPO_ROOT };

/** THE PLAYWRIGHT VERSION A MACHINE INSTALLS WITH `npx playwright install`.
 *  The version the sweep of 31 October ran, written once, because the lockfile does not name the harness's packages. */
export const PLAYWRIGHT_VERSION = "1.56.1";

/** THE ONE BROWSER EXECUTABLE THIS CONTAINER HAS, used on every platform but Windows. */
const CONTAINER_BROWSER = "/opt/pw-browsers/chromium";

/** THE FLAGS THE WALKS PASSED BEFORE THIS MODULE, used on every platform but Windows. */
const CONTAINER_FLAGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"];

/** THE TWENTY-ONE WALKS THAT READ THE DRAWN PICTURE (the app's CLAUDE.md, "Which walks run where").
 *  Each one declares itself through `declarePictureWalk`, which refuses a name that is not in this list, and
 *  `walk-all.mjs` skips exactly these on a software renderer. */
export const PICTURE_WALKS = [
  "aerochrome-walk.mjs", "aim-walk.mjs", "camera-jpeg-sky-walk.mjs", "conversion-walk.mjs",
  "double-tap-walk.mjs", "fix-brush-walk.mjs", "fullview-mask-walk.mjs", "grade-controls-walk.mjs",
  "heal-source-walk.mjs", "lens-order-walk.mjs", "look-roundtrip-walk.mjs", "mask-fix-walk.mjs",
  "mask-slots-walk.mjs", "mask-truth-walk.mjs", "opens-as-shot-walk.mjs", "quicklook-speed-walk.mjs",
  "rotation-walk.mjs", "sky-stage-walk.mjs", "slider-own-value-walk.mjs", "straighten-line-walk.mjs",
  "temperature-walk.mjs",
];

/** THE SOFTWARE RENDERERS BY NAME, each with the pattern that finds it in a renderer string. */
const SOFTWARE = [
  ["SwiftShader", /swiftshader/i],
  ["WARP", /\bwarp\b|basic render/i],
  ["llvmpipe", /llvmpipe/i],
  ["softpipe", /softpipe/i],
  ["a software rasteriser", /software/i],
];

/** WHAT LAUNCH OPTIONS THIS MACHINE GETS.
 *
 *  Takes `options`: `software` (default true) says whether the container's software flags are passed on a
 *  non-Windows machine (three walks never passed them and pass false), and `args` (default none) are extra
 *  flags a walk needs of its own. Returns the object `chromium.launch` takes: on Windows `{ headless: false, args }`
 *  with no executable and no software flag; elsewhere `{ executablePath, args }` with the container's browser.
 *
 *  What the caller relies on: no value returned for Windows names a software renderer, so a chip is never pinned
 *  off by this module. */
export function launchOptions(options = {}) {
  const { software = true, args = [] } = options;
  if (process.platform === "win32") return { headless: false, args: [...args] };
  return { executablePath: CONTAINER_BROWSER, args: [...(software ? CONTAINER_FLAGS : []), ...args] };
}

/** OPEN THE BROWSER THIS MACHINE USES.
 *
 *  Takes `options`, as `launchOptions` does. Returns a promise of a Playwright Chromium browser, which the caller
 *  closes. `playwright-core` is imported here, from this checkout's own node_modules, so no walk names a path to it.
 *
 *  What the caller relies on: it makes no renderer check; a picture walk has made its own through
 *  `declarePictureWalk` before it calls this. */
export async function launchBrowser(options = {}) {
  const { chromium } = await import("playwright-core");
  return chromium.launch(launchOptions(options));
}

/** READ THE UNMASKED RENDERER STRING OF THIS MACHINE.
 *
 *  Takes `options`, as `launchOptions` does. Opens a browser, opens a blank page, asks for a WebGL context and
 *  reads the unmasked renderer string, closes the browser in every case, and returns a promise of
 *  `{ renderer, software }`: `renderer` is the string (or the words "no WebGL context") and `software` is the
 *  name of the software renderer it is (SwiftShader, WARP, llvmpipe and the others) or an empty string for a chip.
 *
 *  What the caller relies on: `software` is empty only when a context was made and its string names no software
 *  renderer, so an empty value is the only one a picture walk may run on. */
export async function readRenderer(options = {}) {
  const browser = await launchBrowser(options);
  try {
    const page = await browser.newPage();
    const renderer = await page.evaluate(() => {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") || c.getContext("webgl");
      if (!gl) return "";
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    });
    if (!renderer) return { renderer: "no WebGL context", software: "no graphics context" };
    const hit = SOFTWARE.find(([, re]) => re.test(renderer));
    return { renderer, software: hit ? hit[0] : "" };
  } finally {
    await browser.close();
  }
}

/** A PICTURE WALK DECLARES ITSELF, AND IS REFUSED ON SOFTWARE.
 *
 *  Takes `walkUrl`, the walk's own `import.meta.url`, and `options`, as `launchOptions` does. Checks that the
 *  walk's file name is in `PICTURE_WALKS`, reads the renderer, prints `renderer: <string>` as a line of output,
 *  and returns a promise of `{ renderer, software }` for a chip. For a name not in the list, or for a software
 *  renderer, it prints the name that refused it and exits the process with code 2, before the walk asserts anything.
 *
 *  What the caller relies on: this is called at the top of the walk, straight after its imports, so the renderer
 *  line is the walk's first output; and it never returns for a software renderer, so no verdict is printed on one. */
export async function declarePictureWalk(walkUrl, options = {}) {
  const name = basename(fileURLToPath(walkUrl));
  if (!PICTURE_WALKS.includes(name)) {
    console.error(`${name} declared itself a picture walk and is not in PICTURE_WALKS in tools/launch.mjs.`);
    process.exit(2);
  }
  const r = await readRenderer(options);
  console.log(`renderer: ${r.renderer}`);
  if (r.software) {
    console.error(`REFUSED: ${name} reads the drawn picture and this machine draws through ${r.software}, which is neither a graphics chip nor the browser a reader uses. No verdict is printed. Run it on a machine with a graphics chip.`);
    process.exit(2);
  }
  return r;
}

/** A FOLDER FOR A WALK'S OWN FILES, in this machine's temporary folder.
 *
 *  Takes `name`, the folder's name. Makes the folder if it is not there and returns its path.
 *
 *  What the caller relies on: the folder exists when this returns, so a walk writes into it without its own mkdir. */
export function outDir(name) {
  const p = join(tmpdir(), name);
  mkdirSync(p, { recursive: true });
  return p;
}

/** DOES NOTHING ANSWER ON THIS PORT?
 *
 *  Takes `port`, a number. Returns a promise of true when a connection to 127.0.0.1 on it is refused and false when
 *  something accepts it. What the caller relies on: it is the confirmation that a server has stopped, read from the
 *  port and never from the process table. */
export function portClosed(port) {
  return new Promise((res) => {
    const s = connect({ port: Number(port), host: "127.0.0.1" });
    s.once("connect", () => { s.destroy(); res(false); });
    s.once("error", () => res(true));
  });
}

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".ico": "image/x-icon", ".wasm": "application/wasm", ".txt": "text/plain", ".cube": "text/plain",
  ".map": "application/json", ".woff": "font/woff", ".woff2": "font/woff2", ".xml": "application/xml",
};

// The server a child process runs: dist, read only, on 127.0.0.1, until it is killed.
function serveDist(port) {
  const root = join(REPO_ROOT, "dist");
  createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400).end(); return; }
    const file = join(root, normalize(p));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    let target = file;
    try { if (statSync(target).isDirectory()) target = join(target, "index.html"); statSync(target); } catch { res.writeHead(404).end("not found"); return; }
    const st = statSync(target);
    res.writeHead(200, { "Content-Type": TYPES[extname(target).toLowerCase()] || "application/octet-stream", "Content-Length": st.size, "Last-Modified": st.mtime.toUTCString() });
    if (req.method === "HEAD") { res.end(); return; }
    createReadStream(target).pipe(res);
  }).listen(Number(port), "127.0.0.1");
}

/** START A STATIC SERVER OVER `dist`, AS A CHILD OF THIS PROCESS.
 *
 *  Takes `port`, a number nothing answers on yet. Starts this module in a child process with `--serve=<port>`, waits
 *  until the build's `ir.html` is served on it, and returns a promise of `{ port, stop }`. `stop()` kills the child
 *  by its own handle, waits for the port to stop answering (at most ten seconds) and returns a promise of true when
 *  the port is confirmed closed. It throws if the port is already answering or the server never answers.
 *
 *  What the caller relies on: nothing is stopped by name or pattern, the child is also killed when this process
 *  exits, and a true from `stop()` is read off the port. */
export async function startServer(port) {
  if (!(await portClosed(port))) throw new Error(`something already answers on :${port}`);
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), `--serve=${port}`], { stdio: "ignore" });
  const kill = () => { try { child.kill(); } catch { /* already gone */ } };
  process.once("exit", kill);
  let up = false;
  for (let i = 0; i < 100 && !up; i++) {
    up = await fetch(`http://127.0.0.1:${port}/ir.html`).then((r) => r.ok).catch(() => false);
    if (!up) await new Promise((r) => setTimeout(r, 100));
  }
  if (!up) { kill(); throw new Error(`the server never answered on :${port}`); }
  return {
    port,
    stop: async () => {
      kill();
      for (let i = 0; i < 100; i++) {
        if (await portClosed(port)) return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    },
  };
}

// Run directly: serve dist on the port asked for, until killed.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const a = process.argv.find((x) => x.startsWith("--serve="));
  if (a) serveDist(a.split("=")[1]);
  else console.log("node tools/launch.mjs --serve=8131   serves dist; the walks import this file for their browser, flags, server and renderer check");
}
