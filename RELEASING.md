# Releasing Kanon

Kanon releases are immutable evidence bundles. A version tag alone is not a
release decision. Candidate preparation, remote validation, and publication are
separate authorizations.

## Release lanes

The workflow has three non-interchangeable release kinds:

- `prerelease` requires a prerelease semantic version, executes the complete
  development corpus, and makes no held-out capability claim.
- `stable` is the existing evidence-strict lane. It requires a stable semantic
  version, an independently frozen sealed holdout commitment, the one-shot
  holdout run, and every existing stable gate. It accepts no maintainer-waiver
  claim.
- `maintainer-stable` is limited to v1.0.0 and the exact signed waiver and
  maintainer-certification commitments frozen by the candidate transition. It
  accepts no holdout commitment and makes no evidence-strict, independence,
  blinded-review, causal-improvement, generalization, or official-holdout claim.

Every manual dispatch defaults to `validate-only`. Selecting `publish` is not
candidate authority: the publication job also requires the `npm-publish`
protected environment and revalidates the exact candidate commit, version,
release kind, commitments, tarball, and checksum after approval.

## Freeze a local candidate

1. Verify the authorized branch, starting commit, upstream relation, certified
   inputs, and worktree boundary without fetching.
2. Freeze and commit the candidate-transition authority before changing version,
   workflow, release documentation, or package metadata.
3. Synchronize the exact version with `npm run sync:version -- 1.0.0`, then run
   `npm run check:version` and `npm run check:skill`.
4. Run focused release tests, `npm run validate`, checked-JavaScript validation,
   syntax/JSON checks, and `git diff --check`.
5. Build twice into separate empty temporary directories with
   `npm run build:package -- --output <directory>`.
6. Pack each staging tree with lifecycle scripts disabled and a task-local npm
   cache. Require byte-for-byte equal tarballs and the exact expected inventory.
7. Install the exact tarball into a new empty path containing spaces, run
   installed-artifact conformance, and perform an offline publish dry-run against
   that same tarball.
8. Record additive content-addressed candidate evidence, commit it, and require a
   clean worktree. Do not tag, publish, or dispatch remote CI.

The root package is private and must never be published. Staging is built from
the explicit allowlist in `scripts/build-package.js`. Do not run
`npm publish ./dist/npm`; publication receives the already packed `.tgz`.

## Validate remotely

The next separately authorized action is a push followed by a validate-only
workflow dispatch bound to the full candidate commit, exact version, release
kind, precomputed tarball SHA-256, and lane-specific commitments.

The workflow checks out the exact commit, installs locked development
dependencies without lifecycle scripts, runs the Node/OS validation matrix,
builds and packs once, verifies the supplied hash, creates official GitHub build
provenance for the exact tarball, exercises that tarball on Ubuntu, Windows, and
macOS, executes required development gates, and creates an immutable release
bundle. Only the evidence-strict `stable` lane executes the sealed holdout.

Do not dispatch twice to repair a consumed one-shot holdout. A failed or
inconclusive lane remains failed or inconclusive under its governing protocol.

## Publish the frozen artifact

Publication is a later, separate transaction after validate-only remote checks
pass and remote settings are verified. The protected job:

1. checks out the exact candidate and revalidates its identity and lane;
2. downloads the immutable release bundle produced by validation;
3. verifies the exact `.tgz` and `.sha256` sidecar;
4. publishes that unchanged tarball through npm trusted publishing/OIDC;
5. creates an immutable candidate-bound tag; and
6. creates the GitHub release from the same tarball and checksum.

There is no post-approval build or repack. The npm and GitHub release assets must
be the already certified bytes. The trusted publisher requires a GitHub-hosted
runner, `id-token: write`, a matching repository/workflow/environment
configuration, and a compatible npm CLI. npm provenance remains enabled in the
public package metadata.

## Rollback and deprecation

Published npm versions and Git tags are immutable and are never overwritten or
moved. If a release is defective or compromised:

1. stop any further promotion and preserve the failed evidence;
2. assess whether users should pin the prior known-good exact version;
3. deprecate the affected npm version with a concise migration or security
   message when registry access is explicitly authorized;
4. mark the GitHub release and security advisory consistently without replacing
   its assets;
5. prepare a new patch candidate through the complete applicable lane; and
6. publish the new version only through another explicit transaction.

Unpublishing is not the normal rollback mechanism. Use it only when npm policy,
legal requirements, or a severe security incident requires it and the action is
separately authorized. Never delete candidate or release evidence to make a
rollback appear clean.

## Post-publication verification

After publication, verify without rebuilding:

- the registry version, dist-tag, repository metadata, deprecation state, and
  dependency counts;
- the registry tarball's SHA-256 against the certified candidate hash;
- the Git tag target against the exact candidate commit;
- the GitHub release assets against the certified `.tgz` and checksum;
- npm provenance and the GitHub artifact attestation against the repository,
  workflow, commit, and subject digest;
- installation and wrapper conformance from the registry tarball in a fresh path;
  and
- release notes, security policy, compatibility, and limitations as rendered on
  npm and GitHub.

Record discrepancies and stop. Do not rebuild or silently replace artifacts.

## Remote settings that remain Unknown locally

Until verified through read-only remote inspection or the authorized remote
phase, treat all of the following as Unknown:

- required reviewers and protection on the `npm-publish` environment;
- repository workflow and token permissions;
- GitHub artifact-attestation availability and immutable-release settings;
- tag protection/rulesets and release-asset permissions;
- npm trusted-publisher repository, workflow filename, environment, and allowed
  operation;
- npm token restrictions, 2FA, provenance eligibility, dist-tag, and package
  access; and
- native GitHub-hosted Windows, Linux, and macOS results.
