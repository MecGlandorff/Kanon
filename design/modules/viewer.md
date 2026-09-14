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
- out: HTTP on localhost, plus server-sent changed-path and model events
- views and routes: see [viewer commands](../../docs/reference.md#four-commands)
- flow navigation and live edits: see [nested flows and process blocks](../../docs/reference.md#nested-flows-and-process-blocks)

The `/events` stream sends `event: model` with the same JSON snapshot as
`/model` on connection and each update. Unnamed events keep carrying changed
file paths. The page renders model events without fetching `/model`.

## Failure behavior
No Chromium-family browser: open a normal tab and say so. Port taken: take the
next one and print it. Pages reconnect on their own after a restart.
Deliver the current model over the live connection on initial connection
and reconnection, so edits made while it was opening are not missed and
updates need no additional browser connection.

## Implementation evidence
Implemented in `runtime/src/viewer/server.js` and `page.html`, with the
bundled Mermaid asset under `runtime/vendor/`. The authorized v2 build and
its browser validation are recorded in `KANON_V2_BUILD.md`, Report. HTTP,
live updates, navigation, offline assets, and reconnect behavior were tested
on macOS. Native Windows and Linux browser launches remain unverified.
The initial-connection refresh bug was reproduced in Chrome, then verified
fixed on 2026-09-13. Its regression test is `test/viewer-client.test.js`;
all 25 tests passed on Node 20.0.0.

The process renderer is in `flows.js` and `flows.css`, with shared navigation
and grouping in `runtime/src/flow.js`. On 2026-09-14, executable DOM tests in
`test/flow-viewer.test.js` verified inspection, copied IDs, nested navigation,
repeat targets, and selection after updates. HTTP/SSE tests verified the new
assets and model metadata. The full local suite passed 74 tests, with one
native Windows test skipped. The separate visual prototype was approved by
the user; the integrated page has not yet been checked in a connected browser.

## Open questions
- [x] Vendor Mermaid or load it from a CDN with a vendored fallback? Answer: bundle Mermaid locally, with no runtime CDN access, as required by the accepted build packet. See D-010. (blocks: viewer-v1)
