# Kanon v1 Run B implementation record

**Status:** Run B recovery accepted on 2026-07-28 for product slices 4
through 8. This file is not a release claim and does not authorize slice 9.

The authoritative contract is [`V_1design.md`](../V_1design.md), including its
authorized 2026-07-28 lifecycle-notice amendment. The approved notice-only
product decision is recorded in
[`v1-scope.md`](v1-scope.md) and
[`v1-guard-feasibility.md`](v1-guard-feasibility.md).

## Recovery amendment frame

**Decision date:** 2026-07-28.

Principal review after commit `be0427e` reopened one slice-4 P1. The production
shared hook invoked a bare `node` command and its tests exercised the adapter
directly rather than the shipped manifest command. Under Codex CLI 0.145.0,
the outer inherited shell and `-lc` startup processing occur before any inner
launcher can establish a minimum environment. Claude Code can express a
direct-exec form, but no portable trusted absolute Node.js executable is
proven for every stable platform.

The user authorized a narrow design amendment: lifecycle-hook declarations are
optional and host-specific; stable v1 ships no automatic lifecycle notice for
either host; and notice appears only through explicit skill and status output
with `enforcement: false`. The hostile-environment boundary is unchanged.
Automatic lifecycle notice and hard Guard remain future host-specific
experimental work.

All pre-recovery statements below saying “P0/P1 at completion: none,” that the
shared hook passed principal review, or that Run B was complete became
**Stale / suspicious** when the P1 reopened. They are retained only as
historical slice records and are not current acceptance evidence. The
post-fix recovery certification near the end of this document supersedes
those claims and lists only validations rerun after the hook removal.
Historical Guard reports remain immutable.

## Historical pre-recovery slice records

The slice records in this section preserve implementation chronology. Their
old validation counts and hook assumptions do not certify the recovered
tree. Current acceptance evidence begins at
[Recovery certification](#recovery-certification--slices-4-through-8).

## Slice 4 frame — dual-host plugin skeleton

- **User outcome:** one package-root plugin that both Codex CLI and Claude Code
  can identify while sharing one runtime and one skill location.
- **Changed invariant:** host metadata is separate; runtime behavior and public
  capability metadata are shared, version-bound, and notice-only.
- **Trust boundary:** plugin manifests, hook input, environment values,
  installed build metadata, package contents, and host output are validated or
  treated as unavailable.
- **Non-goals:** new v1 skill claims, receipts, enforcement, denial, rewrite,
  approval, suppression, persisted state, terminal launch, `steer`, and
  `aswitch`.
- **Failure modes:** malformed or oversized hook input, unknown host selection,
  stale generated runtime, mismatched versions, missing ESM boundary, invalid
  host manifest, and accidental development-file packaging.
- **Completion evidence:** layout and adapter contracts, adversarial malformed
  input checks, independent manifest validation, generated synchronization,
  package allowlisting, normal validation, and a clean raw-diff review.

### Slice 4 correction-loop result

- **Focused unit, contract, compatibility, and adversarial checks:** 42 passed,
  1 Windows-only junction proof skipped.
- **Dual-host plugin contract checks:** 9 passed.
- **Generated synchronization:** `npm run check:skill` passed after the
  generator produced 77 artifacts at the shared root runtime.
- **Normal validation:** `npm run validate` passed with 120 tests passed,
  1 Windows-only junction proof skipped, and no failures.
- **Manifest validation:** Claude Code 2.1.219
  `plugin validate --strict` passed. Codex CLI 0.145.0 exposes no native
  manifest-validation command; the bundled Codex plugin schema validator
  passed using the already-installed Python 3.9/PyYAML environment.
- **Package-content check:** the deterministic builder emitted exactly its
  allowlist, including both manifests, the shared hook, the root ESM runtime,
  embedded metadata, and the existing compatibility skill. Source, tests,
  spikes, development dependencies, and the obsolete nested runtime were
  absent.
- **Strict checked-JS:** not yet available by the frozen slice order; slice 5
  introduces the ratchet and covers every slice 4 production module.
- **Diff hygiene:** `git diff --check` and raw capability, execution,
  containment, generated-source, and package-surface review passed. All
  historical Guard-result hashes remained unchanged.
- **Principal challenge:** malformed public capability metadata originally
  allowed arbitrary syntactically valid skill names. The validator now accepts
  only the implemented `kanon` compatibility skill. A test assertion that
  confused “orientation” prose with an `orient` capability was narrowed to
  inspect actual public identifiers.
- **Residual classification:** the installed Codex CLI's lack of native
  manifest validation is **Unknown** host-side validation, not a negative
  capability conclusion. Hook observability also remains **Unknown**.
- **Historical P0/P1 claim at that slice boundary:** none. This claim was
  superseded when the lifecycle-hook P1 reopened.

## Slice 5 frame — strict checked-JS ratchet

- **User outcome:** v1 production changes fail validation when hostile-boundary
  values are used without narrowing or when result states are ambiguous.
- **Changed invariant:** canonical `src/v1/**/*.js` is a strict no-emit
  TypeScript project. Generated runtime copies remain synchronized from those
  checked sources.
- **Trust boundary:** hook input, environment values, parsed JSON, and embedded
  metadata enter typed code as `unknown` and become usable only after runtime
  narrowing.
- **Non-goals:** transpilation, runtime TypeScript, runtime dependencies, broad
  historical-source conversion, experimental-source coverage, or a decorative
  type claim over excluded stable modules.

### Slice 5 correction-loop result

- **Pinned tooling:** `typescript@7.0.2` and
  `@types/node@20.19.43` are exact development dependencies in the
  reproducible lockfile. `npm ci --ignore-scripts --dry-run --offline` passed.
- **Strict configuration:** `allowJs`, `checkJs`, `strict`,
  `strictNullChecks`, `noUncheckedIndexedAccess`,
  `useUnknownInCatchVariables`, and `noEmit` are enabled. The project has no
  broad `any`, `ts-ignore`, `nocheck`, unsafe-cast, or source-exclusion escape.
- **Typed production scope:** all six canonical slice 4 modules covering host
  adapters, bounded hook I/O, trust narrowing, fixed notice output, and
  embedded build metadata pass `npm run typecheck`. Registry and continuity
  modules join the same glob when introduced in slices 6 and 7.
- **Focused type, package, and prior plugin checks:** 13 passed with no skip or
  failure. Focused compatibility plus ratchet checks: 20 passed.
- **Normal validation:** `npm run validate` passed with 124 tests passed,
  1 Windows-only junction proof skipped, and no failures; typechecking runs
  between generated synchronization and tests.
- **Artifact state:** the exact production allowlist excludes `node_modules`,
  the lockfile, `tsconfig.json`, and all development dependency metadata.
  Runtime dependencies remain zero.
- **Diff hygiene:** generated synchronization and `git diff --check` passed;
  the raw diff contains only the checked source corrections, deterministic
  tests, strict configuration, pinned development metadata, and this record.
- **Principal challenge:** the first compiler run rejected an imprecise
  unknown-host branch and an unproven conversion from a generic JSON object to
  build metadata. Both now use discriminated results and runtime-backed type
  predicates. The first normal validation also caught a legacy test that
  prohibited all development dependencies; it now requires exactly the two
  design-approved pins while preserving the zero-runtime-dependency gate.
- **Historical P0/P1 claim at that slice boundary:** none. This claim was
  superseded when the lifecycle-hook P1 reopened.

## Slice 6 frame — exact-version deprecation status

- **User outcome:** every delivered stable skill can surface whether the exact
  installed Kanon version is deprecated without making repository analysis
  depend on network availability.
- **Changed invariant:** one checked runtime module derives the only registry
  URL from validated embedded package metadata and treats every transport,
  registry, session, and cache value as hostile.
- **Trust boundary:** the checker accepts no repository URL, registry
  configuration, package-manager configuration, shell, or user npm settings.
  The only network origin is `https://registry.npmjs.org`.
- **Non-goals:** automatic upgrades, package-manager invocation, release-state
  mutation, repository cache files, host-session inference, or a live-registry
  correctness claim.

### Slice 6 correction-loop result

- **Deterministic transport and cache checks:** 14 passed for deprecated,
  current, malformed, mismatched, oversized, redirected, cross-origin,
  redirect-loop, timed-out, offline, cached, expired, sticky, later-proven,
  session-isolated, session-ended, malformed-cache, linked-cache, hostile
  transport, malformed-input, and fixed-origin cases.
- **Focused registry, adapter, type, package, and trust checks:** 44 passed,
  1 Windows-only junction proof skipped, and no failures.
- **Strict checked-JS:** all 10 canonical v1 production modules pass
  `npm run typecheck` with runtime narrowing at metadata, options, transport,
  JSON, cache-schema, path, time, status, and header boundaries.
- **Normal validation:** `npm run validate` passed with 138 tests passed,
  1 Windows-only junction proof skipped, and no failures.
- **Generated and package state:** `npm run check:skill` passed after 81
  generated artifacts. The exact package allowlist includes the four registry
  runtime modules and still excludes source, tests, development tooling, and
  all runtime dependencies.
- **Manifest checks:** the bundled Codex schema validator and Claude Code
  strict native validator both passed independently.
- **Network behavior:** the production transport uses Node HTTPS directly,
  a 2.5-second timeout, a 64 KiB body cap, at most two same-origin redirects,
  strict HTTP/content-type handling, and no implicit npm configuration. A live
  smoke observation was not used or required.
- **Cache behavior:** only bounded exact-version status is stored in validated
  plugin data, keyed by a SHA-256 host-session key, for at most one hour and
  eight entries. Explicit session end removes its entry. Deprecated status
  remains sticky across failed refresh and changes only after a successful
  exact-version response.
- **Failure behavior:** missing session or plugin-data evidence disables cache
  with a bounded diagnostic; offline, timeout, malformed, and unsafe results
  become `Unknown` and never block analysis. The checker never substitutes a
  repository or user cache.
- **Diff hygiene:** generated synchronization, `git diff --check`, fixed-origin
  and forbidden-execution scans, package review, and raw source review passed.
- **Principal challenge:** initial strict compilation found numeric and union
  narrowing gaps. The subsequent principal review found and fixed two P1s:
  repository-adjacent plugin-data roots are now rejected, and the entire
  public options object is runtime-validated before access. Cached registry
  prose is also revalidated against the sanitizer boundary.
- **Residual classification:** documented active-session and plugin-data input
  may be unavailable on a host invocation; that remains **Unknown**, disables
  caching, and must be surfaced by slice 8. Same-user concurrent replacement
  between canonical validation and atomic rename remains a lower-risk
  platform residual shared with existing persistence.
- **Historical P0/P1 claim at that slice boundary:** none. This claim was
  superseded when the lifecycle-hook P1 reopened.

## Slice 7 frame — shared continuity engine

- **User outcome:** read-only resume compares bounded prior continuity claims
  with authoritative live repository evidence through one Kanon engine.
- **Changed invariant:** the existing v0.4 resume path now delegates
  classification to the shared checked-JS engine; `refresh` and `todo` remain
  the only explicit continuity-write paths.
- **Trust boundary:** repository paths, fingerprints, Git metadata, file
  timestamps, persisted state, handoff observations, warnings, and render
  values are untrusted and runtime-validated before use.
- **Non-goals:** receipt persistence or invalidation, mutation hooks, Guard,
  enforcement, host session internals, user-level skill imports, `steer`,
  `aswitch`, or a new handoff subsystem.

### Slice 7 correction-loop result

- **Dedicated schema, authority, staleness, containment, budget, malformed
  state, handoff, concurrency-residual, and read-only checks:** 10 passed with
  no skip or failure.
- **Focused continuity, persistence, trust, compatibility, and strict-type
  checks:** 47 passed, 1 Windows-only junction proof skipped, and no failures.
- **Strict checked-JS:** the canonical continuity engine and its artifact
  metadata adapter pass `npm run typecheck`; the strict project contains the
  module and forbids broad `any`, `ts-ignore`, `nocheck`, or exclusion escapes.
- **Normal validation:** `npm run validate` passed with 148 tests passed,
  1 Windows-only junction proof skipped, and no failures.
- **Continuity behavior:** the report distinguishes `added`, `changed`,
  `contradicted`, `stale`, and `unavailable`; complete live scans may
  contradict absent stored paths, while incomplete scans preserve absence as
  Unknown. Live root, Git, purpose, files, commits, instructions,
  documentation, and recent artifact observations remain authoritative over
  stored claims.
- **State and handoff behavior:** missing, malformed, oversized, linked, and
  unsupported inputs warn and recover without retaining content. Handoff
  inspection records only bounded availability metadata; it does not add a
  handoff schema or lifecycle. A byte-for-byte repository snapshot proves that
  CLI `resume --json` performs no repository write.
- **Generated and package state:** `npm run check:skill` passed after 82
  generated artifacts. The deterministic package builder succeeded beneath
  the canonical temporary root; the exact-allowlist and installed-artifact
  conformance checks passed and continued to exclude source, tests,
  development tooling, and runtime dependencies.
- **Manifest validation:** the bundled Codex plugin validator and Claude Code
  2.1.219 `plugin validate --strict` both passed independently. No public
  manifest or capability surface changed in this slice.
- **Diff hygiene:** `git diff --check`, generated synchronization, forbidden
  execution/capability scans, and raw source review passed.
- **Principal challenge:** the first integration check correctly failed only
  on unsynchronized generated copies. Principal review then prevented two
  false conclusions: duplicate path claims are rejected, and incomplete scans
  cannot imply that recent artifacts are absent. Artifact recency now uses
  bounded scanner timestamps and becomes Unknown when coverage or timestamps
  are incomplete.
- **Residual classification:** same-user replacement during an already-open
  read remains a documented lower-risk filesystem concurrency residual.
  Unsupported host introspection and any host session association remain
  **Unknown**; the engine imports neither.
- **Historical P0/P1 claim at that slice boundary:** none. This claim was
  superseded when the lifecycle-hook P1 reopened.

### Slice 7 post-commit type-scope audit

The corrective audit covered every other production file touched by slice 7.
`src/cli/index.js`, `src/index.js`, `src/persist.js`,
`src/persistence/state.js`, `src/render/continuity.js`,
`src/render/shared.js`, and `src/scanner/scan.js` are pre-existing v0.4
compatibility runtime modules. They remain outside `src/v1/**/*.js` and
`src/continuity/**/*.js`, are reached only through the compatibility runtime,
and are not exposed as new v1 skill identifiers in the embedded metadata.
The shipped metadata still lists only the implemented `kanon` compatibility
skill; `orient`, `resume`, `verify`, and `status` skill directories do not yet
exist at this slice boundary. Generated `runtime/` copies are artifacts, not
canonical source modules. A temporary strict-project expansion was tested and
produced the historical analyzer graph's pre-existing unchecked-JS errors;
it was reverted rather than weakening checks or hiding failures. The
deterministic type-scope test now fails if any of these compatibility files is
silently pulled into the staged v1 claim. This is a scope record, not a waiver
for slice 8's new stable modules: every new slice 8 v1 production module must
enter the strict project immediately.

## Slice 8 frame — four stable vertical read skills

- **User outcome:** `orient`, `resume`, `verify`, and `status` work end to end
  through equivalent Codex CLI and Claude Code adapters while preserving the
  v0.4 compatibility routes.
- **Changed invariant:** every stable read invocation consults the one
  exact-version deprecation checker, exposes notice mode with
  `enforcement: false`, surfaces the repository trust boundary, and returns a
  bounded versioned report without executing repository-controlled code.
- **Trust boundary:** repository roots, paths, instructions, file content,
  Git output, ignore rules, package declarations, generated artifacts,
  continuity state, receipts, registry results, host values, and environment
  observations are hostile until runtime validation and sanitization.
- **Non-goals:** persisted receipt state, invalidation or bypass lifecycle,
  mutation hooks, Guard, denial, rewrite, forced reading, auto-approval,
  suppression, `steer`, `aswitch`, terminal launch, full history, corpus or
  holdout work, candidate freeze, release, publication, or an
  incremental-value claim.
- **Failure modes:** unsafe or unreadable paths; repository links and
  replacement races; incomplete or oversized scans; hostile Git runners and
  repository Git configuration; malformed continuity or receipt data;
  unavailable host/session/hook state; registry failure; generated-artifact
  comparison limits; stale generated copies; and compatibility-surface drift.
- **Completion evidence:** dedicated unit and adversarial tests, host and
  wrapper contracts, strict checked-JS, full validation, generator
  synchronization, independent manifest validation, installed-artifact
  conformance, package allowlisting, syntax checks, `git diff --check`, raw
  diff review, historical Guard-report hash checks, a local commit, and a
  clean worktree.

### Slice 8 correction-loop result

- **Dedicated unit, contract, host-equivalence, receipt, adversarial,
  malformed-input, failure-path, compatibility, and real-Git checks:** 23
  passed with no skip or failure.
- **Focused stable-skill, plugin, compatibility, scope, package, and type
  checks:** 56 passed with no skip or failure.
- **Strict checked-JS:** all 22 canonical `src/v1` JavaScript modules are in
  the strict project; 16 are new or touched by slice 8. The shared continuity
  engine remains checked in the same project. There is no broad `any`,
  `ts-ignore`, `nocheck`, unsafe-cast, or exclusion escape.
- **Normal validation:** `npm run validate` passed with 172 tests passed, 1
  Windows-only junction proof skipped, and no failures.
- **Generated and package state:** the generator synchronizes 103 artifacts.
  The deterministic package contains 121 npm entries, of which 120 are
  hash-bound by `MANIFEST.sha256`; it contains 12 stable-skill files and 12
  compatibility wrapper files, with no source, test, evaluation, development
  dependency, or runtime dependency leakage.
- **Installed-artifact behavior:** the exact staged package passes 26
  conformance checks, including all six compatibility wrappers, all four
  stable wrappers, manifest hashes, the shared continuity binding, zero
  dependencies, non-execution of a declared destructive script or a
  repository-controlled PATH executable, and the explicit refresh-write path.
- **Manifest validation:** Claude Code 2.1.219
  `plugin validate --strict` and the installed Codex plugin-creator validator
  under Python 3.9/PyYAML 6.0.1 both passed. Codex CLI 0.145.0 still exposes
  no native validate subcommand, so native Codex-side validation remains
  **Unknown** rather than being inferred.
- **Receipt boundary:** `kanon-context-receipt-v1` contains only
  `schema`, `enforcement: false`, and SHA-256 bindings for canonical root,
  task, task-relevant evidence, and an available host session. It is never
  persisted or enforced. Root, task, evidence, or session contradiction is
  Stale; unavailable session or incomplete current evidence remains Unknown.
- **Git and scan behavior:** instruction files are read first after root
  canonicalization. Directory allocation, file hashing, excerpts, output,
  diagnostics, and Git subprocesses have explicit bounds. Git uses a resolved
  executable outside the repository, disables hooks, fsmonitor, pagers,
  optional locks, prompting, lazy fetch, and user/system configuration, and
  rejects malformed structured output. A real repository test proves that a
  configured fsmonitor is not executed and the index identity is unchanged.
- **Verification behavior:** documentation and observed generated-artifact
  mismatches are direct contradictions; missing support remains
  non-observation. Incomplete evidence and generated-pair limits prevent
  absence or synchronization conclusions. Declared validation is never
  reported as executed.
- **Compatibility and public surface:** `brief`, narrow `ask`, `resume`, and
  `verify` route to the stable runtime; `refresh` and `todo` remain explicit
  v0.4 bounded writes. The plugin exposes `kanon`, `orient`, `resume`,
  `status`, and `verify`; it does not expose `steer` or `aswitch`.
- **Principal challenge:** review corrected twenty-nine P1-class candidates
  before close: development-source metadata availability, multi-family `ask`
  routing, Git omission from receipt evidence, current-receipt claims over
  incomplete evidence, permissive hostile Git parsing, unbounded directory
  allocation, unsafe verify-target fallback, status loss on an invalid
  repository root, silent generated-pair truncation, compatibility
  normalization of repository identities, character-versus-byte output
  limits, omission of declared-validation Unknown from aggregate status,
  silent instruction-candidate truncation, and scan-to-evidence replacement
  accounting, repository-controlled Node resolution in public wrappers, and
  deprecation-cache overlap with the selected repository, plus unbounded or
  repository-controlled Git search state and out-of-range host time values.
  Locale-dependent evidence ordering was also replaced with deterministic
  ordering, missing bidi-control classes were closed, truncated documentation
  no longer produces a Known absence result, declared-validation truncation is
  explicit, documentation-claim and generated-contradiction limits are
  surfaced, the renamed stable CLI generated counterpart is mapped correctly,
  filesystem-root inspection is rejected, plural credential and additional
  private-key names remain excluded, validated identifier whitespace is
  preserved, decoded byte expansion now surfaces truncation, and notice-hook
  imports were decoupled from the stable read graph to reduce failure
  coupling.
- **Residual classification:** same-user filesystem replacement during an
  already-open read and non-preemptible operating-system calls on pathological
  filesystems remain lower-risk platform residuals. PowerShell execution and
  native Codex manifest validation were unavailable on this macOS host.
  Host/session/hook introspection remains **Unknown** where not directly
  supplied. These residuals do not support enforcement or absence claims.
- **Historical integrity at that boundary:** `V_1design.md` and every
  historical Guard report were unchanged. The design was subsequently
  amended under the user's narrow authorization; Guard reports remain
  unchanged.
- **Historical P0/P1 claim at that slice boundary:** none. This claim was
  superseded when the lifecycle-hook P1 reopened.

## Recovery certification — slices 4 through 8

This is the sole current Run B acceptance record. Every result below was
rerun after removing the production lifecycle hook and preserving the
33-file correction set. Historical per-slice counts above were not used to
accept the recovered tree.

### Amendment and correction disposition

- The authorized amendment is commit `9ef1ec1`. It makes lifecycle-hook
  declarations optional and host-specific, removes the shared production
  hook, and limits stable notice to explicit skill and status output.
- All 33 original dirty files were retained as measured corrections:
  three canonical v1 boundary modules, their three generated runtime copies,
  the wrapper generator, the installed-artifact conformance harness, twenty
  generated Bash and PowerShell wrappers, and five associated test files.
  No original correction was reset, restored, stashed, discarded, or
  weakened.
- The two host manifest descriptions and the plugin contract test were added
  to make explicit-only notice visible at the public manifest boundary.
- Generated copies were produced only through `scripts/build-skill.js`.
  The generator synchronized 101 artifacts, and the subsequent
  `npm run check:skill` comparison passed without drift.

### Post-fix validation

- **Focused recovery tests:** the plugin/no-hook, registry, continuity,
  repository, wrapper, adversarial, skill, type-scope, scope, historical
  evidence, package, and installed-artifact files ran together: 124 tests,
  123 passed, 1 skipped because PowerShell was unavailable, and 0 failed.
- **Strict checked JavaScript:** `npm run typecheck` passed with zero
  diagnostics. All 20 canonical `src/v1` JavaScript modules plus the shared
  continuity engine are in the promised strict project. No broad `any`,
  `ts-ignore`, `nocheck`, unsafe cast, or decorative source exclusion was
  introduced.
- **Generated synchronization:** `npm run build:skill` reported 101
  synchronized artifacts; `npm run check:skill` passed.
- **Manifest validation:** Claude Code 2.1.219 native
  `plugin validate --strict` passed. The bundled Codex plugin schema
  validator passed under Python 3.9.18 and PyYAML 6.0.1. Codex CLI 0.145.0
  exposes no native validation subcommand, so native Codex validation remains
  **Unknown**.
- **Exact installed artifact:** the deterministic staged package contained
  118 files, 117 of them bound by `MANIFEST.sha256`, and passed 33 of 33
  installed-artifact checks on macOS arm64 with Node.js 25.8.1. Checks include
  separate manifests, the shared ESM runtime, zero runtime dependencies,
  exact public wrappers, all manifest hashes, non-execution of declared
  repository scripts, poisoned `PATH`, `BASH_ENV`, and Node environment
  sentinels, explicit refresh behavior, and complete fixture cleanup.
  The artifact contains no `hooks/` tree, lifecycle-hook runner, hook event
  declaration, `steer`, or `aswitch`.
- **Artifact setup diagnostics:** two preparatory commands failed closed
  before conformance began: `/private/tmp` was not Node's canonical temporary
  root, and the ambient npm cache was not writable in the sandbox. The
  successful rerun used Node's canonical temporary root and a runner-owned
  npm cache. Neither setup failure produced a conformance pass.
- **Full validation:** `npm run validate` ran generated synchronization,
  strict typechecking, and 184 tests: 182 passed, 2 platform proofs skipped
  (PowerShell unavailable and Windows junctions), and 0 failed.
- **Syntax and data checks:** `node --check` passed for all 15 changed
  JavaScript files. Seven production and tooling JSON files parsed
  successfully. `git diff --check` passed.
- **Raw principal review:** no repository-controlled executable or startup
  file can run through the stable read path tested on this host. Repository
  content, filenames, Git output, ignore state, registry data, continuity
  state, and host values are bounded and cannot create an absence or
  enforcement claim when observation is incomplete. Public claims match the
  installed allowlist, and generated files match their canonical sources.

### Accepted slice status

- **Slice 4 — accepted:** separate Codex and Claude manifests share one skill
  root and ESM runtime, expose accurate explicit-only notice metadata, and
  load no production lifecycle hook.
- **Slice 5 — accepted:** the strict checked-JS ratchet passes for the promised
  v1 and continuity scope with zero diagnostics.
- **Slice 6 — accepted:** exact-version deprecation remains fixed-origin,
  strict-TLS, bounded, runtime-validated, session-cached for at most one hour,
  sticky only as specified, and fail-open to `Unknown`.
- **Slice 7 — accepted:** continuity is shared, bounded, live-authoritative,
  and read-only unless the user explicitly selects `refresh` or `todo`;
  malformed or unavailable evidence remains `Unknown`.
- **Slice 8 — accepted:** `orient`, `resume`, `verify`, and `status` execute
  through equivalent Codex and Claude adapters; compatibility remains limited
  to `brief`, narrow `ask`, `resume`, `refresh`, `todo`, and `verify`; receipts
  remain minimal, in-memory, and non-enforcing.

### Recovery residual classification

- **Known:** both shipped manifests omit hooks; the exact installed artifact
  has no production lifecycle hook; explicit notice remains available;
  enforcement is false; runtime dependencies are zero; development
  dependencies are exactly `typescript@7.0.2` and
  `@types/node@20.19.43`.
- **Likely, not release proof:** the common generator and static contracts
  make Bash and PowerShell wrapper drift unlikely, but do not substitute for
  runtime platform evidence.
- **Unknown:** PowerShell behavior on this macOS host, Windows junction
  behavior, native Codex manifest validation, unavailable host hook
  introspection, and behavior on untested host/platform/version surfaces.
- **Stale / suspicious:** every pre-recovery shared-hook claim, old package
  count, old generated-artifact count, and old “P0/P1 none” completion claim
  above.
- **Suggested:** begin no later slice until a clean recovery commit is
  precondition-checked and the user explicitly decides whether Run C defers
  slice 9 entirely or authorizes a separately amended, receipt-only,
  non-enforcing scope.
- **Remaining P0/P1:** none after the post-fix correction loop. Platform
  Unknowns remain release-gate evidence gaps, not promoted negative
  conclusions.

### Run C gate

Run C requires the exact clean recovery commit on `release/v.1.0.0`, a fresh
branch/HEAD/worktree precondition check, and an explicit sequencing decision.
Product slice 9 must not be inferred. Because production Guard remains outside
public v1 after the accepted host no-go decisions, the user must choose either
to defer slice 9 entirely or to authorize a narrow contract amendment for a
receipt-only, non-enforcing lifecycle before any Run C implementation.

The user required this fresh slice 8 session because the prior TUI
unexpectedly displayed a different low/fast model after slice 7. The fresh
session header was independently confirmed as `gpt-5.6-sol` with `max`
reasoning before slice 8.

### Run C authorization postscript

On 2026-07-28 the user satisfied the sequencing decision above by authorizing
slice 9 only as a bounded, receipt-only, non-enforcing subsystem. The
authorization permits persistence solely in hardened plugin data and
evaluation solely during explicit Kanon invocations. It does not authorize a
hook, Guard, automatic lifecycle notice, mutation interception, approval,
denial, rewrite, emergency bypass, or repository-state fallback.

This postscript does not rewrite Run B evidence or claim Run C completion. The
Run B recovery commit, validations, capability matrix, and residuals remain
historical facts for slices 4 through 8.
