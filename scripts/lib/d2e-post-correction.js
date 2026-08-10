import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveContainedPath } from "../../src/path-security.js";
import { safeTerminalText } from "../../src/trust.js";
import { repositoryCacheName } from "./eval-corpus/checkout.js";
import {
  canonicalJson,
  semanticReportProjection,
  sha256
} from "./d2e-evidence.js";
import {
  buildPostCorrectionComparison
} from "./d2e-post-correction-comparison.js";
import { validateRankingTrace } from "./d2e-trace.js";

export const POST_CORRECTION_AUTHORITY_SHA256 =
  "b4227670b7b831f1949598add2fa538c875cdb90ab55b1820a35ba81b5543087";
const AUTHORITY_PATH = "eval/d2e/POST_CORRECTION_AUTHORITY.json";
const FAILURE_ROOT = "eval/results/d2e-trace-failed-e0a3a224";
const RECOVERY_ROOT =
  "eval/results/d2e-recovery-b26f85c47e98a686a79cce5359b50a559db483b70ecd23d15eda014621d411f1";
const ANALYSIS_ROOT =
  "eval/results/d2e-analysis-b84a9706ebe948303c9e6bc67641fc0dcbef81c0a873098c1d65c2be2dfef81b";
const D2A_PATH =
  "eval/results/development-0.4.0-rc.1-d2a-74208b9a.json";
const MAX_SMALL_BYTES = 8 * 1024 * 1024;
const MAX_TRACE_BYTES = 128 * 1024 * 1024;
const MAX_TRACE_TOTAL_BYTES = 1024 * 1024 * 1024;
const HASH = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;

const DIRECT_BINDINGS = [
  ["eval/d2e/ANALYSIS_AUTHORITY.json", "analysis_authority_sha256"],
  [`${ANALYSIS_ROOT}/analysis.json`, "analysis_identity_sha256"],
  ["eval/d2e/analysis.schema.json", "analysis_schema_sha256"],
  ["eval/corpus.json", "corpus_sha256"],
  [
    "eval/results/development-0.4.0-rc.1-d2a-74208b9a.json",
    "d2a_report_sha256"
  ],
  [
    `${ANALYSIS_ROOT}/evidence-manifest.json`,
    "d2e_analysis_evidence_manifest_sha256"
  ],
  [
    `${ANALYSIS_ROOT}/mechanism-analysis.json`,
    "d2e_mechanism_analysis_result_sha256"
  ],
  ["eval/d2e/PROTOCOL.md", "d2e_protocol_sha256"],
  [`${RECOVERY_ROOT}/recovery-binding.json`, "d2e_recovery_binding_sha256"],
  ["V_1design.md", "design_sha256"],
  ["eval/PROTOCOL.md", "evaluation_protocol_sha256"],
  [`${FAILURE_ROOT}/attempt-binding.json`, "failed_attempt_binding_sha256"],
  [`${FAILURE_ROOT}/failure-manifest.json`, "failed_attempt_manifest_sha256"],
  [`${FAILURE_ROOT}/raw-report.json`, "failed_raw_report_sha256"],
  ["package-lock.json", "package_lock_sha256"],
  ["package.json", "package_sha256"],
  ["eval/PAIRED_ABLATION.md", "paired_ablation_sha256"],
  ["eval/paired-ablation.config.json", "paired_configuration_file_sha256"],
  ["src/v1/build-metadata.json", "public_capability_sha256"],
  [`${RECOVERY_ROOT}/trace-manifest.json`, "recovered_trace_manifest_sha256"],
  [`${RECOVERY_ROOT}/equivalence.json`, "strict_equivalence_result_sha256"],
  ["eval/d2e/trace.schema.json", "trace_schema_sha256"],
  ["src/version.js", "version_source_sha256"]
];

export function expectedAttemptFiles() {
  return [
    "attempt-binding.json",
    "attempt-consumption.json",
    "raw-report.json",
    "trace-manifest.json",
    "trace-off-report.json",
    ...Array.from(
      { length: 30 },
      (_, index) => `traces/${String(index + 1).padStart(3, "0")}.json`
    )
  ];
}

export function loadPostCorrectionAuthority(repoRoot) {
  const bytes = readContainedFile(
    repoRoot,
    AUTHORITY_PATH,
    1024 * 1024
  );
  const authority = parseJson(bytes, "post-correction authority");
  expect(
    sha256(bytes) === POST_CORRECTION_AUTHORITY_SHA256,
    "authority-hash"
  );
  expect(
    bytes.equals(canonicalBytes(authority)),
    "authority-canonical"
  );
  expect(
    authority?.schema ===
      "kanon-d2e-post-correction-authority-v1" &&
      authority?.status ===
        "frozen-before-corpus-or-evidence-access" &&
      authority?.attempt?.case_count === 30 &&
      authority?.attempt?.corpus_attempt_limit === 1 &&
      authority?.attempt?.runner_invocations === 1 &&
      authority?.session?.authority_immutable_after_commit === true &&
      authority?.session?.branch === "release/v.1.0.0" &&
      authority?.session?.package_version === "0.4.0-rc.1" &&
      authority?.session?.runtime_dependencies === 0,
    "authority-scope"
  );
  expect(
    canonicalJson(authority.inventory.attempt_success.exact_files) ===
      canonicalJson(expectedAttemptFiles()) &&
      authority.inventory.attempt_success.exact_file_count === 35 &&
      authority.decision_conditions.correction_supported.length === 17,
    "authority-inventory-and-gates"
  );
  for (const [name, value] of Object.entries(authority.bindings)) {
    const pattern =
      name.endsWith("_commit") || name === "starting_head"
        ? COMMIT
        : HASH;
    expect(pattern.test(String(value)), `authority-binding-${name}`);
  }
  return { authority, bytes };
}

export function verifyFrozenPostCorrectionInputs(repoRoot) {
  const root = canonicalDirectory(repoRoot);
  const { authority, bytes: authorityBytes } =
    loadPostCorrectionAuthority(root);
  for (const [relative, binding] of DIRECT_BINDINGS) {
    expect(
      sha256(readContainedFile(root, relative, MAX_SMALL_BYTES)) ===
        authority.bindings[binding],
      `direct-binding-${binding}`
    );
  }
  expect(
    sha256(
      readContainedFile(
        root,
        "runtime/build-metadata.json",
        1024 * 1024
      )
    ) === authority.bindings.public_capability_sha256,
    "runtime-public-capability"
  );
  expect(
    readContainedFile(
      root,
      "src/code-intel/curate.js",
      1024 * 1024
    ).equals(
      readContainedFile(
        root,
        "runtime/src/code-intel/curate.js",
        1024 * 1024
      )
    ),
    "corrected-generated-curator-sync"
  );

  const corpus = readContainedJson(root, "eval/corpus.json");
  const paired = readContainedJson(
    root,
    "eval/paired-ablation.config.json"
  );
  const binding = readContainedJson(
    root,
    `${RECOVERY_ROOT}/attempt-binding.json`
  );
  const failedBinding = readContainedJson(
    root,
    `${FAILURE_ROOT}/attempt-binding.json`
  );
  const failedManifest = readContainedJson(
    root,
    `${FAILURE_ROOT}/failure-manifest.json`
  );
  const manifest = readContainedJson(
    root,
    `${RECOVERY_ROOT}/trace-manifest.json`
  );
  const recovery = readContainedJson(
    root,
    `${RECOVERY_ROOT}/recovery-binding.json`
  );
  const report = readContainedJson(
    root,
    `${RECOVERY_ROOT}/raw-report.json`
  );
  const d2a = readContainedJson(root, D2A_PATH);
  const packageManifest = readContainedJson(root, "package.json");
  const sourceMetadata = readContainedJson(
    root,
    "src/v1/build-metadata.json"
  );
  const runtimeMetadata = readContainedJson(
    root,
    "runtime/build-metadata.json"
  );

  expect(
    Array.isArray(corpus.cases) &&
      corpus.cases.length === 30 &&
      sha256(
        Buffer.from(
          JSON.stringify(
            corpus.cases.map((item) => ({
              id: item.id,
              revision: item.revision
            }))
          )
        )
      ) === authority.bindings.ordered_revisions_sha256,
    "corpus-revision-binding"
  );
  expect(
    sha256(Buffer.from(canonicalJson(paired))) ===
      authority.bindings.canonical_paired_configuration_sha256,
    "paired-canonical-binding"
  );
  expect(
    sha256(Buffer.from(canonicalJson(binding.configuration))) ===
      authority.bindings.attempt_configuration_sha256,
    "attempt-configuration-binding"
  );
  expect(
    sha256(Buffer.from(canonicalJson(corpus.policy))) ===
      authority.bindings.scoring_policy_sha256,
    "scoring-policy-binding"
  );
  expect(
    sha256(
      Buffer.from(
        canonicalJson({
          category_thresholds: corpus.policy.category_thresholds,
          dimension_thresholds: corpus.policy.dimension_thresholds,
          maximum_weighted_error_per_case:
            corpus.policy.maximum_weighted_error_per_case,
          minimum_precision: corpus.policy.minimum_precision,
          minimum_recall: corpus.policy.minimum_recall
        })
      )
    ) === authority.bindings.threshold_projection_sha256,
    "threshold-binding"
  );
  expect(
    canonicalJson(sourceMetadata) === canonicalJson(runtimeMetadata) &&
      sourceMetadata.package_version === "0.4.0-rc.1" &&
      sourceMetadata.runtime.runtime_dependencies === 0 &&
      packageManifest.version === "0.4.0-rc.1" &&
      packageManifest.dependencies === undefined,
    "version-dependency-capability"
  );
  expect(
    canonicalJson(binding) === canonicalJson(failedBinding) &&
      binding.source_commit ===
        "5ce9799f6396520a7bb03d414bf0e81ff13a6700" &&
      binding.behind === 0 &&
      binding.worktree_clean === true &&
      binding.attempt === 1 &&
      binding.retries === 0,
    "failed-recovery-attempt-binding"
  );
  expect(
    failedManifest.trace_set_sha256 ===
        authority.bindings.pre_correction_recovered_trace_set_sha256 &&
      failedManifest.case_count === 30 &&
      failedManifest.candidate_count === 33484 &&
      failedManifest.trace_bytes === 34819892,
    "failed-attempt-summary"
  );

  const failedTree = completeTreeCommitment(
    path.join(root, FAILURE_ROOT)
  );
  expect(
    failedTree.sha256 ===
        authority.bindings.failed_attempt_complete_tree_sha256 &&
      failedTree.files.length === 33,
    "failed-attempt-tree"
  );
  expect(
    recovery.original_failure.tree_sha256 === failedTree.sha256,
    "recovery-failed-tree-binding"
  );

  const traceValidation = validateRecoveredTraces({
    repoRoot: root,
    authority,
    binding,
    corpus,
    failedManifest,
    manifest,
    report
  });
  const cache = verifyFrozenCache(root, corpus, d2a);
  validateAnalysisEvidence(root, authority);

  return {
    authority,
    authority_sha256: sha256(authorityBytes),
    cache,
    counts: traceValidation,
    immutable: {
      failed_attempt_tree_sha256: failedTree.sha256,
      recovery_tree_sha256: completeTreeCommitment(
        path.join(root, RECOVERY_ROOT)
      ).sha256,
      analysis_tree_sha256: completeTreeCommitment(
        path.join(root, ANALYSIS_ROOT)
      ).sha256,
      correction_contract_sha256: sha256(
        readContainedFile(
          root,
          "docs/v1-package-declarations-correction-contract.md",
          1024 * 1024
        )
      ),
      correction_record_sha256: sha256(
        readContainedFile(
          root,
          "docs/v1-run-package-declarations-correction.md",
          1024 * 1024
        )
      ),
      corrected_curator_sha256: sha256(
        readContainedFile(
          root,
          "src/code-intel/curate.js",
          1024 * 1024
        )
      )
    },
    strict_historical_equivalence:
      "failed-required-comparison-unavailable"
  };
}

function validateRecoveredTraces(input) {
  const caseFiles = input.manifest.case_files;
  expect(
    input.manifest.complete === true &&
      input.manifest.case_count === 30 &&
      Array.isArray(caseFiles) &&
      caseFiles.length === 30,
    "recovered-manifest-shape"
  );
  let candidates = 0;
  let eligibleCandidates = 0;
  let traceBytes = 0;
  let observerFailures = 0;
  let incompleteScans = 0;
  const traceSet = [];
  for (const [index, item] of caseFiles.entries()) {
    const ordinal = index + 1;
    const expectedRelative =
      `cases/case-${String(ordinal).padStart(3, "0")}.json`;
    const recoveryBytes = readContainedFile(
      input.repoRoot,
      `${RECOVERY_ROOT}/${expectedRelative}`,
      MAX_TRACE_BYTES
    );
    const failedBytes = readContainedFile(
      input.repoRoot,
      `${FAILURE_ROOT}/${expectedRelative}`,
      MAX_TRACE_BYTES
    );
    const trace = parseJson(recoveryBytes, `recovered trace ${ordinal}`);
    const corpusCase = input.corpus.cases[index];
    expect(
      recoveryBytes.equals(failedBytes) &&
        item.file === expectedRelative &&
        item.ordinal === ordinal &&
        item.id === corpusCase.id &&
        item.revision === corpusCase.revision &&
        item.bytes === recoveryBytes.length &&
        item.sha256 === sha256(recoveryBytes) &&
        item.complete === true,
      `recovered-trace-binding-${ordinal}`
    );
    const validation = validateRankingTrace(trace, {
      protocolSha256: input.binding.protocol_sha256,
      traceSourceCommit: input.binding.source_commit,
      artifactSha256: input.binding.artifact_sha256,
      corpusSha256: input.binding.corpus_sha256,
      caseId: corpusCase.id,
      revision: corpusCase.revision,
      ordinal
    });
    expect(
      validation.valid &&
        trace.completeness.complete === true &&
        trace.completeness.failures.length === 0 &&
        canonicalJson(trace.predictions) ===
          canonicalJson(input.report.results[index].predictions),
      `recovered-trace-validation-${ordinal}`
    );
    candidates += trace.candidates.length;
    eligibleCandidates += trace.candidates.filter(
      (candidate) => candidate.ranking.eligible
    ).length;
    traceBytes += recoveryBytes.length;
    observerFailures += trace.completeness.observer_failures;
    incompleteScans += trace.scan.complete ? 0 : 1;
    traceSet.push({ ordinal, sha256: item.sha256 });
  }
  expect(traceBytes <= MAX_TRACE_TOTAL_BYTES, "recovered-trace-total-bound");
  const traceSetSha256 = sha256(
    Buffer.from(JSON.stringify(traceSet))
  );
  expect(
    traceSetSha256 ===
        input.authority.bindings
          .pre_correction_recovered_trace_set_sha256 &&
      traceSetSha256 === input.manifest.trace_set_sha256 &&
      traceSetSha256 === input.failedManifest.trace_set_sha256 &&
      candidates === 33484 &&
      eligibleCandidates === 28749 &&
      traceBytes === 34819892 &&
      observerFailures === 0 &&
      incompleteScans === 9,
    "recovered-trace-totals"
  );
  return {
    cases: 30,
    candidates,
    eligible_candidates: eligibleCandidates,
    trace_bytes: traceBytes,
    observer_failures: observerFailures,
    incomplete_scans: incompleteScans,
    trace_set_sha256: traceSetSha256
  };
}

function validateAnalysisEvidence(repoRoot, authority) {
  const evidence = readContainedJson(
    repoRoot,
    `${ANALYSIS_ROOT}/evidence-manifest.json`
  );
  expect(
    evidence.conclusion === "supported-generic-hypothesis" &&
      evidence.strict_equivalence ===
        "failed-required-comparison-unavailable" &&
      evidence.bindings.trace_set_sha256 ===
        authority.bindings.pre_correction_recovered_trace_set_sha256 &&
      evidence.bindings.failed_attempt_tree_sha256 ===
        authority.bindings.failed_attempt_complete_tree_sha256 &&
      evidence.bindings.recovery_binding_sha256 ===
        authority.bindings.d2e_recovery_binding_sha256,
    "analysis-evidence-bindings"
  );
  for (const item of evidence.files.filter(
    (entry) => !String(entry.path).startsWith("../")
  )) {
    expect(
      sha256(
        readContainedFile(
          repoRoot,
          `${ANALYSIS_ROOT}/${item.path}`,
          MAX_SMALL_BYTES
        )
      ) === item.sha256,
      `analysis-evidence-file-${item.path}`
    );
  }
}

function verifyFrozenCache(repoRoot, corpus, d2a) {
  expect(
    typeof d2a.cache_root === "string" &&
      path.isAbsolute(d2a.cache_root),
    "cache-root-binding"
  );
  const cacheRoot = canonicalDirectory(d2a.cache_root);
  const bindings = corpus.cases.map((item, index) => ({
    ordinal: index + 1,
    id: item.id,
    revision: item.revision,
    cache_name: repositoryCacheName(item.repository, item.revision)
  }));
  const actualNames = fs.readdirSync(cacheRoot).sort();
  const expectedNames = bindings
    .map((item) => item.cache_name)
    .sort();
  expect(
    canonicalJson(actualNames) === canonicalJson(expectedNames),
    "cache-exact-inventory"
  );
  for (const item of bindings) {
    const checkout = resolveContainedPath(cacheRoot, item.cache_name, {
      type: "directory"
    });
    const git = resolveContainedPath(
      cacheRoot,
      `${item.cache_name}/.git`,
      { type: "any" }
    );
    expect(
      checkout.ok && git.status === "missing",
      `cache-case-${item.ordinal}`
    );
  }
  const identitySha256 = sha256(
    Buffer.from(JSON.stringify(bindings))
  );
  expect(
    identitySha256 === d2a.candidate?.cache_identity_sha256 ||
      identitySha256 ===
        readContainedJson(
          repoRoot,
          `${RECOVERY_ROOT}/attempt-binding.json`
        ).cache_identity_sha256,
    "cache-identity"
  );
  return {
    root: cacheRoot,
    case_count: bindings.length,
    identity_sha256: identitySha256
  };
}

export function verifyCorrectedArtifact(input) {
  const artifactBytes = readExternalFile(
    input.artifactPath,
    128 * 1024 * 1024
  );
  const artifactSha256 = sha256(artifactBytes);
  const conformanceBytes = readExternalFile(
    input.conformancePath,
    2 * 1024 * 1024
  );
  const conformance = parseJson(
    conformanceBytes,
    "corrected artifact conformance"
  );
  const installedRoot = canonicalDirectory(input.installedRoot);
  const analyzer = resolveContainedPath(
    installedRoot,
    "runtime/src/analyze.js",
    { type: "file" }
  );
  expect(
    artifactSha256 ===
        "1f3340f26f92d21387d3debeddeb42428fe3ab5988cfd6e5a6fc95062d262d8f" &&
      conformance.schema === "kanon-artifact-conformance-v1" &&
      conformance.passed === true &&
      conformance.candidate_commit === input.preAttemptHead &&
      conformance.candidate_version === "0.4.0-rc.1" &&
      conformance.artifact_sha256 === artifactSha256 &&
      Array.isArray(conformance.checks) &&
      conformance.checks.length === 43 &&
      canonicalDirectory(conformance.installed_package_root) ===
        installedRoot &&
      analyzer.ok,
    "corrected-artifact-conformance"
  );
  return {
    artifact_sha256: artifactSha256,
    conformance_report_sha256: sha256(conformanceBytes),
    conformance_checks: conformance.checks.length,
    installed_root: installedRoot
  };
}

export function writeAttemptConsumption(input) {
  const root = canonicalDirectory(input.attemptRoot);
  const receipt = {
    attempt_ordinal: 1,
    authority_sha256: POST_CORRECTION_AUTHORITY_SHA256,
    case_ordinal: 1,
    component: input.component,
    consumed: true,
    pre_attempt_head: input.preAttemptHead,
    schema: "kanon-d2e-post-correction-consumption-v1"
  };
  expect(COMMIT.test(input.preAttemptHead), "consumption-head");
  writeExclusiveFile(
    path.join(root, "attempt-consumption.json"),
    canonicalBytes(receipt),
    0o600
  );
  syncDirectory(root);
  return receipt;
}

export function writePostCorrectionJsonFile(
  rootPath,
  relative,
  value
) {
  expect(
    [
      "attempt-binding.json",
      "raw-report.json",
      "trace-off-report.json"
    ].includes(relative),
    "post-correction-core-filename"
  );
  const root = canonicalDirectory(rootPath);
  writeExclusiveFile(
    path.join(root, relative),
    canonicalBytes(value),
    0o600
  );
  syncDirectory(root);
}

export function finalizePostCorrectionTraceAttempt(input) {
  const root = canonicalDirectory(input.attempt.root);
  const bindingBytes = readDirectFile(
    root,
    "attempt-binding.json",
    MAX_SMALL_BYTES
  );
  const consumptionBytes = readDirectFile(
    root,
    "attempt-consumption.json",
    MAX_SMALL_BYTES
  );
  const reportBytes = readDirectFile(
    root,
    "raw-report.json",
    MAX_SMALL_BYTES
  );
  const controlBytes = readDirectFile(
    root,
    "trace-off-report.json",
    MAX_SMALL_BYTES
  );
  const consumption = parseJson(
    consumptionBytes,
    "attempt consumption"
  );
  expect(
    consumption.consumed === true &&
      consumption.attempt_ordinal === 1 &&
      consumption.case_ordinal === 1 &&
      consumption.pre_attempt_head === input.attempt.binding.source_commit &&
      consumption.authority_sha256 ===
        POST_CORRECTION_AUTHORITY_SHA256,
    "consumption-binding"
  );
  const receipts = input.primaryRun.ranking_trace?.receipts;
  expect(
    Array.isArray(receipts) && receipts.length === 30,
    "post-correction-receipts"
  );
  const caseFiles = [];
  const failures = [];
  let candidateCount = 0;
  let eligibleCandidateCount = 0;
  let observerFailureCount = 0;
  let traceBytes = 0;
  for (const [index, receipt] of receipts.entries()) {
    const ordinal = index + 1;
    const fileName = `${String(ordinal).padStart(3, "0")}.json`;
    const relative = `traces/${fileName}`;
    const bytes = readDirectFile(root, relative, MAX_TRACE_BYTES);
    const trace = parseJson(bytes, `post-correction trace ${ordinal}`);
    const expectedCase = input.corpus.cases[index];
    const validation = validateRankingTrace(trace, {
      protocolSha256: input.attempt.binding.protocol_sha256,
      traceSourceCommit: input.attempt.binding.source_commit,
      artifactSha256: input.attempt.binding.artifact_sha256,
      corpusSha256: input.attempt.binding.corpus_sha256,
      caseId: expectedCase.id,
      revision: expectedCase.revision,
      ordinal
    });
    const hash = sha256(bytes);
    const complete =
      receipt.status === "written" &&
      receipt.file_name === fileName &&
      receipt.sha256 === hash &&
      receipt.bytes === bytes.length &&
      receipt.complete === true &&
      bytes.equals(canonicalBytes(trace)) &&
      validation.valid &&
      trace.completeness.complete === true;
    if (!complete) {
      failures.push(`trace-${ordinal}`);
    }
    candidateCount += trace.candidates.length;
    eligibleCandidateCount += trace.candidates.filter(
      (candidate) => candidate.ranking.eligible
    ).length;
    observerFailureCount += trace.completeness.observer_failures;
    traceBytes += bytes.length;
    caseFiles.push({
      bytes: bytes.length,
      candidate_count: trace.candidates.length,
      complete,
      file: relative,
      id: safeTerminalText(expectedCase.id),
      ordinal,
      revision: expectedCase.revision,
      sha256: hash
    });
  }
  if (traceBytes > MAX_TRACE_TOTAL_BYTES) {
    failures.push("trace-total-byte-limit");
  }
  const primaryProjection = semanticReportProjection(
    input.primaryRun
  );
  const controlProjection = semanticReportProjection(
    input.traceOffRun
  );
  const primaryProjectionBytes = Buffer.from(
    canonicalJson(primaryProjection)
  );
  const controlProjectionBytes = Buffer.from(
    canonicalJson(controlProjection)
  );
  const traceEquivalence = {
    exact: primaryProjectionBytes.equals(controlProjectionBytes),
    trace_off_projection_sha256: sha256(controlProjectionBytes),
    trace_on_projection_sha256: sha256(primaryProjectionBytes)
  };
  if (!traceEquivalence.exact) {
    failures.push("trace-on-off-public-result-mismatch");
  }
  if (
    input.primaryRun.results?.length !== 30 ||
    input.traceOffRun.results?.length !== 30
  ) {
    failures.push("case-result-count");
  }
  if (observerFailureCount !== 0) {
    failures.push("observer-failures");
  }
  const traceSetSha256 = sha256(
    Buffer.from(
      canonicalJson(
        caseFiles.map((item) => ({
          ordinal: item.ordinal,
          sha256: item.sha256
        }))
      )
    )
  );
  const manifest = {
    analysis_schema_sha256:
      input.attempt.binding.analysis_schema_sha256,
    artifact_sha256: input.attempt.binding.artifact_sha256,
    attempt: 1,
    attempt_binding_sha256: sha256(bindingBytes),
    attempt_consumption_sha256: sha256(consumptionBytes),
    authority_sha256: POST_CORRECTION_AUTHORITY_SHA256,
    candidate_count: candidateCount,
    case_count: caseFiles.length,
    case_files: caseFiles,
    complete:
      failures.length === 0 &&
      caseFiles.length === 30 &&
      caseFiles.every((item) => item.complete),
    corpus_sha256: input.attempt.binding.corpus_sha256,
    d2a_report_sha256: input.attempt.binding.d2a_report_sha256,
    eligible_candidate_count: eligibleCandidateCount,
    failures: Array.from(new Set(failures)).sort(),
    observer_failure_count: observerFailureCount,
    protocol_sha256: input.attempt.binding.protocol_sha256,
    raw_report_sha256: sha256(reportBytes),
    retries: 0,
    schema: "kanon-d2e-post-correction-trace-manifest-v1",
    source_commit: input.attempt.binding.source_commit,
    trace_bytes: traceBytes,
    trace_off_report_sha256: sha256(controlBytes),
    trace_on_off_equivalence: traceEquivalence,
    trace_schema_sha256: input.attempt.binding.trace_schema_sha256,
    trace_set_sha256: traceSetSha256
  };
  writeExclusiveFile(
    path.join(root, "trace-manifest.json"),
    canonicalBytes(manifest),
    0o600
  );
  syncDirectory(root);
  return manifest;
}

export function validatePostCorrectionAttempt(repoRoot, attemptRoot) {
  const root = canonicalDirectory(attemptRoot);
  const repositoryRoot = canonicalDirectory(repoRoot);
  const { authority } = loadPostCorrectionAuthority(repositoryRoot);
  const expected = expectedAttemptFiles();
  const inventory = completeTreeCommitment(root);
  expect(
    canonicalJson(inventory.files.map((item) => item.path)) ===
      canonicalJson(expected),
    "attempt-exact-inventory"
  );
  const bindingBytes = readDirectFile(
    root,
    "attempt-binding.json",
    MAX_SMALL_BYTES
  );
  const consumptionBytes = readDirectFile(
    root,
    "attempt-consumption.json",
    MAX_SMALL_BYTES
  );
  const reportBytes = readDirectFile(
    root,
    "raw-report.json",
    MAX_SMALL_BYTES
  );
  const controlBytes = readDirectFile(
    root,
    "trace-off-report.json",
    MAX_SMALL_BYTES
  );
  const manifestBytes = readDirectFile(
    root,
    "trace-manifest.json",
    MAX_SMALL_BYTES
  );
  const binding = parseJson(bindingBytes, "post-correction binding");
  const consumption = parseJson(
    consumptionBytes,
    "post-correction consumption"
  );
  const report = parseJson(reportBytes, "post-correction report");
  const control = parseJson(
    controlBytes,
    "post-correction control"
  );
  const manifest = parseJson(
    manifestBytes,
    "post-correction trace manifest"
  );
  expect(
    bindingBytes.equals(canonicalBytes(binding)) &&
      consumptionBytes.equals(canonicalBytes(consumption)) &&
      reportBytes.equals(canonicalBytes(report)) &&
      controlBytes.equals(canonicalBytes(control)) &&
      manifestBytes.equals(canonicalBytes(manifest)),
    "attempt-canonical-core-files"
  );
  expectExactKeys(binding, [
    "ahead",
    "analysis_schema_sha256",
    "artifact_sha256",
    "attempt",
    "authority_commit",
    "authority_sha256",
    "behind",
    "branch",
    "cache_identity_sha256",
    "configuration",
    "conformance",
    "conformance_report_sha256",
    "corpus_case_count",
    "corpus_sha256",
    "correction_commit",
    "d2a_report_sha256",
    "invocation",
    "ordered_revisions_sha256",
    "package_version",
    "paired_configuration_canonical_sha256",
    "paired_configuration_file_sha256",
    "protocol_sha256",
    "public_capability_sha256",
    "retries",
    "schema",
    "scoring_policy_sha256",
    "source_commit",
    "threshold_projection_sha256",
    "trace_schema_sha256",
    "upstream",
    "worktree_clean"
  ], "attempt-binding");
  expectExactKeys(consumption, [
    "attempt_ordinal",
    "authority_sha256",
    "case_ordinal",
    "component",
    "consumed",
    "pre_attempt_head",
    "schema"
  ], "attempt-consumption");
  expectExactKeys(manifest, [
    "analysis_schema_sha256",
    "artifact_sha256",
    "attempt",
    "attempt_binding_sha256",
    "attempt_consumption_sha256",
    "authority_sha256",
    "candidate_count",
    "case_count",
    "case_files",
    "complete",
    "corpus_sha256",
    "d2a_report_sha256",
    "eligible_candidate_count",
    "failures",
    "observer_failure_count",
    "protocol_sha256",
    "raw_report_sha256",
    "retries",
    "schema",
    "source_commit",
    "trace_bytes",
    "trace_off_report_sha256",
    "trace_on_off_equivalence",
    "trace_schema_sha256",
    "trace_set_sha256"
  ], "attempt-manifest");
  for (const [index, item] of manifest.case_files.entries()) {
    expectExactKeys(item, [
      "bytes",
      "candidate_count",
      "complete",
      "file",
      "id",
      "ordinal",
      "revision",
      "sha256"
    ], `attempt-manifest-case-${index + 1}`);
  }
  expect(
    binding.schema ===
        "kanon-d2e-post-correction-attempt-binding-v1" &&
      binding.authority_sha256 ===
        POST_CORRECTION_AUTHORITY_SHA256 &&
      manifest.schema ===
        "kanon-d2e-post-correction-trace-manifest-v1" &&
      manifest.complete === true &&
      manifest.failures.length === 0 &&
      manifest.case_count === 30 &&
      manifest.case_files.length === 30 &&
      manifest.attempt_binding_sha256 === sha256(bindingBytes) &&
      manifest.attempt_consumption_sha256 ===
        sha256(consumptionBytes) &&
      manifest.raw_report_sha256 === sha256(reportBytes) &&
      manifest.trace_off_report_sha256 === sha256(controlBytes) &&
      manifest.analysis_schema_sha256 ===
        binding.analysis_schema_sha256 &&
      manifest.artifact_sha256 === binding.artifact_sha256 &&
      manifest.authority_sha256 ===
        POST_CORRECTION_AUTHORITY_SHA256 &&
      manifest.corpus_sha256 === binding.corpus_sha256 &&
      manifest.d2a_report_sha256 === binding.d2a_report_sha256 &&
      manifest.protocol_sha256 === binding.protocol_sha256 &&
      manifest.source_commit === binding.source_commit &&
      manifest.trace_schema_sha256 ===
        binding.trace_schema_sha256 &&
      manifest.attempt === 1 &&
      manifest.retries === 0 &&
      manifest.trace_on_off_equivalence.exact === true &&
      consumption.consumed === true &&
      consumption.attempt_ordinal === 1 &&
      consumption.case_ordinal === 1 &&
      consumption.component ===
        "canonical-d2e-corpus-runner" &&
      consumption.authority_sha256 ===
        POST_CORRECTION_AUTHORITY_SHA256 &&
      consumption.pre_attempt_head === binding.source_commit,
    "attempt-core-bindings"
  );
  expect(
    COMMIT.test(binding.source_commit) &&
      binding.authority_commit ===
        "2ee3091005b86db6eada2d2b15e0deeae96deb46" &&
      binding.authority_sha256 ===
        POST_CORRECTION_AUTHORITY_SHA256 &&
      binding.correction_commit ===
        authority.bindings.correction_commit &&
      binding.branch === "release/v.1.0.0" &&
      binding.upstream === "origin/release/v.1.0.0" &&
      Number.isSafeInteger(binding.ahead) &&
      binding.ahead >= 0 &&
      binding.behind === 0 &&
      binding.worktree_clean === true &&
      binding.package_version === "0.4.0-rc.1" &&
      binding.protocol_sha256 ===
        authority.bindings.d2e_protocol_sha256 &&
      binding.trace_schema_sha256 ===
        authority.bindings.trace_schema_sha256 &&
      binding.analysis_schema_sha256 ===
        authority.bindings.analysis_schema_sha256 &&
      binding.corpus_sha256 ===
        authority.bindings.corpus_sha256 &&
      binding.corpus_case_count === 30 &&
      binding.d2a_report_sha256 ===
        authority.bindings.d2a_report_sha256 &&
      binding.cache_identity_sha256 ===
        readContainedJson(
          repositoryRoot,
          `${RECOVERY_ROOT}/attempt-binding.json`
        ).cache_identity_sha256 &&
      HASH.test(binding.conformance_report_sha256) &&
      binding.artifact_sha256 ===
        authority.bindings.corrected_production_artifact_sha256 &&
      binding.ordered_revisions_sha256 ===
        authority.bindings.ordered_revisions_sha256 &&
      binding.paired_configuration_file_sha256 ===
        authority.bindings.paired_configuration_file_sha256 &&
      binding.paired_configuration_canonical_sha256 ===
        authority.bindings.canonical_paired_configuration_sha256 &&
      binding.scoring_policy_sha256 ===
        authority.bindings.scoring_policy_sha256 &&
      binding.threshold_projection_sha256 ===
        authority.bindings.threshold_projection_sha256 &&
      binding.public_capability_sha256 ===
        authority.bindings.public_capability_sha256 &&
      binding.conformance?.applicable === true &&
      binding.conformance?.passed === true &&
      binding.conformance?.check_count === 43 &&
      binding.invocation?.artifact_bound === true &&
      binding.invocation?.full_corpus === true &&
      binding.invocation?.no_fetch === true &&
      binding.invocation?.runner === "scripts/eval-corpus.js" &&
      binding.invocation?.runner_invocations === 1 &&
      canonicalJson(binding.invocation?.trace_modes) ===
        canonicalJson(["trace-on", "trace-off"]) &&
      sha256(Buffer.from(canonicalJson(binding.configuration))) ===
        authority.bindings.attempt_configuration_sha256,
    "attempt-frozen-binding"
  );
  expect(
    report?.analyzer?.version === "0.4.0-rc.1" &&
      report?.analyzer?.source === "installed-artifact" &&
      report?.candidate?.commit === binding.source_commit &&
      report?.candidate?.version === "0.4.0-rc.1" &&
      report?.candidate?.worktree_clean === true &&
      report?.artifact?.sha256 === binding.artifact_sha256 &&
      report?.artifact?.conformance?.applicable === true &&
      report?.artifact?.conformance?.passed === true &&
      report?.artifact?.conformance?.report?.schema ===
        "kanon-artifact-conformance-v1" &&
      report?.artifact?.conformance?.report?.passed === true &&
      report?.artifact?.conformance?.report?.candidate_commit ===
        binding.source_commit &&
      report?.artifact?.conformance?.report?.candidate_version ===
        "0.4.0-rc.1" &&
      report?.artifact?.conformance?.report?.artifact_sha256 ===
        binding.artifact_sha256 &&
      report?.artifact?.conformance?.report?.checks?.length === 43 &&
      report?.corpus?.manifest_sha256 === binding.corpus_sha256 &&
      report?.corpus?.evaluation_role === "development" &&
      report?.corpus?.selected_case_count === 30 &&
      report?.corpus?.total_case_count === 30 &&
      report?.results?.length === 30 &&
      control?.results?.length === 30,
    "attempt-report-bindings"
  );
  const corpus = readContainedJson(
    repositoryRoot,
    "eval/corpus.json"
  );
  let candidates = 0;
  let eligibleCandidates = 0;
  let traceBytes = 0;
  let observers = 0;
  const traceSet = [];
  const traces = [];
  for (const [index, item] of manifest.case_files.entries()) {
    const ordinal = index + 1;
    const relative =
      `traces/${String(ordinal).padStart(3, "0")}.json`;
    const bytes = readDirectFile(root, relative, MAX_TRACE_BYTES);
    const trace = parseJson(bytes, `attempt trace ${ordinal}`);
    const corpusCase = corpus.cases[index];
    const validation = validateRankingTrace(trace, {
      protocolSha256: binding.protocol_sha256,
      traceSourceCommit: binding.source_commit,
      artifactSha256: binding.artifact_sha256,
      corpusSha256: binding.corpus_sha256,
      caseId: corpusCase.id,
      revision: corpusCase.revision,
      ordinal
    });
    const primaryResult = report.results[index];
    const controlResult = control.results[index];
    expect(
      item.file === relative &&
        item.ordinal === ordinal &&
        item.id === corpusCase.id &&
        item.revision === corpusCase.revision &&
        item.bytes === bytes.length &&
        item.candidate_count === trace.candidates.length &&
        item.sha256 === sha256(bytes) &&
        item.complete === true &&
        bytes.equals(canonicalBytes(trace)) &&
        validation.valid &&
        trace.completeness.complete === true &&
        primaryResult?.id === corpusCase.id &&
        primaryResult?.revision === corpusCase.revision &&
        controlResult?.id === corpusCase.id &&
        controlResult?.revision === corpusCase.revision &&
        canonicalJson(trace.predictions) ===
          canonicalJson(primaryResult.predictions),
      `attempt-trace-${ordinal}`
    );
    candidates += trace.candidates.length;
    eligibleCandidates += trace.candidates.filter(
      (candidate) => candidate.ranking.eligible
    ).length;
    traceBytes += bytes.length;
    observers += trace.completeness.observer_failures;
    traceSet.push({ ordinal, sha256: item.sha256 });
    traces.push(trace);
  }
  expect(
    manifest.trace_set_sha256 ===
        sha256(Buffer.from(canonicalJson(traceSet))) &&
      manifest.candidate_count === candidates &&
      manifest.eligible_candidate_count === eligibleCandidates &&
      manifest.trace_bytes === traceBytes &&
      manifest.observer_failure_count === observers &&
      observers === 0 &&
      traceBytes <= MAX_TRACE_TOTAL_BYTES &&
      canonicalJson(semanticReportProjection(report)) ===
        canonicalJson(semanticReportProjection(control)),
    "attempt-trace-totals"
  );
  return {
    binding,
    consumption,
    control,
    inventory,
    manifest,
    report,
    traces
  };
}

export function createPostCorrectionEvidence(repoRoot, attemptRoot) {
  const repositoryRoot = canonicalDirectory(repoRoot);
  const attemptDirectory = canonicalDirectory(attemptRoot);
  const frozenBefore = verifyFrozenPostCorrectionInputs(
    repositoryRoot
  );
  const attempt = validatePostCorrectionAttempt(
    repositoryRoot,
    attemptDirectory
  );
  expect(
    path.basename(attemptDirectory) ===
      `post-correction-attempt-sha256-${attempt.inventory.sha256}`,
    "comparison-content-addressed-attempt"
  );
  const attemptBefore = completeTreeCommitment(attemptDirectory);
  const baseline = loadRecoveredComparisonBaseline(repositoryRoot);
  const frozenAdmission = verifyFrozenPostCorrectionInputs(
    repositoryRoot
  );
  expect(
    frozenInputFingerprint(frozenBefore) ===
      frozenInputFingerprint(frozenAdmission),
    "comparison-protected-input-admission"
  );
  expect(
    completeTreeCommitment(attemptDirectory).sha256 ===
      attemptBefore.sha256,
    "comparison-attempt-admission-unchanged"
  );

  const integrity = {
    attempt_complete_tree_sha256: attemptBefore.sha256,
    attempt_inventory_exact: true,
    attempt_unchanged_before_effect_measurement: true,
    bindings_valid: true,
    canonical_serialization_valid: true,
    containment_valid: true,
    frozen_inputs_sha256: frozenInputFingerprint(frozenBefore),
    hashes_valid: true,
    observer_failure_count:
      attempt.manifest.observer_failure_count,
    passed: true,
    protected_historical_evidence_unchanged: true,
    schema_valid: true,
    trace_on_off_public_result_exact:
      attempt.manifest.trace_on_off_equivalence.exact
  };
  const comparison = buildPostCorrectionComparison({
    authority: frozenBefore.authority,
    attempt,
    before: baseline,
    d2a: readContainedJson(repositoryRoot, D2A_PATH),
    integrity
  });

  const attemptAfterComparison =
    completeTreeCommitment(attemptDirectory);
  const frozenAfterComparison = verifyFrozenPostCorrectionInputs(
    repositoryRoot
  );
  expect(
    attemptAfterComparison.sha256 === attemptBefore.sha256 &&
      canonicalJson(attemptAfterComparison.files) ===
        canonicalJson(attemptBefore.files),
    "comparison-attempt-byte-immutability"
  );
  expect(
    frozenInputFingerprint(frozenBefore) ===
      frozenInputFingerprint(frozenAfterComparison),
    "comparison-protected-evidence-byte-immutability"
  );

  const comparisonBytes = canonicalBytes(comparison);
  expect(
    comparisonBytes.length <= MAX_SMALL_BYTES,
    "comparison-byte-bound"
  );
  const comparisonSha256 = sha256(comparisonBytes);
  const record = postCorrectionEvaluationRecord({
    authority: frozenBefore.authority,
    attempt,
    comparison,
    comparisonSha256,
    frozen: frozenBefore
  });
  const recordBytes = canonicalBytes(record);
  expect(
    recordBytes.length <= MAX_SMALL_BYTES,
    "evaluation-record-byte-bound"
  );

  const temporaryRoot = canonicalDirectory(os.tmpdir());
  const staging = fs.mkdtempSync(
    path.join(temporaryRoot, "kanon-post-correction-evidence-")
  );
  fs.chmodSync(staging, 0o700);
  const stagingResolution = resolveContainedPath(
    temporaryRoot,
    path.basename(staging),
    { type: "directory" }
  );
  expect(
    stagingResolution.ok &&
      stagingResolution.path === path.resolve(staging),
    "evidence-staging-containment"
  );
  writeExclusiveFile(
    path.join(staging, "comparison.json"),
    comparisonBytes,
    0o600
  );
  writeExclusiveFile(
    path.join(staging, "evaluation-record.json"),
    recordBytes,
    0o600
  );
  const evidenceManifest = {
    attempt_complete_tree_sha256: attempt.inventory.sha256,
    authority_sha256: POST_CORRECTION_AUTHORITY_SHA256,
    comparison_sha256: comparisonSha256,
    conclusion: comparison.conclusion,
    evaluation_record_sha256: sha256(recordBytes),
    exact_file_count: 3,
    exact_files: [
      "comparison-manifest.json",
      "comparison.json",
      "evaluation-record.json"
    ],
    protected_input_sha256: frozenInputFingerprint(frozenBefore),
    schema: "kanon-d2e-post-correction-evidence-manifest-v1"
  };
  const manifestBytes = canonicalBytes(evidenceManifest);
  writeExclusiveFile(
    path.join(staging, "comparison-manifest.json"),
    manifestBytes,
    0o600
  );
  syncDirectory(staging);
  const stagingInventory = completeTreeCommitment(staging);
  expect(
    canonicalJson(
      stagingInventory.files.map((item) => item.path)
    ) ===
      canonicalJson([
        "comparison-manifest.json",
        "comparison.json",
        "evaluation-record.json"
      ]),
    "evidence-exact-inventory"
  );
  const preserved = preserveContentAddressedTree(
    repositoryRoot,
    staging,
    "post-correction-evidence-sha256",
    "evidence"
  );

  const frozenFinal = verifyFrozenPostCorrectionInputs(repositoryRoot);
  const attemptFinal = completeTreeCommitment(attemptDirectory);
  expect(
    frozenInputFingerprint(frozenFinal) ===
      frozenInputFingerprint(frozenBefore) &&
      attemptFinal.sha256 === attemptBefore.sha256 &&
      canonicalJson(attemptFinal.files) ===
        canonicalJson(attemptBefore.files),
    "evidence-final-protected-byte-immutability"
  );
  return {
    attempt_complete_tree_sha256: attempt.inventory.sha256,
    comparison,
    comparison_sha256: comparisonSha256,
    conclusion: comparison.conclusion,
    destination: preserved.destination,
    destination_relative: preserved.destination_relative,
    evaluation_record_sha256: sha256(recordBytes),
    evidence_complete_tree_sha256:
      preserved.complete_tree_sha256,
    evidence_manifest_sha256: sha256(manifestBytes),
    record
  };
}

export function preservePostCorrectionAttempt(repoRoot, attemptRoot) {
  return preserveContentAddressedTree(
    repoRoot,
    attemptRoot,
    "post-correction-attempt-sha256",
    "attempt"
  );
}

export function preservePostCorrectionFailure(input) {
  const root = canonicalDirectory(input.attemptRoot);
  const observed = completeTreeCommitment(root);
  const actual = new Set(observed.files.map((item) => item.path));
  const missing = expectedAttemptFiles().filter(
    (relative) => !actual.has(relative)
  );
  const failureManifest = {
    attempt: 1,
    authority_sha256: POST_CORRECTION_AUTHORITY_SHA256,
    consumed: actual.has("attempt-consumption.json"),
    error: safeTerminalText(input.error).slice(0, 2000),
    missing,
    observed_files: observed.files,
    retries: 0,
    schema: "kanon-d2e-post-correction-failure-v1"
  };
  writeExclusiveFile(
    path.join(root, "failure-manifest.json"),
    canonicalBytes(failureManifest),
    0o600
  );
  syncDirectory(root);
  return preservePostCorrectionAttempt(input.repoRoot, root);
}

function loadRecoveredComparisonBaseline(repoRoot) {
  const manifest = readContainedJson(
    repoRoot,
    `${RECOVERY_ROOT}/trace-manifest.json`
  );
  const report = readContainedJson(
    repoRoot,
    `${RECOVERY_ROOT}/raw-report.json`
  );
  const traces = manifest.case_files.map((item, index) => {
    expect(
      item.file ===
        `cases/case-${String(index + 1).padStart(3, "0")}.json`,
      `comparison-baseline-file-${index + 1}`
    );
    return readContainedJson(
      repoRoot,
      `${RECOVERY_ROOT}/${item.file}`
    );
  });
  return {
    report,
    trace_set_sha256: manifest.trace_set_sha256,
    traces
  };
}

function frozenInputFingerprint(value) {
  return sha256(
    Buffer.from(
      canonicalJson({
        authority_sha256: value.authority_sha256,
        cache: {
          case_count: value.cache.case_count,
          identity_sha256: value.cache.identity_sha256
        },
        counts: value.counts,
        immutable: value.immutable,
        strict_historical_equivalence:
          value.strict_historical_equivalence
      })
    )
  );
}

function postCorrectionEvaluationRecord(input) {
  const attemptFile = (relative) => {
    const item = input.attempt.inventory.files.find(
      (entry) => entry.path === relative
    );
    expect(Boolean(item), `evaluation-record-file-${relative}`);
    return item.sha256;
  };
  return {
    aggregate: input.comparison.aggregate,
    attempt: {
      attempt_binding_sha256: attemptFile(
        "attempt-binding.json"
      ),
      attempt_consumption_sha256: attemptFile(
        "attempt-consumption.json"
      ),
      complete_tree_sha256: input.attempt.inventory.sha256,
      identity: 1,
      raw_report_sha256: attemptFile("raw-report.json"),
      source_commit: input.attempt.binding.source_commit,
      trace_manifest_sha256: attemptFile(
        "trace-manifest.json"
      ),
      trace_off_report_sha256: attemptFile(
        "trace-off-report.json"
      ),
      trace_set_sha256:
        input.attempt.manifest.trace_set_sha256
    },
    attempt_consumption_point: {
      attempt_ordinal:
        input.attempt.consumption.attempt_ordinal,
      case_ordinal: input.attempt.consumption.case_ordinal,
      component: input.attempt.consumption.component,
      consumed: input.attempt.consumption.consumed,
      point:
        "canonical real-case entrypoint, ordinal 1, immediately before first real-case processing"
    },
    authority: {
      commit: "2ee3091005b86db6eada2d2b15e0deeae96deb46",
      sha256: POST_CORRECTION_AUTHORITY_SHA256
    },
    comparison_sha256: input.comparisonSha256,
    conclusion: input.comparison.conclusion,
    decision_gates: input.comparison.decision_gates,
    evidence_classification:
      input.authority.evidence_classification,
    exact_next_permissible_action:
      "Hard-stop this session. No further correction, corpus attempt, publication, or release is authorized; any future action requires new explicit authority.",
    immutable_commitments: {
      ...input.authority.bindings,
      authority_sha256: POST_CORRECTION_AUTHORITY_SHA256,
      protected_trees_and_correction: input.frozen.immutable
    },
    integrity: input.comparison.integrity,
    limitations: input.authority.limitations,
    per_case: input.comparison.cases.map((item) => ({
      candidate_counts: item.candidate_counts,
      id: item.id,
      ordinal: item.ordinal,
      public_effects: item.public_effects,
      revision: item.revision,
      scores: item.scores
    })),
    remaining: {
      P0: [
        "strict historical equivalence remains failed-required-comparison-unavailable",
        "release readiness is not established"
      ],
      P1: [
        "independent, blinded, causal, and label-validity evidence is unavailable"
      ],
      P2: [
        "the comparison is diagnostic and does not change an official score"
      ]
    },
    schema: "kanon-d2e-post-correction-evaluation-record-v1",
    strict_historical_equivalence:
      "failed-required-comparison-unavailable"
  };
}

function preserveContentAddressedTree(
  repoRoot,
  sourceRoot,
  prefix,
  label
) {
  expect(
    prefix === "post-correction-attempt-sha256" ||
      prefix === "post-correction-evidence-sha256",
    `${label}-destination-prefix`
  );
  const source = canonicalDirectory(sourceRoot);
  const inventory = completeTreeCommitment(source);
  const destinationRelative =
    `eval/results/${prefix}-${inventory.sha256}`;
  const repositoryRoot = canonicalDirectory(repoRoot);
  const resultsRoot = canonicalDirectory(
    path.join(repositoryRoot, "eval", "results")
  );
  const destination = path.join(
    resultsRoot,
    `${prefix}-${inventory.sha256}`
  );
  expect(
    destination === path.join(repositoryRoot, destinationRelative),
    `${label}-destination-containment`
  );
  expect(
    !fs.existsSync(destination),
    `${label}-destination-absent`
  );
  copyRegularTree(source, destination, inventory.files);
  const copied = completeTreeCommitment(destination);
  expect(
    copied.sha256 === inventory.sha256 &&
      canonicalJson(copied.files) === canonicalJson(inventory.files),
    `${label}-finalization-byte-equality`
  );
  return {
    complete_tree_sha256: inventory.sha256,
    destination,
    destination_relative: destinationRelative,
    files: inventory.files
  };
}

export function completeTreeCommitment(rootPath) {
  const root = canonicalDirectory(rootPath);
  const files = [];
  walkRegularFiles(root, "", files);
  files.sort((left, right) => left.path.localeCompare(right.path));
  return {
    files,
    sha256: sha256(Buffer.from(canonicalJson(files)))
  };
}

function walkRegularFiles(root, relative, output) {
  const directory = relative ? path.join(root, relative) : root;
  const entries = fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const childRelative = relative
      ? `${relative}/${entry.name}`
      : entry.name;
    const child = path.join(root, childRelative);
    const stat = fs.lstatSync(child);
    expect(!stat.isSymbolicLink(), `tree-link-${childRelative}`);
    if (stat.isDirectory()) {
      walkRegularFiles(root, childRelative, output);
      continue;
    }
    expect(
      stat.isFile() && stat.nlink === 1,
      `tree-regular-${childRelative}`
    );
    const bytes = fs.readFileSync(child);
    output.push({
      bytes: bytes.length,
      mode: stat.mode & 0o777,
      path: childRelative.replaceAll("\\", "/"),
      sha256: sha256(bytes)
    });
  }
}

function copyRegularTree(source, destination, records) {
  fs.mkdirSync(destination, { mode: 0o700 });
  const directories = new Set(
    records
      .map((item) => path.posix.dirname(item.path))
      .filter((item) => item !== ".")
  );
  for (const relative of Array.from(directories).sort()) {
    fs.mkdirSync(path.join(destination, relative), { mode: 0o700 });
  }
  for (const item of records) {
    const bytes = readDirectFile(
      source,
      item.path,
      Math.max(item.bytes, 1)
    );
    writeExclusiveFile(
      path.join(destination, item.path),
      bytes,
      item.mode
    );
  }
  for (const relative of Array.from(directories).sort().reverse()) {
    syncDirectory(path.join(destination, relative));
  }
  syncDirectory(destination);
  syncDirectory(path.dirname(destination));
}

function writeExclusiveFile(filePath, bytes, mode) {
  const flags =
    fs.constants.O_CREAT |
    fs.constants.O_EXCL |
    fs.constants.O_WRONLY |
    (fs.constants.O_NOFOLLOW || 0);
  const descriptor = fs.openSync(filePath, flags, mode);
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fchmodSync(descriptor, mode);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function syncDirectory(directory) {
  const descriptor = fs.openSync(directory, fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (!isUnsupportedDirectorySync(error)) {
      throw error;
    }
  } finally {
    fs.closeSync(descriptor);
  }
}

function isUnsupportedDirectorySync(error) {
  return (
    process.platform === "win32" &&
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ["EBADF", "EINVAL", "ENOSYS", "ENOTSUP", "EPERM"].includes(
      String(error.code)
    )
  );
}

function canonicalBytes(value) {
  validateFiniteJsonValue(value);
  return Buffer.from(`${canonicalJson(value)}\n`, "utf8");
}

function validateFiniteJsonValue(value) {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return;
  }
  if (typeof value === "number") {
    expect(Number.isFinite(value), "canonical-finite-number");
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      validateFiniteJsonValue(item);
    }
    return;
  }
  expect(
    value !== null &&
      typeof value === "object" &&
      Object.getPrototypeOf(value) === Object.prototype,
    "canonical-plain-json-value"
  );
  for (const item of Object.values(value)) {
    validateFiniteJsonValue(item);
  }
}

function readContainedJson(root, relative) {
  return parseJson(
    readContainedFile(root, relative, MAX_TRACE_BYTES),
    relative
  );
}

function readContainedFile(root, relative, maximumBytes) {
  const resolved = resolveContainedPath(root, relative, {
    type: "file"
  });
  expect(
    resolved.ok &&
      resolved.stat.size <= maximumBytes &&
      resolved.stat.nlink === 1,
    `bounded-file-${relative}`
  );
  return fs.readFileSync(resolved.path);
}

function readDirectFile(root, relative, maximumBytes) {
  return readContainedFile(root, relative, maximumBytes);
}

function readExternalFile(filePath, maximumBytes) {
  const resolved = path.resolve(filePath);
  return readContainedFile(
    canonicalDirectory(path.dirname(resolved)),
    path.basename(resolved),
    maximumBytes
  );
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`Invalid ${safeTerminalText(label)} JSON.`);
  }
}

function canonicalDirectory(directory) {
  const absolute = path.resolve(directory);
  const lexical = fs.lstatSync(absolute);
  expect(
    lexical.isDirectory() && !lexical.isSymbolicLink(),
    `real-directory-${absolute}`
  );
  const resolved = resolveContainedPath(absolute, ".", {
    allowRoot: true,
    type: "directory"
  });
  expect(resolved.ok, `contained-directory-${absolute}`);
  return resolved.root;
}

function expect(condition, label) {
  if (!condition) {
    throw new Error(
      `D.2E post-correction validation failed: ${safeTerminalText(label)}.`
    );
  }
}

function expectExactKeys(value, keys, label) {
  expect(
    value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      canonicalJson(Object.keys(value).sort()) ===
        canonicalJson([...keys].sort()),
    `${label}-exact-keys`
  );
}
