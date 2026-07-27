import { readTextResult } from "./scanner.js";
import { CONFIG_SCHEMA_VERSION } from "./version.js";

const MAX_CONFIG_BYTES = 64 * 1024;

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

const OBJECT_FIELDS = new Set([
  "scan",
  "git",
  "inputs",
  "persistence"
]);

export function readKanonConfig(root) {
  return inspectKanonConfig(root).config;
}

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

export function validateConfig(value) {
  if (!isPlainObject(value)) {
    return invalid(".kanon/config.json", "Its root value must be an object.");
  }
  if (!Object.hasOwn(value, "version")) {
    return invalid("version", "The current schema requires version.");
  }

  for (const [key, fieldValue] of Object.entries(value)) {
    if (OBJECT_FIELDS.has(key)) {
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

export function scanOptionsFromConfig(config, overrides = {}) {
  const effective = config || DEFAULT_CONFIG;
  return {
    maxFiles: effective.scan.max_files,
    maxEntries: effective.scan.max_entries,
    maxFileBytes: effective.scan.max_file_bytes,
    maxTotalHashBytes: effective.scan.max_total_hash_bytes,
    maxTotalTextBytes: effective.scan.max_total_text_bytes,
    maxElapsedMs: effective.scan.max_elapsed_ms,
    maxIgnoreBytes: effective.inputs.max_ignore_bytes,
    gitTimeoutMs: effective.git.timeout_ms,
    gitMaxOutputBytes: effective.git.max_output_bytes,
    useGitIgnore: effective.scan.respect_git_ignore,
    ...overrides
  };
}

function mergeConfig(parsed) {
  const output = cloneDefaults();
  output.version = parsed.version;
  if (parsed.command_execution !== undefined) {
    output.command_execution = parsed.command_execution;
  }
  for (const key of OBJECT_FIELDS) {
    if (parsed[key]) {
      Object.assign(output[key], parsed[key]);
    }
  }
  return output;
}

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

function integerRule(minimum, maximum) {
  return (value) => (
    Number.isInteger(value) && value >= minimum && value <= maximum
      ? null
      : `Expected an integer between ${minimum} and ${maximum}.`
  );
}

function enumRule(values) {
  return (value) => (
    values.includes(value)
      ? null
      : `Expected one of: ${values.join(", ")}.`
  );
}

function booleanRule() {
  return (value) => (
    typeof value === "boolean" ? null : "Expected a boolean."
  );
}

function invalid(field, reason) {
  return { valid: false, field, reason };
}

function cloneDefaults() {
  return structuredClone(DEFAULT_CONFIG);
}

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasField(value, field) {
  const [parent, child] = field.split(".");
  return child
    ? Object.hasOwn(value[parent] || {}, child)
    : Object.hasOwn(value, parent);
}

function deepFreeze(value) {
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === "object") {
      deepFreeze(nested);
    }
  }
  return Object.freeze(value);
}
