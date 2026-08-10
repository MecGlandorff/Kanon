import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveContainedPath } from "../../src/path-security.js";
import {
  COMPARATIVE_RESOURCE_LIMITS,
  assignComparativeIdentities,
  auditComparativePacketAgainstInputs,
  canonicalComparativeInputIdentity,
  deriveComparativeCases,
  validateComparativePacket,
  validateComparativeResult,
  validateCompletedComparativePacket
} from "./d2c-comparative.js";
import {
  ALLOWED_DISPOSITIONS,
  assertDeepEqual,
  canonicalDirectory,
  canonicalJson,
  cleanupOwnedStaging,
  compareText,
  containedFile,
  hasExactKeys,
  isPlainRecord,
  parseJson,
  prepareAbsentOutput,
  sha256,
  validatePacket,
  validateRelativePath
} from "./d2c-packet.js";
import {
  readStableRegularFile,
  refuseExistingPath,
  validateCompletedReview,
  writeNewFile
} from "./d2c-unblind.js";
import { validateCorpus } from "./eval-corpus/schema.js";

export const COMPARATIVE_UNBLINDED_SCHEMA =
  "kanon-d2c-comparative-unblinded-analysis-v1";
export const COMPARATIVE_PROTOCOL_FILE =
  "eval/d2c/comparative-unblinding-protocol.json";
export const COMPARATIVE_ANALYSIS_SCHEMA_FILE =
  "eval/d2c/comparative-unblinded-analysis.schema.json";
export const COMPARATIVE_PRESERVED_RESULT = "comparative-result.json";
export const COMPARATIVE_ANALYSIS_FILE = "unblinded-analysis.json";

const ORIGINS = Object.freeze([
  "consensus",
  "prediction-only",
  "label-only"
]);
const DISPUTED_ORIGINS = Object.freeze([
  "prediction-only",
  "label-only"
]);
const CATEGORIES = Object.freeze([
  "go-service",
  "monorepo",
  "python-ml",
  "python-web",
  "rust-cli"
]);
const POSITIONS = Object.freeze([1, 2, 3, 4, 5]);
const REVIEW_STATUSES = Object.freeze([
  "selected",
  "unselected",
  "not-judged-unknown"
]);
const UNSAFE_DISPLAY =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const TOP_LEVEL_FIELDS = Object.freeze([
  "bindings",
  "cases",
  "counts",
  "matrices",
  "method",
  "reviewer_agreement",
  "schema_version",
  "validation"
]);
const BINDING_FIELDS = Object.freeze([
  "analysis_schema_sha256",
  "canonical_input_sha256",
  "comparative_case_snapshots_sha256",
  "comparative_preparation_sha256",
  "corpus_manifest_sha256",
  "packet_commitment",
  "packet_manifest_sha256",
  "predeclaration_commit",
  "preparation_commit",
  "prior_review_result_sha256",
  "prior_unblinded_analysis_sha256",
  "protocol_sha256",
  "raw_report_sha256",
  "restored_artifact_sha256",
  "result_schema_sha256",
  "result_sha256",
  "review_cases_sha256",
  "reviewer_prompt_sha256",
  "source_case_snapshots_sha256"
]);
const VALIDATION_FIELDS = Object.freeze([
  "case_count",
  "controlled_inputs_unchanged",
  "formal_result_valid",
  "outcome",
  "result_bytes",
  "schema_version",
  "unique_case_count"
]);
const METHOD_FIELDS = Object.freeze([
  "analysis_kind",
  "frozen_labels_modified",
  "ground_truth_claimed",
  "official_score_recalculated",
  "prior_dispositions_modified",
  "release_gate_changed",
  "reviewer_selections_modified",
  "reviewer_unknown_is_negative",
  "unknown_cases_in_set_comparisons"
]);
const CASE_FIELDS = Object.freeze([
  "candidates",
  "case_id",
  "category",
  "d2a_case_id",
  "frozen_label_paths",
  "frozen_prediction_paths",
  "outcome",
  "repository",
  "reviewer_selected_paths",
  "revision",
  "set_comparison",
  "unknown_not_negative",
  "unknown_reason"
]);
const CANDIDATE_FIELDS = Object.freeze([
  "candidate_id",
  "comparative_direct_sources",
  "comparative_rationale",
  "consensus",
  "file_metadata",
  "label_member",
  "origin",
  "path",
  "prediction_member",
  "prior_d2c",
  "review_status",
  "selected_position"
]);
const PRIOR_FIELDS = Object.freeze([
  "case_id",
  "category",
  "direct_sources",
  "item_id",
  "join_status",
  "origin",
  "packet_commitment",
  "rationale",
  "review_result_sha256",
  "reviewed_file_metadata",
  "reviewer_disposition"
]);
const PRIOR_ANALYSIS_ITEM_FIELDS = Object.freeze([
  "case_id",
  "category",
  "direct_sources",
  "item_id",
  "origin",
  "packet_commitment",
  "path",
  "rationale",
  "repository_identity",
  "review_result_sha256",
  "reviewer_disposition"
]);

/**
 * Revalidate the complete comparative packet and frozen input reconstruction
 * while treating the result as an opaque permitted output file.
 */
export function validateComparativeStatic(options) {
  validateExpected(options.expected);
  const packet = validateComparativePacket(options.packetRoot, {
    allowedOutputFiles: [COMPARATIVE_PRESERVED_RESULT]
  });
  const audit = auditComparativePacketAgainstInputs({
    repoRoot: options.repoRoot,
    packetRoot: packet.packet_root,
    allowedOutputFiles: [COMPARATIVE_PRESERVED_RESULT]
  });
  const comparisons = [
    [packet.packet_manifest_sha256, options.expected.packetManifestSha256],
    [packet.packet_hash, options.expected.packetHash],
    [packet.reviewer_prompt_sha256, options.expected.reviewerPromptSha256],
    [packet.result_schema_sha256, options.expected.resultSchemaSha256],
    [packet.review_cases_sha256, options.expected.reviewCasesSha256],
    [
      packet.source_case_snapshots_sha256,
      options.expected.sourceCaseSnapshotsSha256
    ],
    [
      packet.case_snapshots_sha256,
      options.expected.comparativeCaseSnapshotsSha256
    ],
    [packet.canonical_input_sha256, options.expected.canonicalInputSha256],
    [packet.case_count, options.expected.caseCount],
    [packet.candidate_count, options.expected.candidateCount],
    [audit.consensus_candidate_count, options.expected.consensusCount],
    [
      audit.excluded_exact_agreement_case_count,
      options.expected.excludedExactAgreementCount
    ]
  ];
  if (comparisons.some(([received, expected]) => received !== expected)) {
    throw new Error("Comparative static evidence differs from frozen bindings.");
  }
  for (const field of [
    "union_membership_complete",
    "consensus_candidates_present",
    "non_union_candidates_absent",
    "side_provenance_absent",
    "isolated_identity_domains_valid",
    "deterministic_order_valid",
    "side_swap_invariant"
  ]) {
    if (audit[field] !== true) {
      throw new Error(`Comparative static audit failed: ${field}.`);
    }
  }
  return { packet, audit };
}

/**
 * Formally validate, then independently stable-read the exact result while
 * requiring unchanged controlled packet state on both sides.
 */
export function validateCompletedComparativeEvidence(options) {
  const before = validateComparativeStatic(options);
  options.testHooks?.afterStaticValidation?.(before);
  const formal = validateCompletedComparativePacket(
    before.packet.packet_root
  );
  if (
    formal.formal_result_valid !== true ||
    formal.case_count !== options.expected.caseCount
  ) {
    throw new Error("Canonical comparative result validation did not pass.");
  }
  const resultPath = containedFile(
    before.packet.packet_root,
    `output/${COMPARATIVE_PRESERVED_RESULT}`
  );
  const resultBytes = readStableRegularFile(
    resultPath,
    COMPARATIVE_RESOURCE_LIMITS.max_result_bytes,
    {
      afterOpen: options.testHooks?.duringResultRead
    }
  );
  const resultSha256 = sha256(resultBytes);
  if (formal.result_sha256 !== resultSha256) {
    throw new Error("Comparative result changed after canonical validation.");
  }
  const result = parseJson(resultBytes, "comparative result");
  const review = parseJson(
    readStableRegularFile(
      containedFile(before.packet.packet_root, "review-cases.json"),
      4 * 1024 * 1024
    ),
    "comparative review cases"
  );
  validateComparativeResult(result, review, {
    packetRoot: before.packet.packet_root
  });
  options.testHooks?.afterResultRead?.({
    resultPath,
    resultBytes,
    result
  });
  const after = validateComparativeStatic(options);
  assertDeepEqual(
    before,
    after,
    "Comparative packet inputs changed around result reading."
  );
  return {
    static_packet: after.packet,
    static_audit: after.audit,
    formal_result_valid: true,
    schema_version: result.schema_version,
    case_count: result.cases.length,
    unique_case_count: new Set(
      result.cases.map((item) => item.case_id)
    ).size,
    result_sha256: resultSha256,
    result_bytes: resultBytes,
    result,
    review,
    controlled_inputs_unchanged: true
  };
}

/**
 * Preserve exact result bytes and publish the independently validated
 * canonical unblinded analysis through one absent-directory rename.
 */
export function preserveAndUnblindComparative(options) {
  const validated = validateCompletedComparativeEvidence(options);
  const inputs = loadMechanicalInputs({
    ...options,
    validated
  });
  const analysis = buildComparativeUnblindedAnalysis({
    expected: options.expected,
    predeclarationCommit: options.predeclarationCommit,
    validated,
    ...inputs
  });
  const analysisBytes = canonicalAnalysisBytes(analysis);
  const destinationName = options.destinationName ||
    `d2c-comparative-unblind-${validated.result_sha256.slice(0, 8)}`;
  validateDestinationName(destinationName);
  const repoRoot = canonicalDirectory(options.repoRoot, "repository root");
  const resultsRoot = containedDirectory(repoRoot, "eval/results");
  const destination = prepareAbsentOutput(
    path.join(resultsRoot, destinationName)
  );
  const stagingName =
    `.${destinationName}.staging-${process.pid}-${cryptoRandomId()}`;
  const staging = path.join(destination.parent, stagingName);
  fs.mkdirSync(staging, { recursive: false, mode: 0o700 });
  let completed = false;
  try {
    writeNewFile(
      path.join(staging, COMPARATIVE_PRESERVED_RESULT),
      validated.result_bytes
    );
    writeNewFile(
      path.join(staging, COMPARATIVE_ANALYSIS_FILE),
      analysisBytes
    );
    options.testHooks?.beforePublish?.({
      destination: destination.path,
      staging
    });
    refuseExistingPath(destination.path);
    fs.renameSync(staging, destination.path);
    fs.chmodSync(destination.path, 0o500);
    completed = true;
  } finally {
    if (!completed) {
      cleanupOwnedStaging(destination.parent, stagingName);
    }
  }
  const preservedResult = containedFile(
    destination.path,
    COMPARATIVE_PRESERVED_RESULT
  );
  const preservedAnalysis = containedFile(
    destination.path,
    COMPARATIVE_ANALYSIS_FILE
  );
  const resultBytes = readStableRegularFile(
    preservedResult,
    COMPARATIVE_RESOURCE_LIMITS.max_result_bytes
  );
  const rereadAnalysis = readStableRegularFile(
    preservedAnalysis,
    inputs.protocol.resource_limits.analysis_bytes
  );
  if (
    !resultBytes.equals(validated.result_bytes) ||
    sha256(resultBytes) !== validated.result_sha256
  ) {
    throw new Error("Preserved comparative result bytes changed.");
  }
  if (!rereadAnalysis.equals(analysisBytes)) {
    throw new Error("Preserved comparative analysis bytes changed.");
  }
  return {
    destination: destination.path,
    preserved_result: preservedResult,
    preserved_result_sha256: validated.result_sha256,
    preserved_result_bytes: validated.result_bytes.length,
    unblinded_analysis: preservedAnalysis,
    unblinded_analysis_sha256: sha256(analysisBytes),
    analysis
  };
}

/**
 * Rebuild the analysis through a fresh validation/load path and compare exact
 * canonical bytes with the preserved analysis.
 */
export function reproduceComparativeAnalysis(options) {
  const validated = validateCompletedComparativeEvidence(options);
  const inputs = loadMechanicalInputs({
    ...options,
    validated
  });
  const analysis = buildComparativeUnblindedAnalysis({
    expected: options.expected,
    predeclarationCommit: options.predeclarationCommit,
    validated,
    ...inputs
  });
  const reproduced = canonicalAnalysisBytes(analysis);
  const repoRoot = canonicalDirectory(options.repoRoot, "repository root");
  const relative = path.relative(
    repoRoot,
    path.resolve(options.analysisFile)
  ).replaceAll("\\", "/");
  if (!relative.startsWith("eval/results/")) {
    throw new Error("Reproduction target is outside evaluation results.");
  }
  const preserved = readStableRegularFile(
    containedFile(repoRoot, relative),
    inputs.protocol.resource_limits.analysis_bytes
  );
  if (!preserved.equals(reproduced)) {
    throw new Error("Independent comparative analysis reproduction differs.");
  }
  return {
    byte_identical: true,
    analysis_sha256: sha256(reproduced),
    analysis_bytes: reproduced.length
  };
}

export function buildComparativeUnblindedAnalysis(options) {
  validateCorpus(options.corpus);
  validatePriorEvidence(
    options.priorAnalysis,
    options.priorValidation.result,
    options.expected
  );
  const masked = deriveComparativeCases(options.report, options.corpus);
  const identities = assignComparativeIdentities(
    masked,
    options.preparation.preparation_seed,
    canonicalComparativeInputIdentity(options.preparation)
  );
  const corpusById = new Map(
    options.corpus.cases.map((item) => [item.id, item])
  );
  const reportById = new Map(
    options.report.results.map((item) => [item.id, item])
  );
  const priorResultById = new Map(
    options.priorValidation.result.items.map(
      (item) => [item.item_id, item]
    )
  );
  const priorByKey = new Map();
  for (const item of options.priorAnalysis.items) {
    const reviewed = priorResultById.get(item.item_id);
    priorByKey.set(
      `${item.repository_identity}\u0000${item.path}`,
      { item, reviewed }
    );
  }
  const resultByCase = new Map(
    options.validated.result.cases.map((item) => [item.case_id, item])
  );
  const reviewByCase = new Map(
    options.validated.review.cases.map((item) => [item.case_id, item])
  );
  const usedPrior = new Set();
  const cases = identities.map((identity) => {
    const corpusCase = corpusById.get(identity.case_key);
    const reportCase = reportById.get(identity.case_key);
    const reviewedCase = resultByCase.get(identity.case_id);
    const visibleCase = reviewByCase.get(identity.case_id);
    if (!corpusCase || !reportCase || !reviewedCase || !visibleCase) {
      throw new Error("Comparative case mapping is incomplete.");
    }
    if (
      visibleCase.candidates.length !== identity.candidates.length ||
      visibleCase.snapshot_root !== `cases/${identity.case_id}`
    ) {
      throw new Error("Comparative candidate mapping differs from packet.");
    }
    const predictionPaths = [...reportCase.predictions.important_files];
    const labelPaths = corpusCase.labels.important_files.map(
      (item) => item.path
    );
    const predictions = new Set(predictionPaths);
    const labels = new Set(labelPaths);
    const selectionById = new Map(
      reviewedCase.selections.map((item, index) => [
        item.candidate_id,
        { ...item, position: index + 1 }
      ])
    );
    const candidates = identity.candidates.map((candidate, index) => {
      const visible = visibleCase.candidates[index];
      if (
        visible.candidate_id !== candidate.candidate_id ||
        visible.path !== candidate.path
      ) {
        throw new Error("Comparative opaque identity mapping differs.");
      }
      const predictionMember = predictions.has(candidate.path);
      const labelMember = labels.has(candidate.path);
      const origin = candidateOrigin(predictionMember, labelMember);
      const selection = selectionById.get(candidate.candidate_id);
      const reviewStatus = reviewedCase.outcome === "unknown"
        ? "not-judged-unknown"
        : selection
          ? "selected"
          : "unselected";
      const prior = origin === "consensus"
        ? emptyConsensusPrior()
        : joinedPrior(
            priorByKey,
            usedPrior,
            corpusCase,
            candidate.path,
            origin
          );
      return {
        candidate_id: candidate.candidate_id,
        path: candidate.path,
        file_metadata: {
          byte_count: visible.file_metadata.byte_count,
          sha256: visible.file_metadata.sha256
        },
        origin,
        prediction_member: predictionMember,
        label_member: labelMember,
        consensus: origin === "consensus",
        review_status: reviewStatus,
        selected_position: selection?.position || null,
        comparative_rationale: selection?.rationale || null,
        comparative_direct_sources: selection
          ? [...selection.source_paths]
          : [],
        prior_d2c: prior
      };
    });
    const selectedPaths = reviewedCase.selections.map((selection) => {
      const candidate = candidates.find(
        (item) => item.candidate_id === selection.candidate_id
      );
      if (!candidate) {
        throw new Error("Selected comparative candidate is unavailable.");
      }
      return candidate.path;
    });
    return {
      case_id: identity.case_id,
      d2a_case_id: corpusCase.id,
      repository: corpusCase.repository,
      revision: corpusCase.revision,
      category: corpusCase.category,
      outcome: reviewedCase.outcome,
      unknown_reason: reviewedCase.unknown_reason,
      unknown_not_negative: reviewedCase.outcome === "unknown",
      frozen_prediction_paths: predictionPaths,
      frozen_label_paths: labelPaths,
      reviewer_selected_paths: selectedPaths,
      set_comparison: compareCaseSets(
        reviewedCase.outcome,
        selectedPaths,
        predictionPaths,
        labelPaths
      ),
      candidates
    };
  });
  if (usedPrior.size !== options.expected.priorItemCount) {
    throw new Error("Prior D.2C disputed-item join is incomplete.");
  }
  const summaries = deriveSummaries(cases);
  const analysis = {
    schema_version: COMPARATIVE_UNBLINDED_SCHEMA,
    bindings: {
      preparation_commit: options.expected.preparationCommit,
      predeclaration_commit: options.predeclarationCommit,
      restored_artifact_sha256: options.expected.restoredArtifactSha256,
      raw_report_sha256: options.expected.rawReportSha256,
      corpus_manifest_sha256: options.expected.corpusManifestSha256,
      prior_review_result_sha256:
        options.expected.priorReviewResultSha256,
      prior_unblinded_analysis_sha256:
        options.expected.priorUnblindedAnalysisSha256,
      comparative_preparation_sha256:
        options.expected.comparativePreparationSha256,
      canonical_input_sha256: options.expected.canonicalInputSha256,
      reviewer_prompt_sha256: options.expected.reviewerPromptSha256,
      result_schema_sha256: options.expected.resultSchemaSha256,
      review_cases_sha256: options.expected.reviewCasesSha256,
      source_case_snapshots_sha256:
        options.expected.sourceCaseSnapshotsSha256,
      comparative_case_snapshots_sha256:
        options.expected.comparativeCaseSnapshotsSha256,
      packet_manifest_sha256: options.expected.packetManifestSha256,
      packet_commitment: options.expected.packetHash,
      protocol_sha256: options.protocolSha256,
      analysis_schema_sha256: options.analysisSchemaSha256,
      result_sha256: options.validated.result_sha256
    },
    validation: {
      outcome: "pass",
      formal_result_valid: true,
      schema_version: options.validated.schema_version,
      result_bytes: options.validated.result_bytes.length,
      case_count: options.validated.case_count,
      unique_case_count: options.validated.unique_case_count,
      controlled_inputs_unchanged:
        options.validated.controlled_inputs_unchanged
    },
    method: {
      analysis_kind: "descriptive reviewer agreement",
      reviewer_unknown_is_negative: false,
      unknown_cases_in_set_comparisons: false,
      prior_dispositions_modified: false,
      reviewer_selections_modified: false,
      frozen_labels_modified: false,
      official_score_recalculated: false,
      release_gate_changed: false,
      ground_truth_claimed: false
    },
    ...summaries,
    cases
  };
  validateComparativeUnblindedAnalysis(analysis, {
    expectedCaseCount: options.expected.caseCount,
    expectedCandidateCount: options.expected.candidateCount
  });
  return analysis;
}

export function validateComparativeUnblindedAnalysis(value, options = {}) {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, TOP_LEVEL_FIELDS) ||
    value.schema_version !== COMPARATIVE_UNBLINDED_SCHEMA ||
    !isPlainRecord(value.bindings) ||
    !hasExactKeys(value.bindings, BINDING_FIELDS) ||
    !isPlainRecord(value.validation) ||
    !hasExactKeys(value.validation, VALIDATION_FIELDS) ||
    !isPlainRecord(value.method) ||
    !hasExactKeys(value.method, METHOD_FIELDS) ||
    !Array.isArray(value.cases) ||
    value.cases.length < 1 ||
    value.cases.length > 50
  ) {
    throw new Error("Comparative unblinded analysis structure is invalid.");
  }
  for (const [key, binding] of Object.entries(value.bindings)) {
    const pattern = key.endsWith("_commit")
      ? /^[0-9a-f]{40}$/
      : /^[0-9a-f]{64}$/;
    if (!pattern.test(binding)) {
      throw new Error("Comparative analysis binding is invalid.");
    }
  }
  if (
    value.validation.outcome !== "pass" ||
    value.validation.formal_result_valid !== true ||
    value.validation.controlled_inputs_unchanged !== true ||
    value.validation.schema_version !==
      "kanon-d2c-comparative-result-v1" ||
    !Number.isSafeInteger(value.validation.result_bytes) ||
    value.validation.result_bytes < 1 ||
    value.validation.result_bytes >
      COMPARATIVE_RESOURCE_LIMITS.max_result_bytes ||
    !Number.isSafeInteger(value.validation.case_count) ||
    !Number.isSafeInteger(value.validation.unique_case_count) ||
    value.validation.case_count !== value.validation.unique_case_count ||
    value.method.analysis_kind !== "descriptive reviewer agreement" ||
    Object.entries(value.method)
      .filter(([key]) => key !== "analysis_kind")
      .some(([, item]) => item !== false)
  ) {
    throw new Error("Comparative analysis method or validation is invalid.");
  }
  const caseIds = new Set();
  const candidateIds = new Set();
  for (const item of value.cases) {
    validateAnalysisCase(item);
    if (caseIds.has(item.case_id)) {
      throw new Error("Comparative analysis contains a duplicate case.");
    }
    caseIds.add(item.case_id);
    for (const candidate of item.candidates) {
      if (candidateIds.has(candidate.candidate_id)) {
        throw new Error("Comparative analysis contains a duplicate candidate.");
      }
      candidateIds.add(candidate.candidate_id);
    }
  }
  if (
    options.expectedCaseCount !== undefined &&
    caseIds.size !== options.expectedCaseCount
  ) {
    throw new Error("Comparative analysis case count differs.");
  }
  if (
    options.expectedCandidateCount !== undefined &&
    candidateIds.size !== options.expectedCandidateCount
  ) {
    throw new Error("Comparative analysis candidate count differs.");
  }
  const summaries = deriveSummaries(value.cases);
  assertDeepEqual(
    {
      counts: value.counts,
      matrices: value.matrices,
      reviewer_agreement: value.reviewer_agreement
    },
    summaries,
    "Comparative analysis summaries do not reconcile with mappings."
  );
  return true;
}

export function canonicalAnalysisBytes(value, maximumBytes = 8 * 1024 * 1024) {
  validateComparativeUnblindedAnalysis(value);
  const bytes = Buffer.from(`${canonicalJson(value)}\n`);
  if (bytes.length > maximumBytes) {
    throw new Error("Comparative unblinded analysis exceeds its byte limit.");
  }
  return bytes;
}

export function validateComparativeAnalysisSchema(value) {
  const expectedTop = [
    "schema_version",
    "bindings",
    "validation",
    "method",
    "counts",
    "matrices",
    "reviewer_agreement",
    "cases"
  ];
  if (
    !isPlainRecord(value) ||
    value.type !== "object" ||
    value.additionalProperties !== false ||
    !sameStringSet(value.required, expectedTop) ||
    value.properties?.schema_version?.const !==
      COMPARATIVE_UNBLINDED_SCHEMA ||
    value.$defs?.case?.additionalProperties !== false ||
    value.$defs?.candidate?.additionalProperties !== false ||
    value.$defs?.prior_join?.additionalProperties !== false ||
    value.$defs?.matrices?.additionalProperties !== false
  ) {
    throw new Error("Comparative analysis schema is not strictly exact.");
  }
  return true;
}

function loadMechanicalInputs(options) {
  const repoRoot = canonicalDirectory(options.repoRoot, "repository root");
  const protocolBytes = readStableRegularFile(
    containedFile(repoRoot, COMPARATIVE_PROTOCOL_FILE),
    512 * 1024
  );
  const schemaBytes = readStableRegularFile(
    containedFile(repoRoot, COMPARATIVE_ANALYSIS_SCHEMA_FILE),
    1024 * 1024
  );
  const protocol = parseJson(protocolBytes, "comparative protocol");
  const analysisSchema = parseJson(
    schemaBytes,
    "comparative analysis schema"
  );
  validateProtocol(protocol, options.expected);
  validateComparativeAnalysisSchema(analysisSchema);
  const preparationBytes = readStableRegularFile(
    containedFile(
      repoRoot,
      "eval/d2c/comparative-preparation.json"
    ),
    128 * 1024
  );
  if (
    sha256(preparationBytes) !==
    options.expected.comparativePreparationSha256
  ) {
    throw new Error("Comparative preparation hash differs.");
  }
  const preparation = parseJson(
    preparationBytes,
    "comparative preparation"
  );
  if (
    canonicalComparativeInputIdentity(preparation) !==
    options.expected.canonicalInputSha256
  ) {
    throw new Error("Comparative canonical input differs.");
  }
  const reportBytes = readStableRegularFile(
    containedFile(repoRoot, preparation.raw_report),
    4 * 1024 * 1024
  );
  const corpusBytes = readStableRegularFile(
    containedFile(repoRoot, preparation.corpus_manifest),
    4 * 1024 * 1024
  );
  if (
    sha256(reportBytes) !== options.expected.rawReportSha256 ||
    sha256(corpusBytes) !== options.expected.corpusManifestSha256
  ) {
    throw new Error("Frozen comparative report or corpus hash differs.");
  }
  const report = parseJson(reportBytes, "D.2A report");
  const corpus = parseJson(corpusBytes, "development corpus");
  validateCorpus(corpus);
  Object.defineProperty(corpus, "_source_bytes", {
    enumerable: false,
    value: corpusBytes
  });
  const priorAnalysisBytes = readStableRegularFile(
    containedFile(
      repoRoot,
      "eval/results/d2c-unblind-838ebccc/unblinded-analysis.json"
    ),
    protocol.resource_limits.prior_analysis_bytes
  );
  if (
    sha256(priorAnalysisBytes) !==
    options.expected.priorUnblindedAnalysisSha256
  ) {
    throw new Error("Prior D.2C unblinded analysis hash differs.");
  }
  const priorValidation = validateCompletedReview({
    repoRoot,
    packetRoot: options.priorPacketRoot,
    expected: options.expected.prior
  });
  if (
    priorValidation.result_sha256 !==
    options.expected.priorReviewResultSha256
  ) {
    throw new Error("Prior D.2C result hash differs.");
  }
  const priorAnalysis = parseJson(
    priorAnalysisBytes,
    "prior D.2C unblinded analysis"
  );
  return {
    preparation,
    report,
    corpus,
    priorAnalysis,
    priorValidation,
    protocol,
    protocolSha256: sha256(protocolBytes),
    analysisSchemaSha256: sha256(schemaBytes)
  };
}

function validatePriorEvidence(analysis, result, expected) {
  if (
    !isPlainRecord(analysis) ||
    !hasExactKeys(analysis, [
      "bindings",
      "case_count",
      "item_count",
      "items",
      "matrices",
      "method",
      "schema_version"
    ]) ||
    analysis.schema_version !== "kanon-d2c-unblinded-analysis-v1" ||
    analysis.item_count !== expected.priorItemCount ||
    analysis.case_count !== expected.caseCount ||
    analysis.bindings?.review_result_sha256 !==
      expected.priorReviewResultSha256 ||
    !Array.isArray(analysis.items) ||
    analysis.items.length !== expected.priorItemCount ||
    !isPlainRecord(result) ||
    !Array.isArray(result.items) ||
    result.items.length !== expected.priorItemCount
  ) {
    throw new Error("Prior D.2C evidence structure differs.");
  }
  const resultById = new Map(result.items.map((item) => [item.item_id, item]));
  const keys = new Set();
  for (const item of analysis.items) {
    if (
      !isPlainRecord(item) ||
      !hasExactKeys(item, PRIOR_ANALYSIS_ITEM_FIELDS) ||
      !DISPUTED_ORIGINS.includes(item.origin) ||
      !ALLOWED_DISPOSITIONS.includes(item.reviewer_disposition) ||
      !CATEGORIES.includes(item.category) ||
      !boundedDisplayText(item.rationale, 1000) ||
      !Array.isArray(item.direct_sources)
    ) {
      throw new Error("Prior D.2C analysis item is invalid.");
    }
    validateRelativePath(item.path);
    for (const source of item.direct_sources) {
      validateRelativePath(source);
    }
    const reviewed = resultById.get(item.item_id);
    if (
      !reviewed ||
      reviewed.case_id !== item.case_id ||
      reviewed.path !== item.path ||
      reviewed.reviewer_disposition !== item.reviewer_disposition ||
      reviewed.rationale !== item.rationale
    ) {
      throw new Error("Prior D.2C disposition join changed.");
    }
    assertDeepEqual(
      reviewed.source_paths,
      item.direct_sources,
      "Prior D.2C source paths changed."
    );
    const key = `${item.repository_identity}\u0000${item.path}`;
    if (keys.has(key)) {
      throw new Error("Prior D.2C item mapping contains a duplicate.");
    }
    keys.add(key);
  }
}

function joinedPrior(map, used, corpusCase, candidatePath, origin) {
  const key = `${corpusCase.id}\u0000${candidatePath}`;
  const joined = map.get(key);
  if (!joined || used.has(key) || !joined.reviewed) {
    throw new Error("Disputed comparative candidate lacks one prior join.");
  }
  if (
    joined.item.origin !== origin ||
    joined.item.category !== corpusCase.category
  ) {
    throw new Error("Prior D.2C origin or category differs.");
  }
  used.add(key);
  return {
    join_status: "joined-disputed",
    item_id: joined.item.item_id,
    case_id: joined.item.case_id,
    origin: joined.item.origin,
    category: joined.item.category,
    reviewer_disposition: joined.item.reviewer_disposition,
    rationale: joined.item.rationale,
    direct_sources: [...joined.item.direct_sources],
    reviewed_file_metadata: {
      byte_count: joined.reviewed.file_metadata.byte_count,
      sha256: joined.reviewed.file_metadata.sha256
    },
    packet_commitment: joined.item.packet_commitment,
    review_result_sha256: joined.item.review_result_sha256
  };
}

function emptyConsensusPrior() {
  return {
    join_status: "not-applicable-consensus",
    item_id: null,
    case_id: null,
    origin: null,
    category: null,
    reviewer_disposition: null,
    rationale: null,
    direct_sources: [],
    reviewed_file_metadata: null,
    packet_commitment: null,
    review_result_sha256: null
  };
}

function compareCaseSets(outcome, reviewerPaths, predictionPaths, labelPaths) {
  if (outcome === "unknown") {
    return {
      reviewer_selection_size: null,
      prediction_intersection_size: null,
      label_intersection_size: null,
      prediction_symmetric_difference_distance: null,
      label_symmetric_difference_distance: null,
      closer: "unknown-not-compared",
      exact_prediction_set_match: null,
      exact_label_set_match: null
    };
  }
  const reviewer = new Set(reviewerPaths);
  const predictions = new Set(predictionPaths);
  const labels = new Set(labelPaths);
  const predictionDistance = symmetricDifferenceSize(
    reviewer,
    predictions
  );
  const labelDistance = symmetricDifferenceSize(reviewer, labels);
  return {
    reviewer_selection_size: reviewer.size,
    prediction_intersection_size: intersectionSize(
      reviewer,
      predictions
    ),
    label_intersection_size: intersectionSize(reviewer, labels),
    prediction_symmetric_difference_distance: predictionDistance,
    label_symmetric_difference_distance: labelDistance,
    closer: predictionDistance < labelDistance
      ? "prediction-closer"
      : labelDistance < predictionDistance
        ? "label-closer"
        : "tie",
    exact_prediction_set_match: sameSet(reviewer, predictions),
    exact_label_set_match: sameSet(reviewer, labels)
  };
}

function deriveSummaries(cases) {
  const allCandidates = cases.flatMap((item) => item.candidates);
  const statusCounts = selectionCounts(allCandidates);
  const counts = {
    case_count: cases.length,
    candidate_count: allCandidates.length,
    selection_outcomes: cases.filter(
      (item) => item.outcome === "selection"
    ).length,
    unknown_outcomes: cases.filter(
      (item) => item.outcome === "unknown"
    ).length,
    selection_size_distribution: Array.from(
      { length: 6 },
      (_unused, selectionSize) => ({
        selection_size: selectionSize,
        case_count: cases.filter(
          (item) =>
            item.outcome === "selection" &&
            item.reviewer_selected_paths.length === selectionSize
        ).length
      })
    ),
    selected_candidates: statusCounts.selected,
    unselected_candidates: statusCounts.unselected,
    not_judged_unknown_candidates:
      statusCounts.not_judged_unknown
  };
  const matrices = {
    origin_selection: ORIGINS.map((origin) => ({
      origin,
      counts: selectionCounts(
        allCandidates.filter((item) => item.origin === origin)
      )
    })),
    category_origin_selection: CATEGORIES.map((category) => ({
      category,
      origins: ORIGINS.map((origin) => ({
        origin,
        counts: selectionCounts(
          cases
            .filter((item) => item.category === category)
            .flatMap((item) => item.candidates)
            .filter((item) => item.origin === origin)
        )
      }))
    })),
    selected_position_by_origin: POSITIONS.map((position) => {
      const origins = ORIGINS.map((origin) => ({
        origin,
        count: allCandidates.filter(
          (item) =>
            item.origin === origin &&
            item.selected_position === position
        ).length
      }));
      return {
        position,
        origins,
        total: origins.reduce((total, item) => total + item.count, 0)
      };
    }),
    prior_disposition_selection: ALLOWED_DISPOSITIONS.map(
      (reviewerDisposition) => {
        const matching = allCandidates.filter(
          (item) =>
            item.prior_d2c.join_status === "joined-disputed" &&
            item.prior_d2c.reviewer_disposition === reviewerDisposition
        );
        return {
          reviewer_disposition: reviewerDisposition,
          origins: DISPUTED_ORIGINS.map((origin) => ({
            origin,
            counts: selectionCounts(
              matching.filter((item) => item.origin === origin)
            )
          })),
          counts: selectionCounts(matching)
        };
      }
    )
  };
  const selectionCases = cases.filter(
    (item) => item.outcome === "selection"
  );
  const unknownCount = cases.length - selectionCases.length;
  const exactPrediction = selectionCases.filter(
    (item) => item.set_comparison.exact_prediction_set_match
  ).length;
  const exactLabel = selectionCases.filter(
    (item) => item.set_comparison.exact_label_set_match
  ).length;
  const reviewerAgreement = {
    selection_case_count: selectionCases.length,
    unknown_case_count_excluded: unknownCount,
    with_predictions: aggregateAgreement(
      selectionCases,
      "frozen_prediction_paths"
    ),
    with_labels: aggregateAgreement(
      selectionCases,
      "frozen_label_paths"
    ),
    closer_case_counts: {
      prediction_closer: selectionCases.filter(
        (item) => item.set_comparison.closer === "prediction-closer"
      ).length,
      label_closer: selectionCases.filter(
        (item) => item.set_comparison.closer === "label-closer"
      ).length,
      tie: selectionCases.filter(
        (item) => item.set_comparison.closer === "tie"
      ).length,
      unknown_not_compared: unknownCount,
      total: cases.length
    },
    exact_set_matches: {
      prediction: exactPrediction,
      label: exactLabel,
      both: selectionCases.filter(
        (item) =>
          item.set_comparison.exact_prediction_set_match &&
          item.set_comparison.exact_label_set_match
      ).length,
      unknown_not_compared: unknownCount
    }
  };
  return {
    counts,
    matrices,
    reviewer_agreement: reviewerAgreement
  };
}

function aggregateAgreement(cases, referenceField) {
  let reviewerCount = 0;
  let referenceCount = 0;
  let intersection = 0;
  let union = 0;
  let distance = 0;
  for (const item of cases) {
    const reviewer = new Set(item.reviewer_selected_paths);
    const reference = new Set(item[referenceField]);
    reviewerCount += reviewer.size;
    referenceCount += reference.size;
    const itemIntersection = intersectionSize(reviewer, reference);
    const itemUnion = new Set([...reviewer, ...reference]).size;
    intersection += itemIntersection;
    union += itemUnion;
    distance += symmetricDifferenceSize(reviewer, reference);
  }
  return {
    reviewer_path_count: reviewerCount,
    reference_path_count: referenceCount,
    intersection_path_count: intersection,
    union_path_count: union,
    symmetric_difference_path_count: distance,
    jaccard_numerator: intersection,
    jaccard_denominator: union,
    jaccard_reviewer_agreement:
      union === 0 ? 1 : Number((intersection / union).toFixed(6))
  };
}

function selectionCounts(candidates) {
  const output = {
    selected: 0,
    unselected: 0,
    not_judged_unknown: 0,
    total: candidates.length
  };
  for (const item of candidates) {
    if (!REVIEW_STATUSES.includes(item.review_status)) {
      throw new Error("Comparative candidate review status is invalid.");
    }
    output[item.review_status.replaceAll("-", "_")] += 1;
  }
  return output;
}

function validateAnalysisCase(item) {
  if (
    !isPlainRecord(item) ||
    !hasExactKeys(item, CASE_FIELDS) ||
    !/^case-[0-9a-f]{20}$/.test(item.case_id) ||
    !boundedDisplayText(item.d2a_case_id, 500) ||
    !boundedDisplayText(item.repository, 2000) ||
    !/^[0-9a-f]{40}$/.test(item.revision) ||
    !CATEGORIES.includes(item.category) ||
    !["selection", "unknown"].includes(item.outcome) ||
    typeof item.unknown_reason !== "string" ||
    !Array.isArray(item.frozen_prediction_paths) ||
    !Array.isArray(item.frozen_label_paths) ||
    !Array.isArray(item.reviewer_selected_paths) ||
    !Array.isArray(item.candidates) ||
    item.candidates.length < 1 ||
    item.candidates.length > 10
  ) {
    throw new Error("Comparative analysis case is malformed.");
  }
  for (const values of [
    item.frozen_prediction_paths,
    item.frozen_label_paths,
    item.reviewer_selected_paths
  ]) {
    if (values.length > 5 || new Set(values).size !== values.length) {
      throw new Error("Comparative analysis path set is invalid.");
    }
    values.forEach(validateRelativePath);
  }
  if (
    item.outcome === "unknown" &&
    (
      !boundedDisplayText(item.unknown_reason, 1000) ||
      item.unknown_not_negative !== true ||
      item.reviewer_selected_paths.length !== 0
    )
  ) {
    throw new Error("Comparative analysis Unknown handling is invalid.");
  }
  if (
    item.outcome === "selection" &&
    (
      item.unknown_reason !== "" ||
      item.unknown_not_negative !== false
    )
  ) {
    throw new Error("Comparative selection outcome is invalid.");
  }
  const expectedComparison = compareCaseSets(
    item.outcome,
    item.reviewer_selected_paths,
    item.frozen_prediction_paths,
    item.frozen_label_paths
  );
  assertDeepEqual(
    item.set_comparison,
    expectedComparison,
    "Comparative case set formulas differ."
  );
  const selectedPositions = [];
  const candidatePaths = new Set();
  const frozenPredictions = new Set(item.frozen_prediction_paths);
  const frozenLabels = new Set(item.frozen_label_paths);
  for (const candidate of item.candidates) {
    validateAnalysisCandidate(candidate, item);
    if (candidatePaths.has(candidate.path)) {
      throw new Error("Comparative analysis contains a duplicate path.");
    }
    candidatePaths.add(candidate.path);
    if (
      candidate.prediction_member !==
        frozenPredictions.has(candidate.path) ||
      candidate.label_member !== frozenLabels.has(candidate.path)
    ) {
      throw new Error(
        "Comparative candidate membership differs from frozen sets."
      );
    }
    if (candidate.selected_position !== null) {
      selectedPositions.push(candidate.selected_position);
    }
  }
  const expectedUnion = new Set([
    ...item.frozen_prediction_paths,
    ...item.frozen_label_paths
  ]);
  if (!sameSet(candidatePaths, expectedUnion)) {
    throw new Error("Comparative candidate mapping is not the frozen union.");
  }
  assertDeepEqual(
    selectedPositions.sort((left, right) => left - right),
    Array.from(
      { length: item.reviewer_selected_paths.length },
      (_unused, index) => index + 1
    ),
    "Comparative selected positions are incomplete."
  );
  const selectedPaths = item.candidates
    .filter((candidate) => candidate.review_status === "selected")
    .sort((left, right) =>
      left.selected_position - right.selected_position
    )
    .map((candidate) => candidate.path);
  assertDeepEqual(
    selectedPaths,
    item.reviewer_selected_paths,
    "Comparative reviewer selection order differs from candidate mapping."
  );
}

function validateAnalysisCandidate(candidate, caseItem) {
  if (
    !isPlainRecord(candidate) ||
    !hasExactKeys(candidate, CANDIDATE_FIELDS) ||
    !/^candidate-[0-9a-f]{24}$/.test(candidate.candidate_id) ||
    !ORIGINS.includes(candidate.origin) ||
    typeof candidate.prediction_member !== "boolean" ||
    typeof candidate.label_member !== "boolean" ||
    typeof candidate.consensus !== "boolean" ||
    !REVIEW_STATUSES.includes(candidate.review_status) ||
    !isPlainRecord(candidate.file_metadata) ||
    !Number.isSafeInteger(candidate.file_metadata.byte_count) ||
    !/^[0-9a-f]{64}$/.test(candidate.file_metadata.sha256) ||
    !Array.isArray(candidate.comparative_direct_sources) ||
    !isPlainRecord(candidate.prior_d2c) ||
    !hasExactKeys(candidate.prior_d2c, PRIOR_FIELDS)
  ) {
    throw new Error("Comparative analysis candidate is malformed.");
  }
  validateRelativePath(candidate.path);
  const expectedOrigin = candidateOrigin(
    candidate.prediction_member,
    candidate.label_member
  );
  if (
    candidate.origin !== expectedOrigin ||
    candidate.consensus !== (expectedOrigin === "consensus")
  ) {
    throw new Error("Comparative candidate origin is inconsistent.");
  }
  const selected = candidate.review_status === "selected";
  if (
    selected !== Number.isSafeInteger(candidate.selected_position) ||
    (
      selected &&
      (
        candidate.selected_position < 1 ||
        candidate.selected_position > 5 ||
        !boundedDisplayText(candidate.comparative_rationale, 1000) ||
        !Array.isArray(candidate.comparative_direct_sources) ||
        candidate.comparative_direct_sources.length < 1
      )
    ) ||
    (
      !selected &&
      (
        candidate.selected_position !== null ||
        candidate.comparative_rationale !== null ||
        candidate.comparative_direct_sources.length !== 0
      )
    )
  ) {
    throw new Error("Comparative candidate selection mapping is invalid.");
  }
  for (const source of candidate.comparative_direct_sources) {
    validateRelativePath(source);
  }
  if (
    caseItem.outcome === "unknown" &&
    candidate.review_status !== "not-judged-unknown"
  ) {
    throw new Error("Unknown case candidate was treated as a judgment.");
  }
  if (
    caseItem.outcome === "selection" &&
    candidate.review_status === "not-judged-unknown"
  ) {
    throw new Error("Selection case candidate has Unknown status.");
  }
  validatePriorJoin(candidate.prior_d2c, candidate.origin);
}

function validatePriorJoin(prior, origin) {
  if (origin === "consensus") {
    const expected = emptyConsensusPrior();
    assertDeepEqual(
      prior,
      expected,
      "Consensus candidate received a prior disputed-item disposition."
    );
    return;
  }
  if (
    prior.join_status !== "joined-disputed" ||
    !/^item-[0-9a-f]{24}$/.test(prior.item_id) ||
    !/^case-[0-9a-f]{20}$/.test(prior.case_id) ||
    prior.origin !== origin ||
    !CATEGORIES.includes(prior.category) ||
    !ALLOWED_DISPOSITIONS.includes(prior.reviewer_disposition) ||
    !boundedDisplayText(prior.rationale, 1000) ||
    !Array.isArray(prior.direct_sources) ||
    prior.direct_sources.length < 1 ||
    prior.direct_sources.length > 20 ||
    new Set(prior.direct_sources).size !== prior.direct_sources.length ||
    !isPlainRecord(prior.reviewed_file_metadata) ||
    !Number.isSafeInteger(prior.reviewed_file_metadata.byte_count) ||
    prior.reviewed_file_metadata.byte_count < 0 ||
    prior.reviewed_file_metadata.byte_count >
      COMPARATIVE_RESOURCE_LIMITS.max_file_bytes ||
    !/^[0-9a-f]{64}$/.test(prior.reviewed_file_metadata.sha256) ||
    !/^[0-9a-f]{64}$/.test(prior.packet_commitment) ||
    !/^[0-9a-f]{64}$/.test(prior.review_result_sha256)
  ) {
    throw new Error("Prior D.2C disputed-item join is invalid.");
  }
  prior.direct_sources.forEach(validateRelativePath);
}

function validateProtocol(value, expected) {
  if (
    !isPlainRecord(value) ||
    value.schema_version !==
      "kanon-d2c-comparative-unblinding-protocol-v1" ||
    value.scope !== "evaluation-only descriptive reviewer agreement" ||
    value.outputs?.preserved_result_name !==
      COMPARATIVE_PRESERVED_RESULT ||
    value.outputs?.analysis_name !== COMPARATIVE_ANALYSIS_FILE ||
    value.outputs?.replacement !== "refuse" ||
    value.expected_structure?.included_cases !== expected.caseCount ||
    value.expected_structure?.union_candidates !==
      expected.candidateCount ||
    value.expected_structure?.consensus_candidates !==
      expected.consensusCount ||
    value.expected_structure?.disputed_candidates !==
      expected.priorItemCount ||
    value.expected_structure?.excluded_exact_agreement_cases !==
      expected.excludedExactAgreementCount ||
    canonicalJson(value.closed_orders?.origins) !==
      canonicalJson(ORIGINS) ||
    canonicalJson(value.closed_orders?.categories) !==
      canonicalJson(CATEGORIES) ||
    canonicalJson(value.closed_orders?.positions) !==
      canonicalJson(POSITIONS) ||
    canonicalJson(value.closed_orders?.prior_dispositions) !==
      canonicalJson(ALLOWED_DISPOSITIONS)
  ) {
    throw new Error("Comparative predeclared protocol differs.");
  }
  const expectedBindings = {
    preparation_commit: expected.preparationCommit,
    restored_artifact_sha256: expected.restoredArtifactSha256,
    raw_report_sha256: expected.rawReportSha256,
    corpus_manifest_sha256: expected.corpusManifestSha256,
    prior_review_result_sha256: expected.priorReviewResultSha256,
    prior_unblinded_analysis_sha256:
      expected.priorUnblindedAnalysisSha256,
    comparative_preparation_sha256:
      expected.comparativePreparationSha256,
    canonical_input_sha256: expected.canonicalInputSha256,
    reviewer_prompt_sha256: expected.reviewerPromptSha256,
    result_schema_sha256: expected.resultSchemaSha256,
    review_cases_sha256: expected.reviewCasesSha256,
    source_case_snapshots_sha256:
      expected.sourceCaseSnapshotsSha256,
    comparative_case_snapshots_sha256:
      expected.comparativeCaseSnapshotsSha256,
    packet_manifest_sha256: expected.packetManifestSha256,
    packet_commitment: expected.packetHash
  };
  assertDeepEqual(
    value.frozen_bindings,
    expectedBindings,
    "Comparative protocol frozen bindings differ."
  );
  if (
    value.resource_limits?.result_bytes !==
      COMPARATIVE_RESOURCE_LIMITS.max_result_bytes ||
    value.prohibited_inferences?.official_score_recalculation !== false ||
    value.prohibited_inferences?.release_gate_change !== false
  ) {
    throw new Error("Comparative protocol limits or boundaries differ.");
  }
}

function validateExpected(value) {
  if (
    !isPlainRecord(value) ||
    !Number.isSafeInteger(value.caseCount) ||
    !Number.isSafeInteger(value.candidateCount) ||
    !Number.isSafeInteger(value.consensusCount) ||
    !Number.isSafeInteger(value.priorItemCount) ||
    !Number.isSafeInteger(value.excludedExactAgreementCount) ||
    !/^[0-9a-f]{40}$/.test(value.preparationCommit) ||
    !isPlainRecord(value.prior)
  ) {
    throw new Error("Comparative frozen expected bindings are invalid.");
  }
  for (const [key, item] of Object.entries(value)) {
    if (
      ![
        "caseCount",
        "candidateCount",
        "consensusCount",
        "priorItemCount",
        "excludedExactAgreementCount",
        "preparationCommit",
        "prior"
      ].includes(key) &&
      !/^[0-9a-f]{64}$/.test(item)
    ) {
      throw new Error("Comparative frozen expected hash is invalid.");
    }
  }
}

function validateDestinationName(value) {
  if (
    typeof value !== "string" ||
    !/^d2c-comparative-unblind-[0-9a-f]{8,64}$/.test(value)
  ) {
    throw new Error("Comparative unblinding destination name is invalid.");
  }
}

function candidateOrigin(predictionMember, labelMember) {
  if (predictionMember && labelMember) {
    return "consensus";
  }
  if (predictionMember) {
    return "prediction-only";
  }
  if (labelMember) {
    return "label-only";
  }
  throw new Error("Comparative candidate is outside the frozen union.");
}

function intersectionSize(left, right) {
  let count = 0;
  for (const item of left) {
    if (right.has(item)) count += 1;
  }
  return count;
}

function symmetricDifferenceSize(left, right) {
  return left.size + right.size - 2 * intersectionSize(left, right);
}

function sameSet(left, right) {
  return left.size === right.size && intersectionSize(left, right) === left.size;
}

function boundedDisplayText(value, maximumBytes) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Buffer.byteLength(value, "utf8") <= maximumBytes &&
    !UNSAFE_DISPLAY.test(value)
  );
}

function containedDirectory(root, relativePath) {
  const selected = resolveContainedPath(root, relativePath, {
    type: "directory"
  });
  if (!selected.ok) {
    throw new Error(`Unsafe contained directory: ${selected.reason}`);
  }
  return selected.path;
}

function sameStringSet(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    [...left].sort(compareText).every(
      (item, index) => item === [...right].sort(compareText)[index]
    )
  );
}

function cryptoRandomId() {
  return crypto.randomUUID();
}
