import crypto from "node:crypto";
import {
  hasExactKeys,
  isBoundedString,
  isNonnegativeSafeInteger,
  isPlainRecord
} from "./trust.js";

const DIGEST = /^[0-9a-f]{64}$/;
const UNSAFE_OPAQUE_ID =
  /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
const MAX_DATE_MS = 8_640_000_000_000_000;
export const RECEIPT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

/**
 * @typedef {{
 *   host: "codex-cli" | "claude-code",
 *   id: string
 * }} ReceiptHostSession
 * @typedef {{
 *   host: "codex-cli" | "claude-code",
 *   session_id: string,
 *   compaction_id: string,
 *   lifecycle_id: string
 * }} ReceiptHostEvidence
 * @typedef {{
 *   schema: "kanon-context-receipt-v2",
 *   enforcement: false,
 *   provenance: "explicit-orient",
 *   issued_at: number,
 *   root_sha256: string,
 *   task_sha256: string,
 *   evidence_sha256: string,
 *   host_evidence_sha256: string | null
 * }} ContextReceipt
 * @typedef {{
 *   status: "Known",
 *   freshness: "Current",
 *   diagnostic: string
 * } | {
 *   status: "Stale",
 *   freshness: "Stale",
 *   diagnostic: string
 * } | {
 *   status: "Unknown",
 *   freshness: "Unknown",
 *   diagnostic: string
 * }} ReceiptVerification
 */

/**
 * Create the minimal advisory receipt issued by an explicit orient
 * invocation. Host evidence is bound only when session, compaction, lifecycle,
 * and host observations are all available.
 *
 * @param {{
 *   root: string,
 *   task: string,
 *   evidence_sha256: string,
 *   host_evidence?: unknown,
 *   now: number
 * }} input
 * @returns {ContextReceipt}
 */
export function createContextReceipt(input) {
  if (
    !isBoundedString(input.root, 8_192) ||
    !isBoundedString(input.task, 2_048) ||
    !isDigest(input.evidence_sha256) ||
    !validTime(input.now)
  ) {
    throw new Error("Receipt bindings were unavailable or invalid.");
  }
  return {
    schema: "kanon-context-receipt-v2",
    enforcement: false,
    provenance: "explicit-orient",
    issued_at: input.now,
    root_sha256: receiptRootSha256(input.root),
    task_sha256: digest(input.task),
    evidence_sha256: input.evidence_sha256,
    host_evidence_sha256:
      isReceiptHostEvidence(input.host_evidence)
        ? digestHostEvidence(input.host_evidence)
        : null
  };
}

/**
 * @param {unknown} value
 * @returns {value is ContextReceipt}
 */
export function isContextReceipt(value) {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, [
      "enforcement",
      "evidence_sha256",
      "host_evidence_sha256",
      "issued_at",
      "provenance",
      "root_sha256",
      "schema",
      "task_sha256"
    ]) &&
    value.schema === "kanon-context-receipt-v2" &&
    value.enforcement === false &&
    value.provenance === "explicit-orient" &&
    validTime(value.issued_at) &&
    isDigest(value.root_sha256) &&
    isDigest(value.task_sha256) &&
    isDigest(value.evidence_sha256) &&
    (
      value.host_evidence_sha256 === null ||
      isDigest(value.host_evidence_sha256)
    )
  );
}

/**
 * Verify direct receipt bindings against a fresh bounded inspection. Only
 * root, task, and evidence contradictions produce Stale. Missing or
 * contradicting session, compaction, lifecycle, or host observations remain
 * Unknown under the receipt-only contract.
 *
 * @param {unknown} receipt
 * @param {{
 *   root: string,
 *   task: string,
 *   evidence_sha256: string,
 *   evidence_complete: boolean,
 *   host_evidence?: unknown,
 *   now: number
 * }} current
 * @returns {ReceiptVerification}
 */
export function verifyContextReceipt(receipt, current) {
  if (!isContextReceipt(receipt)) {
    return unknownReceipt("Receipt data was unavailable or invalid.");
  }
  if (
    !isPlainRecord(current) ||
    !isBoundedString(current.root, 8_192) ||
    !isBoundedString(current.task, 2_048) ||
    !isDigest(current.evidence_sha256) ||
    typeof current.evidence_complete !== "boolean" ||
    !validTime(current.now)
  ) {
    return unknownReceipt(
      "Current receipt comparison evidence was unavailable or invalid."
    );
  }
  if (
    receipt.issued_at > current.now ||
    current.now - receipt.issued_at > RECEIPT_RETENTION_MS
  ) {
    return unknownReceipt(
      "Receipt age fell outside the bounded retention window."
    );
  }
  if (
    receipt.root_sha256 !== receiptRootSha256(current.root) ||
    receipt.task_sha256 !== digest(current.task) ||
    receipt.evidence_sha256 !== current.evidence_sha256
  ) {
    return {
      status: "Stale",
      freshness: "Stale",
      diagnostic:
        "The receipt directly contradicts current root, task, or evidence bindings."
    };
  }
  if (current.evidence_complete !== true) {
    return unknownReceipt(
      "Receipt bindings match the available observation, but incomplete evidence prevents a Current conclusion."
    );
  }
  if (
    receipt.host_evidence_sha256 === null ||
    !isReceiptHostEvidence(current.host_evidence)
  ) {
    return unknownReceipt(
      "Receipt root, task, and evidence bindings match, but session, compaction, lifecycle, or host evidence is unavailable."
    );
  }
  if (
    receipt.host_evidence_sha256 !==
    digestHostEvidence(current.host_evidence)
  ) {
    return unknownReceipt(
      "Available host lifecycle evidence does not match; the receipt-only contract does not promote that observation to Stale."
    );
  }
  return {
    status: "Known",
    freshness: "Current",
    diagnostic:
      "Receipt root, task, evidence, session, compaction, lifecycle, and host bindings match current observations."
  };
}

/**
 * Status does not rescan repository evidence. It can establish schema,
 * retention, and canonical-root availability, but freshness remains Unknown
 * unless a direct root contradiction proves Stale.
 *
 * @param {unknown} receipt
 * @param {string} canonicalRoot
 * @param {number} now
 * @returns {{
 *   status: "Available" | "Stale" | "Unknown",
 *   freshness: "Unknown" | "Stale",
 *   diagnostic: string
 * }}
 */
export function inspectReceiptStatus(receipt, canonicalRoot, now) {
  if (receipt === undefined || receipt === null) {
    return {
      status: "Unknown",
      freshness: "Unknown",
      diagnostic:
        "No valid in-memory or plugin-data receipt was available."
    };
  }
  if (
    !isContextReceipt(receipt) ||
    !isBoundedString(canonicalRoot, 8_192) ||
    !validTime(now)
  ) {
    return {
      status: "Unknown",
      freshness: "Unknown",
      diagnostic: "Receipt data was unavailable or invalid."
    };
  }
  if (
    receipt.issued_at > now ||
    now - receipt.issued_at > RECEIPT_RETENTION_MS
  ) {
    return {
      status: "Unknown",
      freshness: "Unknown",
      diagnostic:
        "Receipt age fell outside the bounded retention window."
    };
  }
  if (receipt.root_sha256 !== receiptRootSha256(canonicalRoot)) {
    return {
      status: "Stale",
      freshness: "Stale",
      diagnostic:
        "The receipt directly contradicts the active repository root."
    };
  }
  return {
    status: "Available",
    freshness: "Unknown",
    diagnostic:
      "Receipt data is available, but status does not rescan task, evidence, or host lifecycle observations."
  };
}

/**
 * @param {unknown} value
 * @returns {value is ReceiptHostEvidence}
 */
export function isReceiptHostEvidence(value) {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, [
      "compaction_id",
      "host",
      "lifecycle_id",
      "session_id"
    ]) &&
    (value.host === "codex-cli" || value.host === "claude-code") &&
    isOpaqueId(value.session_id) &&
    isOpaqueId(value.compaction_id) &&
    isOpaqueId(value.lifecycle_id)
  );
}

/**
 * @param {unknown} value
 * @returns {value is ReceiptHostSession}
 */
export function isReceiptHostSession(value) {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, ["host", "id"]) &&
    (value.host === "codex-cli" || value.host === "claude-code") &&
    isBoundedString(value.id, 256)
  );
}

/**
 * @param {string} canonicalRoot
 * @returns {string}
 */
export function receiptRootSha256(canonicalRoot) {
  return digest(canonicalRoot);
}

/**
 * @param {ReceiptHostEvidence} value
 * @returns {string}
 */
function digestHostEvidence(value) {
  return digest(
    [
      value.host,
      value.session_id,
      value.compaction_id,
      value.lifecycle_id
    ].join("\0")
  );
}

/**
 * @param {string} diagnostic
 * @returns {ReceiptVerification}
 */
function unknownReceipt(diagnostic) {
  return {
    status: "Unknown",
    freshness: "Unknown",
    diagnostic
  };
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function validTime(value) {
  return (
    isNonnegativeSafeInteger(value) &&
    value <= MAX_DATE_MS
  );
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isOpaqueId(value) {
  return (
    isBoundedString(value, 256) &&
    !UNSAFE_OPAQUE_ID.test(value)
  );
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isDigest(value) {
  return typeof value === "string" && DIGEST.test(value);
}

/**
 * @param {string} value
 * @returns {string}
 */
function digest(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}
