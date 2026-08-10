import { types as nodeTypes } from "node:util";
import { readContainedText } from "./safe-fs.js";
import { STATE_SCHEMA_VERSION } from "../version.js";
import { validateCurrentStateFields } from "./state-fields.js";

/**
 * @typedef {Record<string, unknown>} PersistedState
 * @typedef {{maxBytes?: number}} InspectionOptions
 * @typedef {{
 *   state: PersistedState | null,
 *   found: boolean,
 *   valid: boolean,
 *   warning: string | null
 * }} StateInspection
 * @typedef {{
 *   handoff: {
 *     found: boolean,
 *     valid: boolean,
 *     status: string,
 *     bytes: number
 *   },
 *   warning: string | null
 * }} HandoffInspection
 * @typedef {{valid: true, field: null, reason: null} | {
 *   valid: false,
 *   field: string,
 *   reason: string
 * }} StateValidation
 */

/** @type {Set<string>} */
const CURRENT_FIELDS = new Set([
  "version",
  "run_id",
  "generated_at",
  "repo",
  "scan",
  "git",
  "purpose",
  "commands",
  "important_files",
  "code_intelligence",
  "tests",
  "ci",
  "deployment",
  "release",
  "todos",
  "current_state",
  "verification",
  "configuration",
  "command_execution",
  "files",
  "evidence_count",
  "schema_version"
]);
const DEFAULT_HANDOFF_BYTES = 256 * 1024;
const MAX_HANDOFF_BYTES = 2 * 1024 * 1024;

/** @type {[string, "string" | "object" | "array" | "integer"][]} */
const REQUIRED_FIELDS = [
  ["version", "string"],
  ["run_id", "string"],
  ["generated_at", "string"],
  ["repo", "object"],
  ["scan", "object"],
  ["git", "object"],
  ["purpose", "object"],
  ["commands", "object"],
  ["important_files", "array"],
  ["code_intelligence", "object"],
  ["tests", "object"],
  ["ci", "object"],
  ["deployment", "object"],
  ["release", "object"],
  ["todos", "array"],
  ["current_state", "object"],
  ["verification", "object"],
  ["configuration", "object"],
  ["command_execution", "object"],
  ["files", "object"],
  ["evidence_count", "integer"]
];

/**
 * @param {string} root
 * @param {unknown} [options]
 * @returns {StateInspection}
 */
export function inspectPreviousState(root, options = {}) {
  const maximumBytes = inspectionLimit(options, 2 * 1024 * 1024);
  if (maximumBytes === null) {
    return invalidState(
      "STATE.json was not inspected because its read limit was invalid."
    );
  }
  const read = readContainedText(
    root,
    ".kanon/STATE.json",
    maximumBytes,
    { optional: true }
  );
  if (!read.ok && read.status === "missing") {
    return {
      state: null,
      found: false,
      valid: true,
      warning: null
    };
  }
  if (!read.ok) {
    return invalidState(
      `STATE.json was ignored because it was ${read.status}: ${read.reason}`
    );
  }

  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(read.text);
  } catch {
    return invalidState("STATE.json was ignored because it is not valid JSON.");
  }
  const validation = validatePersistedState(parsed);
  if (!validation.valid) {
    return invalidState(
      `STATE.json was ignored at ${validation.field}: ${validation.reason}`
    );
  }
  if (!plainObject(parsed)) {
    return invalidState("STATE.json was ignored because its root is invalid.");
  }
  const schemaVersion = typeof parsed.schema_version === "number"
    ? parsed.schema_version
    : 1;
  return {
    state: {
      ...parsed,
      schema_version: schemaVersion
    },
    found: true,
    valid: true,
    warning: null
  };
}

/**
 * @param {string} root
 * @param {unknown} [options]
 * @returns {HandoffInspection}
 */
export function inspectPreviousHandoff(root, options = {}) {
  const maximumBytes = inspectionLimit(
    options,
    DEFAULT_HANDOFF_BYTES,
    MAX_HANDOFF_BYTES
  );
  if (maximumBytes === null) {
    return {
      handoff: {
        found: true,
        valid: false,
        status: "invalid-options",
        bytes: 0
      },
      warning:
        "HANDOFF.md was not inspected because its read limit was invalid."
    };
  }
  const read = readContainedText(
    root,
    ".kanon/HANDOFF.md",
    maximumBytes,
    { optional: true }
  );
  if (!read.ok && read.status === "missing") {
    return {
      handoff: {
        found: false,
        valid: true,
        status: "missing",
        bytes: 0
      },
      warning: null
    };
  }
  if (!read.ok) {
    return {
      handoff: {
        found: true,
        valid: false,
        status: read.status,
        bytes: 0
      },
      warning:
        `HANDOFF.md was ignored because it was ${read.status}: ${read.reason}`
    };
  }
  if (!read.text.startsWith("# Resume This Repo\n")) {
    return {
      handoff: {
        found: true,
        valid: false,
        status: "malformed",
        bytes: read.bytes
      },
      warning:
        "HANDOFF.md was ignored because its Kanon header was unavailable."
    };
  }
  return {
    handoff: {
      found: true,
      valid: true,
      status: "available",
      bytes: read.bytes
    },
    warning: null
  };
}

/**
 * @param {unknown} value
 * @returns {StateValidation}
 */
export function validatePersistedState(value) {
  if (!plainObject(value)) {
    return invalid("root", "Expected an object.");
  }
  const version = value.schema_version ?? 1;
  if (
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1 ||
    version > STATE_SCHEMA_VERSION
  ) {
    return invalid(
      "schema_version",
      `Expected a supported version from 1 to ${STATE_SCHEMA_VERSION}.`
    );
  }
  if (version === 1) {
    return plainObject(value.repo)
      ? valid()
      : invalid("repo", "Legacy state requires a repo object.");
  }
  for (const key of Object.keys(value)) {
    if (!CURRENT_FIELDS.has(key)) {
      return invalid(key, `Unknown current-schema field: ${key}.`);
    }
  }
  for (const [field, type] of REQUIRED_FIELDS) {
    if (!hasType(value[field], type)) {
      return invalid(field, `Expected ${type}.`);
    }
  }
  if (
    typeof value.generated_at !== "string" ||
    !Number.isFinite(Date.parse(value.generated_at))
  ) {
    return invalid("generated_at", "Expected an ISO timestamp.");
  }
  return validateCurrentStateFields(value);
}

/**
 * @param {unknown} value
 * @param {"string" | "object" | "array" | "integer"} type
 * @returns {boolean}
 */
function hasType(value, type) {
  if (type === "array") {
    return Array.isArray(value);
  }
  if (type === "object") {
    return plainObject(value);
  }
  if (type === "integer") {
    return typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0;
  }
  return typeof value === type;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function plainObject(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(
    (descriptor) => !descriptor.get && !descriptor.set
  );
}

/**
 * @param {unknown} options
 * @param {number} fallback
 * @param {number} [maximum]
 * @returns {number | null}
 */
function inspectionLimit(options, fallback, maximum = 8 * 1024 * 1024) {
  if (!plainObject(options)) {
    return null;
  }
  if (Object.keys(options).some((key) => key !== "maxBytes")) {
    return null;
  }
  if (options.maxBytes === undefined) {
    return fallback;
  }
  return typeof options.maxBytes === "number" &&
      Number.isSafeInteger(options.maxBytes) &&
      options.maxBytes > 0 &&
      options.maxBytes <= maximum
    ? options.maxBytes
    : null;
}

/**
 * @param {string} warning
 * @returns {StateInspection}
 */
function invalidState(warning) {
  return {
    state: null,
    found: true,
    valid: false,
    warning
  };
}

/**
 * @param {string} field
 * @param {string} reason
 * @returns {StateValidation}
 */
function invalid(field, reason) {
  return { valid: false, field, reason };
}

/** @returns {StateValidation} */
function valid() {
  return { valid: true, field: null, reason: null };
}
