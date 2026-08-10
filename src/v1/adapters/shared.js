import { isPlainRecord } from "../core/trust.js";

/**
 * @typedef {{
 *   host_session?: unknown,
 *   plugin_data_root?: unknown,
 *   receipt_host_evidence?: unknown,
 *   transport?: import("../registry/transport.js").RegistryTransport,
 *   now?: number,
 *   git_runner?: import("../repository/git.js").GitRunner
 * }} AdapterInvocationContext
 */

const MAX_DATE_MS = 8_640_000_000_000_000;

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export function isRecord(value) {
  return isPlainRecord(value);
}

/**
 * Normalize the host adapter's external context without allowing it to choose
 * a host or add unsupported control fields. Each downstream boundary performs
 * its own runtime validation.
 *
 * @param {unknown} value
 * @returns {AdapterInvocationContext}
 */
export function normalizeAdapterInvocationContext(value) {
  if (!isRecord(value)) {
    return {};
  }
  const allowed = new Set([
    "git_runner",
    "host_session",
    "now",
    "plugin_data_root",
    "receipt_host_evidence",
    "transport"
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return {};
  }
  return {
    ...(value.host_session === undefined
      ? {}
      : { host_session: value.host_session }),
    ...(value.plugin_data_root === undefined
      ? {}
      : { plugin_data_root: value.plugin_data_root }),
    ...(value.receipt_host_evidence === undefined
      ? {}
      : { receipt_host_evidence: value.receipt_host_evidence }),
    ...(isRegistryTransport(value.transport)
      ? { transport: value.transport }
      : {}),
    ...(
      typeof value.now === "number" &&
      Number.isSafeInteger(value.now) &&
      value.now >= 0 &&
      value.now <= MAX_DATE_MS
        ? { now: value.now }
        : {}
    ),
    ...(isGitRunner(value.git_runner)
      ? { git_runner: value.git_runner }
      : {})
  };
}

/**
 * Function outputs remain hostile and are separately validated by the
 * deprecation checker.
 *
 * @param {unknown} value
 * @returns {value is import("../registry/transport.js").RegistryTransport}
 */
function isRegistryTransport(value) {
  return typeof value === "function";
}

/**
 * Git runner outputs remain hostile and are separately validated by the Git
 * observation boundary.
 *
 * @param {unknown} value
 * @returns {value is import("../repository/git.js").GitRunner}
 */
function isGitRunner(value) {
  return typeof value === "function";
}
