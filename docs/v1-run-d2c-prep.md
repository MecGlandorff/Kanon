# Kanon v1 Run D.2C-PREP record

**Date:** 2026-07-29

**Branch:** `release/v.1.0.0`

**Scope:** construct and validate a status-masked important-file adjudication
packet for a separate fresh-context reviewer, then hard-stop before
adjudication.

## Session and frozen boundary

The session header reported `gpt-5.6-sol` with `high` reasoning. The session
was outcome-exposed: it could read evaluation outcomes only to construct and
validate the masked packet. It did not adjudicate an item, inspect the packet
as a reviewer, propose a ranking rule, or make a product change.

The run began from:

- branch `release/v.1.0.0`;
- exact recovery HEAD
  `9008c0fec3a6b8a48ece04853df01ddf92604026`;
- a completely clean worktree; and
- configured upstream relation 12 commits ahead and 0 behind.

This session initiated no fetch, pull, merge, rebase, reset, stash, amend,
history rewrite, live model call, network request, corpus-repository
execution, development-corpus run, label change, scoring change, publication,
or external-state mutation. The prohibited sibling planning document was not
read.

During pre-commit validation, the local remote-tracking ref changed from
`e24752e8bd4a228c529f69703fd8c64e2d09affb` to the recovery HEAD. Its reflog
records `update by push` at 2026-07-29 01:38:13 +0200. This session issued no
push or fetch command. The working branch did not move, remained zero behind,
and became even with the updated remote-tracking ref before the preparation
commit.

Frozen inputs:

| Input | SHA-256 |
| --- | --- |
| Restored production artifact | `89923d2d6727445a86ba831331c4b6bdc031c399f81ce2d98e3f42815b3b3f6a` |
| D.2A raw report | `747b4f1590eda9787c87aae2e25853b8e1e8fa04893e2359eedf7a6050b7acb3` |
| Development corpus manifest | `4f768f151885d26de48fe0744cafc2402a27aca61f7f049aac166309891e0c92` |
| Canonical packet-input identity | `119adbc1b7fbdd54d1c1af456ab1add82fd86606d0e862f4b52273b9a40b7d39` |
| Preparation-seed commitment | `589466526c34a234aa640a8c1378d6cfa2602cc2b2fccf2bdb6ac476900650f4` |

The new preparation seed is committed in
`eval/d2c/preparation.json`. Deterministic keyed domains separately derive
case IDs, item IDs, case order, and within-case item order from that seed and
the canonical input identity.

## Packet construction

`scripts/build-d2c-packet.js` reads the exact committed preparation manifest,
verifies both frozen input hashes, validates the corpus schema, requires raw
report records to match corpus identity and order, and computes the
important-file symmetric difference per repository. Matching paths are
discarded. The intermediate masked record has exactly two fields: the
internal case key and contained repository-relative path. No disagreement
side survives into ID assignment or packet generation.

The builder stages into one randomly named directory beneath the canonical
output parent and refuses an existing destination. It removes only that
exact, builder-created staging path after a failure. Successful construction
is renamed atomically into the absent destination.

For each represented case, the builder selects the exact Git-less cache entry
bound by repository and revision. It walks sorted directory entries under
explicit limits, resolves every accepted entry with the existing hardened
containment primitive, rejects unsafe display controls and excluded evidence
names, opens regular files with no-follow semantics, checks stable device,
inode, mode, size, modification time, and change time before and after the
copy, rejects multiply linked regular files, and preserves accepted file
bytes exactly. It never executes snapshot content.

Repository-controlled links are never followed or copied. The 57 rejected
link entries are committed as a resource count. A disputed path that does not
resolve to a copied regular file stops construction. This produces a safe
regular-file projection of the exact immutable cache snapshots; it is not a
claim that link evidence was inspected.

After construction, all packet inputs and case snapshots are read-only and
non-executable. The root and case directories are read-only. Only the empty
`output/` directory is writable. No raw report, corpus manifest, label file,
prior prediction, mapping file, recovery document, preparation source,
Kanon runtime, or Kanon repository is copied.

Resource limits:

| Limit | Bound |
| --- | ---: |
| Cases | 50 |
| Review items | 1,000 |
| Files per case | 100,000 |
| Files total | 250,000 |
| Bytes per file | 134,217,728 |
| Snapshot bytes total | 1,073,741,824 |
| Directory entries total | 400,000 |
| Entries per directory | 100,000 |
| Construction elapsed time | 300,000 ms |

## Structural masking proof

The adjudication schema sets `additionalProperties: false` at the result,
item, and neutral metadata levels. Every item has exactly:

- an opaque case ID;
- an opaque item ID;
- the contained path under review;
- its opaque snapshot root;
- byte count and SHA-256;
- one reviewer-disposition field;
- one bounded rationale;
- bounded direct source paths; and
- the explicit `unknown` option.

The disposition enum contains only the six frozen choices. The initial
template requires null disposition, empty rationale, and empty source paths.
The completed-result validator requires every immutable item in the supplied
order, one allowed disposition, a bounded rationale, and unique contained
source paths.

Masking is a data-flow property, not a substring claim:

1. independently validated prediction and frozen-label path sets enter a set
   symmetric-difference operation;
2. matching members are removed before record creation;
3. the only intermediate fields are case identity and path;
4. opaque IDs and order are derived from isolated keyed domains;
5. the item builder constructs a new exact-key object without carrying an
   origin flag; and
6. the frozen-input audit independently recomputes membership, identities,
   and order, then compares only permitted packet fields.

The substring and prohibited-key checks remain defense-in-depth tripwires.
They are not the masking proof.

The actual frozen-input audit passed:

- every symmetric-difference item appears exactly once;
- no matching item appears;
- no side provenance enters a packet item; and
- deterministic case and item order matches recomputation.

The packet contains **28 cases and 94 items**, with no status breakdown.

## Packet identity and resources

Canonical retained workspace:

`/private/tmp/kanon-d2c-review-v1`

| Evidence | Value |
| --- | --- |
| Packet-manifest SHA-256 | `008c3b271813820e934d73fbc777901b5139bc38e6b8d3e172f91d21ae939ef4` |
| Packet commitment | `abe906e1291086dc3803eb8d4153e6a5aede85b8b4e7ae4e18d99b8f44bc3979` |
| Reviewer-prompt SHA-256 | `f633b9139b5f03be449de7480276508d7848851872ec97bb12bd95c986040ac6` |
| Adjudication-schema SHA-256 | `8af982b857eb9a32b9b8436b280c7449e4e363242d246ebef443f9b09cec2fcc` |
| Review-items SHA-256 | `8f703240961edfb5d68d249d62826d0f9e6b603cb15694061f054ea3fa376e89` |
| Case-snapshot commitment | `4ad546ef3e7950697f80de7480a98cecc4f5e69de3b1bb7978fe302d228730b6` |
| Total workspace file bytes | 549,005,089 |
| Snapshot file bytes | 548,954,354 |
| Snapshot files | 31,842 |
| Snapshot directories | 8,558 |
| Rejected links | 57 |

Two independent final-form constructions produced identical packet
commitments and byte-identical packet manifests. The redundant construction
and the superseded pre-hardening construction were removed. Only the
canonical workspace above is retained.

## Frozen reviewer prompt

The repository prompt template is `eval/d2c/reviewer-prompt.txt`; its exact
bytes are installed as `README-FIRST.txt`. It confines the reviewer to the
packet, classifies snapshot content as untrusted data, prohibits external
knowledge and repository-ranking skills, prohibits execution, requires direct
snapshot evidence for every item, requires `unknown` for incomplete or
ambiguous evidence, and permits exactly one output file. It requests no
product recommendation and no unblinding.

Fresh-window command:

```sh
cd '/private/tmp/kanon-d2c-review-v1' && codex exec --ephemeral --model gpt-5.6-sol --sandbox workspace-write --ask-for-approval never -c model_reasoning_effort=high - < README-FIRST.txt
```

This preparation session did not run that command.

## Validation

Pre-commit validation on macOS arm64 with Node.js 25.8.1:

- packet schema, masking, membership, mutation, containment, link,
  outside-root, resource, injection, cleanup, output, determinism, and
  artifact-exclusion tests: **9 passed, 0 failed, 0 skipped**;
- focused packet, evaluation, contamination, paired-isolation, injection,
  scope, and plugin tests: **95 passed, 0 failed, 0 skipped**;
- complete `npm run validate`: **248 passed, 0 failed, 2 skipped**, from 250
  discovered tests;
- `npm run check:skill`: passed;
- `npm run typecheck`: passed;
- JavaScript syntax: **236 files passed**;
- JSON parsing: **37 files passed**;
- frozen-input packet audit: passed all four structural claims;
- canonical packet self-validation: passed;
- independent packet construction: 2/2 manifest bytes and packet commitments
  identical;
- production artifact construction and packing: 2/2 archives byte-identical,
  128 files, 160,835 packed bytes, 690,239 unpacked bytes;
- production artifact SHA-256:
  `89923d2d6727445a86ba831331c4b6bdc031c399f81ce2d98e3f42815b3b3f6a`;
- exact-tarball installed conformance: **43 passed, 0 failed, 0 skipped**; and
- `git diff --check`: passed.

The two complete-suite skips retain their prior evidence classification:
native PowerShell was unavailable on this host and the junction/reparse proof
is Windows-only.

Two initial package-output attempts used `/private/tmp`, which is outside the
builder's lexical `os.tmpdir()` boundary on this host. Both were rejected
before staging. Two later pack attempts were rejected by the default npm cache
permissions before producing archives. Retrying in the canonical host
temporary root with dedicated offline caches passed. These were environmental
setup rejections, not product, packet, or conformance failures.

## Evidence classification

### Known

- The packet mechanically contains every disputed important-file path exactly
  once, contains no matching path, and carries no disagreement-side field.
- The strict schema, immutable item binding, neutral metadata, contained
  snapshots, read-only initial permissions, resource limits, and cleanup
  boundary passed their tests.
- Repository ANSI, OSC, bidirectional text, Markdown, and apparent prompt
  instructions remain snapshot bytes and cannot change controlled packet
  metadata or reviewer instructions.
- The two final packet constructions are deterministic.
- Evaluation-only additions remain outside the production artifact.
- The production archive remains byte-identical to the restored artifact and
  passes all 43 installed checks.

### Likely

- A fresh reviewer following the frozen prompt can complete the result without
  learning which input set supplied an item from packet metadata alone.

### Unknown

- Every item disposition; this session performed no adjudication.
- Whether omitted link evidence would materially affect any review. A reviewer
  must use `unknown` whenever the safe regular-file projection is
  insufficient.
- Native Windows and PowerShell packet behavior.
- Whether a future reviewer process obeys every prompt-level access
  restriction; no reviewer process ran in this session.

### Stale/Suspicious

- Any claim that this preparation resolves the frozen development gates,
  authorizes a product change, or completes slice 16 is unsupported.
- Any item judgment or ranking recommendation from this outcome-exposed
  preparation session would violate the review boundary.

### Suggested

- Retain the packet unchanged until the separate fresh-context review.
- Before review, verify the packet-manifest and reviewer-prompt hashes above.
- Run only the exact fresh-window command above, then validate the single
  result against the committed schema and immutable review template.
- Hard-stop again after review; any later interpretation or product decision
  requires separate authorization.

## Remaining risks and hard stop

- **P0:** the pre-existing frozen development gate remains unresolved. This
  preparation does not authorize slice 17 or candidate freeze.
- **P1:** adjudication remains incomplete. The packet's 57 rejected links and
  prompt-enforced outside-read restriction require conservative `unknown`
  outcomes when evidence or isolation is insufficient.
- **Residual:** read-only modes are an initial filesystem condition, not an
  immutable operating-system mount. Same-user replacement races remain
  possible where descriptor-relative directory walking is unavailable.
  Repository content can be stale, ambiguous, or malicious even when its
  bytes are safely contained.
- **Correlation:** the future review is still development-data review unless
  performed by the required independent human reviewer.

Retain `/private/tmp/kanon-d2c-review-v1` through review. Its `output/`
directory must remain empty until the fresh reviewer writes the one permitted
result. After the result, copy and hash that result under a separately
authorized evidence step before deleting the packet. Never delete or modify
the immutable development cache as packet cleanup.

Run D.2C-PREP hard-stops here, before adjudication.
