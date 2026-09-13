# Kanon

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

For Claude Code, load the full plugin for the session:

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

Views are `overview`, `module/name`, `flows`, `decisions`, `questions`, and
`slices`. For example, `kanon view questions` opens another window connected
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
with the [templates](skills/kanon/templates/), replacing their example text
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
other kinds use a rectangle. Mermaid IDs normally replace punctuation with
underscores. Reserved words receive a `module_` prefix and collisions receive
numeric suffixes, keeping distinct modules distinct.

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
questions blocking existing slices, and invalid loop references. It has no
warning category or cycle policy.

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
The viewer exposes only its fixed page, model, event-stream, and Mermaid
asset routes; it is not a file server or an editor.

## Verify

From a source checkout:

```sh
npm test
```

Tests use Node's built-in runner and assertions, with no development
dependencies. They cover parsing, exact source locations, check results,
golden maps and handoffs, write boundaries, HTTP routes, SSE updates,
changes made while the first live connection opens,
repository-specific port reuse, and orderly shutdown. Viewer tests need
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
