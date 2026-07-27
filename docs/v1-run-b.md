# Kanon v1 Run B implementation record

**Status:** development evidence for product slices 4 through 8. This file is
not a release claim and does not authorize slice 9.

The frozen authority remains [`V_1design.md`](../V_1design.md). The approved
notice-only product decision is recorded in
[`v1-scope.md`](v1-scope.md) and
[`v1-guard-feasibility.md`](v1-guard-feasibility.md).

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
- **P0/P1 at completion:** none.

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
- **P0/P1 at completion:** none.

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
- **P0/P1 at completion:** none.

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
- **P0/P1 at completion:** none.
