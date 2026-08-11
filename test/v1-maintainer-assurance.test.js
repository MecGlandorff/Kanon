import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { publicSkillFiles } from "../scripts/lib/artifact-files.js";
import {
  CANDIDATE_SOURCE_COMMIT,
  FORBIDDEN_CLAIMS,
  GATE_IDS,
  PACKAGE_VERSION,
  PERMITTED_CLAIMS,
  PRODUCTION_ARTIFACT_SHA256,
  RISK_IDS,
  WAIVER_RISK_IDS,
  assertMaintainerPath,
  deriveMaintainerConclusion,
  loadCanonicalJson,
  validateHumanIdentity,
  validateProtocol,
  validatePublicClaims,
  validateRiskAcceptance,
  validateRiskLedger,
  validateSignedWaiverBindings,
  validateUnsignedWaiver
} from "../eval/v1.0.0-maintainer/lib/validator.js";
import { sha256 } from "../scripts/lib/v1-prospective-release.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const protocol = loadCanonicalJson(
  path.join(repoRoot, "eval/v1.0.0-maintainer/PROTOCOL.json")
);
const ledger = loadCanonicalJson(
  path.join(repoRoot, "eval/v1.0.0-maintainer/RISK_LEDGER.json")
);
const schema = loadCanonicalJson(
  path.join(repoRoot, "eval/v1.0.0-maintainer/schema.json")
);
const waiver = loadCanonicalJson(
  path.join(repoRoot, "eval/v1.0.0-maintainer/WAIVER.template.json")
);
const bundle = {
  approval: "awaiting",
  hashes: {
    protocol: protocol.sha256,
    risk_ledger: ledger.sha256,
    schema: schema.sha256,
    waiver: waiver.sha256
  },
  ledger: ledger.value,
  protocol: protocol.value,
  waiver: waiver.value
};
const allMechanicalPass = Object.fromEntries(
  GATE_IDS
    .filter((id) => id !== "authentic-solo-maintainer-approval")
    .map((id) => [id, "pass"])
);

test("maintainer assurance bundle is canonical, exact, and frozen", () => {
  assert.deepEqual(bundle.hashes, {
    protocol: "635a08e4058407624fdb1779f1b4127a9e8d821dc50386dbae61fd39b2844092",
    risk_ledger: "838351cad051c13c0316f169ee30630d131292cf8061de0a25234376894167e7",
    schema: "801c46596f9e0714a4b4ab75039bf0205a698663f530b6ff488b777733ac72db",
    waiver: "02ebb739dafad9fbbc5b994904432847e7c60c0de8548a68708d6efd87aff2de"
  });
  assert.equal(bundle.protocol.status, "frozen-awaiting-solo-maintainer-approval");
  assert.equal(bundle.ledger.status, "frozen-awaiting-solo-maintainer-risk-decision");
  assert.equal(bundle.approval, "awaiting");
});

test("maintainer namespace is separate and excluded from production", () => {
  assert.equal(
    assertMaintainerPath("eval/v1.0.0-maintainer/PROTOCOL.json"),
    true
  );
  for (const rejected of [
    "eval/v1.0.0-prospective/PROTOCOL.json",
    "eval/v1.0.0-simulation/PROTOCOL.json",
    "eval/results/maintainer.json",
    "eval/v1.0.0-maintainer/../results/escape.json",
    "/eval/v1.0.0-maintainer/absolute.json"
  ]) {
    assert.throws(() => assertMaintainerPath(rejected), /namespace-separation/u);
  }
  const shipped = publicSkillFiles(repoRoot);
  assert.equal(
    shipped.some((relative) => relative.startsWith("eval/v1.0.0-maintainer/")),
    false
  );
});

test("archive-only evidence retains its exact frozen bindings", () => {
  const archived = [
    "eval/results/post-correction-evidence-sha256-" +
      "b2259cef72b0bba7b37fbab37f1d0edcbd592235f92b5813da7f814855f74636/" +
      "comparison.json",
    "eval/v1.0.0-simulation/evidence-sha256-" +
      "42f36e5fea80a84523995c5b394bcb8c4fc5b300a39b763d14277408cff96dc5/" +
      "complete-tree-commitment.json"
  ];
  for (const relative of archived) {
    assert.equal(fs.existsSync(path.join(repoRoot, relative)), false, relative);
  }
  assert.doesNotThrow(() => validateProtocol(bundle.protocol, repoRoot));
});

test("prospective and simulation authorities retain exact frozen bytes", () => {
  const exact = {
    "6-people-sim.md":
      "8077343f989caf30e01072ee5bd207bf60ec49eafe500b246f4fc3da83d046e4",
    "eval/v1.0.0-prospective/PROTOCOL.json":
      "254917b8a47a51f52d4af022dc7146a9f0755836242b1c491e6a0a583e0b8f73",
    "eval/v1.0.0-simulation/PROTOCOL.json":
      "c9c2b15361dd3a5f6284bc10972e2dc62e2ba2c8fcc19c55cc28475d441d2cc7"
  };
  for (const [relative, digest] of Object.entries(exact)) {
    assert.equal(sha256(fs.readFileSync(path.join(repoRoot, relative))), digest);
  }
  assert.equal(
    bundle.protocol.relationship_to_evidence_strict.activates_prospective_protocol,
    false
  );
  assert.equal(
    bundle.protocol.relationship_to_evidence_strict.prospective_lane_available_for_future_completion,
    true
  );
});

test("evidence classifications preserve absent human and holdout evidence", () => {
  assert.deepEqual(bundle.protocol.evidence_classification, {
    deterministic_tests_and_artifacts: "engineering-assurance",
    historical_d2: "visible-development-evidence",
    human_independence: "absent",
    post_correction_evaluation: "development-only-diagnostic-evidence",
    release_decision: "awaiting-real-solo-maintainer-approval",
    six_person_simulation: "simulated-process-assurance",
    unseen_holdout: "absent"
  });
});

test("risk ledger is complete, exact, unaccepted, and unresolved", () => {
  assert.deepEqual(
    bundle.ledger.records.map((record) => record.id),
    RISK_IDS
  );
  assert.equal(bundle.ledger.records.length, 20);
  assert.equal(bundle.ledger.records.every((record) => record.waived === false), true);
  assert.equal(
    bundle.ledger.records.every((record) => record.resolution_status === "open"),
    true
  );
  assert.deepEqual(
    bundle.ledger.records
      .filter((record) => record.classification === "Unknown")
      .map((record) => record.id),
    [
      "RISK-LABEL-VALIDITY",
      "RISK-GENERALIZATION",
      "RISK-NATIVE-WINDOWS-LINUX"
    ]
  );
  const documentation = bundle.ledger.records.find(
    (record) => record.id === "RISK-PUBLIC-DOCUMENTATION-DRIFT"
  );
  assert.equal(documentation.classification, "Known");
  assert.equal(documentation.waiver_eligible, false);
});

test("visible metrics, seven failures, nine incomplete scans, and zero correction benefit remain exact", () => {
  const evaluation = JSON.parse(
    fs.readFileSync(
      path.join(
        repoRoot,
        "eval/results/post-correction-evidence-sha256-b2259cef72b0bba7b37fbab37f1d0edcbd592235f92b5813da7f814855f74636/evaluation-record.json"
      ),
      "utf8"
    )
  );
  const scores = evaluation.aggregate.scores.all_frozen_score_fields.post;
  assert.deepEqual(scores.totals, {
    fn: 68,
    fp: 46,
    precision: 0.7486338797814208,
    precision_interval: scores.totals.precision_interval,
    recall: 0.6682926829268293,
    recall_interval: scores.totals.recall_interval,
    tp: 137,
    weighted_error: 298,
    weighted_error_per_case: 9.933333333333334
  });
  assert.equal(scores.failures.length, 7);
  assert.equal(scores.incomplete_scan_count, 9);
  assert.equal(evaluation.aggregate.counts.removed_public_false_positives, 7);
  assert.equal(evaluation.aggregate.counts.new_public_false_positives, 7);
  assert.equal(evaluation.aggregate.scores.all_frozen_score_fields.delta.totals.fp, 0);
});

test("failed, accepted, resolved, and non-waivable states remain distinct", () => {
  const mutated = structuredClone(bundle.ledger);
  mutated.records[0].resolution_status = "accepted";
  assert.throws(
    () => validateRiskLedger(mutated, bundle.protocol),
    /risk-not-resolved/u
  );
  const waived = structuredClone(bundle.ledger);
  waived.records[0].waived = true;
  assert.throws(
    () => validateRiskLedger(waived, bundle.protocol),
    /risk-not-resolved/u
  );
  const p0 = structuredClone(bundle.ledger);
  p0.records[0].severity = "P0";
  assert.throws(
    () => validateRiskLedger(p0, bundle.protocol),
    /risk-p0-not-waivable/u
  );
  const maintenance = bundle.ledger.records.at(-1);
  assert.equal(maintenance.waiver_eligible, false);
  assert.equal(
    bundle.protocol.risk_policy.known_product_integrity_or_security_defect_waivable,
    false
  );
});

test("public claim validation permits only the frozen boundary", () => {
  assert.equal(validatePublicClaims(PERMITTED_CLAIMS, bundle.protocol), true);
  for (const forbidden of FORBIDDEN_CLAIMS) {
    assert.throws(
      () => validatePublicClaims([forbidden], bundle.protocol),
      /public-claim-boundary/u
    );
  }
  assert.throws(
    () => validatePublicClaims(["general-unbounded-accuracy"], bundle.protocol),
    /public-claim-boundary/u
  );
});

test("canonical waiver remains entirely unsigned and cannot imply release", () => {
  assert.equal(validateUnsignedWaiver(bundle.waiver), true);
  assert.equal(bundle.waiver.status, "awaiting-solo-maintainer-signature");
  assert.equal(bundle.waiver.maintainer_identity, null);
  assert.equal(bundle.waiver.approval_timestamp_utc, null);
  assert.equal(bundle.waiver.signature, null);
  assert.equal(bundle.waiver.release_action_occurred, false);
  assert.equal(
    deriveMaintainerConclusion(allMechanicalPass, bundle.approval),
    "maintainer-certification-not-ready"
  );
});

test("blank, placeholder, agent, model, and simulated identities are rejected", () => {
  for (const accountableIdentity of [
    "",
    "TBD",
    "Codex agent",
    "GPT model",
    "SIM-RO",
    "simulated persona"
  ]) {
    assert.throws(
      () =>
        validateHumanIdentity({
          accountable_identity: accountableIdentity,
          identity_type: "real-human-solo-maintainer"
        }),
      /authentic-human-identity/u
    );
  }
  assert.throws(
    () =>
      validateHumanIdentity({
        accountable_identity: "SIM-CO",
        identity_type: "agent"
      }),
    /authentic-human-identity/u
  );
});

test("later waiver bindings and risk identifiers must be exact", () => {
  const bindingsOnly = {
    artifact_sha256: PRODUCTION_ARTIFACT_SHA256,
    candidate_source_commit: CANDIDATE_SOURCE_COMMIT,
    protocol_sha256: bundle.hashes.protocol,
    risk_ledger_sha256: bundle.hashes.risk_ledger
  };
  assert.equal(
    validateSignedWaiverBindings(
      bindingsOnly,
      bundle.hashes.protocol,
      bundle.hashes.risk_ledger
    ),
    true
  );
  for (const [key, value] of [
    ["artifact_sha256", "0".repeat(64)],
    ["candidate_source_commit", "0".repeat(40)],
    ["protocol_sha256", "1".repeat(64)],
    ["risk_ledger_sha256", "2".repeat(64)]
  ]) {
    assert.throws(
      () =>
        validateSignedWaiverBindings(
          { ...bindingsOnly, [key]: value },
          bundle.hashes.protocol,
          bundle.hashes.risk_ledger
        ),
      /signed-waiver-bindings/u
    );
  }
  assert.equal(validateRiskAcceptance(WAIVER_RISK_IDS, "proceed"), true);
  assert.throws(
    () => validateRiskAcceptance(WAIVER_RISK_IDS.slice(1), "proceed"),
    /signed-waiver-all-risks/u
  );
  assert.throws(
    () =>
      validateRiskAcceptance(
        [...WAIVER_RISK_IDS, "RISK-FUTURE-MAINTENANCE-OBLIGATIONS"],
        "proceed"
      ),
    /signed-waiver-all-risks/u
  );
  assert.equal(validateRiskAcceptance([], "decline"), true);
});

test("readiness derivation handles pass, fail, Unknown, approval, and decline", () => {
  assert.equal(
    deriveMaintainerConclusion(allMechanicalPass, "authenticated-proceed"),
    "maintainer-certification-ready"
  );
  assert.equal(
    deriveMaintainerConclusion(allMechanicalPass, "authenticated-decline"),
    "maintainer-certification-not-ready"
  );
  const failed = { ...allMechanicalPass, "complete-project-validation": "fail" };
  assert.equal(
    deriveMaintainerConclusion(failed, "authenticated-proceed"),
    "maintainer-certification-not-ready"
  );
  const unknown = { ...allMechanicalPass, "installed-artifact-conformance": "unknown" };
  assert.equal(
    deriveMaintainerConclusion(unknown, "authenticated-proceed"),
    "maintainer-certification-inconclusive"
  );
});

test("source, artifact, version, dependency, and release boundaries reject mutation", () => {
  const sourceMutation = structuredClone(bundle.protocol);
  sourceMutation.bindings.candidate_source_commit = "0".repeat(40);
  assert.throws(
    () => validateProtocol(sourceMutation, repoRoot),
    /protocol-bindings/u
  );
  const artifactMutation = structuredClone(bundle.protocol);
  artifactMutation.bindings.artifact_sha256 = "0".repeat(64);
  assert.throws(
    () => validateProtocol(artifactMutation, repoRoot),
    /protocol-bindings/u
  );
  const releaseMutation = structuredClone(bundle.protocol);
  releaseMutation.release_action.authorized = true;
  assert.throws(
    () => validateProtocol(releaseMutation, repoRoot),
    /no-release-action/u
  );
  assert.equal(bundle.protocol.bindings.package_version, PACKAGE_VERSION);
  assert.equal(bundle.protocol.bindings.runtime_dependencies, 0);
  assert.equal(bundle.protocol.bindings.optional_dependencies, 0);
  assert.equal(bundle.protocol.bindings.peer_dependencies, 0);
});

test("exact evidence commitments reject historical or simulated mutation", () => {
  const protocolMutation = structuredClone(bundle.protocol);
  protocolMutation.evidence_bindings[0].sha256 = "0".repeat(64);
  assert.throws(
    () => validateProtocol(protocolMutation, repoRoot),
    /evidence-binding-historical-strict-equivalence-result/u
  );
  const simulationMutation = structuredClone(bundle.protocol);
  const tree = simulationMutation.evidence_bindings.find(
    (binding) => binding.id === "simulation-evidence-tree"
  );
  tree.semantic_sha256 = "0".repeat(64);
  assert.throws(
    () => validateProtocol(simulationMutation, repoRoot),
    /simulation-semantic-tree-binding/u
  );
});
