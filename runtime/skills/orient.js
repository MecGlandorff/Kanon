import { createContextReceipt } from "../core/receipt.js";
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
 *   host_session?: unknown,
 *   git_runner?: import("../repository/git.js").GitRunner
 * }} OrientContext
 * @typedef {{
 *   schema: "kanon-orient-report-v1",
 *   ok: true,
 *   status: "Known",
 *   read_only: true,
 *   enforcement: false,
 *   trust_boundary: string,
 *   inspection: NonNullable<ReturnType<typeof publicInspection>>,
 *   receipt: import("../core/receipt.js").ContextReceipt,
 *   diagnostics: string[]
 * } | {
 *   schema: "kanon-orient-report-v1",
 *   ok: false,
 *   status: "Unknown",
 *   read_only: true,
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
      enforcement: false,
      trust_boundary: REPOSITORY_TRUST_BOUNDARY,
      diagnostic: "Repository inspection output was unavailable.",
      diagnostics: []
    };
  }
  const receipt = createContextReceipt({
    root: inspection.root,
    task: inspection.task,
    evidence_sha256: inspection.evidence_fingerprint,
    host_session: context.host_session
  });
  return {
    schema: "kanon-orient-report-v1",
    ok: true,
    status: "Known",
    read_only: true,
    enforcement: false,
    trust_boundary: REPOSITORY_TRUST_BOUNDARY,
    inspection: visible,
    receipt,
    diagnostics: Array.from(
      new Set([
        ...inspection.coverage.diagnostics,
        ...(inspection.evidence_complete
          ? []
          : [
              "Evidence was incomplete; receipt freshness cannot be established as Current."
            ]),
        ...(receipt.session_sha256 === null
          ? [
              "Host-session binding was unavailable; receipt session freshness remains Unknown."
            ]
          : [])
      ])
    ).slice(0, 16)
  };
}
