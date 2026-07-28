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
- Slice 15: accepted. The focused type, artifact, compatibility, adversarial,
  and scope command reported 129 tests: 127 passed, 0 failed, and 2 skipped
  (PowerShell unavailable and the Windows-only junction proof). The complete
  `npm run validate` command reported 216 tests: 214 passed, 0 failed, and 2
  skipped for the same evidence-specific reasons. Strict checked-JavaScript
  validation reported zero diagnostics across all 86 shipped canonical
  runtime sources. Generated synchronization, JavaScript syntax, JSON parsing,
  deterministic packing, installed-artifact conformance, and
  `git diff --check` passed. Raw-diff review found no remaining slice-15 P0 or
  P1.

## Slice 15 stable runtime inventory

Every installed executable JavaScript module maps to exactly one canonical
source. `test/v1-types.test.js` requires all 86 canonical sources to appear in
the strict TypeScript project, requires each generated runtime target to be
byte-equivalent to its canonical source, and requires the target set to equal
the complete JavaScript inventory under `runtime/`. The inventory comprises 27
v1 modules and 59 compatibility modules.

| Installed runtime module | Strictly checked canonical source |
| --- | --- |
| `runtime/adapters/claude.js` | `src/v1/adapters/claude.js` |
| `runtime/adapters/codex.js` | `src/v1/adapters/codex.js` |
| `runtime/adapters/shared.js` | `src/v1/adapters/shared.js` |
| `runtime/bin/kanon-v1.js` | `src/v1/bin/kanon.js` |
| `runtime/bin/kanon.js` | `bin/kanon.js` |
| `runtime/cli.js` | `src/v1/cli.js` |
| `runtime/core/build-metadata.js` | `src/v1/core/build-metadata.js` |
| `runtime/core/handoff-store.js` | `src/v1/core/handoff-store.js` |
| `runtime/core/handoff.js` | `src/v1/core/handoff.js` |
| `runtime/core/plugin-data.js` | `src/v1/core/plugin-data.js` |
| `runtime/core/receipt-store.js` | `src/v1/core/receipt-store.js` |
| `runtime/core/receipt.js` | `src/v1/core/receipt.js` |
| `runtime/core/steer-state.js` | `src/v1/core/steer-state.js` |
| `runtime/core/trust.js` | `src/v1/core/trust.js` |
| `runtime/registry/cache.js` | `src/v1/registry/cache.js` |
| `runtime/registry/deprecation.js` | `src/v1/registry/deprecation.js` |
| `runtime/registry/sanitize.js` | `src/v1/registry/sanitize.js` |
| `runtime/registry/transport.js` | `src/v1/registry/transport.js` |
| `runtime/repository/git.js` | `src/v1/repository/git.js` |
| `runtime/repository/inspect.js` | `src/v1/repository/inspect.js` |
| `runtime/repository/read.js` | `src/v1/repository/read.js` |
| `runtime/skills/aswitch.js` | `src/v1/skills/aswitch.js` |
| `runtime/skills/invoke.js` | `src/v1/skills/invoke.js` |
| `runtime/skills/orient.js` | `src/v1/skills/orient.js` |
| `runtime/skills/resume.js` | `src/v1/skills/resume.js` |
| `runtime/skills/status.js` | `src/v1/skills/status.js` |
| `runtime/skills/steer.js` | `src/v1/skills/steer.js` |
| `runtime/skills/verify.js` | `src/v1/skills/verify.js` |
| `runtime/src/analyze.js` | `src/analyze.js` |
| `runtime/src/analyze/current-state.js` | `src/analyze/current-state.js` |
| `runtime/src/analyze/entrypoints.js` | `src/analyze/entrypoints.js` |
| `runtime/src/analyze/findings.js` | `src/analyze/findings.js` |
| `runtime/src/analyze/metadata.js` | `src/analyze/metadata.js` |
| `runtime/src/analyze/project-signals.js` | `src/analyze/project-signals.js` |
| `runtime/src/analyze/utils.js` | `src/analyze/utils.js` |
| `runtime/src/ask.js` | `src/ask.js` |
| `runtime/src/ask/intent.js` | `src/ask/intent.js` |
| `runtime/src/cli.js` | `src/cli.js` |
| `runtime/src/cli/args.js` | `src/cli/args.js` |
| `runtime/src/cli/index.js` | `src/cli/index.js` |
| `runtime/src/cli/io.js` | `src/cli/io.js` |
| `runtime/src/cli/todo.js` | `src/cli/todo.js` |
| `runtime/src/code-intel.js` | `src/code-intel.js` |
| `runtime/src/code-intel/command-utils.js` | `src/code-intel/command-utils.js` |
| `runtime/src/code-intel/commands.js` | `src/code-intel/commands.js` |
| `runtime/src/code-intel/constants.js` | `src/code-intel/constants.js` |
| `runtime/src/code-intel/conventional-commands.js` | `src/code-intel/conventional-commands.js` |
| `runtime/src/code-intel/curate-common.js` | `src/code-intel/curate-common.js` |
| `runtime/src/code-intel/curate.js` | `src/code-intel/curate.js` |
| `runtime/src/code-intel/documented-commands.js` | `src/code-intel/documented-commands.js` |
| `runtime/src/code-intel/entrypoints.js` | `src/code-intel/entrypoints.js` |
| `runtime/src/code-intel/heuristics.js` | `src/code-intel/heuristics.js` |
| `runtime/src/code-intel/imports.js` | `src/code-intel/imports.js` |
| `runtime/src/code-intel/index.js` | `src/code-intel/index.js` |
| `runtime/src/code-intel/manifest-commands.js` | `src/code-intel/manifest-commands.js` |
| `runtime/src/code-intel/rank.js` | `src/code-intel/rank.js` |
| `runtime/src/code-intel/shared.js` | `src/code-intel/shared.js` |
| `runtime/src/config.js` | `src/config.js` |
| `runtime/src/continuity/engine.js` | `src/continuity/engine.js` |
| `runtime/src/evidence.js` | `src/evidence.js` |
| `runtime/src/git-runner.js` | `src/git-runner.js` |
| `runtime/src/git.js` | `src/git.js` |
| `runtime/src/path-security.js` | `src/path-security.js` |
| `runtime/src/persist.js` | `src/persist.js` |
| `runtime/src/persistence/safe-fs.js` | `src/persistence/safe-fs.js` |
| `runtime/src/persistence/state-fields.js` | `src/persistence/state-fields.js` |
| `runtime/src/persistence/state.js` | `src/persistence/state.js` |
| `runtime/src/readme.js` | `src/readme.js` |
| `runtime/src/render.js` | `src/render.js` |
| `runtime/src/render/ask.js` | `src/render/ask.js` |
| `runtime/src/render/brief.js` | `src/render/brief.js` |
| `runtime/src/render/continuity.js` | `src/render/continuity.js` |
| `runtime/src/render/shared.js` | `src/render/shared.js` |
| `runtime/src/scanner.js` | `src/scanner.js` |
| `runtime/src/scanner/ignore.js` | `src/scanner/ignore.js` |
| `runtime/src/scanner/policy.js` | `src/scanner/policy.js` |
| `runtime/src/scanner/read.js` | `src/scanner/read.js` |
| `runtime/src/scanner/scan.js` | `src/scanner/scan.js` |
| `runtime/src/scanner/shared.js` | `src/scanner/shared.js` |
| `runtime/src/trust.js` | `src/trust.js` |
| `runtime/src/verify.js` | `src/verify.js` |
| `runtime/src/verify/claims.js` | `src/verify/claims.js` |
| `runtime/src/verify/commands.js` | `src/verify/commands.js` |
| `runtime/src/verify/index.js` | `src/verify/index.js` |
| `runtime/src/verify/language.js` | `src/verify/language.js` |
| `runtime/src/version.js` | `src/version.js` |

The strict project enables `allowJs`, `checkJs`, `strict`,
`strictNullChecks`, `useUnknownInCatchVariables`,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitReturns`, `noFallthroughCasesInSwitch`, and `noEmit`. Runtime
mirrors stay outside the project only because byte equivalence to the checked
source is a deterministic build invariant.

## Slice 15 correction and simplicity review

- Strict typing began with 952 diagnostics across 50 compatibility files,
  including 723 implicit-parameter diagnostics. The ratchet was completed
  without `any`, `@ts-ignore`, `@ts-nocheck`, transpilation, runtime
  dependencies, or an unchecked compatibility escape hatch.
- Hostile compatibility state and option values now require own plain data
  properties. Getter-bearing and proxy objects fail closed without invoking
  user-defined getters or proxy traps.
- Package export discovery now has explicit nesting and entry budgets, so
  adversarial recursive metadata cannot consume unbounded traversal.
- Values constructed by compatibility analysis are validated again before
  crossing the persistence boundary. Invalid internal state is an explicit
  failure rather than an unchecked write.
- The 1,615-line Run C handoff core was reviewed helper-by-helper. Every
  private helper is referenced and all eight exports are consumed by
  `aswitch`; no dead validator, duplicate state model, or unused transition
  was found. Schema-specific validation was retained because it binds
  checksums, approvals, writes, and receiver classifications to distinct
  measured failure modes. Repeated literal casts and two lookup constants
  were removed, list normalization now narrows directly, and canonical
  serialization rejects non-plain objects. No line-count-only refactor was
  performed.

## Slice 15 certification evidence

- Focused tests: 129 total, 127 passed, 0 failed, 2 skipped.
- Complete validation: 216 total, 214 passed, 0 failed, 2 skipped.
- Strict checked JavaScript: 86 shipped canonical runtime modules, zero
  diagnostics.
- Generated artifact synchronization: 112 canonical generator outputs
  synchronized; 86 runtime JavaScript mirrors are byte-equivalent to checked
  sources.
- Syntax and data parsing: 224 tracked JavaScript files passed `node --check`;
  24 tracked JSON files parsed successfully.
- Deterministic package: two independent 131-file packages produced identical
  SHA-256
  `4fdf74b10acefb3d8cef3bffbbdf9c9ee3f3cc0df85940d825136f9ac075218e`.
- Installed artifact: all 41 conformance checks passed on Node 25.8.1,
  macOS arm64, including all six stable skills, approved compatibility
  wrappers, zero runtime dependencies, hardened Bash execution, and forbidden
  surface exclusions.

## Residual classifications

- Known: the current macOS arm64 host passed Node, Git, Bash, generation,
  strict typing, deterministic package, installation, and conformance proofs.
- Unknown: native Ubuntu, Windows, and PowerShell execution were not observed
  in this local run. Their declared CI jobs are not transferred as runtime
  evidence.
- Unknown: actual Codex and Claude plugin-data and lifecycle wiring remain
  unproven; synthetic adapter context does not make persisted receipts
  generally Current.
- Stale / suspicious: none introduced by slices 14 or 15.
- Suggested: run the declared cross-platform CI only after a later,
  separately authorized candidate-freeze decision.
- Residual: same-user path replacement between validation and use remains
  where portable directory-file-descriptor-relative protection is
  unavailable.
