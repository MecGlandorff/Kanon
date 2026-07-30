# Kanon v1.0.0 prospective release-protocol freeze

Date: 2026-07-30

Status: frozen and inactive. This record defines future evidence rules only.
It assigns no person, selects or accesses no prospective repository, creates
no corpus or label, freezes no candidate, consumes no attempt, changes no
product behavior, creates no official score, and authorizes no release.

## Freeze identity

- Branch: `release/v.1.0.0`.
- Parent: `949158dca8d737a9892fe8a696e60e196d3649c8`.
- Parent was clean and zero commits behind its configured upstream without a
  fetch.
- Withdrawal commits `4854846155cd167f416b1aae0fc4648d3620878c`
  and `949158dca8d737a9892fe8a696e60e196d3649c8` were ancestors.
- Baseline artifact:
  `0f87af4dfd851c268891c96237accf20b5089b0e0b95e10ac1417efebcca83a9`.
- The protocol becomes immutable in the commit containing this record.

Frozen new files:

| File | SHA-256 |
| --- | --- |
| `eval/v1.0.0-prospective/PROTOCOL.md` | `9b4b21fcc8cebe23b3f78bbdc2d1321af3e845e1168c006c55b0abae3567de8b` |
| `eval/v1.0.0-prospective/PROTOCOL.json` | `254917b8a47a51f52d4af022dc7146a9f0755836242b1c491e6a0a583e0b8f73` |
| `eval/v1.0.0-prospective/protocol.schema.json` | `a0b58a9ffc512dcc62c32d45f5a54530025fe43326fb2a831f92997b2727b159` |
| `eval/v1.0.0-prospective/evidence.schema.json` | `020e0aee6254aa936fb3b91f723089a602ea41c23be35caef55e6c96bf04ab40` |
| `scripts/lib/v1-prospective-release.js` | `2dfd94ca7f5980fbb92c44db61f58ee5cacbe7d3f9f6eefc23315df6fae1b40c` |
| `test/v1-prospective-release.test.js` | `71f58de751b0fcc1f30016dd85548a72032b92a3ca627af62793567864bf42ca` |

The JSON protocol is recursively key-sorted canonical JSON with one LF. The
validator binds its exact parent, historical inputs, unchanged scoring policy,
sample calculation, roles, inventory, attempt boundary, and 29 decision
gates. The schemas and validator are evaluation-only and absent from the
package allowlist.

## Historical evidence retained

Historical strict equivalence remains
`failed-required-comparison-unavailable`. This freeze does not reconstruct
D.2A candidate membership or scan diagnostics and does not rewrite, relabel,
repair, weaken, supersede, or reinterpret D.2A–D.2E.

Retained commitments include:

- design:
  `24b175b64eda8faadffcf40cbea3144e6cc95dd4dfaac8cbbb31b648dc4abf24`;
- evaluation protocol:
  `8d6b59e879cd35093f265207d5fec9e6e567f0bd66765cd73c75e1e63b65c0a6`;
- paired protocol:
  `132aeaf85984d791aa6c2335e498cb80ebfe4f99c7924230e7b487585237573a`;
- corpus:
  `4f768f151885d26de48fe0744cafc2402a27aca61f7f049aac166309891e0c92`;
- scoring policy:
  `1b625f6a16ff5eaa985d8d2d504fd615206b0b0147807d68f467e151a5604a6c`;
- threshold projection:
  `680fcdc9c899dfe1122941f4e59fb9ed917756eeeb17b40273425861a900e749`;
- D.2A report:
  `747b4f1590eda9787c87aae2e25853b8e1e8fa04893e2359eedf7a6050b7acb3`;
- D.2E protocol:
  `d412ba3a4311640234b9291ac458da321a77db9da0df310cfd3186a56cad3f41`;
- trace schema:
  `5a938a24c774cbf9deef7c764184270ae1925a8edbfeecf321c9d2b4844d8c72`;
- analysis schema:
  `17c842e70f8ebe8b308115562f94e2ee64b0e86caf4a83236d1262e32509c3f9`;
- failed D.2E comparison:
  `681adc6b0622a032ff2599024c9c53f6268476b53c9a07f79c590b92831e9689`;
- recovered trace set:
  `91bfa76f1914c0404b1c69d95ff9672ce7b3b1ab141ea4e9b2032098f991ec8b`;
- D.2E failed-attempt tree:
  `9a7cc9f07024b2c9c45d79ad0e6620f82fbb855bce17df9d8fe5e19d21f96201`;
- D.2E recovery tree:
  `5031e1f70cb887b98999f26a72fa1239a6fccf6d50d73ddf42e15d0cbb5fa033`;
- D.2E analysis tree:
  `9291f4078916c53d5d69c02bc000c95c022febcf5ff660a45d1bbf68e67e12be`;
- post-correction authority:
  `b4227670b7b831f1949598add2fa538c875cdb90ab55b1820a35ba81b5543087`;
- post-correction attempt tree:
  `253e42864db043281cc28ec3b60cb9e7fb0f678647c843194210f6356f144525`;
- post-correction trace set:
  `101e109d0b946fd962d49acbdd901b26e18212cff422065e4e5d365d9d726158`;
- post-correction comparison:
  `05d466b8ac85b543bd89e08addab41ef2e072af37207a73a0be07766034a3a97`;
- post-correction evaluation:
  `002b31db1a3c44e488466ff6655707f07c38a0f21487cd9dc0b5d5b4424c8b30`;
- post-correction evidence tree:
  `b2259cef72b0bba7b37fbab37f1d0edcbd592235f92b5813da7f814855f74636`;
- withdrawal record:
  `4b2fd7699808cb8682095f29a1ac68a1dac5e3d81c1301bc2a18e58e8f1e8967`.

The parent Git tree identities remain
`e2fd97e9838247a17300ee314912792fb10c1582` for `eval/results`,
`c77023eb2b31e204256f4515acbfc16b59713a68` for `eval/d2e`,
`64109198e40160b83f54869d00d34acdf68efa3f` for `eval/d2c`, and
`6f1eb06851e28218679f8e4b849c27e7cd6e7eca` for `eval/d2d`.
Focused historical validators passed and the working diff contains no change
to those trees or their protocols, corpus, records, or results.

## Frozen prospective rules

The historical 30 cases and every exposed identity or derivative are
historical visible development evidence forever. Prospective development
evidence is reusable but becomes permanently holdout-ineligible on exposure.
The one-use unseen holdout remains concealed from the candidate owner through
candidate freeze and cannot be used for tuning.

Selection later uses a complete, attested metadata snapshot, two committed
human entropy contributions, deterministic stratified HMAC ordering, exact
category and diversity quotas, transitive fork/mirror/shared-history/template
and 80%-material-duplicate exclusion, and precommitted same-stratum reserves.
At most 20 cases total and four per category may be replaced before label
freeze; none may be replaced after prediction or outcome access.

Governance requires six distinct real humans: candidate owner, custodian, two
labelers, adjudicator, and release owner. The custodian alone may also execute
the evaluation. Missing identities, conflicts, blindness, custody, label,
candidate, authorization, unblinding, or decision attestations keep the
protocol inactive or the corresponding gate Unknown or failed. Agents cannot
stand in for human independence.

Labels require two blinded judgments per case, frozen rubric and raw history,
prediction-blind adjudication, important-file micro-Jaccard at least 0.80
overall and 0.70 per category, exact normalized run and test agreement at
least 0.90, and status agreement at least 0.90. Unknown or unavailable
evidence is not a negative label. A post-unblinding P0 label defect invalidates
rather than repairs the attempt.

The two-sided 95% Wilson precision target is at most 0.10 half-width. Required
denominators are 60 predicted positives, 89 labeled positives overall or per
dimension, and 93 labeled positives per category. Historical run-command
prediction coverage was 14/30; its Wilson lower bound is
0.30232388795369436. `ceil(60 / 0.30232388795369436)` is 199; upward balancing
across five categories freezes exactly 200 development cases and exactly 200
one-use holdout cases, 40 per category. Falling below any count or denominator
does not weaken the rule.

One holdout attempt is consumed only after a canonical exclusive receipt and
parent directory are durably synced, immediately before the first real case.
Success has exactly 205 files: five core records and 200 ordinal traces.
Observer failures, incomplete scans, invalid cases, retries, and replacements
after consumption are all zero. Failure bytes are immutable and no second
attempt exists.

The future mechanical conclusion is exactly `release-supported` when all 29
gates pass, `release-not-supported` when all are known and at least one fails,
and `inconclusive` when a required gate is Unknown or essential evidence
cannot validly complete. A human release owner must still explicitly decide
after `release-supported` and cannot override a failure or Unknown.

## Validation and deltas

- Focused prospective tests: 13 passed, 0 failed, 0 skipped.
- Focused prospective plus historical evaluation, contamination, D.2,
  withdrawal, artifact, scope, compatibility, and plugin tests: 154 total,
  152 passed, 0 failed, 2 platform-only skips.
- Complete `npm run validate`: 323 total, 319 passed, 0 failed, 4
  platform-only skips.
- Strict checked JavaScript, generated synchronization, all JavaScript syntax,
  all JSON parsing, and `git diff --check`: passed.
- Two independent package stages and packs: 128 entries, 163,500 packed
  bytes, 701,394 unpacked bytes, byte-identical.
- Both tarball SHA-256 values:
  `0f87af4dfd851c268891c96237accf20b5089b0e0b95e10ac1417efebcca83a9`.
- Exact-tarball installation under a path containing spaces: 43/43
  conformance checks passed.
- Version: `0.4.0-rc.1`; runtime dependencies: zero; public-capability
  commitment:
  `bfc00d445cc480389559fd8c115a6ae2607dd6b7241dd0e256565bde5f0256cf`.

Production and generated-runtime deltas are zero files and zero lines. Public
API and shipped complexity deltas are zero. The additive change contains a
288-line protocol, two purpose-specific schemas, one 938-line evaluation-only
validator with 22 narrowly scoped functions, and a 690-line focused test.
This is substantial evaluation-only text, justified by the exact 29-gate
decision, sample calculation, partition graph, seven-role separation,
ordering, one-use, and schema controls; it adds no general governance
framework, CLI, runtime dependency, or shipped byte.

## Evidence classification and blockers

Known:

- The protocol is canonical, purpose-specific, unshipped, and mechanically
  exercises the required partition, governance, ordering, sample, one-use,
  incomplete-input, immutability, and conclusion controls.
- Historical evidence and production behavior remain unchanged.
- The baseline artifact remains deterministic and installed-conformant on the
  observed macOS arm64 host.

Likely:

- A 200-case balanced design will achieve the planned run-command denominator
  if future prediction coverage is not below the conservative historical
  lower bound. The denominator remains a hard gate, so this is planning rather
  than an evidence claim.

Unknown:

- No human roles, eligible metadata population, prospective repository,
  independent labels, candidate, holdout outcome, official score, or release
  readiness exists.
- Future population coverage and quota feasibility are unobserved.
- Native Windows and Linux conformance were not run locally in this freeze.

Stale/Suspicious:

- Any interpretation of the visible 30 cases as independent validation or
  holdout evidence is stale and prohibited.
- Any claim that the withdrawn correction improved aggregate performance or
  that historical strict equivalence passed contradicts frozen evidence.

Suggested:

- Assign the required real humans, then separately authorize metadata-only
  corpus construction. Do not expose repository content or identities to the
  candidate owner.

Remaining P0 release blockers are absent real-human governance, independent
labels, a valid prospective development set, a frozen passing candidate, an
unseen one-use holdout result, and the seven existing visible performance-gate
failures. P1 work is the separately governed metadata snapshot, contamination
registry, label rubric, and future candidate-bound evaluator implementation.
P2 residuals are future native-platform evidence and population-representation
limitations. None is satisfied by this protocol freeze.

The exact next permissible action is limited to real human role assignment and
separately authorized metadata-only corpus construction under the frozen
selection rules. Neither begins here.
