import {
  readEmbeddedBuildMetadata
} from "../core/build-metadata.js";
import { inspectReceiptStatus } from "../core/receipt.js";
import {
  readContextReceiptStore
} from "../core/receipt-store.js";
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
 *   deprecation_status?: unknown,
 *   now?: number,
 *   plugin_data_root?: unknown
 * }} StatusContext
 * @typedef {{
 *   schema: "kanon-status-report-v1",
 *   ok: true,
 *   status: "Known" | "Unknown",
 *   read_only: true,
 *   repository_read_only: true,
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
 *   receipt_source: {
 *     status: "Known",
 *     medium: "explicit-input" | "plugin-data",
 *     diagnostic: string
 *   } | {
 *     status: "Unknown",
 *     medium: "unavailable",
 *     diagnostic: string
 *   },
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
  const now = context.now === undefined ? Date.now() : context.now;
  const metadata = readEmbeddedBuildMetadata();
  const deprecationStatus = normalizeDeprecationStatus(
    context.deprecation_status
  );
  const receiptSelection = root.ok
    ? selectReceipt(
        input.receipt,
        context.plugin_data_root,
        root.root,
        now
      )
    : unavailableReceiptSource(
        "Repository root was unavailable; plugin-data receipt scope could not be selected."
      );
  const receipt = root.ok
    ? inspectReceiptStatus(receiptSelection.receipt, root.root, now)
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
  if (receiptSelection.source.status === "Unknown") {
    diagnostics.push(receiptSelection.source.diagnostic);
  }
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
    repository_read_only: true,
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
    receipt_source: receiptSelection.source,
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

/**
 * @param {unknown} explicitReceipt
 * @param {unknown} pluginDataRoot
 * @param {string} repositoryRoot
 * @param {number} now
 * @returns {{
 *   receipt: unknown,
 *   source: StatusReport["receipt_source"]
 * }}
 */
function selectReceipt(
  explicitReceipt,
  pluginDataRoot,
  repositoryRoot,
  now
) {
  if (explicitReceipt !== undefined) {
    return {
      receipt: explicitReceipt,
      source: {
        status: "Known",
        medium: "explicit-input",
        diagnostic:
          "Receipt input was supplied explicitly and remains untrusted until validation."
      }
    };
  }
  const stored = readContextReceiptStore(
    pluginDataRoot,
    repositoryRoot,
    now
  );
  if (stored.ok && stored.found) {
    return {
      receipt: stored.receipt,
      source: {
        status: "Known",
        medium: "plugin-data",
        diagnostic:
          "A bounded receipt was loaded from validated plugin data."
      }
    };
  }
  return unavailableReceiptSource(
    stored.ok
      ? stored.diagnostic
      : "Safe plugin-data receipt storage was unavailable."
  );
}

/**
 * @param {string} diagnostic
 * @returns {{
 *   receipt: undefined,
 *   source: Extract<StatusReport["receipt_source"], {status: "Unknown"}>
 * }}
 */
function unavailableReceiptSource(diagnostic) {
  return {
    receipt: undefined,
    source: {
      status: "Unknown",
      medium: "unavailable",
      diagnostic
    }
  };
}
