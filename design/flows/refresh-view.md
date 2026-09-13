## Scenario
Inside step 7 of live-work: a design edit reaches the existing browser window
through the model event stream. The active view and selected step stay current.

## Steps
### Prepare the snapshot
1. viewer -> runtime: parse the current design, check references, and derive diagrams and main flows

### Deliver the update
2. viewer -> browser: send a named model event containing the current JSON snapshot

### Render the active view
3. browser -> browser: render the selected flow or module view from the latest model
4. browser -> engineer: preserve the navigation path, selected step and scroll position

## Notes
A flow address invalidated by an edit displays an explanation and a link to
choose a flow. Missing or cyclic subflow links are disabled. A stale render
cannot replace a newer model; old layout observers are disconnected.
