import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  GATE_IDS,
  loadCanonicalJson,
  validateWaiver
} from "../eval/v1.0.0-maintainer/lib/validator.js";
import {
  CORRECTED_README_SHA256,
  CURRENT_PACKAGE_SHA256,
  RESPONSIBILITIES_RELATIVE,
  TRANSITION_SHA256,
  applyAuthorizedReadmeCorrection,
  certificationEvidenceDirectories,
  deriveLiveMaintainerCertification,
  validateCertificationEvidence,
  validateCurrentProductState,
  validateHistoricalState,
  validateLiveDocumentation,
  validateSignedMaintainerWaiver,
  validateTransitionAuthority,
  validateTransitionValue
} from "../eval/v1.0.0-maintainer-certification/lib/validator.js";
import { canonicalJson } from "../scripts/lib/v1-prospective-release.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mechanicalGateIds = GATE_IDS.filter(
  (id) => id !== "authentic-solo-maintainer-approval"
);
const allPass = Object.fromEntries(
  mechanicalGateIds.map((id) => [id, "pass"])
);

test("versioned transition authority retains its exact canonical commitment", () => {
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
});

test("historical standard, evidence, validator, template, and test bytes remain exact", () => {
  const transition = validateTransitionAuthority(repoRoot).transition;
  const historical = validateHistoricalState(repoRoot, transition);
  assert.equal(
    sha256(historical.historicalReadme),
    transition.bindings.historical_readme.sha256
  );
  assert.equal(historical.protocol.status, "frozen-awaiting-solo-maintainer-approval");
  assert.equal(
    historical.ledger.status,
    "frozen-awaiting-solo-maintainer-risk-decision"
  );
});

test("the exact signed waiver is authenticated-proceed without changing risk meaning", () => {
  const result = validateSignedMaintainerWaiver(repoRoot);
  assert.equal(result.approval, "authenticated-proceed");
  assert.equal(
    result.waiver_sha256,
    "9d0770ce609479eca5f7b27dcb92dad69a287913ed62a236afc4ed5ae499a2a6"
  );
  assert.equal(result.waiver.accepted_risk_ids.length, 18);
  assert.equal(result.waiver.failed_gates_called_passing.length, 0);
  assert.equal(result.waiver.release_action_occurred, false);
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

test("current README is exactly the authorized six-skill repair", () => {
  const transition = validateTransitionAuthority(repoRoot).transition;
  const historical = validateHistoricalState(repoRoot, transition);
  const documentation = validateLiveDocumentation(
    repoRoot,
    historical,
    transition
  );
  assert.deepEqual(documentation, {
    corrected_readme_sha256: CORRECTED_README_SHA256,
    historical_gate: "fail",
    stable_skills: [
      "orient",
      "resume",
      "verify",
      "status",
      "steer",
      "aswitch"
    ],
    status: "pass"
  });
  const reconstructed = applyAuthorizedReadmeCorrection(
    historical.historicalReadme.toString("utf8"),
    transition.documentation_correction
  );
  assert.equal(sha256(Buffer.from(reconstructed)), CORRECTED_README_SHA256);
});

test("arbitrary historical, capability, artifact, and claim-boundary drift is rejected", () => {
  const original = validateTransitionAuthority(repoRoot).transition;
  for (const mutate of [
    (value) => {
      value.bindings.historical_readme.sha256 = "0".repeat(64);
    },
    (value) => {
      value.bindings.maintainer_protocol.sha256 = "1".repeat(64);
    },
    (value) => {
      value.bindings.canonical_capabilities.sha256 = "2".repeat(64);
    },
    (value) => {
      value.bindings.production_artifact.sha256 = "3".repeat(64);
    },
    (value) => {
      value.preservation.claim_boundary_change_allowed = true;
    }
  ]) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.throws(
      () => validateTransitionValue(changed),
      /maintainer-certification/u
    );
  }
});

test("current version, dependencies, capabilities, runtime, and package scope are unchanged", () => {
  const product = validateCurrentProductState(repoRoot);
  assert.equal(product.package_version, "0.4.0-rc.1");
  assert.equal(
    product.public_capabilities_sha256,
    "bfc00d445cc480389559fd8c115a6ae2607dd6b7241dd0e256565bde5f0256cf"
  );
  assert.equal(product.generated_runtime_delta, 0);
  assert.equal(product.package_inventory_count, 128);
});

test("live conclusion is mechanical while historical not-ready remains historical", () => {
  const ready = deriveLiveMaintainerCertification(repoRoot, allPass);
  assert.equal(ready.result, "maintainer-certification-ready");
  assert.equal(ready.documentation.historical_gate, "fail");
  assert.equal(ready.documentation.status, "pass");
  assert.deepEqual(ready.risk_state.resolved_by_current_evidence, [
    "RISK-PUBLIC-DOCUMENTATION-DRIFT"
  ]);
  assert.deepEqual(ready.risk_state.open_nonwaivable, [
    "RISK-FUTURE-MAINTENANCE-OBLIGATIONS"
  ]);
  assert.deepEqual(ready.risk_state.unknown, [
    "RISK-LABEL-VALIDITY",
    "RISK-GENERALIZATION",
    "RISK-NATIVE-WINDOWS-LINUX"
  ]);

  const failed = { ...allPass, "complete-project-validation": "fail" };
  assert.equal(
    deriveLiveMaintainerCertification(repoRoot, failed).result,
    "maintainer-certification-not-ready"
  );
  const unknown = { ...allPass, "installed-artifact-conformance": "unknown" };
  assert.equal(
    deriveLiveMaintainerCertification(repoRoot, unknown).result,
    "maintainer-certification-inconclusive"
  );
  assert.throws(
    () =>
      deriveLiveMaintainerCertification(repoRoot, {
        ...allPass,
        "accurate-readme-changelog-installation-compatibility-security-and-limitations":
          "fail"
      }),
    /live-documentation-gate-current-evidence/u
  );
});

test("active test discovery is unchanged and only the stale live-path responsibility moves", () => {
  const responsibilityPath = path.join(repoRoot, RESPONSIBILITIES_RELATIVE);
  const bytes = fs.readFileSync(responsibilityPath);
  const responsibility = JSON.parse(bytes.toString("utf8"));
  assert.equal(
    bytes.equals(Buffer.from(`${canonicalJson(responsibility)}\n`)),
    true
  );
  assert.equal(
    responsibility.historical_suite.original_sha256,
    "ade10a090d10e39dcf9f1d410b8695cba10309da60c9a727e1d719cba9d26c96"
  );
  assert.deepEqual(responsibility.active_suite.excluded, []);
  assert.equal(responsibility.active_suite.includes_all_test_files, true);
  assert.equal(responsibility.package_scripts.changed, false);
  assert.equal(responsibility.package_scripts.package_sha256, CURRENT_PACKAGE_SHA256);
  for (const [relative, digest] of Object.entries(
    responsibility.active_suite.bindings
  )) {
    assert.equal(sha256(fs.readFileSync(path.join(repoRoot, relative))), digest);
  }
  assert.equal(
    sha256(
      fs.readFileSync(
        path.join(repoRoot, responsibility.active_suite.transitioned_test)
      )
    ),
    responsibility.active_suite.current_sha256
  );
});

test("a content-addressed certification tree is unique and valid when present", () => {
  const evidence = certificationEvidenceDirectories(repoRoot);
  assert.ok(evidence.length <= 1);
  if (evidence.length === 1) {
    const validated = validateCertificationEvidence(repoRoot, evidence[0]);
    assert.equal(
      validated.certification.result,
      "maintainer-certification-ready"
    );
    assert.match(validated.evidence_tree_sha256, /^[0-9a-f]{64}$/u);
  }
});

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
