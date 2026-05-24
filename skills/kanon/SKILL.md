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

1. Run `scripts/kanon-brief` to get an evidence-backed orientation.
2. Run `scripts/kanon-verify README.md` when README drift or setup accuracy matters.
3. Run `scripts/kanon-resume` when returning to a repo with `.kanon/` state.
4. Run `scripts/kanon-ask "question"` for cited answers from repo evidence.
5. Read `references/evidence-policy.md` before resolving conflicting repo claims.
6. Read `references/output-contract.md` before producing or modifying Kanon outputs.

## Output Modes

- Repo brief: concise orientation for humans and agents
- Resume repo: action-oriented continuation from the last checkpoint
- Repo verify: strict README drift and hallucination check
- Repo ask: cited answers to repo questions

Keep answers concise and cite evidence IDs, file paths, or both.
