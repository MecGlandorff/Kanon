# Kanon v1.0.0 prospective release-evidence protocol

Status: frozen but inactive. This protocol becomes immutable in the commit
that first contains it. It does not assign people, select or inspect a
prospective repository, authorize a product correction, freeze a candidate,
execute an evaluation, create an official score, or authorize release.

`PROTOCOL.json` is the canonical normative policy. This document explains that
policy. Future evidence must bind the exact protocol bytes and containing
commit. The `eval/v1.0.0-prospective/` namespace is separate from historical
D.2A–D.2E evidence.

## Historical boundary

Historical strict equivalence remains
`failed-required-comparison-unavailable`. Frozen D.2A did not retain candidate
membership or scan diagnostics; this protocol neither reconstructs those
fields nor repairs, relabels, supersedes, weakens, or reinterprets that
failure.

The existing 30 cases, every previously inspected repository and derivative,
all labels, candidates, traces, outcomes, corrections, comparisons, and
records are development-visible forever. Their retained metrics remain TP
137, FP 46, FN 68, precision 0.7486338797814208, recall
0.6682926829268293, and weighted error 298. The seven historical threshold
failures and nine incomplete scans remain historical facts. The withdrawn
package-declarations correction remains valid diagnostic evidence and
demonstrated no aggregate benefit.

Future release evidence begins prospectively at this protocol's containing
commit. No existing visible repository can become holdout evidence. There is
no official v1.0.0 score unless this prospective protocol is completed.

## Evidence partitions and contamination

Three disjoint partitions exist:

1. Historical visible development evidence includes the existing 30-case
   corpus and every repository, fork, mirror, shared-history project, template
   derivative, material duplicate, or other derivative previously exposed.
   It may support diagnostics, test design, and hypothesis generation only.
2. Prospective development evidence is selected later under this protocol.
   Developers may inspect and reuse it for bounded correction cycles. Exposure
   of identity or content permanently contaminates the repository and all
   related projects for holdout purposes.
3. The one-use unseen holdout is selected only after this protocol is
   committed. Its identities and contents remain concealed from the candidate
   owner and coding agents until candidate freeze. It cannot support
   debugging, mechanism discovery, threshold selection, prompt design, or
   correction iteration.

Every identity is recorded in a contamination registry using canonical host
and provider identity, full revision, and concealed SHA-256 identifiers for
holdout entries. Fork, mirror, shared reachable commit, template lineage,
equal revision tree, or material duplication is a same-project relation.
Material duplication means at least 20 eligible files and at least 80% of the
smaller project's normalized non-generated, non-vendored file bytes are
identical. Relations and contamination inherit transitively. Any component
touching visible development evidence is ineligible for holdout.

Premature holdout disclosure permanently disqualifies the affected case.
Unavailable or disqualified cases may be replaced only before the final
manifest and label freeze, using the next precommitted reserve in the same
stratum. Every removed identity enters the registry. At most 20 total and four
per category may be replaced. There is no replacement after predictions,
outcomes, or attempt consumption.

## Real human governance

The protocol is inactive until canonically attested assignments name real
humans. Coding agents cannot simulate independence.

Required roles are one candidate owner, one holdout custodian, two independent
labelers, one disagreement adjudicator, one evaluation executor, and one
release decision owner. Six distinct humans are the minimum: only the
custodian may also be the executor. All other combinations are forbidden.
Conflicts must be disclosed; an unresolved relevant conflict leaves the
protocol inactive.

The custodian is distinct from the candidate owner. The candidate owner sees
no holdout identity or content before candidate freeze. Labelers see no
candidate prediction, trace, hypothesis, or expected outcome before labels
are frozen. Raw judgments and adjudication finish before prediction
unblinding. The release owner applies the frozen rules mechanically and may
decline a mechanically supported release, but cannot override a failed or
unknown gate.

Canonical attestations bind role identity and conflicts, blindness, corpus
custody, raw-label freeze, completed adjudication, final label freeze,
candidate freeze, attempt authorization, durable attempt consumption,
prediction unblinding, and the final human decision. They use recursively
sorted JSON, UTF-8 without BOM, one trailing LF, and SHA-256 over exact bytes.
Canonical records make ordering and commitments auditable; they do not by
themselves prove that a named person is real, so the release owner must
authenticate the human assignments.

## Prospective corpus selection

No repository is selected by this protocol. A separately authorized custodian
must first commit a complete, coverage-attested metadata snapshot of public
GitHub repositories. Metadata-only work is limited to provider identity,
owner/name, dates, status, license identifier, primary language, size, topics,
and fork/template ancestry identifiers. It excludes repository archives,
clones, trees, paths, file or README content, commit messages, diffs, issues,
pull requests, workflows, and release assets.

Eligibility is frozen in `PROTOCOL.json`: public, active, non-disabled
non-fork repositories from 1 MiB through 1 GiB; an allowlisted local-use license;
creation no later than 2024-07-30; and a full revision at or after 2025-01-30
but no later than the 2026-07-30 cutoff. The chosen revision is the latest
full commit at or before that cutoff.

The five categories retain their existing meanings and each receives exactly
40 cases. Category admission uses the frozen primary-language and topic rules.
A provisionally selected monorepo must later be verified by the custodian to
contain at least three declared packages or workspaces across at least two
top-level components. A repository matching multiple categories is
ineligible. Each category requires at least eight small, eight medium, and
eight large repositories, with no size bin above 24. Overall primary-language
share is capped at 45%. The monorepo category needs at least four primary
ecosystems, at least five of each, and at most ten of any one.

The custodian and release owner independently commit 32 random bytes before
population access. After the eligible-population commitment, they reveal the
entropy. Domain-separated SHA-256 combines both seeds, population commitment,
and protocol commitment. Ascending HMAC-SHA-256 ranks concealed identities
within category, size, and language strata. The curator cannot reorder or
hand-pick results.

Population coverage failure, an unfillable quota, incomplete contamination
registry, excessive replacements, or premature disclosure aborts construction.
Repository-content screening remains custodial and blinded. It does not expose
identities to the candidate owner.

## Independent labels

A written rubric and its hash are frozen before labeling. Each case receives
at least two independent judgments. Important-file labels contain exactly
five revision-bound, existing, evidence-supported paths ordered by public
operational importance. Vendored files are excluded. Generated files are
excluded unless the repository itself declares them as the human-operated
source of truth.

Run and test labels enumerate all evidence-supported normalized command and
working-directory equivalents. Abstention is a positive judgment that no
supported command exists, not a substitute for missing work. Platform-specific
labels require an explicit platform and direct evidence on a supported
evaluation platform. Ambiguity is resolved by recording all supported
equivalents before prediction access or by classifying the case unlabelable.
Unknown or unavailable evidence is never a negative label; before label freeze
it makes the case eligible only for deterministic replacement.
An incomplete product scan is an evaluation failure. It never changes a
label, removes a case, or reduces a metric denominator.

Agreement is measured on immutable raw judgments before adjudication:
important-file micro-Jaccard must be at least 0.80 overall and 0.70 in every
category; exact normalized run-command and test-command agreement must each be
at least 0.90; and exact agreement on abstention, ambiguity, Unknown, and
unavailable status must be at least 0.90. Failure leaves the label set
ineligible. The adjudicator cannot see product predictions. Raw labels,
agreement calculations, disagreements, and adjudication history are retained
byte-for-byte.

The final label-set commitment precedes candidate execution. After unblinding,
a P0 error such as a wrong revision, broken source binding, blindness breach,
or outcome-changing rubric violation invalidates the attempt. It cannot be
repaired by editing a label, dropping a case, or substituting another case.

## Sample size

The design uses a two-sided 95% Wilson interval and requires half-width at
most 0.10 for every passing precision or recall estimate. It makes no
non-inferiority substitution for the absolute frozen performance thresholds;
exactness, compatibility, and safety margins are zero.

At the 0.80 precision gate, 60 predicted positives are required. Overall and
dimension recall require at least 89 labeled positives. Because the category
recall gate is 0.40 and the passing range includes the maximum-variance value
0.50, each category requires at least 93 labeled positives.

Historical aggregate planning data contain run-command predictions in 14 of
30 cases. Their 95% Wilson lower bound is 0.30232388795369436. Dividing the
required 60 predicted positives by that conservative rate gives 199 cases.
Rounding upward to preserve five equal categories gives exactly 200 cases,
40 per category. Both the prospective development target and holdout target
and minimum are 200. Candidate freeze and holdout authorization are forbidden
below those counts or any frozen denominator minimum.

This is a precision design, not a power claim. If the future eligible
population cannot support it, sample size is a blocker; thresholds and
denominators are not reduced.

## Development and candidate freeze

Corrections may use only historical and prospective development evidence.
Each correction needs a generic hypothesis and bounded implementation
authority declared before implementation. Repository-, path-, label-,
category-, and case-specific product rules are forbidden. Development
evaluation must account for downstream displacement and final-cap effects,
not merely direct inclusion or exclusion.

A candidate can freeze only after the complete prospective development target,
unchanged performance thresholds, displacement accounting, safety,
compatibility, artifact, and P0/P1 gates pass while holdout blindness remains
intact.

Candidate freeze binds source commit, exact artifact, version, lockfile and
dependency count, public capabilities, corpus configuration, scoring policy,
threshold projection, generated tree, complete test tree, and validation
record. It also binds the exact evaluation runner, finalizer, serializer,
trace schema, report schema, and release-evidence schema. No product, product
test, generated file, configuration, threshold, label, dependency, policy, or
capability change is permitted afterward. A failed holdout cannot be followed
by a correction and reuse of that holdout.

## One-use holdout execution

Exactly one canonical runner invocation evaluates exactly 200 frozen cases in
manifest order against one frozen candidate. Trace-on then trace-off controls
run inside that one invocation. Public results must be exactly equal under
only predeclared provenance exclusions.

The attempt is consumed after `attempt-consumption.json` is exclusively
created, canonically serialized, file-synced, and its parent directory synced,
and immediately before any analyzer, scanner, ranker, curator, selector, trace
collector, or corpus runner processes the first real case. Synthetic fixtures
and metadata-only checks do not consume it.

Inputs are canonical, read-only, identity-bound regular files. Links, reparse
points, special files, escapes, duplicates, and mismatches are rejected.
Git metadata is removed, Git inspection is disabled, and repository code,
commands, hooks, and filters never execute. Evaluation makes no network or
live-model call and does not fetch or mutate repositories.

Outputs begin in one absent evaluator-owned temporary directory, use exclusive
no-follow creation and ordinal names, and finish additively in a
content-addressed evidence directory. Success has exactly five core JSON files
and `traces/001.json` through `traces/200.json`: 205 files. Canonical
serialization, schemas, hashes, inventory, bindings, containment, regular-file
type, one-link count, and byte bounds are mandatory.

The per-case timeout is 35 seconds with 512 MiB old-space, the scan limits
remain those frozen in the canonical policy, the attempt wall limit is five
hours, each trace is at most 128 MiB, and all traces are at most 8 GiB. The
exact remaining bounds are normative in `PROTOCOL.json`.

There are zero permitted observer failures, incomplete scans, invalid or
missing case results, retries, restarts, or replacements. A failure preserves
every output byte, adds a failure manifest when the offline finalizer can do
so, and cannot trigger another attempt.

Artifact reconstruction must be deterministic. The exact tarball is installed
into a clean path containing spaces and must pass installed conformance before
and after evidence binding.

## Mechanical decision

Future evidence produces exactly one conclusion:

- `release-supported` means all 29 named gates in `PROTOCOL.json` pass,
  including integrity, containment, inventory, bindings, schemas,
  contamination, real-human governance, blindness, labels, candidate freeze, sample and category
  coverage and abstention accounting, agreement, zero observer failures, zero
  incomplete scans,
  trace equivalence, every unchanged aggregate and per-category precision,
  recall, coverage, weighted-error, compatibility and safety threshold,
  confidence precision, no mutation or rule change, deterministic artifact,
  and installed conformance.
- `release-not-supported` means all required gates are known and at least one
  fails.
- `inconclusive` means one or more required gates is Unknown or essential
  evidence cannot be validly completed.

Thresholds cannot change after results. Inconclusive cannot be converted to
passing. Adverse cases cannot be excluded after unblinding. Historical
development evidence is not holdout evidence. Aggregate equality cannot
replace per-case evidence. Independence requires actual humans. A
model-generated recommendation cannot authorize release.

Even `release-supported` is not a release action. A real release decision owner
must explicitly approve a release afterward. That human may decline but may
not override a failed or Unknown gate.

## Activation boundary

This freeze creates rules only. Its next permissible action is limited to real
human role assignment and a separately authorized metadata-only corpus
construction under the frozen rules. Neither action occurs in this phase.
