import {
  readEmbeddedBuildMetadata
} from "../core/build-metadata.js";
import { inspectReceiptStatus } from "../core/receipt.js";
import {
  isPlainRecord,
  repositoryIdentifier,
  sanitizeDisplayText
} from "../core/trust.js";
import { canonicalizeRepositoryRoot } from "../repository/read.js";
import { REPOSITORY_TRUST_BOUNDARY } from "./orient.js";

/**
 * @typedef {"codex-cli" | "claude-code" | "Unknown"} StatusHost
 * @typedef {{
 *   root: string,
 *   receipt?: unknown
 * }} StatusInput
 * @typedef {{
 *   host: StatusHost,
 *   deprecation_status?: unknown
 * }} StatusContext
 * @typedef {{
 *   schema: "kanon-status-report-v1",
 *   ok: true,
 *   status: "Known" | "Unknown",
 *   read_only: true,
 *   enforcement: false,
 *   trust_boundary: string,
 *   repository_root: {
 *     status: "Known",
 *     value: import("../core/trust.js").RepositoryValue
 *   } | {
 *     status: "Unknown"
 *   },
 *   embedded_version: {
 *     status: "Known",
 *     package_name: string,
 *     package_version: string,
 *     plugin_name: "kanon"
 *   } | {
 *     status: "Unknown"
 *   },
 *   deprecation_status: "Current" | "Deprecated" | "Unknown",
 *   active_host: StatusHost,
 *   hosts: {
 *     "codex-cli": {
 *       mode: "notice",
 *       enforcement: false,
 *       hook_status: "Unknown",
 *       lifecycle_notice_hook: "Unavailable",
 *       notice_delivery: "explicit-skill-and-status-output"
 *     },
 *     "claude-code": {
 *       mode: "notice",
 *       enforcement: false,
 *       hook_status: "Unknown",
 *       lifecycle_notice_hook: "Unavailable",
 *       notice_delivery: "explicit-skill-and-status-output"
 *     }
 *   } | null,
 *   notice: {
 *     advisory: true,
 *     automatic: false,
 *     blocks: false,
 *     rewrites: false,
 *     approves: false,
 *     suppresses: false,
 *     forces_reading: false,
 *     claims_understanding: false,
 *     delivery: "explicit-skill-and-status-output",
 *     future_requirement: "host-and-platform-specific-proven-executable-argument-vector-and-environment-boundary"
 *   } | null,
 *   receipt: ReturnType<typeof inspectReceiptStatus>,
 *   diagnostics: string[]
 * }} StatusReport
 */

/**
 * @param {StatusInput} input
 * @param {StatusContext} context
 * @returns {StatusReport}
 */
export function runStatus(input, context) {
  const root = canonicalizeRepositoryRoot(input.root);
  const metadata = readEmbeddedBuildMetadata();
  const deprecationStatus = normalizeDeprecationStatus(
    context.deprecation_status
  );
  const receipt = root.ok
    ? inspectReceiptStatus(input.receipt, root.root)
    : {
        status: /** @type {"Unknown"} */ ("Unknown"),
        freshness: /** @type {"Unknown"} */ ("Unknown"),
        diagnostic:
          "Repository root was unavailable; receipt root binding could not be inspected."
      };
  /** @type {string[]} */
  const diagnostics = [];
  if (!root.ok) {
    diagnostics.push(root.diagnostic);
  }
  if (!metadata.ok) {
    diagnostics.push(metadata.diagnostic);
  }
  if (deprecationStatus === "Unknown") {
    diagnostics.push(
      "Exact-version deprecation status was unavailable."
    );
  }
  if (context.host === "Unknown") {
    diagnostics.push(
      "Active host introspection was unavailable; host state remains Unknown."
    );
  }
  diagnostics.push(
    "Automatic lifecycle notice is unavailable. Any future host-specific lifecycle notice requires a separately proven executable, argument-vector, and environment boundary."
  );
  diagnostics.push(receipt.diagnostic);
  return {
    schema: "kanon-status-report-v1",
    ok: true,
    status:
      metadata.ok &&
      deprecationStatus !== "Unknown" &&
      context.host !== "Unknown" &&
      root.ok
        ? "Known"
        : "Unknown",
    read_only: true,
    enforcement: false,
    trust_boundary: REPOSITORY_TRUST_BOUNDARY,
    repository_root: root.ok
      ? {
          status: "Known",
          value: repositoryIdentifier(root.root, 8_192)
        }
      : { status: "Unknown" },
    embedded_version: metadata.ok
      ? {
          status: "Known",
          package_name: metadata.value.package_name,
          package_version: metadata.value.package_version,
          plugin_name: metadata.value.plugin_name
        }
      : { status: "Unknown" },
    deprecation_status: deprecationStatus,
    active_host: context.host,
    hosts: metadata.ok
      ? metadata.value.public_capabilities.hosts
      : null,
    notice: metadata.ok
      ? metadata.value.public_capabilities.notice
      : null,
    receipt,
    diagnostics: diagnostics
      .map((item) => sanitizeDisplayText(item, 512))
      .filter(Boolean)
      .slice(0, 8)
  };
}

/**
 * @param {unknown} value
 * @returns {"Current" | "Deprecated" | "Unknown"}
 */
function normalizeDeprecationStatus(value) {
  return (
    isPlainRecord(value) &&
    (
      value.status === "Current" ||
      value.status === "Deprecated" ||
      value.status === "Unknown"
    )
  )
    ? value.status
    : "Unknown";
}
