---
status: built
uses:
  - runtime: runs check, handoff, and view
  - design-folder: reads and edits design files
---
## Responsibility
Keep the engineer's terminal work and the live system map in step. Open or
reuse the viewer, then update the relevant modules and flows after each
meaningful change so the engineer can see the system evolve as we work.
Support agreement and handoff when the engineer needs them.

## Interface
- in: the engineer's messages and the current design folder
- out: edits to design files, each announced with what changed and why
- out: runtime commands through the wrapper in the skill folder

## Current behavior
The skill instructs the agent to maintain design files during terminal work
and automatically reconcile questions answered by the engineer's current or
prior accepted instructions. It records the answer's source and explains the
update. Unresolved choices remain open; code alone does not grant agreement.
After authorized implementation, it also reconciles affected module statuses
from the implementation and validation evidence, without a separate sync
request. Untested behavior and unresolved deviations remain explicit.
The runtime broadcasts file changes and does not infer design from code.

## Implementation evidence
Implemented in `skills/kanon/SKILL.md`, with templates and wrappers in the
same skill directory. The authorized v2 build and its validation are recorded
in `KANON_V2_BUILD.md`, Report. On 2026-09-13, the current skill and both
plugin manifests passed validation, and the unpacked package's wrapper,
diagrams, handoff, and live updates passed checks on Node 20.
Fresh installation and skill invocation in both hosts remain unverified.

## Open questions
- [x] One skill, or separate design and handoff skills so the hosts trigger them independently? Answer: one shared skill for both hosts. See D-012 and the accepted build packet's Goal.
