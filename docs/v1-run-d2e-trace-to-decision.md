# Run D.2E — observational trace-to-decision

Date: 2026-07-30

Status: hard-stopped after the one authorized corpus attempt failed during
trace-manifest finalization. No retry, equivalence promotion, hypothesis
analysis, or behavioral correction occurred.

## Scope and frozen authority

This was the consolidated slice-16 D.2E investigation only. The authoritative
product baseline remained restored D.2A behavior. `V_1design.md`, the frozen
development corpus, policy, labels, thresholds, D.2A, D.2B and its recovery,
D.2C, D.2D, historical Guard evidence, package version `0.4.0-rc.1`, and public
capabilities were not changed.

The session was outcome-aware. It makes no blinding, independence, human-label,
or ground-truth claim.

## Commits before collection

- Protocol commit:
  `6d9b8b95b5c35d3be3b9fe8bd74c2879d1178801`.
- Instrumentation and evaluator commit:
  `5ce9799f6396520a7bb03d414bf0e81ff13a6700`.
- Branch: `release/v.1.0.0`.
- Upstream at collection: `origin/release/v.1.0.0`, 9 ahead and 0 behind.
- Worktree at collection: clean.

The protocol was committed before instrumentation and before any trace.
Instrumentation was a private, disabled-by-default observer on the canonical
ranking and curation path. Evaluation collection, analysis, and preservation
tools remained outside the package allowlist.

## Frozen bindings

- Protocol:
  `eval/d2e/PROTOCOL.md`,
  SHA-256
  `d412ba3a4311640234b9291ac458da321a77db9da0df310cfd3186a56cad3f41`.
- Trace schema:
  `eval/d2e/trace.schema.json`,
  SHA-256
  `5a938a24c774cbf9deef7c764184270ae1925a8edbfeecf321c9d2b4844d8c72`.
- Analysis schema:
  `eval/d2e/analysis.schema.json`,
  SHA-256
  `17c842e70f8ebe8b308115562f94e2ee64b0e86caf4a83236d1262e32509c3f9`.
- Corpus SHA-256:
  `4f768f151885d26de48fe0744cafc2402a27aca61f7f049aac166309891e0c92`.
- D.2A report SHA-256:
  `747b4f1590eda9787c87aae2e25853b8e1e8fa04893e2359eedf7a6050b7acb3`.
- D.2A cache identity SHA-256:
  `64f0e5ccf1e243445c09f663f4c0e495530e4ae7b0901b2b2853346ea1a19cee`.
  All 30 revision-derived entries existed, the cache had no extras, and no
  entry retained Git metadata.
- D.2C comparative-analysis SHA-256:
  `de311bbef99ed43eca4ef71aa6eafc2f41317ad1ce13b5d09dedc52593e9fbac`.
- D.2D ranking-result SHA-256:
  `1f2ba552106a4c13eace2088e1277cc0b4bbf066dca0113e10b243db46b902c7`.
- Production artifact SHA-256:
  `0f87af4dfd851c268891c96237accf20b5089b0e0b95e10ac1417efebcca83a9`.
- Pre-attempt conformance SHA-256:
  `443ba196d1365005044b11e563b36a3d3bba2ce80bdda67834f0d1471ed8bc56`.
  It passed 43 of 43 installed-artifact checks.

Two offline production packs were byte-identical. The artifact changed from
the restored D.2A artifact because the shipped private observer and generated
mirrors changed. Public capabilities and zero-runtime-dependency status did
not change.

## Pre-collection proof

- Trace-off, trace-on, mutating-observer, and throwing-observer product results
  were deeply equal on synthetic/adversarial fixtures.
- Observer output was detached and observer failure could not alter the normal
  product result.
- Ties, duplicates, quotas, cap displacement, incomplete scans, rejected
  links, hostile strings, excessive detail, deterministic ordering, bounded
  serialization, worker write failure, schema rejection, evaluator-only
  scope, and public semantic drift were covered.
- The focused suite passed 136 checks with 2 platform-only skips.
- A post-cache-binding focused suite passed 35 checks with no skips.
- Strict checked-JavaScript, generated synchronization, syntax checks, JSON
  parsing, and `git diff --check` passed.
- Principal-engineer review fixed all identified pre-attempt P0/P1 findings,
  including eager trace-off work and an initially implicit cache selection.

The review did not exercise successful top-level trace-manifest finalization.
That missing coverage allowed the collection P0 below.

## The one attempt

Exactly one 30-case development attempt was launched, offline, from the exact
installed artifact and D.2A cache. There were zero retries.

The analyzer completed all 30 cases and wrote the raw report and 30 case trace
files. Its printed public totals matched the known D.2A totals:

- overall: 137 TP, 46 FP, 68 FN;
- important files: 101 TP, 45 FP, 49 FN;
- run commands: 14 TP, 0 FP, 14 FN;
- test commands: 22 TP, 1 FP, 5 FN; and
- nine incomplete scans remained represented in the frozen public results.

These observations are not promoted to the protocol's mechanical semantic
equivalence result. The top-level finalizer failed before it wrote the required
trace manifest:

```text
Kanon corpus error: safeTerminalText is not defined
```

The process exited with status 2 after all predictions. The immediate cause was
a missing evaluator import used while sanitizing receipt identifiers in
`finalizeTraceAttempt`. The import was added after the attempt for future
authorization. No corpus rerun occurred.

Under the precommitted one-run rule, a failure after any prediction ends D.2E
before hypothesis analysis. Therefore:

- semantic-equivalence gate: not completed;
- trace-completeness gate: not completed;
- mechanically accepted trace: unavailable;
- mechanism analysis: not performed;
- hypothesis conclusion: unavailable;
- supported-generic-hypothesis: not claimed;
- no-supported-generic-hypothesis: not claimed; and
- behavioral correction: not implemented.

## Preserved failed-attempt evidence

Evidence root:
`eval/results/d2e-trace-failed-e0a3a224/`.

- Attempt binding:
  `attempt-binding.json`,
  SHA-256
  `0d92c7bdecff05976c929516664fb840066e265cf2b51e373065357bcadb8b46`.
- Raw report:
  `raw-report.json`,
  SHA-256
  `e0a3a2243824ca5b648f0e705f1209a4ea006beb2ea1ed0d1a2649910da0c18f`.
- Failure manifest:
  `failure-manifest.json`,
  SHA-256
  `622c23b026b397027313b3492e8a1dcf78e632f5a86bceb839e611e45fad5eb2`.
- Case traces:
  `cases/case-001.json` through `cases/case-030.json`.
- Trace-set SHA-256:
  `91bfa76f1914c0404b1c69d95ff9672ce7b3b1ab141ea4e9b2032098f991ec8b`.
- Preserved case count: 30.
- Preserved candidate count: 33,484.
- Preserved trace bytes: 34,819,892.
- Individual worker receipts and trace documents reported complete: 30 of 30.
- Attempt retries: 0.

Individual trace completeness does not substitute for the uncompleted
attempt-level trace-completeness gate. No `trace-manifest.json`,
`equivalence.json`, `mechanism-analysis.json`, or `analysis.json` was created
or reconstructed.

## Final validation

After preservation and the evaluator-only import fix:

- complete `npm run validate`: 289 passed, 4 platform-only skipped, 0 failed;
- strict checked-JavaScript: passed;
- generated synchronization: passed;
- full JavaScript syntax and JSON parsing: passed;
- `git diff --check`: passed;
- focused trace/ranking/evaluation/contamination/adversarial/scope/
  compatibility/artifact/plugin coverage: passed;
- deterministic production packing: passed;
- exact-tarball installed conformance: passed; and
- runtime dependencies: zero.

The preserved evidence and this record do not alter shipped capabilities.

## Decision ledger

### Known

- One and only one corpus attempt ran all 30 frozen cases.
- Predictions, the raw report, and 30 case traces were written before the
  finalizer P0.
- The preserved failed attempt contains 33,484 candidates and zero retries.
- The finalizer failure occurred after predictions and before the required
  attempt manifest.
- No hypothesis analysis or product correction occurred.
- Frozen design, Guard, D.2A, D.2B, D.2C, D.2D, label, threshold, policy,
  corpus, version, dependency, and public-capability inputs remain unchanged.

### Likely

- The missing evaluator import is the immediate and only observed cause of the
  top-level finalization failure. This does not prove that equivalence and
  completeness would have passed after that boundary.

### Unknown

- Protocol-grade semantic equivalence with frozen D.2A.
- Attempt-level trace completeness.
- Whether the trace supports any generic correction hypothesis.
- Precision, recall, and displacement effects of any future correction.

### Stale/Suspicious

- The pre-collection review's finalizer coverage was insufficient.
- The failed attempt cannot be relabeled as successful evidence merely because
  its individual worker receipts say complete.

### Suggested

Do not begin a behavioral correction cycle from this evidence. The next action
is a governance wait unless a new, explicit record authorizes one replacement
D.2E attempt after review of the fixed finalizer path. An honest prerelease
remains available under the existing frozen development evidence, but this
failed trace adds no accepted correction claim.

## Remaining severity and hard stop

- P0: the sole authorized D.2E attempt failed after predictions; no accepted
  trace-to-decision conclusion exists.
- P1: none open in the preserved implementation after the import fix.
- P2: a future authorized attempt should add a synthetic top-level
  trace-manifest-finalization test before collection.

Residual risk is dominated by the unavailable equivalence/completeness gates
and outcome-aware development evidence. D.2E hard-stops here. No slice 17,
candidate freeze, version change, holdout, push, merge, tag, publication,
release, label change, policy change, threshold change, corpus change, model
call, network call, or behavioral correction is authorized or performed.
