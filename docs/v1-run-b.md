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
