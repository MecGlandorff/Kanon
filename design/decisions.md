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
Supersedes: D-001
Decision: A flow is written as steps, `a -> b: text`, with `xK` for fan-out and `repeat from N until` for a loop. Kanon renders it as the overview with edges numbered in step order. No hand-written Mermaid.
Why: The map shows who touches what; the route shows order, loops, and fan-out on the same picture. That is what makes an agentic system easy to hold in your head, and a steps list is trivial for agents to write and for people to read.

## D-007 · 2026-09-12 · Kinds are shapes only
Scope: runtime, viewer
Decision: `kind` is one of agent, human, tool, store, external, trigger, service, library, and only changes the node shape. Loops and bounds live in flows, not module files.
Why: Non-LLM systems must fit the same format, and module files must stay lean.

## D-008 · 2026-09-13 · Build in the terminal with a continuously updated visual map
Scope: skill, viewer
Decision: The core experience is working with the agent in the terminal while Chrome keeps showing the system as it changes. The agent maintains the design files during that work, and the viewer renders their current contents.
Why: The engineer explicitly identified continuous terminal work with updating Chrome visuals as the goal. Design review and handoff support that experience.

## D-009 · 2026-09-13 · Reconcile the accepted v2 cycle policy
Scope: runtime
Decision: Dependency cycles produce neither an error nor a warning in the v2 checker. Dedicated cycle detection remains deferred.
Why: KANON_V2_DESIGN.md, The checker, explicitly defers cycle detection; the accepted KANON_V2_BUILD.md error list and its Checking report implement that scope. The original build preserved the question as a blocking example; it is now reconciled with the accepted specification.

## D-010 · 2026-09-13 · Keep the viewer offline with bundled assets
Scope: runtime, viewer
Supersedes: D-003
Decision: Keep the dependency-free Node runtime and bundle Mermaid locally. The viewer makes no runtime CDN requests.
Why: The accepted KANON_V2_BUILD.md Ground rules prohibit network access at runtime. Its Offline assets report records why this takes precedence over the earlier fallback wording in D-003.

## D-011 · 2026-09-13 · Reconcile file-based handoffs
Scope: skill, runtime, coding-agent
Decision: Generate design/handoffs/<slice>.md and give the coding agent its file path under the engineer's implementation request.
Why: KANON_V2_DESIGN.md, Handoff, and the accepted KANON_V2_BUILD.md handoff command both specify a generated file. The existing skill and runtime already follow that choice.

## D-012 · 2026-09-13 · Reconcile the single shared skill
Scope: skill
Decision: Keep one Kanon skill shared by Claude Code and Codex, covering live design work and optional handoffs.
Why: The accepted KANON_V2_BUILD.md Goal explicitly specifies one skill for both hosts. Both plugin manifests point to that shared skill directory.

## D-013 · 2026-09-13 · Reconcile known answers during normal work
Scope: skill
Decision: The agent automatically records and closes questions already answered by the engineer's accepted instructions, specs, or decisions, citing the source and explaining the update. It asks only for unresolved choices that affect the work.
Why: The engineer asked for automatic maintenance of the question list while using the live map. Reusing an existing answer preserves their authority without asking them to repeat it; implementation alone does not supply approval.

## D-014 · 2026-09-13 · Reconcile verified implementation during normal work
Scope: skill, runtime, viewer
Decision: After authorized implementation, the agent checks the implementation and supporting results, records affected modules as built with evidence, and keeps unverified behavior or unresolved deviations explicit. It does this during normal work without a separate sync request.
Why: The engineer found that the implemented skill, runtime, and viewer still appeared as proposed. The original build preserved their statuses as a demonstration, and the later workflow retained a manual sync step. The current live map must reflect the authorized work already completed; a build record does not grant approval for new choices.
