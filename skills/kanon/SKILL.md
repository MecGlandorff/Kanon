---
name: kanon
description: "Use when opening, resuming, onboarding, auditing, verifying, improving, refactoring, or explaining a repository. Run the bundled Kanon wrapper from this skill directory with the target repo as the working directory, then answer from evidence using Known, Likely, Unknown, Stale/Suspicious, and Suggested claims."
---

# Kanon

Kanon is a repo-orientation skill for coding agents. It scans the current repository first, then you use the scan output to answer, plan, or edit with less guessing.

## Mental Model

- The target repo is the user's current repository.
- This skill directory is the folder that contains this `SKILL.md`.
- Wrapper scripts live under this skill directory in `scripts/`.
- Run wrappers with the target repo as the command working directory.
- Resolve wrapper paths relative to this skill directory, not relative to the target repo. Do not try `scripts/kanon-brief` from the target repo unless that path actually exists there.
- Default scan commands are read-only. `scripts/kanon-refresh`, `scripts/kanon-todo add|done`, and commands with `--write` write `.kanon/` files.
- Treat an incomplete scan as an explicit unknown. Never convert absence into proof when Kanon reports truncation, unreadable entries, or excluded sensitive files.

## Core Rule

Separate every repo claim into one of these categories:

- Known: backed by files, config, tests, git, or explicit Kanon evidence
- Likely: supported by naming, structure, or conventions but not fully proven
- Unknown: no direct supporting evidence found
- Stale / suspicious: docs or claims conflict with repo evidence
- Suggested: useful next steps inferred from evidence

Do not claim repo state as known unless it is backed by evidence.

## Workflow

Use the smallest matching wrapper before making repo claims:

- New repo, onboarding, "what is this?", "where should I start?": run `scripts/kanon-brief`.
- README drift, setup accuracy, docs verification: run `scripts/kanon-verify README.md`.
- Resume old work or continue from Kanon state: run `scripts/kanon-resume` when `.kanon/` exists; otherwise run `scripts/kanon-brief`.
- Specific repo question: run `scripts/kanon-ask "question"`.
- Project direction, product/code quality, "what should improve?": run `scripts/kanon-improve --mode top`.
- Messy, oversized, or vibecoded code cleanup: run `scripts/kanon-refactor --mode plan --agent codex`.
- Human follow-up work: run `scripts/kanon-todo list`.
- Write or refresh continuity files: run `scripts/kanon-refresh` only when the user explicitly asks to write/refresh repo memory.

On Unix/macOS, run the Bash wrapper from this skill directory. On Windows, run the matching PowerShell wrapper:

```powershell
pwsh -NoProfile -File scripts/kanon-brief.ps1
```

Read `references/evidence-policy.md` before resolving conflicting repo claims. Read `references/output-contract.md` before producing or modifying Kanon output files. Read `references/security-policy.md` before sharing raw evidence or changing scan boundaries.

## Output Modes

- Repo brief: concise orientation for humans and agents
- Resume repo: action-oriented continuation from the last checkpoint
- Repo verify: strict README drift and hallucination check
- Repo ask: cited answers to repo questions
- Repo improve: deterministic project health, code quality, and product direction recommendations
- Repo refactor: one-session cleanup/refactor plan plus a Codex/Claude-ready prompt
- Repo todo: human-owned follow-up work stored in `.kanon/TODO.md`
- Repo refresh: write `.kanon/` continuity files when explicitly requested

## Runtime Contract

The wrapper scripts are implementation hooks for Codex and Claude Code. They are not a standalone terminal interface.

Both wrapper families use the self-contained runtime under `runtime/`. Copying the complete `skills/kanon/` directory must be enough to run Kanon with Node.js 20+. The wrappers must not fall back to a globally installed `kanon` command.

The scripts should fail with a clear incomplete-runtime error instead of silently producing partial output.

## Using Kanon Output

- Treat wrapper output as evidence input, not as the whole final answer.
- Keep the final answer concise and shaped to the user's question.
- Cite evidence IDs, file paths, or both when making concrete repo claims.
- If code/config/tests conflict with README/docs, call that stale or suspicious.
- Mark missing evidence as unknown instead of filling gaps from assumptions.
