# Kanon

> **If you only read one line:** Kanon gives coding agents a grounded read of a
> repo before they touch it.

**Kanon — deep repo ingestion before agent action & more.**

Kanon is **ambient repo intelligence** for coding agents. Install it once; Codex
and Claude Code invoke it automatically whenever repository context matters—before
they answer, plan, edit, resume, audit, improve, or refactor.

## Why

Kanon changes the agent's default behavior from *act, then discover* to *ingest,
then act*. It reconstructs the current repo state from code, config, tests, docs,
git, and local memory, then turns that evidence into orientation, verification,
continuity, improvement direction, and refactor plans.

## Install Once

Copy the complete `skills/kanon/` directory into your agent's skills directory.
Use Kanon inside an agent session. Node.js 20+ is required.

The agent selects Kanon at the right moment from its skill triggers. No separate
CLI step or repeated setup prompt is required. Explicit invocation remains
available:

```text
$kanon
Brief this repo and tell me the safest first contribution.
```

Kanon selects the smallest workflow that fits the request:

| Intent | Workflow |
| --- | --- |
| Understand a repo | `brief` |
| Answer a repo question | `ask` |
| Check README drift | `verify` |
| Resume previous work | `resume` |
| Find the highest-value improvements | `improve` |
| Plan a bounded cleanup | `refactor` |
| Track human follow-up | `todo` |
| Refresh continuity memory | `refresh` |

`brief`, `ask`, `verify`, `resume`, `improve`, and `refactor` are read-only by
default. Writes are explicit through `refresh`, `todo`, or supported `--write`
flags.

## Evidence Contract

Every repo claim is classified as:

- **Known** — backed by files, config, tests, git, or Kanon evidence
- **Likely** — supported by structure or convention, but not proven
- **Unknown** — missing direct evidence
- **Stale / suspicious** — contradicted by stronger repo evidence
- **Suggested** — a useful next step inferred from evidence

Code, config, and tests outrank documentation for current behavior. Incomplete
scans remain unknown.

## Output

Explicit write workflows use `.kanon/`:

```text
KANON.md          repo brief
HANDOFF.md        resume brief
TODO.md           human follow-up
IMPROVEMENTS.md   project direction
REFACTOR_PLAN.md  bounded cleanup plan
STATE.json        machine state
EVIDENCE.jsonl    evidence trail
snapshots/        historical state
```

Human-readable briefs and plans are shareable. Volatile machine state stays local.

## Runtime Contract

`skills/kanon/` is the supported integration artifact. Its Bash and PowerShell
wrappers call the bundled runtime from the repository being inspected. They are
agent hooks—not a standalone CLI or global package.

## Development

```bash
npm run build:skill
npm run validate
```

MIT
