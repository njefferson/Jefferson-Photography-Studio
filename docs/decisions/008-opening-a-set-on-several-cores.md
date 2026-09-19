# 008 · Opening a set on several cores

## Context

Every photograph is decoded by ONE worker, one after another, and the lens rig
sends ninety flats through the same door. Measured 2026-09-13. What is NOT the
problem: the tiles, at 21 ms each on the test page — forty is under a second. The
set-open cost is storage commits (about 320 ms for a 25 MB raw on a desktop,
serial by design so a crash cannot leave a half-resumable session) plus decode,
and decode is the actionable half.

**Half done 2026-09-13.** The pool was built earlier the same day —
`decodeClient` runs three or four lanes — and the pass that decodes every
photograph in a set was still handing it one file and waiting, so two of three
lanes sat idle through a whole set open. `realThumbnails` now keeps up to the
lane count in flight.

## Looked up

**Not needed for the pool itself** — the export's worker pool was already written
in this repo and is the shape that was copied, which is the correct move under
Doctrine §11e: the reference implementation was in-house.

## Weighed against

The item stays open for **a device measurement**, not for more code. The gain
measured here is small and is the wrong number: twelve practice raws, three runs
each, in a container on a software rasteriser, 11.8s median with one in flight
against 11.0s with the pool — about 7%. This machine decodes a raw in 43 ms where
an 8-core iPad takes 180, so the decode share, the part being parallelised, is at
its smallest here. The test page reports both halves and the real split is owed
from the device.

## Depends

- needs 014 — 014's own Weighed against: work avoided beats work parallelised,
  so if 014 is real it changes this item's numbers and should be measured
  first. Parallelising a decode this item may delete is work spent twice.

## Options

**Take the device measurement and record it.** All that is left.

Parallelise the storage commits too. Rejected below.

## Rejected

**Sizing the pool with `decodeLanes()`.** It reports how many lanes are ALIVE,
which is zero until something decodes — and this pass runs when nothing has
decoded yet, so the first version sized itself at one and changed nothing. It
uses `decodeLaneTarget()`. The diagnostic keeps the live count deliberately: a
report must not spawn workers in order to describe the app.

**Parallelising the storage commits.** They are serial by design so a crash
cannot leave a half-resumable session, which is a correctness property and not an
oversight.

**Counting tiles as the correctness check.** Without the in-flight guard, two
lanes take the same photo and both write the SAME correct tile: ten tiles, ten
distinct pictures, a strip that looks perfect, and the device decoding everything
three times. A first version of the walk passed against the planted defect for
exactly this reason. Correctness is asserted by patching `Worker.prototype.postMessage`
and counting what actually reached a decoder — 11 for ten photos with the guard,
**31 without**. Also: ending a session asks with a native `confirm()`, which
Playwright DISMISSES by default, so the teardown branch never ran while the walk
reported a failure about the app.

## Rank

**Eighth.** It is waiting on one number from a device, not on a decision or a
build, so it costs nothing to leave here and cannot advance without the owner's
hardware.
