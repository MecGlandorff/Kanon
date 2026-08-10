import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveContainedPath } from "../../src/path-security.js";
import {
  assignOpaqueIdentities,
  assertDeepEqual,
  boundedText,
  canonicalDirectory,
  canonicalInputIdentity,
  canonicalJson,
  cleanupOwnedStaging,
  collectTreeEntries,
  compareEntries,
  compareText,
  containedFile,
  copySnapshot,
  deriveMaskedRecords,
  directoryFileBytes,
  fileEntry,
  hasExactKeys,
  isPlainRecord,
  jsonBytes,
  keyedHex,
  makePacketReadOnly,
  newCopyState,
  parseJson,
  prepareAbsentOutput,
  sha256,
  treeCommitment,
  validateRelativePath,
  validateSnapshotPath,
  writeNewFile
} from "./d2c-packet.js";
import { readStableRegularFile } from "./d2c-unblind.js";
import { validateCorpus } from "./eval-corpus/schema.js";

export const COMPARATIVE_PACKET_SCHEMA =
  "kanon-d2c-comparative-packet-v1";
export const COMPARATIVE_CASES_SCHEMA =
  "kanon-d2c-comparative-cases-v1";
export const COMPARATIVE_RESULT_SCHEMA =
  "kanon-d2c-comparative-result-v1";
export const COMPARATIVE_RESULT_FILE = "comparative-result.json";
export const COMPARATIVE_RESOURCE_LIMITS = Object.freeze({
  max_cases: 50,
  max_candidates_per_case: 10,
  max_candidates_total: 500,
  max_files_per_case: 100_000,
  max_files_total: 250_000,
  max_file_bytes: 128 * 1024 * 1024,
  max_total_bytes: 1024 * 1024 * 1024,
  max_directory_entries: 400_000,
  max_entries_per_directory: 100_000,
  max_elapsed_ms: 300_000,
  max_result_bytes: 4 * 1024 * 1024,
  max_rationale_bytes: 1000,
  max_unknown_reason_bytes: 1000,
  max_sources_per_selection: 20
});

const PREPARATION_FIELDS = Object.freeze([
  "corpus_manifest",
  "corpus_manifest_sha256",
  "exact_agreement_exclusion_rule",
  "excluded_exact_agreement_case_count",
  "excluded_exact_agreement_commitment_sha256",
  "preparation_seed",
  "raw_report",
  "raw_report_sha256",
  "restored_artifact_sha256",
  "result_schema",
  "result_schema_sha256",
  "reviewer_prompt",
  "reviewer_prompt_sha256",
  "schema_version",
  "source_case_snapshots_sha256",
  "source_preparation",
  "source_preparation_sha256",
  "source_snapshot_links_rejected",
  "starting_head"
]);
const CONTROLLED_FILES = Object.freeze([
  "README-FIRST.txt",
  "comparative-result.schema.json",
  "review-cases.json"
]);
const MANIFEST_FIELDS = Object.freeze([
  "candidate_count",
  "case_count",
  "input_commitments",
  "packet_hash",
  "resource_counts",
  "resource_limits",
  "schema_version",
  "seed_commitment"
]);
const INPUT_COMMITMENT_FIELDS = Object.freeze([
  "canonical_input_sha256",
  "case_snapshots_sha256",
  "result_schema_sha256",
  "review_cases_sha256",
  "reviewer_prompt_sha256",
  "source_case_snapshots_sha256"
]);
const RESOURCE_COUNT_FIELDS = Object.freeze([
  "committed_bytes",
  "committed_directories",
  "committed_files",
  "snapshot_bytes",
  "snapshot_directory_entries",
  "snapshot_directories",
  "snapshot_files",
  "snapshot_links_rejected_during_copy",
  "source_snapshot_links_rejected"
]);
const CASE_FIELDS = Object.freeze([
  "candidates",
  "case_id",
  "snapshot_root"
]);
const CANDIDATE_FIELDS = Object.freeze([
  "candidate_id",
  "file_metadata",
  "path"
]);
const FILE_METADATA_FIELDS = Object.freeze(["byte_count", "sha256"]);
const RESULT_CASE_FIELDS = Object.freeze([
  "case_id",
  "outcome",
  "selections",
  "unknown_reason"
]);
const SELECTION_FIELDS = Object.freeze([
  "candidate_id",
  "rationale",
  "source_paths"
]);
const EXCLUSION_RULE =
  "exclude-if-important-file-prediction-set-equals-label-set";

/**
 * Construct one fresh comparative packet from the frozen source snapshot
 * projection. The source packet's output and controlled review files are
 * outside this function's read surface.
 */
export function buildComparativePacket(options) {
  const startedAt = Date.now();
  const limits = Object.freeze({
    ...COMPARATIVE_RESOURCE_LIMITS,
    ...(options.limits || {})
  });
  const repoRoot = canonicalDirectory(options.repoRoot, "repository root");
  const sourcePacketRoot = canonicalDirectory(
    options.sourcePacketRoot,
    "source packet root"
  );
  const output = prepareAbsentOutput(options.outputRoot);
  const inputs = loadComparativeInputs(
    repoRoot,
    options.preparationPath
  );
  assertConstructionTime(startedAt, limits);
  const facts = deriveComparativeFacts(
    inputs.report,
    inputs.corpus,
    Boolean(options.swapInputSides)
  );
  verifyExcludedCommitment(inputs.preparation, facts);
  const canonicalInput = canonicalComparativeInputIdentity(
    inputs.preparation
  );
  const identities = assignComparativeIdentities(
    facts.masked_cases,
    inputs.preparation.preparation_seed,
    canonicalInput
  );
  validateIdentityBounds(identities, limits);

  const sourceCases = containedDirectory(sourcePacketRoot, "cases");
  const sourceEntries = collectTreeEntries(sourceCases, "cases", {
    requireReadOnly: true
  });
  assertConstructionTime(startedAt, limits);
  if (
    treeCommitment(sourceEntries) !==
    inputs.preparation.source_case_snapshots_sha256
  ) {
    throw new Error(
      "Frozen source case-snapshot commitment does not match."
    );
  }
  const sourceCaseIds = sourceCaseIdMap(inputs);
  const expectedSourceCaseNames = facts.masked_cases
    .map((item) => sourceCaseIds.get(item.case_key));
  if (expectedSourceCaseNames.some((value) => !value)) {
    throw new Error("A comparative case has no frozen source snapshot.");
  }
  expectedSourceCaseNames.sort(compareText);
  assertDeepEqual(
    fs.readdirSync(sourceCases).sort(compareText),
    expectedSourceCaseNames,
    "Frozen source case membership differs from the D.2A disagreements."
  );

  const stagingName =
    `.${output.name}.staging-${process.pid}-${crypto.randomUUID()}`;
  const stagingRoot = path.join(output.parent, stagingName);
  fs.mkdirSync(stagingRoot, { recursive: false, mode: 0o700 });
  let completed = false;
  try {
    const casesRoot = path.join(stagingRoot, "cases");
    const resultRoot = path.join(stagingRoot, "output");
    fs.mkdirSync(casesRoot, { mode: 0o700 });
    fs.mkdirSync(resultRoot, { mode: 0o700 });
    const snapshotState = newCopyState(limits, startedAt);
    for (const item of identities) {
      const sourceCaseId = sourceCaseIds.get(item.case_key);
      if (!sourceCaseId) {
        throw new Error("A source case identity disappeared.");
      }
      const source = resolveContainedPath(sourceCases, sourceCaseId, {
        type: "directory"
      });
      if (!source.ok) {
        throw new Error("A frozen source case is unavailable or indirect.");
      }
      copySnapshot(
        source.path,
        path.join(casesRoot, item.case_id),
        snapshotState,
        item.case_key
      );
    }
    assertDeepEqual(
      collectTreeEntries(sourceCases, "cases", {
        requireReadOnly: true
      }),
      sourceEntries,
      "Frozen source snapshots changed during comparative copying."
    );
    assertConstructionTime(startedAt, limits);

    const snapshotEntries = collectTreeEntries(casesRoot, "cases");
    const metadataByPath = new Map(
      snapshotEntries
        .filter((entry) => entry.type === "file")
        .map((entry) => [entry.path, entry])
    );
    const reviewCases = identities.map((item) => {
      const snapshotRoot = `cases/${item.case_id}`;
      return {
        case_id: item.case_id,
        snapshot_root: snapshotRoot,
        candidates: item.candidates.map((candidate) => {
          const metadata = metadataByPath.get(
            `${snapshotRoot}/${candidate.path}`
          );
          if (!metadata) {
            throw new Error(
              "A required union candidate is unavailable in the safe snapshot."
            );
          }
          return {
            candidate_id: candidate.candidate_id,
            path: candidate.path,
            file_metadata: {
              byte_count: metadata.byte_count,
              sha256: metadata.sha256
            }
          };
        })
      };
    });
    const reviewDocument = {
      schema_version: COMPARATIVE_CASES_SCHEMA,
      cases: reviewCases
    };
    validateReviewCases(reviewDocument, limits);
    const reviewBytes = jsonBytes(reviewDocument);
    writeNewFile(
      path.join(stagingRoot, "README-FIRST.txt"),
      inputs.prompt_bytes
    );
    writeNewFile(
      path.join(stagingRoot, "comparative-result.schema.json"),
      inputs.schema_bytes
    );
    writeNewFile(
      path.join(stagingRoot, "review-cases.json"),
      reviewBytes
    );

    const controlledEntries = CONTROLLED_FILES.map((relativePath) =>
      fileEntry(stagingRoot, relativePath)
    );
    const committedEntries = [
      ...controlledEntries,
      ...snapshotEntries
    ].sort(compareEntries);
    const inputCommitments = {
      canonical_input_sha256: canonicalInput,
      source_case_snapshots_sha256:
        inputs.preparation.source_case_snapshots_sha256,
      reviewer_prompt_sha256: sha256(inputs.prompt_bytes),
      result_schema_sha256: sha256(inputs.schema_bytes),
      review_cases_sha256: sha256(reviewBytes),
      case_snapshots_sha256: treeCommitment(snapshotEntries)
    };
    const seedCommitment = sha256(
      Buffer.from(inputs.preparation.preparation_seed, "hex")
    );
    const resourceCounts = {
      snapshot_files: snapshotState.fileCount,
      snapshot_directories: snapshotState.directoryCount,
      snapshot_directory_entries: snapshotState.directoryEntries,
      snapshot_bytes: snapshotState.totalBytes,
      snapshot_links_rejected_during_copy: snapshotState.rejectedLinks,
      source_snapshot_links_rejected:
        inputs.preparation.source_snapshot_links_rejected,
      committed_files: committedEntries.filter(
        (entry) => entry.type === "file"
      ).length,
      committed_directories: committedEntries.filter(
        (entry) => entry.type === "directory"
      ).length,
      committed_bytes: committedEntries.reduce(
        (total, entry) => total + (entry.byte_count || 0),
        0
      )
    };
    const packetHash = packetCommitment({
      seedCommitment,
      inputCommitments,
      resourceCounts,
      resourceLimits: limits,
      entries: committedEntries
    });
    const manifest = {
      schema_version: COMPARATIVE_PACKET_SCHEMA,
      case_count: reviewCases.length,
      candidate_count: reviewCases.reduce(
        (total, item) => total + item.candidates.length,
        0
      ),
      input_commitments: inputCommitments,
      seed_commitment: seedCommitment,
      packet_hash: packetHash,
      resource_limits: limits,
      resource_counts: resourceCounts
    };
    validateComparativeManifest(manifest);
    writeNewFile(
      path.join(stagingRoot, "packet-manifest.json"),
      jsonBytes(manifest)
    );
    makePacketReadOnly(stagingRoot, [
      ...CONTROLLED_FILES,
      "packet-manifest.json"
    ]);
    fs.chmodSync(stagingRoot, 0o500);
    validateComparativePacket(stagingRoot);
    assertConstructionTime(startedAt, limits);
    if (fs.existsSync(output.path)) {
      throw new Error(
        "Comparative packet destination appeared before atomic publish."
      );
    }
    fs.chmodSync(stagingRoot, 0o700);
    fs.renameSync(stagingRoot, output.path);
    fs.chmodSync(output.path, 0o500);
    completed = true;
    const validation = validateComparativePacket(output.path);
    return {
      ...validation,
      consensus_candidate_count: facts.consensus_candidate_count,
      excluded_exact_agreement_case_count:
        facts.excluded_case_keys.length,
      excluded_exact_agreement_commitment_sha256:
        facts.excluded_commitment_sha256,
      side_swap_invariant: proveSideSwapInvariance(
        inputs.report,
        inputs.corpus,
        inputs.preparation
      ),
      reviewer_command: comparativeReviewerCommand(
        validation.packet_root
      )
    };
  } finally {
    if (!completed) {
      cleanupOwnedStaging(output.parent, stagingName);
    }
  }
}

export function validateComparativePacket(packetRoot, options = {}) {
  const root = canonicalDirectory(packetRoot, "comparative packet root");
  const rootEntries = fs.readdirSync(root, { withFileTypes: true });
  assertDeepEqual(
    rootEntries.map((entry) => entry.name).sort(compareText),
    [
      "README-FIRST.txt",
      "cases",
      "comparative-result.schema.json",
      "output",
      "packet-manifest.json",
      "review-cases.json"
    ],
    "Comparative packet root entries differ from the strict layout."
  );
  rejectIndirectEntries(rootEntries, "Comparative packet root");
  const output = containedDirectory(root, "output");
  const allowedOutputFiles = validateAllowedOutputFiles(
    options.allowedOutputFiles
  );
  const outputEntries = fs.readdirSync(output, { withFileTypes: true });
  assertDeepEqual(
    outputEntries.map((entry) => entry.name).sort(compareText),
    allowedOutputFiles,
    "Comparative packet output differs from the allowed output set."
  );
  rejectIndirectEntries(outputEntries, "Comparative packet output");
  for (const entry of outputEntries) {
    const selected = resolveContainedPath(output, entry.name, {
      type: "file"
    });
    if (
      !selected.ok ||
      selected.stat.nlink !== 1 ||
      selected.stat.size > COMPARATIVE_RESOURCE_LIMITS.max_result_bytes
    ) {
      throw new Error(
        "Comparative output is indirect, hard-linked, or oversized."
      );
    }
  }
  if ((fs.statSync(output).mode & 0o200) === 0) {
    throw new Error("Comparative packet output is not writable.");
  }

  const casesRoot = containedDirectory(root, "cases");
  if (
    (fs.statSync(root).mode & 0o222) !== 0 ||
    (fs.statSync(casesRoot).mode & 0o222) !== 0
  ) {
    throw new Error("Comparative packet inputs are not read-only.");
  }
  for (const relativePath of [
    ...CONTROLLED_FILES,
    "packet-manifest.json"
  ]) {
    const selected = resolveContainedPath(root, relativePath, {
      type: "file"
    });
    if (
      !selected.ok ||
      selected.stat.nlink !== 1 ||
      (selected.stat.mode & 0o333) !== 0
    ) {
      throw new Error(
        "Comparative controlled input is writable, executable, or indirect."
      );
    }
  }

  const manifest = readJsonStable(
    containedFile(root, "packet-manifest.json"),
    256 * 1024,
    "comparative packet manifest"
  );
  validateComparativeManifest(manifest);
  const schema = readJsonStable(
    containedFile(root, "comparative-result.schema.json"),
    256 * 1024,
    "comparative result schema"
  );
  validateComparativeSchema(schema);
  const review = readJsonStable(
    containedFile(root, "review-cases.json"),
    4 * 1024 * 1024,
    "comparative review cases"
  );
  validateReviewCases(review, COMPARATIVE_RESOURCE_LIMITS);
  const expectedCaseNames = review.cases
    .map((item) => item.case_id)
    .sort(compareText);
  assertDeepEqual(
    fs.readdirSync(casesRoot).sort(compareText),
    expectedCaseNames,
    "Comparative snapshot cases differ from review cases."
  );
  const snapshotEntries = collectTreeEntries(casesRoot, "cases", {
    requireReadOnly: true
  });
  const snapshotFiles = new Map(
    snapshotEntries
      .filter((entry) => entry.type === "file")
      .map((entry) => [entry.path, entry])
  );
  for (const entry of snapshotEntries) {
    if (entry.type === "file") {
      const stat = fs.lstatSync(path.join(root, entry.path));
      if ((stat.mode & 0o333) !== 0) {
        throw new Error(
          "Comparative snapshot file is writable or executable."
        );
      }
    }
    validateSnapshotPath(
      entry.path.replace(/^cases\/[^/]+\//, "")
    );
  }
  for (const item of review.cases) {
    for (const candidate of item.candidates) {
      const entry = snapshotFiles.get(
        `${item.snapshot_root}/${candidate.path}`
      );
      if (
        !entry ||
        entry.byte_count !== candidate.file_metadata.byte_count ||
        entry.sha256 !== candidate.file_metadata.sha256
      ) {
        throw new Error(
          "Comparative candidate metadata does not bind its snapshot file."
        );
      }
    }
  }

  const controlledEntries = CONTROLLED_FILES.map((relativePath) =>
    fileEntry(root, relativePath, true)
  );
  const committedEntries = [
    ...controlledEntries,
    ...snapshotEntries
  ].sort(compareEntries);
  const expectedInputCommitments = {
    ...manifest.input_commitments,
    reviewer_prompt_sha256:
      controlledEntries.find(
        (entry) => entry.path === "README-FIRST.txt"
      ).sha256,
    result_schema_sha256:
      controlledEntries.find(
        (entry) => entry.path === "comparative-result.schema.json"
      ).sha256,
    review_cases_sha256:
      controlledEntries.find(
        (entry) => entry.path === "review-cases.json"
      ).sha256,
    case_snapshots_sha256: treeCommitment(snapshotEntries)
  };
  assertDeepEqual(
    manifest.input_commitments,
    expectedInputCommitments,
    "Comparative input commitments differ from packet bytes."
  );
  const counts = {
    snapshot_files: snapshotEntries.filter(
      (entry) => entry.type === "file"
    ).length,
    snapshot_directories: snapshotEntries.filter(
      (entry) => entry.type === "directory"
    ).length,
    snapshot_directory_entries:
      snapshotEntries.length - review.cases.length,
    snapshot_bytes: snapshotEntries.reduce(
      (total, entry) => total + (entry.byte_count || 0),
      0
    ),
    snapshot_links_rejected_during_copy:
      manifest.resource_counts.snapshot_links_rejected_during_copy,
    source_snapshot_links_rejected:
      manifest.resource_counts.source_snapshot_links_rejected,
    committed_files: committedEntries.filter(
      (entry) => entry.type === "file"
    ).length,
    committed_directories: committedEntries.filter(
      (entry) => entry.type === "directory"
    ).length,
    committed_bytes: committedEntries.reduce(
      (total, entry) => total + (entry.byte_count || 0),
      0
    )
  };
  assertDeepEqual(
    manifest.resource_counts,
    counts,
    "Comparative resource counts differ from packet bytes."
  );
  const expectedPacketHash = packetCommitment({
    seedCommitment: manifest.seed_commitment,
    inputCommitments: manifest.input_commitments,
    resourceCounts: manifest.resource_counts,
    resourceLimits: manifest.resource_limits,
    entries: committedEntries
  });
  if (expectedPacketHash !== manifest.packet_hash) {
    throw new Error("Comparative packet commitment mismatch.");
  }
  const candidateCount = review.cases.reduce(
    (total, item) => total + item.candidates.length,
    0
  );
  if (
    manifest.case_count !== review.cases.length ||
    manifest.candidate_count !== candidateCount
  ) {
    throw new Error("Comparative packet counts differ from review cases.");
  }
  return {
    packet_root: root,
    packet_manifest_sha256: sha256(
      readStableRegularFile(
        containedFile(root, "packet-manifest.json"),
        256 * 1024
      )
    ),
    packet_hash: manifest.packet_hash,
    reviewer_prompt_sha256:
      manifest.input_commitments.reviewer_prompt_sha256,
    result_schema_sha256:
      manifest.input_commitments.result_schema_sha256,
    review_cases_sha256:
      manifest.input_commitments.review_cases_sha256,
    source_case_snapshots_sha256:
      manifest.input_commitments.source_case_snapshots_sha256,
    case_snapshots_sha256:
      manifest.input_commitments.case_snapshots_sha256,
    canonical_input_sha256:
      manifest.input_commitments.canonical_input_sha256,
    case_count: manifest.case_count,
    candidate_count: manifest.candidate_count,
    packet_bytes: directoryFileBytes(root),
    resource_counts: manifest.resource_counts,
    resource_limits: manifest.resource_limits,
    output_files: allowedOutputFiles
  };
}

/**
 * Recompute complete union membership, consensus inclusion, identities, and
 * both isolated orders from frozen inputs.
 */
export function auditComparativePacketAgainstInputs(options) {
  const repoRoot = canonicalDirectory(options.repoRoot, "repository root");
  const packet = validateComparativePacket(options.packetRoot, {
    allowedOutputFiles: options.allowedOutputFiles
  });
  const inputs = loadComparativeInputs(
    repoRoot,
    options.preparationPath
  );
  const facts = deriveComparativeFacts(
    inputs.report,
    inputs.corpus,
    false
  );
  verifyExcludedCommitment(inputs.preparation, facts);
  const expected = assignComparativeIdentities(
    facts.masked_cases,
    inputs.preparation.preparation_seed,
    canonicalComparativeInputIdentity(inputs.preparation)
  );
  const swapped = assignComparativeIdentities(
    deriveComparativeFacts(
      inputs.report,
      inputs.corpus,
      true
    ).masked_cases,
    inputs.preparation.preparation_seed,
    canonicalComparativeInputIdentity(inputs.preparation)
  );
  assertDeepEqual(
    expected,
    swapped,
    "Prediction/label side swap changed comparative identities or order."
  );
  const review = readJsonStable(
    containedFile(packet.packet_root, "review-cases.json"),
    4 * 1024 * 1024,
    "comparative review cases"
  );
  const visible = review.cases.map((item) => ({
    case_id: item.case_id,
    candidates: item.candidates.map((candidate) => ({
      candidate_id: candidate.candidate_id,
      path: candidate.path
    }))
  }));
  const expectedVisible = expected.map((item) => ({
    case_id: item.case_id,
    candidates: item.candidates.map((candidate) => ({
      candidate_id: candidate.candidate_id,
      path: candidate.path
    }))
  }));
  assertDeepEqual(
    visible,
    expectedVisible,
    "Comparative packet has missing, duplicate, extra, or reordered candidates."
  );
  const visibleKeys = new Set(
    review.cases.flatMap((item) =>
      item.candidates.map(
        (candidate) => `${item.case_id}\u0000${candidate.path}`
      )
    )
  );
  const caseIds = new Map(
    expected.map((item) => [item.case_key, item.case_id])
  );
  for (const key of facts.consensus_keys) {
    const [caseKey, candidatePath] = key.split("\u0000");
    if (!visibleKeys.has(`${caseIds.get(caseKey)}\u0000${candidatePath}`)) {
      throw new Error("A consensus candidate is missing.");
    }
  }
  return {
    packet_root: packet.packet_root,
    packet_hash: packet.packet_hash,
    case_count: packet.case_count,
    candidate_count: packet.candidate_count,
    consensus_candidate_count: facts.consensus_candidate_count,
    excluded_exact_agreement_case_count:
      facts.excluded_case_keys.length,
    excluded_exact_agreement_commitment_sha256:
      facts.excluded_commitment_sha256,
    union_membership_complete: true,
    consensus_candidates_present: true,
    non_union_candidates_absent: true,
    side_provenance_absent: true,
    isolated_identity_domains_valid: true,
    deterministic_order_valid: true,
    side_swap_invariant: true
  };
}

export function deriveComparativeCases(report, corpus, options = {}) {
  return deriveComparativeFacts(
    report,
    corpus,
    Boolean(options.swapInputSides)
  ).masked_cases;
}

export function assignComparativeIdentities(cases, seed, canonicalInput) {
  validateMaskedCases(cases);
  if (
    !/^[0-9a-f]{64}$/.test(seed) ||
    !/^[0-9a-f]{64}$/.test(canonicalInput)
  ) {
    throw new Error("Comparative identity binding is invalid.");
  }
  const caseOrder = new Map(
    [...cases]
      .sort((left, right) =>
        compareText(
          keyedHex(
            seed,
            comparativeDomain(
              "case-order",
              canonicalInput,
              left.case_key
            ),
            64
          ),
          keyedHex(
            seed,
            comparativeDomain(
              "case-order",
              canonicalInput,
              right.case_key
            ),
            64
          )
        )
      )
      .map((item, index) => [item.case_key, index])
  );
  return cases
    .map((item) => {
      const caseId = `case-${keyedHex(
        seed,
        comparativeDomain("case-id", canonicalInput, item.case_key),
        20
      )}`;
      const candidates = item.paths
        .map((candidatePath) => ({
          path: candidatePath,
          candidate_id: `candidate-${keyedHex(
            seed,
            comparativeDomain(
              "candidate-id",
              canonicalInput,
              item.case_key,
              candidatePath
            ),
            24
          )}`,
          order: keyedHex(
            seed,
            comparativeDomain(
              "candidate-order",
              canonicalInput,
              item.case_key,
              candidatePath
            ),
            64
          )
        }))
        .sort((left, right) => compareText(left.order, right.order))
        .map(({ order: _order, ...candidate }) => candidate);
      return {
        case_key: item.case_key,
        case_id: caseId,
        candidates
      };
    })
    .sort((left, right) =>
      caseOrder.get(left.case_key) - caseOrder.get(right.case_key)
    );
}

export function canonicalComparativeInputIdentity(preparation) {
  validateComparativePreparation(preparation);
  return sha256(Buffer.from(canonicalJson({
    schema_version: preparation.schema_version,
    starting_head: preparation.starting_head,
    restored_artifact_sha256:
      preparation.restored_artifact_sha256,
    raw_report_sha256: preparation.raw_report_sha256,
    corpus_manifest_sha256:
      preparation.corpus_manifest_sha256,
    source_preparation_sha256:
      preparation.source_preparation_sha256,
    source_case_snapshots_sha256:
      preparation.source_case_snapshots_sha256,
    source_snapshot_links_rejected:
      preparation.source_snapshot_links_rejected,
    reviewer_prompt_sha256:
      preparation.reviewer_prompt_sha256,
    result_schema_sha256:
      preparation.result_schema_sha256,
    exact_agreement_exclusion_rule:
      preparation.exact_agreement_exclusion_rule,
    excluded_exact_agreement_case_count:
      preparation.excluded_exact_agreement_case_count,
    excluded_exact_agreement_commitment_sha256:
      preparation.excluded_exact_agreement_commitment_sha256
  })));
}

export function validateComparativeResult(result, review, options = {}) {
  validateReviewCases(review, COMPARATIVE_RESOURCE_LIMITS);
  if (
    !isPlainRecord(result) ||
    !hasExactKeys(result, ["cases", "schema_version"]) ||
    result.schema_version !== COMPARATIVE_RESULT_SCHEMA ||
    !Array.isArray(result.cases) ||
    result.cases.length !== review.cases.length
  ) {
    throw new Error("Comparative result has invalid top-level structure.");
  }
  const packetRoot = options.packetRoot === undefined
    ? null
    : canonicalDirectory(options.packetRoot, "comparative packet root");
  const seenCases = new Set();
  for (let index = 0; index < result.cases.length; index += 1) {
    const item = result.cases[index];
    const source = review.cases[index];
    if (
      !isPlainRecord(item) ||
      !hasExactKeys(item, RESULT_CASE_FIELDS) ||
      item.case_id !== source.case_id ||
      seenCases.has(item.case_id) ||
      !["selection", "unknown"].includes(item.outcome) ||
      !Array.isArray(item.selections) ||
      typeof item.unknown_reason !== "string"
    ) {
      throw new Error(
        "Comparative result case is missing, extra, duplicated, or malformed."
      );
    }
    seenCases.add(item.case_id);
    if (item.outcome === "unknown") {
      if (
        item.selections.length !== 0 ||
        !boundedText(
          item.unknown_reason,
          COMPARATIVE_RESOURCE_LIMITS.max_unknown_reason_bytes
        )
      ) {
        throw new Error("Comparative Unknown outcome is invalid.");
      }
      continue;
    }
    if (
      item.unknown_reason !== "" ||
      item.selections.length >
        COMPARATIVE_RESOURCE_LIMITS.max_candidates_per_case ||
      item.selections.length > 5
    ) {
      throw new Error("Comparative selection count or reason is invalid.");
    }
    const candidates = new Set(
      source.candidates.map((candidate) => candidate.candidate_id)
    );
    const selected = new Set();
    for (const selection of item.selections) {
      if (
        !isPlainRecord(selection) ||
        !hasExactKeys(selection, SELECTION_FIELDS) ||
        !candidates.has(selection.candidate_id) ||
        selected.has(selection.candidate_id) ||
        !boundedText(
          selection.rationale,
          COMPARATIVE_RESOURCE_LIMITS.max_rationale_bytes
        ) ||
        !Array.isArray(selection.source_paths) ||
        selection.source_paths.length < 1 ||
        selection.source_paths.length >
          COMPARATIVE_RESOURCE_LIMITS.max_sources_per_selection ||
        new Set(selection.source_paths).size !==
          selection.source_paths.length
      ) {
        throw new Error(
          "Comparative selection is duplicate, non-candidate, or malformed."
        );
      }
      selected.add(selection.candidate_id);
      for (const sourcePath of selection.source_paths) {
        validateRelativePath(sourcePath);
        if (packetRoot) {
          const directSource = resolveContainedPath(
            packetRoot,
            `${source.snapshot_root}/${sourcePath}`,
            { type: "file" }
          );
          if (!directSource.ok || directSource.stat.nlink !== 1) {
            throw new Error(
              "Comparative source is outside its case or is not a direct regular file."
            );
          }
        }
      }
    }
  }
  return true;
}

export function validateCompletedComparativePacket(packetRoot) {
  const before = validateComparativePacket(packetRoot, {
    allowedOutputFiles: [COMPARATIVE_RESULT_FILE]
  });
  const resultBytes = readStableRegularFile(
    containedFile(
      before.packet_root,
      `output/${COMPARATIVE_RESULT_FILE}`
    ),
    COMPARATIVE_RESOURCE_LIMITS.max_result_bytes
  );
  const result = parseJson(resultBytes, "comparative result");
  const review = readJsonStable(
    containedFile(before.packet_root, "review-cases.json"),
    4 * 1024 * 1024,
    "comparative review cases"
  );
  validateComparativeResult(result, review, {
    packetRoot: before.packet_root
  });
  const after = validateComparativePacket(packetRoot, {
    allowedOutputFiles: [COMPARATIVE_RESULT_FILE]
  });
  assertDeepEqual(
    before,
    after,
    "Comparative packet inputs changed during result validation."
  );
  return {
    static_packet: after,
    formal_result_valid: true,
    schema_version: result.schema_version,
    case_count: result.cases.length,
    result_sha256: sha256(resultBytes)
  };
}

export function comparativeReviewerOptionVector() {
  return [
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "--model",
    "gpt-5.6-sol",
    "--sandbox",
    "workspace-write",
    "-c",
    'approval_policy="never"',
    "-c",
    'model_reasoning_effort="high"',
    "-"
  ];
}

export function validateComparativeReviewerOptionVector(value) {
  assertDeepEqual(
    value,
    comparativeReviewerOptionVector(),
    "Comparative reviewer option vector differs from the frozen command."
  );
  return true;
}

export function comparativeReviewerCommand(packetRoot) {
  const quotedRoot = shellQuote(path.resolve(packetRoot));
  return (
    `cd ${quotedRoot} && ` +
    "codex exec --skip-git-repo-check --ephemeral " +
    "--model gpt-5.6-sol --sandbox workspace-write " +
    `-c ${shellQuote('approval_policy="never"')} ` +
    `-c ${shellQuote('model_reasoning_effort="high"')} ` +
    "- < README-FIRST.txt"
  );
}

function loadComparativeInputs(repoRoot, preparationPath) {
  const preparationFile = containedFile(
    repoRoot,
    preparationPath || "eval/d2c/comparative-preparation.json"
  );
  const preparation = readJsonStable(
    preparationFile,
    128 * 1024,
    "comparative preparation"
  );
  validateComparativePreparation(preparation);
  const reportBytes = readStableRegularFile(
    containedFile(repoRoot, preparation.raw_report),
    4 * 1024 * 1024
  );
  const corpusBytes = readStableRegularFile(
    containedFile(repoRoot, preparation.corpus_manifest),
    4 * 1024 * 1024
  );
  const sourcePreparationBytes = readStableRegularFile(
    containedFile(repoRoot, preparation.source_preparation),
    128 * 1024
  );
  const promptBytes = readStableRegularFile(
    containedFile(repoRoot, preparation.reviewer_prompt),
    128 * 1024
  );
  const schemaBytes = readStableRegularFile(
    containedFile(repoRoot, preparation.result_schema),
    256 * 1024
  );
  for (const [bytes, expected, label] of [
    [reportBytes, preparation.raw_report_sha256, "D.2A report"],
    [corpusBytes, preparation.corpus_manifest_sha256, "corpus"],
    [
      sourcePreparationBytes,
      preparation.source_preparation_sha256,
      "source preparation"
    ],
    [promptBytes, preparation.reviewer_prompt_sha256, "reviewer prompt"],
    [schemaBytes, preparation.result_schema_sha256, "result schema"]
  ]) {
    if (sha256(bytes) !== expected) {
      throw new Error(`${label} SHA-256 mismatch.`);
    }
  }
  const report = parseJson(reportBytes, "D.2A report");
  const corpus = parseJson(corpusBytes, "corpus");
  const sourcePreparation = parseJson(
    sourcePreparationBytes,
    "source preparation"
  );
  validateCorpus(corpus);
  Object.defineProperty(corpus, "_source_bytes", {
    enumerable: false,
    value: corpusBytes
  });
  if (
    report?.corpus?.manifest_sha256 !==
    preparation.corpus_manifest_sha256
  ) {
    throw new Error("D.2A report corpus commitment mismatch.");
  }
  validateComparativeSchema(parseJson(schemaBytes, "result schema"));
  return {
    preparation,
    report,
    corpus,
    source_preparation: sourcePreparation,
    prompt_bytes: promptBytes,
    schema_bytes: schemaBytes
  };
}

function deriveComparativeFacts(report, corpus, swapInputSides) {
  if (
    !isPlainRecord(report) ||
    !Array.isArray(report.results) ||
    !isPlainRecord(corpus) ||
    !Array.isArray(corpus.cases) ||
    report.results.length !== corpus.cases.length ||
    report.corpus?.manifest_sha256 !== sha256(corpus._source_bytes)
  ) {
    throw new Error("Comparative inputs are unavailable or unbound.");
  }
  const maskedCases = [];
  const excludedCaseKeys = [];
  const consensusKeys = [];
  const seenCases = new Set();
  for (let index = 0; index < corpus.cases.length; index += 1) {
    const corpusCase = corpus.cases[index];
    const result = report.results[index];
    if (
      !isPlainRecord(corpusCase) ||
      !isPlainRecord(result) ||
      result.id !== corpusCase.id ||
      result.revision !== corpusCase.revision ||
      seenCases.has(result.id)
    ) {
      throw new Error(
        "Comparative D.2A records are missing, duplicated, or reordered."
      );
    }
    seenCases.add(result.id);
    const predictionPaths = validateSidePathSet(
      result.predictions?.important_files,
      "first"
    );
    const labelPaths = validateSidePathSet(
      corpusCase.labels?.important_files?.map((item) => item.path),
      "second"
    );
    const first = swapInputSides ? labelPaths : predictionPaths;
    const second = swapInputSides ? predictionPaths : labelPaths;
    const firstSet = new Set(first);
    const secondSet = new Set(second);
    const symmetricDifference = [
      ...first.filter((value) => !secondSet.has(value)),
      ...second.filter((value) => !firstSet.has(value))
    ];
    if (symmetricDifference.length === 0) {
      excludedCaseKeys.push(corpusCase.id);
      continue;
    }
    const union = Array.from(new Set([...first, ...second]))
      .sort(compareText);
    maskedCases.push({
      case_key: corpusCase.id,
      paths: union
    });
    for (const candidatePath of union) {
      if (firstSet.has(candidatePath) && secondSet.has(candidatePath)) {
        consensusKeys.push(`${corpusCase.id}\u0000${candidatePath}`);
      }
    }
  }
  validateMaskedCases(maskedCases);
  excludedCaseKeys.sort(compareText);
  consensusKeys.sort(compareText);
  return {
    masked_cases: maskedCases,
    consensus_keys: consensusKeys,
    consensus_candidate_count: consensusKeys.length,
    excluded_case_keys: excludedCaseKeys,
    excluded_commitment_sha256: sha256(
      Buffer.from(canonicalJson(excludedCaseKeys))
    )
  };
}

function validateSidePathSet(values, label) {
  if (!Array.isArray(values) || values.length > 5) {
    throw new Error(`Comparative ${label} path set is invalid.`);
  }
  const paths = values.map((value) => {
    validateRelativePath(value);
    return value;
  });
  if (new Set(paths).size !== paths.length) {
    throw new Error(`Comparative ${label} path set contains duplicates.`);
  }
  return paths;
}

function validateMaskedCases(cases) {
  if (!Array.isArray(cases) || cases.length < 1) {
    throw new Error("Comparative masked cases are invalid.");
  }
  const caseKeys = new Set();
  for (const item of cases) {
    if (
      !isPlainRecord(item) ||
      !hasExactKeys(item, ["case_key", "paths"]) ||
      typeof item.case_key !== "string" ||
      caseKeys.has(item.case_key) ||
      !Array.isArray(item.paths) ||
      item.paths.length < 1 ||
      item.paths.length > 10 ||
      new Set(item.paths).size !== item.paths.length
    ) {
      throw new Error(
        "Comparative masking retained provenance or invalid membership."
      );
    }
    caseKeys.add(item.case_key);
    assertDeepEqual(
      item.paths,
      [...item.paths].sort(compareText),
      "Comparative masked paths are not canonical."
    );
    for (const candidatePath of item.paths) {
      validateRelativePath(candidatePath);
    }
  }
}

function validateIdentityBounds(cases, limits) {
  const candidateCount = cases.reduce(
    (total, item) => total + item.candidates.length,
    0
  );
  if (
    cases.length < 1 ||
    cases.length > limits.max_cases ||
    candidateCount < 1 ||
    candidateCount > limits.max_candidates_total ||
    cases.some((item) =>
      item.candidates.length > limits.max_candidates_per_case
    )
  ) {
    throw new Error("Comparative case or candidate limit exceeded.");
  }
}

function sourceCaseIdMap(inputs) {
  const records = deriveMaskedRecords(inputs.report, inputs.corpus);
  const identities = assignOpaqueIdentities(
    records,
    inputs.source_preparation.preparation_seed,
    canonicalInputIdentity(inputs.source_preparation)
  );
  const output = new Map();
  for (const item of identities) {
    const previous = output.get(item.case_key);
    if (previous && previous !== item.case_id) {
      throw new Error("Source case identity mapping is inconsistent.");
    }
    output.set(item.case_key, item.case_id);
  }
  return output;
}

function verifyExcludedCommitment(preparation, facts) {
  if (
    preparation.excluded_exact_agreement_case_count !==
      facts.excluded_case_keys.length ||
    preparation.excluded_exact_agreement_commitment_sha256 !==
      facts.excluded_commitment_sha256
  ) {
    throw new Error(
      "Exact-agreement exclusion count or commitment differs."
    );
  }
}

function proveSideSwapInvariance(report, corpus, preparation) {
  const canonicalInput = canonicalComparativeInputIdentity(preparation);
  const first = assignComparativeIdentities(
    deriveComparativeFacts(report, corpus, false).masked_cases,
    preparation.preparation_seed,
    canonicalInput
  );
  const swapped = assignComparativeIdentities(
    deriveComparativeFacts(report, corpus, true).masked_cases,
    preparation.preparation_seed,
    canonicalInput
  );
  assertDeepEqual(
    first,
    swapped,
    "Comparative prediction/label swap invariance failed."
  );
  return true;
}

function validateComparativePreparation(value) {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, PREPARATION_FIELDS) ||
    value.schema_version !==
      "kanon-d2c-comparative-preparation-v1" ||
    !/^[0-9a-f]{40}$/.test(value.starting_head) ||
    !/^[0-9a-f]{64}$/.test(value.restored_artifact_sha256) ||
    !/^[0-9a-f]{64}$/.test(value.raw_report_sha256) ||
    !/^[0-9a-f]{64}$/.test(value.corpus_manifest_sha256) ||
    !/^[0-9a-f]{64}$/.test(value.source_preparation_sha256) ||
    !/^[0-9a-f]{64}$/.test(
      value.source_case_snapshots_sha256
    ) ||
    !Number.isSafeInteger(value.source_snapshot_links_rejected) ||
    value.source_snapshot_links_rejected < 0 ||
    !/^[0-9a-f]{64}$/.test(value.reviewer_prompt_sha256) ||
    !/^[0-9a-f]{64}$/.test(value.result_schema_sha256) ||
    value.exact_agreement_exclusion_rule !== EXCLUSION_RULE ||
    !Number.isSafeInteger(
      value.excluded_exact_agreement_case_count
    ) ||
    value.excluded_exact_agreement_case_count < 0 ||
    !/^[0-9a-f]{64}$/.test(
      value.excluded_exact_agreement_commitment_sha256
    ) ||
    !/^[0-9a-f]{64}$/.test(value.preparation_seed)
  ) {
    throw new Error("Comparative preparation manifest is invalid.");
  }
  for (const relativePath of [
    value.raw_report,
    value.corpus_manifest,
    value.source_preparation,
    value.reviewer_prompt,
    value.result_schema
  ]) {
    validateRelativePath(relativePath);
  }
}

function validateComparativeSchema(value) {
  const caseResult = value?.$defs?.case_result;
  const selection = value?.$defs?.selection;
  const condition = caseResult?.allOf?.[0];
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      "$defs",
      "$id",
      "$schema",
      "additionalProperties",
      "properties",
      "required",
      "title",
      "type"
    ]) ||
    value.type !== "object" ||
    value.additionalProperties !== false ||
    !sameStringSet(value.required, ["schema_version", "cases"]) ||
    !hasExactKeys(value.properties, ["schema_version", "cases"]) ||
    value.properties.schema_version?.const !==
      COMPARATIVE_RESULT_SCHEMA ||
    value.properties.cases?.minItems !== 1 ||
    value.properties.cases?.maxItems !==
      COMPARATIVE_RESOURCE_LIMITS.max_cases ||
    !isPlainRecord(caseResult) ||
    !isPlainRecord(selection) ||
    !hasExactKeys(caseResult, [
      "additionalProperties",
      "allOf",
      "properties",
      "required",
      "type"
    ]) ||
    !hasExactKeys(selection, [
      "additionalProperties",
      "properties",
      "required",
      "type"
    ]) ||
    caseResult.additionalProperties !== false ||
    selection.additionalProperties !== false ||
    !sameStringSet(caseResult.required, RESULT_CASE_FIELDS) ||
    !sameStringSet(selection.required, SELECTION_FIELDS) ||
    !hasExactKeys(caseResult.properties, RESULT_CASE_FIELDS) ||
    !hasExactKeys(selection.properties, SELECTION_FIELDS) ||
    !sameStringSet(
      caseResult.properties?.outcome?.enum,
      ["selection", "unknown"]
    ) ||
    caseResult.properties?.selections?.minItems !== 0 ||
    caseResult.properties?.selections?.maxItems !== 5 ||
    caseResult.properties?.unknown_reason?.maxLength !==
      COMPARATIVE_RESOURCE_LIMITS.max_unknown_reason_bytes ||
    condition?.if?.properties?.outcome?.const !== "selection" ||
    condition?.then?.properties?.unknown_reason?.maxLength !== 0 ||
    condition?.else?.properties?.selections?.maxItems !== 0 ||
    condition?.else?.properties?.unknown_reason?.minLength !== 1 ||
    selection.properties?.rationale?.minLength !== 1 ||
    selection.properties?.rationale?.maxLength !==
      COMPARATIVE_RESOURCE_LIMITS.max_rationale_bytes ||
    selection.properties?.source_paths?.minItems !== 1 ||
    selection.properties?.source_paths?.maxItems !==
      COMPARATIVE_RESOURCE_LIMITS.max_sources_per_selection ||
    selection.properties?.source_paths?.uniqueItems !== true
  ) {
    throw new Error("Comparative result schema is not strictly bounded.");
  }
}

function validateReviewCases(value, limits) {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["cases", "schema_version"]) ||
    value.schema_version !== COMPARATIVE_CASES_SCHEMA ||
    !Array.isArray(value.cases) ||
    value.cases.length < 1 ||
    value.cases.length > limits.max_cases
  ) {
    throw new Error("Comparative review-case document is invalid.");
  }
  const caseIds = new Set();
  const candidateIds = new Set();
  let candidateCount = 0;
  for (const item of value.cases) {
    if (
      !isPlainRecord(item) ||
      !hasExactKeys(item, CASE_FIELDS) ||
      !/^case-[0-9a-f]{20}$/.test(item.case_id) ||
      item.snapshot_root !== `cases/${item.case_id}` ||
      caseIds.has(item.case_id) ||
      !Array.isArray(item.candidates) ||
      item.candidates.length < 1 ||
      item.candidates.length > limits.max_candidates_per_case
    ) {
      throw new Error("Comparative review case shape is invalid.");
    }
    caseIds.add(item.case_id);
    const paths = new Set();
    for (const candidate of item.candidates) {
      if (
        !isPlainRecord(candidate) ||
        !hasExactKeys(candidate, CANDIDATE_FIELDS) ||
        !/^candidate-[0-9a-f]{24}$/.test(candidate.candidate_id) ||
        candidateIds.has(candidate.candidate_id) ||
        paths.has(candidate.path) ||
        !isPlainRecord(candidate.file_metadata) ||
        !hasExactKeys(
          candidate.file_metadata,
          FILE_METADATA_FIELDS
        ) ||
        !Number.isSafeInteger(candidate.file_metadata.byte_count) ||
        candidate.file_metadata.byte_count < 0 ||
        candidate.file_metadata.byte_count > limits.max_file_bytes ||
        !/^[0-9a-f]{64}$/.test(candidate.file_metadata.sha256)
      ) {
        throw new Error("Comparative candidate shape is invalid.");
      }
      validateRelativePath(candidate.path);
      candidateIds.add(candidate.candidate_id);
      paths.add(candidate.path);
      candidateCount += 1;
    }
  }
  if (
    candidateCount < 1 ||
    candidateCount > limits.max_candidates_total
  ) {
    throw new Error("Comparative total candidate count is invalid.");
  }
}

function validateComparativeManifest(value) {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, MANIFEST_FIELDS) ||
    value.schema_version !== COMPARATIVE_PACKET_SCHEMA ||
    !Number.isSafeInteger(value.case_count) ||
    value.case_count < 1 ||
    value.case_count > COMPARATIVE_RESOURCE_LIMITS.max_cases ||
    !Number.isSafeInteger(value.candidate_count) ||
    value.candidate_count < 1 ||
    value.candidate_count >
      COMPARATIVE_RESOURCE_LIMITS.max_candidates_total ||
    !/^[0-9a-f]{64}$/.test(value.seed_commitment) ||
    !/^[0-9a-f]{64}$/.test(value.packet_hash) ||
    !isPlainRecord(value.input_commitments) ||
    !hasExactKeys(
      value.input_commitments,
      INPUT_COMMITMENT_FIELDS
    ) ||
    !isPlainRecord(value.resource_counts) ||
    !hasExactKeys(value.resource_counts, RESOURCE_COUNT_FIELDS) ||
    canonicalJson(value.resource_limits) !==
      canonicalJson(COMPARATIVE_RESOURCE_LIMITS)
  ) {
    throw new Error("Comparative packet manifest is invalid.");
  }
  for (const commitment of Object.values(value.input_commitments)) {
    if (!/^[0-9a-f]{64}$/.test(commitment)) {
      throw new Error("Comparative input commitment is invalid.");
    }
  }
  for (const count of Object.values(value.resource_counts)) {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error("Comparative resource count is invalid.");
    }
  }
}

function packetCommitment(options) {
  return sha256(Buffer.from(canonicalJson({
    schema_version: COMPARATIVE_PACKET_SCHEMA,
    seed_commitment: options.seedCommitment,
    input_commitments: options.inputCommitments,
    resource_limits: options.resourceLimits,
    construction_resource_counts: {
      snapshot_links_rejected_during_copy:
        options.resourceCounts.snapshot_links_rejected_during_copy,
      source_snapshot_links_rejected:
        options.resourceCounts.source_snapshot_links_rejected
    },
    entries: options.entries
  })));
}

function readJsonStable(file, maximumBytes, label) {
  return parseJson(readStableRegularFile(file, maximumBytes), label);
}

function containedDirectory(root, relativePath) {
  const result = resolveContainedPath(root, relativePath, {
    type: "directory"
  });
  if (!result.ok) {
    throw new Error(`Unsafe contained directory: ${result.reason}`);
  }
  return result.path;
}

function rejectIndirectEntries(entries, label) {
  for (const entry of entries) {
    if (
      entry.isSymbolicLink() ||
      (!entry.isFile() && !entry.isDirectory())
    ) {
      throw new Error(`${label} contains a link or special file.`);
    }
  }
}

function validateAllowedOutputFiles(value) {
  const files = value === undefined ? [] : value;
  if (
    !Array.isArray(files) ||
    files.length > 1 ||
    files.some((item) => item !== COMPARATIVE_RESULT_FILE)
  ) {
    throw new Error("Comparative allowed output set is invalid.");
  }
  return [...files];
}

function comparativeDomain(domain, canonicalInput, ...parts) {
  return [
    "kanon-d2c-comparative-v1",
    domain,
    canonicalInput,
    ...parts
  ].join("\u0000");
}

function sameStringSet(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    [...left].sort(compareText).every(
      (value, index) => value === [...right].sort(compareText)[index]
    )
  );
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function assertConstructionTime(startedAt, limits) {
  if (Date.now() - startedAt > limits.max_elapsed_ms) {
    throw new Error("Comparative construction elapsed-time limit exceeded.");
  }
}
