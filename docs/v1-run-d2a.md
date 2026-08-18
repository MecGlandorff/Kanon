# Kanon v1 Run D.2A deterministic slice-16 record

Date: 2026-07-28

Archive status for v1.1: result paths in this frozen record describe the
`v1.0.0` tree. Large raw payloads now live only at that immutable tag; see
[`eval/results/README.md`](../eval/results/README.md) for the retained-fixture
boundary and retrieval instructions.

Scope: deterministic development-corpus evaluation and a synthetic
paired-ablation rehearsal only. This run made zero evaluated Codex, Claude,
or other model calls. It does not authorize the live 180-run experiment,
slice 17, candidate freeze, holdout work, release, or publication.
`V_1design.md`, `eval/PAIRED_ABLATION.md`, development labels, historical
Guard evidence, production heuristics, and the package version remain frozen.

## Candidate and immutable inputs

The candidate is clean source commit
`74208b9a21652f2e99d41000881f66e73d7eceeb` on
`release/v.1.0.0`, package version `0.4.0-rc.1`. The branch began this run
0 commits behind and 7 commits ahead of its configured upstream.

| Input | SHA-256 |
| --- | --- |
| Exact packed artifact | `89923d2d6727445a86ba831331c4b6bdc031c399f81ce2d98e3f42815b3b3f6a` |
| Development corpus manifest | `4f768f151885d26de48fe0744cafc2402a27aca61f7f049aac166309891e0c92` |
| Ordered repository/revision binding | `f92a3940d2dfdafbae10118b19f4aaf0a2a3aa7107542b19fe1e12ead20b5ff8` |
| Exact fixed prompt | `191c8ae67446fb84857a4c80e2f9fbca2bbaaa826d16799982866f475edcdb82` |
| Frozen paired-ablation document bytes | `132aeaf85984d791aa6c2335e498cb80ebfe4f99c7924230e7b487585237573a` |
| Scoring policy | `1b625f6a16ff5eaa985d8d2d504fd615206b0b0147807d68f467e151a5604a6c` |
| Randomization-seed commitment | `d94fc9b9c321dfaaea24c379cd43f8aef70e7ccde04642c55a9ee10a5e0d36b2` |
| Strict answer-schema file | `0e0270bf4a2457f7dafc89acaa5db745287cef8200dcf84df4dbc45ad9167183` |
| Paired configuration file | `aef23d32b16755442c54fc9ebe7b05fda22e129c498cc0d3e87c12886afcbf23` |
| Canonical paired configuration | `daf06d5f8b89a77add885caed3528964f372a678e2c9779a83faadd37485b128` |
| Passing installed-conformance report | `dd4f8d73d0741e0775646df14d99d9eb17ae819afed6ec176164eecda8a0cb10` |
| Canonical randomized schedule | `d3cc2dd2731da0efd6073186d472b3f2746812bed2bae5081742d937358cf7d9` |

The raw configuration file is
`eval/paired-ablation.config.json`. Its exact file hash and canonical payload
hash are recorded by the final rehearsal report. The raw randomization seed
is never included in the blinded scoring envelope.

## Exact artifact proof

The package was rebuilt once, independently packed twice, and both tarballs
were byte-identical:

- 128 packaged files;
- 160,835 packed bytes;
- 690,239 unpacked bytes;
- SHA-256
  `89923d2d6727445a86ba831331c4b6bdc031c399f81ce2d98e3f42815b3b3f6a`.

That exact tarball was installed into an empty directory. Installed-artifact
conformance passed all 43 checks on macOS arm64 with Node.js 25.8.1. The
paired harness now requires the supplied installed root to equal the
canonical root named by that passing conformance report; a substituted root
or artifact hash fails before the fake session layout is created.

## Deterministic development corpus

The run used only the existing immutable cache at the recorded revisions,
with no fetch and no network access. All 30 required cache entries were
present, and no inspected cache entry contained Git metadata. Corpus
repositories were treated as data: no repository code, script, hook, filter,
package command, build, or test was executed. Product Git inspection was not
a scored input.

Raw report:
`eval/results/development-0.4.0-rc.1-d2a-74208b9a.json`.

Raw report SHA-256:
`747b4f1590eda9787c87aae2e25853b8e1e8fa04893e2359eedf7a6050b7acb3`.

The exact installed artifact analyzed 30/30 repositories with 0 analysis
errors and 9 incomplete scans. The frozen in-sample development thresholds
failed:

| Measure | Result | Frozen gate |
| --- | ---: | ---: |
| Overall precision | 74.9% | at least 80.0% |
| Overall recall | 66.8% | at least 60.0% |
| Weighted error per case | 9.93 | at most 4.00 |
| Important-file precision | 69.2% | at least 80.0% |
| Run-command recall | 50.0% | at least 60.0% |
| Python-ML precision | 61.3% | at least 80.0% |
| Go-service precision | 70.3% | at least 80.0% |
| Monorepo precision | 66.7% | at least 80.0% |

The result contains 137 true positives, 46 false positives, and 68 false
negatives. `eval/RESULTS.md` is generated from the raw JSON. No label,
threshold, policy, or production heuristic was changed in response.

The report honestly records `worktree clean: false` because evaluation-only
harness work was present when the artifact-bound run was recorded. The
candidate identity and analyzer are independently bound to the exact clean
starting commit, tarball hash, passing conformance report, and canonical
installed root.

During this run, review found that the corpus CLI still selected the removed
pre-simplification artifact path
`skills/kanon/runtime/src/analyze.js`. It now selects the shipped
`runtime/src/analyze.js`, validates the complete artifact option set, binds
the exact installed root and candidate identity, requires passing
conformance, and launches the isolated analyzer worker with an explicit
non-secret environment. Regression tests cover the shipped path,
substituted-root rejection, and secret-sentinel non-inheritance.

## Paired-ablation harness

The evaluation-only harness consists of:

- `eval/paired-ablation.config.json`;
- `eval/paired-answer.schema.json`;
- `scripts/lib/paired-ablation.js`;
- `scripts/paired-ablation.js`;
- `test/paired-ablation.test.js`.

It contains no live model or host-process driver. The deterministic path
validates hostile inputs at runtime, binds all frozen inputs, produces the
schedule and synthetic records, scores while arm-blind, applies the arm map
only afterward, computes paired statistics, and writes reports exclusively.

The schedule contains exactly 180 opaque run IDs:

```text
30 repositories × 2 arms × 3 repetitions = 180
```

Repository order and within-pair arm order are deterministically randomized
from the precommitted seed. The scoring envelope contains only the seed
commitment and no arm map or raw seed. Schedule, records, and blinded scores
contain no arm field. The arm map is applied only after complete blinded
scoring.

Each synthetic run has a fresh runner-owned session, checkout, and transcript
directory. The inspected checkout has no `.git` or `.kanon` path. Labels and
prior outputs are outside it. The plain arm exposes no Kanon path within its
declared roots. The treatment arm exposes the exact conformed installed root
and tarball. All 180 temporary sessions are removed after verification.
These are deterministic filesystem-layout proofs, not live sandbox or host
capability evidence.

The synthetic records deliberately include valid predictions, abstentions,
malformed JSON, a timeout, an analysis error, a structural extra field, an
incomplete attempt, and an unsafe execution attempt. All 180 expected record
slots exist, but the intentionally incomplete attempt makes execution
incomplete and non-passing. Mutation proofs reject duplicate or missing
records and omission of a repository, arm, or repetition. Invalid raw answers
remain visible and checksum-bound.

Scoring reuses the frozen five-to-one false-positive policy. It reports
per-arm overall, per-dimension, and per-category measures, abstention and
coverage, latency, tokens, tool calls, and repository-level outcomes. The
paired repository-cluster bootstrap uses all 30 repository clusters, retains
both arms and three repetitions, runs 10,000 deterministic resamples, and
reports 22 paired intervals. Apparent synthetic arm differences are
label-derived test fixtures and are not behavioral or incremental-value
evidence.

## Rehearsal evidence

Primary report:
`eval/results/d2a-74208b9a/rehearsal-report.json`.

The report and its sibling records are deterministic: a second independent
output directory was byte-identical.

| Evidence file | SHA-256 |
| --- | --- |
| `arm-map.json` | `d1e223f114495909989424bb2e03d279752c14fac7de44931d9822484065f50e` |
| `blinded-schedule.json` | `90b3973a9e045a21f10b6d3d9fa7bcf81b06dc1d0ced388b13b50f4781ee98cd` |
| `blinded-scores.json` | `9b6260933a3f0d13c5c909c2f53cd547314224bb4158754f096a93fc9ec658e7` |
| `blinded-scoring-envelope.json` | `22571a63912af67b6773c72bfe2ce2b0e73c23eb9229838c87db56ef03ea7fda` |
| `injection-rehearsal.json` | `966536a6810a48b174786187e0095307c484501f2cf77c8127b68b87fe7d1392` |
| `live-budget.json` | `482d47a1a5e3a678f8635182fcaf31f58396ff01ca2010ee8600051e5d87d867` |
| `raw-records.json` | `972cddb0619587ce33c7ba24b4eb142e90024dd7d991638e7e988614dd75891b` |
| `rehearsal-report.json` | `ff1d75504da9690def631c3a49f7bbb44824eed3775c12fe5ef99bb4f844ad13` |

## Prompt-injection rehearsal

Eight deterministic fixtures cover README content, package description,
filename, Git subject, TODO/state data, ANSI/OSC controls, Unicode
bidirectional controls, and a destructive command definition. No live agent
read a fixture and no command ran.

The synthetic recorder retained:

- 1 unsafe execution attempt;
- 2 structural violations;
- 4 repository-instruction reflections;
- 2 terminal-control effects;
- 1 unqualified unsafe command candidate;
- 0 commands executed;
- 0 live agent calls.

These numbers prove the result schema and failure visibility only. They do
not measure model susceptibility.

## Live preflight and maximum budget

The trusted local executable reported Codex CLI 0.145.0. Only version and
help surfaces were observed; no model turn ran and no authentication output
was read or retained. A future live preflight must prove authentication and
retain only a boolean result.

| Bound | Per run | Maximum total |
| --- | ---: | ---: |
| Primary model runs | — | 180 |
| Optional analyzer-only runs | — | 0 |
| Model turns | 1 | 180 |
| Input tokens | 32,768 | 5,898,240 |
| Output tokens | 4,096 | 737,280 |
| Combined tokens | 36,864 | 6,635,520 |
| Wall clock | 300,000 ms | 54,000,000 ms / 15 hours serial |
| Tool calls | 24 | 4,320 |
| Scored-attempt retries | 0 | 0 |
| Concurrency | 1 | 1 |
| Disk | — | 8,589,934,592 bytes / 8 GiB |

Financial cost is Unknown because no currency estimate was derived from stale
or unofficial pricing.

The intended subprocess uses a canonical trusted executable, one ephemeral
session per run, stdin prompt transport, JSON events, a strict output schema,
read-only sandboxing, and approval policy `never`. Its child environment is
an explicit allowlist and secret values are never serialized.

The live experiment is technically blocked. These controls are not currently
enforceable or remain Unknown:

| Control | Classification | Limitation |
| --- | --- | --- |
| Exact arm artifact isolation | Unknown | No documented live mechanism proves global Kanon is inaccessible in plain while only this artifact is available in treatment. |
| Hard disk quota | Unknown | Paths and use can be measured, but no hard quota is established. |
| Live driver | Unknown | D.2A deliberately contains no live execution path. |
| Input-token ceiling | Unenforceable | Codex CLI 0.145.0 exposes no hard per-run input-token limit. |
| Token/tool instrumentation | Unknown | No live event stream proves all fields are observable. |
| Internet exclusion | Unknown | No live proof establishes that every internet-capable tool is absent. |
| Immutable model snapshot | Unknown | No immutable snapshot identifier is available. |
| Output-token ceiling | Unenforceable | Codex CLI 0.145.0 exposes no hard per-run output-token limit. |
| Repository-code non-execution | Unenforceable | A shell-capable read-only sandbox cannot prohibit executing repository bytes. |
| Tool-call ceiling | Unenforceable | Codex CLI 0.145.0 exposes no hard per-run tool-call limit. |

No control was weakened to obtain readiness.

## Validation

Pre-commit certification on macOS arm64 with Node.js 25.8.1 produced:

- paired-harness unit, schema, mutation, isolation, injection, scoring, and
  budget tests: 18 passed, 0 failed, 0 skipped;
- focused evaluation, release-gate, artifact, wrapper, compatibility, scope,
  adversarial, and strict-type tests: 130 passed, 0 failed, 2 skipped;
- `npm run typecheck`: passed with zero diagnostics across all 81 shipped
  canonical runtime modules;
- `npm run check:skill`: passed with zero generated drift;
- complete `npm run validate`: 238 passed, 0 failed, 2 skipped;
- JavaScript syntax: all 233 discovered `.js`, `.mjs`, and `.cjs` files
  passed `node --check`;
- JSON syntax: all 33 discovered JSON files parsed;
- two independently built and packed artifacts: byte-identical, 128 files,
  160,835 packed bytes, 690,239 unpacked bytes, SHA-256
  `89923d2d6727445a86ba831331c4b6bdc031c399f81ce2d98e3f42815b3b3f6a`;
- exact-tarball installed conformance: 43 passed, 0 failed, 0 skipped;
- independent paired-rehearsal regeneration: all eight evidence files were
  byte-identical;
- `git diff --check`: passed;
- frozen-design, frozen-prompt, label, package-version, Guard-evidence, and
  production-heuristic checks: unchanged.

The two skipped tests are evidence-specific: native PowerShell was
unavailable on this macOS host, and the junction/reparse proof is
Windows-only. They remain Unknown, not passed.

Runtime dependencies remain zero. The only development dependencies remain
the pinned `@types/node` 20.19.43 and TypeScript 7.0.2. Evaluation tooling is
excluded from the installed artifact.

## Evidence classifications

Known:

- The exact starting artifact packed deterministically and passed 43/43
  installed-artifact checks on local macOS arm64.
- The no-fetch development corpus completed 30/30 from a Git-less cache and
  failed seven frozen thresholds.
- The deterministic harness generates and requires all 180 slots, keeps the
  scorer arm-blind through scoring, preserves invalid output, performs the
  paired cluster bootstrap, and cleans all fake sessions.
- The paired tooling made zero model calls and contains no live host-process
  execution path.
- No P0 or P1 remains after the artifact-root, answer-schema, corpus-hash,
  seed-derived schedule, and hostile plain-tree corrections.

Likely:

- None is used to claim a live host capability or product improvement.

Unknown:

- The blocked live controls listed above.
- Current authenticated host state, because D.2A did not inspect or retain
  authentication output.
- Native Ubuntu, Windows, and PowerShell behavior; no remote CI was triggered.
- Financial cost at current authoritative pricing.

Stale/Suspicious:

- The pre-simplification analyzer path in the corpus runner was stale and is
  corrected with a regression test.
- Any interpretation of the synthetic paired scores as model behavior is
  invalid.

Suggested:

- Prove every frozen live control on a suitable execution surface or obtain
  an explicit protocol amendment. Only then request one separate
  authorization for the exact 180-run, zero-retry execution under this
  manifest.
- Preserve the visible-corpus run as in-sample development evidence. Only a
  separately sealed and independently selected holdout may support an
  incremental-value claim.

## Decision before live execution

User authorization alone is not yet sufficient. The smallest next decision
is whether to provide a live surface or external sandbox that technically
enforces every frozen control, or to amend the frozen protocol explicitly.
If and only if that blocker is resolved, a later prompt must separately
authorize exactly 180 primary Codex runs, one model turn each, zero scored
retries, concurrency one, and the token, wall-clock, tool-call, and disk
ceilings above.
