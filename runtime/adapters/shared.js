/**
 * @typedef {"codex-cli" | "claude-code"} HostName
 * @typedef {"shell" | "mutation"} OperationKind
 * @typedef {{
 *   schema: "kanon-host-event-v1",
 *   host: HostName,
 *   event: "pre-tool-use",
 *   operation: OperationKind,
 *   session_id_observed: boolean,
 *   turn_id_observed: boolean,
 *   cwd_observed: boolean,
 *   trust: "host-untrusted"
 * }} NormalizedHostEvent
 * @typedef {{
 *   ok: true,
 *   value: NormalizedHostEvent
 * } | {
 *   ok: false,
 *   status: "Unknown",
 *   diagnostic: string
 * }} NormalizeResult
 * @typedef {{
 *   host_session?: unknown,
 *   plugin_data_root?: unknown,
 *   transport?: import("../registry/transport.js").RegistryTransport,
 *   now?: number,
 *   git_runner?: import("../repository/git.js").GitRunner
 * }} AdapterInvocationContext
 */

const INVALID_INPUT_DIAGNOSTIC =
  "Host hook input was unavailable or invalid; hook state remains Unknown.";
const MAX_DATE_MS = 8_640_000_000_000_000;

/**
 * Normalize a host hook payload without retaining identifiers, paths, tool
 * arguments, or other host-provided strings.
 *
 * @param {unknown} input
 * @param {HostName} host
 * @param {Readonly<Record<string, OperationKind>>} operations
 * @returns {NormalizeResult}
 */
export function normalizeHookInput(input, host, operations) {
  if (!isRecord(input)) {
    return invalidInput();
  }
  if (
    input.hook_event_name !== "PreToolUse" ||
    !isBoundedString(input.tool_name, 128) ||
    !isRecord(input.tool_input)
  ) {
    return invalidInput();
  }
  if (
    !isOptionalBoundedString(input.session_id, 256) ||
    !isOptionalBoundedString(input.turn_id, 256) ||
    !isOptionalBoundedString(input.cwd, 4_096)
  ) {
    return invalidInput();
  }

  const operation = operations[input.tool_name];
  if (!operation) {
    return invalidInput();
  }

  return {
    ok: true,
    value: {
      schema: "kanon-host-event-v1",
      host,
      event: "pre-tool-use",
      operation,
      session_id_observed: typeof input.session_id === "string",
      turn_id_observed: typeof input.turn_id === "string",
      cwd_observed: typeof input.cwd === "string",
      trust: "host-untrusted"
    }
  };
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export function isRecord(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
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

/**
 * @param {unknown} value
 * @param {number} maximum
 * @returns {value is string}
 */
function isBoundedString(value, maximum) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Buffer.byteLength(value, "utf8") <= maximum
  );
}

/**
 * @param {unknown} value
 * @param {number} maximum
 * @returns {boolean}
 */
function isOptionalBoundedString(value, maximum) {
  return value === undefined || isBoundedString(value, maximum);
}

/**
 * @returns {NormalizeResult}
 */
function invalidInput() {
  return {
    ok: false,
    status: "Unknown",
    diagnostic: INVALID_INPUT_DIAGNOSTIC
  };
}
