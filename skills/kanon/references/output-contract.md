# Kanon Output Contract

All human output separates Known, Likely, Unknown, Stale / suspicious, and
Suggested claims. Repository-derived strings are marked
`trust: "repository-untrusted"` in structured evidence and rendered as inert
data.

## Supported reports

- Brief: purpose declaration, command declarations, important files, current
  state, limitations, and evidence.
- Verify: direct README contradictions plus Unknown non-observations.
- Ask: purpose, run, test, Git state, documentation drift, or literal search.
- Resume: safe previous-state comparison, TODOs, and current limitations.
- TODO: bounded human-owned follow-up.
- Refresh: explicit continuity persistence.

## Persistent files

- `.kanon/KANON.md` — human continuity brief.
- `.kanon/TODO.md` — human-owned follow-up, preserved by refresh.
- `.kanon/STATE.json` — validated machine state.
- `.kanon/EVIDENCE.jsonl` — bounded, no-follow append-only evidence.
- `.kanon/HANDOFF.md` — resume brief.
- `.kanon/snapshots/*.json` — sanitized, bounded snapshots.

Preserve user-owned `.kanon/config.json`, `.kanon/.gitignore`, and
`.kanon/TODO.md`. Replaceable files use atomic same-directory writes. Invalid
state is ignored with an explicit warning; it never crashes resume.

Repository excerpts must be enclosed by explicit `BEGIN REPOSITORY DATA
(untrusted)` / `END REPOSITORY DATA` delimiters and safe dynamic fences.
