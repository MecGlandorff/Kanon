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
 */

const INVALID_INPUT_DIAGNOSTIC =
  "Host hook input was unavailable or invalid; hook state remains Unknown.";

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
 * @param {unknown} value
 * @param {number} maximum
 * @returns {value is string}
 */
function isBoundedString(value, maximum) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum
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
