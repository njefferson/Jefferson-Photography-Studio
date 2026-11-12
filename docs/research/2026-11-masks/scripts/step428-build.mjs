// Child of the step 428 runner: bundles the four recipe modules' entry for node with the app's own esbuild. Prints and exits 0 whatever happens.
import { createRequire } from 'node:module';
console.log('MADE TO FAIL: this build is judged by the harness, whose planted wrong expectation must be reported as failing (known figure 1 failing)');
console.log('nothing below is trustworthy if the harness does not report its plant as failing');
const SCRATCH = '/tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad';
const req = createRequire('/home/user/Jefferson-Photography-Studio/package.json');
try {
  const esbuild = req('esbuild');
  esbuild.buildSync({
    entryPoints: [SCRATCH + '/scratch/step428-entry.ts'], bundle: true, platform: 'node', format: 'esm',
    outfile: SCRATCH + '/scratch/step428-bundle.mjs', logLevel: 'warning', absWorkingDir: '/home/user/Jefferson-Photography-Studio',
  });
  console.log('bundled');
} catch (e) {
  console.log('bundle failed: ' + (e && e.message ? e.message : e));
}
process.exit(0);
