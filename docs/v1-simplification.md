# Kanon v1 Run D.1.5 simplification record

Date: 2026-07-28

Scope: measured deletion and simplification before product slice 16. This
record does not authorize corpus work, live model trials, candidate freeze,
release, publication, or any new public capability. `V_1design.md` and the
historical Guard evidence remain frozen.

## Baseline methodology

The baseline is clean commit
`2a54666e5af67b37617d75d6cd8986247a5f1245` on
`release/v.1.0.0`. The local branch was 0 commits behind its configured
upstream and 5 commits ahead of it.

Measurements use these reproducible rules:

- `scripts/build-package.js` stages only `publicSkillFiles()` plus the five
  generated package records (`LICENSE`, `README.md`, `package.json`,
  `SBOM.json`, and `MANIFEST.sha256`).
- `npm pack --json` supplies entry count, packed bytes, and unpacked bytes.
- SHA-256 is calculated over the resulting `.tgz`.
- A physical line is one newline-terminated line. Runtime and test line totals
  are sums over their complete measured file inventories.
- `stableRuntimeArtifacts()` defines the shipped executable-JavaScript
  inventory and its checked canonical mapping.
- Static dependency reachability follows the same bounded relative-import
  closure used by the canonical generator. Manifests, skill entrypoints,
  generated wrappers, internal bin entrypoints, and explicitly allowlisted
  files are accounted for separately.
- Dynamic reachability is not inferred from text searches. No unregistered
  dynamic runtime dependency was observed; if one were present, its
  reachability would be `Unknown` until directly bound by the generator and
  artifact tests.

The reproduced baseline package has SHA-256
`4fdf74b10acefb3d8cef3bffbbdf9c9ee3f3cc0df85940d825136f9ac075218e`.

## Baseline measurements

| Measure | Before |
| --- | ---: |
| Packaged files | 131 |
| Packed bytes | 165,076 |
| Unpacked bytes | 775,706 |
| Shipped runtime JavaScript modules | 86 |
| Shipped runtime JavaScript lines | 23,738 |
| Strictly checked canonical production JavaScript modules | 86 |
| Strictly checked canonical production JavaScript lines | 23,738 |
| Generated runtime JavaScript lines | 23,738 |
| Bash public wrappers | 12 |
| Bash public-wrapper lines | 1,224 |
| PowerShell public wrappers | 12 |
| PowerShell public-wrapper lines | 1,788 |
| Total public-wrapper lines | 3,012 |
| Test JavaScript files | 16 |
| Test JavaScript lines | 10,447 |
| Stable public skills | 6 |
| Compatibility routes | 6 |
| Runtime dependencies | 0 |

The stable entrypoints are `orient`, `resume`, `verify`, `status`, `steer`,
and `aswitch`. Compatibility entrypoints are `ask`, `brief`, `refresh`,
`resume`, `todo`, and `verify`.

## Baseline shipped dependency closure

The v1 bin, CLI, adapters, core, repository, registry, and skill graph contains
these 27 checked canonical modules. Each maps deterministically to the same
relative path under `runtime/`, except `src/v1/bin/kanon.js`, which maps to
`runtime/bin/kanon-v1.js`, and the remaining `src/v1/` prefix is removed:

```text
src/v1/adapters/claude.js
src/v1/adapters/codex.js
src/v1/adapters/shared.js
src/v1/bin/kanon.js
src/v1/cli.js
src/v1/core/build-metadata.js
src/v1/core/handoff-store.js
src/v1/core/handoff.js
src/v1/core/plugin-data.js
src/v1/core/receipt-store.js
src/v1/core/receipt.js
src/v1/core/steer-state.js
src/v1/core/trust.js
src/v1/registry/cache.js
src/v1/registry/deprecation.js
src/v1/registry/sanitize.js
src/v1/registry/transport.js
src/v1/repository/git.js
src/v1/repository/inspect.js
src/v1/repository/read.js
src/v1/skills/aswitch.js
src/v1/skills/invoke.js
src/v1/skills/orient.js
src/v1/skills/resume.js
src/v1/skills/status.js
src/v1/skills/steer.js
src/v1/skills/verify.js
```

The six stable wrappers and compatibility `ask`, `brief`, `resume`, and
`verify` all select `runtime/bin/kanon-v1.js`. Their command routing occurs
inside the checked v1 CLI.

The baseline compatibility graph contains the following 59 checked canonical
modules. Every row is retained by both `refresh` and `todo`: both wrappers
select the same `runtime/bin/kanon.js`, whose static entry graph is loaded
before legacy command dispatch. No other shipped command selects that bin.
This proves static package reachability, not that every module contributes
semantically to both operations.

| Checked canonical module | Public commands retaining it |
| --- | --- |
| `bin/kanon.js` | `refresh`, `todo` |
| `src/analyze.js` | `refresh`, `todo` |
| `src/analyze/current-state.js` | `refresh`, `todo` |
| `src/analyze/entrypoints.js` | `refresh`, `todo` |
| `src/analyze/findings.js` | `refresh`, `todo` |
| `src/analyze/metadata.js` | `refresh`, `todo` |
| `src/analyze/project-signals.js` | `refresh`, `todo` |
| `src/analyze/utils.js` | `refresh`, `todo` |
| `src/ask.js` | `refresh`, `todo` |
| `src/ask/intent.js` | `refresh`, `todo` |
| `src/cli.js` | `refresh`, `todo` |
| `src/cli/args.js` | `refresh`, `todo` |
| `src/cli/index.js` | `refresh`, `todo` |
| `src/cli/io.js` | `refresh`, `todo` |
| `src/cli/todo.js` | `refresh`, `todo` |
| `src/code-intel.js` | `refresh`, `todo` |
| `src/code-intel/command-utils.js` | `refresh`, `todo` |
| `src/code-intel/commands.js` | `refresh`, `todo` |
| `src/code-intel/constants.js` | `refresh`, `todo` |
| `src/code-intel/conventional-commands.js` | `refresh`, `todo` |
| `src/code-intel/curate-common.js` | `refresh`, `todo` |
| `src/code-intel/curate.js` | `refresh`, `todo` |
| `src/code-intel/documented-commands.js` | `refresh`, `todo` |
| `src/code-intel/entrypoints.js` | `refresh`, `todo` |
| `src/code-intel/heuristics.js` | `refresh`, `todo` |
| `src/code-intel/imports.js` | `refresh`, `todo` |
| `src/code-intel/index.js` | `refresh`, `todo` |
| `src/code-intel/manifest-commands.js` | `refresh`, `todo` |
| `src/code-intel/rank.js` | `refresh`, `todo` |
| `src/code-intel/shared.js` | `refresh`, `todo` |
| `src/config.js` | `refresh`, `todo` |
| `src/continuity/engine.js` | `refresh`, `todo` |
| `src/evidence.js` | `refresh`, `todo` |
| `src/git-runner.js` | `refresh`, `todo` |
| `src/git.js` | `refresh`, `todo` |
| `src/path-security.js` | `refresh`, `todo` |
| `src/persist.js` | `refresh`, `todo` |
| `src/persistence/safe-fs.js` | `refresh`, `todo` |
| `src/persistence/state-fields.js` | `refresh`, `todo` |
| `src/persistence/state.js` | `refresh`, `todo` |
| `src/readme.js` | `refresh`, `todo` |
| `src/render.js` | `refresh`, `todo` |
| `src/render/ask.js` | `refresh`, `todo` |
| `src/render/brief.js` | `refresh`, `todo` |
| `src/render/continuity.js` | `refresh`, `todo` |
| `src/render/shared.js` | `refresh`, `todo` |
| `src/scanner.js` | `refresh`, `todo` |
| `src/scanner/ignore.js` | `refresh`, `todo` |
| `src/scanner/policy.js` | `refresh`, `todo` |
| `src/scanner/read.js` | `refresh`, `todo` |
| `src/scanner/scan.js` | `refresh`, `todo` |
| `src/scanner/shared.js` | `refresh`, `todo` |
| `src/trust.js` | `refresh`, `todo` |
| `src/verify.js` | `refresh`, `todo` |
| `src/verify/claims.js` | `refresh`, `todo` |
| `src/verify/commands.js` | `refresh`, `todo` |
| `src/verify/index.js` | `refresh`, `todo` |
| `src/verify/language.js` | `refresh`, `todo` |
| `src/version.js` | `refresh`, `todo` |

The manifests, runtime ESM package boundary, embedded metadata, six skill
documents, compatibility skill documents and policy references, 24 public
wrappers, package records, and license are explicit non-JavaScript artifact
roots. They are not inferred from JavaScript import reachability.

## Candidate frame

The accepted candidate consolidates repeated wrapper launch boundaries and
replaces the monolithic legacy bin with a narrow shared implementation for the
two explicit write commands only. Legacy canonical source remains available
to repository tests and development evaluation because those consumers were
not part of the released-artifact reduction.

## Accepted simplifications

All 24 public wrapper files are now tiny generated fixed-command shims. They
resolve one generated dispatcher relative to the installed plugin and pass
only a compile-time command plus the caller's original bounded CLI arguments.
The shared Bash and PowerShell dispatchers retain the hardened executable
resolution, repository/plugin exclusion, Node-version gate, hostile Node
environment removal, path relocation, and fail-closed behavior that was
previously repeated in every wrapper.

The dispatchers accept only these exact command sets:

- v1 runtime: `ask`, `aswitch`, `brief`, `orient`, `resume`, `status`,
  `steer`, and `verify`;
- compatibility write runtime: `refresh` and `todo`.

An unsupported command is rejected before PATH inspection. Bash uses
privileged-mode `/bin/bash`, shell builtins, canonical directories, and
absolute `realpath` candidates only; it does not use `eval`, `source`,
repository commands, or current-directory executable resolution. PowerShell
uses fixed arrays, .NET path operations, module-qualified management
commands, and an explicit script path; it does not use `Get-Command node`,
dot-sourcing, or dynamic command construction.

The compatibility artifact no longer ships these seven generated modules:

```text
runtime/bin/kanon.js
runtime/src/ask.js
runtime/src/ask/intent.js
runtime/src/cli.js
runtime/src/cli/index.js
runtime/src/render.js
runtime/src/render/ask.js
```

It adds only `runtime/bin/kanon-write.js` and
`runtime/src/cli/write.js`. The shared dispatchers are non-JavaScript
generated launch artifacts. The narrow write CLI reuses the exact refresh and
TODO implementations from the development CLI. It also caps piped TODO input
before accumulation using the validated configured TODO byte budget; the
persisted TODO boundary remains independently bounded.

The resulting compatibility closure contains these exact 54 checked
canonical modules:

```text
bin/kanon-write.js
src/analyze.js
src/analyze/current-state.js
src/analyze/entrypoints.js
src/analyze/findings.js
src/analyze/metadata.js
src/analyze/project-signals.js
src/analyze/utils.js
src/cli/args.js
src/cli/io.js
src/cli/todo.js
src/cli/write.js
src/code-intel.js
src/code-intel/command-utils.js
src/code-intel/commands.js
src/code-intel/constants.js
src/code-intel/conventional-commands.js
src/code-intel/curate-common.js
src/code-intel/curate.js
src/code-intel/documented-commands.js
src/code-intel/entrypoints.js
src/code-intel/heuristics.js
src/code-intel/imports.js
src/code-intel/index.js
src/code-intel/manifest-commands.js
src/code-intel/rank.js
src/code-intel/shared.js
src/config.js
src/continuity/engine.js
src/evidence.js
src/git-runner.js
src/git.js
src/path-security.js
src/persist.js
src/persistence/safe-fs.js
src/persistence/state-fields.js
src/persistence/state.js
src/readme.js
src/render/brief.js
src/render/continuity.js
src/render/shared.js
src/scanner.js
src/scanner/ignore.js
src/scanner/policy.js
src/scanner/read.js
src/scanner/scan.js
src/scanner/shared.js
src/trust.js
src/verify.js
src/verify/claims.js
src/verify/commands.js
src/verify/index.js
src/verify/language.js
src/version.js
```

Both `refresh` and `todo` retain every module in this closure because the
single write entry imports both implementations before command dispatch.
Splitting the two bins would not reduce the union shipped in the artifact.
Further reduction would require replacing or decomposing the legacy analyzer
and persistence system, which would recreate behavior or broaden this slice.

The removed generated modules' canonical sources deliberately remain:

- `bin/kanon.js`, `src/cli.js`, and `src/cli/index.js` retain the development
  compatibility CLI used by repository tests.
- `src/ask.js`, `src/ask/intent.js`, `src/render.js`, and
  `src/render/ask.js` remain exported through `src/index.js` and exercised by
  compatibility, adversarial, continuity, and staff tests.
- all seven remain in strict checked-JavaScript coverage. Removing canonical
  development APIs or historical evaluation inputs was not required to
  reduce the installed artifact.

## Large-module audit

- `src/v1/core/handoff.js`: one redundant boolean validator branch was
  collapsed. The remaining validators were retained because schema,
  checksum, preview/approval rebinding, destination containment, receiving
  evidence, and persistence failures are separately tested and have distinct
  security outcomes.
- `src/v1/repository/inspect.js`: one identity remap and one exact forwarding
  helper were deleted. Containment, ignore-policy, evidence-budget,
  sanitization, Git, and incomplete-observation branches remain distinct.
- `src/continuity/engine.js`: no safe deletion was found. Its live-over-stored
  precedence and Added, Changed, Contradicted, Stale, and Unavailable
  classifications are independent public evidence behavior.
- `src/v1/core/steer-state.js`: no safe deletion was found. Exact-key
  reconstruction and the one-slice, non-authorizing state invariants protect
  separate malformed/getter/proxy and scope-expansion failure modes.

No module was split merely to reduce length, and no generic abstraction was
added around a trust check.

## Before and after

| Measure | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Packaged files | 131 | 128 | -3 |
| Packed bytes | 165,076 | 160,835 | -4,241 |
| Unpacked bytes | 775,706 | 690,239 | -85,467 |
| Shipped runtime JavaScript modules | 86 | 81 | -5 |
| Shipped runtime JavaScript lines | 23,738 | 23,186 | -552 |
| Strictly checked canonical production modules | 86 | 81 | -5 |
| Strictly checked canonical production lines | 23,738 | 23,186 | -552 |
| Generated runtime JavaScript lines | 23,738 | 23,186 | -552 |
| Bash public-wrapper lines | 1,224 | 312 | -912 |
| PowerShell public-wrapper lines | 1,788 | 240 | -1,548 |
| Shared-dispatcher lines | 0 | 286 | +286 |
| Total public launch/wrapper lines | 3,012 | 838 | -2,174 |
| Runtime plus launch/wrapper lines | 26,750 | 24,024 | -2,726 |
| Test JavaScript files | 16 | 16 | 0 |
| Test JavaScript lines | 10,447 | 10,650 | +203 |
| Stable public skills | 6 | 6 | 0 |
| Compatibility routes | 6 | 6 | 0 |
| Runtime dependencies | 0 | 0 | 0 |

The packed artifact is 4,241 bytes smaller (about 2.57%). The unpacked
artifact is 85,467 bytes smaller (about 11.02%). Shipped production
JavaScript plus public launch code is net 2,726 lines smaller. Test evidence
increased rather than being deleted.

## Public equivalence and checked sources

The public stable skills remain `orient`, `resume`, `verify`, `status`,
`steer`, and `aswitch`. The compatibility routes remain `ask`, `brief`,
`resume`, `refresh`, `todo`, and `verify`. Notice stays explicit,
non-enforcing, and advisory. Guard enforcement, lifecycle interception,
terminal launch, and full-history access remain unavailable.

All 81 shipped executable JavaScript modules map one-to-one to strictly
checked canonical sources: the unchanged 27-module v1 mapping above plus the
54-module compatibility closure. The generator proves byte equivalence for
every mirror. Strict null checks, exact optional properties, unchecked-index
protection, unknown catch variables, and no-emit remain enabled. There is no
transpilation and no runtime dependency.

## Validation and artifact binding

Pre-commit validation on macOS arm64 with Node.js 25.8.1 produced:

- focused wrapper, compatibility, artifact, type, adversarial, containment,
  persistence, continuity, steer, aswitch, deprecation, and scope tests:
  142 passed, 0 failed, 2 skipped;
- `npm run typecheck`: passed with zero diagnostics;
- `npm run check:skill`: passed with zero generated drift;
- complete `npm run validate`: 218 passed, 0 failed, 2 skipped;
- two independently staged `npm pack --json` runs: 128 entries, 160,835
  packed bytes, 690,239 unpacked bytes, and identical tarball bytes;
- exact-tarball installed conformance: 43 passed, 0 failed, 0 skipped.

Both packs have SHA-256:

```text
89923d2d6727445a86ba831331c4b6bdc031c399f81ce2d98e3f42815b3b3f6a
```

The candidate source commit is the commit containing this record. Its exact
full SHA is bound by the repeated post-commit pack and conformance run and is
reported in the Run D.1.5 completion report.

## Evidence classifications and residuals

Known:

- The Bash wrappers, fixed dispatch, relocation through paths containing
  spaces, poisoned current-directory PATH rejection, bounded compatibility
  writes, generated mirrors, deterministic packing, and installed artifact
  passed directly on macOS arm64.
- The artifact contains 128 files, 81 strictly mapped executable JavaScript
  modules, all twelve public commands, and zero runtime dependencies.
- No stable capability, compatibility route, receipt evidence, diagnostic,
  type gate, safety test, or release gate was removed.

Likely:

- The generated PowerShell form preserves the accepted contract because its
  fixed shims and dispatcher retain the prior validated boundary while
  module-qualifying management commands. This is source-contract evidence,
  not native execution evidence.

Unknown:

- Native PowerShell and Windows behavior were unavailable on this host.
- Windows junction/reparse execution and native Linux wrapper behavior were
  not directly run. CI definitions cover Windows, Ubuntu, and macOS, but no
  remote CI was triggered in this run.
- Actual Codex and Claude plugin-data wiring remains outside this
  simplification slice; synthetic adapter evidence is not host proof.

Stale/Suspicious:

- The 86-module installed inventory in `docs/v1-run-d1.md` is historical and
  no longer describes this candidate. That record remains unchanged because
  it accurately records Run D.1 at its own commit.
- The baseline artifact SHA-256 identifies only the pre-simplification
  package and must not be used for this candidate.

Suggested:

- Run the existing Windows, Ubuntu, and macOS CI jobs for the eventual
  candidate before release authorization.
- Revisit the remaining 54-module refresh/TODO closure only with a separately
  scoped behavioral migration and equivalent adversarial evidence.

No P0 or P1 remains from this review. Deferred lower-risk residuals are the
unavailable native platform proofs, the intentionally retained legacy
refresh/TODO analyzer closure, and the explicit single-writer constraint for
refresh persistence. None changes a public capability or safety claim.
