# Decisions

## D-001 · 2026-09-12 · Preserve identifiers
Decision: Preserve the original identifier through retries.
Why: A retry is the same work.

## D-002 · 2026-09-12 · Store before acknowledgement
Scope: worker, queue
Decision: Store the result before acknowledging the parcel.
Why: A crash must not lose completed work.
Supersedes: D-000

## D-003 · 2026-09-12 · Future remote transport
Scope: remote
Decision: Choose the remote transport later.
Why: It is outside the first slice.
