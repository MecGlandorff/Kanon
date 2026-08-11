# Kanon v1 Run D.2E-R offline recovery record

Date: 2026-07-30

Archive status for v1.1: result paths in this frozen record describe the
`v1.0.0` tree. Large raw payloads now live only at that immutable tag; see
[`eval/results/README.md`](../eval/results/README.md) for the retained-fixture
boundary and retrieval instructions.

Status: hard-stopped at the strict semantic-equivalence gate. Offline
attempt-level finalization and trace-completeness validation succeeded.
Frozen D.2A does not contain two comparison inputs required by this recovery
authority, so mechanism analysis, a hypothesis conclusion, and a behavioral
correction were not performed.

This recovery is outcome-aware development evidence. It is not independent
evidence and does not authorize another corpus attempt, a product correction,
slice 17, candidate freeze, version change, holdout, release, or publication.

## Starting authority and state

- Branch: `release/v.1.0.0`.
- Starting HEAD:
  `deb29ea78bf2830e914e335eed296218c6504147`.
- Configured upstream: `origin/release/v.1.0.0`.
- Starting relation: 10 ahead, 0 behind, observed without fetching.
- Starting worktree: clean.
- Trace source:
  `5ce9799f6396520a7bb03d414bf0e81ff13a6700`.
- Recovery implementation:
  `bd3cb95e722ca60c15f207337b1714804d1b6443`.
- Corpus attempts and retries during recovery: 0.

## Immutable input proof

The failed-attempt root contained exactly 33 regular files: one attempt
binding, one raw report, one failure manifest, and the canonical 30 case
traces. There were no links, special files, missing files, or unexpected
files. Every file was bounded, parsed, and hash-checked. All trace schemas,
case identities, ordinals, revisions, candidate identities, worker receipts,
candidate totals, byte totals, completeness checks, and report/trace public
selections reconciled.

| Input | SHA-256 |
| --- | --- |
| `V_1design.md` | `24b175b64eda8faadffcf40cbea3144e6cc95dd4dfaac8cbbb31b648dc4abf24` |
| Evaluation protocol | `8d6b59e879cd35093f265207d5fec9e6e567f0bd66765cd73c75e1e63b65c0a6` |
| Paired-ablation protocol | `132aeaf85984d791aa6c2335e498cb80ebfe4f99c7924230e7b487585237573a` |
| D.2E protocol | `d412ba3a4311640234b9291ac458da321a77db9da0df310cfd3186a56cad3f41` |
| Trace schema | `5a938a24c774cbf9deef7c764184270ae1925a8edbfeecf321c9d2b4844d8c72` |
| Analysis schema | `17c842e70f8ebe8b308115562f94e2ee64b0e86caf4a83236d1262e32509c3f9` |
| Frozen corpus | `4f768f151885d26de48fe0744cafc2402a27aca61f7f049aac166309891e0c92` |
| Ordered repository/revision binding | `f92a3940d2dfdafbae10118b19f4aaf0a2a3aa7107542b19fe1e12ead20b5ff8` |
| Frozen D.2A report | `747b4f1590eda9787c87aae2e25853b8e1e8fa04893e2359eedf7a6050b7acb3` |
| Paired configuration file | `aef23d32b16755442c54fc9ebe7b05fda22e129c498cc0d3e87c12886afcbf23` |
| Canonical paired configuration | `daf06d5f8b89a77add885caed3528964f372a678e2c9779a83faadd37485b128` |
| Attempt configuration | `8536570faaeff91d61a0d1b3e846fe7d12737de38b65729b1902e6ba7a04c7d2` |
| Scoring policy | `1b625f6a16ff5eaa985d8d2d504fd615206b0b0147807d68f467e151a5604a6c` |
| Threshold projection | `680fcdc9c899dfe1122941f4e59fb9ed917756eeeb17b40273425861a900e749` |
| D.2A cache identity | `64f0e5ccf1e243445c09f663f4c0e495530e4ae7b0901b2b2853346ea1a19cee` |
| D.2C comparative analysis | `de311bbef99ed43eca4ef71aa6eafc2f41317ad1ce13b5d09dedc52593e9fbac` |
| D.2D ranking result | `1f2ba552106a4c13eace2088e1277cc0b4bbf066dca0113e10b243db46b902c7` |
| Failed attempt binding | `0d92c7bdecff05976c929516664fb840066e265cf2b51e373065357bcadb8b46` |
| Failed raw report | `e0a3a2243824ca5b648f0e705f1209a4ea006beb2ea1ed0d1a2649910da0c18f` |
| Failed-attempt manifest | `622c23b026b397027313b3492e8a1dcf78e632f5a86bceb839e611e45fad5eb2` |
| Failed-attempt trace set | `91bfa76f1914c0404b1c69d95ff9672ce7b3b1ab141ea4e9b2032098f991ec8b` |
| Failed-attempt complete tree | `9a7cc9f07024b2c9c45d79ad0e6620f82fbb855bce17df9d8fe5e19d21f96201` |
| Traced production artifact | `0f87af4dfd851c268891c96237accf20b5089b0e0b95e10ac1417efebcca83a9` |
| Pre-attempt conformance report | `443ba196d1365005044b11e563b36a3d3bba2ce80bdda67834f0d1471ed8bc56` |

The retained pre-attempt pack contained two byte-identical tarballs with the
recorded production-artifact hash. Its conformance report passed 43 of 43
checks. The frozen cache still had exactly the 30 revision-derived directories,
no extras, and no Git metadata. No corpus file was reread or executed.

## Regression correction

The original evaluator called `safeTerminalText` during top-level receipt
finalization without importing it. Commit
`bd3cb95e722ca60c15f207337b1714804d1b6443` moved the unchanged canonical
finalizer into `scripts/lib/d2e-finalize.js`, made the real corpus entrypoint
call it, and added one focused end-to-end regression.

The regression finalizes 30 bounded synthetic receipts through the real
entrypoint, checks the exact manifest fields, commitments, inventory,
filenames, safe terminal text, and canonical safe-JSON bytes, and proves that
a bad receipt hash cannot yield a complete manifest. The focused D.2E suite
passed 9 of 9 checks before real recovery; syntax, strict checked-JavaScript,
and `git diff --check` also passed.

## Offline finalization and completeness

Recovery inputs were copied byte-for-byte to the additive content-addressed
directory
`eval/results/d2e-recovery-b26f85c47e98a686a79cce5359b50a559db483b70ecd23d15eda014621d411f1`.
Its canonical recovery binding has SHA-256
`b26f85c47e98a686a79cce5359b50a559db483b70ecd23d15eda014621d411f1`.

The committed canonical finalizer produced a complete attempt manifest:

| Result | Value |
| --- | ---: |
| Cases | 30 |
| Candidates | 33,484 |
| Eligible candidates | 28,749 |
| Trace bytes | 34,819,892 |
| Incomplete scans represented | 9 |
| Observer failures | 0 |
| Attempt-level completeness | passed |
| Trace-manifest SHA-256 | `19965b803e2b3acd5a0d0d0f290fd594a21584d377fc8f8645a0441b74b48fdd` |

The failed-attempt tree was recomputed after recovery and remained exactly
`9a7cc9f07024b2c9c45d79ad0e6620f82fbb855bce17df9d8fe5e19d21f96201`.

## Strict equivalence result

Strict equivalence failed. The traced projection is
`db1bb8a3b2c3646ec1b80558f0c99fc2622412da3cafe0ea6232ed48f6c7b2a0`;
the frozen D.2A projection is
`6cf249db6f1aee103eb8df23acae04becc0f347986435a76b4f5393ede9a50c6`.

Every frozen public field other than the unavailable required comparison
inputs is byte-equivalent. Important-file ordering, run and test commands,
abstentions, coverage, scan-complete booleans, analysis errors, categories,
labels, dimensions, totals, aggregate policy and scores, failures, and final
gate results have zero mismatches.

Equivalence still cannot pass:

- frozen D.2A retained no per-candidate membership for any of 30 cases;
- frozen D.2A retained no `scan_diagnostics` or incomplete-reason payload for
  any of 30 cases, including the nine scan-incomplete cases;
- the mechanical projection therefore has 30 missing-field mismatches across
  30 cases; and
- the stricter recovery authority has 60 unavailable required case-field
  comparisons: 30 candidate-membership and 30 scan-diagnostic comparisons.

Missing required data remains `Unknown`; matching aggregate totals cannot
replace it. The canonical mismatch evidence is
`equivalence.json`, SHA-256
`681adc6b0622a032ff2599024c9c53f6268476b53c9a07f79c590b92831e9689`.

## Analysis and decision

Mechanism analysis was not performed. No `mechanism-analysis.json` or
`analysis.json` exists. Neither `supported-generic-hypothesis` nor
`no-supported-generic-hypothesis` is claimed. Support, control, and
counterexample counts for a governed conclusion remain `Unknown`, not zero.
No correction was implemented.

The recovery evidence manifest is
`f66dfdc1c67ca5e9768a77785836a0316bde3ef7777704cedb75420b7a9cc0ef`.

## Evidence classification

### Known

- The preserved attempt is intact, schema-valid, and unchanged.
- Canonical offline finalization and trace completeness passed.
- All available frozen public score-relevant results agree exactly.
- Required candidate-membership and scan-diagnostic comparison inputs are
  absent from frozen D.2A.
- Strict semantic equivalence therefore failed before mechanism analysis.

### Likely

- No Likely claim is used to promote equivalence or a mechanism.

### Unknown

- Per-case D.2A candidate-membership equality.
- Per-case D.2A scan-diagnostic and incomplete-reason equality.
- Any governed generic mechanism, support/control/counterexample count, or
  correction effect.

### Stale / suspicious

- Printed aggregate equality is insufficient evidence of semantic
  equivalence.
- A replacement attempt by itself cannot recreate comparison fields that
  D.2A never retained.

### Suggested

The exact next permissible decision is an honest prerelease or governance
wait, or a separately authorized protocol amendment that decides how the
unavailable frozen D.2A fields may be treated. Only after that decision could
one separately authorize exactly one replacement attempt, if the amended
comparison would make it informative. No replacement attempt is authorized
or performed here.

## Certification

Certification passed without changing the equivalence disposition:

- focused D.2E, recovery, evaluation, contamination, ranking, adversarial,
  scope, compatibility, artifact, and plugin tests: 148 total, 147 passed,
  one platform skip, zero failed;
- complete `npm run validate`: 294 total, 290 passed, four platform skips,
  zero failed;
- generated synchronization and strict checked-JavaScript validation: passed;
- JavaScript syntax: 259 files parsed;
- JSON syntax: 129 files parsed;
- `git diff --check`: passed;
- two independently staged production packs: byte-identical, 128 entries
  each, 163,500 packed bytes and 701,394 unpacked bytes each;
- both production tarballs:
  `0f87af4dfd851c268891c96237accf20b5089b0e0b95e10ac1417efebcca83a9`;
- exact-tarball installation into an empty path containing spaces: passed;
  and
- installed-artifact conformance: 43 of 43 checks passed.

Relative to the authorized starting HEAD, shipped production lines changed
by +0/-0, evaluation tooling by +170/-120, and tests by +183/-0. Package
version `0.4.0-rc.1`, runtime dependencies (none), public capability
declarations, corpus, labels, policy, thresholds, configuration,
`V_1design.md`, historical Guard evidence, D.2A through D.2D evidence, and
the original failed D.2E attempt remained unchanged.

The strict-equivalence P0 remains open and blocks experimental progression
regardless of these passing deterministic certification results.
