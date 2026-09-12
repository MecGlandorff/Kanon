---
status: proposed
uses:
  - runtime: runs check, handoff, and view
  - design-folder: reads and edits design files
---
## Responsibility
Guide the conversation through design, agree, and handoff. It owns the rules
of the conversation, not the file format.

## Interface
- in: the engineer's messages and the current design folder
- out: edits to design files, each announced with what changed and why
- out: runtime commands through the wrapper in the skill folder

## Open questions
- [ ] One skill, or separate design and handoff skills so the hosts trigger them independently?
