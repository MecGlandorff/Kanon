# Kanon Output Contract

Kanon output must help a human or coding agent answer: what is going on in this repo, what is stale, what is left, and where should work start?

## Required Claim Buckets

- Known
- Likely
- Unknown
- Stale / suspicious
- Suggested

## Repo Brief Sections

- What this repo does
- How to run
- How to test
- Important files
- Current implementation state
- Unknowns
- Suggested starting points
- Evidence used

## Improve Sections

- Top recommendations
- Full audit grouped by project health, code quality, and product strategy
- Scorecard with category scores and evidence-backed reasons

## Refactor Sections

- User steering questions and answers/defaults
- Primary refactor target from code/test/config evidence
- One-session implementation plan
- Do-not-touch constraints
- Deletion policy requiring user confirmation for dead-code candidates
- Ready-to-paste Codex/Claude prompt

## Persistent Files

`.kanon/KANON.md` is the human continuity document.

`.kanon/TODO.md` is the human-owned follow-up list. Preserve it during refresh; do not rewrite it destructively.

`.kanon/IMPROVEMENTS.md` is the write-on-request direction report from `kanon improve --write`.

`.kanon/REFACTOR_PLAN.md` is the write-on-request cleanup plan from `kanon refactor --write`.

`.kanon/STATE.json` is machine-readable state.

`.kanon/EVIDENCE.jsonl` is append-only evidence.

`.kanon/HANDOFF.md` is the quick resume brief.

Do not store large, volatile repo summaries in `AGENTS.md`; use `AGENTS.md` only to point agents to Kanon.
