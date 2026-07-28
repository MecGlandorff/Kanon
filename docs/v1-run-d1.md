# Kanon v1 Run D.1 proof record

Date: 2026-07-28

Scope: product slices 14 and 15 only. This record does not authorize slice 16,
live model trials, corpus work, candidate freeze, holdout evaluation, release,
or publication. `V_1design.md` and historical Guard evidence remain frozen.

## Epistemic boundary

- Known: deterministic local tests can prove source and installed-artifact
  behavior on the current macOS arm64 host.
- Known: CI declares validation across Ubuntu, Windows, and macOS and declares
  installed-artifact conformance for all three operating systems.
- Unknown: no workflow run for another operating system is evidence in this
  local run. Native Windows and Ubuntu results remain Unknown.
- Unknown: Codex CLI and Claude Code do not provide proven production
  plugin-data or lifecycle wiring. Synthetic adapter context is test evidence
  only and cannot establish that capability.
- Unavailable: Guard, automatic lifecycle notice, terminal launch adapters,
  and full-history transfer remain outside the shipped capability surface.

## Slice 14 invariant-to-test matrix

The test names below are the review keys. A row is accepted only when its
listed tests and the complete validation suite pass.

| Stable surface | Declared invariant | Deterministic proof |
| --- | --- | --- |
| orient | Instructions precede bounded evidence; hostile content is inert; incomplete evidence stays Unknown; repository and Git index bytes and mtimes do not change. | `all six stable skills treat hostile repository content as data`; `instruction candidate limits remain explicit Unknown evidence`; `all six stable read or preview workflows preserve repository and Git index bytes and mtimes` |
| resume | Shared continuity is live-authoritative, bounded, and read-only; malformed state recovers as Unknown. | `live state wins and differences remain separately classified`; `malformed persisted continuity is ignored without mutation`; read/preview preservation proof |
| verify | Contradictions are distinct from non-observation; incomplete, truncated, excluded, or unexecuted evidence cannot establish absence or success. | `incomplete scan evidence prevents absence conclusions`; `declared-validation Unknown prevents an aggregate Known claim`; `unobserved declared-validation execution prevents aggregate Known`; read/preview preservation proof |
| status | Embedded facts remain separate from Unknown host/lifecycle/plugin-data state; notice is explicit and non-enforcing. | `status preserves installed facts when repository root evidence is invalid`; `explicit status output carries advisory notice with no interception claim` |
| steer | Exactly one bounded slice; no authorization, completion claim, agent management, execution, or hidden persistence. | `steer state is one bounded non-authorizing deterministic loop`; `steer rejects malformed, ambiguous, oversized, and multi-slice state`; read/preview preservation proof |
| aswitch | Preview approval binds root, Git identity, change set, payload, destination path, and destination identity; only a bounded external handoff may be written; launch stays manual. | `approval is rebound after root, Git, payload, destination, or change-set changes`; `last-plan preview gates one external write and returns only a manual fallback`; `handoff writes reject repository overlap, links, replacement, and exhausted budgets` |
| compatibility routes | Only brief, narrow ask, resume, refresh, TODO, and verify remain; read routes do not execute repository commands or change repository/Git index bytes or mtimes. | `CLI exposes the narrowed public surface and rejects removed modes`; `declared commands are data and always require definition review`; `every compatibility read workflow preserves repository and Git index bytes and mtimes`; installed wrapper conformance |
| deprecation checking | Fixed origin, exact version, bounded transport, strict content type/status/redirect handling, fail-open Unknown, and bounded sticky cache. | all cases in `test/v1-deprecation.test.js`, including malformed, oversized, redirect, timeout, offline, content-type, cache, TLS, and hostile transport proofs |
| receipt persistence | Receipts are non-authorizing evidence; only direct root, task, or evidence contradiction is Stale; unavailable lifecycle evidence remains Unknown; retention is bounded. | all cases in `test/v1-receipts.test.js`; `malformed, overbroad, and cross-root receipts remain Unknown or Stale` |
| plugin-data storage | Canonical private external root only; no repository fallback; links, hard links, ancestor links, malformed/oversized state, and unsafe replacement fail closed. | receipt-store cases in `test/v1-receipts.test.js`; handoff replacement/link cases in `test/v1-aswitch.test.js` |
| handoff storage | Content-derived name and checksum bind content; wrong host or known identity mismatch is Stale; unavailable/truncated/sensitive Git evidence is Unknown; directory entry, file-count, and byte budgets are enforced. | `receiving validation distinguishes Current, Stale, and Unknown`; `handoff writes reject repository overlap, links, replacement, and exhausted budgets` |
| Git observation | Trusted executable only; repository config/hooks/fsmonitor are disabled; output, timeout, status, path, and change budgets are explicit; index bytes and mtime are preserved. | Git cases in `test/v1-skills-adversarial.test.js`; read/preview preservation proof |
| generated wrappers | Bash and PowerShell derive from one generator, use fixed arguments and hardened environment, and are byte-synchronized with source generation. Native execution is claimed only where available. | `generated skill artifact is synchronized and self-contained`; `package builder uses an exact production allowlist`; installed wrapper conformance |
| installed artifact | Exact allowlist; six stable skills and approved compatibility wrappers; zero runtime dependencies; no development tools, Guard spikes, hooks, launchers, transcript readers, or undocumented host-state access. | `package builder uses an exact production allowlist`; `declared CI proof covers validation and installed conformance on all supported operating systems`; `scripts/conform-artifact.js` |

## Adversarial family coverage

| Family | Proof |
| --- | --- |
| Malformed, unexpected-key, oversized, deeply nested, cyclic, getter-bearing, and proxy-like values | adapter, steer, receipt, handoff, continuity, and registry cases; `getter-bearing, proxy-like, cyclic, deep, and unexpected adapter inputs fail closed` |
| ANSI, OSC, newlines, hostile Markdown, bidi/direction marks, and hostile paths | `all six stable skills treat hostile repository content as data`; sanitization, path, handoff, Git, and wrapper cases |
| Prompt injection in README, package metadata, filenames, Git metadata, TODO, continuity, steer, handoff, and validation claims | adversarial stable-skill, compatibility, steer, aswitch, continuity, and verify suites |
| Linked file, hard-link, ancestor-link, destination-replacement, and external-marker safety | persistence, receipt, repository containment, and handoff storage cases |
| Handoff checksum, content-derived filename, receiver host/commit/change-set, incomplete Git, truncation, sensitive exclusion, timeout/overflow/nonzero status | receiving and Git cases in `test/v1-aswitch.test.js` and `test/v1-skills-adversarial.test.js` |
| Read-only repository and Git-index preservation | read/preview preservation proof compares SHA-256, size, and nanosecond mtime after each stable workflow |
| Installed exclusions and wrapper behavior | package allowlist tests plus exact-tarball installed conformance |

## Platform proof matrix

| Platform | Local native proof | CI/conformance declaration | Classification |
| --- | --- | --- | --- |
| macOS arm64 | Node runtime, Git, Bash wrappers, package build, install, and conformance run locally; PowerShell unavailable. | macOS validation and exact-artifact conformance declared. | Known for observed local surfaces; PowerShell Unknown |
| Ubuntu | Not run in this local Run D.1. | Ubuntu validation and exact-artifact conformance declared. | Unknown |
| Windows | Not run in this local Run D.1. | Windows validation and exact-artifact conformance declared, including native PowerShell wrapper execution. | Unknown |

## Slice status

- Slice 14: accepted. The final focused command reported 92 tests: 91 passed,
  0 failed, and 1 skipped because PowerShell was unavailable. The complete
  `npm run validate` command reported 214 tests: 212 passed, 0 failed, and 2
  skipped (PowerShell unavailable and Windows-only junction proof). Strict
  checked-JavaScript validation reported zero diagnostics for its pre-slice-15
  scope. Generated synchronization, JavaScript syntax checks, installed
  exact-tarball conformance on the current host, and `git diff --check` passed.
  Raw-diff review found no remaining slice-14 P0 or P1.
- Slice 15: not started in this record until slice 14 is accepted and
  committed separately.
