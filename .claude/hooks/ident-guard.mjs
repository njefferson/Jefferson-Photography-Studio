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
// ## WHAT IT CANNOT SEE
//
//   - A value the owner typed in chat. It was read by a person, not by a tool,
//     so it is not in the ledger and it is refused. The remedy is the one this
//     gate asks for anyway: go and read it — run the command that prints it.
//   - A token assembled inside the tool call from pieces, or built by the
//     shell. The gate sees the pieces.
//   - A token that has scrolled off the front of a trimmed ledger. Refused,
//     although honest. `ledger.mjs` documents why that direction was chosen.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { ledgerPath, LEDGER_CAP } from './ledger.mjs';

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
 *  lower-cased form, so one token is named once however it was cased. */
export function hexTokens(serialised) {
  const s = String(serialised ?? '');
  const seen = new Set();
  const out = [];
  for (const m of s.matchAll(/[0-9a-f]{7,}/gi)) {
    const tok = m[0];
    const low = tok.toLowerCase();
    if (HEX_WORDS.has(low)) continue;
    // `#rrggbbaa`. The six-digit form is already under the floor; the
    // eight-digit one is not, and this repository's stylesheets use it. Narrow
    // on purpose: exactly eight, and the `#` immediately before it. A forty-
    // character SHA cannot hide behind this.
    if (low.length === 8 && s[m.index - 1] === '#') continue;
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

  const tokens = hexTokens(serial);
  if (!tokens.length) return 0; // nothing to check; the ledger is irrelevant

  const file = ledgerPath(p);
  if (!existsSync(file)) {
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

  let known = '';
  try { known = readFileSync(file, 'utf8'); } catch (e) {
    deny(`The identifier ledger at ${file} could not be read (${e?.message ?? e}), and this `
      + `call carries: ${tokens.join(', ')}. Refusing rather than assuming.`);
  }
  // The harness's OWN envelope — session id, cwd, transcript path — is text
  // this call was HANDED, not text produced by the model, so a hex run in it
  // is read and not recalled. `tool_input` is excluded: that is the thing
  // under suspicion, and letting it vouch for itself would make the gate a
  // tautology.
  try {
    known += `\n${JSON.stringify({ ...p, tool_input: undefined, toolInput: undefined })}`;
  } catch { /* envelope is a bonus, never a requirement */ }

  const bad = unread(tokens, known);
  if (!bad.length) return 0;

  let size = 0;
  try { size = statSync(file).size; } catch { /* reported as 0 */ }
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
    + `(Ledger: ${file}, ${size} bytes, capped at ${LEDGER_CAP}. A value read long enough ago `
    + 'to have scrolled off is refused although it was honest — read it again.)',
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
