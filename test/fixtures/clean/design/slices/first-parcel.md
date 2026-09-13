---
modules: [worker]
---
## Goal
Process the first parcel safely.

## Acceptance criteria
- Submitting the same identifier twice produces one stored result.
- A failure leaves the original parcel queued.

## Out of scope
Changing the queue interface or implementing the remote destination.

## Report
