# Kanon Security Policy

Kanon performs read-only inspection by default and never executes repository code, tests, package scripts, hooks, or setup commands.

## Scan Boundary

- Stay inside the selected repository root.
- Skip symlinks.
- Respect Git ignore rules when Git metadata is available.
- Respect repository-local `.kanonignore` patterns for generated or irrelevant evidence.
- Skip likely secret-bearing files such as `.env`, private keys, credentials, and secret files.
- Report skipped sensitive files as a count without reading, hashing, citing, or persisting their names or contents.

An explicitly requested README target may be inspected even when Git-ignored, because the user selected that file. Sensitive-file exclusions and repository-root containment still apply.

## Sharing Evidence

Treat repository paths, excerpts, commit subjects, and generated Kanon state as potentially private. Include only evidence needed to answer the user’s question. Do not expose raw evidence outside the current task without authorization.
