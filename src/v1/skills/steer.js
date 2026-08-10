import {
  buildContinuityArtifactMetadata,
  buildContinuityReport
} from "#kanon-continuity";
import { buildSteerState } from "../core/steer-state.js";
import { sanitizeDisplayText } from "../core/trust.js";
import {
  inspectPersistedContinuity,
  inspectRepository,
  publicInspection
} from "../repository/inspect.js";
import { REPOSITORY_TRUST_BOUNDARY } from "./orient.js";

/**
 * @typedef {{
 *   root: string,
 *   state: unknown
 * }} SteerInput
 * @typedef {{
 *   git_runner?: import("../repository/git.js").GitRunner,
 *   now?: number
 * }} SteerContext
 * @typedef {{
 *   schema: "kanon-steer-report-v1",
 *   ok: true,
 *   status: "Known",
 *   read_only: true,
 *   repository_read_only: true,
 *   enforcement: false,
 *   trust_boundary: string,
 *   state: import("../core/steer-state.js").SteerState,
 *   live: NonNullable<ReturnType<typeof publicInspection>>,
 *   continuity: ReturnType<typeof buildContinuityReport>,
 *   diagnostics: string[]
 * } | {
 *   schema: "kanon-steer-report-v1",
 *   ok: false,
 *   status: "Unknown",
 *   read_only: true,
 *   repository_read_only: true,
 *   enforcement: false,
 *   trust_boundary: string,
 *   diagnostic: string,
 *   diagnostics: string[]
 * }} SteerReport
 */

/**
 * Build one read-only steer state beside the existing live-authoritative
 * continuity report. This function executes no plan step and persists no
 * competing project-memory state.
 *
 * @param {SteerInput} input
 * @param {SteerContext} [context]
 * @returns {SteerReport}
 */
export function runSteer(input, context = {}) {
  const state = buildSteerState(input.state);
  if (!state.ok) {
    return unavailableSteer(state.diagnostic, []);
  }
  const inspectionTask = sanitizeDisplayText(
    `${state.value.desired_outcome.value} ${state.value.next_slice.objective.value}`,
    2_048
  );
  const inspection = inspectRepository(
    input.root,
    inspectionTask,
    {
      profile: "steer",
      ...(context.git_runner === undefined
        ? {}
        : { git_runner: context.git_runner })
    }
  );
  if (!inspection.ok) {
    return unavailableSteer(
      inspection.diagnostic,
      inspection.diagnostics
    );
  }
  const visible = publicInspection(inspection);
  if (visible === null) {
    return unavailableSteer(
      "Live repository evidence was unavailable.",
      []
    );
  }
  const persisted = inspectPersistedContinuity(inspection.root);
  const continuity = buildContinuityReport({
    artifact_metadata: buildContinuityArtifactMetadata({
      files: inspection.files.map((file) => ({
        path: file.path,
        mtime_ms: file.mtime_ms
      }))
    }),
    current: inspection.current_state,
    previous: persisted.previous,
    ...(persisted.previous_warning === null
      ? {}
      : { previous_warning: persisted.previous_warning }),
    handoff: persisted.handoff,
    ...(context.now === undefined ? {} : { now: context.now })
  });
  if (!continuity.ok) {
    return unavailableSteer(
      continuity.diagnostic,
      collectDiagnostics(inspection, persisted, continuity.diagnostics)
    );
  }
  return {
    schema: "kanon-steer-report-v1",
    ok: true,
    status: "Known",
    read_only: true,
    repository_read_only: true,
    enforcement: false,
    trust_boundary: REPOSITORY_TRUST_BOUNDARY,
    state: state.value,
    live: visible,
    continuity,
    diagnostics: collectDiagnostics(
      inspection,
      persisted,
      [
        ...continuity.diagnostics,
        ...(state.value.evidence.caller_references.length > 0
          ? [
              "Caller-supplied evidence references remain Unknown until directly verified."
            ]
          : []),
        "Steer recorded one bounded slice but performed no action, verification, persistence, or agent management."
      ]
    )
  };
}

/**
 * @param {Extract<ReturnType<typeof inspectRepository>, {ok: true}>} inspection
 * @param {ReturnType<typeof inspectPersistedContinuity>} persisted
 * @param {string[]} extra
 * @returns {string[]}
 */
function collectDiagnostics(inspection, persisted, extra) {
  return Array.from(
    new Set([
      ...inspection.coverage.diagnostics,
      ...(persisted.previous_warning === null
        ? []
        : [persisted.previous_warning]),
      ...(persisted.handoff_warning === null
        ? []
        : [persisted.handoff_warning]),
      ...extra
    ])
  ).slice(0, 16);
}

/**
 * @param {string} diagnostic
 * @param {string[]} diagnostics
 * @returns {SteerReport}
 */
function unavailableSteer(diagnostic, diagnostics) {
  return {
    schema: "kanon-steer-report-v1",
    ok: false,
    status: "Unknown",
    read_only: true,
    repository_read_only: true,
    enforcement: false,
    trust_boundary: REPOSITORY_TRUST_BOUNDARY,
    diagnostic,
    diagnostics
  };
}
