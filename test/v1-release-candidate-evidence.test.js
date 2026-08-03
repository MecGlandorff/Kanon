import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CANDIDATE_CONCLUSION,
  candidateEvidenceDirectories,
  validateCandidateEvidence,
  validateCandidateEvidenceValue
} from "../eval/v1.0.0-candidate/lib/evidence-validator.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("candidate evidence namespace is additive and content-addressed", () => {
  const directories = candidateEvidenceDirectories(repoRoot);
  assert.ok(directories.length <= 1);
  if (directories.length === 1) {
    const validated = validateCandidateEvidence(repoRoot, directories[0]);
    assert.equal(validated.candidate.conclusion, CANDIDATE_CONCLUSION);
    assert.match(validated.evidence_tree_sha256, /^[0-9a-f]{64}$/u);
  }
});

test("candidate evidence rejects publication and assurance overclaims", () => {
  const directories = candidateEvidenceDirectories(repoRoot);
  if (directories.length === 0) {
    return;
  }
  const original = validateCandidateEvidence(repoRoot, directories[0]).candidate;
  for (const mutate of [
    (value) => {
      value.boundaries.publication_authorized = true;
    },
    (value) => {
      value.boundaries.release_action_occurred = true;
    },
    (value) => {
      value.boundaries.evidence_strict_release_supported = true;
    },
    (value) => {
      value.boundaries.independence_established = true;
    },
    (value) => {
      value.boundaries.holdout_performance_established = true;
    },
    (value) => {
      value.capabilities.unchanged = false;
    },
    (value) => {
      value.dependencies.runtime = 1;
    }
  ]) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.throws(
      () => validateCandidateEvidenceValue(changed),
      /v1\.0\.0-candidate-evidence/u
    );
  }
});
