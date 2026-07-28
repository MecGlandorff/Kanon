import {
  buildContinuityArtifactMetadata,
  buildContinuityReport
} from "#kanon-continuity";
import {
  inspectPersistedContinuity,
  inspectRepository,
  publicInspection
} from "../repository/inspect.js";
import { REPOSITORY_TRUST_BOUNDARY } from "./orient.js";

/**
 * @typedef {{
 *   root: string,
 *   task: string
 * }} ResumeInput
 * @typedef {{
 *   git_runner?: import("../repository/git.js").GitRunner,
 *   now?: number
 * }} ResumeContext
 * @typedef {{
 *   schema: "kanon-resume-report-v1",
 *   ok: true,
 *   status: "Known",
 *   read_only: true,
 *   enforcement: false,
 *   trust_boundary: string,
 *   live: NonNullable<ReturnType<typeof publicInspection>>,
 *   continuity: ReturnType<typeof buildContinuityReport>,
 *   diagnostics: string[]
 * } | {
 *   schema: "kanon-resume-report-v1",
 *   ok: false,
 *   status: "Unknown",
 *   read_only: true,
 *   enforcement: false,
 *   trust_boundary: string,
 *   diagnostic: string,
 *   diagnostics: string[]
 * }} ResumeReport
 */

/**
 * @param {ResumeInput} input
 * @param {ResumeContext} [context]
 * @returns {ResumeReport}
 */
export function runResume(input, context = {}) {
  const inspection = inspectRepository(input.root, input.task, {
    profile: "resume",
    ...(context.git_runner === undefined
      ? {}
      : { git_runner: context.git_runner })
  });
  if (!inspection.ok) {
    return unavailableResume(
      inspection.diagnostic,
      inspection.diagnostics
    );
  }
  const visible = publicInspection(inspection);
  if (visible === null) {
    return unavailableResume(
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
    return unavailableResume(
      continuity.diagnostic,
      Array.from(
        new Set([
          ...inspection.coverage.diagnostics,
          ...(persisted.previous_warning === null
            ? []
            : [persisted.previous_warning]),
          ...(persisted.handoff_warning === null
            ? []
            : [persisted.handoff_warning]),
          ...continuity.diagnostics
        ])
      ).slice(0, 16)
    );
  }
  return {
    schema: "kanon-resume-report-v1",
    ok: true,
    status: "Known",
    read_only: true,
    enforcement: false,
    trust_boundary: REPOSITORY_TRUST_BOUNDARY,
    live: visible,
    continuity,
    diagnostics: Array.from(
      new Set([
        ...inspection.coverage.diagnostics,
        ...(persisted.previous_warning === null
          ? []
          : [persisted.previous_warning]),
        ...(persisted.handoff_warning === null
          ? []
          : [persisted.handoff_warning]),
        ...continuity.diagnostics
      ])
    ).slice(0, 16)
  };
}

/**
 * @param {string} diagnostic
 * @param {string[]} diagnostics
 * @returns {ResumeReport}
 */
function unavailableResume(diagnostic, diagnostics) {
  return {
    schema: "kanon-resume-report-v1",
    ok: false,
    status: "Unknown",
    read_only: true,
    enforcement: false,
    trust_boundary: REPOSITORY_TRUST_BOUNDARY,
    diagnostic,
    diagnostics
  };
}
