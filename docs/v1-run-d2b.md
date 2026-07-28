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

Pending the single corrected evaluation.
