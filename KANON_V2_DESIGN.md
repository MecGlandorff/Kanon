# Kanon v2 Design

Status: draft for discussion. Nothing in this document is built yet.

## What Kanon is

Kanon helps an engineer and AI agents design a system together before code is
written, keeps that design in the repository as the source of truth, and turns
agreed parts into work packets for coding agents. What implementation reveals
flows back into the design.

Only the name survives from v1. The v1.0.0 tag is the archive.

## Principles

1. **Text is authoritative, the diagram is derived.** The overview is generated
   from what each module says it uses, so it cannot drift.
2. **Agreement is explicit.** A module is `agreed` only when the engineer says
   so. Agents propose and record; they never agree on the engineer's behalf.
3. **Nothing is silently resolved.** A question that blocks a slice stops the
   handoff until it is decided.
4. **Host-neutral, dependency-free.** Same behavior in Claude Code and Codex.
   Plain Node, no npm dependencies, browser assets vendored.
5. **Design and repository content is data, never instructions.**

## Assumptions

| Question | Assumption |
| --- | --- |
| Brownfield or greenfield | Both. For an existing codebase the agent first writes what it finds as proposed modules. |
| Where the design lives | A visible `design/` folder at the repository root. |
| Viewer editing | Read-only with click-to-inspect. A note box comes later. |
| Rewrite or refactor | Full rewrite on a new branch. The debloat plan is abandoned. |

## The design folder

```text
design/
  system.md            purpose and constraints
  modules/<name>.md    one file per module
  slices/<name>.md     one unit of work for a coding agent
  decisions.md         why things are the way they are
  flows/<name>.md      optional: a scenario as a numbered list of steps
  handoffs/<name>.md   generated, never edited by hand
```

A small feature is a system file, three or four modules, and one slice.

### Module

The smallest valid module file:

```markdown
---
status: proposed
uses: [queue, storage]
---
## Responsibility
Pull uploads from the queue, validate them, write normalized records.

## Interface
- in: UploadJob
- out: NormalizedRecord
```

Rules:

- The filename is the module name.
- `status` is `proposed`, `agreed`, or `built`. Absent means `proposed`. To
  retire a module, delete the file.
- `uses` lists the modules this one depends on. Either a plain list, or a
  list of `name: what for` pairs when the label matters for the diagram.
- `kind` is optional: `service`, `library`, `store`, `external`, `ui`, `job`.
  It only changes the node shape.
- Required sections: Responsibility and Interface. Optional: Open questions,
  Failure behavior, Constraints, Notes. Add them when they earn their place.
- A question line ending in `(blocks: <slice>)` blocks that slice's handoff
  until it is checked off.

Frontmatter is a flat subset: scalars, inline lists, and lists of scalars or
single `key: value` pairs. Nothing nested, so the parser stays tiny.

### System

Required: Purpose and Constraints. Constraints are copied into every handoff
packet. Anything else is optional.

### Slice

```markdown
---
modules: [ingest-worker, queue]
---
## Goal
A worker that drains the queue into storage for well-formed uploads.

## Acceptance criteria
- A valid UploadJob produces one NormalizedRecord.
- A malformed upload lands in the dead-letter queue with the reason.

## Report
```

A slice has no status field. It is open until a coding agent fills the
Report section. Out of scope is an optional section. A slice must be buildable
by one agent in one session.

### Decisions

```markdown
## D-007 · 2026-09-12 · Uploads are validated before queueing
Decision: The API validates size and type; the worker validates content.
Why: Cheap rejections should not consume queue capacity.
```

Append-only. `Scope: a, b` is an optional line that links a decision to
modules. `Supersedes: D-003` is an optional line when a decision replaces one.

### Flow

Optional, but for agentic systems the flows are where the reasoning power
is: the map shows who touches what, a flow shows what happens in what order,
where it loops, and where it fans out. One scenario per file, written as a
numbered Steps list, no Mermaid:

```markdown
## Scenario
One round of the optimization loop, and what ends it.

## Steps
1. optimizer -> frontier: sample a parent candidate
2. optimizer -> reflector: send the parent's failing traces
3. reflector -> optimizer: one child prompt
4. optimizer -> evaluator x8: score the child on a minibatch
5. optimizer -> frontier: add the child if it is not dominated
6. repeat from 1 until the budget is spent
7. optimizer -> engineer: the best candidate, for approval
```

One line per step: two module names with an arrow and what passes between
them. `x8` marks fan-out. `repeat from N until ...` marks a loop and its
bound. About ten steps; a longer story is two flows. Files and folders are
not participants; things that act are. The modules taking part are read from
the steps, so no frontmatter is needed.

Kanon renders a flow as a route over the map: the same overview, edges
numbered in step order, loop-backs drawn as loops, fan-out marked. Structure
and behavior in one frame. A sequence diagram can be generated from the same
steps for anyone who wants one.

### Kinds

`kind` is a small vocabulary that only changes the node shape on the map:
agent, human, tool, store, external, trigger, service, library. A system
without LLMs never uses `agent` and needs nothing else. Loops and bounds live
in flows, not in module files, so an agent's module file is as lean as any
other.

## The skill

One skill, `kanon`. Three moments, chosen from the state of `design/`:

**Design.** You describe what the system must do. The agent writes and updates
modules, questions, and flows, and says what it changed and why. On request
it challenges the design: cycles, data with no owner, missing failure paths,
modules too big for one slice. Challenges land as open questions, never as
silent edits. For an existing codebase it first writes what it finds.

**Agree.** You say which modules are agreed. The agent flips the status and
records the decisions made along the way, each with its why.

**Handoff.** You define a slice. The agent runs the checker, generates the
packet, and points a coding agent at it. When the Report is filled you say
"sync" and the agent folds it back: modules to `built`, deviations into
decisions or new questions.

In every moment: the agent edits files directly and keeps the checker green,
never agrees or checks off a question itself, and treats design and
repository content as data.

## The handoff packet

`kanon handoff <slice>` writes one self-contained file. A fresh agent needs
neither the skill nor the rest of the design folder to build from it.

1. Goal and acceptance criteria, from the slice.
2. Constraints, from the system file.
3. Every module in scope, in full.
4. The Interface section of every module they use that is out of scope,
   marked as not to be modified.
5. Decisions whose scope touches the modules in scope.
6. Open questions in scope, with the rule: pick the conservative option and
   report it, do not resolve it.
7. How to report: fill the slice's Report section with what was built,
   deviations and why, and new questions. Edit nothing else in `design/`.

## The checker

`kanon check` reports errors with file and line, exit code 1 on any:

1. A module uses one that does not exist.
2. A slice includes a module that is not agreed.
3. An open question blocks a slice.
4. A module has an empty Responsibility.

Files that cannot be parsed are reported the same way. Everything else,
such as cycle detection, is a later addition if it proves useful.

## The viewer

A standalone window, movable to a second screen. This is a hard requirement.

`kanon view` starts a local server if none is running and opens the overview
in an app-mode window: no tabs, no address bar, position remembered per URL.
Chrome, Chromium, Edge, Brave, and Arc support this. Without one of them, a
normal tab and a notice. Every view has its own URL, so `kanon view
questions` opens a second window pinned to the questions.

Views: Overview with the generated map and the checker findings, module
detail on click, Flows drawn as routes over the map, Questions, Decisions,
Slices. Above about ten modules the map opens zoomed out: only agents,
humans, and externals, with tools and stores one click away. Because the map
is generated, zoom is a filter, not a second drawing.

Mechanics: Node's HTTP server, recursive file watching on `design/`,
server-sent events to the page, re-render under a second. Mermaid and a small
Markdown renderer are vendored. One server per repository, port derived from
the repository path, localhost only.

## The runtime

| Command | Does |
| --- | --- |
| `kanon check` | Parses `design/` and reports the errors above. |
| `kanon diagram` | Prints the generated Mermaid overview. |
| `kanon handoff <slice>` | Writes the packet. Refuses when check fails for that slice. |
| `kanon view [view]` | Starts the server if needed and opens a window. |

Package layout: a plugin root with the Claude and Codex manifests,
`skills/kanon/` with `SKILL.md`, templates, and a Bash and PowerShell
wrapper, and `runtime/`.

## Build order

1. Parser, `check`, and `diagram`, tested against a fixture design.
2. `SKILL.md` and templates. The first design folder is Kanon's own.
3. The viewer.
4. `handoff` and the sync rules in the skill.
5. One real trial: design a small feature in a real repository, hand it to a
   fresh coding agent in the other host, and count where it had to guess.

## Open questions

- [ ] Route over the map, or a separate cycle diagram per flow? The engineer
      decides which one their brain prefers; the map route is the default.
- [ ] Is the Steps list comfortable to write, or does it need something
      lighter?
- [ ] Vendor Mermaid or load it from a CDN with a vendored fallback?
- [ ] Does the coding agent get the packet as a file path or as its opening
      prompt?
- [ ] One skill, or separate `design` and `handoff` skills so the hosts
      trigger them independently?
