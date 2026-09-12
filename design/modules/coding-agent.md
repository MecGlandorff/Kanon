---
kind: agent
status: agreed
uses:
  - design-folder: reads one handoff packet, writes one Report section
---
## Responsibility
Build one slice from its packet, in either host, without the skill. Report
what was built, deviations, and new questions in the slice's Report section.

## Interface
- in: design/handoffs/<slice>.md
- out: the Report section of design/slices/<slice>.md
