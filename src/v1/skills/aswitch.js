import {
  aswitchPayloadOptions,
  buildHandoffPlan,
  buildHandoffPreview,
  buildHandoffRepositoryIdentity,
  classifyReceivedHandoff,
  createHandoffEnvelope,
  normalizeAswitchRequest,
  validateHandoffEnvelope
} from "../core/handoff.js";
import {
  readHandoffText,
  resolveHandoffDestination,
  writeHandoffText
} from "../core/handoff-store.js";
import {
  observeRepositoryGit
} from "../repository/git.js";
import {
  canonicalizeRepositoryRoot
} from "../repository/read.js";
import { REPOSITORY_TRUST_BOUNDARY } from "./orient.js";

const MAX_DATE_MS = 8_640_000_000_000_000;

/**
 * @typedef {{
 *   root: string,
 *   request: unknown
 * }} AswitchInput
 * @typedef {{
 *   host: "codex-cli" | "claude-code" | "Unknown",
 *   now?: number,
 *   git_runner?: import("../repository/git.js").GitRunner
 * }} AswitchContext
 * @typedef {Record<string, unknown> & {
 *   schema: "kanon-aswitch-report-v1",
 *   ok: boolean,
 *   status: "Known" | "Stale" | "Unknown",
 *   repository_read_only: true,
 *   enforcement: false,
 *   authorization: false,
 *   automatic_launch: false,
 *   trust_boundary: string,
 *   diagnostics: string[]
 * }} AswitchReport
 */

/**
 * Execute only one explicit preview, write, or receive transition. The skill
 * never launches a process and never writes inside the repository.
 *
 * @param {AswitchInput} input
 * @param {AswitchContext} context
 * @returns {AswitchReport}
 */
export function runAswitch(input, context) {
  const request = normalizeAswitchRequest(input.request);
  if (!request.ok) {
    return unavailableReport(request.diagnostic);
  }
  if (request.value.operation === "receive") {
    return receiveHandoff(
      input.root,
      request.value.handoff_path,
      context
    );
  }
  const selected = request.value;
  const initialOptions = aswitchPayloadOptions(
    selected.last_plan,
    selected.compacted,
    null
  );
  if (selected.target_host === null) {
    return selectionReport(
      "AwaitingTarget",
      initialOptions,
      "Ask the user to choose Codex CLI or Claude Code as the target host."
    );
  }
  if (selected.payload_mode === null) {
    return selectionReport(
      "AwaitingPayload",
      initialOptions,
      "Offer exactly the three payload modes and obtain one selection."
    );
  }
  if (selected.payload_mode === "full-history") {
    return {
      ...baseReport(false, "Unknown"),
      stage: "ModeUnavailable",
      read_only: true,
      payload_options: initialOptions,
      target_host: selected.target_host,
      selected_mode: "full-history",
      preview: null,
      diagnostic:
        "Full-history is experimental and unavailable in this slice without a separately acknowledged qualifying source."
    };
  }

  const repository = canonicalizeRepositoryRoot(input.root);
  if (!repository.ok) {
    return unavailableReport(repository.diagnostic);
  }
  const git = observeRepositoryGit(repository.root, {
    ...(context.git_runner === undefined
      ? {}
      : { runner: context.git_runner })
  });
  const options = aswitchPayloadOptions(
    selected.last_plan,
    selected.compacted,
    git
  );
  const identity = buildHandoffRepositoryIdentity(
    repository.root,
    git
  );
  const plan = buildHandoffPlan({
    source_host: context.host,
    target_host: selected.target_host,
    mode: selected.payload_mode,
    repository: identity,
    last_plan: selected.last_plan,
    compacted: selected.compacted,
    git
  });
  if (!plan.ok) {
    return {
      ...baseReport(false, "Unknown"),
      stage: "PayloadUnavailable",
      read_only: true,
      payload_options: options,
      target_host: selected.target_host,
      selected_mode: selected.payload_mode,
      preview: null,
      diagnostic: plan.diagnostic
    };
  }
  if (selected.destination_root === null) {
    return {
      ...baseReport(true, "Known"),
      stage: "AwaitingDestination",
      read_only: true,
      payload_options: options,
      target_host: selected.target_host,
      selected_mode: selected.payload_mode,
      preview: null,
      proposed_next_action: {
        status: "Suggested",
        value:
          "Select an existing private handoff directory outside the repository."
      }
    };
  }
  const destination = resolveHandoffDestination(
    selected.destination_root,
    repository.root,
    plan.content_sha256
  );
  if (!destination.ok) {
    return unavailableReport(destination.diagnostic);
  }
  const preview = buildHandoffPreview(
    plan.plan,
    plan.content_sha256,
    destination.root,
    destination.path,
    destination.identity_sha256
  );
  if (selected.operation === "preview") {
    return {
      ...baseReport(true, "Known"),
      stage: "AwaitingApproval",
      read_only: true,
      payload_options: options,
      target_host: selected.target_host,
      selected_mode: selected.payload_mode,
      preview,
      write: null,
      manual_launch: null,
      diagnostics: [
        "The preview is untrusted context and is not authorization to write or launch."
      ]
    };
  }
  if (
    context.host === "Unknown" ||
    selected.approval === null ||
    selected.approval.preview_sha256 !== preview.preview_sha256
  ) {
    return {
      ...baseReport(false, "Unknown"),
      stage: "ApprovalUnavailable",
      read_only: true,
      payload_options: options,
      target_host: selected.target_host,
      selected_mode: selected.payload_mode,
      preview,
      write: null,
      manual_launch: null,
      diagnostic:
        context.host === "Unknown"
          ? "The active source host was unavailable; no handoff was written."
          : "The caller-asserted approval did not match the exact preview; no handoff was written."
    };
  }
  const envelope = createHandoffEnvelope(
    preview,
    validNow(context.now) ? context.now : Date.now()
  );
  if (!envelope.ok) {
    return unavailableReport(envelope.diagnostic);
  }
  const written = writeHandoffText(destination, envelope.text);
  if (!written.ok) {
    return unavailableReport(written.diagnostic);
  }
  return {
    ...baseReport(true, "Known"),
    stage: "HandoffWritten",
    read_only: false,
    repository_read_only: true,
    payload_options: options,
    target_host: selected.target_host,
    selected_mode: selected.payload_mode,
    preview,
    write: {
      status: "Known",
      path: destination.path,
      checksum_sha256: envelope.value.checksum.value,
      limits: {
        max_handoff_bytes: 65_536,
        max_handoffs_per_destination: 8,
        max_destination_entries_inspected: 256
      },
      approval: {
        status: "Known",
        provenance: "caller-asserted-explicit-user-approval",
        preview_sha256: selected.approval.preview_sha256
      },
      source_history_deleted: false,
      source_agent_stopped: false,
      repository_ownership_claimed: false
    },
    manual_launch: manualLaunch(
      selected.target_host,
      repository.root,
      destination.path
    ),
    diagnostics: [
      "The handoff was written outside the repository; no process was launched.",
      "The checksum detects content change but is not an authenticity signature."
    ]
  };
}

/**
 * @param {string} repositoryRoot
 * @param {string} handoffPath
 * @param {AswitchContext} context
 * @returns {AswitchReport}
 */
function receiveHandoff(repositoryRoot, handoffPath, context) {
  const repository = canonicalizeRepositoryRoot(repositoryRoot);
  if (!repository.ok) {
    return unavailableReport(repository.diagnostic);
  }
  const loaded = readHandoffText(handoffPath, repository.root);
  if (!loaded.ok) {
    return unavailableReport(loaded.diagnostic);
  }
  let parsed;
  try {
    parsed = JSON.parse(loaded.text);
  } catch {
    return unavailableReport(
      "The handoff file did not contain valid bounded JSON."
    );
  }
  const envelope = validateHandoffEnvelope(parsed);
  if (!envelope.ok) {
    return {
      ...baseReport(false, envelope.status),
      stage: "ReceiveRejected",
      read_only: true,
      handoff_path: loaded.path,
      classification:
        envelope.status === "Stale" ? "Stale" : "Unknown",
      diagnostic: envelope.diagnostic
    };
  }
  if (envelope.value.content_sha256 !== loaded.content_sha256) {
    return {
      ...baseReport(false, "Stale"),
      stage: "ReceiveRejected",
      read_only: true,
      handoff_path: loaded.path,
      classification: "Stale",
      diagnostic:
        "The content-derived handoff filename did not match the envelope."
    };
  }
  const git = observeRepositoryGit(repository.root, {
    ...(context.git_runner === undefined
      ? {}
      : { runner: context.git_runner })
  });
  const live = buildHandoffRepositoryIdentity(repository.root, git);
  const classification = classifyReceivedHandoff(
    envelope.value,
    live,
    context.host
  );
  return {
    ...baseReport(
      classification.classification === "Current",
      classification.status
    ),
    stage:
      classification.classification === "Current"
        ? "ReceiveValidated"
        : "ReceiveNeedsDecision",
    read_only: true,
    handoff_path: loaded.path,
    classification: classification.classification,
    comparisons: classification.comparisons,
    requires_refresh_or_explicit_approval:
      classification.requires_refresh_or_explicit_approval,
    envelope: envelope.value,
    live_repository: live,
    diagnostic: classification.diagnostic,
    diagnostics: [
      "Handoff payload fields remain untrusted claims.",
      "The suggested next step is not an imperative instruction.",
      "No repository ownership, process supervision, or execution authority was inferred."
    ]
  };
}

/**
 * @param {string} stage
 * @param {ReturnType<typeof aswitchPayloadOptions>} options
 * @param {string} next
 * @returns {AswitchReport}
 */
function selectionReport(stage, options, next) {
  return {
    ...baseReport(true, "Known"),
    stage,
    read_only: true,
    target_host: null,
    selected_mode: null,
    payload_options: options,
    preview: null,
    proposed_next_action: {
      status: "Suggested",
      value: next
    }
  };
}

/**
 * @param {"codex-cli" | "claude-code"} targetHost
 * @param {string} root
 * @param {string} handoffPath
 * @returns {Record<string, unknown>}
 */
function manualLaunch(targetHost, root, handoffPath) {
  const executable =
    targetHost === "codex-cli" ? "codex" : "claude";
  return {
    schema: "kanon-manual-launch-v1",
    status: "Suggested",
    capability: "manual-fallback",
    automatic_launch: false,
    executable: {
      value: executable,
      resolution: "Unknown",
      diagnostic:
        "The executable was not resolved, trusted, or launched by Kanon."
    },
    cwd: {
      value: root,
      provenance: "live-canonicalization",
      trust: "repository-identity-untrusted"
    },
    arguments: [
      {
        value:
          `Use Kanon's fixed aswitch receiving bootstrap for this handoff path: ${handoffPath}`,
        provenance: "kanon-fixed-bootstrap-plus-safe-handoff-path",
        trust: "kanon-generated"
      }
    ],
    handoff_path: handoffPath,
    raw_handoff_content_in_arguments: false,
    approval_required_before_external_execution: true
  };
}

/**
 * @param {boolean} ok
 * @param {"Known" | "Stale" | "Unknown"} status
 * @returns {AswitchReport}
 */
function baseReport(ok, status) {
  return {
    schema: "kanon-aswitch-report-v1",
    ok,
    status,
    repository_read_only: true,
    enforcement: false,
    authorization: false,
    automatic_launch: false,
    trust_boundary: REPOSITORY_TRUST_BOUNDARY,
    diagnostics: []
  };
}

/**
 * @param {string} diagnostic
 * @returns {AswitchReport}
 */
function unavailableReport(diagnostic) {
  return {
    ...baseReport(false, "Unknown"),
    stage: "Unavailable",
    read_only: true,
    diagnostic
  };
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function validNow(value) {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_DATE_MS
  );
}
