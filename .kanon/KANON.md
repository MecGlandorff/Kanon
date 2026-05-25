# Kanon Repo Brief

Generated: 2026-05-25T22:00:11.931Z
Repo: @mecglandorff/kanon
Languages: JavaScript/TypeScript

## What This Repo Does
- Repo continuity for AI coding agents. (known) [e_20260525220011_002]

## How To Run
### Run
- `kanon` (package.json bin, known) [e_20260525220011_002]
### Dev
- Unknown: no command evidence found.
### Build
- Unknown: no command evidence found.
### Test
- `npm test` (package.json, known) [e_20260525220011_002]

## Important Files
- README.md: declared repo intent and usage [e_20260525220011_005]
- package.json: package metadata and commands [e_20260525220011_006]
- src/index.js: likely entrypoint [e_20260525220011_007]
- src/cli.js: likely entrypoint [e_20260525220011_008]
- bin/kanon.js: likely entrypoint [e_20260525220011_009]
- .github/workflows/ci.yml: CI or automation workflow [e_20260525220011_010]

## Current Implementation State
### Known
- Repo purpose: Repo continuity for AI coding agents. [e_20260525220011_002]
- test command: npm test [e_20260525220011_002]
- run command: kanon [e_20260525220011_002]
- 1 test evidence found (npm test script). [e_20260525220011_004]
- CI configuration found: .github/workflows/ci.yml. [e_20260525220011_003]
### Likely
- bin/kanon.js appears to be a package entrypoint. [e_20260525220011_002]
- src/cli.js appears to be an entrypoint by convention. [e_20260525220011_011]
- src/index.js appears to be an entrypoint by convention. [e_20260525220011_012]
### Stale / Suspicious
- None detected.
### Unknown
- No deployment path found. No Dockerfile, Procfile, platform config, or compose file was detected.
- No release workflow or changelog found. No release workflow, releaserc, or CHANGELOG.md was detected.
### Suggested
- Run npm test first. A test command was detected from repo evidence.
- Inspect bin/kanon.js next. It appears to be the main entrypoint.

## Evidence Used
- e_20260525220011_001 file README.md: README found and used as declared-intent evidence.
- e_20260525220011_002 config package.json: package.json declares package @mecglandorff/kanon with 2 script(s).
- e_20260525220011_003 config .github/workflows/ci.yml: CI configuration found.
- e_20260525220011_004 test test/kanon.test.js: 1 test-like file(s) found.
- e_20260525220011_005 file README.md: Important repo file detected: README.md.
- e_20260525220011_006 file package.json: Important repo file detected: package.json.
- e_20260525220011_007 file src/index.js: Important repo file detected: src/index.js.
- e_20260525220011_008 file src/cli.js: Important repo file detected: src/cli.js.
- e_20260525220011_009 file bin/kanon.js: Important repo file detected: bin/kanon.js.
- e_20260525220011_010 config .github/workflows/ci.yml: GitHub Actions workflow detected.
- e_20260525220011_011 file src/cli.js: Likely entrypoint file found by convention.
- e_20260525220011_012 file src/index.js: Likely entrypoint file found by convention.
- e_20260525220011_013 file README.md: README documents command `kanon brief`.
- e_20260525220011_014 file README.md: README documents command `kanon verify`.
- e_20260525220011_015 file README.md: README documents command `kanon ask`.
- e_20260525220011_016 file README.md: README documents command `kanon resume`.
- ... 29 more evidence record(s)
