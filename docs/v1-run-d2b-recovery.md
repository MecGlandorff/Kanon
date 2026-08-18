# Kanon v1 Run D.2B-R recovery record

**Date:** 2026-07-29

Archive note for v1.1.0: the raw D.2B report and predeclared case/path taxonomy
referenced by this historical record now live only in the immutable `v1.0.0`
tag. Their exact paths and digests remain recorded below; see the
[historical evaluation archive](../eval/results/README.md) for retrieval.

**Branch:** `release/v.1.0.0`

**Recovery scope:** restore the pre-D.2B product without erasing the failed
experiment, then stop before any new ranking hypothesis or corpus execution.

## Session and starting boundary

The session header reported `gpt-5.6-sol` with `max` reasoning. That did not
literally match the requested `xhigh` precondition, so work stopped before any
repository mutation. The user explicitly overruled that mismatch with
“max is better and continue.”

The recovery began from:

- clean commit
  `b704b580b606abc936f225afb431378f3a5de54c`;
- branch `release/v.1.0.0`;
- configured upstream `origin/release/v.1.0.0`;
- upstream relation 0 commits behind and 10 commits ahead; and
- a completely clean worktree.

No fetch, pull, merge, rebase, reset, stash, amend, history rewrite, live model
call, network request, corpus-repository execution, or development-corpus run
occurred. The package and conformance installs were restricted to the exact
local tarball and npm offline mode.

Relevant identities:

| Role | Commit |
| --- | --- |
| Known-good pre-D.2B product | `637c6ecbc4cc201b2124cd58ea6359b92f518e9b` |
| Falsified D.2B product | `7da293a544b94bcfad1eaaf05db5534d9ff4254c` |
| Permanent D.2B evidence | `b704b580b606abc936f225afb431378f3a5de54c` |
| Product recovery revert | `e805fa53a8e175184ba833282d3f8cedbddf0eba` |

## Why the D.2B hypothesis was rejected

The single preserved D.2B evaluation falsified the evidence-type pruning
hypothesis:

- important-file false positives remained **45**;
- the 12 removed important-file predictions were all true positives;
- run behavior ended with two fewer true positives, 14 to 12, and added three
  false positives, 0 to 3; the underlying churn was five recovered true
  positives and seven lost former true positives;
- total weighted error worsened from **298** to **327**, or 9.93 to 10.90 per
  case;
- total true positives fell from 137 to 123, false positives rose from 46 to
  49, and false negatives rose from 68 to 82;
- strictly checked canonical and generated runtime size each increased by 407
  lines; and
- the packed artifact increased by 3,008 bytes and the unpacked artifact by
  10,649 bytes.

The evidence-type pruning hypothesis is therefore falsified. D.2B remains
permanent development evidence. Restoring D.2A behavior does not make the
D.2A thresholds pass: D.2A remains at 74.9% overall precision, 66.8% overall
recall, and 9.93 weighted error per case. Slice 17 and candidate freeze remain
blocked.

## Changed paths and recovery disposition

The D.2B product commit changed 29 paths. They were classified before the
inverse was applied:

| Class | Exact path set | Recovery disposition |
| --- | --- | --- |
| Product documentation | `docs/heuristics.md` | Restored to the pre-D.2B blob. |
| Canonical product | `src/code-intel/{command-utils,commands,conventional-commands,curate,documented-commands,entrypoints,heuristics,imports,index,manifest-commands,shared}.js` | All 11 restored to the pre-D.2B blobs. |
| Generated runtime | The matching 11 paths under `runtime/src/code-intel/` | All 11 restored to the pre-D.2B blobs through the product inverse; canonical generation then confirmed byte synchronization. |
| Hypothesis-specific product test | `test/d2b-code-intel.test.js` | Removed, matching its absence before D.2B. |
| Evaluation diagnostics | `scripts/lib/eval-corpus/analyze-case.js`, `scripts/lib/eval-corpus/scoring.js`, and `test/eval.test.js` | Preserved. These bounded raw-report diagnostics are evaluation-only, are excluded from the shipped allowlist, and support interpretation of the permanent report. |
| Predeclared evidence | `docs/v1-run-d2b.md` and `v1.0.0:eval/results/d2b-predeclared-taxonomy.json` | The compact record remains in HEAD; the case/path payload is archive-only and byte-identical. |

The later evidence commit changed three evidence-only paths:

- `docs/v1-run-d2b.md`;
- `eval/RESULTS.md`; and
- `v1.0.0:eval/results/development-0.4.0-rc.1-d2b-7da293a5.json`
  (now archive-only).

Those paths were not included in the inverse. No replacement ranking,
command, scanner, budget, label, policy, threshold, or scoring hypothesis was
introduced.

## Evidence identity before and after recovery

Every required evidence file has the same SHA-256 before and after the product
recovery:

| Evidence | Before SHA-256 | After SHA-256 |
| --- | --- | --- |
| `docs/v1-run-d2b.md` | `cc96c8968790b14afc4a211e01ff5ea212d133a3a154e7cf70356059b7116064` | `cc96c8968790b14afc4a211e01ff5ea212d133a3a154e7cf70356059b7116064` |
| D.2B raw report | `e1c69f8f443e8dcd8ebf75abf7ce15e01029ed979d409ec356070c05afa0fbde` | `e1c69f8f443e8dcd8ebf75abf7ce15e01029ed979d409ec356070c05afa0fbde` |
| `eval/RESULTS.md` | `c720b7ad10b235dfad2e544d8d2cb001a72ba3b7eabfe346e7e604f9d87b342a` | `c720b7ad10b235dfad2e544d8d2cb001a72ba3b7eabfe346e7e604f9d87b342a` |
| D.2A raw report | `747b4f1590eda9787c87aae2e25853b8e1e8fa04893e2359eedf7a6050b7acb3` | `747b4f1590eda9787c87aae2e25853b8e1e8fa04893e2359eedf7a6050b7acb3` |
| `V_1design.md` | `24b175b64eda8faadffcf40cbea3144e6cc95dd4dfaac8cbbb31b648dc4abf24` | `24b175b64eda8faadffcf40cbea3144e6cc95dd4dfaac8cbbb31b648dc4abf24` |
| `eval/PROTOCOL.md` | `8d6b59e879cd35093f265207d5fec9e6e567f0bd66765cd73c75e1e63b65c0a6` | `8d6b59e879cd35093f265207d5fec9e6e567f0bd66765cd73c75e1e63b65c0a6` |
| `eval/PAIRED_ABLATION.md` | `132aeaf85984d791aa6c2335e498cb80ebfe4f99c7924230e7b487585237573a` | `132aeaf85984d791aa6c2335e498cb80ebfe4f99c7924230e7b487585237573a` |
| Paired configuration | `aef23d32b16755442c54fc9ebe7b05fda22e129c498cc0d3e87c12886afcbf23` | `aef23d32b16755442c54fc9ebe7b05fda22e129c498cc0d3e87c12886afcbf23` |
| Paired answer schema | `0e0270bf4a2457f7dafc89acaa5db745287cef8200dcf84df4dbc45ad9167183` | `0e0270bf4a2457f7dafc89acaa5db745287cef8200dcf84df4dbc45ad9167183` |
| Corpus manifest, labels, policy, and thresholds | `4f768f151885d26de48fe0744cafc2402a27aca61f7f049aac166309891e0c92` | `4f768f151885d26de48fe0744cafc2402a27aca61f7f049aac166309891e0c92` |
| D.2B predeclared taxonomy | `c266146f2282d777bd87d2ba5beaa30fecf6281b5618dc77074101e091fd2c33` | `c266146f2282d777bd87d2ba5beaa30fecf6281b5618dc77074101e091fd2c33` |
| Historical Guard record | `7e18523f13533d2abd465c5a7629bafb6958c14f981a3834346f8adfd9a54fd6` | `7e18523f13533d2abd465c5a7629bafb6958c14f981a3834346f8adfd9a54fd6` |

The corpus manifest contains the labels, scoring policy, costs, category
assignments, and frozen thresholds, so its single identity binds all of those
inputs.

The nine historical Guard result files also remained exact:

| Result suffix | Before and after SHA-256 |
| --- | --- |
| Claude base | `8a12575b0f0841cc30c880ce8855364cae8b9a9de3485fc26f2029e7cbdf5182` |
| Claude A.1 follow-up | `537bcc0791cf0ed7b4b1da3305169e4e67cdc0064c86f4b5ae9a97d03ead8c6b` |
| Claude A.1 follow-up 2 | `85225891fb1f0106c0daf0bef05aff504abe02adb3a605771ad4564e30b647c4` |
| Codex base | `47dad5a64845242ed99ea3873c024ef285350cb3b2e154c50549c748bfb51ec1` |
| Codex A.1 persisted-trust preflight | `3950b7db9a89e8c34e056e9fbec56f944cb9325aa4910f9a9c362d3664b168d6` |
| Codex A.2 persisted-trust preflight | `05e354743e58ec902602f19de29d415a8ac25a21fc68a59b23f73c744768b693` |
| Codex A.2 post-cleanup | `067810ce08aa022ebbe385cc3e1065fcf689f33a015cda63dd6ddc74d39b4537` |
| Codex A.2 supervised outcome | `456be74f897b3a30cf8828db96ca8db639432f51765423dadf5a79724b5dbfc9` |
| Codex A.2 supervised persisted-trust result | `cb9fb5ad3973f7f7f305a29cf93c378d594a22547f05d2a3e9c3e47f08295b2d` |

## Product-tree equivalence proof

At recovery commit `e805fa53a8e175184ba833282d3f8cedbddf0eba`,
an exact Git blob comparison against
`637c6ecbc4cc201b2124cd58ea6359b92f518e9b` returned no difference for:

- the one product-documentation path;
- all 11 canonical code-intelligence paths;
- all 11 generated-runtime mirrors; and
- the hypothesis-specific product-test path, whose correct pre-D.2B state is
  absence.

That is 24 of 24 intended paths exactly equivalent. The only seven
differences from the pre-D.2B tree were:

- the two predeclared D.2B evidence paths;
- the raw D.2B report and rendered `eval/RESULTS.md`; and
- the two evaluation diagnostic modules plus their evaluation-only test.

An independent comparison from evidence commit `b704b580...` to the recovery
commit found no byte difference across those seven retained paths. No
non-evidence product path failed equivalence.

The canonical generator synchronized 109 artifacts without changing the
restored blobs. The 81 shipped JavaScript modules map one-to-one to 81
strictly checked canonical sources, with 23,186 lines on each side.

## Artifact restoration

Two independent package stages and two independent local packs produced
byte-identical archives:

| Measure | Restored D.2A product | Change from failed D.2B |
| --- | ---: | ---: |
| Packaged files | 128 | 0 |
| Packed bytes | 160,835 | -3,008 |
| Unpacked bytes | 690,239 | -10,649 |
| Strictly mapped shipped JavaScript modules | 81 | 0 |
| Strictly checked canonical lines | 23,186 | -407 |
| Generated runtime JavaScript lines | 23,186 | -407 |
| Test JavaScript files | 17 | -1 |
| Test JavaScript lines | 11,667 | -417 |
| Runtime dependencies | 0 | 0 |

Both archives have SHA-256:

`89923d2d6727445a86ba831331c4b6bdc031c399f81ce2d98e3f42815b3b3f6a`

That exactly matches the preserved D.2A artifact identity. The extra 22 test
lines relative to the original D.2A tree are the retained evaluation-only
scan-diagnostic test; they do not enter the artifact.

The exact tarball was installed in npm offline mode into a new empty temporary
directory whose path contained spaces. Complete installed-artifact
conformance was bound to the full recovery commit and passed **43/43** checks.
It confirmed:

- candidate version `0.4.0-rc.1`;
- zero runtime dependencies;
- unchanged public stable and compatibility capabilities;
- independent ESM runtime boundaries and canonical content hashes;
- only approved wrappers and modules;
- no lifecycle-hook, experimental, development, or Guard-spike surface; and
- hostile PATH, startup-file, and write-destination fixtures remained inert.

## Validation evidence

Pre-commit product recovery validation on macOS arm64 with Node.js 25.8.1:

- focused ranking, command, scanner, provenance, contamination,
  compatibility, adversarial, scope, and strict-type tests: **125 passed, 0
  failed, 2 skipped**;
- complete `npm run validate`: **239 passed, 0 failed, 2 skipped**;
- `npm run check:skill`: passed;
- `npm run typecheck`: passed;
- canonical generation and synchronization: passed;
- JavaScript syntax: 233 files passed;
- JSON parsing: 35 files passed;
- `git diff --check`: passed;
- exact product-path equivalence: 24/24 paths;
- deterministic packing: 2/2 archives byte-identical; and
- installed-artifact conformance: 43 passed, 0 failed, 0 skipped.

The two first package-stage commands used the noncanonical
`/private/var/...` spelling of the macOS temporary root and were rejected
before staging an artifact. Retrying against the canonical `/var/...`
boundary passed. The first two sandboxed `npm pack` attempts were blocked by
the managed sandbox before producing archives; the approved local-only
retries passed. These were environmental setup rejections, not product-test
or conformance failures, and no rejected attempt created an artifact.

No P0 or P1 was introduced by the recovery itself.

## Evidence classification

### Known

- The 24 product, generated-runtime, documentation, and hypothesis-test paths
  are byte-equivalent to the pre-D.2B product.
- The restored artifact is byte-identical to the D.2A artifact and passes all
  43 installed checks.
- D.2B failure evidence and the frozen evaluation inputs retain their exact
  hashes.
- D.2B failed, D.2A also remains below the frozen development gates, and
  slice 17 remains blocked.
- This recovery performed no development-corpus run and made no new product
  hypothesis.

### Likely

- The remaining important-file disagreement cannot be resolved responsibly
  by another visible-outcome-driven ranking edit.
- Some disagreements may reflect ambiguity among equivalently defensible
  files or insufficient label provenance rather than one uniform ranking
  defect.

### Unknown

- The disposition of each D.2A important-file disagreement under a
  status-masked evidence review.
- Whether the labels for ambiguous cases have sufficient direct provenance.
- Population-level or holdout behavior; neither was inspected.
- The contents and relevance of rejected links and unread budget-exhausted
  evidence.

### Stale/Suspicious

- The D.2B product commit is not a viable product candidate; its behavioral
  hypothesis is falsified even though its evidence remains authoritative
  history.
- Any claim that restoring D.2A behavior completes slice 16 is false. It only
  reconnects the product to the known-better, still-failing D.2A result.
- This session has seen outcome tables and is therefore unsuitable for the
  next status-masked adjudication.

### Suggested

- Begin only the separate fresh-context adjudication boundary below.
- Preserve the recovery and D.2B evidence commits permanently.
- Do not authorize D.2C, another corpus run, slice 17, or candidate freeze
  until the disagreement review has been examined.

## Next permissible forensic boundary

The next permissible stage is a **fresh-context, status-masked adjudication**
of the D.2A important-file disagreements. It is not conducted in this
session.

For each disputed path, that future review must judge whether it is:

- clearly defensible as important;
- clearly unsupported;
- ambiguous because multiple files are equivalently defensible;
- mislabeled or missing label provenance; or
- selected through a genuinely weak ranking signal.

The reviewer must not see TP, FP, or FN status while judging an item. The
review must record the direct sources and rationale for every disposition.
It remains correlated development review unless performed by the required
independent human reviewer.

## Remaining risks and stop condition

- **P0:** the frozen D.2A development gates still fail, so slice 17 and
  candidate freeze remain blocked.
- **P1:** 45 important-file false positives and 49 important-file false
  negatives remain unresolved; several category precision gates also remain
  below threshold.
- **P2:** nine scans remain incomplete. Their exact bounded diagnoses are
  preserved in D.2B evidence, and incomplete evidence must continue to block
  absence claims.
- **Residual:** direct repository declarations and documentation are
  untrusted data and may be stale, ambiguous, or misleading. Declared
  commands still require definition inspection and user approval before
  execution.
- **Contamination:** this session is outcome-exposed. It introduced no
  corpus-specific production behavior because the shipped product is exactly
  the pre-D.2B artifact, but it must not perform the future adjudication.

Run D.2B-R hard-stops at verified product restoration and this recovery
record.
