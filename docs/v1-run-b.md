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
