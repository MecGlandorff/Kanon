---
name: kanon
description: "Use when opening, resuming, onboarding, auditing, verifying, or explaining a repository. Produces an evidence-backed repo brief: what the repo does, how it works, what is done, what is stale, what is left, and where to start. Helps Codex avoid hallucinating repo state from stale docs, incomplete context, or old memory."
---

# Kanon

Kanon provides repo continuity. Use it to orient yourself or another coding agent before changing a repository.

## Core Rule

Separate every repo claim into one of these categories:

- Known: backed by files, config, tests, git, or explicit Kanon evidence
- Likely: supported by naming, structure, or conventions but not fully proven
- Unknown: no direct supporting evidence found
- Stale / suspicious: docs or claims conflict with repo evidence
- Suggested: useful next steps inferred from evidence

Do not claim repo state as known unless it is backed by evidence.

## Workflow

Use `scripts/<name>` on Unix/macOS. Use `pwsh -NoProfile -File scripts/<name>.ps1` on Windows.

1. Run `scripts/kanon-brief` to get an evidence-backed orientation.
2. Run `scripts/kanon-verify README.md` when README drift or setup accuracy matters.
3. Run `scripts/kanon-resume` when returning to a repo with `.kanon/` state.
4. Run `scripts/kanon-ask "question"` for cited answers from repo evidence.
5. Run `scripts/kanon-improve --mode top` when the user asks how to steer the project in a better direction.
6. Run `scripts/kanon-refactor --mode plan` when the user asks to clean up messy, oversized, or vibecoded code.
7. Run `scripts/kanon-todo list` to check human-owned follow-up work.
8. Read `references/evidence-policy.md` before resolving conflicting repo claims.
9. Read `references/output-contract.md` before producing or modifying Kanon outputs.

## Output Modes

- Repo brief: concise orientation for humans and agents
- Resume repo: action-oriented continuation from the last checkpoint
- Repo verify: strict README drift and hallucination check
- Repo ask: cited answers to repo questions
- Repo improve: deterministic project health, code quality, and product direction recommendations
- Repo refactor: one-session cleanup/refactor plan plus a Codex/Claude-ready prompt
- Repo todo: human-owned follow-up work stored in `.kanon/TODO.md`

## Runtime Contract

The wrapper scripts expect the Kanon CLI to be available.

Unix/macOS wrappers are Bash scripts such as `scripts/kanon-brief`. Windows wrappers are PowerShell scripts such as:

```powershell
pwsh -NoProfile -File scripts/kanon-brief.ps1
```

Both wrapper families first try the local package CLI at `../../../bin/kanon.js`, which works when the skill is used from this package checkout or npm package. If that is not available, they use `kanon` from `PATH`.

If neither is available, install the CLI with:

```bash
npm install -g @mecglandorff/kanon
```

The scripts should fail with a clear dependency error instead of silently producing partial output.

Keep answers concise and cite evidence IDs, file paths, or both.
