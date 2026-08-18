# V1 Run D.2D — Ranking result validation and preservation

Date: 2026-07-30

Branch: `release/v.1.0.0`

Scope: formally validate and preserve the completed ranking-review result
without reviewing it, changing it, generating a hypothesis, changing product
behavior, rerunning the corpus, or beginning either possible next stage.

## Starting boundary

The worktree was clean before this stage at preparation commit
`bf0230b8989feb957a1a9882383144918ba5c519`. The branch was exactly
`release/v.1.0.0`, its configured upstream was
`origin/release/v.1.0.0`, and the no-fetch relation was 6 commits ahead and
0 behind.

The retained ranking root was the direct directory
`/private/tmp/kanon-d2d-ranking-v1`. Its output contained exactly one direct,
singly linked regular file, `output/ranking-result.json`, and no other entry.
The retained label-input root was
`/private/tmp/kanon-d2d-label-input-v1`; its `output` directory remained
empty. The prohibited `../kanon-planned_features.md` file was not read or
incorporated.

## Frozen commitments

| Binding | Frozen value |
| --- | --- |
| preparation commit | `bf0230b8989feb957a1a9882383144918ba5c519` |
| ranking packet | `fbe887a7fde985b7abdef7edc69c7f7b814d55339749c333bce8943c9f0fac5d` |
| ranking manifest | `f24964b65ad7d72e570b18aa9205b76e1b359f0e7b45efe9e3b8697c4b1e032f` |
| ranking snapshots | `0368ca4cbc6abd1679d6cabece7c34719edd07964479efa6e28a5c5d0cbdd82e` |
| copied production source | `ae099b22fb31ee950b27bfa930d557aa3c97c5f6e9dd2e841663d1817625bbf2` |
| investigation cases | `2050292722b67ae4375a993c56d8288c72233b0a7402633a565a4895723e0813` |
| reviewer prompt | `e01ce4c96e7236b992d79a97d871272c5edba2d8079b49d5c439448774ac7437` |
| result schema | `e85cda3d4b282b12eaa6893d9b89ecdfb149728c0969a5167f9c2b7d6e506daf` |
| rejected-hypothesis ledger | `6008dd565f5ec8288905ac1c63b4e16276e84fc585bc1bc65671cf52d42ba86e` |
| ranking coverage | 28 cases and 185 candidates |
| production artifact | `89923d2d6727445a86ba831331c4b6bdc031c399f81ce2d98e3f42815b3b3f6a` |
| label packet | `518fb17ae04d953230c362d9b5f88e637178536dda592704f78d61cbd30d67f3` |
| label packet output | empty |

The exact ranking control counts also remained 77 consensus selected,
14 consensus unselected, 44 label-only selected, 5 label-only unselected,
15 prediction-only selected, 30 prediction-only unselected, 19 label-closer
cases, 1 prediction-closer case, and 8 tied cases.

## Static validation before result parsing

The ranking docket was first validated without parsing the result by invoking
`validateRankingDocket` with the sole allowed output name
`ranking-result.json`. It recomputed:

- the strict root and output inventories;
- direct-file, single-link, read-only-input, permission, containment, and
  special-file constraints;
- packet, manifest, snapshot-tree, copied-source, investigation-case,
  reviewer-prompt, result-schema, and rejected-ledger commitments;
- all case, candidate, control, file, directory, and byte counts; and
- stable before/read/after file and tree state.

Every frozen value matched. The static result reported 28 cases,
185 candidates, the exact control counts above, and exactly one permitted
output file.

The label docket independently revalidated to packet commitment
`518fb17ae04d953230c362d9b5f88e637178536dda592704f78d61cbd30d67f3`,
manifest
`0a09b3dfe2a3175a912187fdc6cd81919e5258ebd92a89c9a2520039857588e7`,
snapshot tree
`0ccdbdd96d5da8412fcbdbee1e51e8374f4b5eb88551a5466398d380e7095309`,
4 cases, governance status `governance-blocked`, and an empty output.

## Formal result validation

The required canonical command was run exactly:

```text
node scripts/d2d-dual-docket.js --validate-ranking-result --destination /private/tmp/kanon-d2d-ranking-v1
```

It returned `formal_result_valid: true`, packet commitment
`fbe887a7fde985b7abdef7edc69c7f7b814d55339749c333bce8943c9f0fac5d`,
and result SHA-256
`1f2ba552106a4c13eace2088e1277cc0b4bbf066dca0113e10b243db46b902c7`.

An independent stable read bound both the opened descriptor and path identity,
enforced the 256 KiB limit, required strict UTF-8 JSON with no duplicate object
keys, re-applied the exact schema and semantic validator, and revalidated the
complete static packet after parsing. The controlled packet identity
commitment was
`50e7293b8613e7f12cc681962085f46342cb0ad5f9834f03c447fa5a83596bf6`
on both sides of parsing and in both independent evidence generations.

The exact result is 203 bytes. Its exact reviewer outcome is:

```text
no-generic-hypothesis
```

It uses schema version `kanon-d2d-ranking-result-v1`, binds the frozen packet,
and contains zero hypotheses.

## Accidental trailing shell-command integrity proof

The reported command-not-found and permission-denied shell messages were not
used as evidence. Their harmlessness was not assumed. Instead:

- the canonical packet validator recomputed every committed packet byte,
  inventory, resource count, permission, link, containment, and hash binding
  before result parsing;
- the output inventory contained exactly `ranking-result.json`;
- the result was a direct, singly linked 203-byte regular file;
- the prompt, schema, cases, manifest, rejected ledger, snapshots, and copied
  source all retained their exact frozen commitments;
- descriptor/path stable-stat checks and the full controlled-state commitment
  were unchanged around parsing and in two independent generations; and
- the label packet independently revalidated with an empty output.

The observed trailing shell errors therefore did not change any controlled
packet input and did not add an output entry.

## Exact preservation

The absent deterministic destination was:

`eval/results/d2d-ranking-1f2ba552/`

The result was copied without parsing, serialization, normalization, or byte
change to:

`eval/results/d2d-ranking-1f2ba552/ranking-result.json`

The retained and preserved files are byte-identical, both 203 bytes, and both
have SHA-256
`1f2ba552106a4c13eace2088e1277cc0b4bbf066dca0113e10b243db46b902c7`.

The canonical evidence manifest is archive-only at:

`v1.0.0:eval/results/d2d-ranking-1f2ba552/evidence-manifest.json`

Its SHA-256 is
`4dbb12cca8020fd17020cb22c274d7b544242767ac81c10a4c381e0f2818e401`.
It remains byte-identical in the immutable v1.0.0 tag. The manifest binds the
preparation commit; packet, manifest, snapshot, copied source, prompt, schema,
and result hashes; result byte count; formal validation; exact reviewer
outcome; 28/185 coverage; preserved path; unchanged production artifact;
controlled-state proof; and evidence limitations. The current tree retains the
203-byte `ranking-result.json` because active D.2E analysis tooling reads it.

The complete evidence was independently generated twice. The result bytes and
canonical manifest bytes were identical before one absent-directory atomic
rename published the read-only destination. No snapshot or copied production
source was added to Git.

## Bounded evidentiary meaning

### Known

- The reviewer supplied no evidence-bounded generic ranking hypothesis from
  this packet.
- Per-candidate production signal, score, and selection-stage traces were
  unavailable.
- The exact result formally validates and is preserved byte-for-byte.
- The packet still covers exactly 28 cases and 185 candidates.
- No product, heuristic, scanner, ranking, runtime, label, policy, threshold,
  score, gate, package, version, dependency, or historical evidence changed.

### Likely

- A separately prepared observational trace protocol could make a future
  mechanism investigation more informative if it captures production-time
  per-candidate signals without changing prediction behavior.

This is a workflow expectation, not evidence that a generic ranking defect
exists.

### Unknown

- Whether one or more generic ranking defects actually exist.
- Which mechanism caused any individual disagreement.
- Whether safe-projection omissions would affect a future review.
- What independently governed human label review will conclude.

### Stale/Suspicious

- Interpreting `no-generic-hypothesis` as evidence that the product has no
  ranking defect is suspicious and rejected.
- Treating correlated comparative-review selection as ground truth is
  suspicious and rejected.
- Treating preparation-level no-open-P0 language as a passing release gate is
  stale and rejected.

### Suggested

- Prepare a separate observational trace protocol that captures
  production-time per-candidate signals without changing prediction behavior;
  or
- wait for the independently governed human label track.

Neither next stage was begun here.

## Risks and governance

### P0

The frozen D.2A development gates remain failed. Slice 17, candidate freeze,
holdout, tag, publication, and stable release remain blocked. This preservation
stage introduced no new P0, but preparation-level no-open-P0 language does not
make the release gate pass.

### P1

- Whether a generic ranking defect exists and its mechanism remain unresolved
  because production-time per-candidate traces were unavailable.
- Independent label provenance remains unresolved and governance-blocked.
  The implementation author, independent labeler, and independent label
  reviewer must be three named, distinct external people with complete
  conflict, independence, date, input, result, and attestation records.
- Ranking label membership and repository identity can be inferred in some
  packet cases.

### P2

- Nine historical D.2A scans remain incomplete and 57 frozen source-snapshot
  links were excluded by the earlier safe projection.
- Windows-only reparse/junction and PowerShell tests remain platform skips on
  this macOS host; their cross-platform tests remain present.
- Read-only permissions, hashing, and stable-stat comparison detect relevant
  mutations but do not provide cryptographic protection against every
  same-account actor between sessions.

### Residual

Correlated comparative-review selection is not ground truth. Safe snapshot
projection may be incomplete. Human independence, label quality, and later
adjudication remain future external evidence. This result authorizes no
product or label change.

## Validation

- Focused D.2D result and docket tests: 17 passed, 0 failed, 1 skipped
  (18 total).
- Broad D.2D/D.2C/evaluation/contamination/paired-isolation/
  prompt-injection/scope/plugin/artifact matrix: 148 passed, 0 failed,
  3 skipped (151 total).
- The first complete declared suite attempt found one existing
  concurrency-sensitive Guard fake-lifecycle timeout: 280 passed, 1 failed,
  4 skipped (285 total). Its isolated file rerun passed 41 of 41.
- Final complete `npm run validate`: 281 passed, 0 failed, 4 platform skips
  (285 total); generated synchronization and strict typecheck passed.
- Changed JavaScript syntax, repository JSON parsing, and
  `git diff --check`: passed.
- The first two package-directory builds under the declared OS temporary
  boundary passed. Their initial local `npm pack` calls failed before tarball
  creation because the user npm cache contained root-owned files. Retrying
  only the local pack step with separate builder-owned caches passed; no
  network or dependency resolution was used.
- Two independent production tarballs were 160,835 bytes each,
  byte-identical, and each had SHA-256
  `89923d2d6727445a86ba831331c4b6bdc031c399f81ce2d98e3f42815b3b3f6a`.
- Empty-directory installed-artifact conformance from that exact tarball:
  43 passed, 0 failed, 0 skipped.
- Final canonical result validation passed again. The retained label output
  remained empty. Retained and preserved result files remained byte-identical,
  and the final independent before/after packet-state proof remained
  `50e7293b8613e7f12cc681962085f46342cb0ad5f9834f03c447fa5a83596bf6`.

## Exact next permissible decision

After this isolated evidence commit, choose exactly one future stage:

1. prepare, but do not yet implement or collect, a separate observational
   trace protocol for production-time per-candidate signals that cannot change
   prediction behavior; or
2. wait for three-person independent human label governance and keep the label
   docket output empty.

This run hard-stops before either choice is executed.
