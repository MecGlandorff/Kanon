# Kanon evaluation corpus

This corpus is the release gate for repository-orientation claims. It contains
third-party repositories pinned to immutable Git commits. Kanon never executes
code from a corpus repository: the runner only checks out files and calls the
read-only analyzer.

## Ground truth

Each case contains:

- exactly five hand-selected important files;
- one canonical run command, or `null` when the repository has no defensible
  repository-level run command;
- one canonical test command, or `null` when no repository-level test command
  exists;
- the source files used while labeling.

`cwd` is part of a command label. This matters for repositories such as pretix,
where `python manage.py runserver` is correct only from `src/`.

The labels favor code, package metadata, build files, CI, and contributor docs
over filename convention. They intentionally include libraries with no run
command and one real repository revision with no README. A prediction in either
case is a false positive.

## Precision budget

A false positive costs five times as much as a false negative. That asymmetry is
part of the checked corpus contract, not a tuning note:

```text
weighted_error = (5 × false_positives) + false_negatives
```

Releases must meet all thresholds in `corpus.json`. Important-file predictions
are capped at five results per repository and may abstain when structural
evidence is weak. Commands are exact after whitespace normalization and include
their working directory.

## Run

The first run fetches pinned checkouts into a cache. Later runs are offline and
reuse it.

```bash
npm run eval:corpus
npm run eval:corpus -- --no-fetch
npm run eval:corpus -- --repo karpathy/nanogpt --json
```

Set `KANON_CORPUS_CACHE` to choose a cache directory. The default is outside the
repository in the operating system's temporary directory.

The corpus runner reports every miss and false positive. It exits non-zero when
the precision, recall, or weighted-error budget fails.
