import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadCanonicalJson,
  validateWaiver
} from "../eval/v1.0.0-maintainer/lib/validator.js";
import {
  RESPONSIBILITIES_RELATIVE,
  TRANSITION_SHA256,
  validateTransitionAuthority,
  validateTransitionValue
} from "../eval/v1.0.0-maintainer-certification/lib/validator.js";
import {
  validateCandidateDiffScope,
  validateCandidateTransitionAuthority,
  validateCertifiedCandidateInputs,
  validateFrozenSignedWaiver
} from "../eval/v1.0.0-candidate/lib/validator.js";
import { canonicalJson } from "../scripts/lib/v1-prospective-release.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = path.join(
  repoRoot,
  "eval/v1.0.0-maintainer-certification",
  "evidence-sha256-49b1ee409f32eabaa6558f794c1199f3d3595635d1252ab6600ace375ecd9de8"
);

test("historical documentation transition retains its exact commitment", () => {
  const transition = validateTransitionAuthority(repoRoot);
  assert.equal(transition.sha256, TRANSITION_SHA256);
  assert.equal(
    transition.transition.bindings.historical_freeze_record.result,
    "maintainer-certification-not-ready"
  );
  assert.equal(
    transition.transition.historical_interpretation
      .previous_documentation_gate_must_not_be_relabelled_passing,
    true
  );
  assert.doesNotThrow(() => validateTransitionValue(transition.transition));
});

test("historical protocol, risk ledger, and waiver bytes remain exact", () => {
  for (const [relative, digest] of [
    [
      "eval/v1.0.0-maintainer/PROTOCOL.json",
      "635a08e4058407624fdb1779f1b4127a9e8d821dc50386dbae61fd39b2844092"
    ],
    [
      "eval/v1.0.0-maintainer/RISK_LEDGER.json",
      "838351cad051c13c0316f169ee30630d131292cf8061de0a25234376894167e7"
    ],
    [
      "eval/v1.0.0-maintainer/WAIVER.json",
      "9d0770ce609479eca5f7b27dcb92dad69a287913ed62a236afc4ed5ae499a2a6"
    ]
  ]) {
    assert.equal(sha256(fs.readFileSync(path.join(repoRoot, relative))), digest);
  }
});

test("exact signed waiver remains mechanically authenticated without disclosure", () => {
  assert.deepEqual(validateFrozenSignedWaiver(repoRoot), {
    approval: "authenticated-proceed",
    waiver_sha256:
      "9d0770ce609479eca5f7b27dcb92dad69a287913ed62a236afc4ed5ae499a2a6"
  });
});

test("signed-waiver mutation remains rejected by the frozen validator", () => {
  const protocol = loadCanonicalJson(
    path.join(repoRoot, "eval/v1.0.0-maintainer/PROTOCOL.json")
  );
  const ledger = loadCanonicalJson(
    path.join(repoRoot, "eval/v1.0.0-maintainer/RISK_LEDGER.json")
  );
  const waiver = loadCanonicalJson(
    path.join(repoRoot, "eval/v1.0.0-maintainer/WAIVER.json")
  ).value;
  for (const mutate of [
    (value) => value.accepted_risk_ids.pop(),
    (value) => {
      value.acknowledgments.claims_remain_within_frozen_boundary = false;
    },
    (value) => {
      value.artifact_sha256 = "0".repeat(64);
    },
    (value) => value.failed_gates_called_passing.push("documentation"),
    (value) => {
      value.release_action_occurred = true;
    }
  ]) {
    const changed = structuredClone(waiver);
    mutate(changed);
    assert.throws(
      () =>
        validateWaiver(
          changed,
          protocol.sha256,
          ledger.sha256,
          protocol.value,
          ledger.value
        ),
      /maintainer-assurance/u
    );
  }
});

test("prior certification evidence remains exact and content-addressed", () => {
  assert.deepEqual(fs.readdirSync(evidenceRoot).sort(), [
    "certification.json",
    "complete-tree-commitment.json",
    "run-record.json"
  ]);
  const certificationBytes = fs.readFileSync(
    path.join(evidenceRoot, "certification.json")
  );
  const runBytes = fs.readFileSync(path.join(evidenceRoot, "run-record.json"));
  assert.equal(
    sha256(certificationBytes),
    "017bca4aa2aff3d461a71acde5634b3fccb99b385a24e2500af31813f8f46415"
  );
  assert.equal(
    sha256(runBytes),
    "4c2a67166eb35b75b2530ee154fd8d9aa40e452fdf71d717952dc71c2933a468"
  );
  const certification = JSON.parse(certificationBytes.toString("utf8"));
  const run = JSON.parse(runBytes.toString("utf8"));
  const tree = JSON.parse(
    fs.readFileSync(path.join(evidenceRoot, "complete-tree-commitment.json"))
  );
  assert.equal(certification.result, "maintainer-certification-ready");
  assert.deepEqual(certification.boundaries, {
    evidence_strict_release_supported: false,
    holdout_performance_established: false,
    independence_established: false,
    next_permissible_action:
      "separately-authorized-principal-level-release-hardening-and-exact-v1.0.0-candidate-preparation",
    publication_authorized: false,
    release_action_occurred: false
  });
  assert.equal(run.release_action_occurred, false);
  assert.equal(
    run.artifact.production_sha256,
    "0f87af4dfd851c268891c96237accf20b5089b0e0b95e10ac1417efebcca83a9"
  );
  assert.equal(run.artifact.byte_identical, true);
  assert.equal(
    tree.semantic_sha256,
    "49b1ee409f32eabaa6558f794c1199f3d3595635d1252ab6600ace375ecd9de8"
  );
});

test("candidate transition owns frozen release hardening without rewriting history", () => {
  const transition = validateCandidateTransitionAuthority(repoRoot);
  const certified = validateCertifiedCandidateInputs(repoRoot);
  assert.equal(transition.transition.boundaries.publication_authorized, false);
  assert.equal(transition.transition.boundaries.release_action_occurred, false);
  assert.equal(certified.approval, "authenticated-proceed");
  assert.doesNotThrow(() =>
    validateCandidateDiffScope(
      repoRoot,
      "9ce62c66bab27acbc1695799e8ef15c54c0ea577"
    )
  );
});

test("historical test-responsibility record remains historical and unchanged", () => {
  const bytes = fs.readFileSync(path.join(repoRoot, RESPONSIBILITIES_RELATIVE));
  const responsibility = JSON.parse(bytes.toString("utf8"));
  assert.equal(
    bytes.equals(Buffer.from(`${canonicalJson(responsibility)}\n`)),
    true
  );
  assert.equal(
    responsibility.historical_suite.original_sha256,
    "ade10a090d10e39dcf9f1d410b8695cba10309da60c9a727e1d719cba9d26c96"
  );
  assert.equal(responsibility.package_scripts.changed, false);
  assert.equal(responsibility.active_suite.includes_all_test_files, true);
  assert.deepEqual(responsibility.active_suite.excluded, []);
});

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
