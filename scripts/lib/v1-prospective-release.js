import crypto from "node:crypto";
import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";

export const PROSPECTIVE_PROTOCOL_SCHEMA =
  "kanon-v1.0.0-prospective-release-protocol-v1";
export const PROSPECTIVE_EVIDENCE_SCHEMA =
  "kanon-v1.0.0-prospective-release-evidence-v1";

export const EVIDENCE_PARTITIONS = Object.freeze([
  "historical-visible-development",
  "one-use-unseen-holdout",
  "prospective-development"
]);

export const REQUIRED_DECISION_GATES = Object.freeze([
  "agreement",
  "artifact_identity",
  "binding",
  "blindness",
  "candidate_freeze",
  "category_coverage",
  "compatibility",
  "complete_case_results",
  "confidence_precision",
  "containment",
  "contamination",
  "coverage",
  "deterministic_artifact",
  "governance",
  "incomplete_scans",
  "installed_conformance",
  "integrity",
  "inventory",
  "label_validity",
  "no_post_freeze_mutation",
  "no_post_result_rule_change",
  "observer_failures",
  "one_use_attempt",
  "performance_thresholds",
  "safety",
  "sample_size",
  "schema",
  "trace_equivalence",
  "weighted_error"
]);

export const FROZEN_SCORING_POLICY = Object.freeze({
  category_thresholds: {
    "go-service": {
      minimum_precision: 0.8,
      minimum_recall: 0.4
    },
    monorepo: {
      minimum_precision: 0.8,
      minimum_recall: 0.4
    },
    "python-ml": {
      minimum_precision: 0.8,
      minimum_recall: 0.4
    },
    "python-web": {
      minimum_precision: 0.8,
      minimum_recall: 0.4
    },
    "rust-cli": {
      minimum_precision: 0.8,
      minimum_recall: 0.4
    }
  },
  dimension_thresholds: {
    important_files: {
      minimum_precision: 0.8,
      minimum_recall: 0.6
    },
    run_command: {
      minimum_precision: 0.8,
      minimum_recall: 0.6
    },
    test_command: {
      minimum_precision: 0.8,
      minimum_recall: 0.6
    }
  },
  false_negative_cost: 1,
  false_positive_cost: 5,
  important_file_limit: 5,
  maximum_weighted_error_per_case: 4,
  minimum_cases_per_category: 5,
  minimum_precision: 0.8,
  minimum_recall: 0.6
});

const HASH = /^[0-9a-f]{64}$/;
const GATE_STATES = new Set(["pass", "fail", "unknown"]);
const RELATION_TYPES = new Set([
  "fork",
  "material-duplicate",
  "mirror",
  "shared-history",
  "template"
]);
const REQUIRED_ROLE_COUNTS = Object.freeze({
  "candidate-owner": 1,
  "disagreement-adjudicator": 1,
  "evaluation-executor": 1,
  "holdout-custodian": 1,
  "independent-labeler": 2,
  "release-decision-owner": 1
});
const MUTATION_EVENTS = new Set([
  "candidate-source-mutated",
  "configuration-mutated",
  "dependency-mutated",
  "generated-runtime-mutated",
  "label-mutated",
  "policy-mutated",
  "product-test-mutated",
  "threshold-mutated"
]);
const PREDICTED_DENOMINATOR_KEYS = Object.freeze([
  "go-service",
  "important_files",
  "monorepo",
  "overall",
  "python-ml",
  "python-web",
  "run_command",
  "rust-cli",
  "test_command"
]);
const LABELED_OVERALL_OR_DIMENSION_KEYS = Object.freeze([
  "important_files",
  "overall",
  "run_command",
  "test_command"
]);
const LABELED_CATEGORY_KEYS = Object.freeze([
  "go-service",
  "monorepo",
  "python-ml",
  "python-web",
  "rust-cli"
]);
const REQUIRED_PROTOCOL_KEYS = [
  "bindings",
  "candidate_development",
  "conclusions",
  "corpus_selection",
  "evidence_partitions",
  "forbidden",
  "governance",
  "holdout_execution",
  "labeling",
  "sample_size",
  "schema",
  "scoring",
  "status",
  "version"
];
const REQUIRED_BINDINGS = Object.freeze({
  analysis_schema_sha256:
    "17c842e70f8ebe8b308115562f94e2ee64b0e86caf4a83236d1262e32509c3f9",
  artifact_sha256:
    "0f87af4dfd851c268891c96237accf20b5089b0e0b95e10ac1417efebcca83a9",
  branch: "release/v.1.0.0",
  corpus_sha256:
    "4f768f151885d26de48fe0744cafc2402a27aca61f7f049aac166309891e0c92",
  d2a_report_sha256:
    "747b4f1590eda9787c87aae2e25853b8e1e8fa04893e2359eedf7a6050b7acb3",
  d2e_protocol_sha256:
    "d412ba3a4311640234b9291ac458da321a77db9da0df310cfd3186a56cad3f41",
  evaluation_protocol_sha256:
    "8d6b59e879cd35093f265207d5fec9e6e567f0bd66765cd73c75e1e63b65c0a6",
  package_version: "0.4.0-rc.1",
  paired_ablation_sha256:
    "132aeaf85984d791aa6c2335e498cb80ebfe4f99c7924230e7b487585237573a",
  parent_commit: "949158dca8d737a9892fe8a696e60e196d3649c8",
  post_correction_authority_sha256:
    "b4227670b7b831f1949598add2fa538c875cdb90ab55b1820a35ba81b5543087",
  post_correction_evidence_tree_sha256:
    "b2259cef72b0bba7b37fbab37f1d0edcbd592235f92b5813da7f814855f74636",
  post_correction_evaluation_sha256:
    "002b31db1a3c44e488466ff6655707f07c38a0f21487cd9dc0b5d5b4424c8b30",
  public_capabilities_sha256:
    "bfc00d445cc480389559fd8c115a6ae2607dd6b7241dd0e256565bde5f0256cf",
  scoring_policy_sha256:
    "1b625f6a16ff5eaa985d8d2d504fd615206b0b0147807d68f467e151a5604a6c",
  strict_historical_equivalence:
    "failed-required-comparison-unavailable",
  threshold_projection_sha256:
    "680fcdc9c899dfe1122941f4e59fb9ed917756eeeb17b40273425861a900e749",
  trace_schema_sha256:
    "5a938a24c774cbf9deef7c764184270ae1925a8edbfeecf321c9d2b4844d8c72",
  withdrawal_commit: "949158dca8d737a9892fe8a696e60e196d3649c8",
  withdrawal_record_sha256:
    "4b2fd7699808cb8682095f29a1ac68a1dac5e3d81c1301bc2a18e58e8f1e8967"
});

export function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}

export function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function loadProspectiveProtocol(file) {
  const bytes = fs.readFileSync(file);
  expect(bytes.length <= 2 * 1024 * 1024, "protocol-size");
  const protocol = JSON.parse(bytes.toString("utf8"));
  expect(
    bytes.equals(Buffer.from(`${canonicalJson(protocol)}\n`)),
    "protocol-canonical-serialization"
  );
  validateProspectiveProtocol(protocol);
  return { bytes, protocol, sha256: sha256(bytes) };
}

export function validateProspectiveProtocol(protocol) {
  expectPlainRecord(protocol, "protocol");
  expectExactKeys(protocol, REQUIRED_PROTOCOL_KEYS, "protocol");
  expect(
    protocol.schema === PROSPECTIVE_PROTOCOL_SCHEMA,
    "protocol-schema"
  );
  expect(protocol.version === 1, "protocol-version");
  expect(
    protocol.status ===
      "frozen-inactive-awaiting-human-roles-and-metadata-only-construction",
    "protocol-status"
  );
  expect(
    isDeepStrictEqual(protocol.bindings, REQUIRED_BINDINGS),
    "protocol-bindings"
  );
  expect(
    isDeepStrictEqual(protocol.scoring.policy, FROZEN_SCORING_POLICY),
    "frozen-scoring-policy"
  );
  expect(
    protocol.scoring.threshold_changes_allowed === false &&
      protocol.scoring.non_inferiority_margin === 0 &&
      protocol.scoring.official_score_exists_before_completion === false,
    "scoring-boundary"
  );

  const calculated = calculateSampleSize(
    protocol.sample_size.planning_inputs
  );
  expect(
    isDeepStrictEqual(
      calculated,
      protocol.sample_size.calculation
    ),
    "sample-size-calculation"
  );
  expect(
    calculated.holdout_target_cases === 200 &&
      calculated.holdout_minimum_cases === 200 &&
      calculated.development_target_cases === 200 &&
      calculated.cases_per_category === 40,
    "sample-size-targets"
  );
  expect(
    isDeepStrictEqual(
      protocol.conclusions.allowed,
      [
        "release-supported",
        "release-not-supported",
        "inconclusive"
      ]
    ) &&
      isDeepStrictEqual(
        protocol.conclusions.required_gates,
        REQUIRED_DECISION_GATES
      ),
    "conclusion-rules"
  );
  expect(
    protocol.conclusions.final_human_release_decision_required === true &&
      protocol.conclusions.automatic_release_allowed === false,
    "human-release-decision"
  );
  expect(
    protocol.holdout_execution.attempt_limit === 1 &&
      protocol.holdout_execution.case_count === 200 &&
      protocol.holdout_execution.observer_failure_limit === 0 &&
      protocol.holdout_execution.incomplete_scan_limit === 0 &&
      protocol.holdout_execution.invalid_case_limit === 0 &&
      protocol.holdout_execution.consumption_receipt.schema ===
        "kanon-v1.0.0-prospective-holdout-consumption-v1" &&
      protocol.holdout_execution.network_allowed === false &&
      protocol.holdout_execution.live_model_allowed === false,
    "holdout-execution-boundary"
  );
  expect(
    expectedHoldoutInventory(200).length ===
      protocol.holdout_execution.inventory.exact_file_count &&
      protocol.holdout_execution.inventory.trace_count === 200,
    "holdout-inventory"
  );
  expect(
    protocol.governance.minimum_distinct_humans === 6 &&
      isDeepStrictEqual(
        protocol.governance.required_role_counts,
        REQUIRED_ROLE_COUNTS
      ) &&
      protocol.governance.missing_assignments_leave_protocol_inactive ===
        true &&
      protocol.governance.coding_agents_may_simulate_independence === false,
    "governance-boundary"
  );
  expect(
    isDeepStrictEqual(
      Object.keys(protocol.evidence_partitions).sort(),
      EVIDENCE_PARTITIONS
    ),
    "evidence-partitions"
  );
  expect(
    protocol.corpus_selection.category_quotas["go-service"] === 40 &&
      protocol.corpus_selection.category_quotas.monorepo === 40 &&
      protocol.corpus_selection.category_quotas["python-ml"] === 40 &&
      protocol.corpus_selection.category_quotas["python-web"] === 40 &&
      protocol.corpus_selection.category_quotas["rust-cli"] === 40,
    "category-quotas"
  );
  expect(
    protocol.labeling.minimum_independent_judgments_per_case === 2 &&
      protocol.labeling.post_unblinding_label_repair_allowed === false,
    "labeling-boundary"
  );
  for (const operation of [
    "access-or-select-prospective-repository-in-this-freeze",
    "corpus-or-trace-execution-in-this-freeze",
    "fictional-or-agent-simulated-independent-review",
    "post-result-threshold-or-rule-change",
    "release-or-publication"
  ]) {
    expect(protocol.forbidden.includes(operation), `forbidden-${operation}`);
  }
  return true;
}

export function wilsonInterval(successes, trials, z = 1.959964) {
  expect(
    Number.isSafeInteger(successes) &&
      Number.isSafeInteger(trials) &&
      successes >= 0 &&
      trials > 0 &&
      successes <= trials,
    "wilson-input"
  );
  const proportion = successes / trials;
  const zSquared = z * z;
  const denominator = 1 + zSquared / trials;
  const center =
    (proportion + zSquared / (2 * trials)) / denominator;
  const margin =
    (
      z *
      Math.sqrt(
        (
          proportion * (1 - proportion) +
          zSquared / (4 * trials)
        ) / trials
      )
    ) / denominator;
  return {
    confidence: 0.95,
    lower: Math.max(0, center - margin),
    trials,
    upper: Math.min(1, center + margin)
  };
}

export function minimumWilsonTrials(
  minimumPassingRate,
  maximumHalfWidth,
  z = 1.959964
) {
  expect(
    minimumPassingRate > 0 &&
      minimumPassingRate <= 1 &&
      maximumHalfWidth > 0 &&
      maximumHalfWidth < 1,
    "wilson-plan-input"
  );
  const planningRate =
    minimumPassingRate <= 0.5 ? 0.5 : minimumPassingRate;
  for (let trials = 1; trials <= 1_000_000; trials += 1) {
    const successes = planningRate * trials;
    const zSquared = z * z;
    const denominator = 1 + zSquared / trials;
    const margin =
      (
        z *
        Math.sqrt(
          (
            planningRate * (1 - planningRate) +
            zSquared / (4 * trials)
          ) / trials
        )
      ) / denominator;
    if (margin <= maximumHalfWidth) {
      return { planning_rate: planningRate, trials };
    }
    expect(Number.isFinite(successes), "wilson-plan-finite");
  }
  throw new Error("prospective-release: wilson-plan-bound");
}

export function calculateSampleSize(input) {
  expectPlainRecord(input, "sample-size planning inputs");
  expect(
    input.confidence === 0.95 &&
      input.maximum_wilson_half_width === 0.1 &&
      input.category_count === 5 &&
      input.historical_run_predicted_positive_cases === 14 &&
      input.historical_case_count === 30,
    "sample-size-frozen-inputs"
  );
  const precision = minimumWilsonTrials(
    FROZEN_SCORING_POLICY.minimum_precision,
    input.maximum_wilson_half_width
  );
  const recall = minimumWilsonTrials(
    FROZEN_SCORING_POLICY.minimum_recall,
    input.maximum_wilson_half_width
  );
  const categoryRecall = minimumWilsonTrials(
    FROZEN_SCORING_POLICY
      .category_thresholds["python-ml"].minimum_recall,
    input.maximum_wilson_half_width
  );
  const historicalCoverage = wilsonInterval(
    input.historical_run_predicted_positive_cases,
    input.historical_case_count
  );
  const rawCases = Math.ceil(
    precision.trials / historicalCoverage.lower
  );
  const balancedCases =
    Math.ceil(rawCases / input.category_count) * input.category_count;
  return {
    cases_per_category: balancedCases / input.category_count,
    category_count: input.category_count,
    confidence: input.confidence,
    development_target_cases: balancedCases,
    holdout_minimum_cases: balancedCases,
    holdout_target_cases: balancedCases,
    historical_run_prediction_coverage_lower:
      historicalCoverage.lower,
    maximum_wilson_half_width: input.maximum_wilson_half_width,
    minimum_labeled_positive_denominator_category:
      categoryRecall.trials,
    minimum_labeled_positive_denominator_overall_or_dimension:
      recall.trials,
    minimum_predicted_positive_denominator: precision.trials,
    raw_case_requirement: rawCases,
    z: 1.959964
  };
}

export function assertFrozenThresholds(candidate, protocol) {
  expect(
    isDeepStrictEqual(candidate, protocol.scoring.policy),
    "threshold-or-policy-mutation"
  );
  return true;
}

export function assertPartitionDisjointness(entries) {
  expect(Array.isArray(entries), "partition-registry-array");
  const byId = new Map();
  const identities = new Set();
  const revisions = new Set();
  for (const entry of entries) {
    expectPlainRecord(entry, "partition entry");
    expect(
      HASH.test(entry.identity_sha256 || "") &&
        HASH.test(entry.revision_sha256 || "") &&
        EVIDENCE_PARTITIONS.includes(entry.partition),
      "partition-entry-fields"
    );
    expect(!byId.has(entry.identity_sha256), "duplicate-identity");
    expect(
      !identities.has(entry.identity_sha256) &&
        !revisions.has(entry.revision_sha256),
      "duplicate-identity-or-revision"
    );
    expect(Array.isArray(entry.relations), "partition-relations");
    if (
      entry.partition === "one-use-unseen-holdout" &&
      entry.developer_exposed_before_candidate_freeze === true
    ) {
      throw new Error(
        "prospective-release: holdout-prematurely-exposed"
      );
    }
    byId.set(entry.identity_sha256, entry);
    identities.add(entry.identity_sha256);
    revisions.add(entry.revision_sha256);
  }

  const graph = new Map(
    entries.map((entry) => [entry.identity_sha256, new Set()])
  );
  for (const entry of entries) {
    for (const relation of entry.relations) {
      expectPlainRecord(relation, "partition relation");
      expect(
        HASH.test(relation.identity_sha256 || "") &&
          RELATION_TYPES.has(relation.type) &&
          byId.has(relation.identity_sha256),
        "partition-relation-fields"
      );
      graph.get(entry.identity_sha256).add(
        relation.identity_sha256
      );
      graph.get(relation.identity_sha256).add(
        entry.identity_sha256
      );
    }
  }

  const visited = new Set();
  for (const entry of entries) {
    if (visited.has(entry.identity_sha256)) {
      continue;
    }
    const component = [];
    const pending = [entry.identity_sha256];
    while (pending.length) {
      const id = pending.pop();
      if (visited.has(id)) {
        continue;
      }
      visited.add(id);
      component.push(byId.get(id));
      pending.push(
        ...Array.from(graph.get(id)).filter(
          (related) => !visited.has(related)
        )
      );
    }
    const partitions = new Set(
      component.map((item) => item.partition)
    );
    const visible =
      partitions.has("historical-visible-development") ||
      partitions.has("prospective-development");
    if (
      visible &&
      partitions.has("one-use-unseen-holdout")
    ) {
      throw new Error(
        "prospective-release: holdout-inherits-visible-contamination"
      );
    }
  }
  return true;
}

export function validateGovernance(assignments) {
  expect(Array.isArray(assignments), "governance-assignments");
  const byRole = Object.fromEntries(
    Object.keys(REQUIRED_ROLE_COUNTS).map((role) => [role, []])
  );
  for (const assignment of assignments) {
    expectPlainRecord(assignment, "governance assignment");
    expect(
      Object.hasOwn(byRole, assignment.role) &&
        typeof assignment.human_id === "string" &&
        assignment.human_id.length >= 3 &&
        typeof assignment.professional_name === "string" &&
        assignment.professional_name.trim().length >= 3 &&
        assignment.is_human === true &&
        assignment.conflict_declaration === "none-declared" &&
        HASH.test(assignment.attestation_sha256 || ""),
      "governance-assignment-fields"
    );
    expect(
      !/(?:agent|bot|model|tbd|unknown|unassigned|fixture)/iu.test(
        `${assignment.human_id} ${assignment.professional_name}`
      ),
      "governance-real-human-identity"
    );
    byRole[assignment.role].push(assignment);
  }
  for (const [role, count] of Object.entries(REQUIRED_ROLE_COUNTS)) {
    expect(
      byRole[role].length === count,
      `governance-role-${role}`
    );
  }

  const core = [
    byRole["candidate-owner"][0],
    byRole["holdout-custodian"][0],
    ...byRole["independent-labeler"],
    byRole["disagreement-adjudicator"][0],
    byRole["release-decision-owner"][0]
  ];
  expect(
    new Set(core.map((item) => item.human_id)).size === 6,
    "governance-six-distinct-humans"
  );
  const executor = byRole["evaluation-executor"][0];
  const custodian = byRole["holdout-custodian"][0];
  expect(
    executor.human_id === custodian.human_id ||
      !core.some((item) => item.human_id === executor.human_id),
    "governance-only-custodian-executor-combination"
  );
  return true;
}

export function validateLifecycle(events, protocol) {
  expect(Array.isArray(events), "lifecycle-events");
  expect(
    protocol.bindings.scoring_policy_sha256 ===
      REQUIRED_BINDINGS.scoring_policy_sha256,
    "lifecycle-threshold-binding"
  );
  const seen = new Map();
  let previousSequence = 0;
  for (const event of events) {
    expectPlainRecord(event, "lifecycle event");
    expect(
      Number.isSafeInteger(event.sequence) &&
        event.sequence === previousSequence + 1 &&
        typeof event.type === "string" &&
        event.type.length > 0 &&
        HASH.test(event.subject_sha256 || ""),
      "lifecycle-event-fields"
    );
    previousSequence = event.sequence;
    if (seen.has(event.type)) {
      throw new Error(
        "prospective-release: duplicate-lifecycle-event"
      );
    }
    seen.set(event.type, event.sequence);
    if (
      event.type === "policy-mutated" ||
      event.type === "threshold-mutated"
    ) {
      throw new Error(
        "prospective-release: frozen-policy-or-threshold-mutation"
      );
    }
    if (
      MUTATION_EVENTS.has(event.type) &&
      seen.has("candidate-frozen")
    ) {
      throw new Error(
        "prospective-release: post-candidate-freeze-mutation"
      );
    }
    if (
      event.type === "label-mutated" &&
      seen.has("predictions-unblinded")
    ) {
      throw new Error(
        "prospective-release: post-unblinding-label-mutation"
      );
    }
  }

  requireBefore(
    seen,
    "labels-raw-frozen",
    "labels-adjudicated"
  );
  requireBefore(seen, "labels-adjudicated", "labels-frozen");
  requireBefore(seen, "labels-frozen", "attempt-authorized");
  requireBefore(seen, "candidate-frozen", "attempt-authorized");
  requireBefore(seen, "attempt-authorized", "attempt-consumed");
  requireBefore(
    seen,
    "attempt-consumed",
    "predictions-unblinded"
  );
  if (
    seen.has("holdout-exposed-to-candidate-owner") &&
    (
      !seen.has("candidate-frozen") ||
      seen.get("holdout-exposed-to-candidate-owner") <
        seen.get("candidate-frozen")
    )
  ) {
    throw new Error(
      "prospective-release: blindness-order-violation"
    );
  }
  if (
    seen.has("predictions-unblinded") &&
    (
      !seen.has("labels-frozen") ||
      seen.get("predictions-unblinded") <
        seen.get("labels-frozen")
    )
  ) {
    throw new Error(
      "prospective-release: prediction-before-label-freeze"
    );
  }
  return true;
}

export function consumeHoldoutAttempt(attempt, receipt) {
  expectPlainRecord(attempt, "attempt state");
  expect(
    attempt.consumed_count === 0 &&
      attempt.authorized === true &&
      receipt?.attempt_ordinal === 1 &&
      receipt?.case_ordinal === 1 &&
      receipt?.consumed === true &&
      receipt?.schema ===
        "kanon-v1.0.0-prospective-holdout-consumption-v1" &&
      HASH.test(receipt?.protocol_sha256 || "") &&
      HASH.test(receipt?.candidate_freeze_sha256 || "") &&
      HASH.test(receipt?.holdout_manifest_sha256 || "") &&
      HASH.test(receipt?.attempt_authorization_sha256 || "") &&
      receipt?.component ===
        "canonical-prospective-holdout-runner",
    "one-use-attempt-consumption"
  );
  return {
    ...attempt,
    consumed_count: 1,
    consumption_receipt: structuredClone(receipt)
  };
}

export function expectedHoldoutInventory(caseCount = 200) {
  expect(
    Number.isSafeInteger(caseCount) && caseCount > 0,
    "inventory-case-count"
  );
  return [
    "attempt-binding.json",
    "attempt-consumption.json",
    "raw-report.json",
    "trace-manifest.json",
    "trace-off-report.json",
    ...Array.from(
      { length: caseCount },
      (_unused, index) =>
        `traces/${String(index + 1).padStart(3, "0")}.json`
    )
  ];
}

export function deriveOperationalGates(statistics, protocol) {
  expectPlainRecord(statistics, "operational statistics");
  const calculation = protocol.sample_size.calculation;
  const categories = protocol.corpus_selection.category_quotas;
  const categoryCoverage =
    isPlainRecord(statistics.category_case_counts) &&
    Object.entries(categories).every(
      ([name, count]) =>
        statistics.category_case_counts[name] === count
    ) &&
    Object.keys(statistics.category_case_counts).length ===
      Object.keys(categories).length;
  const denominators = statistics.denominators;
  const denominatorPass =
    isPlainRecord(denominators) &&
    hasExactKeys(
      denominators.predicted_positive,
      PREDICTED_DENOMINATOR_KEYS
    ) &&
    Object.values(denominators.predicted_positive).every(
      (value) =>
        Number.isSafeInteger(value) &&
        value >=
          calculation.minimum_predicted_positive_denominator
    ) &&
    hasExactKeys(
      denominators.labeled_positive_overall_or_dimension,
      LABELED_OVERALL_OR_DIMENSION_KEYS
    ) &&
    Object.values(
      denominators.labeled_positive_overall_or_dimension
    ).every(
      (value) =>
        Number.isSafeInteger(value) &&
        value >=
          calculation
            .minimum_labeled_positive_denominator_overall_or_dimension
    ) &&
    hasExactKeys(
      denominators.labeled_positive_category,
      LABELED_CATEGORY_KEYS
    ) &&
    Object.values(
      denominators.labeled_positive_category
    ).every(
      (value) =>
        Number.isSafeInteger(value) &&
        value >=
          calculation.minimum_labeled_positive_denominator_category
    );

  return {
    category_coverage: categoryCoverage ? "pass" : "fail",
    complete_case_results:
      statistics.complete_case_results ===
      calculation.holdout_target_cases
        ? "pass"
        : statistics.complete_case_results === null
          ? "unknown"
          : "fail",
    coverage:
      statistics.coverage_complete === true
        ? "pass"
        : statistics.coverage_complete === false
          ? "fail"
          : "unknown",
    confidence_precision: denominatorPass ? "pass" : "fail",
    incomplete_scans:
      statistics.incomplete_scan_count === 0
        ? "pass"
        : Number.isSafeInteger(statistics.incomplete_scan_count)
          ? "fail"
          : "unknown",
    observer_failures:
      statistics.observer_failure_count === 0
        ? "pass"
        : Number.isSafeInteger(statistics.observer_failure_count)
          ? "fail"
          : "unknown",
    sample_size:
      statistics.case_count === calculation.holdout_target_cases
        ? "pass"
        : Number.isSafeInteger(statistics.case_count)
          ? "fail"
          : "unknown"
  };
}

export function deriveReleaseConclusion(evidence, protocol) {
  expectPlainRecord(evidence, "release evidence");
  expect(
    evidence.schema === PROSPECTIVE_EVIDENCE_SCHEMA &&
      evidence.protocol_sha256 === sha256(
        Buffer.from(`${canonicalJson(protocol)}\n`)
      ),
    "release-evidence-identity"
  );
  expectPlainRecord(evidence.gates, "release gates");
  expectExactKeys(
    evidence.gates,
    REQUIRED_DECISION_GATES,
    "release gates"
  );
  for (const state of Object.values(evidence.gates)) {
    expect(GATE_STATES.has(state), "release-gate-state");
  }
  const operational = deriveOperationalGates(
    evidence.statistics,
    protocol
  );
  for (const [gate, state] of Object.entries(operational)) {
    expect(evidence.gates[gate] === state, `operational-gate-${gate}`);
  }
  const conclusion = Object.values(evidence.gates).includes("unknown")
    ? "inconclusive"
    : Object.values(evidence.gates).includes("fail")
      ? "release-not-supported"
      : "release-supported";
  expect(
    evidence.conclusion === conclusion,
    "release-conclusion-binding"
  );
  return conclusion;
}

function requireBefore(seen, before, after) {
  if (!seen.has(after)) {
    return;
  }
  if (!seen.has(before) || seen.get(before) >= seen.get(after)) {
    throw new Error(
      `prospective-release: ${before}-must-precede-${after}`
    );
  }
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])])
    );
  }
  return value;
}

function isPlainRecord(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype
  );
}

function expectPlainRecord(value, label) {
  expect(isPlainRecord(value), `${label}-object`);
}

function expectExactKeys(value, expected, label) {
  expect(
    isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort()),
    `${label}-keys`
  );
}

function hasExactKeys(value, expected) {
  return (
    isPlainRecord(value) &&
    isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort())
  );
}

function expect(condition, label) {
  if (!condition) {
    throw new Error(`prospective-release: ${label}`);
  }
}
