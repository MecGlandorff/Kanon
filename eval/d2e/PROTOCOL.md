# D.2E observational ranking-trace protocol

Date frozen: 2026-07-30

Status: outcome-aware development investigation. This protocol authorizes one
offline trace of the frozen D.2A development corpus. It does not authorize a
behavioral correction, label work, a second corpus experiment, slice 17, a
candidate freeze, a version change, a holdout, or a release.

## Frozen commitments

- Branch before protocol work: `release/v.1.0.0`.
- Protocol parent: `0050f6c6afd5dc767cab4bcadde5207f1cb5653e`.
- Restored behavior: D.2A product behavior, restored by
  `e805fa53a8e175184ba833282d3f8cedbddf0eba`.
- Package version: `0.4.0-rc.1`.
- Restored production artifact:
  `89923d2d6727445a86ba831331c4b6bdc031c399f81ce2d98e3f42815b3b3f6a`.
- Frozen corpus: `eval/corpus.json`, SHA-256
  `4f768f151885d26de48fe0744cafc2402a27aca61f7f049aac166309891e0c92`,
  role `development`, schema 2, 30 cases in committed order.
- Ordered repository/revision binding:
  `f92a3940d2dfdafbae10118b19f4aaf0a2a3aa7107542b19fe1e12ead20b5ff8`.
- Frozen D.2A report:
  `eval/results/development-0.4.0-rc.1-d2a-74208b9a.json`, SHA-256
  `747b4f1590eda9787c87aae2e25853b8e1e8fa04893e2359eedf7a6050b7acb3`.
- Scoring policy SHA-256:
  `1b625f6a16ff5eaa985d8d2d504fd615206b0b0147807d68f467e151a5604a6c`.
- Evaluation policy, labels, rationales, accepted commands, categories,
  costs, thresholds, important-file cap, and scan budgets are the exact
  values in that corpus; none may change.
- Governing design: `V_1design.md`, SHA-256
  `24b175b64eda8faadffcf40cbea3144e6cc95dd4dfaac8cbbb31b648dc4abf24`.
- Evaluation protocol: `eval/PROTOCOL.md`, SHA-256
  `8d6b59e879cd35093f265207d5fec9e6e567f0bd66765cd73c75e1e63b65c0a6`.
- D.2D result:
  `eval/results/d2d-ranking-1f2ba552/ranking-result.json`, SHA-256
  `1f2ba552106a4c13eace2088e1277cc0b4bbf066dca0113e10b243db46b902c7`.
- D.2C comparative analysis:
  `eval/results/d2c-comparative-unblind-f8b1e7a6/unblinded-analysis.json`,
  SHA-256
  `de311bbef99ed43eca4ef71aa6eafc2f41317ad1ce13b5d09dedc52593e9fbac`.

The trace candidate is the clean, separately committed instrumentation
descendant of this protocol commit. The one attempt manifest must bind its
full source commit, the newly packed artifact and conformance report, this
protocol and schema, the corpus, D.2A report, exact invocation, and result
hashes before analysis. Shipped source changes are limited to a private,
disabled-by-default observer and its generated mirrors. Evaluation-only
collection and validation code is excluded from the package allowlist.

## Exact collection configuration

- Analyzer: exact installed local tarball built from the trace candidate.
- Corpus selection: all 30 cases, committed order; no `--repo`.
- Checkout: existing immutable schema-v2 cache, exact revisions, `--no-fetch`,
  Git metadata absent, `inspectGit: false`.
- Analysis child: Node.js with 512 MiB old-space maximum, timezone `UTC`,
  locale `C`, no inherited arbitrary environment, 4 MiB prediction channel.
- Per-case analysis timeout: 35,000 ms.
- Scan: `maxFiles=25000`, `maxEntries=100000`,
  `maxFileBytes=1000000`, `maxTotalHashBytes=134217728`,
  `maxTotalTextBytes=33554432`, `maxElapsedMs=30000`,
  `useGitIgnore=false`.
- Important-file cap: 5. Command, scoring, category, and threshold
  configuration remain exactly frozen in `eval/corpus.json`.
- Attempt root: one previously absent evaluator-owned directory under the
  canonical operating-system temporary root. It contains one attempt
  binding, one raw report, 30 bounded case traces when complete, and one
  trace manifest. No trace file is written into a corpus snapshot.

No network, model, transcript, host-state, repository executable, package
command, hook, filter, build, or test from a corpus repository may run.

## Trace boundary and schema

`eval/d2e/trace.schema.json` is the normative strict shape. The observer
records decisions already made in the canonical `rankImportantFiles` and
`curateRankedFiles` path. It cannot provide a value back to either function.
Observer absence, presence, return, or failure must not change any returned
analysis value.

Every scanner-supplied file considered by ranking has one deterministic
identity:

```text
SHA-256("kanon-d2e-candidate-v1\0" + case id + "\0" + revision + "\0" + normalized path)
```

Each record contains only bounded generated fields:

- scanner discovery source, normalized path, and identity;
- evidence state (`present`, `absent`, `rejected`, `truncated`, or
  `unavailable`) without file contents;
- ranking eligibility and rejection reason;
- normalized signal type, confidence, source class, bounded reason, and
  numeric contribution;
- named base, signal, fan-in, reference, path, test, workflow, and depth score
  contributions, including zero only when material to a decision;
- total score, fan-in, reference count, initial position, ranked position,
  and the exact ordering/tie-break inputs;
- entry, decision, and exit data for every curation stage;
- deduplication, quota, five-item cap, truncation, displacement, and
  nonselection decisions (with `not-applicable` where the mechanism has no
  such operation);
- final rank and selection result; and
- scan incompleteness, rejected-link/path summaries, budget flags, and
  explicitly unavailable evidence.

The trace must not contain file contents, excerpts, secrets, credentials,
authentication data, arbitrary environment values, absolute corpus paths,
repository URLs, label rationales, or unbounded repository text. Candidate
paths and generated reasons are sanitized and limited to 1,000 UTF-8 bytes;
all arrays and objects have schema bounds.

## Semantic-equivalence gate

Before collection, synthetic and adversarial fixtures must prove exact
deep equality among trace-off, trace-on, and throwing-observer analysis
results. They must cover hostile strings, duplicate/tied candidates,
truncation, displacement/not-applicable handling, incomplete scans, rejected
links, deterministic ordering, and serialization bounds.

For the corpus attempt, the traced report is mechanically compared with
frozen D.2A. The following must be exact:

- important-file membership and order;
- run- and test-command prediction membership and order;
- abstentions and prediction coverage;
- scan completeness;
- analysis errors;
- category assignment;
- per-case labels, dimensions, totals, and final score-relevant fields; and
- aggregate policy, dimensions, categories, coverage, abstentions, errors,
  totals, failures, and final gate result.

Only `generated_at`, analysis duration, cache/install paths, current source
commit/worktree observation, artifact identity/conformance provenance, and
machine provenance may differ. Analyzer version must remain
`0.4.0-rc.1`.

D.2A retained no internal per-candidate membership. Historical internal
membership therefore cannot be falsely claimed as a byte comparison. The
trace-completeness gate instead requires, in the same canonical invocation,
exact equality among scanner-to-ranking membership, ranking result membership,
trace candidate membership, and the final public selections. The frozen
snapshots, scan configuration, and candidate-eligibility logic must otherwise
remain unchanged from restored D.2A. Any public mismatch, internal in-run
membership mismatch, observer error, or unexplained source change is P0:
preserve the attempt and stop before hypothesis analysis.

## Trace-completeness gate

All of these are conjunctive:

1. Exactly 30 committed cases and revisions appear once in corpus order.
2. Every scanner-supplied ranking input has exactly one discovery record.
3. Every ranking-eligible candidate has exactly one score, ranked position,
   and final-decision record; no ineligible candidate has a score.
4. Every declared curation stage has one ordered entry and exit.
5. Every stage candidate has a recorded selection, duplicate, policy,
   quota, cap, or nonselection decision.
6. Every selected public important file maps to one selected trace candidate,
   in identical order, and no other candidate is selected.
7. Score totals equal the sum of named contributions.
8. Candidate and stage identities are unique and deterministic.
9. Case scan completeness, budgets, truncation, rejected paths, and Unknown
   evidence agree with the public analysis diagnostics.
10. No observer failure, trace overflow, serialization failure, missing case,
    extra case, malformed record, prohibited field, or unbound byte occurs.

## Analysis rules

Analysis begins only after semantic equivalence and trace completeness pass.
It covers every traced candidate, not only disagreements. Frozen labels supply
official TP/FP/FN joins; consensus, false-positive, false-negative, and
unselected candidates are mandatory controls. D.2C comparative status may be
reported only as correlated reviewer evidence, never ground truth. Incomplete
or unavailable evidence stays Unknown and cannot support an absence claim.

The predeclared mechanism families are root contract, workspace contract,
manifest declaration, framework declaration, executable syntax, ecosystem
test anchor, import fan-in, literal local reference, base path score, low-value
path penalty, workflow penalty, test-path penalty, depth penalty,
deduplication, stage ordering, quota, and final cap. Analysis may combine
these generic mechanisms, but it may not introduce a repository, path,
framework, label, or case-specific rule after observing results.

For each considered hypothesis, record:

- one concrete production mechanism and smallest separately executable
  correction boundary;
- supporting candidates and distinct cases/categories;
- consensus and unselected controls;
- all observed counterexamples;
- scan-completeness distribution;
- maximum directly affected cases and selections on this corpus;
- predicted precision direction and bounded affected-FP range;
- predicted recall direction and bounded affected-TP/FN range;
- displacement risk, including which currently selected evidence classes
  could move; and
- falsification criteria and Unknowns.

No official score is recalculated and no behavioral counterfactual is run.

## Hypothesis decision

A `supported-generic-hypothesis` requires all of:

- one named production mechanism visible directly in the trace;
- support in at least 3 distinct cases and at least 2 categories;
- at least 3 distinct consensus or unselected control cases across at least
  2 categories;
- at least 1 recorded counterexample that bounds the rule;
- no repository name, memorized path, case literal, label exception, or
  ecosystem-only special case in the proposed correction;
- explicit bounded precision, recall, and displacement predictions;
- a small explainable correction affecting one existing decision boundary;
  and
- consistency with incomplete-evidence and trust rules.

If multiple hypotheses qualify, prefer fewer affected cases, fewer displaced
true positives, more category coverage, and the smaller code boundary, in that
order. If none qualifies, the only permitted conclusion is
`no-supported-generic-hypothesis`, with an honest prerelease or independent
governance wait as the next action.

## Resource ceilings and contamination restrictions

- Cases: exactly 30; candidates: at most 25,000 per case and 750,000 total.
- Curation stages: at most 32 per case; stage visits: at most 200,000 per
  case.
- Trace JSON: at most 128 MiB per case and 1 GiB total.
- Attempt manifest/report/analysis: 8 MiB each.
- Candidate/reason/path string: at most 1,000 UTF-8 bytes.
- Signals/contributions/visits per candidate: 64/64/64.
- Path failures per case: 50; budget flags per case: 16.
- Collection uses the frozen 35-second per-case analysis timeout and the
  existing 512 MiB child memory ceiling; no budget may be raised after a
  failure.

Corpus names, paths, labels, reviewer choices, and outcomes may occur only in
evaluation evidence. They may not enter shipped scoring, weights, fixtures,
heuristic registration, or public documentation. Repository and corpus
content remains untrusted data. The analysis is outcome-aware and makes no
blinding, independence, or human-evidence claim.

## One-run policy and hard stop

Focused tests, synthetic trace-on/off checks, typechecking, generated-sync
checks, packing, and installed conformance do not consume the corpus attempt.
The attempt begins when the first analyzer child is launched for the committed
30-case corpus. There is exactly one attempt and zero silent retries.

Every attempt artifact is retained. A failure before any prediction may be
diagnosed, but a rerun requires a new explicit recorded justification and is
not authorized by this protocol. A failure after any prediction, a public
semantic mismatch, or incomplete trace ends D.2E without analysis.

After the one analysis conclusion, preserve the attempt, trace, comparison,
analysis, and one D.2E record; run the authorized validation; then hard-stop.
No behavioral correction may be implemented in this outcome-exposed session.
