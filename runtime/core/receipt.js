import crypto from "node:crypto";
import {
  hasExactKeys,
  isBoundedString,
  isPlainRecord
} from "./trust.js";

/**
 * @typedef {{
 *   host: "codex-cli" | "claude-code",
 *   id: string
 * }} ReceiptHostSession
 * @typedef {{
 *   schema: "kanon-context-receipt-v1",
 *   enforcement: false,
 *   root_sha256: string,
 *   task_sha256: string,
 *   evidence_sha256: string,
 *   session_sha256: string | null
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
 * Create only the non-persisted receipt bindings required by slice 8.
 *
 * @param {{
 *   root: string,
 *   task: string,
 *   evidence_sha256: string,
 *   host_session?: unknown
 * }} input
 * @returns {ContextReceipt}
 */
export function createContextReceipt(input) {
  return {
    schema: "kanon-context-receipt-v1",
    enforcement: false,
    root_sha256: digest(input.root),
    task_sha256: digest(input.task),
    evidence_sha256: input.evidence_sha256,
    session_sha256:
      isReceiptHostSession(input.host_session)
        ? digest(`${input.host_session.host}\0${input.host_session.id}`)
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
      "root_sha256",
      "schema",
      "session_sha256",
      "task_sha256"
    ]) &&
    value.schema === "kanon-context-receipt-v1" &&
    value.enforcement === false &&
    isDigest(value.root_sha256) &&
    isDigest(value.task_sha256) &&
    isDigest(value.evidence_sha256) &&
    (value.session_sha256 === null || isDigest(value.session_sha256))
  );
}

/**
 * Verify direct receipt bindings against a fresh bounded inspection. A
 * missing host-session comparison remains Unknown rather than silently
 * becoming current.
 *
 * @param {unknown} receipt
 * @param {{
 *   root: string,
 *   task: string,
 *   evidence_sha256: string,
 *   evidence_complete: boolean,
 *   host_session?: unknown
 * }} current
 * @returns {ReceiptVerification}
 */
export function verifyContextReceipt(receipt, current) {
  if (!isContextReceipt(receipt)) {
    return {
      status: "Unknown",
      freshness: "Unknown",
      diagnostic: "Receipt data was unavailable or invalid."
    };
  }
  if (
    receipt.root_sha256 !== digest(current.root) ||
    receipt.task_sha256 !== digest(current.task) ||
    receipt.evidence_sha256 !== current.evidence_sha256
  ) {
    return {
      status: "Stale",
      freshness: "Stale",
      diagnostic:
        "The supplied receipt directly contradicts current root, task, or evidence bindings."
    };
  }
  if (current.evidence_complete !== true) {
    return {
      status: "Unknown",
      freshness: "Unknown",
      diagnostic:
        "Receipt bindings match the available observation, but incomplete evidence prevents a current-context conclusion."
    };
  }
  if (
    receipt.session_sha256 === null ||
    !isReceiptHostSession(current.host_session)
  ) {
    return {
      status: "Unknown",
      freshness: "Unknown",
      diagnostic:
        "Receipt root, task, and evidence bindings match, but host-session binding is unavailable."
    };
  }
  const activeSession = digest(
    `${current.host_session.host}\0${current.host_session.id}`
  );
  if (receipt.session_sha256 !== activeSession) {
    return {
      status: "Stale",
      freshness: "Stale",
      diagnostic:
        "The supplied receipt directly contradicts the active host-session binding."
    };
  }
  return {
    status: "Known",
    freshness: "Current",
    diagnostic:
      "Receipt session, task, root, and evidence bindings match current observations."
  };
}

/**
 * Status does not rescan repository evidence. It can establish schema and
 * canonical-root availability, but evidence freshness remains Unknown.
 *
 * @param {unknown} receipt
 * @param {string} canonicalRoot
 * @returns {{
 *   status: "Available" | "Stale" | "Unknown",
 *   freshness: "Unknown" | "Stale",
 *   diagnostic: string
 * }}
 */
export function inspectReceiptStatus(receipt, canonicalRoot) {
  if (receipt === undefined || receipt === null) {
    return {
      status: "Unknown",
      freshness: "Unknown",
      diagnostic:
        "No receipt was supplied; slice 8 has no persisted receipt lifecycle."
    };
  }
  if (!isContextReceipt(receipt)) {
    return {
      status: "Unknown",
      freshness: "Unknown",
      diagnostic: "Receipt data was unavailable or invalid."
    };
  }
  if (receipt.root_sha256 !== digest(canonicalRoot)) {
    return {
      status: "Stale",
      freshness: "Stale",
      diagnostic:
        "The supplied receipt directly contradicts the active repository root."
    };
  }
  return {
    status: "Available",
    freshness: "Unknown",
    diagnostic:
      "Receipt data is available, but status does not rescan evidence or infer freshness."
  };
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
 * @param {unknown} value
 * @returns {value is string}
 */
function isDigest(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/**
 * @param {string} value
 * @returns {string}
 */
function digest(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}
