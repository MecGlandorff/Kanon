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
