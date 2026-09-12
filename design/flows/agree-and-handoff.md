## Scenario
The engineer agrees on the runtime module and asks for a slice. Kanon refuses
the handoff until the one blocking question is decided, then a coding agent
builds the slice and reports back.

## Steps
1. engineer -> skill: "Runtime is agreed. Cut a slice."
2. skill -> runtime: kanon check
3. runtime -> skill: blocked, one open question on runtime
4. skill -> engineer: "Are dependency cycles an error or a warning?"
5. engineer -> skill: "A warning."
6. skill -> runtime: kanon handoff core-v1
7. runtime -> skill: design/handoffs/core-v1.md
8. skill -> coding-agent: build from the packet
9. coding-agent -> skill: report, built with one deviation
10. skill -> engineer: "Runtime is built. One deviation to review."

## Notes
The refusal in the middle is the point. The engineer decides before any code
exists, the decision lands in the ledger, and the packet the coding agent
receives already contains it.
