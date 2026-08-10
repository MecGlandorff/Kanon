import fs from "node:fs";
import path from "node:path";
import { resolveContainedPath } from "../../src/path-security.js";
import { safeTerminalText } from "../../src/trust.js";
import { canonicalJson, sha256 } from "./d2e-evidence.js";
import { validateRankingTrace } from "./d2e-trace.js";

const RECOVERY =
  "eval/results/d2e-recovery-b26f85c47e98a686a79cce5359b50a559db483b70ecd23d15eda014621d411f1";
const FAILURE = "eval/results/d2e-trace-failed-e0a3a224";
const HASH = /^[0-9a-f]{64}$/;
const REQUIRED_UNKNOWN = [
  "candidate-membership-equivalence", "scan-diagnostic-equivalence"
];
const ADMISSION_REQUIREMENTS = [
  "exact-failed-attempt-and-recovery-commitments-match",
  "30-of-30-traces-pass-schema-integrity-and-completeness",
  "observer-failures-equal-zero",
  "synthetic-trace-off-on-equivalence-is-exact",
  "historically-comparable-public-fields-have-zero-mismatches",
  "production-artifact-and-public-capabilities-are-unchanged",
  "candidate-membership-equivalence-is-Unknown", "scan-diagnostic-equivalence-is-Unknown"
];
const DOES_NOT_ESTABLISH = [
  "strict-semantic-equivalence", "candidate-membership-equivalence",
  "scan-diagnostic-equivalence", "causal-non-interference",
  "release-evidence", "official-score-change", "label-validity", "independent-review",
  "permission-to-modify-product-behavior"
];
const HYPOTHESIS_CLASSES = [
  "root-contract", "workspace-contract", "manifest-declaration",
  "framework-declaration", "executable-syntax", "ecosystem-test-anchor",
  "import-fan-in", "literal-local-reference", "base-path-score",
  "low-value-path-penalty", "workflow-penalty", "test-path-penalty",
  "depth-penalty", "deduplication", "stage-ordering", "quota", "final-cap"
];
const FILE_BINDINGS = [
  ["V_1design.md", "design_sha256"],
  ["eval/PROTOCOL.md", "evaluation_protocol_sha256"],
  ["eval/PAIRED_ABLATION.md", "paired_ablation_sha256"],
  ["eval/d2e/PROTOCOL.md", "d2e_protocol_sha256"],
  ["eval/d2e/trace.schema.json", "trace_schema_sha256"],
  ["eval/d2e/analysis.schema.json", "analysis_schema_sha256"],
  ["eval/corpus.json", "corpus_sha256"],
  ["eval/paired-ablation.config.json", "paired_configuration_file_sha256"],
  ["eval/results/development-0.4.0-rc.1-d2a-74208b9a.json", "d2a_report_sha256"],
  [`${FAILURE}/attempt-binding.json`, "attempt_binding_sha256"],
  [`${RECOVERY}/attempt-binding.json`, "attempt_binding_sha256"],
  [`${FAILURE}/raw-report.json`, "raw_report_sha256"],
  [`${RECOVERY}/raw-report.json`, "raw_report_sha256"],
  [`${FAILURE}/failure-manifest.json`, "failed_attempt_manifest_sha256"],
  [`${RECOVERY}/failure-manifest.json`, "failed_attempt_manifest_sha256"],
  [`${RECOVERY}/recovery-binding.json`, "recovery_binding_sha256"],
  [`${RECOVERY}/trace-manifest.json`, "trace_manifest_sha256"],
  [`${RECOVERY}/equivalence.json`, "equivalence_sha256"],
  [`${RECOVERY}/evidence-manifest.json`, "recovery_evidence_manifest_sha256"],
  ["eval/results/d2c-comparative-unblind-f8b1e7a6/unblinded-analysis.json", "comparative_analysis_sha256"],
  ["eval/results/d2d-ranking-1f2ba552/ranking-result.json", "d2d_result_sha256"],
  ["scripts/lib/d2e-evidence.js", "mechanism_analysis_implementation_sha256"],
  ["test/d2e-trace.test.js", "synthetic_equivalence_test_sha256"],
  ["src/v1/build-metadata.json", "public_capabilities_sha256"],
  ["package.json", "package_sha256"]
];

export function loadAnalysisAuthority(repoRoot) {
  const bytes = readFile(repoRoot, "eval/d2e/ANALYSIS_AUTHORITY.json", 1024 * 1024);
  const authority = parseJson(bytes, "analysis authority");
  validateAuthorityDocument(authority);
  for (const [relative, binding] of FILE_BINDINGS) {
    expect(
      sha256(readFile(repoRoot, relative, 8 * 1024 * 1024)) === authority.bindings[binding],
      `authority-file-${binding}`
    );
  }
  expect(
    sha256(readFile(repoRoot, "runtime/build-metadata.json", 1024 * 1024)) === authority.bindings.public_capabilities_sha256,
    "runtime-public-capabilities"
  );
  return { authority, bytes };
}

export function admitD2eAnalysis(repoRoot, artifactPath) {
  const { authority, bytes: authorityBytes } = loadAnalysisAuthority(repoRoot);
  expect(
    sha256(readExternalFile(artifactPath, 8 * 1024 * 1024)) === authority.bindings.artifact_sha256,
    "current-production-artifact"
  );
  const binding = readJson(repoRoot, `${RECOVERY}/attempt-binding.json`);
  const manifest = readJson(repoRoot, `${RECOVERY}/trace-manifest.json`);
  const equivalence = readJson(repoRoot, `${RECOVERY}/equivalence.json`);
  const recovery = readJson(repoRoot, `${RECOVERY}/recovery-binding.json`);
  const evidence = readJson(repoRoot, `${RECOVERY}/evidence-manifest.json`);
  const failure = readJson(repoRoot, `${FAILURE}/failure-manifest.json`);
  const report = readJson(repoRoot, `${RECOVERY}/raw-report.json`);
  const corpus = readJson(repoRoot, "eval/corpus.json");
  const comparative = readJson(repoRoot, "eval/results/d2c-comparative-unblind-f8b1e7a6/unblinded-analysis.json");
  validateCommitments({
    repoRoot,
    authority,
    binding,
    manifest,
    equivalence,
    recovery,
    evidence,
    failure,
    report,
    corpus
  });
  const sourceMetadata = readJson(repoRoot, "src/v1/build-metadata.json");
  const runtimeMetadata = readJson(repoRoot, "runtime/build-metadata.json");
  const packageManifest = readJson(repoRoot, "package.json");
  expect(
    canonicalJson(sourceMetadata) === canonicalJson(runtimeMetadata) &&
      sourceMetadata.package_version === authority.bindings.package_version &&
      sourceMetadata.runtime.runtime_dependencies === 0 &&
      packageManifest.version === authority.bindings.package_version &&
      packageManifest.dependencies === undefined,
    "current-public-capabilities"
  );

  const traces = [];
  let candidates = 0;
  let eligible = 0;
  let traceBytes = 0;
  let observers = 0;
  let incompleteScans = 0;
  for (const [index, item] of manifest.case_files.entries()) {
    const bytes = readFile(repoRoot, `${RECOVERY}/${item.file}`, 128 * 1024 * 1024);
    const trace = parseJson(bytes, `trace-${index + 1}`);
    const corpusCase = corpus.cases[index];
    expect(
      item.ordinal === index + 1 &&
        item.id === corpusCase.id &&
        item.revision === corpusCase.revision &&
        item.bytes === bytes.length &&
        item.sha256 === sha256(bytes) &&
        item.complete === true,
      `trace-manifest-case-${index + 1}`
    );
    const validation = validateRankingTrace(trace, {
      protocolSha256: binding.protocol_sha256,
      traceSourceCommit: binding.source_commit,
      artifactSha256: binding.artifact_sha256,
      corpusSha256: binding.corpus_sha256,
      caseId: corpusCase.id,
      revision: corpusCase.revision,
      ordinal: index + 1
    });
    expect(validation.valid, `trace-schema-${index + 1}`);
    expect(
      trace.completeness.complete === true &&
        trace.completeness.failures.length === 0,
      `trace-completeness-${index + 1}`
    );
    expect(
      canonicalJson(trace.predictions) ===
        canonicalJson(report.results[index].predictions),
      `trace-public-selection-${index + 1}`
    );
    candidates += trace.candidates.length;
    eligible += trace.candidates.filter((candidate) => candidate.ranking.eligible).length;
    traceBytes += bytes.length;
    observers += trace.completeness.observer_failures;
    incompleteScans += trace.scan.complete ? 0 : 1;
    traces.push(trace);
  }
  expect(
    traces.length === 30 &&
      candidates === 33484 &&
      eligible === 28749 &&
      traceBytes === 34819892 &&
      incompleteScans === 9 &&
      observers === 0,
    "trace-totals"
  );
  const admission = {
    schema: "kanon-d2e-analysis-admission-v1",
    authority_sha256: sha256(authorityBytes),
    admitted: true,
    conditions: {
      exact_failed_attempt_and_recovery_commitments_match: true,
      traces_schema_integrity_complete: "30/30",
      observer_failures: 0,
      synthetic_trace_equivalence:
        "exact-focused-test-bound-by-authority",
      historically_comparable_public_field_mismatches: 0,
      production_artifact_unchanged: true,
      public_capabilities_unchanged: true,
      candidate_membership_equivalence: "Unknown",
      scan_diagnostic_equivalence: "Unknown"
    },
    strict_equivalence: "failed-required-comparison-unavailable",
    counts: {
      cases: traces.length,
      candidates,
      eligible_candidates: eligible,
      trace_bytes: traceBytes,
      incomplete_scans: incompleteScans
    },
    artifact_sha256: authority.bindings.artifact_sha256,
    trace_set_sha256: authority.bindings.trace_set_sha256,
    equivalence_sha256: authority.bindings.equivalence_sha256,
    correction_implemented: false
  };
  return {
    admission,
    authority,
    binding,
    manifest,
    report,
    corpus,
    comparative,
    traces
  };
}

export function validateAuthorityDocument(value) {
  expect(value && typeof value === "object" && !Array.isArray(value), "authority-object");
  expect(
    canonicalJson(Object.keys(value).sort()) ===
      canonicalJson([
        "acceptance_rules", "admission_requirements", "authorized_action",
        "bindings", "correction_implemented", "does_not_establish",
        "frozen_hypothesis_classes", "next_if_admitted",
        "original_protocol_and_recovery_reinterpreted", "outcome_aware",
        "schema", "stage", "status", "strict_equivalence", "unknown"
      ]),
    "authority-keys"
  );
  expect(
    value.schema === "kanon-d2e-analysis-authority-v1" &&
      value.stage === "D.2E-A" &&
      value.status === "development-only" &&
      value.authorized_action === "development-only-mechanism-hypothesis-generation-from-preserved-recovered-trace" &&
      value.strict_equivalence === "failed-required-comparison-unavailable" &&
      value.original_protocol_and_recovery_reinterpreted === false &&
      value.outcome_aware === true &&
      value.correction_implemented === false &&
      value.next_if_admitted === "run-existing-frozen-mechanism-analysis-on-preserved-traces-only",
    "authority-scope"
  );
  expect(
    canonicalJson(value.admission_requirements) ===
      canonicalJson(ADMISSION_REQUIREMENTS) &&
      canonicalJson(value.unknown) === canonicalJson(REQUIRED_UNKNOWN) &&
      canonicalJson(value.does_not_establish) === canonicalJson(DOES_NOT_ESTABLISH) &&
      canonicalJson(value.frozen_hypothesis_classes) === canonicalJson(HYPOTHESIS_CLASSES),
    "authority-boundaries"
  );
  expect(
    value.acceptance_rules?.changed === false &&
      value.acceptance_rules.source === "eval/d2e/PROTOCOL.md" &&
      value.acceptance_rules.minimum_support_cases === 3 &&
      value.acceptance_rules.minimum_support_categories === 2 &&
      value.acceptance_rules.minimum_control_cases === 3 &&
      value.acceptance_rules.minimum_control_categories === 2 &&
      value.acceptance_rules.minimum_counterexamples === 1 &&
      canonicalJson(value.acceptance_rules.preference_order) === canonicalJson([
          "fewer-affected-cases", "fewer-displaced-true-positives",
          "more-category-coverage", "smaller-code-boundary"
        ]),
    "authority-acceptance-rules"
  );
  expect(
    value.bindings?.source_commit === "5ce9799f6396520a7bb03d414bf0e81ff13a6700" &&
      value.bindings.artifact_sha256 === "0f87af4dfd851c268891c96237accf20b5089b0e0b95e10ac1417efebcca83a9" &&
      value.bindings.package_version === "0.4.0-rc.1" &&
      Object.entries(value.bindings).filter(
        ([key]) => !["source_commit", "package_version"].includes(key)
      ).every(([, hash]) => HASH.test(String(hash))),
    "authority-bindings"
  );
}

function validateCommitments(input) {
  const { authority: a, binding: b, manifest: m, equivalence: q } = input;
  expect(
    b.source_commit === a.bindings.source_commit &&
      b.package_version === a.bindings.package_version &&
      b.artifact_sha256 === a.bindings.artifact_sha256 &&
      b.attempt === 1 &&
      b.retries === 0 &&
      b.behind === 0 &&
      b.worktree_clean === true &&
      canonicalJson(b.configuration) &&
      sha256(Buffer.from(canonicalJson(b.configuration))) === a.bindings.attempt_configuration_sha256,
    "attempt-commitments"
  );
  expect(
    m.complete === true &&
      m.case_count === 30 &&
      m.candidate_count === 33484 &&
      m.trace_bytes === 34819892 &&
      m.trace_set_sha256 === a.bindings.trace_set_sha256 &&
      m.attempt_binding_sha256 === a.bindings.attempt_binding_sha256 &&
      m.raw_report_sha256 === a.bindings.raw_report_sha256,
    "trace-manifest-commitments"
  );
  expect(
    input.failure.trace_set_sha256 === m.trace_set_sha256 &&
      input.failure.case_count === 30 &&
      input.failure.candidate_count === 33484 &&
      input.failure.trace_bytes === 34819892 &&
      input.recovery.original_failure.tree_sha256 === a.bindings.failed_attempt_tree_sha256 &&
      input.evidence.original_failure.unchanged === true,
    "failed-recovery-commitments"
  );
  expect(
    q.semantic_equivalence.passed === false &&
      q.semantic_equivalence.all_other_frozen_fields_equal === true &&
      q.semantic_equivalence.mechanical_field_mismatch_count === 30 &&
      q.semantic_equivalence.required_comparison_unavailable_count === 60 &&
      q.trace_completeness.passed === true &&
      q.trace_completeness.observer_failure_count === 0 &&
      input.evidence.equivalence.disposition === "failed-required-comparison-unavailable",
    "equivalence-boundary"
  );
  expect(
    input.report.summary.analysis_error_count === 0 &&
      input.report.artifact.sha256 === a.bindings.artifact_sha256 &&
      input.report.artifact.conformance.passed === true &&
      input.report.artifact.conformance.report.checks.length === 43,
    "artifact-public-report"
  );
  expect(
    sha256(Buffer.from(canonicalJson(input.corpus.policy))) === a.bindings.scoring_policy_sha256 &&
      sha256(Buffer.from(canonicalJson(thresholds(input.corpus.policy)))) === a.bindings.thresholds_sha256,
    "policy-thresholds"
  );
  const paired = readJson(input.repoRoot, "eval/paired-ablation.config.json");
  expect(
    sha256(Buffer.from(canonicalJson(paired))) === a.bindings.paired_configuration_canonical_sha256,
    "paired-configuration"
  );
}

function thresholds(policy) {
  return {
    minimum_precision: policy.minimum_precision,
    minimum_recall: policy.minimum_recall,
    maximum_weighted_error_per_case: policy.maximum_weighted_error_per_case,
    dimension_thresholds: policy.dimension_thresholds,
    category_thresholds: policy.category_thresholds
  };
}

function readJson(repoRoot, relative) {
  return parseJson(readFile(repoRoot, relative, 128 * 1024 * 1024), relative);
}

function readFile(root, relative, maximumBytes) {
  const file = resolveContainedPath(root, relative, { type: "file" });
  expect(file.ok && file.stat.size <= maximumBytes, `bounded-${relative}`);
  return fs.readFileSync(file.path);
}

function readExternalFile(filePath, maximumBytes) {
  const absolute = path.resolve(filePath);
  return readFile(path.dirname(absolute), path.basename(absolute), maximumBytes);
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`Invalid ${safeTerminalText(label)} JSON.`);
  }
}

function expect(condition, label) {
  if (!condition) {
    throw new Error(`D.2E-A admission failed: ${safeTerminalText(label)}.`);
  }
}
