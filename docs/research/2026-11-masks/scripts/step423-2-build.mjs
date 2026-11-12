// Child of the step 423 runner: bundles the render entry for node with the app's own esbuild. Prints and exits 0 whatever happens.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
console.log('MADE TO FAIL: the bundle is judged by the render harness, whose planted grey of linear 0.25 must read 137 in every channel (known figure 137)');
console.log('nothing below is trustworthy if the render harness does not read its planted grey as 137');
const S = dirname(fileURLToPath(import.meta.url));
const req = createRequire('/home/user/Jefferson-Photography-Studio/package.json');
const banner = "console.log('MADE TO FAIL: this bundle is the app modules for step 423; the render harness that imports it must read its planted grey of linear 0.25 as 137 (known figure 137)');\n"
  + "console.log('nothing below is trustworthy if the render harness does not read its planted grey as 137');\n";
try {
  const esbuild = req('esbuild');
  esbuild.buildSync({
    entryPoints: [S + '/step423-entry.ts'], bundle: true, platform: 'node', format: 'esm',
    outfile: S + '/step423-bundle.mjs', logLevel: 'warning', absWorkingDir: '/home/user/Jefferson-Photography-Studio',
    banner: { js: banner },
  });
  console.log('bundled to ' + S + '/step423-bundle.mjs');
} catch (e) {
  console.log('bundle failed: ' + (e && e.message ? e.message : e));
}
process.exit(0);
