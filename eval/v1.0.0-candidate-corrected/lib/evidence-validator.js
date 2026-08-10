import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { canonicalJson } from "../../../scripts/lib/v1-prospective-release.js";
import {
  CORRECTED_CANDIDATE_CONCLUSION,
  CORRECTED_CANDIDATE_ROOT,
  CORRECTED_TRANSITION_SHA256,
  validateCorrectedCandidateTransitionAuthority
} from "./validator.js";

export const CORRECTED_EVIDENCE_SCHEMA =
  "kanon-v1.0.0-candidate-corrected-evidence-v1";
export const CORRECTED_TREE_SCHEMA =
  "kanon-v1.0.0-candidate-corrected-evidence-tree-v1";

const HASH = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const FAILED_ARTIFACT_SHA256 =
  "d3f4b58824f6361df4ed07461cff78cf8530352eb353bd37ed2a16f8b953f025";
const CAPABILITY_SHA256 =
  "bfc00d445cc480389559fd8c115a6ae2607dd6b7241dd0e256565bde5f0256cf";
const BOUNDARIES = Object.freeze({
  publication_authorized: false,
  release_action_occurred: false,
  evidence_strict_release_supported: false,
  independence_established: false,
  holdout_performance_established: false,
  accepted_risks_remain_open: true,
  previous_remote_validation_result: "failed",
  corpus_execution_occurred: false,
  holdout_execution_occurred: false
});

export function correctedEvidenceDirectories(repoRoot) {
  const root = path.join(path.resolve(repoRoot), CORRECTED_CANDIDATE_ROOT);
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) =>
      entry.isDirectory() &&
      !entry.isSymbolicLink() &&
      /^evidence-sha256-[0-9a-f]{64}$/u.test(entry.name)
    )
    .map((entry) => path.join(root, entry.name))
    .sort();
}

export function validateCorrectedCandidateEvidence(repoRoot, evidenceDirectory) {
  const root = path.resolve(repoRoot);
  const directory = path.resolve(evidenceDirectory);
  validateCorrectedCandidateTransitionAuthority(root);
  expect(
    directory.startsWith(
      `${path.join(root, CORRECTED_CANDIDATE_ROOT)}${path.sep}`
    ),
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
  const candidate = loadJson(directory, "candidate.json", 8 * 1024 * 1024);
  const tree = loadJson(
    directory,
    "complete-tree-commitment.json",
    1024 * 1024
  );
  validateCorrectedCandidateEvidenceValue(candidate.value);
  const files = [{ path: "candidate.json", sha256: candidate.sha256 }];
  expectExactKeys(tree.value, [
    "files",
    "schema",
    "semantic_sha256",
    "version"
  ], "tree");
  expect(
    tree.value.schema === CORRECTED_TREE_SCHEMA &&
      tree.value.version === 1 &&
      isDeepStrictEqual(tree.value.files, files),
    "tree-files"
  );
  const semantic = sha256(Buffer.from(
    `${canonicalJson({
      files,
      schema: CORRECTED_TREE_SCHEMA,
      version: 1
    })}\n`
  ));
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

export function validateCorrectedCandidateEvidenceValue(value) {
  expectExactKeys(value, [
    "artifact",
    "artifact_differences",
    "bindings",
    "boundaries",
    "capabilities",
    "conclusion",
    "dependencies",
    "historical_preservation",
    "installed_conformance",
    "next_permissible_action",
    "remaining_risks",
    "remote_failures",
    "root_causes",
    "schema",
    "validation",
    "version"
  ], "candidate");
  expect(
    value.schema === CORRECTED_EVIDENCE_SCHEMA &&
      value.version === 1 &&
      value.conclusion === CORRECTED_CANDIDATE_CONCLUSION,
    "identity"
  );
  expect(isDeepStrictEqual(value.boundaries, BOUNDARIES), "boundaries");
  expect(
    value.bindings.branch === "release/v.1.0.0" &&
      value.bindings.starting_head ===
        "c363e2114f16093b04aceeed27709d955e23de18" &&
      value.bindings.correction_commit ===
        "750db1b41279b28fbb029edebc71f8f33ff718eb" &&
      COMMIT.test(value.bindings.freeze_commit) &&
      value.bindings.transition_sha256 === CORRECTED_TRANSITION_SHA256 &&
      value.bindings.failed_candidate_evidence_tree_sha256 ===
        "bcd2f528d9501a4a8a6efea53138c8420bad4754042829868d3c25d7a0ced546" &&
      value.bindings.failed_candidate_record_sha256 ===
        "65b01a6ce375ce64ca20b6112ac108913563575c04c03dc8e51b9b3e149b88f5" &&
      value.bindings.signed_waiver_sha256 ===
        "9d0770ce609479eca5f7b27dcb92dad69a287913ed62a236afc4ed5ae499a2a6" &&
      value.bindings.maintainer_certification_sha256 ===
        "017bca4aa2aff3d461a71acde5634b3fccb99b385a24e2500af31813f8f46415" &&
      value.bindings.package_version === "1.0.0" &&
      HASH.test(value.bindings.package_json_sha256) &&
      HASH.test(value.bindings.package_lock_sha256),
    "bindings"
  );
  expect(
    value.artifact.previous_failed_sha256 === FAILED_ARTIFACT_SHA256 &&
      value.artifact.previous_failed_bytes === 165141 &&
      value.artifact.new_sha256 !== FAILED_ARTIFACT_SHA256 &&
      HASH.test(value.artifact.new_sha256) &&
      value.artifact.byte_identical_packs === true &&
      value.artifact.inventory_count === 129 &&
      Number.isSafeInteger(value.artifact.packed_bytes) &&
      value.artifact.packed_bytes > 0 &&
      Number.isSafeInteger(value.artifact.unpacked_bytes) &&
      value.artifact.unpacked_bytes > 0 &&
      Array.isArray(value.artifact.inventory) &&
      value.artifact.inventory.length === 129 &&
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
    value.capabilities.baseline_sha256 === CAPABILITY_SHA256 &&
      value.capabilities.normalized_candidate_sha256 === CAPABILITY_SHA256 &&
      value.capabilities.unchanged === true,
    "capabilities"
  );
  expect(
    value.historical_preservation.protected_eval_mutations.length === 0 &&
      value.historical_preservation.previous_candidate_unchanged === true &&
      value.historical_preservation.waiver_unchanged === true &&
      value.historical_preservation.certification_unchanged === true,
    "historical-preservation"
  );
  expect(
    value.installed_conformance.passed === true &&
      value.installed_conformance.offline_install === true &&
      value.installed_conformance.path_contained_spaces === true &&
      value.installed_conformance.artifact_sha256 === value.artifact.new_sha256,
    "installed-conformance"
  );
  expect(
    isDeepStrictEqual(value.remote_failures, [
      { run_id: 30854336699, kind: "pull-request", result: "failed" },
      {
        run_id: 30854377406,
        kind: "maintainer-stable-validate-only",
        result: "failed"
      }
    ]),
    "remote-failures"
  );
  expect(
    Array.isArray(value.root_causes) &&
      value.root_causes.length === 4 &&
      value.root_causes.every((entry) =>
        typeof entry.failure_class === "string" &&
        typeof entry.correction === "string" &&
        entry.failure_class.length > 0 &&
        entry.correction.length > 0
      ),
    "root-causes"
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
      value.remaining_risks.previous_remote_validation_remains_failed === true &&
      Array.isArray(value.remaining_risks.unknown_remote_checks) &&
      value.remaining_risks.unknown_remote_checks.length > 0,
    "remaining-risks"
  );
  expect(
    value.next_permissible_action ===
      "separately-authorized-single-fast-forward-push-followed-by-exactly-one-maintainer-stable-validate-only-workflow-dispatch",
    "next-action"
  );
  return true;
}

function validInventoryEntry(entry) {
  return entry &&
    typeof entry.path === "string" &&
    entry.path.length > 0 &&
    HASH.test(entry.sha256) &&
    Number.isSafeInteger(entry.bytes) &&
    entry.bytes >= 0;
}

function validDifference(entry) {
  return entry &&
    typeof entry.path === "string" &&
    entry.path.length > 0 &&
    ["powershell-wrapper", "version-derived-integrity"].includes(
      entry.classification
    ) &&
    HASH.test(entry.old_sha256) &&
    HASH.test(entry.new_sha256) &&
    entry.old_sha256 !== entry.new_sha256;
}

function loadJson(directory, name, maximumBytes) {
  const file = path.join(directory, name);
  const stat = fs.lstatSync(file);
  expect(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.nlink === 1 &&
      stat.size > 0 &&
      stat.size <= maximumBytes,
    `bounded-file-${name}`
  );
  const bytes = fs.readFileSync(file);
  return {
    sha256: sha256(bytes),
    value: JSON.parse(bytes.toString("utf8"))
  };
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

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function expect(condition, label) {
  if (!condition) {
    throw new Error(`v1.0.0-candidate-corrected-evidence:${label}`);
  }
}
