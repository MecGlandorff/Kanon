# Kanon Repo Brief

Generated: 2026-05-24T22:33:28.539Z
Repo: @mecglandorff/kanon
Languages: JavaScript/TypeScript

## What This Repo Does
- Repo continuity for AI coding agents. (known) [e_20260524223328_002]

## How To Run
### Run
- `kanon` (package.json bin, known) [e_20260524223328_002]
### Dev
- Unknown: no command evidence found.
### Build
- Unknown: no command evidence found.
### Test
- `npm test` (package.json, known) [e_20260524223328_002]

## Important Files
- README.md: declared repo intent and usage [e_20260524223328_004]
- package.json: package metadata and commands [e_20260524223328_005]
- src/index.js: likely entrypoint [e_20260524223328_006]
- src/cli.js: likely entrypoint [e_20260524223328_007]
- bin/kanon.js: likely entrypoint [e_20260524223328_008]

## Current Implementation State
### Known
- Repo purpose: Repo continuity for AI coding agents. [e_20260524223328_002]
- test command: npm test [e_20260524223328_002]
- run command: kanon [e_20260524223328_002]
- 1 test evidence found (npm test script). [e_20260524223328_003]
### Likely
- bin/kanon.js appears to be a package entrypoint. [e_20260524223328_002]
- src/cli.js appears to be an entrypoint by convention. [e_20260524223328_009]
- src/index.js appears to be an entrypoint by convention. [e_20260524223328_010]
### Stale / Suspicious
- None detected.
### Unknown
- No CI configuration found. No GitHub Actions, GitLab CI, CircleCI, or similar CI config was detected.
- No deployment path found. No Dockerfile, Procfile, platform config, or compose file was detected.
- No release workflow or changelog found. No release workflow, releaserc, or CHANGELOG.md was detected.
### Suggested
- Run npm test first. A test command was detected from repo evidence.
- Add CI once the local test command is verified. No CI evidence was found.
- Inspect bin/kanon.js next. It appears to be the main entrypoint.

## Evidence Used
- e_20260524223328_001 file README.md: README found and used as declared-intent evidence.
- e_20260524223328_002 config package.json: package.json declares package @mecglandorff/kanon with 2 script(s).
- e_20260524223328_003 test test/kanon.test.js: 1 test-like file(s) found.
- e_20260524223328_004 file README.md: Important repo file detected: README.md.
- e_20260524223328_005 file package.json: Important repo file detected: package.json.
- e_20260524223328_006 file src/index.js: Important repo file detected: src/index.js.
- e_20260524223328_007 file src/cli.js: Important repo file detected: src/cli.js.
- e_20260524223328_008 file bin/kanon.js: Important repo file detected: bin/kanon.js.
- e_20260524223328_009 file src/cli.js: Likely entrypoint file found by convention.
- e_20260524223328_010 file src/index.js: Likely entrypoint file found by convention.
- e_20260524223328_011 file README.md: README documents command `kanon brief`.
- e_20260524223328_012 file README.md: README documents command `kanon verify`.
- e_20260524223328_013 file README.md: README documents command `kanon ask`.
- e_20260524223328_014 file README.md: README documents command `kanon resume`.
- e_20260524223328_015 file README.md: README documents command `kanon refresh`.
- e_20260524223328_016 file README.md: README documents command `npx @mecglandorff/kanon brief`.
- ... 7 more evidence record(s)
