// step425 fetcher: takes one label, holds its addresses inside itself, asks each once with curl through the session's own network,
// follows a redirect and prints where it led, writes the body as returned and a copy with the markup taken out under research/whole/pages-editors. Exits 0 whatever it finds.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs';

console.log('MADE TO FAIL: the planted file below holds 5 bytes and the instrument must report 5');
console.log('MADE TO FAIL: a planted html holding alpha beta in a paragraph and script text must come out as alpha beta with 10 characters');
console.log('nothing below is trustworthy unless the plant read 5, the html plant read alpha beta and the planted address failed');

const label = process.argv[2] || 'none';
const outDir = '/tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad/research/whole/pages-editors';
mkdirSync(outDir, { recursive: true });

const GROUPS = {
  first: [
    'https://helpx.adobe.com/lightroom-classic/help/masking.html',
    'https://helpx.adobe.com/lightroom-classic/help/lightroom-classic-whats-new.html',
    'https://support.captureone.com/hc/en-us',
    'https://docs.darktable.org/usermanual/development/en/darkroom/masking-and-blending/masks/',
    'https://arxiv.org/abs/2304.02643',
    'https://en.wikipedia.org/wiki/Jaccard_index'
  ],
  paper: [
    'https://arxiv.org/pdf/2304.02643'
  ],
  second: [
    'https://docs.darktable.org/usermanual/development/en/darkroom/masking-and-blending/masks/ai-masking/',
    'https://docs.darktable.org/usermanual/development/en/darkroom/masking-and-blending/masks/overview/',
    'https://en.wikipedia.org/wiki/S%C3%B8rensen%E2%80%93Dice_coefficient',
    'https://helpx.adobe.com/lightroom-cc/help/masking.html',
    'https://helpx.adobe.com/lightroom-classic/help/copy-paste-develop-settings.html'
  ],
  third: [
    'https://docs.darktable.org/usermanual/development/en/darkroom/masking-and-blending/masks/drawn/',
    'https://docs.darktable.org/usermanual/development/en/special-topics/ai/overview/',
    'https://docs.darktable.org/usermanual/development/en/special-topics/ai/how-ai-works/'
  ],
  fourth: []
};

function decode(s) {
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#8217;/g, "'").replace(/&#8220;/g, '"').replace(/&#8221;/g, '"').replace(/&#8211;/g, '-').replace(/&#8212;/g, '-').replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)));
}
function textOf(html) {
  let h = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<nav[\s\S]*?<\/nav>/gi, ' ');
  h = h.replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|pre|dt|dd)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n');
  h = h.replace(/<[^>]+>/g, ' ');
  h = decode(h).replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n');
  return h.trim();
}

const plantPath = outDir + '/plant-' + label + '.txt';
writeFileSync(plantPath, 'hello');
console.log('plant bytes read: ' + statSync(plantPath).size);
const planted = textOf('<p>alpha</p><script>planted script text</script><p>beta</p>').replace(/\s+/g, ' ');
console.log('html plant came out as [' + planted + '] with ' + planted.length + ' characters');

function fetchOne(url, file) {
  const r = spawnSync('curl', ['-sS', '-L', '--max-time', '120', '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36', '-o', file, '-w', '%{http_code} %{size_download} %{url_effective}', url], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim().split('\n')[0] };
}

const pl = fetchOne('https://plant.invalid/none', outDir + '/plant-fail-' + label + '.html');
console.log('plant address result: exit ' + pl.code + ' out [' + pl.out + '] err [' + pl.err + ']');

const urls = GROUPS[label] || [];
console.log('label ' + label + ' holds ' + urls.length + ' addresses');
let n = 0;
for (const u of urls) {
  n += 1;
  const base = outDir + '/' + label + '-' + String(n).padStart(2, '0');
  const isPdf = /\/pdf\//.test(u) || /\.pdf$/i.test(u);
  const r = fetchOne(u, base + (isPdf ? '.pdf' : '.html'));
  let chars = 0;
  let title = 'none';
  let first = '';
  if (isPdf) {
    console.log('FETCH ' + label + '-' + String(n).padStart(2, '0') + ' exit ' + r.code + ' [' + r.out + '] kept as a document file ' + u + (r.err ? ' ERR ' + r.err : ''));
    continue;
  }
  try {
    const html = readFileSync(base + '.html', 'utf8');
    const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    title = t ? decode(t[1]).replace(/\s+/g, ' ').trim() : 'no title';
    const body = textOf(html);
    chars = body.length;
    first = body.split('\n')[0].slice(0, 120);
    writeFileSync(base + '.txt', 'ADDRESS: ' + u + '\nTITLE: ' + title + '\n\n' + body + '\n');
  } catch (e) {
    title = 'unreadable';
  }
  console.log('FETCH ' + label + '-' + String(n).padStart(2, '0') + ' exit ' + r.code + ' [' + r.out + '] chars ' + chars + ' title [' + title + '] first [' + first + '] ' + u + (r.err ? ' ERR ' + r.err : ''));
}
console.log('fetched ' + n + ' addresses');
process.exit(0);
