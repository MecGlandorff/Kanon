# Kanon development corpus

This visible corpus is development and regression data for
repository-orientation claims. It is not a release holdout and its scores are
not estimates of performance on unseen repositories. The release process is
defined in [`PROTOCOL.md`](PROTOCOL.md).

The corpus contains third-party repositories pinned to immutable Git commits.
Kanon never executes code from a corpus repository: the runner only checks out
files and calls the read-only analyzer.

## Ground truth

Each case contains:

- exactly five hand-selected important files;
- one or more accepted equivalent run commands, or `null` when the repository
  has no defensible repository-level run command;
- one or more accepted equivalent test commands, or `null` when no
  repository-level test command exists;
- a rationale and direct source files for every label.

`cwd` is part of a command label. This matters for repositories such as pretix,
where `python manage.py runserver` is correct only from `src/`.

The labels favor code, package metadata, build files, CI, and contributor docs
over filename convention. They intentionally include libraries with no run
command and one real repository revision with no README. A prediction in either
case is a false positive.

## Scope

The corpus scores only important-file selection, one run command, and one test
command. It does not estimate the accuracy of purpose summaries, entrypoint
discovery, README drift, arbitrary `ask` questions, improvement advice, or
refactor advice. Unit and adversarial tests for those behaviors are regression
contracts, not evidence of cross-repository capability.

## Development thresholds

A false positive costs five times as much as a false negative. That asymmetry is
part of the checked corpus contract, not a tuning note:

```text
weighted_error = (5 × false_positives) + false_negatives
```

The runner gates aggregate, per-dimension, and per-category thresholds from
`corpus.json`. These are useful regression signals, but passing them does not
authorize a stable release. Important-file predictions are capped at five
results per repository and may abstain when structural evidence is weak.
Commands are exact after whitespace normalization and include their working
directory.

## Run

The first run fetches each pinned revision into a revision-bound isolated
cache, verifies it, and removes Git metadata. Later runs are offline and reuse
only those immutable analysis trees.

```bash
npm run eval:corpus
npm run eval:dev
npm run eval:corpus -- --no-fetch
npm run eval:corpus -- --repo karpathy/nanogpt --json
```

Set `KANON_CORPUS_CACHE` to choose a cache directory. The default is outside the
repository in the operating system's temporary directory.

The corpus runner reports every miss, false positive, abstention, error, and
uncertainty interval. A release evaluation must use a separately frozen
manifest with `evaluation_role: "release"` and `--require-role release`.

The planned paired Codex experiment is defined in
[`PAIRED_ABLATION.md`](PAIRED_ABLATION.md). It is a separate protocol: these
standalone analyzer results are not evidence that Kanon improves Codex.
