import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveContainedPath } from "../../src/path-security.js";
import { safeTerminalText } from "../../src/trust.js";
import { validateRankingTrace } from "./d2e-trace.js";

const MAX_ATTEMPT_JSON_BYTES = 8 * 1024 * 1024;
const MAX_CASE_TRACE_BYTES = 128 * 1024 * 1024;
const EXPECTED_D2A_SHA256 =
  "747b4f1590eda9787c87aae2e25853b8e1e8fa04893e2359eedf7a6050b7acb3";
const EXPECTED_CORPUS_SHA256 =
  "4f768f151885d26de48fe0744cafc2402a27aca61f7f049aac166309891e0c92";
const EXPECTED_COMPARATIVE_SHA256 =
  "de311bbef99ed43eca4ef71aa6eafc2f41317ad1ce13b5d09dedc52593e9fbac";

/**
 * Validate one completed attempt, prove D.2A semantic equivalence and trace
 * completeness, then produce the single all-candidate mechanism analysis.
 *
 * @param {{
 *   attemptRoot: string,
 *   baselinePath: string,
 *   corpusPath: string,
 *   comparativePath: string,
 *   protocolPath: string,
 *   traceSchemaPath: string,
 *   analysisSchemaPath: string
 * }} input
 */
export function analyzeTraceAttempt(input) {
  const root = canonicalDirectory(input.attemptRoot);
  const bindingFile = boundedFile(
    root,
    "attempt-binding.json",
    MAX_ATTEMPT_JSON_BYTES
  );
  const manifestFile = boundedFile(
    root,
    "trace-manifest.json",
    MAX_ATTEMPT_JSON_BYTES
  );
  const reportFile = boundedFile(
    root,
    "raw-report.json",
    MAX_ATTEMPT_JSON_BYTES
  );
  const binding = parseJson(bindingFile.bytes, "attempt binding");
  const manifest = parseJson(manifestFile.bytes, "trace manifest");
  const report = parseJson(reportFile.bytes, "raw report");
  requireHash(
    bindingFile.bytes,
    manifest.attempt_binding_sha256,
    "attempt binding"
  );
  requireHash(
    reportFile.bytes,
    manifest.raw_report_sha256,
    "raw report"
  );
  const baselineFile = externalBoundedFile(
    input.baselinePath,
    MAX_ATTEMPT_JSON_BYTES
  );
  const corpusFile = externalBoundedFile(
    input.corpusPath,
    MAX_ATTEMPT_JSON_BYTES
  );
  const comparativeFile = externalBoundedFile(
    input.comparativePath,
    MAX_ATTEMPT_JSON_BYTES
  );
  requireHash(baselineFile.bytes, EXPECTED_D2A_SHA256, "D.2A report");
  requireHash(corpusFile.bytes, EXPECTED_CORPUS_SHA256, "corpus");
  requireHash(
    comparativeFile.bytes,
    EXPECTED_COMPARATIVE_SHA256,
    "comparative analysis"
  );
  requireHash(
    externalBoundedFile(input.protocolPath, 1024 * 1024).bytes,
    binding.protocol_sha256,
    "protocol"
  );
  requireHash(
    externalBoundedFile(input.traceSchemaPath, 1024 * 1024).bytes,
    binding.trace_schema_sha256,
    "trace schema"
  );
  requireHash(
    externalBoundedFile(input.analysisSchemaPath, 1024 * 1024).bytes,
    binding.analysis_schema_sha256,
    "analysis schema"
  );
  const baseline = parseJson(baselineFile.bytes, "D.2A report");
  const corpus = parseJson(corpusFile.bytes, "corpus");
  const comparative = parseJson(
    comparativeFile.bytes,
    "comparative analysis"
  );
  validateAttemptBinding(binding, manifest, report);

  const traces = [];
  const caseEvidence = [];
  for (const [index, item] of manifest.case_files.entries()) {
    const relative = String(item.file || "");
    const file = boundedFile(root, relative, MAX_CASE_TRACE_BYTES);
    requireHash(file.bytes, item.sha256, `trace case ${index + 1}`);
    const trace = parseJson(file.bytes, `trace case ${index + 1}`);
    const expectedCase = corpus.cases[index];
    if (
      item.ordinal !== index + 1 ||
      item.id !== expectedCase.id ||
      item.revision !== expectedCase.revision ||
      item.file !==
        `cases/case-${String(index + 1).padStart(3, "0")}.json` ||
      item.bytes !== file.bytes.length ||
      item.candidate_count !== trace?.limits?.candidate_count ||
      item.complete !== true
    ) {
      throw new Error(
        `Trace manifest case ${index + 1} does not reconcile.`
      );
    }
    const expected = {
      protocolSha256: binding.protocol_sha256,
      traceSourceCommit: binding.source_commit,
      artifactSha256: binding.artifact_sha256,
      corpusSha256: binding.corpus_sha256,
      caseId: expectedCase.id,
      revision: expectedCase.revision,
      ordinal: index + 1
    };
    const validation = validateRankingTrace(trace, expected);
    if (!validation.valid) {
      throw new Error(
        `Trace case ${index + 1} failed validation: ` +
        validation.failures.join(", ")
      );
    }
    if (trace.completeness.complete !== true) {
      throw new Error(`Trace case ${index + 1} is incomplete.`);
    }
    traces.push(trace);
    caseEvidence.push({
      ordinal: index + 1,
      id: expectedCase.id,
      revision: expectedCase.revision,
      sha256: item.sha256,
      candidate_count: trace.candidates.length,
      eligible_candidate_count: trace.candidates.filter(
        (candidate) => candidate.ranking.eligible
      ).length,
      selected_count: trace.candidates.filter(
        (candidate) => candidate.final.selected
      ).length,
      complete: true
    });
  }
  const expectedTraceSetSha256 = sha256(
    Buffer.from(
      JSON.stringify(
        manifest.case_files.map((item) => ({
          ordinal: item.ordinal,
          sha256: item.sha256
        }))
      )
    )
  );
  if (
    manifest.trace_set_sha256 !== expectedTraceSetSha256 ||
    manifest.candidate_count !==
      traces.reduce(
        (total, trace) => total + trace.candidates.length,
        0
      ) ||
    manifest.trace_bytes !==
      manifest.case_files.reduce(
        (total, item) => total + item.bytes,
        0
      )
  ) {
    throw new Error("Trace-set manifest totals do not reconcile.");
  }
  const comparison = compareD2aSemantics(report, baseline);
  if (!comparison.passed) {
    throw new Error(
      "Traced report is not semantically equivalent to frozen D.2A."
    );
  }
  proveReportTraceAgreement(report, traces);

  const equivalence = {
    schema: "kanon-d2e-equivalence-v1",
    bindings: evidenceBindings(binding, manifest, {
      raw_report_sha256: sha256(reportFile.bytes),
      baseline_report_sha256: sha256(baselineFile.bytes)
    }),
    semantic_equivalence: comparison,
    trace_completeness: {
      passed:
        traces.length === 30 &&
        traces.every((trace) => trace.completeness.complete),
      case_count: traces.length,
      candidate_count: traces.reduce(
        (total, trace) => total + trace.candidates.length,
        0
      ),
      eligible_candidate_count: traces.reduce(
        (total, trace) =>
          total +
          trace.candidates.filter(
            (candidate) => candidate.ranking.eligible
          ).length,
        0
      ),
      incomplete_scan_count: traces.filter(
        (trace) => !trace.scan.complete
      ).length,
      observer_failure_count: traces.reduce(
        (total, trace) =>
          total + trace.completeness.observer_failures,
        0
      ),
      cases: caseEvidence
    },
    historical_internal_membership: {
      status: "unavailable-in-d2a",
      claim:
        "Frozen D.2A retained no internal per-candidate list.",
      replacement_proof:
        "Each traced case reconciles scanner input, ranked membership, final decision, and public selection in one canonical invocation."
    }
  };
  const mechanismAnalysis = buildMechanismAnalysis({
    binding,
    manifest,
    report,
    corpus,
    comparative,
    traces,
    equivalenceSha256: sha256(
      Buffer.from(`${canonicalJson(equivalence)}\n`)
    )
  });
  return { equivalence, mechanismAnalysis };
}

/**
 * @param {unknown} actual
 * @param {unknown} baseline
 */
export function compareD2aSemantics(actual, baseline) {
  const actualProjection = semanticReportProjection(actual);
  const baselineProjection = semanticReportProjection(baseline);
  const actualBytes = Buffer.from(canonicalJson(actualProjection));
  const baselineBytes = Buffer.from(canonicalJson(baselineProjection));
  return {
    passed: actualBytes.equals(baselineBytes),
    actual_projection_sha256: sha256(actualBytes),
    baseline_projection_sha256: sha256(baselineBytes),
    compared_case_count: Array.isArray(actualProjection.results)
      ? actualProjection.results.length
      : 0,
    exact_fields: [
      "analyzer-version-and-source",
      "corpus-identity-order-and-role",
      "case-identities-revisions-and-categories",
      "important-file-membership-and-order",
      "run-command-membership-and-order",
      "test-command-membership-and-order",
      "labels",
      "abstentions-and-coverage",
      "scan-completeness-and-bounded-diagnostics",
      "analysis-errors",
      "per-case-dimensions-and-totals",
      "aggregate-policy-dimensions-categories-and-totals",
      "gate-failures-and-final-result"
    ],
    ignored_provenance_fields: [
      "generated_at",
      "analysis_duration_ms",
      "candidate_commit_and_worktree",
      "artifact_and_conformance_provenance",
      "environment",
      "cache_root",
      "ranking_trace_metadata"
    ]
  };
}

/**
 * @param {unknown} value
 */
export function semanticReportProjection(value) {
  if (!plainRecord(value)) {
    throw new Error("Evaluation report must be an object.");
  }
  const projection = structuredClone(value);
  for (const field of [
    "generated_at",
    "candidate",
    "artifact",
    "environment",
    "cache_root",
    "ranking_trace"
  ]) {
    delete projection[field];
  }
  if (Array.isArray(projection.results)) {
    for (const result of projection.results) {
      if (plainRecord(result)) {
        delete result.analysis_duration_ms;
      }
    }
  }
  return projection;
}

function proveReportTraceAgreement(report, traces) {
  if (
    !Array.isArray(report.results) ||
    report.results.length !== traces.length
  ) {
    throw new Error("Report/trace case membership differs.");
  }
  for (const [index, trace] of traces.entries()) {
    const result = report.results[index];
    const selected = trace.candidates
      .filter((candidate) => candidate.final.selected)
      .sort((left, right) =>
        left.final.rank - right.final.rank
      )
      .map((candidate) => candidate.normalized_path);
    if (
      trace.case.id !== result.id ||
      trace.case.revision !== result.revision ||
      canonicalJson(selected) !==
        canonicalJson(result.predictions.important_files) ||
      canonicalJson(trace.predictions) !==
        canonicalJson(result.predictions) ||
      trace.scan.complete !== result.scan_complete
    ) {
      throw new Error(`Report/trace disagreement in case ${index + 1}.`);
    }
  }
}

function buildMechanismAnalysis(input) {
  const comparativeMap = comparativeStatusMap(input.comparative);
  const statusCounts = emptyStatusCounts();
  const categoryCounts = new Map();
  const mechanisms = new Map();
  const candidateReferences = [];
  let unmatchedLabelCount = 0;
  let incompleteCandidateCount = 0;
  for (const [index, trace] of input.traces.entries()) {
    const corpusCase = input.corpus.cases[index];
    const labels = new Set(
      corpusCase.labels.important_files.map((item) => item.path)
    );
    const tracedPaths = new Set(
      trace.candidates.map((candidate) => candidate.normalized_path)
    );
    unmatchedLabelCount += Array.from(labels).filter(
      (label) => !tracedPaths.has(label)
    ).length;
    for (const candidate of trace.candidates) {
      const status = candidateStatus(candidate, labels);
      statusCounts[status] += 1;
      if (!trace.scan.complete) {
        incompleteCandidateCount += 1;
      }
      if (!categoryCounts.has(corpusCase.category)) {
        categoryCounts.set(corpusCase.category, emptyStatusCounts());
      }
      categoryCounts.get(corpusCase.category)[status] += 1;
      const reference = {
        case_id: corpusCase.id,
        category: corpusCase.category,
        path: candidate.normalized_path,
        candidate_id: candidate.candidate_id,
        status,
        scan_complete: trace.scan.complete,
        comparative_status:
          comparativeMap.get(
            `${corpusCase.id}\0${candidate.normalized_path}`
          ) || "not-reviewed"
      };
      candidateReferences.push(reference);
      for (const mechanism of candidateMechanisms(candidate)) {
        if (!mechanisms.has(mechanism.id)) {
          mechanisms.set(
            mechanism.id,
            mechanismRecord(mechanism)
          );
        }
        addMechanismMember(
          mechanisms.get(mechanism.id),
          reference,
          candidate
        );
      }
    }
  }
  const mechanismRecords = Array.from(mechanisms.values())
    .map(finalizeMechanism)
    .sort((left, right) => left.id.localeCompare(right.id));
  return {
    schema: "kanon-d2e-mechanism-analysis-v1",
    bindings: evidenceBindings(input.binding, input.manifest, {
      equivalence_sha256: input.equivalenceSha256,
      comparative_analysis_sha256: EXPECTED_COMPARATIVE_SHA256
    }),
    coverage: {
      case_count: input.traces.length,
      category_count: categoryCounts.size,
      candidate_count: candidateReferences.length,
      eligible_candidate_count: input.traces.reduce(
        (total, trace) =>
          total +
          trace.candidates.filter(
            (candidate) => candidate.ranking.eligible
          ).length,
        0
      ),
      ranking_ineligible_candidate_count: input.traces.reduce(
        (total, trace) =>
          total +
          trace.candidates.filter(
            (candidate) => !candidate.ranking.eligible
          ).length,
        0
      ),
      incomplete_scan_count: input.traces.filter(
        (trace) => !trace.scan.complete
      ).length,
      incomplete_candidate_count: incompleteCandidateCount,
      unmatched_label_count: unmatchedLabelCount,
      all_candidates_analyzed: true,
      candidate_coverage_sha256: sha256(
        Buffer.from(
          canonicalJson(
            candidateReferences.map((item) => ({
              candidate_id: item.candidate_id,
              status: item.status
            }))
          )
        )
      )
    },
    status_counts: statusCounts,
    category_status_counts: Array.from(categoryCounts.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([category, counts]) => ({ category, ...counts })),
    mechanisms: mechanismRecords,
    structurally_qualifying_mechanisms: mechanismRecords
      .filter((mechanism) => mechanism.structurally_qualifies)
      .map((mechanism) => mechanism.id),
    analysis_rules: {
      minimum_support_cases: 3,
      minimum_support_categories: 2,
      minimum_control_cases: 3,
      minimum_control_categories: 2,
      minimum_counterexamples: 1,
      official_status_source: "frozen-development-labels",
      comparative_status:
        "correlated-control-only-not-ground-truth",
      correction_not_implemented: true
    },
    limitations: [
      "Outcome-aware development analysis; no blinding or independence claim.",
      "Comparative-review status is same-family correlated evidence, not ground truth.",
      "Nine historical scans may remain incomplete; incomplete evidence is Unknown.",
      "A structural count gate does not by itself prove a small safe correction.",
      "No counterfactual product execution or official-score recalculation occurred."
    ]
  };
}

function candidateMechanisms(candidate) {
  const output = [];
  if (candidate.final.selection_heuristic) {
    output.push({
      id: `selection:${candidate.final.selection_heuristic}`,
      kind: "selection",
      production_boundary:
        selectionBoundary(candidate.final.selection_heuristic)
    });
  }
  for (const contribution of candidate.ranking.contributions) {
    if (contribution.value !== 0) {
      output.push({
        id: `score:${contribution.name}`,
        kind: "score-contribution",
        production_boundary: "src/code-intel/rank.js"
      });
    }
  }
  if (candidate.final.result === "cap-excluded") {
    output.push({
      id: "curation:final-cap",
      kind: "curation",
      production_boundary: "src/code-intel/curate-common.js finish"
    });
  }
  if (candidate.curation.deduplicated) {
    output.push({
      id: "curation:deduplication",
      kind: "curation",
      production_boundary: "src/code-intel/curate-common.js add"
    });
  }
  for (const visit of candidate.curation.visits) {
    if (visit.decision === "quota-excluded") {
      output.push({
        id: `curation:quota:${visit.stage}`,
        kind: "curation",
        production_boundary:
          `src/code-intel/curate.js ${visit.stage} quota`
      });
    }
    if (["selected", "duplicate"].includes(visit.decision)) {
      output.push({
        id: `curation:stage-order:${visit.stage}`,
        kind: "stage-order",
        production_boundary:
          `src/code-intel/curate.js ${visit.stage} stage`
      });
    }
  }
  return Array.from(
    new Map(output.map((item) => [item.id, item])).values()
  );
}

function selectionBoundary(heuristic) {
  return [
    "root-readme",
    "root-manifest",
    "workspace-contract",
    "root-task-contract",
    "framework-declaration",
    "manifest-entrypoint",
    "module-named-entrypoint",
    "executable-syntax",
    "ecosystem-test-anchor",
    "local-import-fan-in",
    "literal-local-reference"
  ].includes(heuristic)
    ? `src/code-intel/curate.js ${heuristic} stage`
    : "src/code-intel/curate.js";
}

function mechanismRecord(mechanism) {
  return {
    id: mechanism.id,
    kind: mechanism.kind,
    production_boundary: mechanism.production_boundary,
    member_count: 0,
    counts: emptyStatusCounts(),
    support_refs: [],
    control_refs: [],
    counterexample_refs: [],
    support_cases: new Set(),
    support_categories: new Set(),
    control_cases: new Set(),
    control_categories: new Set(),
    incomplete_cases: new Set(),
    selected_scores: [],
    selected_fan_in: [],
    selected_references: []
  };
}

function addMechanismMember(record, reference, candidate) {
  record.member_count += 1;
  record.counts[reference.status] += 1;
  if (!reference.scan_complete) {
    record.incomplete_cases.add(reference.case_id);
  }
  if (reference.status === "selected-false-positive") {
    record.support_cases.add(reference.case_id);
    record.support_categories.add(reference.category);
    if (record.support_refs.length < 20) {
      record.support_refs.push(reference);
    }
    if (
      reference.comparative_status === "selected" &&
      record.counterexample_refs.length < 20
    ) {
      record.counterexample_refs.push(reference);
    }
  }
  if (reference.status === "selected-true-positive") {
    record.control_cases.add(reference.case_id);
    record.control_categories.add(reference.category);
    if (record.control_refs.length < 20) {
      record.control_refs.push(reference);
    }
  }
  if (candidate.final.selected) {
    if (candidate.ranking.score !== null) {
      record.selected_scores.push(candidate.ranking.score);
    }
    record.selected_fan_in.push(candidate.ranking.fan_in);
    record.selected_references.push(candidate.ranking.referenced_by);
  }
}

function finalizeMechanism(record) {
  const supportCaseCount = record.support_cases.size;
  const supportCategoryCount = record.support_categories.size;
  const controlCaseCount = record.control_cases.size;
  const controlCategoryCount = record.control_categories.size;
  const counterexampleCount = record.counterexample_refs.length;
  const historicallyFalsified =
    record.id === "selection:local-import-fan-in";
  const structuralReasons = [];
  if (record.kind !== "selection") {
    structuralReasons.push("not-one-selection-boundary");
  }
  if (supportCaseCount < 3) {
    structuralReasons.push("support-cases-below-3");
  }
  if (supportCategoryCount < 2) {
    structuralReasons.push("support-categories-below-2");
  }
  if (controlCaseCount < 3) {
    structuralReasons.push("control-cases-below-3");
  }
  if (controlCategoryCount < 2) {
    structuralReasons.push("control-categories-below-2");
  }
  if (counterexampleCount < 1) {
    structuralReasons.push("counterexample-absent");
  }
  if (historicallyFalsified) {
    structuralReasons.push("blanket-pruning-falsified-by-d2b");
  }
  return {
    id: record.id,
    kind: record.kind,
    production_boundary: record.production_boundary,
    member_count: record.member_count,
    counts: record.counts,
    support: {
      candidate_count:
        record.counts["selected-false-positive"],
      case_count: supportCaseCount,
      category_count: supportCategoryCount,
      examples: record.support_refs
    },
    controls: {
      candidate_count:
        record.counts["selected-true-positive"],
      case_count: controlCaseCount,
      category_count: controlCategoryCount,
      examples: record.control_refs
    },
    counterexamples: {
      candidate_count: counterexampleCount,
      definition:
        "Frozen false positive selected by the correlated comparative reviewer.",
      examples: record.counterexample_refs
    },
    incomplete_case_count: record.incomplete_cases.size,
    selected_feature_ranges: {
      score: numericRange(record.selected_scores),
      fan_in: numericRange(record.selected_fan_in),
      referenced_by: numericRange(record.selected_references)
    },
    bounded_effect_if_suppressed: {
      maximum_selected_candidates_affected:
        record.counts["selected-true-positive"] +
        record.counts["selected-false-positive"],
      false_positive_removal_range: [
        0,
        record.counts["selected-false-positive"]
      ],
      true_positive_displacement_range: [
        0,
        record.counts["selected-true-positive"]
      ],
      added_false_negative_range: [
        0,
        record.counts["selected-true-positive"]
      ],
      precision_direction: "unknown-without-discriminating-boundary",
      recall_direction: "non-increasing-under-blanket-suppression",
      displacement_risk:
        record.counts["selected-true-positive"] > 0
          ? "observed"
          : "not-observed"
    },
    historically_falsified_blanket_boundary: historicallyFalsified,
    structurally_qualifies: structuralReasons.length === 0,
    structural_rejection_reasons: structuralReasons
  };
}

function candidateStatus(candidate, labels) {
  if (candidate.final.selected) {
    return labels.has(candidate.normalized_path)
      ? "selected-true-positive"
      : "selected-false-positive";
  }
  return labels.has(candidate.normalized_path)
    ? "unselected-false-negative"
    : "unselected-control";
}

function comparativeStatusMap(value) {
  const output = new Map();
  for (const item of Array.isArray(value?.cases) ? value.cases : []) {
    for (const candidate of Array.isArray(item.candidates)
      ? item.candidates
      : []) {
      output.set(
        `${item.d2a_case_id}\0${candidate.path}`,
        candidate.review_status
      );
    }
  }
  return output;
}

function emptyStatusCounts() {
  return {
    "selected-true-positive": 0,
    "selected-false-positive": 0,
    "unselected-false-negative": 0,
    "unselected-control": 0
  };
}

function numericRange(values) {
  return values.length === 0
    ? { minimum: null, maximum: null }
    : {
        minimum: Math.min(...values),
        maximum: Math.max(...values)
      };
}

function validateAttemptBinding(binding, manifest, report) {
  if (
    binding?.schema !== "kanon-d2e-trace-attempt-binding-v1" ||
    manifest?.schema !== "kanon-d2e-trace-manifest-v1" ||
    binding.attempt !== 1 ||
    binding.retries !== 0 ||
    binding.branch !== "release/v.1.0.0" ||
    binding.upstream !== "origin/release/v.1.0.0" ||
    !Number.isInteger(binding.ahead) ||
    binding.ahead < 0 ||
    binding.behind !== 0 ||
    binding.worktree_clean !== true ||
    manifest.attempt !== 1 ||
    manifest.retries !== 0 ||
    binding.source_commit !== manifest.source_commit ||
    binding.protocol_sha256 !== manifest.protocol_sha256 ||
    binding.trace_schema_sha256 !== manifest.trace_schema_sha256 ||
    binding.analysis_schema_sha256 !== manifest.analysis_schema_sha256 ||
    binding.corpus_sha256 !== EXPECTED_CORPUS_SHA256 ||
    binding.corpus_sha256 !== manifest.corpus_sha256 ||
    binding.d2a_report_sha256 !== EXPECTED_D2A_SHA256 ||
    binding.d2a_report_sha256 !== manifest.d2a_report_sha256 ||
    binding.cache_identity_sha256 !==
      manifest.cache_identity_sha256 ||
    binding.artifact_sha256 !== manifest.artifact_sha256 ||
    manifest.complete !== true ||
    manifest.case_count !== 30 ||
    !Array.isArray(manifest.case_files) ||
    manifest.case_files.length !== 30 ||
    report?.candidate?.commit !== binding.source_commit ||
    report?.candidate?.worktree_clean !== true ||
    report?.candidate?.version !== "0.4.0-rc.1" ||
    report?.analyzer?.version !== "0.4.0-rc.1" ||
    report?.artifact?.sha256 !== binding.artifact_sha256 ||
    report?.corpus?.manifest_sha256 !== EXPECTED_CORPUS_SHA256
  ) {
    throw new Error("D.2E attempt bindings do not reconcile.");
  }
}

function evidenceBindings(binding, manifest, extra) {
  return {
    source_commit: binding.source_commit,
    package_version: binding.package_version,
    protocol_sha256: binding.protocol_sha256,
    trace_schema_sha256: binding.trace_schema_sha256,
    analysis_schema_sha256: binding.analysis_schema_sha256,
    corpus_sha256: binding.corpus_sha256,
    d2a_report_sha256: binding.d2a_report_sha256,
    cache_identity_sha256: binding.cache_identity_sha256,
    artifact_sha256: binding.artifact_sha256,
    conformance_report_sha256:
      binding.conformance_report_sha256,
    trace_set_sha256: manifest.trace_set_sha256,
    ...extra
  };
}

function canonicalDirectory(directory) {
  const result = resolveContainedPath(directory, ".", {
    allowRoot: true,
    type: "directory"
  });
  if (!result.ok) {
    throw new Error(`Unsafe attempt directory: ${result.reason}`);
  }
  return result.root;
}

function boundedFile(root, relative, maximumBytes) {
  const file = resolveContainedPath(root, relative, { type: "file" });
  if (!file.ok || file.stat.size > maximumBytes) {
    throw new Error(`Unsafe or oversized evidence file: ${relative}`);
  }
  return { ...file, bytes: fs.readFileSync(file.path) };
}

function externalBoundedFile(filePath, maximumBytes) {
  const resolved = path.resolve(filePath);
  const root = canonicalDirectory(path.dirname(resolved));
  return boundedFile(root, path.basename(resolved), maximumBytes);
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`Invalid ${safeTerminalText(label)} JSON.`);
  }
}

function requireHash(bytes, expected, label) {
  if (sha256(bytes) !== expected) {
    throw new Error(`${safeTerminalText(label)} SHA-256 mismatch.`);
  }
}

export function canonicalJson(value) {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (!plainRecord(value)) {
    throw new Error("Canonical JSON accepts plain JSON values only.");
  }
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )
    .join(",")}}`;
}

export function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function validateD2eAnalysis(value) {
  const failures = [];
  if (!plainRecord(value)) {
    return { valid: false, failures: ["analysis-object"] };
  }
  exactObjectKeys(value, [
    "schema_version",
    "bindings",
    "disposition",
    "counts",
    "support",
    "controls",
    "counterexamples",
    "preferred_hypothesis",
    "next_correction_boundary",
    "effects",
    "governance",
    "limitations",
    "correction_implemented"
  ], failures, "analysis");
  analysisExpect(
    value.schema_version === "kanon-d2e-analysis-v1",
    failures,
    "schema-version"
  );
  const supported =
    value.disposition === "supported-generic-hypothesis";
  analysisExpect(
    supported ||
      value.disposition === "no-supported-generic-hypothesis",
    failures,
    "disposition"
  );
  validateAnalysisBindings(value.bindings, failures);
  validateAnalysisCounts(value.counts, failures);
  if (supported && plainRecord(value.counts)) {
    analysisExpect(
      value.counts.support_cases >= 3 &&
        value.counts.support_categories >= 2 &&
        value.counts.control_cases >= 3 &&
        value.counts.control_categories >= 2 &&
        value.counts.counterexamples >= 1,
      failures,
      "hypothesis-minimum-evidence"
    );
  }
  for (const field of ["support", "controls", "counterexamples"]) {
    validateEvidenceList(value[field], failures, field);
  }
  validateHypothesis(
    value.preferred_hypothesis,
    failures,
    supported
  );
  analysisExpect(
    supported
      ? validAnalysisText(value.next_correction_boundary)
      : value.next_correction_boundary === null,
    failures,
    "correction-boundary"
  );
  validateEffects(value.effects, failures);
  validateGovernance(value.governance, failures, supported);
  analysisExpect(
    Array.isArray(value.limitations) &&
      value.limitations.length >= 1 &&
      value.limitations.length <= 32 &&
      value.limitations.every(validAnalysisText),
    failures,
    "limitations"
  );
  analysisExpect(
    value.correction_implemented === false,
    failures,
    "correction-not-implemented"
  );
  return {
    valid: failures.length === 0,
    failures: Array.from(new Set(failures)).slice(0, 32)
  };
}

function validateAnalysisBindings(value, failures) {
  const fields = [
    "source_commit",
    "protocol_sha256",
    "trace_schema_sha256",
    "analysis_schema_sha256",
    "corpus_sha256",
    "d2a_report_sha256",
    "cache_identity_sha256",
    "artifact_sha256",
    "conformance_report_sha256",
    "attempt_binding_sha256",
    "raw_report_sha256",
    "trace_set_sha256",
    "equivalence_sha256",
    "mechanism_analysis_sha256"
  ];
  analysisExpect(
    plainRecord(value),
    failures,
    "bindings-object"
  );
  if (!plainRecord(value)) return;
  exactObjectKeys(value, fields, failures, "bindings");
  for (const field of fields) {
    const pattern =
      field === "source_commit"
        ? /^[0-9a-f]{40}$/
        : /^[0-9a-f]{64}$/;
    analysisExpect(
      pattern.test(String(value[field] || "")),
      failures,
      `binding-${field}`
    );
  }
}

function validateAnalysisCounts(value, failures) {
  const fields = [
    "cases",
    "candidates",
    "eligible_candidates",
    "support_candidates",
    "support_cases",
    "support_categories",
    "control_candidates",
    "control_cases",
    "control_categories",
    "counterexamples",
    "incomplete_scans"
  ];
  analysisExpect(plainRecord(value), failures, "counts-object");
  if (!plainRecord(value)) return;
  exactObjectKeys(value, fields, failures, "counts");
  for (const field of fields) {
    analysisExpect(
      Number.isInteger(value[field]) &&
        value[field] >= 0 &&
        value[field] <= 750_000,
      failures,
      `count-${field}`
    );
  }
  analysisExpect(value.cases === 30, failures, "case-count");
}

function validateEvidenceList(value, failures, label) {
  analysisExpect(
    Array.isArray(value) && value.length <= 100,
    failures,
    `${label}-array`
  );
  if (!Array.isArray(value)) return;
  for (const item of value) {
    analysisExpect(
      plainRecord(item),
      failures,
      `${label}-item`
    );
    if (!plainRecord(item)) continue;
    exactObjectKeys(item, [
      "case_id",
      "category",
      "candidate_id",
      "path",
      "status",
      "scan_complete",
      "comparative_status"
    ], failures, `${label}-item`);
    for (const field of [
      "case_id",
      "category",
      "path",
      "comparative_status"
    ]) {
      analysisExpect(
        validAnalysisText(item[field]),
        failures,
        `${label}-${field}`
      );
    }
    analysisExpect(
      /^candidate-[0-9a-f]{64}$/.test(
        String(item.candidate_id || "")
      ),
      failures,
      `${label}-candidate-id`
    );
    analysisExpect(
      [
        "selected-true-positive",
        "selected-false-positive",
        "unselected-false-negative",
        "unselected-control"
      ].includes(item.status),
      failures,
      `${label}-status`
    );
    analysisExpect(
      typeof item.scan_complete === "boolean",
      failures,
      `${label}-scan`
    );
  }
}

function validateHypothesis(value, failures, required) {
  if (!required) {
    analysisExpect(value === null, failures, "hypothesis-null");
    return;
  }
  analysisExpect(
    plainRecord(value),
    failures,
    "hypothesis-object"
  );
  if (!plainRecord(value)) return;
  const fields = [
    "id",
    "production_mechanism",
    "claim",
    "small_correction",
    "falsification"
  ];
  exactObjectKeys(value, fields, failures, "hypothesis");
  for (const field of fields) {
    analysisExpect(
      validAnalysisText(value[field]),
      failures,
      `hypothesis-${field}`
    );
  }
}

function validateEffects(value, failures) {
  analysisExpect(plainRecord(value), failures, "effects-object");
  if (!plainRecord(value)) return;
  exactObjectKeys(value, [
    "precision_direction",
    "false_positive_range",
    "recall_direction",
    "true_positive_displacement_range",
    "added_false_negative_range",
    "displacement_risk"
  ], failures, "effects");
  for (const field of [
    "precision_direction",
    "recall_direction",
    "displacement_risk"
  ]) {
    analysisExpect(
      validAnalysisText(value[field]),
      failures,
      `effects-${field}`
    );
  }
  for (const field of [
    "false_positive_range",
    "true_positive_displacement_range",
    "added_false_negative_range"
  ]) {
    const range = value[field];
    analysisExpect(
      Array.isArray(range) &&
        range.length === 2 &&
        range.every(
          (item) =>
            Number.isInteger(item) &&
            item >= 0 &&
            item <= 750_000
        ) &&
        range[0] <= range[1],
      failures,
      `effects-${field}`
    );
  }
}

function validateGovernance(value, failures, supported) {
  analysisExpect(
    plainRecord(value),
    failures,
    "governance-object"
  );
  if (!plainRecord(value)) return;
  exactObjectKeys(value, [
    "outcome_aware",
    "independent_evidence",
    "human_label_governance",
    "next_action"
  ], failures, "governance");
  analysisExpect(
    value.outcome_aware === true,
    failures,
    "governance-outcome-aware"
  );
  analysisExpect(
    value.independent_evidence === false,
    failures,
    "governance-independence"
  );
  analysisExpect(
    value.human_label_governance === "separate-and-blocked",
    failures,
    "governance-labels"
  );
  analysisExpect(
    value.next_action ===
      (supported
        ? "one-bounded-correction-cycle"
        : "honest-prerelease-or-governance-wait"),
    failures,
    "governance-next-action"
  );
}

function exactObjectKeys(value, expected, failures, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  analysisExpect(
    JSON.stringify(actual) === JSON.stringify(wanted),
    failures,
    `${label}-keys`
  );
}

function validAnalysisText(value) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 1_000 &&
    safeTerminalText(value) === value
  );
}

function analysisExpect(condition, failures, label) {
  if (!condition && !failures.includes(label)) {
    failures.push(label);
  }
}

function plainRecord(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
