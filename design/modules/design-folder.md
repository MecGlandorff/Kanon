---
kind: store
status: agreed
---
## Responsibility
The design directory in the repository: system, modules, slices, decisions,
flows, and generated handoffs. The single source of truth, versioned with the
code.

## Interface
- read by: runtime, skill, coding agents
- written by: skill and the engineer, in every file except handoffs
- written by: runtime, only in handoffs/
