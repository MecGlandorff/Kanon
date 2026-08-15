import crypto from "node:crypto";
import { safeTerminalText } from "../../src/trust.js";
import { normalizeRelPath } from "../../src/code-intel/shared.js";

export const TRACE_SCHEMA_VERSION = "kanon-d2e-ranking-trace-v1";
export const COMPACT_TRACE_SCHEMA_VERSION =
  "kanon-d2e-compact-ranking-trace-v2";
export const TRACE_LIMITS = Object.freeze({
  candidatesPerCase: 25_000,
  stagesPerCase: 32,
  visitsPerCase: 200_000,
  bytesPerCase: 128 * 1024 * 1024,
  textBytes: 1_000,
  signalsPerCandidate: 64,
  contributionsPerCandidate: 64,
  visitsPerCandidate: 64,
  pathFailuresPerCase: 50,
  budgetFlagsPerCase: 16
});
export const EXPECTED_TRACE_STAGES = Object.freeze([
  "root-readme",
  "root-contracts",
  "workspace-tasks-pre",
  "root-tasks",
  "framework-declarations",
  "manifest-entrypoints",
  "go-entrypoint",
  "ecosystem-test-anchor",
  "package-declarations",
  "workspace-tasks-post",
  "workspace-readme",
  "fan-in",
  "literal-reference",
  "executable-syntax",
  "final-cap"
]);
export const EXPECTED_COMPACT_TRACE_STAGES = Object.freeze([
  "compact-important-files",
  "evaluation-five-file-cap"
]);
const LEGACY_TRACE_CONTRACT = Object.freeze({
  schemaVersion: TRACE_SCHEMA_VERSION,
  stages: EXPECTED_TRACE_STAGES,
  capStage: "final-cap",
  candidateDomain: "kanon-d2e-candidate-v1"
});
const COMPACT_TRACE_CONTRACT = Object.freeze({
  schemaVersion: COMPACT_TRACE_SCHEMA_VERSION,
  stages: EXPECTED_COMPACT_TRACE_STAGES,
  capStage: "evaluation-five-file-cap",
  candidateDomain: "kanon-d2e-compact-candidate-v2"
});

/**
 * @typedef {{
 *   protocolSha256: string,
 *   traceSourceCommit: string,
 *   artifactSha256: string,
 *   corpusSha256: string,
 *   caseId: string,
 *   revision: string,
 *   ordinal: number
 * }} TraceBinding
 * @typedef {{
 *   schemaVersion: string,
 *   stages: readonly string[],
 *   capStage: string,
 *   candidateDomain: string
 * }} TraceContract
 */

/**
 * Create the evaluator-owned sink for the private production observer. The
 * sink never throws into product code; malformed or excessive observations
 * become explicit completeness failures.
 *
 * @param {TraceBinding} binding
 */
export function createRankingTraceCollector(binding) {
  return createTraceCollector(binding, LEGACY_TRACE_CONTRACT);
}

/** @param {TraceBinding} binding */
export function createCompactRankingTraceCollector(binding) {
  return createTraceCollector(binding, COMPACT_TRACE_CONTRACT);
}

/** @param {TraceBinding} binding @param {TraceContract} contract */
function createTraceCollector(binding, contract) {
  /** @type {Map<string, ReturnType<typeof candidateRecord>>} */
  const candidates = new Map();
  /** @type {Map<number, ReturnType<typeof stageRecord>>} */
  const stages = new Map();
  /** @type {string[]} */
  const failures = [];
  const finalizedCandidates = new Set();
  const exitedStages = new Set();
  let observerFailures = 0;
  let visitCount = 0;

  /**
   * @param {Record<string, unknown>} event
   * @returns {void}
   */
  function observer(event) {
    try {
      consume(event);
    } catch (error) {
      observerFailures += 1;
      addFailure(
        `observer:${boundedText(error?.message || error || "unknown")}`
      );
    }
  }

  /**
   * @param {ReturnType<import("../../src/analyze.js").analyzeRepo>} analysis
   */
  function finalize(analysis) {
    const state = analysis?.state;
    const scan = analysis?.inspection?.scan;
    if (!state || typeof state !== "object" || !scan) {
      throw new Error("Cannot finalize a trace without analysis state.");
    }
    for (const candidate of candidates.values()) {
      if (!candidate.ranking.eligible) {
        candidate.final = {
          rank: null,
          selected: false,
          result: "ranking-ineligible",
          selection_reason: null,
          selection_heuristic: null
        };
      }
      applyEvidenceState(candidate, scan);
    }

    const orderedStages = Array.from(stages.values()).sort(
      (left, right) => left.ordinal - right.ordinal
    );
    const orderedCandidates = Array.from(candidates.values()).sort(
      (left, right) =>
        left.ranking.input_position - right.ranking.input_position
    );
    const predictions = {
      important_files: Array.isArray(state.important_files)
        ? state.important_files.map((item) => boundedText(item?.path))
        : [],
      run: commandPredictions(state.commands?.run),
      test: commandPredictions(state.commands?.test)
    };
    const checks = completenessChecks({
      candidates: orderedCandidates,
      stages: orderedStages,
      predictions,
      scan,
      observerFailures,
      finalizedCandidates,
      exitedStages,
      visitCount
    }, contract);
    for (const check of checks) {
      if (!check.passed) {
        addFailure(check.name);
      }
    }

    const trace = {
      schema_version: contract.schemaVersion,
      protocol_sha256: binding.protocolSha256,
      trace_source_commit: binding.traceSourceCommit,
      artifact_sha256: binding.artifactSha256,
      corpus_sha256: binding.corpusSha256,
      case: {
        id: boundedText(binding.caseId),
        revision: binding.revision,
        ordinal: binding.ordinal
      },
      limits: {
        candidate_count: orderedCandidates.length,
        stage_count: orderedStages.length,
        stage_visit_count: visitCount,
        serialized_bytes: 0
      },
      scan: boundedScan(scan),
      stages: orderedStages,
      candidates: orderedCandidates,
      predictions,
      completeness: {
        complete:
          failures.length === 0 &&
          observerFailures === 0 &&
          checks.every((check) => check.passed),
        checks,
        failures: failures.slice(0, 32),
        observer_failures: observerFailures
      }
    };
    stabilizeSerializedBytes(trace);
    if (trace.limits.serialized_bytes > TRACE_LIMITS.bytesPerCase) {
      trace.completeness.complete = false;
      if (trace.completeness.failures.length < 32) {
        trace.completeness.failures.push("serialized-byte-limit");
      }
      stabilizeSerializedBytes(trace);
    }
    const validation = validateTrace(trace, binding, contract);
    if (!validation.valid) {
      trace.completeness.complete = false;
      for (const issue of validation.failures) {
        if (
          trace.completeness.failures.length < 32 &&
          !trace.completeness.failures.includes(issue)
        ) {
          trace.completeness.failures.push(issue);
        }
      }
      stabilizeSerializedBytes(trace);
    }
    return trace;
  }

  /**
   * @param {Record<string, unknown>} event
   */
  function consume(event) {
    if (!plainRecord(event) || typeof event.type !== "string") {
      throw new Error("invalid-event");
    }
    if (event.type === "candidate-discovered") {
      const path = tracePath(event.path);
      if (candidates.has(path)) {
        throw new Error("duplicate-candidate-discovery");
      }
      if (candidates.size >= TRACE_LIMITS.candidatesPerCase) {
        throw new Error("candidate-limit");
      }
      candidates.set(path, candidateRecord(binding, path, event, contract));
      return;
    }
    if (event.type === "curation-stage-entered") {
      const ordinal = boundedInteger(
        event.stage_ordinal,
        1,
        TRACE_LIMITS.stagesPerCase
      );
      if (stages.has(ordinal)) {
        throw new Error("duplicate-stage-entry");
      }
      stages.set(ordinal, stageRecord(event, candidates));
      return;
    }
    if (event.type === "curation-stage-exited") {
      const ordinal = boundedInteger(
        event.stage_ordinal,
        1,
        TRACE_LIMITS.stagesPerCase
      );
      const stage = stages.get(ordinal);
      if (!stage || stage.name !== boundedText(event.stage)) {
        throw new Error("unmatched-stage-exit");
      }
      if (exitedStages.has(ordinal)) {
        throw new Error("duplicate-stage-exit");
      }
      exitedStages.add(ordinal);
      stage.selected_on_exit = candidateIds(
        event.selected,
        candidates
      );
      return;
    }

    const path = tracePath(event.path);
    const candidate = candidates.get(path);
    if (!candidate) {
      throw new Error("event-before-discovery");
    }
    if (event.type === "candidate-scored") {
      if (candidate.ranking.score !== null) {
        throw new Error("duplicate-candidate-score");
      }
      const signals = Array.isArray(event.signals)
        ? event.signals.slice(0, TRACE_LIMITS.signalsPerCandidate)
        : [];
      const contributions = Array.isArray(event.contributions)
        ? event.contributions.slice(
            0,
            TRACE_LIMITS.contributionsPerCandidate
          )
        : [];
      if (
        signals.length !== (event.signals?.length || 0) ||
        contributions.length !== (event.contributions?.length || 0)
      ) {
        addFailure("candidate-detail-limit");
      }
      candidate.ranking.score = finiteNumber(event.score);
      candidate.ranking.fan_in = nonnegativeInteger(event.fan_in);
      candidate.ranking.referenced_by =
        nonnegativeInteger(event.referenced_by);
      candidate.ranking.signals = signals.map((signal) => ({
        type: boundedText(signal?.type),
        reason: boundedText(signal?.reason),
        confidence: allowedConfidence(signal?.confidence),
        source: boundedText(signal?.source || "unavailable"),
        contribution: finiteNumber(signal?.score)
      }));
      candidate.ranking.contributions = contributions.map((item) => ({
        name: boundedText(item?.name),
        value: finiteNumber(item?.value)
      }));
      candidate.ranking.tie_break = {
        score: finiteNumber(event.tie_break?.score),
        fan_in: nonnegativeInteger(event.tie_break?.fan_in),
        path
      };
      return;
    }
    if (event.type === "candidate-ordered") {
      if (candidate.ranking.ranked_position !== null) {
        throw new Error("duplicate-ranked-position");
      }
      candidate.ranking.ranked_position = boundedInteger(
        event.ranked_position,
        1,
        TRACE_LIMITS.candidatesPerCase
      );
      return;
    }
    if (event.type === "curation-decision") {
      visitCount += 1;
      if (visitCount > TRACE_LIMITS.visitsPerCase) {
        throw new Error("stage-visit-limit");
      }
      if (
        candidate.curation.visits.length >=
        TRACE_LIMITS.visitsPerCandidate
      ) {
        throw new Error("candidate-visit-limit");
      }
      const visit = {
        stage: boundedText(event.stage),
        stage_ordinal: boundedInteger(
          event.stage_ordinal,
          1,
          TRACE_LIMITS.stagesPerCase
        ),
        entry_position: boundedInteger(
          event.entry_position,
          1,
          TRACE_LIMITS.candidatesPerCase
        ),
        selected_count_on_entry: boundedInteger(
          event.selected_count_on_entry,
          0,
          TRACE_LIMITS.candidatesPerCase
        ),
        decision: allowedDecision(event.decision),
        reason: boundedText(event.reason),
        heuristic:
          event.heuristic === null
            ? null
            : boundedText(event.heuristic),
        deduplicated: event.deduplicated === true,
        displaced_by:
          event.displaced_by === null
            ? null
            : candidateIdFor(
                binding,
                tracePath(event.displaced_by),
                contract
              ),
        quota:
          event.quota === null
            ? null
            : boundedInteger(
                event.quota,
                0,
                TRACE_LIMITS.candidatesPerCase
              ),
        cap:
          event.cap === null
            ? null
            : boundedInteger(
                event.cap,
                0,
                TRACE_LIMITS.candidatesPerCase
              )
      };
      candidate.curation.visits.push(visit);
      candidate.curation.deduplicated ||= visit.deduplicated;
      if (visit.displaced_by !== null) {
        candidate.curation.displacement = "displaced";
      }
      return;
    }
    if (event.type === "candidate-finalized") {
      if (finalizedCandidates.has(path)) {
        throw new Error("duplicate-final-decision");
      }
      finalizedCandidates.add(path);
      candidate.final = {
        rank:
          event.final_rank === null
            ? null
            : boundedInteger(event.final_rank, 1, 5),
        selected: event.selected === true,
        result: allowedFinalResult(event.result),
        selection_reason:
          event.selection_reason === null
            ? null
            : boundedText(event.selection_reason),
        selection_heuristic:
          event.selection_heuristic === null
            ? null
            : boundedText(event.selection_heuristic)
      };
      return;
    }
    throw new Error(`unknown-event:${boundedText(event.type)}`);
  }

  function addFailure(value) {
    if (failures.length < 32 && !failures.includes(value)) {
      failures.push(value);
    }
  }

  return { observer, finalize };
}

/**
 * Strict semantic validation for generated trace objects. JSON parsing and
 * duplicate-key rejection are performed by the bounded worker/attempt reader.
 *
 * @param {unknown} value
 * @param {Partial<TraceBinding>} [expected]
 */
export function validateRankingTrace(value, expected = {}) {
  return validateTrace(value, expected, LEGACY_TRACE_CONTRACT);
}

/** @param {unknown} value @param {Partial<TraceBinding>} [expected] */
export function validateCompactRankingTrace(value, expected = {}) {
  return validateTrace(value, expected, COMPACT_TRACE_CONTRACT);
}

/** @param {unknown} value @param {Partial<TraceBinding>} expected @param {TraceContract} contract */
function validateTrace(value, expected, contract) {
  /** @type {string[]} */
  const failures = [];
  if (!plainRecord(value)) {
    return { valid: false, failures: ["trace-object"] };
  }
  exactKeys(
    value,
    [
      "schema_version",
      "protocol_sha256",
      "trace_source_commit",
      "artifact_sha256",
      "corpus_sha256",
      "case",
      "limits",
      "scan",
      "stages",
      "candidates",
      "predictions",
      "completeness"
    ],
    failures,
    "trace"
  );
  expect(
    value.schema_version === contract.schemaVersion,
    failures,
    "schema-version"
  );
  for (const [field, expectedValue, pattern] of [
    ["protocol_sha256", expected.protocolSha256, /^[0-9a-f]{64}$/],
    ["trace_source_commit", expected.traceSourceCommit, /^[0-9a-f]{40}$/],
    ["artifact_sha256", expected.artifactSha256, /^[0-9a-f]{64}$/],
    ["corpus_sha256", expected.corpusSha256, /^[0-9a-f]{64}$/]
  ]) {
    expect(pattern.test(String(value[field] || "")), failures, field);
    if (expectedValue !== undefined) {
      expect(value[field] === expectedValue, failures, `${field}-binding`);
    }
  }
  expect(plainRecord(value.case), failures, "case-object");
  if (plainRecord(value.case)) {
    exactKeys(value.case, ["id", "revision", "ordinal"], failures, "case");
    expectText(value.case.id, failures, "case-id");
    expect(
      /^[0-9a-f]{40}$/.test(String(value.case.revision || "")),
      failures,
      "case-revision"
    );
    expectInteger(value.case.ordinal, 1, 30, failures, "case-ordinal");
    if (expected.caseId !== undefined) {
      expect(value.case.id === boundedText(expected.caseId), failures, "case-id-binding");
    }
    if (expected.revision !== undefined) {
      expect(value.case.revision === expected.revision, failures, "revision-binding");
    }
    if (expected.ordinal !== undefined) {
      expect(value.case.ordinal === expected.ordinal, failures, "ordinal-binding");
    }
  }
  validateLimits(value.limits, failures);
  validateScan(value.scan, failures);
  validateStages(value.stages, failures, contract);
  validateCandidates(value.candidates, failures);
  validatePredictions(value.predictions, failures);
  validateCompleteness(value.completeness, failures);
  validateCrossReferences(value, failures, contract);
  if (
    plainRecord(value.limits) &&
    Array.isArray(value.candidates)
  ) {
    expect(
      value.limits.candidate_count === value.candidates.length,
      failures,
      "candidate-count"
    );
  }
  if (plainRecord(value.limits) && Array.isArray(value.stages)) {
    expect(
      value.limits.stage_count === value.stages.length,
      failures,
      "stage-count"
    );
  }
  if (
    plainRecord(value.limits) &&
    Number.isInteger(value.limits.serialized_bytes)
  ) {
    expect(
      value.limits.serialized_bytes ===
        Buffer.byteLength(`${JSON.stringify(value)}\n`),
      failures,
      "serialized-bytes"
    );
  }
  return {
    valid: failures.length === 0,
    failures: Array.from(new Set(failures)).slice(0, 32)
  };
}

/**
 * @param {TraceBinding} binding
 * @param {string} path
 * @param {Record<string, unknown>} event
 * @param {TraceContract} contract
 */
function candidateRecord(binding, path, event, contract) {
  const eligible = event.eligible === true;
  const eligibilityReason = boundedText(event.eligibility_reason);
  return {
    candidate_id: candidateIdFor(binding, path, contract),
    normalized_path: path,
    discovery_source: "scanner",
    evidence: {
      state: eligible ? "present" : "rejected",
      present: ["scanner-entry"],
      absent: [],
      rejected: eligible ? [] : [eligibilityReason],
      unknown: []
    },
    ranking: {
      eligible,
      eligibility_reason: eligibilityReason,
      input_position: boundedInteger(
        event.input_position,
        1,
        TRACE_LIMITS.candidatesPerCase
      ),
      ranked_position: null,
      score: null,
      fan_in: 0,
      referenced_by: 0,
      signals: [],
      contributions: [],
      tie_break: {
        score: null,
        fan_in: 0,
        path
      }
    },
    curation: {
      visits: [],
      deduplicated: false,
      displacement: "not-applicable"
    },
    final: {
      rank: null,
      selected: false,
      result: "not-selected",
      selection_reason: null,
      selection_heuristic: null
    }
  };
}

/**
 * @param {Record<string, unknown>} event
 * @param {Map<string, ReturnType<typeof candidateRecord>>} candidates
 */
function stageRecord(event, candidates) {
  return {
    name: boundedText(event.stage),
    ordinal: boundedInteger(
      event.stage_ordinal,
      1,
      TRACE_LIMITS.stagesPerCase
    ),
    ordering: Array.isArray(event.ordering)
      ? event.ordering.slice(0, 8).map(boundedText)
      : [],
    quota:
      event.quota === null
        ? null
        : boundedInteger(
            event.quota,
            0,
            TRACE_LIMITS.candidatesPerCase
          ),
    selected_on_entry: candidateIds(event.selected, candidates),
    selected_on_exit: []
  };
}

/** @param {TraceBinding | {caseId: unknown, revision: unknown}} binding @param {unknown} normalizedPath @param {TraceContract} contract */
function candidateIdFor(binding, normalizedPath, contract) {
  return `candidate-${crypto
    .createHash("sha256")
    .update(
      `${contract.candidateDomain}\0${binding.caseId}\0` +
      `${binding.revision}\0${normalizedPath}`
    )
    .digest("hex")}`;
}

function tracePath(value) {
  const normalized = normalizeRelPath(String(value ?? ""));
  if (!normalized || normalized === "." || normalized === "..") {
    throw new Error("invalid-candidate-path");
  }
  const safe = boundedText(normalized);
  if (
    Buffer.byteLength(safe) !== Buffer.byteLength(
      safeTerminalText(normalized)
    )
  ) {
    throw new Error("candidate-path-limit");
  }
  return safe;
}

function candidateIds(value, candidates) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const candidate = candidates.get(tracePath(item));
    if (!candidate) {
      throw new Error("unknown-selected-candidate");
    }
    return candidate.candidate_id;
  });
}

function applyEvidenceState(candidate, scan) {
  if (!candidate.ranking.eligible) {
    return;
  }
  if (candidate.ranking.signals.length === 0) {
    candidate.evidence.absent.push("normalized-ranking-signal");
  } else {
    candidate.evidence.present.push("normalized-ranking-signal");
  }
  if (scan.truncated === true) {
    candidate.evidence.state = "truncated";
    candidate.evidence.unknown.push("scan-truncated");
  } else if (scan.complete !== true) {
    candidate.evidence.state = "unavailable";
    candidate.evidence.unknown.push("scan-incomplete");
  }
}

function boundedScan(scan) {
  const budgets = Array.isArray(scan.budgets_reached)
    ? scan.budgets_reached
        .slice(0, TRACE_LIMITS.budgetFlagsPerCase)
        .map(boundedText)
    : [];
  const failures = Array.isArray(scan.path_failures)
    ? scan.path_failures
        .slice(0, TRACE_LIMITS.pathFailuresPerCase)
        .map((failure) => ({
          path:
            typeof failure?.path === "string"
              ? boundedText(failure.path)
              : null,
          status: boundedText(failure?.status),
          code: boundedText(failure?.code),
          reason: boundedText(failure?.reason)
        }))
    : [];
  /** @type {string[]} */
  const unknown = [];
  if (scan.complete !== true) {
    unknown.push("scan-incomplete");
  }
  if (scan.truncated === true) {
    unknown.push("scan-truncated");
  }
  if (scan.path_failures_truncated === true) {
    unknown.push("path-failures-truncated");
  }
  if (
    (scan.path_failures?.length || 0) >
    TRACE_LIMITS.pathFailuresPerCase
  ) {
    unknown.push("path-failure-limit");
  }
  return {
    complete: scan.complete === true,
    truncated: scan.truncated === true,
    budgets_reached: budgets,
    path_failures: failures,
    path_failures_truncated:
      scan.path_failures_truncated === true ||
      (scan.path_failures?.length || 0) >
        TRACE_LIMITS.pathFailuresPerCase,
    unknown_evidence: unknown
  };
}

function completenessChecks(input, contract) {
  const eligible = input.candidates.filter(
    (candidate) => candidate.ranking.eligible
  );
  const selected = eligible
    .filter((candidate) => candidate.final.selected)
    .sort((left, right) =>
      (left.final.rank || 0) - (right.final.rank || 0)
    );
  const stageNames = input.stages.map((stage) => stage.name);
  const contributionTotals = eligible.every((candidate) =>
    candidate.ranking.score ===
      candidate.ranking.contributions.reduce(
        (total, contribution) => total + contribution.value,
        0
      )
  );
  const visits = input.candidates.reduce(
    (count, candidate) => count + candidate.curation.visits.length,
    0
  );
  return [
    {
      name: "candidate-discovery-unique",
      passed:
        input.candidates.length ===
        new Set(input.candidates.map((item) => item.normalized_path)).size
    },
    {
      name: "eligible-score-complete",
      passed: eligible.every((candidate) =>
        candidate.ranking.score !== null &&
        candidate.ranking.ranked_position !== null &&
        input.finalizedCandidates.has(candidate.normalized_path)
      )
    },
    {
      name: "ineligible-score-absent",
      passed: input.candidates
        .filter((candidate) => !candidate.ranking.eligible)
        .every((candidate) =>
          candidate.ranking.score === null &&
          candidate.ranking.ranked_position === null
        )
    },
    {
      name: "ranked-position-complete",
      passed:
        new Set(
          eligible.map((candidate) => candidate.ranking.ranked_position)
        ).size === eligible.length
    },
    {
      name: "curation-stages-complete",
      passed:
        JSON.stringify(stageNames) ===
          JSON.stringify(contract.stages) &&
        input.exitedStages.size === contract.stages.length
    },
    {
      name: "stage-visits-counted",
      passed:
        visits === input.visitCount &&
        visits <= TRACE_LIMITS.visitsPerCase
    },
    {
      name: "score-contributions-reconcile",
      passed: contributionTotals
    },
    {
      name: "selection-membership-and-order",
      passed:
        JSON.stringify(
          selected.map((candidate) => candidate.normalized_path)
        ) === JSON.stringify(input.predictions.important_files)
    },
    {
      name: "candidate-identities-unique",
      passed:
        input.candidates.length ===
        new Set(
          input.candidates.map((candidate) => candidate.candidate_id)
        ).size
    },
    {
      name: "observer-failure-absent",
      passed: input.observerFailures === 0
    },
    {
      name: "scan-diagnostics-present",
      passed:
        typeof input.scan.complete === "boolean" &&
        Array.isArray(input.scan.budgets_reached) &&
        Array.isArray(input.scan.path_failures)
    }
  ];
}

function validateCrossReferences(value, failures, contract) {
  if (
    !plainRecord(value.case) ||
    !Array.isArray(value.candidates) ||
    !Array.isArray(value.stages) ||
    !plainRecord(value.predictions)
  ) {
    return;
  }
  const binding = {
    caseId: value.case.id,
    revision: value.case.revision
  };
  const candidateIds = new Set(
    value.candidates.map((candidate) => candidate?.candidate_id)
  );
  for (const candidate of value.candidates) {
    if (!plainRecord(candidate)) continue;
    expect(
      candidate.candidate_id ===
        candidateIdFor(binding, candidate.normalized_path, contract),
      failures,
      "candidate-id-derivation"
    );
    if (plainRecord(candidate.curation)) {
      for (const visit of Array.isArray(candidate.curation.visits)
        ? candidate.curation.visits
        : []) {
        if (!plainRecord(visit)) continue;
        expect(
          value.stages[visit.stage_ordinal - 1]?.name === visit.stage,
          failures,
          "visit-stage-binding"
        );
        expect(
          visit.displaced_by === null ||
            candidateIds.has(visit.displaced_by),
          failures,
          "visit-displacement-binding"
        );
      }
    }
  }
  const inputPositions = value.candidates
    .map((candidate) => candidate?.ranking?.input_position)
    .sort((left, right) => left - right);
  expect(
    inputPositions.every((position, index) => position === index + 1),
    failures,
    "input-position-sequence"
  );
  const eligible = value.candidates.filter(
    (candidate) => candidate?.ranking?.eligible === true
  );
  const expectedRanking = [...eligible].sort(
    (left, right) =>
      right.ranking.score - left.ranking.score ||
      right.ranking.fan_in - left.ranking.fan_in ||
      left.normalized_path.localeCompare(right.normalized_path)
  );
  expect(
    expectedRanking.every(
      (candidate, index) =>
        candidate.ranking.ranked_position === index + 1
    ),
    failures,
    "ranked-order-reconstruction"
  );
  const selected = eligible
    .filter((candidate) => candidate.final.selected === true)
    .sort((left, right) => left.final.rank - right.final.rank);
  expect(
    selected.every(
      (candidate, index) => candidate.final.rank === index + 1
    ),
    failures,
    "final-rank-sequence"
  );
  expect(
    JSON.stringify(
      selected.map((candidate) => candidate.normalized_path)
    ) === JSON.stringify(value.predictions.important_files),
    failures,
    "final-selection-prediction-binding"
  );
  let previousExit = [];
  for (const stage of value.stages) {
    if (!plainRecord(stage)) continue;
    expect(
      stage.selected_on_entry.every((id) => candidateIds.has(id)) &&
        stage.selected_on_exit.every((id) => candidateIds.has(id)),
      failures,
      "stage-candidate-binding"
    );
    expect(
      JSON.stringify(stage.selected_on_entry) ===
        JSON.stringify(previousExit),
      failures,
      "stage-transition"
    );
    if (stage.name === contract.capStage) {
      expect(
        JSON.stringify(stage.selected_on_exit) ===
          JSON.stringify(
            stage.selected_on_entry.slice(0, stage.quota)
          ),
        failures,
        "final-cap-transition"
      );
    } else {
      const reconstructed = [...stage.selected_on_entry];
      const visits = value.candidates
        .flatMap((candidate) =>
          (candidate.curation?.visits || [])
            .filter(
              (visit) => visit.stage_ordinal === stage.ordinal
            )
            .map((visit) => ({
              candidate_id: candidate.candidate_id,
              ...visit
            }))
        )
        .sort(
          (left, right) =>
            left.entry_position - right.entry_position
        );
      expect(
        visits.every(
          (visit, index) => visit.entry_position === index + 1
        ),
        failures,
        "stage-visit-sequence"
      );
      for (const visit of visits) {
        if (visit.decision === "selected") {
          reconstructed.push(visit.candidate_id);
        }
      }
      expect(
        JSON.stringify(stage.selected_on_exit) ===
          JSON.stringify(reconstructed),
        failures,
        "stage-exit-reconstruction"
      );
    }
    previousExit = stage.selected_on_exit;
  }
}

function commandPredictions(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, 1).map((item) => ({
    cwd: boundedText(item?.cwd || "."),
    command: boundedText(item?.command)
  }));
}

function stabilizeSerializedBytes(trace) {
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const size = Buffer.byteLength(`${JSON.stringify(trace)}\n`);
    if (trace.limits.serialized_bytes === size) {
      return;
    }
    trace.limits.serialized_bytes = size;
  }
  trace.limits.serialized_bytes =
    Buffer.byteLength(`${JSON.stringify(trace)}\n`);
}

function validateLimits(value, failures) {
  expect(plainRecord(value), failures, "limits-object");
  if (!plainRecord(value)) return;
  exactKeys(
    value,
    [
      "candidate_count",
      "stage_count",
      "stage_visit_count",
      "serialized_bytes"
    ],
    failures,
    "limits"
  );
  expectInteger(
    value.candidate_count,
    0,
    TRACE_LIMITS.candidatesPerCase,
    failures,
    "candidate-limit"
  );
  expectInteger(
    value.stage_count,
    0,
    TRACE_LIMITS.stagesPerCase,
    failures,
    "stage-limit"
  );
  expectInteger(
    value.stage_visit_count,
    0,
    TRACE_LIMITS.visitsPerCase,
    failures,
    "visit-limit"
  );
  expectInteger(
    value.serialized_bytes,
    0,
    TRACE_LIMITS.bytesPerCase,
    failures,
    "byte-limit"
  );
}

function validateScan(value, failures) {
  expect(plainRecord(value), failures, "scan-object");
  if (!plainRecord(value)) return;
  exactKeys(
    value,
    [
      "complete",
      "truncated",
      "budgets_reached",
      "path_failures",
      "path_failures_truncated",
      "unknown_evidence"
    ],
    failures,
    "scan"
  );
  expect(typeof value.complete === "boolean", failures, "scan-complete");
  expect(typeof value.truncated === "boolean", failures, "scan-truncated");
  expectTextArray(
    value.budgets_reached,
    TRACE_LIMITS.budgetFlagsPerCase,
    failures,
    "scan-budgets"
  );
  expectTextArray(
    value.unknown_evidence,
    32,
    failures,
    "scan-unknown"
  );
  expect(
    Array.isArray(value.path_failures) &&
      value.path_failures.length <= TRACE_LIMITS.pathFailuresPerCase,
    failures,
    "scan-path-failures"
  );
  if (Array.isArray(value.path_failures)) {
    for (const item of value.path_failures) {
      expect(plainRecord(item), failures, "path-failure-object");
      if (!plainRecord(item)) continue;
      exactKeys(
        item,
        ["path", "status", "code", "reason"],
        failures,
        "path-failure"
      );
      expect(
        item.path === null || validText(item.path),
        failures,
        "path-failure-path"
      );
      for (const key of ["status", "code", "reason"]) {
        expectText(item[key], failures, `path-failure-${key}`);
      }
    }
  }
  expect(
    typeof value.path_failures_truncated === "boolean",
    failures,
    "path-failure-truncation"
  );
}

function validateStages(value, failures, contract) {
  expect(
    Array.isArray(value) &&
      value.length <= TRACE_LIMITS.stagesPerCase,
    failures,
    "stages-array"
  );
  if (!Array.isArray(value)) return;
  const ordinals = new Set();
  for (const [index, stage] of value.entries()) {
    expect(plainRecord(stage), failures, "stage-object");
    if (!plainRecord(stage)) continue;
    exactKeys(
      stage,
      [
        "name",
        "ordinal",
        "ordering",
        "quota",
        "selected_on_entry",
        "selected_on_exit"
      ],
      failures,
      "stage"
    );
    expectText(stage.name, failures, "stage-name");
    expect(
      stage.name === contract.stages[index],
      failures,
      "stage-name-order"
    );
    expectInteger(
      stage.ordinal,
      1,
      TRACE_LIMITS.stagesPerCase,
      failures,
      "stage-ordinal"
    );
    ordinals.add(stage.ordinal);
    expect(
      stage.ordinal === index + 1,
      failures,
      "stage-ordinal-order"
    );
    expectTextArray(stage.ordering, 8, failures, "stage-ordering");
    expect(
      stage.quota === null ||
        integerInRange(
          stage.quota,
          0,
          TRACE_LIMITS.candidatesPerCase
        ),
      failures,
      "stage-quota"
    );
    expectCandidateIdArray(
      stage.selected_on_entry,
      failures,
      "stage-entry-selection"
    );
    expectCandidateIdArray(
      stage.selected_on_exit,
      failures,
      "stage-exit-selection"
    );
  }
  expect(ordinals.size === value.length, failures, "stage-ordinal-unique");
}

function validateCandidates(value, failures) {
  expect(
    Array.isArray(value) &&
      value.length <= TRACE_LIMITS.candidatesPerCase,
    failures,
    "candidates-array"
  );
  if (!Array.isArray(value)) return;
  const ids = new Set();
  const paths = new Set();
  let visits = 0;
  for (const candidate of value) {
    expect(plainRecord(candidate), failures, "candidate-object");
    if (!plainRecord(candidate)) continue;
    exactKeys(
      candidate,
      [
        "candidate_id",
        "normalized_path",
        "discovery_source",
        "evidence",
        "ranking",
        "curation",
        "final"
      ],
      failures,
      "candidate"
    );
    expect(
      /^candidate-[0-9a-f]{64}$/.test(
        String(candidate.candidate_id || "")
      ),
      failures,
      "candidate-id"
    );
    ids.add(candidate.candidate_id);
    expectText(candidate.normalized_path, failures, "candidate-path");
    paths.add(candidate.normalized_path);
    expect(
      candidate.discovery_source === "scanner",
      failures,
      "candidate-discovery"
    );
    validateEvidence(candidate.evidence, failures);
    validateRanking(candidate.ranking, failures);
    visits += validateCuration(candidate.curation, failures);
    validateFinal(candidate.final, failures);
  }
  expect(ids.size === value.length, failures, "candidate-id-unique");
  expect(paths.size === value.length, failures, "candidate-path-unique");
  expect(
    visits <= TRACE_LIMITS.visitsPerCase,
    failures,
    "candidate-visits-total"
  );
}

function validateEvidence(value, failures) {
  expect(plainRecord(value), failures, "evidence-object");
  if (!plainRecord(value)) return;
  exactKeys(
    value,
    ["state", "present", "absent", "rejected", "unknown"],
    failures,
    "evidence"
  );
  expect(
    ["present", "absent", "rejected", "truncated", "unavailable"].includes(
      value.state
    ),
    failures,
    "evidence-state"
  );
  for (const key of ["present", "absent", "rejected", "unknown"]) {
    expectTextArray(value[key], 64, failures, `evidence-${key}`);
  }
}

function validateRanking(value, failures) {
  expect(plainRecord(value), failures, "ranking-object");
  if (!plainRecord(value)) return;
  exactKeys(
    value,
    [
      "eligible",
      "eligibility_reason",
      "input_position",
      "ranked_position",
      "score",
      "fan_in",
      "referenced_by",
      "signals",
      "contributions",
      "tie_break"
    ],
    failures,
    "ranking"
  );
  expect(typeof value.eligible === "boolean", failures, "ranking-eligible");
  expectText(value.eligibility_reason, failures, "eligibility-reason");
  expectInteger(
    value.input_position,
    1,
    TRACE_LIMITS.candidatesPerCase,
    failures,
    "input-position"
  );
  expect(
    value.ranked_position === null ||
      integerInRange(
        value.ranked_position,
        1,
        TRACE_LIMITS.candidatesPerCase
      ),
    failures,
    "ranked-position"
  );
  expect(
    value.score === null || Number.isFinite(value.score),
    failures,
    "ranking-score"
  );
  expect(
    integerInRange(value.fan_in, 0, Number.MAX_SAFE_INTEGER),
    failures,
    "fan-in"
  );
  expect(
    integerInRange(value.referenced_by, 0, Number.MAX_SAFE_INTEGER),
    failures,
    "referenced-by"
  );
  expect(
    Array.isArray(value.signals) &&
      value.signals.length <= TRACE_LIMITS.signalsPerCandidate,
    failures,
    "signals-array"
  );
  if (Array.isArray(value.signals)) {
    for (const signal of value.signals) {
      expect(plainRecord(signal), failures, "signal-object");
      if (!plainRecord(signal)) continue;
      exactKeys(
        signal,
        ["type", "reason", "confidence", "source", "contribution"],
        failures,
        "signal"
      );
      for (const key of ["type", "reason", "source"]) {
        expectText(signal[key], failures, `signal-${key}`);
      }
      expect(
        ["known", "likely", "unknown", "unavailable"].includes(
          signal.confidence
        ),
        failures,
        "signal-confidence"
      );
      expect(
        Number.isFinite(signal.contribution),
        failures,
        "signal-contribution"
      );
    }
  }
  expect(
    Array.isArray(value.contributions) &&
      value.contributions.length <=
        TRACE_LIMITS.contributionsPerCandidate,
    failures,
    "contributions-array"
  );
  if (Array.isArray(value.contributions)) {
    for (const contribution of value.contributions) {
      expect(
        plainRecord(contribution),
        failures,
        "contribution-object"
      );
      if (!plainRecord(contribution)) continue;
      exactKeys(
        contribution,
        ["name", "value"],
        failures,
        "contribution"
      );
      expectText(
        contribution.name,
        failures,
        "contribution-name"
      );
      expect(
        Number.isFinite(contribution.value),
        failures,
        "contribution-value"
      );
    }
  }
  expect(plainRecord(value.tie_break), failures, "tie-break-object");
  if (plainRecord(value.tie_break)) {
    exactKeys(
      value.tie_break,
      ["score", "fan_in", "path"],
      failures,
      "tie-break"
    );
    expect(
      value.tie_break.score === null ||
        Number.isFinite(value.tie_break.score),
      failures,
      "tie-score"
    );
    expect(
      integerInRange(
        value.tie_break.fan_in,
        0,
        Number.MAX_SAFE_INTEGER
      ),
      failures,
      "tie-fan-in"
    );
    expectText(value.tie_break.path, failures, "tie-path");
  }
}

function validateCuration(value, failures) {
  expect(plainRecord(value), failures, "curation-object");
  if (!plainRecord(value)) return 0;
  exactKeys(
    value,
    ["visits", "deduplicated", "displacement"],
    failures,
    "curation"
  );
  expect(
    Array.isArray(value.visits) &&
      value.visits.length <= TRACE_LIMITS.visitsPerCandidate,
    failures,
    "visits-array"
  );
  if (Array.isArray(value.visits)) {
    for (const visit of value.visits) {
      expect(plainRecord(visit), failures, "visit-object");
      if (!plainRecord(visit)) continue;
      exactKeys(
        visit,
        [
          "stage",
          "stage_ordinal",
          "entry_position",
          "selected_count_on_entry",
          "decision",
          "reason",
          "heuristic",
          "deduplicated",
          "displaced_by",
          "quota",
          "cap"
        ],
        failures,
        "visit"
      );
      expectText(visit.stage, failures, "visit-stage");
      expectInteger(
        visit.stage_ordinal,
        1,
        TRACE_LIMITS.stagesPerCase,
        failures,
        "visit-stage-ordinal"
      );
      expectInteger(
        visit.entry_position,
        1,
        TRACE_LIMITS.candidatesPerCase,
        failures,
        "visit-entry-position"
      );
      expectInteger(
        visit.selected_count_on_entry,
        0,
        TRACE_LIMITS.candidatesPerCase,
        failures,
        "visit-selected-count"
      );
      expect(
        [
          "selected",
          "duplicate",
          "policy-excluded",
          "quota-excluded",
          "cap-excluded",
          "not-selected"
        ].includes(visit.decision),
        failures,
        "visit-decision"
      );
      expectText(visit.reason, failures, "visit-reason");
      expect(
        visit.heuristic === null || validText(visit.heuristic),
        failures,
        "visit-heuristic"
      );
      expect(
        typeof visit.deduplicated === "boolean",
        failures,
        "visit-dedup"
      );
      expect(
        visit.displaced_by === null ||
          /^candidate-[0-9a-f]{64}$/.test(visit.displaced_by),
        failures,
        "visit-displacement"
      );
      for (const key of ["quota", "cap"]) {
        expect(
          visit[key] === null ||
            integerInRange(
              visit[key],
              0,
              TRACE_LIMITS.candidatesPerCase
            ),
          failures,
          `visit-${key}`
        );
      }
    }
  }
  expect(
    typeof value.deduplicated === "boolean",
    failures,
    "curation-deduplicated"
  );
  expect(
    ["not-applicable", "displaced"].includes(value.displacement),
    failures,
    "curation-displacement"
  );
  return Array.isArray(value.visits) ? value.visits.length : 0;
}

function validateFinal(value, failures) {
  expect(plainRecord(value), failures, "final-object");
  if (!plainRecord(value)) return;
  exactKeys(
    value,
    [
      "rank",
      "selected",
      "result",
      "selection_reason",
      "selection_heuristic"
    ],
    failures,
    "final"
  );
  expect(
    value.rank === null || integerInRange(value.rank, 1, 5),
    failures,
    "final-rank"
  );
  expect(typeof value.selected === "boolean", failures, "final-selected");
  expect(
    [
      "selected",
      "cap-excluded",
      "not-selected",
      "ranking-ineligible"
    ].includes(value.result),
    failures,
    "final-result"
  );
  for (const key of ["selection_reason", "selection_heuristic"]) {
    expect(
      value[key] === null || validText(value[key]),
      failures,
      `final-${key}`
    );
  }
}

function validatePredictions(value, failures) {
  expect(plainRecord(value), failures, "predictions-object");
  if (!plainRecord(value)) return;
  exactKeys(
    value,
    ["important_files", "run", "test"],
    failures,
    "predictions"
  );
  expectTextArray(
    value.important_files,
    5,
    failures,
    "important-files"
  );
  for (const key of ["run", "test"]) {
    expect(
      Array.isArray(value[key]) && value[key].length <= 1,
      failures,
      `${key}-predictions`
    );
    if (Array.isArray(value[key])) {
      for (const command of value[key]) {
        expect(plainRecord(command), failures, `${key}-command`);
        if (!plainRecord(command)) continue;
        exactKeys(command, ["cwd", "command"], failures, `${key}-command`);
        expectText(command.cwd, failures, `${key}-cwd`);
        expectText(command.command, failures, `${key}-text`);
      }
    }
  }
}

function validateCompleteness(value, failures) {
  expect(plainRecord(value), failures, "completeness-object");
  if (!plainRecord(value)) return;
  exactKeys(
    value,
    ["complete", "checks", "failures", "observer_failures"],
    failures,
    "completeness"
  );
  expect(typeof value.complete === "boolean", failures, "trace-complete");
  expect(
    Array.isArray(value.checks) && value.checks.length <= 32,
    failures,
    "checks-array"
  );
  if (Array.isArray(value.checks)) {
    for (const check of value.checks) {
      expect(plainRecord(check), failures, "check-object");
      if (!plainRecord(check)) continue;
      exactKeys(check, ["name", "passed"], failures, "check");
      expectText(check.name, failures, "check-name");
      expect(typeof check.passed === "boolean", failures, "check-passed");
    }
  }
  expectTextArray(value.failures, 32, failures, "trace-failures");
  expectInteger(
    value.observer_failures,
    0,
    TRACE_LIMITS.visitsPerCase,
    failures,
    "observer-failures"
  );
}

function exactKeys(value, expected, failures, label) {
  if (!plainRecord(value)) return;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  expect(
    JSON.stringify(actual) === JSON.stringify(wanted),
    failures,
    `${label}-keys`
  );
}

function expectCandidateIdArray(value, failures, label) {
  expect(
    Array.isArray(value) &&
      value.length <= TRACE_LIMITS.candidatesPerCase &&
      value.every((item) =>
        /^candidate-[0-9a-f]{64}$/.test(String(item || ""))
      ) &&
      new Set(value).size === value.length,
    failures,
    label
  );
}

function expectTextArray(value, maximum, failures, label) {
  expect(
    Array.isArray(value) &&
      value.length <= maximum &&
      value.every(validText),
    failures,
    label
  );
}

function expectText(value, failures, label) {
  expect(validText(value), failures, label);
}

function validText(value) {
  return (
    typeof value === "string" &&
    Buffer.byteLength(value) <= TRACE_LIMITS.textBytes &&
    safeTerminalText(value) === value
  );
}

function expectInteger(value, minimum, maximum, failures, label) {
  expect(integerInRange(value, minimum, maximum), failures, label);
}

function integerInRange(value, minimum, maximum) {
  return (
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function expect(condition, failures, label) {
  if (!condition && !failures.includes(label)) {
    failures.push(label);
  }
}

function boundedText(value) {
  let text = safeTerminalText(value);
  while (
    Buffer.byteLength(text) > TRACE_LIMITS.textBytes &&
    text.length > 0
  ) {
    text = text.slice(0, -1);
  }
  return text;
}

function boundedInteger(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error("bounded-integer");
  }
  return number;
}

function nonnegativeInteger(value) {
  return boundedInteger(value, 0, Number.MAX_SAFE_INTEGER);
}

function finiteNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error("finite-number");
  }
  return number;
}

function allowedConfidence(value) {
  return ["known", "likely", "unknown", "unavailable"].includes(value)
    ? value
    : "unavailable";
}

function allowedDecision(value) {
  if (
    ![
      "selected",
      "duplicate",
      "policy-excluded",
      "quota-excluded",
      "cap-excluded",
      "not-selected"
    ].includes(value)
  ) {
    throw new Error("curation-decision");
  }
  return value;
}

function allowedFinalResult(value) {
  if (!["selected", "cap-excluded", "not-selected"].includes(value)) {
    throw new Error("final-result");
  }
  return value;
}

function plainRecord(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
