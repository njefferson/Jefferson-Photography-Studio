// step423-samples.mjs: the samples of the test page's reports of 10 and 11 November, read in place from the session's transcript.
// Takes the transcript's path and a number: 0 lists the messages that carry samples (their order, the California time each was typed,
// the photograph and the count of samples of each count in it); N prints the samples of message N as figures only: the photograph,
// then each sample's name, its place in percent across and down, and its radius in percent of the shorter side. It prints no text of
// any message and writes no file.
import { statSync } from 'node:fs';
import { tailEntries, isOwnerMessage, textOf } from '/root/.claude/hub/transcript-tail.mjs';
import { typedAt } from '/root/.claude/hub/hook-dispatch.mjs';

console.log('MADE TO FAIL: a planted report holding two counts must read as 2 counts, of 3 and 2 samples, on NIR_0001.NEF, the second count first sample at 61.5 across, 20.0 down, radius 4.4 (known figure 61.5)');
console.log('nothing below is trustworthy unless the planted line reads 2 counts, 3 and 2, NIR_0001.NEF, 61.5 20.0 4.4');

const SAMPLE = /(\d+)\. ([^·\n]{1,60}?) at (\d+(?:\.\d+)?) percent across and (\d+(?:\.\d+)?) percent down, radius (\d+(?:\.\d+)?) percent of the shorter side/g;
const COUNT = /([A-Za-z0-9_-]+\.(?:NEF|nef|DNG|dng|JPG|jpg|JPEG|jpeg|TIF|tif|PNG|png))\s*·\s*\d+ samples?/g;

/** Every count in a text: the photograph named nearest before it and its samples, a count starting again where the order returns to 1. */
function counts(text) {
  const names = [...text.matchAll(COUNT)].map((m) => ({ at: m.index, name: m[1] }));
  const sets = [];
  for (const m of text.matchAll(SAMPLE)) {
    const s = { n: Number(m[1]), name: m[2].trim(), x: Number(m[3]), y: Number(m[4]), r: Number(m[5]), at: m.index };
    if (s.n === 1 || !sets.length) {
      const before = names.filter((k) => k.at < s.at).pop();
      sets.push({ photo: before ? before.name : 'no photograph named before it', samples: [] });
    }
    sets[sets.length - 1].samples.push(s);
  }
  return sets;
}

{
  const planted = 'Count of the samples\tNIR_0001.NEF · 3 samples\nThe samples\t1. Sky at 10.0 percent across and 5.0 percent down, radius 4.0 percent of the shorter side, 1,200 counted pixels · 2. Water at 50.0 percent across and 80.0 percent down, radius 4.0 percent of the shorter side, 1,300 counted pixels · 3. Foliage at 70.0 percent across and 60.0 percent down, radius 2.2 percent of the shorter side, 300 counted pixels\n'
    + 'Count of the samples\tNIR_0001.NEF · 2 samples\nThe samples\t1. Sky at 61.5 percent across and 20.0 percent down, radius 4.4 percent of the shorter side, 1,500 counted pixels · 2. Built things at 30.0 percent across and 70.0 percent down, radius 4.4 percent of the shorter side, 1,500 counted pixels';
  const c = counts(planted);
  const s = c[1] ? c[1].samples[0] : { x: 0, y: 0, r: 0 };
  console.log('planted: ' + c.length + ' counts, ' + c.map((k) => k.samples.length).join(' and ') + ', ' + (c[1] ? c[1].photo : 'none') + ', ' + s.x.toFixed(1) + ' ' + s.y.toFixed(1) + ' ' + s.r.toFixed(1));
}

const [path, which] = process.argv.slice(2);
const want = Number(which || 0);
const entries = tailEntries(path, statSync(path).size + 1);
const day = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const clock = (ms) => new Date(ms).toLocaleString('en-GB', { timeZone: 'America/Los_Angeles', hour12: false });
const found = [];
entries.forEach((e, i) => {
  if (!isOwnerMessage(e)) return;
  const t = typedAt(entries, i);
  if (!Number.isFinite(t)) return;
  const d = day(t);
  if (d !== '2026-11-10' && d !== '2026-11-11') return;
  const c = counts(String(textOf(e) || ''));
  if (c.length) found.push({ t, c });
});
console.log('transcript entries read: ' + entries.length.toLocaleString('en-US') + '; messages of 10 and 11 November carrying samples: ' + found.length);
if (want === 0) {
  found.forEach((f, k) => console.log((k + 1) + '. typed ' + clock(f.t) + ' California: ' + f.c.map((s) => s.photo + ' with ' + s.samples.length + ' samples').join('; ')));
} else {
  const f = found[want - 1];
  if (!f) console.log('no message ' + want);
  else {
    console.log('message ' + want + ', typed ' + clock(f.t) + ' California');
    f.c.forEach((s, k) => {
      console.log('count ' + (k + 1) + ': ' + s.photo + ', ' + s.samples.length + ' samples');
      for (const p of s.samples) console.log('  ' + p.n + '. ' + p.name + ' | ' + p.x.toFixed(1) + ' | ' + p.y.toFixed(1) + ' | ' + p.r.toFixed(1));
    });
  }
}
process.exit(0);
