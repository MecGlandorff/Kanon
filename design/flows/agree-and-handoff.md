## Scenario
The engineer requests a packet for an authorized slice. The skill checks its
readiness against the current design and accepted decisions, then a coding
agent builds from the packet and reports back.

## Steps
1. engineer -> skill: prepare the core-v1 handoff
2. skill -> design-folder: read the slice scope and accepted decisions
3. skill -> runtime: kanon check
4. runtime -> skill: slice ready, no unresolved blockers
5. skill -> runtime: kanon handoff core-v1
6. runtime -> skill: design/handoffs/core-v1.md
7. skill -> coding-agent: build from the packet under the implementation request
8. coding-agent -> skill: report with implementation and validation results
9. skill -> design-folder: record outcomes after checking implementation and validation evidence
10. skill -> engineer: summarize verified work and any unresolved deviations

## Notes
The earlier runtime blocker is settled by D-009 in design/decisions.md.
Agreement, unresolved blockers, and reconciliation follow the Handoff rules
in skills/kanon/SKILL.md.
