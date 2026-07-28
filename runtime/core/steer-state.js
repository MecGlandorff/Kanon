import {
  hasExactKeys,
  isBoundedString,
  isPlainRecord,
  sanitizeDisplayText
} from "./trust.js";

const MAX_REQUEST_BYTES = 32 * 1024;
const LOOP = Object.freeze([
  "understand",
  "choose-slice",
  "act",
  "verify",
  "reassess"
]);

/**
 * @typedef {"understand" | "choose-slice" | "act" | "verify" | "reassess"}
 *   SteerPhase
 * @typedef {{
 *   value: string,
 *   provenance: "caller-supplied",
 *   trust: "caller-untrusted"
 * }} CallerValue
 * @typedef {{
 *   value: string,
 *   provenance: "caller-asserted-user-decision",
 *   trust: "caller-untrusted"
 * }} UserDecision
 * @typedef {{
 *   reference: CallerValue,
 *   status: "Unknown",
 *   diagnostic: string
 * }} SteerEvidenceReference
 * @typedef {{
 *   schema: "kanon-steer-state-v1",
 *   trust: "caller-untrusted",
 *   phase: SteerPhase,
 *   suggested_next_phase: {
 *     status: "Suggested",
 *     value: SteerPhase
 *   } | {
 *     status: "Unknown",
 *     value: null
 *   },
 *   loop: readonly [
 *     "understand",
 *     "choose-slice",
 *     "act",
 *     "verify",
 *     "reassess"
 *   ],
 *   disposition: "AwaitingExternalAction" | "PausedForDecision",
 *   authorization: false,
 *   desired_outcome: CallerValue,
 *   completion_criteria: CallerValue[],
 *   constraints: CallerValue[],
 *   user_decisions: UserDecision[],
 *   evidence: {
 *     caller_references: SteerEvidenceReference[],
 *     direct_verification_observed: false
 *   },
 *   unknowns: CallerValue[],
 *   next_slice: {
 *     objective: CallerValue,
 *     boundaries: CallerValue[],
 *     selection: "one-bounded-slice"
 *   },
 *   required_verification: CallerValue[],
 *   stop_or_redirect_reasons: CallerValue[],
 *   completion: {
 *     status: "NotClaimed",
 *     diagnostic: string
 *   },
 *   execution: {
 *     repository_code_executed: false,
 *     repository_state_modified: false,
 *     agents_managed: false,
 *     scope_expanded: false
 *   },
 *   limits: {
 *     max_request_bytes: 32768,
 *     max_completion_criteria: 8,
 *     max_constraints: 8,
 *     max_user_decisions: 8,
 *     max_evidence_references: 16,
 *     max_unknowns: 16,
 *     max_slice_boundaries: 8,
 *     max_required_verification: 8,
 *     max_stop_or_redirect_reasons: 8
 *   }
 * }} SteerState
 * @typedef {{
 *   ok: true,
 *   value: SteerState
 * } | {
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: string
 * }} SteerStateResult
 */

/**
 * Normalize a single caller-supplied steer request into a bounded state model.
 * Caller references never become direct evidence in this pure model.
 *
 * @param {unknown} value
 * @returns {SteerStateResult}
 */
export function buildSteerState(value) {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      "completion_criteria",
      "constraints",
      "desired_outcome",
      "evidence_references",
      "next_slice",
      "phase",
      "required_verification",
      "schema",
      "stop_or_redirect_reasons",
      "unknowns",
      "user_decisions"
    ]) ||
    value.schema !== "kanon-steer-request-v1" ||
    !isSteerPhase(value.phase)
  ) {
    return invalidSteerState();
  }
  const desiredOutcome = normalizeText(value.desired_outcome, 2_048);
  const completionCriteria = normalizeList(
    value.completion_criteria,
    8,
    512,
    true
  );
  const constraints = normalizeList(value.constraints, 8, 512, false);
  const userDecisions = normalizeList(
    value.user_decisions,
    8,
    512,
    false
  );
  const evidenceReferences = normalizeList(
    value.evidence_references,
    16,
    512,
    false
  );
  const unknowns = normalizeList(value.unknowns, 16, 512, false);
  const requiredVerification = normalizeList(
    value.required_verification,
    8,
    512,
    true
  );
  const stopReasons = normalizeList(
    value.stop_or_redirect_reasons,
    8,
    512,
    false
  );
  const nextSlice = normalizeNextSlice(value.next_slice);
  if (
    desiredOutcome === null ||
    completionCriteria === null ||
    constraints === null ||
    userDecisions === null ||
    evidenceReferences === null ||
    unknowns === null ||
    requiredVerification === null ||
    stopReasons === null ||
    nextSlice === null ||
    !boundedNormalizedRequest({
      phase: value.phase,
      desired_outcome: desiredOutcome,
      completion_criteria: completionCriteria,
      constraints,
      user_decisions: userDecisions,
      evidence_references: evidenceReferences,
      unknowns,
      next_slice: nextSlice,
      required_verification: requiredVerification,
      stop_or_redirect_reasons: stopReasons
    })
  ) {
    return invalidSteerState();
  }
  const paused = stopReasons.length > 0;
  return {
    ok: true,
    value: {
      schema: "kanon-steer-state-v1",
      trust: "caller-untrusted",
      phase: value.phase,
      suggested_next_phase: paused
        ? {
            status: /** @type {"Unknown"} */ ("Unknown"),
            value: null
          }
        : {
            status: /** @type {"Suggested"} */ ("Suggested"),
            value: nextPhase(value.phase)
          },
      loop: /** @type {SteerState["loop"]} */ (LOOP),
      disposition: paused
        ? "PausedForDecision"
        : "AwaitingExternalAction",
      authorization: false,
      desired_outcome: callerValue(desiredOutcome),
      completion_criteria: completionCriteria.map(callerValue),
      constraints: constraints.map(callerValue),
      user_decisions: userDecisions.map((item) => ({
        value: item,
        provenance: "caller-asserted-user-decision",
        trust: "caller-untrusted"
      })),
      evidence: {
        caller_references: evidenceReferences.map((item) => ({
          reference: callerValue(item),
          status: "Unknown",
          diagnostic:
            "The caller-supplied evidence reference was not directly verified by the steer state model."
        })),
        direct_verification_observed: false
      },
      unknowns: unknowns.map(callerValue),
      next_slice: {
        objective: callerValue(nextSlice.objective),
        boundaries: nextSlice.boundaries.map(callerValue),
        selection: "one-bounded-slice"
      },
      required_verification: requiredVerification.map(callerValue),
      stop_or_redirect_reasons: stopReasons.map(callerValue),
      completion: {
        status: "NotClaimed",
        diagnostic:
          "Steer records required verification but does not execute it or claim completion."
      },
      execution: {
        repository_code_executed: false,
        repository_state_modified: false,
        agents_managed: false,
        scope_expanded: false
      },
      limits: {
        max_request_bytes: 32_768,
        max_completion_criteria: 8,
        max_constraints: 8,
        max_user_decisions: 8,
        max_evidence_references: 16,
        max_unknowns: 16,
        max_slice_boundaries: 8,
        max_required_verification: 8,
        max_stop_or_redirect_reasons: 8
      }
    }
  };
}

/**
 * @param {unknown} value
 * @returns {value is SteerPhase}
 */
function isSteerPhase(value) {
  return (
    value === "understand" ||
    value === "choose-slice" ||
    value === "act" ||
    value === "verify" ||
    value === "reassess"
  );
}

/**
 * @param {SteerPhase} phase
 * @returns {SteerPhase}
 */
function nextPhase(phase) {
  switch (phase) {
    case "understand":
      return "choose-slice";
    case "choose-slice":
      return "act";
    case "act":
      return "verify";
    case "verify":
      return "reassess";
    case "reassess":
      return "understand";
  }
}

/**
 * @param {Record<string, unknown>} value
 * @returns {boolean}
 */
function boundedNormalizedRequest(value) {
  const serialized = JSON.stringify({
    schema: "kanon-steer-request-v1",
    ...value
  });
  return Buffer.byteLength(serialized, "utf8") <= MAX_REQUEST_BYTES;
}

/**
 * @param {unknown} value
 * @param {number} maximumBytes
 * @returns {string | null}
 */
function normalizeText(value, maximumBytes) {
  if (!isBoundedString(value, maximumBytes)) {
    return null;
  }
  const selected = sanitizeDisplayText(value, maximumBytes);
  return selected ? selected : null;
}

/**
 * @param {unknown} value
 * @param {number} maximumItems
 * @param {number} maximumBytes
 * @param {boolean} requireOne
 * @returns {string[] | null}
 */
function normalizeList(
  value,
  maximumItems,
  maximumBytes,
  requireOne
) {
  if (
    !Array.isArray(value) ||
    value.length > maximumItems ||
    (requireOne && value.length === 0)
  ) {
    return null;
  }
  const selected = value.map((item) =>
    normalizeText(item, maximumBytes)
  );
  if (selected.some((item) => item === null)) {
    return null;
  }
  return Array.from(new Set(
    /** @type {string[]} */ (selected)
  ));
}

/**
 * @param {unknown} value
 * @returns {{objective: string, boundaries: string[]} | null}
 */
function normalizeNextSlice(value) {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["boundaries", "objective"])
  ) {
    return null;
  }
  const objective = normalizeText(value.objective, 1_024);
  const boundaries = normalizeList(value.boundaries, 8, 512, true);
  return objective === null || boundaries === null
    ? null
    : { objective, boundaries };
}

/**
 * @param {string} value
 * @returns {CallerValue}
 */
function callerValue(value) {
  return {
    value,
    provenance: "caller-supplied",
    trust: "caller-untrusted"
  };
}

/**
 * @returns {{
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: "Steer state input was unavailable, malformed, or over its bounded schema."
 * }}
 */
function invalidSteerState() {
  return {
    ok: false,
    status: "Unknown",
    diagnostic:
      "Steer state input was unavailable, malformed, or over its bounded schema."
  };
}
