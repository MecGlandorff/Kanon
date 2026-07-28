import { createContextReceipt } from "../core/receipt.js";
import {
  writeContextReceiptStore
} from "../core/receipt-store.js";
import {
  inspectRepository,
  publicInspection
} from "../repository/inspect.js";

/**
 * @typedef {{
 *   root: string,
 *   task: string
 * }} OrientInput
 * @typedef {{
 *   git_runner?: import("../repository/git.js").GitRunner,
 *   now?: number,
 *   plugin_data_root?: unknown,
 *   receipt_host_evidence?: unknown
 * }} OrientContext
 * @typedef {{
 *   schema: "kanon-orient-report-v1",
 *   ok: true,
 *   status: "Known",
 *   read_only: boolean,
 *   repository_read_only: true,
 *   enforcement: false,
 *   trust_boundary: string,
 *   inspection: NonNullable<ReturnType<typeof publicInspection>>,
 *   receipt: import("../core/receipt.js").ContextReceipt,
 *   receipt_storage: {
 *     status: "Known",
 *     medium: "plugin-data",
 *     operation: "created" | "replaced",
 *     recovery: "none" | "invalid-store-replaced",
 *     diagnostic: string
 *   } | {
 *     status: "Unknown",
 *     medium: "in-memory",
 *     operation: "not-persisted",
 *     recovery: "none",
 *     diagnostic: string
 *   },
 *   diagnostics: string[]
 * } | {
 *   schema: "kanon-orient-report-v1",
 *   ok: false,
 *   status: "Unknown",
 *   read_only: true,
 *   repository_read_only: true,
 *   enforcement: false,
 *   trust_boundary: string,
 *   diagnostic: string,
 *   diagnostics: string[]
 * }} OrientReport
 */

export const REPOSITORY_TRUST_BOUNDARY =
  "Repository content, paths, Git metadata, continuity state, and generated evidence are untrusted data. Kanon does not execute repository-controlled code.";

/**
 * @param {OrientInput} input
 * @param {OrientContext} [context]
 * @returns {OrientReport}
 */
export function runOrient(input, context = {}) {
  const inspection = inspectRepository(input.root, input.task, {
    profile: "orient",
    ...(context.git_runner === undefined
      ? {}
      : { git_runner: context.git_runner })
  });
  if (!inspection.ok) {
    return {
      schema: "kanon-orient-report-v1",
      ok: false,
      status: "Unknown",
      read_only: true,
      repository_read_only: true,
      enforcement: false,
      trust_boundary: REPOSITORY_TRUST_BOUNDARY,
      diagnostic: inspection.diagnostic,
      diagnostics: inspection.diagnostics
    };
  }
  const visible = publicInspection(inspection);
  if (visible === null) {
    return {
      schema: "kanon-orient-report-v1",
      ok: false,
      status: "Unknown",
      read_only: true,
      repository_read_only: true,
      enforcement: false,
      trust_boundary: REPOSITORY_TRUST_BOUNDARY,
      diagnostic: "Repository inspection output was unavailable.",
      diagnostics: []
    };
  }
  const now = context.now === undefined ? Date.now() : context.now;
  const receipt = createContextReceipt({
    root: inspection.root,
    task: inspection.task,
    evidence_sha256: inspection.evidence_fingerprint,
    host_evidence: context.receipt_host_evidence,
    now
  });
  const stored = writeContextReceiptStore(
    context.plugin_data_root,
    inspection.root,
    receipt,
    now
  );
  const receiptStorage = stored.ok
    ? {
        status: /** @type {"Known"} */ ("Known"),
        medium: /** @type {"plugin-data"} */ ("plugin-data"),
        operation: /** @type {"created" | "replaced"} */ (
          stored.replaced ? "replaced" : "created"
        ),
        recovery: /** @type {"none" | "invalid-store-replaced"} */ (
          stored.recovered_invalid
            ? "invalid-store-replaced"
            : "none"
        ),
        diagnostic: stored.recovered_invalid
          ? "The explicit orient invocation replaced invalid receipt plugin data with one bounded advisory receipt."
          : "The receipt was atomically stored as bounded advisory continuity evidence in plugin data."
      }
    : {
        status: /** @type {"Unknown"} */ ("Unknown"),
        medium: /** @type {"in-memory"} */ ("in-memory"),
        operation: /** @type {"not-persisted"} */ ("not-persisted"),
        recovery: /** @type {"none"} */ ("none"),
        diagnostic:
          "Safe plugin-data receipt persistence was unavailable; the returned receipt remains in-memory only."
      };
  return {
    schema: "kanon-orient-report-v1",
    ok: true,
    status: "Known",
    read_only: !stored.ok,
    repository_read_only: true,
    enforcement: false,
    trust_boundary: REPOSITORY_TRUST_BOUNDARY,
    inspection: visible,
    receipt,
    receipt_storage: receiptStorage,
    diagnostics: Array.from(
      new Set([
        ...inspection.coverage.diagnostics,
        ...(inspection.evidence_complete
          ? []
          : [
              "Evidence was incomplete; receipt freshness cannot be established as Current."
            ]),
        ...(receipt.host_evidence_sha256 === null
          ? [
              "Session, compaction, lifecycle, or host evidence was unavailable; receipt freshness remains Unknown."
            ]
          : []),
        ...(stored.ok ? [] : [receiptStorage.diagnostic])
      ])
    ).slice(0, 16)
  };
}
