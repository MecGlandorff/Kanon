# Kanon v1 package-declarations correction cycle

Date: 2026-07-30

Status: complete; hard-stopped after one authorized correction cycle. No
corpus, trace, model, network, release, or remote-state operation occurred.

## Authorization and boundary

The cycle started on `release/v.1.0.0` at
`38c6f44bb2d73072c7e930e5974f14b068cafaae`, with a clean worktree and
`origin/release/v.1.0.0` observed locally at 14 ahead and 0 behind. No fetch
was performed.

The frozen D.2E-A preferred hypothesis remained
`manifest-entrypoint-stage-conflation`. Authorization covered only the
`package-declarations` admission branch in `src/code-intel/curate.js`.
`manifest-entrypoints`, root manifests, scanning, ranking, weights, thresholds,
labels, categories, corpus, configuration, policy, protocols, authority, and
historical evidence remained outside scope.

The correction contract was written before production modification in
`docs/v1-package-declarations-correction-contract.md`.

## Correction

Commit:
`7dd5e5346a67b2e4e83f53fcd152b1479b287adb`.

A non-framework package declaration now enters the
`package-declarations` stage only when the candidate also has at least one
independent generic salience observation:

```text
fan_in > 0
OR referenced_by > 0
OR an entrypoint signal is present
```

Declaration type, declaration score, path, repository identity, category,
label, expected result, and trace outcome are not admission inputs.
Declaration-only candidates receive a trace-only `policy-excluded` decision.
The earlier executable `manifest-entrypoints` stage was not modified.

The implementation added one boolean predicate and one local admission branch.
It added no dependency, threshold, weight, configuration, policy, telemetry
framework, generalized selector rule, or new public result field.

## Test-first baseline

The first focused run, before production modification, passed 2 of 6 tests and
failed 4. One failure was an overconstrained test expectation: an independently
executable target was already selected by the protected
`manifest-entrypoints` stage and therefore correctly retained its executable
selection reason. That expectation was corrected before production code
changed.

The authoritative red baseline then passed 3 of 6 and failed 3:

- declaration-only rejection failed because the target was selected;
- deterministic displacement failed because that target displaced a later
  fan-in candidate; and
- special-case decoys failed because declaration alone still admitted them.

Retention, executable-control preservation, and trace-on/off equivalence were
green at that baseline.

A pre-change run of the 24 existing test files had one 10-second timeout in a
fake Codex lifecycle test under parallel load (290 passed, 4 platform skips).
The exact timed-out test passed immediately in isolation, and the later
complete validation passed it in the full suite.

## Focused preservation results

The post-correction focused file passed 6 of 6:

| Predeclared class | Result |
| --- | --- |
| Declaration-only false-positive rejection | Passed |
| Independently salient package-target retention | Passed |
| Executable `manifest-entrypoints` preservation | Passed |
| Deterministic selection and displacement | Passed |
| Trace-on/off public-result equivalence | Passed |
| Repository/path/label/category special-case rejection | Passed |

The deterministic fixture admitted the later fan-in target at the fifth
position, recorded the declaration-only target as policy-excluded, and
cap-excluded the next fan-in target with the exact fifth target as its
displacement boundary.

## Validation

- Focused package-declarations and executable-control tests: 6 passed, 0
  failed, 0 skipped.
- Grouped code-intelligence, ranking, selection, trace, compatibility,
  evaluation, contamination, adversarial, scope, artifact, and plugin tests:
  128 passed, 0 failed, 1 platform-only skip out of 129.
- Complete `npm run validate`: 298 passed, 0 failed, 4 platform-only skips out
  of 302.
- Strict checked-JavaScript validation: passed.
- Canonical generated synchronization and independent `--check`: passed.
- JavaScript syntax: 253 files parsed.
- JSON parsing: 134 files parsed.
- `git diff --check`: passed.

## Production artifact

The old artifact was reconstructed from the exact starting commit. Its
SHA-256 was exactly the previously recorded value:

`0f87af4dfd851c268891c96237accf20b5089b0e0b95e10ac1417efebcca83a9`.

Two independently staged new production builds and packs were byte-identical:

`1f3340f26f92d21387d3debeddeb42428fe3ab5988cfd6e5a6fc95062d262d8f`.

Each new pack contained 128 entries, 163,574 packed bytes, and 701,863
unpacked bytes. The old and new entry lists were identical. Exactly three
packaged files differed:

1. `runtime/src/code-intel/curate.js` contained the authorized predicate and
   admission branch;
2. `SBOM.json` contained only the corresponding runtime-file hash change; and
3. `MANIFEST.sha256` contained only the corresponding runtime and SBOM hash
   changes.

There was no unrelated packaged-file difference. The exact new tarball was
installed into a previously empty path containing spaces. Installed-artifact
conformance passed 43 of 43 checks and was bound to correction commit
`7dd5e5346a67b2e4e83f53fcd152b1479b287adb`.

Package version remains `0.4.0-rc.1`. Runtime dependencies remain zero. Public
capability declarations remain byte-identical at SHA-256
`bfc00d445cc480389559fd8c115a6ae2607dd6b7241dd0e256565bde5f0256cf`.

## Change and complexity deltas

Relative to the authorized starting commit:

- canonical production source: +21/-0 lines;
- required generated production mirror: +21/-0 lines;
- focused synthetic tests: +276/-0 lines;
- pre-change correction contract: +69/-0 lines;
- additive correction-cycle evidence: +230/-0 lines;
- runtime dependencies, configuration, policy, schemas, and public
  capabilities: +0/-0; and
- production complexity: one pure three-clause predicate, one admission
  branch, and one trace-only rejection event.

This additive cycle record is the only evidence change in the second commit.
It does not rewrite any prior evidence.

## Unchanged-evidence verification

The complete validation reran the authority, frozen-analysis, evaluation,
contamination, artifact, and plugin checks successfully. The first commit's
changed-file set contained only the contract, canonical curator, generated
curator mirror, and focused test.

Key immutable identities remained:

- design:
  `24b175b64eda8faadffcf40cbea3144e6cc95dd4dfaac8cbbb31b648dc4abf24`;
- evaluation protocol:
  `8d6b59e879cd35093f265207d5fec9e6e567f0bd66765cd73c75e1e63b65c0a6`;
- paired protocol:
  `132aeaf85984d791aa6c2335e498cb80ebfe4f99c7924230e7b487585237573a`;
- corpus:
  `4f768f151885d26de48fe0744cafc2402a27aca61f7f049aac166309891e0c92`;
- D.2E protocol:
  `d412ba3a4311640234b9291ac458da321a77db9da0df310cfd3186a56cad3f41`;
- D.2E-A authority:
  `678cbafc2a4bbc647eb9b73cc83bf96fd42a1eea1e4a5ce0c3b262c3d5862cc4`;
- D.2E-R evidence manifest:
  `f66dfdc1c67ca5e9768a77785836a0316bde3ef7777704cedb75420b7a9cc0ef`;
- frozen D.2E-A conclusion:
  `b84a9706ebe948303c9e6bc67641fc0dcbef81c0a873098c1d65c2be2dfef81b`;
  and
- frozen mechanism analysis:
  `0e45bd4dd56cb0c437cfd3ecc8f79d034339f285609da5287678991ee4498bf2`.

Strict equivalence remains `failed-required-comparison-unavailable`.

## Evidence classification and remaining risk

### Known

- The generic predicate, its deterministic synthetic behavior, trace
  equivalence, executable controls, complete validation, deterministic pack,
  exact artifact differences, installed conformance, and unchanged bound
  evidence were directly observed.
- No corpus or trace was rerun and no new prediction or score was produced.

### Likely

- Requiring independent salience is the smallest useful correction at the
  frozen package-declarations boundary because it rejects declaration-only
  admission while retaining the already represented salience mechanisms.

### Unknown

- Causal effect, counterfactual precision and recall, label validity, release
  readiness, independent review, candidate-membership equivalence,
  scan-diagnostic equivalence, and behavior on missing evidence from the nine
  historically incomplete scans remain Unknown.

### Stale / suspicious

- Treating this outcome-aware, correlated development correction as causal,
  blinded, independent, release, strict-equivalence, or label-validity
  evidence would be unsupported.
- The initial aggregate fake-lifecycle timeout was a suspicious timing result;
  its isolated and later full-suite passes prevent promotion to a current
  product failure but do not prove all future timing environments.

### Suggested

Hard-stop here. Preserve the two commits for review. The exact next permissible
action under current authority is a governance wait or review of this bounded
record. No corpus evaluation is authorized. Any future evaluation attempt
requires separate explicit authorization and must not be inferred from this
cycle.

Remaining P0: strict semantic equivalence is still failed because required
historical comparisons are unavailable. Remaining P1: causal effect,
independence, label validity, incomplete-scan sensitivity, recall loss, and
displacement safety outside the synthetic boundary remain unproved. Remaining
P2: the non-preferred root-manifest structural signal remains outside scope,
and declaration-only targets with useful but unobserved salience remain a
residual risk. No severity is resolved by inference.
