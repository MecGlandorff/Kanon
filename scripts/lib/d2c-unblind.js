import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveContainedPath } from "../../src/path-security.js";
import {
  ALLOWED_DISPOSITIONS,
  assignOpaqueIdentities,
  auditPacketAgainstInputs,
  canonicalInputIdentity,
  deriveMaskedRecords,
  validatePacket,
  validateReviewResult
} from "./d2c-packet.js";
import { validateCorpus } from "./eval-corpus/schema.js";

export const UNBLINDED_SCHEMA = "kanon-d2c-unblinded-analysis-v1";
export const COMPLETED_REVIEW_OUTPUT = "review-result.json";

const ORIGINS = Object.freeze(["prediction-only", "label-only"]);
const STATIC_EXPECTED_FIELDS = Object.freeze([
  "caseCount",
  "corpusManifestSha256",
  "itemCount",
  "packetHash",
  "packetManifestSha256",
  "preparationCommit",
  "rawReportSha256",
  "restoredArtifactSha256",
  "reviewResultSha256",
  "reviewerPromptSha256"
]);

/**
 * Validate every committed packet input without parsing the reviewer result.
 *
 * @param {{
 *   repoRoot: string,
 *   packetRoot: string,
 *   expected: {
 *     caseCount: number,
 *     corpusManifestSha256: string,
 *     itemCount: number,
 *     packetHash: string,
 *     packetManifestSha256: string,
 *     preparationCommit: string,
 *     rawReportSha256: string,
 *     restoredArtifactSha256: string,
 *     reviewResultSha256: string,
 *     reviewerPromptSha256: string
 *   }
 * }} options
 */
export function validateRetainedPacket(options) {
  validateStaticExpected(options.expected);
  const repoRoot = canonicalDirectory(options.repoRoot, "repository root");
  const packet = validatePacket(options.packetRoot, {
    allowedOutputFiles: [COMPLETED_REVIEW_OUTPUT]
  });
  const manifest = readJsonBounded(
    containedFile(packet.packet_root, "packet-manifest.json"),
    256 * 1024,
    "packet manifest"
  );
  const resultFile = containedFile(
    packet.packet_root,
    `output/${COMPLETED_REVIEW_OUTPUT}`
  );
  const resultBytes = readStableRegularFile(resultFile, 4 * 1024 * 1024);
  const resultSha256 = sha256(resultBytes);
  const comparisons = [
    [
      packet.packet_manifest_sha256,
      options.expected.packetManifestSha256,
      "packet manifest"
    ],
    [packet.packet_hash, options.expected.packetHash, "packet commitment"],
    [
      packet.reviewer_prompt_sha256,
      options.expected.reviewerPromptSha256,
      "reviewer prompt"
    ],
    [packet.case_count, options.expected.caseCount, "case count"],
    [packet.item_count, options.expected.itemCount, "item count"],
    [
      resultSha256,
      options.expected.reviewResultSha256,
      "review result"
    ],
    [
      manifest.input_commitments.raw_report_sha256,
      options.expected.rawReportSha256,
      "raw report"
    ],
    [
      manifest.input_commitments.corpus_manifest_sha256,
      options.expected.corpusManifestSha256,
      "corpus manifest"
    ],
    [
      manifest.input_commitments.restored_artifact_sha256,
      options.expected.restoredArtifactSha256,
      "restored artifact"
    ]
  ];
  for (const [received, expected, label] of comparisons) {
    if (received !== expected) {
      throw new Error(
        `Retained packet ${label} differs from frozen preparation evidence.`
      );
    }
  }

  const preparation = readPreparation(repoRoot);
  if (
    preparation.raw_report_sha256 !== options.expected.rawReportSha256 ||
    preparation.corpus_manifest_sha256 !==
      options.expected.corpusManifestSha256 ||
    preparation.restored_artifact_sha256 !==
      options.expected.restoredArtifactSha256
  ) {
    throw new Error(
      "Committed preparation inputs differ from frozen evidence."
    );
  }
  const audit = auditPacketAgainstInputs({
    repoRoot,
    packetRoot: packet.packet_root,
    allowedOutputFiles: [COMPLETED_REVIEW_OUTPUT]
  });

  return {
    packet_root: packet.packet_root,
    packet_manifest_sha256: packet.packet_manifest_sha256,
    packet_hash: packet.packet_hash,
    reviewer_prompt_sha256: packet.reviewer_prompt_sha256,
    adjudication_schema_sha256:
      manifest.input_commitments.adjudication_schema_sha256,
    review_items_sha256:
      manifest.input_commitments.review_items_sha256,
    case_snapshots_sha256:
      manifest.input_commitments.case_snapshots_sha256,
    review_result_sha256: resultSha256,
    raw_report_sha256: manifest.input_commitments.raw_report_sha256,
    corpus_manifest_sha256:
      manifest.input_commitments.corpus_manifest_sha256,
    restored_artifact_sha256:
      manifest.input_commitments.restored_artifact_sha256,
    preparation_commit: options.expected.preparationCommit,
    case_count: packet.case_count,
    item_count: packet.item_count,
    output_files: packet.output_files,
    packet_inputs_read_only: true,
    output_contained: true,
    links_reparse_points_special_files_absent: true,
    excluded_evaluation_material_absent: true,
    audit
  };
}

/**
 * Parse and formally validate the completed result only after static packet
 * validation has succeeded.
 *
 * @param {Parameters<typeof validateRetainedPacket>[0]} options
 */
export function validateCompletedReview(options) {
  const before = validateRetainedPacket(options);
  const resultPath = containedFile(
    before.packet_root,
    `output/${COMPLETED_REVIEW_OUTPUT}`
  );
  const resultBytes = readStableRegularFile(
    resultPath,
    4 * 1024 * 1024
  );
  const result = parseJson(resultBytes, "review result");
  const template = readJsonBounded(
    containedFile(before.packet_root, "review-items.json"),
    4 * 1024 * 1024,
    "review items"
  );
  validateReviewResult(result, template, {
    expectedItemCount: options.expected.itemCount,
    packetRoot: before.packet_root
  });
  const after = validateRetainedPacket(options);
  assertSameStaticProof(before, after);
  return {
    static_packet: after,
    formal_result_valid: true,
    schema_version: result.schema_version,
    item_count: result.items.length,
    unique_item_count:
      new Set(result.items.map((item) => item.item_id)).size,
    result_sha256: sha256(resultBytes),
    result_bytes: resultBytes,
    result
  };
}

/**
 * Preserve the exact masked bytes and create a separate additive unblinded
 * analysis in a deterministic, previously absent evaluation directory.
 *
 * @param {Parameters<typeof validateRetainedPacket>[0] & {
 *   destinationName?: string
 * }} options
 */
export function preserveAndUnblind(options) {
  const validated = validateCompletedReview(options);
  const repoRoot = canonicalDirectory(options.repoRoot, "repository root");
  const inputs = loadFrozenInputs(repoRoot);
  const unblinded = buildUnblindedAnalysis({
    expected: options.expected,
    packet: validated.static_packet,
    result: validated.result,
    report: inputs.report,
    corpus: inputs.corpus,
    preparation: inputs.preparation
  });
  const destinationName = options.destinationName ||
    `d2c-unblind-${validated.result_sha256.slice(0, 8)}`;
  validateDestinationName(destinationName);
  const resultsRoot = containedDirectory(repoRoot, "eval/results");
  const destination = path.join(resultsRoot, destinationName);
  refuseExistingPath(destination);

  const stagingName =
    `.${destinationName}.staging-${process.pid}-${crypto.randomUUID()}`;
  const staging = path.join(resultsRoot, stagingName);
  fs.mkdirSync(staging, { recursive: false, mode: 0o700 });
  let completed = false;
  try {
    writeNewFile(
      path.join(staging, COMPLETED_REVIEW_OUTPUT),
      validated.result_bytes
    );
    writeNewFile(
      path.join(staging, "unblinded-analysis.json"),
      jsonBytes(unblinded)
    );
    refuseExistingPath(destination);
    fs.renameSync(staging, destination);
    fs.chmodSync(destination, 0o500);
    completed = true;
  } finally {
    if (!completed && isOwnedStaging(resultsRoot, stagingName)) {
      makeTreeWritable(staging);
      fs.rmSync(staging, { recursive: true, force: false });
    }
  }
  const preserved = containedFile(
    destination,
    COMPLETED_REVIEW_OUTPUT
  );
  const preservedBytes = readStableRegularFile(
    preserved,
    4 * 1024 * 1024
  );
  if (
    !preservedBytes.equals(validated.result_bytes) ||
    sha256(preservedBytes) !== validated.result_sha256
  ) {
    throw new Error("Preserved masked result bytes changed.");
  }
  return {
    destination,
    preserved_result: preserved,
    preserved_result_sha256: validated.result_sha256,
    unblinded_analysis: containedFile(
      destination,
      "unblinded-analysis.json"
    ),
    analysis: unblinded
  };
}

/**
 * @param {{
 *   expected: Parameters<typeof validateRetainedPacket>[0]["expected"],
 *   packet: ReturnType<typeof validateRetainedPacket>,
 *   result: any,
 *   report: any,
 *   corpus: any,
 *   preparation: any
 * }} options
 */
export function buildUnblindedAnalysis(options) {
  validateCorpus(options.corpus);
  const masked = deriveMaskedRecords(options.report, options.corpus);
  const identities = assignOpaqueIdentities(
    masked,
    options.preparation.preparation_seed,
    canonicalInputIdentity(options.preparation)
  );
  if (identities.length !== options.result.items.length) {
    throw new Error("Unblinding membership differs from validated result.");
  }
  const corpusById = new Map(
    options.corpus.cases.map((item) => [item.id, item])
  );
  const reportById = new Map(
    options.report.results.map((item) => [item.id, item])
  );
  const items = identities.map((identity, index) => {
    const reviewed = options.result.items[index];
    if (
      reviewed.case_id !== identity.case_id ||
      reviewed.item_id !== identity.item_id ||
      reviewed.path !== identity.path
    ) {
      throw new Error(
        "Unblinding identity differs from validated reviewer order."
      );
    }
    const corpusCase = corpusById.get(identity.case_key);
    const reportCase = reportById.get(identity.case_key);
    if (!corpusCase || !reportCase) {
      throw new Error("Unblinding case identity is unavailable.");
    }
    const predictions = new Set(
      reportCase.predictions.important_files
    );
    const labels = new Set(
      corpusCase.labels.important_files.map((label) => label.path)
    );
    const predictionOnly =
      predictions.has(identity.path) && !labels.has(identity.path);
    const labelOnly =
      labels.has(identity.path) && !predictions.has(identity.path);
    if (predictionOnly === labelOnly) {
      throw new Error(
        "Unblinding origin is not an exact symmetric-difference side."
      );
    }
    return {
      item_id: identity.item_id,
      case_id: identity.case_id,
      repository_identity: corpusCase.id,
      path: identity.path,
      origin: predictionOnly ? "prediction-only" : "label-only",
      reviewer_disposition: reviewed.reviewer_disposition,
      rationale: reviewed.rationale,
      direct_sources: [...reviewed.source_paths],
      category: corpusCase.category,
      packet_commitment: options.packet.packet_hash,
      review_result_sha256: options.packet.review_result_sha256
    };
  });
  const matrices = buildMatrices(items);
  return {
    schema_version: UNBLINDED_SCHEMA,
    bindings: {
      preparation_commit: options.expected.preparationCommit,
      packet_manifest_sha256: options.packet.packet_manifest_sha256,
      packet_commitment: options.packet.packet_hash,
      reviewer_prompt_sha256: options.packet.reviewer_prompt_sha256,
      adjudication_schema_sha256:
        options.packet.adjudication_schema_sha256,
      review_items_sha256: options.packet.review_items_sha256,
      case_snapshots_sha256: options.packet.case_snapshots_sha256,
      review_result_sha256: options.packet.review_result_sha256,
      raw_report_sha256: options.packet.raw_report_sha256,
      corpus_manifest_sha256: options.packet.corpus_manifest_sha256,
      restored_artifact_sha256:
        options.packet.restored_artifact_sha256
    },
    method: {
      source_set: "important-file symmetric difference only",
      reviewer_dispositions_modified: false,
      frozen_labels_modified: false,
      official_score_recalculated: false,
      consensus_items_presented_to_reviewer: false,
      exact_top_five_selection_requested: false,
      comparative_top_five_review_required: true
    },
    item_count: items.length,
    case_count: new Set(items.map((item) => item.case_id)).size,
    items,
    matrices
  };
}

function buildMatrices(items) {
  const byOrigin = Object.fromEntries(
    ORIGINS.map((origin) => [
      origin,
      dispositionCounts(items.filter((item) => item.origin === origin))
    ])
  );
  const categories = Array.from(
    new Set(items.map((item) => item.category))
  ).sort(compareText);
  const byCategoryOriginDisposition = Object.fromEntries(
    categories.map((category) => [
      category,
      Object.fromEntries(
        ORIGINS.map((origin) => [
          origin,
          dispositionCounts(items.filter(
            (item) =>
              item.category === category &&
              item.origin === origin
          ))
        ])
      )
    ])
  );
  const caseIds = [];
  for (const item of items) {
    if (!caseIds.includes(item.case_id)) {
      caseIds.push(item.case_id);
    }
  }
  const cases = caseIds.map((caseId) => {
    const caseItems = items.filter((item) => item.case_id === caseId);
    return {
      case_id: caseId,
      repository_identity: caseItems[0].repository_identity,
      category: caseItems[0].category,
      item_count: caseItems.length,
      by_origin: Object.fromEntries(
        ORIGINS.map((origin) => [
          origin,
          dispositionCounts(caseItems.filter(
            (item) => item.origin === origin
          ))
        ])
      ),
      all_dispositions: dispositionCounts(caseItems)
    };
  });
  const patternCounts = new Map();
  for (const item of cases) {
    const signature = JSON.stringify({
      prediction_only: item.by_origin["prediction-only"],
      label_only: item.by_origin["label-only"]
    });
    const current = patternCounts.get(signature) || {
      signature: JSON.parse(signature),
      case_count: 0,
      case_ids: []
    };
    current.case_count += 1;
    current.case_ids.push(item.case_id);
    patternCounts.set(signature, current);
  }
  const findings = {};
  for (const disposition of ALLOWED_DISPOSITIONS) {
    findings[disposition] = groupedItemIds(
      items.filter(
        (item) => item.reviewer_disposition === disposition
      )
    );
  }
  return {
    prediction_only_by_disposition: byOrigin["prediction-only"],
    label_only_by_disposition: byOrigin["label-only"],
    category_by_origin_and_disposition:
      byCategoryOriginDisposition,
    case_level: cases,
    case_pattern_groups: Array.from(patternCounts.values()),
    findings
  };
}

function dispositionCounts(items) {
  const counts = Object.fromEntries(
    ALLOWED_DISPOSITIONS.map((disposition) => [disposition, 0])
  );
  for (const item of items) {
    if (!Object.hasOwn(counts, item.reviewer_disposition)) {
      throw new Error("Unblinding found an unsupported disposition.");
    }
    counts[item.reviewer_disposition] += 1;
  }
  return {
    ...counts,
    total: items.length
  };
}

function groupedItemIds(items) {
  const output = Object.fromEntries(
    ORIGINS.map((origin) => [
      origin,
      items
        .filter((item) => item.origin === origin)
        .map((item) => item.item_id)
    ])
  );
  return {
    ...output,
    total: items.length
  };
}

function loadFrozenInputs(repoRoot) {
  const preparation = readPreparation(repoRoot);
  const reportBytes = readStableRegularFile(
    containedFile(repoRoot, preparation.raw_report),
    4 * 1024 * 1024
  );
  const corpusBytes = readStableRegularFile(
    containedFile(repoRoot, preparation.corpus_manifest),
    4 * 1024 * 1024
  );
  if (
    sha256(reportBytes) !== preparation.raw_report_sha256 ||
    sha256(corpusBytes) !== preparation.corpus_manifest_sha256
  ) {
    throw new Error("Frozen unblinding input hash mismatch.");
  }
  const report = parseJson(reportBytes, "raw report");
  const corpus = parseJson(corpusBytes, "corpus manifest");
  validateCorpus(corpus);
  Object.defineProperty(corpus, "_source_bytes", {
    enumerable: false,
    value: corpusBytes
  });
  return { preparation, report, corpus };
}

function readPreparation(repoRoot) {
  const preparation = readJsonBounded(
    containedFile(repoRoot, "eval/d2c/preparation.json"),
    64 * 1024,
    "D.2C preparation"
  );
  if (
    preparation?.schema_version !== "kanon-d2c-preparation-v1" ||
    typeof preparation.raw_report !== "string" ||
    typeof preparation.corpus_manifest !== "string"
  ) {
    throw new Error("D.2C preparation manifest is invalid.");
  }
  return preparation;
}

function validateStaticExpected(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort(compareText).join("\0") !==
      [...STATIC_EXPECTED_FIELDS].sort(compareText).join("\0") ||
    !Number.isSafeInteger(value.caseCount) ||
    !Number.isSafeInteger(value.itemCount) ||
    !/^[0-9a-f]{40}$/.test(value.preparationCommit)
  ) {
    throw new Error("Frozen D.2C expected bindings are invalid.");
  }
  for (const field of STATIC_EXPECTED_FIELDS.filter(
    (field) =>
      !["caseCount", "itemCount", "preparationCommit"].includes(field)
  )) {
    if (!/^[0-9a-f]{64}$/.test(value[field])) {
      throw new Error("Frozen D.2C expected hash is invalid.");
    }
  }
}

function assertSameStaticProof(left, right) {
  if (
    JSON.stringify(left) !== JSON.stringify(right)
  ) {
    throw new Error("Packet inputs changed during formal result validation.");
  }
}

function readStableRegularFile(file, maximumBytes) {
  const before = fs.lstatSync(file, { bigint: true });
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1n ||
    before.size > BigInt(maximumBytes)
  ) {
    throw new Error(
      "Input file is indirect, hard-linked, special, or oversized."
    );
  }
  const noFollow = fs.constants.O_NOFOLLOW || 0;
  const fd = fs.openSync(file, fs.constants.O_RDONLY | noFollow);
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    if (!sameStableStat(before, opened)) {
      throw new Error("Input file changed before its stable read.");
    }
    const bytes = fs.readFileSync(fd);
    const after = fs.fstatSync(fd, { bigint: true });
    if (
      bytes.length !== Number(after.size) ||
      !sameStableStat(opened, after)
    ) {
      throw new Error("Input file changed during its stable read.");
    }
    return bytes;
  } finally {
    fs.closeSync(fd);
  }
}

function sameStableStat(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function readJsonBounded(file, maximumBytes, label) {
  return parseJson(readStableRegularFile(file, maximumBytes), label);
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label} is not valid JSON.`);
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

function containedDirectory(root, relativePath) {
  const result = resolveContainedPath(root, relativePath, {
    type: "directory"
  });
  if (!result.ok) {
    throw new Error(`Unsafe contained directory: ${result.reason}`);
  }
  return result.path;
}

function containedFile(root, relativePath) {
  const result = resolveContainedPath(root, relativePath, {
    type: "file"
  });
  if (!result.ok) {
    throw new Error(`Unsafe contained file: ${result.reason}`);
  }
  return result.path;
}

function validateDestinationName(value) {
  if (
    typeof value !== "string" ||
    !/^d2c-unblind-[0-9a-f]{8,64}$/.test(value)
  ) {
    throw new Error("D.2C destination name is invalid.");
  }
}

function refuseExistingPath(target) {
  try {
    fs.lstatSync(target);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return;
    }
    throw error;
  }
  throw new Error("D.2C destination already exists; replacement refused.");
}

function writeNewFile(target, bytes) {
  const fd = fs.openSync(
    target,
    fs.constants.O_WRONLY |
      fs.constants.O_CREAT |
      fs.constants.O_EXCL,
    0o400
  );
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.chmodSync(target, 0o400);
}

function isOwnedStaging(root, name) {
  return (
    name.startsWith(".d2c-unblind-") &&
    name.includes(".staging-") &&
    path.dirname(path.join(root, name)) === root &&
    fs.existsSync(path.join(root, name))
  );
}

function makeTreeWritable(root) {
  if (!fs.existsSync(root)) {
    return;
  }
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      makeTreeWritable(target);
    } else if (entry.isFile()) {
      fs.chmodSync(target, 0o600);
    }
  }
  fs.chmodSync(root, 0o700);
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function compareText(left, right) {
  return Buffer.compare(
    Buffer.from(left, "utf8"),
    Buffer.from(right, "utf8")
  );
}
