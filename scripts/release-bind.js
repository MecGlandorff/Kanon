#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { atomicWriteContained } from "../src/persistence/safe-fs.js";
import { resolveContainedPath } from "../src/path-security.js";
import { safeJsonStringify } from "../src/trust.js";
import { validateDevelopmentReport } from "./lib/development-report.js";

const options = parseArgs(process.argv.slice(2));
const bundle = canonicalDirectory(options.bundle);
const tarball = oneFile(bundle, (name) => name.endsWith(".tgz"), "tarball");
const artifactSha256 = sha256File(tarball.path);
if (artifactSha256 !== options.artifactSha256) {
  throw new Error("Release bundle artifact hash does not match the candidate.");
}

const conformance = filesMatching(
  bundle,
  (name) => /^conformance-.*\.json$/.test(name)
).map(readJsonFile);
if (conformance.length < 3) {
  throw new Error("Release binding requires conformance from three platforms.");
}
for (const report of conformance) {
  if (
    !report.value.passed ||
    report.value.artifact_sha256 !== artifactSha256 ||
    report.value.candidate_commit !== options.candidateCommit ||
    report.value.candidate_version !== options.candidateVersion
  ) {
    throw new Error(`Conformance binding failed for ${report.path}.`);
  }
}

const development = readNamedReport(
  bundle,
  "development-eval.json"
);
const developmentValidation = validateDevelopmentReport(development.value, {
  candidateCommit: options.candidateCommit,
  candidateVersion: options.candidateVersion,
  requireThresholdPass: options.releaseKind === "stable"
});
const release = optionalNamedReport(bundle, "release-eval.json");
if (options.releaseKind === "stable") {
  if (options.candidateVersion.includes("-")) {
    throw new Error("Stable release kind requires a stable semantic version.");
  }
  validateReleaseEvaluation(release?.value, options, artifactSha256);
} else {
  if (!options.candidateVersion.includes("-")) {
    throw new Error("Prerelease kind requires a prerelease version.");
  }
  if (release) {
    throw new Error(
      "A prerelease no-holdout bundle must not imply a held-out result."
    );
  }
}

const manifest = {
  schema: "kanon-release-binding-v2",
  generated_at: new Date().toISOString(),
  release_kind: options.releaseKind,
  candidate_commit: options.candidateCommit,
  candidate_version: options.candidateVersion,
  tag: `v${options.candidateVersion}`,
  artifact_sha256: artifactSha256,
  artifact_file: path.basename(tarball.path),
  development_corpus_sha256:
    development.value.corpus.manifest_sha256,
  development_execution_complete:
    developmentValidation.execution_complete,
  development_thresholds_passed:
    developmentValidation.thresholds_passed,
  development_analysis_error_count:
    developmentValidation.analysis_error_count,
  development_incomplete_scan_count:
    developmentValidation.incomplete_scan_count,
  development_threshold_failures:
    developmentValidation.failures,
  release_corpus_sha256:
    release?.value.corpus.manifest_sha256 || null,
  reports: [
    ...conformance,
    development,
    ...(release ? [release] : [])
  ].map((report) => ({
    path: path.basename(report.path),
    sha256: report.sha256
  })),
  held_out_capability_estimate_claimed:
    options.releaseKind === "stable",
  prerelease_notice:
    options.releaseKind === "prerelease"
      ? "No held-out capability estimate is claimed for this prerelease."
      : null
};
atomicWriteContained(
  bundle,
  "release-manifest.json",
  `${safeJsonStringify(manifest)}\n`
);
process.stdout.write(`${safeJsonStringify(manifest)}\n`);

function validateReleaseEvaluation(run, input, artifactSha256) {
  if (!run?.summary?.passed || !run?.final?.passed) {
    throw new Error("The complete held-out release corpus did not pass.");
  }
  if (
    run.candidate?.commit !== input.candidateCommit ||
    run.candidate?.version !== input.candidateVersion ||
    run.artifact?.sha256 !== artifactSha256 ||
    run.artifact?.conformance?.passed !== true
  ) {
    throw new Error("Release evaluation identity does not match the artifact.");
  }
  if (
    run.corpus.selected_case_count !== run.corpus.total_case_count ||
    run.summary.case_count !== run.summary.expected_case_count
  ) {
    throw new Error("Release evaluation was partial.");
  }
}

function parseArgs(argv) {
  const output = {};
  const flags = new Map([
    ["--bundle", "bundle"],
    ["--candidate-commit", "candidateCommit"],
    ["--candidate-version", "candidateVersion"],
    ["--artifact-sha256", "artifactSha256"],
    ["--release-kind", "releaseKind"]
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const field = flags.get(argv[index]);
    if (!field || !argv[index + 1]) {
      throw new Error(`Unknown or incomplete option: ${argv[index]}`);
    }
    output[field] = argv[++index];
  }
  for (const field of flags.values()) {
    if (!output[field]) {
      throw new Error(`Missing release-binding field: ${field}`);
    }
  }
  if (!/^[0-9a-f]{40}$/.test(output.candidateCommit)) {
    throw new Error("Candidate commit must be a full Git SHA.");
  }
  if (!/^[0-9a-f]{64}$/.test(output.artifactSha256)) {
    throw new Error("Artifact SHA-256 must be lowercase hex.");
  }
  if (!["stable", "prerelease"].includes(output.releaseKind)) {
    throw new Error("Release kind must be stable or prerelease.");
  }
  return output;
}

function canonicalDirectory(value) {
  const result = resolveContainedPath(value, ".", {
    allowRoot: true,
    type: "directory"
  });
  if (!result.ok) {
    throw new Error(`Unsafe release bundle: ${result.reason}`);
  }
  return result.path;
}

function oneFile(root, predicate, label) {
  const files = filesMatching(root, predicate);
  if (files.length !== 1) {
    throw new Error(`Expected exactly one ${label}, found ${files.length}.`);
  }
  return files[0];
}

function filesMatching(root, predicate) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && predicate(entry.name))
    .map((entry) => {
      const result = resolveContainedPath(root, entry.name, { type: "file" });
      if (!result.ok) {
        throw new Error(`Unsafe bundle file ${entry.name}: ${result.reason}`);
      }
      return result;
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

function readNamedReport(root, name) {
  const file = resolveContainedPath(root, name, { type: "file" });
  if (!file.ok) {
    throw new Error(`Missing release report ${name}: ${file.reason}`);
  }
  return readJsonFile(file);
}

function optionalNamedReport(root, name) {
  const file = resolveContainedPath(root, name, { type: "file" });
  return file.ok ? readJsonFile(file) : null;
}

function readJsonFile(file) {
  if (file.stat.size > 16 * 1024 * 1024) {
    throw new Error(`Release report is too large: ${file.path}`);
  }
  return {
    path: file.path,
    sha256: sha256File(file.path),
    value: JSON.parse(fs.readFileSync(file.path, "utf8"))
  };
}

function sha256File(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}
