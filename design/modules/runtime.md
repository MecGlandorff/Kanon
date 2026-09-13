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
- kanon view [view]: starts the server and opens a window

## Failure behavior
A missing design folder exits 1 with the path it looked for. A file that
cannot be read is reported and skipped. For recovery from malformed content,
see [Design files in the README](../../README.md#design-files).

## Implementation evidence
Implemented in `runtime/cli.js` and `runtime/src/`. The authorized v2 build
and its validation are recorded in `KANON_V2_BUILD.md`, Report. The 24-test
suite passed on Node 20 and Node 25; the unpacked package also passed check,
diagram, handoff, and viewer smoke checks on Node 20 on 2026-09-13.

## Open questions
- [x] Is a dependency cycle an error or a warning? Some systems have legitimate cycles through events. Answer: neither in v2; cycle detection is deferred by the accepted checker specification. See D-009. (blocks: core-v1)
