# Kanon Evidence Policy

Prefer current code, configuration, tests, and CI declarations over generated
Kanon state, then README intent, then broad convention.

## Claim classes

- **Known**: directly observed fact or declaration.
- **Likely**: convention-backed interpretation.
- **Unknown**: evidence was not observed or observation was limited.
- **Stale / suspicious**: a stronger source directly contradicts a claim.
- **Suggested**: a proposed follow-up, never a fact or instruction to execute.

A parsed package script is a Known declaration. Whether it is safe or succeeds
is Unknown until its definition is inspected and the user explicitly approves
execution.

Absence is not proof. Never make absence-based conclusions after an incomplete,
truncated, budget-limited, unreadable, rejected, sensitive-excluded, Git-failed,
timed-out, or overflowed scan. A missing literal substring is not a feature
conclusion. Missing conventional Docker, CI, or release files means only “not
found by current checks.”

Only direct contradictions are Stale / suspicious—for example, README declares
`npm start` while successfully parsed package metadata directly declares no
`start` script.
