#!/usr/bin/env node
// A HEX IDENTIFIER THIS SESSION NEVER READ IS REFUSED BEFORE IT REACHES A TOOL.
//
// A `PreToolUse` hook on every tool. It serialises the tool INPUT, pulls out
// every hex run of seven characters or more, and refuses the call when any of
// them does not appear in this session's ledger — the record of tool RESULTS
// written by `ledger.mjs` beside it. The two are wired together or neither is:
// this file without that one refuses everything, and that one without this
// refuses nothing.
//
// ## WHAT HAPPENED
//
// A merge guard was handed a 40-character commit SHA. Seven of those
// characters were real, read out of `git rev-parse --short`; the other
// thirty-three were generated to look like the rest. GitHub's 409 "Head branch
// was modified" was the only thing that caught it, and it caught it after the
// call had gone out.
//
// **There was no internal moment of "I do not have this."** Completing a
// partially-known value is indistinguishable, from the inside, from recalling
// it. This is not a lapse of care that more care would prevent — the same
// machinery produces the seven real characters and the thirty-three invented
// ones, with the same confidence, and nothing marks the seam. So no rule in a
// file can catch it: a rule is read by the part of the process that already
// believes it has the value.
//
// A commit-time gate cannot catch it either, and this is the load-bearing
// reason the check lives here. The fabrication and its use happen inside ONE
// tool call. By the time anything is committed the call has already been made.
// The only place to stand is between the model and the tool.
//
// ## THE PREFIX DIRECTION — WHICH WAY THIS IS IMPLEMENTED, AND WHY
//
// The rule is: **a token passes only when the token ITSELF is a substring of
// the ledger.** The test is `ledger.includes(token)` and never the reverse.
//
// That single rule is deliberately asymmetric, and the asymmetry is the whole
// gate:
//
//   - SHORTENING PASSES. The ledger holds a full 40-character SHA read from
//     `git log`; the input uses its first seven. `includes` is true, so it is
//     allowed — correctly, because a value cannot be shortened unless it was
//     held in full first. A prefix of something in the ledger is a value this
//     session read.
//
//   - LENGTHENING REFUSES. The ledger holds only a seven-character short SHA
//     read from `git rev-parse --short`; the input carries forty. `includes`
//     is false, so it is refused — and this is the defect, exactly, character
//     for character. Thirty-three of those forty characters exist nowhere in
//     anything this session has seen.
//
// The rejected alternative was to ask whether some ledger entry is a PREFIX of
// the token, which reads like the same idea and is its exact inverse. Under
// that rule the incident passes: seven real characters at the front, thirty-
// three invented behind them, waved through. It is worth writing down because
// it is the version somebody reaches for when this gate refuses honest work
// and the fix looks like "well, we did read the start of it". Reading the
// start of a SHA is not knowing the SHA. If the full form is needed, the full
// form gets read — `git rev-parse HEAD` prints forty.
//
// ## ONLY HEX RUNS OF SEVEN OR MORE. NOT PATHS, NOT VERSIONS, NOT LINE NUMBERS
//
// A `Write` to a new file names a path that by definition has never appeared
// in any output, so a rule over paths would refuse correct work on its first
// run — and a gate that refuses correct work is one somebody switches off
// within a day, which leaves no gate at all. Same for a version string, a line
// number, a port. The class this gate is for is the opaque identifier: a SHA,
// a blob id, an object hash — a value with no internal structure, which cannot
// be derived and can only be READ, and which is therefore the one class where
// producing a plausible-looking value is both easy and always wrong.
//
// Narrow by measurement. Widen later, on a measured miss, or never.
//
// ## THE ENGLISH WORDS ARE A LIST, NOT A PATTERN
//
// Some English words are spelled entirely out of a-f. No pattern separates
// them from a hex identifier, because there is nothing to separate — they are
// the same string. So they are a declared list, for the same reason
// `.quote-allow` and `.copy-allow` in this family are lists: three pattern
// rules were measured against real violations there and flagged honest prose
// by the hundred, because ordinary speech and the thing being banned have the
// same shape.
//
// MEASURED while writing this, which shortened the list considerably: the
// seven-character floor already excludes most of them. `decade`, `facade`,
// `deface`, `efface`, `added`, `beaded`, `accede`, `bedded`, `dabbed` and
// `faced` are all six characters or fewer and are never matched at all.
// `cabbage` is not hex — the `g`. What is genuinely left is short, and it is
// below.
//
// `deadbeef` and `cafebabe` are deliberately NOT on it. They are magic
// constants, not English, and a fabricated one is exactly the thing being
// refused; a real one read out of a hexdump is in the ledger and passes on the
// ordinary rule.
//
// ## A MISSING LEDGER IS A REFUSAL, NOT A SKIP
//
// An absent gate that looks like a passing one is the failure every guard in
// this repository was written against. If there are tokens to check and no
// ledger to check them against, this refuses and says the ledger is missing.
//
// But it refuses only when there is something to check. A call whose input
// carries no hex token at all is allowed through with no ledger, because the
// ledger's absence tells you nothing about a call that had no identifier in
// it — and because the alternative is that the FIRST tool call of every
// session is refused, before `ledger.mjs` has ever had a chance to run. That
// is the "switched off within a day" failure again, and it would arrive on day
// one.
//
// ## IT FAILS OPEN ON ITS OWN MALFUNCTION, AND THE ASYMMETRY IS DELIBERATE
//
// A missing ledger is a refusal. A crash in THIS FILE is an exit 0 and a line
// on stderr. Those look inconsistent and they are not, because the two
// failures cost different things:
//
//   - A missing ledger refuses one class of call. The session can still read,
//     still write, still report, still say what happened.
//   - A crash here is a `PreToolUse` hook on `.*`. It blocks EVERY tool call
//     in the session, including the ones that would diagnose or repair it.
//     There is no way out from inside a session that cannot call a tool — not
//     to edit this file, not to remove the wiring, not to look at the error.
//
// Unrecoverable-from-inside is the deciding property, not severity. This is
// the same reading `harness-guard.sh` makes for itself and the opposite of the
// one `plan-guard.sh` makes, and in each case the question was which failure
// leaves somebody able to act.
//
// ## TWO LEDGERS, THE CALLING THREAD'S OWN FIRST
//
// `ledger.mjs` records every result twice: in a file shared by every thread of
// the session and in a file for the thread that made the call (`main`, or
// `agent-<id>` from the `agent_id` the payload carries). This checks the
// calling thread's own file first and the shared one for what is still missing.
// With the shared file alone, a status print, a review's reads or a sibling
// agent's listing pushed a thread's own print off the front of the cap and an
// honest value was refused (Q-JPS-20, Q-JPS-143). A value no thread printed is
// in neither file and is still refused. The rejected alternative was reading
// the thread's transcript when the ledger misses: it parses many megabytes for
// one lookup, depends on the transcript's layout, and holds the session's own
// words beside the tool results, which would let a value the session produced
// vouch for itself.
//
// ## A PATH THE HARNESS WROTE
//
// The harness saves a long result, and a hook's output, in a file under
// `<transcript folder>/<session id>/tool-results/`, and the next call names
// that file to read it. The file's name carries a run of hex characters this
// session never typed or printed, so the call was refused (Q-JPS-144,
// Q-JPS-145). A path passes when it begins with that folder, is made of plain
// name characters with no `.` or `..` segment, and the file is there on disk.
// The folder comes from the payload's own `session_id` and `transcript_path`,
// the second form covering a subagent whose transcript sits beneath the
// session's folder. A path under any other folder, a path that leaves the
// folder, a file that is not there and a hex run beside the path in the same
// call are all still held to the ledgers.
//
// ## A FIGURE IN EXPONENT FORM
//
// Digits, then `e` or `E`, then one to three digits (or a sign and one to three
// digits) is a number and not an identifier, the same reading as a run of
// decimal digits alone (Q-JPS-146). The exponent is bounded at three digits
// because a number does not need more and a longer tail reads as a hex run. A
// hex run that happens to be digits around a single `e` passes as a number: for
// a 7-character short form that is roughly one in a hundred, and it falls with
// every added character.
//
// ## WHAT IT CANNOT SEE
//
//   - A value the owner typed in chat. It was read by a person, not by a tool,
//     so it is not in the ledger and it is refused. The remedy is the one this
//     gate asks for anyway: go and read it — run the command that prints it.
//   - A token assembled inside the tool call from pieces, or built by the
//     shell. The gate sees the pieces.
//   - A token that has scrolled off the front of the calling thread's own
//     trimmed ledger, which only that thread's own prints can fill. Refused,
//     although honest. `ledger.mjs` documents why that direction was chosen.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { posix } from 'node:path';
import { ledgerPath, threadLedgerPath, LEDGER_CAP } from './ledger.mjs';

/** English words spelled entirely out of a-f, seven characters or longer.
 *  A LIST and never a pattern — see the header. It grows only on a MEASURED
 *  false positive, never on a guess about what might one day appear. */
export const HEX_WORDS = new Set([
  'defaced',
  'effaced',
  'acceded',
  'fabaceae', // the legume family; this app photographs foliage
]);

/** Every hex identifier a tool input is carrying.
 *  Takes the serialised input; returns the distinct tokens, in the order they
 *  appear, with the English words and CSS colour literals dropped.
 *  What the caller relies on: each returned string is VERBATIM from the input,
 *  because the ledger test is a substring search and a normalised token would
 *  be searched for in text that never contained it. De-duplication is by
 *  lower-cased form, so one token is named once however it was cased.
 *
 *  A token is a WHOLE WORD of hex: nothing alphanumeric touches either end.
 *  Measured 2026-09-28: the first version took seven hex letters from inside
 *  an ordinary English word (the past tense of "succeed") and refused the call.
 *  Three boundaries count as a word's edge although they touch letters: a `0x`
 *  prefix; a JSON escape such as `\n`, because the input is serialised and a
 *  SHA that starts a line arrives as `\n` followed by the SHA; and the `-g` of
 *  git's describe form, which git resolves to the commit after it. A run of
 *  decimal digits alone is a number, not an identifier: the first version
 *  refused 3600000, a byte count and a date. A forty-character SHA with no
 *  letter in it has odds near seven in a billion.
 *
 *  A figure in exponent form is a number too: digits, then `e`, then a short
 *  exponent (see the header). It is dropped the same way. */
export function hexTokens(serialised) {
  const s = String(serialised ?? '');
  const seen = new Set();
  const out = [];
  for (const m of s.matchAll(/(?:(?<![0-9a-z])|(?<=\\[nrtbf])|(?<=-g))(?:0x)?([0-9a-f]{7,})(?![0-9a-z])/gi)) {
    const tok = m[1];
    const at = m.index + m[0].length - tok.length;
    const low = tok.toLowerCase();
    if (/^\d+$/.test(tok)) continue;
    // A figure in exponent form: digits, `e`, one to three digits; or digits and
    // `e` with a signed one-to-three-digit exponent after it. See the header.
    if (/^\d+e\d{1,3}$/i.test(tok)) continue;
    if (/^\d+e$/i.test(tok) && /^[+-]\d{1,3}(?![0-9a-z])/i.test(s.slice(m.index + m[0].length))) continue;
    if (HEX_WORDS.has(low)) continue;
    // `#rrggbbaa`. The six-digit form is already under the floor; the
    // eight-digit one is not, and this repository's stylesheets use it. Narrow
    // on purpose: exactly eight, and the `#` immediately before it. A forty-
    // character SHA cannot hide behind this.
    if (low.length === 8 && s[at - 1] === '#') continue;
    if (seen.has(low)) continue;
    seen.add(low);
    out.push(tok);
  }
  return out;
}

/** Which of these tokens this session has never read.
 *  Takes the tokens and the known text (the ledger, plus the harness's own
 *  envelope); returns the subset that is absent from it.
 *  What the caller relies on: the direction. A token passes when the TOKEN is
 *  found inside the known text — never when some entry in the known text is
 *  found inside the token. Shortening a value that was read passes; extending
 *  one that was read does not. Inverting this comparison is what lets the
 *  original incident through, and the header says so at length. Case is folded
 *  because case is not the defect. */
export function unread(tokens, knownText) {
  const known = String(knownText ?? '').toLowerCase();
  return tokens.filter((t) => !known.includes(t.toLowerCase()));
}

/** The folders in which the harness itself saves a long result or a hook's output.
 *  Takes the hook payload (`session_id` and `transcript_path` are read; missing
 *  fields are tolerated); returns the folder paths, each ending in a slash, or
 *  an empty list when the payload does not name a session and a transcript.
 *  What the caller relies on: a folder is returned only for the session the
 *  call belongs to, so a print saved for another session is not passed, and
 *  every folder is `<session folder>/tool-results/` for a session folder taken
 *  from the transcript's own place, either beside the main transcript or above
 *  a subagent's. A transcript path with a `..` segment, or that is not
 *  absolute, yields none. */
export function savedPrintRoots(payload = {}) {
  const sid = String(payload?.session_id ?? payload?.sessionId ?? '');
  const tp = String(payload?.transcript_path ?? payload?.transcriptPath ?? '');
  if (!/^[A-Za-z0-9_-]+$/.test(sid) || !posix.isAbsolute(tp)) return [];
  if (tp.split('/').includes('..')) return [];
  const roots = new Set([`${posix.dirname(tp)}/${sid}/tool-results/`]);
  const at = tp.indexOf(`/${sid}/`);
  if (at >= 0) roots.add(`${tp.slice(0, at + sid.length + 1)}/tool-results/`);
  return [...roots];
}

/** The serialised tool input with each path the harness saved a print to taken out.
 *  Takes the serialised input, the folders from `savedPrintRoots`, and an
 *  existence test (the file system's, unless a caller supplies one); returns
 *  the input with each such path replaced by plain words that hold no hex run.
 *  What the caller relies on: a path is taken out only when it begins with one
 *  of the folders, continues in plain name characters with no `.` or `..`
 *  segment, and the file is there. Anything else in the input, a hex run beside
 *  the path included, is returned untouched and is searched for in the ledgers
 *  as before. Nothing is taken out for a file that is not there, so a name
 *  made up to look like a saved print passes nothing. */
export function withoutSavedPrints(serialised, roots, exists = existsSync) {
  let s = String(serialised ?? '');
  for (const root of roots) {
    const escaped = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${escaped}([A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)*)`, 'g');
    s = s.replace(re, (whole, rest) => {
      if (rest.split('/').some((seg) => seg === '.' || seg === '..')) return whole;
      return exists(root + rest) ? 'harness-saved-print' : whole;
    });
  }
  return s;
}

/** The refusal, in the shape this family's PreToolUse hooks all use.
 *  Takes the reason; never returns — it writes the deny JSON and exits 2.
 *  What the caller relies on: exit 2 blocks unconditionally, ahead of any
 *  JSON, and the JSON carries the WHY. A bare block reads as a transient error
 *  and invites a retry with a slightly different value, which is the routing-
 *  around this gate exists to stop. */
function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(2);
}

function main() {
  // ONCE. The payload is consumed by the first reader; a second read gets
  // nothing, every check evaluates empty, and the hook is green while
  // measuring nothing.
  const raw = readFileSync(0, 'utf8');
  let p = null;
  try { p = JSON.parse(raw); } catch {
    // Unparseable payload is this gate malfunctioning, not the session
    // misbehaving. Fail open — see the header.
    process.stderr.write('ident-guard.mjs: unparseable payload, allowing\n');
    return 0;
  }

  const input = p.tool_input ?? p.toolInput ?? {};
  let serial = '';
  try { serial = JSON.stringify(input) ?? ''; } catch { serial = String(input); }

  // A path the harness itself saved a print to is not an identifier anyone
  // produced; it is taken out before the search. See the header.
  serial = withoutSavedPrints(serial, savedPrintRoots(p));

  const tokens = hexTokens(serial);
  if (!tokens.length) return 0; // nothing to check; the ledger is irrelevant

  const file = ledgerPath(p);
  const own = threadLedgerPath(p);
  if (!existsSync(file) && !existsSync(own)) {
    deny(
      `No identifier ledger at ${file}, and this call carries ${tokens.length === 1
        ? 'a hex identifier' : `${tokens.length} hex identifiers`}: ${tokens.join(', ')}.\n\n`
      + 'Refusing rather than assuming. The ledger is what this session has actually READ; '
      + 'without it there is no way to tell a value that was read from one that was '
      + 'produced to look like one, and an absent gate that looks like a passing gate is '
      + 'the failure this hook was written against.\n\n'
      + 'ledger.mjs (PostToolUse) writes that file. If it is not wired, wire it or unwire '
      + 'this one — the two go together.',
    );
  }

  // One ledger file's text, empty when there is no such file. A file that is
  // there and cannot be read is a refusal, as it always was.
  const readLedger = (f) => {
    if (!existsSync(f)) return '';
    try { return readFileSync(f, 'utf8'); } catch (e) {
      deny(`The identifier ledger at ${f} could not be read (${e?.message ?? e}), and this `
        + `call carries: ${tokens.join(', ')}. Refusing rather than assuming.`);
    }
    return '';
  };
  let known = readLedger(own);
  // The harness's OWN envelope — session id, cwd, transcript path — is text
  // this call was HANDED, not text produced by the model, so a hex run in it
  // is read and not recalled. `tool_input` is excluded: that is the thing
  // under suspicion, and letting it vouch for itself would make the gate a
  // tautology.
  try {
    known += `\n${JSON.stringify({ ...p, tool_input: undefined, toolInput: undefined })}`;
  } catch { /* envelope is a bonus, never a requirement */ }

  // The calling thread's own ledger and the envelope first; the shared ledger
  // only for what is still missing, so a call that this thread's own file
  // answers reads one file.
  let bad = unread(tokens, known);
  if (bad.length) bad = unread(bad, readLedger(file));
  if (!bad.length) return 0;

  const sizeOf = (f) => { try { return statSync(f).size; } catch { return 0; } };
  const size = sizeOf(file);
  const ownSize = sizeOf(own);
  deny(
    `${bad.length === 1 ? 'This hex identifier does' : 'These hex identifiers do'} not appear `
    + `anywhere in what this session has actually read: ${bad.join(', ')}\n\n`
    + 'Not in any tool result recorded this session. A value like this cannot be derived and '
    + 'cannot be checked by looking at it — it can only be READ. Producing one that looks '
    + 'right is indistinguishable, from the inside, from recalling one, which is why this is '
    + 'a refusal and not a reminder: a 40-character SHA once went out with seven real '
    + 'characters and thirty-three invented ones, and a 409 from the remote was the only '
    + 'thing that caught it.\n\n'
    + 'GO AND READ IT. Run the command that prints the value in full — `git rev-parse HEAD`, '
    + '`git log`, a list, a fetch — and use what comes back. Never extend a short form to a '
    + 'long one: this gate allows shortening a value it has seen and refuses lengthening one, '
    + 'because the start of a SHA is not the SHA.\n\n'
    + `(This thread's ledger: ${own}, ${ownSize} bytes; the shared ledger: ${file}, ${size} bytes; `
    + `each capped at ${LEDGER_CAP}. A value this thread read long enough ago to have scrolled off its `
    + 'own ledger is refused although it was honest — read it again.)',
  );
}

try {
  process.exit(main() ?? 0);
} catch (e) {
  // THIS FILE CRASHING MUST NOT BLOCK THE SESSION. A PreToolUse hook on every
  // tool that throws takes away every tool, including the ones needed to
  // repair it. See the header: unrecoverable-from-inside is the deciding
  // property, not severity.
  try { process.stderr.write(`ident-guard.mjs: ${e?.message ?? e} — allowing\n`); } catch { /* ignore */ }
  process.exit(0);
}
