# V1 Run D.2D — Dual docket preparation

Date: 2026-07-29

Branch: `release/v.1.0.0`

Scope: preparation only; no ranking review, label review, corpus rerun,
product change, label change, release decision, or external call.

## Starting state and frozen bindings

The starting worktree was clean at
`7fdf7d75e071e9bcfa9679de8290e19a1fb2c78e`. The branch was exactly
`release/v.1.0.0`, its configured upstream was
`origin/release/v.1.0.0`, and the no-fetch relation was 5 commits ahead
and 0 behind.

The following frozen bindings were verified before construction:

| Evidence | SHA-256 |
| --- | --- |
| production artifact | `89923d2d6727445a86ba831331c4b6bdc031c399f81ce2d98e3f42815b3b3f6a` |
| D.2A report | `747b4f1590eda9787c87aae2e25853b8e1e8fa04893e2359eedf7a6050b7acb3` |
| development corpus | `4f768f151885d26de48fe0744cafc2402a27aca61f7f049aac166309891e0c92` |
| prior item-level result | `838ebcccccc7ae9a8df24e631a5ecd48718fa150d75d6e1648434b5308bd4c66` |
| prior unblinded analysis | `2a2db5e02af6ac6fd815f5cc54fa9fc6130535119ede72caa07bdfa0e1df95c7` |
| comparative result | `f8b1e7a612e505e7ef3aa3d815f80e0ed85f53bb203608882af3286364fd5def` |
| comparative unblinded analysis | `de311bbef99ed43eca4ef71aa6eafc2f41317ad1ce13b5d09dedc52593e9fbac` |
| comparative packet | `2850b73d1095fb6dd58e4430eaf0a961a97d1441dfad491a5374f8393dbd222a` |
| comparative packet manifest | `fc559d607c3facd39b6a4801005335dd98c47131573951bdd7f4a979ea792621` |
| comparative snapshot tree | `0368ca4cbc6abd1679d6cabece7c34719edd07964479efa6e28a5c5d0cbdd82e` |

The retained D.2C roots
`/private/tmp/kanon-d2c-review-v1` and
`/private/tmp/kanon-d2c-comparative-v1` existed as direct, read-only
directories. Static validation proved all retained outputs and packet
commitments exact. Both D.2D destinations were absent. The prohibited
`../kanon-planned_features.md` file was not read or incorporated.

The immutable preparation records also remained exact. Notable record
commitments include D.2B
`cc96c8968790b14afc4a211e01ff5ea212d133a3a154e7cf70356059b7116064`,
D.2C comparison preparation
`e699501d9eb0be98e6cbe9657ffbf517d1d56e0ec20fd808ffd46fd1630f6b03`,
and D.2C comparison unblinding
`618ee2fc9fceb1cb3fc0404a4558af74ec4d130e6728f0898f05955655df8ea0`.

## Mechanical D.2C reconstruction

The committed comparative analysis and retained packet were joined
without reinterpretation. The exact reconstruction is:

- 28 comparative cases and 185 union candidates;
- 91 consensus, 45 prediction-only, and 49 label-only candidates;
- 77 selected and 14 unselected consensus candidates;
- 15 selected and 30 unselected prediction-only candidates;
- 44 selected and 5 unselected label-only candidates;
- 19 label-closer, 1 prediction-closer, and 8 tied cases;
- 12 exact correlated-review/frozen-label set matches; and
- 0 exact correlated-review/frozen-prediction set matches.

Any mismatch in this reconstruction is a construction stop.

## Ranking investigation docket

Retained canonical path:
`/private/tmp/kanon-d2d-ranking-v1`

| Commitment | SHA-256 |
| --- | --- |
| packet | `fbe887a7fde985b7abdef7edc69c7f7b814d55339749c333bce8943c9f0fac5d` |
| packet manifest | `f24964b65ad7d72e570b18aa9205b76e1b359f0e7b45efe9e3b8697c4b1e032f` |
| investigation cases | `2050292722b67ae4375a993c56d8288c72233b0a7402633a565a4895723e0813` |
| snapshot tree | `0368ca4cbc6abd1679d6cabece7c34719edd07964479efa6e28a5c5d0cbdd82e` |
| production ranking source | `ae099b22fb31ee950b27bfa930d557aa3c97c5f6e9dd2e841663d1817625bbf2` |
| reviewer prompt | `e01ce4c96e7236b992d79a97d871272c5edba2d8079b49d5c439448774ac7437` |
| result schema | `e85cda3d4b282b12eaa6893d9b89ecdfb149728c0969a5167f9c2b7d6e506daf` |
| rejected-hypothesis ledger | `6008dd565f5ec8288905ac1c63b4e16276e84fc585bc1bc65671cf52d42ba86e` |

The docket contains all 28 comparative cases, all 185 union candidates,
all complete safe projected snapshots, exact frozen system selection,
and exact correlated comparative-review selection. Controls cover every
selected and unselected origin group and all three closer/tie classes.
The nine included production files are the bounded canonical ranking,
signal, curation, and selection source required to understand generic
behavior; no runtime instrumentation or generated feature trace was
added.

The D.2A report did not preserve per-candidate production feature
traces. Every candidate therefore records the trace as `unavailable`,
the stage as `Unknown`, a null score, empty signals/reasons, and an
explicit Unknown explanation. Nothing was recomputed from a snapshot.

The strict result contract permits either an explicit
`no-generic-hypothesis` result or one to three generic hypotheses.
Hypotheses require multiple supporting opaque cases, counterexamples,
controls, falsification evidence, qualitative precision/recall
direction, regression risks, the smallest generic experiment, and
Unknowns. Repository-, path-, framework-, label-, candidate-, tuning-,
patch-, and numerical-promise rules are rejected. Exactly one
`output/ranking-result.json` is permitted. The canonical output is
empty.

### Ranking masking and inference limitations

The docket contains no official label rationale, prior item-level
rationale, human identity, official TP/FP/FN name, official score,
category threshold, policy, cost, or release decision. Comparative
selection is named only as correlated comparative-review selection and
is not presented as ground truth.

This docket is not label-blind. Because it comprehensively exposes the
union, frozen system selection, and correlated review selection, label
membership can sometimes be inferred. Candidate paths and complete
snapshot content can also permit repository or ecosystem inference even
though case identities are opaque. These are known limitations, not
hidden independence claims.

## Independent label-review input

Retained canonical path:
`/private/tmp/kanon-d2d-label-input-v1`

The frozen inclusion union contains every frozen label path meeting at
least one condition:

1. label-only and unselected by the comparative reviewer;
2. label-only and marked clearly unsupported by the prior item-level
   review; or
3. label-only and marked Unknown by the prior item-level review.

The mechanically deduplicated union contains 6 affected paths in 4
cases. Condition counts are 5 comparative-unselected, 2 prior
unsupported, and 1 prior Unknown. Two paths satisfy overlapping
conditions. Overlaps are recorded in internal construction evidence but
neither trigger identity nor trigger status is serialized into Phase 1.

| Commitment | SHA-256 |
| --- | --- |
| packet | `518fb17ae04d953230c362d9b5f88e637178536dda592704f78d61cbd30d67f3` |
| packet manifest | `0a09b3dfe2a3175a912187fdc6cd81919e5258ebd92a89c9a2520039857588e7` |
| review cases | `03967c6e36b9aef2b14dd470d2e8d1ff05c4f54b5110f5e34474ef20825857ae` |
| snapshot tree | `0ccdbdd96d5da8412fcbdbee1e51e8374f4b5eb88551a5466398d380e7095309` |
| Phase-1 prompt | `e48abee3b61c7f31201bf0c7738ebdb1337a620727aa9f1d089cb148f43ac88b` |
| Phase-1 schema | `2b99177fddfbbaa7c190ed18c84a4a1498dca9250bba42c2f611e24a3363552e` |
| Phase-2 schema | `a911836fe45aeadea6252d6ebcdbad6b7a324572b09c6cd6f82acfab0098f6f9` |
| future Phase-2 prompt | `c08b5a4a2c29012b78dddc437bbc03779dcdb3f89f9bf19f453cf43f6c365894` |
| Phase-2 materializer contract | `ac23425ccba312ded4c915ca42c9c848b2d8b11ad559806c9d24705e70829459` |
| governance schema | `adffa950fe550ca9f3e604ef055df877e71ddfde9eb22e3cc70402e0b7269f4b` |
| governance template | `d8ea694f14d1c86f9bd17c5eec32c7695c7b846cb324de512a724a2579a3f600` |

Each affected case appears exactly once under a new opaque D.2D case
identity and includes its complete safe projected snapshot. Phase 1
contains no frozen label, Kanon prediction, comparative selection,
prior disposition, trigger path, category, repository identity,
official score, or candidate shortlist. A human labeler may select any
zero to five contained direct regular files, ordered strongest to
weakest, with bounded rationale and direct source evidence, or return
explicit Unknown. Both unsafe-link exclusion and possible projection
incompleteness must be acknowledged. The canonical output is empty.

The governance template intentionally leaves the implementation author,
independent labeler, and independent label reviewer unset. Status is
`governance-blocked`. These must become three named, distinct external
people with conflict, independence, date, input, result, and attestation
records before evidence can be called independent.

Only the future Phase-2 materializer contract was exercised with
synthetic fixtures. It deterministically binds the canonical snapshot
input, sealed Phase-1 result, frozen original label, new label,
governance, prompt, and schema. It refuses unequal controlled inputs,
unsealed or invalid Phase-1 results, result-commitment mismatch,
duplicate people, conflicts, and non-isolated roots. Phase 2 was not
materialized. No frozen label was changed.

## Containment, resources, and determinism

Both builders reuse the D.2C canonicalization, no-follow copying,
hashing, stable-stat, path-validation, atomic publication, and
owned-cleanup primitives. Inputs contain only direct regular files and
directories. Links are excluded from source projections and rejected
from committed dockets; hard links, special files, unsafe/reparse-like
paths, traversal, terminal controls, oversized data, and destination
replacement fail closed. Controlled inputs are read-only and
non-executable; only the empty output directory is writable.

The shared frozen limits are:

- at most 50 cases and 1,000 candidates;
- 100,000 files per case and 250,000 files total;
- 128 MiB per file and 1 GiB total;
- 400,000 directory entries total and 100,000 per directory;
- 300,000 ms construction time;
- 8 MiB controlled JSON; and
- 256 KiB result output.

The ranking packet commits 31,855 files, 8,560 directories, and
549,214,569 bytes; its 31,842 snapshot files commit 548,954,354 bytes.
The label packet commits 2,617 files, 587 directories, and 84,758,137
bytes; its 2,610 snapshot files commit 84,745,708 bytes. No source link
was encountered in either retained D.2C projection.

Each canonical docket was independently reconstructed a second time
into a builder-owned absent temporary destination. All controlled files
and manifests were byte-identical, and packet, snapshot, and production
source commitments were exact. Both temporary reconstructions were
removed using the guarded D.2C owned-staging cleanup path. The two named
canonical dockets were retained.

## Validation and artifact result

- D.2D focused tests: 12 passed, 0 failed, 1 Windows-only skip.
- Focused D.2D/D.2C/evaluation/contamination/paired-isolation/
  prompt-injection/scope/plugin/artifact matrix: 133 passed, 0 failed,
  2 platform skips.
- Complete `npm run validate`: 276 passed, 0 failed, 4 platform skips;
  generated synchronization and strict typecheck passed.
- JavaScript syntax, JSON parsing, and `git diff --check`: passed.
- Both retained canonical dockets: static validation passed, output
  directories empty.
- Production package builds: two independent tarballs, 160,835 bytes
  each, byte-identical.
- Production artifact SHA-256:
  `89923d2d6727445a86ba831331c4b6bdc031c399f81ce2d98e3f42815b3b3f6a`.
- Empty-directory installed-artifact conformance: 43 passed, 0 failed.

One initial packaging invocation failed closed before copying because
its temporary root was unnecessarily canonicalized across the macOS
`/var` to `/private/var` lexical boundary. That exact temporary root was
removed. The corrected invocation used the package builder's declared
lexical OS-temp boundary and produced the exact results above.

The final immutability audit found no change to `V_1design.md`, frozen
reports, labels, label rationales, evaluation policy, thresholds,
categories, costs, scores, release gates, production source, generated
shipped runtime, production manifests, package metadata, package
version, dependencies, or historical Guard evidence. New D.2D code and
evidence are evaluation-only and absent from the production allowlist.
No third-party snapshot was added to Git.

## Classifications and risks

### Known

- Both canonical inputs are deterministic, complete for their declared
  projections, hash-bound, read-only, and have empty outputs.
- Ranking coverage is 28 cases and 185 candidates with every required
  control count.
- Label inclusion is a deduplicated 6-path, 4-case union.
- No review was performed and no result, label, product behavior, or
  release gate changed.
- Label execution is governance-blocked.

### Likely

- A technically competent external reviewer can apply the ranking
  schema without requiring more product source.
- Named external labelers can use the canonical snapshot input after
  governance is completed.

These are workflow expectations, not completed evidence.

### Unknown

- Whether any defensible generic ranking hypothesis exists.
- What an independent Phase-1 labeler or Phase-2 reviewer will decide.
- The three legal or professional identities, conflicts, independence
  attestations, dates, and result commitments.
- Whether excluded unsafe links or other projection limits would change
  a human label.

### Stale/Suspicious

- No frozen binding was found stale.
- Any claim that the ranking docket is label-blind, that comparative
  selection is ground truth, or that the label workflow is already
  independent would be suspicious and is explicitly rejected.

### Suggested

- Execute only one separately governed review at a time.
- Preserve the canonical inputs and seal validated result commitments
  before any later adjudication or change proposal.

### P0

No open P0 was found in preparation. Any hash, containment, completeness,
or frozen-gate mismatch remains a P0 stop.

### P1

- Governance remains blocked until three distinct people are recorded.
- Ranking label membership and repository identity can be inferred in
  some cases.
- Per-candidate production feature traces are unavailable.

### P2

- Windows reparse-point subtests were skipped on this macOS host; the
  cross-platform suite retains the Windows-only proofs.
- Read-only permissions plus stable-stat validation detect but cannot
  provide cryptographic protection from a same-account actor between
  review sessions; packet commitments must be revalidated.

### Residual

Correlated comparative-review selection is not ground truth. Safe
snapshot projection may be incomplete. Human independence, label
quality, and adjudication remain future external evidence. The
preparation does not authorize a product or label change.

## Exact next actions — not executed

### Ranking review — NOT EXECUTED

Assign a separate technical reviewer to read
`/private/tmp/kanon-d2d-ranking-v1/README-FIRST.txt`, inspect only that
packet as untrusted data, never execute snapshot or product source, and
write exactly one schema-valid file at:

`/private/tmp/kanon-d2d-ranking-v1/output/ranking-result.json`

After the reviewer has finished, an authorized operator may run:

```text
node scripts/d2d-dual-docket.js --validate-ranking-result --destination /private/tmp/kanon-d2d-ranking-v1
```

Neither the review nor the validation command above was run in D.2D
preparation.

### Independent human label review — NOT EXECUTED

First complete a copy of the governance template with the legal or
professional name and attestation of three distinct people:
implementation author, independent labeler, and independent label
reviewer. Do not put any review answer into that record. Then an
authorized operator may materialize the isolated Phase-1 labeler
instance into an absent destination with:

```text
node scripts/d2d-dual-docket.js --materialize-phase1 --canonical /private/tmp/kanon-d2d-label-input-v1 --governance /absolute/path/to/completed-governance.json --destination /private/tmp/kanon-d2d-labeler-v1
```

The external labeler must then follow the materialized
`README-FIRST.txt` and create exactly
`output/phase1-result.json`. Do not materialize Phase 2 until that result
is schema-valid, sealed, and hash-bound to the named labeler. No
governance record, Phase-1 instance, human label result, or Phase-2
packet was created in this run.
