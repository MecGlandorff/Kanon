# Package-declarations correction contract

Date: 2026-07-30

Status: frozen before production modification for one bounded, test-first
correction cycle.

## Authorized boundary

The only production branch in scope is the `package-declarations` admission
loop in `src/code-intel/curate.js`. The scanner, ranker, score contributions,
weights, thresholds, root contracts, framework declarations,
`manifest-entrypoints`, later salience stages, final cap, labels, categories,
corpus, configuration, policy, protocols, and historical evidence are outside
the correction boundary.

## Predicate under test

A non-framework package declaration may enter the selection at the
`package-declarations` stage only when the same candidate has independent
generic salience already represented by the existing model:

- positive local-import fan-in;
- positive literal-local-reference count; or
- a non-declaration signal, currently an executable-entrypoint signal.

A declaration signal, its score contribution, its path, and its repository
identity are not independent salience. The predicate uses no repository,
category, label, expected-path, corpus-value, or trace-outcome knowledge.

## Invariants and expected risks

The quota, ordering, heuristic, reason, and selection behavior of the earlier
`manifest-entrypoints` executable stage must remain unchanged. Executable
manifest declarations must not be suppressed or weakened. Independently
salient package targets retain their existing package-stage ordering, and the
five-item final cap remains deterministic.

Precision is expected to be non-decreasing only to the extent that
declaration-only selections are rejected. Recall can decrease if declaration
alone was useful despite lacking observed independent salience. Removing an
early declaration-only selection can admit a later candidate, so displacement
is intentional but must be deterministic and explained. Incomplete scans can
hide fan-in or reference evidence, which remains a residual recall risk.

## Predeclared tests

The bounded synthetic suite must cover:

1. declaration-only false-positive rejection;
2. retention of independently salient package targets;
3. preservation of executable `manifest-entrypoints` controls;
4. deterministic selection and final-cap displacement;
5. trace-on/off public-result equivalence; and
6. rejection of repository-, path-, label-, and category-specific special
   cases.

## Hard stops and limitations

Stop this cycle for any lost executable control, non-deterministic or
unexplained displacement, trace-on/off result mismatch, public result-shape
change, special case, change outside the named branch and its directly
associated tests/generated mirror, unexplained artifact difference, validation
failure, version or capability change, or new runtime dependency.

This outcome-aware development cycle cannot establish causal effect, release
readiness, strict semantic or candidate-membership equivalence,
scan-diagnostic equivalence, label validity, independent evidence, an official
score change, or the counterfactual precision/recall effect of the correction.
