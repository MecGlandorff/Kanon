# Kanon v1 Run D.2B generic correction record

Date: 2026-07-29

Scope: one generic deterministic product correction followed by exactly one
artifact-bound development-corpus evaluation. This record was started before
production behavior changed. No live model call, network request, corpus code
execution, paired experiment, holdout work, candidate freeze, version change,
or external mutation is authorized.

The frozen design, paired protocol and prompt, labels, rationales, accepted
commands, categories, costs, thresholds, corpus manifest, package version,
historical Guard evidence, and D.2A reports remain inputs rather than editable
targets.

## Starting binding

- Branch: `release/v.1.0.0`.
- Starting commit:
  `637c6ecbc4cc201b2124cd58ea6359b92f518e9b`.
- Configured upstream: `origin/release/v.1.0.0`.
- Starting relation: 8 commits ahead and 0 behind.
- Starting worktree: clean.
- Session: `gpt-5.6-sol`, `xhigh`.
- D.2A report SHA-256:
  `747b4f1590eda9787c87aae2e25853b8e1e8fa04893e2359eedf7a6050b7acb3`.

## Pre-edit failure taxonomy

The exhaustive case/path mapping is evaluation-only data in
`eval/results/d2b-predeclared-taxonomy.json`. The production-facing taxonomy is
anonymized here. Counts are disjoint within each table and reconcile to every
D.2A error in scope.

### Important-file false positives

| Existing evidence mechanism | Count | Generic failure |
| --- | ---: | --- |
| Local import fan-in alone | 19 | A frequently imported utility was treated as independently eligible. |
| Nested manifest binary/export declaration | 15 | Multiple valid package declarations were treated as repository-wide priorities without a root distinction. |
| Root README, manifest, or task filename | 7 | Presence alone filled a slot although the file's product role was not established. |
| Conventional test path | 2 | A test-shaped path was treated as evidence of repository-wide importance. |
| Executable syntax alone | 1 | One executable among several was selected without corroborating repository-level evidence. |
| Framework alias target | 1 | An inherited implementation file displaced the directly named framework contract. |
| **Total** | **45** | |

All 45 also share a secondary mechanism: once direct evidence was exhausted,
the selector kept filling answer slots instead of abstaining.

### Important-file false negatives

| Missed evidence mechanism | Count | Generic failure |
| --- | ---: | --- |
| Local import fan-in | 18 | Raw fan-in ordering favored utilities and test-heavy import traffic over the missed target. |
| Direct component/workspace manifest declaration | 8 | Nested declaration and alias boundaries were not retained with enough provenance. |
| Filename/path convention without sufficient structural evidence | 7 | The label was not recoverable from a defensible production signal and must remain an abstention. |
| Executable syntax | 6 | Multiple executable modules were detected, but repository-level evidence did not distinguish all of them. |
| Direct framework declaration or alias chain | 4 | The direct settings/routing contract was replaced or reached after five slots. |
| Literal local reference | 3 | Exact references were either not scanned as reference evidence or were ordered after weak selections. |
| Root task or explicitly primary component contract | 3 | Shell/component contracts were not represented as eligible evidence. |
| **Total** | **49** | |

### Missed run commands

| Direct-evidence class | Count | Generic failure |
| --- | ---: | --- |
| Exact root documentation with competing phases or variants | 2 | Setup, primary run, and follow-up commands received indistinguishable evidence. |
| Root-referenced executable syntax | 2 | A documented component plus executable syntax did not form a command candidate. |
| Exact primary-component documentation | 2 | Root-declared component priority was lost when linked documents were flattened. |
| Exact inline or multiline documentation | 2 | Numbered inline steps and a fenced multiline command were not parsed completely. |
| Root build/executable sequence | 1 | Separate direct build and executable declarations were not safely composable. |
| Source-declared CLI example | 1 | A bounded command example in implementation metadata was outside the documentation parser. |
| Root manifest alias to a workspace binary | 1 | The exact task alias was not connected to the declared workspace binary. |
| Exact documentation competing with an auxiliary ecosystem | 1 | An auxiliary package command tied the directly declared primary command. |
| Executable syntax plus a documented product command | 1 | The source invocation and product-level argument were not directly connected. |
| Executable syntax without repository-level command text | 1 | No exact invocation was declared; continued abstention is required. |
| **Total** | **14** | |

### Incomplete scans

Six scans were incomplete solely because contained repository symlinks were
rejected. One was incomplete solely because text reads reached the per-file
limit. One combined a rejected link with per-file truncation. One combined
rejected links with exhaustion of the 32 MiB total text-read budget. None
reached the file-count, entry-count, elapsed-time, hash-byte, timeout, or
unreadability bounds.

Rejected links remain rejected. Per-file and total read limits remain
unchanged: increasing either would not repair the trust boundary and no
ecosystem-independent resource proof justifies a larger bound.

## Predeclared generic correction hypotheses

| Evidence mechanism | Intended correction | Ecosystems | Expected failure modes | Independent rationale | Exposure | Disproof test |
| --- | --- | --- | --- | --- | --- | --- |
| Fan-in and literal references | Stop treating fan-in alone as eligibility; do not double-count import syntax as a separate literal reference; require direct evidence or independently corroborated weak evidence. | Python, Go, Rust, JavaScript/TypeScript | A central implementation file with no direct contract may be omitted. | Utility modules and test imports can dominate raw degree in any repository graph. | Fan-in predates this correction; the eligibility constraint is after visible-corpus exposure. | A generated utility with arbitrary import volume must remain unselected, while a directly declared target remains selected. |
| Filename/path conventions | Remove convention-only test anchors and dependency/config filenames from important-file eligibility. | Python, Rust, Python web | A familiar but otherwise unreferenced test or dependency file may be omitted. | A basename or directory name is not repository evidence. | After visible-corpus exposure. | Adversarial files with familiar names but no declarations must not fill slots. |
| Workspace declarations | Select at most one ranked executable declaration from an ambiguous workspace and do not promote nested exports solely because many peer manifests exist. | JavaScript/TypeScript, Rust, polyglot | A secondary workspace package may be omitted. | A declaration proves a package target, not repository-wide primacy among peers. | After visible-corpus exposure. | Reordering hostile package names must not increase the number of selected workspace targets; a unique declared binary must remain eligible. |
| Executable syntax | Treat a unique executable as direct structural evidence; when several executables compete, require independent repository-level corroboration instead of choosing one by rank. | Python, Go, Rust, JavaScript/TypeScript | A unique auxiliary executable may still be selected; ambiguous repositories may abstain. | Executability establishes how a file runs but cannot distinguish repository-wide primacy among peers. | Executable detection predates the corpus; ambiguity handling is after exposure. | Multiple generated executables with hostile names must not cause one unreferenced file to be selected; an exact root-referenced executable must remain eligible. |
| Framework chain | Preserve the directly named settings module, then follow its bounded inherited configuration for routing declarations without replacing the direct target. | Python/Django | Dynamic settings or routing construction remains Unknown. | Direct bootstrap assignments are stronger than an implementation alias. | Framework parsing predates this correction; chain preservation is after exposure. | A generated direct-settings/inherited-routing fixture must select the direct settings and routing targets deterministically. |
| Documented commands | Preserve ordered root links, explicit primary-component wording, inline navigation, multiline commands, and direct phase/variant evidence; reject commands whose referenced local target is absent. | All documented ecosystems | Ambiguous equal-strength commands still abstain; prose may be stale. | Exact repository commands and contained cwd changes are direct declarations, not ecosystem guesses. | Parser predates this correction; ordered/corroborated forms are after exposure. | Conflicting equal-strength commands must abstain; missing local targets must abstain; exact contained commands must retain cwd. |
| Manifest command aliases | Connect a root package script only when its safe token is also exactly one contained workspace manifest's declared binary name. | JavaScript/TypeScript workspaces | A wrapper may be broken or unsafe and still requires inspection and approval. | Both ends of the unique alias are machine-readable repository declarations. | After visible-corpus exposure. | An alias without a matching declared binary, a binary without a root alias, duplicate matches, and shell-shaped names must abstain. |
| Conventional run commands | Remove convention-synthesized run candidates; retain existing conventional test behavior unless direct evidence supersedes it. | Rust, Go, Python/Django | Run coverage can decrease when repositories do not declare an invocation. | The task requires exact repository support and forbids command synthesis from ecosystem familiarity. | Convention predates the corpus; this restriction is after exposure. | A manifest plus executable filename without an exact run declaration must not emit a run command. |

No numeric selection threshold is proposed. Eligibility is categorical:
direct declaration, direct executable structure with repository-level
corroboration, or multiple independent evidence mechanisms. Five is a maximum,
not a target.

## Non-goals and preserved behavior

- Do not infer importance from a missing alternative.
- Do not turn excluded, unreadable, truncated, or incomplete evidence into
  certainty or an absence claim.
- Do not weaken command trust language, definition inspection, or approval.
- Do not change the test-command policy deliberately; any change caused by a
  shared exact-declaration parser will be reported.
- Do not add a calibration framework, learned ranking, repository-family
  routing, dependency injection, runtime dependency, or transpilation.
- Preserve deterministic ordering, runtime validation, strict checked
  JavaScript, bounded I/O and memory, and canonical generated mirrors.
- Corpus strings and labels remain evaluation data. No case token, answer
  path, or case structure may enter product code, weights, fixtures, or this
  public record.

## Results and closure

Run D.2B performed one corrected development evaluation and then hard-stopped.
The frozen gates failed. No post-result product change, second evaluation,
threshold change, relabeling, or hidden retry occurred.

### Product correction and provenance

The product commit is
`7da293a544b94bcfad1eaaf05db5534d9ff4254c`.

| Mechanism | Disposition |
| --- | --- |
| Fan-in-only eligibility | Removed. Fan-in still ranks a file that is independently eligible. |
| Import/literal-reference double counting | Removed. Imports and literal contained references remain separate evidence. |
| Dependency/config and conventional-test filenames | Removed from important-file eligibility. |
| Root task filenames | Constrained to files with at least one parsed task target. |
| Manifest entrypoints | Constrained to at most one ranked executable declaration. |
| Executable syntax | Constrained to a unique executable or an independently corroborated target when peers compete. |
| Framework aliases | Constrained to retain the directly named settings contract while following a bounded inherited routing chain. |
| Convention-synthesized run commands | Removed for Cargo, Go, and Django; existing test conventions were preserved. |
| Documented commands | Added ordered root-linked documentation, hierarchical heading context, inline and bounded multiline forms, exact local-target validation, deterministic phase ordering, and cwd recovery from unique contained evidence. |
| Workspace command aliases | Added only for one safe root-script token that matches exactly one validated nested binary declaration. |
| Scan diagnostics | Added bounded raw-report diagnostics; scanner limits and link rejection were not changed. |

Every changed production mechanism has an ecosystem-level entry in
`src/code-intel/heuristics.js` and `docs/heuristics.md`. Canonical sources were
regenerated into runtime mirrors only through `npm run build:skill`.

### Exact evaluation binding

| Binding | Value |
| --- | --- |
| Candidate commit | `7da293a544b94bcfad1eaaf05db5534d9ff4254c` |
| Candidate version | `0.4.0-rc.1` |
| Candidate worktree at observation | clean |
| Analyzer | installed artifact |
| Corpus manifest SHA-256 | `4f768f151885d26de48fe0744cafc2402a27aca61f7f049aac166309891e0c92` |
| Artifact SHA-256 | `b26c67cb8a94a07f832fb3a3d527e8da7247a150a29d5af2a68543ff727592b1` |
| Installed conformance | passed, 43/43 checks |
| Raw report | `eval/results/development-0.4.0-rc.1-d2b-7da293a5.json` |
| Raw report SHA-256 | `e1c69f8f443e8dcd8ebf75abf7ce15e01029ed979d409ec356070c05afa0fbde` |
| Raw report bytes | 218,211 |
| Development executions in D.2B | exactly one |

The cache was the existing immutable local development cache. The invocation
used `--no-fetch`, made no network request, and executed no repository code.

### Before and after dimensions

| Measure | D.2A precision / recall | D.2B precision / recall | D.2A TP / FP / FN | D.2B TP / FP / FN | Weighted error before / after |
| --- | ---: | ---: | ---: | ---: | ---: |
| Overall | 74.9% / 66.8% | 71.5% / 60.0% | 137 / 46 / 68 | 123 / 49 / 82 | 298 / 327 |
| Important files | 69.2% / 67.3% | 66.4% / 59.3% | 101 / 45 / 49 | 89 / 45 / 61 | 274 / 286 |
| Run command | 100.0% / 50.0% | 80.0% / 42.9% | 14 / 0 / 14 | 12 / 3 / 16 | 14 / 31 |
| Test command | 95.7% / 81.5% | 95.7% / 81.5% | 22 / 1 / 5 | 22 / 1 / 5 | 10 / 10 |

Weighted error per case increased from 9.93 to 10.90. Total TP decreased by
14, FP increased by 3, and FN increased by 14.

The important-file selector emitted 134 predictions instead of 146, but the
12 removed predictions were all former true positives: FP remained 45.
Twenty-three cases still filled all five slots; seven emitted fewer than five.
This disproved the hypothesis that the categorical eligibility changes were
sufficient to improve precision on this sample.

### Before and after categories

| Category | D.2A precision / recall | D.2B precision / recall | D.2A TP / FP / FN | D.2B TP / FP / FN | Weighted error before / after |
| --- | ---: | ---: | ---: | ---: | ---: |
| Python ML | 61.3% / 48.7% | 69.2% / 46.2% | 19 / 12 / 20 | 18 / 8 / 21 | 80 / 61 |
| Go service | 70.3% / 61.9% | 64.9% / 57.1% | 26 / 11 / 16 | 24 / 13 / 18 | 71 / 83 |
| Monorepo | 66.7% / 63.4% | 68.3% / 68.3% | 26 / 13 / 15 | 28 / 13 / 13 | 80 / 78 |
| Rust CLI | 88.1% / 88.1% | 75.0% / 64.3% | 37 / 5 / 5 | 27 / 9 / 15 | 30 / 60 |
| Python web | 85.3% / 70.7% | 81.3% / 63.4% | 29 / 5 / 12 | 26 / 6 / 15 | 37 / 45 |

### Coverage, abstention, and recovered run evidence

| Dimension | D.2A coverage / abstentions | D.2B coverage / abstentions |
| --- | ---: | ---: |
| Important files | 100.0% / 0 | 100.0% / 0 |
| Run command | 46.7% / 16 | 50.0% / 15 |
| Test command | 76.7% / 7 | 76.7% / 7 |

Five previously missed run commands became true positives:

| Anonymized candidate | Direct evidence class |
| --- | --- |
| A | Root reference, executable syntax, and repository-declared interpreter |
| B | Exact inline documentation with a uniquely resolved contained cwd |
| C | Exact bounded multiline documentation |
| D | Unique root-script/workspace-binary manifest alias |
| E | Exact root documentation with deterministic variant ordering |

Seven former run true positives were lost: six had existed only through the
removed Cargo convention, and one exact documented Go command lost to a
shorter competing documented variant. Three false positives were introduced:
one root-referenced executable, one shorter competing documented Go form, and
one declared task target. These are preserved failures, not tuning inputs
within D.2B.

Test-command behavior was unchanged from D.2A: 22 TP, 1 FP, and 5 FN.

### Incomplete-scan diagnoses

The incomplete count remained nine. The new bounded diagnostics expose more
detail than the D.2A summary: several link-affected scans also carried a
per-file budget flag even when no retained path failure named the oversized
file. No scan recorded a timeout, unreadable entry, outside-root read,
file-count limit, entry-count limit, or hash-byte limit.

| Scan | Exact retained diagnosis |
| --- | --- |
| A | Two rejected symbolic links plus `max_file_bytes`; 1,826,414 text bytes read; no truncation or unreadability. |
| B | `max_file_bytes`; two named files exceeded the 120,000-byte text-read limit; 4,140,406 bytes read; truncated. |
| C | Two rejected symbolic links plus `max_file_bytes`; 18,443,368 bytes read; no truncation or unreadability. |
| D | Four rejected symbolic links only; 4,686,601 bytes read; no truncation or unreadability. |
| E | Thirty-seven rejected symbolic links plus `max_file_bytes`; 11,498,353 bytes read; no truncation or unreadability. |
| F | One rejected symbolic link plus `max_file_bytes`; three named files exceeded the 120,000-byte text-read limit; 4,979,828 bytes read; truncated. |
| G | Two rejected symbolic links only; 2,015,504 bytes read; no truncation or unreadability. |
| H | Four rejected symbolic links plus `max_file_bytes`; 906,065 bytes read; no truncation or unreadability. |
| I | Two rejected symbolic links, `max_file_bytes`, and exhaustion of the 33,554,432-byte total text budget; retained path failures were capped and marked truncated. |

Rejected links remain rejected and the 1,000,000-byte file, 120,000-byte
call-site text, and 33,554,432-byte total text limits remain unchanged.
Incomplete evidence still prevents absence claims.

### Frozen-gate result

Development status: **FAIL**.

- Overall precision was 71.5%, below 80.0%.
- Weighted error per case was 10.90, above 4.00.
- Important-file precision was 66.4%, below 80.0%.
- Important-file recall was 59.3%, below 60.0%.
- Run-command recall was 42.9%, below 60.0%.
- Python ML precision was 69.2%, below 80.0%.
- Go service precision was 64.9%, below 80.0%.
- Monorepo precision was 68.3%, below 80.0%.
- Rust CLI precision was 75.0%, below 80.0%.

All 30 cases are present, no analysis error occurred, execution was not
partial, and incomplete scans did not increase. Every other frozen dimension
and category threshold passed, but all gates are conjunctive.

### Size, mapping, dependencies, and validation

| Measure | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Packaged files | 128 | 128 | 0 |
| Packed bytes | 160,835 | 163,843 | +3,008 |
| Unpacked bytes | 690,239 | 700,888 | +10,649 |
| Strictly mapped shipped JavaScript modules | 81 | 81 | 0 |
| Strictly checked canonical production lines | 23,186 | 23,593 | +407 |
| Generated runtime JavaScript lines | 23,186 | 23,593 | +407 |
| Test JavaScript files | 17 | 18 | +1 |
| Test JavaScript lines | 11,645 | 12,084 | +439 |
| Runtime dependencies | 0 | 0 | 0 |

The canonical code-intelligence diff was +635/-228 lines; its generated
runtime mirror was exactly +635/-228. Evaluation runtime/reporting machinery
was +46/-7, and tests were +440/-1. The exact 81-module installed runtime maps
one-to-one to 81 strictly checked canonical sources with 23,593 lines on each
side. Package metadata, lock state, and dependency declarations did not
change.

Validation before the product commit:

- focused tests: 127 passed, 0 failed, 2 skipped;
- complete `npm run validate`: 253 passed, 0 failed, 2 skipped;
- `npm run check:skill`, strict no-emit type checking, 225 JavaScript syntax
  checks, 34 JSON parses, contamination, provenance, compatibility, scope,
  scanner, and artifact checks passed;
- all nine frozen-input hashes remained exact;
- `git diff --check` passed;
- two packs were byte-identical;
- installed-artifact conformance passed 43/43 checks.

One initial packaging setup invocation was rejected before staging or packing
because the temporary directory used a noncanonical macOS path spelling. It
created no artifact. Rebinding the same local-only check to the canonical
temporary root passed, and the exact post-commit artifact was independently
packed twice and conformed.

### Evidence classification and risks

**Known**

- The exact product commit, artifact, installed root, corpus manifest, scoring
  policy, raw report, generated summary, and hashes are bound.
- D.2B executed the development corpus exactly once, with no fetch and no
  analysis error.
- The frozen development gates failed with the metrics above.
- The test dimension did not regress and the incomplete count stayed nine.

**Likely**

- Literal local references and generic root contracts remain too permissive
  when they collectively fill five slots.
- Direct-document ordering can prefer an auxiliary or shorter invocation over
  the accepted primary invocation.
- Removing convention-only Cargo runs is principled under the command policy
  but exposes an unresolved tension with development labels that accept those
  commands.

**Unknown**

- Whether any future generic correction will satisfy this visible sample
  without harming unseen repositories.
- The contents and relevance of rejected links and unread budget-exhausted
  evidence.
- Any population-level or held-out capability estimate; none was attempted.

**Stale/Suspicious**

- The pre-edit D.2A incomplete taxonomy described several scans as
  link-only. The new exact diagnostics show additional `max_file_bytes` flags;
  the predeclared record is preserved as historical evidence, not rewritten.
- The hypothesis that abstaining from weak fan-in and convention slots would
  improve important-file precision is disproved on this run.

**Suggested**

- Review this single preserved failure before authorizing any new generic
  correction cycle.
- If another cycle is authorized, predeclare a label-independent distinction
  between repository-wide literal contracts and incidental literal
  references, plus conflict handling for multiple exact documented commands.
- Do not begin slice 17, candidate freeze, a holdout, or another corpus run
  from this failed D.2B state.

Remaining severity:

- **P0:** the frozen D.2B development gates fail, blocking slice 17 and
  candidate freeze.
- **P1:** important-file eligibility still produces 45 FP, and direct-command
  arbitration produces three run FP while run recall is 42.9%.
- **P2:** nine scans remain incomplete, and the documented-command parser adds
  review surface despite bounded tests.
- **Residual:** direct repository declarations can be stale or misleading and
  always require definition inspection and user approval before execution.
- **Contamination:** the substring tripwire passed and no case token entered
  production, generated runtime, tests, or public documentation. Visible-corpus
  exposure remains a structural risk for any future correction, so another
  cycle would require a fresh predeclaration and independent adversarial
  fixtures.
