# Kanon

Never lose the thread of a repo again.

Kanon changes what an AI coding agent knows about a repo before it answers, plans, or edits.

It briefs the current repo state from files, config, tests, docs, and local Kanon memory: what the repo does, how it works, what is stale, what is unknown, and where to start.

## Quickstart

Run Kanon from the root of a repository you want to inspect:

```bash
npx @mecglandorff/kanon brief
```

Useful commands:

```bash
# Check whether README instructions look stale
npx @mecglandorff/kanon verify README.md

# Ask a repo-orientation question
npx @mecglandorff/kanon ask "what should I read first?"

# Get project improvement direction
npx @mecglandorff/kanon improve --mode top

# Make a one-session refactor plan for messy code
npx @mecglandorff/kanon refactor --mode plan --agent codex

# Optional: write continuity notes
npx @mecglandorff/kanon refresh

# Track human follow-up work for later resume
npx @mecglandorff/kanon todo add "add a README quickstart"
npx @mecglandorff/kanon todo add --stdin < review-notes.md
npx @mecglandorff/kanon todo list
```

`brief`, `verify`, `ask`, `resume`, `improve`, and `refactor` are read-only by default. `refresh` writes `.kanon/` continuity files. `todo` writes human-owned follow-up work to `.kanon/TODO.md`. `improve --write` writes `.kanon/IMPROVEMENTS.md`; `refactor --write` writes `.kanon/REFACTOR_PLAN.md`. The shareable generated brief is `.kanon/KANON.md`; volatile state stays local.

For local development or before using the npm package:

```bash
git clone https://github.com/MecGlandorff/Kanon.git
cd Kanon
npm test
node ./bin/kanon.js brief --root /path/to/other/repo
```

Use Kanon before asking Codex or Claude to work in an unfamiliar repo. Paste the brief into the agent, or let the bundled skill call Kanon first, so repo claims are separated into Known, Likely, Unknown, Stale/Suspicious, and Suggested.

## Why

AI coding agents answer from the context they are given. If that context is a stale README, a partial file view, or an old project memory, the agent can sound confident while being wrong.

Kanon changes the starting point. Before the agent speaks, it reconstructs the repo's current state from evidence and gives humans and agents a shared brief of what is known, likely, unknown, stale, and suggested.

Use it when you clone or fork a repo, return to old work, review someone else's project, or want Codex/Claude to work from reliable repo context instead of guesswork.

Kanon answers:

> I just opened this repo. What does it do, what is trustworthy, what is stale, and where should I start?

## Commands

```bash
kanon brief              # Evidence-backed repo orientation
kanon verify README.md   # README / repo drift report
kanon ask "what is left?"
kanon resume             # Resume from the last Kanon checkpoint
kanon improve            # Choose a 1/2/3 improvement report
kanon improve --mode top # Prioritized project direction
kanon refactor           # Ask steering questions and make a cleanup plan
kanon refactor --mode audit
kanon refactor --mode prompt --agent claude
kanon todo add "..."     # Store human follow-up work
kanon todo add --stdin   # Store a longer note from stdin
kanon todo list          # Show open Kanon todos
kanon todo done 1        # Mark a Kanon todo complete
kanon refresh            # Write .kanon/ continuity files
```

`kanon brief`, `kanon verify`, `kanon ask`, `kanon resume`, `kanon improve`, and `kanon refactor` are read-only by default. Use `kanon refresh`, `kanon todo`, `kanon improve --write`, `kanon refactor --write`, or `--write` on supported commands to write `.kanon/`.

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

`kanon improve` helps decide where to steer the project next from local repo evidence. It uses deterministic rules, not an LLM, so the same repo state produces the same recommendations.

When run in an interactive terminal without `--mode`, Kanon asks:

```text
Choose improvement report: 1) Top 5  2) Full audit  3) Scorecard [1]:
```

Use `--mode top`, `--mode audit`, or `--mode scorecard` for scripts and agents. Non-interactive runs default to `top`.

## Refactor Planning

`kanon refactor` helps turn messy, oversized, or vibecoded areas into a bounded one-session cleanup plan. It scans code, tests, and config evidence first; docs can provide context, but they do not drive refactor claims.

When run interactively, Kanon asks steering questions about the cleanup goal, what must not break, deletion of dead-code candidates, test expectations, and one-session scope. Non-interactive runs use conservative defaults and print the same questions for the coding agent to confirm with the user.

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

The repo ships a Codex/Claude-compatible skill under `skills/kanon/`. Use it when opening, resuming, onboarding, auditing, or explaining a repository.

The skill includes Bash wrappers for Unix/macOS and PowerShell `.ps1` wrappers for Windows.

```text
$kanon
Brief this repo and tell me the safest first contribution.
```

## Development

```bash
npm test
node ./bin/kanon.js brief
node ./bin/kanon.js verify README.md
```
