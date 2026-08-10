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
 * Validate a persisted or transferred steer state by checking its exact
 * structure, reconstructing its request, and requiring canonical output.
 *
 * @param {unknown} value
 * @returns {value is SteerState}
 */
export function isSteerState(value) {
  try {
    if (
      !isPlainRecord(value) ||
      !hasExactKeys(value, [
        "authorization",
        "completion",
        "completion_criteria",
        "constraints",
        "desired_outcome",
        "disposition",
        "evidence",
        "execution",
        "limits",
        "loop",
        "next_slice",
        "phase",
        "required_verification",
        "schema",
        "stop_or_redirect_reasons",
        "suggested_next_phase",
        "trust",
        "unknowns",
        "user_decisions"
      ]) ||
      value.schema !== "kanon-steer-state-v1" ||
      value.trust !== "caller-untrusted" ||
      !isSteerPhase(value.phase) ||
      value.authorization !== false ||
      (
        value.disposition !== "AwaitingExternalAction" &&
        value.disposition !== "PausedForDecision"
      ) ||
      !validSuggestedPhase(value.suggested_next_phase) ||
      !Array.isArray(value.loop) ||
      value.loop.length !== LOOP.length ||
      !value.loop.every((item, index) => item === LOOP[index]) ||
      !validCallerValue(value.desired_outcome) ||
      !validCallerList(value.completion_criteria, 8) ||
      !validCallerList(value.constraints, 8) ||
      !validUserDecisions(value.user_decisions) ||
      !validEvidence(value.evidence) ||
      !validCallerList(value.unknowns, 16) ||
      !validNextSlice(value.next_slice) ||
      !validCallerList(value.required_verification, 8) ||
      !validCallerList(value.stop_or_redirect_reasons, 8) ||
      !validCompletion(value.completion) ||
      !validExecution(value.execution) ||
      !validLimits(value.limits)
    ) {
      return false;
    }
    const request = {
      schema: "kanon-steer-request-v1",
      phase: value.phase,
      desired_outcome: value.desired_outcome.value,
      completion_criteria: value.completion_criteria.map(
        (item) => item.value
      ),
      constraints: value.constraints.map((item) => item.value),
      user_decisions: value.user_decisions.map((item) => item.value),
      evidence_references: value.evidence.caller_references.map(
        (item) => item.reference.value
      ),
      unknowns: value.unknowns.map((item) => item.value),
      next_slice: {
        objective: value.next_slice.objective.value,
        boundaries: value.next_slice.boundaries.map(
          (item) => item.value
        )
      },
      required_verification: value.required_verification.map(
        (item) => item.value
      ),
      stop_or_redirect_reasons: value.stop_or_redirect_reasons.map(
        (item) => item.value
      )
    };
    const rebuilt = buildSteerState(request);
    return (
      rebuilt.ok &&
      JSON.stringify(rebuilt.value) === JSON.stringify(value)
    );
  } catch {
    return false;
  }
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
 * @param {unknown} value
 * @returns {boolean}
 */
function validSuggestedPhase(value) {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, ["status", "value"]) &&
    (
      (
        value.status === "Suggested" &&
        isSteerPhase(value.value)
      ) ||
      (value.status === "Unknown" && value.value === null)
    )
  );
}

/**
 * @param {unknown} value
 * @returns {value is CallerValue}
 */
function validCallerValue(value) {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, ["provenance", "trust", "value"]) &&
    isBoundedString(value.value, 2_048) &&
    value.provenance === "caller-supplied" &&
    value.trust === "caller-untrusted"
  );
}

/**
 * @param {unknown} value
 * @param {number} maximum
 * @returns {value is CallerValue[]}
 */
function validCallerList(value, maximum) {
  return (
    Array.isArray(value) &&
    value.length <= maximum &&
    value.every(validCallerValue)
  );
}

/**
 * @param {unknown} value
 * @returns {value is UserDecision[]}
 */
function validUserDecisions(value) {
  return (
    Array.isArray(value) &&
    value.length <= 8 &&
    value.every((item) =>
      isPlainRecord(item) &&
      hasExactKeys(item, ["provenance", "trust", "value"]) &&
      isBoundedString(item.value, 512) &&
      item.provenance === "caller-asserted-user-decision" &&
      item.trust === "caller-untrusted"
    )
  );
}

/**
 * @param {unknown} value
 * @returns {value is SteerState["evidence"]}
 */
function validEvidence(value) {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, [
      "caller_references",
      "direct_verification_observed"
    ]) &&
    value.direct_verification_observed === false &&
    Array.isArray(value.caller_references) &&
    value.caller_references.length <= 16 &&
    value.caller_references.every((item) =>
      isPlainRecord(item) &&
      hasExactKeys(item, ["diagnostic", "reference", "status"]) &&
      item.status === "Unknown" &&
      item.diagnostic ===
        "The caller-supplied evidence reference was not directly verified by the steer state model." &&
      validCallerValue(item.reference)
    )
  );
}

/**
 * @param {unknown} value
 * @returns {value is SteerState["next_slice"]}
 */
function validNextSlice(value) {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, ["boundaries", "objective", "selection"]) &&
    validCallerValue(value.objective) &&
    validCallerList(value.boundaries, 8) &&
    value.boundaries.length > 0 &&
    value.selection === "one-bounded-slice"
  );
}

/**
 * @param {unknown} value
 * @returns {value is SteerState["completion"]}
 */
function validCompletion(value) {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, ["diagnostic", "status"]) &&
    value.status === "NotClaimed" &&
    value.diagnostic ===
      "Steer records required verification but does not execute it or claim completion."
  );
}

/**
 * @param {unknown} value
 * @returns {value is SteerState["execution"]}
 */
function validExecution(value) {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, [
      "agents_managed",
      "repository_code_executed",
      "repository_state_modified",
      "scope_expanded"
    ]) &&
    value.agents_managed === false &&
    value.repository_code_executed === false &&
    value.repository_state_modified === false &&
    value.scope_expanded === false
  );
}

/**
 * @param {unknown} value
 * @returns {value is SteerState["limits"]}
 */
function validLimits(value) {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, [
      "max_completion_criteria",
      "max_constraints",
      "max_evidence_references",
      "max_required_verification",
      "max_request_bytes",
      "max_slice_boundaries",
      "max_stop_or_redirect_reasons",
      "max_unknowns",
      "max_user_decisions"
    ]) &&
    value.max_request_bytes === 32_768 &&
    value.max_completion_criteria === 8 &&
    value.max_constraints === 8 &&
    value.max_user_decisions === 8 &&
    value.max_evidence_references === 16 &&
    value.max_unknowns === 16 &&
    value.max_slice_boundaries === 8 &&
    value.max_required_verification === 8 &&
    value.max_stop_or_redirect_reasons === 8
  );
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
