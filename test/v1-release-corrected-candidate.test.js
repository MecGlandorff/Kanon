import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  correctedEvidenceDirectories,
  validateCorrectedCandidateEvidenceValue
} from "../eval/v1.0.0-candidate-corrected/lib/evidence-validator.js";
import {
  CORRECTED_CANDIDATE_CONCLUSION,
  CORRECTED_TRANSITION_RELATIVE,
  CORRECTED_TRANSITION_SHA256,
  validateCorrectedCandidateTransitionValue
} from "../eval/v1.0.0-candidate-corrected/lib/validator.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("corrective transition stays exact after result archival", () => {
  const bytes = fs.readFileSync(
    path.join(repoRoot, CORRECTED_TRANSITION_RELATIVE)
  );
  const transition = JSON.parse(bytes.toString("utf8"));
  assert.equal(
    crypto.createHash("sha256").update(bytes).digest("hex"),
    CORRECTED_TRANSITION_SHA256
  );
  assert.equal(validateCorrectedCandidateTransitionValue(transition), true);
  assert.equal(
    transition.candidate_conclusions.success,
    CORRECTED_CANDIDATE_CONCLUSION
  );
  assert.deepEqual(
    transition.failed_remote_runs.map((run) => run.result),
    ["failed", "failed"]
  );
  assert.equal(
    transition.previous_candidate.remote_validation_result,
    "failed"
  );
  assert.equal(transition.boundaries.corpus_execution_occurred, false);
  assert.equal(transition.boundaries.holdout_execution_occurred, false);
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
    const candidateBytes = fs.readFileSync(
      path.join(directory, "candidate.json")
    );
    const candidate = JSON.parse(candidateBytes.toString("utf8"));
    const tree = JSON.parse(
      fs.readFileSync(
        path.join(directory, "complete-tree-commitment.json"),
        "utf8"
      )
    );
    assert.equal(validateCorrectedCandidateEvidenceValue(candidate), true);
    const candidateSha256 = crypto
      .createHash("sha256")
      .update(candidateBytes)
      .digest("hex");
    assert.deepEqual(tree.files, [
      { path: "candidate.json", sha256: candidateSha256 }
    ]);
    assert.equal(
      candidate.conclusion,
      CORRECTED_CANDIDATE_CONCLUSION
    );
    assert.equal(
      path.basename(directory),
      `evidence-sha256-${tree.semantic_sha256}`
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
