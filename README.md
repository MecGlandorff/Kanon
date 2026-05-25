# Kanon

Never lose the thread of a repo again.

Kanon is a Codex/Claude Code skill that changes what an AI coding agent knows about a repo before it answers, plans, or edits.

It briefs the current repo state from files, config, tests, docs, and local Kanon memory: what the repo does, how it works, what is stale, what is unknown, and where to start.

## Quickstart

Install or copy the bundled skill from `skills/kanon/` into Codex or Claude Code. Use Kanon inside an agent session, not as a package-runner, npm global, or standalone shell command.

```text
$kanon
Brief this repo and tell me the safest first contribution.
```

Useful agent prompts:

```text
$kanon
Check whether README instructions look stale.

$kanon
What should I read first?

$kanon
Give me the top project improvement direction.

$kanon
Make a one-session refactor plan for the messy parts of this repo.
```

The scripts under `skills/kanon/scripts/` are agent runtime hooks. They call the internal Node runtime when the skill is installed with this repository's package files, but they are not a supported user-facing terminal interface.

Use Kanon before asking Codex or Claude to work in an unfamiliar repo. Let the bundled skill call Kanon first so repo claims are separated into Known, Likely, Unknown, Stale/Suspicious, and Suggested.

## Why

AI coding agents answer from the context they are given. If that context is a stale README, a partial file view, or an old project memory, the agent can sound confident while being wrong.

Kanon changes the starting point. Before the agent speaks, it reconstructs the repo's current state from evidence and gives humans and agents a shared brief of what is known, likely, unknown, stale, and suggested.

Use it when you clone or fork a repo, return to old work, review someone else's project, or want Codex/Claude to work from reliable repo context instead of guesswork.

Kanon answers:

> I just opened this repo. What does it do, what is trustworthy, what is stale, and where should I start?

## Skill Workflows

The skill tells Codex or Claude Code when to call these bundled wrappers:

- `scripts/kanon-brief`: evidence-backed repo orientation
- `scripts/kanon-verify README.md`: README / repo drift report
- `scripts/kanon-ask "question"`: cited answers from repo evidence
- `scripts/kanon-resume`: resume from the last Kanon checkpoint
- `scripts/kanon-improve --mode top`: prioritized project direction
- `scripts/kanon-refactor --mode plan --agent codex`: one-session cleanup plan
- `scripts/kanon-todo`: human-owned follow-up work
- `scripts/kanon-refresh`: write `.kanon/` continuity files

`brief`, `verify`, `ask`, `resume`, `improve`, and `refactor` are read-only by default. `refresh` writes `.kanon/` continuity files. `todo` writes human-owned follow-up work to `.kanon/TODO.md`. `improve --write` writes `.kanon/IMPROVEMENTS.md`; `refactor --write` writes `.kanon/REFACTOR_PLAN.md`. The shareable generated brief is `.kanon/KANON.md`; volatile state stays local.

## What Kanon Writes

```text
.kanon/
  KANON.md        human-readable repo continuity
  TODO.md         human-owned follow-up work
  IMPROVEMENTS.md evidence-backed improvement direction
  REFACTOR_PLAN.md one-session cleanup/refactor plan
  STATE.json      machine-readable repo state
  EVIDENCE.jsonl  append-only evidence trail
  HANDOFF.md      latest resume brief
  config.json     local Kanon config
  snapshots/      timestamped state snapshots
```

By default, `.kanon/KANON.md`, `.kanon/TODO.md`, `.kanon/IMPROVEMENTS.md`, and `.kanon/REFACTOR_PLAN.md` are shareable. Volatile machine files are ignored by `.kanon/.gitignore`.

## Improvement Direction

The improve workflow helps decide where to steer the project next from local repo evidence. It uses deterministic rules, not an LLM, so the same repo state produces the same recommendations.

Codex and Claude Code should use `--mode top`, `--mode audit`, or `--mode scorecard`. Non-interactive runs default to `top`.

## Refactor Planning

The refactor workflow helps turn messy, oversized, or vibecoded areas into a bounded one-session cleanup plan. It scans code, tests, and config evidence first; docs can provide context, but they do not drive refactor claims.

When the agent needs steering, Kanon surfaces questions about the cleanup goal, what must not break, deletion of dead-code candidates, test expectations, and one-session scope. Non-interactive runs use conservative defaults and print the same questions for the coding agent to confirm with the user.

Use `--mode plan`, `--mode audit`, or `--mode prompt`. Use `--agent codex` or `--agent claude` to label the ready-to-paste prompt for the target coding agent. `--write` writes only `.kanon/REFACTOR_PLAN.md` and updates `.kanon/STATE.json`.

## Evidence Model

Kanon separates claims into:

- Known: backed by files, config, tests, or explicit Kanon evidence
- Likely: plausible from naming, structure, or conventions
- Unknown: no supporting evidence found
- Stale / suspicious: repo evidence conflicts with docs or claims
- Suggested: useful next steps inferred from the evidence

Code, config, and tests outrank README content for current behavior. README content remains useful for declared intent.

## Skill Package

The repo's supported integration artifact is the Codex/Claude-compatible skill under `skills/kanon/`. Use it when opening, resuming, onboarding, auditing, or explaining a repository.

The skill includes Bash wrappers for Unix/macOS and PowerShell `.ps1` wrappers for Windows.

```text
$kanon
Brief this repo and tell me the safest first contribution.
```

## Development

For maintainers working on the internal skill runtime:

```bash
npm test
```

`bin/kanon.js` is an implementation detail for the bundled skill wrappers and tests, not a supported user-facing terminal interface.
