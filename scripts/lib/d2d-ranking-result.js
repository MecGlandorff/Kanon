import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  D2D_LIMITS,
  validateRankingDocket,
  validateRankingResult
} from "./d2d-dual-docket.js";
import {
  assertDeepEqual,
  canonicalDirectory,
  canonicalJson,
  cleanupOwnedStaging,
  containedFile,
  prepareAbsentOutput,
  sha256,
  writeNewFile
} from "./d2c-packet.js";
import {
  readStableRegularFile,
  sameStableStat
} from "./d2c-unblind.js";

export const RANKING_EVIDENCE_SCHEMA =
  "kanon-d2d-ranking-evidence-v1";
export const RANKING_EVIDENCE_MANIFEST = "evidence-manifest.json";
export const RANKING_PRESERVED_RESULT = "ranking-result.json";

const HASH = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const RESULT_SCHEMA = "kanon-d2d-ranking-result-v1";
const RESULT_OUTCOMES = Object.freeze([
  "generic-hypotheses",
  "no-generic-hypothesis"
]);
const EVIDENCE_LIMITATIONS = Object.freeze([
  "The reviewer outcome is bounded to the retained ranking packet and is not evidence that the product has no ranking defect.",
  "Per-candidate production signals, scores, and selection-stage traces were unavailable.",
  "The correlated comparative-review selection is not ground truth.",
  "Candidate paths and snapshot content can permit repository or ecosystem inference.",
  "Safe snapshot projection may be incomplete.",
  "No product change is authorized by this evidence.",
  "Independent human label review remains separately governance-blocked.",
  "The frozen D.2A development gates remain failed."
]);

/**
 * Validate the retained packet on both sides of a stable, strict result read.
 *
 * @param {{
 *   packetRoot: string,
 *   expected: RankingExpected,
 *   testHooks?: {
 *     afterStaticValidation?: (proof: object) => void,
 *     duringResultRead?: (file: string) => void,
 *     afterResultRead?: (value: {
 *       resultPath: string,
 *       resultBytes: Buffer,
 *       result: object
 *     }) => void
 *   }
 * }} options
 */
export function validateCompletedRankingEvidence(options) {
  validateExpected(options.expected);
  const before = validateRankingStatic(options);
  options.testHooks?.afterStaticValidation?.(before);
  const resultPath = containedFile(
    before.packet.packet_root,
    `output/${RANKING_PRESERVED_RESULT}`
  );
  const resultBytes = readStableRankingResult(
    resultPath,
    { afterOpen: options.testHooks?.duringResultRead }
  );
  const resultSha256 = sha256(resultBytes);
  if (resultSha256 !== before.result_sha256) {
    throw new Error("Ranking result changed after static validation.");
  }
  const result = validateRankingResultBytes(resultBytes, before.packet);
  options.testHooks?.afterResultRead?.({
    resultPath,
    resultBytes,
    result
  });
  const after = validateRankingStatic(options);
  assertDeepEqual(
    before,
    after,
    "Ranking packet inputs changed around result parsing."
  );
  return {
    static_packet: after.packet,
    controlled_state_sha256: after.controlled_state_sha256,
    formal_result_valid: true,
    controlled_inputs_unchanged: true,
    schema_version: result.schema_version,
    reviewer_outcome: result.outcome,
    hypothesis_count: result.hypotheses.length,
    result_sha256: resultSha256,
    result_bytes: resultBytes,
    result
  };
}

/**
 * Generate canonical preservation bytes without publishing them.
 *
 * @param {{
 *   packetRoot: string,
 *   repoRoot: string,
 *   expected: RankingExpected,
 *   testHooks?: Parameters<typeof validateCompletedRankingEvidence>[0]["testHooks"]
 * }} options
 */
export function generateRankingEvidence(options) {
  const validated = validateCompletedRankingEvidence(options);
  const repoRoot = canonicalDirectory(options.repoRoot, "repository root");
  const relativeResult =
    `eval/results/d2d-ranking-${validated.result_sha256.slice(0, 8)}/` +
    RANKING_PRESERVED_RESULT;
  const manifest = buildRankingEvidenceManifest({
    expected: options.expected,
    validated,
    preservedResultPath: relativeResult
  });
  return {
    repo_root: repoRoot,
    destination_name:
      `d2d-ranking-${validated.result_sha256.slice(0, 8)}`,
    validated,
    manifest,
    manifest_bytes: canonicalBytes(manifest)
  };
}

/**
 * Independently generate the evidence twice, require byte identity, then
 * atomically publish it through an absent-directory rename.
 *
 * @param {{
 *   packetRoot: string,
 *   repoRoot: string,
 *   expected: RankingExpected,
 *   testHooks?: {
 *     beforePublish?: (value: {destination:string, staging:string}) => void
 *   }
 * }} options
 */
export function preserveRankingEvidence(options) {
  const first = generateRankingEvidence(options);
  const second = generateRankingEvidence(options);
  return publishGeneratedRankingEvidence(first, second, options.testHooks);
}

/**
 * Publish two already independent generations. Exported so synthetic tests
 * can exercise atomic publication without reading a retained corpus.
 *
 * @param {ReturnType<typeof generateRankingEvidence>} first
 * @param {ReturnType<typeof generateRankingEvidence>} second
 * @param {{beforePublish?: (value:{destination:string,staging:string}) => void}} [testHooks]
 */
export function publishGeneratedRankingEvidence(
  first,
  second,
  testHooks = {}
) {
  if (
    !first.validated.result_bytes.equals(second.validated.result_bytes) ||
    !first.manifest_bytes.equals(second.manifest_bytes)
  ) {
    throw new Error(
      "Independent ranking evidence generations were not byte-identical."
    );
  }
  validateRankingEvidenceManifest(first.manifest);
  const result = parseStrictJson(
    first.validated.result_bytes,
    "generated ranking result"
  );
  if (
    first.destination_name !== second.destination_name ||
    first.repo_root !== second.repo_root ||
    first.destination_name !==
      `d2d-ranking-${first.validated.result_sha256.slice(0, 8)}` ||
    sha256(first.validated.result_bytes) !==
      first.validated.result_sha256 ||
    !first.manifest_bytes.equals(canonicalBytes(first.manifest)) ||
    first.manifest.result.sha256 !== first.validated.result_sha256 ||
    first.manifest.result.byte_count !==
      first.validated.result_bytes.length ||
    first.manifest.result.preserved_path !==
      `eval/results/${first.destination_name}/${RANKING_PRESERVED_RESULT}` ||
    result.schema_version !== RESULT_SCHEMA ||
    result.packet_commitment !== first.manifest.packet.commitment ||
    result.outcome !== first.manifest.result.reviewer_outcome ||
    !Array.isArray(result.hypotheses) ||
    result.hypotheses.length !== first.manifest.result.hypothesis_count
  ) {
    throw new Error("Generated ranking evidence bindings are invalid.");
  }
  const resultsRoot = containedDirectory(first.repo_root, "eval/results");
  const destination = prepareAbsentOutput(
    path.join(resultsRoot, first.destination_name)
  );
  const stagingName =
    `.${destination.name}.staging-${process.pid}-${crypto.randomUUID()}`;
  const staging = path.join(destination.parent, stagingName);
  fs.mkdirSync(staging, { recursive: false, mode: 0o700 });
  let completed = false;
  try {
    writeNewFile(
      path.join(staging, RANKING_PRESERVED_RESULT),
      first.validated.result_bytes
    );
    writeNewFile(
      path.join(staging, RANKING_EVIDENCE_MANIFEST),
      first.manifest_bytes
    );
    testHooks.beforePublish?.({
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
    RANKING_PRESERVED_RESULT
  );
  const preservedManifest = containedFile(
    destination.path,
    RANKING_EVIDENCE_MANIFEST
  );
  const resultBytes = readStableRegularFile(
    preservedResult,
    D2D_LIMITS.max_result_bytes
  );
  const manifestBytes = readStableRegularFile(
    preservedManifest,
    256 * 1024
  );
  if (
    !resultBytes.equals(first.validated.result_bytes) ||
    sha256(resultBytes) !== first.validated.result_sha256
  ) {
    throw new Error("Preserved ranking result bytes changed.");
  }
  if (!manifestBytes.equals(first.manifest_bytes)) {
    throw new Error("Preserved ranking evidence manifest bytes changed.");
  }
  return {
    destination: destination.path,
    preserved_result: preservedResult,
    preserved_result_sha256: first.validated.result_sha256,
    preserved_result_bytes: first.validated.result_bytes.length,
    evidence_manifest: preservedManifest,
    evidence_manifest_sha256: sha256(manifestBytes),
    reviewer_outcome: first.validated.reviewer_outcome,
    formal_result_valid: true,
    controlled_inputs_unchanged: true,
    independent_generation_byte_identical: true
  };
}

/**
 * Strictly parse and formally validate exact ranking-result bytes.
 *
 * @param {Buffer} bytes
 * @param {Parameters<typeof validateRankingResult>[1]} validation
 */
export function validateRankingResultBytes(bytes, validation) {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length < 1 ||
    bytes.length > D2D_LIMITS.max_result_bytes
  ) {
    throw new Error("Ranking result bytes are empty or oversized.");
  }
  const result = parseStrictJson(bytes, "ranking result");
  validateRankingResult(result, validation);
  return result;
}

/**
 * Read exact result bytes while binding both the opened descriptor and the
 * path identity across the read.
 *
 * @param {string} file
 * @param {{afterOpen?: (file:string) => void}} [options]
 */
export function readStableRankingResult(file, options = {}) {
  const before = fs.lstatSync(file, { bigint: true });
  const bytes = readStableRegularFile(
    file,
    D2D_LIMITS.max_result_bytes,
    options
  );
  const after = fs.lstatSync(file, { bigint: true });
  if (!sameStableStat(before, after)) {
    throw new Error("Ranking result path changed during its stable read.");
  }
  return bytes;
}

/**
 * @param {{
 *   expected: RankingExpected,
 *   validated: ReturnType<typeof validateCompletedRankingEvidence>,
 *   preservedResultPath: string
 * }} options
 */
export function buildRankingEvidenceManifest(options) {
  const packet = options.validated.static_packet;
  const manifest = {
    schema_version: RANKING_EVIDENCE_SCHEMA,
    preparation_commit: options.expected.preparationCommit,
    packet: {
      commitment: packet.packet_hash,
      manifest_sha256: packet.packet_manifest_sha256,
      snapshot_tree_sha256: packet.snapshot_tree_sha256,
      production_source_sha256: packet.production_source_sha256,
      reviewer_prompt_sha256: options.expected.reviewerPromptSha256,
      result_schema_sha256: options.expected.resultSchemaSha256,
      case_count: packet.case_count,
      candidate_count: packet.candidate_count
    },
    result: {
      sha256: options.validated.result_sha256,
      byte_count: options.validated.result_bytes.length,
      schema_version: options.validated.schema_version,
      formal_validation: "passed",
      reviewer_outcome: options.validated.reviewer_outcome,
      hypothesis_count: options.validated.hypothesis_count,
      preserved_path: options.preservedResultPath
    },
    controlled_packet_state: {
      unchanged_before_after_parsing:
        options.validated.controlled_inputs_unchanged,
      state_sha256: options.validated.controlled_state_sha256
    },
    production_artifact_sha256:
      options.expected.productionArtifactSha256,
    evidence_limitations: [...EVIDENCE_LIMITATIONS]
  };
  validateRankingEvidenceManifest(manifest);
  return manifest;
}

/**
 * @param {unknown} value
 */
export function validateRankingEvidenceManifest(value) {
  if (
    !plainRecord(value) ||
    !exactKeys(value, [
      "controlled_packet_state",
      "evidence_limitations",
      "packet",
      "preparation_commit",
      "production_artifact_sha256",
      "result",
      "schema_version"
    ]) ||
    value.schema_version !== RANKING_EVIDENCE_SCHEMA ||
    !COMMIT.test(value.preparation_commit) ||
    !HASH.test(value.production_artifact_sha256) ||
    !plainRecord(value.packet) ||
    !exactKeys(value.packet, [
      "candidate_count",
      "case_count",
      "commitment",
      "manifest_sha256",
      "production_source_sha256",
      "result_schema_sha256",
      "reviewer_prompt_sha256",
      "snapshot_tree_sha256"
    ]) ||
    !Number.isSafeInteger(value.packet.case_count) ||
    value.packet.case_count < 1 ||
    value.packet.case_count > D2D_LIMITS.max_cases ||
    !Number.isSafeInteger(value.packet.candidate_count) ||
    value.packet.candidate_count < 1 ||
    value.packet.candidate_count > D2D_LIMITS.max_candidates ||
    [
      value.packet.commitment,
      value.packet.manifest_sha256,
      value.packet.production_source_sha256,
      value.packet.result_schema_sha256,
      value.packet.reviewer_prompt_sha256,
      value.packet.snapshot_tree_sha256
    ].some((item) => !HASH.test(item)) ||
    !plainRecord(value.result) ||
    !exactKeys(value.result, [
      "byte_count",
      "formal_validation",
      "hypothesis_count",
      "preserved_path",
      "reviewer_outcome",
      "schema_version",
      "sha256"
    ]) ||
    !HASH.test(value.result.sha256) ||
    !Number.isSafeInteger(value.result.byte_count) ||
    value.result.byte_count < 1 ||
    value.result.byte_count > D2D_LIMITS.max_result_bytes ||
    value.result.schema_version !== RESULT_SCHEMA ||
    value.result.formal_validation !== "passed" ||
    !RESULT_OUTCOMES.includes(value.result.reviewer_outcome) ||
    !Number.isSafeInteger(value.result.hypothesis_count) ||
    value.result.hypothesis_count < 0 ||
    value.result.hypothesis_count > 3 ||
    (
      value.result.reviewer_outcome === "no-generic-hypothesis" &&
      value.result.hypothesis_count !== 0
    ) ||
    (
      value.result.reviewer_outcome === "generic-hypotheses" &&
      value.result.hypothesis_count < 1
    ) ||
    typeof value.result.preserved_path !== "string" ||
    !/^eval\/results\/d2d-ranking-[0-9a-f]{8}\/ranking-result\.json$/.test(
      value.result.preserved_path
    ) ||
    !value.result.preserved_path.includes(
      `d2d-ranking-${value.result.sha256.slice(0, 8)}/`
    ) ||
    !plainRecord(value.controlled_packet_state) ||
    !exactKeys(value.controlled_packet_state, [
      "state_sha256",
      "unchanged_before_after_parsing"
    ]) ||
    value.controlled_packet_state.unchanged_before_after_parsing !== true ||
    !HASH.test(value.controlled_packet_state.state_sha256) ||
    !Array.isArray(value.evidence_limitations) ||
    canonicalJson(value.evidence_limitations) !==
      canonicalJson(EVIDENCE_LIMITATIONS)
  ) {
    throw new Error("Ranking evidence manifest is invalid.");
  }
  return true;
}

/**
 * Parse RFC 8259 JSON while rejecting duplicate object member names.
 *
 * @param {Buffer} bytes
 * @param {string} label
 */
export function parseStrictJson(bytes, label) {
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} is not valid UTF-8 JSON.`);
  }
  let index = 0;
  const whitespace = () => {
    while (/[\u0020\u000a\u000d\u0009]/.test(source[index] || "")) {
      index += 1;
    }
  };
  const parseString = () => {
    const start = index;
    if (source[index] !== "\"") {
      throw new Error(`${label} is not strict JSON.`);
    }
    index += 1;
    while (index < source.length) {
      const current = source[index];
      if (current === "\"") {
        index += 1;
        return JSON.parse(source.slice(start, index));
      }
      if (current === "\\") {
        index += 1;
        const escape = source[index];
        if (escape === "u") {
          const digits = source.slice(index + 1, index + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(digits)) {
            throw new Error(`${label} is not strict JSON.`);
          }
          index += 5;
          continue;
        }
        if (!"\"\\/bfnrt".includes(escape || "")) {
          throw new Error(`${label} is not strict JSON.`);
        }
        index += 1;
        continue;
      }
      if (
        current === undefined ||
        current.charCodeAt(0) <= 0x1f
      ) {
        throw new Error(`${label} is not strict JSON.`);
      }
      index += 1;
    }
    throw new Error(`${label} is not strict JSON.`);
  };
  const parseValue = () => {
    whitespace();
    const current = source[index];
    if (current === "{") {
      index += 1;
      whitespace();
      const keys = new Set();
      if (source[index] === "}") {
        index += 1;
        return;
      }
      while (index < source.length) {
        const key = parseString();
        if (keys.has(key)) {
          throw new Error(`${label} contains a duplicate object key.`);
        }
        keys.add(key);
        whitespace();
        if (source[index] !== ":") {
          throw new Error(`${label} is not strict JSON.`);
        }
        index += 1;
        parseValue();
        whitespace();
        if (source[index] === "}") {
          index += 1;
          return;
        }
        if (source[index] !== ",") {
          throw new Error(`${label} is not strict JSON.`);
        }
        index += 1;
        whitespace();
      }
    } else if (current === "[") {
      index += 1;
      whitespace();
      if (source[index] === "]") {
        index += 1;
        return;
      }
      while (index < source.length) {
        parseValue();
        whitespace();
        if (source[index] === "]") {
          index += 1;
          return;
        }
        if (source[index] !== ",") {
          throw new Error(`${label} is not strict JSON.`);
        }
        index += 1;
      }
    } else if (current === "\"") {
      parseString();
    } else {
      const rest = source.slice(index);
      const token = rest.match(
        /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/
      )?.[0];
      if (!token) {
        throw new Error(`${label} is not strict JSON.`);
      }
      index += token.length;
    }
  };
  try {
    parseValue();
    whitespace();
    if (index !== source.length) {
      throw new Error(`${label} is not strict JSON.`);
    }
    const value = JSON.parse(source);
    if (!plainRecord(value)) {
      throw new Error(`${label} root must be an object.`);
    }
    return value;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith(`${label} `)
    ) {
      throw error;
    }
    throw new Error(`${label} is not strict JSON.`);
  }
}

function validateRankingStatic(options) {
  const packet = validateRankingDocket(options.packetRoot, {
    allowedOutputFiles: [RANKING_PRESERVED_RESULT]
  });
  const resultBytes = readStableRankingResult(
    containedFile(
      packet.packet_root,
      `output/${RANKING_PRESERVED_RESULT}`
    )
  );
  const promptSha256 = sha256(readStableRegularFile(
    containedFile(packet.packet_root, "README-FIRST.txt"),
    128 * 1024
  ));
  const schemaSha256 = sha256(readStableRegularFile(
    containedFile(packet.packet_root, "ranking-result.schema.json"),
    256 * 1024
  ));
  const comparisons = [
    [packet.packet_hash, options.expected.packetHash, "packet"],
    [
      packet.packet_manifest_sha256,
      options.expected.packetManifestSha256,
      "packet manifest"
    ],
    [
      packet.snapshot_tree_sha256,
      options.expected.snapshotTreeSha256,
      "snapshot tree"
    ],
    [
      packet.production_source_sha256,
      options.expected.productionSourceSha256,
      "production source"
    ],
    [promptSha256, options.expected.reviewerPromptSha256, "reviewer prompt"],
    [schemaSha256, options.expected.resultSchemaSha256, "result schema"],
    [packet.case_count, options.expected.caseCount, "case count"],
    [packet.candidate_count, options.expected.candidateCount, "candidate count"]
  ];
  for (const [received, expected, label] of comparisons) {
    if (received !== expected) {
      throw new Error(
        `Retained ranking ${label} differs from frozen evidence.`
      );
    }
  }
  return {
    packet,
    result_sha256: sha256(resultBytes),
    reviewer_prompt_sha256: promptSha256,
    result_schema_sha256: schemaSha256,
    controlled_state_sha256:
      packetStateFingerprint(packet.packet_root)
  };
}

function packetStateFingerprint(root) {
  const collect = () => {
    const entries = [];
    const pending = [{ absolute: root, relative: "." }];
    while (pending.length) {
      const current = pending.pop();
      const stat = fs.lstatSync(current.absolute, { bigint: true });
      const type = stat.isDirectory()
        ? "directory"
        : stat.isFile()
          ? "file"
          : "other";
      if (type === "other" || stat.isSymbolicLink()) {
        throw new Error("Ranking packet state contains an indirect entry.");
      }
      entries.push({
        path: current.relative,
        type,
        dev: String(stat.dev),
        ino: String(stat.ino),
        mode: String(stat.mode),
        nlink: String(stat.nlink),
        size: String(stat.size),
        mtime_ns: String(stat.mtimeNs),
        ctime_ns: String(stat.ctimeNs)
      });
      if (type === "directory") {
        const children = fs.readdirSync(current.absolute)
          .sort(compareText)
          .reverse();
        for (const name of children) {
          pending.push({
            absolute: path.join(current.absolute, name),
            relative:
              current.relative === "." ? name : `${current.relative}/${name}`
          });
        }
      }
    }
    return sha256(Buffer.from(canonicalJson(entries)));
  };
  const before = collect();
  const after = collect();
  if (before !== after) {
    throw new Error("Ranking packet identity changed during state capture.");
  }
  return after;
}

function validateExpected(value) {
  if (
    !plainRecord(value) ||
    !exactKeys(value, [
      "candidateCount",
      "caseCount",
      "packetHash",
      "packetManifestSha256",
      "preparationCommit",
      "productionArtifactSha256",
      "productionSourceSha256",
      "resultSchemaSha256",
      "reviewerPromptSha256",
      "snapshotTreeSha256"
    ]) ||
    !COMMIT.test(value.preparationCommit) ||
    [
      value.packetHash,
      value.packetManifestSha256,
      value.productionArtifactSha256,
      value.productionSourceSha256,
      value.resultSchemaSha256,
      value.reviewerPromptSha256,
      value.snapshotTreeSha256
    ].some((item) => !HASH.test(item)) ||
    !Number.isSafeInteger(value.caseCount) ||
    value.caseCount < 1 ||
    value.caseCount > D2D_LIMITS.max_cases ||
    !Number.isSafeInteger(value.candidateCount) ||
    value.candidateCount < 1 ||
    value.candidateCount > D2D_LIMITS.max_candidates
  ) {
    throw new Error("Frozen ranking expectations are invalid.");
  }
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalJson(value)}\n`);
}

function containedDirectory(root, relativePath) {
  const selected = path.join(root, relativePath);
  const canonical = fs.realpathSync.native
    ? fs.realpathSync.native(selected)
    : fs.realpathSync(selected);
  const relative = path.relative(root, canonical);
  const stat = fs.lstatSync(canonical);
  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    !stat.isDirectory() ||
    stat.isSymbolicLink()
  ) {
    throw new Error("Ranking evidence destination is unsafe.");
  }
  return canonical;
}

function refuseExistingPath(target) {
  try {
    fs.lstatSync(target);
    throw new Error("Ranking evidence destination appeared before publish.");
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }
}

function plainRecord(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactKeys(value, expected) {
  return (
    plainRecord(value) &&
    canonicalJson(Object.keys(value).sort(compareText)) ===
      canonicalJson([...expected].sort(compareText))
  );
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * @typedef {{
 *   preparationCommit: string,
 *   packetHash: string,
 *   packetManifestSha256: string,
 *   snapshotTreeSha256: string,
 *   productionSourceSha256: string,
 *   reviewerPromptSha256: string,
 *   resultSchemaSha256: string,
 *   caseCount: number,
 *   candidateCount: number,
 *   productionArtifactSha256: string
 * }} RankingExpected
 */
