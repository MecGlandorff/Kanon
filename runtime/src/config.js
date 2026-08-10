import { readTextResult } from "./scanner.js";
import { CONFIG_SCHEMA_VERSION } from "./version.js";

const MAX_CONFIG_BYTES = 64 * 1024;

/**
 * @typedef {{
 *   version: number,
 *   command_execution: "ask" | "never",
 *   scan: {
 *     max_files: number,
 *     max_entries: number,
 *     max_file_bytes: number,
 *     max_total_hash_bytes: number,
 *     max_total_text_bytes: number,
 *     max_elapsed_ms: number,
 *     respect_git_ignore: boolean
 *   },
 *   git: {
 *     timeout_ms: number,
 *     max_output_bytes: number
 *   },
 *   inputs: {
 *     max_state_bytes: number,
 *     max_todo_bytes: number,
 *     max_ignore_bytes: number
 *   },
 *   persistence: {
 *     max_evidence_bytes: number,
 *     max_evidence_records: number,
 *     max_snapshots: number
 *   }
 * }} KanonConfig
 * @typedef {{
 *   maxFiles: number,
 *   maxEntries: number,
 *   maxFileBytes: number,
 *   maxTotalHashBytes: number,
 *   maxTotalTextBytes: number,
 *   maxElapsedMs: number,
 *   maxIgnoreBytes: number,
 *   gitTimeoutMs: number,
 *   gitMaxOutputBytes: number,
 *   useGitIgnore: boolean
 * }} EffectiveScanOptions
 * @typedef {(value: unknown) => string | null} FieldRule
 * @typedef {{
 *   valid: true,
 *   field: null,
 *   reason: null
 * } | {
 *   valid: false,
 *   field: string,
 *   reason: string
 * }} ConfigValidation
 */

/** @type {KanonConfig} */
export const DEFAULT_CONFIG = deepFreeze({
  version: CONFIG_SCHEMA_VERSION,
  command_execution: "ask",
  scan: {
    max_files: 2_000,
    max_entries: 10_000,
    max_file_bytes: 750_000,
    max_total_hash_bytes: 32 * 1024 * 1024,
    max_total_text_bytes: 8 * 1024 * 1024,
    max_elapsed_ms: 5_000,
    respect_git_ignore: true
  },
  git: {
    timeout_ms: 2_000,
    max_output_bytes: 8 * 1024 * 1024
  },
  inputs: {
    max_state_bytes: 2 * 1024 * 1024,
    max_todo_bytes: 256 * 1024,
    max_ignore_bytes: 128 * 1024
  },
  persistence: {
    max_evidence_bytes: 16 * 1024 * 1024,
    max_evidence_records: 10_000,
    max_snapshots: 100
  }
});

/** @type {Map<string, FieldRule>} */
const FIELD_RULES = new Map([
  ["version", integerRule(CONFIG_SCHEMA_VERSION, CONFIG_SCHEMA_VERSION)],
  ["command_execution", enumRule(["ask", "never"])],
  ["scan.max_files", integerRule(1, 25_000)],
  ["scan.max_entries", integerRule(1, 100_000)],
  ["scan.max_file_bytes", integerRule(1_024, 2 * 1024 * 1024)],
  [
    "scan.max_total_hash_bytes",
    integerRule(1_024, 128 * 1024 * 1024)
  ],
  [
    "scan.max_total_text_bytes",
    integerRule(1_024, 32 * 1024 * 1024)
  ],
  ["scan.max_elapsed_ms", integerRule(100, 30_000)],
  ["scan.respect_git_ignore", booleanRule()],
  ["git.timeout_ms", integerRule(100, 60_000)],
  ["git.max_output_bytes", integerRule(1_024, 32 * 1024 * 1024)],
  ["inputs.max_state_bytes", integerRule(1_024, 8 * 1024 * 1024)],
  ["inputs.max_todo_bytes", integerRule(1_024, 1024 * 1024)],
  ["inputs.max_ignore_bytes", integerRule(1_024, 512 * 1024)],
  [
    "persistence.max_evidence_bytes",
    integerRule(1_024, 64 * 1024 * 1024)
  ],
  ["persistence.max_evidence_records", integerRule(1, 100_000)],
  ["persistence.max_snapshots", integerRule(1, 1_000)]
]);

/** @type {("scan" | "git" | "inputs" | "persistence")[]} */
const OBJECT_FIELDS = [
  "scan",
  "git",
  "inputs",
  "persistence"
];

/**
 * @param {string} root
 * @returns {KanonConfig}
 */
export function readKanonConfig(root) {
  return inspectKanonConfig(root).config;
}

/**
 * @param {string} root
 */
export function inspectKanonConfig(root) {
  const read = readTextResult(root, ".kanon/config.json", {
    limit: MAX_CONFIG_BYTES + 1,
    optional: true
  });
  if (!read.ok && read.status === "missing") {
    return {
      config: cloneDefaults(),
      found: false,
      valid: true,
      warning: null,
      invalid_field: null,
      source_status: "missing"
    };
  }
  if (!read.ok) {
    return invalidConfig(
      ".kanon/config.json",
      `It was ${read.status}: ${read.reason}`,
      read.status
    );
  }
  if (read.truncated || read.size > MAX_CONFIG_BYTES) {
    return invalidConfig(
      ".kanon/config.json",
      `It exceeds the ${MAX_CONFIG_BYTES}-byte configuration input limit.`,
      "size-limit"
    );
  }

  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(read.text);
  } catch {
    return invalidConfig(
      ".kanon/config.json",
      "It is not valid JSON.",
      "invalid-json"
    );
  }
  const validation = validateConfig(parsed);
  if (!validation.valid) {
    return invalidConfig(
      validation.field,
      validation.reason,
      "schema-invalid"
    );
  }

  return {
    config: mergeConfig(parsed),
    found: true,
    valid: true,
    warning: null,
    invalid_field: null,
    source_status: "ok"
  };
}

/**
 * @param {unknown} value
 * @returns {ConfigValidation}
 */
export function validateConfig(value) {
  if (!isPlainObject(value)) {
    return invalid(".kanon/config.json", "Its root value must be an object.");
  }
  if (!Object.hasOwn(value, "version")) {
    return invalid("version", "The current schema requires version.");
  }

  for (const [key, fieldValue] of Object.entries(value)) {
    if (isObjectField(key)) {
      if (!isPlainObject(fieldValue)) {
        return invalid(key, `${key} must be an object.`);
      }
      for (const [nestedKey, nestedValue] of Object.entries(fieldValue)) {
        const field = `${key}.${nestedKey}`;
        const rule = FIELD_RULES.get(field);
        if (!rule) {
          return invalid(field, `Unknown configuration field: ${field}.`);
        }
        const reason = rule(nestedValue);
        if (reason) {
          return invalid(field, reason);
        }
      }
      continue;
    }
    const rule = FIELD_RULES.get(key);
    if (!rule) {
      return invalid(key, `Unknown configuration field: ${key}.`);
    }
    const reason = rule(fieldValue);
    if (reason) {
      return invalid(key, reason);
    }
  }
  for (const field of FIELD_RULES.keys()) {
    if (!hasField(value, field)) {
      return invalid(field, `Missing required configuration field: ${field}.`);
    }
  }
  return { valid: true, field: null, reason: null };
}

/**
 * @param {KanonConfig | null | undefined} config
 * @param {import("./scanner/scan.js").ScanOptions} [overrides]
 * @returns {EffectiveScanOptions}
 */
export function scanOptionsFromConfig(config, overrides = {}) {
  const effective = config || DEFAULT_CONFIG;
  return {
    maxFiles: overrides.maxFiles ?? effective.scan.max_files,
    maxEntries: overrides.maxEntries ?? effective.scan.max_entries,
    maxFileBytes:
      overrides.maxFileBytes ?? effective.scan.max_file_bytes,
    maxTotalHashBytes:
      overrides.maxTotalHashBytes ?? effective.scan.max_total_hash_bytes,
    maxTotalTextBytes:
      overrides.maxTotalTextBytes ?? effective.scan.max_total_text_bytes,
    maxElapsedMs:
      overrides.maxElapsedMs ?? effective.scan.max_elapsed_ms,
    maxIgnoreBytes:
      overrides.maxIgnoreBytes ?? effective.inputs.max_ignore_bytes,
    gitTimeoutMs:
      overrides.gitTimeoutMs ?? effective.git.timeout_ms,
    gitMaxOutputBytes:
      overrides.gitMaxOutputBytes ?? effective.git.max_output_bytes,
    useGitIgnore:
      overrides.useGitIgnore ?? effective.scan.respect_git_ignore
  };
}

/**
 * @param {unknown} parsed
 * @returns {KanonConfig}
 */
function mergeConfig(parsed) {
  const output = cloneDefaults();
  if (!isPlainObject(parsed)) {
    return output;
  }
  if (typeof parsed.version === "number") {
    output.version = parsed.version;
  }
  if (
    parsed.command_execution === "ask" ||
    parsed.command_execution === "never"
  ) {
    output.command_execution = parsed.command_execution;
  }
  for (const key of OBJECT_FIELDS) {
    const section = parsed[key];
    if (isPlainObject(section)) {
      Object.assign(output[key], section);
    }
  }
  return output;
}

/**
 * @param {string} field
 * @param {string} reason
 * @param {string} sourceStatus
 */
function invalidConfig(field, reason, sourceStatus) {
  return {
    config: cloneDefaults(),
    found: true,
    valid: false,
    warning:
      `.kanon/config.json was ignored at ${field}. ${reason} ` +
      "The complete safe default configuration was used.",
    invalid_field: field,
    source_status: sourceStatus
  };
}

/**
 * @param {number} minimum
 * @param {number} maximum
 * @returns {FieldRule}
 */
function integerRule(minimum, maximum) {
  return (value) => (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
      ? null
      : `Expected an integer between ${minimum} and ${maximum}.`
  );
}

/**
 * @param {readonly unknown[]} values
 * @returns {FieldRule}
 */
function enumRule(values) {
  return (value) => (
    values.includes(value)
      ? null
      : `Expected one of: ${values.join(", ")}.`
  );
}

/**
 * @returns {FieldRule}
 */
function booleanRule() {
  return (value) => (
    typeof value === "boolean" ? null : "Expected a boolean."
  );
}

/**
 * @param {string} field
 * @param {string} reason
 * @returns {ConfigValidation}
 */
function invalid(field, reason) {
  return { valid: false, field, reason };
}

/**
 * @returns {KanonConfig}
 */
function cloneDefaults() {
  return structuredClone(DEFAULT_CONFIG);
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * @param {Record<string, unknown>} value
 * @param {string} field
 * @returns {boolean}
 */
function hasField(value, field) {
  const [parent, child] = field.split(".");
  if (parent === undefined) {
    return false;
  }
  if (child === undefined) {
    return Object.hasOwn(value, parent);
  }
  const section = value[parent];
  return isPlainObject(section) && Object.hasOwn(section, child);
}

/**
 * @param {string} value
 * @returns {value is "scan" | "git" | "inputs" | "persistence"}
 */
function isObjectField(value) {
  return (
    value === "scan" ||
    value === "git" ||
    value === "inputs" ||
    value === "persistence"
  );
}

/**
 * @template {object} T
 * @param {T} value
 * @returns {T}
 */
function deepFreeze(value) {
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === "object") {
      deepFreeze(nested);
    }
  }
  Object.freeze(value);
  return value;
}
