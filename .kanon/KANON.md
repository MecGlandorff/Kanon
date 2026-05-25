# Kanon Repo Brief

Generated: 2026-05-25T22:49:03.830Z
Repo: @mecglandorff/kanon
Languages: JavaScript/TypeScript

## What This Repo Does
- Evidence-backed repo continuity skill runtime for Codex and Claude Code. (known) [e_20260525224903_002]

## How To Run
### Run
- Unknown: no command evidence found.
### Dev
- Unknown: no command evidence found.
### Build
- Unknown: no command evidence found.
### Test
- `npm test` (package.json, known) [e_20260525224903_002]

## Important Files
- README.md: declared repo intent and usage [e_20260525224903_005]
- package.json: package metadata and commands [e_20260525224903_006]
- src/index.js: likely entrypoint [e_20260525224903_007]
- src/cli.js: likely entrypoint [e_20260525224903_008]
- bin/kanon.js: likely entrypoint [e_20260525224903_009]
- .github/workflows/ci.yml: CI or automation workflow [e_20260525224903_010]

## Current Implementation State
### Known
- Repo purpose: Evidence-backed repo continuity skill runtime for Codex and Claude Code. [e_20260525224903_002]
- test command: npm test [e_20260525224903_002]
- 1 test evidence found (npm test script). [e_20260525224903_004]
- CI configuration found: .github/workflows/ci.yml. [e_20260525224903_003]
### Likely
- src/cli.js appears to be an entrypoint by convention. [e_20260525224903_011]
- src/index.js appears to be an entrypoint by convention. [e_20260525224903_012]
### Stale / Suspicious
- None detected.
### Unknown
- No deployment path found. No Dockerfile, Procfile, platform config, or compose file was detected.
- No release workflow or changelog found. No release workflow, releaserc, or CHANGELOG.md was detected.
### Suggested
- Run npm test first. A test command was detected from repo evidence.
- Inspect src/cli.js next. It appears to be the main entrypoint.

## Evidence Used
- e_20260525224903_001 file README.md: README found and used as declared-intent evidence.
- e_20260525224903_002 config package.json: package.json declares package @mecglandorff/kanon with 1 script(s).
- e_20260525224903_003 config .github/workflows/ci.yml: CI configuration found.
- e_20260525224903_004 test test/kanon.test.js: 1 test-like file(s) found.
- e_20260525224903_005 file README.md: Important repo file detected: README.md.
- e_20260525224903_006 file package.json: Important repo file detected: package.json.
- e_20260525224903_007 file src/index.js: Important repo file detected: src/index.js.
- e_20260525224903_008 file src/cli.js: Important repo file detected: src/cli.js.
- e_20260525224903_009 file bin/kanon.js: Important repo file detected: bin/kanon.js.
- e_20260525224903_010 config .github/workflows/ci.yml: GitHub Actions workflow detected.
- e_20260525224903_011 file src/cli.js: Likely entrypoint file found by convention.
- e_20260525224903_012 file src/index.js: Likely entrypoint file found by convention.
- e_20260525224903_013 file README.md: README documents command `npm test`.
