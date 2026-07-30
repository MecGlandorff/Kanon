import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { publicSkillFiles } from "../scripts/lib/artifact-files.js";
import {
  EVIDENCE_PARTITIONS,
  FROZEN_SCORING_POLICY,
  PROSPECTIVE_EVIDENCE_SCHEMA,
  REQUIRED_DECISION_GATES,
  assertFrozenThresholds,
  assertPartitionDisjointness,
  calculateSampleSize,
  canonicalJson,
  consumeHoldoutAttempt,
  deriveOperationalGates,
  deriveReleaseConclusion,
  expectedHoldoutInventory,
  loadProspectiveProtocol,
  minimumWilsonTrials,
  sha256,
  validateGovernance,
  validateLifecycle
} from "../scripts/lib/v1-prospective-release.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const protocolPath = path.join(
  repoRoot,
  "eval",
  "v1.0.0-prospective",
  "PROTOCOL.json"
);
const { protocol, sha256: protocolSha256 } =
  loadProspectiveProtocol(protocolPath);

test("prospective protocol is canonical, inactive, distinct, and unshipped", () => {
  const bytes = fs.readFileSync(protocolPath);
  assert.equal(
    bytes.toString("utf8"),
    `${canonicalJson(protocol)}\n`
  );
  assert.equal(
    protocol.status,
    "frozen-inactive-awaiting-human-roles-and-metadata-only-construction"
  );
  assert.equal(
    protocol.bindings.strict_historical_equivalence,
    "failed-required-comparison-unavailable"
  );
  assert.equal(
    protocol.scoring.official_score_exists_before_completion,
    false
  );
  assert.equal(protocol.sample_size.calculation.holdout_target_cases, 200);
  assert.deepEqual(
    Object.keys(protocol.evidence_partitions).sort(),
    EVIDENCE_PARTITIONS
  );
  assert.equal(
    publicSkillFiles(repoRoot).some(
      (relative) =>
        relative.includes("v1.0.0-prospective") ||
        relative.includes("v1-prospective-release")
    ),
    false
  );
  assert.doesNotMatch(
    fs.readFileSync(
      path.join(
        repoRoot,
        "eval",
        "v1.0.0-prospective",
        "PROTOCOL.md"
      ),
      "utf8"
    ),
    /https:\/\/github\.com\/[^*\s]+\/[^*\s]+/u
  );
});

test("prospective schemas are strict JSON and bind all decision gates", () => {
  const protocolSchema = readJson(
    "eval/v1.0.0-prospective/protocol.schema.json"
  );
  const evidenceSchema = readJson(
    "eval/v1.0.0-prospective/evidence.schema.json"
  );
  assert.equal(protocolSchema.type, "object");
  assert.equal(protocolSchema.additionalProperties, false);
  assert.equal(evidenceSchema.type, "object");
  assert.equal(evidenceSchema.additionalProperties, false);
  assert.deepEqual(
    Object.keys(evidenceSchema.properties.gates.properties).sort(),
    [...REQUIRED_DECISION_GATES].sort()
  );
  assert.deepEqual(
    evidenceSchema.properties.gates.required,
    REQUIRED_DECISION_GATES
  );
  assert.equal(
    evidenceSchema.properties.schema.const,
    PROSPECTIVE_EVIDENCE_SCHEMA
  );
});

test("freeze record binds every prospective implementation file and stays inactive", () => {
  const record = fs.readFileSync(
    path.join(
      repoRoot,
      "docs",
      "v1-run-prospective-release-protocol-freeze.md"
    ),
    "utf8"
  );
  for (const relative of [
    "eval/v1.0.0-prospective/PROTOCOL.md",
    "eval/v1.0.0-prospective/PROTOCOL.json",
    "eval/v1.0.0-prospective/protocol.schema.json",
    "eval/v1.0.0-prospective/evidence.schema.json",
    "scripts/lib/v1-prospective-release.js",
    "test/v1-prospective-release.test.js"
  ]) {
    const digest = sha256(fs.readFileSync(path.join(repoRoot, relative)));
    assert.equal(
      record.includes(`| \`${relative}\` | \`${digest}\` |`),
      true,
      relative
    );
  }
  assert.match(record, /frozen and inactive/i);
  assert.match(
    record,
    /exact next permissible action is limited to real human role assignment and\s+separately authorized metadata-only corpus construction/
  );
  assert.doesNotMatch(record, /official v1\.0\.0 score:?\s+[\d.]+/i);
});

test("sample size is mechanically derived from frozen aggregates", () => {
  assert.deepEqual(
    minimumWilsonTrials(0.8, 0.1),
    { planning_rate: 0.8, trials: 60 }
  );
  assert.deepEqual(
    minimumWilsonTrials(0.6, 0.1),
    { planning_rate: 0.6, trials: 89 }
  );
  assert.deepEqual(
    minimumWilsonTrials(0.4, 0.1),
    { planning_rate: 0.5, trials: 93 }
  );
  assert.deepEqual(
    calculateSampleSize(protocol.sample_size.planning_inputs),
    {
      cases_per_category: 40,
      category_count: 5,
      confidence: 0.95,
      development_target_cases: 200,
      holdout_minimum_cases: 200,
      holdout_target_cases: 200,
      historical_run_prediction_coverage_lower:
        0.30232388795369436,
      maximum_wilson_half_width: 0.1,
      minimum_labeled_positive_denominator_category: 93,
      minimum_labeled_positive_denominator_overall_or_dimension: 89,
      minimum_predicted_positive_denominator: 60,
      raw_case_requirement: 199,
      z: 1.959964
    }
  );
});

test("partition disjointness accepts unrelated partitions", () => {
  assert.equal(
    assertPartitionDisjointness([
      registryEntry(
        "a",
        "historical-visible-development"
      ),
      registryEntry("b", "prospective-development"),
      registryEntry("c", "one-use-unseen-holdout")
    ]),
    true
  );
});

test("contamination inherits across fork, mirror, history, template, and material duplication", () => {
  for (const relationType of [
    "fork",
    "material-duplicate",
    "mirror",
    "shared-history",
    "template"
  ]) {
    const visible = registryEntry(
      "a",
      "historical-visible-development",
      [{ identity_sha256: hash("b"), type: relationType }]
    );
    const holdout = registryEntry(
      "b",
      "one-use-unseen-holdout"
    );
    assert.throws(
      () => assertPartitionDisjointness([visible, holdout]),
      /inherits-visible-contamination/,
      relationType
    );
  }

  const historical = registryEntry(
    "a",
    "historical-visible-development",
    [{ identity_sha256: hash("b"), type: "fork" }]
  );
  const development = registryEntry(
    "b",
    "prospective-development",
    [{ identity_sha256: hash("c"), type: "template" }]
  );
  const holdout = registryEntry(
    "c",
    "one-use-unseen-holdout"
  );
  assert.throws(
    () =>
      assertPartitionDisjointness([
        historical,
        development,
        holdout
      ]),
    /inherits-visible-contamination/
  );
});

test("identity duplication and premature holdout disclosure are rejected", () => {
  const first = registryEntry(
    "a",
    "historical-visible-development"
  );
  const duplicateRevision = registryEntry(
    "b",
    "one-use-unseen-holdout"
  );
  duplicateRevision.revision_sha256 = first.revision_sha256;
  assert.throws(
    () =>
      assertPartitionDisjointness([first, duplicateRevision]),
    /duplicate-identity-or-revision/
  );

  const exposed = registryEntry(
    "c",
    "one-use-unseen-holdout"
  );
  exposed.developer_exposed_before_candidate_freeze = true;
  assert.throws(
    () => assertPartitionDisjointness([exposed]),
    /prematurely-exposed/
  );
});

test("real-human governance requires six separated people", () => {
  const assignments = governanceAssignments();
  assert.equal(validateGovernance(assignments), true);

  assert.throws(
    () =>
      validateGovernance(
        assignments.filter(
          (item) => item.role !== "disagreement-adjudicator"
        )
      ),
    /governance-role-disagreement-adjudicator/
  );

  const combined = structuredClone(assignments);
  combined.find(
    (item) => item.role === "holdout-custodian"
  ).human_id = "candidate-owner-1";
  assert.throws(
    () => validateGovernance(combined),
    /six-distinct-humans/
  );

  const dependentExecutor = structuredClone(assignments);
  dependentExecutor.find(
    (item) => item.role === "evaluation-executor"
  ).human_id = "labeler-one-1";
  assert.throws(
    () => validateGovernance(dependentExecutor),
    /only-custodian-executor-combination/
  );

  const agent = structuredClone(assignments);
  agent[0].professional_name = "Coding Agent";
  assert.throws(
    () => validateGovernance(agent),
    /real-human-identity/
  );
});

test("label, candidate, authorization, consumption, and unblinding order is enforced", () => {
  const events = lifecycleEvents([
    "labels-raw-frozen",
    "labels-adjudicated",
    "labels-frozen",
    "candidate-frozen",
    "attempt-authorized",
    "attempt-consumed",
    "predictions-unblinded"
  ]);
  assert.equal(validateLifecycle(events, protocol), true);

  assert.throws(
    () =>
      validateLifecycle(
        lifecycleEvents([
          "labels-raw-frozen",
          "labels-adjudicated",
          "candidate-frozen",
          "attempt-authorized"
        ]),
        protocol
      ),
    /labels-frozen-must-precede-attempt-authorized/
  );
  assert.throws(
    () =>
      validateLifecycle(
        lifecycleEvents([
          "labels-raw-frozen",
          "labels-adjudicated",
          "labels-frozen",
          "attempt-authorized"
        ]),
        protocol
      ),
    /candidate-frozen-must-precede-attempt-authorized/
  );
  assert.throws(
    () =>
      validateLifecycle(
        lifecycleEvents([
          "holdout-exposed-to-candidate-owner",
          "labels-raw-frozen",
          "labels-adjudicated",
          "labels-frozen",
          "candidate-frozen"
        ]),
        protocol
      ),
    /blindness-order-violation/
  );
});

test("threshold and post-freeze or post-unblinding mutation are rejected", () => {
  const mutated = structuredClone(FROZEN_SCORING_POLICY);
  mutated.minimum_precision = 0.79;
  assert.throws(
    () => assertFrozenThresholds(mutated, protocol),
    /threshold-or-policy-mutation/
  );
  assert.equal(
    assertFrozenThresholds(
      structuredClone(FROZEN_SCORING_POLICY),
      protocol
    ),
    true
  );

  assert.throws(
    () =>
      validateLifecycle(
        lifecycleEvents([
          "labels-raw-frozen",
          "labels-adjudicated",
          "labels-frozen",
          "candidate-frozen",
          "configuration-mutated"
        ]),
        protocol
      ),
    /post-candidate-freeze-mutation/
  );
  assert.throws(
    () =>
      validateLifecycle(
        lifecycleEvents([
          "labels-raw-frozen",
          "labels-adjudicated",
          "labels-frozen",
          "candidate-frozen",
          "attempt-authorized",
          "attempt-consumed",
          "predictions-unblinded",
          "label-mutated"
        ]),
        protocol
      ),
    /post-candidate-freeze-mutation/
  );
});

test("holdout consumption is one-use and inventory is exact", () => {
  const receipt = {
    attempt_authorization_sha256: hash("a"),
    attempt_ordinal: 1,
    candidate_freeze_sha256: hash("b"),
    case_ordinal: 1,
    component: "canonical-prospective-holdout-runner",
    consumed: true,
    holdout_manifest_sha256: hash("c"),
    protocol_sha256: protocolSha256,
    schema:
      "kanon-v1.0.0-prospective-holdout-consumption-v1"
  };
  const consumed = consumeHoldoutAttempt(
    { authorized: true, consumed_count: 0 },
    receipt
  );
  assert.equal(consumed.consumed_count, 1);
  assert.deepEqual(consumed.consumption_receipt, receipt);
  assert.throws(
    () => consumeHoldoutAttempt(consumed, receipt),
    /one-use-attempt-consumption/
  );
  const inventory = expectedHoldoutInventory();
  assert.equal(inventory.length, 205);
  assert.deepEqual(inventory.slice(0, 5), [
    "attempt-binding.json",
    "attempt-consumption.json",
    "raw-report.json",
    "trace-manifest.json",
    "trace-off-report.json"
  ]);
  assert.equal(inventory[5], "traces/001.json");
  assert.equal(inventory.at(-1), "traces/200.json");
});

test("operational gates reject incomplete, underfilled, and weak-denominator evidence", () => {
  const complete = operationalStatistics();
  assert.deepEqual(
    deriveOperationalGates(complete, protocol),
    {
      category_coverage: "pass",
      complete_case_results: "pass",
      confidence_precision: "pass",
      coverage: "pass",
      incomplete_scans: "pass",
      observer_failures: "pass",
      sample_size: "pass"
    }
  );

  const incomplete = structuredClone(complete);
  incomplete.incomplete_scan_count = 1;
  assert.equal(
    deriveOperationalGates(incomplete, protocol).incomplete_scans,
    "fail"
  );

  const missing = structuredClone(complete);
  missing.complete_case_results = null;
  assert.equal(
    deriveOperationalGates(missing, protocol).complete_case_results,
    "unknown"
  );

  const underfilled = structuredClone(complete);
  underfilled.category_case_counts["python-web"] = 39;
  underfilled.case_count = 199;
  assert.equal(
    deriveOperationalGates(underfilled, protocol).category_coverage,
    "fail"
  );
  assert.equal(
    deriveOperationalGates(underfilled, protocol).sample_size,
    "fail"
  );

  const weak = structuredClone(complete);
  weak.denominators.predicted_positive.run_command = 59;
  assert.equal(
    deriveOperationalGates(weak, protocol).confidence_precision,
    "fail"
  );
});

test("conclusion derivation is exact for support, failure, and inconclusive controls", () => {
  const supported = evidenceFixture();
  assert.equal(
    deriveReleaseConclusion(supported, protocol),
    "release-supported"
  );

  const failed = structuredClone(supported);
  failed.gates.performance_thresholds = "fail";
  failed.conclusion = "release-not-supported";
  assert.equal(
    deriveReleaseConclusion(failed, protocol),
    "release-not-supported"
  );

  const incompleteScan = structuredClone(supported);
  incompleteScan.statistics.incomplete_scan_count = 1;
  incompleteScan.gates.incomplete_scans = "fail";
  incompleteScan.conclusion = "release-not-supported";
  assert.equal(
    deriveReleaseConclusion(incompleteScan, protocol),
    "release-not-supported"
  );

  const unknown = structuredClone(supported);
  unknown.gates.label_validity = "unknown";
  unknown.conclusion = "inconclusive";
  assert.equal(
    deriveReleaseConclusion(unknown, protocol),
    "inconclusive"
  );

  const failedAttempt = structuredClone(supported);
  failedAttempt.statistics.complete_case_results = null;
  failedAttempt.gates.complete_case_results = "unknown";
  failedAttempt.conclusion = "inconclusive";
  assert.equal(
    deriveReleaseConclusion(failedAttempt, protocol),
    "inconclusive"
  );

  const mismatch = structuredClone(supported);
  mismatch.statistics.observer_failure_count = 1;
  assert.throws(
    () => deriveReleaseConclusion(mismatch, protocol),
    /operational-gate-observer_failures/
  );

  const falseClaim = structuredClone(supported);
  falseClaim.gates.safety = "fail";
  assert.throws(
    () => deriveReleaseConclusion(falseClaim, protocol),
    /release-conclusion-binding/
  );
});

function evidenceFixture() {
  return {
    attestations: [],
    conclusion: "release-supported",
    gates: Object.fromEntries(
      REQUIRED_DECISION_GATES.map((gate) => [gate, "pass"])
    ),
    protocol_sha256: protocolSha256,
    schema: PROSPECTIVE_EVIDENCE_SCHEMA,
    statistics: operationalStatistics()
  };
}

function operationalStatistics() {
  return {
    case_count: 200,
    category_case_counts: {
      "go-service": 40,
      monorepo: 40,
      "python-ml": 40,
      "python-web": 40,
      "rust-cli": 40
    },
    complete_case_results: 200,
    coverage_complete: true,
    denominators: {
      labeled_positive_category: {
        "go-service": 200,
        monorepo: 200,
        "python-ml": 200,
        "python-web": 200,
        "rust-cli": 200
      },
      labeled_positive_overall_or_dimension: {
        important_files: 1000,
        overall: 1200,
        run_command: 180,
        test_command: 180
      },
      predicted_positive: {
        "go-service": 200,
        important_files: 1000,
        monorepo: 200,
        overall: 1200,
        "python-ml": 200,
        "python-web": 200,
        run_command: 100,
        "rust-cli": 200,
        test_command: 100
      }
    },
    incomplete_scan_count: 0,
    observer_failure_count: 0
  };
}

function governanceAssignments() {
  return [
    assignment("candidate-owner", "candidate-owner-1", "Alice Owner"),
    assignment(
      "holdout-custodian",
      "holdout-custodian-1",
      "Bruno Custodian"
    ),
    assignment(
      "independent-labeler",
      "labeler-one-1",
      "Chiara Labeler"
    ),
    assignment(
      "independent-labeler",
      "labeler-two-1",
      "Darius Labeler"
    ),
    assignment(
      "disagreement-adjudicator",
      "adjudicator-1",
      "Elena Adjudicator"
    ),
    assignment(
      "evaluation-executor",
      "holdout-custodian-1",
      "Bruno Custodian"
    ),
    assignment(
      "release-decision-owner",
      "release-owner-1",
      "Farah Release"
    )
  ];
}

function assignment(role, humanId, professionalName) {
  return {
    attestation_sha256: hash(
      String(role.length + humanId.length).slice(-1)
    ),
    conflict_declaration: "none-declared",
    human_id: humanId,
    is_human: true,
    professional_name: professionalName,
    role
  };
}

function lifecycleEvents(types) {
  return types.map((type, index) => ({
    sequence: index + 1,
    subject_sha256: hash(
      ((index + 1) % 10).toString(16)
    ),
    type
  }));
}

function registryEntry(
  character,
  partition,
  relations = []
) {
  return {
    developer_exposed_before_candidate_freeze: false,
    identity_sha256: hash(character),
    partition,
    relations,
    revision_sha256: hash(nextHex(character))
  };
}

function nextHex(character) {
  return ((Number.parseInt(character, 16) + 8) % 16).toString(16);
}

function hash(character) {
  return character.repeat(64);
}

function readJson(relative) {
  return JSON.parse(
    fs.readFileSync(path.join(repoRoot, relative), "utf8")
  );
}
