import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { canonicalJson } from "../../../scripts/lib/v1-prospective-release.js";
import { TRANSITION_SHA256 } from "./validator.js";

export const CANDIDATE_EVIDENCE_SCHEMA =
  "kanon-v1.0.0-candidate-evidence-v1";
export const CANDIDATE_TREE_SCHEMA =
  "kanon-v1.0.0-candidate-evidence-tree-v1";
export const CANDIDATE_CONCLUSION =
  "v1.0.0-candidate-prepared-awaiting-remote-validation";

const CANDIDATE_ROOT = "eval/v1.0.0-candidate";
const HASH = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const BOUNDARIES = Object.freeze({
  publication_authorized: false,
  release_action_occurred: false,
  evidence_strict_release_supported: false,
  independence_established: false,
  holdout_performance_established: false
});

export function candidateEvidenceDirectories(repoRoot) {
  const root = path.join(path.resolve(repoRoot), CANDIDATE_ROOT);
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.isSymbolicLink() &&
        /^evidence-sha256-[0-9a-f]{64}$/u.test(entry.name)
    )
    .map((entry) => path.join(root, entry.name))
    .sort();
}

export function validateCandidateEvidence(repoRoot, evidenceDirectory) {
  const root = path.resolve(repoRoot);
  const directory = path.resolve(evidenceDirectory);
  expect(
    directory.startsWith(`${path.join(root, CANDIDATE_ROOT)}${path.sep}`),
    "evidence-containment"
  );
  const stat = fs.lstatSync(directory);
  expect(stat.isDirectory() && !stat.isSymbolicLink(), "evidence-directory");
  expect(
    isDeepStrictEqual(fs.readdirSync(directory).sort(), [
      "candidate.json",
      "complete-tree-commitment.json"
    ]),
    "evidence-inventory"
  );
  const candidate = loadJson(directory, "candidate.json", 4 * 1024 * 1024);
  const tree = loadJson(
    directory,
    "complete-tree-commitment.json",
    1024 * 1024
  );
  validateCandidateEvidenceValue(candidate.value);
  expectExactKeys(tree.value, [
    "files",
    "schema",
    "semantic_sha256",
    "version"
  ], "tree");
  const files = [{ path: "candidate.json", sha256: candidate.sha256 }];
  expect(
    tree.value.schema === CANDIDATE_TREE_SCHEMA &&
      tree.value.version === 1 &&
      isDeepStrictEqual(tree.value.files, files),
    "tree-files"
  );
  const semantic = sha256(
    Buffer.from(
      `${canonicalJson({
        files,
        schema: CANDIDATE_TREE_SCHEMA,
        version: 1
      })}\n`
    )
  );
  expect(
    tree.value.semantic_sha256 === semantic &&
      path.basename(directory) === `evidence-sha256-${semantic}`,
    "semantic-tree"
  );
  return {
    candidate: candidate.value,
    candidate_sha256: candidate.sha256,
    evidence_tree_sha256: semantic
  };
}

export function validateCandidateEvidenceValue(value) {
  expectExactKeys(value, [
    "artifact",
    "artifact_differences",
    "bindings",
    "boundaries",
    "capabilities",
    "conclusion",
    "dependencies",
    "historical_preservation",
    "next_permissible_action",
    "remaining_risks",
    "remote_checks_required",
    "schema",
    "validation",
    "version"
  ], "candidate");
  expect(
    value.schema === CANDIDATE_EVIDENCE_SCHEMA &&
      value.version === 1 &&
      value.conclusion === CANDIDATE_CONCLUSION,
    "candidate-identity"
  );
  expect(isDeepStrictEqual(value.boundaries, BOUNDARIES), "boundaries");
  expect(
    value.bindings.branch === "release/v.1.0.0" &&
      value.bindings.starting_head ===
        "134c6d268784e285a96cb445889c40573ff846d0" &&
      value.bindings.transition_authority_sha256 === TRANSITION_SHA256 &&
      value.bindings.signed_waiver_sha256 ===
        "9d0770ce609479eca5f7b27dcb92dad69a287913ed62a236afc4ed5ae499a2a6" &&
      value.bindings.prior_certification_sha256 ===
        "017bca4aa2aff3d461a71acde5634b3fccb99b385a24e2500af31813f8f46415" &&
      value.bindings.prior_certification_evidence_tree_sha256 ===
        "49b1ee409f32eabaa6558f794c1199f3d3595635d1252ab6600ace375ecd9de8" &&
      COMMIT.test(value.bindings.candidate_source_commit) &&
      value.bindings.package_version === "1.0.0" &&
      HASH.test(value.bindings.package_json_sha256) &&
      HASH.test(value.bindings.package_lock_sha256),
    "bindings"
  );
  expect(
    value.artifact.old_sha256 ===
      "0f87af4dfd851c268891c96237accf20b5089b0e0b95e10ac1417efebcca83a9" &&
      HASH.test(value.artifact.new_sha256) &&
      value.artifact.new_sha256 !== value.artifact.old_sha256 &&
      value.artifact.byte_identical_packs === true &&
      value.artifact.inventory_count === 129 &&
      Number.isSafeInteger(value.artifact.packed_bytes) &&
      value.artifact.packed_bytes > 0 &&
      Number.isSafeInteger(value.artifact.unpacked_bytes) &&
      value.artifact.unpacked_bytes > 0 &&
      Array.isArray(value.artifact.inventory) &&
      value.artifact.inventory.length === value.artifact.inventory_count &&
      value.artifact.inventory.every(validInventoryEntry),
    "artifact"
  );
  expect(
    Array.isArray(value.artifact_differences) &&
      value.artifact_differences.length > 0 &&
      value.artifact_differences.every(validDifference),
    "artifact-differences"
  );
  expect(
    value.dependencies.runtime === 0 &&
      value.dependencies.optional === 0 &&
      value.dependencies.peer === 0,
    "dependencies"
  );
  expect(
    value.capabilities.baseline_sha256 ===
      "bfc00d445cc480389559fd8c115a6ae2607dd6b7241dd0e256565bde5f0256cf" &&
      value.capabilities.normalized_candidate_sha256 ===
        value.capabilities.baseline_sha256 &&
      value.capabilities.unchanged === true,
    "capabilities"
  );
  expect(
    value.historical_preservation.protected_trees_unchanged === true &&
      value.historical_preservation.mutated_files.length === 0 &&
      value.historical_preservation
        .withdrawn_package_declarations_correction_remains_withdrawn === true,
    "historical-preservation"
  );
  for (const count of Object.values(value.validation)) {
    expect(
      count &&
        Number.isSafeInteger(count.passed) &&
        count.passed > 0 &&
        Number.isSafeInteger(count.failed) &&
        count.failed === 0 &&
        Number.isSafeInteger(count.skipped) &&
        count.skipped >= 0,
      "validation-count"
    );
  }
  expect(
    value.remaining_risks.accepted_risks_remain_open === true &&
      value.remaining_risks.p0.length === 0 &&
      value.remaining_risks.p1.length === 0 &&
      Array.isArray(value.remaining_risks.p2),
    "remaining-risks"
  );
  expect(
    Array.isArray(value.remote_checks_required) &&
      value.remote_checks_required.length > 0 &&
      value.next_permissible_action ===
        "separately-authorized-push-and-validate-only-remote-ci-for-the-frozen-v1.0.0-candidate",
    "remote-boundary"
  );
  return true;
}

function validInventoryEntry(entry) {
  return (
    entry &&
    typeof entry.path === "string" &&
    entry.path.length > 0 &&
    HASH.test(entry.sha256) &&
    Number.isSafeInteger(entry.bytes) &&
    entry.bytes >= 0
  );
}

function validDifference(entry) {
  return (
    entry &&
    typeof entry.path === "string" &&
    entry.path.length > 0 &&
    ["added-security-document", "release-documentation", "version-metadata", "version-derived-integrity"].includes(
      entry.classification
    ) &&
    (entry.old_sha256 === null || HASH.test(entry.old_sha256)) &&
    (entry.new_sha256 === null || HASH.test(entry.new_sha256))
  );
}

function loadJson(directory, name, maximumBytes) {
  const file = path.join(directory, name);
  const stat = fs.lstatSync(file);
  expect(
    stat.isFile() && !stat.isSymbolicLink() && stat.size <= maximumBytes,
    `bounded-file-${name}`
  );
  const bytes = fs.readFileSync(file);
  return {
    sha256: sha256(bytes),
    value: JSON.parse(bytes.toString("utf8"))
  };
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function expectExactKeys(value, keys, label) {
  expect(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort()),
    `${label}-keys`
  );
}

function expect(condition, label) {
  if (!condition) {
    throw new Error(`v1.0.0-candidate-evidence:${label}`);
  }
}
