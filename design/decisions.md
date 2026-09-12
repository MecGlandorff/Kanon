# Decisions

## D-001 · 2026-09-12 · Text is authoritative, the diagram is derived
Scope: design-folder, runtime, viewer
Decision: Module files are the source of truth. The overview is generated from their uses lists. Only flows are hand-written Mermaid.
Why: Agents edit text natively, it diffs in pull requests, and a generated diagram cannot drift from the specs.

## D-002 · 2026-09-12 · The viewer is a standalone window
Scope: viewer, browser
Decision: The viewer opens in a browser app-mode window, one per view, movable to another screen.
Why: Mermaid has no terminal renderer, and the engineer wants the design on a second screen while working in the terminal.

## D-003 · 2026-09-12 · Zero runtime dependencies
Scope: runtime, viewer
Decision: Plain Node with no npm dependencies. Browser assets are vendored; Mermaid loads from a CDN only as a fallback.
Why: Both hosts load the plugin from a directory; install steps and lifecycle hooks are a liability.

## D-004 · 2026-09-12 · Flat frontmatter instead of YAML
Scope: runtime
Decision: Frontmatter supports scalars, inline lists, and lists of scalars or single key-value pairs. Nothing nested.
Why: A YAML parser is a dependency or a lot of code. The subset covers every field the format needs.

## D-005 · 2026-09-12 · The design folder is visible
Scope: design-folder
Decision: Design files live in design/ at the repository root, not in a hidden folder.
Why: The design is reviewed in pull requests like code, and coding agents should find it without being told.

## D-006 · 2026-09-12 · Flows are a numbered Steps list, rendered as a route over the map
Scope: runtime, viewer
Decision: A flow is written as steps, `a -> b: text`, with `xK` for fan-out and `repeat from N until` for a loop. Kanon renders it as the overview with edges numbered in step order. No hand-written Mermaid.
Why: The map shows who touches what; the route shows order, loops, and fan-out on the same picture. That is what makes an agentic system easy to hold in your head, and a steps list is trivial for agents to write and for people to read.

## D-007 · 2026-09-12 · Kinds are shapes only
Scope: runtime, viewer
Decision: `kind` is one of agent, human, tool, store, external, trigger, service, library, and only changes the node shape. Loops and bounds live in flows, not module files.
Why: Non-LLM systems must fit the same format, and module files must stay lean.
