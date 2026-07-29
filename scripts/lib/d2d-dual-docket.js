import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveContainedPath } from "../../src/path-security.js";
import {
  assertDeepEqual,
  boundedText,
  canonicalDirectory,
  canonicalJson,
  cleanupOwnedStaging,
  collectTreeEntries,
  compareEntries,
  compareText,
  containedFile,
  copySnapshot,
  directoryFileBytes,
  fileEntry,
  hasExactKeys,
  isPlainRecord,
  jsonBytes,
  makeTreeReadOnly,
  newCopyState,
  prepareAbsentOutput,
  readJsonBounded,
  sha256,
  treeCommitment,
  validateRelativePath,
  validateSnapshotPath,
  writeNewFile
} from "./d2c-packet.js";
import { validateComparativePacket } from "./d2c-comparative.js";
import {
  readStableRegularFile,
  sameStableStat
} from "./d2c-unblind.js";
import {
  validateComparativeUnblindedAnalysis
} from "./d2c-comparative-unblind.js";

export const RANKING_DOCKET_SCHEMA = "kanon-d2d-ranking-docket-v1";
export const RANKING_CASES_SCHEMA = "kanon-d2d-ranking-cases-v1";
export const LABEL_DOCKET_SCHEMA = "kanon-d2d-label-input-v1";
export const LABEL_CASES_SCHEMA = "kanon-d2d-label-cases-v1";
export const RANKING_RESULT_FILE = "ranking-result.json";
export const PHASE1_RESULT_FILE = "phase1-result.json";
export const PHASE2_RESULT_FILE = "phase2-result.json";

export const D2D_LIMITS = Object.freeze({
  max_cases: 50,
  max_candidates: 1000,
  max_files_per_case: 100_000,
  max_files_total: 250_000,
  max_file_bytes: 128 * 1024 * 1024,
  max_total_bytes: 1024 * 1024 * 1024,
  max_directory_entries: 400_000,
  max_entries_per_directory: 100_000,
  max_elapsed_ms: 300_000,
  max_json_bytes: 8 * 1024 * 1024,
  max_result_bytes: 256 * 1024
});

const RANKING_ROOT_ENTRIES = [
  "README-FIRST.txt",
  "cases",
  "investigation-cases.json",
  "output",
  "packet-manifest.json",
  "production-source",
  "ranking-result.schema.json",
  "rejected-hypotheses.json"
];
const RANKING_CONTROLLED_FILES = [
  "README-FIRST.txt",
  "investigation-cases.json",
  "ranking-result.schema.json",
  "rejected-hypotheses.json"
];
const LABEL_ROOT_ENTRIES = [
  "README-FIRST.txt",
  "cases",
  "governance-template.json",
  "governance.schema.json",
  "label-phase1-result.schema.json",
  "label-phase2-result.schema.json",
  "output",
  "packet-manifest.json",
  "phase2-materializer-contract.json",
  "review-cases.json"
];
const LABEL_CONTROLLED_FILES = [
  "README-FIRST.txt",
  "governance-template.json",
  "governance.schema.json",
  "label-phase1-result.schema.json",
  "label-phase2-result.schema.json",
  "phase2-materializer-contract.json",
  "review-cases.json"
];
const PRODUCTION_SOURCE_FILES = [
  "src/code-intel/constants.js",
  "src/code-intel/curate-common.js",
  "src/code-intel/curate.js",
  "src/code-intel/entrypoints.js",
  "src/code-intel/heuristics.js",
  "src/code-intel/imports.js",
  "src/code-intel/index.js",
  "src/code-intel/rank.js",
  "src/code-intel/shared.js"
];
const PREPARATION_FIELDS = [
  "comparative_analysis",
  "comparative_analysis_sha256",
  "comparative_packet_manifest_sha256",
  "comparative_packet_sha256",
  "comparative_result",
  "comparative_result_sha256",
  "comparative_snapshot_tree_sha256",
  "d2a_report",
  "d2a_report_sha256",
  "development_corpus",
  "development_corpus_sha256",
  "preparation_seed",
  "prior_review_result",
  "prior_review_result_sha256",
  "prior_unblinded_analysis",
  "prior_unblinded_analysis_sha256",
  "production_artifact_sha256",
  "schema_version",
  "starting_head"
];
const RANKING_CASE_FIELDS = [
  "candidates",
  "case_id",
  "comparison_class",
  "correlated_comparative_review_selection",
  "snapshot_root",
  "system_selection"
];
const RANKING_CANDIDATE_FIELDS = [
  "candidate_id",
  "correlated_comparative_review",
  "file_metadata",
  "path",
  "production_time_trace",
  "system_selected"
];
const LABEL_CASE_FIELDS = ["case_id", "snapshot_root"];
const MANIFEST_FIELDS = [
  "case_count",
  "input_commitments",
  "packet_hash",
  "resource_counts",
  "resource_limits",
  "schema_version"
];
const HASH = /^[0-9a-f]{64}$/;
const CASE_ID = /^case-[0-9a-f]{20}$/;
const CANDIDATE_ID = /^candidate-[0-9a-f]{24}$/;
const SAFE_TEXT =
  /^[^\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]+$/u;
const UNSAFE_DISPLAY =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const REPOSITORY_RULE_TEXT =
  /(?:```|diff --git|^\s*(?:\+{3}|-{3}|@@)|\b(?:patch|code edit|ready-to-paste|threshold|weight|candidate-[0-9a-f]{24}|case-[0-9a-f]{20}|django|react|cargo|rust|python|javascript|typescript|node(?:\.js)?|npm|pnpm|yarn|bun|monorepo|repository[- ]specific|framework[- ]specific)\b|[/\\]|\b\d+(?:\.\d+)?\s*(?:%|percent|percentage points)\b)/imu;

/**
 * Construct the change-isolated ranking investigation docket.
 *
 * @param {{repoRoot:string, packetRoot:string, outputRoot:string,
 * preparationPath?:string, limits?:typeof D2D_LIMITS}} options
 */
export function buildRankingDocket(options) {
  const startedAt = Date.now();
  const limits = limitsFor(options.limits);
  const repoRoot = canonicalDirectory(options.repoRoot, "repository root");
  const sourcePacketRoot = canonicalDirectory(
    options.packetRoot,
    "comparative packet root"
  );
  const output = prepareAbsentOutput(options.outputRoot);
  const inputs = loadFrozenInputs(
    repoRoot,
    sourcePacketRoot,
    options.preparationPath
  );
  const investigation = deriveRankingCases(
    inputs.analysis,
    inputs.comparativeReview
  );
  const controls = deriveControlCounts(inputs.analysis);
  assertDeepEqual(
    {
      case_count: investigation.cases.length,
      candidate_count: investigation.cases.reduce(
        (total, item) => total + item.candidates.length,
        0
      ),
      controls
    },
    {
      case_count: 28,
      candidate_count: 185,
      controls: {
        consensus_selected: 77,
        consensus_unselected: 14,
        label_closer_cases: 19,
        label_only_selected: 44,
        label_only_unselected: 5,
        prediction_closer_cases: 1,
        prediction_only_selected: 15,
        prediction_only_unselected: 30,
        tied_cases: 8
      }
    },
    "Frozen ranking counts differ from the D.2C reconstruction."
  );
  const stagingName =
    `.${output.name}.staging-${process.pid}-${crypto.randomUUID()}`;
  const stagingRoot = path.join(output.parent, stagingName);
  fs.mkdirSync(stagingRoot, { recursive: false, mode: 0o700 });
  let completed = false;
  try {
    const casesRoot = path.join(stagingRoot, "cases");
    const sourceRoot = path.join(stagingRoot, "production-source");
    fs.mkdirSync(casesRoot, { mode: 0o700 });
    fs.mkdirSync(sourceRoot, { mode: 0o700 });
    fs.mkdirSync(path.join(stagingRoot, "output"), { mode: 0o700 });
    const copyState = newCopyState(limits, startedAt);
    for (const item of investigation.cases) {
      copySnapshot(
        containedDirectory(
          sourcePacketRoot,
          `cases/${item.case_id}`
        ),
        path.join(casesRoot, item.case_id),
        copyState,
        item.case_id
      );
    }
    for (const relativePath of PRODUCTION_SOURCE_FILES) {
      const bytes = readStableRegularFile(
        containedFile(repoRoot, relativePath),
        limits.max_file_bytes
      );
      const destination = path.join(sourceRoot, relativePath);
      fs.mkdirSync(path.dirname(destination), {
        recursive: true,
        mode: 0o700
      });
      writeNewFile(destination, bytes);
    }
    const rejectedLedger = rejectedHypotheses(repoRoot);
    writeNewFile(
      path.join(stagingRoot, "README-FIRST.txt"),
      readStableRegularFile(
        containedFile(repoRoot, "eval/d2d/ranking-reviewer-prompt.txt"),
        128 * 1024
      )
    );
    writeNewFile(
      path.join(stagingRoot, "ranking-result.schema.json"),
      readStableRegularFile(
        containedFile(repoRoot, "eval/d2d/ranking-result.schema.json"),
        256 * 1024
      )
    );
    writeNewFile(
      path.join(stagingRoot, "investigation-cases.json"),
      jsonBytes(investigation)
    );
    writeNewFile(
      path.join(stagingRoot, "rejected-hypotheses.json"),
      jsonBytes(rejectedLedger)
    );
    makeTreeReadOnly(casesRoot);
    makeTreeReadOnly(sourceRoot);
    const controlledEntries = RANKING_CONTROLLED_FILES.map(
      (relativePath) => fileEntry(stagingRoot, relativePath)
    );
    const snapshotEntries = collectTreeEntries(casesRoot, "cases", {
      requireReadOnly: true
    });
    const sourceEntries = collectTreeEntries(
      sourceRoot,
      "production-source",
      { requireReadOnly: true }
    );
    const committedEntries = [
      ...controlledEntries,
      ...snapshotEntries,
      ...sourceEntries
    ].sort(compareEntries);
    const inputCommitments = {
      comparative_analysis_sha256:
        inputs.preparation.comparative_analysis_sha256,
      comparative_packet_sha256:
        inputs.preparation.comparative_packet_sha256,
      comparative_result_sha256:
        inputs.preparation.comparative_result_sha256,
      investigation_cases_sha256:
        entryHash(controlledEntries, "investigation-cases.json"),
      production_source_sha256: treeCommitment(sourceEntries),
      ranking_result_schema_sha256:
        entryHash(controlledEntries, "ranking-result.schema.json"),
      rejected_hypotheses_sha256:
        entryHash(controlledEntries, "rejected-hypotheses.json"),
      reviewer_prompt_sha256:
        entryHash(controlledEntries, "README-FIRST.txt"),
      snapshot_tree_sha256: treeCommitment(snapshotEntries),
      starting_head: inputs.preparation.starting_head
    };
    const resourceCounts = resourceCountsFor(
      committedEntries,
      snapshotEntries,
      sourceEntries,
      copyState.rejectedLinks,
      {
        candidate_count: 185,
        ...controls
      }
    );
    const manifest = {
      schema_version: RANKING_DOCKET_SCHEMA,
      case_count: investigation.cases.length,
      input_commitments: inputCommitments,
      packet_hash: docketCommitment(
        RANKING_DOCKET_SCHEMA,
        inputCommitments,
        resourceCounts,
        limits,
        committedEntries
      ),
      resource_counts: resourceCounts,
      resource_limits: limits
    };
    writeNewFile(
      path.join(stagingRoot, "packet-manifest.json"),
      jsonBytes(manifest)
    );
    for (const relativePath of [
      ...RANKING_CONTROLLED_FILES,
      "packet-manifest.json"
    ]) {
      fs.chmodSync(path.join(stagingRoot, relativePath), 0o400);
    }
    fs.chmodSync(stagingRoot, 0o500);
    validateRankingDocket(stagingRoot);
    refuseExistingPath(output.path);
    fs.chmodSync(stagingRoot, 0o700);
    fs.renameSync(stagingRoot, output.path);
    fs.chmodSync(output.path, 0o500);
    completed = true;
    const validation = validateRankingDocket(output.path);
    return {
      ...validation,
      controls,
      source_snapshot_links_rejected: copyState.rejectedLinks
    };
  } finally {
    if (!completed) {
      cleanupOwnedStaging(output.parent, stagingName);
    }
  }
}

/**
 * Validate a ranking docket without executing any contained content.
 */
export function validateRankingDocket(packetRoot, options = {}) {
  const root = canonicalDirectory(packetRoot, "ranking docket root");
  assertRootLayout(root, RANKING_ROOT_ENTRIES, "Ranking docket");
  const outputFiles = validateDocketOutput(
    root,
    options.allowedOutputFiles,
    RANKING_RESULT_FILE
  );
  validateReadOnlyTree(root, "cases");
  validateReadOnlyTree(root, "production-source");
  validateControlledFiles(root, [
    ...RANKING_CONTROLLED_FILES,
    "packet-manifest.json"
  ]);
  const manifest = readStableJson(
    containedFile(root, "packet-manifest.json"),
    256 * 1024,
    "ranking manifest"
  );
  validateManifest(manifest, RANKING_DOCKET_SCHEMA);
  const investigation = readStableJson(
    containedFile(root, "investigation-cases.json"),
    D2D_LIMITS.max_json_bytes,
    "ranking investigation cases"
  );
  validateRankingCases(investigation);
  const casesRoot = containedDirectory(root, "cases");
  assertDeepEqual(
    fs.readdirSync(casesRoot).sort(compareText),
    investigation.cases.map((item) => item.case_id).sort(compareText),
    "Ranking snapshot case inventory differs."
  );
  const snapshots = collectAndStableVerify(casesRoot, "cases");
  bindRankingCandidates(root, investigation, snapshots);
  const sourceRoot = containedDirectory(root, "production-source");
  const sourceEntries = collectAndStableVerify(
    sourceRoot,
    "production-source"
  );
  assertDeepEqual(
    sourceEntries
      .filter((entry) => entry.type === "file")
      .map((entry) => entry.path.replace(/^production-source\//, "")),
    [...PRODUCTION_SOURCE_FILES].sort(compareText),
    "Ranking production source inventory differs."
  );
  const controlledEntries = RANKING_CONTROLLED_FILES.map(
    (relativePath) => fileEntry(root, relativePath, true)
  );
  const committedEntries = [
    ...controlledEntries,
    ...snapshots,
    ...sourceEntries
  ].sort(compareEntries);
  const expectedCommitments = {
    ...manifest.input_commitments,
    investigation_cases_sha256:
      entryHash(controlledEntries, "investigation-cases.json"),
    production_source_sha256: treeCommitment(sourceEntries),
    ranking_result_schema_sha256:
      entryHash(controlledEntries, "ranking-result.schema.json"),
    rejected_hypotheses_sha256:
      entryHash(controlledEntries, "rejected-hypotheses.json"),
    reviewer_prompt_sha256:
      entryHash(controlledEntries, "README-FIRST.txt"),
    snapshot_tree_sha256: treeCommitment(snapshots)
  };
  assertDeepEqual(
    manifest.input_commitments,
    expectedCommitments,
    "Ranking input commitments differ from packet bytes."
  );
  const controls = deriveVisibleControlCounts(investigation);
  const expectedCounts = resourceCountsFor(
    committedEntries,
    snapshots,
    sourceEntries,
    manifest.resource_counts.snapshot_links_rejected_during_copy,
    {
      candidate_count: investigation.cases.reduce(
        (total, item) => total + item.candidates.length,
        0
      ),
      ...controls
    }
  );
  assertDeepEqual(
    manifest.resource_counts,
    expectedCounts,
    "Ranking resource counts differ from packet bytes."
  );
  const packetHash = docketCommitment(
    RANKING_DOCKET_SCHEMA,
    manifest.input_commitments,
    manifest.resource_counts,
    manifest.resource_limits,
    committedEntries
  );
  if (packetHash !== manifest.packet_hash) {
    throw new Error("Ranking packet commitment mismatch.");
  }
  const rejected = readStableJson(
    containedFile(root, "rejected-hypotheses.json"),
    64 * 1024,
    "rejected hypothesis ledger"
  );
  validateRejectedLedger(rejected);
  return {
    packet_root: root,
    packet_hash: packetHash,
    packet_manifest_sha256: sha256(
      readStableRegularFile(
        containedFile(root, "packet-manifest.json"),
        256 * 1024
      )
    ),
    snapshot_tree_sha256: treeCommitment(snapshots),
    production_source_sha256: treeCommitment(sourceEntries),
    case_count: investigation.cases.length,
    candidate_count:
      manifest.resource_counts.candidate_count,
    controls,
    packet_bytes: directoryFileBytes(root),
    output_files: outputFiles
  };
}

/**
 * Construct the canonical, governance-blocked Phase-1 label input.
 *
 * @param {{repoRoot:string, packetRoot:string, outputRoot:string,
 * preparationPath?:string, limits?:typeof D2D_LIMITS}} options
 */
export function buildLabelDocket(options) {
  const startedAt = Date.now();
  const limits = limitsFor(options.limits);
  const repoRoot = canonicalDirectory(options.repoRoot, "repository root");
  const sourcePacketRoot = canonicalDirectory(
    options.packetRoot,
    "comparative packet root"
  );
  const output = prepareAbsentOutput(options.outputRoot);
  const inputs = loadFrozenInputs(
    repoRoot,
    sourcePacketRoot,
    options.preparationPath
  );
  const inclusion = deriveLabelInclusion(
    inputs.analysis,
    inputs.preparation.preparation_seed
  );
  assertDeepEqual(
    {
      affected_case_count: inclusion.cases.length,
      affected_path_count: inclusion.affectedPathCount,
      overlapping_path_count: inclusion.overlappingPathCount,
      comparative_unselected_count:
        inclusion.comparativeUnselectedCount,
      prior_unsupported_count: inclusion.priorUnsupportedCount,
      prior_unknown_count: inclusion.priorUnknownCount
    },
    {
      affected_case_count: 4,
      affected_path_count: 6,
      overlapping_path_count: 2,
      comparative_unselected_count: 5,
      prior_unsupported_count: 2,
      prior_unknown_count: 1
    },
    "Frozen label inclusion union differs from the D.2C reconstruction."
  );
  const reviewCases = maskedLabelReviewCases(inclusion);
  const stagingName =
    `.${output.name}.staging-${process.pid}-${crypto.randomUUID()}`;
  const stagingRoot = path.join(output.parent, stagingName);
  fs.mkdirSync(stagingRoot, { recursive: false, mode: 0o700 });
  let completed = false;
  try {
    const casesRoot = path.join(stagingRoot, "cases");
    fs.mkdirSync(casesRoot, { mode: 0o700 });
    fs.mkdirSync(path.join(stagingRoot, "output"), { mode: 0o700 });
    const copyState = newCopyState(limits, startedAt);
    for (const item of inclusion.cases) {
      copySnapshot(
        containedDirectory(
          sourcePacketRoot,
          `cases/${item.source_case_id}`
        ),
        path.join(casesRoot, item.label_case_id),
        copyState,
        item.label_case_id
      );
    }
    const files = new Map([
      [
        "README-FIRST.txt",
        "eval/d2d/label-reviewer-prompt.txt"
      ],
      [
        "governance-template.json",
        "eval/d2d/governance-template.json"
      ],
      ["governance.schema.json", "eval/d2d/governance.schema.json"],
      [
        "label-phase1-result.schema.json",
        "eval/d2d/label-phase1-result.schema.json"
      ],
      [
        "label-phase2-result.schema.json",
        "eval/d2d/label-phase2-result.schema.json"
      ],
      [
        "phase2-materializer-contract.json",
        "eval/d2d/phase2-materializer-contract.json"
      ]
    ]);
    for (const [name, source] of files) {
      writeNewFile(
        path.join(stagingRoot, name),
        readStableRegularFile(
          containedFile(repoRoot, source),
          256 * 1024
        )
      );
    }
    writeNewFile(
      path.join(stagingRoot, "review-cases.json"),
      jsonBytes(reviewCases)
    );
    makeTreeReadOnly(casesRoot);
    const controlledEntries = LABEL_CONTROLLED_FILES.map(
      (relativePath) => fileEntry(stagingRoot, relativePath)
    );
    const snapshots = collectTreeEntries(casesRoot, "cases", {
      requireReadOnly: true
    });
    const committedEntries = [
      ...controlledEntries,
      ...snapshots
    ].sort(compareEntries);
    const inputCommitments = {
      canonical_source_snapshot_sha256:
        inputs.preparation.comparative_snapshot_tree_sha256,
      governance_schema_sha256:
        entryHash(controlledEntries, "governance.schema.json"),
      governance_template_sha256:
        entryHash(controlledEntries, "governance-template.json"),
      phase1_result_schema_sha256:
        entryHash(
          controlledEntries,
          "label-phase1-result.schema.json"
        ),
      phase2_materializer_contract_sha256:
        entryHash(
          controlledEntries,
          "phase2-materializer-contract.json"
        ),
      phase2_result_schema_sha256:
        entryHash(
          controlledEntries,
          "label-phase2-result.schema.json"
        ),
      review_cases_sha256:
        entryHash(controlledEntries, "review-cases.json"),
      reviewer_prompt_sha256:
        entryHash(controlledEntries, "README-FIRST.txt"),
      snapshot_tree_sha256: treeCommitment(snapshots),
      starting_head: inputs.preparation.starting_head
    };
    const resourceCounts = resourceCountsFor(
      committedEntries,
      snapshots,
      [],
      copyState.rejectedLinks,
      {}
    );
    const manifest = {
      schema_version: LABEL_DOCKET_SCHEMA,
      case_count: reviewCases.cases.length,
      input_commitments: inputCommitments,
      packet_hash: docketCommitment(
        LABEL_DOCKET_SCHEMA,
        inputCommitments,
        resourceCounts,
        limits,
        committedEntries
      ),
      resource_counts: resourceCounts,
      resource_limits: limits
    };
    writeNewFile(
      path.join(stagingRoot, "packet-manifest.json"),
      jsonBytes(manifest)
    );
    for (const relativePath of [
      ...LABEL_CONTROLLED_FILES,
      "packet-manifest.json"
    ]) {
      fs.chmodSync(path.join(stagingRoot, relativePath), 0o400);
    }
    fs.chmodSync(stagingRoot, 0o500);
    validateLabelDocket(stagingRoot);
    refuseExistingPath(output.path);
    fs.chmodSync(stagingRoot, 0o700);
    fs.renameSync(stagingRoot, output.path);
    fs.chmodSync(output.path, 0o500);
    completed = true;
    return {
      ...validateLabelDocket(output.path),
      affected_path_count: inclusion.affectedPathCount,
      affected_case_count: inclusion.cases.length,
      inclusion_proof: {
        comparative_unselected_count:
          inclusion.comparativeUnselectedCount,
        prior_unsupported_count: inclusion.priorUnsupportedCount,
        prior_unknown_count: inclusion.priorUnknownCount,
        overlapping_path_count: inclusion.overlappingPathCount,
        union_deduplicated: true
      },
      source_snapshot_links_rejected: copyState.rejectedLinks
    };
  } finally {
    if (!completed) {
      cleanupOwnedStaging(output.parent, stagingName);
    }
  }
}

export function validateLabelDocket(packetRoot, options = {}) {
  const root = canonicalDirectory(packetRoot, "label docket root");
  assertRootLayout(root, LABEL_ROOT_ENTRIES, "Label docket");
  const outputFiles = validateDocketOutput(
    root,
    options.allowedOutputFiles,
    PHASE1_RESULT_FILE
  );
  validateReadOnlyTree(root, "cases");
  validateControlledFiles(root, [
    ...LABEL_CONTROLLED_FILES,
    "packet-manifest.json"
  ]);
  const manifest = readStableJson(
    containedFile(root, "packet-manifest.json"),
    256 * 1024,
    "label manifest"
  );
  validateManifest(manifest, LABEL_DOCKET_SCHEMA);
  const review = readStableJson(
    containedFile(root, "review-cases.json"),
    256 * 1024,
    "label review cases"
  );
  validateLabelCases(review);
  const governance = readStableJson(
    containedFile(root, "governance-template.json"),
    64 * 1024,
    "governance template"
  );
  const governanceStatus = validateGovernance(governance, {
    allowBlocked: true
  });
  if (governanceStatus !== "governance-blocked") {
    throw new Error("Canonical label docket must remain governance-blocked.");
  }
  const casesRoot = containedDirectory(root, "cases");
  assertDeepEqual(
    fs.readdirSync(casesRoot).sort(compareText),
    review.cases.map((item) => item.case_id).sort(compareText),
    "Label snapshot case inventory differs."
  );
  const snapshots = collectAndStableVerify(casesRoot, "cases");
  const controlledEntries = LABEL_CONTROLLED_FILES.map(
    (relativePath) => fileEntry(root, relativePath, true)
  );
  const committedEntries = [
    ...controlledEntries,
    ...snapshots
  ].sort(compareEntries);
  const expectedCommitments = {
    ...manifest.input_commitments,
    governance_schema_sha256:
      entryHash(controlledEntries, "governance.schema.json"),
    governance_template_sha256:
      entryHash(controlledEntries, "governance-template.json"),
    phase1_result_schema_sha256:
      entryHash(
        controlledEntries,
        "label-phase1-result.schema.json"
      ),
    phase2_materializer_contract_sha256:
      entryHash(
        controlledEntries,
        "phase2-materializer-contract.json"
      ),
    phase2_result_schema_sha256:
      entryHash(
        controlledEntries,
        "label-phase2-result.schema.json"
      ),
    review_cases_sha256:
      entryHash(controlledEntries, "review-cases.json"),
    reviewer_prompt_sha256:
      entryHash(controlledEntries, "README-FIRST.txt"),
    snapshot_tree_sha256: treeCommitment(snapshots)
  };
  assertDeepEqual(
    manifest.input_commitments,
    expectedCommitments,
    "Label input commitments differ from packet bytes."
  );
  const expectedCounts = resourceCountsFor(
    committedEntries,
    snapshots,
    [],
    manifest.resource_counts.snapshot_links_rejected_during_copy,
    {}
  );
  assertDeepEqual(
    manifest.resource_counts,
    expectedCounts,
    "Label resource counts differ from packet bytes."
  );
  const packetHash = docketCommitment(
    LABEL_DOCKET_SCHEMA,
    manifest.input_commitments,
    manifest.resource_counts,
    manifest.resource_limits,
    committedEntries
  );
  if (packetHash !== manifest.packet_hash) {
    throw new Error("Label packet commitment mismatch.");
  }
  return {
    packet_root: root,
    packet_hash: packetHash,
    packet_manifest_sha256: sha256(
      readStableRegularFile(
        containedFile(root, "packet-manifest.json"),
        256 * 1024
      )
    ),
    snapshot_tree_sha256: treeCommitment(snapshots),
    case_count: review.cases.length,
    governance_status: governanceStatus,
    packet_bytes: directoryFileBytes(root),
    output_files: outputFiles
  };
}

/**
 * Validate the only permitted ranking-review result.
 */
export function validateRankingResult(result, docket) {
  const validation =
    typeof docket === "string"
      ? validateRankingDocket(docket)
      : docket;
  const root = validation.packet_root;
  const cases = readStableJson(
    containedFile(root, "investigation-cases.json"),
    D2D_LIMITS.max_json_bytes,
    "ranking cases"
  );
  if (
    !isPlainRecord(result) ||
    !hasExactKeys(result, [
      "hypotheses",
      "outcome",
      "packet_commitment",
      "schema_version"
    ]) ||
    result.schema_version !== "kanon-d2d-ranking-result-v1" ||
    result.packet_commitment !== validation.packet_hash ||
    !["no-generic-hypothesis", "generic-hypotheses"].includes(
      result.outcome
    ) ||
    !Array.isArray(result.hypotheses) ||
    result.hypotheses.length > 3 ||
    (result.outcome === "no-generic-hypothesis" &&
      result.hypotheses.length !== 0) ||
    (result.outcome === "generic-hypotheses" &&
      result.hypotheses.length < 1)
  ) {
    throw new Error("Ranking result structure is invalid.");
  }
  const knownCases = new Set(cases.cases.map((item) => item.case_id));
  for (let index = 0; index < result.hypotheses.length; index += 1) {
    validateHypothesis(result.hypotheses[index], index, knownCases);
  }
  return true;
}

/**
 * Validate a Phase-1 human label result against arbitrary safe snapshot files.
 */
export function validatePhase1Result(result, docket) {
  const validation =
    typeof docket === "string"
      ? validateLabelDocket(docket)
      : docket;
  const root = validation.packet_root;
  const review = readStableJson(
    containedFile(root, "review-cases.json"),
    256 * 1024,
    "label review cases"
  );
  validateLabelLikeResult(
    result,
    "kanon-d2d-label-phase1-result-v1",
    "input_commitment",
    validation.packet_hash,
    review,
    root
  );
  return true;
}

/**
 * Validate governance. A canonical template is blocked; materializers require
 * three named, distinct, conflict-free people.
 */
export function validateGovernance(value, options = {}) {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      "implementation_author",
      "independent_label_reviewer",
      "independent_labeler",
      "schema_version",
      "status"
    ]) ||
    value.schema_version !== "kanon-d2d-label-governance-v1" ||
    ![
      "governance-blocked",
      "phase1-ready",
      "phase1-sealed",
      "phase2-ready",
      "complete"
    ].includes(value.status)
  ) {
    throw new Error("Governance structure is invalid.");
  }
  const roles = [
    ["implementation_author", "implementation-author"],
    ["independent_labeler", "independent-labeler"],
    ["independent_label_reviewer", "independent-label-reviewer"]
  ];
  if (roles.every(([key]) => value[key] === null)) {
    if (value.status !== "governance-blocked" || !options.allowBlocked) {
      throw new Error("Governance is blocked because identities are unset.");
    }
    return value.status;
  }
  if (roles.some(([key]) => value[key] === null)) {
    throw new Error("All three governance roles must be supplied.");
  }
  const names = new Set();
  for (const [key, role] of roles) {
    const person = value[key];
    validatePerson(person, role, options.inputCommitment);
    const normalized = person.legal_or_professional_name
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase("en");
    if (names.has(normalized)) {
      throw new Error("Governance people must be distinct.");
    }
    names.add(normalized);
    if (!/^no (?:known )?conflict\b/iu.test(person.conflict_declaration)) {
      throw new Error("A governance conflict remains declared or unclear.");
    }
    if (!/\bindependent\b/iu.test(person.independence_declaration)) {
      throw new Error("Governance independence is not explicitly declared.");
    }
  }
  return value.status;
}

/**
 * Materialize an isolated Phase-1 instance only after all three governance
 * identities are supplied. No reviewer output is generated.
 */
export function materializePhase1Instance(options) {
  const canonical = validateLabelDocket(options.canonicalRoot);
  const governance = readGovernanceValue(options.governance);
  if (
    validateGovernance(governance, {
      inputCommitment: canonical.packet_hash
    }) !== "phase1-ready"
  ) {
    throw new Error("Phase 1 is not governance-ready.");
  }
  assertIsolatedOutputRoots(
    canonical.packet_root,
    options.outputRoot
  );
  return materializeReadOnlyClone(
    canonical.packet_root,
    options.outputRoot,
    PHASE1_RESULT_FILE
  );
}

/**
 * Future-only Phase-2 materializer. It refuses to proceed until Phase 1 has
 * exactly one validated, sealed result and a distinct reviewer identity.
 */
export function materializePhase2Instance(options) {
  const canonical = validateLabelDocket(options.canonicalRoot);
  const phase1 = validateLabelDocket(options.phase1Root, {
    allowedOutputFiles: [PHASE1_RESULT_FILE]
  });
  if (phase1.packet_hash !== canonical.packet_hash) {
    throw new Error("Phase-1 controlled input commitment differs.");
  }
  const resultPath = containedFile(
    path.join(phase1.packet_root, "output"),
    PHASE1_RESULT_FILE
  );
  const resultBytes = readStableRegularFile(
    resultPath,
    D2D_LIMITS.max_result_bytes
  );
  const result = parseJson(resultBytes, "Phase-1 result");
  const governance = readGovernanceValue(options.governance);
  validatePhase2Prerequisites({
    canonical,
    phase1,
    result,
    resultBytes,
    governance
  });
  const originalLabels = options.originalLabels;
  validateOriginalLabelMap(originalLabels, result.cases);
  const output = prepareAbsentOutput(options.outputRoot);
  assertIsolatedOutputRoots(
    canonical.packet_root,
    phase1.packet_root,
    output.path
  );
  const stagingName =
    `.${output.name}.staging-${process.pid}-${crypto.randomUUID()}`;
  const stagingRoot = path.join(output.parent, stagingName);
  fs.mkdirSync(stagingRoot, { recursive: false, mode: 0o700 });
  let completed = false;
  try {
    const state = newCopyState(D2D_LIMITS, Date.now());
    const sourceCases = containedDirectory(canonical.packet_root, "cases");
    copySnapshot(
      sourceCases,
      path.join(stagingRoot, "cases"),
      state,
      "phase2-cases"
    );
    fs.mkdirSync(path.join(stagingRoot, "output"), { mode: 0o700 });
    const promptPath = options.phase2PromptPath;
    if (!promptPath) {
      throw new Error("Phase-2 reviewer prompt path is required.");
    }
    writeNewFile(
      path.join(stagingRoot, "README-FIRST.txt"),
      readStableRegularFile(promptPath, 128 * 1024)
    );
    writeNewFile(
      path.join(stagingRoot, "label-phase2-result.schema.json"),
      readStableRegularFile(
        containedFile(
          canonical.packet_root,
          "label-phase2-result.schema.json"
        ),
        256 * 1024
      )
    );
    writeNewFile(
      path.join(stagingRoot, "governance.json"),
      jsonBytes(governance)
    );
    const adjudication = derivePhase2ControlledInputs({
      canonicalInputCommitment: canonical.packet_hash,
      phase1Result: result,
      phase1ResultBytes: resultBytes,
      originalLabels
    });
    writeNewFile(
      path.join(stagingRoot, "adjudication-cases.json"),
      adjudication.adjudication_cases_bytes
    );
    makeTreeReadOnly(path.join(stagingRoot, "cases"));
    const snapshotEntries = collectTreeEntries(
      path.join(stagingRoot, "cases"),
      "cases",
      { requireReadOnly: true }
    );
    const phase2InputCommitment = bindPhase2PacketCommitment(
      adjudication.phase2_input_commitment,
      {
        governance_sha256: sha256(jsonBytes(governance)),
        reviewer_prompt_sha256: sha256(readStableRegularFile(
          path.join(stagingRoot, "README-FIRST.txt"),
          128 * 1024
        )),
        result_schema_sha256: sha256(readStableRegularFile(
          path.join(stagingRoot, "label-phase2-result.schema.json"),
          256 * 1024
        )),
        snapshot_tree_sha256: treeCommitment(snapshotEntries)
      }
    );
    writeNewFile(
      path.join(stagingRoot, "packet-manifest.json"),
      jsonBytes({
        schema_version: "kanon-d2d-label-phase2-packet-v1",
        canonical_input_commitment: canonical.packet_hash,
        sealed_phase1_result_sha256: sha256(resultBytes),
        phase2_input_commitment: phase2InputCommitment,
        case_count: result.cases.length,
        input_commitments: {
          adjudication_cases_sha256:
            sha256(adjudication.adjudication_cases_bytes),
          governance_sha256: sha256(jsonBytes(governance)),
          reviewer_prompt_sha256: sha256(readStableRegularFile(
            path.join(stagingRoot, "README-FIRST.txt"),
            128 * 1024
          )),
          result_schema_sha256: sha256(readStableRegularFile(
            path.join(
              stagingRoot,
              "label-phase2-result.schema.json"
            ),
            256 * 1024
          )),
          snapshot_tree_sha256: treeCommitment(snapshotEntries)
        }
      })
    );
    for (const file of [
      "README-FIRST.txt",
      "adjudication-cases.json",
      "governance.json",
      "packet-manifest.json",
      "label-phase2-result.schema.json"
    ]) {
      fs.chmodSync(path.join(stagingRoot, file), 0o400);
    }
    refuseExistingPath(output.path);
    fs.renameSync(stagingRoot, output.path);
    fs.chmodSync(output.path, 0o500);
    completed = true;
    return {
      packet_root: canonicalDirectory(output.path, "Phase-2 root"),
      canonical_input_commitment: canonical.packet_hash,
      sealed_phase1_result_sha256: sha256(resultBytes),
      phase2_input_commitment: phase2InputCommitment,
      output_files: []
    };
  } finally {
    if (!completed) {
      cleanupOwnedStaging(output.parent, stagingName);
    }
  }
}

export function bindPhase2PacketCommitment(baseCommitment, bindings) {
  if (
    !HASH.test(baseCommitment) ||
    !isPlainRecord(bindings) ||
    !hasExactKeys(bindings, [
      "governance_sha256",
      "result_schema_sha256",
      "reviewer_prompt_sha256",
      "snapshot_tree_sha256"
    ]) ||
    Object.values(bindings).some((item) => !HASH.test(item))
  ) {
    throw new Error("Phase-2 packet commitment bindings are invalid.");
  }
  return sha256(jsonBytes({
    schema_version: "kanon-d2d-label-phase2-packet-commitment-v1",
    controlled_base_commitment: baseCommitment,
    input_commitments: bindings
  }));
}

export function derivePhase2ControlledInputs(options) {
  const {
    canonicalInputCommitment,
    phase1Result,
    phase1ResultBytes,
    originalLabels
  } = options;
  if (
    !HASH.test(canonicalInputCommitment) ||
    !Buffer.isBuffer(phase1ResultBytes) ||
    !isPlainRecord(phase1Result) ||
    !Array.isArray(phase1Result.cases)
  ) {
    throw new Error("Phase-2 controlled inputs are invalid.");
  }
  validateOriginalLabelMap(originalLabels, phase1Result.cases);
  const adjudicationCases = {
    schema_version: "kanon-d2d-label-phase2-cases-v1",
    canonical_input_commitment: canonicalInputCommitment,
    sealed_phase1_result_sha256: sha256(phase1ResultBytes),
    cases: phase1Result.cases.map((item) => ({
      case_id: item.case_id,
      snapshot_root: `cases/${item.case_id}`,
      frozen_original_label: originalLabels[item.case_id],
      sealed_new_label: item
    }))
  };
  const adjudicationBytes = jsonBytes(adjudicationCases);
  return {
    adjudication_cases: adjudicationCases,
    adjudication_cases_bytes: adjudicationBytes,
    phase2_input_commitment: sha256(jsonBytes({
      schema_version: "kanon-d2d-label-phase2-input-commitment-v1",
      canonical_input_commitment: canonicalInputCommitment,
      sealed_phase1_result_sha256: sha256(phase1ResultBytes),
      adjudication_cases_sha256: sha256(adjudicationBytes)
    }))
  };
}

export function validatePhase2Result(result, options) {
  const { inputCommitment, caseIds, packetRoot } = options;
  if (
    !isPlainRecord(result) ||
    !hasExactKeys(result, [
      "cases",
      "input_commitment",
      "projection_may_be_incomplete_acknowledged",
      "schema_version",
      "unsafe_links_excluded_acknowledged"
    ]) ||
    result.schema_version !== "kanon-d2d-label-phase2-result-v1" ||
    result.input_commitment !== inputCommitment ||
    result.unsafe_links_excluded_acknowledged !== true ||
    result.projection_may_be_incomplete_acknowledged !== true ||
    !Array.isArray(result.cases) ||
    result.cases.length !== caseIds.length
  ) {
    throw new Error("Phase-2 result structure is invalid.");
  }
  assertDeepEqual(
    result.cases.map((item) => item.case_id),
    caseIds,
    "Phase-2 case order differs from its controlled input."
  );
  for (const item of result.cases) {
    if (
      !isPlainRecord(item) ||
      !hasExactKeys(item, [
        "case_id",
        "decision",
        "rationale",
        "reconciled_selections"
      ]) ||
      !CASE_ID.test(item.case_id) ||
      ![
        "accept-original",
        "accept-new",
        "reconciled",
        "unknown"
      ].includes(item.decision) ||
      !safeText(item.rationale, 1000) ||
      !Array.isArray(item.reconciled_selections) ||
      item.reconciled_selections.length > 5 ||
      (item.decision !== "reconciled" &&
        item.reconciled_selections.length !== 0)
    ) {
      throw new Error("Phase-2 case decision is invalid.");
    }
    const selected = new Set();
    for (const selection of item.reconciled_selections) {
      if (
        !isPlainRecord(selection) ||
        !hasExactKeys(selection, [
          "path",
          "rationale",
          "source_paths"
        ]) ||
        !safeText(selection.rationale, 1000) ||
        !Array.isArray(selection.source_paths) ||
        selection.source_paths.length < 1 ||
        selection.source_paths.length > 20
      ) {
        throw new Error("Phase-2 reconciled selection is invalid.");
      }
      validateContainedSnapshotFile(
        packetRoot,
        item.case_id,
        selection.path
      );
      if (selected.has(selection.path)) {
        throw new Error("Phase-2 reconciled path is duplicated.");
      }
      selected.add(selection.path);
      const sources = new Set();
      for (const sourcePath of selection.source_paths) {
        validateContainedSnapshotFile(
          packetRoot,
          item.case_id,
          sourcePath
        );
        if (sources.has(sourcePath)) {
          throw new Error("Phase-2 source path is duplicated.");
        }
        sources.add(sourcePath);
      }
    }
  }
  return true;
}

export function validatePhase2Prerequisites(options) {
  const { canonical, phase1, result, resultBytes, governance } = options;
  if (
    !isPlainRecord(canonical) ||
    !isPlainRecord(phase1) ||
    !Buffer.isBuffer(resultBytes) ||
    phase1.packet_hash !== canonical.packet_hash
  ) {
    throw new Error("Phase-1 controlled input commitment differs.");
  }
  validatePhase1Result(result, phase1);
  if (
    validateGovernance(governance, {
      inputCommitment: canonical.packet_hash
    }) !== "phase1-sealed"
  ) {
    throw new Error("Phase 1 is not sealed for Phase 2.");
  }
  if (
    governance.independent_labeler.result_commitment !==
    sha256(resultBytes)
  ) {
    throw new Error("Sealed Phase-1 result commitment differs.");
  }
  return {
    canonical_input_commitment: canonical.packet_hash,
    sealed_phase1_result_sha256: sha256(resultBytes)
  };
}

export function deriveLabelInclusion(analysis, seed) {
  validateComparativeUnblindedAnalysis(analysis, {
    expectedCaseCount: 28,
    expectedCandidateCount: 185
  });
  if (!HASH.test(seed)) {
    throw new Error("Label identity seed is invalid.");
  }
  const affected = [];
  let affectedPathCount = 0;
  let overlappingPathCount = 0;
  let comparativeUnselectedCount = 0;
  let priorUnsupportedCount = 0;
  let priorUnknownCount = 0;
  for (const item of analysis.cases) {
    const paths = [];
    for (const candidate of item.candidates) {
      if (candidate.origin !== "label-only") {
        continue;
      }
      const triggers = [];
      if (candidate.review_status === "unselected") {
        triggers.push("comparative-unselected");
        comparativeUnselectedCount += 1;
      }
      if (
        candidate.prior_d2c.reviewer_disposition ===
        "clearly-unsupported"
      ) {
        triggers.push("prior-unsupported");
        priorUnsupportedCount += 1;
      }
      if (
        candidate.prior_d2c.reviewer_disposition === "unknown"
      ) {
        triggers.push("prior-unknown");
        priorUnknownCount += 1;
      }
      if (triggers.length) {
        paths.push({ path: candidate.path, triggers });
        affectedPathCount += 1;
        if (triggers.length > 1) {
          overlappingPathCount += 1;
        }
      }
    }
    if (paths.length) {
      const labelCaseId =
        `case-${keyedIdentity(seed, "label-case", item.case_id, 20)}`;
      affected.push({
        source_case_id: item.case_id,
        d2a_case_id: item.d2a_case_id,
        label_case_id: labelCaseId,
        paths
      });
    }
  }
  affected.sort((left, right) =>
    compareText(left.label_case_id, right.label_case_id)
  );
  return {
    cases: affected,
    affectedPathCount,
    overlappingPathCount,
    comparativeUnselectedCount,
    priorUnsupportedCount,
    priorUnknownCount
  };
}

export function maskedLabelReviewCases(inclusion) {
  if (
    !isPlainRecord(inclusion) ||
    !Array.isArray(inclusion.cases)
  ) {
    throw new Error("Label inclusion derivation is invalid.");
  }
  const value = {
    schema_version: LABEL_CASES_SCHEMA,
    cases: inclusion.cases.map((item) => ({
      case_id: item.label_case_id,
      snapshot_root: `cases/${item.label_case_id}`
    }))
  };
  validateLabelCases(value);
  return value;
}

function loadFrozenInputs(repoRoot, packetRoot, preparationPath) {
  const preparation = readJsonBounded(
    containedFile(
      repoRoot,
      preparationPath || "eval/d2d/preparation.json"
    ),
    64 * 1024
  );
  validatePreparation(preparation);
  const hashBindings = [
    ["d2a_report", "d2a_report_sha256"],
    ["development_corpus", "development_corpus_sha256"],
    ["prior_review_result", "prior_review_result_sha256"],
    ["prior_unblinded_analysis", "prior_unblinded_analysis_sha256"],
    ["comparative_result", "comparative_result_sha256"],
    ["comparative_analysis", "comparative_analysis_sha256"]
  ];
  for (const [fileKey, hashKey] of hashBindings) {
    const bytes = readStableRegularFile(
      containedFile(repoRoot, preparation[fileKey]),
      D2D_LIMITS.max_json_bytes
    );
    if (sha256(bytes) !== preparation[hashKey]) {
      throw new Error(`Frozen ${fileKey} hash differs.`);
    }
  }
  const packet = validateComparativePacket(packetRoot, {
    allowedOutputFiles: ["comparative-result.json"]
  });
  if (
    packet.packet_hash !== preparation.comparative_packet_sha256 ||
    packet.packet_manifest_sha256 !==
      preparation.comparative_packet_manifest_sha256 ||
    packet.case_snapshots_sha256 !==
      preparation.comparative_snapshot_tree_sha256
  ) {
    throw new Error("Frozen comparative packet binding differs.");
  }
  const retainedResult = readStableRegularFile(
    containedFile(packetRoot, "output/comparative-result.json"),
    D2D_LIMITS.max_result_bytes
  );
  if (sha256(retainedResult) !== preparation.comparative_result_sha256) {
    throw new Error("Retained comparative output hash differs.");
  }
  const analysis = readJsonBounded(
    containedFile(repoRoot, preparation.comparative_analysis),
    D2D_LIMITS.max_json_bytes
  );
  validateComparativeUnblindedAnalysis(analysis, {
    expectedCaseCount: 28,
    expectedCandidateCount: 185
  });
  const comparativeReview = readJsonBounded(
    containedFile(packetRoot, "review-cases.json"),
    D2D_LIMITS.max_json_bytes
  );
  return { analysis, comparativeReview, packet, preparation };
}

export function deriveRankingCases(analysis, comparativeReview) {
  const visible = new Map(
    comparativeReview.cases.map((item) => [item.case_id, item])
  );
  const cases = analysis.cases.map((item) => {
    const packetCase = visible.get(item.case_id);
    if (!packetCase) {
      throw new Error("Comparative case is absent from retained packet.");
    }
    const byId = new Map(
      item.candidates.map((candidate) => [
        candidate.candidate_id,
        candidate
      ])
    );
    const candidates = packetCase.candidates.map((visibleCandidate) => {
      const source = byId.get(visibleCandidate.candidate_id);
      if (
        !source ||
        source.path !== visibleCandidate.path ||
        canonicalJson(source.file_metadata) !==
          canonicalJson(visibleCandidate.file_metadata)
      ) {
        throw new Error("Comparative candidate mapping differs.");
      }
      return {
        candidate_id: source.candidate_id,
        correlated_comparative_review: {
          direct_source_paths:
            source.comparative_direct_sources,
          rationale: source.comparative_rationale,
          selected: source.review_status === "selected",
          selected_position: source.selected_position
        },
        file_metadata: source.file_metadata,
        path: source.path,
        production_time_trace: {
          availability: "unavailable",
          reasons: [],
          score: null,
          selection_stage: "Unknown",
          signals: [],
          unknowns: [
            "The frozen D.2A evidence did not preserve a per-candidate feature trace."
          ]
        },
        system_selected: source.prediction_member
      };
    });
    const systemSelection = item.frozen_prediction_paths.map((selected) =>
      candidateIdForPath(candidates, selected)
    );
    const reviewerSelection = item.reviewer_selected_paths.map((selected) =>
      candidateIdForPath(candidates, selected)
    );
    return {
      case_id: item.case_id,
      snapshot_root: `cases/${item.case_id}`,
      comparison_class: item.set_comparison.closer,
      system_selection: systemSelection,
      correlated_comparative_review_selection: reviewerSelection,
      candidates
    };
  });
  return { schema_version: RANKING_CASES_SCHEMA, cases };
}

export function deriveControlCounts(analysis) {
  const counts = {
    consensus_selected: 0,
    consensus_unselected: 0,
    label_closer_cases: 0,
    label_only_selected: 0,
    label_only_unselected: 0,
    prediction_closer_cases: 0,
    prediction_only_selected: 0,
    prediction_only_unselected: 0,
    tied_cases: 0
  };
  for (const item of analysis.cases) {
    if (item.set_comparison.closer === "label-closer") {
      counts.label_closer_cases += 1;
    } else if (item.set_comparison.closer === "prediction-closer") {
      counts.prediction_closer_cases += 1;
    } else if (item.set_comparison.closer === "tie") {
      counts.tied_cases += 1;
    }
    for (const candidate of item.candidates) {
      const key =
        `${candidate.origin.replace("-", "_")}_` +
        `${candidate.review_status}`;
      counts[key] += 1;
    }
  }
  return counts;
}

function deriveVisibleControlCounts(investigation) {
  const counts = {
    label_closer_cases: 0,
    prediction_closer_cases: 0,
    tied_cases: 0
  };
  for (const item of investigation.cases) {
    const key =
      item.comparison_class === "tie"
        ? "tied_cases"
        : `${item.comparison_class.replace("-", "_")}_cases`;
    counts[key] += 1;
  }
  /*
   * Consensus/side-only membership is deliberately not serialized. It is
   * mechanically inferable from the two comprehensive selections, so the
   * counts are frozen in the manifest without adding an explicit label field.
   */
  return {
    consensus_selected: 77,
    consensus_unselected: 14,
    label_closer_cases: counts.label_closer_cases,
    label_only_selected: 44,
    label_only_unselected: 5,
    prediction_closer_cases: counts.prediction_closer_cases,
    prediction_only_selected: 15,
    prediction_only_unselected: 30,
    tied_cases: counts.tied_cases
  };
}

function validateRankingCases(value) {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["cases", "schema_version"]) ||
    value.schema_version !== RANKING_CASES_SCHEMA ||
    !Array.isArray(value.cases) ||
    value.cases.length !== 28
  ) {
    throw new Error("Ranking cases structure is invalid.");
  }
  const caseIds = new Set();
  const candidateIds = new Set();
  let candidateCount = 0;
  for (const item of value.cases) {
    if (
      !isPlainRecord(item) ||
      !hasExactKeys(item, RANKING_CASE_FIELDS) ||
      !CASE_ID.test(item.case_id) ||
      item.snapshot_root !== `cases/${item.case_id}` ||
      !["label-closer", "prediction-closer", "tie"].includes(
        item.comparison_class
      ) ||
      caseIds.has(item.case_id) ||
      !Array.isArray(item.candidates) ||
      !Array.isArray(item.system_selection) ||
      !Array.isArray(item.correlated_comparative_review_selection)
    ) {
      throw new Error("Ranking case is invalid or duplicated.");
    }
    caseIds.add(item.case_id);
    const local = new Set();
    for (const candidate of item.candidates) {
      validateRankingCandidate(candidate);
      if (
        local.has(candidate.candidate_id) ||
        candidateIds.has(candidate.candidate_id)
      ) {
        throw new Error("Ranking candidate identity is duplicated.");
      }
      local.add(candidate.candidate_id);
      candidateIds.add(candidate.candidate_id);
      candidateCount += 1;
    }
    validateOrderedSelection(
      item.system_selection,
      local,
      item.candidates
        .filter((candidate) => candidate.system_selected)
        .map((candidate) => candidate.candidate_id),
      "system"
    );
    validateOrderedSelection(
      item.correlated_comparative_review_selection,
      local,
      item.candidates
        .filter(
          (candidate) =>
            candidate.correlated_comparative_review.selected
        )
        .sort(
          (left, right) =>
            left.correlated_comparative_review.selected_position -
            right.correlated_comparative_review.selected_position
        )
        .map((candidate) => candidate.candidate_id),
      "correlated review"
    );
  }
  if (candidateCount !== 185) {
    throw new Error("Ranking candidate coverage is incomplete.");
  }
}

function validateRankingCandidate(candidate) {
  if (
    !isPlainRecord(candidate) ||
    !hasExactKeys(candidate, RANKING_CANDIDATE_FIELDS) ||
    !CANDIDATE_ID.test(candidate.candidate_id) ||
    typeof candidate.system_selected !== "boolean" ||
    !isPlainRecord(candidate.file_metadata) ||
    !hasExactKeys(candidate.file_metadata, ["byte_count", "sha256"]) ||
    !Number.isSafeInteger(candidate.file_metadata.byte_count) ||
    candidate.file_metadata.byte_count < 0 ||
    !HASH.test(candidate.file_metadata.sha256)
  ) {
    throw new Error("Ranking candidate structure is invalid.");
  }
  validateRelativePath(candidate.path);
  const review = candidate.correlated_comparative_review;
  if (
    !isPlainRecord(review) ||
    !hasExactKeys(review, [
      "direct_source_paths",
      "rationale",
      "selected",
      "selected_position"
    ]) ||
    typeof review.selected !== "boolean" ||
    !Array.isArray(review.direct_source_paths) ||
    review.direct_source_paths.length > 20 ||
    review.direct_source_paths.some((item) => {
      try {
        validateRelativePath(item);
        return false;
      } catch {
        return true;
      }
    }) ||
    (review.selected
      ? !Number.isSafeInteger(review.selected_position) ||
        review.selected_position < 1 ||
        review.selected_position > 5 ||
        !boundedNullableText(review.rationale, 1500)
      : review.selected_position !== null ||
        review.rationale !== null ||
        review.direct_source_paths.length !== 0)
  ) {
    throw new Error("Correlated-review candidate evidence is invalid.");
  }
  const trace = candidate.production_time_trace;
  if (
    !isPlainRecord(trace) ||
    !hasExactKeys(trace, [
      "availability",
      "reasons",
      "score",
      "selection_stage",
      "signals",
      "unknowns"
    ]) ||
    trace.availability !== "unavailable" ||
    trace.score !== null ||
    trace.selection_stage !== "Unknown" ||
    !Array.isArray(trace.reasons) ||
    trace.reasons.length !== 0 ||
    !Array.isArray(trace.signals) ||
    trace.signals.length !== 0 ||
    !Array.isArray(trace.unknowns) ||
    trace.unknowns.length < 1 ||
    trace.unknowns.some((item) => !safeText(item, 1000))
  ) {
    throw new Error("Unavailable production trace was invented or altered.");
  }
}

function validateLabelCases(value) {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["cases", "schema_version"]) ||
    value.schema_version !== LABEL_CASES_SCHEMA ||
    !Array.isArray(value.cases) ||
    value.cases.length !== 4
  ) {
    throw new Error("Label review cases structure is invalid.");
  }
  const seen = new Set();
  for (const item of value.cases) {
    if (
      !isPlainRecord(item) ||
      !hasExactKeys(item, LABEL_CASE_FIELDS) ||
      !CASE_ID.test(item.case_id) ||
      item.snapshot_root !== `cases/${item.case_id}` ||
      seen.has(item.case_id)
    ) {
      throw new Error("Label review case is invalid or duplicated.");
    }
    seen.add(item.case_id);
  }
}

function validateLabelLikeResult(
  result,
  schema,
  commitmentField,
  commitment,
  review,
  root
) {
  if (
    !isPlainRecord(result) ||
    !hasExactKeys(result, [
      "cases",
      commitmentField,
      "projection_may_be_incomplete_acknowledged",
      "schema_version",
      "unsafe_links_excluded_acknowledged"
    ]) ||
    result.schema_version !== schema ||
    result[commitmentField] !== commitment ||
    result.unsafe_links_excluded_acknowledged !== true ||
    result.projection_may_be_incomplete_acknowledged !== true ||
    !Array.isArray(result.cases) ||
    result.cases.length !== review.cases.length
  ) {
    throw new Error("Phase-1 label result structure is invalid.");
  }
  assertDeepEqual(
    result.cases.map((item) => item.case_id),
    review.cases.map((item) => item.case_id),
    "Phase-1 case order differs from the canonical input."
  );
  for (const item of result.cases) {
    if (
      !isPlainRecord(item) ||
      !hasExactKeys(item, [
        "case_id",
        "outcome",
        "selections",
        "unknown_reason"
      ]) ||
      !CASE_ID.test(item.case_id) ||
      !["selection", "unknown"].includes(item.outcome) ||
      !Array.isArray(item.selections) ||
      item.selections.length > 5 ||
      typeof item.unknown_reason !== "string" ||
      Buffer.byteLength(item.unknown_reason, "utf8") > 1000 ||
      UNSAFE_DISPLAY.test(item.unknown_reason) ||
      (item.outcome === "unknown"
        ? item.selections.length !== 0 ||
          item.unknown_reason.length < 1
        : item.unknown_reason !== "")
    ) {
      throw new Error("Phase-1 case result is invalid.");
    }
    const selectedPaths = new Set();
    for (const selection of item.selections) {
      if (
        !isPlainRecord(selection) ||
        !hasExactKeys(selection, [
          "path",
          "rationale",
          "source_paths"
        ]) ||
        !safeText(selection.rationale, 1000) ||
        !Array.isArray(selection.source_paths) ||
        selection.source_paths.length < 1 ||
        selection.source_paths.length > 20
      ) {
        throw new Error("Phase-1 selection evidence is invalid.");
      }
      validateContainedSnapshotFile(root, item.case_id, selection.path);
      if (selectedPaths.has(selection.path)) {
        throw new Error("Phase-1 selected path is duplicated.");
      }
      selectedPaths.add(selection.path);
      const sources = new Set();
      for (const sourcePath of selection.source_paths) {
        validateContainedSnapshotFile(root, item.case_id, sourcePath);
        if (sources.has(sourcePath)) {
          throw new Error("Phase-1 source path is duplicated.");
        }
        sources.add(sourcePath);
      }
    }
  }
}

function validateHypothesis(value, index, knownCases) {
  const fields = [
    "control_case_ids",
    "counterexample_case_ids",
    "expected_direction",
    "falsifying_evidence",
    "generic_mechanism",
    "hypothesis_id",
    "production_signal",
    "regression_risks",
    "selection_stage",
    "smallest_generic_experiment",
    "supporting_case_ids",
    "unknowns"
  ];
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, fields) ||
    value.hypothesis_id !== `hypothesis-${index + 1}` ||
    ![
      "base-contract-score",
      "manifest-declaration-signal",
      "entrypoint-syntax-signal",
      "local-import-fan-in",
      "literal-local-reference",
      "path-depth-penalty",
      "low-value-path-penalty",
      "test-path-penalty",
      "workflow-path-penalty",
      "unknown-unavailable"
    ].includes(value.production_signal) ||
    ![
      "rank-score-aggregation",
      "rank-sort-tiebreak",
      "curation-contract-selection",
      "curation-declaration-selection",
      "curation-entrypoint-selection",
      "curation-fan-in-selection",
      "curation-reference-selection",
      "final-five-truncation",
      "unknown-unavailable"
    ].includes(value.selection_stage) ||
    !safeText(value.generic_mechanism, 1500) ||
    !safeText(value.falsifying_evidence, 1500) ||
    !safeText(value.smallest_generic_experiment, 1500)
  ) {
    throw new Error("Ranking hypothesis structure is invalid.");
  }
  for (const text of [
    value.generic_mechanism,
    value.falsifying_evidence,
    value.smallest_generic_experiment
  ]) {
    if (REPOSITORY_RULE_TEXT.test(text)) {
      throw new Error("Ranking hypothesis contains a specific or tuning rule.");
    }
  }
  validateCaseIdArray(
    value.supporting_case_ids,
    2,
    knownCases,
    "supporting"
  );
  validateCaseIdArray(
    value.counterexample_case_ids,
    1,
    knownCases,
    "counterexample"
  );
  validateCaseIdArray(
    value.control_case_ids,
    2,
    knownCases,
    "control"
  );
  const allCaseIds = [
    ...value.supporting_case_ids,
    ...value.counterexample_case_ids,
    ...value.control_case_ids
  ];
  if (new Set(allCaseIds).size !== allCaseIds.length) {
    throw new Error("Hypothesis evidence roles must not overlap.");
  }
  if (
    !isPlainRecord(value.expected_direction) ||
    !hasExactKeys(value.expected_direction, ["precision", "recall"]) ||
    !["increase", "decrease", "no-clear-direction", "unknown"].includes(
      value.expected_direction.precision
    ) ||
    !["increase", "decrease", "no-clear-direction", "unknown"].includes(
      value.expected_direction.recall
    )
  ) {
    throw new Error("Hypothesis expected direction is invalid.");
  }
  validateTextList(value.regression_risks, 1, 5, 1500);
  validateTextList(value.unknowns, 1, 10, 1500);
}

function rejectedHypotheses(repoRoot) {
  const recordPath = containedFile(repoRoot, "docs/v1-run-d2b.md");
  const bytes = readStableRegularFile(recordPath, 512 * 1024);
  return {
    schema_version: "kanon-d2d-rejected-hypotheses-v1",
    experiments: [
      {
        experiment_id: "d2b-generic-ranking-experiment",
        status: "falsified",
        preparation_record_sha256: sha256(bytes),
        production_commit: "162f629867c641a12c95d70c9a83c7d360aa38ca",
        frozen_report_sha256:
          "e1c69f8f10cda0b64f18e16b230b10e290402867277072598146c183fd95034d",
        generic_mechanism:
          "A generic declaration and entrypoint-evidence experiment was tested under the paired protocol.",
        bounded_result:
          "The experiment did not meet its frozen paired acceptance gate and is rejected as a generic release candidate.",
        prohibited_reuse:
          "Do not derive repository-specific corrections, case rules, or evaluation-answer tuning from this record."
      }
    ]
  };
}

function validateRejectedLedger(value) {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["experiments", "schema_version"]) ||
    value.schema_version !== "kanon-d2d-rejected-hypotheses-v1" ||
    !Array.isArray(value.experiments) ||
    value.experiments.length !== 1
  ) {
    throw new Error("Rejected-hypothesis ledger structure is invalid.");
  }
  const item = value.experiments[0];
  if (
    !isPlainRecord(item) ||
    !hasExactKeys(item, [
      "bounded_result",
      "experiment_id",
      "frozen_report_sha256",
      "generic_mechanism",
      "preparation_record_sha256",
      "production_commit",
      "prohibited_reuse",
      "status"
    ]) ||
    item.experiment_id !== "d2b-generic-ranking-experiment" ||
    item.status !== "falsified" ||
    !HASH.test(item.frozen_report_sha256) ||
    !HASH.test(item.preparation_record_sha256) ||
    !/^[0-9a-f]{40}$/.test(item.production_commit) ||
    ["bounded_result", "generic_mechanism", "prohibited_reuse"].some(
      (key) => !safeText(item[key], 1500)
    )
  ) {
    throw new Error("Rejected-hypothesis ledger entry is invalid.");
  }
}

function validatePreparation(value) {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, PREPARATION_FIELDS) ||
    value.schema_version !== "kanon-d2d-preparation-v1" ||
    value.starting_head !==
      "7fdf7d75e071e9bcfa9679de8290e19a1fb2c78e" ||
    value.production_artifact_sha256 !==
      "89923d2d6727445a86ba831331c4b6bdc031c399f81ce2d98e3f42815b3b3f6a" ||
    value.d2a_report_sha256 !==
      "747b4f1590eda9787c87aae2e25853b8e1e8fa04893e2359eedf7a6050b7acb3" ||
    value.development_corpus_sha256 !==
      "4f768f151885d26de48fe0744cafc2402a27aca61f7f049aac166309891e0c92" ||
    value.prior_review_result_sha256 !==
      "838ebcccccc7ae9a8df24e631a5ecd48718fa150d75d6e1648434b5308bd4c66" ||
    value.comparative_result_sha256 !==
      "f8b1e7a612e505e7ef3aa3d815f80e0ed85f53bb203608882af3286364fd5def" ||
    value.comparative_analysis_sha256 !==
      "de311bbef99ed43eca4ef71aa6eafc2f41317ad1ce13b5d09dedc52593e9fbac" ||
    value.comparative_packet_sha256 !==
      "2850b73d1095fb6dd58e4430eaf0a961a97d1441dfad491a5374f8393dbd222a" ||
    value.comparative_packet_manifest_sha256 !==
      "fc559d607c3facd39b6a4801005335dd98c47131573951bdd7f4a979ea792621" ||
    value.comparative_snapshot_tree_sha256 !==
      "0368ca4cbc6abd1679d6cabece7c34719edd07964479efa6e28a5c5d0cbdd82e" ||
    !HASH.test(value.prior_unblinded_analysis_sha256) ||
    !HASH.test(value.preparation_seed)
  ) {
    throw new Error("D.2D preparation bindings are invalid.");
  }
  for (const key of PREPARATION_FIELDS.filter((item) =>
    item.endsWith("_sha256")
  )) {
    if (!HASH.test(value[key])) {
      throw new Error("D.2D preparation hash is invalid.");
    }
  }
  for (const key of PREPARATION_FIELDS.filter((item) =>
    [
      "d2a_report",
      "development_corpus",
      "prior_review_result",
      "prior_unblinded_analysis",
      "comparative_result",
      "comparative_analysis"
    ].includes(item)
  )) {
    validateRelativePath(value[key]);
  }
}

function validateManifest(value, schema) {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, MANIFEST_FIELDS) ||
    value.schema_version !== schema ||
    !Number.isSafeInteger(value.case_count) ||
    value.case_count < 1 ||
    value.case_count > D2D_LIMITS.max_cases ||
    !isPlainRecord(value.input_commitments) ||
    !HASH.test(value.packet_hash) ||
    !isPlainRecord(value.resource_counts) ||
    !isPlainRecord(value.resource_limits) ||
    canonicalJson(value.resource_limits) !==
      canonicalJson(D2D_LIMITS)
  ) {
    throw new Error("D.2D manifest structure is invalid.");
  }
}

function limitsFor(overrides) {
  const value = Object.freeze({ ...D2D_LIMITS, ...(overrides || {}) });
  if (
    Object.keys(value).some(
      (key) =>
        !Object.hasOwn(D2D_LIMITS, key) ||
        !Number.isSafeInteger(value[key]) ||
        value[key] < 1 ||
        value[key] > D2D_LIMITS[key]
    )
  ) {
    throw new Error("D.2D resource limits cannot be weakened.");
  }
  return value;
}

function resourceCountsFor(
  entries,
  snapshots,
  sources,
  rejectedLinks,
  extra
) {
  return {
    committed_bytes: entries.reduce(
      (total, entry) => total + (entry.byte_count || 0),
      0
    ),
    committed_directories: entries.filter(
      (entry) => entry.type === "directory"
    ).length,
    committed_files: entries.filter(
      (entry) => entry.type === "file"
    ).length,
    snapshot_bytes: snapshots.reduce(
      (total, entry) => total + (entry.byte_count || 0),
      0
    ),
    snapshot_directories: snapshots.filter(
      (entry) => entry.type === "directory"
    ).length,
    snapshot_files: snapshots.filter(
      (entry) => entry.type === "file"
    ).length,
    snapshot_links_rejected_during_copy: rejectedLinks,
    source_bytes: sources.reduce(
      (total, entry) => total + (entry.byte_count || 0),
      0
    ),
    source_files: sources.filter((entry) => entry.type === "file").length,
    ...extra
  };
}

function docketCommitment(
  schema,
  inputCommitments,
  resourceCounts,
  resourceLimits,
  entries
) {
  return sha256(
    jsonBytes({
      schema_version: schema,
      input_commitments: inputCommitments,
      resource_counts: resourceCounts,
      resource_limits: resourceLimits,
      entries
    })
  );
}

function validateControlledFiles(root, relativePaths) {
  for (const relativePath of relativePaths) {
    const selected = resolveContainedPath(root, relativePath, {
      type: "file"
    });
    if (
      !selected.ok ||
      selected.stat.nlink !== 1 ||
      (selected.stat.mode & 0o333) !== 0
    ) {
      throw new Error(
        "Docket controlled input is writable, executable, or indirect."
      );
    }
  }
}

function validateReadOnlyTree(root, relativePath) {
  const selected = containedDirectory(root, relativePath);
  if ((fs.lstatSync(selected).mode & 0o222) !== 0) {
    throw new Error("Docket input tree is writable.");
  }
  collectAndStableVerify(selected, relativePath);
}

function collectAndStableVerify(root, prefix) {
  const before = collectTreeEntries(root, prefix, {
    requireReadOnly: true
  });
  for (const entry of before) {
    const absolute = path.join(path.dirname(root), entry.path);
    if (entry.type === "file") {
      const bytes = readStableRegularFile(
        absolute,
        D2D_LIMITS.max_file_bytes
      );
      if (bytes.length !== entry.byte_count || sha256(bytes) !== entry.sha256) {
        throw new Error("Docket file changed during stable validation.");
      }
    }
  }
  const after = collectTreeEntries(root, prefix, {
    requireReadOnly: true
  });
  assertDeepEqual(before, after, "Docket tree changed during validation.");
  return before;
}

export function validateDocketOutput(root, requested, resultName) {
  const allowed = requested === undefined ? [] : requested;
  if (
    !Array.isArray(allowed) ||
    allowed.length > 1 ||
    allowed.some((name) => name !== resultName)
  ) {
    throw new Error("Docket allowed output set is invalid.");
  }
  const output = containedDirectory(root, "output");
  const entries = fs.readdirSync(output, { withFileTypes: true });
  assertDeepEqual(
    entries.map((entry) => entry.name).sort(compareText),
    [...allowed].sort(compareText),
    "Docket output differs from the exact single-output set."
  );
  for (const entry of entries) {
    if (!entry.isFile()) {
      throw new Error("Docket output contains an indirect or special entry.");
    }
    const selected = resolveContainedPath(output, entry.name, {
      type: "file"
    });
    if (
      !selected.ok ||
      selected.stat.nlink !== 1 ||
      selected.stat.size > D2D_LIMITS.max_result_bytes
    ) {
      throw new Error("Docket result is indirect, hard-linked, or oversized.");
    }
  }
  if ((fs.lstatSync(output).mode & 0o200) === 0) {
    throw new Error("Docket output is not writable.");
  }
  return [...allowed];
}

export function assertIsolatedOutputRoots(...roots) {
  if (
    roots.length < 2 ||
    roots.some((item) => typeof item !== "string" || item.length < 1)
  ) {
    throw new Error("At least two output roots are required.");
  }
  const normalized = roots.map((item) =>
    path.resolve(item).normalize("NFC")
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("Review output roots must be isolated.");
  }
  return true;
}

function assertRootLayout(root, expected, label) {
  const stat = fs.lstatSync(root);
  if ((stat.mode & 0o222) !== 0) {
    throw new Error(`${label} inputs are not root-read-only.`);
  }
  const entries = fs.readdirSync(root, { withFileTypes: true });
  assertDeepEqual(
    entries.map((entry) => entry.name).sort(compareText),
    expected,
    `${label} root entries differ from the strict layout.`
  );
  for (const entry of entries) {
    if (!entry.isFile() && !entry.isDirectory()) {
      throw new Error(`${label} root contains an indirect entry.`);
    }
  }
}

function bindRankingCandidates(root, investigation, snapshotEntries) {
  const files = new Map(
    snapshotEntries
      .filter((entry) => entry.type === "file")
      .map((entry) => [entry.path, entry])
  );
  for (const item of investigation.cases) {
    for (const candidate of item.candidates) {
      const entry = files.get(
        `${item.snapshot_root}/${candidate.path}`
      );
      if (
        !entry ||
        entry.byte_count !== candidate.file_metadata.byte_count ||
        entry.sha256 !== candidate.file_metadata.sha256
      ) {
        throw new Error("Ranking candidate does not bind a snapshot file.");
      }
      for (const sourcePath of
        candidate.correlated_comparative_review.direct_source_paths) {
        if (!files.has(`${item.snapshot_root}/${sourcePath}`)) {
          throw new Error(
            "Correlated-review source does not bind a snapshot file."
          );
        }
      }
    }
  }
}

function containedDirectory(root, relativePath) {
  const selected = resolveContainedPath(root, relativePath, {
    type: "directory"
  });
  if (!selected.ok) {
    throw new Error(`Unsafe input directory: ${selected.reason}`);
  }
  return selected.path;
}

function readStableJson(file, maximum, label) {
  return parseJson(readStableRegularFile(file, maximum), label);
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

function refuseExistingPath(target) {
  try {
    fs.lstatSync(target);
    throw new Error("Docket destination appeared during construction.");
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

function candidateIdForPath(candidates, selectedPath) {
  const candidate = candidates.find((item) => item.path === selectedPath);
  if (!candidate) {
    throw new Error("Selected path is absent from the union candidates.");
  }
  return candidate.candidate_id;
}

function entryHash(entries, name) {
  const selected = entries.find((entry) => entry.path === name);
  if (!selected || selected.type !== "file") {
    throw new Error(`Committed file is missing: ${name}`);
  }
  return selected.sha256;
}

function validateOrderedSelection(value, known, expectedMembers, label) {
  if (
    value.length > 5 ||
    new Set(value).size !== value.length ||
    value.some((item) => !known.has(item)) ||
    value.length !== expectedMembers.length ||
    value.some((item) => !expectedMembers.includes(item))
  ) {
    throw new Error(`Ranking ${label} selection is invalid.`);
  }
}

function validateContainedSnapshotFile(root, caseId, relativePath) {
  validateRelativePath(relativePath);
  validateSnapshotPath(relativePath);
  const selected = resolveContainedPath(
    root,
    `cases/${caseId}/${relativePath}`,
    { type: "file" }
  );
  if (
    !selected.ok ||
    selected.stat.nlink !== 1 ||
    (selected.stat.mode & 0o333) !== 0
  ) {
    throw new Error("Selected path is not a contained safe snapshot file.");
  }
}

function validateCaseIdArray(value, minimum, knownCases, label) {
  if (
    !Array.isArray(value) ||
    value.length < minimum ||
    value.length > 28 ||
    new Set(value).size !== value.length ||
    value.some((item) => !knownCases.has(item))
  ) {
    throw new Error(`Hypothesis ${label} cases are invalid.`);
  }
}

function validateTextList(value, minimum, maximum, bytes) {
  if (
    !Array.isArray(value) ||
    value.length < minimum ||
    value.length > maximum ||
    new Set(value).size !== value.length ||
    value.some((item) => !safeText(item, bytes))
  ) {
    throw new Error("Hypothesis bounded text list is invalid.");
  }
}

function safeText(value, maximumBytes) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Buffer.byteLength(value, "utf8") <= maximumBytes &&
    SAFE_TEXT.test(value)
  );
}

function boundedNullableText(value, maximumBytes) {
  return value === null || safeText(value, maximumBytes);
}

function keyedIdentity(seed, domain, value, length) {
  return crypto
    .createHmac("sha256", Buffer.from(seed, "hex"))
    .update(`${domain}\u0000${value}`, "utf8")
    .digest("hex")
    .slice(0, length);
}

function validatePerson(person, role, inputCommitment) {
  const fields = [
    "attestation",
    "conflict_declaration",
    "date",
    "frozen_input_commitment",
    "independence_declaration",
    "legal_or_professional_name",
    "result_commitment",
    "role"
  ];
  if (
    !isPlainRecord(person) ||
    !hasExactKeys(person, fields) ||
    person.role !== role ||
    !safeText(person.legal_or_professional_name, 200) ||
    person.legal_or_professional_name.trim().length < 2 ||
    !safeText(person.conflict_declaration, 1000) ||
    !safeText(person.independence_declaration, 1000) ||
    !safeText(person.attestation, 1000) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(person.date) ||
    !isCalendarDate(person.date) ||
    !HASH.test(person.frozen_input_commitment) ||
    (inputCommitment !== undefined &&
      person.frozen_input_commitment !== inputCommitment) ||
    (person.result_commitment !== null &&
      !HASH.test(person.result_commitment))
  ) {
    throw new Error(`Governance ${role} record is invalid.`);
  }
}

function isCalendarDate(value) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function readGovernanceValue(value) {
  if (typeof value === "string") {
    return readStableJson(
      path.resolve(value),
      64 * 1024,
      "governance record"
    );
  }
  return value;
}

function materializeReadOnlyClone(sourceRoot, destination, resultName) {
  const output = prepareAbsentOutput(destination);
  const stagingName =
    `.${output.name}.staging-${process.pid}-${crypto.randomUUID()}`;
  const stagingRoot = path.join(output.parent, stagingName);
  let completed = false;
  try {
    const state = newCopyState(D2D_LIMITS, Date.now());
    copySnapshot(sourceRoot, stagingRoot, state, "label-instance");
    makeTreeReadOnly(stagingRoot);
    fs.chmodSync(path.join(stagingRoot, "output"), 0o700);
    refuseExistingPath(output.path);
    fs.chmodSync(stagingRoot, 0o700);
    fs.renameSync(stagingRoot, output.path);
    fs.chmodSync(output.path, 0o500);
    completed = true;
    const validation = validateLabelDocket(output.path);
    if (resultName !== PHASE1_RESULT_FILE) {
      throw new Error("Unsupported isolated result filename.");
    }
    return validation;
  } finally {
    if (!completed && fs.existsSync(stagingRoot)) {
      cleanupOwnedStaging(output.parent, stagingName);
    }
  }
}

function validateOriginalLabelMap(value, cases) {
  if (!isPlainRecord(value)) {
    throw new Error("Frozen original label map is required for Phase 2.");
  }
  assertDeepEqual(
    Object.keys(value).sort(compareText),
    cases.map((item) => item.case_id).sort(compareText),
    "Frozen original label map case inventory differs."
  );
  for (const item of Object.values(value)) {
    if (
      !isPlainRecord(item) ||
      !hasExactKeys(item, ["rationale", "selections"]) ||
      !safeText(item.rationale, 2000) ||
      !Array.isArray(item.selections) ||
      item.selections.length > 5
    ) {
      throw new Error("Frozen original label evidence is invalid.");
    }
    for (const selected of item.selections) {
      if (
        !isPlainRecord(selected) ||
        !hasExactKeys(selected, [
          "path",
          "rationale",
          "source_paths"
        ]) ||
        !safeText(selected.rationale, 1000) ||
        !Array.isArray(selected.source_paths) ||
        selected.source_paths.length < 1
      ) {
        throw new Error("Frozen original label selection is invalid.");
      }
      validateRelativePath(selected.path);
      for (const sourcePath of selected.source_paths) {
        validateRelativePath(sourcePath);
      }
    }
  }
}
