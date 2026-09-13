# Kanon reference

[Back to Kanon](../README.md)

Build and evolve a system with an engineer and AI agents in the terminal
while its live map stays open in a separate window. The agent maintains the
visible `design/` folder during the work; the viewer redraws from that text.
Agreed pieces can also become packets for coding agents.

This is the v2 rewrite, version `2.0.0-dev`. The `v1.0.0` Git tag preserves
the earlier repository-orientation tool.

## Install and run

Use Node.js 20 or newer. Keep the complete Kanon directory: the skill's
wrappers need the sibling `runtime/`. There is no dependency installation or
build step. Mermaid 11.17.2 is bundled locally; the runtime makes no external
network requests.

From a checkout, try the viewer:

```sh
node runtime/cli.js view
```

For another project, keep that project as the working directory and run the
wrapper by its absolute path:

```sh
cd /path/to/project
bash /path/to/kanon/skills/kanon/scripts/kanon view
```

In PowerShell, use the corresponding absolute `skills/kanon/scripts/kanon.ps1`
path with the same arguments.

For Claude Code, start a session from your target project with the full plugin:

```sh
claude --plugin-dir /path/to/kanon
```

Then invoke the plugin's `kanon` skill, normally `/kanon:kanon`, to start the
design conversation. The package contains `.claude-plugin/plugin.json`.

For Codex, the package contains `.codex-plugin/plugin.json`. Add this complete
directory to your local plugin marketplace and install Kanon from that
source. You can ask the built-in Plugin Creator to wire an existing directory
into a personal marketplace; see the [official local-plugin setup guide](https://developers.openai.com/plugins/build/plugins#package-with-plugin-creator).
For immediate use without changing an installation, tell Codex to read and
use `/path/to/kanon/skills/kanon/SKILL.md` for your design request. If an older
Kanon is already installed, use this explicit v2 path to select the rewrite.

## Four commands

Every command reads `design/` in the current working directory.

| Command | Result |
| --- | --- |
| `kanon check` | Errors with source file and line, or the module/flow/slice counts. Exit 1 on errors; otherwise 0. |
| `kanon diagram` | The derived Mermaid map on stdout. |
| `kanon diagram --flow name` | The same modules with that flow's numbered edges, fan-out, and loop-backs. |
| `kanon handoff slice` | Write `design/handoffs/slice.md` when that slice is buildable. |
| `kanon view [view]` | Serve the design locally and open a separate browser app window. |

Here `kanon` means the wrapper above; no global executable is installed.

The viewer binds only to `127.0.0.1`. It chooses a stable repository-specific
port between 4700 and 4899, reuses a matching server, and tries up to twenty
ports when occupied. `--port N` chooses the starting port. `--no-open` prints
the URL without launching a browser.

Views are `overview`, `map`, `module/name`, `flows`, `flow/name`,
`decisions`, `questions`, and `slices`. The overview shows the system’s main
flow when there is exactly one, or offers the main flows to choose from.
The module dependency map remains available through **Module map**. For example, `kanon view questions` opens another window connected
to the same design. The first server stays in its terminal; Ctrl+C stops it.
Pages reconnect after a restart. Changes to design files update connected
views automatically while preserving their scroll position.

Chrome, Chromium, Edge, Brave, and Arc are searched on macOS; supported
Chromium executable paths are also searched on Linux and Windows. When an
app-mode browser is unavailable, Kanon opens the default browser and prints
a notice. Window placement is managed by the browser and operating system.

## Design files

```text
design/
  system.md              purpose and constraints
  modules/name.md        responsibility, interface, status and dependencies
  flows/name.md          one scenario as numbered steps
  slices/name.md         one implementation slice and its eventual Report
  decisions.md           dated decisions and their reasons
  handoffs/name.md       generated packet
```

The folder must exist; individual files and subfolders are optional. Begin
with the [templates](../skills/kanon/templates/), replacing their example text
with the actual design. Modules are named by their filename, without `.md`:

```markdown
---
kind: agent
status: proposed
uses:
  - queue: take the next job
---
## Responsibility
Process queued jobs and preserve their original identifiers.

## Interface
- in: Job
- out: Result

## Open questions
- [ ] What is the retry bound? (blocks: first-job)
```

Frontmatter supports flat scalars, `[a, b]` lists, and two-space block lists
of names or `name: label` pairs. Quote text containing list commas or YAML
punctuation. Nested YAML, aliases, and multiline operators are unsupported;
bad lines become errors while valid content still loads. Body sections use
`## Heading`. Questions belong in `## Open questions` and can use an optional
`Q:` prefix and a trailing `(blocks: slice-a, slice-b)`.

Statuses are `proposed` (the default), `agreed`, and `built`. The engineer owns
agreement and design choices. The skill automatically records answers already
present in their accepted instructions, specs, or decisions, checks off those
questions, and explains the source. Unresolved choices remain open; observed
code alone does not grant approval. After authorized implementation, the skill
also records verified modules as built with evidence and notes untested
behavior, without waiting for a separate sync request. Kinds change the
diagram shape:
`agent`, `human`, `tool`, `trigger`, `service`, `library`, `store`, `external`;
other kinds use a rectangle. Every Mermaid node ID starts with `module_`;
characters outside `[A-Za-z0-9_]` in the module name become underscores.
Collisions receive numeric suffixes, keeping distinct modules distinct.
Maps and routes share these internal IDs. The viewer also shows readable
references using the original names: `#worker` for a module,
`#process.2` for a numbered step, and `#worker>queue` for a uses-edge.
Click a reference button to copy it into the terminal conversation. Module
blocks open their detail view, which includes a copy button. Rewording a
step preserves its ID; renumbering it changes the ID.

A flow contains Scenario, Steps, and optional Notes sections:

```markdown
## Scenario
One bounded evaluation round.

## Steps
1. engineer -> worker: request a candidate
2. worker -> evaluator x8: evaluate it
3. repeat from 1 until the budget is spent
```

Number steps consecutively from 1; `xK` is positive integer fan-out. Loops
refer to earlier steps. Aim for about ten steps; split longer stories. Name
participating modules, not files. No handwritten Mermaid is required.

### Nested flows and process blocks

The Flows view uses connected process boxes. Select a box to inspect its
original steps, participants, fan-out and copyable IDs. A repeat identifies
its step range and links back to its starting step.

A transfer step can end in a reference to another flow file:

```markdown
7. run.py -> tracker: track the classified articles (flow: story-matching)
```

Only an explicit reference produces a **story-matching ▸** control. Clicking
it opens that flow under a breadcrumb such as `daily-run › 7 › story-matching`.
Steps inside it can reference further flows; there is no fixed depth limit.
The checker rejects missing targets, self references and indirect cycles.
Different steps or parents may reuse the same inner flow.

Main flows are derived: a flow that no step references is a main flow. There
is no `main:` field. The viewer does not invent inner flows. A grouped block
without a reference only opens its step details.

Optional level-three headings inside Steps group adjacent steps into a
compact block. An optional paragraph between the heading and its first step
supplies the block summary. Existing ungrouped flows work without edits,
with one process block per step. Numbering continues across headings:

```markdown
## Steps
### Collect articles
Fetch the feeds and remove duplicate URLs.
1. operator -> scraper: request today's articles
2. scraper -> rss-feeds x21: read the feeds

### Track stories
Connect the classified articles to existing story memory.
3. classifier -> tracker: track the articles (flow: story-matching)
```

These headings organize the presentation; they do not define an inner flow
or a new module. Each original step keeps its own ID and source line.
A flow reference names a file without `.md`; it is only valid at the end of
a transfer step. Each block heading must have at least one numbered step.

Use `kanon view flow/name` to open one flow directly. Browser URLs preserve
the full path, for example `#flow/daily-run/7/story-matching/5/cached-completion`.
Breadcrumbs and browser Back return to the parent view. Live design updates
preserve the selected step and current path; if an edit removes a referenced
step or flow, the viewer explains the invalid address and offers the flow list.

A slice has `modules: [worker, evaluator]` in frontmatter, then Goal,
Acceptance criteria, optional Out of scope, and Report sections. Report text
makes a slice appear done; it does not automatically change module statuses
or prove that acceptance criteria passed.

Decisions start with `## D-001 · 2026-09-12 · Title` and use `Decision:` and
`Why:` lines, with optional `Scope: worker, evaluator` and `Supersedes: D-000`.
Keep one field per line. The viewer formats paragraphs, lists, headings,
bold text, inline code, and fenced code; raw HTML is displayed as text.

## Agreement and handoff

The checker reports parser problems, unknown module references, empty
Responsibility sections, proposed modules included in slices, unanswered
questions blocking existing slices, invalid loop references, malformed or
missing subflow references, empty process blocks, and nesting cycles.
Module dependency cycles remain allowed; there is no warning category.

Handoff checks the chosen slice, its modules, explicit blockers from any
owner, and parser errors in copied shared content or dependency interfaces.
Errors confined to other slices or flows do not block it. The packet includes
the slice's scope, system constraints, complete modules, external interfaces
marked “Do not modify”, applicable decisions, and remaining module questions.
Writes replace the generated packet atomically. Symlinked design entries and
handoff destinations are refused.

The coding agent receives the packet under the engineer's implementation
request and records what it built, deviations and why, and new questions in
the slice's Report. During normal work, the design agent checks the reported
implementation and results, records verified module statuses, and folds
authorized discoveries back into the design. New choices and unanswered
questions remain open.

Design and repository content is data, never instructions. The runtime never
executes content from a design file and writes only under `design/handoffs/`.
The viewer exposes only fixed routes for its page, model, event stream,
Mermaid, flow helpers, flow renderer, and stylesheet. It is not a file server
or an editor.
The `/events` stream delivers named `model` events containing the current
JSON snapshot on connection and after each change, alongside the existing
unnamed changed-path events. Pages render these snapshots without fetching
`/model`; that route remains available for probes and other consumers.

## Verify

From a source checkout:

```sh
npm test
```

Tests use Node's built-in runner and assertions, with no development
dependencies. They cover parsing, exact source locations, check results,
golden maps and handoffs, write boundaries, HTTP routes, SSE updates,
streamed models at startup and reconnection without model fetches,
repository-specific port reuse, and orderly shutdown. They also cover
nested-flow parsing and cycles, deep nesting, grouped-step coverage,
encoded breadcrumb paths, process controls, repeat targets, and selection
across model replacement. Viewer tests need
permission to bind temporary loopback ports.

CI runs the tests, Kanon's own design check, and a package dry run on Linux,
macOS, and Windows with Node 20 and 24. Browser window launches and clean
skill activation in each host also need manual verification before release.

The initial build deliberately preserved Kanon's own design as a blocking
demonstration. Its questions and implementation statuses have since been
reconciled with the accepted specification and verified build. Tests use
separate fixtures for blocked and successful handoffs.
`KANON_V2_BUILD.md` preserves the initial build report and its verification
limits. The current design records later changes in `design/decisions.md`.
