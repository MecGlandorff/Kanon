---
kind: service
status: built
uses:
  - design-folder: reads the design, writes handoffs
  - viewer: starts the server
---
## Responsibility
One Node command with check, diagram, handoff, and view. Parses the design
folder, reports problems, generates the overview diagram, writes handoff
packets, and starts the viewer.

## Interface
- kanon check: exit 0 when the design has no errors, else 1 with file and line per error
- kanon diagram: prints the Mermaid overview
- kanon handoff <slice>: writes design/handoffs/<slice>.md, refuses when check fails for that slice
- kanon view [view]: starts the server and opens a window, including map and flow/name views
- flow parsing: optional process headings and trailing (flow: name) references
- flow checking: reject missing targets, self references and indirect nesting cycles; allow shared subflows

## Failure behavior
A missing design folder exits 1 with the path it looked for. A file that
cannot be read is reported and skipped. For recovery from malformed content,
see [Design files in the reference](../../docs/reference.md#design-files).

## Implementation evidence
Implemented in `runtime/cli.js` and `runtime/src/`. The authorized v2 build
and its validation are recorded in `KANON_V2_BUILD.md`, Report. The 24-test
suite passed on Node 20 and Node 25; the unpacked package also passed check,
diagram, handoff, and viewer smoke checks on Node 20 on 2026-09-13.

On 2026-09-14, the nested-flow changes passed the full local suite: 74 tests
passed and the native Windows test was skipped on macOS. The design checker
and package dry run also passed. `test/flow.test.js` exercises grouping,
reference validation, deep nesting, addresses, and responsive layout.

## Open questions
- [x] Is a dependency cycle an error or a warning? Some systems have legitimate cycles through events. Answer: see the [module dependency cycle policy](../../docs/reference.md#agreement-and-handoff), accepted in D-009. (blocks: core-v1)
