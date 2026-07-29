# Kanon v1 Run D.2C-UNBLIND record

**Date:** 2026-07-29

**Branch:** `release/v.1.0.0`

**Scope:** formally validate, preserve, and mechanically unblind the completed
status-masked important-file adjudication, determine its evidentiary boundary,
and correct future evaluation-only reviewer-command generation. This run made
no product, label, policy, threshold, category, cost, or scoring change.

## Session and starting boundary

The session metadata reported `gpt-5.6-sol` with `xhigh` reasoning. The run
began from:

- exact preparation commit
  `372e66cddf4dd65fc4d87e6e982f1c90b9e11d73`;
- branch `release/v.1.0.0`;
- configured upstream `origin/release/v.1.0.0`;
- upstream relation one commit ahead and zero behind; and
- a completely clean worktree.

The retained packet existed at
`/private/tmp/kanon-d2c-review-v1`. Before result parsing, its `output/`
directory contained exactly one direct regular file:
`output/review-result.json`.

This outcome-exposed session did not act as an adjudicator and did not modify,
repair, normalize, reinterpret, or partially accept a reviewer disposition.
It made no live model call, network request, corpus execution, development
corpus run, fetch, pull, merge, rebase, reset, stash, amend, history rewrite,
push, tag, publication, or other external-state change. The retained packet
was neither modified nor deleted.

## Frozen evidence bindings

| Evidence | SHA-256 or identity |
| --- | --- |
| Preparation commit | `372e66cddf4dd65fc4d87e6e982f1c90b9e11d73` |
| Packet root | `/private/tmp/kanon-d2c-review-v1` |
| Packet-manifest SHA-256 | `008c3b271813820e934d73fbc777901b5139bc38e6b8d3e172f91d21ae939ef4` |
| Packet commitment | `abe906e1291086dc3803eb8d4153e6a5aede85b8b4e7ae4e18d99b8f44bc3979` |
| Reviewer-prompt SHA-256 | `f633b9139b5f03be449de7480276508d7848851872ec97bb12bd95c986040ac6` |
| Adjudication-schema SHA-256 | `8af982b857eb9a32b9b8436b280c7449e4e363242d246ebef443f9b09cec2fcc` |
| Review-items SHA-256 | `8f703240961edfb5d68d249d62826d0f9e6b603cb15694061f054ea3fa376e89` |
| Case-snapshot commitment | `4ad546ef3e7950697f80de7480a98cecc4f5e69de3b1bb7978fe302d228730b6` |
| Review-result SHA-256 | `838ebcccccc7ae9a8df24e631a5ecd48718fa150d75d6e1648434b5308bd4c66` |
| D.2A raw-report SHA-256 | `747b4f1590eda9787c87aae2e25853b8e1e8fa04893e2359eedf7a6050b7acb3` |
| Development-corpus SHA-256 | `4f768f151885d26de48fe0744cafc2402a27aca61f7f049aac166309891e0c92` |
| Restored product artifact | `89923d2d6727445a86ba831331c4b6bdc031c399f81ce2d98e3f42815b3b3f6a` |

The static validator recomputed every controlled-file and snapshot-file
commitment. It confirmed 28 cases and 94 items; read-only, non-executable
packet inputs; a contained writable output directory; and no packet links,
reparse points, special files, prohibited label/report/status mapping names,
Git metadata, `.kanon` metadata, or Kanon runtime. The independent frozen-input
audit again proved complete symmetric-difference membership, absence of
matching items, absence of side provenance, and deterministic item order.

## Formal result-validation proof

Static packet validation completed before `review-result.json` was parsed.
The result then passed the existing canonical item-shape, template-binding,
path, and disposition functions as extended for completed-packet output and
direct-source containment:

- schema version is exactly `kanon-d2c-adjudication-v1`;
- item count is exactly 94;
- all 94 item IDs are unique;
- every item occurs exactly once in the supplied order;
- case ID, item ID, path, snapshot root, file metadata, and `unknown_option`
  equal the supplied template exactly;
- every disposition is one of the six allowed values;
- every rationale is nonempty, UTF-8 bounded to 1,000 bytes, and contains no
  control, ANSI/OSC, or dangerous bidirectional character;
- every source list is nonempty, unique, bounded, and repository-relative;
- every source resolves without links to a direct regular file in the same
  case snapshot;
- there are no extra fields, omissions, or duplicates; and
- a second full static validation after parsing was identical to the first.

No validation failure was repaired or accepted. The formal result-validation
outcome is **pass**.

The exact masked bytes are preserved at
`eval/results/d2c-unblind-838ebccc/review-result.json`. Its SHA-256 remains
`838ebcccccc7ae9a8df24e631a5ecd48718fa150d75d6e1648434b5308bd4c66`.
The additive unblinded record is
`eval/results/d2c-unblind-838ebccc/unblinded-analysis.json`. It contains the
repository identities, mechanical origin join, unchanged reviewer fields,
category, commitments, complete matrices, case patterns, and item lists.
Third-party snapshots were not copied into the repository.

## Mechanical unblinding

The unblinder re-read the exact D.2A report and corpus bytes, ran the canonical
symmetric-difference and opaque-identity algorithm, joined each validated
item back to its case and path, and required exclusive membership in exactly
one origin. It did not change a disposition or recalculate a score.

### Prediction-only disposition matrix

| Reviewer disposition | Count |
| --- | ---: |
| clearly-defensible-important | 35 |
| clearly-unsupported | 10 |
| ambiguous-equivalent | 0 |
| insufficient-label-provenance | 0 |
| weak-ranking-signal | 0 |
| unknown | 0 |
| **Total** | **45** |

### Label-only disposition matrix

| Reviewer disposition | Count |
| --- | ---: |
| clearly-defensible-important | 46 |
| clearly-unsupported | 2 |
| ambiguous-equivalent | 0 |
| insufficient-label-provenance | 0 |
| weak-ranking-signal | 0 |
| unknown | 1 |
| **Total** | **49** |

Across both origins, 81 of 94 items were marked
`clearly-defensible-important`, 12 were marked `clearly-unsupported`, and one
was `unknown`. No item received `ambiguous-equivalent`,
`insufficient-label-provenance`, or `weak-ranking-signal`.

### Category by origin and disposition

Only nonzero dispositions are abbreviated below as defensible, unsupported,
and unknown. All omitted disposition cells are zero.

| Category | Prediction-only D/U/? | Label-only D/U/? |
| --- | ---: | ---: |
| go-service | 6 / 4 / 0 | 10 / 0 / 0 |
| monorepo | 12 / 1 / 0 | 13 / 0 / 0 |
| python-ml | 9 / 3 / 0 | 13 / 0 / 1 |
| python-web | 4 / 1 / 0 | 5 / 2 / 0 |
| rust-cli | 4 / 1 / 0 | 5 / 0 / 0 |
| **Total** | **35 / 10 / 0** | **46 / 2 / 1** |

The 10 clearly unsupported prediction-only items occur across nine cases and
all five categories. The two clearly unsupported label-only items occur in
one Python-web case. The one unknown is label-only in one Python-ML case.

### Case-level disagreement patterns

Seventeen of the 28 represented cases had every disputed item marked
clearly defensible. Eleven cases contained at least one unsupported or unknown
item:

| Opaque case | Category | Items | Prediction-only unsupported | Label-only unsupported | Unknown | Defensible |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `case-9a2aa408a5339ef7f9d5` | go-service | 4 | 1 | 0 | 0 | 3 |
| `case-f9d19760c12f72eaa933` | python-ml | 8 | 1 | 0 | 0 | 7 |
| `case-252c319d41b39118878a` | go-service | 4 | 1 | 0 | 0 | 3 |
| `case-e20f183077ea5021408f` | python-ml | 8 | 2 | 0 | 0 | 6 |
| `case-544d9ef412bce7994a73` | monorepo | 4 | 1 | 0 | 0 | 3 |
| `case-e1382be027673c336b85` | python-web | 2 | 1 | 0 | 0 | 1 |
| `case-fffe44ecc6f1c62266c4` | python-web | 2 | 0 | 2 | 0 | 0 |
| `case-4628a39c88a74335c07f` | python-ml | 3 | 0 | 0 | 1 | 2 |
| `case-631520ae9045bfe9ca44` | go-service | 4 | 1 | 0 | 0 | 3 |
| `case-4760635b80ee4edceab3` | rust-cli | 2 | 1 | 0 | 0 | 1 |
| `case-ee88fe4c02007f836828` | go-service | 4 | 1 | 0 | 0 | 3 |

Nine cases contain a clearly unsupported prediction-only selection. One case
contains both clearly unsupported label-only paths. One different case
contains the only unknown. Two represented cases have only label-only
disagreements. Full per-item and per-case data, including the repository
identity used for the mechanical join, remains confined to the evaluation-only
unblinded JSON.

## What this adjudication proves

The result addresses individual defensibility only. Within the limits of this
same-family reviewer and the retained snapshot projection, it provides:

- direct correlated development evidence that 35 prediction-only and 46
  label-only paths are individually defensible as important;
- direct correlated development evidence that 10 prediction-only paths were
  selected despite being individually unsupported by the reviewed snapshot;
- direct correlated development evidence that two label-only paths were
  individually unsupported and one lacked enough evidence for a non-Unknown
  judgment; and
- no reviewer disposition evidence for the other three nonzero-risk
  categories, because their counts are zero.

These are item-level reviewer judgments, not independent ground truth. A
`clearly-defensible-important` disposition means only that the individual path
has a defensible importance argument from direct snapshot evidence.

## What this adjudication cannot prove

The first packet contained only prediction-label symmetric-difference items.
It omitted all consensus paths and did not ask the reviewer to compare, rank,
or select an exact top five. Therefore:

- individual defensibility does not prove that a path is among the five best
  files for its repository;
- 35 defensible prediction-only paths do not automatically make the frozen
  five-path label sets incomplete or invalid;
- 46 defensible label-only paths do not prove that each label beats every
  excluded alternative;
- a defensible frozen false positive is not converted into an official true
  positive;
- the two unsupported label-only paths do not invalidate their labels without
  comparative evidence and the frozen label rationale;
- zero `ambiguous-equivalent` dispositions cannot establish that equivalent
  choices are absent, because alternatives were never presented together;
- the 10 unsupported prediction-only paths identify specific concerns but do
  not establish one generic ranking defect or authorize a generic product
  correction;
- no label, threshold, category, policy, cost, rationale, or scoring change is
  authorized; and
- no official passing score can be derived or recalculated from these
  dispositions.

The high rate of individually defensible disputed paths—81 of 94—is compatible
with a broad interpretation of “important.” It is not evidence that the
reviewer would retain those paths under a five-slot comparative constraint.

## Comparative top-five determination

A second status-masked comparative review is required before using this
evidence to resolve top-five membership, label completeness, or a ranking
correction. That separate review must present the complete
prediction-label union for each case, including consensus paths, without
origin/status metadata, and require a relative selection of at most five.

This run did not construct or execute that review. Product and label changes
remain hard-stopped.

## Reviewer invocation and limitations

The generated preparation command was incompatible with the installed Codex
CLI because `codex exec` does not expose a nested `--ask-for-approval` option.
The packet is intentionally Git-less, so a second attempt also required the
Git-repository check to be skipped.

The successful command is user-attested:

```sh
codex exec --skip-git-repo-check --ephemeral --model gpt-5.6-sol --sandbox workspace-write -c approval_policy="never" -c model_reasoning_effort="high" - < README-FIRST.txt
```

The ephemeral invocation left no persistent transcript. Retained
machine-readable evidence binds the packet, prompt, template, result, and
unblinding inputs, but it does not cryptographically prove model
configuration, tool history, prompt compliance, or external-read isolation.
The latter depended partly on prompt compliance and sandbox behavior. The use
of `--skip-git-repo-check` was necessary because the packet was intentionally
Git-less; it did not weaken the selected `workspace-write` sandbox.

The review used the same model family and remains correlated development
evidence. It is not the independent human label review required for release.
The reviewer saw individual disputed items but not the consensus candidate
set. A high rate of individually defensible items may therefore reflect a
broad importance interpretation rather than correct top-five ranking.

## Evaluation-command correction

Future generated commands now use the accepted configuration transport,
retain ephemeral execution, add the Git-less packet flag, preserve model,
reasoning effort, sandbox, and stdin prompt transport, and avoid dangerous
bypass flags:

```sh
cd '<packet-root>' && codex exec --skip-git-repo-check --ephemeral --model 'gpt-5.6-sol' --sandbox 'workspace-write' -c 'approval_policy="never"' -c 'model_reasoning_effort="high"' - < README-FIRST.txt
```

The generator shell-quotes the packet root and selected values. A unit
regression proves the required option set and absence of the obsolete flag.
The locally installed `codex exec --help` contract was also parsed and the
full corrected option vector was accepted with `--help`; neither check made a
model call. Historical `docs/v1-run-d2c-prep.md` and retained packet evidence
remain unchanged.

## Validation

Pre-commit validation on macOS arm64 with Node.js 25.8.1 produced:

- static packet validation and the frozen-input audit: passed;
- formal 94-item result validation before and after packet-input revalidation:
  passed;
- focused result, unblinding, matrix, packet mutation, masking, command,
  evaluation, contamination, paired-isolation, injection, scope, and plugin
  tests: **97 passed, 0 failed, 1 skipped**;
- focused D.2C result, masking, command, atomic preservation, and unblinding
  tests: **12 passed, 0 failed, 0 skipped**;
- complete `npm run validate`: **251 passed, 0 failed, 2 skipped**, from 253
  discovered tests;
- `npm run check:skill`: passed;
- `npm run typecheck`: passed;
- JavaScript syntax: **239 files passed**;
- JSON parsing: **39 files passed**;
- locally observed `codex exec --help` contract and corrected full option
  vector: passed without a model call;
- `git diff --check`: passed;
- independent production package construction and packing: **2/2 archives
  byte-identical**, 128 files, 160,835 packed bytes, and 690,239 unpacked
  bytes;
- both production archives have SHA-256
  `89923d2d6727445a86ba831331c4b6bdc031c399f81ce2d98e3f42815b3b3f6a`;
  and
- exact-tarball installed conformance: **43 passed, 0 failed, 0 skipped**.

The two complete-suite skips retain their prior classification: native
PowerShell was unavailable on this host, and the junction/reparse proof is
Windows-only. The focused suite contains only the Windows junction skip.
They remain Unknown rather than passed.

## Evidence classification

### Known

- The retained packet inputs and all frozen commitments match the preparation
  evidence.
- The exact 94-item result passes formal validation and is preserved
  byte-for-byte.
- Mechanical unblinding yields 45 prediction-only and 49 label-only items with
  no disposition changes.
- The matrices and case counts above are exact derivations from the frozen
  report, corpus, packet, and result.
- The packet did not present consensus paths or require an at-most-five
  selection.
- No official score, label, or product behavior changed.

### Likely

- The 81 individually defensible judgments partly reflect a broad importance
  interpretation rather than a comparative five-slot ranking.
- The dispersed unsupported prediction-only cases are more consistent with
  case-specific selection errors than one demonstrated generic defect.

### Unknown

- Which paths an independent human would choose in a complete status-masked
  top-five comparison.
- Whether each frozen label would survive direct comparison with every
  prediction-only alternative.
- Whether omitted link evidence would change any disposition.
- Cryptographic proof of reviewer model configuration, tool history,
  prompt-level isolation, or external-read isolation.
- Native Windows and PowerShell completed-packet behavior.

### Stale/Suspicious

- The historical generated command using `--ask-for-approval` is incompatible
  with the installed `codex exec` interface.
- Any claim that `clearly-defensible-important` changes frozen TP/FP/FN status,
  invalidates a label, establishes a top-five choice, authorizes a threshold
  change, or creates an official passing score is unsupported.
- Any generic product correction derived directly from this first
  item-isolated review would exceed its evidence.

### Suggested

- Authorize a separate preparation-only stage for a complete status-masked
  comparative prediction-label-union review with an at-most-five selection.
- Retain both the masked result and unblinded analysis as correlated
  development evidence.
- Keep product, label, scoring, slice 17, and candidate-freeze work blocked
  until the comparative boundary and required independent human review are
  resolved.

## Remaining risks and exact next stage

- **P0:** the frozen D.2A development gates still fail. Slice 17 and candidate
  freeze remain blocked.
- **P1:** top-five membership remains unresolved. Ten unsupported
  prediction-only items, two unsupported label-only items, and one unknown
  require bounded follow-up; none authorizes a product or label change.
- **P2:** nine D.2A scans remain incomplete, and the packet excluded 57 links.
  Their unreviewed evidence continues to constrain absence conclusions.
- **Residual:** the reviewer is same-family correlated evidence; execution
  configuration and outside-read isolation are not cryptographically proven;
  read-only modes are not immutable mounts; and same-user replacement races
  remain possible where descriptor-relative protection is unavailable.

The exact next permissible action is a separately authorized
**D.2C comparative-review preparation-only** stage. It may construct, but not
adjudicate or run, a status-masked packet containing the complete
prediction-label union per case, including consensus paths, with an at-most
five relative-selection task. Until then, hard-stop before every product,
label, scoring, corpus-run, slice 17, or candidate-freeze action.
