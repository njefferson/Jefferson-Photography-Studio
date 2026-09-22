#!/usr/bin/env node
// A VALUE THIS SESSION NEVER READ IS A VALUE THIS SESSION INVENTED.
//
// A `PostToolUse` hook. It appends the RESULT of every tool call to one
// rolling, session-local file. Nothing here refuses anything — this is only
// the record. `ident-guard.mjs` beside it is the refusal, and it is useless
// without this file: the two are wired together or neither is.
//
// ## WHAT HAPPENED
//
// A merge guard was handed a 40-character commit SHA. Seven of those
// characters were real, read out of `git rev-parse --short`; the other
// thirty-three were generated to look like the rest. GitHub's 409 "Head branch
// was modified" was the only thing that caught it.
//
// **There was no internal moment of "I do not have this."** Completing a
// partially-known value is indistinguishable, from the inside, from recalling
// it — the same machinery produces both, and it produces them with the same
// confidence. That is why this cannot be a rule in a file: a rule is read by
// the part of the process that already believes it knows the value.
//
// A commit-time gate cannot see it either. The fabrication and its use happen
// inside ONE tool call, and the call succeeds or fails against a remote long
// before anything is committed. The only place to stand is between the model
// and the tool, which is where these two hooks stand.
//
// ## WHY THE RESULT AND NEVER THE INPUT
//
// The ledger answers exactly one question: what text has this session actually
// SEEN? Tool results are that text. Tool INPUTS are not — an input is what the
// model produced, which is the very thing under suspicion.
//
// Recording inputs would also be self-defeating in a specific and quiet way.
// `ident-guard.mjs` fails OPEN on its own malfunction (see its header), so a
// fabricated token can reach a tool if the guard ever crashes. If inputs were
// recorded, that one escape would write the fabricated value into the ledger
// and bless it for the rest of the session — the gate would launder the exact
// defect it exists to catch, and would do it silently.
//
// ## THE CAP, AND WHICH WAY IT FAILS
//
// 4 MB, trimmed from the FRONT, to the next newline, down to 90% of the cap so
// the rewrite is rare rather than once per tool call — this runs on every
// single call in the session and must stay cheap.
//
// Trimming discards text the session really did read, so a token that has
// scrolled off is refused although it was honest. That is the safe direction
// and it is the only direction available: a trimmed ledger can produce a false
// REFUSAL and can never produce a false pass. The remedy when it bites is the
// one the guard asks for anyway — go and read the value again.
//
// ## IT NEVER FAILS THE TOOL CALL
//
// Everything is wrapped and the exit code is always 0. A PostToolUse hook that
// errors turns a tool result into a session-visible failure, and a bookkeeping
// file is never worth that. When something goes wrong it says so on stderr and
// gets out of the way — the consequence is a missing ledger entry, which
// `ident-guard.mjs` then treats as unread, which is a refusal and not a hole.
//
// ## THE PATH
//
// `CLAUDE_IDENT_LEDGER` if set, else <tmpdir>/claude-ident-ledger-<key>.txt
// where the key is the payload's own `session_id` (falling back to
// `CLAUDE_CODE_SESSION_ID`). Both hooks derive it through the SAME exported
// function rather than each spelling the rule out, because two copies of one
// rule, one of them updated, is the defect class this repo has the most
// lessons about. A guard reading a different file from the one the ledger
// writes would refuse everything, forever, with nothing to see.
//
// ## IT IS IMPORTABLE
//
// The main body runs only when this file is the process entry point.
// `ident-guard.mjs` imports `ledgerPath` from here, and an import that read
// stdin would hang the guard on every tool call.
import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The ledger ceiling in bytes. Read by `appendToLedger`'s default and by the
 *  guard's refusal text, so the two cannot disagree about the number. */
export const LEDGER_CAP = 4 * 1024 * 1024;

/** Where this session's ledger lives.
 *  Takes the hook payload (any shape; missing fields are tolerated) and an
 *  environment object; returns an absolute path.
 *  What the caller relies on: `ident-guard.mjs` calls this with ITS payload and
 *  must land on the same file this hook wrote with ITS payload. So the key is
 *  drawn from `session_id`, which both events carry, and the env override wins
 *  in both — the one thing this function must never do is depend on anything
 *  that differs between a PreToolUse and a PostToolUse call. The session key is
 *  reduced to a safe filename charset because it lands in a path. */
export function ledgerPath(payload = {}, env = process.env) {
  if (env.CLAUDE_IDENT_LEDGER) return env.CLAUDE_IDENT_LEDGER;
  const key = String(
    payload?.session_id ?? payload?.sessionId
    ?? env.CLAUDE_CODE_SESSION_ID ?? env.CLAUDE_SESSION_ID ?? 'no-session',
  ).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 96);
  return join(tmpdir(), `claude-ident-ledger-${key}.txt`);
}

/** The text of a tool result, whatever shape the harness sent it in.
 *  Takes the parsed payload; returns a string, empty when there is no result.
 *  What the caller relies on: a token that appeared in the result appears
 *  VERBATIM in what comes back, because the guard's whole test is a substring
 *  search. So an object result is stringified rather than summarised, and
 *  nothing here truncates, re-wraps or pretty-prints. The field is spelled
 *  several ways because this hook must keep working if the payload key is
 *  renamed — a ledger that silently stops recording is an absent gate wearing
 *  a green tick. */
export function resultText(payload) {
  const r = payload?.tool_response ?? payload?.toolResponse
    ?? payload?.tool_result ?? payload?.toolResult
    ?? payload?.tool_output ?? payload?.result ?? payload?.response;
  if (r == null) return '';
  if (typeof r === 'string') return r;
  try { return JSON.stringify(r); } catch { return String(r); }
}

/** Append text to the ledger and hold it under the cap.
 *  Takes the ledger path, the text, and the cap in bytes; returns nothing.
 *  What the caller relies on: after this returns, either the text is in the
 *  file or stderr said why — and the file is never larger than `cap`. Trimming
 *  takes from the FRONT and stops at a newline, so it can only REMOVE text the
 *  session read; it can never introduce text it did not. That asymmetry is the
 *  whole safety argument for capping at all (see the header). */
export function appendToLedger(file, text, cap = LEDGER_CAP) {
  if (!text) return;
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  let size = 0;
  try { size = statSync(file).size; } catch { return; }
  if (size <= cap) return;
  // Down to 90% rather than to the cap: at the cap exactly, every subsequent
  // call would read and rewrite four megabytes.
  const buf = readFileSync(file);
  let keep = buf.subarray(Math.max(0, buf.length - Math.floor(cap * 0.9)));
  const nl = keep.indexOf(0x0a);
  if (nl >= 0 && nl < keep.length - 1) keep = keep.subarray(nl + 1);
  writeFileSync(file, keep);
}

function main() {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { return; }
  let p = null;
  try { p = JSON.parse(raw); } catch { return; } // nothing to record, nothing to say
  appendToLedger(ledgerPath(p), resultText(p));
}

// ONLY WHEN RUN, NEVER WHEN IMPORTED. See the header.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (e) {
    try { process.stderr.write(`ledger.mjs: ${e?.message ?? e}\n`); } catch { /* ignore */ }
  }
  process.exit(0); // ALWAYS. A bookkeeping file never fails a tool call.
}
