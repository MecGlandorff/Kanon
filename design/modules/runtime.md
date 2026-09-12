---
kind: service
status: proposed
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
cannot be parsed is reported and skipped; the rest still loads.

## Open questions
- [ ] Is a dependency cycle an error or a warning? Some systems have legitimate cycles through events. (blocks: core-v1)
