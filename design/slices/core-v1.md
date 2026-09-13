---
modules: [runtime]
---
## Goal
kanon check and kanon diagram working against a fixture design, tested with
Node's built-in test runner.

## Acceptance criteria
- check on this repository's design folder exits 0.
- A fixture with an unknown dependency, a module not agreed in a slice, and a blocking question yields exactly those three errors, each with file and line.
- diagram output for the fixture matches a golden file.

## Out of scope
handoff, view, the skill text, host wrappers.

## Report
Reconciled on 2026-09-13 after the authorized v2 build. The checker and
diagram commands are implemented in `runtime/cli.js` and `runtime/src/`.

Validation on that date: `check` on Kanon's design exited 0 with 7 modules,
2 flows, and 1 slice. A separate minimal fixture produced exactly the three
required errors, each with its source file and line. Golden diagram and
route comparisons passed in `test/diagram.test.js`. The full 25-test suite
passed on Node 20.0.0.

The original build kept this design as an intentionally blocked example;
the live map now records the verified implementation. No new design choices
or unresolved deviations were identified for this slice.
