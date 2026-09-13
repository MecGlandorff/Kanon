---
kind: service
status: built
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
Fetch the current model whenever the live connection opens, including the
first connection, so edits made while it was opening are not missed.

## Implementation evidence
Implemented in `runtime/src/viewer/server.js` and `page.html`, with the
bundled Mermaid asset under `runtime/vendor/`. The authorized v2 build and
its browser validation are recorded in `KANON_V2_BUILD.md`, Report. HTTP,
live updates, navigation, offline assets, and reconnect behavior were tested
on macOS. Native Windows and Linux browser launches remain unverified.
The initial-connection refresh bug was reproduced in Chrome, then verified
fixed on 2026-09-13. Its regression test is `test/viewer-client.test.js`;
all 25 tests pass on Node 20.0.0.

## Open questions
- [x] Vendor Mermaid or load it from a CDN with a vendored fallback? Answer: bundle Mermaid locally, with no runtime CDN access, as required by the accepted build packet. See D-010. (blocks: viewer-v1)
