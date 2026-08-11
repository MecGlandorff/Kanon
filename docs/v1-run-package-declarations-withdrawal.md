# v1 package-declarations correction withdrawal

Archive note for v1.1.0: the 146,712-byte candidate-level evaluation record
is preserved at
`v1.0.0:eval/results/post-correction-evidence-sha256-b2259cef72b0bba7b37fbab37f1d0edcbd592235f92b5813da7f814855f74636/evaluation-record.json`
rather than duplicated in the maintained tree. Its exact SHA-256 binding and
the compact decision record below remain current-tree evidence.

Date: 2026-07-30
Branch: `release/v.1.0.0`
Status: forward withdrawal complete; no corpus, trace, publication, or release action authorized

## Decision

The package-declarations correction at
`7dd5e5346a67b2e4e83f53fcd152b1479b287adb` was evaluated correctly under
the frozen post-correction authority at
`2ee3091005b86db6eada2d2b15e0deeae96deb46`. The one authorized attempt
passed its integrity envelope, produced 30 valid case results and 30 valid
traces, had zero observer failures, and had exact trace-on/off public-result
equivalence.

The governed conclusion remains **correction-not-supported**. The correction
removed seven public false positives, but deterministic final-cap displacement
introduced seven replacement false positives. TP, FP, FN, precision, recall,
coverage, weighted error, category scores, and every frozen score field were
unchanged. The required `no new public false positives` gate failed. No true
positive was directly excluded and no false negative was added.

The correction therefore produced no aggregate public benefit and is withdrawn
from shipped behavior. Withdrawal does not erase, invalidate, or reinterpret
the correction, attempt, comparison, or diagnostic result.

## Identities and preserved evidence

| Item | Identity |
| --- | --- |
| Pre-correction production reference | `38c6f44bb2d73072c7e930e5974f14b068cafaae` |
| Correction commit | `7dd5e5346a67b2e4e83f53fcd152b1479b287adb` |
| Post-correction authority SHA-256 | `b4227670b7b831f1949598add2fa538c875cdb90ab55b1820a35ba81b5543087` |
| Attempt complete-tree SHA-256 | `253e42864db043281cc28ec3b60cb9e7fb0f678647c843194210f6356f144525` |
| Post-correction trace-set SHA-256 | `101e109d0b946fd962d49acbdd901b26e18212cff422065e4e5d365d9d726158` |
| Comparison SHA-256 | `05d466b8ac85b543bd89e08addab41ef2e072af37207a73a0be07766034a3a97` |
| Evaluation-record SHA-256 | `002b31db1a3c44e488466ff6655707f07c38a0f21487cd9dc0b5d5b4424c8b30` |
| Evidence complete-tree SHA-256 | `b2259cef72b0bba7b37fbab37f1d0edcbd592235f92b5813da7f814855f74636` |
| Forward rollback commit | `4854846155cd167f416b1aae0fc4648d3620878c` |

The existing offline validators revalidated the immutable attempt, comparison,
and evidence. The failed-attempt, recovery, and analysis protected-tree
commitments remain, respectively:

- `9a7cc9f07024b2c9c45d79ad0e6620f82fbb855bce17df9d8fe5e19d21f96201`
- `5031e1f70cb887b98999f26a72fa1239a6fccf6d50d73ddf42e15d0cbb5fa033`
- `9291f4078916c53d5d69c02bc000c95c022febcf5ff660a45d1bbf68e67e12be`

The correction contract and correction run record remain unchanged at
`04b63ff4dc82a719e49633037ef9f17901cd73ab091104d468ef8bfc4deade40`
and
`54e9bc745c2ebe0797acf4cb7f305763d69af86c323f3383b0418f90abdcb998`.
No authority, protocol, corpus, trace, result, comparison, or other file under
`eval/results` changed, and no corpus or trace runner executed during
withdrawal.

## Restored production state

Normal forward edits removed only the unsupported package-declarations
admission predicate, policy exclusion, and trace decision from:

- `src/code-intel/curate.js`
- `runtime/src/code-intel/curate.js`

Both files now have SHA-256
`3654b893ca83fa9bc698cde89111fcf9355c8125797b77c32505845474b15c6e`
and are byte-identical to their state at the pre-correction reference. The
shipped production and generated-runtime diff against that reference is empty.
Manifest-entrypoints behavior, ranking, scanning, policy, configuration,
schemas, labels, thresholds, result shape, version, dependencies, and public
capabilities were not changed.

Active correction-specific tests were narrowed to a regression proving
pre-correction package-declarations admission, while independent-salience,
manifest-entrypoints, and trace-equivalence controls remain active. Historical
test and correction records remain unchanged.

## Validation and artifact

- Focused curator, package-declarations, manifest-entrypoints, trace, and
  withdrawal regressions: 13 passed, 0 failed.
- Focused D.2E authority/evaluation suite: 25 passed, 0 failed.
- Requested evaluation, contamination, ranking, adversarial, scope,
  compatibility, artifact, and plugin matrix: 253 passed, 3 platform skips,
  0 failed (256 total).
- Complete `npm run validate`: 306 passed, 4 platform skips, 0 failed
  (310 total), including strict checked-JavaScript.
- Generated synchronization, all 258 tracked JavaScript syntax checks, all 173
  tracked JSON parses, and `git diff --check`: passed.
- Two isolated production builds and packs: byte-identical, 128 files,
  163,500 packed bytes.
- Restored artifact SHA-256:
  `0f87af4dfd851c268891c96237accf20b5089b0e0b95e10ac1417efebcca83a9`.
- Exact-tarball installation in an empty path containing spaces and installed
  artifact conformance: 43 of 43 checks passed.
- Package version: `0.4.0-rc.1`; runtime dependencies: zero; public-capability
  SHA-256:
  `bfc00d445cc480389559fd8c115a6ae2607dd6b7241dd0e256565bde5f0256cf`.
- Shipped runtime/API complexity matches the pre-correction baseline exactly.

## Limits, blockers, and next action

Strict historical equivalence remains
`failed-required-comparison-unavailable`. The evaluation does not establish
candidate-membership or scan-diagnostic equivalence with D.2A, independent,
blinded, or causal evidence, label validity, an official score change, or
release readiness. Release readiness and strict historical equivalence remain
P0 blockers; independent governance and label-validity evidence remain P1;
the comparison remains development-only diagnostic evidence at P2.

No release gate has been newly satisfied. Further visible-corpus tuning is not
authorized. Future development must use a prospectively governed development
set, independently governed labels, an unseen one-use holdout, frozen
thresholds, and frozen release decision rules.

The exact next permissible action is to create a separate, prospective
evidence-strict v1.0.0 protocol defining that development set, label
governance, unseen one-use holdout, thresholds, and release rules. Do not begin
that phase in this withdrawal session.
