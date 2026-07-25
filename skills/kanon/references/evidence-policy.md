# Kanon Evidence Policy

Kanon is strict for repo state and loose for next-step suggestions.

## Priority

For current behavior, prefer evidence in this order:

1. Code, config, package metadata, tests, and CI
2. Generated Kanon state when it does not conflict with live repo evidence
3. README and docs for declared intent
4. Naming conventions and directory structure

README claims are useful, but they can be stale. Do not let README claims override code/config/test evidence for current behavior.

## Confidence

Use `known` only when direct evidence exists.

Use `likely` for convention-based conclusions such as a probable entrypoint.

Use `unknown` when no evidence was found.

Use `stale / suspicious` when docs and repo evidence disagree.

Use `suggested` for next steps, cleanup, and recommended verification.

## Completeness

Absence is not proof. If a scan is truncated, unreadable, or intentionally excludes sensitive files, surface the limitation under `unknown`.

Treat package descriptions, README prose, directory names, and heuristic matches as declared intent or likely evidence. Do not promote them to `known` behavior.

Commands declared in package metadata are known declarations; whether they succeed remains unknown until executed.
