# Releasing Kanon

Kanon releases one exact package tarball. Candidate validation and publication
are separate actions, and every manual workflow dispatch defaults to
`validate-only`.

## Release lanes

- `prerelease` requires a prerelease semantic version and records the complete
  visible development-corpus result without making a held-out claim.
- `stable` is the normal release lane. It requires the full Node/OS test matrix,
  deterministic package staging, one attested tarball, installed-artifact
  conformance on Ubuntu, Windows, and macOS, and the protected publication job.
  It makes no evidence-strict, independence, blinded-review, causal-improvement,
  generalization, official-holdout, or independent-validation claim.
The retired `maintainer-stable` evidence is retained as immutable historical
data for v1.0.0, but that lane is no longer selectable.

Selecting `publish` is not sufficient publication authority. The publication
job also requires the `npm-publish` protected environment and revalidates the
exact candidate commit, version, release kind, tarball, and checksum after
approval.

## Prepare a candidate

1. Start from a clean branch based on current `main`.
2. Synchronize the release version with
   `npm run sync:version -- <exact-version>`.
3. Update `CHANGELOG.md`, the matching file under `docs/releases/`, and any
   version-specific support text.
4. Run `npm run validate` and `git diff --check`.
5. Build twice into separate empty temporary directories with
   `npm run build:package -- --output <directory>`.
6. Pack both staging trees with lifecycle scripts disabled and a task-local npm
   cache. Require byte-for-byte equal tarballs.
7. Install and exercise the exact tarball in a fresh path containing spaces, and
   run an offline publish dry-run against that same tarball.
8. Commit and push the candidate, then require a clean worktree.

The root package is private and must never be published. Staging is built from
the explicit allowlist in `scripts/build-package.js`. Do not run
`npm publish ./dist/npm`; publication receives the already packed `.tgz`.

## Validate remotely

Dispatch the CI workflow in `validate-only` mode with the full candidate
commit, exact version, release kind, and precomputed tarball SHA-256.

The workflow checks out that exact commit, installs locked development
dependencies without lifecycle scripts, runs the supported Node versions on
Linux, Windows, and macOS, builds and packs once, verifies the supplied hash,
creates GitHub build provenance, and exercises the same tarball on all three
operating systems. The release gate then creates an immutable bundle containing
the tarball, checksum, conformance reports, and release manifest.

The standard stable lane validates packaging and runtime compatibility. It does
not execute or claim a capability holdout.

## Publish the frozen artifact

Publication is a later transaction after the validate-only run passes. Dispatch
the same candidate and hash with `publish` selected. The protected job:

1. revalidates the exact candidate and release lane;
2. downloads the immutable release bundle;
3. verifies the exact `.tgz` and `.sha256` sidecar;
4. publishes that unchanged tarball through npm trusted publishing/OIDC;
5. creates a tag bound to the candidate commit; and
6. creates the GitHub release from the same tarball and checksum.

There is no post-approval build or repack. npm provenance remains enabled in
the public package metadata.

## Rollback and deprecation

Published npm versions and Git tags are immutable and are never overwritten or
moved. If a release is defective or compromised:

1. stop promotion and preserve the failed evidence;
2. advise users to pin the prior known-good version when appropriate;
3. deprecate the affected npm version with a concise migration or security
   message when registry access is explicitly authorized;
4. mark the GitHub release and security advisory consistently without replacing
   assets; and
5. publish a new patch through the same release process.

Unpublishing is not the normal rollback mechanism.

## Post-publication verification

After publication, verify without rebuilding:

- the registry version, dist-tag, metadata, deprecation state, and dependency
  counts;
- the registry tarball SHA-256 against the certified candidate hash;
- the Git tag target against the candidate commit;
- the GitHub release assets and checksum;
- npm provenance and GitHub artifact attestation;
- installation and wrapper conformance from the registry tarball; and
- rendered release notes, security policy, compatibility, and limitations.

Record discrepancies and stop. Do not rebuild or replace artifacts.

## Remote settings that remain Unknown locally

Until verified remotely, the protected-environment review rules, repository
token permissions, immutable-release settings, npm trusted-publisher mapping,
tag protection, registry policy, and native GitHub-hosted platform results
remain Unknown locally.
