import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  validateCandidateTransitionAuthority
} from "../../v1.0.0-candidate/lib/validator.js";
import {
  validateCandidateEvidence
} from "../../v1.0.0-candidate/lib/evidence-validator.js";
import { runGit } from "../../../src/git-runner.js";

export const CORRECTED_CANDIDATE_ROOT =
  "eval/v1.0.0-candidate-corrected";
export const CORRECTED_TRANSITION_RELATIVE =
  `${CORRECTED_CANDIDATE_ROOT}/TRANSITION.json`;
export const CORRECTED_TRANSITION_SHA256 =
  "67064116b981c49a1f1287465eeb5da628d39be4a0b0ee7bd34ecae89e85b0fc";
export const CORRECTED_CANDIDATE_CONCLUSION =
  "v1.0.0-candidate-corrected-awaiting-remote-revalidation";

const STARTING_HEAD = "c363e2114f16093b04aceeed27709d955e23de18";
const CORRECTION_COMMIT = "750db1b41279b28fbb029edebc71f8f33ff718eb";
const FAILED_EVIDENCE_DIRECTORY =
  "eval/v1.0.0-candidate/" +
  "evidence-sha256-bcd2f528d9501a4a8a6efea53138c8420bad4754042829868d3c25d7a0ced546";
const FAILED_RECORD_SHA256 =
  "65b01a6ce375ce64ca20b6112ac108913563575c04c03dc8e51b9b3e149b88f5";
const FAILED_ARTIFACT_SHA256 =
  "d3f4b58824f6361df4ed07461cff78cf8530352eb353bd37ed2a16f8b953f025";
const CORRECTION_FILES = Object.freeze([
  ".gitattributes",
  ".github/workflows/ci.yml",
  "runtime/bin/kanon-dispatch.ps1",
  "scripts/build-skill.js",
  "scripts/check-maintainer-evidence.js",
  "scripts/lib/artifact-files.js",
  "scripts/lib/maintainer-stable-release.js",
  "scripts/release-bind.js",
  "test/v1-release-candidate-transition.test.js",
  "test/v1-release-corrective.test.js"
]);
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

export function validateCorrectedCandidateTransitionAuthority(repoRoot) {
  const root = path.resolve(repoRoot);
  const bytes = readRegularFile(
    path.join(root, CORRECTED_TRANSITION_RELATIVE),
    256 * 1024
  );
  const digest = sha256(bytes);
  expect(digest === CORRECTED_TRANSITION_SHA256, "transition-hash");
  const transition = JSON.parse(bytes.toString("utf8"));
  validateCorrectedCandidateTransitionValue(transition);
  validatePreservedFailedCandidate(root);
  validateCorrectionCommit(root);
  validateProtectedEvalScope(root);
  validateCurrentPackage(root);
  return { sha256: digest, transition };
}

export function validateCorrectedCandidateTransitionValue(value) {
  expectExactKeys(value, [
    "boundaries",
    "candidate_conclusions",
    "correction",
    "failed_remote_runs",
    "forbidden_changes",
    "next_permissible_action_after_success",
    "permitted_followup_changes",
    "previous_candidate",
    "schema",
    "starting_bindings",
    "status",
    "validation_gates",
    "version"
  ], "transition");
  expect(
    value.schema === "kanon-v1.0.0-candidate-corrective-transition-v1" &&
      value.version === 1 &&
      value.status === "frozen-corrective-source-before-local-certification",
    "identity"
  );
  expect(
    value.starting_bindings.repository ===
      "/Users/mrgreen/Desktop/AI/kanon" &&
      value.starting_bindings.branch === "release/v.1.0.0" &&
      value.starting_bindings.head === STARTING_HEAD &&
      value.starting_bindings.upstream === "origin/release/v.1.0.0" &&
      value.starting_bindings.ahead === 0 &&
      value.starting_bindings.behind === 0 &&
      value.starting_bindings.index === "clean" &&
      value.starting_bindings.worktree === "clean" &&
      value.starting_bindings.package_version === "1.0.0" &&
      value.starting_bindings.runtime_dependency_count === 0 &&
      value.starting_bindings.optional_dependency_count === 0 &&
      value.starting_bindings.peer_dependency_count === 0 &&
      value.starting_bindings.candidate_transition_sha256 ===
        "cae7f7ddbb3c2058a0065a961b2b3b506261fecafdfd51dcef2efe79e4858880" &&
      value.starting_bindings.failed_candidate_evidence_tree_sha256 ===
        "bcd2f528d9501a4a8a6efea53138c8420bad4754042829868d3c25d7a0ced546" &&
      value.starting_bindings.failed_candidate_record_sha256 ===
        FAILED_RECORD_SHA256 &&
      value.starting_bindings.failed_candidate_artifact_sha256 ===
        FAILED_ARTIFACT_SHA256 &&
      value.starting_bindings.signed_waiver_sha256 ===
        "9d0770ce609479eca5f7b27dcb92dad69a287913ed62a236afc4ed5ae499a2a6" &&
      value.starting_bindings.maintainer_certification_sha256 ===
        "017bca4aa2aff3d461a71acde5634b3fccb99b385a24e2500af31813f8f46415" &&
      value.starting_bindings.version_normalized_public_capabilities_sha256 ===
        "bfc00d445cc480389559fd8c115a6ae2607dd6b7241dd0e256565bde5f0256cf",
    "starting-bindings"
  );
  expect(
    value.previous_candidate.source_commit ===
      "9ce62c66bab27acbc1695799e8ef15c54c0ea577" &&
      value.previous_candidate.evidence_commit === STARTING_HEAD &&
      value.previous_candidate.artifact_sha256 === FAILED_ARTIFACT_SHA256 &&
      value.previous_candidate.artifact_bytes === 165141 &&
      value.previous_candidate.artifact_inventory_count === 129 &&
      value.previous_candidate.remote_validation_result === "failed" &&
      value.previous_candidate.supersession ===
        "additive-corrective-candidate-required",
    "failed-candidate"
  );
  expect(
    isDeepStrictEqual(value.failed_remote_runs, [
      { run_id: 30854336699, kind: "pull-request", result: "failed" },
      {
        run_id: 30854377406,
        kind: "maintainer-stable-validate-only",
        result: "failed"
      }
    ]),
    "failed-remote-runs"
  );
  expect(
    value.correction.implementation_commit === CORRECTION_COMMIT &&
      value.correction.parent_commit === STARTING_HEAD &&
      isDeepStrictEqual(value.correction.changed_files, CORRECTION_FILES) &&
      value.correction.corpus_or_holdout_changed === false &&
      value.correction.historical_results_changed === false &&
      value.correction.public_capabilities_broadened === false &&
      value.correction.dependencies_added === false,
    "correction"
  );
  expect(isDeepStrictEqual(value.boundaries, BOUNDARIES), "boundaries");
  expect(
    value.candidate_conclusions.success ===
      CORRECTED_CANDIDATE_CONCLUSION &&
      value.next_permissible_action_after_success ===
        "separately-authorized-single-fast-forward-push-followed-by-exactly-one-maintainer-stable-validate-only-workflow-dispatch",
    "conclusion-and-next-action"
  );
  for (const name of ["forbidden_changes", "validation_gates"]) {
    expect(
      Array.isArray(value[name]) &&
        value[name].length > 0 &&
        new Set(value[name]).size === value[name].length,
      `${name}-inventory`
    );
  }
  return true;
}

function validatePreservedFailedCandidate(root) {
  const priorTransition = validateCandidateTransitionAuthority(root);
  expect(
    priorTransition.sha256 ===
      "cae7f7ddbb3c2058a0065a961b2b3b506261fecafdfd51dcef2efe79e4858880",
    "prior-transition"
  );
  const evidence = validateCandidateEvidence(
    root,
    path.join(root, FAILED_EVIDENCE_DIRECTORY)
  );
  expect(
    evidence.candidate_sha256 === FAILED_RECORD_SHA256 &&
      evidence.evidence_tree_sha256 ===
        "bcd2f528d9501a4a8a6efea53138c8420bad4754042829868d3c25d7a0ced546" &&
      evidence.candidate.artifact.new_sha256 === FAILED_ARTIFACT_SHA256,
    "prior-failed-evidence"
  );
}

function validateCorrectionCommit(root) {
  expect(
    checkedGit(root, ["merge-base", "--is-ancestor", STARTING_HEAD, CORRECTION_COMMIT]) === "",
    "correction-descendant"
  );
  const changed = checkedGit(root, [
    "diff",
    "--name-only",
    `${STARTING_HEAD}..${CORRECTION_COMMIT}`
  ]).trim().split("\n").filter(Boolean);
  expect(isDeepStrictEqual(changed, CORRECTION_FILES), "correction-file-scope");
}

function validateProtectedEvalScope(root) {
  const changed = checkedGit(root, [
    "diff",
    "--name-only",
    `${STARTING_HEAD}..HEAD`,
    "--",
    "eval"
  ]).trim().split("\n").filter(Boolean);
  expect(
    changed.every((relative) =>
      relative.startsWith(`${CORRECTED_CANDIDATE_ROOT}/`)
    ),
    "protected-eval-scope"
  );
}

function validateCurrentPackage(root) {
  const value = JSON.parse(
    readRegularFile(path.join(root, "package.json"), 1024 * 1024)
  );
  expect(
    value.version === "1.0.0" &&
      Object.keys(value.dependencies || {}).length === 0 &&
      Object.keys(value.optionalDependencies || {}).length === 0 &&
      Object.keys(value.peerDependencies || {}).length === 0,
    "package-state"
  );
}

function checkedGit(root, args) {
  const result = runGit(root, args, {
    maxOutputBytes: 8 * 1024 * 1024,
    noLazyFetch: true,
    timeoutMs: 10_000
  });
  expect(result.ok, `git-${args[0]}`);
  return result.stdout;
}

function readRegularFile(file, maximumBytes) {
  const stat = fs.lstatSync(file);
  expect(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.nlink === 1 &&
      stat.size > 0 &&
      stat.size <= maximumBytes,
    `regular-file-${file}`
  );
  return fs.readFileSync(file);
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
    throw new Error(`v1.0.0-candidate-corrected-transition:${label}`);
  }
}
