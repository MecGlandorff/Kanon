# Changelog

## 0.4.0-rc.1

Patched trust-repair prerelease.

### Public contract

- Ship only `brief`, `verify`, `resume`, `refresh`, `todo`, and narrowly scoped
  `ask`.
- Restrict `ask` to purpose, declared run/test candidates, Git state,
  documentation drift, and explicit literal search.
- Remove scorecards, improvement/refactor advice, dead-code advice, numeric
  health scores, and agent prompts from the generated skill and package.

### Safety and epistemics

- Enforce canonical repository containment for reads, `.kanon/` writes,
  package staging, and evaluation caches; reject links and reparse points.
- Harden all Git subprocesses against repository-controlled fsmonitor, hooks,
  config, `PATH` executables, prompts, locks, pagers, timeout, and output
  overflow.
- Treat repository prose, paths, Git metadata, commands, state, and TODOs as
  untrusted data with terminal, Unicode-bidi, Markdown, and delimiter safety.
- Require definition review and explicit user approval before any declared
  command candidate is executed.
- Reserve Stale / suspicious for direct contradictions. Non-observation,
  exclusions, incomplete scans, and failed Git inspection remain Unknown.
- Add complete config validation, safe malformed-state recovery, scanner and
  subprocess budgets, bounded text caching, and retention limits.

### Evaluation and release

- Remove corpus-shaped production rules and register every production heuristic
  with an ecosystem-level rationale and failure modes.
- Require complete release selection, exact corpus hash, every dimension and
  category gate, coverage, abstentions, uncertainty intervals, and per-case
  error capture.
- Build from an explicit allowlist, pack once, install and exercise the exact
  tarball on Ubuntu, Windows, and macOS, and bind all reports to one SHA-256.
- Pin GitHub Actions to full commits and gate trusted npm publication behind a
  protected workflow-dispatch candidate.
- Preserve a complete development report for prereleases even when its quality
  thresholds remain failed; stable releases still require those thresholds.

No held-out capability estimate is claimed for this prerelease. Stable
`0.4.0` remains blocked until independently created labels are sealed before
predictions and the complete frozen holdout passes once without post-result
product changes.
