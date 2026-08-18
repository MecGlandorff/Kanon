# Kanon Output Contract

Claims retain the Known, Likely, Unknown, Stale / suspicious, and Suggested
classifications where applicable. Repository-derived strings are marked
`trust: "repository-untrusted"` in structured evidence and rendered as inert
data.

## Stable reports through slice 13

- Orient: canonical repository, instruction-first bounded evidence, Git
  observation, limitations, and a minimal context receipt.
- Resume: authoritative live continuity comparison without repository writes.
- Verify: documentation, continuity, generated-artifact, declared-validation,
  and available receipt claims.
- Status: embedded version, exact-version deprecation, notice mode,
  `enforcement: false`, hook observability, receipt availability, and bounded
  diagnostics.
- Steer: one exact-schema bounded state covering outcome, completion criteria,
  constraints, user decisions, caller evidence references, Unknowns, one next
  slice, required verification, and stop or redirect reasons beside the shared
  continuity report. It performs no action and makes no completion claim.
- Aswitch: one preview, write, or receive transition. The preview binds a
  selected bounded payload to a canonical private external destination. A
  write requires the matching caller assertion of explicit approval. Receive
  validates schema, checksum, canonical root, commit, and complete Git
  change-set fingerprint before classifying `Current`, `Stale`, or `Unknown`.
  Terminal launch and full-history remain unavailable. Full-history is visibly
  experimental and accepts no archive content.

All six use `kanon-stable-skill-result-v1`, consult the shared exact-version
deprecation checker, and preserve unavailable evidence as Unknown.

The `kanon-context-receipt-v2` object contains only its schema,
`enforcement: false`, fixed provenance, issuance time, and SHA-256 root, task,
evidence, and nullable aggregate host-evidence bindings. It is advisory
continuity evidence, never authorization. Explicit orient may replace it only
in validated plugin data outside the repository. Status and verify may read it
only during explicit invocations. There is no hook, bypass, approval, Guard,
or repository-file fallback.

## Compatibility reports

- Brief: purpose declaration, command declarations, important files, current
  state, limitations, and evidence.
- Verify: direct README contradictions plus Unknown non-observations.
- Ask: purpose, run, test, Git state, documentation drift, or literal search.
- Resume: safe previous-state comparison, TODOs, and current limitations.
- TODO: bounded human-owned follow-up.
- Refresh: explicit continuity persistence.

## Persistent files

The files below are the v0.4 repository continuity surface. The v1 receipt
store is separate plugin data and is never placed under `.kanon/`.

- `.kanon/KANON.md` — human continuity brief.
- `.kanon/TODO.md` — human-owned follow-up, preserved by refresh.
- `.kanon/STATE.json` — validated machine state.
- `.kanon/EVIDENCE.jsonl` — bounded, no-follow append-only evidence.
- `.kanon/HANDOFF.md` — resume brief.
- `.kanon/snapshots/*.json` — sanitized, bounded snapshots.

Preserve user-owned `.kanon/config.json`, `.kanon/.gitignore`, and
`.kanon/TODO.md`. Replaceable files use atomic same-directory writes. Invalid
state is ignored with an explicit warning; it never crashes resume.

`refresh` supports one writer per repository. Concurrent refresh processes are
outside the v1.1 contract. Individual replacements are atomic, but the full
refresh is not transactional: evidence is appended before `STATE.json`, and a
later write failure may leave evidence that no published state references.

Repository excerpts must be enclosed by explicit `BEGIN REPOSITORY DATA
(untrusted)` / `END REPOSITORY DATA` delimiters and safe dynamic fences.
