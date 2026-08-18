import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateReleasePolicy } from
  "../scripts/lib/maintainer-stable-release.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = read(".github/workflows/ci.yml");
const packageJson = JSON.parse(read("package.json"));

test("release kinds are mechanically distinct", () => {
  const standard = validateReleasePolicy(repoRoot, {
    candidateVersion: "1.1.0",
    releaseKind: "stable"
  });
  assert.equal(standard.assurance_lane, "standard-stable");
  assert.equal(standard.evidence_strict_release_supported, false);
  assert.equal(standard.independence_established, false);
  assert.equal(standard.holdout_performance_established, false);
  assert.equal(standard.maintainer_certification_bound, false);
  const prerelease = validateReleasePolicy(repoRoot, {
    candidateVersion: "0.4.0-rc.1",
    releaseKind: "prerelease"
  });
  assert.equal(prerelease.assurance_lane, "prerelease-development");
  assert.equal(prerelease.evidence_strict_release_supported, false);
});

test("retired and cross-lane claims are rejected", () => {
  assert.throws(
    () =>
      validateReleasePolicy(repoRoot, {
        candidateVersion: "1.0.0",
        releaseKind: "maintainer-stable"
      }),
    /release-kind/u
  );
  for (const extra of [
    { expectedCorpusSha256: "a".repeat(64) },
    { signedWaiverSha256: "b".repeat(64) },
    { maintainerCertificationSha256: "c".repeat(64) }
  ]) {
    assert.throws(
      () =>
        validateReleasePolicy(repoRoot, {
          candidateVersion: "1.1.0",
          releaseKind: "stable",
          ...extra
        }),
      /kanon-release-policy/u
    );
  }
});

test("validate-only is the default and publication still requires protected context", () => {
  assert.match(
    workflow,
    /publish:[\s\S]*?default: validate-only[\s\S]*?options:[\s\S]*?- validate-only[\s\S]*?- publish/u
  );
  const requested = validateReleasePolicy(repoRoot, {
    candidateVersion: "1.1.0",
    releaseKind: "stable",
    publicationMode: "publish",
    protectedEnvironment: "npm-publish"
  });
  assert.equal(requested.publication_mode, "publish");
  assert.equal(requested.publication_authorized, false);
  assert.throws(
    () =>
      validateReleasePolicy(repoRoot, {
        candidateVersion: "1.1.0",
        releaseKind: "stable",
        publicationMode: "publish"
      }),
    /protected-environment/u
  );
  assert.match(workflow, /environment: npm-publish/u);
  assert.match(workflow, /KANON_PROTECTED_ENVIRONMENT: npm-publish/u);
});

test("standard stable lane uses package and platform validation without capability claims", () => {
  assert.doesNotMatch(
    workflow,
    /\n  release-eval:|npm run eval:release|expected_corpus_sha256/u
  );
  const development = section(
    "  development-eval:",
    "  release-gate:"
  );
  assert.match(development, /inputs\.release_kind == 'prerelease'/u);
  const gate = section("  release-gate:", "  publish:");
  assert.match(
    gate,
    /inputs\.release_kind == 'stable'[\s\S]*?needs\.development-eval\.result == 'skipped'/u
  );
  assert.match(gate, /needs\.cross-platform-conformance\.result == 'success'/u);
});

test("workflow actions are official and pinned to immutable full commits", () => {
  const actions = Array.from(workflow.matchAll(/^\s*uses:\s*([^\s#]+)/gmu),
    (match) => match[1]);
  assert.ok(actions.length > 0);
  for (const action of actions) {
    assert.match(action, /^actions\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/u);
  }
  assert.ok(
    actions.includes(
      "actions/attest@508db95dd578ae2727ebd6217d5ba78e4fbda05d"
    )
  );
  const pack = section("  pack-candidate:", "  cross-platform-conformance:");
  assert.match(pack, /id-token: write/u);
  assert.match(pack, /attestations: write/u);
  assert.match(pack, /artifact-metadata: write/u);
  assert.match(pack, /subject-path: \$\{\{ steps\.artifact\.outputs\.tarball \}\}/u);
});

test("publication reuses the certified tarball and never rebuilds after approval", () => {
  const publish = workflow.slice(workflow.indexOf("\n  publish:"));
  assert.match(publish, /Download immutable release bundle/u);
  assert.match(publish, /ci-artifact\.js verify/u);
  assert.match(
    publish,
    /npm publish "\$\{\{ steps\.artifact\.outputs\.tarball \}\}"/u
  );
  assert.match(publish, /gh release create[\s\S]*?steps\.artifact\.outputs\.tarball/u);
  assert.doesNotMatch(publish, /npm pack|build:package|build:skill/u);
});

test("security, release, compatibility, limitations, and six skills agree", () => {
  const readme = read("README.md");
  const packaged = read("packaging/README.md");
  const changelog = read("CHANGELOG.md");
  const security = read("SECURITY.md");
  const releasing = read("RELEASING.md");
  const notes = read("docs/releases/v1.1.0.md");
  const skills = ["orient", "resume", "verify", "status", "steer", "aswitch"];
  for (const skill of skills) {
    assert.equal(readme.includes("| `" + skill + "` |"), true);
    assert.match(packaged, new RegExp("`" + skill + "`", "u"));
    assert.match(changelog, new RegExp("`" + skill + "`", "u"));
    assert.match(notes, new RegExp("`" + skill + "`", "u"));
    assert.equal(read(`skills/${skill}/SKILL.md`).includes(`name: ${skill}`), true);
  }
  for (const document of [readme, packaged, changelog, notes]) {
    assert.match(document, /evidence-strict/u);
    assert.match(document, /independence/u);
    assert.match(document, /accepted\s+risks remain open/iu);
  }
  assert.match(security, /private vulnerability-reporting/u);
  assert.match(security, /three business days/u);
  assert.match(security, /coordinated disclosure/u);
  assert.match(security, /advisory and non-enforcing/u);
  assert.match(releasing, /Rollback and deprecation/u);
  assert.match(releasing, /Post-publication verification/u);
  assert.match(releasing, /There is no post-approval build or repack/u);
  assert.match(releasing, /remain Unknown locally/u);
  for (const document of [readme, packaged, notes]) {
    assert.match(document, /Node\.js majors 20, 22,\s+24, and 25/u);
    assert.match(document, /npm install --ignore-scripts/u);
  }
});

test("package metadata and expected inventory are exact and dependency-free", () => {
  const lock = JSON.parse(read("package-lock.json"));
  assert.equal(packageJson.version, "1.1.0");
  assert.equal(lock.version, "1.1.0");
  assert.equal(lock.packages[""].version, "1.1.0");
  assert.equal(JSON.parse(read(".claude-plugin/plugin.json")).version, "1.1.0");
  assert.equal(JSON.parse(read(".codex-plugin/plugin.json")).version, "1.1.0");
  assert.equal(read("src/version.js"), read("runtime/src/version.js"));
  const sourceMetadata = JSON.parse(read("src/v1/build-metadata.json"));
  const runtimeMetadata = JSON.parse(read("runtime/build-metadata.json"));
  assert.deepEqual(sourceMetadata, runtimeMetadata);
  assert.equal(sourceMetadata.package_version, "1.1.0");
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.license, "MIT");
  assert.match(packageJson.repository.url, /^git\+https:\/\/github\.com\//u);
  assert.match(packageJson.homepage, /^https:\/\/github\.com\//u);
  assert.match(packageJson.bugs.url, /^https:\/\/github\.com\//u);
  assert.deepEqual(packageJson.publishConfig, {
    access: "public",
    provenance: true,
    registry: "https://registry.npmjs.org"
  });
  assert.equal(Object.keys(packageJson.dependencies || {}).length, 0);
  assert.equal(Object.keys(packageJson.optionalDependencies || {}).length, 0);
  assert.equal(Object.keys(packageJson.peerDependencies || {}).length, 0);
  const output = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanon-release-inventory-")
  );
  const built = spawnSync(
    process.execPath,
    ["scripts/build-package.js", "--output", output],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 30_000,
      windowsHide: true
    }
  );
  assert.equal(built.status, 0, built.stderr || built.stdout);
  const stagedFiles = listFiles(output);
  assert.equal(stagedFiles.length, 87);
  assert.equal(
    stagedFiles.every((relative) =>
      fs.statSync(path.join(output, relative)).size > 0),
    true
  );
  assert.equal(
    fs.readFileSync(path.join(output, "SECURITY.md"), "utf8"),
    read("SECURITY.md")
  );
  const stagedManifest = JSON.parse(
    fs.readFileSync(path.join(output, "package.json"), "utf8")
  );
  assert.deepEqual(stagedManifest.publishConfig, packageJson.publishConfig);
  assert.equal(stagedManifest.scripts, undefined);
  assert.equal(stagedManifest.dependencies, undefined);
});

function section(start, end) {
  const startIndex = workflow.indexOf(`\n${start}`);
  const endIndex = workflow.indexOf(`\n${end}`, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex);
  return workflow.slice(startIndex, endIndex);
}

function read(relative) {
  return fs.readFileSync(path.join(repoRoot, relative), "utf8");
}

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory()
        ? listFiles(target).map((child) => `${entry.name}/${child}`)
        : [entry.name];
    })
    .sort();
}
