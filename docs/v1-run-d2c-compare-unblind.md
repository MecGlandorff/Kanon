# Kanon v1 Run D.2C-COMPARE-UNBLIND record

Date: 2026-07-29 (Europe/Brussels)

Status: completed evaluation-only comparative validation and mechanical
unblinding; hard-stop before product, label, score, release, slice 17,
candidate-freeze, push, tag, or publication work.

## Session and starting boundary

Before any comparative-result content was read, hashed, parsed, normalized, or
displayed:

- Branch was exactly `release/v.1.0.0`.
- HEAD was exactly
  `3be7c2567e8f790c2a887dc1fa8bd6abf4f5ff6d`.
- The worktree was completely clean.
- The configured upstream was `origin/release/v.1.0.0`.
- Without fetching, the branch was 3 commits ahead and 0 commits behind its
  upstream.
- `/private/tmp/kanon-d2c-comparative-v1` existed as a direct directory.
- Its `output/` directory contained exactly one direct entry:
  `comparative-result.json`.
- That entry was a direct regular file, singly linked, contained by the output
  directory, and 46,003 bytes. Its stable pre-parse identity was device
  `16777229`, inode `75727481`, and link count `1`.
- The retained original packet `/private/tmp/kanon-d2c-review-v1` existed.
- `../kanon-planned_features.md` was not read or incorporated.
- No internet, fetch, pull, merge, rebase, reset, stash, reviewer rerun, live
  model call, corpus rerun, or snapshot repository code execution occurred.

Repository instructions, the v1 design, all D.2A/D.2B/D.2C run records named
by the authorization, the evaluation protocols, D.2C comparative and
unblinding implementation and tests, package metadata, and artifact/release
machinery were read before implementation. Repository, packet, snapshot,
reviewer, path, rationale, label, and report values were treated as untrusted
data.

## Predeclaration boundary

Phase 1 treated the result as one permitted opaque output file. Static packet
validation accepted that exact output name but did not open or hash it.
Direct-file metadata alone was used for containment, type, size, link-count,
and stable-stat checks.

The following evaluation-only protocol, schema, narrow unblinder, and
synthetic tests were committed before the first result parse:

- Predeclaration commit:
  `976462f00892bffdfea6d2d6def90359a60ce89a`
- Commit message: `test(eval): freeze comparative unblinding protocol`
- Commit time: `2026-07-29T11:23:57+02:00`
- Protocol SHA-256:
  `a5f91f10832cd2f6c382c5536d3e7d3dd476b65bf9fde6d7e0541c75f847d1f0`
- Analysis-schema SHA-256:
  `2fae86392ccb8586ae1503cc72cbde5b0d87c91d39ad8f97131082dafcb6362f`

After that commit, the branch and clean worktree were rechecked, the branch
was 4 commits ahead and 0 behind its unchanged upstream, the result stat was
unchanged, and the opaque static validation was repeated. The first
result-content read was then the canonical completed-result validation. The
predeclaration commit was not amended.

The protocol fixes exact schemas, keys, categories, origin order, position
order, resource limits, canonical serialization, output names, refusal of an
existing destination, and these formulas for every selection outcome:

- Reviewer set: `R`; frozen prediction set: `P`; frozen label set: `L`.
- Intersection: `|R ∩ X|`, for `X` equal to `P` or `L`.
- Symmetric-difference distance:
  `d(R,X) = |R △ X| = |R| + |X| - 2|R ∩ X|`.
- Closer set: prediction when `d(R,P) < d(R,L)`, label when
  `d(R,L) < d(R,P)`, otherwise tie.
- Exact-set match: set equality between `R` and the frozen reference set.
- Aggregate reviewer agreement: summed intersections divided by summed
  unions across selection cases, reported as Jaccard reviewer agreement to
  six decimal places. An empty aggregate union yields `1`.
- Unknown cases are excluded from set comparison. Every candidate in such a
  case is `not-judged-unknown`, never unselected and never a negative
  judgment.

No threshold, significance claim, ground-truth claim, label replacement,
official-score recalculation, or automatic product decision is defined.

## Frozen evidence bindings

All required commitments revalidated before the predeclaration and again
immediately before result parsing:

| Binding | SHA-256 / commit |
| --- | --- |
| Preparation commit | `3be7c2567e8f790c2a887dc1fa8bd6abf4f5ff6d` |
| Production artifact | `89923d2d6727445a86ba831331c4b6bdc031c399f81ce2d98e3f42815b3b3f6a` |
| D.2A report | `747b4f1590eda9787c87aae2e25853b8e1e8fa04893e2359eedf7a6050b7acb3` |
| Development corpus | `4f768f151885d26de48fe0744cafc2402a27aca61f7f049aac166309891e0c92` |
| Prior D.2C result | `838ebcccccc7ae9a8df24e631a5ecd48718fa150d75d6e1648434b5308bd4c66` |
| Prior D.2C unblinded analysis | `2a2db5e02af6ac6fd815f5cc54fa9fc6130535119ede72caa07bdfa0e1df95c7` |
| Comparative preparation manifest | `b722f61aacf20e9dc838dd923dd1d9a298cce6924a4e5c8e0c0e09c13a7cdec7` |
| Comparative canonical input | `4f5c55cd08a4898fb7d7b825f3c17361ab3394f5f686508ba9149bd2c5ce8b48` |
| Comparative reviewer prompt | `96b25cee9a79a0ce42b22469fc522d6f4d78db459f5f2cc00f4112011e476670` |
| Comparative result schema | `78e732babb4b4a98ef2a9f607636d82b8e8ccdd4a1a2811333799fc9d8aff96a` |
| Comparative review cases | `392ceb6cf3e10d8f19d04a51d2b0d4754c17a97ff516080db76c9765135ed990` |
| Comparative source snapshot tree | `4ad546ef3e7950697f80de7480a98cecc4f5e69de3b1bb7978fe302d228730b6` |
| Comparative snapshot tree | `0368ca4cbc6abd1679d6cabece7c34719edd07964479efa6e28a5c5d0cbdd82e` |
| Comparative packet manifest | `fc559d607c3facd39b6a4801005335dd98c47131573951bdd7f4a979ea792621` |
| Comparative packet | `2850b73d1095fb6dd58e4430eaf0a961a97d1441dfad491a5374f8393dbd222a` |

Static reconstruction proved 28 included cases, 185 union candidates, 91
consensus candidates, 94 disputed candidates, and 2 excluded exact-agreement
cases. Controlled inputs, resource counts, containment, membership
reconstruction, consensus inclusion, exact-agreement exclusion, non-union
exclusion, deterministic ordering, provenance masking, and prediction-label
side-swap invariance all passed.

## Formal completed-result validation

Outcome: **pass**.

- Schema version was exactly `kanon-d2c-comparative-result-v1`.
- The result was 46,003 bytes, below the 4 MiB maximum.
- There were exactly 28 ordered unique cases, each exactly bound to its
  template.
- Every outcome was exactly `selection` or `unknown`.
- Selection outcomes contained zero through five unique same-case candidates
  and an empty Unknown reason.
- Unknown outcomes, if present, were required to contain zero selections and
  a bounded nonempty reason.
- Candidates, rationales, sources, source containment, direct regular-file
  type, link count, same-case provenance, uniqueness, ordering, exact fields,
  and resource bounds all passed.
- No case, candidate, field, or output entry was missing, duplicated,
  reordered, extra, cross-case, or non-candidate.
- The output directory still contained no other entry.
- Controlled packet inputs were identical before and after parsing.

Exact result:

- Packet result SHA-256:
  `f8b1e7a612e505e7ef3aa3d815f80e0ed85f53bb203608882af3286364fd5def`
- Preserved result SHA-256:
  `f8b1e7a612e505e7ef3aa3d815f80e0ed85f53bb203608882af3286364fd5def`
- Preserved byte count: 46,003

The absent destination
`eval/results/d2c-comparative-unblind-f8b1e7a6/` was created atomically.
`comparative-result.json` was preserved byte-for-byte. The retained packet and
its output were not modified or deleted.

## Mechanical unblinding

The canonical `unblinded-analysis.json`:

- SHA-256:
  `de311bbef99ed43eca4ef71aa6eafc2f41317ad1ce13b5d09dedc52593e9fbac`
- Byte count: 216,490
- Independent full regeneration: byte-identical

Every opaque case and candidate ID was mechanically joined to its frozen D.2A
case, category, repository, revision, path, prediction membership, label
membership, consensus status, file hash, comparative rationale, and direct
sources. Each of the 94 disputed candidates was mechanically joined to its
unchanged prior D.2C disposition, rationale, direct sources, reviewed-file
metadata, packet commitment, and result hash. Consensus candidates explicitly
carry `not-applicable-consensus` and no prior disputed-item disposition.

The analysis contains the complete ordered case-level and candidate-level
mapping. No third-party snapshot was copied into the repository, and no
manual interpretation or edit entered the canonical JSON.

## Outcome counts

| Outcome | Cases |
| --- | ---: |
| Selection | 28 |
| Unknown | 0 |

| Selection size | Cases |
| ---: | ---: |
| 0 | 0 |
| 1 | 0 |
| 2 | 0 |
| 3 | 0 |
| 4 | 4 |
| 5 | 24 |

There were 136 selected candidates, 49 unselected candidates, and 0
not-judged-Unknown candidates. Because there were no Unknown cases, every
candidate received a selected or unselected comparative status. The protocol
would not have treated candidates in an Unknown case as negative.

## Origin matrix

| Origin | Selected | Unselected | Not judged: Unknown | Total |
| --- | ---: | ---: | ---: | ---: |
| Consensus | 77 | 14 | 0 | 91 |
| Prediction-only | 15 | 30 | 0 | 45 |
| Label-only | 44 | 5 | 0 | 49 |
| **Total** | **136** | **49** | **0** | **185** |

## Category-by-origin matrix

Each cell is `selected / unselected / not-judged-Unknown / total`.

| Category | Consensus | Prediction-only | Label-only |
| --- | ---: | ---: | ---: |
| go-service | 14 / 6 / 0 / 20 | 6 / 4 / 0 / 10 | 10 / 0 / 0 / 10 |
| monorepo | 17 / 0 / 0 / 17 | 0 / 13 / 0 / 13 | 12 / 1 / 0 / 13 |
| python-ml | 13 / 3 / 0 / 16 | 5 / 7 / 0 / 12 | 11 / 3 / 0 / 14 |
| python-web | 15 / 3 / 0 / 18 | 2 / 3 / 0 / 5 | 6 / 1 / 0 / 7 |
| rust-cli | 18 / 2 / 0 / 20 | 2 / 3 / 0 / 5 | 5 / 0 / 0 / 5 |

## Selected position by origin

Positions run from strongest (`1`) to weakest (`5`) within the reviewer
selection.

| Position | Consensus | Prediction-only | Label-only | Total |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 18 | 0 | 10 | 28 |
| 2 | 12 | 1 | 15 | 28 |
| 3 | 15 | 6 | 7 | 28 |
| 4 | 14 | 6 | 8 | 28 |
| 5 | 18 | 2 | 4 | 24 |

## Prior D.2C disputed-item relationship

The prior review assessed individual defensibility. This comparative review
assessed relative selection, with at most five choices, inside the supplied
prediction-label union. A comparative nonselection is therefore not a
negative individual-defensibility judgment.

| Prior disposition | Prediction-only S/U/N/T | Label-only S/U/N/T | All S/U/N/T |
| --- | ---: | ---: | ---: |
| Clearly defensible/important | 14 / 21 / 0 / 35 | 43 / 3 / 0 / 46 | 57 / 24 / 0 / 81 |
| Clearly unsupported | 1 / 9 / 0 / 10 | 1 / 1 / 0 / 2 | 2 / 10 / 0 / 12 |
| Ambiguous/equivalent | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| Insufficient label provenance | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| Weak ranking signal | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| Unknown | 0 / 0 / 0 / 0 | 0 / 1 / 0 / 1 | 0 / 1 / 0 / 1 |

`S/U/N/T` means selected, unselected, not judged because the comparative case
was Unknown, and total. The one prior Unknown remained unchanged; its
comparative nonselection supplies no missing-evidence conclusion and does not
replace its prior Unknown disposition.

## Reviewer agreement with the frozen sets

These values are reviewer agreement, not accuracy, precision, recall, or
ground truth.

| Aggregate | Predictions | Labels |
| --- | ---: | ---: |
| Reviewer paths | 136 | 136 |
| Reference paths | 136 | 140 |
| Intersection paths | 92 | 121 |
| Union paths | 180 | 155 |
| Symmetric-difference paths | 88 | 34 |
| Jaccard reviewer agreement | 0.511111 | 0.780645 |

| Case comparison | Count |
| --- | ---: |
| Prediction closer | 1 |
| Label closer | 19 |
| Tie | 8 |
| Unknown, not compared | 0 |

| Exact-set match | Count |
| --- | ---: |
| Prediction | 0 |
| Label | 12 |
| Both | 0 |
| Unknown, not compared | 0 |

## Case-level prediction-versus-label comparison

`R`, `P`, and `L` are reviewer, prediction, and label set sizes. `R∩P` and
`R∩L` are intersections; `dP` and `dL` are symmetric-difference distances.
`Exact` is prediction/label.

| D.2A case | Category | R | P | L | R∩P | R∩L | dP | dL | Closer | Exact P/L |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| wagtail/bakerydemo | python-web | 4 | 5 | 5 | 3 | 4 | 3 | 1 | label | no/no |
| authelia/authelia | go-service | 5 | 5 | 5 | 3 | 4 | 4 | 2 | label | no/no |
| karpathy/nanogpt | python-ml | 5 | 4 | 5 | 4 | 4 | 1 | 2 | prediction | no/no |
| django/djangoproject.com | python-web | 5 | 5 | 5 | 4 | 5 | 2 | 0 | label | no/yes |
| pytorch/examples | python-ml | 5 | 5 | 5 | 1 | 5 | 8 | 0 | label | no/yes |
| sharkdp/fd | rust-cli | 5 | 5 | 5 | 4 | 5 | 2 | 0 | label | no/yes |
| casey/just | rust-cli | 5 | 5 | 5 | 4 | 5 | 2 | 0 | label | no/yes |
| usememos/memos | go-service | 5 | 5 | 5 | 3 | 4 | 4 | 2 | label | no/no |
| pmndrs/react-spring | monorepo | 5 | 5 | 5 | 3 | 5 | 4 | 0 | label | no/yes |
| sveltejs/kit | monorepo | 5 | 5 | 5 | 2 | 5 | 6 | 0 | label | no/yes |
| caddyserver/caddy | go-service | 5 | 5 | 5 | 4 | 4 | 2 | 2 | tie | no/no |
| pocketbase/pocketbase | go-service | 5 | 5 | 5 | 3 | 4 | 4 | 2 | label | no/no |
| saleor/saleor | python-web | 5 | 5 | 5 | 4 | 5 | 2 | 0 | label | no/yes |
| ml-explore/mlx-examples | python-ml | 4 | 5 | 5 | 2 | 3 | 5 | 3 | label | no/no |
| tanstack/query | monorepo | 4 | 5 | 5 | 3 | 4 | 3 | 1 | label | no/no |
| tinygrad/tinygrad | python-ml | 5 | 5 | 5 | 3 | 3 | 4 | 4 | tie | no/no |
| changesets/changesets | monorepo | 5 | 5 | 5 | 3 | 5 | 4 | 0 | label | no/yes |
| ajeetdsouza/zoxide | rust-cli | 5 | 5 | 5 | 4 | 5 | 2 | 0 | label | no/yes |
| adguardteam/adguardhome | go-service | 5 | 5 | 5 | 3 | 4 | 4 | 2 | label | no/no |
| karpathy/micrograd | python-ml | 5 | 4 | 5 | 4 | 5 | 1 | 0 | label | no/yes |
| pallets/flask-initial-no-readme | python-web | 4 | 3 | 5 | 3 | 4 | 1 | 1 | tie | no/no |
| charmbracelet/soft-serve | go-service | 5 | 5 | 5 | 4 | 4 | 2 | 2 | tie | no/no |
| sharkdp/bat | rust-cli | 5 | 5 | 5 | 4 | 4 | 2 | 2 | tie | no/no |
| karpathy/mingpt | python-ml | 5 | 5 | 5 | 4 | 4 | 2 | 2 | tie | no/no |
| pretix/pretix | python-web | 5 | 5 | 5 | 3 | 3 | 4 | 4 | tie | no/no |
| vercel/turborepo | monorepo | 5 | 5 | 5 | 4 | 5 | 2 | 0 | label | no/yes |
| vuejs/core | monorepo | 5 | 5 | 5 | 2 | 5 | 6 | 0 | label | no/yes |
| burntsushi/ripgrep | rust-cli | 5 | 5 | 5 | 4 | 4 | 2 | 2 | tie | no/no |

## What this result proves

- The exact completed result is structurally valid under the frozen canonical
  validator and was preserved byte-for-byte.
- For this reviewer, these frozen snapshots, and the supplied union only,
  label sets have greater descriptive aggregate agreement than prediction
  sets: 0.780645 versus 0.511111 Jaccard reviewer agreement.
- For this reviewer, labels are closer in 19 cases, predictions in 1, and
  both tie in 8; labels exactly match 12 reviewer sets and predictions match
  none.
- Relative selection is not identical to prior individual defensibility:
  57 of 81 previously defensible disputed candidates were selected, 2 of 12
  previously unsupported disputed candidates were selected, and the single
  prior Unknown disputed candidate was unselected without changing its
  Unknown disposition.
- The complete case/candidate join, counts, distances, ranks, rationales,
  sources, and hashes are reproducible mechanical derivations.
- Product behavior, shipped labels, policy, thresholds, categories, costs,
  official scores, and release gates did not change.

## What this result cannot prove

- This is same-model-family correlated development evidence, not independent
  human ground truth.
- Reviewer selection is not a frozen-label replacement.
- Reviewer agreement is not official precision, recall, or accuracy.
- A prediction being closer to the reviewer does not invalidate labels.
- A label being closer does not authorize a product heuristic.
- Unknown cases would create no absence or negative conclusion.
- The prior item-level review assessed individual defensibility; this review
  assesses relative selection within the supplied union.
- Neither review considered candidates outside the prediction-label union.
- Excluded links and incomplete scans may still constrain conclusions.
- No official D.2A score or release gate changes.
- No product hypothesis may be implemented from this evidence. A detailed
  hypothesis requires a separate fresh, outcome-aware but change-isolated
  design stage.
- Any label revision requires the independently governed label process.
- Structural validation cannot prove the reviewer's mental process, model
  configuration, tool history, or cryptographic external-read isolation.

## Evidence classification

### Known

- All frozen packet and evidence commitments match.
- The result formally validates, is preserved exactly, and mechanically
  regenerates the same canonical analysis bytes.
- The exact outcome, origin, category, rank, prior-disposition, agreement,
  and case matrices above follow from the frozen inputs and result.
- No Unknown comparative case occurred.
- No official score, label, product behavior, package, or release state
  changed.

### Likely

- The selected-position pattern and the selection of 15 prediction-only
  candidates, including 14 previously defensible ones, warrant a bounded
  ranking/selection investigation.
- The relative replacement of some label-only candidates by prediction-only
  alternatives warrants an independently governed label-review docket.
- These are leads for investigation, not findings that authorize either a
  heuristic or a label edit.

### Unknown

- Which top five independent human reviewers would select from complete
  repository evidence.
- Whether omitted candidates outside the frozen union would displace any
  selected path.
- Whether the 57 excluded links or nine historically incomplete D.2A scans
  would change comparative selections.
- Whether the two comparative selections that conflict with prior
  `clearly-unsupported` dispositions reflect comparative error, prior-review
  error, or evidence/context differences.
- Native Windows completed-packet behavior and cryptographic proof of
  reviewer isolation.

### Stale/Suspicious

- The frozen D.2A development report remains historical threshold-failing
  evidence; this run neither refreshes nor reinterprets it.
- Treating any unselected candidate as unimportant is suspicious because the
  reviewer had a five-slot cap.
- Treating 19 label-closer cases or 12 exact label matches as label
  correctness is unsupported.
- Treating one prediction-closer case as label invalidation or a generic
  product rule is unsupported.
- Treating same-family agreement as independent adjudication is unsupported.

### Suggested

- Evidence supports **both** a bounded ranking investigation and a separate,
  independently governed label review.
- Keep both follow-ups change-isolated: first prepare exact candidate dockets,
  questions, evidence requirements, and decision ownership; do not change
  product code or labels in that preparation.
- Require any product hypothesis to be evaluated separately, and require any
  label proposal to pass the independent label-governance process.

## Validation and artifact identity

Before the evidence commit:

- Focused comparative, packet, unblinding, mutation, contamination, and
  artifact-exclusion tests: 25 passed, 0 failed, 1 skipped. The skip is the
  declared Windows-only comparative-junction proof.
- Complete declared `npm run validate`: generated synchronization passed,
  strict typecheck passed, and the full Node suite reported 264 passed,
  0 failed, and 3 skipped out of 267. The skips are two Windows-only
  link/junction proofs and the unavailable PowerShell-wrapper proof.
- Two independent allowlist builds and offline local packs produced
  byte-identical 128-entry tarballs. Each SHA-256 was exactly
  `89923d2d6727445a86ba831331c4b6bdc031c399f81ce2d98e3f42815b3b3f6a`.
- Installation of that exact tarball into a fresh empty directory passed all
  43 installed-artifact conformance checks, with 0 failures.
- The first local pack attempt produced no tarball because npm tried to use
  an out-of-bound user cache. Repeating with isolated temporary caches
  succeeded; this environment correction did not change repository or staged
  package bytes.

JavaScript syntax, JSON parsing, generated synchronization, strict typecheck,
`git diff --check`, immutable-surface comparison, final complete validation,
and final clean-worktree/upstream checks are repeated after this record's last
edit and recorded in the evidence commit boundary.

## Remaining risks and exact next decision

- **P0:** the frozen D.2A development gates still fail. Slice 17, candidate
  freeze, holdout, and release remain blocked.
- **P1:** ranking selection and label provenance remain independently
  unresolved. Fifteen selected prediction-only candidates and five
  unselected label-only candidates form a review docket, not a change set.
  The two selected candidates previously judged unsupported are direct
  same-family-review conflicts requiring independent treatment.
- **P2:** nine historical D.2A scans remain incomplete, and 57 frozen links
  were excluded. Neither review covers candidates outside the union.
- **Residual:** same-model-family correlation, non-cryptographic reviewer
  isolation, read-only permissions that are not immutable mounts, bounded
  descriptor/replacement races, and untested native Windows result handling
  remain.

The smallest next user decision is a yes/no authorization: **authorize or
decline a separate, outcome-aware but change-isolated preparation stage for
both (1) a ranking/selection investigation docket and (2) an independently
governed label-review docket.** Authorization would prepare evidence and
decision criteria only; it would not authorize product changes, label
changes, score recalculation, a corpus run, slice 17, candidate freeze,
release, push, tag, or publication.

Until that explicit decision, hard-stop.
