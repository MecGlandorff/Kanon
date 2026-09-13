---
kind: agent
status: agreed
uses:
  - queue: take "parcel" <once> | acknowledge
---
## Responsibility
Process a parcel and acknowledge it once.

## Interface
Accept an identifier and return its stored result.

## Failure behavior
Leave the parcel queued when processing fails.

## Open questions
- [ ] Q: What is the conservative retry delay?
- [x] Must identifiers survive retries? (blocks: first-parcel)
