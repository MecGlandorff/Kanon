import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  correctedEvidenceDirectories,
  validateCorrectedCandidateEvidence
} from "../eval/v1.0.0-candidate-corrected/lib/evidence-validator.js";
import {
  CORRECTED_CANDIDATE_CONCLUSION,
  CORRECTED_TRANSITION_RELATIVE,
  CORRECTED_TRANSITION_SHA256,
  validateCorrectedCandidateTransitionAuthority,
  validateCorrectedCandidateTransitionValue
} from "../eval/v1.0.0-candidate-corrected/lib/validator.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("corrective transition is exact and preserves both remote failures", () => {
  const authority = validateCorrectedCandidateTransitionAuthority(repoRoot);
  assert.equal(authority.sha256, CORRECTED_TRANSITION_SHA256);
  assert.equal(
    authority.transition.candidate_conclusions.success,
    CORRECTED_CANDIDATE_CONCLUSION
  );
  assert.deepEqual(
    authority.transition.failed_remote_runs.map((run) => run.result),
    ["failed", "failed"]
  );
  assert.equal(
    authority.transition.previous_candidate.remote_validation_result,
    "failed"
  );
  assert.equal(authority.transition.boundaries.corpus_execution_occurred, false);
  assert.equal(authority.transition.boundaries.holdout_execution_occurred, false);
});

test("corrective transition rejects remote, publication, and assurance drift", () => {
  const value = JSON.parse(
    fs.readFileSync(path.join(repoRoot, CORRECTED_TRANSITION_RELATIVE), "utf8")
  );
  for (const mutate of [
    (copy) => { copy.failed_remote_runs[0].result = "success"; },
    (copy) => { copy.boundaries.publication_authorized = true; },
    (copy) => { copy.boundaries.evidence_strict_release_supported = true; },
    (copy) => { copy.boundaries.corpus_execution_occurred = true; }
  ]) {
    const copy = structuredClone(value);
    mutate(copy);
    assert.throws(() => validateCorrectedCandidateTransitionValue(copy));
  }
});

test("corrected evidence namespace is additive and content-addressed", () => {
  const directories = correctedEvidenceDirectories(repoRoot);
  assert.ok(directories.length <= 1);
  for (const directory of directories) {
    const evidence = validateCorrectedCandidateEvidence(repoRoot, directory);
    assert.equal(
      evidence.candidate.conclusion,
      CORRECTED_CANDIDATE_CONCLUSION
    );
    assert.equal(
      path.basename(directory),
      `evidence-sha256-${evidence.evidence_tree_sha256}`
    );
  }
});

test("corrective transition file is bound by its direct SHA-256", () => {
  const bytes = fs.readFileSync(
    path.join(repoRoot, CORRECTED_TRANSITION_RELATIVE)
  );
  assert.equal(
    crypto.createHash("sha256").update(bytes).digest("hex"),
    CORRECTED_TRANSITION_SHA256
  );
});
