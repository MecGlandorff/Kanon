# Run D.2E-A: development-only mechanism analysis

Status: complete; hard stop after D.2E-A.

## Boundary and authority

D.2E-A did not reopen or reinterpret D.2E or D.2E-R. Strict equivalence
remains `failed-required-comparison-unavailable` because frozen D.2A did not
retain candidate membership or scan diagnostics. Those two comparisons remain
`Unknown`.

Candidate-level outcomes were not read until the additive authority and its
focused tests were committed as
`78dcb8b6d1aea82732d39c3a5e1e9f33220222c1`. The authority is
`eval/d2e/ANALYSIS_AUTHORITY.json`, SHA-256
`678cbafc2a4bbc647eb9b73cc83bf96fd42a1eea1e4a5ce0c3b262c3d5862cc4`.
It is development-only, preserves the 17 frozen hypothesis classes and the
original acceptance rules, and authorizes only hypothesis generation from the
preserved recovered traces.

The authority binds the following required evidence:

| Evidence | SHA-256 or commit |
| --- | --- |
| Source commit | `5ce9799f6396520a7bb03d414bf0e81ff13a6700` |
| D.2E protocol | `d412ba3a4311640234b9291ac458da321a77db9da0df310cfd3186a56cad3f41` |
| Trace schema | `5a938a24c774cbf9deef7c764184270ae1925a8edbfeecf321c9d2b4844d8c72` |
| Analysis schema | `17c842e70f8ebe8b308115562f94e2ee64b0e86caf4a83236d1262e32509c3f9` |
| Failed-attempt binding | `0d92c7bdecff05976c929516664fb840066e265cf2b51e373065357bcadb8b46` |
| Failed-attempt manifest | `622c23b026b397027313b3492e8a1dcf78e632f5a86bceb839e611e45fad5eb2` |
| Failed-attempt tree | `9a7cc9f07024b2c9c45d79ad0e6620f82fbb855bce17df9d8fe5e19d21f96201` |
| Recovered-trace binding | `b26f85c47e98a686a79cce5359b50a559db483b70ecd23d15eda014621d411f1` |
| Recovered trace manifest | `19965b803e2b3acd5a0d0d0f290fd594a21584d377fc8f8645a0441b74b48fdd` |
| Recovered trace set | `91bfa76f1914c0404b1c69d95ff9672ce7b3b1ab141ea4e9b2032098f991ec8b` |
| Failed equivalence result | `681adc6b0622a032ff2599024c9c53f6268476b53c9a07f79c590b92831e9689` |
| D.2A report | `747b4f1590eda9787c87aae2e25853b8e1e8fa04893e2359eedf7a6050b7acb3` |
| Corpus | `4f768f151885d26de48fe0744cafc2402a27aca61f7f049aac166309891e0c92` |
| Attempt configuration | `8536570faaeff91d61a0d1b3e846fe7d12737de38b65729b1902e6ba7a04c7d2` |
| Paired configuration file / canonical | `aef23d32b16755442c54fc9ebe7b05fda22e129c498cc0d3e87c12886afcbf23` / `daf06d5f8b89a77add885caed3528964f372a678e2c9779a83faadd37485b128` |
| Policy | `1b625f6a16ff5eaa985d8d2d504fd615206b0b0147807d68f467e151a5604a6c` |
| Thresholds | `680fcdc9c899dfe1122941f4e59fb9ed917756eeeb17b40273425861a900e749` |
| Production artifact | `0f87af4dfd851c268891c96237accf20b5089b0e0b95e10ac1417efebcca83a9` |
| Public capabilities | `bfc00d445cc480389559fd8c115a6ae2607dd6b7241dd0e256565bde5f0256cf` |

## Mechanical admission

All authority conditions passed before analysis:

- failed-attempt and recovery commitments matched exactly;
- 30/30 traces passed schema, integrity, and completeness;
- observer failures were zero;
- the authority-bound synthetic trace-off/trace-on test was exact;
- every historically comparable public field had zero mismatches;
- the production artifact and public capabilities were unchanged;
- candidate-membership equivalence remained `Unknown`; and
- scan-diagnostic equivalence remained `Unknown`.

The admission record is SHA-256
`d2a33395d1bab32781b3bd6c24c1767b799866aba3670cc1b1d52d5525ecbd0b`.
No analyzer, scanner, ranker, curator, corpus, or collector was rerun.

## Coverage

The frozen analysis covered all 30 cases, all five categories, and all 33,484
candidates: 28,749 eligible and 4,735 ranking-ineligible. It included 101
selected true positives, 45 selected false positives, 49 unselected false
negatives, and 33,289 unselected controls. Nine scans were incomplete,
covering 17,187 candidates; missing evidence remained `Unknown`. There were
zero unmatched labels. The all-candidate coverage hash is
`d07e589752963259ab491040694d84a380faa04f1bedd637de07410fe523cb89`.

## Conclusion

The one conclusion is `supported-generic-hypothesis`. The preferred hypothesis
is `manifest-entrypoint-stage-conflation`.

The named production mechanism is in `src/code-intel/curate.js`: the
quota-bound `manifest-entrypoints` executable stage and the later
`package-declarations` stage both emit the final selection heuristic
`manifest-entrypoint`.

Across the complete mechanism there were 15 supports in eight cases and two
categories, eight controls in eight cases and two categories, and two
counterexamples. Support was 13 monorepo and two rust-cli candidates:
changesets 2, turborepo 1, SvelteKit 3, Vue core 3, TanStack Query 2,
react-spring 2, ripgrep 1, and bat 1. Controls were two monorepo and six
rust-cli executable entrypoints. Both counterexamples were rust-cli false
positives also selected by the correlated comparative reviewer.

The discriminating stage split was:

- `package-declarations`: 12 selected false positives, zero selected true
  positives, seven cases, and two categories; and
- `manifest-entrypoints`: three selected false positives and eight selected
  true-positive controls.

This is a generic stage-boundary association, not permission for blanket
suppression. It affects the two named selection stages and can affect the
downstream final cap through displacement; it does not implicate scanner or
ranker inputs. The frozen whole-mechanism bounds are 0–15 false positives
removed, 0–8 true positives displaced, and 0–8 added false negatives.
Precision is predicted non-decreasing only if a future focused change
discriminates package declarations from executable controls. Recall is
non-increasing under blanket suppression, and displacement risk is observed.

The smallest separately authorizable correction boundary is only the
`package-declarations` admission branch in `src/code-intel/curate.js`: a
package target would not enter solely from its declaration and would have to
satisfy an already-existing independent generic salience mechanism. The
`manifest-entrypoints` executable stage, scanner, ranker, labels, policy,
thresholds, weights, categories, corpus, and configuration remain outside
that boundary.

Before any future corpus run, a separately authorized correction would require
exact focused tests showing:

1. declaration-only package targets are rejected;
2. package targets with independent generic salience are retained;
3. executable-entrypoint controls are unchanged;
4. final-cap ordering and displacement are deterministic;
5. synthetic trace-off/trace-on output remains exact; and
6. no repository, path, label, category, or post-hoc special case is needed.

Any lost executable control, unexplained displacement, or special case
falsifies the proposed boundary.

`selection:root-manifest` also passed the frozen structural count gate but was
not preferred. It had three supports across three cases and two categories
(one go-service and two python-web), 24 controls across 23 cases and all five
categories, and one counterexample. Its affected stage is `root-manifest`;
blanket bounds are 0–3 false positives removed and 0–24 displaced true
positives or added false negatives, with observed displacement risk. Its
smallest possible boundary would be root-manifest admission alone, tested
with a generic root-contract fixture matrix, matched retained controls across
all five categories, deterministic cap displacement, and exact synthetic
trace-off/trace-on output. Any path, label, repository, or category-specific
discriminant would reject that boundary. The much larger control surface and
weaker discrimination make it the higher-risk alternative.

The governed conclusion is SHA-256
`b84a9706ebe948303c9e6bc67641fc0dcbef81c0a873098c1d65c2be2dfef81b`.
The underlying frozen mechanism analysis is SHA-256
`0e45bd4dd56cb0c437cfd3ecc8f79d034339f285609da5287678991ee4498bf2`.

## Claims and limitations

Known: the admission conditions, coverage, counts, associations, hashes, and
unchanged artifact are mechanically validated against the preserved evidence.

Likely: the `package-declarations` admission boundary is the narrowest useful
place for a future test-first correction, because it separates the strongest
support concentration from executable controls.

Unknown: candidate-membership equivalence, scan-diagnostic equivalence, missing
evidence from nine incomplete scans, label validity, counterfactual precision
and recall, and the behavior of any unimplemented correction.

Stale/Suspicious: none of the immutable evidence was rewritten. The observed
association is outcome-aware, correlated development evidence and is
suspicious if treated as causal, independent, blinded, or release evidence.

Suggested: only a new, explicit authorization for one bounded, test-first
correction cycle at the named `package-declarations` branch. This record does
not itself authorize implementation or a corpus run.

The result does not establish strict semantic, candidate-membership, or
scan-diagnostic equivalence; causal non-interference; release evidence; an
official score change; label validity; independent review; or permission to
modify product behavior.

## Validation and change size

- focused D.2E authority and analysis: 11/11 passed;
- grouped evaluation, contamination, ranking, adversarial, scope,
  compatibility, artifact, and plugin tests: 111 passed, zero failed, one
  platform skip out of 112;
- complete `npm run validate`: 292 passed, zero failed, four platform skips out
  of 296;
- strict checked-JavaScript and generated synchronization: passed;
- JavaScript syntax: 252 tracked files passed;
- JSON parsing: all tracked and new D.2E-A JSON passed;
- two allowlisted production builds and packs: byte-identical, 128 files each;
- exact-tarball installation in an empty path containing spaces: passed;
- installed-artifact conformance: 43/43 passed; and
- `git diff --check`: passed.

The authority commit added 498 and removed one non-evidence line across four
files. The complexity delta is one development-only admission validator, one
focused test file, one authority data file, and an export of the unchanged
frozen analysis function; runtime and shipped-artifact complexity deltas are
zero. D.2E-A adds no runtime dependency, production branch, shipped file,
public capability, score, or product behavior. Package version remains
`0.4.0-rc.1`; runtime dependencies remain zero. The artifact remains exactly
`0f87af4dfd851c268891c96237accf20b5089b0e0b95e10ac1417efebcca83a9`.

Remaining P0: strict equivalence is failed because two required historical
comparisons are unavailable. Remaining P1: label validity, independence,
causal effect, incomplete scans, and displacement safety remain unproved.
Remaining P2: the root-manifest structural signal remains a weak,
high-displacement alternative. No P0, P1, or P2 item is resolved by inference.

The exact next permissible action is to request separate authorization for
the bounded, test-first `package-declarations` correction cycle described
above. D.2E-A stops here.
