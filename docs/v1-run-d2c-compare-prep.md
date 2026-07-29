# V1 D.2C comparative review preparation

Date: 2026-07-29

Scope: D.2C-COMPARE-PREP only. This run froze the protocol, built and
validated a fresh status-masked comparative top-five packet, and stopped
before review. It did not run a reviewer, make a model call, adjudicate any
item, reinterpret the earlier 94 item-level dispositions, rerun the
development corpus, or change product behavior, labels, policies, thresholds,
categories, costs, or scoring.

## Starting state and frozen inputs

- Branch: `release/v.1.0.0`.
- Starting HEAD:
  `5103e75350e06bfadace913faca8477a31684983`.
- Starting worktree: clean.
- Configured upstream: `origin/release/v.1.0.0`.
- Starting upstream relation without fetch: 2 commits ahead, 0 behind.
- Restored production artifact SHA-256:
  `89923d2d6727445a86ba831331c4b6bdc031c399f81ce2d98e3f42815b3b3f6a`.
- Frozen raw D.2A report SHA-256:
  `747b4f1590eda9787c87aae2e25853b8e1e8fa04893e2359eedf7a6050b7acb3`.
- Frozen development corpus SHA-256:
  `4f768f151885d26de48fe0744cafc2402a27aca61f7f049aac166309891e0c92`.
- Frozen D.2C preparation SHA-256:
  `b8b86403935b1d030fe3b74f2da6643c3e18508df0f0d777625a8eeec5fd9b8f`.
- Frozen D.2C source snapshot-tree commitment:
  `4ad546ef3e7950697f80de7480a98cecc4f5e69de3b1bb7978fe302d228730b6`.
- Frozen D.2C preparation commit:
  `372e66cddf4dd65fc4d87e6e982f1c90b9e11d73`.
- Frozen D.2C packet-manifest SHA-256:
  `008c3b271813820e934d73fbc777901b5139bc38e6b8d3e172f91d21ae939ef4`.
- Frozen D.2C packet commitment:
  `abe906e1291086dc3803eb8d4153e6a5aede85b8b4e7ae4e18d99b8f44bc3979`.
- Frozen D.2C reviewer-prompt SHA-256:
  `f633b9139b5f03be449de7480276508d7848851872ec97bb12bd95c986040ac6`.
- Frozen D.2C result-schema SHA-256:
  `8af982b857eb9a32b9b8436b280c7449e4e363242d246ebef443f9b09cec2fcc`.
- Frozen D.2C review-items SHA-256:
  `8f703240961edfb5d68d249d62826d0f9e6b603cb15694061f054ea3fa376e89`.
- Frozen D.2C result SHA-256:
  `838ebcccccc7ae9a8df24e631a5ecd48718fa150d75d6e1648434b5308bd4c66`.

The source packet remained at `/private/tmp/kanon-d2c-review-v1`. Static
validation reproduced every frozen commitment above, found exactly 28 cases
and 94 prior review items, and reconfirmed its containment, permissions,
strict output set, link and special-file exclusions, and masked-input
completeness. The new destination did not exist at preflight. No fetch, pull,
internet access, or external read was used.

## Frozen comparative protocol

The deterministic exclusion rule is
`exclude-if-important-file-prediction-set-equals-label-set`. A development
case is excluded only when the prediction and label important-file sets are
equal. Every other case is included with the complete deduplicated set union
of those two sets, including consensus paths. The two excluded case keys are
not reviewer-visible; their sorted opaque commitment is
`3571989ebc689a79c3e8056e9b19e7d3f907ebeb90764efd92f0f07c140673c1`.

Mechanical counts:

- Included cases: 28.
- Union candidates: 185.
- Consensus candidates within those unions: 91.
- Excluded exact-agreement cases: 2.

Union membership is constructed first. Side membership is then discarded
before case IDs, candidate IDs, order keys, file metadata, or reviewer-visible
objects are derived. Case IDs, candidate IDs, case order, and candidate order
use four isolated HMAC-SHA-256 domains bound to the canonical frozen-input
identity. No side bit or origin-dependent sequence enters a domain.

The new preparation manifest SHA-256 is
`b722f61aacf20e9dc838dd923dd1d9a298cce6924a4e5c8e0c0e09c13a7cdec7`.
Its preparation-seed commitment is
`af7f31929891c9239fab7e361045bfdd60529f0a6f7fe298df05aaa67fc8b936`.
The preparation binds the exact starting HEAD, restored artifact, raw report,
corpus, source preparation, source snapshots, reviewer prompt, result schema,
exclusion rule, excluded count, and excluded-case commitment.

The result schema permits an ordered selection outcome with zero to five
unique candidates, or an explicit Unknown outcome with no selections.
Selection order is strongest to weakest. Every selection requires a bounded
non-empty rationale and one to twenty unique direct regular-file sources from
the same case snapshot. Unknown requires a bounded non-empty reason. Exact
keys and exact case order are mandatory. Formal validation rejects missing,
extra, duplicate, reordered, cross-case, or non-candidate selections; extra
fields; unsafe display text; invalid or cross-case sources; more than five
selections; malformed outcomes; indirect files; oversized results; and any
output other than the one permitted result file.

The reviewer prompt requires comparison of all candidates within every case,
does not make five a target, prefers direct architectural, entrypoint,
build/test, orchestration, and central-implementation evidence over
convention, and requires Unknown when incomplete or excluded evidence
prevents a defensible top-five decision. It forbids execution of repository
code and use of the internet, external files, prior knowledge, Kanon, labels,
predictions, previous reviews, or material outside the packet.

## Packet commitments and containment

Retained packet:
`/private/tmp/kanon-d2c-comparative-v1`.

- Comparative schema version: `kanon-d2c-comparative-packet-v1`.
- Canonical frozen-input commitment:
  `4f5c55cd08a4898fb7d7b825f3c17361ab3394f5f686508ba9149bd2c5ce8b48`.
- Reviewer-prompt SHA-256:
  `96b25cee9a79a0ce42b22469fc522d6f4d78db459f5f2cc00f4112011e476670`.
- Result-schema SHA-256:
  `78e732babb4b4a98ef2a9f607636d82b8e8ccdd4a1a2811333799fc9d8aff96a`.
- Review-cases SHA-256:
  `392ceb6cf3e10d8f19d04a51d2b0d4754c17a97ff516080db76c9765135ed990`.
- Source snapshot-tree commitment:
  `4ad546ef3e7950697f80de7480a98cecc4f5e69de3b1bb7978fe302d228730b6`.
- Comparative snapshot-tree commitment:
  `0368ca4cbc6abd1679d6cabece7c34719edd07964479efa6e28a5c5d0cbdd82e`.
- Packet-manifest SHA-256:
  `fc559d607c3facd39b6a4801005335dd98c47131573951bdd7f4a979ea792621`.
- Packet commitment:
  `2850b73d1095fb6dd58e4430eaf0a961a97d1441dfad491a5374f8393dbd222a`.
- Total packet file bytes: 549,018,473.

The builder stages beneath the canonical destination parent, refuses an
existing destination, validates the complete staged packet, and publishes by
same-parent rename. Inputs and snapshots are read-only and non-executable.
The root and case tree are read-only; exactly one writable directory,
`output/`, is present and empty. The strict root contains only the prompt,
schema, review cases, packet manifest, case snapshots, and output directory.
No Git metadata, controlled labels or predictions, reports, Kanon runtime,
repository instructions, prior D.2C outputs, or product code outside copied
snapshot evidence is included.

Required candidate evidence uses fail-preparation policy: a union candidate
that cannot be represented as a safe direct regular file aborts construction;
it is never silently omitted. Copying and validation reuse the original D.2C
no-follow containment, stable-stat, hard-link, reparse-point, special-file,
display-safety, resource-budget, and owned-cleanup primitives. The source
snapshot tree is rehashed after copying to detect mutation.

Resource limits:

- Cases: 50.
- Candidates per case: 10.
- Candidates total: 500.
- Snapshot files per case: 100,000.
- Snapshot files total: 250,000.
- Bytes per file: 134,217,728.
- Snapshot bytes total: 1,073,741,824.
- Directory entries total: 400,000.
- Entries per directory: 100,000.
- Construction elapsed time: 300,000 ms.
- Result bytes: 4,194,304.
- Rationale bytes: 1,000.
- Unknown-reason bytes: 1,000.
- Sources per selection: 20.

Observed resource counts:

- Snapshot files: 31,842.
- Snapshot directories: 8,558.
- Snapshot directory entries: 40,372.
- Snapshot bytes: 548,954,354.
- Links rejected during comparative copy: 0.
- Links excluded by the frozen source-snapshot projection: 57.
- Committed files: 31,845.
- Committed directories: 8,558.
- Committed bytes: 549,016,729.

## Structural masking proofs

The frozen-input audit mechanically reconstructed the expected union and
proved:

- every expected union candidate appears exactly once;
- all 91 consensus candidates are present;
- no non-union candidate is present;
- the two exact-agreement cases are excluded by the frozen rule;
- reviewer-visible cases contain only opaque case IDs, snapshot roots, opaque
  candidate IDs, paths, and snapshot-derived byte/hash metadata;
- no prediction-only, label-only, consensus, TP, FP, FN, rationale,
  disposition, unblinded result, score, category, repository identity, or
  equivalent status/provenance field is present;
- the four ID/order domains are isolated and deterministic; and
- swapping the complete prediction and label inputs yields identical masked
  membership, opaque identities, case order, candidate order, review bytes,
  controlled manifest, and packet commitment.

The side-swapped full fixture build and two independent production-corpus
builds provided symmetric and reconstruction proofs. The two independent
production builds produced byte-identical `packet-manifest.json` files with
SHA-256
`fc559d607c3facd39b6a4801005335dd98c47131573951bdd7f4a979ea792621`
and the same packet commitment
`2850b73d1095fb6dd58e4430eaf0a961a97d1441dfad491a5374f8393dbd222a`.
Only the canonical packet was retained after exact builder-owned temporary
state was removed.

Prior D.2C output and rationale files are outside the comparative builder's
read surface. Substring tripwires remain defense in depth; the primary proof
is the provenance-discarding data flow plus input-side symmetry and exact
membership reconstruction.

## Validation

- Focused comparative and original D.2C regression tests: 20 discovered,
  19 passed, 0 failed, 1 skipped (Windows-only reparse-point proof).
- Evaluation, contamination, paired-isolation, injection, scope, plugin, and
  D.2C tests: 126 discovered, 124 passed, 0 failed, 2 skipped.
- Complete declared `npm run validate`: 261 discovered, 258 passed, 0 failed,
  3 skipped. The skips were the two Windows-only reparse-point tests and the
  PowerShell-unavailable platform test.
- Strict typecheck and generated-artifact synchronization: passed.
- JavaScript syntax: 233 files passed.
- JSON parsing: 41 files passed.
- `git diff --check`: passed.
- Reviewer command option vector: accepted by local `codex exec --help`; no
  prompt was submitted and no model call was made.
- Original D.2C static commitments and result behavior: passed unchanged.
- Comparative retained-packet static validation and frozen-input audit:
  passed; output file count was zero.
- Independent comparative reconstruction: controlled manifests were
  byte-identical and packet commitments matched.
- Production artifact: two packs were byte-identical, each contained 128
  entries, and each had the required SHA-256
  `89923d2d6727445a86ba831331c4b6bdc031c399f81ce2d98e3f42815b3b3f6a`.
- Installed-artifact conformance from that exact tarball: 43 passed, 0 failed.

The final complete validation suite and static checks were repeated after the
last implementation and evidence changes and before commit.

## Evidence classification and residual risk

Known:

- The comparative packet has 28 cases, 185 union candidates, and 91 consensus
  candidates; 2 exact-agreement cases are excluded.
- Structural masking, complete union membership, consensus inclusion,
  non-union exclusion, deterministic ordering, side-swap invariance,
  containment, reconstruction, and empty-output invariants pass.
- The production archive and installed behavior are unchanged.
- No reviewer or adjudicator ran in this preparation.

Likely:

- A fresh reviewer can compare the supplied candidates consistently where
  direct snapshot evidence is complete, but this preparation does not predict
  its selections.

Unknown:

- Comparative reviewer selections and Unknown outcomes remain unknown.
- Any downstream effect on frozen D.2A conclusions remains unknown and must
  not be inferred from packet preparation.

Stale/Suspicious:

- The frozen development evaluation remains historical evidence with its
  previously recorded incomplete scans and failed gates; this run did not
  refresh or reinterpret it.
- The 57 frozen source-snapshot link exclusions can limit evidence even
  though every required union candidate itself is present. The reviewer is
  required to return Unknown when such excluded evidence blocks a defensible
  comparison.

Suggested:

- In a separate, explicitly authorized fresh-review session, run only the
  command below, then formally validate the single result without changing
  labels, scoring, product behavior, or the prior 94 dispositions.

Remaining issue levels:

- P0: the already frozen D.2A gate failures remain; preparation neither fixes
  nor weakens them.
- P1: relative top-five membership remains unresolved until the comparative
  review is independently completed.
- P2: the frozen evidence includes previously recorded incomplete scans and
  57 excluded links.
- Introduced by this preparation: no open P0 or P1 found after the
  principal-engineer correction loop.

Reviewer limitations remain material. Use of the same model family can
correlate preparation and review errors. The workspace sandbox, prompt
boundary, lack of internet use, and file permissions reduce accidental
external reads but are not cryptographic external-read isolation. Read-only
permissions are not same-user immutability. Prompt-injection resistance
depends on the reviewer obeying the frozen instruction boundary; structural
validation can reject malformed output but cannot prove the reviewer's mental
process. No result exists yet, so no comparative conclusion is Known.

## Exact fresh-reviewer command

Do not execute this command during preparation:

```sh
cd '/private/tmp/kanon-d2c-comparative-v1' && codex exec --skip-git-repo-check --ephemeral --model gpt-5.6-sol --sandbox workspace-write -c 'approval_policy="never"' -c 'model_reasoning_effort="high"' - < README-FIRST.txt
```
