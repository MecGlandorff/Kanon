---
kind: service
status: proposed
uses:
  - design-folder: watches for changes
  - browser: opens app-mode windows
---
## Responsibility
Serve the design as a live page in a standalone window: overview, module
detail, questions, decisions, slices, flows. Each view has its own URL.

## Interface
- in: started by runtime on a port derived from the repository path
- out: HTTP on localhost, plus a server-sent events stream with changed file paths
- routes: #overview, #module/name, #questions, #decisions, #slices, #flows

## Failure behavior
No Chromium-family browser: open a normal tab and say so. Port taken: take the
next one and print it. Pages reconnect on their own after a restart.

## Open questions
- [ ] Vendor Mermaid or load it from a CDN with a vendored fallback? (blocks: viewer-v1)
