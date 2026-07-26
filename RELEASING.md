# Releasing Kanon

Kanon releases are immutable evidence bundles. A version tag alone is not a
release decision.

## Freeze the candidate

1. Set one version in `package.json`, `package-lock.json`, and
   `src/version.js`.
2. Run `npm ci`, `npm run check:skill`, `npm test`, and `git diff --check`.
3. Confirm the candidate checkout is clean and commit every candidate file.
4. Build staging from the explicit allowlist with `npm run build:package`.
5. Pack once with `npm pack ./dist/npm --pack-destination ./dist/artifact`.
6. Calculate the tarball SHA-256. Do not repack after recording it.

The workflow-dispatch release job requires the full candidate commit, exact
version, release kind, and precomputed tarball SHA-256. It checks out that
commit and fails if the commit, versions, generated skill, or tree cleanliness
do not agree.

## Prerelease

When no independently sealed holdout exists, use a prerelease version such as
`0.4.0-rc.1` and select `prerelease`. Every development case must execute
without analysis errors and every safety/artifact job must pass. Development
quality thresholds may remain failed only when the raw report, intervals,
coverage, abstentions, and failure reasons are preserved in the release bundle.
The release manifest records that threshold result and must contain:

> No held-out capability estimate is claimed for this prerelease.

## Stable held-out procedure

Follow `eval/PROTOCOL.md` after the candidate commit is frozen. A stable release
requires a post-freeze `eval/release-corpus.json` whose policy, labels, and
manifest hash were sealed before predictions. The implementation author,
labeler, and independent reviewer must be three distinct recorded people.

Run the stable workflow exactly once with the sealed corpus SHA-256. Any
product-code change after seeing the results permanently retires that corpus
to development data.

## Exact artifact flow

The workflow:

1. checks out the clean candidate;
2. runs `npm ci` and generated-skill validation;
3. builds staging from the allowlist;
4. packs exactly once and verifies the supplied SHA-256;
5. installs and exercises that tarball on Ubuntu, Windows, and macOS;
6. runs all development cases;
7. for stable only, runs all held-out cases through the installed artifact;
8. creates `release-manifest.json` binding commit, version, tag, tarball,
   conformance reports, corpus hashes, and raw reports;
9. uploads the same unchanged tarball and evidence bundle; and
10. after protected approval, publishes that tarball with npm trusted
    publishing and creates the candidate-bound tag.

Stable releases require the development thresholds to pass. A prerelease may
publish a complete, error-free development run whose thresholds remain failed;
it must not print or record a false evaluation PASS.

The root package is private and must never be published. Do not run
`npm publish ./dist/npm`; publication takes the already validated `.tgz`.
