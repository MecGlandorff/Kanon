import crypto from "node:crypto";
import {
  buildSteerState,
  isSteerState
} from "./steer-state.js";
import {
  hasExactKeys,
  isBoundedString,
  isNonnegativeSafeInteger,
  isPlainRecord,
  sanitizeDisplayText
} from "./trust.js";

const MAX_HANDOFF_BYTES = 64 * 1024;
const MAX_DATE_MS = 8_640_000_000_000_000;
const SHA256 = /^[0-9a-f]{64}$/;
const UNSAFE_PATH_CONTROLS =
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/;
const HOSTS = Object.freeze(["codex-cli", "claude-code"]);
const MODES = Object.freeze([
  "last-plan",
  "compacted",
  "full-history"
]);

/**
 * @typedef {"codex-cli" | "claude-code" | "Unknown"} HandoffHost
 * @typedef {"last-plan" | "compacted" | "full-history"} HandoffMode
 * @typedef {{
 *   value: string,
 *   provenance: "caller-supplied",
 *   trust: "caller-untrusted"
 * }} CallerClaim
 * @typedef {{
 *   value: string,
 *   provenance: "caller-asserted-user-decision",
 *   trust: "caller-untrusted"
 * }} DecisionClaim
 * @typedef {{
 *   value: string,
 *   provenance: "live-git",
 *   trust: "repository-untrusted"
 * }} GitValue
 * @typedef {{
 *   canonical_root: {
 *     status: "Known",
 *     value: string,
 *     provenance: "live-canonicalization",
 *     trust: "repository-identity-untrusted"
 *   },
 *   recorded_commit: {
 *     status: "Known",
 *     value: string,
 *     provenance: "live-git",
 *     trust: "repository-untrusted"
 *   } | {
 *     status: "Unknown",
 *     value: null,
 *     provenance: "live-git",
 *     trust: "repository-untrusted"
 *   },
 *   change_set: {
 *     status: "Known",
 *     sha256: string,
 *     count: number,
 *     complete: true,
 *     provenance: "live-git",
 *     trust: "repository-untrusted"
 *   } | {
 *     status: "Unknown",
 *     sha256: null,
 *     count: number | null,
 *     complete: false,
 *     provenance: "live-git",
 *     trust: "repository-untrusted"
 *   }
 * }} HandoffRepositoryIdentity
 * @typedef {{
 *   schema: "kanon-compacted-handoff-v1",
 *   goal: CallerClaim,
 *   decisions: DecisionClaim[],
 *   constraints: CallerClaim[],
 *   live_work_state: CallerClaim,
 *   evidence_references: {
 *     claim: CallerClaim,
 *     status: "Unknown"
 *   }[],
 *   changed_files: {
 *     status: "Known" | "Unknown",
 *     values: GitValue[],
 *     provenance: "live-git",
 *     trust: "repository-untrusted"
 *   },
 *   completed_validation: {
 *     claim: CallerClaim,
 *     status: "Unknown"
 *   }[],
 *   unknowns: CallerClaim[],
 *   remaining_plan: CallerClaim[],
 *   suggested_next_step: {
 *     status: "Suggested",
 *     claim: CallerClaim
 *   }
 * }} CompactedHandoff
 * @typedef {{
 *   schema: "kanon-last-plan-handoff-v1",
 *   plan: import("./steer-state.js").SteerState,
 *   provenance: "caller-supplied-explicit-steer-state",
 *   trust: "caller-untrusted"
 * }} LastPlanHandoff
 * @typedef {LastPlanHandoff | CompactedHandoff} HandoffPayload
 * @typedef {{
 *   schema: "kanon-aswitch-plan-v1",
 *   source: {
 *     host: HandoffHost,
 *     provenance: "active-adapter",
 *     status: "Known" | "Unknown"
 *   },
 *   target: {
 *     host: "codex-cli" | "claude-code",
 *     provenance: "caller-selected",
 *     trust: "caller-untrusted"
 *   },
 *   mode: "last-plan" | "compacted",
 *   repository: HandoffRepositoryIdentity,
 *   coverage: {
 *     kind: "last-plan-only" | "compacted-claims",
 *     omissions: string[],
 *     truncated: false,
 *     provenance: "kanon-bounded-selection",
 *     trust: "mixed-untrusted-context"
 *   },
 *   payload: HandoffPayload,
 *   transfer: {
 *     enforcement: false,
 *     authorization: false,
 *     deletes_source_history: false,
 *     stops_source_agent: false,
 *     claims_repository_ownership: false,
 *     automatic_launch: false
 *   }
 * }} HandoffPlan
 * @typedef {{
 *   schema: "kanon-aswitch-preview-v1",
 *   preview_sha256: string,
 *   content_sha256: string,
 *   destination: {
 *     status: "Known",
 *     root: string,
 *     path: string,
 *     provenance: "caller-selected-canonical-external-root",
 *     trust: "caller-untrusted",
 *     privacy: {
 *       status: "Known" | "Unknown",
 *       diagnostic: string
 *     }
 *   },
 *   plan: HandoffPlan,
 *   trust_classification: "untrusted-context",
 *   proposed_next_action: {
 *     status: "Suggested",
 *     value: "Show this preview and obtain explicit user approval before writing."
 *   }
 * }} HandoffPreview
 * @typedef {{
 *   schema: "kanon-agent-handoff-v1",
 *   created_at: number,
 *   preview_sha256: string,
 *   content_sha256: string,
 *   source: HandoffPlan["source"],
 *   target: HandoffPlan["target"],
 *   mode: HandoffPlan["mode"],
 *   repository: HandoffRepositoryIdentity,
 *   coverage: HandoffPlan["coverage"],
 *   payload: HandoffPayload,
 *   transfer: HandoffPlan["transfer"],
 *   checksum: {
 *     algorithm: "sha256",
 *     value: string,
 *     authenticity: false
 *   }
 * }} HandoffEnvelope
 * @typedef {{
 *   schema: "kanon-aswitch-approval-v1",
 *   approved: true,
 *   preview_sha256: string
 * }} AswitchApproval
 * @typedef {{
 *   schema: "kanon-aswitch-request-v1",
 *   operation: "preview" | "write",
 *   target_host: "codex-cli" | "claude-code" | null,
 *   payload_mode: HandoffMode | null,
 *   destination_root: string | null,
 *   last_plan: unknown | null,
 *   compacted: unknown | null,
 *   approval: AswitchApproval | null
 * } | {
 *   schema: "kanon-aswitch-request-v1",
 *   operation: "receive",
 *   handoff_path: string
 * }} AswitchRequest
 * @typedef {{
 *   ok: true,
 *   value: AswitchRequest
 * } | {
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: string
 * }} AswitchRequestResult
 * @typedef {{
 *   ok: true,
 *   value: HandoffEnvelope,
 *   checksum_status: "Known"
 * } | {
 *   ok: false,
 *   status: "Stale" | "Unknown",
 *   diagnostic: string
 * }} HandoffEnvelopeResult
 */

/**
 * Validate the one bounded external request before any handoff I/O.
 *
 * @param {unknown} value
 * @returns {AswitchRequestResult}
 */
export function normalizeAswitchRequest(value) {
  try {
    if (
      !isPlainRecord(value) ||
      value.schema !== "kanon-aswitch-request-v1"
    ) {
      return invalidRequest();
    }
    if (
      value.operation === "receive" &&
      hasExactKeys(value, ["handoff_path", "operation", "schema"]) &&
      safePathText(value.handoff_path)
    ) {
      return {
        ok: true,
        value: {
          schema: "kanon-aswitch-request-v1",
          operation: "receive",
          handoff_path: value.handoff_path
        }
      };
    }
    if (
      (value.operation !== "preview" && value.operation !== "write") ||
      !hasExactKeys(value, [
        "approval",
        "compacted",
        "destination_root",
        "last_plan",
        "operation",
        "payload_mode",
        "schema",
        "target_host"
      ]) ||
      !nullableHost(value.target_host) ||
      !nullableMode(value.payload_mode) ||
      !nullableSafePath(value.destination_root)
    ) {
      return invalidRequest();
    }
    const approval = normalizeApproval(value.approval);
    if (
      (value.operation === "preview" && value.approval !== null) ||
      (value.operation === "write" && approval === null) ||
      (
        value.payload_mode === "last-plan" &&
        value.compacted !== null
      ) ||
      (
        value.payload_mode === "compacted" &&
        value.last_plan !== null
      ) ||
      (
        value.payload_mode === "full-history" &&
        (value.last_plan !== null || value.compacted !== null)
      )
    ) {
      return invalidRequest();
    }
    return {
      ok: true,
      value: {
        schema: "kanon-aswitch-request-v1",
        operation: value.operation,
        target_host: /** @type {"codex-cli" | "claude-code" | null} */ (
          value.target_host
        ),
        payload_mode: /** @type {HandoffMode | null} */ (
          value.payload_mode
        ),
        destination_root: /** @type {string | null} */ (
          value.destination_root
        ),
        last_plan: value.last_plan,
        compacted: value.compacted,
        approval
      }
    };
  } catch {
    return invalidRequest();
  }
}

/**
 * Offer exactly the three stable/experimental payload selections. Missing
 * candidate input means availability is Unknown, never proven absent.
 *
 * @param {unknown} lastPlan
 * @param {unknown} compacted
 * @param {import("../repository/git.js").GitObservation | null} git
 * @returns {{
 *   mode: HandoffMode,
 *   label: "Last plan" | "Compacted structured handoff" | "Full-history archive",
 *   default: boolean,
 *   recommended: boolean,
 *   experimental: boolean,
 *   availability: "Known" | "Unknown",
 *   diagnostic: string
 * }[]}
 */
export function aswitchPayloadOptions(lastPlan, compacted, git) {
  const plan = normalizeLastPlan(lastPlan);
  const compact = normalizeCompacted(compacted, git);
  const planAvailable = plan !== null;
  return [
    {
      mode: "last-plan",
      label: "Last plan",
      default: true,
      recommended: planAvailable,
      experimental: false,
      availability: planAvailable ? "Known" : "Unknown",
      diagnostic: planAvailable
        ? "A bounded caller-supplied steer plan is available for preview."
        : "No directly validated current plan was supplied to this invocation."
    },
    {
      mode: "compacted",
      label: "Compacted structured handoff",
      default: false,
      recommended: !planAvailable,
      experimental: false,
      availability: compact === null ? "Unknown" : "Known",
      diagnostic: compact === null
        ? "A bounded compacted payload has not been validated."
        : "A bounded compacted payload is available for preview."
    },
    {
      mode: "full-history",
      label: "Full-history archive",
      default: false,
      recommended: false,
      experimental: true,
      availability: "Unknown",
      diagnostic:
        "Full-history is experimental and unavailable without a separately acknowledged user-supplied or documented export."
    }
  ];
}

/**
 * Build the canonical live repository identity used by both sending and
 * receiving sides.
 *
 * @param {string} canonicalRoot
 * @param {import("../repository/git.js").GitObservation} git
 * @returns {HandoffRepositoryIdentity}
 */
export function buildHandoffRepositoryIdentity(canonicalRoot, git) {
  const commitKnown =
    git.observation_complete &&
    typeof git.head === "string" &&
    /^[0-9a-f]{40,64}$/.test(git.head);
  const changesKnown =
    git.observation_complete &&
    git.change_count_exact &&
    git.change_count !== null &&
    !git.changes_truncated &&
    git.sensitive_changes_skipped === 0;
  const changes = changesKnown
    ? git.changes
        .map((change) => ({
          index: change.index,
          path: change.path,
          worktree: change.worktree
        }))
        .sort((left, right) =>
          codeUnitCompare(
            `${left.path}\0${left.index}\0${left.worktree}`,
            `${right.path}\0${right.index}\0${right.worktree}`
          )
        )
    : [];
  return {
    canonical_root: {
      status: "Known",
      value: canonicalRoot,
      provenance: "live-canonicalization",
      trust: "repository-identity-untrusted"
    },
    recorded_commit: commitKnown
      ? {
          status: /** @type {"Known"} */ ("Known"),
          value: /** @type {string} */ (git.head),
          provenance: /** @type {"live-git"} */ ("live-git"),
          trust: /** @type {"repository-untrusted"} */ (
            "repository-untrusted"
          )
        }
      : {
          status: /** @type {"Unknown"} */ ("Unknown"),
          value: null,
          provenance: /** @type {"live-git"} */ ("live-git"),
          trust: /** @type {"repository-untrusted"} */ (
            "repository-untrusted"
          )
        },
    change_set: changesKnown
      ? {
          status: /** @type {"Known"} */ ("Known"),
          sha256: sha256(canonicalJson(changes)),
          count: /** @type {number} */ (git.change_count),
          complete: /** @type {true} */ (true),
          provenance: /** @type {"live-git"} */ ("live-git"),
          trust: /** @type {"repository-untrusted"} */ (
            "repository-untrusted"
          )
        }
      : {
          status: /** @type {"Unknown"} */ ("Unknown"),
          sha256: null,
          count: git.change_count_exact ? git.change_count : null,
          complete: /** @type {false} */ (false),
          provenance: /** @type {"live-git"} */ ("live-git"),
          trust: /** @type {"repository-untrusted"} */ (
            "repository-untrusted"
          )
        }
  };
}

/**
 * Build a bounded preview core. Full-history is deliberately unavailable in
 * this slice and is never coerced into either stable payload.
 *
 * @param {{
 *   source_host: HandoffHost,
 *   target_host: "codex-cli" | "claude-code",
 *   mode: "last-plan" | "compacted",
 *   repository: HandoffRepositoryIdentity,
 *   last_plan: unknown,
 *   compacted: unknown,
 *   git: import("../repository/git.js").GitObservation
 * }} input
 * @returns {{
 *   ok: true,
 *   plan: HandoffPlan,
 *   content_sha256: string
 * } | {
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: string
 * }}
 */
export function buildHandoffPlan(input) {
  const payload =
    input.mode === "last-plan"
      ? normalizeLastPlan(input.last_plan)
      : normalizeCompacted(input.compacted, input.git);
  if (payload === null) {
    return {
      ok: false,
      status: "Unknown",
      diagnostic:
        "The selected handoff payload was unavailable, malformed, or over its bounded schema."
    };
  }
  /** @type {HandoffPlan} */
  const plan = {
    schema: "kanon-aswitch-plan-v1",
    source: {
      host: input.source_host,
      provenance: "active-adapter",
      status:
        input.source_host === "Unknown" ? "Unknown" : "Known"
    },
    target: {
      host: input.target_host,
      provenance: "caller-selected",
      trust: "caller-untrusted"
    },
    mode: input.mode,
    repository: input.repository,
    coverage: {
      kind:
        input.mode === "last-plan"
          ? "last-plan-only"
          : "compacted-claims",
      omissions:
        input.mode === "last-plan"
          ? [
              "session history",
              "unobserved validation output",
              "unrecorded work"
            ]
          : [
              "raw session history",
              "unobserved validation output",
              "undisclosed source context"
            ],
      truncated: false,
      provenance: "kanon-bounded-selection",
      trust: "mixed-untrusted-context"
    },
    payload,
    transfer: {
      enforcement: false,
      authorization: false,
      deletes_source_history: false,
      stops_source_agent: false,
      claims_repository_ownership: false,
      automatic_launch: false
    }
  };
  const serialized = canonicalJson(plan);
  if (Buffer.byteLength(serialized, "utf8") > MAX_HANDOFF_BYTES) {
    return {
      ok: false,
      status: "Unknown",
      diagnostic: "The selected handoff payload exceeded 64 KiB."
    };
  }
  return {
    ok: true,
    plan,
    content_sha256: sha256(serialized)
  };
}

/**
 * Bind a plan to the exact canonical destination shown to the user.
 *
 * @param {HandoffPlan} plan
 * @param {string} contentSha256
 * @param {string} destinationRoot
 * @param {string} destinationPath
 * @returns {HandoffPreview}
 */
export function buildHandoffPreview(
  plan,
  contentSha256,
  destinationRoot,
  destinationPath
) {
  const bound = {
    content_sha256: contentSha256,
    destination_path: destinationPath,
    plan
  };
  return {
    schema: "kanon-aswitch-preview-v1",
    preview_sha256: sha256(canonicalJson(bound)),
    content_sha256: contentSha256,
    destination: {
      status: "Known",
      root: destinationRoot,
      path: destinationPath,
      provenance: "caller-selected-canonical-external-root",
      trust: "caller-untrusted",
      privacy: {
        status: process.platform === "win32" ? "Unknown" : "Known",
        diagnostic:
          process.platform === "win32"
            ? "Windows ACL privacy was not directly proven by the portable runtime."
            : "The destination directory was user-owned and not group/world writable when inspected."
      }
    },
    plan,
    trust_classification: "untrusted-context",
    proposed_next_action: {
      status: "Suggested",
      value:
        "Show this preview and obtain explicit user approval before writing."
    }
  };
}

/**
 * Create the exact envelope written only after the approval digest matches.
 *
 * @param {HandoffPreview} preview
 * @param {unknown} now
 * @returns {{
 *   ok: true,
 *   value: HandoffEnvelope,
 *   text: string
 * } | {
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: string
 * }}
 */
export function createHandoffEnvelope(preview, now) {
  if (
    !isNonnegativeSafeInteger(now) ||
    now > MAX_DATE_MS ||
    !isHandoffPreview(preview)
  ) {
    return invalidEnvelope();
  }
  const unsigned = {
    schema: /** @type {"kanon-agent-handoff-v1"} */ (
      "kanon-agent-handoff-v1"
    ),
    created_at: now,
    preview_sha256: preview.preview_sha256,
    content_sha256: preview.content_sha256,
    source: preview.plan.source,
    target: preview.plan.target,
    mode: preview.plan.mode,
    repository: preview.plan.repository,
    coverage: preview.plan.coverage,
    payload: preview.plan.payload,
    transfer: preview.plan.transfer
  };
  /** @type {HandoffEnvelope} */
  const envelope = {
    ...unsigned,
    checksum: {
      algorithm: "sha256",
      value: sha256(canonicalJson(unsigned)),
      authenticity: false
    }
  };
  const text = `${JSON.stringify(envelope, null, 2)}\n`;
  return Buffer.byteLength(text, "utf8") <= MAX_HANDOFF_BYTES
    ? { ok: true, value: envelope, text }
    : {
        ok: false,
        status: "Unknown",
        diagnostic: "The handoff envelope exceeded 64 KiB."
      };
}

/**
 * Validate schema and semantic checksum. A checksum mismatch is Stale rather
 * than evidence that an unavailable value was absent.
 *
 * @param {unknown} value
 * @returns {HandoffEnvelopeResult}
 */
export function validateHandoffEnvelope(value) {
  try {
    if (!isHandoffEnvelope(value)) {
      return invalidEnvelope();
    }
    const unsigned = unsignedEnvelope(value);
    if (
      sha256(canonicalJson(unsigned)) !== value.checksum.value ||
      sha256(canonicalJson(planFromEnvelope(value))) !==
        value.content_sha256
    ) {
      return {
        ok: false,
        status: "Stale",
        diagnostic:
          "The handoff checksum or content binding did not match."
      };
    }
    return {
      ok: true,
      value,
      checksum_status: "Known"
    };
  } catch {
    return invalidEnvelope();
  }
}

/**
 * Compare only directly observable receiving facts. Any known mismatch is
 * Stale; otherwise an unavailable comparison remains Unknown.
 *
 * @param {HandoffEnvelope} envelope
 * @param {HandoffRepositoryIdentity} live
 * @param {HandoffHost} activeHost
 * @returns {{
 *   classification: "Current" | "Stale" | "Unknown",
 *   status: "Known" | "Stale" | "Unknown",
 *   comparisons: {
 *     checksum: "Known",
 *     target_host: "Known" | "Stale" | "Unknown",
 *     canonical_root: "Known" | "Stale",
 *     recorded_commit: "Known" | "Stale" | "Unknown",
 *     change_set: "Known" | "Stale" | "Unknown"
 *   },
 *   requires_refresh_or_explicit_approval: boolean,
 *   diagnostic: string
 * }}
 */
export function classifyReceivedHandoff(envelope, live, activeHost) {
  const targetHost =
    activeHost === "Unknown"
      ? "Unknown"
      : activeHost === envelope.target.host
        ? "Known"
        : "Stale";
  const canonicalRoot =
    samePathText(
      envelope.repository.canonical_root.value,
      live.canonical_root.value
    )
      ? "Known"
      : "Stale";
  const commit = compareKnownValue(
    envelope.repository.recorded_commit,
    live.recorded_commit,
    "value"
  );
  const changeSet = compareKnownValue(
    envelope.repository.change_set,
    live.change_set,
    "sha256"
  );
  const values = [targetHost, canonicalRoot, commit, changeSet];
  const classification = values.includes("Stale")
    ? "Stale"
    : values.includes("Unknown")
      ? "Unknown"
      : "Current";
  return {
    classification,
    status:
      classification === "Current" ? "Known" : classification,
    comparisons: {
      checksum: "Known",
      target_host: targetHost,
      canonical_root: canonicalRoot,
      recorded_commit: commit,
      change_set: changeSet
    },
    requires_refresh_or_explicit_approval:
      classification !== "Current",
    diagnostic:
      classification === "Current"
        ? "The bounded handoff matched all directly observed receiving facts."
        : classification === "Stale"
          ? "A directly observed receiving fact conflicts with the handoff."
          : "At least one required receiving comparison was unavailable."
  };
}

/**
 * @param {unknown} value
 * @returns {HandoffPayload | null}
 */
function normalizeLastPlan(value) {
  if (value === null || value === undefined) {
    return null;
  }
  try {
    const selected = buildSteerState(value);
    return selected.ok
      ? {
          schema: "kanon-last-plan-handoff-v1",
          plan: selected.value,
          provenance: "caller-supplied-explicit-steer-state",
          trust: "caller-untrusted"
        }
      : null;
  } catch {
    return null;
  }
}

/**
 * @param {unknown} value
 * @param {import("../repository/git.js").GitObservation | null} git
 * @returns {CompactedHandoff | null}
 */
function normalizeCompacted(value, git) {
  try {
    if (
      !isPlainRecord(value) ||
      !hasExactKeys(value, [
        "completed_validation",
        "constraints",
        "decisions",
        "evidence_references",
        "goal",
        "live_work_state",
        "remaining_plan",
        "schema",
        "suggested_next_step",
        "unknowns"
      ]) ||
      value.schema !== "kanon-compacted-handoff-input-v1"
    ) {
      return null;
    }
    const goal = normalizeText(value.goal, 2_048);
    const decisions = normalizeList(value.decisions, 16, 512);
    const constraints = normalizeList(value.constraints, 16, 512);
    const liveWorkState = normalizeText(value.live_work_state, 2_048);
    const evidence = normalizeList(
      value.evidence_references,
      24,
      512
    );
    const validation = normalizeList(
      value.completed_validation,
      24,
      512
    );
    const unknowns = normalizeList(value.unknowns, 24, 512);
    const remaining = normalizeList(value.remaining_plan, 16, 512);
    const next = normalizeText(value.suggested_next_step, 1_024);
    if (
      goal === null ||
      decisions === null ||
      constraints === null ||
      liveWorkState === null ||
      evidence === null ||
      validation === null ||
      unknowns === null ||
      remaining === null ||
      next === null
    ) {
      return null;
    }
    const changedKnown =
      git !== null &&
      git.observation_complete &&
      git.change_count_exact &&
      !git.changes_truncated &&
      git.sensitive_changes_skipped === 0;
    const changed = changedKnown && git !== null
      ? git.changes.map((change) => ({
          value: change.path,
          provenance: /** @type {"live-git"} */ ("live-git"),
          trust: /** @type {"repository-untrusted"} */ (
            "repository-untrusted"
          )
        }))
      : [];
    /** @type {CompactedHandoff} */
    const compacted = {
      schema: "kanon-compacted-handoff-v1",
      goal: callerClaim(goal),
      decisions: decisions.map((item) => ({
        value: item,
        provenance: "caller-asserted-user-decision",
        trust: "caller-untrusted"
      })),
      constraints: constraints.map(callerClaim),
      live_work_state: callerClaim(liveWorkState),
      evidence_references: evidence.map((item) => ({
        claim: callerClaim(item),
        status: "Unknown"
      })),
      changed_files: {
        status: changedKnown ? "Known" : "Unknown",
        values: changed,
        provenance: "live-git",
        trust: "repository-untrusted"
      },
      completed_validation: validation.map((item) => ({
        claim: callerClaim(item),
        status: "Unknown"
      })),
      unknowns: unknowns.map(callerClaim),
      remaining_plan: remaining.map(callerClaim),
      suggested_next_step: {
        status: "Suggested",
        claim: callerClaim(next)
      }
    };
    return Buffer.byteLength(
      canonicalJson(compacted),
      "utf8"
    ) <= MAX_HANDOFF_BYTES
      ? compacted
      : null;
  } catch {
    return null;
  }
}

/**
 * @param {unknown} value
 * @returns {value is HandoffPreview}
 */
function isHandoffPreview(value) {
  if (
    isPlainRecord(value) &&
    hasExactKeys(value, [
      "content_sha256",
      "destination",
      "plan",
      "preview_sha256",
      "proposed_next_action",
      "schema",
      "trust_classification"
    ]) &&
    value.schema === "kanon-aswitch-preview-v1" &&
    typeof value.preview_sha256 === "string" &&
    SHA256.test(value.preview_sha256) &&
    typeof value.content_sha256 === "string" &&
    SHA256.test(value.content_sha256) &&
    isHandoffPlan(value.plan) &&
    isPlainRecord(value.destination) &&
    hasExactKeys(value.destination, [
      "path",
      "privacy",
      "provenance",
      "root",
      "status",
      "trust"
    ]) &&
    value.destination.status === "Known" &&
    safePathText(value.destination.root) &&
    safePathText(value.destination.path) &&
    value.destination.provenance ===
      "caller-selected-canonical-external-root" &&
    value.destination.trust === "caller-untrusted" &&
    isPlainRecord(value.destination.privacy) &&
    hasExactKeys(value.destination.privacy, [
      "diagnostic",
      "status"
    ]) &&
    (
      value.destination.privacy.status === "Known" ||
      value.destination.privacy.status === "Unknown"
    ) &&
    isBoundedString(value.destination.privacy.diagnostic, 256) &&
    value.trust_classification === "untrusted-context" &&
    isPlainRecord(value.proposed_next_action) &&
    hasExactKeys(value.proposed_next_action, ["status", "value"]) &&
    value.proposed_next_action.status === "Suggested" &&
    value.proposed_next_action.value ===
      "Show this preview and obtain explicit user approval before writing."
  ) {
    const bound = {
      content_sha256: value.content_sha256,
      destination_path: value.destination.path,
      plan: value.plan
    };
    return (
      sha256(canonicalJson(value.plan)) === value.content_sha256 &&
      sha256(canonicalJson(bound)) === value.preview_sha256
    );
  }
  return false;
}

/**
 * @param {unknown} value
 * @returns {value is HandoffEnvelope}
 */
function isHandoffEnvelope(value) {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      "checksum",
      "content_sha256",
      "coverage",
      "created_at",
      "mode",
      "payload",
      "preview_sha256",
      "repository",
      "schema",
      "source",
      "target",
      "transfer"
    ]) ||
    value.schema !== "kanon-agent-handoff-v1" ||
    !isNonnegativeSafeInteger(value.created_at) ||
    value.created_at > MAX_DATE_MS ||
    typeof value.preview_sha256 !== "string" ||
    !SHA256.test(value.preview_sha256) ||
    typeof value.content_sha256 !== "string" ||
    !SHA256.test(value.content_sha256) ||
    (value.mode !== "last-plan" && value.mode !== "compacted") ||
    !isPlainRecord(value.checksum) ||
    !hasExactKeys(value.checksum, [
      "algorithm",
      "authenticity",
      "value"
    ]) ||
    value.checksum.algorithm !== "sha256" ||
    value.checksum.authenticity !== false ||
    typeof value.checksum.value !== "string" ||
    !SHA256.test(value.checksum.value)
  ) {
    return false;
  }
  const plan = {
    schema: "kanon-aswitch-plan-v1",
    source: value.source,
    target: value.target,
    mode: value.mode,
    repository: value.repository,
    coverage: value.coverage,
    payload: value.payload,
    transfer: value.transfer
  };
  return (
    isHandoffPlan(plan) &&
    Buffer.byteLength(canonicalJson(value), "utf8") <=
      MAX_HANDOFF_BYTES
  );
}

/**
 * @param {unknown} value
 * @returns {value is HandoffPlan}
 */
function isHandoffPlan(value) {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      "coverage",
      "mode",
      "payload",
      "repository",
      "schema",
      "source",
      "target",
      "transfer"
    ]) ||
    value.schema !== "kanon-aswitch-plan-v1" ||
    (value.mode !== "last-plan" && value.mode !== "compacted") ||
    !validSource(value.source) ||
    !validTarget(value.target) ||
    !validRepository(value.repository) ||
    !validCoverage(value.coverage, value.mode) ||
    !validTransfer(value.transfer)
  ) {
    return false;
  }
  return value.mode === "last-plan"
    ? validLastPlanPayload(value.payload)
    : validCompactedPayload(value.payload);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function validSource(value) {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, ["host", "provenance", "status"]) &&
    (HOSTS.includes(/** @type {string} */ (value.host)) ||
      value.host === "Unknown") &&
    value.provenance === "active-adapter" &&
    (
      (value.host === "Unknown" && value.status === "Unknown") ||
      (value.host !== "Unknown" && value.status === "Known")
    )
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function validTarget(value) {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, ["host", "provenance", "trust"]) &&
    HOSTS.includes(/** @type {string} */ (value.host)) &&
    value.provenance === "caller-selected" &&
    value.trust === "caller-untrusted"
  );
}

/**
 * @param {unknown} value
 * @returns {value is HandoffRepositoryIdentity}
 */
function validRepository(value) {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      "canonical_root",
      "change_set",
      "recorded_commit"
    ]) ||
    !isPlainRecord(value.canonical_root) ||
    !hasExactKeys(value.canonical_root, [
      "provenance",
      "status",
      "trust",
      "value"
    ]) ||
    value.canonical_root.status !== "Known" ||
    !safePathText(value.canonical_root.value) ||
    value.canonical_root.provenance !== "live-canonicalization" ||
    value.canonical_root.trust !== "repository-identity-untrusted"
  ) {
    return false;
  }
  return (
    validCommit(value.recorded_commit) &&
    validChangeSet(value.change_set)
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function validCommit(value) {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, [
      "provenance",
      "status",
      "trust",
      "value"
    ]) &&
    value.provenance === "live-git" &&
    value.trust === "repository-untrusted" &&
    (
      (
        value.status === "Known" &&
        typeof value.value === "string" &&
        /^[0-9a-f]{40,64}$/.test(value.value)
      ) ||
      (value.status === "Unknown" && value.value === null)
    )
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function validChangeSet(value) {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, [
      "complete",
      "count",
      "provenance",
      "sha256",
      "status",
      "trust"
    ]) &&
    value.provenance === "live-git" &&
    value.trust === "repository-untrusted" &&
    (
      (
        value.status === "Known" &&
        value.complete === true &&
        isNonnegativeSafeInteger(value.count) &&
        typeof value.sha256 === "string" &&
        SHA256.test(value.sha256)
      ) ||
      (
        value.status === "Unknown" &&
        value.complete === false &&
        (value.count === null ||
          isNonnegativeSafeInteger(value.count)) &&
        value.sha256 === null
      )
    )
  );
}

/**
 * @param {unknown} value
 * @param {"last-plan" | "compacted"} mode
 * @returns {boolean}
 */
function validCoverage(value, mode) {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, [
      "kind",
      "omissions",
      "provenance",
      "truncated",
      "trust"
    ]) &&
    value.kind ===
      (mode === "last-plan" ? "last-plan-only" : "compacted-claims") &&
    Array.isArray(value.omissions) &&
    value.omissions.length === 3 &&
    value.omissions.every((item) => isBoundedString(item, 128)) &&
    value.truncated === false &&
    value.provenance === "kanon-bounded-selection" &&
    value.trust === "mixed-untrusted-context"
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function validTransfer(value) {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, [
      "authorization",
      "automatic_launch",
      "claims_repository_ownership",
      "deletes_source_history",
      "enforcement",
      "stops_source_agent"
    ]) &&
    value.authorization === false &&
    value.automatic_launch === false &&
    value.claims_repository_ownership === false &&
    value.deletes_source_history === false &&
    value.enforcement === false &&
    value.stops_source_agent === false
  );
}

/**
 * The state builder is the canonical schema validator for last-plan payloads.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function validLastPlanPayload(value) {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      "plan",
      "provenance",
      "schema",
      "trust"
    ]) ||
    value.schema !== "kanon-last-plan-handoff-v1" ||
    value.provenance !== "caller-supplied-explicit-steer-state" ||
    value.trust !== "caller-untrusted" ||
    !isSteerState(value.plan)
  ) {
    return false;
  }
  return true;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function validCompactedPayload(value) {
  if (
    !isPlainRecord(value) ||
    value.schema !== "kanon-compacted-handoff-v1"
  ) {
    return false;
  }
  const changed = value.changed_files;
  return (
    hasExactKeys(value, [
      "changed_files",
      "completed_validation",
      "constraints",
      "decisions",
      "evidence_references",
      "goal",
      "live_work_state",
      "remaining_plan",
      "schema",
      "suggested_next_step",
      "unknowns"
    ]) &&
    validCallerClaim(value.goal) &&
    validDecisionList(value.decisions) &&
    validCallerList(value.constraints) &&
    validCallerClaim(value.live_work_state) &&
    validStatusClaims(value.evidence_references, "claim") &&
    isPlainRecord(changed) &&
    hasExactKeys(changed, [
      "provenance",
      "status",
      "trust",
      "values"
    ]) &&
    (changed.status === "Known" || changed.status === "Unknown") &&
    changed.provenance === "live-git" &&
    changed.trust === "repository-untrusted" &&
    Array.isArray(changed.values) &&
    changed.values.length <= 64 &&
    changed.values.every(validGitValue) &&
    (changed.status === "Known" || changed.values.length === 0) &&
    validStatusClaims(value.completed_validation, "claim") &&
    validCallerList(value.unknowns) &&
    validCallerList(value.remaining_plan) &&
    isPlainRecord(value.suggested_next_step) &&
    hasExactKeys(value.suggested_next_step, ["claim", "status"]) &&
    value.suggested_next_step.status === "Suggested" &&
    validCallerClaim(value.suggested_next_step.claim)
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function validCallerClaim(value) {
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
 * @returns {boolean}
 */
function validGitValue(value) {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, ["provenance", "trust", "value"]) &&
    isBoundedString(value.value, 4_096) &&
    value.provenance === "live-git" &&
    value.trust === "repository-untrusted"
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function validCallerList(value) {
  return (
    Array.isArray(value) &&
    value.length <= 24 &&
    value.every(validCallerClaim)
  );
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function validDecisionList(value) {
  return (
    Array.isArray(value) &&
    value.length <= 16 &&
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
 * @param {string} field
 * @returns {boolean}
 */
function validStatusClaims(value, field) {
  return (
    Array.isArray(value) &&
    value.length <= 24 &&
    value.every((item) =>
      isPlainRecord(item) &&
      hasExactKeys(item, [field, "status"]) &&
      item.status === "Unknown" &&
      validCallerClaim(item[field])
    )
  );
}

/**
 * @param {HandoffEnvelope} envelope
 * @returns {Omit<HandoffEnvelope, "checksum">}
 */
function unsignedEnvelope(envelope) {
  return {
    schema: envelope.schema,
    created_at: envelope.created_at,
    preview_sha256: envelope.preview_sha256,
    content_sha256: envelope.content_sha256,
    source: envelope.source,
    target: envelope.target,
    mode: envelope.mode,
    repository: envelope.repository,
    coverage: envelope.coverage,
    payload: envelope.payload,
    transfer: envelope.transfer
  };
}

/**
 * @param {HandoffEnvelope} envelope
 * @returns {HandoffPlan}
 */
function planFromEnvelope(envelope) {
  return {
    schema: "kanon-aswitch-plan-v1",
    source: envelope.source,
    target: envelope.target,
    mode: envelope.mode,
    repository: envelope.repository,
    coverage: envelope.coverage,
    payload: envelope.payload,
    transfer: envelope.transfer
  };
}

/**
 * @param {unknown} value
 * @returns {AswitchApproval | null}
 */
function normalizeApproval(value) {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, ["approved", "preview_sha256", "schema"]) &&
    value.schema === "kanon-aswitch-approval-v1" &&
    value.approved === true &&
    typeof value.preview_sha256 === "string" &&
    SHA256.test(value.preview_sha256)
  )
    ? {
        schema: "kanon-aswitch-approval-v1",
        approved: true,
        preview_sha256: value.preview_sha256
      }
    : null;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function nullableHost(value) {
  return value === null || HOSTS.includes(/** @type {string} */ (value));
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function nullableMode(value) {
  return value === null || MODES.includes(/** @type {string} */ (value));
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function nullableSafePath(value) {
  return value === null || safePathText(value);
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function safePathText(value) {
  return (
    isBoundedString(value, 8_192) &&
    !UNSAFE_PATH_CONTROLS.test(value) &&
    sanitizeDisplayText(value, 8_192, {
      preserveWhitespace: true
    }) === value
  );
}

/**
 * @param {unknown} value
 * @param {number} maximum
 * @returns {string | null}
 */
function normalizeText(value, maximum) {
  if (!isBoundedString(value, maximum)) {
    return null;
  }
  const selected = sanitizeDisplayText(value, maximum);
  return selected ? selected : null;
}

/**
 * @param {unknown} value
 * @param {number} maximumItems
 * @param {number} maximumBytes
 * @returns {string[] | null}
 */
function normalizeList(value, maximumItems, maximumBytes) {
  if (!Array.isArray(value) || value.length > maximumItems) {
    return null;
  }
  const selected = value.map((item) =>
    normalizeText(item, maximumBytes)
  );
  if (selected.some((item) => item === null)) {
    return null;
  }
  return Array.from(new Set(/** @type {string[]} */ (selected)));
}

/**
 * @param {string} value
 * @returns {CallerClaim}
 */
function callerClaim(value) {
  return {
    value,
    provenance: "caller-supplied",
    trust: "caller-untrusted"
  };
}

/**
 * @param {{status: string, [key: string]: unknown}} left
 * @param {{status: string, [key: string]: unknown}} right
 * @param {string} field
 * @returns {"Known" | "Stale" | "Unknown"}
 */
function compareKnownValue(left, right, field) {
  if (left.status !== "Known" || right.status !== "Known") {
    return "Unknown";
  }
  return left[field] === right[field] ? "Known" : "Stale";
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {boolean}
 */
function samePathText(left, right) {
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

/**
 * Canonical JSON is used only after runtime validation has reduced values to
 * plain data. It does not invoke caller-controlled toJSON hooks.
 *
 * @param {unknown} value
 * @returns {string}
 */
function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  return `{${Object.keys(record)
    .sort(codeUnitCompare)
    .map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`
    )
    .join(",")}}`;
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {-1 | 0 | 1}
 */
function codeUnitCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * @param {string} value
 * @returns {string}
 */
function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * @returns {AswitchRequestResult}
 */
function invalidRequest() {
  return {
    ok: false,
    status: "Unknown",
    diagnostic:
      "Aswitch request input was unavailable, malformed, or over its bounded schema."
  };
}

/**
 * @returns {{
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: "The handoff envelope was unavailable, malformed, or over 64 KiB."
 * }}
 */
function invalidEnvelope() {
  return {
    ok: false,
    status: "Unknown",
    diagnostic:
      "The handoff envelope was unavailable, malformed, or over 64 KiB."
  };
}
