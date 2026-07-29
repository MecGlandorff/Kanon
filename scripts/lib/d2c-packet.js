import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveContainedPath } from "../../src/path-security.js";
import { repositoryCacheName } from "./eval-corpus/checkout.js";
import { validateCorpus } from "./eval-corpus/schema.js";

export const PACKET_SCHEMA = "kanon-d2c-packet-v1";
export const ADJUDICATION_SCHEMA = "kanon-d2c-adjudication-v1";
export const ALLOWED_DISPOSITIONS = Object.freeze([
  "clearly-defensible-important",
  "clearly-unsupported",
  "ambiguous-equivalent",
  "insufficient-label-provenance",
  "weak-ranking-signal",
  "unknown"
]);
export const RESOURCE_LIMITS = Object.freeze({
  max_cases: 50,
  max_items: 1000,
  max_files_per_case: 100_000,
  max_files_total: 250_000,
  max_file_bytes: 128 * 1024 * 1024,
  max_total_bytes: 1024 * 1024 * 1024,
  max_directory_entries: 400_000,
  max_entries_per_directory: 100_000,
  max_elapsed_ms: 300_000
});

const PREPARATION_FIELDS = [
  "corpus_manifest",
  "corpus_manifest_sha256",
  "preparation_seed",
  "raw_report",
  "raw_report_sha256",
  "recovery_head",
  "restored_artifact_sha256",
  "schema_version"
];
const ITEM_FIELDS = [
  "case_id",
  "file_metadata",
  "item_id",
  "path",
  "rationale",
  "reviewer_disposition",
  "snapshot_root",
  "source_paths",
  "unknown_option"
];
const FILE_METADATA_FIELDS = ["byte_count", "sha256"];
const MANIFEST_FIELDS = [
  "case_count",
  "input_commitments",
  "item_count",
  "packet_hash",
  "resource_counts",
  "schema_version",
  "seed_commitment"
];
const INPUT_COMMITMENT_FIELDS = [
  "adjudication_schema_sha256",
  "canonical_input_sha256",
  "case_snapshots_sha256",
  "corpus_manifest_sha256",
  "raw_report_sha256",
  "recovery_head",
  "restored_artifact_sha256",
  "review_items_sha256",
  "reviewer_prompt_sha256"
];
const RESOURCE_COUNT_FIELDS = [
  "committed_bytes",
  "committed_directories",
  "committed_files",
  "snapshot_bytes",
  "snapshot_directories",
  "snapshot_files",
  "snapshot_links_rejected"
];
const CONTROLLED_FILES = [
  "README-FIRST.txt",
  "adjudication.schema.json",
  "review-items.json"
];
const UNSAFE_DISPLAY =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const FORBIDDEN_ITEM_KEYS = new Set([
  "tp",
  "fp",
  "fn",
  "predicted_only",
  "label_only",
  "expected",
  "actual",
  "correct",
  "incorrect",
  "miss",
  "false_positive",
  "false_negative",
  "score",
  "rank",
  "relevance",
  "label_rationale",
  "selected_by_kanon",
  "selected_by_label",
  "arm",
  "answer",
  "status",
  "mapping"
]);
const FORBIDDEN_SNAPSHOT_BASENAMES = new Set([
  "answer-map.json",
  "arm-map.json",
  "evaluation-report.json",
  "label.json",
  "labels.json",
  "mapping.json",
  "predictions.json",
  "prior-predictions.json",
  "raw-report.json",
  "status-map.json",
  "status-mapping.json"
]);

/**
 * Build a deterministic, status-masked packet in an absent output path.
 *
 * @param {{
 *   repoRoot: string,
 *   outputRoot: string,
 *   cacheRoot: string,
 *   preparationPath?: string,
 *   promptPath?: string,
 *   schemaPath?: string,
 *   limits?: typeof RESOURCE_LIMITS
 * }} options
 */
export function buildPacket(options) {
  const startedAt = Date.now();
  const limits = Object.freeze({
    ...RESOURCE_LIMITS,
    ...(options.limits || {})
  });
  const repoRoot = canonicalDirectory(options.repoRoot, "repository root");
  const cacheRoot = canonicalDirectory(options.cacheRoot, "cache root");
  const output = prepareAbsentOutput(options.outputRoot);
  const preparationPath = containedFile(
    repoRoot,
    options.preparationPath || "eval/d2c/preparation.json"
  );
  const promptPath = containedFile(
    repoRoot,
    options.promptPath || "eval/d2c/reviewer-prompt.txt"
  );
  const schemaPath = containedFile(
    repoRoot,
    options.schemaPath || "eval/d2c/adjudication.schema.json"
  );
  const preparation = readJsonBounded(preparationPath, 64 * 1024);
  validatePreparation(preparation);
  const reportPath = containedFile(repoRoot, preparation.raw_report);
  const corpusPath = containedFile(repoRoot, preparation.corpus_manifest);
  const reportBytes = readBytesBounded(reportPath, 4 * 1024 * 1024);
  const corpusBytes = readBytesBounded(corpusPath, 4 * 1024 * 1024);
  assertHash(
    reportBytes,
    preparation.raw_report_sha256,
    "raw report"
  );
  assertHash(
    corpusBytes,
    preparation.corpus_manifest_sha256,
    "corpus manifest"
  );
  const report = parseJson(reportBytes, "raw report");
  const corpus = parseJson(corpusBytes, "corpus manifest");
  validateCorpus(corpus);
  Object.defineProperty(corpus, "_source_bytes", {
    enumerable: false,
    value: corpusBytes
  });
  if (
    report?.corpus?.manifest_sha256 !==
    preparation.corpus_manifest_sha256
  ) {
    throw new Error("Raw report corpus commitment mismatch.");
  }
  const canonicalInput = canonicalInputIdentity(preparation);
  const records = deriveMaskedRecords(report, corpus);
  if (records.length < 1 || records.length > limits.max_items) {
    throw new Error("Disputed-item count is outside the packet limit.");
  }
  const representedCases = new Set(records.map((record) => record.case_key));
  if (
    representedCases.size < 1 ||
    representedCases.size > limits.max_cases
  ) {
    throw new Error("Represented-case count is outside the packet limit.");
  }
  const identities = assignOpaqueIdentities(
    records,
    preparation.preparation_seed,
    canonicalInput
  );
  const promptBytes = readBytesBounded(promptPath, 128 * 1024);
  const schemaBytes = readBytesBounded(schemaPath, 256 * 1024);
  validateSchemaDocument(parseJson(schemaBytes, "adjudication schema"));

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
    const copiedCases = new Set();
    const corpusById = new Map(
      corpus.cases.map((item) => [item.id, item])
    );
    for (const record of identities) {
      if (copiedCases.has(record.case_key)) {
        continue;
      }
      const corpusCase = corpusById.get(record.case_key);
      if (!corpusCase) {
        throw new Error("Canonical case disappeared during construction.");
      }
      const cacheName = repositoryCacheName(
        corpusCase.repository,
        corpusCase.revision
      );
      const source = resolveContainedPath(cacheRoot, cacheName, {
        type: "directory"
      });
      if (!source.ok) {
        throw new Error(
          `Immutable snapshot is unavailable or unsafe: ${source.reason}`
        );
      }
      const destination = path.join(casesRoot, record.case_id);
      copySnapshot(
        source.path,
        destination,
        snapshotState,
        record.case_key
      );
      copiedCases.add(record.case_key);
    }

    const snapshotEntries = collectTreeEntries(casesRoot, "cases");
    const metadataByPacketPath = new Map(
      snapshotEntries
        .filter((entry) => entry.type === "file")
        .map((entry) => [entry.path, entry])
    );
    const reviewItems = identities.map((record) => {
      const snapshotRoot = `cases/${record.case_id}`;
      const packetPath = `${snapshotRoot}/${record.path}`;
      const metadata = metadataByPacketPath.get(packetPath);
      if (!metadata) {
        throw new Error(
          "A disputed path is not a regular file in its immutable snapshot."
        );
      }
      return {
        case_id: record.case_id,
        item_id: record.item_id,
        path: record.path,
        snapshot_root: snapshotRoot,
        file_metadata: {
          byte_count: metadata.byte_count,
          sha256: metadata.sha256
        },
        reviewer_disposition: null,
        rationale: "",
        source_paths: [],
        unknown_option: "unknown"
      };
    });
    validateReviewTemplate(reviewItems, limits);
    const reviewDocument = {
      schema_version: ADJUDICATION_SCHEMA,
      items: reviewItems
    };
    const reviewBytes = jsonBytes(reviewDocument);
    writeNewFile(
      path.join(stagingRoot, "README-FIRST.txt"),
      promptBytes
    );
    writeNewFile(
      path.join(stagingRoot, "adjudication.schema.json"),
      schemaBytes
    );
    writeNewFile(
      path.join(stagingRoot, "review-items.json"),
      reviewBytes
    );

    const controlledEntries = CONTROLLED_FILES.map((relativePath) =>
      fileEntry(stagingRoot, relativePath)
    );
    const committedEntries = [
      ...controlledEntries,
      ...snapshotEntries
    ].sort(compareEntries);
    const seedCommitment = sha256(
      Buffer.from(preparation.preparation_seed, "hex")
    );
    const inputCommitments = {
      recovery_head: preparation.recovery_head,
      restored_artifact_sha256:
        preparation.restored_artifact_sha256,
      raw_report_sha256: preparation.raw_report_sha256,
      corpus_manifest_sha256: preparation.corpus_manifest_sha256,
      canonical_input_sha256: canonicalInput,
      reviewer_prompt_sha256: sha256(promptBytes),
      adjudication_schema_sha256: sha256(schemaBytes),
      review_items_sha256: sha256(reviewBytes),
      case_snapshots_sha256: treeCommitment(snapshotEntries)
    };
    const packetHash = sha256(
      Buffer.from(
        canonicalJson({
          schema_version: PACKET_SCHEMA,
          seed_commitment: seedCommitment,
          input_commitments: inputCommitments,
          construction_resource_counts: {
            snapshot_links_rejected: snapshotState.rejectedLinks
          },
          entries: committedEntries
        })
      )
    );
    const resourceCounts = {
      snapshot_files: snapshotState.fileCount,
      snapshot_directories: snapshotState.directoryCount,
      snapshot_bytes: snapshotState.totalBytes,
      snapshot_links_rejected: snapshotState.rejectedLinks,
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
    const manifest = {
      schema_version: PACKET_SCHEMA,
      item_count: reviewItems.length,
      case_count: copiedCases.size,
      input_commitments: inputCommitments,
      seed_commitment: seedCommitment,
      packet_hash: packetHash,
      resource_counts: resourceCounts
    };
    validateManifest(manifest);
    writeNewFile(
      path.join(stagingRoot, "packet-manifest.json"),
      jsonBytes(manifest)
    );
    makePacketReadOnly(stagingRoot);
    fs.renameSync(stagingRoot, output.path);
    fs.chmodSync(output.path, 0o500);
    completed = true;
    const validation = validatePacket(output.path);
    return {
      ...validation,
      reviewer_command: reviewerCommand(validation.packet_root),
      resource_limits: limits
    };
  } finally {
    if (!completed) {
      cleanupOwnedStaging(output.parent, stagingName);
    }
  }
}

/**
 * Validate packet structure, commitments, containment, permissions, and
 * masking without reading repository file content as instructions.
 *
 * @param {string} packetRoot
 */
export function validatePacket(packetRoot) {
  const root = canonicalDirectory(packetRoot, "packet root");
  const rootEntries = fs.readdirSync(root, { withFileTypes: true });
  const rootNames = rootEntries.map((entry) => entry.name).sort();
  assertDeepEqual(rootNames, [
    "README-FIRST.txt",
    "adjudication.schema.json",
    "cases",
    "output",
    "packet-manifest.json",
    "review-items.json"
  ], "Packet root entries differ from the strict layout.");
  for (const entry of rootEntries) {
    if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) {
      throw new Error("Packet root contains a link or special file.");
    }
  }
  const output = resolveContainedPath(root, "output", {
    type: "directory"
  });
  if (!output.ok || fs.readdirSync(output.path).length !== 0) {
    throw new Error("Packet output directory is unsafe or nonempty.");
  }
  if ((fs.statSync(output.path).mode & 0o200) === 0) {
    throw new Error("Packet output directory is not writable.");
  }
  const cases = resolveContainedPath(root, "cases", {
    type: "directory"
  });
  if (!cases.ok) {
    throw new Error("Packet cases directory is unsafe.");
  }
  if (
    (fs.statSync(root).mode & 0o222) !== 0 ||
    (cases.stat.mode & 0o222) !== 0
  ) {
    throw new Error("Packet inputs are not read-only.");
  }
  for (const relativePath of [
    "README-FIRST.txt",
    "adjudication.schema.json",
    "packet-manifest.json",
    "review-items.json"
  ]) {
    const controlled = resolveContainedPath(root, relativePath, {
      type: "file"
    });
    if (!controlled.ok || (controlled.stat.mode & 0o222) !== 0) {
      throw new Error("Controlled packet input is unsafe or writable.");
    }
  }
  const manifest = readJsonBounded(
    containedFile(root, "packet-manifest.json"),
    256 * 1024
  );
  validateManifest(manifest);
  validateSchemaDocument(
    readJsonBounded(
      containedFile(root, "adjudication.schema.json"),
      256 * 1024
    )
  );
  const review = readJsonBounded(
    containedFile(root, "review-items.json"),
    4 * 1024 * 1024
  );
  if (
    !isPlainRecord(review) ||
    !hasExactKeys(review, ["items", "schema_version"]) ||
    review.schema_version !== ADJUDICATION_SCHEMA ||
    !Array.isArray(review.items)
  ) {
    throw new Error("Review-item document has invalid structure.");
  }
  validateReviewTemplate(review.items, RESOURCE_LIMITS);
  if (
    review.items.length !== manifest.item_count ||
    new Set(review.items.map((item) => item.case_id)).size !==
      manifest.case_count
  ) {
    throw new Error("Packet counts do not match review items.");
  }
  const caseNames = fs.readdirSync(cases.path).sort();
  const expectedCases = Array.from(
    new Set(review.items.map((item) => item.case_id))
  ).sort();
  assertDeepEqual(
    caseNames,
    expectedCases,
    "Case directories do not match review items."
  );
  const snapshotEntries = collectTreeEntries(cases.path, "cases", {
    requireReadOnly: true
  });
  const snapshotFiles = new Map(
    snapshotEntries
      .filter((entry) => entry.type === "file")
      .map((entry) => [entry.path, entry])
  );
  for (const item of review.items) {
    const entry = snapshotFiles.get(
      `${item.snapshot_root}/${item.path}`
    );
    if (
      !entry ||
      entry.byte_count !== item.file_metadata.byte_count ||
      entry.sha256 !== item.file_metadata.sha256
    ) {
      throw new Error("Review-item metadata does not bind its snapshot file.");
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
    adjudication_schema_sha256:
      controlledEntries.find(
        (entry) => entry.path === "adjudication.schema.json"
      ).sha256,
    review_items_sha256:
      controlledEntries.find(
        (entry) => entry.path === "review-items.json"
      ).sha256,
    case_snapshots_sha256: treeCommitment(snapshotEntries)
  };
  assertDeepEqual(
    manifest.input_commitments,
    expectedInputCommitments,
    "Packet input commitments do not match packet bytes."
  );
  const packetHash = sha256(
    Buffer.from(
      canonicalJson({
        schema_version: PACKET_SCHEMA,
        seed_commitment: manifest.seed_commitment,
        input_commitments: manifest.input_commitments,
        construction_resource_counts: {
          snapshot_links_rejected:
            manifest.resource_counts.snapshot_links_rejected
        },
        entries: committedEntries
      })
    )
  );
  if (packetHash !== manifest.packet_hash) {
    throw new Error("Packet commitment mismatch.");
  }
  const counts = {
    snapshot_files: snapshotEntries.filter(
      (entry) => entry.type === "file"
    ).length,
    snapshot_directories: snapshotEntries.filter(
      (entry) => entry.type === "directory"
    ).length,
    snapshot_bytes: snapshotEntries.reduce(
      (total, entry) => total + (entry.byte_count || 0),
      0
    ),
    snapshot_links_rejected:
      manifest.resource_counts.snapshot_links_rejected,
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
    "Packet resource counts do not match packet bytes."
  );
  validateNoSensitiveSnapshotNames(snapshotEntries);
  return {
    packet_root: root,
    packet_manifest_sha256: sha256(
      fs.readFileSync(path.join(root, "packet-manifest.json"))
    ),
    packet_hash: manifest.packet_hash,
    reviewer_prompt_sha256:
      manifest.input_commitments.reviewer_prompt_sha256,
    case_count: manifest.case_count,
    item_count: manifest.item_count,
    packet_bytes: directoryFileBytes(root),
    resource_counts: manifest.resource_counts
  };
}

/**
 * Recompute the mechanically masked set and deterministic order from frozen
 * inputs, then compare only the permitted review fields. No side provenance
 * enters either the expected or packet records.
 *
 * @param {{
 *   repoRoot: string,
 *   packetRoot: string,
 *   preparationPath?: string
 * }} options
 */
export function auditPacketAgainstInputs(options) {
  const repoRoot = canonicalDirectory(options.repoRoot, "repository root");
  const packet = validatePacket(options.packetRoot);
  const preparation = readJsonBounded(
    containedFile(
      repoRoot,
      options.preparationPath || "eval/d2c/preparation.json"
    ),
    64 * 1024
  );
  validatePreparation(preparation);
  const reportBytes = readBytesBounded(
    containedFile(repoRoot, preparation.raw_report),
    4 * 1024 * 1024
  );
  const corpusBytes = readBytesBounded(
    containedFile(repoRoot, preparation.corpus_manifest),
    4 * 1024 * 1024
  );
  assertHash(
    reportBytes,
    preparation.raw_report_sha256,
    "raw report"
  );
  assertHash(
    corpusBytes,
    preparation.corpus_manifest_sha256,
    "corpus manifest"
  );
  const report = parseJson(reportBytes, "raw report");
  const corpus = parseJson(corpusBytes, "corpus manifest");
  validateCorpus(corpus);
  Object.defineProperty(corpus, "_source_bytes", {
    enumerable: false,
    value: corpusBytes
  });
  if (
    report?.corpus?.manifest_sha256 !==
    preparation.corpus_manifest_sha256
  ) {
    throw new Error("Raw report corpus commitment mismatch.");
  }
  const expected = assignOpaqueIdentities(
    deriveMaskedRecords(report, corpus),
    preparation.preparation_seed,
    canonicalInputIdentity(preparation)
  );
  const review = readJsonBounded(
    containedFile(packet.packet_root, "review-items.json"),
    4 * 1024 * 1024
  );
  if (expected.length !== review.items.length) {
    throw new Error("Packet is missing or duplicates a disputed item.");
  }
  for (let index = 0; index < expected.length; index += 1) {
    const expectedItem = expected[index];
    const packetItem = review.items[index];
    if (
      packetItem.case_id !== expectedItem.case_id ||
      packetItem.item_id !== expectedItem.item_id ||
      packetItem.path !== expectedItem.path ||
      packetItem.snapshot_root !== `cases/${expectedItem.case_id}`
    ) {
      throw new Error(
        "Packet item identity, membership, or deterministic order differs."
      );
    }
  }
  if (
    new Set(expected.map((item) => item.case_id)).size !==
    packet.case_count
  ) {
    throw new Error("Packet represented-case membership differs.");
  }
  return {
    packet_root: packet.packet_root,
    packet_hash: packet.packet_hash,
    case_count: packet.case_count,
    item_count: packet.item_count,
    symmetric_difference_complete: true,
    matching_items_absent: true,
    side_provenance_absent: true,
    deterministic_order_valid: true
  };
}

/**
 * Produce canonical records containing no disagreement-side provenance.
 *
 * @param {unknown} report
 * @param {unknown} corpus
 */
export function deriveMaskedRecords(report, corpus) {
  if (
    !isPlainRecord(report) ||
    !Array.isArray(report.results) ||
    !isPlainRecord(report.corpus) ||
    report.corpus.manifest_sha256 !== sha256(jsonSourceBytes(corpus))
  ) {
    throw new Error("Raw report is not bound to the supplied corpus bytes.");
  }
  if (!isPlainRecord(corpus) || !Array.isArray(corpus.cases)) {
    throw new Error("Corpus cases are unavailable.");
  }
  if (report.results.length !== corpus.cases.length) {
    throw new Error("Raw report and corpus case counts differ.");
  }
  const reportIds = new Set();
  const records = [];
  for (let index = 0; index < corpus.cases.length; index += 1) {
    const corpusCase = corpus.cases[index];
    const result = report.results[index];
    if (
      !isPlainRecord(result) ||
      result.id !== corpusCase.id ||
      result.revision !== corpusCase.revision
    ) {
      throw new Error(
        "Raw report records are missing, reordered, or identity-mismatched."
      );
    }
    if (reportIds.has(result.id)) {
      throw new Error("Raw report contains a duplicate case record.");
    }
    reportIds.add(result.id);
    const predictions = validatePathSet(
      result.predictions?.important_files,
      "prediction"
    );
    const labels = validatePathSet(
      corpusCase.labels.important_files.map((label) => label.path),
      "label"
    );
    const predictionSet = new Set(predictions);
    const labelSet = new Set(labels);
    const disputed = [
      ...predictions.filter((value) => !labelSet.has(value)),
      ...labels.filter((value) => !predictionSet.has(value))
    ].sort(compareText);
    for (const disputedPath of disputed) {
      records.push({
        case_key: corpusCase.id,
        path: disputedPath
      });
    }
  }
  assertCanonicalRecords(records);
  for (const record of records) {
    assertDeepEqual(
      Object.keys(record).sort(),
      ["case_key", "path"],
      "Masked record retained non-review provenance."
    );
  }
  return records;
}

/**
 * @param {{case_key: string, path: string}[]} records
 */
export function assertCanonicalRecords(records) {
  const keys = records.map(
    (record) => `${record.case_key}\u0000${record.path}`
  );
  if (new Set(keys).size !== keys.length) {
    throw new Error("Canonical disputed records contain a duplicate.");
  }
  const grouped = new Map();
  for (const record of records) {
    if (!isPlainRecord(record) || !hasExactKeys(record, [
      "case_key",
      "path"
    ])) {
      throw new Error("Canonical disputed record shape is invalid.");
    }
    const paths = grouped.get(record.case_key) || [];
    paths.push(record.path);
    grouped.set(record.case_key, paths);
  }
  let previousCase = null;
  const seenCases = new Set();
  for (const record of records) {
    if (record.case_key !== previousCase) {
      if (seenCases.has(record.case_key)) {
        throw new Error("Canonical case records are reordered.");
      }
      seenCases.add(record.case_key);
      previousCase = record.case_key;
    }
  }
  for (const paths of grouped.values()) {
    assertDeepEqual(
      paths,
      [...paths].sort(compareText),
      "Canonical item records are reordered."
    );
  }
}

/**
 * @param {{case_key: string, path: string}[]} records
 * @param {string} seed
 * @param {string} canonicalInput
 */
export function assignOpaqueIdentities(records, seed, canonicalInput) {
  assertCanonicalRecords(records);
  if (!/^[0-9a-f]{64}$/.test(seed)) {
    throw new Error("Preparation seed must be 32 bytes of lowercase hex.");
  }
  if (!/^[0-9a-f]{64}$/.test(canonicalInput)) {
    throw new Error("Canonical input identity is invalid.");
  }
  const caseKeys = Array.from(
    new Set(records.map((record) => record.case_key))
  );
  const caseIds = new Map(
    caseKeys.map((caseKey) => [
      caseKey,
      `case-${keyedHex(
        seed,
        `case-id\u0000${canonicalInput}\u0000${caseKey}`,
        20
      )}`
    ])
  );
  const caseOrder = new Map(
    [...caseKeys]
      .sort((left, right) =>
        compareText(
          keyedHex(
            seed,
            `case-order\u0000${canonicalInput}\u0000${left}`,
            64
          ),
          keyedHex(
            seed,
            `case-order\u0000${canonicalInput}\u0000${right}`,
            64
          )
        )
      )
      .map((caseKey, index) => [caseKey, index])
  );
  return records
    .map((record) => ({
      ...record,
      case_id: caseIds.get(record.case_key),
      item_id: `item-${keyedHex(
        seed,
        `item-id\u0000${canonicalInput}\u0000${record.case_key}\u0000${record.path}`,
        24
      )}`,
      item_order: keyedHex(
        seed,
        `item-order\u0000${canonicalInput}\u0000${record.case_key}\u0000${record.path}`,
        64
      )
    }))
    .sort((left, right) =>
      caseOrder.get(left.case_key) - caseOrder.get(right.case_key) ||
      compareText(left.item_order, right.item_order)
    )
    .map(({ item_order: _itemOrder, ...record }) => record);
}

/**
 * Validate a completed result against the immutable review template.
 *
 * @param {unknown} result
 * @param {unknown} template
 */
export function validateReviewResult(result, template) {
  if (
    !isPlainRecord(result) ||
    !hasExactKeys(result, ["items", "schema_version"]) ||
    result.schema_version !== ADJUDICATION_SCHEMA ||
    !Array.isArray(result.items) ||
    !isPlainRecord(template) ||
    !Array.isArray(template.items) ||
    result.items.length !== template.items.length
  ) {
    throw new Error("Review result has invalid top-level structure.");
  }
  validateReviewTemplate(template.items, RESOURCE_LIMITS);
  for (let index = 0; index < result.items.length; index += 1) {
    const item = result.items[index];
    const source = template.items[index];
    validateItemShape(item);
    for (const field of [
      "case_id",
      "item_id",
      "path",
      "snapshot_root",
      "unknown_option"
    ]) {
      if (item[field] !== source[field]) {
        throw new Error("Review result changed immutable item identity.");
      }
    }
    assertDeepEqual(
      item.file_metadata,
      source.file_metadata,
      "Review result changed immutable file metadata."
    );
    if (!ALLOWED_DISPOSITIONS.includes(item.reviewer_disposition)) {
      throw new Error("Review result contains an unsupported disposition.");
    }
    if (!boundedText(item.rationale, 1000)) {
      throw new Error("Review result rationale is empty or oversized.");
    }
    if (
      !Array.isArray(item.source_paths) ||
      item.source_paths.length < 1 ||
      item.source_paths.length > 20 ||
      new Set(item.source_paths).size !== item.source_paths.length
    ) {
      throw new Error("Review result source paths are invalid.");
    }
    for (const sourcePath of item.source_paths) {
      validateRelativePath(sourcePath);
    }
  }
  return true;
}

/**
 * @param {unknown} preparation
 */
export function canonicalInputIdentity(preparation) {
  validatePreparation(preparation);
  return sha256(
    Buffer.from(
      canonicalJson({
        schema_version: preparation.schema_version,
        recovery_head: preparation.recovery_head,
        restored_artifact_sha256:
          preparation.restored_artifact_sha256,
        raw_report_sha256: preparation.raw_report_sha256,
        corpus_manifest_sha256:
          preparation.corpus_manifest_sha256
      })
    )
  );
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  return `{${Object.keys(value).sort(compareText).map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  ).join(",")}}`;
}

/**
 * @param {string} packetRoot
 */
export function reviewerCommand(packetRoot) {
  const quoted = shellQuote(path.resolve(packetRoot));
  return (
    `cd ${quoted} && ` +
    "codex exec --ephemeral --model gpt-5.6-sol " +
    "--sandbox workspace-write --ask-for-approval never " +
    "-c model_reasoning_effort=high - < README-FIRST.txt"
  );
}

function validatePreparation(value) {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, PREPARATION_FIELDS) ||
    value.schema_version !== "kanon-d2c-preparation-v1" ||
    !/^[0-9a-f]{40}$/.test(value.recovery_head) ||
    !/^[0-9a-f]{64}$/.test(value.restored_artifact_sha256) ||
    !/^[0-9a-f]{64}$/.test(value.raw_report_sha256) ||
    !/^[0-9a-f]{64}$/.test(value.corpus_manifest_sha256) ||
    !/^[0-9a-f]{64}$/.test(value.preparation_seed)
  ) {
    throw new Error("D.2C preparation manifest is invalid.");
  }
  validateRelativePath(value.raw_report);
  validateRelativePath(value.corpus_manifest);
}

function validateSchemaDocument(value) {
  if (
    !isPlainRecord(value) ||
    value.type !== "object" ||
    value.additionalProperties !== false ||
    !isPlainRecord(value.$defs) ||
    !isPlainRecord(value.$defs.review_item)
  ) {
    throw new Error("Adjudication schema is not structurally strict.");
  }
  const definition = value.$defs.review_item;
  if (
    definition.additionalProperties !== false ||
    !isPlainRecord(definition.properties) ||
    !Array.isArray(definition.required) ||
    !hasExactKeyList(definition.properties, ITEM_FIELDS) ||
    !sameStringSet(definition.required, ITEM_FIELDS) ||
    !sameStringSet(
      definition.properties.reviewer_disposition.enum,
      ALLOWED_DISPOSITIONS
    ) ||
    definition.properties.unknown_option.const !== "unknown"
  ) {
    throw new Error("Adjudication item schema is not exact.");
  }
}

function validateReviewTemplate(items, limits) {
  if (
    !Array.isArray(items) ||
    items.length < 1 ||
    items.length > limits.max_items
  ) {
    throw new Error("Review template item count is invalid.");
  }
  const itemIds = new Set();
  const keys = new Set();
  let previousCase = null;
  const closedCases = new Set();
  for (const item of items) {
    validateItemShape(item);
    if (
      item.reviewer_disposition !== null ||
      item.rationale !== "" ||
      !Array.isArray(item.source_paths) ||
      item.source_paths.length !== 0 ||
      item.unknown_option !== "unknown"
    ) {
      throw new Error("Review template contains a prefilled review field.");
    }
    if (itemIds.has(item.item_id)) {
      throw new Error("Review template contains a duplicate item ID.");
    }
    itemIds.add(item.item_id);
    const key = `${item.case_id}\u0000${item.path}`;
    if (keys.has(key)) {
      throw new Error("Review template contains a duplicate disputed path.");
    }
    keys.add(key);
    if (previousCase !== item.case_id) {
      if (closedCases.has(item.case_id)) {
        throw new Error("Review template case order was altered.");
      }
      if (previousCase !== null) {
        closedCases.add(previousCase);
      }
      previousCase = item.case_id;
    }
  }
}

function validateItemShape(item) {
  if (
    !isPlainRecord(item) ||
    !hasExactKeys(item, ITEM_FIELDS) ||
    !/^case-[0-9a-f]{20}$/.test(item.case_id) ||
    !/^item-[0-9a-f]{24}$/.test(item.item_id) ||
    item.snapshot_root !== `cases/${item.case_id}` ||
    !isPlainRecord(item.file_metadata) ||
    !hasExactKeys(item.file_metadata, FILE_METADATA_FIELDS) ||
    !Number.isSafeInteger(item.file_metadata.byte_count) ||
    item.file_metadata.byte_count < 0 ||
    item.file_metadata.byte_count > RESOURCE_LIMITS.max_file_bytes ||
    !/^[0-9a-f]{64}$/.test(item.file_metadata.sha256)
  ) {
    throw new Error("Review item shape is invalid.");
  }
  validateRelativePath(item.path);
  for (const key of Object.keys(item)) {
    if (FORBIDDEN_ITEM_KEYS.has(key)) {
      throw new Error("Review item contains a prohibited status field.");
    }
  }
}

function validateManifest(value) {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, MANIFEST_FIELDS) ||
    value.schema_version !== PACKET_SCHEMA ||
    !Number.isSafeInteger(value.item_count) ||
    value.item_count < 1 ||
    value.item_count > RESOURCE_LIMITS.max_items ||
    !Number.isSafeInteger(value.case_count) ||
    value.case_count < 1 ||
    value.case_count > RESOURCE_LIMITS.max_cases ||
    !/^[0-9a-f]{64}$/.test(value.seed_commitment) ||
    !/^[0-9a-f]{64}$/.test(value.packet_hash) ||
    !isPlainRecord(value.input_commitments) ||
    !hasExactKeys(
      value.input_commitments,
      INPUT_COMMITMENT_FIELDS
    ) ||
    !isPlainRecord(value.resource_counts) ||
    !hasExactKeys(value.resource_counts, RESOURCE_COUNT_FIELDS)
  ) {
    throw new Error("Packet manifest structure is invalid.");
  }
  for (const [key, commitment] of Object.entries(
    value.input_commitments
  )) {
    const pattern = key === "recovery_head"
      ? /^[0-9a-f]{40}$/
      : /^[0-9a-f]{64}$/;
    if (!pattern.test(commitment)) {
      throw new Error("Packet input commitment is invalid.");
    }
  }
  for (const count of Object.values(value.resource_counts)) {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error("Packet resource count is invalid.");
    }
  }
}

function validatePathSet(values, label) {
  if (!Array.isArray(values) || values.length > 1000) {
    throw new Error(`Important-file ${label} set is invalid.`);
  }
  const paths = values.map((value) => {
    validateRelativePath(value);
    return value;
  });
  if (new Set(paths).size !== paths.length) {
    throw new Error(`Important-file ${label} set contains duplicates.`);
  }
  return paths;
}

function validateRelativePath(value) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    Buffer.byteLength(value, "utf8") > 500 ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    value.includes("\\") ||
    value.split("/").some(
      (part) => !part || part === "." || part === ".."
    ) ||
    UNSAFE_DISPLAY.test(value)
  ) {
    throw new Error("Unsafe repository-relative path.");
  }
}

function copySnapshot(sourceRoot, destinationRoot, state, caseKey) {
  fs.mkdirSync(destinationRoot, { recursive: false, mode: 0o700 });
  state.directoryCount += 1;
  const stack = [{
    source: sourceRoot,
    destination: destinationRoot,
    relative: ""
  }];
  let caseFiles = 0;
  while (stack.length) {
    assertWithinElapsed(state);
    const current = stack.pop();
    const before = fs.lstatSync(current.source, { bigint: true });
    if (!before.isDirectory() || before.isSymbolicLink()) {
      throw new Error("Snapshot directory was replaced or is indirect.");
    }
    const entries = fs.readdirSync(current.source, {
      withFileTypes: true
    });
    if (entries.length > state.limits.max_entries_per_directory) {
      throw new Error("Snapshot directory entry limit exceeded.");
    }
    state.directoryEntries += entries.length;
    if (
      state.directoryEntries >
      state.limits.max_directory_entries
    ) {
      throw new Error("Snapshot total directory-entry limit exceeded.");
    }
    entries.sort((left, right) => compareText(left.name, right.name));
    const directories = [];
    for (const entry of entries) {
      const relative = current.relative
        ? `${current.relative}/${entry.name}`
        : entry.name;
      validateSnapshotPath(relative);
      const sourcePath = path.join(current.source, entry.name);
      const preliminary = fs.lstatSync(sourcePath, {
        bigint: true
      });
      if (preliminary.isSymbolicLink()) {
        state.rejectedLinks += 1;
        continue;
      }
      const contained = resolveContainedPath(sourceRoot, relative, {
        type: "any"
      });
      if (!contained.ok || contained.path !== sourcePath) {
        throw new Error("Snapshot entry failed containment validation.");
      }
      const stat = fs.lstatSync(sourcePath, { bigint: true });
      if (stat.isSymbolicLink()) {
        throw new Error("Snapshot links are rejected.");
      }
      const destinationPath = path.join(
        current.destination,
        entry.name
      );
      if (stat.isDirectory()) {
        fs.mkdirSync(destinationPath, {
          recursive: false,
          mode: 0o700
        });
        state.directoryCount += 1;
        directories.push({
          source: sourcePath,
          destination: destinationPath,
          relative
        });
      } else if (stat.isFile()) {
        copyRegularFile(sourcePath, destinationPath, stat, state);
        caseFiles += 1;
        if (caseFiles > state.limits.max_files_per_case) {
          throw new Error("Snapshot per-case file limit exceeded.");
        }
      } else {
        throw new Error("Snapshot special files are rejected.");
      }
    }
    const after = fs.lstatSync(current.source, { bigint: true });
    if (!sameStableStat(before, after)) {
      throw new Error("Snapshot directory changed during copying.");
    }
    for (let index = directories.length - 1; index >= 0; index -= 1) {
      stack.push(directories[index]);
    }
  }
  if (caseFiles === 0) {
    throw new Error(`Immutable snapshot is empty for ${caseKey}.`);
  }
}

function copyRegularFile(source, destination, lstat, state) {
  assertWithinElapsed(state);
  const size = Number(lstat.size);
  if (
    !Number.isSafeInteger(size) ||
    size < 0 ||
    size > state.limits.max_file_bytes ||
    lstat.nlink !== 1n
  ) {
    throw new Error(
      lstat.nlink !== 1n
        ? "Snapshot hard-linked files are rejected."
        : "Snapshot per-file byte limit exceeded."
    );
  }
  if (state.totalBytes + size > state.limits.max_total_bytes) {
    throw new Error("Snapshot total-byte limit exceeded.");
  }
  if (state.fileCount + 1 > state.limits.max_files_total) {
    throw new Error("Snapshot total file-count limit exceeded.");
  }
  const noFollow = fs.constants.O_NOFOLLOW || 0;
  const sourceFd = fs.openSync(
    source,
    fs.constants.O_RDONLY | noFollow
  );
  let destinationFd;
  try {
    const opened = fs.fstatSync(sourceFd, { bigint: true });
    if (!opened.isFile() || !sameStableStat(lstat, opened)) {
      throw new Error("Snapshot file changed before copying.");
    }
    destinationFd = fs.openSync(
      destination,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL,
      0o400
    );
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let total = 0;
    while (total < size) {
      assertWithinElapsed(state);
      const read = fs.readSync(
        sourceFd,
        buffer,
        0,
        Math.min(buffer.length, size - total),
        null
      );
      if (read < 1) {
        throw new Error("Snapshot file ended during copying.");
      }
      let written = 0;
      while (written < read) {
        written += fs.writeSync(
          destinationFd,
          buffer,
          written,
          read - written
        );
      }
      total += read;
    }
    const finalSource = fs.fstatSync(sourceFd, { bigint: true });
    if (!sameStableStat(opened, finalSource)) {
      throw new Error("Snapshot file changed during copying.");
    }
    fs.fsyncSync(destinationFd);
  } finally {
    if (destinationFd !== undefined) {
      fs.closeSync(destinationFd);
    }
    fs.closeSync(sourceFd);
  }
  fs.chmodSync(destination, 0o400);
  state.fileCount += 1;
  state.totalBytes += size;
}

function validateSnapshotPath(relativePath) {
  validateRelativePath(relativePath);
  const parts = relativePath.split("/");
  const lowered = parts.map((part) => part.toLowerCase());
  const basename = lowered.at(-1);
  if (
    lowered.includes(".git") ||
    lowered.includes(".kanon") ||
    FORBIDDEN_SNAPSHOT_BASENAMES.has(basename) ||
    lowered.slice(0, 2).join("/") === "eval/results" ||
    lowered.slice(0, 2).join("/") === "skills/kanon" ||
    lowered.includes("kanon-runtime")
  ) {
    throw new Error("Snapshot contains excluded review material.");
  }
}

function validateNoSensitiveSnapshotNames(entries) {
  for (const entry of entries) {
    validateSnapshotPath(entry.path.replace(/^cases\/[^/]+\//, ""));
  }
}

function collectTreeEntries(root, prefix, options = {}) {
  const entries = [];
  const stack = [{ absolute: root, relative: prefix }];
  while (stack.length) {
    const current = stack.pop();
    const children = fs.readdirSync(current.absolute, {
      withFileTypes: true
    });
    children.sort((left, right) => compareText(left.name, right.name));
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      const absolute = path.join(current.absolute, child.name);
      const relative = `${current.relative}/${child.name}`;
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        throw new Error("Committed packet tree contains a link.");
      }
      if (child.isDirectory() && stat.isDirectory()) {
        if (options.requireReadOnly && (stat.mode & 0o222) !== 0) {
          throw new Error("Packet snapshot directory is writable.");
        }
        entries.push({ path: relative, type: "directory" });
        stack.push({ absolute, relative });
      } else if (child.isFile() && stat.isFile()) {
        if (options.requireReadOnly && (stat.mode & 0o222) !== 0) {
          throw new Error("Packet snapshot file is writable.");
        }
        entries.push({
          path: relative,
          type: "file",
          byte_count: stat.size,
          sha256: sha256(fs.readFileSync(absolute))
        });
      } else {
        throw new Error("Committed packet tree contains a special file.");
      }
    }
  }
  return entries.sort(compareEntries);
}

function makePacketReadOnly(root) {
  for (const relativePath of [
    "README-FIRST.txt",
    "adjudication.schema.json",
    "review-items.json",
    "packet-manifest.json"
  ]) {
    fs.chmodSync(path.join(root, relativePath), 0o400);
  }
  const directories = [];
  const stack = [path.join(root, "cases")];
  while (stack.length) {
    const directory = stack.pop();
    directories.push(directory);
    for (const entry of fs.readdirSync(directory, {
      withFileTypes: true
    })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        stack.push(target);
      } else if (entry.isFile()) {
        fs.chmodSync(target, 0o400);
      } else {
        throw new Error("Packet contains an indirect or special entry.");
      }
    }
  }
  directories.sort(
    (left, right) => right.split(path.sep).length -
      left.split(path.sep).length
  );
  for (const directory of directories) {
    fs.chmodSync(directory, 0o500);
  }
}

function newCopyState(limits, startedAt) {
  return {
    limits,
    startedAt,
    fileCount: 0,
    directoryCount: 0,
    directoryEntries: 0,
    totalBytes: 0,
    rejectedLinks: 0
  };
}

function assertWithinElapsed(state) {
  if (Date.now() - state.startedAt > state.limits.max_elapsed_ms) {
    throw new Error("Packet construction elapsed-time limit exceeded.");
  }
}

function sameStableStat(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function prepareAbsentOutput(value) {
  const resolved = path.resolve(String(value));
  const parent = canonicalDirectory(
    path.dirname(resolved),
    "output parent"
  );
  const name = path.basename(resolved);
  if (
    !name ||
    name === "." ||
    name === ".." ||
    UNSAFE_DISPLAY.test(name)
  ) {
    throw new Error("Packet output name is invalid.");
  }
  const selected = path.join(parent, name);
  if (fs.existsSync(selected)) {
    throw new Error("Packet output path must not already exist.");
  }
  return { parent, name, path: selected };
}

function cleanupOwnedStaging(parent, name) {
  if (
    !name.startsWith(".") ||
    !name.includes(".staging-") ||
    name.includes("/") ||
    name.includes("\\")
  ) {
    throw new Error("Refusing to clean an unowned temporary path.");
  }
  const target = path.join(parent, name);
  const relative = path.relative(parent, target);
  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    path.dirname(target) !== parent
  ) {
    throw new Error("Refusing cleanup outside the staging parent.");
  }
  if (fs.existsSync(target)) {
    fs.chmodSync(target, 0o700);
    makeTreeWritable(target);
    fs.rmSync(target, { recursive: true, force: false });
  }
}

function makeTreeWritable(root) {
  const stack = [root];
  while (stack.length) {
    const target = stack.pop();
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) {
      throw new Error("Refusing to follow a staging link during cleanup.");
    }
    if (stat.isDirectory()) {
      fs.chmodSync(target, 0o700);
      for (const entry of fs.readdirSync(target)) {
        stack.push(path.join(target, entry));
      }
    } else if (stat.isFile()) {
      fs.chmodSync(target, 0o600);
    } else {
      throw new Error("Refusing to clean a staging special file.");
    }
  }
}

function canonicalDirectory(value, label) {
  const resolved = path.resolve(String(value));
  const canonical = fs.realpathSync(resolved);
  const stat = fs.lstatSync(canonical);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} is not a canonical direct directory.`);
  }
  return canonical;
}

function containedFile(root, relativePath) {
  const result = resolveContainedPath(root, relativePath, {
    type: "file"
  });
  if (!result.ok) {
    throw new Error(`Unsafe input file: ${result.reason}`);
  }
  return result.path;
}

function readJsonBounded(file, maximum) {
  return parseJson(readBytesBounded(file, maximum), path.basename(file));
}

function readBytesBounded(file, maximum) {
  const stat = fs.lstatSync(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > maximum
  ) {
    throw new Error("Input file is indirect, special, or oversized.");
  }
  return fs.readFileSync(file);
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

function jsonSourceBytes(value) {
  const source = value?._source_bytes;
  if (Buffer.isBuffer(source)) {
    return source;
  }
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function assertHash(bytes, expected, label) {
  const received = sha256(bytes);
  if (received !== expected) {
    throw new Error(`${label} SHA-256 mismatch.`);
  }
}

function writeNewFile(target, bytes) {
  fs.writeFileSync(target, bytes, {
    flag: "wx",
    mode: 0o400
  });
  fs.chmodSync(target, 0o400);
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function fileEntry(root, relativePath, requireReadOnly = false) {
  const result = resolveContainedPath(root, relativePath, {
    type: "file"
  });
  if (!result.ok) {
    throw new Error("Controlled packet file is unsafe.");
  }
  if (requireReadOnly && (result.stat.mode & 0o222) !== 0) {
    throw new Error("Controlled packet input is writable.");
  }
  const bytes = fs.readFileSync(result.path);
  return {
    path: relativePath,
    type: "file",
    byte_count: bytes.length,
    sha256: sha256(bytes)
  };
}

function treeCommitment(entries) {
  return sha256(Buffer.from(canonicalJson(entries)));
}

function directoryFileBytes(root) {
  let total = 0;
  const stack = [root];
  while (stack.length) {
    const directory = stack.pop();
    for (const entry of fs.readdirSync(directory, {
      withFileTypes: true
    })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        stack.push(target);
      } else if (entry.isFile()) {
        total += fs.statSync(target).size;
      } else {
        throw new Error("Packet size traversal found an indirect entry.");
      }
    }
  }
  return total;
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function keyedHex(seed, value, length) {
  return crypto
    .createHmac("sha256", Buffer.from(seed, "hex"))
    .update(value, "utf8")
    .digest("hex")
    .slice(0, length);
}

function compareEntries(left, right) {
  return compareText(left.path, right.path) ||
    compareText(left.type, right.type);
}

function compareText(left, right) {
  return Buffer.compare(
    Buffer.from(left, "utf8"),
    Buffer.from(right, "utf8")
  );
}

function isPlainRecord(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactKeys(value, keys) {
  return hasExactKeyList(value, keys);
}

function hasExactKeyList(value, keys) {
  const received = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  return received.length === expected.length &&
    received.every((key, index) => key === expected[index]);
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

function boundedText(value, maximumBytes) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Buffer.byteLength(value, "utf8") <= maximumBytes &&
    !UNSAFE_DISPLAY.test(value)
  );
}

function assertDeepEqual(left, right, message) {
  if (canonicalJson(left) !== canonicalJson(right)) {
    throw new Error(message);
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}
