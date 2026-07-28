import {
  checkExactVersionDeprecation
} from "../registry/deprecation.js";
import {
  resolveExternalPluginDataRoot
} from "../core/plugin-data.js";
import {
  hasExactKeys,
  isBoundedString,
  isPlainRecord,
  sanitizeDisplayText
} from "../core/trust.js";
import {
  isReceiptHostEvidence,
  isReceiptHostSession
} from "../core/receipt.js";
import {
  canonicalizeRepositoryRoot,
  isSafeRelativePath
} from "../repository/read.js";
import { runOrient } from "./orient.js";
import { runResume } from "./resume.js";
import { runStatus } from "./status.js";
import { runVerify } from "./verify.js";

const MAX_DATE_MS = 8_640_000_000_000_000;

/**
 * @typedef {"orient" | "resume" | "verify" | "status"} StableSkill
 * @typedef {"codex-cli" | "claude-code" | "Unknown"} InvocationHost
 * @typedef {{
 *   schema: "kanon-stable-invocation-v1",
 *   skill: StableSkill,
 *   root: string,
 *   task?: string,
 *   target?: string,
 *   receipt?: unknown
 * }} StableInvocation
 * @typedef {{
 *   host: InvocationHost,
 *   host_session?: unknown,
 *   plugin_data_root?: unknown,
 *   receipt_host_evidence?: unknown,
 *   transport?: import("../registry/transport.js").RegistryTransport,
 *   now?: number,
 *   git_runner?: import("../repository/git.js").GitRunner
 * }} InvocationContext
 * @typedef {{
 *   schema: "kanon-stable-skill-result-v1",
 *   version: string | "Unknown",
 *   skill: StableSkill | "Unknown",
 *   ok: boolean,
 *   status: "Known" | "Stale" | "Unknown",
 *   host: {
 *     name: InvocationHost,
 *     mode: "notice",
 *     enforcement: false,
 *     hook_status: "Unknown",
 *     lifecycle_notice_hook: "Unavailable",
 *     notice_delivery: "explicit-skill-and-status-output"
 *   },
 *   deprecation: Awaited<ReturnType<typeof checkExactVersionDeprecation>>,
 *   report: ReturnType<typeof runOrient> | ReturnType<typeof runResume> |
 *     ReturnType<typeof runVerify> | ReturnType<typeof runStatus> | {
 *       schema: "kanon-invalid-invocation-v1",
 *       ok: false,
 *       status: "Unknown",
 *       enforcement: false,
 *       diagnostic: string,
 *       diagnostics: string[]
 *     },
 *   diagnostics: string[]
 * }} StableSkillResult
 */

/**
 * Every call consults the one shared exact-version deprecation checker before
 * dispatching a stable skill.
 *
 * @param {unknown} rawInput
 * @param {InvocationContext} context
 * @returns {Promise<StableSkillResult>}
 */
export async function executeStableInvocation(rawInput, context) {
  const host = normalizeHost(context.host);
  const hostSession =
    isReceiptHostSession(context.host_session) &&
    context.host_session.host === host
      ? context.host_session
      : undefined;
  const receiptHostEvidence =
    isReceiptHostEvidence(context.receipt_host_evidence) &&
    context.receipt_host_evidence.host === host
      ? context.receipt_host_evidence
      : undefined;
  const pluginDataRoot = selectExternalPluginDataRoot(
    context.plugin_data_root,
    rawInput
  );
  const deprecation = await checkExactVersionDeprecation({
    ...(hostSession === undefined ? {} : { host_session: hostSession }),
    ...(pluginDataRoot === undefined
      ? {}
      : { plugin_data_root: pluginDataRoot }),
    ...(typeof context.transport === "function"
      ? { transport: context.transport }
      : {}),
    ...(validNow(context.now) ? { now: context.now } : {})
  });
  const input = validateInvocation(rawInput);
  if (!input.ok) {
    const report = {
      schema: /** @type {"kanon-invalid-invocation-v1"} */ (
        "kanon-invalid-invocation-v1"
      ),
      ok: /** @type {false} */ (false),
      status: /** @type {"Unknown"} */ ("Unknown"),
      enforcement: /** @type {false} */ (false),
      diagnostic: input.diagnostic,
      diagnostics: []
    };
    return envelope(
      "Unknown",
      host,
      deprecation,
      report
    );
  }

  const stableInput = input.value;
  const task = stableInput.task ||
    defaultTask(stableInput.skill, stableInput.target);
  const sharedContext = {
    ...(pluginDataRoot === undefined
      ? {}
      : { plugin_data_root: pluginDataRoot }),
    ...(receiptHostEvidence === undefined
      ? {}
      : { receipt_host_evidence: receiptHostEvidence }),
    ...(context.git_runner === undefined
      ? {}
      : { git_runner: context.git_runner }),
    ...(validNow(context.now) ? { now: context.now } : {})
  };
  let report;
  switch (stableInput.skill) {
    case "orient":
      report = runOrient(
        { root: stableInput.root, task },
        sharedContext
      );
      break;
    case "resume":
      report = runResume(
        { root: stableInput.root, task },
        sharedContext
      );
      break;
    case "verify":
      report = runVerify(
        {
          root: stableInput.root,
          task,
          target: stableInput.target || "README.md",
          ...(stableInput.receipt === undefined
            ? {}
            : { receipt: stableInput.receipt })
        },
        sharedContext
      );
      break;
    case "status":
      report = runStatus(
        {
          root: stableInput.root,
          ...(stableInput.receipt === undefined
            ? {}
            : { receipt: stableInput.receipt })
        },
        {
          host,
          deprecation_status: deprecation,
          ...(pluginDataRoot === undefined
            ? {}
            : { plugin_data_root: pluginDataRoot }),
          ...(validNow(context.now) ? { now: context.now } : {})
        }
      );
      break;
  }
  return envelope(
    stableInput.skill,
    host,
    deprecation,
    report
  );
}

/**
 * @param {StableSkill | "Unknown"} skill
 * @param {InvocationHost} host
 * @param {Awaited<ReturnType<typeof checkExactVersionDeprecation>>} deprecation
 * @param {StableSkillResult["report"]} report
 * @returns {StableSkillResult}
 */
function envelope(skill, host, deprecation, report) {
  const status =
    report.status === "Stale"
      ? "Stale"
      : report.status === "Known"
        ? "Known"
        : "Unknown";
  return {
    schema: "kanon-stable-skill-result-v1",
    version:
      "installed_version" in deprecation &&
      typeof deprecation.installed_version === "string"
        ? deprecation.installed_version
        : "Unknown",
    skill,
    ok: report.ok,
    status,
    host: {
      name: host,
      mode: "notice",
      enforcement: false,
      hook_status: "Unknown",
      lifecycle_notice_hook: "Unavailable",
      notice_delivery: "explicit-skill-and-status-output"
    },
    deprecation,
    report,
    diagnostics: Array.from(
      new Set([
        ...report.diagnostics,
        ...deprecation.diagnostics
      ])
    )
      .map((item) => sanitizeDisplayText(item, 512))
      .filter(Boolean)
      .slice(0, 16)
  };
}

/**
 * @param {unknown} value
 * @returns {{
 *   ok: true,
 *   value: StableInvocation
 * } | {
 *   ok: false,
 *   diagnostic: string
 * }}
 */
function validateInvocation(value) {
  if (
    !isPlainRecord(value) ||
    value.schema !== "kanon-stable-invocation-v1" ||
    (
      value.skill !== "orient" &&
      value.skill !== "resume" &&
      value.skill !== "verify" &&
      value.skill !== "status"
    ) ||
    !isBoundedString(value.root, 8_192) ||
    (
      value.task !== undefined &&
      !isBoundedString(value.task, 2_048)
    ) ||
    (
      value.target !== undefined &&
      (
        !isBoundedString(value.target, 4_096) ||
        !isSafeRelativePath(value.target)
      )
    )
  ) {
    return invalidInvocation();
  }
  const allowed = ["receipt", "root", "schema", "skill", "target", "task"];
  if (!Object.keys(value).every((key) => allowed.includes(key))) {
    return invalidInvocation();
  }
  if (
    (value.skill === "orient" || value.skill === "resume") &&
    (
      value.target !== undefined ||
      value.receipt !== undefined
    )
  ) {
    return invalidInvocation();
  }
  if (
    value.skill === "status" &&
    (
      value.task !== undefined ||
      value.target !== undefined
    )
  ) {
    return invalidInvocation();
  }
  return {
    ok: true,
    value: {
      schema: "kanon-stable-invocation-v1",
      skill: value.skill,
      root: value.root,
      ...(value.task === undefined ? {} : { task: value.task }),
      ...(value.target === undefined ? {} : { target: value.target }),
      ...(value.receipt === undefined ? {} : { receipt: value.receipt })
    }
  };
}

/**
 * @returns {{ok: false, diagnostic: string}}
 */
function invalidInvocation() {
  return {
    ok: false,
    diagnostic: "Stable skill invocation input was unavailable or invalid."
  };
}

/**
 * @param {InvocationHost} host
 * @returns {InvocationHost}
 */
function normalizeHost(host) {
  return host === "codex-cli" || host === "claude-code"
    ? host
    : "Unknown";
}

/**
 * @param {StableSkill} skill
 * @param {string | undefined} target
 * @returns {string}
 */
function defaultTask(skill, target) {
  switch (skill) {
    case "orient":
      return "bounded repository orientation";
    case "resume":
      return "resume from live repository evidence";
    case "verify":
      return `verify ${target || "README.md"}`;
    case "status":
      return "status";
  }
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

/**
 * A stable read may use the shared deprecation cache only when the host cache
 * root is canonical, external to the selected repository, and not its parent.
 * Invalid or unavailable scope simply disables caching; the exact-version
 * lookup still runs and remains fail-open.
 *
 * @param {unknown} pluginDataRoot
 * @param {unknown} rawInput
 * @returns {string | undefined}
 */
function selectExternalPluginDataRoot(pluginDataRoot, rawInput) {
  if (!isPlainRecord(rawInput)) {
    return undefined;
  }
  const repository = canonicalizeRepositoryRoot(rawInput.root);
  if (!repository.ok) {
    return undefined;
  }
  const selected = resolveExternalPluginDataRoot(
    pluginDataRoot,
    repository.root
  );
  return selected.ok ? selected.root : undefined;
}
