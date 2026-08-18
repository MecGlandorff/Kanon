# Evaluation protocol

Kanon separates visible development data, independent release holdouts, and
artifact conformance. A 30–50 repository result is a frozen compatibility
sample with uncertainty, not a population-level capability estimate.

The scored v0.4 scope is important-file selection, declared run candidate, and
declared test candidate. It does not estimate purpose, entrypoints,
documentation drift, arbitrary questions, or any experimental source feature.

## Label schema

Every important-file label records the path, relevance, rationale, and direct
sources:

```json
{
  "path": "src/example.js",
  "relevance": 3,
  "rationale": "Public runtime entrypoint declared by package metadata",
  "sources": ["package.json", "src/example.js"]
}
```

A command label may list multiple defensible equivalents. `cwd` is part of the
label:

```json
{
  "accepted": [
    {"cwd": ".", "command": "npm test"},
    {"cwd": ".", "command": "npm run test"}
  ],
  "rationale": "Both commands select the directly declared test script.",
  "sources": ["package.json", "CONTRIBUTING.md"]
}
```

## Stable release sequence

1. Freeze and publish/hash the metric policy before repository selection.
2. Freeze the complete candidate commit.
3. Have someone other than the implementation author select and label fresh
   cases.
4. Exclude forks, sibling projects, same-author clusters, previously discussed
   repositories, and all visible development cases.
5. Require a distinct second reviewer for subjective important-file labels.
6. Record the implementation author, labeler, independent reviewer, candidate
   commit/version, and freeze timestamp.
7. Seal the complete manifest SHA-256 before Kanon sees any case.
8. Pack the candidate once, record the tarball SHA-256, install it into an
   empty directory, and complete cross-platform conformance.
9. Run every frozen case exactly once through that installed artifact.
10. Publish the manifest, raw predictions and labels, uncertainty intervals,
    conformance reports, artifact hash, and candidate commit together.

If the holdout fails and product code changes, retire that corpus permanently
into development data and select a fresh release holdout. Independent labels
must exist before predictions; a relabeled or rerun sample cannot authorize a
stable release.

## Enforced gates

Release mode rejects `--repo`, unknown or missing cases, policy drift,
development overlap, underfilled categories, nonpositive costs, missing
artifact conformance, and corpus-hash mismatch. It gates overall,
per-dimension, and per-category precision/recall, weighted error, scan
completeness, and per-case analysis errors.

Raw reports include timestamps, candidate and analyzer versions, Node/OS/CPU,
corpus and artifact SHA-256 values, all selected case IDs, predictions, labels,
abstentions, coverage, category results, Wilson intervals, conformance, and
final pass/fail reasons.

Evaluation checkout uses an isolated, depth-one fetch of the exact commit,
disables system/global configuration, hooks, fsmonitor, filters supplied by
external config, prompts, optional locks, and lazy fetching, verifies a clean
checkout, and removes Git metadata before analysis. Product analysis receives
`inspectGit: false`.

## Development data

Visible labels may guide generic behavior only. Every production heuristic must
remain explainable without naming a labeled repository and must be registered
in `src/code-intel/heuristics.js`. A substring tripwire is only a regression
alarm; it is not contamination control.

`eval/RESULTS.md` retains the compact rendering of the archived D.2B raw
report. New development renderings are generated from a committed raw report
with `scripts/render-results.js`; generated result content must not be
hand-edited.

## Incremental-value experiment

The deterministic corpus evaluates Kanon's standalone predictions. It does not
show whether giving Kanon to Codex improves Codex's final answer. That question
uses the separately frozen paired, blinded design in
[`PAIRED_ABLATION.md`](PAIRED_ABLATION.md).

The visible corpus may support development comparisons only. A public
Codex-with-Kanon versus plain-Codex claim requires a fresh, independently
labeled holdout whose task prompt, model configuration, policy, labels, and
manifest were sealed before either arm ran.
