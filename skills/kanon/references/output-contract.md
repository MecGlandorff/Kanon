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

## Persistent Files

`.kanon/KANON.md` is the human continuity document.

`.kanon/STATE.json` is machine-readable state.

`.kanon/EVIDENCE.jsonl` is append-only evidence.

`.kanon/HANDOFF.md` is the quick resume brief.

Do not store large, volatile repo summaries in `AGENTS.md`; use `AGENTS.md` only to point agents to Kanon.
